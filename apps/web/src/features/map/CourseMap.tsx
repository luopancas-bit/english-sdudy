import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleDashed,
  Clock3,
  LockKeyhole,
  MapPinned,
  RotateCcw,
} from "lucide-react";
import { api } from "../../api";
import { demoCourseMap } from "../../demo";
import type { CourseMapData, CourseMapLesson, CourseMapLessonState } from "../../types";

export function CourseMap({
  demo,
  onStartAssessment,
}: {
  demo: boolean;
  onStartAssessment: (lessonId: number, kind: "formal" | "review") => void;
}) {
  const [data, setData] = useState<CourseMapData | null>(demo ? demoCourseMap : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) {
      setData(demoCourseMap);
      setError("");
      return;
    }
    let active = true;
    setData(null);
    setError("");
    api.courseMap()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "课程地图加载失败");
      });
    return () => {
      active = false;
    };
  }, [demo]);

  if (error) {
    return (
      <section className="course-map-state error">
        <MapPinned size={42} />
        <h2>课程地图暂时无法加载</h2>
        <p>{error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="course-map-state">
        <CircleDashed size={42} />
        <h2>正在整理学习路线</h2>
        <p>正在读取你的考核和复习记录。</p>
      </section>
    );
  }

  return (
    <section className="course-map">
      <div className="course-map-summary" aria-label="课程进度概览">
        <Summary label="阶段进度" value={`${data.summary.studiedLessons} / ${data.summary.totalLessons}`} note="已完成正式考核" />
        <Summary label="已掌握" value={`${data.summary.masteredLessons} 课`} note="掌握度达到 80 分" />
        <Summary label="平均掌握度" value={`${data.summary.averageScore}%`} note="仅统计已学习课程" />
      </div>

      <div className="course-map-heading">
        <div>
          <h2>第一阶段 · 基础掌握</h2>
          <p>每次正式考核都会记录掌握度，并解锁下一课。</p>
        </div>
        <span>共 {data.summary.totalLessons} 课</span>
      </div>

      <div className="course-map-list">
        {data.lessons.map((lesson) => (
          <LessonRow key={lesson.lessonId} lesson={lesson} onStartAssessment={onStartAssessment} />
        ))}
      </div>
    </section>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function LessonRow({
  lesson,
  onStartAssessment,
}: {
  lesson: CourseMapLesson;
  onStartAssessment: (lessonId: number, kind: "formal" | "review") => void;
}) {
  const details = stateDetails[lesson.state];
  const isReview = lesson.state === "review-due";
  const action = lesson.state === "locked"
    ? "尚未解锁"
    : isReview
      ? "开始复习"
      : lesson.score === null
        ? "开始考核"
        : "再次考核";

  return (
    <article className="course-map-row" data-state={lesson.state}>
      <div className="course-map-node" aria-hidden="true">
        {lesson.state === "locked"
          ? <LockKeyhole size={20} />
          : lesson.state === "mastered" || lesson.state === "long-term"
            ? <Check size={23} />
            : String(lesson.lessonId).padStart(2, "0")}
      </div>
      <div className="course-map-copy">
        <div className="course-map-meta">
          <span>第 {String(lesson.lessonId).padStart(2, "0")} 课</span>
          <span className="course-state" data-tone={details.tone}>{details.label}</span>
        </div>
        <h3>{lesson.title}</h3>
        <p>{lesson.score === null
          ? details.description
          : <>掌握度 <strong>{lesson.score}%</strong>{lesson.review ? ` · ${reviewLabel(lesson.review.dueAt)}` : ""}</>}</p>
      </div>
      <button
        className="course-map-action"
        disabled={!lesson.unlocked}
        onClick={() => onStartAssessment(lesson.lessonId, isReview ? "review" : "formal")}
      >
        {isReview ? <RotateCcw size={17} /> : lesson.state === "locked" ? <LockKeyhole size={16} /> : <Clock3 size={17} />}
        {action}
        {lesson.unlocked && <ChevronRight size={16} />}
      </button>
    </article>
  );
}

const stateDetails: Record<CourseMapLessonState, { label: string; description: string; tone: "gold" | "green" | undefined }> = {
  locked: { label: "未解锁", description: "完成上一课正式考核后解锁。", tone: undefined },
  ready: { label: "可以开始", description: "本课已解锁，完成正式考核即可记录掌握度。", tone: "green" },
  "review-due": { label: "复习到期", description: "按计划完成复习，稳固长期记忆。", tone: "gold" },
  strengthening: { label: "待巩固", description: "继续练习薄弱项，再进行正式考核。", tone: "gold" },
  mastered: { label: "已掌握", description: "已达到阶段掌握标准。", tone: "green" },
  "long-term": { label: "长期掌握", description: "已通过间隔复习形成长期记忆。", tone: "green" },
};

function reviewLabel(dueAt: string) {
  const due = new Date(dueAt);
  if (due.getTime() <= Date.now()) return "复习已到期";
  return `${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(due)} 复习`;
}
