import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@zhuguang/database";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  ));
});

describe("deployment health", () => {
  it("reports unavailable when any of the first three assessments is missing", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zhuguang-health-"));
    temporaryDirectories.push(directory);
    const contentDirectory = path.join(directory, "content");
    await fs.mkdir(path.join(contentDirectory, "assessments"), { recursive: true });
    await fs.writeFile(
      path.join(contentDirectory, "lessons.json"),
      JSON.stringify([1, 2, 3].map(syntheticLesson)),
    );
    await fs.writeFile(
      path.join(contentDirectory, "assessments", "lesson-01.json"),
      JSON.stringify(syntheticAssessment(1)),
    );

    const config: AppConfig = {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: 8787,
      DATABASE_URL: `file:${path.join(directory, "health.db")}`,
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
      SESSION_SECRET: "health-test-secret-at-least-32-characters",
    };
    const app = await createApp(config, createDatabase(config.DATABASE_URL));

    const health = await app.inject({ method: "GET", url: "/api/health" });

    expect(health.statusCode).toBe(503);
    expect(health.json()).toMatchObject({ ok: false, database: true, content: false });
    await app.close();
  });

  it("reports unavailable when the first three lessons lack independent word audio", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zhuguang-health-"));
    temporaryDirectories.push(directory);
    const contentDirectory = path.join(directory, "content");
    await fs.mkdir(path.join(contentDirectory, "assessments"), { recursive: true });
    await fs.writeFile(
      path.join(contentDirectory, "lessons.json"),
      JSON.stringify([1, 2, 3].map(syntheticLesson)),
    );
    await Promise.all([1, 2, 3].map((lessonId) => fs.writeFile(
      path.join(contentDirectory, "assessments", `lesson-${String(lessonId).padStart(2, "0")}.json`),
      JSON.stringify(syntheticAssessment(lessonId)),
    )));
    const config: AppConfig = {
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: 8787,
      DATABASE_URL: `file:${path.join(directory, "health.db")}`,
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
      SESSION_SECRET: "health-test-secret-at-least-32-characters",
    };
    const app = await createApp(config, createDatabase(config.DATABASE_URL));

    const health = await app.inject({ method: "GET", url: "/api/health" });

    expect(health.statusCode).toBe(503);
    expect(health.json().firstPhase.lessons).toEqual(expect.arrayContaining([
      expect.objectContaining({ lessonId: 1, ready: false, issues: expect.arrayContaining(["missing-word-audio"]) }),
    ]));
    await app.close();
  });
});

function syntheticLesson(id: number) {
  return {
    id,
    slug: `lesson-${String(id).padStart(2, "0")}`,
    titleEn: `Synthetic ${id}`,
    titleZh: `合成课程${id}`,
    englishText: "Synthetic lesson.",
    chineseText: "合成课程。",
    audio: { us: `/audio/us/lesson-${String(id).padStart(2, "0")}.mp3`, uk: null },
    vocabulary: Array.from({ length: 5 }, (_, index) => ({
      term: `word${id}${index}`,
      definition: `释义${index}`,
    })),
    sentences: Array.from({ length: 5 }, (_, index) => ({
      id: `${id}-${index}`,
      text: `Use word${id}${index} here.`,
      cloze: `word${id}${index}`,
    })),
  };
}

function syntheticAssessment(lessonId: number) {
  return {
    lessonId,
    title: `合成考核${lessonId}`,
    questions: [
      { id: "l1", dimension: "listening", type: "choice", prompt: "选择", options: ["A", "B"], answer: "A", points: 1, sourceSentence: "A." },
      { id: "r1", dimension: "reading", type: "choice", prompt: "选择", options: ["A", "B"], answer: "B", points: 1, sourceSentence: "B." },
      { id: "s1", dimension: "speaking", type: "speech", prompt: "朗读", answer: "Synthetic.", points: 1, sourceSentence: "Synthetic." },
      { id: "w1", dimension: "writing", type: "text", prompt: "听写", answer: "Synthetic", points: 1, sourceSentence: "Synthetic." },
    ],
  };
}
