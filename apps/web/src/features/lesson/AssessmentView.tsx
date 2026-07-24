import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Headphones, Mic, PenLine, ScrollText } from "lucide-react";
import { api } from "../../api";
import { demoAssessment } from "../../demo";
import type { Assessment } from "../../types";

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
      onClose();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.submitAttempt(lessonId, answers);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请稍后重试");
      setSubmitting(false);
    }
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
