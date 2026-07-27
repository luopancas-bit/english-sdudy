import { describe, expect, it } from "vitest";
import { evaluateTypingInput, normalizeTypingAnswer } from "./typing.js";

describe("qwerty typing evaluation", () => {
  it("normalizes case, whitespace, apostrophe variants, and optional punctuation", () => {
    expect(normalizeTypingAnswer("  Don't   Give Up  ")).toBe("don't give up");
    expect(normalizeTypingAnswer("don’t")).toBe("don't");
    expect(normalizeTypingAnswer("Hello, world!")).toBe("hello world");
  });

  it("finds the first incorrect character without accepting fuzzy spelling", () => {
    expect(evaluateTypingInput("organize", "orgna")).toMatchObject({
      correctPrefixLength: 3,
      isComplete: false,
      hasError: true,
    });
  });

  it("accepts only a fully correct normalized answer", () => {
    expect(evaluateTypingInput("Don't give up", "don't   give up")).toMatchObject({
      isComplete: true,
      hasError: false,
    });
    expect(evaluateTypingInput("I write documents, check email, and learn.", "I write documents check email and learn")).toMatchObject({
      isComplete: true,
      hasError: false,
    });
  });
});
