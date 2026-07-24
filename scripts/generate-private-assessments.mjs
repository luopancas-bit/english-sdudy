import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contentDirectory = path.join(root, "content-private");
const lessons = JSON.parse(await fs.readFile(path.join(contentDirectory, "lessons.json"), "utf8"));
const selected = lessons.slice(0, 3);

for (const lesson of selected) {
  const sentences = lesson.sentences.slice(0, 5);
  const clozePool = sentences.map((sentence) => sentence.cloze);
  const vocabulary = lesson.vocabulary.slice(0, 5);
  const questions = [];

  sentences.forEach((sentence, index) => {
    questions.push({
      id: `l${lesson.id}-listening-${index + 1}`,
      dimension: "listening",
      type: "choice",
      prompt: `盲听第 ${index + 1} 句后，选择你听到的关键词。`,
      options: rotate(clozePool, index),
      answer: sentence.cloze,
      points: 1,
      sourceSentence: sentence.text,
    });
  });

  vocabulary.forEach((word, index) => {
    const optionPool = vocabulary.map((item) => item.term);
    questions.push({
      id: `l${lesson.id}-reading-${index + 1}`,
      dimension: "reading",
      type: "choice",
      prompt: `根据释义“${word.definition}”，选择课文中的对应词语。`,
      options: rotate(optionPool, index),
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
  await fs.writeFile(
    path.join(contentDirectory, "assessments", filename),
    `${JSON.stringify(output, null, 2)}\n`,
  );
}

function rotate(values, index) {
  const offset = index % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

console.log("Generated fixed assessment baselines for lessons 1–3.");
