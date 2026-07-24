import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LogOut,
  Map,
  NotebookTabs,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import type { DashboardData } from "../../types";
import { AssessmentView } from "../lesson/AssessmentView";
import { ProfileSettings } from "../profile/ProfileSettings";

const navItems = [
  ["today", "今日学习", Sparkles],
  ["map", "课程地图", Map],
  ["review", "错题与复习", ClipboardCheck],
  ["vocabulary", "生词本", NotebookTabs],
  ["report", "学习报告", BarChart3],
] as const;
type ActiveSection = (typeof navItems)[number][0] | "settings";

export function Dashboard({
  data,
  demo,
  onRefresh,
  onLogout,
}: {
  data: DashboardData;
  demo: boolean;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}) {
  const [active, setActive] = useState<ActiveSection>("today");
  const [assessmentOpen, setAssessmentOpen] = useState(false);

  if (assessmentOpen) {
    return (
      <AssessmentView
        lessonId={data.currentLesson}
        demo={demo}
        onClose={() => {
          setAssessmentOpen(false);
          void onRefresh();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><img src="/brand-mark.svg" alt="" /><strong>逐光英语</strong></div>
        <nav aria-label="主导航">
          {navItems.map(([id, label, Icon]) => (
            <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}>
              <Icon size={20} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="profile-summary">
          <span className="avatar">{data.learner.nickname.slice(0, 1)}</span>
          <div><strong>{data.learner.nickname}</strong><small>坚持学习第 23 天</small></div>
        </div>
        <button className="logout-button" onClick={onLogout}><LogOut size={19} />退出登录</button>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div>
            <h1>{active === "today" ? "下午好，今天先巩固，再向前一步" : active === "settings" ? "个人设置" : navItems.find(([id]) => id === active)?.[1]}</h1>
            <p>{active === "today" ? "依据遗忘曲线与掌握情况，为你生成个性化学习计划。" : active === "settings" ? "管理你的昵称、学习目标和发音偏好。" : "该模块将在第一阶段后续迭代中接入真实数据。"}</p>
          </div>
          <div className="top-actions"><button aria-label="提醒"><Bell size={20} /></button><button aria-label="设置" onClick={() => setActive("settings")}><Settings size={20} /></button></div>
        </header>

        {active === "settings" ? (
          <ProfileSettings
            user={data.learner}
            demo={demo}
            onBack={() => setActive("today")}
            onSaved={onRefresh}
          />
        ) : active === "today" ? (
          <div className="dashboard-grid">
            <section className="today-column">
              <button className="current-lesson" onClick={() => setAssessmentOpen(true)}>
                <BookOpen size={34} strokeWidth={1.6} />
                <span><small>当前学习</small><strong>第 {String(data.currentLesson).padStart(2, "0")} 课　{data.currentLessonTitle}</strong></span>
                <ChevronRight />
              </button>

              <h2>今日学习计划</h2>
              <div className="learning-path">
                <svg viewBox="0 0 760 190" preserveAspectRatio="none" aria-hidden="true">
                  <path className="path-shadow" d="M45 150 C210 110 340 132 430 90 S600 82 715 24" />
                  <path className="path-line" d="M45 145 C210 105 340 127 430 85 S600 77 715 19" />
                </svg>
                <PlanStop icon={<Clock3 />} title="到期复习" duration="12 分钟" note="巩固记忆，夯实基础" x="7%" y="61%" />
                <PlanStop icon={<Target />} title="薄弱项" duration="6 分钟" note="攻克弱点，提升能力" x="39%" y="42%" tone="gold" />
                <PlanStop icon={<BookOpen />} title="新课学习" duration="10 分钟" note="学习新知，向前一步" x="68%" y="21%" />
                <button className="start-orb" onClick={() => setAssessmentOpen(true)}>
                  <img src="/brand-mark.svg" alt="" /><span>开始今日学习</span><small>预计用时 28 分钟</small>
                </button>
              </div>

              <section className="history">
                <div className="section-heading"><h2>最近学习记录</h2><button>查看全部</button></div>
                <div className="history-table" role="table">
                  {data.history.map((item) => {
                    const status = item.score >= 90 ? "长期掌握" : item.score >= 80 ? "已掌握" : "待巩固";
                    return (
                    <button className="history-row" role="row" key={item.id}>
                      <span>第 {String(item.lessonId).padStart(2, "0")} 课</span><strong>{item.title}</strong><span>{item.kind === "practice" ? "练习" : item.kind === "review" ? "计划复习" : "正式考核"}</span>
                      <time>{formatAttemptTime(item.occurredAt)}</time>
                      <em data-status={status}>{item.score} · {status}</em><ChevronRight size={17} />
                    </button>
                    );
                  })}
                  {!data.history.length && <p className="empty-history">完成第一次正式考核后，学习记录会出现在这里。</p>}
                </div>
              </section>
            </section>

            <aside className="insights">
              <h2>掌握情况概览</h2>
              <div className="mastery-number"><span>长期掌握率</span><strong>{data.longTermMastery}<small>%</small></strong><p>基于全部课程的长期记忆评估</p></div>
              <Skill label="听力" value={data.dimensions.listening} />
              <Skill label="精读" value={data.dimensions.reading} />
              <Skill label="跟读" value={data.dimensions.speaking} warning />
              <Skill label="听写" value={data.dimensions.writing} warning />
              <div className="next-review"><h3>下一次复习</h3><time>今天 18:30</time><strong>第 05 课　互联网</strong><span>待巩固</span></div>
            </aside>
          </div>
        ) : (
          <section className="module-placeholder"><BookOpen size={48} /><h2>{navItems.find(([id]) => id === active)?.[1]}</h2><p>数据模块边界已经保留，将按第一阶段顺序接入。</p></section>
        )}
      </main>
    </div>
  );
}

function formatAttemptTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function PlanStop({
  icon,
  title,
  duration,
  note,
  x,
  y,
  tone,
}: {
  icon: ReactNode;
  title: string;
  duration: string;
  note: string;
  x: string;
  y: string;
  tone?: "gold";
}) {
  return (
    <div className={`plan-stop ${tone ?? ""}`} style={{ left: x, top: y }}>
      <span className="stop-icon">{icon}</span><strong>{title}</strong><b>{duration}</b><small>{note}</small><em>待巩固</em>
    </div>
  );
}

function Skill({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="skill-row">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="skill-track"><i className={warning ? "warning" : ""} style={{ width: `${value}%` }} /></div>
    </div>
  );
}
