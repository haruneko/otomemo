import { useEffect, useRef, useState, type RefObject } from "react";
import { type ChordEntry, beatsPerBar, chordsToNotes, PITCH_NAMES as ROOTS } from "../music";
import {
  type Triad, type Ext, type Alt, type ChordParts,
  decomposeQuality, composeQuality, TRIAD_OPTIONS, extOptionsFor, altOptionsFor,
} from "../chordQuality";
import { reflow, insertAt, removeAt, snapLength, wrapRows, degreeColor } from "../chordTimeline";
import { MiniRoll } from "./MiniRoll";
import { Icon } from "./Icon";
import type { Neta } from "../api";

// 空エディタの初手ガイド（design提案#6）：初手の迷いを消す定番進行チップ。
// C基準（root=pitch class）。調は再生/生成時に適用＝ここは度数を実音に落とした素の並び。
const POPULAR_PROGRESSIONS: { name: string; chords: [number, string][] }[] = [
  { name: "王道 I–V–vi–IV", chords: [[0, ""], [7, ""], [9, "m"], [5, ""]] },
  { name: "小室 vi–IV–I–V", chords: [[9, "m"], [5, ""], [0, ""], [7, ""]] },
  { name: "50s I–vi–IV–V", chords: [[0, ""], [9, "m"], [5, ""], [7, ""]] },
  { name: "ツーファイブ ii–V–I", chords: [[2, "m7"], [7, "7"], [0, "maj7"]] },
  { name: "スリーコード I–IV–V", chords: [[0, ""], [5, ""], [7, ""]] },
];

// C基準の度数ラベル（key=0）。ブロック左上の小さな度数表示（機能の目印・移調不変の骨格）。
const DEGREE_LABEL = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"];
const degreeLabel = (root: number) => DEGREE_LABEL[(((Math.round(root) % 12) + 12) % 12)];

// 表示専用のダミー neta（MiniRoll は notes を渡せば content を読まない＝そのコードのボイシングだけ描く）。
const DUMMY_NETA = { kind: "chord_progression", content: {}, key: 0 } as unknown as Neta;
const nameOf = (c: ChordEntry) =>
  ROOTS[c.root] + c.quality + (c.bass != null && c.bass !== c.root ? `/${ROOTS[c.bass]}` : "");

