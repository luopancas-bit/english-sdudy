import type { AccountSession, Assessment, AssessmentDraft, AttemptResult, CourseMapData, DashboardData, DictionaryStatusData, GutenbergBook, LearningReportData, LessonContent, ReadingAnnotation, ReadingBookDetail, ReadingLibraryData, ReadingLookupResult, ReadingPreferences, RecordingReceipt, ReviewCenterData, User, VocabularyData, VocabularyEntry, VocabularyInput, VocabularyTrainingInput, WordAssessment, WordAssessmentResult, WordMemoryChapter, WordMemoryStats, WordReviewResult, WordReviewsData } from "./types";

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
  readingLibrary: () => request<ReadingLibraryData>("/api/reading/library"),
  readingBook: (bookId: string) => request<ReadingBookDetail>(`/api/reading/books/${bookId}`),
  uploadReadingBook: async (file: File) => {
    const response = await fetch("/api/reading/books", { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-ebook", "X-Book-Filename": encodeURIComponent(file.name) }, body: file });
    const body = await response.json().catch(() => ({})) as { id?: string; status?: string; error?: string };
    if (!response.ok) throw new Error(body.error || "书籍上传失败"); return body;
  },
  saveReadingProgress: (bookId: string, input: { chapterIndex: number; offset: number; progress: number; preferences?: ReadingPreferences }) => request<{ ok: true; lastReadAt: string }>(`/api/reading/books/${bookId}/progress`, { method: "PATCH", body: JSON.stringify(input) }),
  addReadingAnnotation: (bookId: string, input: Omit<ReadingAnnotation, "id" | "bookId" | "createdAt" | "updatedAt">) => request<ReadingAnnotation>(`/api/reading/books/${bookId}/annotations`, { method: "POST", body: JSON.stringify(input) }),
  deleteReadingAnnotation: (annotationId: string) => request<{ ok: true }>(`/api/reading/annotations/${annotationId}`, { method: "DELETE" }),
  lookupReadingTerm: (term: string) => request<ReadingLookupResult>("/api/reading/lookup", { method: "POST", body: JSON.stringify({ term }) }),
  translateReadingText: (text: string) => request<{ translation: string; cached: boolean; remaining: number }>("/api/reading/translate", { method: "POST", body: JSON.stringify({ text, targetLanguage: "zh-CN" }) }),
  addReadingVocabulary: (input: { term: string; meaning: string; bookId: string; chapterIndex: number; sourceForm: string; quote: string; startOffset: number }) => request<{ entryId: string; alreadyExisted: boolean }>("/api/reading/vocabulary-sources", { method: "POST", body: JSON.stringify(input) }),
  searchReadingCatalog: (query: string) => request<{ books: GutenbergBook[] }>(`/api/reading/catalog/search?q=${encodeURIComponent(query)}`),
  addReadingCatalogBook: (book: GutenbergBook) => request<{ book: ReadingLibraryData["books"][number] | null }>("/api/reading/catalog/books", { method: "POST", body: JSON.stringify({ id: book.id, title: book.title, author: book.author || null }) }),
  readingAdminJobs: () => request<{ jobs: Array<{ id: string; bookId: string; status: string; progress: number; errorCode: string | null; createdAt: string }> }>("/api/reading/admin/jobs"),
  vocabulary: () => request<VocabularyData>("/api/vocabulary"),
  dictionaryStatus: () => request<DictionaryStatusData>("/api/dictionaries/status"),
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
  assessmentDraft: (lessonId: number, kind: "formal" | "practice" | "review") =>
    request<{ draft: AssessmentDraft | null }>(`/api/lessons/${lessonId}/assessment-draft?kind=${kind}`),
  saveAssessmentDraft: (
    lessonId: number,
    kind: "formal" | "practice" | "review",
    currentIndex: number,
    answers: Record<string, string>,
    recordings: Record<string, string>,
  ) => request<{ draft: AssessmentDraft }>(`/api/lessons/${lessonId}/assessment-draft`, {
    method: "PUT",
    body: JSON.stringify({ kind, currentIndex, answers, recordings }),
  }),
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
