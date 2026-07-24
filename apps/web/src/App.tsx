import { useEffect, useState } from "react";
import type { DashboardData, User } from "./types";
import { api } from "./api";
import { demoDashboard } from "./demo";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Login } from "./features/auth/Login";

type AppState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; user: User; dashboard: DashboardData; demo: boolean };

export function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });

  useEffect(() => {
    Promise.all([api.me(), api.dashboard()])
      .then(([user, dashboard]) => setState({ status: "ready", user, dashboard, demo: false }))
      .catch(() => setState({ status: "anonymous" }));
  }, []);

  if (state.status === "loading") {
    return <div className="loading-screen">正在整理今天的学习计划…</div>;
  }

  if (state.status === "anonymous") {
    return (
      <Login
        onAuthenticated={async (user) => {
          const dashboard = await api.dashboard();
          setState({ status: "ready", user, dashboard, demo: false });
        }}
        {...(import.meta.env.DEV
          ? {
              onPreview: () =>
                setState({
                  status: "ready",
                  user: demoDashboard.learner,
                  dashboard: demoDashboard,
                  demo: true,
                }),
            }
          : {})}
      />
    );
  }

  return (
    <Dashboard
      data={state.dashboard}
      demo={state.demo}
      onRefresh={async () => {
        if (state.demo) return;
        const dashboard = await api.dashboard();
        setState((current) =>
          current.status === "ready" ? { ...current, dashboard } : current,
        );
      }}
      onLogout={async () => {
        if (!state.demo) await api.logout();
        setState({ status: "anonymous" });
      }}
    />
  );
}
