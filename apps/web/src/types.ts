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
    speechText?: string;
  }>;
}

export interface RecordingReceipt {
  recordingId: string;
  mimeType: string;
  byteSize: number;
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
  }>;
  sentences: Array<{
    id: string;
    text: string;
    cloze?: string;
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
