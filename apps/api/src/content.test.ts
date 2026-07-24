import { describe, expect, it } from "vitest";
import { ContentModule, type Assessment } from "./content.js";

const assessment: Assessment = {
  lessonId: 1,
  title: "合成测试课程",
  questions: [
    { id: "l1", dimension: "listening", type: "choice", prompt: "选择", options: ["A", "B"], answer: "A", points: 1, sourceSentence: "Synthetic A." },
    { id: "r1", dimension: "reading", type: "choice", prompt: "选择", options: ["A", "B"], answer: "B", points: 1, sourceSentence: "Synthetic B." },
    { id: "s1", dimension: "speaking", type: "speech", prompt: "朗读", answer: "this is a synthetic sentence", points: 1, sourceSentence: "This is a synthetic sentence." },
    { id: "w1", dimension: "writing", type: "text", prompt: "听写", answer: "computer", points: 1, sourceSentence: "Synthetic computer." },
  ],
};

describe("private content grading", () => {
  it("does not award choice points for an incorrect answer", () => {
    const result = new ContentModule("unused").grade(assessment, {
      l1: "B",
      r1: "B",
      s1: "this is a synthetic sentence",
      w1: "computer",
    });

    expect(result.details.find((item) => item.questionId === "l1")?.correct).toBe(false);
    expect(result.details.find((item) => item.questionId === "r1")?.correct).toBe(true);
  });

  it("normalizes harmless punctuation and case for written answers", () => {
    const result = new ContentModule("unused").grade(assessment, { w1: " COMPUTER! " });
    expect(result.details.find((item) => item.questionId === "w1")?.correct).toBe(true);
  });
});
