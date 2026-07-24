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
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("learning account flow", () => {
  it("registers, syncs a profile, records assessment history, and ignores a same-day retry", async () => {
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

    const secret = "integration-test-secret-at-least-32-characters";
    const invitationCode = "SYNTHETIC-INVITE";
    const databaseUrl = `file:${path.join(directory, "test.sqlite")}`;
    const database = createDatabase(databaseUrl);
    await migrate(database);
    await new LearningRepository(database).createInvitation({
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
      SESSION_COOKIE_NAME: "test_session",
      SESSION_TTL_DAYS: 1,
      SESSION_SECRET: secret,
    };
    const app = await createApp(config);

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

    const payload = {
      kind: "formal",
      answers: { l1: "A", r1: "B", s1: "speak clearly", w1: "computer" },
    };
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
    });
    expect(dashboardBody.history).toHaveLength(2);
    expect(dashboardBody.history[0]).toMatchObject({ lessonId: 1, title: "合成课程", score: 100 });

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
