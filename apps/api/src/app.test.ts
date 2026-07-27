import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, migrate } from "@zhuguang/database";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
import { LearningRepository } from "./repository.js";
import { hashToken } from "./security.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      })),
  );
});

describe("learning account flow", () => {
  it("registers, syncs a profile, records assessment history, and exposes review work", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zhuguang-api-"));
    temporaryDirectories.push(directory);
    const contentDirectory = path.join(directory, "content");
    await fs.mkdir(path.join(contentDirectory, "assessments"), { recursive: true });
    await fs.writeFile(
      path.join(contentDirectory, "assessments", "lesson-01.json"),
      JSON.stringify(syntheticAssessment()),
    );
    await fs.writeFile(
      path.join(contentDirectory, "assessments", "lesson-02.json"),
      JSON.stringify({ ...syntheticAssessment(), lessonId: 2, title: "第二合成课程" }),
    );
    await fs.writeFile(
      path.join(contentDirectory, "assessments", "lesson-03.json"),
      JSON.stringify({ ...syntheticAssessment(), lessonId: 3, title: "第三合成课程" }),
    );
    await fs.writeFile(
      path.join(contentDirectory, "lessons.json"),
      JSON.stringify([1, 2, 3].map((lessonId) => ({
        id: lessonId,
        slug: `lesson-${String(lessonId).padStart(2, "0")}`,
        titleEn: `Synthetic ${lessonId}`,
        titleZh: `合成课程${lessonId}`,
        englishText: "A synthetic lesson.",
        chineseText: "一节合成课程。",
        audio: { us: null, uk: null },
        vocabulary: [{ term: "synthetic", definition: "合成的" }],
        sentences: [{ id: `${lessonId}-1`, text: "A synthetic lesson.", cloze: "synthetic" }],
      }))),
    );

    const secret = "integration-test-secret-at-least-32-characters";
    const invitationCode = "SYNTHETIC-INVITE";
    const databaseUrl = "file::memory:";
    const database = createDatabase(databaseUrl);
    await migrate(database);
    const repository = new LearningRepository(database);
    await repository.createInvitation({
      codeHash: hashToken(invitationCode, secret),
      createdBy: null,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const config: AppConfig = {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: 8787,
      DATABASE_URL: databaseUrl,
      CONTENT_DIR: contentDirectory,
      RECORDINGS_DIR: path.join(directory, "recordings"),
      SESSION_COOKIE_NAME: "test_session",
      SESSION_COOKIE_SECURE: false,
      SESSION_TTL_DAYS: 1,
      SESSION_SECRET: secret,
    };
    const app = await createApp(config, database);

    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        username: "learner_01",
        password: "a-secure-test-password",
        nickname: "学习者",
        invitationCode,
      },
    });
    expect(registration.statusCode).toBe(201);
    const setCookie = registration.headers["set-cookie"]!;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(";")[0]!;

    const profile = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { nickname: "逐光同学", dailyMinutes: 30, preferredAccent: "uk", reminderTime: "19:30" },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({ nickname: "逐光同学", dailyMinutes: 30, preferredAccent: "uk" });

    const secondLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "user-agent": "Synthetic iPhone Safari" },
      payload: { username: "learner_01", password: "a-secure-test-password" },
    });
    expect(secondLogin.statusCode).toBe(200);
    const secondSetCookie = secondLogin.headers["set-cookie"]!;
    const secondCookie = (Array.isArray(secondSetCookie) ? secondSetCookie[0]! : secondSetCookie).split(";")[0]!;

    const sessionsBeforePassword = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie },
    });
    expect(sessionsBeforePassword.statusCode).toBe(200);
    expect(sessionsBeforePassword.json().sessions).toHaveLength(2);
    expect(sessionsBeforePassword.json().sessions.filter((session: { current: boolean }) => session.current)).toHaveLength(1);
    expect(sessionsBeforePassword.json().sessions[0]).not.toHaveProperty("tokenHash");

    const wrongCurrentPassword = await app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: { cookie },
      payload: { currentPassword: "wrong-password", newPassword: "a-new-secure-test-password" },
    });
    expect(wrongCurrentPassword.statusCode).toBe(400);

    const passwordChange = await app.inject({
      method: "POST",
      url: "/api/me/password",
      headers: { cookie },
      payload: { currentPassword: "a-secure-test-password", newPassword: "a-new-secure-test-password" },
    });
    expect(passwordChange.statusCode).toBe(200);
    expect(passwordChange.json()).toMatchObject({ ok: true, otherSessionsRevoked: true });

    const revokedDevice = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: secondCookie } });
    expect(revokedDevice.statusCode).toBe(401);
    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "learner_01", password: "a-secure-test-password" },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);
    const newPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "learner_01", password: "a-new-secure-test-password" },
    });
    expect(newPasswordLogin.statusCode).toBe(200);
    const newSetCookie = newPasswordLogin.headers["set-cookie"]!;
    const newDeviceCookie = (Array.isArray(newSetCookie) ? newSetCookie[0]! : newSetCookie).split(";")[0]!;
    const sessionsAfterLogin = await app.inject({ method: "GET", url: "/api/me/sessions", headers: { cookie } });
    const removableSession = sessionsAfterLogin.json().sessions.find((session: { current: boolean }) => !session.current);
    const removeDevice = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${removableSession.id}`,
      headers: { cookie },
    });
    expect(removeDevice.statusCode).toBe(200);
    expect(removeDevice.json()).toMatchObject({ ok: true, removedCurrent: false });
    const removedDevice = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: newDeviceCookie } });
    expect(removedDevice.statusCode).toBe(401);

    const practice = await app.inject({
      method: "POST",
      url: "/api/lessons/1/attempts",
      headers: { cookie },
      payload: {
        kind: "practice",
        answers: { l1: "A", r1: "B", s1: "speak clearly", w1: "computer" },
      },
    });
    expect(practice.statusCode).toBe(201);
    expect(practice.json()).toMatchObject({ countsTowardMastery: false });

    const publicAssessment = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment",
      headers: { cookie },
    });
    expect(publicAssessment.statusCode).toBe(200);
    expect(publicAssessment.json().questions[0]).toMatchObject({
      id: "l1",
      audioUrl: "/api/lessons/1/audio/us",
    });
    expect(publicAssessment.json().questions[0]).not.toHaveProperty("answer");
    expect(publicAssessment.json().questions[2]).toMatchObject({
      id: "s1",
      speechText: "Speak clearly.",
    });
    expect(publicAssessment.json().questions[2]).not.toHaveProperty("sourceSentence");

    const mapBeforeFormal = await app.inject({
      method: "GET",
      url: "/api/course-map",
      headers: { cookie },
    });
    expect(mapBeforeFormal.statusCode).toBe(200);
    expect(mapBeforeFormal.json().lessons).toMatchObject([
      { lessonId: 1, unlocked: true, state: "ready", score: null },
      { lessonId: 2, unlocked: false, state: "locked", score: null },
      { lessonId: 3, unlocked: false, state: "locked", score: null },
    ]);

    const payload = {
      kind: "formal",
      answers: { l1: "A", r1: "B", s1: "speak clearly", w1: "computer" },
      recordings: { s1: "" },
    };
    const missingRecording = await app.inject({
      method: "POST",
      url: "/api/lessons/1/attempts",
      headers: { cookie },
      payload: { ...payload, recordings: {} },
    });
    expect(missingRecording.statusCode).toBe(400);
    expect(missingRecording.json()).toMatchObject({ error: "正式考核的跟读题必须完成录音" });

    const firstRecording = await app.inject({
      method: "POST",
      url: "/api/lessons/1/recordings/s1",
      headers: { cookie, "content-type": "audio/webm" },
      payload: Buffer.alloc(2_000, 1),
    });
    expect(firstRecording.statusCode).toBe(201);
    payload.recordings.s1 = firstRecording.json().recordingId;
    const first = await app.inject({
      method: "POST",
      url: "/api/lessons/1/attempts",
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ countsTowardMastery: true, mastery: { score: 100 } });

    const retry = await app.inject({
      method: "POST",
      url: "/api/lessons/1/attempts",
      headers: { cookie },
      payload,
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toMatchObject({ countsTowardMastery: false, mastery: { score: 100 }, review: null });

    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers: { cookie } });
    expect(dashboard.statusCode).toBe(200);
    const dashboardBody = dashboard.json();
    expect(dashboardBody).toMatchObject({
      learner: { nickname: "逐光同学" },
      currentLesson: 2,
      studyStreak: 1,
      nextReview: { lessonId: 1, title: "合成课程" },
      plan: { reviewMinutes: 0, weakMinutes: 0, newLessonMinutes: 30 },
    });
    expect(dashboardBody.history).toHaveLength(3);
    expect(dashboardBody.history[0]).toMatchObject({ lessonId: 1, title: "合成课程", score: 100 });

    const weakAttempt = await app.inject({
      method: "POST",
      url: "/api/lessons/2/attempts",
      headers: { cookie },
      payload: {
        kind: "formal",
        answers: { l1: "B", r1: "A", s1: "", w1: "wrong" },
        recordings: {
          s1: (await app.inject({
            method: "POST",
            url: "/api/lessons/2/recordings/s1",
            headers: { cookie, "content-type": "audio/webm" },
            payload: Buffer.alloc(2_000, 2),
          })).json().recordingId,
        },
      },
    });
    expect(weakAttempt.statusCode).toBe(201);
    expect(weakAttempt.json()).toMatchObject({ countsTowardMastery: true, mastery: { score: 0 } });

    await repository.saveReview(registration.json().id, 2, {
      step: 1,
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      consecutiveExcellent: 0,
      result: "restart",
      weakDimensions: ["listening", "reading", "speaking", "writing"],
    });

    const reviewCenter = await app.inject({
      method: "GET",
      url: "/api/review-center",
      headers: { cookie },
    });
    expect(reviewCenter.statusCode).toBe(200);
    expect(reviewCenter.json()).toMatchObject({
      due: [{ lessonId: 2, title: "第二合成课程", weakDimensions: ["listening", "reading", "speaking", "writing"] }],
      upcoming: [{ lessonId: 1, title: "合成课程" }],
    });
    expect(reviewCenter.json().wrongAnswers).toHaveLength(4);
    expect(reviewCenter.json().wrongAnswers[0]).toMatchObject({
      lessonId: 2,
      prompt: expect.any(String),
      sourceSentence: expect.any(String),
      errorCount: 1,
    });

    const courseMap = await app.inject({
      method: "GET",
      url: "/api/course-map",
      headers: { cookie },
    });
    expect(courseMap.statusCode).toBe(200);
    expect(courseMap.json()).toMatchObject({
      summary: {
        totalLessons: 3,
        studiedLessons: 2,
        masteredLessons: 1,
        averageScore: 50,
      },
      lessons: [
        { lessonId: 1, title: "合成课程", unlocked: true, state: "mastered", score: 100 },
        { lessonId: 2, title: "第二合成课程", unlocked: true, state: "review-due", score: 0 },
        { lessonId: 3, title: "第三合成课程", unlocked: true, state: "ready", score: null },
      ],
    });

    const wordMemoryChapters = await app.inject({
      method: "GET",
      url: "/api/word-memory/chapters",
      headers: { cookie },
    });
    expect(wordMemoryChapters.statusCode).toBe(200);
    expect(wordMemoryChapters.json()).toMatchObject({
      chapters: [
        { lessonId: 1, vocabularyCount: expect.any(Number), sentenceCount: expect.any(Number) },
        { lessonId: 2, vocabularyCount: expect.any(Number), sentenceCount: expect.any(Number) },
        { lessonId: 3, vocabularyCount: expect.any(Number), sentenceCount: expect.any(Number) },
      ],
    });

    const report = await app.inject({
      method: "GET",
      url: "/api/learning-report",
      headers: { cookie },
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).toMatchObject({
      summary: {
        totalAttempts: 4,
        studiedDays: 1,
        studyStreak: 1,
        averageScore: 75,
      },
      dimensions: { listening: 75, reading: 75, speaking: 75, writing: 75 },
      lessons: [
        { lessonId: 1, title: "合成课程", score: 100 },
        { lessonId: 2, title: "第二合成课程", score: 0 },
      ],
    });

    const vocabularyCreate = await app.inject({
      method: "POST",
      url: "/api/vocabulary",
      headers: { cookie },
      payload: {
        term: "Computer",
        meaning: "电脑",
        example: "The computer helps me organize my work.",
        lessonId: 1,
      },
    });
    expect(vocabularyCreate.statusCode).toBe(201);
    expect(vocabularyCreate.json()).toMatchObject({
      term: "Computer",
      meaning: "电脑",
      status: "learning",
    });

    const vocabularyList = await app.inject({
      method: "GET",
      url: "/api/vocabulary",
      headers: { cookie },
    });
    expect(vocabularyList.statusCode).toBe(200);
    expect(vocabularyList.json()).toMatchObject({
      summary: { total: 1, learning: 1, mastered: 0 },
      entries: [{ id: vocabularyCreate.json().id, term: "Computer" }],
    });
    expect(vocabularyList.json().entries[0]).not.toHaveProperty("userId");
    expect(vocabularyList.json().entries[0]).not.toHaveProperty("normalizedTerm");

    const vocabularyMastered = await app.inject({
      method: "PATCH",
      url: `/api/vocabulary/${vocabularyCreate.json().id}`,
      headers: { cookie },
      payload: { status: "mastered" },
    });
    expect(vocabularyMastered.statusCode).toBe(409);
    expect(vocabularyMastered.json()).toMatchObject({
      error: "单词必须通过正式考核才能标记为已掌握",
    });

    const vocabularyTraining = await app.inject({
      method: "POST",
      url: "/api/vocabulary/training-attempts",
      headers: { cookie },
      payload: {
        entryId: vocabularyCreate.json().id,
        mode: "guided",
        firstTryCorrect: false,
        correctionCount: 2,
        durationMs: 4_200,
        device: "desktop",
      },
    });
    expect(vocabularyTraining.statusCode).toBe(201);
    expect(vocabularyTraining.json()).toMatchObject({
      attemptId: expect.any(String),
      occurredAt: expect.any(String),
    });

    const sentenceTraining = await app.inject({
      method: "POST",
      url: "/api/word-memory/training-attempts",
      headers: { cookie },
      payload: {
        lessonId: 1,
        itemType: "sentence",
        itemKey: "1-1",
        mode: "guided",
        firstTryCorrect: false,
        correctionCount: 1,
        durationMs: 3_000,
        device: "mobile",
      },
    });
    expect(sentenceTraining.statusCode).toBe(201);

    const wordTraining = await app.inject({
      method: "POST",
      url: "/api/word-memory/training-attempts",
      headers: { cookie },
      payload: {
        lessonId: 1,
        itemType: "word",
        itemKey: "synthetic",
        mode: "guided",
        firstTryCorrect: true,
        correctionCount: 0,
        durationMs: 1_800,
        device: "desktop",
      },
    });
    expect(wordTraining.statusCode).toBe(201);

    const wordAssessment = await app.inject({
      method: "GET",
      url: "/api/word-memory/chapters/1/assessment",
      headers: { cookie },
    });
    expect(wordAssessment.statusCode).toBe(200);
    expect(wordAssessment.json()).toMatchObject({
      passingScore: 80,
      items: [{
        term: "synthetic",
        spellingPrompt: "合成的",
        clozePrompt: "A _____ lesson.",
      }],
    });
    expect(wordAssessment.json().items[0]).not.toHaveProperty("meaning");

    const formalWordAssessment = await app.inject({
      method: "POST",
      url: "/api/word-memory/chapters/1/assessment",
      headers: { cookie },
      payload: {
        answers: [{
          term: "synthetic",
          meaning: "合成的",
          listening: "synthetic",
          spelling: "synthetic",
          context: "synthetic",
        }],
      },
    });
    expect(formalWordAssessment.statusCode).toBe(201);
    expect(formalWordAssessment.json()).toMatchObject({
      masteredCount: 1,
      results: [{
        term: "synthetic",
        meaning: 100,
        listening: 100,
        spelling: 100,
        context: 100,
        total: 100,
        passed: true,
      }],
    });

    const wordMemoryStats = await app.inject({
      method: "GET",
      url: "/api/word-memory/stats",
      headers: { cookie },
    });
    expect(wordMemoryStats.statusCode).toBe(200);
    expect(wordMemoryStats.json()).toMatchObject({
      summary: { attempts: 2, practicedItems: 2, firstTryAccuracy: 50, corrections: 1, formalAttempts: 1, masteredWords: 1 },
      lessons: [{ lessonId: 1, attempts: 2, practicedItems: 2, firstTryAccuracy: 50, corrections: 1, formalAttempts: 1, masteredWords: 1 }],
    });

    await app.close();
  });
});

function syntheticAssessment() {
  return {
    lessonId: 1,
    title: "合成课程",
    questions: [
      { id: "l1", dimension: "listening", type: "choice", prompt: "听力", options: ["A", "B"], answer: "A", points: 1, sourceSentence: "Synthetic A." },
      { id: "r1", dimension: "reading", type: "choice", prompt: "阅读", options: ["A", "B"], answer: "B", points: 1, sourceSentence: "Synthetic B." },
      { id: "s1", dimension: "speaking", type: "speech", prompt: "跟读", answer: "speak clearly", points: 1, sourceSentence: "Speak clearly." },
      { id: "w1", dimension: "writing", type: "text", prompt: "听写", answer: "computer", points: 1, sourceSentence: "Computer." },
    ],
  };
}
