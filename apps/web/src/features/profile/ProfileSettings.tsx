import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, BookOpenCheck, Check, CircleDashed, KeyRound, Laptop, Save, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { api } from "../../api";
import type { AccountSession, DictionaryStatusData, User } from "../../types";

export function ProfileSettings({
  user,
  demo,
  onBack,
  onSaved,
}: {
  user: User;
  demo: boolean;
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (!demo) {
        await api.updateProfile({
          nickname: String(data.get("nickname")),
          dailyMinutes: Number(data.get("dailyMinutes")),
          preferredAccent: String(data.get("preferredAccent")) as "us" | "uk",
          reminderTime: String(data.get("reminderTime")) || null,
        });
        await onSaved();
      }
      setMessage(demo ? "预览模式不会保存资料" : "个人资料已同步到所有设备");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "保存失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-settings">
      <button className="text-button" onClick={onBack}><ArrowLeft size={18} />返回今日学习</button>
      <div className="profile-heading">
        <span className="avatar large">{user.nickname.slice(0, 1)}</span>
        <div><h2>个人资料与学习偏好</h2><p>这些设置会在电脑和 iPhone 间同步。</p></div>
      </div>
      <form className="profile-form" onSubmit={submit}>
        <label>账号<input value={user.username} disabled /></label>
        <label>昵称<input name="nickname" defaultValue={user.nickname} maxLength={24} required /></label>
        <label>
          每日目标
          <input name="dailyMinutes" type="number" min={10} max={120} defaultValue={user.dailyMinutes} required />
        </label>
        <label>
          发音偏好
          <select name="preferredAccent" defaultValue={user.preferredAccent}>
            <option value="us">美式英语</option>
            <option value="uk">英式英语</option>
          </select>
        </label>
        <label>每日提醒<input name="reminderTime" type="time" defaultValue={user.reminderTime ?? ""} /></label>
        <div className="profile-actions">
          <button className="primary-button" disabled={busy}><Save size={18} />{busy ? "正在保存…" : "保存并同步"}</button>
          {message && <span role="status">{message}</span>}
        </div>
      </form>
      <DictionaryStatus demo={demo} />
      <SecuritySettings demo={demo} />
    </section>
  );
}

