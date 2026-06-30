import { useState, type Ref } from "react";
import { type ChordPatternContent, type ChordTone } from "../music";
import { previewNote } from "../audio";
import { BarsControl } from "./BarsControl";
import { MiniRoll } from "./MiniRoll";
import { NoteValuePicker } from "./NoteValuePicker";
import type { Neta } from "../api";

const NAME_PX = 58;
const BEAT_PX = 88;
const TONES: ChordTone[] = ["R", "3", "5", "7"];
// プレビュー用：構成音→Cからの半音（R=C/3=E/5=G/7=B♭）。再生時は調/コードで解決、入力時はC基準で鳴らす。
const TONE_SEMI: Record<ChordTone, number> = { R: 0, "3": 4, "5": 7, "7": 10 };
// 音長（step数・1step=16分）。16/8/4/2/1 を他エディタ(メロ/ベース)と揃える（"2分"表記を"2"に統一）。
const LENGTHS = [
  { label: "16", v: 1 },
  { label: "8", v: 2 },
  { label: "4", v: 4 },
  { label: "2", v: 8 },
  { label: "1", v: 16 },
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
  const [dotted, setDotted] = useState(false); // 付点：音長×1.5（6/8 対応）
  const v = pattern.voicing;
  const bars = Math.max(1, Math.round(pattern.steps / stepsPerBar));
  const startAt = (s: number) => pattern.hits.find((h) => h.step === s);
  const sustainAt = (s: number) => pattern.hits.some((h) => h.step < s && s < h.step + h.dur);
  const toggleHit = (s: number) => {
    if (startAt(s)) {
      onChange({ ...pattern, hits: pattern.hits.filter((h) => h.step !== s) }); // 同所タップ＝消す
      return;
    }
    onChange({ ...pattern, hits: [...pattern.hits, { step: s, dur: dotted ? len * 1.5 : len }].sort((a, b) => a.step - b.step) });
    // 置いた打点でボイシング（構成音）をC基準で即鳴らす。
    const base = 48 + (v.octave ?? 0) * 12; // C3 基準＋高さ
    for (const t of v.tones) void previewNote({ pitch: base + (TONE_SEMI[t] ?? 0), start: 0, dur: 0.5 });
  };
  const toggleTone = (t: ChordTone) => {
    const has = v.tones.includes(t);
    if (has && v.tones.length <= 1) return; // 最低1音は残す
    onChange({ ...pattern, voicing: { ...v, tones: (has ? v.tones.filter((x) => x !== t) : [...v.tones, t]).sort((a, b) => TONES.indexOf(a) - TONES.indexOf(b)) } });
  };

  // voicing の結果（key tonic に解決した積み和音）をピアノロールで可視化（ドッグフード[中]）。
  const previewNeta = { kind: "chord_pattern", content: pattern, key: 0 } as unknown as Neta;

  return (
    <div className="cp-editor">
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
          <NoteValuePicker
            options={LENGTHS}
            value={len}
            dotted={dotted}
            onChange={setLen}
            onToggleDotted={() => setDotted((d) => !d)}
          />
        </div>
        <BarsControl bars={bars} max={4} onChange={(n) => onChange({ ...pattern, steps: Math.max(1, Math.min(4, n)) * stepsPerBar })} />
      </div>
      {/* グリッドだけ横スクロール枠に（コントロールは枠の外＝広いグリッドに引き伸ばされない・メロと同じ）。 */}
      <div className="rhythm-editor" ref={scrollerRef}>
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
    </div>
  );
}
