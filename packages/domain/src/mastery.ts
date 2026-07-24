export const DIMENSIONS = ["listening", "reading", "speaking", "writing"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type DimensionScores = Record<Dimension, number>;

export interface AssessmentAttempt {
  id: string;
  lessonId: number;
  kind: "formal" | "practice" | "review";
  scores: DimensionScores;
  occurredAt: string;
}

export type MasteryBand =
  | "not-mastered"
  | "introduced"
  | "developing"
  | "mastered"
  | "proficient"
  | "long-term";

export interface MasteryResult {
  score: number;
  band: MasteryBand;
  dimensions: DimensionScores;
  formalAttemptIds: string[];
}

const SCORE_WEIGHTS: Record<Dimension, number> = {
  listening: 0.3,
  reading: 0.2,
  speaking: 0.2,
  writing: 0.3,
};

const ATTEMPT_WEIGHTS = [0.5, 0.3, 0.2] as const;

export function scoreDimensions(scores: DimensionScores): number {
  return round(
    DIMENSIONS.reduce((total, dimension) => {
      return total + clamp(scores[dimension]) * SCORE_WEIGHTS[dimension];
    }, 0),
  );
}

export function calculateMastery(
  attempts: AssessmentAttempt[],
  now = new Date(),
  timeZone = "Asia/Shanghai",
): MasteryResult {
  const formal = selectFormalAttempts(attempts, timeZone);
  const weightedDimensions = Object.fromEntries(
    DIMENSIONS.map((dimension) => [
      dimension,
      round(
        formal.reduce((total, attempt, index) => {
          return total + clamp(attempt.scores[dimension]) * ATTEMPT_WEIGHTS[index]!;
        }, 0) / formal.reduce((total, _attempt, index) => total + ATTEMPT_WEIGHTS[index]!, 0),
      ),
    ]),
  ) as DimensionScores;

  if (formal.length === 0) {
    return {
      score: 0,
      band: "not-mastered",
      dimensions: emptyScores(),
      formalAttemptIds: [],
    };
  }

  const score = scoreDimensions(weightedDimensions);
  const latest = formal[0]!;
  const longTerm =
    score >= 80 &&
    latest.kind === "review" &&
    daysBetween(new Date(latest.occurredAt), now) <= 2 &&
    attempts.some(
      (attempt) =>
        attempt.lessonId === latest.lessonId &&
        attempt.kind === "review" &&
        scoreDimensions(attempt.scores) >= 80 &&
        daysBetween(new Date(attempt.occurredAt), now) >= 28,
    );

  return {
    score,
    band: longTerm ? "long-term" : bandFor(score),
    dimensions: weightedDimensions,
    formalAttemptIds: formal.map((attempt) => attempt.id),
  };
}

function selectFormalAttempts(attempts: AssessmentAttempt[], timeZone: string): AssessmentAttempt[] {
  const oldestFirst = [...attempts]
    .filter((attempt) => attempt.kind !== "practice")
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

  const firstAttemptByDay = new Map<string, AssessmentAttempt>();
  for (const attempt of oldestFirst) {
    const day = localDay(attempt.occurredAt, timeZone);
    if (!firstAttemptByDay.has(day)) firstAttemptByDay.set(day, attempt);
  }
  return [...firstAttemptByDay.values()]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 3);
}

function localDay(occurredAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(occurredAt));
}

export function bandFor(score: number): MasteryBand {
  if (score >= 90) return "proficient";
  if (score >= 80) return "mastered";
  if (score >= 60) return "developing";
  if (score >= 40) return "introduced";
  return "not-mastered";
}

function emptyScores(): DimensionScores {
  return { listening: 0, reading: 0, speaking: 0, writing: 0 };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function daysBetween(left: Date, right: Date): number {
  return Math.floor(Math.abs(right.getTime() - left.getTime()) / 86_400_000);
}