function DictionaryStatus({ demo }: { demo: boolean }) {
  const [data, setData] = useState<DictionaryStatusData | null>(() => demo ? demoDictionaryStatus : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    let active = true;
    api.dictionaryStatus()
      .then((result) => { if (active) setData(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "词典状态加载失败"); });
    return () => { active = false; };
  }, [demo]);

  return (
    <section className="dictionary-status-panel">
      <div className="security-heading"><BookOpenCheck size={24} /><div><h2>词典与音标库</h2><p>这里只显示覆盖率；词典导入和发布在服务器私有目录完成。</p></div></div>
      {!data && !error ? <p className="dictionary-status-loading"><CircleDashed size={17} />正在读取词典状态</p> : null}
      {error ? <p className="security-message" role="alert">{error}</p> : null}
      {data ? (
        <>
          <div className="dictionary-status-summary">
            <span><small>规范词条</small><strong>{data.summary.entries}</strong></span>
            <span><small>美英齐全</small><strong>{data.summary.dual}</strong></span>
            <span><small>待补全</small><strong>{data.summary.pending}</strong></span>
            <span><small>待核对</small><strong>{data.summary.ambiguous + data.summary.openConflicts}</strong></span>
          </div>
          <div className="dictionary-source-list">
            {data.sources.map((source) => (
              <article key={source.id}>
                <div><strong>{source.name}</strong><small>版本 {source.version} · {source.format.toUpperCase()}</small></div>
                <span>{source.status === "active" ? "已启用" : source.status === "staging" ? "暂存" : "已停用"}</span>
              </article>
            ))}
            {!data.sources.length ? <p>音标库结构已经建立，等待导入第一份词典数据。</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function SecuritySettings({ demo }: { demo: boolean }) {
  const [sessions, setSessions] = useState<AccountSession[]>(demo ? demoSessions : []);
  const [loading, setLoading] = useState(!demo);
  const [busySession, setBusySession] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    if (demo) return;
    let active = true;
    api.sessions()
      .then((result) => {
        if (active) setSessions(result.sessions);
      })
      .catch(() => {
        if (active) setPasswordMessage("登录设备加载失败，请稍后重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword"));
    const newPassword = String(data.get("newPassword"));
    const confirmPassword = String(data.get("confirmPassword"));
    setPasswordMessage("");
    if (newPassword !== confirmPassword) {
      setPasswordMessage("两次输入的新密码不一致");
      return;
    }
    setPasswordBusy(true);
    try {
      if (!demo) {
        await api.changePassword(currentPassword, newPassword);
        const refreshed = await api.sessions();
        setSessions(refreshed.sessions);
        form.reset();
      }
      setPasswordMessage(demo ? "预览模式不会修改密码" : "密码已更新，其他设备已经退出登录");
    } catch (reason) {
      setPasswordMessage(reason instanceof Error ? reason.message : "密码修改失败");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function removeSession(sessionId: string) {
    setBusySession(sessionId);
    setPasswordMessage("");
    try {
      if (!demo) await api.removeSession(sessionId);
      setSessions((current) => current.filter((session) => session.id !== sessionId));
    } catch (reason) {
      setPasswordMessage(reason instanceof Error ? reason.message : "设备退出失败");
    } finally {
      setBusySession(null);
    }
  }

  return (
    <section className="account-security">
      <div className="security-heading"><ShieldCheck size={24} /><div><h2>账号安全</h2><p>修改密码或检查哪些电脑和手机仍保持登录。</p></div></div>

      <form className="password-form" onSubmit={changePassword}>
        <h3><KeyRound size={18} />修改密码</h3>
        <label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
        <label>新密码<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <label>确认新密码<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <button className="primary-button" disabled={passwordBusy}>{passwordBusy ? "正在修改…" : "修改密码并退出其他设备"}</button>
      </form>

      <div className="session-list">
        <div><h3>已登录设备</h3><span>{loading ? "正在读取…" : `${sessions.length} 个会话`}</span></div>
        {sessions.map((session) => {
          const device = describeDevice(session.userAgent);
          const Icon = device.mobile ? Smartphone : Laptop;
          return (
            <article key={session.id}>
              <span><Icon size={20} /></span>
              <div><strong>{device.label}</strong><small>登录于 {formatSessionTime(session.createdAt)} · 有效至 {formatSessionTime(session.expiresAt)}</small></div>
              {session.current
                ? <em><Check size={14} />当前设备</em>
                : <button disabled={busySession === session.id} onClick={() => void removeSession(session.id)}><Trash2 size={16} />{busySession === session.id ? "正在退出" : "退出设备"}</button>}
            </article>
          );
        })}
        {!loading && !sessions.length && <p>没有可显示的登录设备。</p>}
      </div>
      {passwordMessage && <p className="security-message" role="status">{passwordMessage}</p>}
    </section>
  );
}

function describeDevice(userAgent: string | null) {
  if (!userAgent) return { label: "未知设备", mobile: false };
  const mobile = /iPhone|iPad|Android/i.test(userAgent);
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "浏览器";
  const system = /iPhone/.test(userAgent) ? "iPhone" : /iPad/.test(userAgent) ? "iPad" : /Android/.test(userAgent) ? "Android" : /Macintosh/.test(userAgent) ? "Mac" : /Windows/.test(userAgent) ? "Windows" : "电脑";
  return { label: `${system} · ${browser}`, mobile };
}

function formatSessionTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const demoSessions: AccountSession[] = [
  {
    id: "demo-current",
    current: true,
    userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15",
    createdAt: "2026-07-27T08:00:00+08:00",
    lastSeenAt: "2026-07-27T11:00:00+08:00",
    expiresAt: "2026-08-26T08:00:00+08:00",
  },
  {
    id: "demo-phone",
    current: false,
    userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/604.1",
    createdAt: "2026-07-26T19:30:00+08:00",
    lastSeenAt: "2026-07-27T09:20:00+08:00",
    expiresAt: "2026-08-25T19:30:00+08:00",
  },
];

const demoDictionaryStatus: DictionaryStatusData = {
  summary: { entries: 1770, us: 1420, uk: 1396, dual: 1368, pending: 402, ambiguous: 7, openConflicts: 2 },
  sources: [
    { id: "course-core@1", name: "课程核心词典", version: "1", format: "builtin", status: "active", priority: 10, importedAt: "2026-08-14T00:00:00.000Z" },
  ],
};
