import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import {
  dictionaryConflicts,
  dictionaryEntries,
  dictionaryEntrySources,
  dictionaryResources,
  dictionarySources,
  pronunciations,
  type Database,
} from "@zhuguang/database";
import { z } from "zod";

const packageSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    id: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/),
    name: z.string().min(1).max(120),
    version: z.string().min(1).max(40),
    format: z.enum(["builtin", "mdx", "json", "api"]),
    license: z.string().max(200).nullable(),
    priority: z.number().int().min(1).max(1_000),
  }),
  entries: z.array(z.object({
    key: z.string().min(1).max(300),
    term: z.string().min(1).max(300),
    definition: z.string().max(10_000).nullable(),
    partOfSpeech: z.string().max(80).nullable(),
    rawNotation: z.string().max(1_000).nullable(),
    pronunciations: z.array(z.object({
      accent: z.enum(["us", "uk"]),
      ipa: z.string().min(1).max(200),
      rawPhonetic: z.string().max(300).nullable(),
      notationSystem: z.enum(["ipa", "dj", "kk", "unknown"]),
      status: z.enum(["verified", "pending", "ambiguous"]),
      primary: z.boolean(),
      partOfSpeech: z.string().max(80).nullable(),
      audioResourceKey: z.string().max(500).nullable().optional(),
    })),
  })),
  resources: z.array(z.object({
    key: z.string().min(1).max(500),
    path: z.string().min(1).max(1_000),
    kind: z.enum(["audio", "image", "font"]),
    mimeType: z.string().min(1).max(120),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().positive().max(20_000_000),
  })).default([]),
});

