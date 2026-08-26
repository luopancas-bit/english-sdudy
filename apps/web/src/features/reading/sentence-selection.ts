export type ReadingToken = {
  text: string;
  startOffset: number;
  endOffset: number;
  isWord: boolean;
};

const ABBREVIATIONS = new Set([
  "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "vs.", "etc.", "e.g.", "i.e.",
]);

export function tokenizeWithOffsets(value: string): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  const wordPattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
  let cursor = 0;
  for (const match of value.matchAll(wordPattern)) {
    const startOffset = match.index ?? cursor;
    if (startOffset > cursor) tokens.push({ text: value.slice(cursor, startOffset), startOffset: cursor, endOffset: startOffset, isWord: false });
    const text = match[0];
    const endOffset = startOffset + text.length;
    tokens.push({ text, startOffset, endOffset, isWord: true });
    cursor = endOffset;
  }
  if (cursor < value.length) tokens.push({ text: value.slice(cursor), startOffset: cursor, endOffset: value.length, isWord: false });
  return tokens;
}

export function selectSentenceAt(text: string, offset: number): string {
  if (!text.trim()) return "";
  const safeOffset = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
  let start = 0;
  for (let index = 0; index < safeOffset; index += 1) {
    if (isSentenceBoundary(text, index)) start = afterClosingPunctuation(text, index);
  }
  let end = text.length;
  for (let index = safeOffset; index < text.length; index += 1) {
    if (isSentenceBoundary(text, index)) {
      end = afterClosingPunctuation(text, index);
      break;
    }
  }
  return text.slice(start, end).trim();
}

function isSentenceBoundary(text: string, index: number): boolean {
  const character = text[index];
  if (character !== "." && character !== "!" && character !== "?") return false;
  if (character !== ".") return true;
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  if (/[A-Za-z0-9]/.test(previous) && /[A-Za-z0-9]/.test(next)) return false;
  const tokenStart = Math.max(text.lastIndexOf(" ", index - 1), text.lastIndexOf("\n", index - 1), text.lastIndexOf("\t", index - 1)) + 1;
  const token = text.slice(tokenStart, index + 1).toLowerCase();
  return !ABBREVIATIONS.has(token);
}

function afterClosingPunctuation(text: string, index: number): number {
  let end = index + 1;
  while (/[\"'”’»)]/.test(text[end] ?? "")) end += 1;
  return end;
}
