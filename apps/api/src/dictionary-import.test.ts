import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDatabase,
  dictionarySources,
  migrate,
} from "@zhuguang/database";
import { syncPublishedDictionaries } from "./dictionary-import.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("published dictionary synchronization", () => {
  it("repairs a resumable import when audio resources arrive after pronunciations", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "zhuguang-dictionary-"));
    temporaryDirectories.push(directory);
    const published = path.join(directory, "dictionaries", "published");
    const resources = path.join(directory, "dictionaries", "resources", "resume@1");
    await fs.mkdir(published, { recursive: true });
    await fs.mkdir(resources, { recursive: true });

    const packageWithoutResource = dictionaryPackage([]);
    await fs.writeFile(path.join(published, "resume@1.json"), JSON.stringify(packageWithoutResource));

    const database = createDatabase("file::memory:");
    await migrate(database);
    await syncPublishedDictionaries(database, directory);

    const firstPronunciation = await database.query.pronunciations.findFirst();
    expect(firstPronunciation?.audioResourceId).toBeNull();

    await fs.writeFile(path.join(resources, "alpha-us.mp3"), "alpha-audio");
    const completedPackage = dictionaryPackage([{
      key: "alpha-us.mp3",
      path: "dictionaries/resources/resume@1/alpha-us.mp3",
      kind: "audio",
      mimeType: "audio/mpeg",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      byteSize: 12,
    }]);
    completedPackage.entries.push({ ...completedPackage.entries[0]!, key: "alpha-alias" });
    await fs.writeFile(
      path.join(published, "resume@1.json"),
      JSON.stringify(completedPackage),
    );
    await syncPublishedDictionaries(database, directory);

    const repairedPronunciation = await database.query.pronunciations.findFirst();
    expect(repairedPronunciation?.audioResourceId).toEqual(expect.any(String));
    expect(await database.query.dictionaryResources.findMany()).toHaveLength(1);
    expect(await database.query.dictionarySources.findMany()).toHaveLength(1);

    const unchangedTimestamp = "2026-01-01T00:00:00.000Z";
    await database.update(dictionarySources)
      .set({ updatedAt: unchangedTimestamp })
      .where(eq(dictionarySources.id, "resume@1"));
    await syncPublishedDictionaries(database, directory);
    expect(await database.query.pronunciations.findMany()).toHaveLength(1);
    expect((await database.query.dictionarySources.findFirst())?.updatedAt).toBe(unchangedTimestamp);
  });
});

function dictionaryPackage(resources: Array<{
  key: string;
  path: string;
  kind: "audio";
  mimeType: string;
  sha256: string;
  byteSize: number;
}>) {
  return {
    schemaVersion: 1,
    source: {
      id: "resume",
      name: "可恢复导入测试词典",
      version: "1",
      format: "json",
      license: "test-only",
      priority: 10,
    },
    entries: [{
      key: "alpha",
      term: "alpha",
      definition: "测试词条",
      partOfSpeech: "noun",
      rawNotation: "/ˈælfə/",
      pronunciations: [{
        accent: "us",
        ipa: "ˈælfə",
        rawPhonetic: "/ˈælfə/",
        notationSystem: "ipa",
        status: "verified",
        primary: true,
        partOfSpeech: "noun",
        audioResourceKey: "alpha-us.mp3",
      }],
    }],
    resources,
  };
}
