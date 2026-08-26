import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, gte } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  readingAnnotations,
  readingBooks,
  readingImportJobs,
  readingShelves,
  readingTranslationUsage,
  readingVocabularySources,
  type Database,
} from "@zhuguang/database";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { LearningRepository } from "./repository.js";
import { buildReadingManifest, sanitizeReadingText } from "./reading-content.js";
import {
  assessTranslationQuality,
  extractTranslationText,
  normalizeTranslationInput,
  READING_TRANSLATION_NORMALIZATION_VERSION,
  READING_TRANSLATION_PROMPT_VERSION,
  READING_TRANSLATION_SYSTEM_PROMPT,
} from "./reading-translation.js";

type SessionUser = { id: string; role: string };
type RequireUser = (request: FastifyRequest, reply: FastifyReply) => Promise<SessionUser | null | undefined>;
type Manifest = ReturnType<typeof buildReadingManifest>;

const allowedFormats = new Set(["epub", "pdf", "txt", "mobi", "azw", "azw3", "fb2", "html", "htm", "md", "markdown", "docx", "rtf"]);
const progressSchema = z.object({
  chapterIndex: z.number().int().min(0),
  offset: z.number().int().min(0).default(0),
  progress: z.number().min(0).max(100),
  preferences: z.record(z.string(), z.unknown()).optional(),
});
const annotationSchema = z.object({
  chapterIndex: z.number().int().min(0), kind: z.enum(["bookmark", "highlight", "note", "translation"]),
  startOffset: z.number().int().min(0).default(0), endOffset: z.number().int().min(0).default(0),
  quote: z.string().max(2_000).nullable().optional(), note: z.string().max(10_000).nullable().optional(), color: z.string().max(24).nullable().optional(),
});
const lookupSchema = z.object({ term: z.string().trim().min(1).max(120) });
const translateSchema = z.object({ text: z.string().trim().min(1).max(2_000), targetLanguage: z.literal("zh-CN").default("zh-CN") });
const vocabularySourceSchema = z.object({
  term: z.string().trim().min(1).max(120), meaning: z.string().trim().min(1).max(240),
  bookId: z.string().uuid(), chapterIndex: z.number().int().min(0), sourceForm: z.string().trim().min(1).max(120),
  quote: z.string().trim().min(1).max(2_000), startOffset: z.number().int().min(0).default(0),
});
const catalogBookSchema = z.object({
  id: z.string().regex(/^\d{1,8}$/),
  title: z.string().trim().min(1).max(240),
  author: z.string().trim().max(180).nullable().optional(),
});

