import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { createDatabase, migrate, type Database } from "@zhuguang/database";
import {
  calculateMastery,
  scheduleReview,
  scoreAssessment,
  scoreDimensions,
  type ReviewDecision,
} from "@zhuguang/domain";
import { z } from "zod";
import { loadConfig, type AppConfig } from "./config.js";
import { ContentModule } from "./content.js";
import { LearningRepository } from "./repository.js";
import { hashPassword, hashToken, newOpaqueToken, normalizeUsername, verifyPassword } from "./security.js";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(12).max(128),
});

const registrationSchema = credentialsSchema.extend({
  nickname: z.string().trim().min(1).max(24),
  invitationCode: z.string().trim().min(8).max(128),
});

const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(24).optional(),
  dailyMinutes: z.number().int().min(10).max(120).optional(),
  preferredAccent: z.enum(["us", "uk"]).optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: "新密码不能与当前密码相同",
  path: ["newPassword"],
});

const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

const submissionSchema = z.object({
  kind: z.enum(["formal", "practice", "review"]),
  answers: z.record(z.string(), z.string()),
  recordings: z.record(z.string(), z.string().uuid()).default({}),
});

const vocabularySchema = z.object({
  term: z.string().trim().min(1).max(80),
  meaning: z.string().trim().min(1).max(160),
  example: z.string().trim().max(500).nullable().optional(),
  lessonId: z.number().int().min(1).max(40).nullable().optional(),
});

const vocabularyStatusSchema = z.object({
  status: z.enum(["learning", "mastered"]),
});

const vocabularyParamsSchema = z.object({
  entryId: z.string().uuid(),
});

const vocabularyTrainingSchema = z.object({
  entryId: z.string().uuid(),
  mode: z.enum(["guided", "dictation"]),
  firstTryCorrect: z.boolean(),
  correctionCount: z.number().int().min(0).max(1_000),
  durationMs: z.number().int().min(100).max(3_600_000),
  device: z.enum(["desktop", "mobile"]),
});

const wordMemoryTrainingSchema = vocabularyTrainingSchema.omit({ entryId: true }).extend({
  lessonId: z.number().int().min(1).max(40),
  itemType: z.enum(["word", "sentence"]),
  itemKey: z.string().trim().min(1).max(500),
});

const wordAssessmentSubmissionSchema = z.object({
  answers: z.array(z.object({
    term: z.string().trim().min(1).max(80),
    meaning: z.string().max(200),
    listening: z.string().max(80),
    spelling: z.string().max(80),
    context: z.string().max(80),
  })).min(1).max(5),
});

const COURSE_MAP_LESSON_COUNT = 3;

