import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MDX, MDD } from "js-mdict";

const [command = "", ...rawArguments] = process.argv.slice(2);
const argumentsMap = new Map(rawArguments.filter((value) => value.startsWith("--")).map((value) => {
  const separator = value.indexOf("=");
  return separator === -1 ? [value.slice(2), "true"] : [value.slice(2, separator), value.slice(separator + 1)];
}));

if (command === "scan") await scan();
else if (command === "publish") await publish();
else fail("用法：pnpm dictionary:scan -- --input=/私有目录/词典.mdx --source-id=词典ID --name=名称 --version=版本 [--profile=映射.json]");

async function scan() {
  const input = requiredPath("input", ".mdx");
  const sourceId = required("source-id");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(sourceId)) fail("source-id 只能使用小写字母、数字、点、下划线和短横线");
  const name = required("name");
  const version = required("version");
  const outputRoot = path.resolve(argumentsMap.get("output") ?? "content-private/dictionaries/staging");
  const packageDirectory = path.join(outputRoot, `${sourceId}@${safeSegment(version)}`);
  const resourcesDirectory = path.join(packageDirectory, "resources");
  const profile = await loadProfile(argumentsMap.get("profile"));
  const selectedTerms = await loadSelectedTerms(argumentsMap.get("terms-file"), argumentsMap.get("terms-from-lessons"));
  const limit = numberArgument("max-entries", 250_000);
  await fs.mkdir(resourcesDirectory, { recursive: true });

  const mdx = new MDX(input);
  const mdd = await openMdd(input);
  const entries = [];
  const resources = new Map();
  const report = {
    source: `${sourceId}@${version}`,
    scannedAt: new Date().toISOString(),
    mdxEntries: mdx.keywordList.length,
    selectedEntries: 0,
    importedEntries: 0,
    usPhonetics: 0,
    ukPhonetics: 0,
    dualAccentEntries: 0,
    ambiguousEntries: 0,
    multiplePronunciationEntries: 0,
    resources: { extracted: 0, missing: 0, rejected: 0 },
    discarded: { scripts: 0, stylesheets: 0, inlineStyles: 0, eventHandlers: 0 },
    errors: [],
  };

  for (const keyword of mdx.keywordList) {
    if (entries.length >= limit) break;
    const normalized = normalizeTerm(keyword.keyText);
    if (selectedTerms && !selectedTerms.has(normalized)) continue;
    report.selectedEntries += 1;
    try {
      const result = mdx.fetch(keyword);
      if (!result.definition) continue;
      const html = result.definition;
      countDiscarded(html, report.discarded);
      const us = extractPhonetics(html, profile.usPatterns);
      const uk = extractPhonetics(html, profile.ukPatterns);
      const partOfSpeech = extractFirst(html, profile.partOfSpeechPatterns);
      const resourceKeys = resourceReferences(html);
      const audioResourceKey = (accent) => resourceKeys.find((key) => {
        const lower = key.toLocaleLowerCase("en-US");
        return /\.(?:mp3|m4a|ogg|wav|spx)$/u.test(lower)
          && (accent === "us" ? /(?:^|[/\\])us_pron(?:[/\\]|$)/u.test(lower) : /(?:^|[/\\])uk_pron(?:[/\\]|$)/u.test(lower));
      }) ?? null;
      const ambiguous = false;
      const pronunciations = [
        ...us.map((ipa, index) => pronunciation("us", ipa, index === 0, partOfSpeech, profile, ambiguous, audioResourceKey("us"))),
        ...uk.map((ipa, index) => pronunciation("uk", ipa, index === 0, partOfSpeech, profile, ambiguous, audioResourceKey("uk"))),
      ];
      if (us.length) report.usPhonetics += 1;
      if (uk.length) report.ukPhonetics += 1;
      if (us.length && uk.length) report.dualAccentEntries += 1;
      if (us.length > 1 || uk.length > 1) report.multiplePronunciationEntries += 1;
      if (ambiguous) report.ambiguousEntries += 1;
      if (mdd) {
        for (const resourceKey of resourceKeys) {
          if (resources.has(resourceKey)) continue;
          const extracted = await extractResource(mdd, resourceKey, resourcesDirectory);
          if (extracted.status === "extracted") {
            resources.set(resourceKey, extracted.resource);
            report.resources.extracted += 1;
          } else if (extracted.status === "rejected") report.resources.rejected += 1;
          else report.resources.missing += 1;
        }
      }
      entries.push({
        key: keyword.keyText,
        term: keyword.keyText.trim(),
        definition: cleanDefinition(html),
        partOfSpeech,
        rawNotation: [...us, ...uk].join("; ") || null,
        pronunciations,
      });
    } catch (error) {
      if (report.errors.length < 100) report.errors.push({ term: keyword.keyText, message: error instanceof Error ? error.message : String(error) });
    }
  }
  report.importedEntries = entries.length;
  const dictionaryPackage = {
    schemaVersion: 1,
    source: {
      id: sourceId,
      name,
      version,
      format: "mdx",
      license: argumentsMap.get("license") ?? null,
      priority: numberArgument("priority", 100),
    },
    entries,
    resources: Array.from(resources.values()),
  };
  await fs.writeFile(path.join(packageDirectory, "package.json"), `${JSON.stringify(dictionaryPackage, null, 2)}\n`, { mode: 0o600 });
  await fs.writeFile(path.join(packageDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ packageDirectory, report }, null, 2));
}

