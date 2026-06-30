import { useEffect, useState, type RefObject } from "react";
import { type ChordEntry } from "../music";
import {
  type Triad, type Ext, type Alt, type ChordParts,
  decomposeQuality, composeQuality, TRIAD_OPTIONS, extOptionsFor, maj7Applicable, altOptionsFor,
} from "../chordQuality";
import { MiniRoll } from "./MiniRoll";
import type { Neta } from "../api";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
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
  const [dotted, setDotted] = useState(false); // 付点：長さボタンを ×1.5（1拍→1.5＝6/8ビート、2拍→3＝6/8小節）
  const durFor = (v: number) => (dotted ? v * 1.5 : v);
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
  // 三和音/拡張/△/オルタードのどれかを変えて quality を再合成（無効な組合せは正規化）。
  function setParts(i: number, cur: ChordParts, patch: Partial<ChordParts>) {
    let p: ChordParts = { ...cur, ...patch };
    // 三和音や拡張を変えたら、その三和音で許される拡張へ寄せる
    const exts = extOptionsFor(p.tri).map((o) => o.v);
    if (!exts.includes(p.ext)) p.ext = "";
    if (!maj7Applicable(p.tri, p.ext)) p.maj7 = false;
    if (!altOptionsFor(p.tri, p.ext, p.maj7).some((o) => o.v === p.alt)) p.alt = "";
    update(i, { quality: composeQuality(p) });
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
      {chords.map((c, i) => {
        const parts = decomposeQuality(c.quality);
        const altOpts = altOptionsFor(parts.tri, parts.ext, parts.maj7);
        return (
        <div className={"chord-row" + (i === activeIdx ? " playing" : "")} key={i}>
          <span className="chord-sym">
            {ROOTS[c.root]}
            {c.quality}
            {c.bass != null && c.bass !== c.root ? `/${ROOTS[c.bass]}` : ""}
          </span>
          <select aria-label={`root-${i}`} value={c.root} onChange={(e) => update(i, { root: Number(e.target.value) })}>
            {ROOTS.map((r, idx) => (
              <option key={idx} value={idx}>{r}</option>
            ))}
          </select>
          {/* 三和音（maj は「""＝無印」表示。ユーザー要望） */}
          <select aria-label={`triad-${i}`} value={parts.tri} title="三和音"
            onChange={(e) => setParts(i, parts, { tri: e.target.value as Triad })}>
            {TRIAD_OPTIONS.map((t) => (
              <option key={t.v} value={t.v}>{t.label}</option>
            ))}
          </select>
          {/* 拡張（番号だけ＝ドミナント既定。三和音で可否が変わる） */}
          <select aria-label={`ext-${i}`} value={parts.ext} title="拡張（7=ドミナント♭7）"
            onChange={(e) => setParts(i, parts, { ext: e.target.value as Ext })}>
            {extOptionsFor(parts.tri).map((x) => (
              <option key={x.v} value={x.v}>{x.label}</option>
            ))}
          </select>
          {/* △＝長7（C7→Cmaj7）。7/9/13 のときだけ */}
          {maj7Applicable(parts.tri, parts.ext) && (
            <button type="button" aria-label={`maj7-${i}`} title="長7（maj7）にする"
              className={"chord-maj7" + (parts.maj7 ? " on" : "")}
              onClick={() => setParts(i, parts, { maj7: !parts.maj7 })}>△</button>
          )}
          {/* オルタード（ドミナント♭9/♯9/♯11/♭5・maj7♯11）。選択肢が複数のときだけ */}
          {altOpts.length > 1 && (
            <select aria-label={`alt-${i}`} value={parts.alt} title="オルタード"
              onChange={(e) => setParts(i, parts, { alt: e.target.value as Alt })}>
              {altOpts.map((a) => (
                <option key={a.v} value={a.v}>{a.label}</option>
              ))}
            </select>
          )}
          {/* 分数コードのオンベース（決定B）。—=ルート（通常） */}
          <select aria-label={`bass-${i}`} value={c.bass ?? ""} title="オンベース（分数コード）"
            onChange={(e) => update(i, { bass: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">/ —</option>
            {ROOTS.map((r, idx) => (
              <option key={idx} value={idx}>/{r}</option>
            ))}
          </select>
          <div className="chord-len" aria-label={`len-${i}`}>
            {LENGTHS.map((l) => (
              <button key={l.v} type="button" className={"len" + (c.dur === durFor(l.v) ? " on" : "")} aria-label={`len-${i}-${l.v}`} onClick={() => update(i, { dur: durFor(l.v) })}>
                {l.label}
              </button>
            ))}
          </div>
          <button type="button" aria-label={`remove-chord-${i}`} onClick={() => remove(i)}>✕</button>
        </div>
        );
      })}
      <div className="chord-foot">
        <button type="button" className="bs-btn" onClick={add}>＋コード</button>
        {/* 付点：以降クリックする長さボタンを ×1.5（6/8 の付点四分=1.5拍・付点二分=3拍に対応）。 */}
        <button
          type="button"
          className={"bs-btn" + (dotted ? " on" : "")}
          aria-label="dotted"
          aria-pressed={dotted}
          title="付点（長さ×1.5・6/8対応）"
          onClick={() => setDotted((d) => !d)}
        >
          付点．
        </button>
        {chords.length > 0 && (
          <span className="muted chord-total">計 {chords.reduce((s, c) => s + c.dur, 0)}拍（{Math.round((chords.reduce((s, c) => s + c.dur, 0) / 4) * 10) / 10}小節）</span>
        )}
      </div>
    </div>
  );
}
