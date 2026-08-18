import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const contentRoot = path.resolve(root, process.argv[2] ?? "content-private");
const assessmentRoot = path.join(contentRoot, "assessments");
const libraryRoot = path.join(contentRoot, "audio", "vocabulary");
const accent = process.argv.includes("--uk") ? "uk" : "us";
const missingOnly = process.argv.includes("--missing-only");
const offline = process.argv.includes("--offline");
const dryRun = process.argv.includes("--dry-run");
const lessonsArgument = process.argv.find((argument) => argument.startsWith("--lessons="));
const lessonFilter = lessonsArgument
  ? parseLessonSelection(lessonsArgument.slice("--lessons=".length))
  : null;

const normalize = (value) => value
  .toLowerCase()
  .normalize("NFKC")
  .replace(/[^\p{L}\p{N}\s']/gu, " ")
  .replace(/\s+/g, " ")
  .trim();
const slug = (value) => normalize(value).replace(/'/g, "").replace(/ /g, "-");
const mimeFromUrl = (url) => url.includes(".ogg") ? "audio/ogg" : "audio/mpeg";

const files = (await fs.readdir(assessmentRoot)).filter((name) => /^lesson-\d+\.json$/.test(name)).sort();
const terms = new Map();
for (const filename of files) {
  const assessment = JSON.parse(await fs.readFile(path.join(assessmentRoot, filename), "utf8"));
  if (lessonFilter && !lessonFilter.has(assessment.lessonId)) continue;
  for (const question of assessment.questions ?? []) {
    if (question.dimension === "listening") terms.set(normalize(question.answer), question.answer);
  }
}

const lessons = JSON.parse(await fs.readFile(path.join(contentRoot, "lessons.json"), "utf8"));
for (const lesson of lessons) {
  if (lessonFilter && !lessonFilter.has(lesson.id)) continue;
  const vocabulary = new Map((lesson.vocabulary ?? [])
    .filter((item) => item.definition?.trim())
    .map((item) => [normalize(item.term), item.term]));
  const eligibleTerms = (lesson.sentences ?? [])
    .flatMap((sentence) => sentence.cloze && vocabulary.has(normalize(sentence.cloze))
      ? [vocabulary.get(normalize(sentence.cloze))]
      : [])
    .slice(0, 5);
  for (const term of eligibleTerms) terms.set(normalize(term), term);
}

if (dryRun) {
  console.log(`Would import ${terms.size} assessment and word-review terms for ${accent}.`);
  process.exit(0);
}

await fs.mkdir(path.join(libraryRoot, accent), { recursive: true });
await fs.chmod(libraryRoot, 0o755);
await fs.chmod(path.join(libraryRoot, accent), 0o755);
let library = { version: 1, entries: {} };
try {
  library = JSON.parse(await fs.readFile(path.join(libraryRoot, "index.json"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

for (const [key, term] of terms) {
  const base = slug(term);
  const current = library.entries[key] ?? { term, accents: {} };
  if (missingOnly && current.accents[accent]) {
    console.log(`${term}: existing -> ${current.accents[accent].path}`);
    continue;
  }
  let asset;
  if (!offline && !term.includes(" ")) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);
      if (response.ok) {
        const entries = await response.json();
        const candidates = entries.flatMap((entry) => entry.phonetics ?? []).filter((item) => item.audio);
        const desired = candidates.find((item) => accent === "us" ? /-us\./i.test(item.audio) : /-uk\./i.test(item.audio)) ?? candidates[0];
        if (desired) {
          const audioResponse = await fetch(desired.audio);
          if (audioResponse.ok) {
            const extension = desired.audio.includes(".ogg") ? "ogg" : "mp3";
            const relativePath = `${accent}/${base}.${extension}`;
            await fs.writeFile(path.join(libraryRoot, relativePath), Buffer.from(await audioResponse.arrayBuffer()));
            await fs.chmod(path.join(libraryRoot, relativePath), 0o644);
            asset = {
              path: relativePath,
              mimeType: mimeFromUrl(desired.audio),
              source: { kind: "dictionary", provider: "Free Dictionary API", url: desired.audio },
            };
          }
        }
      }
    } catch (error) {
      console.warn(`Dictionary lookup failed for ${term}: ${error.message}`);
    }
  }
  if (!asset) {
    const relativePath = `${accent}/${base}.m4a`;
    const voice = accent === "uk" ? "Daniel" : "Samantha";
    await run("say", ["-v", voice, "-o", path.join(libraryRoot, relativePath), "--", term]);
    await fs.chmod(path.join(libraryRoot, relativePath), 0o644);
    asset = {
      path: relativePath,
      mimeType: "audio/mp4",
      source: { kind: "generated", provider: `macOS ${voice}`, reason: "dictionary audio unavailable" },
    };
  }
  current.term = term;
  current.accents[accent] = asset;
  library.entries[key] = current;
  console.log(`${term}: ${asset.source.kind} -> ${asset.path}`);
}

await fs.writeFile(path.join(libraryRoot, "index.json"), `${JSON.stringify(library, null, 2)}\n`);
await fs.chmod(path.join(libraryRoot, "index.json"), 0o644);
console.log(`Imported ${terms.size} assessment and word-review terms into ${path.join(libraryRoot, "index.json")}`);

function parseLessonSelection(value) {
  const result = new Set();
  for (const part of value.split(",")) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) throw new Error(`Invalid lesson range: ${part}`);
      for (let lessonId = start; lessonId <= end; lessonId += 1) result.add(lessonId);
      continue;
    }
    const lessonId = Number(part);
    if (!Number.isInteger(lessonId)) throw new Error(`Invalid lesson id: ${part}`);
    result.add(lessonId);
  }
  return result;
}