export async function createApp(
  config: AppConfig = loadConfig(),
  database: Database = createDatabase(config.DATABASE_URL),
) {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
  const authAttempts = new Map<string, { count: number; resetAt: number }>();
  await migrate(database);
  const repository = new LearningRepository(database);
  const content = new ContentModule(config.CONTENT_DIR);
  app.addContentTypeParser(
    ["audio/webm", "audio/mp4", "audio/ogg", "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: 10_000_000 },
    (_request, body, done) => done(null, body),
  );
  app.addHook("onClose", async () => {
    database.$client.close();
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: config.NODE_ENV === "development" ? ["http://localhost:5173"] : false,
    credentials: true,
  });
  if (config.NODE_ENV === "production") {
    await app.register(staticFiles, {
      root: path.resolve(import.meta.dirname, "../../web/dist"),
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "接口不存在" });
      return reply.sendFile("index.html");
    });
  }

  app.addHook("onSend", async (_request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .header("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
      );
  });

  async function currentUser(request: FastifyRequest) {
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    return token
      ? repository.findSession(hashToken(token, config.SESSION_SECRET), new Date().toISOString())
      : undefined;
  }

  async function requireUser(request: FastifyRequest, reply: FastifyReply) {
    const user = await currentUser(request);
    if (!user) {
      await reply.code(401).send({ error: "请先登录" });
      return null;
    }
    return user;
  }

  async function issueSession(userId: string, request: FastifyRequest, reply: FastifyReply) {
    const token = newOpaqueToken();
    const expires = new Date();
    expires.setDate(expires.getDate() + config.SESSION_TTL_DAYS);
    await repository.createSession({
      userId,
      tokenHash: hashToken(token, config.SESSION_SECRET),
      expiresAt: expires.toISOString(),
      userAgent: request.headers["user-agent"],
    });
    reply.setCookie(config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: config.SESSION_COOKIE_SECURE,
      sameSite: "strict",
      path: "/",
      expires,
    });
  }

  async function limitAuthentication(request: FastifyRequest, reply: FastifyReply) {
    const now = Date.now();
    const key = request.ip;
    const current = authAttempts.get(key);
    if (!current || current.resetAt <= now) {
      authAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
      return;
    }
    if (current.count >= 10) {
      reply.header("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      return reply.code(429).send({ error: "尝试次数过多，请稍后再试" });
    }
    current.count += 1;
  }

  app.get("/api/health", async () => {
    let contentReady = true;
    try {
      await content.loadAssessment(1);
    } catch {
      contentReady = false;
    }
    return { ok: true, service: "zhuguang-english-v2", database: true, content: contentReady };
  });

  app.post("/api/auth/register", { preHandler: limitAuthentication }, async (request, reply) => {
    const body = registrationSchema.parse(request.body);
    const username = normalizeUsername(body.username);
    if (await repository.findUserByUsername(username)) {
      return reply.code(409).send({ error: "账号已存在" });
    }
    const codeHash = hashToken(body.invitationCode.toUpperCase(), config.SESSION_SECRET);
    const invitation = await repository.findValidInvitation(codeHash, new Date().toISOString());
    if (!invitation) return reply.code(400).send({ error: "邀请码无效或已过期" });
    const user = await repository.createUser({
      username,
      passwordHash: await hashPassword(body.password),
      nickname: body.nickname,
    });
    await repository.useInvitation(invitation.id, user.id);
    await issueSession(user.id, request, reply);
    return reply.code(201).send(publicUser(user));
  });

  app.post("/api/auth/login", { preHandler: limitAuthentication }, async (request, reply) => {
    const body = credentialsSchema.parse(request.body);
    const user = await repository.findUserByUsername(normalizeUsername(body.username));
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "账号或密码错误" });
    }
    await issueSession(user.id, request, reply);
    return publicUser(user);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    if (token) await repository.deleteSession(hashToken(token, config.SESSION_SECRET));
    reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (request, reply) => {
    const user = await requireUser(request, reply);
    return user ? publicUser(user) : undefined;
  });

  app.patch("/api/me", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const updated = await repository.updateProfile(user.id, profileSchema.parse(request.body));
    return updated ? publicUser(updated) : reply.code(404).send({ error: "账号不存在" });
  });

  app.post("/api/me/password", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = passwordChangeSchema.parse(request.body);
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: "当前密码不正确" });
    }
    await repository.updatePassword(user.id, await hashPassword(body.newPassword));
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    if (token) await repository.deleteOtherSessions(user.id, hashToken(token, config.SESSION_SECRET));
    return { ok: true, otherSessionsRevoked: true };
  });

  app.get("/api/me/sessions", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    const currentTokenHash = token ? hashToken(token, config.SESSION_SECRET) : null;
    const sessionRows = await repository.listSessions(user.id);
    return {
      sessions: sessionRows.map((session) => ({
        id: session.id,
        current: session.tokenHash === currentTokenHash,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
      })),
    };
  });

  app.delete("/api/me/sessions/:sessionId", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const rows = await repository.listSessions(user.id);
    const target = rows.find((session) => session.id === sessionId);
    if (!target) return reply.code(404).send({ error: "登录设备不存在" });
    await repository.deleteSessionForUser(user.id, sessionId);
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    const removedCurrent = Boolean(token && target.tokenHash === hashToken(token, config.SESSION_SECRET));
    if (removedCurrent) reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true, removedCurrent };
  });

  app.get("/api/dashboard", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const data = await repository.dashboard(user.id, new Date().toISOString());
    const mastered = data.mastery.filter((item) => ["mastered", "proficient", "long-term"].includes(item.band));
    const average = data.mastery.length
      ? Math.round(data.mastery.reduce((total, item) => total + item.score, 0) / data.mastery.length)
      : 0;
    const attemptedLessons = new Set(
      data.progressAttempts
        .filter((attempt) => attempt.kind !== "practice")
        .map((attempt) => attempt.lessonId),
    );
    const currentLesson = Array.from(
      { length: COURSE_MAP_LESSON_COUNT },
      (_item, index) => index + 1,
    ).find((lessonId) => !attemptedLessons.has(lessonId)) ?? COURSE_MAP_LESSON_COUNT;
    const currentAssessment = await content.loadAssessment(currentLesson);
    const history = await Promise.all(
      data.recentAttempts.map(async (attempt) => {
        const assessment = await content.loadAssessment(attempt.lessonId);
        return {
          id: attempt.id,
          lessonId: attempt.lessonId,
          title: assessment.title,
          kind: attempt.kind,
          score: attempt.total,
          occurredAt: attempt.occurredAt,
        };
      }),
    );
    const nextReviewAssessment = data.nextReview
      ? await content.loadAssessment(data.nextReview.lessonId)
      : null;
    return {
      learner: publicUser(user),
      longTermMastery: average,
      dueReviews: data.reviews.length,
      weakItems: data.wrong.length,
      currentLesson,
      currentLessonTitle: currentAssessment.title,
      dimensions: aggregateDimensions(data.mastery),
      history,
      studyStreak: calculateStudyStreak(data.progressAttempts.map((attempt) => attempt.occurredAt)),
      nextReview: data.nextReview && nextReviewAssessment
        ? {
            lessonId: data.nextReview.lessonId,
            title: nextReviewAssessment.title,
            dueAt: data.nextReview.dueAt,
          }
        : null,
      plan: {
        reviewMinutes: Math.min(20, data.reviews.length * 5),
        weakMinutes: Math.min(15, data.wrong.length * 2),
        newLessonMinutes: Math.max(10, user.dailyMinutes - Math.min(20, data.reviews.length * 5) - Math.min(15, data.wrong.length * 2)),
      },
    };
  });

  app.get("/api/learning-report", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const data = await repository.learningReport(user.id);
    const lessonIds = Array.from(new Set([
      ...data.attempts.map((attempt) => attempt.lessonId),
      ...data.mastery.map((item) => item.lessonId),
    ]));
    const assessmentEntries = await Promise.all(
      lessonIds.map(async (lessonId) => [lessonId, await content.loadAssessment(lessonId)] as const),
    );
    const titles = new Map(assessmentEntries.map(([lessonId, assessment]) => [lessonId, assessment.title]));
    const studyDates = new Set(data.attempts.map((attempt) => dateKey(attempt.occurredAt)));
    const daily = new Map<string, { total: number; attempts: number }>();
    for (const attempt of data.attempts) {
      const key = dateKey(attempt.occurredAt);
      const current = daily.get(key) ?? { total: 0, attempts: 0 };
      current.total += attempt.total;
      current.attempts += 1;
      daily.set(key, current);
    }
    const averageScore = data.attempts.length
      ? Math.round(data.attempts.reduce((total, attempt) => total + attempt.total, 0) / data.attempts.length)
      : 0;
    return {
      summary: {
        totalAttempts: data.attempts.length,
        studiedDays: studyDates.size,
        studyStreak: calculateStudyStreak(data.attempts.map((attempt) => attempt.occurredAt)),
        averageScore,
      },
      dimensions: data.attempts.length
        ? {
            listening: average(data.attempts.map((item) => item.listening)),
            reading: average(data.attempts.map((item) => item.reading)),
            speaking: average(data.attempts.map((item) => item.speaking)),
            writing: average(data.attempts.map((item) => item.writing)),
          }
        : { listening: 0, reading: 0, speaking: 0, writing: 0 },
      daily: Array.from(daily, ([date, value]) => ({
        date,
        attempts: value.attempts,
        averageScore: Math.round(value.total / value.attempts),
      })).sort((left, right) => left.date.localeCompare(right.date)).slice(-14),
      lessons: data.mastery.map((item) => ({
        lessonId: item.lessonId,
        title: titles.get(item.lessonId) ?? `第 ${item.lessonId} 课`,
        score: Math.round(item.score),
        band: item.band,
        dimensions: {
          listening: Math.round(item.listening),
          reading: Math.round(item.reading),
          speaking: Math.round(item.speaking),
          writing: Math.round(item.writing),
        },
        updatedAt: item.updatedAt,
      })),
    };
  });

  app.get("/api/review-center", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const now = new Date().toISOString();
    const data = await repository.reviewCenter(user.id);

    const lessonIds = new Set([
      ...data.reviews.map((item) => item.lessonId),
      ...data.wrong.map((item) => item.lessonId),
    ]);
    const assessmentEntries = await Promise.all(
      Array.from(lessonIds, async (lessonId) => [lessonId, await content.loadAssessment(lessonId)] as const),
    );
    const assessments = new Map(assessmentEntries);

    const reviews = data.reviews.map((item) => ({
      lessonId: item.lessonId,
      title: assessments.get(item.lessonId)?.title ?? `第 ${item.lessonId} 课`,
      dueAt: item.dueAt,
      step: item.step,
      weakDimensions: item.weakDimensions,
    }));
    const wrongAnswers = data.wrong.flatMap((item) => {
      const assessment = assessments.get(item.lessonId);
      const question = assessment?.questions.find((candidate) => candidate.id === item.questionId);
      if (!assessment || !question) return [];
      return [{
        lessonId: item.lessonId,
        lessonTitle: assessment.title,
        questionId: item.questionId,
        dimension: item.dimension,
        prompt: question.prompt,
        sourceSentence: question.sourceSentence,
        lastAnswer: item.lastAnswer,
        errorCount: item.errorCount,
        updatedAt: item.updatedAt,
      }];
    });

    return {
      due: reviews.filter((item) => item.dueAt <= now),
      upcoming: reviews.filter((item) => item.dueAt > now),
      wrongAnswers,
    };
  });

  app.get("/api/course-map", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const now = new Date().toISOString();
    const lessonIds = Array.from({ length: COURSE_MAP_LESSON_COUNT }, (_item, index) => index + 1);
    const [data, assessments] = await Promise.all([
      repository.courseMap(user.id),
      Promise.all(lessonIds.map((lessonId) => content.loadAssessment(lessonId))),
    ]);
    const masteryByLesson = new Map(data.mastery.map((item) => [item.lessonId, item]));
    const reviewByLesson = new Map(data.reviews.map((item) => [item.lessonId, item]));
    const formalLessonIds = new Set(
      data.attempts.filter((item) => item.kind !== "practice").map((item) => item.lessonId),
    );

    const lessons = assessments.map((assessment) => {
      const mastery = masteryByLesson.get(assessment.lessonId);
      const review = reviewByLesson.get(assessment.lessonId);
      const unlocked = assessment.lessonId === 1 || formalLessonIds.has(assessment.lessonId - 1);
      const state = !unlocked
        ? "locked"
        : !mastery
          ? "ready"
          : review && review.dueAt <= now
            ? "review-due"
            : mastery.band === "long-term"
              ? "long-term"
              : ["mastered", "proficient"].includes(mastery.band)
                ? "mastered"
                : "strengthening";
      return {
        lessonId: assessment.lessonId,
        title: assessment.title,
        unlocked,
        state,
        score: mastery?.score ?? null,
        band: mastery?.band ?? null,
        review: review
          ? {
              dueAt: review.dueAt,
              step: review.step,
              weakDimensions: review.weakDimensions,
            }
          : null,
      };
    });
    const visibleMastery = data.mastery.filter((item) => lessonIds.includes(item.lessonId));

    return {
      summary: {
        totalLessons: COURSE_MAP_LESSON_COUNT,
        studiedLessons: lessonIds.filter((lessonId) => formalLessonIds.has(lessonId)).length,
        masteredLessons: visibleMastery.filter((item) =>
          ["mastered", "proficient", "long-term"].includes(item.band),
        ).length,
        averageScore: visibleMastery.length
          ? Math.round(visibleMastery.reduce((total, item) => total + item.score, 0) / visibleMastery.length)
          : 0,
      },
      lessons,
    };
  });

  app.get("/api/vocabulary", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const entries = await repository.listVocabulary(user.id);
    return vocabularyResponse(entries.map(publicVocabularyEntry));
  });

  app.post("/api/vocabulary", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = vocabularySchema.parse(request.body);
    const entry = await repository.saveVocabularyEntry({
      userId: user.id,
      term: body.term,
      normalizedTerm: normalizeVocabularyTerm(body.term),
      meaning: body.meaning,
      example: body.example || null,
      lessonId: body.lessonId ?? null,
    });
    return entry ? reply.code(201).send(publicVocabularyEntry(entry)) : reply.code(500).send({ error: "生词保存失败" });
  });

  app.patch("/api/vocabulary/:entryId", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { entryId } = vocabularyParamsSchema.parse(request.params);
    const { status } = vocabularyStatusSchema.parse(request.body);
    if (status === "mastered") {
      return reply.code(409).send({ error: "单词必须通过正式考核才能标记为已掌握" });
    }
    const entry = await repository.updateVocabularyStatus(user.id, entryId, status);
    return entry ? publicVocabularyEntry(entry) : reply.code(404).send({ error: "生词不存在" });
  });

  app.post("/api/vocabulary/training-attempts", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = vocabularyTrainingSchema.parse(request.body);
    const attempt = await repository.saveVocabularyTrainingAttempt({ userId: user.id, ...body });
    return attempt
      ? reply.code(201).send({ attemptId: attempt.id, occurredAt: attempt.occurredAt })
      : reply.code(404).send({ error: "训练词条不存在" });
  });

  app.get("/api/word-memory/chapters", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { chapters: await content.wordMemoryChapters() };
  });

  app.get("/api/word-memory/stats", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return repository.wordMemoryStats(user.id);
  });

  app.get("/api/word-memory/chapters/:lessonId/assessment", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40)
      .parse((request.params as { lessonId: string }).lessonId);
    const items = await content.wordAssessment(lessonId);
    return {
      lessonId,
      passingScore: 80,
      items: items.map(({ meaning, sentence, ...item }) => ({
        ...item,
        spellingPrompt: meaning,
      })),
    };
  });

  app.post("/api/word-memory/chapters/:lessonId/assessment", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40)
      .parse((request.params as { lessonId: string }).lessonId);
    const body = wordAssessmentSubmissionSchema.parse(request.body);
    const items = await content.wordAssessment(lessonId);
    const byTerm = new Map(items.map((item) => [normalizeVocabularyTerm(item.term), item]));
    const submittedTerms = body.answers.map((answer) => normalizeVocabularyTerm(answer.term));
    const seen = new Set(submittedTerms);
    if (
      body.answers.length !== items.length
      || seen.size !== items.length
      || submittedTerms.some((term) => !byTerm.has(term))
    ) {
      return reply.code(400).send({ error: "必须完成本组全部正式考核题目" });
    }
    const results = body.answers.map((answer) => {
      const normalizedTerm = normalizeVocabularyTerm(answer.term);
      const item = byTerm.get(normalizedTerm)!;
      const meaning = answer.meaning === item.meaning ? 100 : 0;
      const listening = normalizeVocabularyTerm(answer.listening) === normalizedTerm ? 100 : 0;
      const spelling = normalizeVocabularyTerm(answer.spelling) === normalizedTerm ? 100 : 0;
      const context = normalizeVocabularyTerm(answer.context) === normalizedTerm ? 100 : 0;
      const total = meaning * 0.25 + listening * 0.25 + spelling * 0.3 + context * 0.2;
      return { term: item.term, normalizedTerm, meaning, listening, spelling, context, total, passed: total >= 80 };
    });
    const saved = await repository.saveWordAssessmentResults({ userId: user.id, lessonId, results });
    return reply.code(201).send({
      attemptAt: saved.occurredAt,
      passingScore: 80,
      masteredCount: results.filter((item) => item.passed).length,
      results: results.map(({ normalizedTerm: _normalizedTerm, ...result }) => result),
    });
  });

  app.post("/api/word-memory/training-attempts", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const body = wordMemoryTrainingSchema.parse(request.body);
    const lesson = await content.loadLesson(body.lessonId);
    const validItem = body.itemType === "word"
      ? lesson.vocabulary.some((item) => normalizeVocabularyTerm(item.term) === normalizeVocabularyTerm(body.itemKey))
      : lesson.sentences.some((item) => item.id === body.itemKey);
    if (!validItem) return reply.code(404).send({ error: "本章训练内容不存在" });
    const attempt = await repository.saveWordMemoryTrainingAttempt({ userId: user.id, ...body });
    return reply.code(201).send({ attemptId: attempt.id, occurredAt: attempt.occurredAt });
  });

  app.get("/api/lessons/:lessonId/assessment", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40).parse((request.params as { lessonId: string }).lessonId);
    return content.publicAssessment(lessonId);
  });

  app.get("/api/lessons/:lessonId", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40)
      .parse((request.params as { lessonId: string }).lessonId);
    return content.publicLesson(lessonId);
  });

  app.get("/api/lessons/:lessonId/audio/:accent", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const params = z.object({
      lessonId: z.coerce.number().int().min(1).max(COURSE_MAP_LESSON_COUNT),
      accent: z.enum(["us", "uk"]),
    }).parse(request.params);
    const audio = await content.lessonAudio(params.lessonId, params.accent);
    if (!audio) return reply.code(404).send({ error: "本课音频资源尚未部署" });
    return reply.type("audio/mpeg").header("Cache-Control", "private, max-age=86400").send(audio);
  });

  app.get("/api/lessons/:lessonId/assessment-audio/:questionId/:accent", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const params = z.object({
      lessonId: z.coerce.number().int().min(1).max(COURSE_MAP_LESSON_COUNT),
      questionId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
      accent: z.enum(["us", "uk"]),
    }).parse(request.params);
    const audio = await content.assessmentWordAudio(params.lessonId, params.questionId, params.accent);
    if (!audio) return reply.code(404).send({ error: "本题单词音频尚未部署" });
    return reply.type(audio.mimeType).header("Cache-Control", "private, max-age=86400").send(audio.data);
  });

  app.post("/api/lessons/:lessonId/recordings/:questionId", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const params = z.object({
      lessonId: z.coerce.number().int().min(1).max(COURSE_MAP_LESSON_COUNT),
      questionId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
    }).parse(request.params);
    const assessment = await content.loadAssessment(params.lessonId);
    const question = assessment.questions.find((item) => item.id === params.questionId);
    if (!question || question.type !== "speech") {
      return reply.code(400).send({ error: "该题不接受跟读录音" });
    }
    const audio = request.body;
    if (!Buffer.isBuffer(audio) || audio.byteLength < 1_000) {
      return reply.code(400).send({ error: "录音内容过短，请重新录制" });
    }
    const mimeType = request.headers["content-type"]?.split(";")[0] ?? "application/octet-stream";
    const extension = mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/ogg" ? "ogg" : "webm";
    const recordingId = crypto.randomUUID();
    const relativePath = path.join(user.id, String(params.lessonId).padStart(2, "0"), `${recordingId}.${extension}`);
    const filename = path.join(config.RECORDINGS_DIR, relativePath);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, audio, { flag: "wx" });
    await repository.createRecording({
      id: recordingId,
      userId: user.id,
      lessonId: params.lessonId,
      questionId: params.questionId,
      storagePath: relativePath,
      mimeType,
      byteSize: audio.byteLength,
    });
    return reply.code(201).send({ recordingId, mimeType, byteSize: audio.byteLength });
  });

  app.post("/api/lessons/:lessonId/attempts", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40).parse((request.params as { lessonId: string }).lessonId);
    const body = submissionSchema.parse(request.body);
    const assessment = await content.loadAssessment(lessonId);
    const speechQuestions = assessment.questions.filter((question) => question.type === "speech");
    if (body.kind !== "practice") {
      for (const question of speechQuestions) {
        const recordingId = body.recordings[question.id];
        const recording = recordingId ? await repository.findRecording(user.id, recordingId) : null;
        if (!recording || recording.lessonId !== lessonId || recording.questionId !== question.id) {
          return reply.code(400).send({ error: "正式考核的跟读题必须完成录音" });
        }
      }
    }
    const graded = content.grade(assessment, body.answers);
    const scores = scoreAssessment(graded.scored);
    const now = new Date();
    const attemptId = crypto.randomUUID();
    await repository.saveAttempt({
      id: attemptId,
      userId: user.id,
      lessonId,
      kind: body.kind,
      ...scores,
      total: scoreDimensions(scores),
      answerDetail: { answers: graded.details, recordings: body.recordings },
      occurredAt: now.toISOString(),
    });
    const history = await repository.attemptsFor(user.id, lessonId);
    const mastery = calculateMastery(history, now);
    const previousReview = await repository.getReviewState(user.id, lessonId);
    let review: ReviewDecision | null = null;
    const countsTowardMastery = mastery.formalAttemptIds.includes(attemptId);
    if (body.kind !== "practice") {
      await repository.saveMastery(user.id, lessonId, mastery);
      if (countsTowardMastery) {
        review = scheduleReview(previousReview ?? null, scores, now);
        await repository.saveReview(user.id, lessonId, review);
      }
    }
    await repository.saveWrongAnswers(user.id, lessonId, graded.details);
    return reply.code(201).send({
      attemptId,
      scores,
      mastery,
      review,
      countsTowardMastery,
      answers: graded.details,
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: "输入内容无效", details: error.flatten() });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "服务器暂时无法处理请求" });
  });

  return app;
}

