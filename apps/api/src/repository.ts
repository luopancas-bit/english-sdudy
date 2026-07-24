import crypto from "node:crypto";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  attempts,
  invitations,
  lessonMastery,
  reviewQueue,
  sessions,
  users,
  wrongAnswers,
  type Database,
} from "@zhuguang/database";
import type { AssessmentAttempt, MasteryResult, ReviewDecision } from "@zhuguang/domain";

export class LearningRepository {
  constructor(private readonly database: Database) {}

  findUserByUsername(username: string) {
    return this.database.query.users.findFirst({ where: eq(users.username, username) });
  }

  findUserById(id: string) {
    return this.database.query.users.findFirst({ where: eq(users.id, id) });
  }

  async createUser(input: {
    username: string;
    passwordHash: string;
    nickname: string;
    role?: "learner" | "admin";
  }) {
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      role: input.role ?? "learner",
      dailyMinutes: 25,
      preferredAccent: "us" as const,
      reminderTime: null,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    await this.database.insert(users).values(user);
    return user;
  }

  async updateProfile(
    userId: string,
    patch: {
      nickname?: string | undefined;
      dailyMinutes?: number | undefined;
      preferredAccent?: "us" | "uk" | undefined;
      reminderTime?: string | null | undefined;
    },
  ) {
    await this.database.update(users).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
    return this.findUserById(userId);
  }

  async createInvitation(input: { codeHash: string; createdBy: string | null; expiresAt: string }) {
    await this.database.insert(invitations).values({
      id: crypto.randomUUID(),
      codeHash: input.codeHash,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    });
  }

  findValidInvitation(codeHash: string, now: string) {
    return this.database.query.invitations.findFirst({
      where: and(eq(invitations.codeHash, codeHash), isNull(invitations.usedAt), gte(invitations.expiresAt, now)),
    });
  }

  async useInvitation(invitationId: string, userId: string) {
    await this.database
      .update(invitations)
      .set({ usedAt: new Date().toISOString(), usedBy: userId })
      .where(eq(invitations.id, invitationId));
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    userAgent?: string | undefined;
  }) {
    const now = new Date().toISOString();
    await this.database.insert(sessions).values({
      id: crypto.randomUUID(),
      lastSeenAt: now,
      createdAt: now,
      userAgent: input.userAgent ?? null,
      ...input,
    });
  }

  async findSession(tokenHash: string, now: string) {
    const session = await this.database.query.sessions.findFirst({
      where: and(eq(sessions.tokenHash, tokenHash), gte(sessions.expiresAt, now)),
    });
    return session ? this.findUserById(session.userId) : undefined;
  }

  async deleteSession(tokenHash: string) {
    await this.database.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }

  async saveAttempt(input: typeof attempts.$inferInsert) {
    await this.database.insert(attempts).values(input);
  }

  async attemptsFor(userId: string, lessonId: number): Promise<AssessmentAttempt[]> {
    const rows = await this.database.query.attempts.findMany({
      where: and(eq(attempts.userId, userId), eq(attempts.lessonId, lessonId)),
    });
    return rows.map((row) => ({
      id: row.id,
      lessonId: row.lessonId,
      kind: row.kind,
      scores: {
        listening: row.listening,
        reading: row.reading,
        speaking: row.speaking,
        writing: row.writing,
      },
      occurredAt: row.occurredAt,
    }));
  }

  async saveMastery(userId: string, lessonId: number, result: MasteryResult) {
    const values = {
      userId,
      lessonId,
      score: result.score,
      band: result.band,
      ...result.dimensions,
      updatedAt: new Date().toISOString(),
    };
    await this.database
      .insert(lessonMastery)
      .values(values)
      .onConflictDoUpdate({ target: [lessonMastery.userId, lessonMastery.lessonId], set: values });
  }

  async getReviewState(userId: string, lessonId: number) {
    return this.database.query.reviewQueue.findFirst({
      where: and(eq(reviewQueue.userId, userId), eq(reviewQueue.lessonId, lessonId)),
    });
  }

  async saveReview(userId: string, lessonId: number, decision: ReviewDecision) {
    const values = {
      userId,
      lessonId,
      step: decision.step,
      dueAt: decision.dueAt,
      consecutiveExcellent: decision.consecutiveExcellent,
      weakDimensions: decision.weakDimensions,
      updatedAt: new Date().toISOString(),
    };
    await this.database
      .insert(reviewQueue)
      .values(values)
      .onConflictDoUpdate({ target: [reviewQueue.userId, reviewQueue.lessonId], set: values });
  }

  async saveWrongAnswers(
    userId: string,
    lessonId: number,
    details: Array<{ questionId: string; dimension: string; correct: boolean; submitted: string }>,
  ) {
    const now = new Date().toISOString();
    for (const detail of details) {
      if (detail.correct) {
        await this.database
          .update(wrongAnswers)
          .set({ resolvedAt: now, updatedAt: now })
          .where(and(eq(wrongAnswers.userId, userId), eq(wrongAnswers.questionId, detail.questionId)));
      } else {
        await this.database
          .insert(wrongAnswers)
          .values({
            id: crypto.randomUUID(),
            userId,
            lessonId,
            questionId: detail.questionId,
            dimension: detail.dimension,
            lastAnswer: detail.submitted,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [wrongAnswers.userId, wrongAnswers.questionId],
            set: {
              lastAnswer: detail.submitted,
              errorCount: sql`${wrongAnswers.errorCount} + 1`,
              resolvedAt: null,
              updatedAt: now,
            },
          });
      }
    }
  }

  async dashboard(userId: string, now: string) {
    const mastery = await this.database.query.lessonMastery.findMany({
      where: eq(lessonMastery.userId, userId),
    });
    const reviews = await this.database.query.reviewQueue.findMany({
      where: and(eq(reviewQueue.userId, userId), lte(reviewQueue.dueAt, now)),
      orderBy: [asc(reviewQueue.dueAt)],
    });
    const wrong = await this.database.query.wrongAnswers.findMany({
      where: and(eq(wrongAnswers.userId, userId), isNull(wrongAnswers.resolvedAt)),
    });
    return { mastery, reviews, wrong };
  }
}
