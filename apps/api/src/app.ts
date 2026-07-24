import crypto from "node:crypto";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { createDatabase, migrate } from "@zhuguang/database";
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

export async function createApp(config: AppConfig = loadConfig()) {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
  const authAttempts = new Map<string, { count: number; resetAt: number }>();
  const database = createDatabase(config.DATABASE_URL);
  await migrate(database);
  const repository = new LearningRepository(database);
  const content = new ContentModule(config.CONTENT_DIR);

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

  app.get("/api/lessons/:lessonId/assessment", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const lessonId = z.coerce.number().int().min(1).max(40).parse((request.params as { lessonId: string }).lessonId);
    return content.publicAssessment(lessonId);
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
    await repository.saveMastery(user.id, lessonId, mastery);
    const countsTowardMastery = mastery.formalAttemptIds.includes(attemptId);
    if (countsTowardMastery) {
      review = scheduleReview(previousReview ?? null, scores, now);
      await repository.saveReview(user.id, lessonId, review);
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
