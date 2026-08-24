import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { and, asc, eq, lt } from "drizzle-orm";
import { createDatabase, migrate, readingBooks, readingImportJobs } from "@zhuguang/database";
import { loadConfig } from "./config.js";

const execute = promisify(execFile); const config = loadConfig(); const database = createDatabase(config.DATABASE_URL);
await migrate(database); await fs.mkdir(config.READING_DIR, { recursive: true });
const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
await database.update(readingImportJobs).set({ status: "queued", progress: 0, startedAt: null, errorCode: "worker_restarted" }).where(and(eq(readingImportJobs.status, "processing"), lt(readingImportJobs.startedAt, staleBefore)));

async function processNext() {
  const job = await database.query.readingImportJobs.findFirst({ where: eq(readingImportJobs.status, "queued"), orderBy: [asc(readingImportJobs.createdAt)] });
  if (!job) return false;
  const book = await database.query.readingBooks.findFirst({ where: eq(readingBooks.id, job.bookId) });
  if (!book) { await database.update(readingImportJobs).set({ status: "failed", errorCode: "book_missing", completedAt: new Date().toISOString() }).where(eq(readingImportJobs.id, job.id)); return true; }
  const now = new Date().toISOString(); const claimed = await database.update(readingImportJobs).set({ status: "processing", progress: 10, workerVersion: "calibre-v1", startedAt: now }).where(and(eq(readingImportJobs.id, job.id), eq(readingImportJobs.status, "queued")));
  if (claimed.rowsAffected !== 1) return true;
  await database.update(readingBooks).set({ status: "processing", updatedAt: now }).where(eq(readingBooks.id, book.id));
  const directory = path.join(config.READING_DIR, book.ownerId ? "private" : "public", book.ownerId ?? book.externalId ?? "catalog", book.id); await fs.mkdir(directory, { recursive: true });
  let sourcePath = book.storagePath ? path.resolve(config.READING_DIR, book.storagePath) : path.join(directory, `original.${book.format}`);
  try {
    if (!book.storagePath && book.sourceType === "gutenberg" && book.externalId) { const response = await fetch(`https://www.gutenberg.org/ebooks/${book.externalId}.epub3.images`, { headers: { "User-Agent": "ZhuguangEnglish/2.0 (educational reader)" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`gutenberg_${response.status}`); const bytes = Buffer.from(await response.arrayBuffer()); await fs.writeFile(sourcePath, bytes, { mode: 0o600 }); await database.update(readingBooks).set({ storagePath: relative(sourcePath), byteSize: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }).where(eq(readingBooks.id, book.id)); }
    const textPath = path.join(directory, "content.txt");
    if (book.format === "pdf") await execute("pdftotext", ["-layout", sourcePath, textPath], { timeout: 300_000, maxBuffer: 5_000_000 });
    else await execute("ebook-convert", [sourcePath, textPath, "--txt-output-formatting=plain"], { timeout: 300_000, maxBuffer: 10_000_000 });
    const text = (await fs.readFile(textPath, "utf8")).replace(/\r\n?/g, "\n").trim(); if (!text) throw new Error("empty_text");
    const chunks = text.split(/\n(?=(?:chapter|part)\s+[ivxlcdm\d]+\b)/i).filter(Boolean); const manifest = { version: 1, title: book.title, chapters: (chunks.length ? chunks : [text]).map((chunk, index) => ({ title: chunk.match(/^\s*((?:chapter|part)\s+[^\n]{1,100})/i)?.[1]?.trim() ?? (index ? `第 ${index + 1} 章` : book.title), text: chunk.trim() })) };
    const manifestPath = path.join(directory, "manifest.json"); await fs.writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 }); const completedAt = new Date().toISOString();
    await database.update(readingBooks).set({ manifestPath: relative(manifestPath), status: "ready", drmStatus: "none", wordCount: text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0, chapterCount: manifest.chapters.length, derivedByteSize: Buffer.byteLength(JSON.stringify(manifest)), errorCode: null, updatedAt: completedAt }).where(eq(readingBooks.id, book.id));
    await database.update(readingImportJobs).set({ status: "ready", progress: 100, completedAt }).where(eq(readingImportJobs.id, job.id));
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "conversion_failed"; const protectedFile = /drm|encrypted|password|protected/.test(message); const completedAt = new Date().toISOString();
    await database.update(readingBooks).set({ status: protectedFile ? "protected" : "failed", drmStatus: protectedFile ? "protected" : book.drmStatus, errorCode: protectedFile ? "drm_protected" : message.slice(0, 120), updatedAt: completedAt }).where(eq(readingBooks.id, book.id)); await database.update(readingImportJobs).set({ status: "failed", errorCode: protectedFile ? "drm_protected" : "conversion_failed", completedAt }).where(eq(readingImportJobs.id, job.id));
  }
  return true;
}

function relative(value: string) { return path.relative(path.resolve(config.READING_DIR), value); }
do { const worked = await processNext(); if (!worked) await new Promise((resolve) => setTimeout(resolve, 5_000)); } while (process.env.READING_WORKER_ONCE !== "true");
await database.$client.close();
