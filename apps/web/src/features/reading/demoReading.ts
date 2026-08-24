import type { ReadingBookDetail, ReadingLibraryData } from "../../types";

const titles = [
  ["The Tale of Peter Rabbit", "彼得兔的故事", "Beatrix Potter", "entry"], ["The Wonderful Wizard of Oz", "绿野仙踪", "L. Frank Baum", "entry"],
  ["The Gift of the Magi", "麦琪的礼物", "O. Henry", "entry"], ["The Strange Case of Dr. Jekyll and Mr. Hyde", "化身博士", "Robert Louis Stevenson", "entry"],
  ["The Adventures of Sherlock Holmes", "福尔摩斯冒险史", "Arthur Conan Doyle", "intermediate"], ["The Time Machine", "时间机器", "H. G. Wells", "intermediate"],
  ["Narrative of the Life of Frederick Douglass", "弗雷德里克·道格拉斯自传", "Frederick Douglass", "intermediate"], ["Travels with a Donkey in the Cévennes", "携驴旅行记", "Robert Louis Stevenson", "intermediate"],
  ["Frankenstein", "弗兰肯斯坦", "Mary Shelley", "challenge"], ["Pride and Prejudice", "傲慢与偏见", "Jane Austen", "challenge"], ["Walden", "瓦尔登湖", "Henry David Thoreau", "challenge"], ["On the Origin of Species", "物种起源", "Charles Darwin", "challenge"],
] as const;

export const demoReadingLibrary: ReadingLibraryData = {
  enabled: true, uploadEnabled: true, role: "admin", continueReading: "demo-oz",
  quota: { books: 2, maxBooks: 100, bytes: 286 * 1024 * 1024, maxBytes: 5 * 1024 * 1024 * 1024 },
  books: titles.map(([title, titleZh, author, difficulty], index) => ({
    id: index === 1 ? "demo-oz" : `demo-${index}`, title, titleZh, author, description: "Project Gutenberg 公版英文原著，难度为系统估算。",
    language: "en", format: "epub", visibility: "curated", sourceType: "gutenberg", status: "ready", difficulty,
    cefrHint: difficulty === "entry" ? "A2–B1" : difficulty === "intermediate" ? "B1–B2" : "B2–C1", wordCount: 42_000 + index * 3_700,
    chapterCount: 27, byteSize: 1_400_000, drmStatus: "none", progress: index === 1 ? 45 : index === 4 ? 28 : index === 5 ? 12 : 0,
    furthestProgress: index === 1 ? 45 : 0, currentChapter: index === 1 ? 11 : 0, lastReadAt: index === 1 ? new Date().toISOString() : null,
    preferences: { mode: "scroll", fontScale: 1, lineHeight: 1.9, theme: "paper", publisherStyles: false },
  })),
};

export const demoReadingBook: ReadingBookDetail = {
  book: demoReadingLibrary.books[1]!, annotations: [{ id: "demo-note", bookId: "demo-oz", chapterIndex: 0, kind: "note", startOffset: 0, endOffset: 34, quote: "Do not be afraid of me", note: "注意 afraid of 的搭配。", color: "green", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
  manifest: { version: 1, title: "The Wonderful Wizard of Oz", chapters: [
    { title: "Chapter XII — The Search for the Wicked Witch", text: "The road led through a country that was at first pleasant enough, but after a while it became rough and wild. The trees grew close together, and their branches interlaced above the travelers, so that the sunshine could scarcely penetrate to the ground. Dorothy was much frightened, and clung to the Lion's mane, while the Scarecrow, who rode ahead, whistled to keep up his courage.\n\nAt length they came to a place where the trees were so thick and the undergrowth so tangled that they could go no farther. ‘This is a bad country,’ said the Tin Woodman. ‘I am afraid the Wicked Witch of the West lives here.’\n\nJust as he spoke, a great gray Wolf sprang out from behind a tree and stood growling before them. The Lion stepped back, trembling, for all his bravery, and Dorothy hid her face in his mane.\n\n‘Do not be afraid of me,’ said the Wolf; ‘I am not so fierce as I seem.’" },
    { title: "Chapter XIII — The Rescue", text: "The friends rested beneath the trees until morning. Dorothy opened her eyes to a quiet forest and remembered that courage often arrives after fear, not before it. Together they continued along the narrow road." },
  ] },
};
