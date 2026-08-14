import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Headphones, ShieldCheck, Volume2 } from "lucide-react";
import { api } from "../../api";
import type { WordReviewResult, WordReviewTask } from "../../types";

type Dimension = "listening" | "meaning" | "spelling" | "context";
type Answer = Record<Dimension, string>;

const dimensions: Dimension[] = ["listening", "meaning", "spelling", "context"];
const labels: Record<Dimension, string> = {
  listening: "听音辨词",
  meaning: "释义识别",
  spelling: "完整拼写",
  context: "例句填空",
};

export function WordReviewView({ task, onClose, onSaved }: {
  task: WordReviewTask;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [answers, setAnswers] = useState<Answer>({ listening: "", meaning: "", spelling: "", context: "" });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<WordReviewResult | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!task.task) {
    return <section className="word-assessment-state"><ShieldCheck size={42} /><h2>这项复习暂时无法开始</h2><p>课程词条已变化，系统没有找到可核对的固定题目。</p><button onClick={onClose}>返回复习中心</button></section>;
  }

  if (result) {
    const evidence = result.evidence;
    return (
      <section className="word-assessment-result">
        <span><CheckCircle2 size={18} />复习记录已同步</span>
        <h2>{evidence.term} · {evidence.total} 分</h2>
        <p>{evidence.passed ? (evidence.decision === "master" ? "已完成整轮间隔复习，计入长期掌握。" : "本次达标，系统已安排下一次复习。") : "本次未达标，已退回巩固阶段，但不会限制继续学习下一课。"}</p>
        <div>
          <article className={evidence.passed ? "passed" : ""}>
            <header><strong>第 {evidence.stepBefore + 1} 次复习</strong><em>{evidence.total} 分</em></header>
            <ul><li>释义 {evidence.meaning}</li><li>听音 {evidence.listening}</li><li>拼写 {evidence.spelling}</li><li>例句 {evidence.context}</li></ul>
            <small>{evidence.passed ? "四项核对达到 80 分" : "需要再次巩固后复习"}</small>
          </article>
        </div>
        <footer><button onClick={() => { onSaved(); onClose(); }}><ArrowLeft size={18} />返回复习中心</button></footer>
      </section>
    );
  }

  const dimension = dimensions[questionIndex]!;
  const currentValue = answers[dimension];

  function playAudio() {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = task.task!.audioUrl;
    audio.currentTime = 0;
    void audio.play().catch(() => setError("单词音频暂时无法播放，请稍后再试"));
  }

  async function advance() {
    if (!currentValue.trim() || submitting) return;
    audioRef.current?.pause();
    if (questionIndex < dimensions.length - 1) {
      setQuestionIndex((value) => value + 1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      setResult(await api.submitWordReview(task.id, answers));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "复习记录保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="word-assessment">
      <header>
        <button onClick={onClose}><ArrowLeft size={18} />退出复习</button>
        <div><small>第 {String(task.lessonId).padStart(2, "0")} 课 · 第 {task.step + 1} 次</small><h2>单词间隔复习</h2></div>
        <span>{questionIndex + 1} / {dimensions.length}</span>
      </header>
      <div className="word-assessment-progress"><i style={{ width: `${((questionIndex + 1) / dimensions.length) * 100}%` }} /></div>
      <main>
        <div className="word-assessment-meta"><span>{labels[dimension]}</span><small>完成四项后统一显示结果</small></div>
        {dimension === "listening" ? <div className="assessment-prompt audio"><Headphones size={34} /><h3>播放词典中的单词音频，写出目标词或短语</h3><button onClick={playAudio}><Volume2 size={19} />播放单词</button></div> : null}
        {dimension === "meaning" ? <div className="assessment-prompt"><small>选择正确中文释义</small><h3>{task.term}</h3></div> : null}
        {dimension === "spelling" ? <div className="assessment-prompt"><small>根据释义完整拼写</small><h3>{task.task.spellingPrompt}</h3></div> : null}
        {dimension === "context" ? <div className="assessment-prompt"><small>填写例句中缺少的词或短语</small><h3>{task.task.clozePrompt}</h3></div> : null}
        {dimension === "meaning" ? (
          <div className="meaning-options">{task.task.meaningOptions.map((option) => <button className={currentValue === option ? "selected" : ""} key={option} onClick={() => setAnswers((value) => ({ ...value, meaning: option }))}>{option}</button>)}</div>
        ) : (
          <input autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={currentValue} onChange={(event) => setAnswers((value) => ({ ...value, [dimension]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") void advance(); }} placeholder="输入完整答案" aria-label={labels[dimension]} />
        )}
        {error ? <p className="vocabulary-form-error" role="alert">{error}</p> : null}
        <footer><p>复习失败会退回巩固阶段，但不影响继续学习下一课。</p><button className="primary-button" disabled={!currentValue.trim() || submitting} onClick={() => void advance()}>{submitting ? "正在核对…" : questionIndex === dimensions.length - 1 ? "提交复习" : "下一题"}<ArrowRight size={18} /></button></footer>
      </main>
    </section>
  );
}
