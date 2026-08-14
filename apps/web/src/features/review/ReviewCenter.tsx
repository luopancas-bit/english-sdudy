import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { api } from "../../api";
import { demoReviewCenter } from "../../demo";
import type { ReviewCenterData, ReviewLesson, WordReviewsData, WordReviewTask } from "../../types";

const dimensionNames = {
  listening: "听力",
  reading: "精读",
  speaking: "跟读",
  writing: "听写",
};

export function ReviewCenter({
  demo,
  onStartReview,
  onStartWordReview,
}: {
  demo: boolean;
  onStartReview: (lessonId: number) => void;
  onStartWordReview: (task: WordReviewTask) => void;
}) {
  const [data, setData] = useState<ReviewCenterData | null>(() => demo ? demoReviewCenter : null);
  const [wordData, setWordData] = useState<WordReviewsData | null>(() => demo ? { due: [], upcoming: [], history: [] } : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    Promise.all([api.reviewCenter(), api.wordReviews()])
      .then(([reviewValue, wordValue]) => {
        if (!cancelled) {
          setData(reviewValue);
          setWordData(wordValue);
        }
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "复习数据加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  if (error) {
    return (
      <section className="review-state error" role="alert">
        <AlertCircle />
        <h2>暂时无法读取复习计划</h2>
        <p>{error}</p>
      </section>
    );
  }

  if (!data || !wordData) {
    return <section className="review-state">正在整理错题与到期复习…</section>;
  }

  const nextReview = data.upcoming[0];
  return (
    <div className="review-center">
      <section className="review-summary" aria-label="复习概览">
        <SummaryCard
          icon={<RotateCcw />}
          label="今天待复习"
          value={data.due.length + wordData.due.length}
          note={data.due.length + wordData.due.length ? `课程 ${data.due.length} · 单词 ${wordData.due.length}` : "今天的复习已完成"}
          tone={data.due.length + wordData.due.length ? "gold" : "green"}
        />
        <SummaryCard
          icon={<BookOpenCheck />}
          label="未解决错题"
          value={data.wrongAnswers.length}
          note="答对后自动移出"
        />
        <SummaryCard
          icon={<CalendarClock />}
          label="下一次安排"
          value={nextReview ? formatShortDate(nextReview.dueAt) : "暂无"}
          note={nextReview?.title ?? "完成考核后自动生成"}
        />
      </section>

      <div className="review-columns">
        <section className="review-queue">
          <div className="review-section-heading">
            <div>
              <span>复习队列</span>
              <h2>到期复习</h2>
            </div>
            <small>只有计划复习和正式考核会更新掌握度</small>
          </div>

          <div className="word-review-block">
            <div className="review-section-heading compact">
              <div><span>间隔记忆</span><h3>到期单词</h3></div>
              <small>1、3、7、14、30 天复核；未通过不锁下一课</small>
            </div>
            {wordData.due.length ? (
              <div className="review-lesson-list">
                {wordData.due.map((word) => (
                  <article className="review-lesson-card due word" key={word.id}>
                    <div className="review-lesson-date"><span>已到期</span><small>第 {word.step + 1} 次复核</small></div>
                    <div className="review-lesson-copy"><span>第 {String(word.lessonId).padStart(2, "0")} 课单词</span><h3>待复习单词</h3><div><em>上次 {word.lastScore} 分</em></div></div>
                    <button disabled={!word.task} onClick={() => onStartWordReview(word)}>{word.task ? "开始复习" : "题目缺失"}<ArrowRight size={17} /></button>
                  </article>
                ))}
              </div>
            ) : <div className="review-empty compact"><CheckCircle2 /><div><strong>今天没有到期单词</strong><span>首次正式考核后会自动进入间隔复习。</span></div></div>}
            {wordData.upcoming.length ? <p className="word-review-upcoming">接下来：{wordData.upcoming.slice(0, 3).map((word) => `第 ${String(word.lessonId).padStart(2, "0")} 课单词（${formatShortDate(word.dueAt)}）`).join("、")}</p> : null}
          </div>

          {data.due.length ? (
            <div className="review-lesson-list">
              {data.due.map((lesson) => (
                <ReviewLessonCard
                  key={lesson.lessonId}
                  lesson={lesson}
                  due
                  onStart={() => onStartReview(lesson.lessonId)}
                />
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <CheckCircle2 />
              <div><strong>今天没有到期任务</strong><span>可以继续新课，系统会自动安排下一次复习。</span></div>
            </div>
          )}

          {data.upcoming.length ? (
            <div className="upcoming-reviews">
              <h3>接下来的复习</h3>
              {data.upcoming.slice(0, 4).map((lesson) => (
                <ReviewLessonCard
                  key={lesson.lessonId}
                  lesson={lesson}
                  onStart={() => onStartReview(lesson.lessonId)}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="wrong-answer-section">
          <div className="review-section-heading">
            <div>
              <span>薄弱项</span>
              <h2>最近错题</h2>
            </div>
            <small>优先处理重复出错的题目</small>
          </div>

          {data.wrongAnswers.length ? (
            <div className="wrong-answer-list">
              {data.wrongAnswers.map((item) => (
                <article className="wrong-answer-card" key={`${item.lessonId}-${item.questionId}`}>
                  <header>
                    <span>第 {String(item.lessonId).padStart(2, "0")} 课</span>
                    <em>{dimensionNames[item.dimension]}</em>
                    <b>错误 {item.errorCount} 次</b>
                  </header>
                  <h3>{item.prompt}</h3>
                  <blockquote>{item.sourceSentence}</blockquote>
                  <p><span>上次回答</span>{item.lastAnswer || "未作答"}</p>
                  <footer>
                    <small>{item.lessonTitle}</small>
                    <button onClick={() => onStartReview(item.lessonId)}>
                      重新练习 <ArrowRight size={17} />
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className="review-empty">
              <CheckCircle2 />
              <div><strong>暂时没有未解决错题</strong><span>之后答错的题目会自动集中到这里。</span></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  note: string;
  tone?: "gold" | "green";
}) {
  return (
    <article className={`review-summary-card ${tone ?? ""}`}>
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><p>{note}</p></div>
    </article>
  );
}

function ReviewLessonCard({
  lesson,
  due = false,
  onStart,
}: {
  lesson: ReviewLesson;
  due?: boolean;
  onStart: () => void;
}) {
  return (
    <article className={`review-lesson-card ${due ? "due" : ""}`}>
      <div className="review-lesson-date">
        <span>{due ? "已到期" : formatShortDate(lesson.dueAt)}</span>
        <small>第 {lesson.step + 1} 次巩固</small>
      </div>
      <div className="review-lesson-copy">
        <span>第 {String(lesson.lessonId).padStart(2, "0")} 课</span>
        <h3>{lesson.title}</h3>
        <div>
          {lesson.weakDimensions.length
            ? lesson.weakDimensions.map((dimension) => <em key={dimension}>{dimensionNames[dimension]}</em>)
            : <em>综合巩固</em>}
        </div>
      </div>
      <button onClick={onStart}>{due ? "开始复习" : "提前复习"}<ArrowRight size={17} /></button>
    </article>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
