import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BookMarked,
  Check,
  CircleDashed,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { api } from "../../api";
import { demoVocabulary } from "../../demo";
import type { VocabularyData, VocabularyEntry, VocabularyInput } from "../../types";

type Filter = "all" | VocabularyEntry["status"];

export function VocabularyBook({ demo }: { demo: boolean }) {
  const [data, setData] = useState<VocabularyData | null>(() => demo ? demoVocabulary : null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    api.vocabulary()
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "生词本加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input: VocabularyInput = {
      term: String(formData.get("term") ?? "").trim(),
      meaning: String(formData.get("meaning") ?? "").trim(),
      example: String(formData.get("example") ?? "").trim() || null,
    };
    if (!input.term || !input.meaning) {
      setFormError("请填写单词或短语及中文释义");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const entry = demo
        ? {
            id: `demo-vocab-${Date.now()}`,
            term: input.term,
            meaning: input.meaning,
            example: input.example ?? null,
            lessonId: null,
            status: "learning" as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : await api.addVocabulary(input);
      setData((current) => current ? vocabularyDataWithEntry(current, entry) : current);
      form.reset();
      setFilter("all");
      setQuery("");
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "保存生词失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(entry: VocabularyEntry) {
    const status = entry.status === "learning" ? "mastered" : "learning";
    setUpdatingId(entry.id);
    try {
      const updated: VocabularyEntry = demo
        ? { ...entry, status, updatedAt: new Date().toISOString() }
        : await api.updateVocabularyStatus(entry.id, status);
      setData((current) => current ? vocabularyDataWithEntry(current, updated) : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生词状态更新失败");
    } finally {
      setUpdatingId("");
    }
  }

  if (error) {
    return (
      <section className="vocabulary-state error" role="alert">
        <AlertCircle size={42} />
        <h2>暂时无法读取生词本</h2>
        <p>{error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="vocabulary-state">
        <CircleDashed size={42} />
        <h2>正在打开生词本</h2>
        <p>正在读取你的个人词汇记录。</p>
      </section>
    );
  }

  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("en-US");
  const visibleEntries = data.entries.filter((entry) => {
    if (filter !== "all" && entry.status !== filter) return false;
    if (!normalizedQuery) return true;
    return `${entry.term} ${entry.meaning} ${entry.example ?? ""}`.toLocaleLowerCase("en-US").includes(normalizedQuery);
  });

  return (
    <section className="vocabulary-book">
      <div className="vocabulary-summary" aria-label="生词概览">
        <Summary label="全部词汇" value={data.summary.total} />
        <Summary label="正在学习" value={data.summary.learning} />
        <Summary label="已经掌握" value={data.summary.mastered} />
      </div>

      <div className="vocabulary-workspace">
        <aside className="vocabulary-form">
          <header>
            <span><Plus size={20} /></span>
            <div><h2>添加生词</h2><small>单词和常用短语都可以</small></div>
          </header>
          <form onSubmit={addEntry}>
            <label>
              单词或短语
              <input name="term" maxLength={80} autoComplete="off" placeholder="例如：organize" />
            </label>
            <label>
              中文释义
              <input name="meaning" maxLength={160} autoComplete="off" placeholder="例如：组织；整理" />
            </label>
            <label>
              例句（选填）
              <textarea name="example" maxLength={500} placeholder="写下遇到它时的完整句子" />
            </label>
            {formError ? <p className="vocabulary-form-error" role="alert">{formError}</p> : null}
            <button className="primary-button" disabled={saving}>
              <BookMarked size={18} />{saving ? "正在保存…" : "加入生词本"}
            </button>
          </form>
        </aside>

        <div className="vocabulary-list-column">
          <div className="vocabulary-toolbar">
            <label className="vocabulary-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索单词、释义或例句"
                aria-label="搜索生词"
              />
            </label>
            <div className="vocabulary-filters" aria-label="筛选生词">
              {filterOptions.map(([value, label]) => (
                <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleEntries.length ? (
            <div className="vocabulary-list">
              {visibleEntries.map((entry) => (
                <article className={`vocabulary-card ${entry.status}`} key={entry.id}>
                  <div>
                    <header>
                      <h3>{entry.term}</h3>
                      <span>{entry.lessonId ? `来自第 ${String(entry.lessonId).padStart(2, "0")} 课` : "个人添加"}</span>
                    </header>
                    <p className="meaning">{entry.meaning}</p>
                    {entry.example ? <blockquote>{entry.example}</blockquote> : null}
                  </div>
                  <button disabled={updatingId === entry.id} onClick={() => void toggleStatus(entry)}>
                    {entry.status === "learning" ? <Check size={17} /> : <RotateCcw size={17} />}
                    {entry.status === "learning" ? "标记已掌握" : "继续学习"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="vocabulary-empty">
              <BookMarked size={38} />
              <h3>{data.entries.length ? "没有符合条件的生词" : "生词本还是空的"}</h3>
              <p>{data.entries.length ? "试试其他关键词或筛选条件。" : "从左侧添加第一个需要反复记忆的词。"}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function vocabularyDataWithEntry(current: VocabularyData, entry: VocabularyEntry): VocabularyData {
  const entries = [entry, ...current.entries.filter((item) => item.id !== entry.id)];
  let learning = 0;
  let mastered = 0;
  for (const item of entries) {
    if (item.status === "mastered") mastered += 1;
    else learning += 1;
  }
  return {
    summary: { total: entries.length, learning, mastered },
    entries,
  };
}

const filterOptions: Array<[Filter, string]> = [
  ["all", "全部"],
  ["learning", "学习中"],
  ["mastered", "已掌握"],
];
