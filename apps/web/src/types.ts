export interface User {
  id: string;
  username: string;
  nickname: string;
  role: "learner" | "admin";
  dailyMinutes: number;
  preferredAccent: "us" | "uk";
  reminderTime: string | null;
}

export interface DashboardData {
  learner: User;
  longTermMastery: number;
  dueReviews: number;
  weakItems: number;
  currentLesson: number;
  dimensions: {
    listening: number;
    reading: number;
    speaking: number;
    writing: number;
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
