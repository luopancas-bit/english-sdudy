import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Headphones, Mic, Pause, PenLine, Play, RotateCcw, ScrollText, Square, Target } from "lucide-react";
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
  kind = "formal",
  onClose,
  onReview,
}: {
  lessonId: number;
  demo: boolean;
  kind?: "formal" | "practice" | "review";
  onClose: () => void;
  onReview?: () => void;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(demo ? demoAssessment : null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recordings, setRecordings] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "restored" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (demo) return;
    let active = true;
    setAssessment(null);
    setIndex(0);
    setAnswers({});
    setRecordings({});
    setSyncStatus("idle");
    void Promise.all([api.assessment(lessonId), api.assessmentDraft(lessonId, kind)])
      .then(([nextAssessment, { draft }]) => {
        if (!active) return;
        setAssessment(nextAssessment);
        if (draft) {
          setIndex(draft.currentIndex);
          setAnswers(draft.answers);
          setRecordings(draft.recordings);
          setSyncStatus("restored");
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "考核加载失败，请稍后重试");
      });
    return () => { active = false; };
  }, [demo, kind, lessonId]);

  function queueDraftSave(
    nextIndex: number,
    nextAnswers: Record<string, string>,
    nextRecordings: Record<string, string>,
    delay = 0,
  ) {
    if (demo) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const save = () => {
      if (mountedRef.current) setSyncStatus("saving");
      saveChainRef.current = saveChainRef.current
        .catch(() => undefined)
        .then(() => api.saveAssessmentDraft(lessonId, kind, nextIndex, nextAnswers, nextRecordings))
        .then(() => { if (mountedRef.current) setSyncStatus("saved"); })
        .catch(() => { if (mountedRef.current) setSyncStatus("error"); });
    };
    saveTimerRef.current = delay ? setTimeout(save, delay) : null;
    if (!delay) save();
  }

  function updateAnswer(questionId: string, value: string, delay = 0) {
    setAnswers((current) => {
      const next = { ...current, [questionId]: value };
      queueDraftSave(index, next, recordings, delay);
      return next;
    });
  }

  function closeAssessment() {
    queueDraftSave(index, answers, recordings);
    onClose();
  }

  if (!assessment) return <div className="loading-screen">正在准备考核…</div>;
  const question = assessment.questions[index]!;
  const Icon = dimensionIcons[question.dimension];
  const finalQuestion = index === assessment.questions.length - 1;
  const answer = answers[question.id] ?? "";
  const canContinue = question.type === "speech" ? Boolean(recordings[question.id]) : Boolean(answer.trim());

  async function continueAssessment() {
    if (!finalQuestion) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      queueDraftSave(nextIndex, answers, recordings);
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
      setResult(await api.submitAttempt(lessonId, answers, kind, recordings));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请稍后重试");
      setSubmitting(false);
    }
  }

  if (result) {
    return <AssessmentResult result={result} lessonTitle={assessment.title} kind={kind} onDone={onClose} {...(onReview ? { onReview } : {})} />;
  }

  return (
    <main className="assessment-page">
      <header>
        <button onClick={closeAssessment}><ArrowLeft size={19} /><span className="desktop-back-label">返回{kind === "review" ? "复习中心" : "今日学习"}</span><span className="mobile-back-label">返回</span></button>
        <div><strong>第 {String(assessment.lessonId).padStart(2, "0")} 课</strong><span>{assessment.title}</span></div>
        <span>{index + 1} / {assessment.questions.length}</span>
      </header>
      <div className="assessment-progress"><i style={{ width: `${((index + 1) / assessment.questions.length) * 100}%` }} /></div>
      <section className="question-sheet">
        <div className="question-kind"><Icon size={22} /><span>{dimensionNames[question.dimension]}考核</span></div>
        <h1>{question.prompt}</h1>
        <p>{kind === "review" ? "完成整组复习后统一显示结果，本题不会即时透露答案。" : "正式考核完成整组后统一显示结果，本题不会即时透露答案。"}</p>
        {question.audioUrl && <QuestionAudio key={question.id} url={question.audioUrl} mode={question.audioMode} start={question.audioStart} end={question.audioEnd} />}
        {question.options ? (
          <div className="answer-options">
            {question.options.map((option, optionIndex) => (
              <button key={option} aria-pressed={answer === option} className={answer === option ? "selected" : ""} onClick={() => updateAnswer(question.id, option)}>
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
              </button>
            ))}
          </div>
        ) : question.type === "speech" ? (
          <SpeechAnswer
            key={question.id}
            lessonId={lessonId}
            questionId={question.id}
            demo={demo}
            recordingId={recordings[question.id] ?? null}
            onRecordingStarted={() => setRecordings((current) => {
              const next = { ...current };
              delete next[question.id];
              queueDraftSave(index, answers, next);
              return next;
            })}
            onUploaded={(recordingId) => setRecordings((current) => {
              const next = { ...current, [question.id]: recordingId };
              queueDraftSave(index, answers, next);
              return next;
            })}
            onError={setError}
            speechText={question.speechText}
          />
        ) : (
          <textarea value={answer} onChange={(event) => updateAnswer(question.id, event.target.value, 500)} onBlur={() => queueDraftSave(index, answers, recordings)} placeholder="在这里输入你的答案" />
        )}
        <footer>
          <span>{error || (syncStatus === "restored" ? "已恢复上次进度" : syncStatus === "saving" ? "正在同步进度…" : syncStatus === "saved" ? "进度已同步，可在电脑或 iPhone 继续" : syncStatus === "error" ? "进度同步失败，请保持本页并重试" : kind === "review" ? "计划复习会更新掌握度和下一次复习时间" : "同一天仅第一次正式考核计入掌握度，练习不计分")}</span>
          <button disabled={!canContinue || submitting} onClick={continueAssessment}>
            {submitting ? "正在提交…" : finalQuestion ? kind === "review" ? "提交复习" : "提交考核" : "下一题"}<ArrowRight size={18} />
          </button>
        </footer>
      </section>
    </main>
  );
}

