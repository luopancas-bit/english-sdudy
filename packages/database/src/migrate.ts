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
}
