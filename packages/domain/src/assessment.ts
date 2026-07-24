import type { Dimension, DimensionScores } from "./mastery.js";

export interface ScoredAnswer {
  dimension: Dimension;
  earned: number;
  possible: number;
}

export function scoreAssessment(answers: ScoredAnswer[]): DimensionScores {
  const scores = {
    listening: 0,
    reading: 0,
    speaking: 0,
    writing: 0,
  } satisfies DimensionScores;

  for (const dimension of Object.keys(scores) as Dimension[]) {
    const relevant = answers.filter((answer) => answer.dimension === dimension);
    const possible = relevant.reduce((total, answer) => total + Math.max(0, answer.possible), 0);
    const earned = relevant.reduce(
      (total, answer) => total + Math.max(0, Math.min(answer.earned, answer.possible)),
      0,
    );
    scores[dimension] = possible === 0 ? 0 : Math.round((earned / possible) * 1000) / 10;
  }

  return scores;
}
