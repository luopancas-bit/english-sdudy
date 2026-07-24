import type { Assessment, AttemptResult, DashboardData, User } from "./types";

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
  dashboard: () => request<DashboardData>("/api/dashboard"),
  assessment: (lessonId: number) => request<Assessment>(`/api/lessons/${lessonId}/assessment`),
  submitAttempt: (lessonId: number, answers: Record<string, string>, kind: "formal" | "practice" | "review" = "formal") =>
    request<AttemptResult>(`/api/lessons/${lessonId}/attempts`, {
      method: "POST",
      body: JSON.stringify({ kind, answers }),
    }),
};