function QuestionAudio({ url, mode, start, end }: { url: string; mode?: "word" | "sentence" | undefined; start?: number | undefined; end?: number | undefined }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "played" | "error">("idle");
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.load();
    setState("idle");
  }, [url, start, end]);

  async function loadMetadata(audio: HTMLAudioElement) {
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return;
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("audio metadata failed")), { once: true });
      audio.load();
    });
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setState("played");
      return;
    }
    try {
      await loadMetadata(audio);
      audio.currentTime = start ?? 0;
      audio.playbackRate = speed;
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="assessment-audio">
      <div className="assessment-audio-copy"><Headphones size={20} /><div><strong>考核音频</strong><small>{mode === "word" ? "本题只播放一个目标单词或短语，可重复核对。" : start === undefined ? "播放本课音频后作答。" : "本题只播放对应句子，可重复核对。"}</small></div></div>
      <div className="assessment-audio-controls">
        <button type="button" className="assessment-play-button" onClick={togglePlayback} aria-label={state === "playing" ? "暂停考核音频" : state === "played" ? "重新播放考核音频" : "播放考核音频"}>
          {state === "playing" ? <Pause /> : state === "played" ? <RotateCcw /> : <Play />}
        </button>
        <span aria-live="polite">{state === "idle" ? "尚未播放" : state === "playing" ? "正在播放" : state === "error" ? "音频加载失败，请重试" : "可重新播放"}</span>
        {mode === "sentence" && <div className="assessment-speed" aria-label="播放速度">{[0.75, 1, 1.5, 2].map((value) => <button key={value} type="button" className={speed === value ? "active" : ""} onClick={() => { setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value; }}>{value}×</button>)}</div>}
      </div>
      <audio
        ref={audioRef}
        className="assessment-audio-element"
        preload="metadata"
        src={url}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && start !== undefined) audio.currentTime = start;
        }}
        onPlay={() => {
          const audio = audioRef.current;
          if (audio && start !== undefined && (audio.currentTime < start || (end !== undefined && audio.currentTime >= end))) {
            audio.currentTime = start;
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (audio && end !== undefined && audio.currentTime >= end) {
            audio.pause();
            if (start !== undefined) audio.currentTime = start;
            setState("played");
          }
        }}
        onEnded={() => setState("played")}
        onError={() => setState("error")}
      />
    </div>
  );
}

