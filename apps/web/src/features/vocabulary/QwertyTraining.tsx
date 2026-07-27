import { useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Keyboard, RotateCcw } from "lucide-react";
import { evaluateTypingInput } from "@zhuguang/domain";
import { api } from "../../api";
import type { TypingTrainingEntry } from "../../types";

export function QwertyTraining({
  entries,
  demo,
  onClose,
  returnLabel = "返回生词本",
}: {
  entries: TypingTrainingEntry[];
  demo: boolean;
  onClose: () => void;
  returnLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [correctionCount, setCorrectionCount] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(Date.now());
  const errorActive = useRef(false);
  const current = entries[index];
  const evaluation = useMemo(
    () => evaluateTypingInput(current?.term ?? "", input),
    [current?.term, input],
  );

  if (!current) {
    return (
      <section className="typing-session typing-complete">
        <CheckCircle2 size={54} />
        <span>本组训练完成</span>
        <h1>正确输入已经留下证据</h1>
        <p>训练不会直接标记掌握。正式四维考核通过后，单词才会进入“已掌握”。</p>
        <button className="primary-button" onClick={onClose}>{returnLabel}</button>
      </section>
    );
  }

  function updateInput(value: string) {
    const next = evaluateTypingInput(current!.term, value);
    if (next.hasError && !errorActive.current) {
      errorActive.current = true;
      setCorrectionCount((count) => count + 1);
      setFirstTryCorrect(false);
    } else if (!next.hasError) {
      errorActive.current = false;
    }
    setInput(value);
    setError("");
  }

  async function completeWord() {
    if (!evaluation.isComplete || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!demo && current!.recordEntryId) {
        await api.recordVocabularyTraining({
          entryId: current!.recordEntryId,
          mode: "guided",
          firstTryCorrect,
          correctionCount,
          durationMs: Math.max(100, Date.now() - startedAt.current),
          device: window.matchMedia("(max-width: 700px)").matches ? "mobile" : "desktop",
        });
      }
      setIndex((value) => value + 1);
      setInput("");
      setCorrectionCount(0);
      setFirstTryCorrect(true);
      errorActive.current = false;
      startedAt.current = Date.now();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练记录保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="typing-session">
      <header className="typing-header">
        <button className="typing-back" onClick={onClose}><ArrowLeft size={19} />退出训练</button>
        <div>
          <span>QWERTY GUIDED PRACTICE</span>
          <strong>{index + 1} / {entries.length}</strong>
        </div>
      </header>

      <div className="typing-progress"><i style={{ width: `${(index / entries.length) * 100}%` }} /></div>

      <main className="typing-stage">
        <span className="typing-kicker"><Keyboard size={17} />看释义，完整键入</span>
        <p className="typing-meaning">{current.meaning}</p>
        {current.example ? <blockquote>{current.example}</blockquote> : null}

        <div className="typing-word" aria-label={`目标词：${current.term}`}>
          {Array.from(evaluation.normalizedExpected).map((character, characterIndex) => {
            const typed = evaluation.normalizedInput[characterIndex];
            const state = typed === undefined
              ? "pending"
              : character.toLocaleLowerCase("en-US") === typed
                ? "correct"
                : "wrong";
            return <span className={state} key={`${characterIndex}-${character}`}>{character === " " ? "·" : character}</span>;
          })}
        </div>

        <label className={`typing-input ${evaluation.hasError ? "has-error" : evaluation.isComplete ? "is-complete" : ""}`}>
          <input
            autoFocus
            value={input}
            onChange={(event) => updateInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void completeWord();
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            aria-label="输入单词或短语"
            placeholder="在这里开始输入"
          />
          <small>
            {evaluation.hasError
              ? "这个字符不正确，请退格修正"
              : evaluation.isComplete
                ? "输入正确，按 Enter 记录并继续"
                : "错误必须修正，首次错误会保留在训练记录中"}
          </small>
        </label>

        <div className="typing-evidence">
          <span><RotateCcw size={16} />纠错 {correctionCount} 次</span>
          <span>{firstTryCorrect ? "首次输入仍保持正确" : "首次输入已有错误记录"}</span>
        </div>
        {error ? <p className="typing-error" role="alert">{error}</p> : null}
        <button className="primary-button typing-next" disabled={!evaluation.isComplete || saving} onClick={() => void completeWord()}>
          {saving ? "正在保存证据…" : "记录并继续"}
        </button>
      </main>
    </section>
  );
}
