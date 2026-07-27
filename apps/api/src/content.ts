import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Dimension, ScoredAnswer } from "@zhuguang/domain";

const questionSchema = z.object({
  id: z.string().min(1),
  dimension: z.enum(["listening", "reading", "speaking", "writing"]),
  type: z.enum(["choice", "text", "speech"]),
  prompt: z.string().min(1),
  options: z.array(z.string()).optional(),
  answer: z.string().min(1),
  points: z.number().positive().default(1),
  sourceSentence: z.string().min(1),
});

const assessmentSchema = z.object({
  lessonId: z.number().int().min(1).max(40),
  title: z.string(),
  questions: z.array(questionSchema).min(4),
});

const lessonSchema = z.object({
  id: z.number().int().min(1).max(40),
  slug: z.string().min(1),
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  englishText: z.string().min(1),
  chineseText: z.string().min(1),
  audio: z.object({
    us: z.string().nullable(),
    uk: z.string().nullable(),
  }),
  vocabulary: z.array(z.object({
    term: z.string().min(1),
    definition: z.string(),
    sourcePage: z.number().int().positive().optional(),
  })),
  sentences: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    cloze: z.string().optional(),
  })),
});

export type Assessment = z.infer<typeof assessmentSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type PublicAssessment = Omit<Assessment, "questions"> & {
  questions: Array<Omit<Assessment["questions"][number], "answer" | "sourceSentence"> & {
    audioUrl?: string;
    audioStart?: number;
    audioEnd?: number;
    speechText?: string;
  }>;
};
export type PublicLesson = Omit<Lesson, "audio"> & {
  audio: { us: string | null; uk: string | null };
};
export type WordMemoryChapter = {
  lessonId: number;
  titleEn: string;
  titleZh: string;
  vocabularyCount: number;
  sentenceCount: number;
};
export type WordAssessmentItem = {
  term: string;
  meaning: string;
  meaningOptions: string[];
  sentenceId: string;
  sentence: string;
  clozePrompt: string;
  audioUrl: string;
  audioStart?: number;
  audioEnd?: number;
};

export class ContentModule {
  constructor(private readonly contentDirectory: string) {}

  async loadAssessment(lessonId: number): Promise<Assessment> {
    const filename = `lesson-${String(lessonId).padStart(2, "0")}.json`;
    const raw = await fs.readFile(path.join(this.contentDirectory, "assessments", filename), "utf8");
    return assessmentSchema.parse(JSON.parse(raw));
  }

  async loadLesson(lessonId: number): Promise<Lesson> {
    const raw = await fs.readFile(path.join(this.contentDirectory, "lessons.json"), "utf8");
    const lessons = z.array(z.unknown()).parse(JSON.parse(raw));
    const candidate = lessons.find((item) =>
      typeof item === "object" && item !== null && "id" in item && item.id === lessonId
    );
    if (!candidate) throw new Error(`Lesson ${lessonId} does not exist`);
    return lessonSchema.parse(candidate);
  }

  async wordMemoryChapters(): Promise<WordMemoryChapter[]> {
    const raw = await fs.readFile(path.join(this.contentDirectory, "lessons.json"), "utf8");
    return z.array(lessonSchema).parse(JSON.parse(raw)).map((lesson) => ({
      lessonId: lesson.id,
      titleEn: lesson.titleEn,
      titleZh: lesson.titleZh,
      vocabularyCount: lesson.vocabulary.filter((item) => item.definition.trim()).length,
      sentenceCount: lesson.sentences.length,
    }));
  }

  async publicLesson(lessonId: number): Promise<PublicLesson> {
    const lesson = await this.loadLesson(lessonId);
    return {
      ...lesson,
      vocabulary: lesson.vocabulary.filter((item) => item.definition.trim()),
      audio: {
        us: lesson.audio.us ? `/api/lessons/${lessonId}/audio/us` : null,
        uk: lesson.audio.uk ? `/api/lessons/${lessonId}/audio/uk` : null,
      },
    };
  }

