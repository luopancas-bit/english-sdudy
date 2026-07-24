import type { Assessment, DashboardData } from "./types";

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
