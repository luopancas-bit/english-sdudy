import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    nickname: text("nickname").notNull(),
    role: text("role", { enum: ["learner", "admin"] }).notNull().default("learner"),
    dailyMinutes: integer("daily_minutes").notNull().default(25),
    preferredAccent: text("preferred_accent", { enum: ["us", "uk"] }).notNull().default("us"),
    reminderTime: text("reminder_time"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_username_unique").on(table.username)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    usedBy: text("used_by").references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("invitations_code_hash_unique").on(table.codeHash)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    kind: text("kind", { enum: ["formal", "practice", "review"] }).notNull(),
    listening: real("listening").notNull(),
    reading: real("reading").notNull(),
    speaking: real("speaking").notNull(),
    writing: real("writing").notNull(),
    total: real("total").notNull(),
    answerDetail: text("answer_detail", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("attempts_user_lesson_idx").on(table.userId, table.lessonId),
    index("attempts_occurred_at_idx").on(table.occurredAt),
  ],
);

export const recordings = sqliteTable(
  "recordings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    questionId: text("question_id").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("recordings_user_lesson_idx").on(table.userId, table.lessonId, table.createdAt),
  ],
);

export const assessmentDrafts = sqliteTable(
  "assessment_drafts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    kind: text("kind", { enum: ["formal", "practice", "review"] }).notNull(),
    currentIndex: integer("current_index").notNull().default(0),
    answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull(),
    recordings: text("recordings", { mode: "json" }).$type<Record<string, string>>().notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("assessment_drafts_user_lesson_kind_unique").on(table.userId, table.lessonId, table.kind),
    index("assessment_drafts_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const lessonMastery = sqliteTable(
  "lesson_mastery",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    score: real("score").notNull(),
    band: text("band").notNull(),
    listening: real("listening").notNull(),
    reading: real("reading").notNull(),
    speaking: real("speaking").notNull(),
    writing: real("writing").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("lesson_mastery_user_lesson_unique").on(table.userId, table.lessonId)],
);

export const reviewQueue = sqliteTable(
  "review_queue",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    step: integer("step").notNull(),
    dueAt: text("due_at").notNull(),
    consecutiveExcellent: integer("consecutive_excellent").notNull().default(0),
    weakDimensions: text("weak_dimensions", { mode: "json" }).$type<string[]>().notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_queue_user_lesson_unique").on(table.userId, table.lessonId),
    index("review_queue_due_at_idx").on(table.userId, table.dueAt),
  ],
);

export const wrongAnswers = sqliteTable(
  "wrong_answers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    questionId: text("question_id").notNull(),
    dimension: text("dimension").notNull(),
    lastAnswer: text("last_answer"),
    errorCount: integer("error_count").notNull().default(1),
    resolvedAt: text("resolved_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("wrong_answers_user_question_unique").on(table.userId, table.questionId),
    index("wrong_answers_user_idx").on(table.userId, table.resolvedAt),
  ],
);

export const dictionarySources = sqliteTable(
  "dictionary_sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    format: text("format", { enum: ["builtin", "mdx", "json", "api"] }).notNull(),
    license: text("license"),
    priority: integer("priority").notNull().default(100),
    status: text("status", { enum: ["staging", "active", "disabled"] }).notNull().default("staging"),
    importedAt: text("imported_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("dictionary_source_version_unique").on(table.id, table.version),
    index("dictionary_source_status_idx").on(table.status, table.priority),
  ],
);

export const dictionaryEntries = sqliteTable(
  "dictionary_entries",
  {
    id: text("id").primaryKey(),
    term: text("term").notNull(),
    normalizedTerm: text("normalized_term").notNull(),
    status: text("status", { enum: ["verified", "pending", "ambiguous"] }).notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("dictionary_entry_normalized_unique").on(table.normalizedTerm),
    index("dictionary_entry_status_idx").on(table.status, table.updatedAt),
  ],
);

export const dictionaryEntrySources = sqliteTable(
  "dictionary_entry_sources",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull().references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => dictionarySources.id, { onDelete: "cascade" }),
    sourceEntryKey: text("source_entry_key").notNull(),
    definition: text("definition"),
    partOfSpeech: text("part_of_speech"),
    rawNotation: text("raw_notation"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("dictionary_entry_source_key_unique").on(table.sourceId, table.sourceEntryKey),
    index("dictionary_entry_source_entry_idx").on(table.entryId, table.sourceId),
  ],
);

export const dictionaryResources = sqliteTable(
  "dictionary_resources",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => dictionarySources.id, { onDelete: "cascade" }),
    resourceKey: text("resource_key").notNull(),
    kind: text("kind", { enum: ["audio", "image", "font"] }).notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("dictionary_resource_source_key_unique").on(table.sourceId, table.resourceKey),
    index("dictionary_resource_sha_idx").on(table.sha256),
  ],
);

