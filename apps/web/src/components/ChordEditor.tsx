import { useEffect, useState, type RefObject } from "react";
import { type ChordEntry } from "../music";
import { MiniRoll } from "./MiniRoll";
import type { Neta } from "../api";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const QUALITIES = [
  { v: "", label: "maj" },
  { v: "m", label: "min" },
  { v: "7", label: "7" },
  { v: "maj7", label: "maj7" },
  { v: "m7", label: "m7" },
  { v: "dim", label: "dim" },
  { v: "aug", label: "aug" },
  { v: "sus4", label: "sus4" },
  { v: "6", label: "6" },
  { v: "m6", label: "m6" },
  { v: "9", label: "9" },
];
const LENGTHS = [
  { v: 1, label: "1拍" },
  { v: 2, label: "2拍" },
  { v: 4, label: "1小節" },
  { v: 8, label: "2小節" },
];

// コードは「順番に並ぶ」＝start は手入力でなく長さから自動フロー（直感的・"よくわからない"を解消）。
function reflow(chords: ChordEntry[]): ChordEntry[] {
  let t = 0;
  return chords.map((c) => {
    const out = { ...c, start: t };
    t += c.dur;
    return out;
  });
}

// コード列の編集（design #19）。C基準で root+quality を保存。順番＝進行・長さだけ選ぶ＋ピアノロール表示。
export function ChordEditor({
  chords,
  onChange,
  beatRef,
  playing,
}: {
  chords: ChordEntry[];
  onChange: (c: ChordEntry[]) => void;
  beatRef?: RefObject<number>;
  playing?: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState(-1);
  useEffect(() => {
    if (!playing || !beatRef) {
      setActiveIdx(-1);
      return;
    }
    const id = setInterval(() => {
      const b = beatRef.current ?? 0;
      setActiveIdx(chords.findIndex((c) => c.start <= b && b < c.start + c.dur));
    }, 100);
    return () => clearInterval(id);
  }, [playing, beatRef, chords]);

  // 変更は必ず reflow（start を順番から再計算）して保存＝start のズレ/手入力を排除。
  const commit = (cs: ChordEntry[]) => onChange(reflow(cs));
  function update(i: number, patch: Partial<ChordEntry>) {
    commit(chords.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }
  function add() {
    commit([...chords, { root: 0, quality: "", start: 0, dur: 4 }]);
  }
  function remove(i: number) {
    commit(chords.filter((_, k) => k !== i));
  }

  // ピアノロール表示用の合成 neta（読み取り専用の可視化）。
  const previewNeta = { kind: "chord_progression", content: { chords }, key: 0 } as unknown as Neta;

  return (
    <div className="chord-editor">
      {chords.length > 0 && (
        <div className="chord-roll" aria-label="chord-roll">
          <MiniRoll neta={previewNeta} />
        </div>
      )}
      {chords.length === 0 && <p className="muted">「＋コード」で追加（左から順に並びます）</p>}
      {chords.map((c, i) => (
        <div className={"chord-row" + (i === activeIdx ? " playing" : "")} key={i}>
          <span className="chord-sym">
            {ROOTS[c.root]}
            {c.quality}
          </span>
          <select aria-label={`root-${i}`} value={c.root} onChange={(e) => update(i, { root: Number(e.target.value) })}>
            {ROOTS.map((r, idx) => (
              <option key={idx} value={idx}>{r}</option>
            ))}
          </select>
          <select aria-label={`quality-${i}`} value={c.quality} onChange={(e) => update(i, { quality: e.target.value })}>
            {QUALITIES.map((q) => (
              <option key={q.v} value={q.v}>{q.label}</option>
            ))}
          </select>
          <div className="chord-len" aria-label={`len-${i}`}>
            {LENGTHS.map((l) => (
              <button key={l.v} type="button" className={"len" + (c.dur === l.v ? " on" : "")} aria-label={`len-${i}-${l.v}`} onClick={() => update(i, { dur: l.v })}>
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" aria-label={`remove-chord-${i}`} onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <div className="chord-foot">
        <button type="button" className="bs-btn" onClick={add}>＋コード</button>
        {chords.length > 0 && (
          <span className="muted chord-total">計 {chords.reduce((s, c) => s + c.dur, 0)}拍（{Math.round((chords.reduce((s, c) => s + c.dur, 0) / 4) * 10) / 10}小節）</span>
        )}
      </div>
    </div>
  );
}
