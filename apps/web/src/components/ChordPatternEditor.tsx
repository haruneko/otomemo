import { type Ref } from "react";
import { type ChordPatternContent, type ChordTone } from "../music";
import { BarsControl } from "./BarsControl";

const NAME_PX = 58;
const BEAT_PX = 88;
const TONES: ChordTone[] = ["R", "3", "5", "7"];

// 拍子→1小節step数（1step=16分）。4/4=16, 6/8=12, 3/4=12。複合(6/8系)はビート=6step。
function meterSteps(meter?: string): { stepsPerBar: number; beatStep: number } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  const n = m ? Number(m[1]) : 4;
  const d = m ? Number(m[2]) : 4;
  const stepsPerBar = n > 0 && d > 0 ? Math.round((n * 16) / d) : 16;
  return { stepsPerBar, beatStep: d === 8 && n % 3 === 0 && n >= 6 ? 6 : 4 };
}

// コード楽器パターン（CP3）：リズムstepグリッド(hits)＋voicing（mode/構成音/open-close/高さ）。
// スケッチ範囲＝シーケンサー化しない。進行への解決は合成/プレビュー側（resolveChordPattern）。
export function ChordPatternEditor({
  pattern,
  onChange,
  meter,
  playheadRef,
  scrollerRef,
}: {
  pattern: ChordPatternContent;
  onChange: (p: ChordPatternContent) => void;
  meter?: string;
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const { stepsPerBar, beatStep } = meterSteps(meter);
  const v = pattern.voicing;
  const bars = Math.max(1, Math.round(pattern.steps / stepsPerBar));
  const toggleHit = (s: number) =>
    onChange({ ...pattern, hits: pattern.hits.includes(s) ? pattern.hits.filter((h) => h !== s) : [...pattern.hits, s].sort((a, b) => a - b) });
  const toggleTone = (t: ChordTone) => {
    const has = v.tones.includes(t);
    if (has && v.tones.length <= 1) return; // 最低1音は残す
    onChange({ ...pattern, voicing: { ...v, tones: (has ? v.tones.filter((x) => x !== t) : [...v.tones, t]).sort((a, b) => TONES.indexOf(a) - TONES.indexOf(b)) } });
  };

  return (
    <div className="rhythm-editor" ref={scrollerRef}>
      <div className="cp-controls">
        <div className="input-toggle">
          <button type="button" className={pattern.mode === "strum" ? "on" : ""} onClick={() => onChange({ ...pattern, mode: "strum" })}>ストラム</button>
          <button type="button" className={pattern.mode === "arp" ? "on" : ""} onClick={() => onChange({ ...pattern, mode: "arp" })}>アルペジオ</button>
        </div>
        <div className="cp-tones" aria-label="tones">
          <span className="muted">構成音</span>
          {TONES.map((t) => (
            <button key={t} type="button" aria-label={`tone-${t}`} className={v.tones.includes(t) ? "len on" : "len"} onClick={() => toggleTone(t)}>{t}</button>
          ))}
        </div>
        <div className="input-toggle">
          <button type="button" className={v.openClose === "close" ? "on" : ""} onClick={() => onChange({ ...pattern, voicing: { ...v, openClose: "close" } })}>close</button>
          <button type="button" className={v.openClose === "open" ? "on" : ""} onClick={() => onChange({ ...pattern, voicing: { ...v, openClose: "open" } })}>open</button>
        </div>
        <div className="bars-control" title="高さ（オクターブ）">
          <span className="muted">高さ</span>
          <button type="button" aria-label="oct-dec" onClick={() => onChange({ ...pattern, voicing: { ...v, octave: Math.max(-1, v.octave - 1) } })}>−</button>
          <span aria-label="octave">{v.octave}</span>
          <button type="button" aria-label="oct-inc" onClick={() => onChange({ ...pattern, voicing: { ...v, octave: Math.min(2, v.octave + 1) } })}>＋</button>
        </div>
        <BarsControl bars={bars} max={4} onChange={(n) => onChange({ ...pattern, steps: Math.max(1, Math.min(4, n)) * stepsPerBar })} />
      </div>
      <div
        className="proll-playhead"
        aria-hidden="true"
        ref={playheadRef}
        style={{ left: `calc(${NAME_PX}px + var(--phb, 0) * ${BEAT_PX}px)` }}
      />
      <div className="rhythm-row">
        <span className="rhythm-name">コード</span>
        {Array.from({ length: pattern.steps }, (_, s) => (
          <button
            key={s}
            type="button"
            aria-label={`hit-${s}`}
            className={"rhythm-cell" + (pattern.hits.includes(s) ? " on" : "") + (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")}
            onClick={() => toggleHit(s)}
          />
        ))}
      </div>
    </div>
  );
}
