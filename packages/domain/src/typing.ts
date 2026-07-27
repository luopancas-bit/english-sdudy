export interface TypingEvaluation {
  normalizedExpected: string;
  normalizedInput: string;
  correctPrefixLength: number;
  isComplete: boolean;
  hasError: boolean;
}

export function normalizeTypingAnswer(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

export function evaluateTypingInput(expected: string, input: string): TypingEvaluation {
  const normalizedExpected = normalizeTypingAnswer(expected);
  const normalizedInput = normalizeTypingAnswer(input);
  let correctPrefixLength = 0;
  const limit = Math.min(normalizedExpected.length, normalizedInput.length);
  while (
    correctPrefixLength < limit
    && normalizedExpected[correctPrefixLength] === normalizedInput[correctPrefixLength]
  ) {
    correctPrefixLength += 1;
  }
  return {
    normalizedExpected,
    normalizedInput,
    correctPrefixLength,
    isComplete: normalizedInput === normalizedExpected,
    hasError: normalizedInput.length > correctPrefixLength,
  };
}
