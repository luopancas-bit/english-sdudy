import crypto from "node:crypto";
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

const submissionSchema = z.object({
  kind: z.enum(["formal", "practice", "review"]),
  answers: z.record(z.string(), z.string()),
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
      secure: config.NODE_ENV === "production",
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

  app.get("/api/dashboard", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const data = await repository.dashboard(user.id, new Date().toISOString());
    const mastered = data.mastery.filter((item) => ["mastered", "proficient", "long-term"].includes(item.band));
    const average = data.mastery.length
      ? Math.round(data.mastery.reduce((total, item) => total + item.score, 0) / data.mastery.length)
      : 0;
    const currentLesson = Math.min(3, Math.max(1, mastered.length + 1));
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
    return {
      learner: publicUser(user),
      longTermMastery: average,
      dueReviews: data.reviews.length,
      weakItems: data.wrong.length,
      currentLesson,
      currentLessonTitle: currentAssessment.title,
      dimensions: aggregateDimensions(data.mastery),
      history,
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
    const entry = await repository.updateVocabularyStatus(user.id, entryId, status);
    return entry ? publicVocabularyEntry(entry) : reply.code(404).send({ error: "生词不存在" });
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
    const lessonId = z.coerce.number().int().min(1).max(COURSE_MAP_LESSON_COUNT)
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

  app.post("/api/lessons/:lessonId/attempts", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40).parse((request.params as { lessonId: string }).lessonId);
    const body = submissionSchema.parse(request.body);
    const assessment = await content.loadAssessment(lessonId);
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
      answerDetail: { answers: graded.details },
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