function SpeechAnswer({
  lessonId,
  questionId,
  demo,
  recordingId,
  onRecordingStarted,
  onUploaded,
  onError,
  speechText,
}: {
  lessonId: number;
  questionId: string;
  demo: boolean;
  recordingId: string | null;
  onRecordingStarted: () => void;
  onUploaded: (recordingId: string) => void;
  onError: (message: string) => void;
  speechText?: string | undefined;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function startRecording() {
    onError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("当前浏览器不支持录音，请使用最新版 Safari、Chrome 或 Edge。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => void finishRecording(recorder.mimeType);
      recorder.start();
      setRecording(true);
      onRecordingStarted();
    } catch {
      onError("无法使用麦克风。请允许浏览器访问麦克风后重新录制。");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  }

  async function finishRecording(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(blob));
    setUploading(true);
    try {
      const receipt = demo
        ? { recordingId: `demo-${questionId}` }
        : await api.uploadRecording(lessonId, questionId, blob);
      onUploaded(receipt.recordingId);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "录音上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="speech-answer">
      {speechText && <blockquote>{speechText}</blockquote>}
      <div className="speech-recorder">
        <button className={recording ? "recording" : ""} onClick={recording ? stopRecording : () => void startRecording()} type="button">
          {recording ? <><Square size={17} />停止录音</> : <><Mic size={18} />{audioUrl ? "重新录制" : "开始录音"}</>}
        </button>
        {audioUrl && <audio controls src={audioUrl} />}
        <span>{recording ? "正在录音…" : uploading ? "正在保存录音…" : recordingId ? <><Check size={15} />录音已保存</> : "正式考核必须保存录音"}</span>
      </div>
      <div className="speech-evidence">
        <strong>录音保存后即可进入下一题</strong>
        <span>不需要在手机上再次输入朗读文本。</span>
      </div>
      <p><Play size={15} />提交前可以回放核对；本版按有效录音保存口语证据，发音质量将在语音识别模型接入后进一步评分。</p>
    </div>
  );
}

function AssessmentResult({
  result,
  lessonTitle,
  kind,
  onDone,
  onReview,
}: {
  result: AttemptResult;
  lessonTitle: string;
  kind: "formal" | "practice" | "review";
  onDone: () => void;
  onReview?: () => void;
}) {
  const passed = result.mastery.score >= 80;
  const weakest = Object.entries(result.scores).reduce((current, entry) => entry[1] < current[1] ? entry : current);
  return (
    <main className="assessment-result-page">
      <section className="result-sheet">
        <div className={`result-seal ${passed ? "passed" : ""}`}><Target size={30} /></div>
        <span>{kind === "review" ? "计划复习结果" : kind === "practice" ? "练习结果" : "正式考核结果"}</span>
        <h1>{lessonTitle}</h1>
        <div className="result-summary">
          <div className="result-score"><strong>{result.mastery.score}</strong><small>/ 100</small></div>
          <div className="result-next-action"><span>{passed ? "已达到掌握标准" : "本次尚未达标"}</span><strong>优先巩固：{dimensionNames[weakest[0] as keyof typeof dimensionNames]} {weakest[1]} 分</strong><p>{passed ? "系统仍会按计划安排间隔复习。" : "成绩已进入复习计划，但不会限制继续学习下一课。"}</p></div>
        </div>
        <div className="result-actions">
          {onReview && <button className="primary-button" onClick={onReview}>复习错题与薄弱项<ArrowRight size={18} /></button>}
          <button className="result-secondary-button" onClick={onDone}>返回{kind === "review" ? "复习中心" : "今日学习"}</button>
        </div>
        <div className="result-dimensions">
          {Object.entries(dimensionNames).map(([key, label]) => (
            <div key={key}><span>{label}</span><strong>{result.scores[key as keyof typeof result.scores]}</strong></div>
          ))}
        </div>
        <div className="result-rule">
          {kind === "review"
            ? "计划复习已记录，复习间隔与薄弱维度会按本次结果更新。"
            : result.countsTowardMastery
            ? "这是今天第一次正式考核，成绩已计入最近三次加权。"
            : "今天已有正式成绩，本次完整保留用于复盘，但不重复计入掌握率。"}
        </div>
      </section>
    </main>
  );
}
