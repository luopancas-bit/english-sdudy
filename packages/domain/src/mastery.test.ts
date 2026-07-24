import { describe, expect, it } from "vitest";
import { calculateMastery, scoreDimensions, type AssessmentAttempt } from "./mastery.js";

const scores = (listening: number, reading: number, speaking: number, writing: number) => ({
  listening,
  reading,
  speaking,
  writing,
});

describe("mastery", () => {
  it("uses the agreed four-dimensional weights", () => {
    expect(scoreDimensions(scores(100, 50, 0, 100))).toBe(70);
  });

  it("weights the latest three formal attempts 50/30/20", () => {
    const attempts: AssessmentAttempt[] = [
      { id: "old", lessonId: 1, kind: "formal", scores: scores(50, 50, 50, 50), occurredAt: "2026-07-01T10:00:00Z" },
      { id: "middle", lessonId: 1, kind: "formal", scores: scores(70, 70, 70, 70), occurredAt: "2026-07-02T10:00:00Z" },
      { id: "latest", lessonId: 1, kind: "formal", scores: scores(90, 90, 90, 90), occurredAt: "2026-07-03T10:00:00Z" },
    ];

    const result = calculateMastery(attempts, new Date("2026-07-03T12:00:00Z"));
    expect(result.score).toBe(76);
    expect(result.formalAttemptIds).toEqual(["latest", "middle", "old"]);
  });

  it("counts only the first formal result from the same day", () => {
    const attempts: AssessmentAttempt[] = [
      { id: "first", lessonId: 1, kind: "formal", scores: scores(60, 60, 60, 60), occurredAt: "2026-07-03T08:00:00Z" },
      { id: "retry", lessonId: 1, kind: "formal", scores: scores(100, 100, 100, 100), occurredAt: "2026-07-03T12:00:00Z" },
    ];

    const result = calculateMastery(attempts, new Date("2026-07-03T13:00:00Z"));
    expect(result.score).toBe(60);
    expect(result.formalAttemptIds).toEqual(["first"]);
  });

  it("uses the learner's calendar day instead of the UTC date", () => {
    const attempts: AssessmentAttempt[] = [
      { id: "first-local", lessonId: 1, kind: "formal", scores: scores(60, 60, 60, 60), occurredAt: "2026-07-02T16:30:00Z" },
      { id: "retry-local", lessonId: 1, kind: "formal", scores: scores(100, 100, 100, 100), occurredAt: "2026-07-03T12:00:00Z" },
    ];

    const result = calculateMastery(attempts, new Date("2026-07-03T13:00:00Z"), "Asia/Shanghai");
    expect(result.formalAttemptIds).toEqual(["first-local"]);
  });

  it("never counts practice attempts toward mastery", () => {
    const result = calculateMastery([
      { id: "practice", lessonId: 1, kind: "practice", scores: scores(100, 100, 100, 100), occurredAt: "2026-07-03T12:00:00Z" },
    ]);
    expect(result.score).toBe(0);
  });
});
