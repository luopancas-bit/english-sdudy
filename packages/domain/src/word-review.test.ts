import { describe, expect, it } from "vitest";
import { scheduleWordReview } from "./word-review.js";

describe("word review scheduling", () => {
  it("schedules a passed formal assessment for its first review without claiming long-term mastery", () => {
    const decision = scheduleWordReview(null, 80, new Date("2026-08-06T08:00:00Z"));

    expect(decision).toMatchObject({
      status: "reviewing",
      step: 0,
      dueAt: "2026-08-07T08:00:00.000Z",
      result: "start",
    });
  });

  it("advances a passed review to the next interval", () => {
    const decision = scheduleWordReview(
      { status: "reviewing", step: 0, dueAt: "2026-08-07T08:00:00.000Z", lastScore: 80 },
      90,
      new Date("2026-08-07T08:00:00Z"),
    );

    expect(decision).toMatchObject({
      status: "reviewing",
      step: 1,
      dueAt: "2026-08-10T08:00:00.000Z",
      result: "advance",
    });
  });

  it("marks a word as mastered only after the 30-day review passes", () => {
    const decision = scheduleWordReview(
      { status: "reviewing", step: 4, dueAt: "2026-09-05T08:00:00.000Z", lastScore: 88 },
      80,
      new Date("2026-09-05T08:00:00Z"),
    );

    expect(decision).toMatchObject({ status: "mastered", step: 4, result: "master" });
  });

  it("returns a failed review to learning and restarts after one day", () => {
    const decision = scheduleWordReview(
      { status: "reviewing", step: 3, dueAt: "2026-08-21T08:00:00.000Z", lastScore: 85 },
      70,
      new Date("2026-08-21T08:00:00Z"),
    );

    expect(decision).toMatchObject({
      status: "learning",
      step: 0,
      dueAt: "2026-08-22T08:00:00.000Z",
      result: "retreat",
    });
  });
});
