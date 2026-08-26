import { describe, expect, it } from "vitest";
import { assessTranslationQuality, normalizeTranslationInput } from "./reading-translation.js";

describe("reading translation quality", () => {
  it("normalizes whitespace without changing the sentence meaning", () => {
    expect(normalizeTranslationInput("  If you\r\n are located   here. ")).toBe("If you are located here.");
  });

  it("rejects a truncated English tail", () => {
    expect(assessTranslationQuality("If you are located in the United States.", "如果你在美国，你将不得不检查 la")).toMatchObject({ ok: false, reason: "english_tail" });
  });

  it("rejects a fragment that is only a Gutenberg URL token", () => {
    expect(assessTranslationQuality("gutenberg.", "gutenberg.")).toMatchObject({ ok: false, reason: "fragment" });
  });

  it("accepts a normal Chinese translation", () => {
    expect(assessTranslationQuality("If you are located in the United States.", "如果你位于美国。" )).toMatchObject({ ok: true });
  });

  it("rejects a repeated Chinese phrase", () => {
    expect(assessTranslationQuality("The terms are clear.", "条款非常清楚。条款非常清楚。" )).toMatchObject({ ok: false, reason: "repeated" });
  });
});
