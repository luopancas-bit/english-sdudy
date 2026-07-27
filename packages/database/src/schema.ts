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
