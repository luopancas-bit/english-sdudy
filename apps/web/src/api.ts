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
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  dashboard: () => request<DashboardData>("/api/dashboard"),
  assessment: (lessonId: number) => request<Assessment>(`/api/lessons/${lessonId}/assessment`),
  submitAttempt: (lessonId: number, answers: Record<string, string>, kind: "formal" | "practice" | "review" = "formal") =>
    request<AttemptResult>(`/api/lessons/${lessonId}/attempts`, {
      method: "POST",
      body: JSON.stringify({ kind, answers }),
    }),
};
