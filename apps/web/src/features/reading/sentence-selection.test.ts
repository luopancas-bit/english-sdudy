import { describe, expect, it } from "vitest";
import { selectSentenceAt, tokenizeWithOffsets } from "./sentence-selection";

describe("reading sentence selection", () => {
  it("does not split on URL dots and selects the occurrence that was clicked", () => {
    const text = "You may read www.gutenberg.org. If you are located in the United States, you can continue.";
    const token = tokenizeWithOffsets(text).find((item) => item.text.toLowerCase() === "located");

    expect(token).toBeDefined();
    expect(selectSentenceAt(text, token!.startOffset)).toBe("If you are located in the United States, you can continue.");
  });

  it("keeps abbreviations inside a sentence", () => {
    const text = "Mr. Holmes said, \"Read the chapter carefully.\" Then he closed the book.";

    expect(selectSentenceAt(text, text.indexOf("Holmes"))).toBe("Mr. Holmes said, \"Read the chapter carefully.\"");
    expect(selectSentenceAt(text, text.indexOf("closed"))).toBe("Then he closed the book.");
  });

  it("keeps email addresses, decimals, quotes, and unpunctuated paragraphs intact", () => {
    const text = "Write to reader@example.co.uk about 3.14 today.";
    expect(selectSentenceAt(text, text.indexOf("example"))).toBe(text);
    expect(selectSentenceAt("A paragraph without final punctuation", 4)).toBe("A paragraph without final punctuation");
    expect(selectSentenceAt('She said, \"Read this carefully.\" Then she left.', 8)).toBe('She said, \"Read this carefully.\"');
  });
});
