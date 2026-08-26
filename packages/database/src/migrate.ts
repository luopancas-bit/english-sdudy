import { sql } from "drizzle-orm";
import type { Database } from "./index.js";

export async function migrate(database: Database): Promise<void> {
  await database.run(sql`PRAGMA journal_mode = WAL`);
  await database.run(sql`PRAGMA busy_timeout = 30000`);
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
    CREATE TABLE IF NOT EXISTS assessment_drafts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      current_index INTEGER NOT NULL DEFAULT 0,
      answers TEXT NOT NULL,
      recordings TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, lesson_id, kind)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS assessment_drafts_user_updated_idx
    ON assessment_drafts(user_id, updated_at)
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
    CREATE TABLE IF NOT EXISTS dictionary_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      format TEXT NOT NULL,
      license TEXT,
      priority INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'staging',
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(id, version)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS dictionary_source_status_idx
    ON dictionary_sources(status, priority)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS dictionary_entry_status_idx
    ON dictionary_entries(status, updated_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS dictionary_entry_sources (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES dictionary_sources(id) ON DELETE CASCADE,
      source_entry_key TEXT NOT NULL,
      definition TEXT,
      part_of_speech TEXT,
      raw_notation TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_id, source_entry_key)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS dictionary_entry_source_entry_idx
    ON dictionary_entry_sources(entry_id, source_id)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS dictionary_resources (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES dictionary_sources(id) ON DELETE CASCADE,
      resource_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source_id, resource_key)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS dictionary_resource_sha_idx
    ON dictionary_resources(sha256)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS pronunciations (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES dictionary_sources(id) ON DELETE CASCADE,
      accent TEXT NOT NULL,
      ipa TEXT,
      raw_phonetic TEXT,
      notation_system TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'pending',
      is_primary INTEGER NOT NULL DEFAULT 0,
      part_of_speech TEXT,
      audio_resource_id TEXT REFERENCES dictionary_resources(id) ON DELETE SET NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(entry_id, source_id, accent, ipa)
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS pronunciation_entry_accent_idx
    ON pronunciations(entry_id, accent, is_primary)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS dictionary_import_jobs (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES dictionary_sources(id) ON DELETE SET NULL,
      input_path TEXT NOT NULL,
      status TEXT NOT NULL,
      report TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS dictionary_import_status_idx
    ON dictionary_import_jobs(status, started_at)
  `);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS dictionary_conflicts (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `);
  await database.run(sql`
    CREATE INDEX IF NOT EXISTS dictionary_conflict_status_idx
    ON dictionary_conflicts(status, created_at)
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
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS reading_books (
      id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      visibility TEXT NOT NULL DEFAULT 'private', source_type TEXT NOT NULL, external_id TEXT,
      title TEXT NOT NULL, title_zh TEXT, author TEXT, author_zh TEXT, description TEXT,
      language TEXT NOT NULL DEFAULT 'en', format TEXT NOT NULL, original_filename TEXT,
      mime_type TEXT NOT NULL, storage_path TEXT, manifest_path TEXT, cover_path TEXT,
      byte_size INTEGER NOT NULL DEFAULT 0, derived_byte_size INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT, drm_status TEXT NOT NULL DEFAULT 'unknown', status TEXT NOT NULL DEFAULT 'queued',
      difficulty TEXT, cefr_hint TEXT, word_count INTEGER, chapter_count INTEGER NOT NULL DEFAULT 0,
      error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      UNIQUE(source_type, external_id)
    )
  `);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_books_owner_idx ON reading_books(owner_id, status, updated_at)`);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_books_visibility_idx ON reading_books(visibility, status, updated_at)`);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS reading_shelves (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES reading_books(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'unread', current_chapter INTEGER NOT NULL DEFAULT 0,
      current_offset INTEGER NOT NULL DEFAULT 0, progress REAL NOT NULL DEFAULT 0,
      furthest_progress REAL NOT NULL DEFAULT 0, preferences TEXT NOT NULL DEFAULT '{}',
      added_at TEXT NOT NULL, last_read_at TEXT, finished_at TEXT,
      UNIQUE(user_id, book_id)
    )
  `);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_shelves_recent_idx ON reading_shelves(user_id, last_read_at)`);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS reading_annotations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES reading_books(id) ON DELETE CASCADE,
      chapter_index INTEGER NOT NULL, kind TEXT NOT NULL, start_offset INTEGER NOT NULL DEFAULT 0,
      end_offset INTEGER NOT NULL DEFAULT 0, quote TEXT, note TEXT, color TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )
  `);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_annotations_user_book_idx ON reading_annotations(user_id, book_id, chapter_index)`);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS reading_vocabulary_sources (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES reading_books(id) ON DELETE CASCADE,
      chapter_index INTEGER NOT NULL, source_form TEXT NOT NULL, quote TEXT NOT NULL,
      start_offset INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      UNIQUE(user_id, entry_id, book_id, chapter_index, start_offset)
    )
  `);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_vocab_entry_idx ON reading_vocabulary_sources(user_id, entry_id, created_at)`);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS reading_import_jobs (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES reading_books(id) ON DELETE CASCADE,
      requested_by TEXT REFERENCES users(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER NOT NULL DEFAULT 0, worker_version TEXT, error_code TEXT,
      created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT
    )
  `);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_import_jobs_status_idx ON reading_import_jobs(status, created_at)`);
  await database.run(sql`
    CREATE TABLE IF NOT EXISTS reading_translation_usage (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sentence_hash TEXT NOT NULL, target_language TEXT NOT NULL DEFAULT 'zh-CN',
      translation TEXT NOT NULL, provider TEXT NOT NULL,
      model_version TEXT NOT NULL DEFAULT 'legacy',
      prompt_version TEXT NOT NULL DEFAULT 'reading-translation-v1',
      normalization_version TEXT NOT NULL DEFAULT 'legacy',
      input_length INTEGER NOT NULL DEFAULT 0,
      output_length INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      finish_reason TEXT,
      quality_status TEXT NOT NULL DEFAULT 'passed',
      occurred_at TEXT NOT NULL
    )
  `);
  await addColumnIfMissing(database, "reading_translation_usage", "model_version", "TEXT NOT NULL DEFAULT 'legacy'");
  await addColumnIfMissing(database, "reading_translation_usage", "prompt_version", "TEXT NOT NULL DEFAULT 'reading-translation-v1'");
  await addColumnIfMissing(database, "reading_translation_usage", "normalization_version", "TEXT NOT NULL DEFAULT 'legacy'");
  await addColumnIfMissing(database, "reading_translation_usage", "input_length", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(database, "reading_translation_usage", "output_length", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(database, "reading_translation_usage", "duration_ms", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(database, "reading_translation_usage", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(database, "reading_translation_usage", "finish_reason", "TEXT");
  await addColumnIfMissing(database, "reading_translation_usage", "quality_status", "TEXT NOT NULL DEFAULT 'passed'");
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_translation_user_date_idx ON reading_translation_usage(user_id, occurred_at)`);
  await database.run(sql`CREATE INDEX IF NOT EXISTS reading_translation_cache_idx ON reading_translation_usage(user_id, sentence_hash, target_language)`);
}

async function addColumnIfMissing(database: Database, table: string, column: string, definition: string): Promise<void> {
  const result = await database.$client.execute(`PRAGMA table_info(${table})`);
  const exists = result.rows.some((row) => Array.isArray(row) ? String(row[1]) === column : String((row as Record<string, unknown>).name) === column);
  if (exists) return;
  try {
    await database.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const message = `${String(error)} ${String(cause)}`.toLowerCase();
    if (!message.includes("duplicate column")) throw error;
  }
}
