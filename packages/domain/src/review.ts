import { scoreDimensions, type DimensionScores } from "./mastery.js";

const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30] as const;

export interface ReviewState {
  step: number;
  dueAt: string;
  consecutiveExcellent: number;
}

export interface ReviewDecision extends ReviewState {
  result: "advance" | "hold" | "retreat" | "restart";
  weakDimensions: Array<keyof DimensionScores>;
}

export function scheduleReview(
  previous: ReviewState | null,
  scores: DimensionScores,
  completedAt: Date,
): ReviewDecision {
  const score = scoreDimensions(scores);
  const currentStep = previous?.step ?? 0;
  const excellent = score >= 90 ? (previous?.consecutiveExcellent ?? 0) + 1 : 0;

  let step: number;
  let result: ReviewDecision["result"];
  if (score >= 90) {
    step = Math.min(REVIEW_INTERVALS.length - 1, currentStep + (excellent >= 2 ? 2 : 1));
    result = "advance";
  } else if (score >= 80) {
    step = currentStep;
    result = "hold";
  } else if (score >= 60) {
    step = Math.max(1, currentStep - 1);
    result = "retreat";
  } else {
    step = 1;
    result = "restart";
  }

  const due = new Date(completedAt);
  due.setDate(due.getDate() + REVIEW_INTERVALS[step]!);

  return {
    step,
    dueAt: due.toISOString(),
    consecutiveExcellent: excellent >= 2 ? 0 : excellent,
    result,
    weakDimensions: (Object.entries(scores) as Array<[keyof DimensionScores, number]>)
      .filter(([, value]) => value < 80)
      .sort((left, right) => left[1] - right[1])
      .map(([dimension]) => dimension),
  };
}
