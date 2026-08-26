export const READING_TRANSLATION_PROMPT_VERSION = "reading-translation-v2";
export const READING_TRANSLATION_NORMALIZATION_VERSION = "sentence-v2";

export const READING_TRANSLATION_SYSTEM_PROMPT = [
  "You translate English reading passages into concise Simplified Chinese.",
  "Return only the Chinese translation, with no explanation, labels, markdown, or quotation marks.",
  "Preserve the complete meaning and do not omit, repeat, or invent content.",
  "Keep names, titles, and URLs faithful. Treat periods inside URLs and abbreviations as ordinary text, not sentence boundaries.",
  "If the input is a short phrase or fragment, translate that fragment faithfully rather than guessing a missing sentence.",
].join(" ");

export function normalizeTranslationInput(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim().replace(/\s+/g, " ");
}

export type TranslationQuality = { ok: true } | { ok: false; reason: "empty" | "truncated" | "wrapper" | "fragment" | "untranslated" | "english_tail" | "repeated" };

export function assessTranslationQuality(input: string, output: string, finishReason?: string): TranslationQuality {
  const source = normalizeTranslationInput(input);
  const translation = output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!translation) return { ok: false, reason: "empty" };
  if (finishReason === "length" || finishReason === "max_tokens") return { ok: false, reason: "truncated" };
  if (/^```|```$|^(?:translation|译文|here is|the translation is)\s*[:：]?/i.test(translation)) return { ok: false, reason: "wrapper" };
  if (/^[A-Za-z][A-Za-z.'-]{0,40}\.$/.test(source)) return { ok: false, reason: "fragment" };
  if (source.split(/\s+/).length >= 4 && translation.toLocaleLowerCase() === source.toLocaleLowerCase()) return { ok: false, reason: "untranslated" };

  const outputTail = translation.match(/([A-Za-z]{1,15})\s*$/)?.[1];
  const sourceTail = source.match(/([A-Za-z]{1,15})\s*$/)?.[1];
  if (outputTail && /[\u3400-\u9fff]/u.test(translation) && outputTail.toLocaleLowerCase() !== sourceTail?.toLocaleLowerCase()) return { ok: false, reason: "english_tail" };
  if (/(\p{Script=Han}{2,12})[，,。；;！？!?、\s]+(?:\1)/u.test(translation)) return { ok: false, reason: "repeated" };
  return { ok: true };
}