export const pronunciations = sqliteTable(
  "pronunciations",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull().references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => dictionarySources.id, { onDelete: "cascade" }),
    accent: text("accent", { enum: ["us", "uk"] }).notNull(),
    ipa: text("ipa"),
    rawPhonetic: text("raw_phonetic"),
    notationSystem: text("notation_system", { enum: ["ipa", "dj", "kk", "unknown"] }).notNull().default("unknown"),
    status: text("status", { enum: ["verified", "pending", "ambiguous"] }).notNull().default("pending"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    partOfSpeech: text("part_of_speech"),
    audioResourceId: text("audio_resource_id").references(() => dictionaryResources.id, { onDelete: "set null" }),
    verifiedAt: text("verified_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("pronunciation_source_value_unique").on(table.entryId, table.sourceId, table.accent, table.ipa),
    index("pronunciation_entry_accent_idx").on(table.entryId, table.accent, table.isPrimary),
  ],
);

export const dictionaryImportJobs = sqliteTable(
  "dictionary_import_jobs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").references(() => dictionarySources.id, { onDelete: "set null" }),
    inputPath: text("input_path").notNull(),
    status: text("status", { enum: ["scanning", "ready", "published", "failed", "rolled_back"] }).notNull(),
    report: text("report", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [index("dictionary_import_status_idx").on(table.status, table.startedAt)],
);

export const dictionaryConflicts = sqliteTable(
  "dictionary_conflicts",
  {
    id: text("id").primaryKey(),
    entryId: text("entry_id").notNull().references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["phonetic", "definition", "resource"] }).notNull(),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["open", "resolved", "ignored"] }).notNull().default("open"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [index("dictionary_conflict_status_idx").on(table.status, table.createdAt)],
);

export const vocabularyEntries = sqliteTable(
  "vocabulary_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    normalizedTerm: text("normalized_term").notNull(),
    meaning: text("meaning").notNull(),
    example: text("example"),
    lessonId: integer("lesson_id"),
    status: text("status", { enum: ["learning", "mastered"] }).notNull().default("learning"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("vocabulary_user_normalized_unique").on(table.userId, table.normalizedTerm),
    index("vocabulary_user_status_idx").on(table.userId, table.status, table.updatedAt),
  ],
);

export const vocabularyTrainingAttempts = sqliteTable(
  "vocabulary_training_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: text("entry_id").notNull().references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["guided", "dictation"] }).notNull(),
    firstTryCorrect: integer("first_try_correct", { mode: "boolean" }).notNull(),
    correctionCount: integer("correction_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("vocabulary_training_user_idx").on(table.userId, table.occurredAt),
    index("vocabulary_training_entry_idx").on(table.userId, table.entryId, table.occurredAt),
  ],
);

export const readingBooks = sqliteTable(
  "reading_books",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility", { enum: ["private", "curated", "public"] }).notNull().default("private"),
    sourceType: text("source_type", { enum: ["upload", "gutenberg", "builtin"] }).notNull(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    titleZh: text("title_zh"),
    author: text("author"),
    authorZh: text("author_zh"),
    description: text("description"),
    language: text("language").notNull().default("en"),
    format: text("format").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type").notNull(),
    storagePath: text("storage_path"),
    manifestPath: text("manifest_path"),
    coverPath: text("cover_path"),
    byteSize: integer("byte_size").notNull().default(0),
    derivedByteSize: integer("derived_byte_size").notNull().default(0),
    sha256: text("sha256"),
    drmStatus: text("drm_status", { enum: ["none", "protected", "unknown"] }).notNull().default("unknown"),
    status: text("status", { enum: ["queued", "processing", "ready", "protected", "failed", "deleted"] }).notNull().default("queued"),
    difficulty: text("difficulty", { enum: ["entry", "intermediate", "challenge"] }),
    cefrHint: text("cefr_hint"),
    wordCount: integer("word_count"),
    chapterCount: integer("chapter_count").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("reading_books_owner_idx").on(table.ownerId, table.status, table.updatedAt),
    uniqueIndex("reading_books_external_unique").on(table.sourceType, table.externalId),
    index("reading_books_visibility_idx").on(table.visibility, table.status, table.updatedAt),
  ],
);

export const readingShelves = sqliteTable(
  "reading_shelves",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bookId: text("book_id").notNull().references(() => readingBooks.id, { onDelete: "cascade" }),
    state: text("state", { enum: ["unread", "reading", "finished", "archived"] }).notNull().default("unread"),
    currentChapter: integer("current_chapter").notNull().default(0),
    currentOffset: integer("current_offset").notNull().default(0),
    progress: real("progress").notNull().default(0),
    furthestProgress: real("furthest_progress").notNull().default(0),
    preferences: text("preferences", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    addedAt: text("added_at").notNull(),
    lastReadAt: text("last_read_at"),
    finishedAt: text("finished_at"),
  },
  (table) => [
    uniqueIndex("reading_shelves_user_book_unique").on(table.userId, table.bookId),
    index("reading_shelves_recent_idx").on(table.userId, table.lastReadAt),
  ],
);

