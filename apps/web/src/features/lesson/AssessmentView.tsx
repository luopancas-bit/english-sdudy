import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Headphones, Mic, PenLine, ScrollText, Target } from "lucide-react";
import { api } from "../../api";
import { demoAssessment } from "../../demo";
import type { Assessment, AttemptResult } from "../../types";

const dimensionNames = {
  listening: "听力",
  reading: "精读",
  speaking: "跟读",
  writing: "听写",
};

const dimensionIcons = {
  listening: Headphones,
  reading: ScrollText,
  speaking: Mic,
  writing: PenLine,
};

export function AssessmentView({
  lessonId,
  demo,
  onClose,
}: {
  lessonId: number;
  demo: boolean;
  onClose: () => void;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(demo ? demoAssessment : null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    if (!demo) api.assessment(lessonId).then(setAssessment);
  }, [demo, lessonId]);

  if (!assessment) return <div className="loading-screen">正在准备考核…</div>;
  const question = assessment.questions[index]!;
  const Icon = dimensionIcons[question.dimension];
  const finalQuestion = index === assessment.questions.length - 1;
  const answer = answers[question.id] ?? "";

  async function continueAssessment() {
    if (!finalQuestion) {
      setIndex((value) => value + 1);
      return;
    }
    if (demo) {
      setResult({
        attemptId: "demo-attempt",
        countsTowardMastery: true,
        scores: { listening: 80, reading: 70, speaking: 0, writing: 0 },
        mastery: {
          score: 59,
          band: "introduced",
          dimensions: { listening: 80, reading: 70, speaking: 0, writing: 0 },
        },
      });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      setResult(await api.submitAttempt(lessonId, answers));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请稍后重试");
      setSubmitting(false);
    }
  }

  if (result) {
    return <AssessmentResult result={result} lessonTitle={assessment.title} onDone={onClose} />;
  }

  return (
    <main className="assessment-page">
      <header>
        <button onClick={onClose}><ArrowLeft size={19} />返回今日学习</button>
        <div><strong>第 {String(assessment.lessonId).padStart(2, "0")} 课</strong><span>{assessment.title}</span></div>
        <span>{index + 1} / {assessment.questions.length}</span>
      </header>
      <div className="assessment-progress"><i style={{ width: `${((index + 1) / assessment.questions.length) * 100}%` }} /></div>
      <section className="question-sheet">
        <div className="question-kind"><Icon size={22} /><span>{dimensionNames[question.dimension]}考核</span></div>
        <h1>{question.prompt}</h1>
        <p>正式考核完成整组后统一显示结果，本题不会即时透露答案。</p>
        {question.options ? (
          <div className="answer-options">
            {question.options.map((option, optionIndex) => (
              <button key={option} className={answer === option ? "selected" : ""} onClick={() => setAnswers((value) => ({ ...value, [question.id]: option }))}>
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}{answer === option && <Check size={18} />}
              </button>
            ))}
          </div>
        ) : (
          <textarea value={answer} onChange={(event) => setAnswers((value) => ({ ...value, [question.id]: event.target.value }))} placeholder="在这里输入你的答案" />
        )}
        <footer>
          <span>{error || "同一天仅第一次正式考核计入掌握度，练习不计分"}</span>
          <button disabled={!answer.trim() || submitting} onClick={continueAssessment}>
            {submitting ? "正在提交…" : finalQuestion ? "提交考核" : "下一题"}<ArrowRight size={18} />
          </button>
        </footer>
      </section>
    </main>
  );
}

function AssessmentResult({
  result,
  lessonTitle,
  onDone,
}: {
  result: AttemptResult;
  lessonTitle: string;
  onDone: () => void;
}) {
  const passed = result.mastery.score >= 80;
  return (
    <main className="assessment-result-page">
      <section className="result-sheet">
        <div className={`result-seal ${passed ? "passed" : ""}`}><Target size={30} /></div>
        <span>正式考核结果</span>
        <h1>{lessonTitle}</h1>
        <div className="result-score"><strong>{result.mastery.score}</strong><small>/ 100</small></div>
        <p>
          {passed
            ? "本课已达到掌握标准，系统仍会按计划安排复习。"
            : "本次结果已进入复习计划，你仍然可以继续学习下一课。"}
        </p>
        <div className="result-dimensions">
          {Object.entries(dimensionNames).map(([key, label]) => (
            <div key={key}><span>{label}</span><strong>{result.scores[key as keyof typeof result.scores]}</strong></div>
          ))}
        </div>
        <div className="result-rule">
          {result.countsTowardMastery
            ? "这是今天第一次正式考核，成绩已计入最近三次加权。"
            : "今天已有正式成绩，本次完整保留用于复盘，但不重复计入掌握率。"}
        </div>
        <button className="primary-button" onClick={onDone}>返回今日学习<ArrowRight size={18} /></button>
      </section>
    </main>
  );
}
