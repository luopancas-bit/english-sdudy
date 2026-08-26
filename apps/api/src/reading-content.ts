export const READING_PARSER_VERSION = "reading-content-v2";

export type ReadingSourceType = "upload" | "gutenberg" | "builtin";
export type ReadingManifest = {
  version: 1;
  parserVersion: typeof READING_PARSER_VERSION;
  title: string;
  chapters: Array<{ title: string; text: string }>;
};

export function sanitizeReadingText(value: string, sourceType: ReadingSourceType): string {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (sourceType === "upload") return normalized;

  const startMarker = normalized.match(/^\s*\*{3}\s*START OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/im);
  const endMarker = normalized.match(/^\s*\*{3}\s*END OF (?:THE )?PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/im);
  const start = startMarker?.index === undefined ? 0 : startMarker.index + startMarker[0].length;
  const end = endMarker?.index === undefined ? normalized.length : endMarker.index;
  const bounded = end > start ? normalized.slice(start, end) : normalized;

  const paragraphs = bounded.split(/\n\s*\n/).flatMap((paragraph) => {
    const kept = paragraph.split("\n").filter((line) => !isGutenbergBoilerplate(line)).join("\n").trim();
    return kept ? [kept] : [];
  });
  return paragraphs.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function buildReadingManifest(title: string, text: string): ReadingManifest {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const chunks = normalized.split(/\n(?=(?:chapter|part)\s+[ivxlcdm\d]+\b)/i).filter(Boolean);
  return {
    version: 1,
    parserVersion: READING_PARSER_VERSION,
    title,
    chapters: (chunks.length ? chunks : [normalized]).map((chunk, index) => ({
      title: chunk.match(/^\s*((?:chapter|part)\s+[^\n]{1,100})/i)?.[1]?.trim() ?? (index ? `第 ${index + 1} 章` : title),
      text: chunk.trim(),
    })),
  };
}

function isGutenbergBoilerplate(paragraph: string): boolean {
  const compact = paragraph.replace(/\s+/g, " ").trim();
  if (/^(?:https?:\/\/)?(?:www\.)?gutenberg\.org\.?$/i.test(compact)) return true;
  const hasProjectGutenberg = /project gutenberg/i.test(compact);
  const hasLegalClue = /license|e-?book|restrictions?|located in the united states|anyone anywhere|terms of use|information and formats/i.test(compact);
  if (hasProjectGutenberg && hasLegalClue) return true;
  return (/this e-?book|information and formats/i.test(compact) && /gutenberg\.org|anyone anywhere|restrictions?|license/i.test(compact));
}