async function publish() {
  const packagePath = requiredPath("package", "package.json");
  const reportPath = path.join(path.dirname(packagePath), "report.json");
  const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const dictionaryPackage = JSON.parse(await fs.readFile(packagePath, "utf8"));
  if (report.errors?.length) fail(`暂存报告仍有 ${report.errors.length} 个解析错误，不能发布`);
  if (!dictionaryPackage.source?.id || !dictionaryPackage.source?.version) fail("暂存包缺少词典 ID 或版本");
  const contentRoot = path.resolve(argumentsMap.get("content") ?? "content-private");
  const publishedDirectory = path.join(contentRoot, "dictionaries", "published");
  const resourceDirectory = path.join(contentRoot, "dictionaries", "resources", `${dictionaryPackage.source.id}@${safeSegment(dictionaryPackage.source.version)}`);
  await fs.mkdir(publishedDirectory, { recursive: true });
  await fs.mkdir(resourceDirectory, { recursive: true });
  for (const resource of dictionaryPackage.resources ?? []) {
    const source = path.resolve(path.dirname(packagePath), resource.path);
    if (!source.startsWith(`${path.resolve(path.dirname(packagePath))}${path.sep}`)) fail(`资源路径越界：${resource.key}`);
    const filename = path.basename(resource.path);
    const destinationResource = path.join(resourceDirectory, filename);
    await fs.copyFile(source, destinationResource, fs.constants.COPYFILE_EXCL).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await fs.chmod(destinationResource, 0o600);
    resource.path = path.relative(contentRoot, destinationResource);
  }
  const destination = path.join(publishedDirectory, `${dictionaryPackage.source.id}@${safeSegment(dictionaryPackage.source.version)}.json`);
  try {
    await fs.writeFile(destination, `${JSON.stringify(dictionaryPackage, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST") fail(`同版本已经发布：${destination}`);
    throw error;
  }
  await fs.chmod(destination, 0o600);
  console.log(JSON.stringify({ published: destination, entries: dictionaryPackage.entries.length }, null, 2));
}

function pronunciation(accent, ipa, primary, partOfSpeech, profile, ambiguous, audioResourceKey) {
  return {
    accent,
    ipa: normalizeIpa(ipa),
    rawPhonetic: ipa,
    notationSystem: profile.notationSystem,
    status: ambiguous ? "ambiguous" : profile.trusted ? "verified" : "pending",
    primary,
    partOfSpeech,
    audioResourceKey,
  };
}

async function loadProfile(filename) {
  const defaults = {
    notationSystem: "ipa",
    trusted: false,
    usPatterns: [
      "class=[\"'][^\"']*(?:phon[-_ ]?us|us[-_ ]?phon|phon[-_ ]?ame|z_phon-us)[^\"']*[\"'][^>]*>([\\s\\S]*?)</",
    ],
    ukPatterns: [
      "class=[\"'][^\"']*(?:phon[-_ ]?(?:uk|gb)|(?:uk|gb)[-_ ]?phon|phon[-_ ]?bre)[^\"']*[\"'][^>]*>([\\s\\S]*?)</",
    ],
    partOfSpeechPatterns: [
      "class=[\"'][^\"']*(?:part[-_ ]?of[-_ ]?speech|pos)[^\"']*[\"'][^>]*>([\\s\\S]*?)</",
    ],
  };
  if (!filename) return defaults;
  const custom = JSON.parse(await fs.readFile(path.resolve(filename), "utf8"));
  return {
    notationSystem: ["ipa", "dj", "kk", "unknown"].includes(custom.notationSystem) ? custom.notationSystem : "unknown",
    trusted: custom.trusted === true,
    usPatterns: validatePatterns(custom.usPatterns, "usPatterns"),
    ukPatterns: validatePatterns(custom.ukPatterns, "ukPatterns"),
    partOfSpeechPatterns: validatePatterns(custom.partOfSpeechPatterns ?? [], "partOfSpeechPatterns"),
  };
}

function validatePatterns(patterns, field) {
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string" || pattern.length > 500)) fail(`${field} 必须是正则字符串数组`);
  for (const pattern of patterns) new RegExp(pattern, "giu");
  return patterns;
}

function extractPhonetics(html, patterns) {
  const result = [];
  for (const source of patterns) {
    const expression = new RegExp(source, "giu");
    for (const match of html.matchAll(expression)) {
      const value = normalizeIpa(textContent(match[1] ?? "")
        .replace(/\b(?:BrE|NAmE|AmE|US|UK|GB)\b/giu, " ")
        .replace(/\/{2,}/g, "/"));
      if (value && value.length <= 200 && !result.includes(value)) result.push(value);
    }
  }
  return result;
}

function extractFirst(html, patterns) {
  for (const source of patterns) {
    const match = new RegExp(source, "iu").exec(html);
    const value = textContent(match?.[1] ?? "").trim();
    if (value) return value.slice(0, 80);
  }
  return null;
}

function cleanDefinition(html) {
  const safe = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<link\b[^>]*>/giu, " ")
    .replace(/<(?:iframe|object|embed|form)\b[\s\S]*?<\/(?:iframe|object|embed|form)\s*>/giu, " ")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/(?:javascript|data):/giu, "");
  return textContent(safe).replace(/\s+/g, " ").trim().slice(0, 10_000) || null;
}

function textContent(value) {
  return value.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&quot;/giu, '"').replace(/&#39;/giu, "'");
}

function resourceReferences(html) {
  const result = new Set();
  for (const match of html.matchAll(/(?:sound:\/\/|(?:src|href)\s*=\s*["'])([^"'<>]+)["']?/giu)) {
    const key = match[1]?.trim().replace(/^sound:\/\//iu, "");
    if (key && isAllowedResourceKey(key)) result.add(key);
  }
  return Array.from(result);
}

function isAllowedResourceKey(key) {
  if (key.includes("..") || /^[a-z]+:\/\//i.test(key)) return false;
  return /\.(?:mp3|m4a|ogg|wav|spx|png|jpe?g|gif|webp|svg|woff2?|ttf)$/i.test(key);
}

async function extractResource(mddReaders, key, directory) {
  if (!isAllowedResourceKey(key)) return { status: "rejected" };
  const candidates = [key, key.startsWith("\\") ? key : `\\${key}`, key.replaceAll("/", "\\")];
  let encoded = null;
  const transformedKey = "\\" + key.replaceAll("/", "\\_");
  for (const mdd of mddReaders ?? []) {
    encoded = locateMddResource(mdd, transformedKey).definition;
    if (encoded) break;
  }
  for (const candidate of candidates) {
    for (const mdd of mddReaders ?? []) {
      encoded = locateMddResource(mdd, candidate).definition;
      if (encoded) break;
    }
    if (encoded) break;
  }
  if (!encoded) return { status: "missing" };
  const data = Buffer.from(encoded, "base64");
  if (data.byteLength > 20_000_000) return { status: "rejected" };
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const extension = path.extname(key).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const filename = `${sha256}${extension}`;
  await fs.writeFile(path.join(directory, filename), data, { mode: 0o600 });
  return {
    status: "extracted",
    resource: { key, path: `resources/${filename}`, kind: resourceKind(extension), mimeType: mimeType(extension), sha256, byteSize: data.byteLength },
  };
}

function locateMddResource(mdd, key) {
  const direct = mdd.locate(key);
  if (direct.definition) return direct;
  const basename = key.split(/[\\/]/u).pop()?.toLocaleLowerCase("en-US");
  if (!basename) return direct;
  if (!mdd.__resourceIndex) {
    mdd.__resourceIndex = new Map();
    for (const item of mdd.keywordList) {
      const itemBase = item.keyText.split(/[\\/]/u).pop()?.toLocaleLowerCase("en-US");
      if (!itemBase) continue;
      const values = mdd.__resourceIndex.get(itemBase) ?? [];
      values.push(item.keyText);
      mdd.__resourceIndex.set(itemBase, values);
    }
  }
  for (const candidate of mdd.__resourceIndex.get(basename) ?? []) {
    const found = mdd.locate(candidate);
    if (found.definition) return found;
  }
  return direct;
}

async function openMdd(mdxPath) {
  const basePath = mdxPath.replace(/\.mdx$/i, "");
  const directory = path.dirname(basePath);
  const stem = path.basename(basePath);
  const candidates = (await fs.readdir(directory))
    .filter((filename) => new RegExp("^" + escapeRegExp(stem) + "(?:\\.\\d+)?\\.mdd$", "iu").test(filename))
    .sort((left, right) => {
      const number = (filename) => Number(filename.match(/\.(\d+)\.mdd$/i)?.[1] ?? 0);
      return number(left) - number(right);
    });
  return candidates.length ? candidates.map((filename) => new MDD(path.join(directory, filename))) : null;
}

async function loadSelectedTerms(filename, lessonsDirectory) {
  if (filename) {
    const parsed = JSON.parse(await fs.readFile(path.resolve(filename), "utf8"));
    if (!Array.isArray(parsed)) fail("terms-file 必须是 JSON 字符串数组");
    return new Set(parsed.map((term) => normalizeTerm(String(term))).filter(Boolean));
  }
  if (!lessonsDirectory) return null;
  const lessons = JSON.parse(await fs.readFile(path.join(path.resolve(lessonsDirectory), "lessons.json"), "utf8"));
  const terms = new Set();
  for (const lesson of lessons) {
    for (const item of lesson.vocabulary ?? []) {
      for (const term of [item.term, ...splitTermParts(item.term)]) {
        const normalized = normalizeTerm(String(term));
        if (normalized) terms.add(normalized);
      }
    }
  }
  return terms;
}

function splitTermParts(value) {
  const matches = String(value).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  return matches.length > 1 ? matches : [];
}

function countDiscarded(html, discarded) {
  discarded.scripts += (html.match(/<script\b/giu) ?? []).length;
  discarded.stylesheets += (html.match(/<link\b[^>]*stylesheet/giu) ?? []).length;
  discarded.inlineStyles += (html.match(/\sstyle\s*=/giu) ?? []).length;
  discarded.eventHandlers += (html.match(/\son[a-z]+\s*=/giu) ?? []).length;
}

function normalizeIpa(value) {
  const trimmed = value.normalize("NFC").trim();
  const opened = trimmed.startsWith("/") || trimmed.startsWith("[") ? trimmed.slice(1) : trimmed;
  return opened.endsWith("/") || opened.endsWith("]") ? opened.slice(0, -1).trim() : opened;
}

function normalizeTerm(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function resourceKind(extension) {
  if (/\.(?:mp3|m4a|ogg|wav|spx)$/.test(extension)) return "audio";
  if (/\.(?:woff2?|ttf)$/.test(extension)) return "font";
  return "image";
}

function mimeType(extension) {
  return ({ ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav", ".spx": "audio/ogg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" })[extension] ?? "application/octet-stream";
}

function required(name) {
  const value = argumentsMap.get(name)?.trim();
  if (!value) fail(`缺少 --${name}=...`);
  return value;
}

function requiredPath(name, expectedName) {
  const value = path.resolve(required(name));
  if (!value.toLowerCase().endsWith(expectedName.toLowerCase())) fail(`--${name} 必须指向 ${expectedName}`);
  return value;
}

function numberArgument(name, fallback) {
  const value = Number(argumentsMap.get(name) ?? fallback);
  if (!Number.isInteger(value) || value < 1) fail(`--${name} 必须是正整数`);
  return value;
}

function safeSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