// コード列の編集（design #26）＝折り返しブロックタイムライン。C基準で root+quality を保存。
// ブロック＝概観 兼 編集ハンドル：タップ→ピッカーシート／右端ドラッグ→長さ／＋シーム挿入／消しゴム削除。
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
  meter?: string; // 拍子（「1小節」の拍数を拍子で正しく／6/8対応）
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

  const [mode, setMode] = useState<"edit" | "erase">("edit"); // 鉛筆(編集)/消しゴム(外す)
  const [sheetIdx, setSheetIdx] = useState(-1); // ピッカーシートを開いているコード番号（-1=閉）
  const [pickProg, setPickProg] = useState(false); // 空状態の「よく使う進行から選ぶ」を開いているか
  const [activeIdx, setActiveIdx] = useState(-1); // 再生中コード（プレイヘッド下）
  const [barsPerRow, setBarsPerRow] = useState(4); // 折り返し＝1段の小節数（幅で自動・既定4）
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chordsRef = useRef(chords); // ドラッグ中の最新値参照（move クロージャの stale 回避）
  chordsRef.current = chords;

  // 容器幅から段あたり小節数を測る＝clamp(floor(width/90),2,8)（~390px→4 / ~860px→8）。未測定は4（テスト）。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((ents) => {
      const w = ents[0]?.contentRect.width ?? 0;
      if (w > 0) setBarsPerRow(Math.max(2, Math.min(8, Math.floor(w / 90))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 再生中コードのハイライト（100ms ポーリング・#76 の行ハイライトはブロック化で自然に解ける）。
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

  // 変更は必ず reflow（start を順番から再計算）＝start のズレ/手入力を排除。
  const commit = (cs: ChordEntry[]) => onChange(reflow(cs));
  function update(i: number, patch: Partial<ChordEntry>) {
    commit(chords.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }
  // 三和音/拡張/オルタードのどれかを変えて quality を再合成（無効な組合せは正規化）。
  function setParts(i: number, cur: ChordParts, patch: Partial<ChordParts>) {
    const p: ChordParts = { ...cur, ...patch };
    const exts = extOptionsFor(p.tri).map((o) => o.v);
    if (!exts.includes(p.ext)) p.ext = "";
    if (!altOptionsFor(p.tri, p.ext).some((o) => o.v === p.alt)) p.alt = "";
    update(i, { quality: composeQuality(p) });
  }
  // 長さボタン：その基準長にする（付点状態は引き継ぐ）。付点ボタン：長さを×1.5 ⇔ 等倍でトグル。
  function setLen(i: number, dur: number, v: number) {
    update(i, { dur: isDotted(dur) ? v * 1.5 : v });
  }
  function toggleDot(i: number, dur: number) {
    const b = baseDur(dur);
    update(i, { dur: isDotted(dur) ? b : b * 1.5 });
  }
  // 定番進行をまるごと流し込む（start は reflow が順番から再計算）。
  function applyProgression(pcs: [number, string][]) {
    commit(pcs.map(([root, quality]) => ({ root, quality, start: 0, dur: bpb })));
  }
  // ＋シーム/末尾追加＝境界に直前コード複製を挿入→シート即オープン（新コードをすぐ直せる）。
  function insertSeam(boundary: number) {
    onChange(insertAt(chords, boundary, bpb));
    setSheetIdx(boundary);
  }
  function placeFirst() {
    onChange(insertAt(chords, 0, bpb));
    setSheetIdx(0);
  }
  function removeIdx(i: number) {
    onChange(removeAt(chords, i));
    setSheetIdx((s) => (s === i ? -1 : s > i ? s - 1 : s));
  }
  function onBlockTap(i: number) {
    if (mode === "erase") removeIdx(i);
    else setSheetIdx(i);
  }

  // 右端グリップ・ドラッグ→長さ。段内 x から拍を求め snapLength→dur。段跨ぎもドラッグ段の絶対拍で解く。
  function onGripDown(e: React.PointerEvent, segIndex: number, spanBeats: number, rowAbsStart: number) {
    e.preventDefault();
    e.stopPropagation();
    const rowEl = (e.currentTarget as HTMLElement).closest(".chord-tl-row") as HTMLElement | null;
    if (!rowEl) return;
    const rect = rowEl.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const beatInRow = Math.max(0, Math.min(spanBeats, (x / Math.max(1, rect.width)) * spanBeats));
      const abs = rowAbsStart + beatInRow;
      const cur = chordsRef.current;
      const start = cur[segIndex]?.start ?? 0;
      const snapped = Math.max(1, snapLength(Math.max(1, abs - start), bpb));
      onChange(reflow(cur.map((c, k) => (k === segIndex ? { ...c, dur: snapped } : c))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const rows = wrapRows(chords, bpb, barsPerRow);
  // 段の絶対開始拍（累積）＋各コードの終端が乗る段（＝グリップ/シームを置く段）。
  let acc = 0;
  const rowAbs = rows.map((r) => {
    const s = acc;
    acc += r.bars * bpb;
    return s;
  });
  const lastRowOf = new Map<number, number>();
  rows.forEach((r, ri) => r.segments.forEach((s) => lastRowOf.set(s.index, ri)));
  const totalBeats = chords.reduce((s, c) => s + c.dur, 0);

  return (
    <div className="chord-editor">
      {chords.length > 0 && (
        <div className="chord-toolbar">
          {/* 鉛筆(編集)/消しゴム(外す) ＝ Section と同じモード文法（.proll-modes）。 */}
          <div className="proll-modes" aria-label="chord-modes">
            <button type="button" aria-label="mode-edit" title="編集（タップでコードを直す・境界の＋で挿入）" className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>
              <Icon name="edit" size={18} />
            </button>
            <button type="button" aria-label="mode-erase" title="外す（タップでコードを削除）" className={mode === "erase" ? "on" : ""} onClick={() => setMode("erase")}>
              <Icon name="eraser" size={18} />
            </button>
          </div>
          <span className="muted chord-total">計 {totalBeats}拍（{Math.round((totalBeats / bpb) * 10) / 10}小節）</span>
        </div>
      )}

      {chords.length === 0 ? (
        <div className="chord-empty" aria-label="chord-empty">
          {!pickProg ? (
            <>
              <button type="button" className="chord-empty-primary" aria-label="place-first-chord" onClick={placeFirst}>
                ＋ 最初のコードを置く
              </button>
              <button type="button" className="bs-btn chord-empty-secondary" aria-label="pick-progression" onClick={() => setPickProg(true)}>
                よく使う進行から選ぶ
              </button>
            </>
          ) : (
            <div className="chord-empty-progs" aria-label="popular-progressions">
              {POPULAR_PROGRESSIONS.map((pg) => (
                <button key={pg.name} type="button" className="bs-btn chord-prog-chip" aria-label={`prog-${pg.name}`} onClick={() => applyProgression(pg.chords)}>
                  {pg.name}
                </button>
              ))}
              <button type="button" className="chord-empty-back muted" aria-label="progression-back" onClick={() => setPickProg(false)}>← 戻る</button>
            </div>
          )}
        </div>
      ) : (
        <div className="chord-timeline" ref={wrapRef} aria-label="chord-timeline">
          {rows.map((row, ri) => {
            const spanBeats = Math.max(1, row.bars * bpb);
            const endSegs = row.segments.filter((s) => lastRowOf.get(s.index) === ri);
            return (
              <div className="chord-tl-strip" key={ri}>
                {/* 小節番号ルーラ（この段の小節数だけ・グローバル通し番号）。 */}
                <div className="chord-tl-ruler" aria-hidden="true">
                  {Array.from({ length: row.bars }).map((_, b) => (
                    <span className="chord-bar-num" key={b}>{ri * barsPerRow + b + 1}</span>
                  ))}
                </div>
                <div className="chord-tl-row">
                  {row.segments.map((seg) => {
                    const c = chords[seg.index];
                    if (!c) return null;
                    const left = (seg.startBeat / spanBeats) * 100;
                    const width = (seg.widthBeat / spanBeats) * 100;
                    const isEnd = lastRowOf.get(seg.index) === ri; // 終端が乗る段＝グリップを出す
                    return (
                      <button
                        type="button"
                        key={`${seg.index}-${ri}`}
                        className={
                          "lane-block chord-block" +
                          (seg.tail ? " is-tail" : "") +
                          (mode === "erase" ? " erasing" : "") +
                          (seg.index === activeIdx ? " playing" : "")
                        }
                        data-kind="chord_progression"
                        aria-label={seg.head ? `block-${seg.index}` : `block-${seg.index}-cont`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onClick={() => onBlockTap(seg.index)}
                      >
                        <MiniRoll neta={DUMMY_NETA} notes={chordsToNotes([{ ...c, start: 0 }])} />
                        <span className="chord-deg-bar" style={{ background: degreeColor(c.root) }} aria-hidden="true" />
                        {seg.head && (
                          <>
                            <span className="chord-block-deg" aria-hidden="true">{degreeLabel(c.root)}</span>
                            <span className="lane-block-label chord-block-name">{nameOf(c)}</span>
                          </>
                        )}
                        {/* 右端グリップ（終端が乗る段だけ）。ドラッグで長さ。 */}
                        {isEnd && mode !== "erase" && (
                          <span
                            className="block-resize"
                            aria-label={`grip-${seg.index}`}
                            onPointerDown={(e) => onGripDown(e, seg.index, spanBeats, rowAbs[ri]!)}
                          />
                        )}
                      </button>
                    );
                  })}
                  {/* ＋シーム（編集モード・境界の右14px＝グリップと非重複）。1タップで直前コード複製→シート。 */}
                  {mode === "edit" && endSegs.map((seg) => {
                    const rightPct = ((seg.startBeat + seg.widthBeat) / spanBeats) * 100;
                    return (
                      <button
                        type="button"
                        key={`seam-${seg.index}`}
                        className="chord-seam"
                        aria-label={`seam-${seg.index + 1}`}
                        title="ここにコードを挿入（直前を複製）"
                        style={{ left: `${rightPct}%` }}
                        onClick={() => insertSeam(seg.index + 1)}
                      >
                        ＋
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* 末尾の空きセル＝追加（Section「空きをタップ→置く」の方言）。 */}
          {mode === "edit" && (
            <button type="button" className="chord-append" aria-label="chord-append" title="末尾にコードを追加" onClick={() => insertSeam(chords.length)}>
              ＋ コードを追加
            </button>
          )}
        </div>
      )}

      {sheetIdx >= 0 && chords[sheetIdx] && (
        <ChordPickerSheet
          chord={chords[sheetIdx]}
          lengths={LENGTHS}
          isDotted={isDotted}
          baseDur={baseDur}
          onSetRoot={(v) => update(sheetIdx, { root: v })}
          onSetParts={(patch) => setParts(sheetIdx, decomposeQuality(chords[sheetIdx].quality), patch)}
          onSetBass={(v) => update(sheetIdx, { bass: v })}
          onSetLen={(v) => setLen(sheetIdx, chords[sheetIdx].dur, v)}
          onToggleDot={() => toggleDot(sheetIdx, chords[sheetIdx].dur)}
          onDelete={() => removeIdx(sheetIdx)}
          onClose={() => setSheetIdx(-1)}
        />
      )}
    </div>
  );
}

// ボトムピッカーシート（design #26）＝現行 root/三和音/拡張/オルタード[条件]/オンベース/長さ/付点/削除 の全語彙。
function ChordPickerSheet({
  chord, lengths, isDotted, baseDur,
  onSetRoot, onSetParts, onSetBass, onSetLen, onToggleDot, onDelete, onClose,
}: {
  chord: ChordEntry;
  lengths: { v: number; label: string }[];
  isDotted: (d: number) => boolean;
  baseDur: (d: number) => number;
  onSetRoot: (v: number) => void;
  onSetParts: (patch: Partial<ChordParts>) => void;
  onSetBass: (v: number | undefined) => void;
  onSetLen: (v: number) => void;
  onToggleDot: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const parts = decomposeQuality(chord.quality);
  const altOpts = altOptionsFor(parts.tri, parts.ext);
  return (
    <div className="chord-sheet-backdrop" onClick={onClose}>
      <div className="chord-sheet" aria-label="chord-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span className="sheet-grab" aria-hidden="true" />
          <span className="sheet-title chord-sheet-title">{nameOf(chord)}</span>
          <button type="button" className="sheet-close" aria-label="chord-sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="chord-sheet-body">
          <div className="chord-sheet-selects">
            <label>ルート
              <select aria-label="sheet-root" value={chord.root} onChange={(e) => onSetRoot(Number(e.target.value))}>
                {ROOTS.map((r, idx) => (<option key={idx} value={idx}>{r}</option>))}
              </select>
            </label>
            <label>三和音
              <select aria-label="sheet-triad" value={parts.tri} title="三和音（空欄=C7系 / maj=Cmaj7系）" onChange={(e) => onSetParts({ tri: e.target.value as Triad })}>
                {TRIAD_OPTIONS.map((t) => (<option key={t.v} value={t.v}>{t.label}</option>))}
              </select>
            </label>
            <label>拡張
              <select aria-label="sheet-ext" value={parts.ext} title="拡張" onChange={(e) => onSetParts({ ext: e.target.value as Ext })}>
                {extOptionsFor(parts.tri).map((x) => (<option key={x.v} value={x.v}>{x.label}</option>))}
              </select>
            </label>
            {altOpts.length > 1 && (
              <label>テンション
                <select aria-label="sheet-alt" value={parts.alt} title="オルタード" onChange={(e) => onSetParts({ alt: e.target.value as Alt })}>
                  {altOpts.map((a) => (<option key={a.v} value={a.v}>{a.label}</option>))}
                </select>
              </label>
            )}
            <label>オンベース
              <select aria-label="sheet-bass" value={chord.bass ?? ""} title="オンベース（分数コード）" onChange={(e) => onSetBass(e.target.value === "" ? undefined : Number(e.target.value))}>
                <option value="">/ —</option>
                {ROOTS.map((r, idx) => (<option key={idx} value={idx}>/{r}</option>))}
              </select>
            </label>
          </div>
          <div className="chord-sheet-len" aria-label="sheet-length">
            <span className="muted chord-len-label">長さ</span>
            {lengths.map((l) => (
              <button key={l.v} type="button" className={"len" + (baseDur(chord.dur) === l.v ? " on" : "")} aria-label={`sheet-len-${l.v}`} onClick={() => onSetLen(l.v)}>
                {l.label}
              </button>
            ))}
            <button type="button" className={"len dot" + (isDotted(chord.dur) ? " on" : "")} aria-label="sheet-dot" aria-pressed={isDotted(chord.dur)} title="付点（長さ×1.5）" onClick={onToggleDot}>
              付点
            </button>
          </div>
          <button type="button" className="chord-sheet-delete" aria-label="sheet-delete" onClick={onDelete}>✕ このコードを削除</button>
        </div>
      </div>
    </div>
  );
}