  async lessonAudio(lessonId: number, accent: "us" | "uk") {
    const lesson = await this.loadLesson(lessonId);
    const declaredPath = lesson.audio[accent];
    if (!declaredPath) return null;
    const relativePath = declaredPath.replace(/^\/audio\//, "");
    if (relativePath === declaredPath || relativePath.includes("..")) return null;
    const filename = path.join(this.contentDirectory, "audio", relativePath);
    try {
      return await fs.readFile(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async publicAssessment(lessonId: number): Promise<PublicAssessment> {
    const assessment = await this.loadAssessment(lessonId);
    const timings = await this.loadSentenceTimings(lessonId);
    return {
      lessonId: assessment.lessonId,
      title: assessment.title,
      questions: assessment.questions.map(({ answer: _answer, sourceSentence, ...question }) => {
        const timing = timings.get(sourceSentence);
        return {
          ...question,
          ...(question.type === "speech" ? { speechText: sourceSentence } : {}),
          ...(["listening", "writing"].includes(question.dimension)
            ? {
                audioUrl: `/api/lessons/${lessonId}/audio/us`,
                ...(timing ? { audioStart: timing.start, audioEnd: timing.end } : {}),
              }
            : {}),
        };
      }),
    };
  }

  async wordAssessment(lessonId: number): Promise<WordAssessmentItem[]> {
    const lesson = await this.loadLesson(lessonId);
    const timings = await this.loadSentenceTimings(lessonId);
    const vocabulary = new Map(
      lesson.vocabulary
        .filter((item) => item.definition.trim())
        .map((item) => [normalize(item.term), item]),
    );
    const eligible = lesson.sentences.flatMap((sentence) => {
      const term = sentence.cloze ? vocabulary.get(normalize(sentence.cloze)) : undefined;
      if (!term) return [];
      const timing = timings.get(sentence.text);
      const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const clozePrompt = sentence.text.replace(new RegExp(escaped, "i"), "_____");
      const alternatives = lesson.vocabulary
        .filter((item) => item.definition.trim() && normalize(item.term) !== normalize(term.term))
        .slice(0, 3)
        .map((item) => item.definition);
      return [{
        term: term.term,
        meaning: term.definition,
        meaningOptions: rotateOptions([term.definition, ...alternatives], sentence.id),
        sentenceId: sentence.id,
        sentence: sentence.text,
        clozePrompt,
        audioUrl: `/api/lessons/${lessonId}/audio/us`,
        ...(timing ? { audioStart: timing.start, audioEnd: timing.end } : {}),
      }];
    });
    return eligible.slice(0, 5);
  }

  private async loadSentenceTimings(lessonId: number) {
    const result = new Map<string, { start: number; end: number }>();
    try {
      const [lesson, raw] = await Promise.all([
        this.loadLesson(lessonId),
        fs.readFile(path.join(this.contentDirectory, "timings.json"), "utf8"),
      ]);
      const timingFile = z.object({
        lessons: z.record(z.string(), z.object({
          us: z.object({
            sentences: z.array(z.object({
              sentenceId: z.string(),
              start: z.number().nonnegative(),
              end: z.number().positive(),
            })),
          }).optional(),
        })),
      }).parse(JSON.parse(raw));
      const byId = new Map(
        timingFile.lessons[String(lessonId)]?.us?.sentences.map((item) => [item.sentenceId, item]) ?? [],
      );
      for (const sentence of lesson.sentences) {
        const timing = byId.get(sentence.id);
        if (timing) result.set(sentence.text, { start: timing.start, end: timing.end });
      }
    } catch {
      return result;
    }
    return result;
  }

  grade(assessment: Assessment, submitted: Record<string, string>): {
    scored: ScoredAnswer[];
    details: Array<{
      questionId: string;
      dimension: Dimension;
      correct: boolean;
      earned: number;
      possible: number;
      submitted: string;
      sourceSentence: string;
    }>;
  } {
    const details = assessment.questions.map((question) => {
      const value = String(submitted[question.id] ?? "");
      const similarity =
        question.type === "choice"
          ? normalize(value) === normalize(question.answer) ? 1 : 0
          : textSimilarity(normalize(value), normalize(question.answer));
      const threshold = question.type === "speech" ? 0.72 : question.type === "text" ? 0.9 : 1;
      const correct = similarity >= threshold;
      return {
        questionId: question.id,
        dimension: question.dimension,
        correct,
        earned: correct ? question.points : question.type === "speech" ? question.points * similarity : 0,
        possible: question.points,
        submitted: value,
        sourceSentence: question.sourceSentence,
      };
    });

    return {
      details,
      scored: details.map((detail) => ({
        dimension: detail.dimension,
        earned: detail.earned,
        possible: detail.possible,
      })),
    };
  }
}

function rotateOptions(options: string[], seed: string) {
  if (!options.length) return options;
  const offset = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0) % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let previous = rows[0]!;
    rows[0] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const replaced = previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      previous = rows[leftIndex]!;
      rows[leftIndex] = Math.min(rows[leftIndex]! + 1, rows[leftIndex - 1]! + 1, replaced);
    }
  }
  return Math.max(0, 1 - rows[left.length]! / Math.max(left.length, right.length));
}
