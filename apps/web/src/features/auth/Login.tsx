import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "../../api";
import type { User } from "../../types";

export function Login({
  onAuthenticated,
  onPreview,
}: {
  onAuthenticated: (user: User) => void;
  onPreview?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const username = String(data.get("username"));
      const password = String(data.get("password"));
      const user =
        mode === "login"
          ? await api.login(username, password)
          : await api.register({
              username,
              password,
              nickname: String(data.get("nickname")),
              invitationCode: String(data.get("invitationCode")),
            });
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`auth-page ${mode}`}>
      <section className="auth-intro">
        <img src="/brand-mark.svg" alt="" />
        <span>逐光英语</span>
        <h1>真正掌握，<br />而不只是学过。</h1>
        <p>听、读、说、写经过考核，再由间隔复习把短期记忆变成长期能力。</p>
      </section>
      <section className="auth-panel">
        <div>
          <h2>{mode === "login" ? "继续今天的学习" : "创建个人学习账号"}</h2>
          <p>
            {mode === "login"
              ? "使用你的个人账号，在电脑和 iPhone 间同步进度。"
              : "邀请码用于限制公开注册，昵称和学习偏好可以稍后修改。"}
          </p>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>昵称<input name="nickname" autoComplete="nickname" maxLength={24} required /></label>
          )}
          <label>账号<input name="username" autoComplete="username" required /></label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={12}
              required
            />
          </label>
          {mode === "register" && (
            <label>邀请码<input name="invitationCode" autoComplete="off" minLength={8} required /></label>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? "正在处理…" : mode === "login" ? "登录" : "创建账号"} <ArrowRight size={18} />
          </button>
        </form>
        <button
          className="auth-mode-button"
          type="button"
          onClick={() => {
            setMode((value) => (value === "login" ? "register" : "login"));
            setError("");
          }}
        >
          {mode === "login" ? "有邀请码？申请新账号" : "已有账号？返回登录"}
        </button>
        {onPreview && <button className="preview-button" onClick={onPreview}>预览新版界面</button>}
      </section>
    </main>
  );
}
