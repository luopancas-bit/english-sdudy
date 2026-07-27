import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Check, Headphones, Languages, ListChecks, Volume2 } from "lucide-react";
import { api } from "../../api";
import { demoLesson } from "../../demo";
import type { LessonContent, User } from "../../types";

type StudyTab = "text" | "sentences" | "vocabulary";

export function LessonStudyView({
  lessonId,
  learner,
  demo,
  onClose,
  onStartAssessment,
}: {
  lessonId: number;
  learner: User;
  demo: boolean;
  onClose: () => void;
  onStartAssessment: () => void;
}) {
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [tab, setTab] = useState<StudyTab>("text");
  const [translationVisible, setTranslationVisible] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [savedTerms, setSavedTerms] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    if (demo) {
      setLesson({ ...demoLesson, id: lessonId });
      return () => {
        active = false;
      };
    }
    api.lesson(lessonId)
      .then((value) => {
        if (active) setLesson(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "课程内容加载失败");
      });
    return () => {
      active = false;
    };
  }, [demo, lessonId]);

  const preferredAudio = useMemo(
    () => lesson?.audio[learner.preferredAccent] ?? lesson?.audio.us ?? lesson?.audio.uk ?? null,
    [learner.preferredAccent, lesson],
  );

  if (error) {
    return <main className="lesson-study-state"><BookOpenText size={44} /><h1>课程暂时无法打开</h1><p>{error}</p><button onClick={onClose}>返回课程</button></main>;
  }
  if (!lesson) return <div className="loading-screen">正在展开本课内容…</div>;

  async function saveWord(term: string, meaning: string) {
    if (demo || savedTerms.has(term)) {
      setSavedTerms((current) => new Set(current).add(term));
      return;
    }
    try {
      await api.addVocabulary({ term, meaning, lessonId });
      setSavedTerms((current) => new Set(current).add(term));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "生词保存失败");
    }
  }

  return (
    <main className="lesson-study-page">
      <header className="lesson-study-header">
        <button onClick={onClose}><ArrowLeft size={19} />返回</button>
        <div><small>第 {String(lesson.id).padStart(2, "0")} 课</small><strong>{lesson.titleZh}</strong></div>
        <button className="assessment-entry" onClick={onStartAssessment}>进入正式考核<ArrowRight size={17} /></button>
      </header>

      <section className="lesson-hero">
        <div>
          <span>LESSON {String(lesson.id).padStart(2, "0")}</span>
          <h1>{lesson.titleEn}</h1>
          <p>{lesson.titleZh}</p>
        </div>
        <div className="lesson-audio">
          <div><Headphones size={21} /><span>{learner.preferredAccent === "uk" ? "英式发音" : "美式发音"}全文精听</span></div>
          {preferredAudio && !audioUnavailable ? (
            <audio controls preload="metadata" src={preferredAudio} onError={() => setAudioUnavailable(true)} />
          ) : (
            <p><Volume2 size={18} />音频资源待部署，正文学习不受影响。</p>
          )}
        </div>
      </section>

      <nav className="lesson-tabs" aria-label="课程学习内容">
        <button className={tab === "text" ? "active" : ""} onClick={() => setTab("text")}><BookOpenText size={18} />精读课文</button>
        <button className={tab === "sentences" ? "active" : ""} onClick={() => setTab("sentences")}><ListChecks size={18} />逐句学习</button>
        <button className={tab === "vocabulary" ? "active" : ""} onClick={() => setTab("vocabulary")}><Languages size={18} />核心词汇</button>
      </nav>

      <section className="lesson-content-sheet">
        {tab === "text" && (
          <div className="lesson-reading">
            <div className="lesson-section-heading"><div><span>01</span><h2>精读课文</h2></div><button onClick={() => setTranslationVisible((value) => !value)}>{translationVisible ? "隐藏译文" : "显示译文"}</button></div>
            <article lang="en">{lesson.englishText}</article>
            {translationVisible && <article className="translation" lang="zh-CN">{lesson.chineseText}</article>}
          </div>
        )}
        {tab === "sentences" && (
          <div className="sentence-list">
            <div className="lesson-section-heading"><div><span>02</span><h2>逐句学习</h2></div><small>先朗读，再核对课文</small></div>
            {lesson.sentences.map((sentence, index) => (
              <article key={sentence.id}><span>{String(index + 1).padStart(2, "0")}</span><p>{sentence.text}</p>{sentence.cloze && <small>重点：{sentence.cloze}</small>}</article>
            ))}
          </div>
        )}
        {tab === "vocabulary" && (
          <div className="lesson-vocabulary">
            <div className="lesson-section-heading"><div><span>03</span><h2>核心词汇</h2></div><small>{lesson.vocabulary.length} 个词汇与短语</small></div>
            <div className="lesson-vocabulary-grid">
              {lesson.vocabulary.map((item) => {
                const saved = savedTerms.has(item.term);
                return (
                  <article key={item.term}><div><strong>{item.term}</strong><p>{item.definition}</p></div><button disabled={saved} onClick={() => void saveWord(item.term, item.definition)}>{saved ? <><Check size={16} />已加入</> : "加入生词本"}</button></article>
                );
              })}
            </div>
          </div>
        )}
        {error && <p className="lesson-inline-error">{error}</p>}
      </section>

      <footer className="lesson-study-footer">
        <div><strong>准备好接受检验了吗？</strong><p>浏览和播放不会提高掌握度，只有正式考核或计划复习成绩才会计入。</p></div>
        <button className="primary-button" onClick={onStartAssessment}>进入正式考核<ArrowRight size={18} /></button>
      </footer>
    </main>
  );
}
