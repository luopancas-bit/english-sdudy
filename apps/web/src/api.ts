import type { AccountSession, Assessment, AttemptResult, CourseMapData, DashboardData, LearningReportData, LessonContent, RecordingReceipt, ReviewCenterData, User, VocabularyData, VocabularyEntry, VocabularyInput, VocabularyTrainingInput, WordAssessment, WordAssessmentResult, WordMemoryChapter, WordMemoryStats, WordReviewResult, WordReviewsData } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body as T;
}

export const api = {
  me: () => request<User>("/api/me"),
  login: (username: string, password: string) =>
    request<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  register: (input: { username: string; password: string; nickname: string; invitationCode: string }) =>
    request<User>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  updateProfile: (input: {
    nickname?: string;
    dailyMinutes?: number;
    preferredAccent?: "us" | "uk";
    reminderTime?: string | null;
  }) =>
    request<User>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true; otherSessionsRevoked: true }>("/api/me/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  sessions: () => request<{ sessions: AccountSession[] }>("/api/me/sessions"),
  removeSession: (sessionId: string) =>
    request<{ ok: true; removedCurrent: boolean }>(`/api/me/sessions/${sessionId}`, {
      method: "DELETE",
    }),
  dashboard: () => request<DashboardData>("/api/dashboard"),
  courseMap: () => request<CourseMapData>("/api/course-map"),
  learningReport: () => request<LearningReportData>("/api/learning-report"),
  vocabulary: () => request<VocabularyData>("/api/vocabulary"),
  addVocabulary: (input: VocabularyInput) =>
    request<VocabularyEntry>("/api/vocabulary", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateVocabularyStatus: (entryId: string, status: VocabularyEntry["status"]) =>
    request<VocabularyEntry>(`/api/vocabulary/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  recordVocabularyTraining: (input: VocabularyTrainingInput) =>
    request<{ attemptId: string; occurredAt: string }>("/api/vocabulary/training-attempts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  wordMemoryChapters: () =>
    request<{ chapters: WordMemoryChapter[] }>("/api/word-memory/chapters"),
  wordMemoryStats: () => request<WordMemoryStats>("/api/word-memory/stats"),
  wordReviews: () => request<WordReviewsData>("/api/word-memory/reviews"),
  submitWordReview: (reviewId: string, answer: {
    meaning: string;
    listening: string;
    spelling: string;
    context: string;
  }) => request<WordReviewResult>(`/api/word-memory/reviews/${reviewId}`, {
    method: "POST",
    body: JSON.stringify(answer),
  }),
  wordAssessment: (lessonId: number) =>
    request<WordAssessment>(`/api/word-memory/chapters/${lessonId}/assessment`),
  submitWordAssessment: (lessonId: number, answers: Array<{
    term: string;
    meaning: string;
    listening: string;
    spelling: string;
    context: string;
  }>) =>
    request<WordAssessmentResult>(`/api/word-memory/chapters/${lessonId}/assessment`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  recordWordMemoryTraining: (input: Omit<VocabularyTrainingInput, "entryId"> & {
    lessonId: number;
    itemType: "word" | "sentence";
    itemKey: string;
  }) =>
    request<{ attemptId: string; occurredAt: string }>("/api/word-memory/training-attempts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  reviewCenter: () => request<ReviewCenterData>("/api/review-center"),
  lesson: (lessonId: number) => request<LessonContent>(`/api/lessons/${lessonId}`),
  assessment: (lessonId: number) => request<Assessment>(`/api/lessons/${lessonId}/assessment`),
  uploadRecording: async (lessonId: number, questionId: string, blob: Blob) => {
    const response = await fetch(`/api/lessons/${lessonId}/recordings/${encodeURIComponent(questionId)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    });
    const body = (await response.json().catch(() => ({}))) as RecordingReceipt & { error?: string };
    if (!response.ok) throw new Error(body.error || "录音上传失败");
    return body;
  },
  submitAttempt: (
    lessonId: number,
    answers: Record<string, string>,
    kind: "formal" | "practice" | "review" = "formal",
    recordings: Record<string, string> = {},
  ) =>
    request<AttemptResult>(`/api/lessons/${lessonId}/attempts`, {
      method: "POST",
      body: JSON.stringify({ kind, answers, recordings }),
    }),
};
