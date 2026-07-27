import type { Assessment, CourseMapData, DashboardData, LessonContent, ReviewCenterData, VocabularyData } from "./types";

export const demoDashboard: DashboardData = {
  learner: {
    id: "demo",
    username: "lin",
    nickname: "林同学",
    role: "learner",
    dailyMinutes: 28,
    preferredAccent: "us",
    reminderTime: "18:30",
  },
  longTermMastery: 68,
  dueReviews: 4,
  weakItems: 3,
  currentLesson: 8,
  currentLessonTitle: "电脑 · Computer",
  dimensions: { listening: 74, reading: 82, speaking: 61, writing: 66 },
  history: [
    { id: "demo-7", lessonId: 7, title: "智能手机", kind: "formal", score: 68, occurredAt: "2026-07-24T02:32:00Z" },
    { id: "demo-6", lessonId: 6, title: "电子邮件", kind: "review", score: 84, occurredAt: "2026-07-23T12:15:00Z" },
    { id: "demo-5", lessonId: 5, title: "互联网", kind: "review", score: 92, occurredAt: "2026-07-21T10:40:00Z" },
  ],
  studyStreak: 3,
  nextReview: {
    lessonId: 5,
    title: "互联网",
    dueAt: "2026-07-27T10:30:00+08:00",
  },
  plan: {
    reviewMinutes: 12,
    weakMinutes: 6,
    newLessonMinutes: 10,
  },
};

export const demoAssessment: Assessment = {
  lessonId: 8,
  title: "电脑 · Computer",
  questions: [
    {
      id: "l8-listen-1",
      dimension: "listening",
      type: "choice",
      prompt: "听音频后，选择句子中提到的主要用途。",
      options: ["发送电子邮件", "制作木桌", "种植花卉", "修理汽车"],
      points: 1,
    },
    {
      id: "l8-read-1",
      dimension: "reading",
      type: "text",
      prompt: "用一句话概括本段的核心观点。",
      points: 1,
    },
  ],
};

export const demoLesson: LessonContent = {
  id: 8,
  slug: "lesson-08",
  titleEn: "Computer",
  titleZh: "电脑",
  englishText: "A computer helps me organize my work. I use it to write documents, check email, and learn new things. It is useful, but I also remember to rest my eyes.",
  chineseText: "电脑帮助我整理工作。我用它撰写文档、查看邮件和学习新知识。它很有用，但我也会记得让眼睛休息。",
  audio: { us: null, uk: null },
  vocabulary: [
    { term: "organize", definition: "组织；整理" },
    { term: "document", definition: "文件；文档" },
    { term: "useful", definition: "有用的" },
  ],
  sentences: [
    { id: "08-01", text: "A computer helps me organize my work.", cloze: "organize" },
    { id: "08-02", text: "I use it to write documents, check email, and learn new things.", cloze: "document" },
    { id: "08-03", text: "It is useful, but I also remember to rest my eyes.", cloze: "useful" },
  ],
};

export const demoCourseMap: CourseMapData = {
  summary: {
    totalLessons: 3,
    studiedLessons: 2,
    masteredLessons: 1,
    averageScore: 80,
  },
  lessons: [
    {
      lessonId: 1,
      title: "日常问候 · Greetings",
      unlocked: true,
      state: "mastered",
      score: 92,
      band: "proficient",
      review: {
        dueAt: "2026-08-02T10:00:00Z",
        step: 3,
        weakDimensions: [],
      },
    },
    {
      lessonId: 2,
      title: "家庭成员 · Family",
      unlocked: true,
      state: "review-due",
      score: 68,
      band: "developing",
      review: {
        dueAt: "2026-07-26T08:00:00Z",
        step: 1,
        weakDimensions: ["speaking", "writing"],
      },
    },
    {
      lessonId: 3,
      title: "时间安排 · Time",
      unlocked: true,
      state: "ready",
      score: null,
      band: null,
      review: null,
    },
  ],
};

export const demoVocabulary: VocabularyData = {
  summary: {
    total: 3,
    learning: 2,
    mastered: 1,
  },
  entries: [
    {
      id: "demo-vocab-1",
      term: "organize",
      meaning: "组织；整理",
      example: "The computer helps me organize my work.",
      lessonId: 3,
      status: "learning",
      createdAt: "2026-07-24T09:00:00Z",
      updatedAt: "2026-07-26T09:00:00Z",
    },
    {
      id: "demo-vocab-2",
      term: "on the way to",
      meaning: "在去往……的路上",
      example: "I check email on the way to work.",
      lessonId: 2,
      status: "learning",
      createdAt: "2026-07-23T09:00:00Z",
      updatedAt: "2026-07-25T09:00:00Z",
    },
    {
      id: "demo-vocab-3",
      term: "schedule",
      meaning: "日程；安排",
      example: "I keep a simple study schedule.",
      lessonId: 1,
      status: "mastered",
      createdAt: "2026-07-20T09:00:00Z",
      updatedAt: "2026-07-24T09:00:00Z",
    },
  ],
};

export const demoReviewCenter: ReviewCenterData = {
  due: [
    {
      lessonId: 5,
      title: "互联网 · Internet",
      dueAt: "2026-07-26T10:30:00Z",
      step: 2,
      weakDimensions: ["speaking", "writing"],
    },
    {
      lessonId: 7,
      title: "智能手机 · Smartphone",
      dueAt: "2026-07-26T08:00:00Z",
      step: 1,
      weakDimensions: ["listening"],
    },
  ],
  upcoming: [
    {
      lessonId: 6,
      title: "电子邮件 · Email",
      dueAt: "2026-07-28T10:00:00Z",
      step: 3,
      weakDimensions: [],
    },
  ],
  wrongAnswers: [
    {
      lessonId: 7,
      lessonTitle: "智能手机 · Smartphone",
      questionId: "demo-wrong-1",
      dimension: "listening",
      prompt: "听音频后，选择说话人提到的主要用途。",
      sourceSentence: "I use my smartphone to check email on the way to work.",
      lastAnswer: "浏览新闻",
      errorCount: 2,
      updatedAt: "2026-07-24T02:32:00Z",
    },
    {
      lessonId: 8,
      lessonTitle: "电脑 · Computer",
      questionId: "demo-wrong-2",
      dimension: "writing",
      prompt: "根据音频写出完整句子。",
      sourceSentence: "The computer helps me organize my work.",
      lastAnswer: "The computer help organize work.",
      errorCount: 1,
      updatedAt: "2026-07-25T09:10:00Z",
    },
  ],
};
