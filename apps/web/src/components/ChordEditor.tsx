import { useEffect, useState, type RefObject } from "react";
import { type ChordEntry, beatsPerBar } from "../music";
import {
  type Triad, type Ext, type Alt, type ChordParts,
  decomposeQuality, composeQuality, TRIAD_OPTIONS, extOptionsFor, altOptionsFor,
} from "../chordQuality";
import { MiniRoll } from "./MiniRoll";
import type { Neta } from "../api";

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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
  meter,
}: {
  chords: ChordEntry[];
  onChange: (c: ChordEntry[]) => void;
  beatRef?: RefObject<number>;
  playing?: boolean;
  meter?: string; // 拍子（「1小節」の拍数を拍子で正しく／6/8対応・評価修正B）
}) {
  const bpb = beatsPerBar(meter); // 1小節の拍数（6/8=3・4/4=4）
  // 長さ選択肢＝拍子基準（1小節=bpb拍）。付点＝長さ×1.5。
  const LENGTHS = [
    { v: 1, label: "1拍" },
    { v: 2, label: "2拍" },
    { v: bpb, label: "1小節" },
    { v: bpb * 2, label: "2小節" },
  ];
  const isDotted = (d: number) => LENGTHS.some((l) => Math.abs(d - l.v * 1.5) < 1e-6);
  const baseDur = (d: number) => (isDotted(d) ? d / 1.5 : d);
  const [activeIdx, setActiveIdx] = useState(-1);
  // 長さボタン：その基準長にする（付点状態は引き継ぐ）。付点ボタン：その行の長さを×1.5 ⇔ 等倍でトグル。
  function setLen(i: number, dur: number, v: number) {
    update(i, { dur: isDotted(dur) ? v * 1.5 : v });
  }
  function toggleDot(i: number, dur: number) {
    const b = baseDur(dur);
    update(i, { dur: isDotted(dur) ? b : b * 1.5 });
  }
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
  // 三和音/拡張/オルタードのどれかを変えて quality を再合成（無効な組合せは正規化）。
  function setParts(i: number, cur: ChordParts, patch: Partial<ChordParts>) {
    const p: ChordParts = { ...cur, ...patch };
    // 三和音を変えたら、その三和音で許される拡張へ寄せる
    const exts = extOptionsFor(p.tri).map((o) => o.v);
    if (!exts.includes(p.ext)) p.ext = "";
    if (!altOptionsFor(p.tri, p.ext).some((o) => o.v === p.alt)) p.alt = "";
    update(i, { quality: composeQuality(p) });
  }
  function add() {
    commit([...chords, { root: 0, quality: "", start: 0, dur: bpb }]);
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
        const altOpts = altOptionsFor(parts.tri, parts.ext);
        return (
        <div className={"chord-row" + (i === activeIdx ? " playing" : "")} key={i}>
          {/* セレクタ行（root/三和音/拡張/オルタード/オンベース＋✕）。長さ行と分離＝E7で増えても混ざらない。 */}
          <div className="chord-q">
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
          {/* 三和音（空欄＝素のメジャー/ドミナント・maj＝長7。ユーザー決定） */}
          <select aria-label={`triad-${i}`} value={parts.tri} title="三和音（空欄=C7系 / maj=Cmaj7系）"
            onChange={(e) => setParts(i, parts, { tri: e.target.value as Triad })}>
            {TRIAD_OPTIONS.map((t) => (
              <option key={t.v} value={t.v}>{t.label}</option>
            ))}
          </select>
          {/* 拡張（番号。空欄三和音なら7=ドミナント、maj三和音なら7=長7） */}
          <select aria-label={`ext-${i}`} value={parts.ext} title="拡張"
            onChange={(e) => setParts(i, parts, { ext: e.target.value as Ext })}>
            {extOptionsFor(parts.tri).map((x) => (
              <option key={x.v} value={x.v}>{x.label}</option>
            ))}
          </select>
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
          <button type="button" className="chord-rm" aria-label={`remove-chord-${i}`} onClick={() => remove(i)}>✕</button>
          </div>{/* /chord-q */}
          <div className="chord-len" aria-label={`len-${i}`}>
            <span className="chord-len-label">長さ</span>
            {LENGTHS.map((l) => (
              <button key={l.v} type="button" className={"len" + (baseDur(c.dur) === l.v ? " on" : "")} aria-label={`len-${i}-${l.v}`} onClick={() => setLen(i, c.dur, l.v)}>
                {l.label}
              </button>
            ))}
            {/* 付点＝長さ4ボタンの後ろ（その行の長さを×1.5）。例 1拍→1.5。 */}
            <button type="button" className={"len dot" + (isDotted(c.dur) ? " on" : "")} aria-label={`dot-${i}`} aria-pressed={isDotted(c.dur)} title="付点（長さ×1.5）" onClick={() => toggleDot(i, c.dur)}>
              付点
            </button>
          </div>
        </div>
        );
      })}
      <div className="chord-foot">
        <button type="button" className="bs-btn" onClick={add}>＋コード</button>
        {chords.length > 0 && (
          <span className="muted chord-total">計 {chords.reduce((s, c) => s + c.dur, 0)}拍（{Math.round((chords.reduce((s, c) => s + c.dur, 0) / bpb) * 10) / 10}小節）</span>
        )}
      </div>
    </div>
  );
}
