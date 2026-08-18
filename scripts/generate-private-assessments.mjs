import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentArgument = process.argv.find((argument) => argument.startsWith("--content="));
const lessonsArgument = process.argv.find((argument) => argument.startsWith("--lessons="));
const force = process.argv.includes("--force");
const contentDirectory = path.resolve(root, contentArgument?.slice("--content=".length) || "content-private");
const lessons = JSON.parse(await fs.readFile(path.join(contentDirectory, "lessons.json"), "utf8"));
const selectedIds = parseLessonSelection(lessonsArgument?.slice("--lessons=".length) || "1-3");
const selected = lessons.filter((lesson) => selectedIds.has(lesson.id));
if (!selected.length) throw new Error("No lessons matched --lessons");
await fs.mkdir(path.join(contentDirectory, "assessments"), { recursive: true });

for (const lesson of selected) {
  const sentences = lesson.sentences.filter((sentence) => sentence.cloze?.trim()).slice(0, 5);
  const vocabulary = lesson.vocabulary.filter((word) => word.definition?.trim()).slice(0, 5);
  if (sentences.length < 5 || vocabulary.length < 5) {
    throw new Error(`Lesson ${lesson.id} needs at least five cloze sentences and five defined vocabulary entries`);
  }
  const listeningPool = [
    ...sentences.map((sentence) => sentence.cloze),
    ...lesson.vocabulary.map((word) => word.term),
  ];
  const questions = [];

  sentences.forEach((sentence, index) => {
    questions.push({
      id: `l${lesson.id}-listening-${index + 1}`,
      dimension: "listening",
      type: "choice",
      prompt: `盲听第 ${index + 1} 句后，选择你听到的关键词。`,
      options: answerOptions(sentence.cloze, listeningPool, index),
      answer: sentence.cloze,
      points: 1,
      sourceSentence: sentence.text,
    });
  });

  vocabulary.forEach((word, index) => {
    const optionPool = lesson.vocabulary.filter((item) => item.definition?.trim()).map((item) => item.term);
    questions.push({
      id: `l${lesson.id}-reading-${index + 1}`,
      dimension: "reading",
      type: "choice",
      prompt: `根据释义“${word.definition}”，选择课文中的对应词语。`,
      options: answerOptions(word.term, optionPool, index),
      answer: word.term,
      points: 1,
      sourceSentence: lesson.sentences.find((sentence) =>
        sentence.text.toLowerCase().includes(word.term.replace(/\s*\\(.*?\\)\s*/g, "").toLowerCase()),
      )?.text ?? lesson.sentences[index]?.text ?? lesson.englishText,
    });
  });

  sentences.forEach((sentence, index) => {
    questions.push({
      id: `l${lesson.id}-speaking-${index + 1}`,
      dimension: "speaking",
      type: "speech",
      prompt: `跟读第 ${index + 1} 句，尽量保持完整和流畅。`,
      answer: sentence.text,
      points: 1,
      sourceSentence: sentence.text,
    });
  });

  sentences.forEach((sentence, index) => {
    questions.push({
      id: `l${lesson.id}-writing-${index + 1}`,
      dimension: "writing",
      type: "text",
      prompt: sentence.text.replace(new RegExp(escapeRegExp(sentence.cloze), "i"), "_____"),
      answer: sentence.cloze,
      points: 1,
      sourceSentence: sentence.text,
    });
  });

  const output = {
    lessonId: lesson.id,
    title: `${lesson.titleZh} · ${lesson.titleEn}`,
    questions,
  };
  const filename = `lesson-${String(lesson.id).padStart(2, "0")}.json`;
  const outputPath = path.join(contentDirectory, "assessments", filename);
  if (!force) {
    try {
      await fs.access(outputPath);
      throw new Error(`${filename} already exists; use --force only after reviewing the existing assessment`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(output, null, 2)}\n`,
  );
}

function answerOptions(answer, candidates, index) {
  const normalizedAnswer = normalize(answer);
  const unique = [answer];
  const seen = new Set([normalizedAnswer]);
  for (const candidate of candidates) {
    const key = normalize(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
    if (unique.length === 4) break;
  }
  if (unique.length < 4) throw new Error(`Not enough distinct answer options for ${answer}`);
  const offset = index % unique.length;
  return [...unique.slice(offset), ...unique.slice(0, offset)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value) {
  return String(value).toLowerCase().normalize("NFKC").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
}

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

console.log(`Generated fixed assessment baselines for ${selected.length} lesson(s): ${selected.map((lesson) => lesson.id).join(", ")}.`);
