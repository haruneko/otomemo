import { useState, type Ref } from "react";
import { type ChordPatternContent, type ChordTone } from "../music";
import { BarsControl } from "./BarsControl";
import { MiniRoll } from "./MiniRoll";
import type { Neta } from "../api";

const NAME_PX = 58;
const BEAT_PX = 88;
const TONES: ChordTone[] = ["R", "3", "5", "7"];
const LENGTHS = [
  { label: "16", v: 1 },
  { label: "8", v: 2 },
  { label: "4", v: 4 },
  { label: "2分", v: 8 },
];

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
  const [len, setLen] = useState(4); // 各音の長さ（step数・既定=四分）
  const v = pattern.voicing;
  const bars = Math.max(1, Math.round(pattern.steps / stepsPerBar));
  const startAt = (s: number) => pattern.hits.find((h) => h.step === s);
  const sustainAt = (s: number) => pattern.hits.some((h) => h.step < s && s < h.step + h.dur);
  const toggleHit = (s: number) => {
    if (startAt(s)) onChange({ ...pattern, hits: pattern.hits.filter((h) => h.step !== s) }); // 同所タップ＝消す
    else onChange({ ...pattern, hits: [...pattern.hits, { step: s, dur: len }].sort((a, b) => a.step - b.step) });
  };
  const toggleTone = (t: ChordTone) => {
    const has = v.tones.includes(t);
    if (has && v.tones.length <= 1) return; // 最低1音は残す
    onChange({ ...pattern, voicing: { ...v, tones: (has ? v.tones.filter((x) => x !== t) : [...v.tones, t]).sort((a, b) => TONES.indexOf(a) - TONES.indexOf(b)) } });
  };

  // voicing の結果（key tonic に解決した積み和音）をピアノロールで可視化（ドッグフード[中]）。
  const previewNeta = { kind: "chord_pattern", content: pattern, key: 0 } as unknown as Neta;

  return (
    <div className="rhythm-editor" ref={scrollerRef}>
      {pattern.hits.length > 0 && (
        <div className="chord-roll" aria-label="voicing-roll">
          <MiniRoll neta={previewNeta} />
        </div>
      )}
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
        <div className="cp-tones" aria-label="lengths">
          <span className="muted">音長</span>
          {LENGTHS.map((l) => (
            <button key={l.v} type="button" aria-label={`len-${l.v}`} className={len === l.v ? "len on" : "len"} onClick={() => setLen(l.v)}>{l.label}</button>
          ))}
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
            className={"rhythm-cell" + (startAt(s) ? " on" : sustainAt(s) ? " sustain" : "") + (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")}
            onClick={() => toggleHit(s)}
          />
        ))}
      </div>
    </div>
  );
}
