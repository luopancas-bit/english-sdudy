import { sql } from "drizzle-orm";
import type { Database } from "./index.js";

export async function migrate(database: Database): Promise<void> {
  await database.run(sql`PRAGMA journal_mode = WAL`);
  await database.run(sql`PRAGMA foreign_keys = ON`);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'learner',
      daily_minutes INTEGER NOT NULL DEFAULT 25,
      preferred_accent TEXT NOT NULL DEFAULT 'us',
      reminder_time TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      listening REAL NOT NULL,
      reading REAL NOT NULL,
      speaking REAL NOT NULL,
      writing REAL NOT NULL,
      total REAL NOT NULL,
      answer_detail TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS lesson_mastery (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      score REAL NOT NULL,
      band TEXT NOT NULL,
      listening REAL NOT NULL,
      reading REAL NOT NULL,
      speaking REAL NOT NULL,
      writing REAL NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, lesson_id)
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS recordings_user_lesson_idx
    ON recordings(user_id, lesson_id, created_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS review_queue (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      due_at TEXT NOT NULL,
      consecutive_excellent INTEGER NOT NULL DEFAULT 0,
      weak_dimensions TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, lesson_id)
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS wrong_answers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      dimension TEXT NOT NULL,
      last_answer TEXT,
      error_count INTEGER NOT NULL DEFAULT 1,
      resolved_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, question_id)
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS vocabulary_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      meaning TEXT NOT NULL,
      example TEXT,
      lesson_id INTEGER,
      status TEXT NOT NULL DEFAULT 'learning',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, normalized_term)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS vocabulary_user_status_idx
    ON vocabulary_entries(user_id, status, updated_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS vocabulary_training_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      first_try_correct INTEGER NOT NULL,
      correction_count INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      device TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS vocabulary_training_user_idx
    ON vocabulary_training_attempts(user_id, occurred_at)
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS vocabulary_training_entry_idx
    ON vocabulary_training_attempts(user_id, entry_id, occurred_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS word_memory_training_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_key TEXT NOT NULL,
      mode TEXT NOT NULL,
      first_try_correct INTEGER NOT NULL,
      correction_count INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      device TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_memory_training_user_idx
    ON word_memory_training_attempts(user_id, occurred_at)
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_memory_training_lesson_idx
    ON word_memory_training_attempts(user_id, lesson_id, occurred_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS word_assessment_results (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      meaning REAL NOT NULL,
      listening REAL NOT NULL,
      spelling REAL NOT NULL,
      context REAL NOT NULL,
      total REAL NOT NULL,
      passed INTEGER NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_assessment_user_idx
    ON word_assessment_results(user_id, occurred_at)
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_assessment_term_idx
    ON word_assessment_results(user_id, lesson_id, normalized_term, occurred_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS word_review_states (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      status TEXT NOT NULL,
      step INTEGER NOT NULL,
      due_at TEXT NOT NULL,
      last_score REAL NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, lesson_id, normalized_term)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_review_due_idx
    ON word_review_states(user_id, due_at)
  `);
  await database.run(sql`
    INSERT OR IGNORE INTO word_review_states
      (id, user_id, lesson_id, term, normalized_term, status, step, due_at, last_score, updated_at)
    SELECT
      lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
      result.user_id,
      result.lesson_id,
      result.term,
      result.normalized_term,
      CASE WHEN result.passed = 1 THEN 'reviewing' ELSE 'learning' END,
      0,
      strftime('%Y-%m-%dT%H:%M:%fZ', result.occurred_at, '+1 day'),
      result.total,
      result.occurred_at
    FROM word_assessment_results AS result
    WHERE NOT EXISTS (
      SELECT 1 FROM word_assessment_results AS newer
      WHERE newer.user_id = result.user_id
        AND newer.lesson_id = result.lesson_id
        AND newer.normalized_term = result.normalized_term
        AND newer.occurred_at > result.occurred_at
    )
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS word_review_attempts (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES word_review_states(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      meaning REAL NOT NULL,
      listening REAL NOT NULL,
      spelling REAL NOT NULL,
      context REAL NOT NULL,
      total REAL NOT NULL,
      passed INTEGER NOT NULL,
      decision TEXT NOT NULL,
      step_before INTEGER NOT NULL,
      step_after INTEGER NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_review_attempt_user_idx
    ON word_review_attempts(user_id, occurred_at)
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS word_review_attempt_state_idx
    ON word_review_attempts(review_id, occurred_at)
  `);
}
