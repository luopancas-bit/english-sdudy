const WORD_REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;

export interface WordReviewState {
  status: "learning" | "reviewing" | "mastered";
  step: number;
  dueAt: string;
  lastScore: number;
}

export interface WordReviewDecision extends WordReviewState {
  result: "start" | "advance" | "retry" | "retreat" | "master";
}

export function scheduleWordReview(
  previous: WordReviewState | null,
  score: number,
  completedAt: Date,
): WordReviewDecision {
  const passed = score >= 80;
  const step = previous && passed
    ? Math.min(WORD_REVIEW_INTERVALS.length - 1, previous.step + 1)
    : 0;
  const mastered = Boolean(previous && passed && previous.step >= WORD_REVIEW_INTERVALS.length - 1);
  const dueAt = new Date(completedAt);
  dueAt.setUTCDate(dueAt.getUTCDate() + WORD_REVIEW_INTERVALS[step]!);
  return {
    status: mastered ? "mastered" : passed ? "reviewing" : "learning",
    step,
    dueAt: dueAt.toISOString(),
    lastScore: score,
    result: mastered ? "master" : passed ? previous ? "advance" : "start" : previous ? "retreat" : "retry",
  };
}
