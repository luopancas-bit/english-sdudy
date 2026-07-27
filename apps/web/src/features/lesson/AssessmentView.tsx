import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Headphones, Mic, PenLine, Play, ScrollText, Square, Target } from "lucide-react";
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
}: {
  lessonId: number;
  demo: boolean;
  kind?: "formal" | "practice" | "review";
  onClose: () => void;
}) {
  const [assessment, setAssessment] = useState<Assessment | null>(demo ? demoAssessment : null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [recordings, setRecordings] = useState<Record<string, string>>({});
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
      setResult(await api.submitAttempt(lessonId, answers, kind, recordings));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请稍后重试");
      setSubmitting(false);
    }
  }

  if (result) {
    return <AssessmentResult result={result} lessonTitle={assessment.title} kind={kind} onDone={onClose} />;
  }

  return (
    <main className="assessment-page">
      <header>
        <button onClick={onClose}><ArrowLeft size={19} />返回{kind === "review" ? "复习中心" : "今日学习"}</button>
        <div><strong>第 {String(assessment.lessonId).padStart(2, "0")} 课</strong><span>{assessment.title}</span></div>
        <span>{index + 1} / {assessment.questions.length}</span>
      </header>
      <div className="assessment-progress"><i style={{ width: `${((index + 1) / assessment.questions.length) * 100}%` }} /></div>
      <section className="question-sheet">
        <div className="question-kind"><Icon size={22} /><span>{dimensionNames[question.dimension]}考核</span></div>
        <h1>{question.prompt}</h1>
        <p>{kind === "review" ? "完成整组复习后统一显示结果，本题不会即时透露答案。" : "正式考核完成整组后统一显示结果，本题不会即时透露答案。"}</p>
        {question.audioUrl && <QuestionAudio url={question.audioUrl} start={question.audioStart} end={question.audioEnd} />}
        {question.options ? (
          <div className="answer-options">
            {question.options.map((option, optionIndex) => (
              <button key={option} className={answer === option ? "selected" : ""} onClick={() => setAnswers((value) => ({ ...value, [question.id]: option }))}>
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}{answer === option && <Check size={18} />}
              </button>
            ))}
          </div>
        ) : question.type === "speech" ? (
          <SpeechAnswer
            lessonId={lessonId}
            questionId={question.id}
            demo={demo}
            value={answer}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            onUploaded={(recordingId) => setRecordings((current) => ({ ...current, [question.id]: recordingId }))}
            onError={setError}
            speechText={question.speechText}
          />
        ) : (
          <textarea value={answer} onChange={(event) => setAnswers((value) => ({ ...value, [question.id]: event.target.value }))} placeholder="在这里输入你的答案" />
        )}
        <footer>
          <span>{error || (kind === "review" ? "计划复习会更新掌握度和下一次复习时间" : "同一天仅第一次正式考核计入掌握度，练习不计分")}</span>
          <button disabled={!answer.trim() || (question.type === "speech" && kind !== "practice" && !recordings[question.id]) || submitting} onClick={continueAssessment}>
            {submitting ? "正在提交…" : finalQuestion ? kind === "review" ? "提交复习" : "提交考核" : "下一题"}<ArrowRight size={18} />
          </button>
        </footer>
      </section>
    </main>
  );
}

function QuestionAudio({ url, start, end }: { url: string; start?: number | undefined; end?: number | undefined }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipUrl = start === undefined ? url : `${url}#t=${start},${end ?? ""}`;
  return (
    <div className="assessment-audio">
      <Headphones size={20} />
      <div><strong>考核音频</strong><small>{start === undefined ? "播放本课音频后作答。" : "本题只播放对应句子，可重复核对。"}</small></div>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={clipUrl}
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
          }
        }}
      />
    </div>
  );
}

function SpeechAnswer({
  lessonId,
  questionId,
  demo,
  value,
  onChange,
  onUploaded,
  onError,
  speechText,
}: {
  lessonId: number;
  questionId: string;
  demo: boolean;
  value: string;
  onChange: (value: string) => void;
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
  const [uploaded, setUploaded] = useState(false);

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
      setUploaded(false);
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
      setUploaded(true);
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
        <span>{recording ? "正在录音…" : uploading ? "正在保存录音…" : uploaded ? <><Check size={15} />录音已保存</> : "正式考核必须保存录音"}</span>
      </div>
      <label>
        <span>朗读文本核对</span>
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="录音后输入你实际朗读的英文，系统用于当前文本准确度评分" />
      </label>
      <p><Play size={15} />提交前请回放录音核对；当前版本保存原始录音作为复盘证据，发音质量评分将在语音识别模型接入后启用。</p>
    </div>
  );
}

function AssessmentResult({
  result,
  lessonTitle,
  kind,
  onDone,
}: {
  result: AttemptResult;
  lessonTitle: string;
  kind: "formal" | "practice" | "review";
  onDone: () => void;
}) {
  const passed = result.mastery.score >= 80;
  return (
    <main className="assessment-result-page">
      <section className="result-sheet">
        <div className={`result-seal ${passed ? "passed" : ""}`}><Target size={30} /></div>
        <span>{kind === "review" ? "计划复习结果" : kind === "practice" ? "练习结果" : "正式考核结果"}</span>
        <h1>{lessonTitle}</h1>
        <div className="result-score"><strong>{result.mastery.score}</strong><small>/ 100</small></div>
        <p>
          {kind === "review" && passed
            ? "本次复习已达到掌握标准，下一次间隔会根据结果自动调整。"
            : passed
            ? "本课已达到掌握标准，系统仍会按计划安排复习。"
            : "本次结果已进入复习计划，你仍然可以继续学习下一课。"}
        </p>
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
        <button className="primary-button" onClick={onDone}>返回{kind === "review" ? "复习中心" : "今日学习"}<ArrowRight size={18} /></button>
      </section>
    </main>
  );
}
