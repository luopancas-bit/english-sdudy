import crypto from "node:crypto";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  attempts,
  invitations,
  lessonMastery,
  reviewQueue,
  recordings,
  sessions,
  users,
  vocabularyEntries,
  vocabularyTrainingAttempts,
  wordMemoryTrainingAttempts,
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

  async updatePassword(userId: string, passwordHash: string) {
    await this.database
      .update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));
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

  listSessions(userId: string) {
    return this.database.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      orderBy: [desc(sessions.lastSeenAt)],
    });
  }

  async deleteSessionForUser(userId: string, sessionId: string) {
    await this.database.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  }

  async deleteOtherSessions(userId: string, currentTokenHash: string) {
    const rows = await this.listSessions(userId);
    await Promise.all(
      rows
        .filter((session) => session.tokenHash !== currentTokenHash)
        .map((session) => this.deleteSessionForUser(userId, session.id)),
    );
  }

  async saveAttempt(input: typeof attempts.$inferInsert) {
    await this.database.insert(attempts).values(input);
  }

  async createRecording(input: {
    id: string;
    userId: string;
    lessonId: number;
    questionId: string;
    storagePath: string;
    mimeType: string;
    byteSize: number;
  }) {
    await this.database.insert(recordings).values({
      ...input,
      createdAt: new Date().toISOString(),
    });
  }

  findRecording(userId: string, recordingId: string) {
    return this.database.query.recordings.findFirst({
      where: and(eq(recordings.id, recordingId), eq(recordings.userId, userId)),
    });
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

  async reviewCenter(userId: string) {
    const reviews = await this.database.query.reviewQueue.findMany({
      where: eq(reviewQueue.userId, userId),
      orderBy: [asc(reviewQueue.dueAt)],
    });
    const wrong = await this.database.query.wrongAnswers.findMany({
      where: and(eq(wrongAnswers.userId, userId), isNull(wrongAnswers.resolvedAt)),
      orderBy: [desc(wrongAnswers.updatedAt)],
    });
    return { reviews, wrong };
  }

  async courseMap(userId: string) {
    const [mastery, reviews, attemptRows] = await Promise.all([
      this.database.query.lessonMastery.findMany({
        where: eq(lessonMastery.userId, userId),
      }),
      this.database.query.reviewQueue.findMany({
        where: eq(reviewQueue.userId, userId),
      }),
      this.database.query.attempts.findMany({
        where: eq(attempts.userId, userId),
        orderBy: [desc(attempts.occurredAt)],
      }),
    ]);
    return { mastery, reviews, attempts: attemptRows };
  }

  listVocabulary(userId: string) {
    return this.database.query.vocabularyEntries.findMany({
      where: eq(vocabularyEntries.userId, userId),
      orderBy: [desc(vocabularyEntries.updatedAt)],
    });
  }

  async saveVocabularyEntry(input: {
    userId: string;
    term: string;
    normalizedTerm: string;
    meaning: string;
    example: string | null;
    lessonId: number | null;
  }) {
    const now = new Date().toISOString();
    await this.database
      .insert(vocabularyEntries)
      .values({
        id: crypto.randomUUID(),
        status: "learning",
        createdAt: now,
        updatedAt: now,
        ...input,
      })
      .onConflictDoUpdate({
        target: [vocabularyEntries.userId, vocabularyEntries.normalizedTerm],
        set: {
          term: input.term,
          meaning: input.meaning,
          example: input.example,
          lessonId: input.lessonId,
          status: "learning",
          updatedAt: now,
        },
      });
    return this.database.query.vocabularyEntries.findFirst({
      where: and(
        eq(vocabularyEntries.userId, input.userId),
        eq(vocabularyEntries.normalizedTerm, input.normalizedTerm),
      ),
    });
  }

  async updateVocabularyStatus(userId: string, entryId: string, status: "learning" | "mastered") {
    await this.database
      .update(vocabularyEntries)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(and(eq(vocabularyEntries.id, entryId), eq(vocabularyEntries.userId, userId)));
    return this.database.query.vocabularyEntries.findFirst({
      where: and(eq(vocabularyEntries.id, entryId), eq(vocabularyEntries.userId, userId)),
    });
  }

  async saveVocabularyTrainingAttempt(input: {
    userId: string;
    entryId: string;
    mode: "guided" | "dictation";
    firstTryCorrect: boolean;
    correctionCount: number;
    durationMs: number;
    device: "desktop" | "mobile";
  }) {
    const entry = await this.database.query.vocabularyEntries.findFirst({
      where: and(eq(vocabularyEntries.id, input.entryId), eq(vocabularyEntries.userId, input.userId)),
    });
    if (!entry) return null;
    const attempt = {
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      ...input,
    };
    await this.database.insert(vocabularyTrainingAttempts).values(attempt);
    return attempt;
  }

  async saveWordMemoryTrainingAttempt(input: {
    userId: string;
    lessonId: number;
    itemType: "word" | "sentence";
    itemKey: string;
    mode: "guided" | "dictation";
    firstTryCorrect: boolean;
    correctionCount: number;
    durationMs: number;
    device: "desktop" | "mobile";
  }) {
    const attempt = {
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      ...input,
    };
    await this.database.insert(wordMemoryTrainingAttempts).values(attempt);
    return attempt;
  }

  async wordMemoryStats(userId: string) {
    const attempts = await this.database.query.wordMemoryTrainingAttempts.findMany({
      where: eq(wordMemoryTrainingAttempts.userId, userId),
      orderBy: [desc(wordMemoryTrainingAttempts.occurredAt)],
    });
    const byLesson = new Map<number, {
      attempts: number;
      firstTryCorrect: number;
      corrections: number;
      items: Set<string>;
      lastPracticedAt: string;
    }>();
    let firstTryCorrect = 0;
    let corrections = 0;
    const practicedItems = new Set<string>();
    for (const attempt of attempts) {
      if (attempt.firstTryCorrect) firstTryCorrect += 1;
      corrections += attempt.correctionCount;
      practicedItems.add(`${attempt.lessonId}:${attempt.itemType}:${attempt.itemKey}`);
      const lesson = byLesson.get(attempt.lessonId) ?? {
        attempts: 0,
        firstTryCorrect: 0,
        corrections: 0,
        items: new Set<string>(),
        lastPracticedAt: attempt.occurredAt,
      };
      lesson.attempts += 1;
      if (attempt.firstTryCorrect) lesson.firstTryCorrect += 1;
      lesson.corrections += attempt.correctionCount;
      lesson.items.add(`${attempt.itemType}:${attempt.itemKey}`);
      byLesson.set(attempt.lessonId, lesson);
    }
    return {
      summary: {
        attempts: attempts.length,
        practicedItems: practicedItems.size,
        firstTryAccuracy: attempts.length ? Math.round((firstTryCorrect / attempts.length) * 100) : 0,
        corrections,
      },
      lessons: Array.from(byLesson, ([lessonId, value]) => ({
        lessonId,
        attempts: value.attempts,
        practicedItems: value.items.size,
        firstTryAccuracy: Math.round((value.firstTryCorrect / value.attempts) * 100),
        corrections: value.corrections,
        lastPracticedAt: value.lastPracticedAt,
      })),
    };
  }

  async dashboard(userId: string, now: string) {
    const [mastery, allReviews, wrong, recentAttempts, progressAttempts] = await Promise.all([
      this.database.query.lessonMastery.findMany({
        where: eq(lessonMastery.userId, userId),
      }),
      this.database.query.reviewQueue.findMany({
        where: eq(reviewQueue.userId, userId),
        orderBy: [asc(reviewQueue.dueAt)],
      }),
      this.database.query.wrongAnswers.findMany({
        where: and(eq(wrongAnswers.userId, userId), isNull(wrongAnswers.resolvedAt)),
      }),
      this.database.query.attempts.findMany({
        where: eq(attempts.userId, userId),
        orderBy: [desc(attempts.occurredAt)],
        limit: 5,
      }),
      this.database.query.attempts.findMany({
        where: eq(attempts.userId, userId),
        orderBy: [desc(attempts.occurredAt)],
      }),
    ]);
    return {
      mastery,
      reviews: allReviews.filter((item) => item.dueAt <= now),
      nextReview: allReviews[0] ?? null,
      wrong,
      recentAttempts,
      progressAttempts,
    };
  }

  async learningReport(userId: string) {
    const [attemptRows, mastery] = await Promise.all([
      this.database.query.attempts.findMany({
        where: eq(attempts.userId, userId),
        orderBy: [desc(attempts.occurredAt)],
        limit: 200,
      }),
      this.database.query.lessonMastery.findMany({
        where: eq(lessonMastery.userId, userId),
        orderBy: [asc(lessonMastery.lessonId)],
      }),
    ]);
    return { attempts: attemptRows, mastery };
  }
}
