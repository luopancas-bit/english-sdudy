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

export type Assessment = z.infer<typeof assessmentSchema>;
export type PublicAssessment = Omit<Assessment, "questions"> & {
  questions: Array<Omit<Assessment["questions"][number], "answer" | "sourceSentence">>;
};

export class ContentModule {
  constructor(private readonly contentDirectory: string) {}

  async loadAssessment(lessonId: number): Promise<Assessment> {
    const filename = `lesson-${String(lessonId).padStart(2, "0")}.json`;
    const raw = await fs.readFile(path.join(this.contentDirectory, "assessments", filename), "utf8");
    return assessmentSchema.parse(JSON.parse(raw));
  }

  async publicAssessment(lessonId: number): Promise<PublicAssessment> {
    const assessment = await this.loadAssessment(lessonId);
    return {
      lessonId: assessment.lessonId,
      title: assessment.title,
      questions: assessment.questions.map(({ answer: _answer, sourceSentence: _source, ...question }) => question),
    };
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
