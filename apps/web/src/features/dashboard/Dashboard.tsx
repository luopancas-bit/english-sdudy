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
import { CourseMap } from "../map/CourseMap";
import { AssessmentView } from "../lesson/AssessmentView";
import { LessonStudyView } from "../lesson/LessonStudyView";
import { ProfileSettings } from "../profile/ProfileSettings";
import { ReviewCenter } from "../review/ReviewCenter";
import { LearningReport } from "../report/LearningReport";
import { VocabularyBook } from "../vocabulary/VocabularyBook";

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
  const [assessmentSession, setAssessmentSession] = useState<{
    lessonId: number;
    kind: "formal" | "review";
  } | null>(null);
  const [studyLessonId, setStudyLessonId] = useState<number | null>(null);

  if (assessmentSession) {
    return (
      <AssessmentView
        lessonId={assessmentSession.lessonId}
        kind={assessmentSession.kind}
        demo={demo}
        onClose={() => {
          setAssessmentSession(null);
          void onRefresh();
        }}
      />
    );
  }

  if (studyLessonId !== null) {
    return (
      <LessonStudyView
        lessonId={studyLessonId}
        learner={data.learner}
        demo={demo}
        onClose={() => setStudyLessonId(null)}
        onStartAssessment={() => {
          setAssessmentSession({ lessonId: studyLessonId, kind: "formal" });
          setStudyLessonId(null);
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
          <div><strong>{data.learner.nickname}</strong><small>{data.studyStreak ? `连续学习第 ${data.studyStreak} 天` : "从今天开始积累"}</small></div>
        </div>
        <button className="logout-button" onClick={onLogout}><LogOut size={19} />退出登录</button>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div>
            <h1>{active === "today" ? "下午好，今天先巩固，再向前一步" : active === "settings" ? "个人设置" : navItems.find(([id]) => id === active)?.[1]}</h1>
            <p>{active === "today" ? "依据遗忘曲线与掌握情况，为你生成个性化学习计划。" : active === "settings" ? "管理你的昵称、学习目标和发音偏好。" : active === "map" ? "依次完成正式考核，解锁下一课；复习到期时优先巩固。" : active === "review" ? "按到期时间巩固记忆，并集中处理反复出错的内容。" : active === "vocabulary" ? "收藏需要反复接触的单词与短语，掌握后随时归档。" : "从学习频率、四维能力和逐课掌握度检查真实进步。"}</p>
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
              <button className="current-lesson" onClick={() => setStudyLessonId(data.currentLesson)}>
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
                <PlanStop icon={<Clock3 />} title="到期复习" duration={`${data.plan.reviewMinutes} 分钟`} note={`${data.dueReviews} 项复习到期`} x="7%" y="61%" />
                <PlanStop icon={<Target />} title="薄弱项" duration={`${data.plan.weakMinutes} 分钟`} note={`${data.weakItems} 个错题待巩固`} x="39%" y="42%" tone="gold" />
                <PlanStop icon={<BookOpen />} title="新课学习" duration={`${data.plan.newLessonMinutes} 分钟`} note="学习新知，向前一步" x="68%" y="21%" />
                <button className="start-orb" onClick={() => setStudyLessonId(data.currentLesson)}>
                  <img src="/brand-mark.svg" alt="" /><span>开始今日学习</span><small>预计用时 {data.plan.reviewMinutes + data.plan.weakMinutes + data.plan.newLessonMinutes} 分钟</small>
                </button>
              </div>

              <section className="history">
                <div className="section-heading"><h2>最近学习记录</h2><button onClick={() => setActive("report")}>查看全部</button></div>
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
              <div className="next-review">
                <h3>下一次复习</h3>
                {data.nextReview ? (
                  <>
                    <time>{formatReviewTime(data.nextReview.dueAt)}</time>
                    <strong>第 {String(data.nextReview.lessonId).padStart(2, "0")} 课　{data.nextReview.title}</strong>
                    <span>{new Date(data.nextReview.dueAt).getTime() <= Date.now() ? "已经到期" : "计划复习"}</span>
                  </>
                ) : <p>完成正式考核后生成复习计划。</p>}
              </div>
            </aside>
          </div>
        ) : active === "review" ? (
          <ReviewCenter
            demo={demo}
            onStartReview={(lessonId) => setAssessmentSession({ lessonId, kind: "review" })}
          />
        ) : active === "map" ? (
          <CourseMap
            demo={demo}
            onStartAssessment={(lessonId, kind) => {
              if (kind === "review") setAssessmentSession({ lessonId, kind });
              else setStudyLessonId(lessonId);
            }}
          />
        ) : active === "vocabulary" ? (
          <VocabularyBook demo={demo} />
        ) : active === "report" ? (
          <LearningReport demo={demo} />
        ) : (
          <section className="module-placeholder"><BookOpen size={48} /><h2>{navItems.find(([id]) => id === active)?.[1]}</h2><p>数据模块边界已经保留，将按第一阶段顺序接入。</p></section>
        )}
      </main>
    </div>
  );
}

function formatReviewTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const datePart = date.toDateString() === today.toDateString()
    ? "今天"
    : date.toDateString() === tomorrow.toDateString()
      ? "明天"
      : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
  return `${datePart} ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
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
