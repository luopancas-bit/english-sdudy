import { describe, expect, it } from "vitest";
import { scheduleReview } from "./review.js";

const score = (value: number) => ({
  listening: value,
  reading: value,
  speaking: value,
  writing: value,
});

describe("review scheduling", () => {
  it("schedules a failed assessment for the next day", () => {
    const result = scheduleReview(null, score(30), new Date("2026-07-24T08:00:00Z"));
    expect(result.result).toBe("restart");
    expect(result.step).toBe(1);
    expect(result.dueAt).toBe("2026-07-25T08:00:00.000Z");
  });

  it("holds the current interval for a mastered score", () => {
    const result = scheduleReview(
      { step: 3, dueAt: "2026-07-24T08:00:00Z", consecutiveExcellent: 0 },
      score(85),
      new Date("2026-07-24T08:00:00Z"),
    );
    expect(result.result).toBe("hold");
    expect(result.step).toBe(3);
  });

  it("skips one interval after two excellent reviews", () => {
    const result = scheduleReview(
      { step: 2, dueAt: "2026-07-24T08:00:00Z", consecutiveExcellent: 1 },
      score(95),
      new Date("2026-07-24T08:00:00Z"),
    );
    expect(result.step).toBe(4);
    expect(result.consecutiveExcellent).toBe(0);
  });
});
