import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Keyboard,
  RotateCcw,
  Volume2,
} from "lucide-react";
import type { PronunciationData } from "../../types";
import { PronunciationLine } from "./PronunciationLine";

export interface ChapterStudyCard {
  term: string;
  meaning: string;
  example: string | null;
  pronunciation?: PronunciationData | undefined;
}

export function ChapterWordStudy({
  chapterLabel,
  cards,
  onClose,
  onTrainCard,
  onTrainChapter,
}: {
  chapterLabel: string;
  cards: ChapterStudyCard[];
  onClose: () => void;
  onTrainCard: (index: number) => void;
  onTrainChapter: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [knownIndexes, setKnownIndexes] = useState<Set<number>>(() => new Set());
  const [speechAvailable] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const current = cards[index];
  const complete = index >= cards.length;
  const progress = cards.length ? Math.min(index / cards.length, 1) * 100 : 0;
  const knownCount = knownIndexes.size;
  const needsPractice = useMemo(
    () => cards.map((_card, cardIndex) => cardIndex).filter((cardIndex) => !knownIndexes.has(cardIndex)),
    [cards, knownIndexes],
  );

  useEffect(() => {
    setMeaningVisible(false);
  }, [index]);

  function speak() {
    if (!current || !speechAvailable) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.term);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  function advance(known: boolean) {
    setKnownIndexes((currentIndexes) => {
      const next = new Set(currentIndexes);
      if (known) next.add(index);
      else next.delete(index);
      return next;
    });
    setIndex((currentIndex) => currentIndex + 1);
  }

  if (!cards.length) {
    return (
      <section className="chapter-study chapter-study-empty">
        <h2>本章暂时没有可学习的单词</h2>
        <button className="primary-button" onClick={onClose}>返回章节</button>
      </section>
    );
  }

  if (complete) {
    return (
      <section className="chapter-study chapter-study-complete">
        <span><Check size={18} />本章浏览完成</span>
        <h1>{chapterLabel}</h1>
        <p>本轮认识 {knownCount} 项，需要继续练习 {needsPractice.length} 项。这个结果只用于本轮自查，不会标记掌握或限制后续学习。</p>
        <div className="chapter-study-result">
          <span><small>本章词数</small><strong>{cards.length}</strong></span>
          <span><small>本轮认识</small><strong>{knownCount}</strong></span>
          <span><small>建议练习</small><strong>{needsPractice.length}</strong></span>
        </div>
        <div className="chapter-study-actions">
          <button onClick={() => { setIndex(0); setKnownIndexes(new Set()); }}><RotateCcw size={17} />重新浏览</button>
          <button className="primary-button" onClick={onTrainChapter}><Keyboard size={17} />进入本章训练</button>
          <button onClick={onClose}>返回章节</button>
        </div>
      </section>
    );
  }

  const activeCard = cards[index]!;

  return (
    <section className="chapter-study">
      <header className="chapter-study-header">
        <button onClick={onClose}><ArrowLeft size={18} />退出学习</button>
        <div><span>{chapterLabel}</span><strong>{index + 1} / {cards.length}</strong></div>
      </header>
      <div className="chapter-study-progress"><i style={{ width: `${progress}%` }} /></div>

      <main className="chapter-card-stage">
        <span className="chapter-card-kicker">单词卡 · 先回想，再核对</span>
        <article className={meaningVisible ? "revealed" : ""}>
          <div className="chapter-card-word">
            <h1>{activeCard.term}</h1>
            <button disabled={!speechAvailable} onClick={speak} aria-label={`朗读 ${activeCard.term}`}>
              <Volume2 size={21} />{speechAvailable ? "听发音" : "当前浏览器不支持发音"}
            </button>
          </div>
          <PronunciationLine pronunciation={activeCard.pronunciation} />
          <div className="chapter-card-answer">
            {meaningVisible ? (
              <>
                <span>中文释义</span>
                <h2>{activeCard.meaning}</h2>
                {activeCard.example ? <blockquote>{activeCard.example}</blockquote> : null}
              </>
            ) : (
              <button onClick={() => setMeaningVisible(true)}><Eye size={20} />显示释义并核对</button>
            )}
          </div>
        </article>

        <div className="chapter-card-controls">
          <button disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
            <ArrowLeft size={18} />上一个
          </button>
          <button onClick={() => onTrainCard(index)}><Keyboard size={18} />练这个词</button>
          {meaningVisible ? (
            <>
              <button className="needs-work" onClick={() => advance(false)}><EyeOff size={18} />还不熟</button>
              <button className="known" onClick={() => advance(true)}>认识了<ArrowRight size={18} /></button>
            </>
          ) : (
            <button className="next-card" onClick={() => setMeaningVisible(true)}>先核对释义<ArrowRight size={18} /></button>
          )}
        </div>
      </main>
    </section>
  );
}
