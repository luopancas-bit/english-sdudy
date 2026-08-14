import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./index.js";
import { migrate } from "./migrate.js";

describe("database migration", () => {
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
