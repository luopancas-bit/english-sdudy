export interface User {
  id: string;
  username: string;
  nickname: string;
  role: "learner" | "admin";
  dailyMinutes: number;
  preferredAccent: "us" | "uk";
  reminderTime: string | null;
}

export interface AccountSession {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface DashboardData {
  learner: User;
  longTermMastery: number;
  dueReviews: number;
  weakItems: number;
  currentLesson: number;
  currentLessonTitle: string;
  dimensions: {
    listening: number;
    reading: number;
    speaking: number;
    writing: number;
  };
  history: Array<{
    id: string;
    lessonId: number;
    title: string;
    kind: "formal" | "practice" | "review";
    score: number;
    occurredAt: string;
  }>;
  studyStreak: number;
  nextReview: {
    lessonId: number;
    title: string;
    dueAt: string;
  } | null;
  plan: {
    reviewMinutes: number;
    weakMinutes: number;
    newLessonMinutes: number;
  };
}

export interface Assessment {
  lessonId: number;
  title: string;
  questions: Array<{
    id: string;
    dimension: "listening" | "reading" | "speaking" | "writing";
    type: "choice" | "text" | "speech";
    prompt: string;
    options?: string[];
    points: number;
    audioUrl?: string;
    audioStart?: number;
    audioEnd?: number;
    audioMode?: "word" | "sentence";
    speechText?: string;
  }>;
}

export interface RecordingReceipt {
  recordingId: string;
  mimeType: string;
  byteSize: number;
}

export interface AssessmentDraft {
  userId: string;
  lessonId: number;
  kind: "formal" | "practice" | "review";
  currentIndex: number;
  answers: Record<string, string>;
  recordings: Record<string, string>;
  updatedAt: string;
}

export interface LessonContent {
  id: number;
  slug: string;
  titleEn: string;
  titleZh: string;
  englishText: string;
  chineseText: string;
  audio: {
    us: string | null;
    uk: string | null;
  };
  vocabulary: Array<{
    term: string;
    definition: string;
    sourcePage?: number;
    pronunciation?: PronunciationData | undefined;
  }>;
  sentences: Array<{
    id: string;
    text: string;
    cloze?: string;
  }>;
}

export interface AccentPronunciation {
  ipa: string | null;
  alternatives: Array<{ ipa: string; partOfSpeech: string | null }>;
  audioUrl: string | null;
}

export interface PronunciationData {
  status: "verified" | "pending" | "ambiguous";
  us: AccentPronunciation;
  uk: AccentPronunciation;
  parts: Array<{
    term: string;
    status: "verified" | "pending" | "ambiguous";
    us: AccentPronunciation;
    uk: AccentPronunciation;
  }>;
}

export interface AttemptResult {
  attemptId: string;
  countsTowardMastery: boolean;
  scores: DashboardData["dimensions"];
  mastery: {
    score: number;
    band: string;
    dimensions: DashboardData["dimensions"];
  };
}

export interface ReviewLesson {
  lessonId: number;
  title: string;
  dueAt: string;
  step: number;
  weakDimensions: Array<keyof DashboardData["dimensions"]>;
}

export interface WrongAnswerItem {
  lessonId: number;
  lessonTitle: string;
  questionId: string;
  dimension: keyof DashboardData["dimensions"];
  prompt: string;
  sourceSentence: string;
  lastAnswer: string | null;
  errorCount: number;
  updatedAt: string;
}

export interface ReviewCenterData {
  due: ReviewLesson[];
  upcoming: ReviewLesson[];
  wrongAnswers: WrongAnswerItem[];
}

export type CourseMapLessonState =
  | "locked"
  | "ready"
  | "review-due"
  | "strengthening"
  | "mastered"
  | "long-term";

export interface CourseMapLesson {
  lessonId: number;
  title: string;
  unlocked: boolean;
  state: CourseMapLessonState;
  score: number | null;
  band: string | null;
  review: {
    dueAt: string;
    step: number;
    weakDimensions: Array<keyof DashboardData["dimensions"]>;
  } | null;
}

export interface CourseMapData {
  summary: {
    totalLessons: number;
    studiedLessons: number;
    masteredLessons: number;
    averageScore: number;
  };
  lessons: CourseMapLesson[];
}

export interface VocabularyEntry {
  id: string;
  term: string;
  meaning: string;
  example: string | null;
  lessonId: number | null;
  status: "learning" | "mastered";
  createdAt: string;
  updatedAt: string;
  pronunciation?: PronunciationData | undefined;
}

export interface VocabularyData {
  summary: {
    total: number;
    learning: number;
    mastered: number;
  };
  entries: VocabularyEntry[];
}

export interface VocabularyInput {
  term: string;
  meaning: string;
  example?: string | null;
  lessonId?: number | null;
}

export interface VocabularyTrainingInput {
  entryId: string;
  mode: "guided" | "dictation";
  firstTryCorrect: boolean;
  correctionCount: number;
  durationMs: number;
  device: "desktop" | "mobile";
}

export interface DictionaryStatusData {
  summary: {
    entries: number;
    us: number;
    uk: number;
    dual: number;
    pending: number;
    ambiguous: number;
    openConflicts: number;
  };
  sources: Array<{
    id: string;
    name: string;
    version: string;
    format: "builtin" | "mdx" | "json" | "api";
    status: "staging" | "active" | "disabled";
    priority: number;
    importedAt: string;
  }>;
}

export interface WordMemoryChapter {
  lessonId: number;
  titleEn: string;
  titleZh: string;
  vocabularyCount: number;
  sentenceCount: number;
}

export interface TypingTrainingEntry {
  id: string;
  term: string;
  meaning: string;
  example: string | null;
  pronunciation?: PronunciationData | undefined;
  recordEntryId?: string;
  wordMemory?: {
    lessonId: number;
    itemType: "word" | "sentence";
    itemKey: string;
  };
}

export interface WordMemoryStats {
  summary: {
    attempts: number;
    practicedItems: number;
    firstTryAccuracy: number;
    corrections: number;
    formalAttempts: number;
    masteredWords: number;
  };
  lessons: Array<{
    lessonId: number;
    attempts: number;
    practicedItems: number;
    firstTryAccuracy: number;
    corrections: number;
    lastPracticedAt: string;
    formalAttempts: number;
    masteredWords: number;
  }>;
}

export interface WordAssessment {
  lessonId: number;
  passingScore: number;
  items: Array<{
    term: string;
    meaningOptions: string[];
    sentenceId: string;
    clozePrompt: string;
    spellingPrompt: string;
    audioUrl: string;
    pronunciation?: PronunciationData | undefined;
    audioStart?: number;
    audioEnd?: number;
  }>;
}

export interface WordAssessmentResult {
  attemptAt: string;
  passingScore: number;
  masteredCount: number;
  results: Array<{
    term: string;
    meaning: number;
    listening: number;
    spelling: number;
    context: number;
    total: number;
    passed: boolean;
  }>;
}

export interface WordReviewTask {
  id: string;
  lessonId: number;
  term: string;
  normalizedTerm: string;
  status: "learning" | "reviewing" | "mastered";
  step: number;
  dueAt: string;
  lastScore: number;
  task: {
    meaningOptions: string[];
    clozePrompt: string;
    spellingPrompt: string;
    audioUrl: string;
    pronunciation?: PronunciationData | undefined;
  } | null;
}

export interface WordReviewEvidence {
  id: string;
  reviewId: string;
  lessonId: number;
  term: string;
  meaning: number;
  listening: number;
  spelling: number;
  context: number;
  total: number;
  passed: boolean;
  decision: "advance" | "retreat" | "master";
  stepBefore: number;
  stepAfter: number;
  occurredAt: string;
}

export interface WordReviewsData {
  due: WordReviewTask[];
  upcoming: WordReviewTask[];
  history: WordReviewEvidence[];
}

export interface WordReviewResult {
  review: Omit<WordReviewTask, "task">;
  evidence: WordReviewEvidence;
}

export interface LearningReportData {
  summary: {
    totalAttempts: number;
    studiedDays: number;
    studyStreak: number;
    averageScore: number;
  };
  dimensions: DashboardData["dimensions"];
  daily: Array<{
    date: string;
    attempts: number;
    averageScore: number;
  }>;
  lessons: Array<{
    lessonId: number;
    title: string;
    score: number;
    band: string;
    dimensions: DashboardData["dimensions"];
    updatedAt: string;
  }>;
}

export type ReadingBookStatus = "queued" | "processing" | "ready" | "protected" | "failed" | "deleted";
export interface ReadingBook {
  id: string; externalId: string | null; title: string; titleZh: string | null; author: string | null; description: string | null;
  language: string; format: string; visibility: "private" | "curated" | "public"; sourceType: "upload" | "gutenberg" | "builtin";
  status: ReadingBookStatus; difficulty: "entry" | "intermediate" | "challenge" | null; cefrHint: string | null;
  wordCount: number | null; chapterCount: number; byteSize: number; drmStatus: "none" | "protected" | "unknown";
  shelved: boolean; progress: number; furthestProgress: number; currentChapter: number; lastReadAt: string | null;
  preferences: ReadingPreferences;
}
export interface ReadingPreferences { mode: "scroll" | "paged"; fontScale: number; lineHeight: number; theme: "paper" | "white" | "sepia" | "dark"; publisherStyles: boolean; }
export interface ReadingLibraryData {
  enabled: boolean; uploadEnabled: boolean; role: "learner" | "admin";
  quota: { books: number; maxBooks: number; bytes: number; maxBytes: number };
  books: ReadingBook[]; continueReading: string | null;
}
export interface ReadingManifest { version: 1; title: string; chapters: Array<{ title: string; text: string }> }
export interface ReadingAnnotation { id: string; bookId: string; chapterIndex: number; kind: "bookmark" | "highlight" | "note" | "translation"; startOffset: number; endOffset: number; quote: string | null; note: string | null; color: string | null; createdAt: string; updatedAt: string; }
export interface ReadingBookDetail { book: ReadingBook; annotations: ReadingAnnotation[]; manifest: ReadingManifest | null; }
export interface ReadingLookupResult { term: string; lemma: string; pronunciation: PronunciationData | null; meanings: Array<{ partOfSpeech: string | null; definition: string }>; source: string; }
export interface GutenbergBook { id: string; title: string; author: string; downloadUrl: string | null; sourceUrl: string | null; }
