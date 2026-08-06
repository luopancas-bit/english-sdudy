import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleDashed,
  Keyboard,
  LibraryBig,
  MessageSquareText,
  Play,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api";
import { demoLesson } from "../../demo";
import type {
  LessonContent,
  TypingTrainingEntry,
  VocabularyEntry,
  WordMemoryChapter,
  WordMemoryStats,
} from "../../types";
import { QwertyTraining } from "./QwertyTraining";
import { ChapterWordStudy, type ChapterStudyCard } from "./ChapterWordStudy";
import { WordAssessmentView } from "./WordAssessmentView";

const demoChapters: WordMemoryChapter[] = [
  { lessonId: 8, titleEn: "Computer", titleZh: "电脑", vocabularyCount: 3, sentenceCount: 3 },
  { lessonId: 9, titleEn: "Internet", titleZh: "互联网", vocabularyCount: 8, sentenceCount: 5 },
  { lessonId: 10, titleEn: "Email", titleZh: "电子邮件", vocabularyCount: 7, sentenceCount: 4 },
];

export function WordMemory({ demo }: { demo: boolean }) {
  const [chapters, setChapters] = useState<WordMemoryChapter[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [includeWords, setIncludeWords] = useState(true);
  const [includeSentences, setIncludeSentences] = useState(false);
  const [training, setTraining] = useState<TypingTrainingEntry[] | null>(null);
  const [studying, setStudying] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [stats, setStats] = useState<WordMemoryStats | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const chaptersPromise = demo
      ? Promise.resolve({ chapters: demoChapters })
      : api.wordMemoryChapters();
    const statsPromise = demo
      ? Promise.resolve<WordMemoryStats>({
          summary: { attempts: 12, practicedItems: 7, firstTryAccuracy: 75, corrections: 4, formalAttempts: 4, masteredWords: 2 },
          lessons: [{ lessonId: 8, attempts: 12, practicedItems: 7, firstTryAccuracy: 75, corrections: 4, lastPracticedAt: new Date().toISOString(), formalAttempts: 4, masteredWords: 2 }],
        })
      : api.wordMemoryStats();
    Promise.all([chaptersPromise, statsPromise]).then(([{ chapters: loaded }, loadedStats]) => {
      if (cancelled) return;
      setChapters(loaded);
      setStats(loadedStats);
      setSelectedId((current) => current ?? loaded[0]?.lessonId ?? null);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "词典章节加载失败");
    });
    return () => { cancelled = true; };
  }, [demo]);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    setLesson(null);
    setError("");
    const load = demo ? Promise.resolve({ ...demoLesson, id: selectedId }) : api.lesson(selectedId);
    load.then((loaded) => {
      if (!cancelled) setLesson(loaded);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "本章词典加载失败");
    });
    return () => { cancelled = true; };
  }, [demo, selectedId]);

  const selectedChapter = chapters.find((chapter) => chapter.lessonId === selectedId);
  const selectedStats = stats?.lessons.find((item) => item.lessonId === selectedId);
  const selectedCount = (includeWords ? lesson?.vocabulary.length ?? 0 : 0)
    + (includeSentences ? lesson?.sentences.length ?? 0 : 0);
  const preview = useMemo(() => {
    if (!lesson) return [];
    return [
      ...(includeWords ? lesson.vocabulary.map((word) => ({
        key: `word-${word.term}`,
        type: "单词",
        term: word.term,
        meaning: word.definition,
      })) : []),
      ...(includeSentences ? lesson.sentences.map((sentence) => ({
        key: `sentence-${sentence.id}`,
        type: "短句",
        term: sentence.text,
        meaning: "完整键入本句",
      })) : []),
    ];
  }, [includeSentences, includeWords, lesson]);
  const studyCards = useMemo<ChapterStudyCard[]>(() => {
    if (!lesson) return [];
    return lesson.vocabulary.map((word) => ({
      term: word.term,
      meaning: word.definition,
      example: lesson.sentences.find((sentence) =>
        sentence.text.toLocaleLowerCase("en-US").includes(word.term.toLocaleLowerCase("en-US"))
      )?.text ?? null,
    }));
  }, [lesson]);

  async function prepareTraining(
    single?: { kind: "word" | "sentence"; index: number },
    wordsOnly = false,
  ) {
    if (!lesson || preparing) return;
    setPreparing(true);
    setError("");
    try {
      const words = single?.kind === "word"
        ? lesson.vocabulary.slice(single.index, single.index + 1)
        : single ? [] : wordsOnly || includeWords ? lesson.vocabulary : [];
      const sentences = single?.kind === "sentence"
        ? lesson.sentences.slice(single.index, single.index + 1)
        : single || wordsOnly ? [] : includeSentences ? lesson.sentences : [];
      const savedWords: VocabularyEntry[] = demo
        ? words.map((word, index) => ({
            id: `demo-chapter-${lesson.id}-${index}`,
            term: word.term,
            meaning: word.definition,
            example: null,
            lessonId: lesson.id,
            status: "learning",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
        : await Promise.all(words.map((word) => api.addVocabulary({
            term: word.term,
            meaning: word.definition,
            lessonId: lesson.id,
          })));
      setTraining([
        ...savedWords.map((word) => ({
          id: `word-${word.id}`,
          term: word.term,
          meaning: word.meaning,
          example: word.example,
          recordEntryId: word.id,
          wordMemory: { lessonId: lesson.id, itemType: "word" as const, itemKey: word.term },
        })),
        ...sentences.map((sentence) => ({
          id: `sentence-${lesson.id}-${sentence.id}`,
          term: sentence.text,
          meaning: `第 ${String(lesson.id).padStart(2, "0")} 章短句`,
          example: null,
          wordMemory: { lessonId: lesson.id, itemType: "sentence" as const, itemKey: sentence.id },
        })),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练准备失败");
    } finally {
      setPreparing(false);
    }
  }

  if (training) {
    return (
      <QwertyTraining
        entries={training}
        demo={demo}
        onClose={() => {
          setTraining(null);
          if (!demo) void api.wordMemoryStats().then(setStats);
        }}
        returnLabel="返回单词记忆"
      />
    );
  }

  if (studying && lesson) {
    return (
      <ChapterWordStudy
        chapterLabel={`第 ${String(lesson.id).padStart(2, "0")} 章 · ${lesson.titleZh}`}
        cards={studyCards}
        onClose={() => setStudying(false)}
        onTrainCard={(index) => {
          setStudying(false);
          void prepareTraining({ kind: "word", index });
        }}
        onTrainChapter={() => {
          setStudying(false);
          setIncludeWords(true);
          setIncludeSentences(false);
          void prepareTraining(undefined, true);
        }}
      />
    );
  }

  if (assessing && lesson) {
    return (
      <WordAssessmentView
        lessonId={lesson.id}
        chapterLabel={`第 ${String(lesson.id).padStart(2, "0")} 章 · ${lesson.titleZh}`}
        demo={demo}
        onClose={() => setAssessing(false)}
        onSaved={() => {
          if (!demo) void api.wordMemoryStats().then(setStats);
        }}
      />
    );
  }

  if (error && !chapters.length) {
    return <section className="vocabulary-state error"><AlertCircle size={42} /><h2>暂时无法打开单词记忆</h2><p>{error}</p></section>;
  }

  return (
    <section className="word-memory">
      <div className="word-memory-hero">
        <div>
          <span className="word-memory-kicker"><LibraryBig size={16} />按章节自由学习</span>
          <h2>先把单词记住，再把它放进句子里</h2>
          <p>所有章节都可直接进入。训练结果只用于统计和复习反馈，不锁章节，也不阻止继续学习。</p>
        </div>
        <div className="word-memory-facts">
          <span><strong>{stats?.summary.practicedItems ?? 0}</strong> 项练习过</span>
          <span><strong>{stats?.summary.firstTryAccuracy ?? 0}%</strong> 首次正确</span>
          <span><strong>{stats?.summary.masteredWords ?? 0}</strong> 词已达标</span>
          <em><Check size={15} />无达标门槛</em>
        </div>
      </div>

      <div className="word-memory-layout">
        <aside className="chapter-picker">
          <header><small>章节词典</small><h3>选择章节</h3></header>
          <div>
            {chapters.map((chapter) => (
              <button
                className={chapter.lessonId === selectedId ? "active" : ""}
                key={chapter.lessonId}
                onClick={() => setSelectedId(chapter.lessonId)}
              >
                <span>{String(chapter.lessonId).padStart(2, "0")}</span>
                <div><strong>{chapter.titleZh}</strong><small>{chapter.titleEn} · {chapter.vocabularyCount} 词</small></div>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </aside>

        <div className="word-memory-content">
          {!lesson ? (
            <div className="word-memory-loading"><CircleDashed size={34} /><span>正在读取本章词典</span></div>
          ) : (
            <>
              <header className="chapter-heading">
                <div><small>第 {String(lesson.id).padStart(2, "0")} 章</small><h2>{selectedChapter?.titleZh ?? lesson.titleZh} <i>{selectedChapter?.titleEn ?? lesson.titleEn}</i></h2></div>
                <div className="chapter-heading-actions">
                  <button disabled={!lesson.vocabulary.length} onClick={() => setStudying(true)}>
                    <Play size={18} />学习本章
                  </button>
                  <button className="assessment-button" disabled={!lesson.vocabulary.length} onClick={() => setAssessing(true)}>
                    <ShieldCheck size={18} />正式考核
                  </button>
                  <button className="primary-button" disabled={!selectedCount || preparing} onClick={() => void prepareTraining()}>
                    <Keyboard size={18} />{preparing ? "正在准备…" : `训练整章所选 ${selectedCount} 项`}
                  </button>
                </div>
              </header>

              <div className="training-scope" aria-label="训练范围">
                <button className={includeWords ? "selected" : ""} onClick={() => setIncludeWords((value) => !value)}>
                  <BookOpenCheck size={22} /><span><strong>核心单词与短语</strong><small>{lesson.vocabulary.length} 项，可单独或整章训练</small></span><i>{includeWords ? "已选择" : "可选"}</i>
                </button>
                <button className={includeSentences ? "selected" : ""} onClick={() => setIncludeSentences((value) => !value)}>
                  <MessageSquareText size={22} /><span><strong>课文短句</strong><small>{lesson.sentences.length} 句，作为可选强化</small></span><i>{includeSentences ? "已选择" : "可选"}</i>
                </button>
              </div>
              <div className="chapter-training-stats" aria-label="本章训练统计">
                <span><small>累计训练</small><strong>{selectedStats?.attempts ?? 0} 次</strong></span>
                <span><small>练习内容</small><strong>{selectedStats?.practicedItems ?? 0} 项</strong></span>
                <span><small>首次正确率</small><strong>{selectedStats?.firstTryAccuracy ?? 0}%</strong></span>
                <span><small>累计纠错</small><strong>{selectedStats?.corrections ?? 0} 次</strong></span>
                <span><small>正式考核</small><strong>{selectedStats?.formalAttempts ?? 0} 词次</strong></span>
                <span><small>达到 80 分</small><strong>{selectedStats?.masteredWords ?? 0} 词</strong></span>
                <p>这些数字只帮助你判断复习重点，不影响任何章节的进入和学习。</p>
              </div>
              {!selectedCount ? <p className="scope-note">请选择单词、短句，或同时选择两种训练内容。</p> : null}
              {error ? <p className="vocabulary-form-error" role="alert">{error}</p> : null}

              <div className="word-memory-list">
                {preview.map((item) => {
                  const sourceIndex = item.type === "单词"
                    ? lesson.vocabulary.findIndex((word) => `word-${word.term}` === item.key)
                    : lesson.sentences.findIndex((sentence) => `sentence-${sentence.id}` === item.key);
                  return (
                    <article key={item.key}>
                      <span>{item.type}</span>
                      <div><strong>{item.term}</strong><p>{item.meaning}</p></div>
                      <button onClick={() => void prepareTraining({ kind: item.type === "单词" ? "word" : "sentence", index: sourceIndex })}>
                        <Keyboard size={16} />单独训练
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
