import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Headphones, ShieldCheck, Volume2 } from "lucide-react";
import { api } from "../../api";
import type { WordAssessment, WordAssessmentResult } from "../../types";
import { PronunciationLine } from "./PronunciationLine";

type Dimension = "listening" | "meaning" | "spelling" | "context";
type Answer = { term: string; meaning: string; listening: string; spelling: string; context: string };

const dimensions: Dimension[] = ["listening", "meaning", "spelling", "context"];
const labels: Record<Dimension, string> = {
  listening: "听音辨词",
  meaning: "释义识别",
  spelling: "完整拼写",
  context: "例句填空",
};

export function WordAssessmentView({
  lessonId,
  chapterLabel,
  demo,
  onClose,
  onSaved,
}: {
  lessonId: number;
  chapterLabel: string;
  demo: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assessment, setAssessment] = useState<WordAssessment | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<WordAssessmentResult | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const request = demo ? Promise.resolve(demoAssessment(lessonId)) : api.wordAssessment(lessonId);
    request.then((loaded) => {
      if (cancelled) return;
      setAssessment(loaded);
      setAnswers(loaded.items.map((item) => ({
        term: item.term,
        meaning: "",
        listening: "",
        spelling: "",
        context: "",
      })));
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "正式考核加载失败");
    });
    return () => {
      cancelled = true;
      stopAudio();
    };
  }, [demo, lessonId]);

  function stopAudio() {
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    audioRef.current?.pause();
  }

  function playAudio() {
    if (!assessment) return;
    const item = assessment.items[Math.floor(questionIndex / dimensions.length)];
    if (!item) return;
    stopAudio();
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = item.audioUrl;
    audio.currentTime = item.audioStart ?? 0;
    void audio.play().catch(() => setError("音频暂时无法播放，请稍后再试"));
    if (item.audioEnd !== undefined) {
      stopTimerRef.current = window.setTimeout(stopAudio, Math.max(100, (item.audioEnd - (item.audioStart ?? 0)) * 1_000));
    }
  }

  if (error && !assessment) {
    return <section className="word-assessment-state"><ShieldCheck size={42} /><h2>暂时无法开始正式考核</h2><p>{error}</p><button onClick={onClose}>返回本章</button></section>;
  }
  if (!assessment) {
    return <section className="word-assessment-state"><ShieldCheck size={42} /><h2>正在生成正式考核</h2><p>系统正在准备固定题目和课程音频。</p></section>;
  }
  if (!assessment.items.length) {
    return <section className="word-assessment-state"><ShieldCheck size={42} /><h2>本章暂时没有可考核词条</h2><p>正式考核需要词条、例句填空和固定课程音频同时存在。</p><button onClick={onClose}>返回本章</button></section>;
  }
  if (result) {
    return (
      <section className="word-assessment-result">
        <span><CheckCircle2 size={18} />正式成绩已保存</span>
        <h2>{result.masteredCount} / {result.results.length} 个词达到 80 分</h2>
        <p>每个词都必须通过释义、听音、完整拼写和例句四项核对。未通过不会阻止继续学习。</p>
        <div>
          {result.results.map((item) => (
            <article className={item.passed ? "passed" : ""} key={item.term}>
              <header><strong>{item.term}</strong><em>{item.total} 分</em></header>
              <PronunciationLine pronunciation={assessment.items.find((candidate) => candidate.term === item.term)?.pronunciation} compact />
              <ul>
                <li>释义 {item.meaning}</li><li>听音 {item.listening}</li><li>拼写 {item.spelling}</li><li>例句 {item.context}</li>
              </ul>
              <small>{item.passed ? "本次达到标准" : "需要训练后再次考核"}</small>
            </article>
          ))}
        </div>
        <footer><button onClick={onClose}><ArrowLeft size={18} />返回本章</button><button className="primary-button" onClick={() => { setResult(null); setQuestionIndex(0); setAnswers(assessment.items.map((item) => ({ term: item.term, meaning: "", listening: "", spelling: "", context: "" }))); }}>再次考核</button></footer>
      </section>
    );
  }

  const itemIndex = Math.floor(questionIndex / dimensions.length);
  const dimension = dimensions[questionIndex % dimensions.length]!;
  const item = assessment.items[itemIndex]!;
  const answer = answers[itemIndex]!;
  const totalQuestions = assessment.items.length * dimensions.length;
  const currentValue = answer[dimension];

  async function advance() {
    if (!currentValue.trim() || submitting) return;
    stopAudio();
    if (questionIndex < totalQuestions - 1) {
      setQuestionIndex((value) => value + 1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const saved = demo ? demoResult(answers) : await api.submitWordAssessment(lessonId, answers);
      setResult(saved);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "正式成绩保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  function update(value: string) {
    setAnswers((current) => current.map((entry, index) => index === itemIndex ? { ...entry, [dimension]: value } : entry));
  }

  return (
    <section className="word-assessment">
      <header>
        <button onClick={onClose}><ArrowLeft size={18} />退出考核</button>
        <div><small>{chapterLabel}</small><h2>单词正式考核</h2></div>
        <span>{questionIndex + 1} / {totalQuestions}</span>
      </header>
      <div className="word-assessment-progress"><i style={{ width: `${((questionIndex + 1) / totalQuestions) * 100}%` }} /></div>
      <main>
        <div className="word-assessment-meta"><span>{labels[dimension]}</span><small>第 {itemIndex + 1} 个词 · 本维度只提交一次</small></div>
        {dimension === "listening" ? (
          <div className="assessment-prompt audio"><Headphones size={34} /><h3>播放固定课程音频，写出目标词或短语</h3><button onClick={playAudio}><Volume2 size={19} />播放音频片段</button></div>
        ) : null}
        {dimension === "meaning" ? <div className="assessment-prompt"><small>选择正确中文释义</small><h3>{item.term}</h3></div> : null}
        {dimension === "spelling" ? <div className="assessment-prompt"><small>根据释义完整拼写</small><h3>{item.spellingPrompt}</h3></div> : null}
        {dimension === "context" ? <div className="assessment-prompt"><small>填写例句中缺少的词或短语</small><h3>{item.clozePrompt}</h3></div> : null}

        {dimension === "meaning" ? (
          <div className="meaning-options">
            {item.meaningOptions.map((option) => <button className={currentValue === option ? "selected" : ""} key={option} onClick={() => update(option)}>{option}</button>)}
          </div>
        ) : (
          <input
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={currentValue}
            onChange={(event) => update(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void advance(); }}
            placeholder="输入完整答案"
            aria-label={labels[dimension]}
          />
        )}
        {error ? <p className="vocabulary-form-error" role="alert">{error}</p> : null}
        <footer>
          <p>正式考核不提供即时答案；完成整组后统一核对。</p>
          <button className="primary-button" disabled={!currentValue.trim() || submitting} onClick={() => void advance()}>
            {submitting ? "正在保存…" : questionIndex === totalQuestions - 1 ? "提交正式考核" : "下一题"}<ArrowRight size={18} />
          </button>
        </footer>
      </main>
    </section>
  );
}

function demoAssessment(lessonId: number): WordAssessment {
  return {
    lessonId,
    passingScore: 80,
    items: [{
      term: "organize",
      meaningOptions: ["组织；整理", "完成", "发送", "检查"],
      sentenceId: "demo-1",
      clozePrompt: "I _____ my work before I begin.",
      spellingPrompt: "组织；整理",
      audioUrl: "",
      pronunciation: {
        status: "verified",
        us: { ipa: "ˈɔːrɡənaɪz", alternatives: [], audioUrl: null },
        uk: { ipa: "ˈɔːɡənaɪz", alternatives: [], audioUrl: null },
        parts: [],
      },
    }],
  };
}

function demoResult(answers: Answer[]): WordAssessmentResult {
  const results = answers.map((answer) => {
    const meaning = answer.meaning === "组织；整理" ? 100 : 0;
    const listening = answer.listening.trim().toLowerCase() === answer.term.toLowerCase() ? 100 : 0;
    const spelling = answer.spelling.trim().toLowerCase() === answer.term.toLowerCase() ? 100 : 0;
    const context = answer.context.trim().toLowerCase() === answer.term.toLowerCase() ? 100 : 0;
    const total = meaning * .25 + listening * .25 + spelling * .3 + context * .2;
    return { term: answer.term, meaning, listening, spelling, context, total, passed: total >= 80 };
  });
  return { attemptAt: new Date().toISOString(), passingScore: 80, masteredCount: results.filter((item) => item.passed).length, results };
}