function publicUser(user: {
  id: string;
  username: string;
  nickname: string;
  role: string;
  dailyMinutes: number;
  preferredAccent: string;
  reminderTime: string | null;
}) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    dailyMinutes: user.dailyMinutes,
    preferredAccent: user.preferredAccent,
    reminderTime: user.reminderTime,
  };
}

function aggregateDimensions(
  mastery: Array<{ listening: number; reading: number; speaking: number; writing: number }>,
) {
  const fallback = { listening: 0, reading: 0, speaking: 0, writing: 0 };
  if (!mastery.length) return fallback;
  return Object.fromEntries(
    Object.keys(fallback).map((dimension) => [
      dimension,
      Math.round(
        mastery.reduce(
          (total, item) => total + item[dimension as keyof typeof fallback],
          0,
        ) / mastery.length,
      ),
    ]),
  );
}

function publicVocabularyEntry(entry: {
  id: string;
  term: string;
  meaning: string;
  example: string | null;
  lessonId: number | null;
  status: "learning" | "mastered";
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: entry.id,
    term: entry.term,
    meaning: entry.meaning,
    example: entry.example,
    lessonId: entry.lessonId,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function vocabularyResponse<T extends { status: string }>(entries: T[]) {
  let learning = 0;
  let mastered = 0;
  for (const entry of entries) {
    if (entry.status === "mastered") mastered += 1;
    else learning += 1;
  }
  return {
    summary: {
      total: entries.length,
      learning,
      mastered,
    },
    entries,
  };
}

function normalizeVocabularyTerm(term: string) {
  return term.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function average(values: number[]) {
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function dateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function calculateStudyStreak(values: string[]) {
  const dates = new Set(values.map(dateKey));
  if (!dates.size) return 0;
  const cursor = new Date();
  let streak = 0;
  for (;;) {
    if (!dates.has(dateKey(cursor))) {
      if (streak === 0) {
        cursor.setDate(cursor.getDate() - 1);
        if (dates.has(dateKey(cursor))) {
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
      }
      return streak;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
}
