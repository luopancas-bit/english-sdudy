import { describe, expect, it } from "vitest";
import { cleanDictionaryDefinition, dictionaryResourceReferences, isAllowedDictionaryResourceKey } from "./mdict-safety.mjs";

describe("MDict content safety", () => {
  it("removes executable and presentation markup before storing a definition", () => {
    const html = '<style>.x{display:none}</style><script>alert(1)</script><div onclick="run()" style="color:red">keep <b>this</b></div>';

    expect(cleanDictionaryDefinition(html)).toBe("keep this");
  });

  it("keeps local media references but rejects URLs and data payloads", () => {
    const html = '<audio src="sound://us_pron/alpha.mp3"></audio><img src="data:image/png;base64,AAAA"><img src="//cdn.example/alpha.png"><script src="evil.js"></script>';

    expect(dictionaryResourceReferences(html)).toEqual(["us_pron/alpha.mp3"]);
    expect(isAllowedDictionaryResourceKey("us_pron/alpha.mp3")).toBe(true);
    expect(isAllowedDictionaryResourceKey("data:image/png")).toBe(false);
    expect(isAllowedDictionaryResourceKey("//cdn.example/alpha.png")).toBe(false);
    expect(isAllowedDictionaryResourceKey("../alpha.mp3")).toBe(false);
  });
});
