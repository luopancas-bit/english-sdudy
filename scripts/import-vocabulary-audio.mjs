import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const contentRoot = path.resolve(root, process.argv[2] ?? "content-private");
const assessmentRoot = path.join(contentRoot, "assessments");
const libraryRoot = path.join(contentRoot, "audio", "vocabulary");
const accent = process.argv.includes("--uk") ? "uk" : "us";

const normalize = (value) => value.toLowerCase().normalize("NFKC").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
const slug = (value) => normalize(value).replace(/'/g, "").replace(/ /g, "-");
const mimeFromUrl = (url) => url.includes(".ogg") ? "audio/ogg" : "audio/mpeg";

const files = (await fs.readdir(assessmentRoot)).filter((name) => /^lesson-\d+\.json$/.test(name)).sort();
const terms = new Map();
for (const filename of files) {
  const assessment = JSON.parse(await fs.readFile(path.join(assessmentRoot, filename), "utf8"));
  for (const question of assessment.questions ?? []) {
    if (question.dimension === "listening") terms.set(normalize(question.answer), question.answer);
  }
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
  let asset;
  if (!term.includes(" ")) {
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
    const temporary = path.join(os.tmpdir(), `english-study-${process.pid}-${base}.aiff`);
    const relativePath = `${accent}/${base}.m4a`;
    const voice = accent === "uk" ? "Daniel" : "Samantha";
    await run("say", ["-v", voice, "-o", temporary, "--", term]);
    await run("afconvert", ["-f", "m4af", "-d", "aac", temporary, path.join(libraryRoot, relativePath)]);
    await fs.chmod(path.join(libraryRoot, relativePath), 0o644);
    await fs.unlink(temporary);
    asset = {
      path: relativePath,
      mimeType: "audio/mp4",
      source: { kind: "generated", provider: `macOS ${voice}`, reason: "dictionary audio unavailable" },
    };
  }
  const current = library.entries[key] ?? { term, accents: {} };
  current.term = term;
  current.accents[accent] = asset;
  library.entries[key] = current;
  console.log(`${term}: ${asset.source.kind} -> ${asset.path}`);
}

await fs.writeFile(path.join(libraryRoot, "index.json"), `${JSON.stringify(library, null, 2)}\n`);
await fs.chmod(path.join(libraryRoot, "index.json"), 0o644);
console.log(`Imported ${terms.size} listening terms into ${path.join(libraryRoot, "index.json")}`);
