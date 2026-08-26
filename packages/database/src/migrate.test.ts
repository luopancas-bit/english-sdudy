import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./index.js";
import { migrate } from "./migrate.js";

describe("database migration", () => {
  it("upgrades the legacy translation cache without deleting rows", async () => {
    const database = createDatabase("file::memory:");
    await database.run(sql`
      CREATE TABLE reading_translation_usage (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, sentence_hash TEXT NOT NULL,
        target_language TEXT NOT NULL DEFAULT 'zh-CN', translation TEXT NOT NULL,
        provider TEXT NOT NULL, occurred_at TEXT NOT NULL
      )
    `);
    await database.run(sql`
      INSERT INTO reading_translation_usage (id, user_id, sentence_hash, translation, provider, occurred_at)
      VALUES ('legacy-translation', 'legacy-user', 'old-hash', '旧译文', 'legacy-model', '2026-08-18T00:00:00.000Z')
    `);

    await migrate(database);

    const row = await database.run(sql`SELECT * FROM reading_translation_usage WHERE id = 'legacy-translation'`);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]?.model_version).toBe("legacy");
    expect(row.rows[0]?.prompt_version).toBe("reading-translation-v1");
    database.$client.close();
  });

  it("adds reading tables without changing existing learner data", async () => {
    const database = createDatabase("file::memory:");
    await migrate(database);
    await database.run(sql`
      INSERT INTO users (id, username, password_hash, nickname, role, daily_minutes, preferred_accent, created_at, updated_at)
      VALUES ('reading-user', 'reader', 'hash', '阅读者', 'learner', 25, 'us', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')
    `);
    await database.run(sql`
      INSERT INTO reading_books (id, owner_id, visibility, source_type, title, language, format, mime_type, created_at, updated_at)
      VALUES ('reading-book', 'reading-user', 'private', 'upload', 'A Test Book', 'en', 'txt', 'text/plain', '2026-08-18T00:00:00.000Z', '2026-08-18T00:00:00.000Z')
    `);

    await migrate(database);
    const timeout = await database.run(sql`PRAGMA busy_timeout`);
    expect(timeout.rows[0]?.timeout).toBe(30000);

    expect(await database.query.users.findFirst()).toMatchObject({ id: "reading-user", nickname: "阅读者" });
    expect(await database.query.readingBooks.findFirst()).toMatchObject({ id: "reading-book", ownerId: "reading-user", status: "queued" });
    database.$client.close();
  });

  it("creates assessment drafts idempotently with one draft per user, lesson, and kind", async () => {
    const database = createDatabase("file::memory:");
    await migrate(database);
    await database.run(sql`
      INSERT INTO users (id, username, password_hash, nickname, role, daily_minutes, preferred_accent, created_at, updated_at)
      VALUES ('draft-user', 'draft-learner', 'hash', '学习者', 'learner', 25, 'us', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')
    `);
    await database.run(sql`
      INSERT INTO assessment_drafts (user_id, lesson_id, kind, current_index, answers, recordings, updated_at)
      VALUES ('draft-user', 1, 'formal', 2, '{"l1":"A"}', '{}', '2026-08-17T00:00:00.000Z')
    `);
    await database.run(sql`
      INSERT INTO assessment_drafts (user_id, lesson_id, kind, current_index, answers, recordings, updated_at)
      VALUES ('draft-user', 1, 'formal', 3, '{"l1":"B"}', '{}', '2026-08-17T00:01:00.000Z')
      ON CONFLICT(user_id, lesson_id, kind) DO UPDATE SET
        current_index = excluded.current_index,
        answers = excluded.answers,
        updated_at = excluded.updated_at
    `);
    await migrate(database);
    const rows = await database.query.assessmentDrafts.findMany();
    expect(rows).toMatchObject([{ userId: "draft-user", lessonId: 1, kind: "formal", currentIndex: 3, answers: { l1: "B" } }]);
    database.$client.close();
  });

  it("backfills the latest formal word result into the spaced-review schedule", async () => {
    const database = createDatabase("file::memory:");
    await migrate(database);
    await database.run(sql`
      INSERT INTO users (id, username, password_hash, nickname, role, daily_minutes, preferred_accent, created_at, updated_at)
      VALUES ('user-1', 'learner', 'hash', '学习者', 'learner', 25, 'us', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
    `);
    await database.run(sql`
      INSERT INTO word_assessment_results
        (id, user_id, lesson_id, term, normalized_term, meaning, listening, spelling, context, total, passed, occurred_at)
      VALUES
        ('attempt-old', 'user-1', 1, 'synthetic', 'synthetic', 0, 0, 0, 0, 0, 0, '2026-08-01T00:00:00.000Z'),
        ('attempt-latest', 'user-1', 1, 'synthetic', 'synthetic', 100, 100, 100, 100, 100, 1, '2026-08-02T00:00:00.000Z')
    `);

    await migrate(database);

    const rows = await database.query.wordReviewStates.findMany();
    expect(rows).toMatchObject([{
      userId: "user-1",
      lessonId: 1,
      term: "synthetic",
      normalizedTerm: "synthetic",
      status: "reviewing",
      step: 0,
      dueAt: "2026-08-03T00:00:00.000Z",
      lastScore: 100,
    }]);
    database.$client.close();
  });
});
