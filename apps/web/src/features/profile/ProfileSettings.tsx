import { useState, type FormEvent } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { api } from "../../api";
import type { User } from "../../types";

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
      <form onSubmit={submit}>
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
    </section>
  );
}
