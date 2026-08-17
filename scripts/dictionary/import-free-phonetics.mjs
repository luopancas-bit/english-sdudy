import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentRoot = path.resolve(root, process.argv[2] ?? "content-private");
const sourceId = "free-dictionary-api";
const version = process.argv.find((value) => value.startsWith("--version="))?.slice(10) ?? new Date().toISOString().slice(0, 10);
const stagingDirectory = path.join(contentRoot, "dictionaries", "staging", `${sourceId}@${version}`);
const packagePath = path.join(stagingDirectory, "package.json");
const lessons = JSON.parse(await fs.readFile(path.join(contentRoot, "lessons.json"), "utf8"));
const requested = new Map();
for (const lesson of lessons) {
  for (const item of lesson.vocabulary ?? []) {
    requested.set(normalize(item.term), item.term);
    for (const part of splitParts(item.term)) requested.set(normalize(part), part);
  }
}

await fs.mkdir(stagingDirectory, { recursive: true });
let existingEntries = [];
try {
  existingEntries = JSON.parse(await fs.readFile(packagePath, "utf8")).entries ?? [];
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const byTerm = new Map(existingEntries.map((entry) => [normalize(entry.term), entry]));
const queue = Array.from(requested).filter(([key]) => !byTerm.has(key));
let cursor = 0;
let found = 0;
let missing = 0;
let failed = 0;

await Promise.all(Array.from({ length: 5 }, async () => {
  while (cursor < queue.length) {
    const [key, term] = queue[cursor++] ?? [];
    if (!key || !term) continue;
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`, {
        headers: { "User-Agent": "EnglishStudyV2 personal phonetic importer" },
      });
      if (response.status === 404) {
        missing += 1;
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const pronunciations = collectPronunciations(payload);
      if (!pronunciations.length) {
        missing += 1;
        continue;
      }
      byTerm.set(key, {
        key: term,
        term,
        definition: null,
        partOfSpeech: null,
        rawNotation: pronunciations.map((item) => `${item.accent.toUpperCase()} /${item.ipa}/`).join("; "),
        pronunciations,
      });
      found += 1;
    } catch (error) {
      failed += 1;
      console.warn(`${term}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if ((found + missing + failed) % 50 === 0) console.log(`进度 ${found + missing + failed}/${queue.length}`);
  }
}));

const entries = Array.from(byTerm.values()).sort((left, right) => left.term.localeCompare(right.term, "en"));
const dictionaryPackage = {
  schemaVersion: 1,
  source: {
    id: sourceId,
    name: "Free Dictionary API 音标候选库",
    version,
    format: "api",
    license: "Source metadata retained; personal learning use",
    priority: 500,
  },
  entries,
  resources: [],
};
const report = {
  source: `${sourceId}@${version}`,
  generatedAt: new Date().toISOString(),
  requestedTerms: requested.size,
  importedEntries: entries.length,
  newlyFound: found,
  missing,
  failed,
  dualAccentEntries: entries.filter((entry) => new Set(entry.pronunciations.map((item) => item.accent)).size === 2).length,
  note: "自动结果为待核对状态；没有明确英美音频标记的音标不会猜测口音。",
};
await fs.writeFile(packagePath, `${JSON.stringify(dictionaryPackage, null, 2)}\n`, { mode: 0o600 });
await fs.writeFile(path.join(stagingDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ packagePath, report }, null, 2));

function collectPronunciations(payload) {
  const result = [];
  for (const entry of Array.isArray(payload) ? payload : []) {
    for (const item of entry.phonetics ?? []) {
      if (!item.text || !item.audio) continue;
      const accent = audioAccent(item.audio);
      if (!accent) continue;
      const ipa = normalizeIpa(item.text);
      if (!ipa || result.some((candidate) => candidate.accent === accent && candidate.ipa === ipa)) continue;
      result.push({
        accent,
        ipa,
        rawPhonetic: item.text,
        notationSystem: "ipa",
        status: "pending",
        primary: !result.some((candidate) => candidate.accent === accent),
        partOfSpeech: null,
      });
    }
  }
  return result;
}

function audioAccent(url) {
  const value = url.toLowerCase();
  if (/(?:^|[-_/])us(?:[-_.\/]|$)/.test(value)) return "us";
  if (/(?:^|[-_/])uk(?:[-_.\/]|$)/.test(value)) return "uk";
  return null;
}

function normalizeIpa(value) {
  const trimmed = value.normalize("NFC").trim();
  const opened = trimmed.startsWith("/") || trimmed.startsWith("[") ? trimmed.slice(1) : trimmed;
  return opened.endsWith("/") || opened.endsWith("]") ? opened.slice(0, -1).trim() : opened;
}

function normalize(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function splitParts(value) {
  const matches = value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  return matches.length > 1 ? matches : [];
}
