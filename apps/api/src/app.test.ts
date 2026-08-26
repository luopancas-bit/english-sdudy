import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    await fs.mkdir(path.join(contentDirectory, "audio", "vocabulary", "us"), { recursive: true });
    await fs.writeFile(path.join(contentDirectory, "audio", "vocabulary", "us", "a.m4a"), "word-audio");
    await fs.mkdir(path.join(contentDirectory, "dictionaries", "resources", "test-ipa@1"), { recursive: true });
    await fs.writeFile(path.join(contentDirectory, "dictionaries", "resources", "test-ipa@1", "audio.mp3"), "dict-audio");
    await fs.writeFile(path.join(contentDirectory, "audio", "vocabulary", "index.json"), JSON.stringify({
      version: 1,
      entries: {
        a: { term: "A", accents: { us: { path: "us/a.m4a", mimeType: "audio/mp4" } } },
        synthetic: { term: "synthetic", accents: { us: { path: "us/a.m4a", mimeType: "audio/mp4" } } },
      },
    }));
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
    await fs.mkdir(path.join(contentDirectory, "dictionaries", "published"), { recursive: true });
    await fs.writeFile(
      path.join(contentDirectory, "dictionaries", "published", "test-ipa@1.json"),
      JSON.stringify({
        schemaVersion: 1,
        source: { id: "test-ipa", name: "测试音标", version: "1", format: "json", license: "test-only", priority: 10 },
        entries: [{
          key: "synthetic",
          term: "synthetic",
          definition: "合成的",
          partOfSpeech: "adjective",
          rawNotation: "US /sɪnˈθetɪk/; UK /sɪnˈθetɪk/",
          pronunciations: [
            { accent: "us", ipa: "sɪnˈθetɪk", rawPhonetic: "/sɪnˈθetɪk/", notationSystem: "ipa", status: "verified", primary: true, partOfSpeech: "adjective", audioResourceKey: "audio.mp3" },
            { accent: "uk", ipa: "sɪnˈθetɪk", rawPhonetic: "/sɪnˈθetɪk/", notationSystem: "ipa", status: "verified", primary: true, partOfSpeech: "adjective" },
          ],
        }],
        resources: [{
          key: "audio.mp3",
          path: "dictionaries/resources/test-ipa@1/audio.mp3",
          kind: "audio",
          mimeType: "audio/mpeg",
          sha256: "0000000000000000000000000000000000000000000000000000000000000000",
          byteSize: 10,
        }],
      }),
    );
    await fs.writeFile(
      path.join(contentDirectory, "dictionaries", "published", "test-ipa-alternative@1.json"),
      JSON.stringify({
        schemaVersion: 1,
        source: { id: "test-ipa-alternative", name: "测试备选音标", version: "1", format: "json", license: "test-only", priority: 20 },
        entries: [{
          key: "synthetic",
          term: "synthetic",
          definition: "冲突测试",
          partOfSpeech: "adjective",
          rawNotation: null,
          pronunciations: [
            { accent: "us", ipa: "sɪnˈθɛtɪk", rawPhonetic: null, notationSystem: "ipa", status: "verified", primary: true, partOfSpeech: "adjective" },
            { accent: "uk", ipa: "sɪnˈθɛtɪk", rawPhonetic: null, notationSystem: "ipa", status: "verified", primary: true, partOfSpeech: "adjective" },
          ],
        }],
        resources: [],
      }),
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
      READING_DIR: path.join(directory, "reading"),
      READING_ENABLED: true,
      READING_UPLOAD_ENABLED: true,
      READING_MAX_BOOK_BYTES: 300 * 1024 * 1024,
      READING_MAX_USER_BYTES: 5 * 1024 * 1024 * 1024,
      READING_MAX_USER_BOOKS: 100,
      READING_TRANSLATION_DAILY_LIMIT: 100,
      TRANSLATION_BASE_URL: undefined,
      TRANSLATION_API_KEY: undefined,
      TRANSLATION_MODEL: "translation-model",
      COURSE_LESSON_COUNT: 3,
      SESSION_COOKIE_NAME: "test_session",
      SESSION_COOKIE_SECURE: false,
      SESSION_TTL_DAYS: 7,
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

    const masteryBeforeReading = (await app.inject({ method: "GET", url: "/api/dashboard", headers: { cookie } })).json().longTermMastery;
    const readingLibrary = await app.inject({ method: "GET", url: "/api/reading/library", headers: { cookie } });
    expect(readingLibrary.statusCode).toBe(200);
    expect(readingLibrary.json().books).toHaveLength(12);
    expect(readingLibrary.json().books.every((book: { externalId: string | null; sourceType: string; shelved: boolean }) => Boolean(book.externalId) && book.sourceType === "builtin" && !book.shelved)).toBe(true);
    expect(await database.query.readingImportJobs.findMany()).toHaveLength(0);
    const upload = await app.inject({
      method: "POST",
      url: "/api/reading/books",
      headers: { cookie, "content-type": "application/x-ebook", "x-book-filename": encodeURIComponent("Courage.txt") },
      payload: Buffer.from("Chapter I\n\nCourage is not the absence of fear. It is choosing to continue."),
    });
    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({ status: "ready" });
    const uploadedBook = await app.inject({ method: "GET", url: `/api/reading/books/${upload.json().id}`, headers: { cookie } });
    expect(uploadedBook.statusCode).toBe(200);
    expect(uploadedBook.json()).toMatchObject({ book: { title: "Courage", status: "ready", visibility: "private" }, manifest: { version: 1 } });
    await app.inject({ method: "PATCH", url: `/api/reading/books/${upload.json().id}/progress`, headers: { cookie }, payload: { chapterIndex: 0, offset: 10, progress: 60 } });
    const masteryAfterReading = (await app.inject({ method: "GET", url: "/api/dashboard", headers: { cookie } })).json().longTermMastery;
    expect(masteryAfterReading).toBe(masteryBeforeReading);

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
      audioUrl: "/api/lessons/1/assessment-audio/l1/us",
      audioMode: "word",
    });
    expect(publicAssessment.json().questions[0]).not.toHaveProperty("audioStart");
    expect(publicAssessment.json().questions[0]).not.toHaveProperty("audioEnd");
    expect(publicAssessment.json().questions[0]).not.toHaveProperty("answer");
    expect(publicAssessment.json().questions[2]).toMatchObject({
      id: "s1",
      speechText: "Speak clearly.",
    });
    expect(publicAssessment.json().questions[2]).not.toHaveProperty("sourceSentence");

    const listeningWordAudio = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment-audio/l1/us",
      headers: { cookie },
    });
    expect(listeningWordAudio.statusCode).toBe(200);
    expect(listeningWordAudio.headers["content-type"]).toContain("audio/mp4");
    expect(listeningWordAudio.body).toBe("word-audio");

    const listeningWordAudioRange = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment-audio/l1/us",
      headers: { cookie, range: "bytes=0-3" },
    });
    expect(listeningWordAudioRange.statusCode).toBe(206);
    expect(listeningWordAudioRange.headers["accept-ranges"]).toBe("bytes");
    expect(listeningWordAudioRange.headers["content-range"]).toBe("bytes 0-3/10");
    expect(listeningWordAudioRange.body).toBe("word");

    const invalidAudioRange = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment-audio/l1/us",
      headers: { cookie, range: "bytes=99-" },
    });
    expect(invalidAudioRange.statusCode).toBe(416);
    expect(invalidAudioRange.headers["content-range"]).toBe("bytes */10");

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
      answers: { l1: "A", r1: "B", s1: "", w1: "computer" },
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

    const emptyDraft = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment-draft?kind=formal",
      headers: { cookie },
    });
    expect(emptyDraft.statusCode).toBe(200);
    expect(emptyDraft.json()).toEqual({ draft: null });

    const firstRecording = await app.inject({
      method: "POST",
      url: "/api/lessons/1/recordings/s1",
      headers: { cookie, "content-type": "audio/webm" },
      payload: Buffer.alloc(2_000, 1),
    });
    expect(firstRecording.statusCode).toBe(201);
    payload.recordings.s1 = firstRecording.json().recordingId;

    const invalidDraftRecording = await app.inject({
      method: "PUT",
      url: "/api/lessons/1/assessment-draft",
      headers: { cookie },
      payload: {
        kind: "formal",
        currentIndex: 2,
        answers: { l1: "A", r1: "B" },
        recordings: { s1: "f9d350d7-6fe9-42e4-a92f-11750f6cf6ba" },
      },
    });
    expect(invalidDraftRecording.statusCode).toBe(400);
    expect(invalidDraftRecording.json()).toMatchObject({ error: "草稿中的跟读录音无效" });

    const savedDraft = await app.inject({
      method: "PUT",
      url: "/api/lessons/1/assessment-draft",
      headers: { cookie },
      payload: {
        kind: "formal",
        currentIndex: 2,
        answers: { l1: "A", r1: "B" },
        recordings: payload.recordings,
      },
    });
    expect(savedDraft.statusCode).toBe(200);
    expect(savedDraft.json().draft).toMatchObject({
      lessonId: 1,
      kind: "formal",
      currentIndex: 2,
      answers: { l1: "A", r1: "B" },
      recordings: payload.recordings,
    });

    const crossDeviceLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "user-agent": "Synthetic second device" },
      payload: { username: "learner_01", password: "a-new-secure-test-password" },
    });
    const crossDeviceSetCookie = crossDeviceLogin.headers["set-cookie"]!;
    const crossDeviceCookie = (Array.isArray(crossDeviceSetCookie) ? crossDeviceSetCookie[0]! : crossDeviceSetCookie).split(";")[0]!;
    const restoredDraft = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment-draft?kind=formal",
      headers: { cookie: crossDeviceCookie },
    });
    expect(restoredDraft.statusCode).toBe(200);
    expect(restoredDraft.json().draft).toMatchObject({
      currentIndex: 2,
      answers: { l1: "A", r1: "B" },
      recordings: payload.recordings,
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/lessons/1/attempts",
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      countsTowardMastery: true,
      scores: { speaking: 0 },
      mastery: { score: 80 },
    });
    const clearedDraft = await app.inject({
      method: "GET",
      url: "/api/lessons/1/assessment-draft?kind=formal",
      headers: { cookie: crossDeviceCookie },
    });
    expect(clearedDraft.statusCode).toBe(200);
    expect(clearedDraft.json()).toEqual({ draft: null });

    const retry = await app.inject({
      method: "POST",
      url: "/api/lessons/1/attempts",
      headers: { cookie },
      payload,
    });
    expect(retry.statusCode).toBe(201);
    expect(retry.json()).toMatchObject({ countsTowardMastery: false, mastery: { score: 80 }, review: null });

    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers: { cookie } });
    expect(dashboard.statusCode).toBe(200);
    const dashboardBody = dashboard.json();
    expect(dashboardBody).toMatchObject({
      learner: { nickname: "逐光同学" },
      currentLesson: 2,
      studyStreak: 1,
      nextReview: { lessonId: 1, title: "合成课程" },
      plan: { reviewMinutes: 5, weakMinutes: 2, newLessonMinutes: 23 },
    });
    expect(dashboardBody.history).toHaveLength(3);
    expect(dashboardBody.history[0]).toMatchObject({ lessonId: 1, title: "合成课程", score: 80 });

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
      due: [
        { lessonId: 2, title: "第二合成课程", weakDimensions: ["listening", "reading", "speaking", "writing"] },
        { lessonId: 1, title: "合成课程", weakDimensions: ["speaking"] },
      ],
      upcoming: [],
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
        averageScore: 40,
      },
      lessons: [
        { lessonId: 1, title: "合成课程", unlocked: true, state: "review-due", score: 80 },
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

    const lessonWithPronunciation = await app.inject({
      method: "GET",
      url: "/api/lessons/1",
      headers: { cookie },
    });
    expect(lessonWithPronunciation.statusCode).toBe(200);
    expect(lessonWithPronunciation.json().vocabulary[0]).toMatchObject({
      term: "synthetic",
      pronunciation: {
        status: "ambiguous",
        us: {
          ipa: "sɪnˈθetɪk",
          alternatives: [{ ipa: "sɪnˈθɛtɪk", partOfSpeech: "adjective" }],
          audioUrl: expect.stringMatching(/^\/api\/dictionary\/entries\/[0-9a-f-]+\/audio\/us$/),
        },
        uk: { ipa: "sɪnˈθetɪk", alternatives: [{ ipa: "sɪnˈθɛtɪk", partOfSpeech: "adjective" }], audioUrl: null },
      },
    });
    const dictionaryAudioUrl = lessonWithPronunciation.json().vocabulary[0].pronunciation.us.audioUrl;
    const dictionaryAudio = await app.inject({ method: "GET", url: dictionaryAudioUrl, headers: { cookie } });
    expect(dictionaryAudio.statusCode).toBe(200);
    expect(dictionaryAudio.headers["content-type"]).toContain("audio/mpeg");
    expect(dictionaryAudio.body).toBe("dict-audio");

    const dictionaryStatus = await app.inject({ method: "GET", url: "/api/dictionaries/status", headers: { cookie } });
    expect(dictionaryStatus.statusCode).toBe(200);
    expect(dictionaryStatus.json()).toMatchObject({
      summary: {
        entries: 1,
        us: 1,
        uk: 1,
        dual: 1,
        pending: 0,
        ambiguous: 1,
        openConflicts: 2,
        missingUs: 0,
        missingUk: 0,
        pendingSingle: 0,
        pendingPhrase: 0,
      },
      sources: [
        { id: "test-ipa@1", status: "active", priority: 10 },
        { id: "test-ipa-alternative@1", status: "active", priority: 20 },
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
        averageScore: 65,
      },
      dimensions: { listening: 75, reading: 75, speaking: 25, writing: 75 },
      lessons: [
        { lessonId: 1, title: "合成课程", score: 80 },
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
      pronunciation: { status: "pending", us: { ipa: null }, uk: { ipa: null } },
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
        audioUrl: "/api/word-memory/chapters/1/assessment-audio/0/us",
      }],
    });
    expect(wordAssessment.json().items[0]).not.toHaveProperty("meaning");
    expect(wordAssessment.json().items[0].audioUrl).not.toContain("synthetic");
    const wordMemoryAudio = await app.inject({
      method: "GET",
      url: wordAssessment.json().items[0].audioUrl,
      headers: { cookie },
    });
    expect(wordMemoryAudio.statusCode).toBe(200);
    expect(wordMemoryAudio.headers["content-type"]).toContain("audio/mp4");
    expect(wordMemoryAudio.body).toBe("word-audio");

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

    const wordReviews = await app.inject({
      method: "GET",
      url: "/api/word-memory/reviews",
      headers: { cookie },
    });
    expect(wordReviews.statusCode).toBe(200);
    expect(wordReviews.json()).toMatchObject({
      due: [],
      upcoming: [{
        lessonId: 1,
        term: "synthetic",
        status: "reviewing",
        step: 0,
        lastScore: 100,
        dueAt: expect.any(String),
      }],
      history: [],
    });

    const repeatedFormalWordAssessment = await app.inject({
      method: "POST",
      url: "/api/word-memory/chapters/1/assessment",
      headers: { cookie },
      payload: {
        answers: [{ term: "synthetic", meaning: "合成的", listening: "synthetic", spelling: "synthetic", context: "synthetic" }],
      },
    });
    expect(repeatedFormalWordAssessment.statusCode).toBe(201);
    const reviewsAfterRepeatedFormal = await app.inject({ method: "GET", url: "/api/word-memory/reviews", headers: { cookie } });
    expect(reviewsAfterRepeatedFormal.json()).toMatchObject({
      upcoming: [{ id: wordReviews.json().upcoming[0].id, status: "reviewing", step: 0 }],
    });
    const scheduledReview = reviewsAfterRepeatedFormal.json().upcoming[0];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(scheduledReview.dueAt) + 1_000));
    const dueWordReviews = await app.inject({
      method: "GET",
      url: "/api/word-memory/reviews",
      headers: { cookie },
    });
    expect(dueWordReviews.statusCode).toBe(200);
    expect(dueWordReviews.json()).toMatchObject({
      due: [{ id: scheduledReview.id, term: "synthetic", step: 0 }],
      upcoming: [],
    });

    const submittedReview = await app.inject({
      method: "POST",
      url: `/api/word-memory/reviews/${scheduledReview.id}`,
      headers: { cookie },
      payload: {
        meaning: "合成的",
        listening: "synthetic",
        spelling: "synthetic",
        context: "synthetic",
      },
    });
    expect(submittedReview.statusCode).toBe(201);
    expect(submittedReview.json()).toMatchObject({
      review: { id: scheduledReview.id, status: "reviewing", step: 1, lastScore: 100 },
      evidence: {
        reviewId: scheduledReview.id,
        term: "synthetic",
        total: 100,
        passed: true,
        decision: "advance",
        stepBefore: 0,
        stepAfter: 1,
        occurredAt: expect.any(String),
      },
    });

    const reviewsAfterSubmission = await app.inject({
      method: "GET",
      url: "/api/word-memory/reviews",
      headers: { cookie },
    });
    expect(reviewsAfterSubmission.json()).toMatchObject({
      due: [],
      upcoming: [{ id: scheduledReview.id, step: 1 }],
      history: [{ reviewId: scheduledReview.id, decision: "advance", total: 100 }],
    });
    vi.useRealTimers();

    const wordMemoryStats = await app.inject({
      method: "GET",
      url: "/api/word-memory/stats",
      headers: { cookie },
    });
    expect(wordMemoryStats.statusCode).toBe(200);
    expect(wordMemoryStats.json()).toMatchObject({
      summary: { attempts: 2, practicedItems: 2, firstTryAccuracy: 50, corrections: 1, formalAttempts: 2, masteredWords: 0 },
      lessons: [{ lessonId: 1, attempts: 2, practicedItems: 2, firstTryAccuracy: 50, corrections: 1, formalAttempts: 2, masteredWords: 0 }],
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