export const readingAnnotations = sqliteTable(
  "reading_annotations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bookId: text("book_id").notNull().references(() => readingBooks.id, { onDelete: "cascade" }),
    chapterIndex: integer("chapter_index").notNull(),
    kind: text("kind", { enum: ["bookmark", "highlight", "note", "translation"] }).notNull(),
    startOffset: integer("start_offset").notNull().default(0),
    endOffset: integer("end_offset").notNull().default(0),
    quote: text("quote"),
    note: text("note"),
    color: text("color"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("reading_annotations_user_book_idx").on(table.userId, table.bookId, table.chapterIndex)],
);

export const readingVocabularySources = sqliteTable(
  "reading_vocabulary_sources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: text("entry_id").notNull().references(() => vocabularyEntries.id, { onDelete: "cascade" }),
    bookId: text("book_id").notNull().references(() => readingBooks.id, { onDelete: "cascade" }),
    chapterIndex: integer("chapter_index").notNull(),
    sourceForm: text("source_form").notNull(),
    quote: text("quote").notNull(),
    startOffset: integer("start_offset").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("reading_vocab_source_unique").on(table.userId, table.entryId, table.bookId, table.chapterIndex, table.startOffset),
    index("reading_vocab_entry_idx").on(table.userId, table.entryId, table.createdAt),
  ],
);

export const readingImportJobs = sqliteTable(
  "reading_import_jobs",
  {
    id: text("id").primaryKey(),
    bookId: text("book_id").notNull().references(() => readingBooks.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["queued", "processing", "ready", "failed", "cancelled"] }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    workerVersion: text("worker_version"),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (table) => [index("reading_import_jobs_status_idx").on(table.status, table.createdAt)],
);

export const readingTranslationUsage = sqliteTable(
  "reading_translation_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sentenceHash: text("sentence_hash").notNull(),
    targetLanguage: text("target_language").notNull().default("zh-CN"),
    translation: text("translation").notNull(),
    provider: text("provider").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("reading_translation_user_date_idx").on(table.userId, table.occurredAt),
    index("reading_translation_cache_idx").on(table.userId, table.sentenceHash, table.targetLanguage),
  ],
);

export const wordMemoryTrainingAttempts = sqliteTable(
  "word_memory_training_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    itemType: text("item_type", { enum: ["word", "sentence"] }).notNull(),
    itemKey: text("item_key").notNull(),
    mode: text("mode", { enum: ["guided", "dictation"] }).notNull(),
    firstTryCorrect: integer("first_try_correct", { mode: "boolean" }).notNull(),
    correctionCount: integer("correction_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    device: text("device", { enum: ["desktop", "mobile"] }).notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("word_memory_training_user_idx").on(table.userId, table.occurredAt),
    index("word_memory_training_lesson_idx").on(table.userId, table.lessonId, table.occurredAt),
  ],
);

export const wordAssessmentResults = sqliteTable(
  "word_assessment_results",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    term: text("term").notNull(),
    normalizedTerm: text("normalized_term").notNull(),
    meaning: real("meaning").notNull(),
    listening: real("listening").notNull(),
    spelling: real("spelling").notNull(),
    context: real("context").notNull(),
    total: real("total").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("word_assessment_user_idx").on(table.userId, table.occurredAt),
    index("word_assessment_term_idx").on(table.userId, table.lessonId, table.normalizedTerm, table.occurredAt),
  ],
);

export const wordReviewStates = sqliteTable(
  "word_review_states",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    term: text("term").notNull(),
    normalizedTerm: text("normalized_term").notNull(),
    status: text("status", { enum: ["learning", "reviewing", "mastered"] }).notNull(),
    step: integer("step").notNull(),
    dueAt: text("due_at").notNull(),
    lastScore: real("last_score").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("word_review_user_term_unique").on(table.userId, table.lessonId, table.normalizedTerm),
    index("word_review_due_idx").on(table.userId, table.dueAt),
  ],
);

export const wordReviewAttempts = sqliteTable(
  "word_review_attempts",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull().references(() => wordReviewStates.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull(),
    term: text("term").notNull(),
    normalizedTerm: text("normalized_term").notNull(),
    meaning: real("meaning").notNull(),
    listening: real("listening").notNull(),
    spelling: real("spelling").notNull(),
    context: real("context").notNull(),
    total: real("total").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    decision: text("decision", { enum: ["advance", "retreat", "master"] }).notNull(),
    stepBefore: integer("step_before").notNull(),
    stepAfter: integer("step_after").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("word_review_attempt_user_idx").on(table.userId, table.occurredAt),
    index("word_review_attempt_state_idx").on(table.reviewId, table.occurredAt),
  ],
);
