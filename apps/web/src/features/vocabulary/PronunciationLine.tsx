import { useRef, useState } from "react";
import type { AccentPronunciation, PronunciationData } from "../../types";

export function PronunciationLine({
  pronunciation,
  compact = false,
}: {
  pronunciation?: PronunciationData | undefined;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<"us" | "uk" | null>(null);
  const value = pronunciation ?? pendingPronunciation;

  function play(accent: "us" | "uk", url: string | null) {
    if (!url) return;
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlaying(accent);
    audio.addEventListener("ended", () => setPlaying(null), { once: true });
    audio.addEventListener("error", () => setPlaying(null), { once: true });
    void audio.play().catch(() => setPlaying(null));
  }

  return (
    <div className={`pronunciation-line ${compact ? "compact" : ""}`} aria-label="美式与英式音标">
      <Accent label="美" accent="us" value={value.us} playing={playing === "us"} onPlay={play} />
      <Accent label="英" accent="uk" value={value.uk} playing={playing === "uk"} onPlay={play} />
      {(!value.us.ipa || !value.uk.ipa) && value.parts.length ? (
        <details className="pronunciation-parts">
          <summary>查看短语逐词音标</summary>
          {value.parts.map((part) => (
            <div key={part.term}>
              <strong>{part.term}</strong>
              <span>美 {formatIpa(part.us.ipa)}</span>
              <span>英 {formatIpa(part.uk.ipa)}</span>
            </div>
          ))}
        </details>
      ) : null}
      {value.status === "ambiguous" ? <small className="pronunciation-note">读音存在冲突，等待核对</small> : null}
    </div>
  );
}

function Accent({
  label,
  accent,
  value,
  playing,
  onPlay,
}: {
  label: string;
  accent: "us" | "uk";
  value: AccentPronunciation;
  playing: boolean;
  onPlay: (accent: "us" | "uk", url: string | null) => void;
}) {
  return (
    <div className="pronunciation-accent">
      <button
        className={`pronunciation-play ${playing ? "playing" : ""}`}
        type="button"
        disabled={!value.audioUrl}
        onClick={() => onPlay(accent, value.audioUrl)}
        aria-label={`${playing ? "正在播放" : "播放"}${label}式发音`}
        title={value.audioUrl ? `播放${label}式发音` : `${label}式音频待补全`}
      >
        <span>{label}</span>
        <strong className={value.ipa ? "" : "pending"}>{formatIpa(value.ipa)}</strong>
      </button>
      {value.alternatives.length ? (
        <details>
          <summary>其他读音</summary>
          {value.alternatives.map((alternative) => (
            <small key={`${alternative.ipa}-${alternative.partOfSpeech ?? ""}`}>
              {alternative.partOfSpeech ? `${alternative.partOfSpeech} ` : ""}{formatIpa(alternative.ipa)}
            </small>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function formatIpa(ipa: string | null) {
  if (!ipa) return "音标待补全";
  const trimmed = ipa.trim();
  const withoutOpening = trimmed.startsWith("/") || trimmed.startsWith("[") ? trimmed.slice(1) : trimmed;
  const normalized = withoutOpening.endsWith("/") || withoutOpening.endsWith("]")
    ? withoutOpening.slice(0, -1)
    : withoutOpening;
  return `/${normalized}/`;
}

const pendingAccent: AccentPronunciation = { ipa: null, alternatives: [], audioUrl: null };
const pendingPronunciation: PronunciationData = {
  status: "pending",
  us: pendingAccent,
  uk: pendingAccent,
  parts: [],
};
