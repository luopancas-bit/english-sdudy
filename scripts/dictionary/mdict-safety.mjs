export function cleanDictionaryDefinition(html) {
  const safe = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<link\b[^>]*>/giu, " ")
    .replace(/<(?:iframe|object|embed|form)\b[\s\S]*?<\/(?:iframe|object|embed|form)\s*>/giu, " ")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replace(/(?:javascript|data):/giu, "");
  return textContent(safe).replace(/\s+/g, " ").trim().slice(0, 10_000) || null;
}

export function dictionaryResourceReferences(html) {
  const result = new Set();
  for (const match of html.matchAll(/(?:sound:\/\/|(?:src|href)\s*=\s*["'])([^"'<>]+)["']?/giu)) {
    const key = match[1]?.trim().replace(/^sound:\/\//iu, "");
    if (key && isAllowedDictionaryResourceKey(key)) result.add(key);
  }
  return Array.from(result);
}

export function isAllowedDictionaryResourceKey(key) {
  if (!key || key.includes("..") || /[\u0000-\u001f\u007f]/u.test(key)) return false;
  if (key.startsWith("//") || /^[a-z][a-z0-9+.-]*:/iu.test(key)) return false;
  return /\.(?:mp3|m4a|ogg|wav|spx|png|jpe?g|gif|webp|svg|woff2?|ttf)$/iu.test(key);
}

function textContent(value) {
  return value.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&quot;/giu, '"').replace(/&#39;/giu, "'");
}