export async function registerReadingRoutes(app: FastifyInstance, input: {
  config: AppConfig; database: Database; requireUser: RequireUser; repository: LearningRepository;
  loadPronunciations: (terms: string[]) => Promise<Map<string, unknown>>;
}) {
  const { config, database, requireUser, repository, loadPronunciations } = input;
  if (!config.READING_ENABLED) return;
  await fs.mkdir(config.READING_DIR, { recursive: true });
  await seedCuratedBooks(database);

  app.get("/api/reading/library", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const [books, shelves] = await Promise.all([
      database.query.readingBooks.findMany({ orderBy: [desc(readingBooks.updatedAt)] }),
      database.query.readingShelves.findMany({ where: eq(readingShelves.userId, user.id) }),
    ]);
    const shelf = new Map(shelves.map((row) => [row.bookId, row]));
    const visible = books.filter((book) => book.status !== "deleted" && (book.ownerId === user.id || book.visibility !== "private"));
    const usedBytes = visible.filter((book) => book.ownerId === user.id).reduce((sum, book) => sum + book.byteSize + book.derivedByteSize, 0);
    return {
      enabled: true,
      uploadEnabled: config.READING_UPLOAD_ENABLED,
      quota: { books: visible.filter((book) => book.ownerId === user.id).length, maxBooks: config.READING_MAX_USER_BOOKS, bytes: usedBytes, maxBytes: config.READING_MAX_USER_BYTES },
      books: visible.map((book) => publicBook(book, shelf.get(book.id))),
      continueReading: visible.map((book) => ({ book, shelf: shelf.get(book.id) })).filter((item) => item.shelf?.lastReadAt).sort((a, b) => b.shelf!.lastReadAt!.localeCompare(a.shelf!.lastReadAt!))[0]?.book.id ?? null,
      role: user.role,
    };
  });

  app.post("/api/reading/books", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    if (!config.READING_UPLOAD_ENABLED) return reply.code(503).send({ error: "书籍上传暂时关闭" });
    const body = request.body as Buffer;
    const filename = decodeURIComponent(String(request.headers["x-book-filename"] ?? "book.txt")).slice(0, 240);
    const format = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedFormats.has(format)) return reply.code(415).send({ error: "暂不支持这种书籍格式" });
    if (!Buffer.isBuffer(body) || !body.length) return reply.code(400).send({ error: "书籍文件为空" });
    if (body.length > config.READING_MAX_BOOK_BYTES) return reply.code(413).send({ error: "单本书籍不能超过 300 MB" });
    const owned = await database.query.readingBooks.findMany({ where: eq(readingBooks.ownerId, user.id) });
    const used = owned.reduce((sum, book) => sum + book.byteSize + book.derivedByteSize, 0);
    if (owned.filter((book) => book.status !== "deleted").length >= config.READING_MAX_USER_BOOKS || used + body.length > config.READING_MAX_USER_BYTES) {
      return reply.code(409).send({ error: "个人书架额度不足" });
    }
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const directory = path.join(config.READING_DIR, "private", user.id, id);
    await fs.mkdir(directory, { recursive: true });
    const originalPath = path.join(directory, `original.${safeExtension(format)}`);
    await fs.writeFile(originalPath, body, { mode: 0o600 });
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    const immediate = ["txt", "md", "markdown", "html", "htm", "rtf"].includes(format);
    const title = filename.replace(/\.[^.]+$/, "") || "未命名书籍";
    const book = { id, ownerId: user.id, visibility: "private" as const, sourceType: "upload" as const, externalId: null, title, titleZh: null, author: null, authorZh: null, description: null, language: "en", format, originalFilename: filename, mimeType: String(request.headers["content-type"] ?? "application/x-ebook"), storagePath: relativeReadingPath(config.READING_DIR, originalPath), manifestPath: null, coverPath: null, byteSize: body.length, derivedByteSize: 0, sha256, drmStatus: "unknown" as const, status: immediate ? "processing" as const : "queued" as const, difficulty: null, cefrHint: null, wordCount: null, chapterCount: 0, errorCode: null, createdAt: now, updatedAt: now, deletedAt: null };
    await database.insert(readingBooks).values(book);
    await database.insert(readingShelves).values({ userId: user.id, bookId: id, preferences: defaultPreferences(), addedAt: now });
    const jobId = crypto.randomUUID();
    await database.insert(readingImportJobs).values({ id: jobId, bookId: id, requestedBy: user.id, status: immediate ? "processing" : "queued", progress: immediate ? 20 : 0, createdAt: now, startedAt: immediate ? now : null });
    if (immediate) await processTextBook(database, config.READING_DIR, book, body, jobId);
    return reply.code(201).send({ id, status: immediate ? "ready" : "queued" });
  });

  app.get("/api/reading/books/:bookId", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { bookId } = z.object({ bookId: z.string().uuid() }).parse(request.params);
    const book = await accessibleBook(database, user.id, bookId); if (!book) return reply.code(404).send({ error: "书籍不存在" });
    const shelf = await ensureShelf(database, user.id, bookId);
    const annotations = await database.query.readingAnnotations.findMany({ where: and(eq(readingAnnotations.userId, user.id), eq(readingAnnotations.bookId, bookId)), orderBy: [desc(readingAnnotations.updatedAt)] });
    return { book: publicBook(book, shelf), annotations, manifest: book.manifestPath ? await readManifest(config.READING_DIR, book.manifestPath) : null };
  });

  app.get("/api/reading/books/:bookId/chapters/:chapterIndex", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { bookId, chapterIndex } = z.object({ bookId: z.string().uuid(), chapterIndex: z.coerce.number().int().min(0) }).parse(request.params);
    const book = await accessibleBook(database, user.id, bookId); if (!book?.manifestPath) return reply.code(404).send({ error: "书籍尚未解析完成" });
    const manifest = await readManifest(config.READING_DIR, book.manifestPath); const chapter = manifest.chapters[chapterIndex];
    return chapter ? { index: chapterIndex, ...chapter } : reply.code(404).send({ error: "章节不存在" });
  });

  app.patch("/api/reading/books/:bookId/progress", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { bookId } = z.object({ bookId: z.string().uuid() }).parse(request.params); if (!await accessibleBook(database, user.id, bookId)) return reply.code(404).send({ error: "书籍不存在" });
    const body = progressSchema.parse(request.body); const current = await ensureShelf(database, user.id, bookId); const now = new Date().toISOString();
    await database.update(readingShelves).set({ state: body.progress >= 99 ? "finished" : "reading", currentChapter: body.chapterIndex, currentOffset: body.offset, progress: body.progress, furthestProgress: Math.max(current.furthestProgress, body.progress), preferences: body.preferences ?? current.preferences, lastReadAt: now, finishedAt: body.progress >= 99 ? now : current.finishedAt }).where(and(eq(readingShelves.userId, user.id), eq(readingShelves.bookId, bookId)));
    return { ok: true, lastReadAt: now };
  });

  app.post("/api/reading/books/:bookId/annotations", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { bookId } = z.object({ bookId: z.string().uuid() }).parse(request.params); if (!await accessibleBook(database, user.id, bookId)) return reply.code(404).send({ error: "书籍不存在" });
    const body = annotationSchema.parse(request.body); const now = new Date().toISOString(); const annotation = { id: crypto.randomUUID(), userId: user.id, bookId, ...body, quote: body.quote ?? null, note: body.note ?? null, color: body.color ?? null, createdAt: now, updatedAt: now };
    await database.insert(readingAnnotations).values(annotation); return reply.code(201).send(annotation);
  });

  app.delete("/api/reading/annotations/:annotationId", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { annotationId } = z.object({ annotationId: z.string().uuid() }).parse(request.params);
    await database.delete(readingAnnotations).where(and(eq(readingAnnotations.id, annotationId), eq(readingAnnotations.userId, user.id))); return { ok: true };
  });

  app.post("/api/reading/lookup", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { term } = lookupSchema.parse(request.body); const lemma = inferLemma(term); const pronunciation = await loadPronunciations([lemma]);
    let meanings: Array<{ partOfSpeech: string | null; definition: string }> = [];
    try { const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lemma)}`, { signal: AbortSignal.timeout(4_000) }); if (response.ok) { const rows = await response.json() as Array<{ meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }> }>; meanings = (rows[0]?.meanings ?? []).flatMap((item) => (item.definitions ?? []).slice(0, 2).map((definition) => ({ partOfSpeech: item.partOfSpeech ?? null, definition: definition.definition ?? "" }))).filter((item) => item.definition).slice(0, 6); } } catch { /* local pronunciation remains usable */ }
    return { term, lemma, pronunciation: pronunciation.get(lemma.toLowerCase()) ?? null, meanings, source: meanings.length ? "Free Dictionary API" : "local" };
  });

  app.post("/api/reading/vocabulary-sources", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const body = vocabularySourceSchema.parse(request.body); if (!await accessibleBook(database, user.id, body.bookId)) return reply.code(404).send({ error: "书籍不存在" });
    const normalizedTerm = body.term.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
    const entry = await repository.saveVocabularyEntry({ userId: user.id, term: body.term, normalizedTerm, meaning: body.meaning, example: body.quote, lessonId: null });
    if (!entry) return reply.code(500).send({ error: "生词保存失败" });
    await database.insert(readingVocabularySources).values({ id: crypto.randomUUID(), userId: user.id, entryId: entry.id, bookId: body.bookId, chapterIndex: body.chapterIndex, sourceForm: body.sourceForm, quote: body.quote, startOffset: body.startOffset, createdAt: new Date().toISOString() }).onConflictDoNothing();
    return reply.code(201).send({ entryId: entry.id, alreadyExisted: entry.createdAt !== entry.updatedAt });
  });

  app.post("/api/reading/translate", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const body = translateSchema.parse(request.body); const text = normalizeTranslationInput(body.text);
    const hash = crypto.createHash("sha256").update([config.TRANSLATION_MODEL, READING_TRANSLATION_PROMPT_VERSION, READING_TRANSLATION_NORMALIZATION_VERSION, body.targetLanguage, text].join("\0")).digest("hex");
    const cached = await database.query.readingTranslationUsage.findFirst({ where: and(eq(readingTranslationUsage.userId, user.id), eq(readingTranslationUsage.sentenceHash, hash), eq(readingTranslationUsage.targetLanguage, body.targetLanguage), eq(readingTranslationUsage.provider, config.TRANSLATION_MODEL), eq(readingTranslationUsage.modelVersion, config.TRANSLATION_MODEL), eq(readingTranslationUsage.promptVersion, READING_TRANSLATION_PROMPT_VERSION), eq(readingTranslationUsage.normalizationVersion, READING_TRANSLATION_NORMALIZATION_VERSION), eq(readingTranslationUsage.qualityStatus, "passed")), orderBy: [desc(readingTranslationUsage.occurredAt)] });
    const today = new Date(); today.setHours(0, 0, 0, 0); const usage = await database.query.readingTranslationUsage.findMany({ where: and(eq(readingTranslationUsage.userId, user.id), gte(readingTranslationUsage.occurredAt, today.toISOString())) });
    if (cached) return { translation: cached.translation, cached: true, remaining: Math.max(0, config.READING_TRANSLATION_DAILY_LIMIT - usage.length) };
    if (usage.length >= config.READING_TRANSLATION_DAILY_LIMIT) return reply.code(429).send({ error: "今天的整句翻译次数已经用完" });
    if (!config.TRANSLATION_BASE_URL || !config.TRANSLATION_API_KEY) return reply.code(503).send({ error: "整句翻译服务尚未配置" });
    let lastQualityReason = "";
    const startedAt = Date.now();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await requestTranslation(config, text, attempt === 1);
        const quality = assessTranslationQuality(text, result.translation, result.finishReason);
        if (!quality.ok) { lastQualityReason = quality.reason; continue; }
        await database.insert(readingTranslationUsage).values({ id: crypto.randomUUID(), userId: user.id, sentenceHash: hash, targetLanguage: body.targetLanguage, translation: result.translation, provider: config.TRANSLATION_MODEL, modelVersion: config.TRANSLATION_MODEL, promptVersion: READING_TRANSLATION_PROMPT_VERSION, normalizationVersion: READING_TRANSLATION_NORMALIZATION_VERSION, inputLength: text.length, outputLength: result.translation.length, durationMs: Date.now() - startedAt, retryCount: attempt, finishReason: result.finishReason ?? null, qualityStatus: "passed", occurredAt: new Date().toISOString() });
        return { translation: result.translation, cached: false, remaining: config.READING_TRANSLATION_DAILY_LIMIT - usage.length - 1 };
      } catch { if (attempt === 1) return reply.code(502).send({ error: "翻译服务暂时不可用" }); }
    }
    return reply.code(502).send({ error: lastQualityReason === "fragment" ? "请选择完整句子后再翻译" : "翻译结果未通过质量检查，请重新选择完整句子" });
  });

  app.get("/api/reading/catalog/search", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(request.query);
    const response = await fetch(`https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(q)}`, { headers: { "User-Agent": "ZhuguangEnglish/2.0 (educational reader)" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return reply.code(502).send({ error: "在线书库暂时不可用" });
    return { books: parseGutenbergOpds(await response.text()) };
  });

  app.post("/api/reading/catalog/books", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return;
    const input = catalogBookSchema.parse(request.body); const now = new Date().toISOString();
    const metadata = await openLibraryMetadata(input.title, input.author ?? null);
    const curated = CURATED_BOOKS.find((item) => item.externalId === input.id);
    const bookId = stableUuid(`gutenberg:${input.id}`);
    await database.insert(readingBooks).values({
      id: bookId, ownerId: null, visibility: curated ? "curated" : "public", sourceType: curated ? "builtin" : "gutenberg", externalId: input.id,
      title: metadata?.title ?? input.title, titleZh: null, author: metadata?.author ?? input.author ?? null, authorZh: null,
      description: metadata?.description ?? "由读者从 Project Gutenberg 公版书库加入。", language: "en", format: "epub",
      originalFilename: null, mimeType: "application/epub+zip", storagePath: null, manifestPath: null,
      coverPath: null, byteSize: 0, derivedByteSize: 0, sha256: null, drmStatus: "none", status: "queued",
      difficulty: null, cefrHint: null, wordCount: null, chapterCount: 0, errorCode: null,
      createdAt: now, updatedAt: now, deletedAt: null,
    }).onConflictDoNothing();
    await database.insert(readingImportJobs).values({
      id: stableUuid(`gutenberg-job:${input.id}`), bookId, requestedBy: user.id, status: "queued",
      progress: 0, createdAt: now, startedAt: null, completedAt: null,
    }).onConflictDoNothing();
    const shelf = await ensureShelf(database, user.id, bookId);
    const book = await database.query.readingBooks.findFirst({ where: eq(readingBooks.id, bookId) });
    return reply.code(201).send({ book: book ? publicBook(book, shelf) : null });
  });

  app.get("/api/reading/admin/jobs", async (request, reply) => {
    const user = await requireUser(request, reply); if (!user) return; if (user.role !== "admin") return reply.code(403).send({ error: "需要管理员权限" });
    return { jobs: await database.query.readingImportJobs.findMany({ orderBy: [desc(readingImportJobs.createdAt)], limit: 100 }) };
  });
}

async function seedCuratedBooks(database: Database) {
  const now = new Date().toISOString();
  for (const item of CURATED_BOOKS) {
    await database.insert(readingBooks).values({ id: item.id, ownerId: null, visibility: "curated", sourceType: "builtin", externalId: item.externalId, title: item.title, titleZh: item.titleZh, author: item.author, authorZh: null, description: item.description, language: "en", format: "epub", originalFilename: null, mimeType: "application/epub+zip", storagePath: null, manifestPath: null, coverPath: null, byteSize: 0, derivedByteSize: 0, sha256: null, drmStatus: "none", status: "queued", difficulty: item.difficulty, cefrHint: item.cefrHint, wordCount: null, chapterCount: 0, errorCode: null, createdAt: now, updatedAt: now, deletedAt: null }).onConflictDoNothing();
    const existing = await database.query.readingBooks.findFirst({ where: eq(readingBooks.id, item.id) });
    if (existing && (existing.sourceType !== "builtin" || existing.status !== "ready" || !existing.manifestPath)) {
      await database.update(readingBooks).set({ visibility: "curated", sourceType: "builtin", externalId: item.externalId, title: item.title, titleZh: item.titleZh, author: item.author, description: item.description, storagePath: null, manifestPath: null, byteSize: 0, derivedByteSize: 0, sha256: null, drmStatus: "none", status: "queued", errorCode: null, updatedAt: now }).where(eq(readingBooks.id, item.id));
    }
  }
}

async function processTextBook(database: Database, root: string, book: typeof readingBooks.$inferInsert, body: Buffer, jobId: string) {
  const text = sanitizeReadingText(stripMarkup(body.toString("utf8")), book.sourceType); const manifest = buildReadingManifest(book.title, text); const manifestPath = path.join(path.dirname(path.join(root, book.storagePath!)), "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 }); const now = new Date().toISOString();
  await database.update(readingBooks).set({ manifestPath: relativeReadingPath(root, manifestPath), status: "ready", drmStatus: "none", wordCount: text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0, chapterCount: manifest.chapters.length, derivedByteSize: Buffer.byteLength(JSON.stringify(manifest)), updatedAt: now }).where(eq(readingBooks.id, book.id!));
  await database.update(readingImportJobs).set({ status: "ready", progress: 100, workerVersion: "inline-text-v1", completedAt: now }).where(eq(readingImportJobs.id, jobId));
}

function stripMarkup(value: string) { return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/[ \t]+/g, " "); }
async function readManifest(root: string, relative: string) { return JSON.parse(await fs.readFile(path.resolve(root, relative), "utf8")) as Manifest; }
async function requestTranslation(config: AppConfig, text: string, retry: boolean): Promise<{ translation: string; finishReason?: string }> {
  const response = await fetch(`${config.TRANSLATION_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.TRANSLATION_API_KEY!}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.TRANSLATION_MODEL,
      temperature: 0,
      max_tokens: Math.min(2_048, Math.max(128, Math.ceil(text.length * 1.5))),
      messages: [
        { role: "system", content: retry ? `${READING_TRANSLATION_SYSTEM_PROMPT} This is a retry: check that the result is complete Chinese and has no English tail.` : READING_TRANSLATION_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`translation_${response.status}`);
  const result = await response.json() as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> };
  const choice = result.choices?.[0]; const translation = extractTranslationText(choice?.message?.content).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!translation) throw new Error("translation_empty");
  return choice?.finish_reason ? { translation, finishReason: choice.finish_reason } : { translation };
}
async function accessibleBook(database: Database, userId: string, bookId: string) { const book = await database.query.readingBooks.findFirst({ where: eq(readingBooks.id, bookId) }); return book && (book.ownerId === userId || book.visibility !== "private") && book.status !== "deleted" ? book : undefined; }
async function ensureShelf(database: Database, userId: string, bookId: string) { const existing = await database.query.readingShelves.findFirst({ where: and(eq(readingShelves.userId, userId), eq(readingShelves.bookId, bookId)) }); if (existing) return existing; const row = { userId, bookId, state: "unread" as const, currentChapter: 0, currentOffset: 0, progress: 0, furthestProgress: 0, preferences: defaultPreferences(), addedAt: new Date().toISOString(), lastReadAt: null, finishedAt: null }; await database.insert(readingShelves).values(row); return row; }
function publicBook(book: typeof readingBooks.$inferSelect, shelf?: typeof readingShelves.$inferSelect) { return { id: book.id, externalId: book.externalId, title: book.title, titleZh: book.titleZh, author: book.author, description: book.description, language: book.language, format: book.format, visibility: book.visibility, sourceType: book.sourceType, status: book.status, difficulty: book.difficulty, cefrHint: book.cefrHint, wordCount: book.wordCount, chapterCount: book.chapterCount, byteSize: book.byteSize + book.derivedByteSize, drmStatus: book.drmStatus, shelved: Boolean(shelf), progress: shelf?.progress ?? 0, furthestProgress: shelf?.furthestProgress ?? 0, currentChapter: shelf?.currentChapter ?? 0, preferences: shelf?.preferences ?? defaultPreferences(), lastReadAt: shelf?.lastReadAt ?? null }; }
function defaultPreferences() { return { mode: "scroll", fontScale: 1, lineHeight: 1.9, theme: "paper", publisherStyles: false }; }
function relativeReadingPath(root: string, absolute: string) { return path.relative(path.resolve(root), absolute); }
function safeExtension(value: string) { return value.replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin"; }
function inferLemma(value: string) { const term = value.toLocaleLowerCase("en-US").replace(/^[^a-z]+|[^a-z]+$/g, ""); const irregular: Record<string, string> = { went: "go", gone: "go", children: "child", mice: "mouse", better: "good", best: "good", located: "locate", created: "create", stated: "state" }; if (irregular[term]) return irregular[term]; if (term.endsWith("ies") && term.length > 4) return `${term.slice(0, -3)}y`; if (term.endsWith("ing") && term.length > 5) return term.slice(0, -3).replace(/(.)\1$/, "$1"); if (term.endsWith("ed") && term.length > 4) { const base = term.slice(0, -2); return base.endsWith("at") || base.endsWith("it") ? `${base}e` : base; } if (term.endsWith("s") && !term.endsWith("ss") && term.length > 3) return term.slice(0, -1); return term; }
function parseGutenbergOpds(xml: string) { return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).slice(0, 30).map((match) => { const entry = match[1] ?? ""; const id = entry.match(/<id>[^<]*ebooks\/(\d+)<\/id>/)?.[1] ?? entry.match(/\/ebooks\/(\d+)/)?.[1] ?? ""; const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""); const author = decodeXml(entry.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? ""); const downloadUrl = entry.match(/<link[^>]+type="application\/epub\+zip"[^>]+href="([^"]+)"/)?.[1] ?? null; return { id, title, author, downloadUrl: downloadUrl ? decodeXml(downloadUrl) : null, sourceUrl: id ? `https://www.gutenberg.org/ebooks/${id}` : null }; }).filter((item) => item.id && item.title); }
function decodeXml(value: string) { return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim(); }
async function openLibraryMetadata(title: string, author: string | null) { try { const query = new URLSearchParams({ title, limit: "1", fields: "title,author_name,first_publish_year" }); if (author) query.set("author", author); const response = await fetch(`https://openlibrary.org/search.json?${query}`, { headers: { "User-Agent": "ZhuguangEnglish/2.0 (educational reader)" }, signal: AbortSignal.timeout(6_000) }); if (!response.ok) return null; const result = await response.json() as { docs?: Array<{ title?: string; author_name?: string[]; first_publish_year?: number }> }; const row = result.docs?.[0]; if (!row) return null; return { title: row.title?.trim() || title, author: row.author_name?.[0]?.trim() || author, description: row.first_publish_year ? `Open Library 元数据：首次出版于 ${row.first_publish_year} 年。` : "元数据来自 Open Library。" }; } catch { return null; } }

const CURATED_BOOKS = ([
  ["14838", "The Tale of Peter Rabbit", "彼得兔的故事", "Beatrix Potter", "entry", "A2–B1"], ["55", "The Wonderful Wizard of Oz", "绿野仙踪", "L. Frank Baum", "entry", "A2–B1"], ["7256", "The Gift of the Magi", "麦琪的礼物", "O. Henry", "entry", "B1"], ["43", "The Strange Case of Dr. Jekyll and Mr. Hyde", "化身博士", "Robert Louis Stevenson", "entry", "B1"],
  ["1661", "The Adventures of Sherlock Holmes", "福尔摩斯冒险史", "Arthur Conan Doyle", "intermediate", "B1–B2"], ["35", "The Time Machine", "时间机器", "H. G. Wells", "intermediate", "B1–B2"], ["23", "Narrative of the Life of Frederick Douglass", "弗雷德里克·道格拉斯自传", "Frederick Douglass", "intermediate", "B2"], ["535", "Travels with a Donkey in the Cévennes", "携驴旅行记", "Robert Louis Stevenson", "intermediate", "B2"],
  ["84", "Frankenstein", "弗兰肯斯坦", "Mary Shelley", "challenge", "B2–C1"], ["1342", "Pride and Prejudice", "傲慢与偏见", "Jane Austen", "challenge", "B2–C1"], ["205", "Walden", "瓦尔登湖", "Henry David Thoreau", "challenge", "C1"], ["1228", "On the Origin of Species", "物种起源", "Charles Darwin", "challenge", "C1"],
] as const).map(([externalId, title, titleZh, author, difficulty, cefrHint]) => ({ id: stableUuid(`gutenberg:${externalId}`), externalId, title, titleZh, author, difficulty, cefrHint, description: "本地内置的无 DRM 英文公版原著，难度为系统估算。" }));

function stableUuid(value: string) { const hash = crypto.createHash("sha256").update(value).digest("hex"); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`; }
