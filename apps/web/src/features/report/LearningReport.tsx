import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, CalendarDays, CircleDashed, Flame, Target } from "lucide-react";
import { api } from "../../api";
import type { LearningReportData } from "../../types";

const dimensions = [
  ["listening", "听力"],
  ["reading", "精读"],
  ["speaking", "跟读"],
  ["writing", "听写"],
] as const;

export function LearningReport({ demo }: { demo: boolean }) {
  const [data, setData] = useState<LearningReportData | null>(demo ? demoReport : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    let active = true;
    api.learningReport()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "学习报告加载失败");
      });
    return () => {
      active = false;
    };
  }, [demo]);

  const maxAttempts = useMemo(
    () => Math.max(1, ...(data?.daily.map((item) => item.attempts) ?? [1])),
    [data?.daily],
  );

  if (error) return <section className="report-state"><BarChart3 size={42} /><h2>学习报告暂时无法加载</h2><p>{error}</p></section>;
  if (!data) return <section className="report-state"><CircleDashed size={42} /><h2>正在生成学习报告</h2></section>;

  return (
    <section className="learning-report">
      <div className="report-summary">
        <Summary icon={<Target />} label="累计考核" value={`${data.summary.totalAttempts} 次`} />
        <Summary icon={<CalendarDays />} label="学习天数" value={`${data.summary.studiedDays} 天`} />
        <Summary icon={<Flame />} label="连续学习" value={`${data.summary.studyStreak} 天`} />
        <Summary icon={<BarChart3 />} label="平均成绩" value={`${data.summary.averageScore} 分`} />
      </div>

      <div className="report-panels">
        <article className="report-panel">
          <header><div><h2>近14日学习</h2><p>柱高表示当天考核次数，数字为当天平均成绩。</p></div></header>
          {data.daily.length ? (
            <div className="study-chart">
              {data.daily.map((item) => (
                <div key={item.date}>
                  <span>{item.averageScore}</span>
                  <i style={{ height: `${Math.max(10, (item.attempts / maxAttempts) * 100)}%` }} />
                  <small>{formatDate(item.date)}</small>
                </div>
              ))}
            </div>
          ) : <p className="report-empty">完成第一次正式考核后，这里会显示学习趋势。</p>}
        </article>

        <article className="report-panel dimension-report">
          <header><div><h2>能力结构</h2><p>汇总全部已保存考核，帮助判断下一步训练重点。</p></div></header>
          {dimensions.map(([key, label]) => (
            <div className="report-dimension" key={key}><span>{label}</span><div><i style={{ width: `${data.dimensions[key]}%` }} /></div><strong>{data.dimensions[key]}</strong></div>
          ))}
        </article>
      </div>

      <article className="report-panel lesson-report">
        <header><div><h2>课程掌握明细</h2><p>掌握度来自最近三次有效正式考核的加权结果。</p></div><span>{data.lessons.length} 课已有记录</span></header>
        <div className="lesson-report-list">
          {data.lessons.map((lesson) => (
            <div key={lesson.lessonId}>
              <span>第 {String(lesson.lessonId).padStart(2, "0")} 课</span>
              <strong>{lesson.title}</strong>
              <div><i style={{ width: `${lesson.score}%` }} /></div>
              <em data-passed={lesson.score >= 80}>{lesson.score} 分</em>
              <small>{lesson.score >= 80 ? "已掌握" : "待巩固"}</small>
            </div>
          ))}
          {!data.lessons.length && <p className="report-empty">暂无课程掌握记录。</p>}
        </div>
      </article>
    </section>
  );
}

function Summary({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function formatDate(value: string) {
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

const demoReport: LearningReportData = {
  summary: { totalAttempts: 12, studiedDays: 7, studyStreak: 3, averageScore: 78 },
  dimensions: { listening: 74, reading: 82, speaking: 61, writing: 66 },
  daily: [
    { date: "2026-07-19", attempts: 1, averageScore: 68 },
    { date: "2026-07-21", attempts: 2, averageScore: 81 },
    { date: "2026-07-23", attempts: 1, averageScore: 84 },
    { date: "2026-07-24", attempts: 3, averageScore: 76 },
    { date: "2026-07-25", attempts: 1, averageScore: 88 },
    { date: "2026-07-26", attempts: 2, averageScore: 79 },
    { date: "2026-07-27", attempts: 2, averageScore: 83 },
  ],
  lessons: [
    { lessonId: 1, title: "日常问候", score: 92, band: "proficient", dimensions: { listening: 90, reading: 95, speaking: 88, writing: 94 }, updatedAt: "2026-07-27T08:00:00Z" },
    { lessonId: 2, title: "家庭成员", score: 68, band: "developing", dimensions: { listening: 75, reading: 82, speaking: 54, writing: 61 }, updatedAt: "2026-07-27T08:00:00Z" },
  ],
};