export async function syncPublishedDictionaries(database: Database, contentDirectory: string) {
  const directory = path.join(contentDirectory, "dictionaries", "published");
  let files: string[];
  try {
    files = (await fs.readdir(directory)).filter((filename) => filename.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const filename of files) {
    const candidate = path.resolve(directory, filename);
    if (!candidate.startsWith(`${path.resolve(directory)}${path.sep}`)) continue;
    const parsed = packageSchema.parse(JSON.parse(await fs.readFile(candidate, "utf8")));
    await syncPackage(database, parsed);
  }
}

async function syncPackage(database: Database, dictionaryPackage: z.infer<typeof packageSchema>) {
  const sourceId = `${dictionaryPackage.source.id}@${dictionaryPackage.source.version}`;
  const existing = await database.query.dictionarySources.findFirst({
    where: eq(dictionarySources.id, sourceId),
  });
  if (existing?.status === "active") {
    const [resourceRows, entryRows, pronunciationRows] = await Promise.all([
      database.query.dictionaryResources.findMany({
        where: eq(dictionaryResources.sourceId, sourceId),
      }),
      database.query.dictionaryEntrySources.findMany({
        where: eq(dictionaryEntrySources.sourceId, sourceId),
      }),
      database.query.pronunciations.findMany({
        where: eq(pronunciations.sourceId, sourceId),
      }),
    ]);
    const expectedResourceCount = new Set(dictionaryPackage.resources.map((resource) => resource.key)).size;
    const expectedEntrySourceCount = new Set(dictionaryPackage.entries.map((entry) => entry.key)).size;
    const expectedPronunciationCount = new Set(dictionaryPackage.entries.flatMap((entry) =>
      entry.pronunciations.map((pronunciation) =>
        `${normalizeTerm(entry.term)}\u0000${pronunciation.accent}\u0000${normalizeIpa(pronunciation.ipa)}`,
      ),
    )).size;
    if (
      resourceRows.length >= expectedResourceCount &&
      entryRows.length >= expectedEntrySourceCount &&
      pronunciationRows.length >= expectedPronunciationCount
    ) {
      return;
    }
  }
  const now = new Date().toISOString();
  await database.insert(dictionarySources).values({
    id: sourceId,
    name: dictionaryPackage.source.name,
    version: dictionaryPackage.source.version,
    format: dictionaryPackage.source.format,
    license: dictionaryPackage.source.license,
    priority: dictionaryPackage.source.priority,
    status: "active",
    importedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: dictionarySources.id,
    set: { status: "active", priority: dictionaryPackage.source.priority, updatedAt: now },
  });
  const activeSources = await database.query.dictionarySources.findMany({
    where: eq(dictionarySources.status, "active"),
  });
  const activeSourceIds = new Set(activeSources.map((source) => source.id));
  for (const resource of dictionaryPackage.resources) {
    await database.insert(dictionaryResources).values({
      id: crypto.randomUUID(),
      sourceId,
      resourceKey: resource.key,
      kind: resource.kind,
      storagePath: resource.path,
      mimeType: resource.mimeType,
      sha256: resource.sha256,
      byteSize: resource.byteSize,
      createdAt: now,
    }).onConflictDoUpdate({
      target: [dictionaryResources.sourceId, dictionaryResources.resourceKey],
      set: {
        kind: resource.kind,
        storagePath: resource.path,
        mimeType: resource.mimeType,
        sha256: resource.sha256,
        byteSize: resource.byteSize,
      },
    });
  }
  const sourceResources = await database.query.dictionaryResources.findMany({
    where: eq(dictionaryResources.sourceId, sourceId),
  });
  const resourceByKey = new Map(sourceResources.map((resource) => [resource.resourceKey, resource]));

  for (const item of dictionaryPackage.entries) {
    const normalizedTerm = normalizeTerm(item.term);
    if (!normalizedTerm) continue;
    await database.insert(dictionaryEntries).values({
      id: crypto.randomUUID(),
      term: item.term,
      normalizedTerm,
      status: entryStatus(item.pronunciations),
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: dictionaryEntries.normalizedTerm,
      set: { term: item.term, updatedAt: now },
    });
    const entry = await database.query.dictionaryEntries.findFirst({
      where: eq(dictionaryEntries.normalizedTerm, normalizedTerm),
    });
    if (!entry) continue;
    await database.insert(dictionaryEntrySources).values({
      id: crypto.randomUUID(),
      entryId: entry.id,
      sourceId,
      sourceEntryKey: item.key,
      definition: item.definition,
      partOfSpeech: item.partOfSpeech,
      rawNotation: item.rawNotation,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [dictionaryEntrySources.sourceId, dictionaryEntrySources.sourceEntryKey],
      set: {
        entryId: entry.id,
        definition: item.definition,
        partOfSpeech: item.partOfSpeech,
        rawNotation: item.rawNotation,
        updatedAt: now,
      },
    });
    const existingPronunciations = await database.query.pronunciations.findMany({
      where: eq(pronunciations.entryId, entry.id),
    });
    let hasConflict = false;
    for (const pronunciation of item.pronunciations) {
      const normalizedIpa = normalizeIpa(pronunciation.ipa);
      const conflictingRows = existingPronunciations.filter((row) =>
        row.sourceId !== sourceId
        && activeSourceIds.has(row.sourceId)
        && row.accent === pronunciation.accent
        && row.ipa
        && row.ipa !== normalizedIpa,
      );
      if (conflictingRows.length) {
        hasConflict = true;
        await database.insert(dictionaryConflicts).values({
          id: crypto.randomUUID(),
          entryId: entry.id,
          kind: "phonetic",
          details: {
            accent: pronunciation.accent,
            incoming: { sourceId, ipa: normalizedIpa },
            existing: conflictingRows.map((row) => ({ sourceId: row.sourceId, ipa: row.ipa })),
          },
          status: "open",
          createdAt: now,
          resolvedAt: null,
        });
      }
      await database.insert(pronunciations).values({
        id: crypto.randomUUID(),
        entryId: entry.id,
        sourceId,
        accent: pronunciation.accent,
        ipa: normalizedIpa,
        rawPhonetic: pronunciation.rawPhonetic,
        notationSystem: pronunciation.notationSystem,
        status: pronunciation.status,
        isPrimary: pronunciation.primary,
        partOfSpeech: pronunciation.partOfSpeech,
        audioResourceId: pronunciation.audioResourceKey
          ? resourceByKey.get(pronunciation.audioResourceKey)?.id ?? null
          : null,
        verifiedAt: pronunciation.status === "verified" ? now : null,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [pronunciations.entryId, pronunciations.sourceId, pronunciations.accent, pronunciations.ipa],
        set: {
          rawPhonetic: pronunciation.rawPhonetic,
          notationSystem: pronunciation.notationSystem,
          status: pronunciation.status,
          isPrimary: pronunciation.primary,
          partOfSpeech: pronunciation.partOfSpeech,
          audioResourceId: pronunciation.audioResourceKey
            ? resourceByKey.get(pronunciation.audioResourceKey)?.id ?? null
            : null,
          verifiedAt: pronunciation.status === "verified" ? now : null,
          updatedAt: now,
        },
      });
    }
    const current = await database.query.pronunciations.findMany({
      where: and(eq(pronunciations.entryId, entry.id), eq(pronunciations.sourceId, sourceId)),
    });
    const openConflict = hasConflict || Boolean(await database.query.dictionaryConflicts.findFirst({
      where: and(eq(dictionaryConflicts.entryId, entry.id), eq(dictionaryConflicts.status, "open")),
    }));
    const status = openConflict
      ? "ambiguous" as const
      : entryStatus(current.map((row) => ({ accent: row.accent, status: row.status })));
    await database.update(dictionaryEntries).set({ status, updatedAt: now }).where(eq(dictionaryEntries.id, entry.id));
  }
}

function normalizeTerm(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function normalizeIpa(value: string) {
  const trimmed = value.normalize("NFC").trim();
  const withoutOpening = trimmed.startsWith("/") || trimmed.startsWith("[") ? trimmed.slice(1) : trimmed;
  return withoutOpening.endsWith("/") || withoutOpening.endsWith("]") ? withoutOpening.slice(0, -1) : withoutOpening;
}

function entryStatus(rows: Array<{ accent: "us" | "uk"; status: "verified" | "pending" | "ambiguous" }>) {
  if (rows.some((row) => row.status === "ambiguous")) return "ambiguous" as const;
  const verified = new Set(rows.filter((row) => row.status === "verified").map((row) => row.accent));
  return verified.has("us") && verified.has("uk") ? "verified" as const : "pending" as const;
}
