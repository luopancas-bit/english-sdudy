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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const user = await api.login(String(data.get("username")), String(data.get("password")));
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <img src="/brand-mark.svg" alt="" />
        <span>逐光英语</span>
        <h1>真正掌握，<br />而不只是学过。</h1>
        <p>听、读、说、写经过考核，再由间隔复习把短期记忆变成长期能力。</p>
      </section>
      <section className="auth-panel">
        <div>
          <h2>继续今天的学习</h2>
          <p>使用你的个人账号，在电脑和 iPhone 间同步进度。</p>
        </div>
        <form onSubmit={submit}>
          <label>账号<input name="username" autoComplete="username" required /></label>
          <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? "正在登录…" : "登录"} <ArrowRight size={18} />
          </button>
        </form>
        <p className="auth-help">新账号需要邀请码。注册入口将在管理员创建邀请码后开放。</p>
        {onPreview && <button className="preview-button" onClick={onPreview}>预览新版界面</button>}
      </section>
    </main>
  );
}
