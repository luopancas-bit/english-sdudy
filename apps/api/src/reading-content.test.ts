import { describe, expect, it } from "vitest";
import { buildReadingManifest, sanitizeReadingText } from "./reading-content.js";

describe("reading content normalization", () => {
  it("removes Gutenberg boilerplate only between explicit markers", () => {
    const source = [
      "*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***",
      "The Project Gutenberg License for this eBook.",
      "This eBook is for the use of anyone anywhere with almost no restrictions whatsoever.",
      "Other information and formats: www.gutenberg.org.",
      "Chapter I",
      "The real story starts here.",
      "*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***",
    ].join("\n");

    expect(sanitizeReadingText(source, "builtin")).toBe("Chapter I\nThe real story starts here.");
  });

  it("does not delete ordinary body text that mentions Project Gutenberg", () => {
    const source = "The author thanked Project Gutenberg for preserving the text.";

    expect(sanitizeReadingText(source, "builtin")).toBe(source);
  });

  it("handles one-sided or missing Gutenberg markers without deleting a fixed amount", () => {
    expect(sanitizeReadingText("before\n*** START OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\nbody", "gutenberg")).toBe("body");
    expect(sanitizeReadingText("body\n*** END OF THE PROJECT GUTENBERG EBOOK SAMPLE ***\nafter", "gutenberg")).toBe("body");
    expect(sanitizeReadingText("body\nwithout a marker", "gutenberg")).toBe("body\nwithout a marker");
  });

  it("writes a parser version into manifests so old books can be rebuilt", () => {
    const manifest = buildReadingManifest("Sample", "Chapter I\nA chapter.");

    expect(manifest.parserVersion).toBe("reading-content-v2");
    expect(manifest.chapters).toHaveLength(1);
  });
});
