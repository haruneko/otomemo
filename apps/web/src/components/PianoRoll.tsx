import { useMemo, useState, type Ref } from "react";
import type { Note } from "../music";
import { previewNote } from "../audio";
import { flowLyric, splitMora } from "../lyrics";
import { nudgeNotes, duplicateSel, deleteSel, copySel, pasteNotes } from "../noteEdit";
import { NoteValuePicker } from "./NoteValuePicker";

// ノート編集のクリップボード（モジュール保持＝別ネタへも貼れる・design N1）。
let noteClipboard: Note[] = [];

const CELL_PX = 12; // .proll-cell の幅。1拍=SUBDIV*CELL_PX で playhead を px 配置（横スクロール追従）。
const KEY_PX = 40; // .proll-key の幅

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (p: number) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const isBlack = (p: number) => NAMES[p % 12]!.includes("#");

const DEFAULT_LOW = 60; // C4
const DEFAULT_HIGH = 83; // B5
const SUBDIV = 4; // 1拍を16分まで刻む

// 音長ツール（拍）。velocity編集は後回し（一律100）。
const LENGTHS = [
  { label: "16", v: 0.25 },
  { label: "8", v: 0.5 },
  { label: "4", v: 1 },
  { label: "2", v: 2 },
  { label: "1", v: 4 },
];

// 見た目=実音のピアノロール：音域は content に追従、ノートは実 start/dur のバーで忠実表示。
// セルクリックで配置（同位置は置換）、ノートバークリックで削除。
export function PianoRoll({
  notes,
  onChange,
  beats = 16,
  pickup = 0,
  playheadRef,
  scrollerRef,
  low = DEFAULT_LOW,
  high = DEFAULT_HIGH,
  enableLyric = false,
}: {
  notes: Note[];
  onChange: (n: Note[]) => void;
  beats?: number;
  pickup?: number; // 弱起（アウフタクト）：拍0の前に置ける lead-in 拍数。負 start の音を扱う。
  playheadRef?: Ref<HTMLDivElement>; // #58 再生プレイヘッド（--phb 生beatを ref直書き）
  scrollerRef?: Ref<HTMLDivElement>; // #74 追従スクロール対象（.proll）
  low?: number; // 既定で見せる最低音（bass は E1=28 など低域既定）
  high?: number; // 既定で見せる最高音
  enableLyric?: boolean; // メロのみ：歌詞流し込み（LS3・design L2）
}) {
  const [noteLen, setNoteLen] = useState(1);
  const [dotted, setDotted] = useState(false); // 付点：選択音価を ×1.5（6/8 の付点四分=1.5拍 等）
  const [lyricDraft, setLyricDraft] = useState(""); // 流し込む歌詞（かな・読み）。永続せずUIだけ
  // ノート編集（design N1・案A）：描く/選ぶ モード・選択(index集合)・貼付arm。
  const [mode, setMode] = useState<"draw" | "select">("draw");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pasteArmed, setPasteArmed] = useState(false);

  const pitches = useMemo(() => {
    const lo = Math.min(low, ...notes.map((n) => n.pitch));
    const hi = Math.max(high, ...notes.map((n) => n.pitch));
    const arr: number[] = [];
    for (let p = hi; p >= lo; p--) arr.push(p);
    return arr;
  }, [notes, low, high]);
  // 弱起ぶんの lead-in（拍0の前）。指定 pickup と既存の負 start を両方包む。拍0=ダウンビートは固定。
  const pre = useMemo(
    () => Math.max(0, pickup, Math.ceil(-Math.min(0, ...notes.map((n) => n.start)))),
    [pickup, notes],
  );
  // 表示尺は content に追従（生成/取込で beats を超える音もはみ出さない）＋弱起ぶん左へ。
  const span = useMemo(
    () => Math.max(beats, ...notes.map((n) => Math.ceil(n.start + n.dur))),
    [beats, notes],
  );
  const total = pre + span; // 表示する総拍（-pre 〜 span）
  const steps = total * SUBDIV;

  function addAt(pitch: number, step: number) {
    const start = step / SUBDIV - pre; // 先頭 pre*SUBDIV セルは負拍（弱起）

    // クリック位置を覆う同ピッチの既存ノートがあれば消す（小数startのAI/MIDIノートも編集できる）
    const covering = notes.find(
      (n) => n.pitch === pitch && n.start <= start + 1e-9 && start < n.start + n.dur - 1e-9,
    );
    if (covering) {
      onChange(notes.filter((n) => n !== covering));
      return;
    }
    onChange([...notes, { pitch, start, dur: dotted ? noteLen * 1.5 : noteLen }]);
    void previewNote({ pitch, start: 0, dur: 0.4 }); // 置いた音を即鳴らす（入力フィードバック）
  }
  function removeNote(target: Note) {
    onChange(notes.filter((n) => n !== target));
  }

  // --- ノート編集（選ぶモード）。全て onChange 経由＝Undo/Redo が自動で効く（design N3）。 ---
  const GRID = 1 / SUBDIV; // 1セル=16分＝時間nudgeの単位（拍）
  function toDraw() {
    setMode("draw");
    setSelected(new Set());
    setPasteArmed(false);
  }
  function onNoteClick(gi: number, target: Note, e: { stopPropagation: () => void }) {
    e.stopPropagation();
    if (mode === "draw") {
      removeNote(target);
      return;
    }
    setSelected((s) => {
      const t = new Set(s);
      if (t.has(gi)) t.delete(gi);
      else t.add(gi);
      return t;
    });
  }
  function onCellClick(pitch: number, step: number) {
    if (mode === "draw") {
      addAt(pitch, step);
      return;
    }
    if (pasteArmed && noteClipboard.length) {
      const at = step / SUBDIV - pre; // タップ位置の拍にクリップボードを置く
      const r = pasteNotes(notes, noteClipboard, at);
      onChange(r.notes);
      setSelected(r.selection);
      setPasteArmed(false);
      return;
    }
    setSelected(new Set()); // 空タップ＝全解除
  }
  const doNudge = (dPitch: number, dBeats: number) => onChange(nudgeNotes(notes, selected, dPitch, dBeats));
  function doDuplicate() {
    const r = duplicateSel(notes, selected, 4); // +1小節右へ
    onChange(r.notes);
    setSelected(r.selection);
  }
  function doDelete() {
    onChange(deleteSel(notes, selected));
    setSelected(new Set());
  }
  function doCopy() {
    noteClipboard = copySel(notes, selected);
    setPasteArmed(false);
  }

  return (
    <div className="proll-wrap">
      {/* 描く/選ぶ モードトグル（design N1・案A）。鉛筆=配置/削除、範囲=選択して編集。 */}
      <div className="proll-modes">
        <button type="button" aria-label="mode-draw" title="描く（配置/削除）" className={mode === "draw" ? "on" : ""} onClick={toDraw}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" aria-label="mode-select" title="選ぶ（選択して編集）" className={mode === "select" ? "on" : ""} onClick={() => setMode("select")}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.5 3" />
          </svg>
        </button>
      </div>
      <div className="proll-tools">
        <NoteValuePicker
          options={LENGTHS}
          value={noteLen}
          dotted={dotted}
          onChange={setNoteLen}
          onToggleDotted={() => setDotted((d) => !d)}
        />
      </div>
      {enableLyric && (
        <div className="proll-lyric-input">
          <span className="muted">歌詞</span>
          <input
            type="text"
            aria-label="lyric-draft"
            placeholder="かな（読み）を入力→流し込む"
            value={lyricDraft}
            onChange={(e) => setLyricDraft(e.target.value)}
          />
          <button
            type="button"
            aria-label="flow-lyric"
            disabled={!notes.length || splitMora(lyricDraft).length === 0}
            onClick={() => onChange(flowLyric(notes, splitMora(lyricDraft)))}
          >
            流し込む
          </button>
          {notes.some((n) => n.syllable) && (
            <button type="button" aria-label="clear-lyric" onClick={() => onChange(notes.map((n) => ({ ...n, syllable: undefined })))}>
              クリア
            </button>
          )}
        </div>
      )}
      {/* 選択バー（選ぶモード）：複製/コピー/貼付/削除＋nudge移動（design N1）。 */}
      {mode === "select" && (
        <div className="proll-selbar" aria-label="selection-bar">
          <span className="muted">{selected.size}個</span>
          <button type="button" aria-label="dup" disabled={!selected.size} onClick={doDuplicate}>複製</button>
          <button type="button" aria-label="copy" disabled={!selected.size} onClick={doCopy}>コピー</button>
          <button type="button" aria-label="paste" className={pasteArmed ? "on" : ""} disabled={!noteClipboard.length} onClick={() => setPasteArmed((a) => !a)}>
            {pasteArmed ? "貼付：タップ" : "貼付"}
          </button>
          <button type="button" aria-label="del" disabled={!selected.size} onClick={doDelete}>削除</button>
          <span className="sel-nudge">
            <button type="button" aria-label="nudge-left" disabled={!selected.size} onClick={() => doNudge(0, -GRID)}>←</button>
            <button type="button" aria-label="nudge-right" disabled={!selected.size} onClick={() => doNudge(0, GRID)}>→</button>
            <button type="button" aria-label="nudge-up" disabled={!selected.size} onClick={() => doNudge(1, 0)}>↑</button>
            <button type="button" aria-label="nudge-down" disabled={!selected.size} onClick={() => doNudge(-1, 0)}>↓</button>
          </span>
        </div>
      )}
      <div className="proll" role="grid" aria-label="piano-roll" ref={scrollerRef}>
        {/* #58/#74 プレイヘッド：生beat --phb をコンテンツ座標(px)へ＝横スクロールに追従。1拍=SUBDIV*CELL_PX。 */}
        <div
          className="proll-playhead"
          aria-hidden="true"
          ref={playheadRef}
          style={{ left: `calc(${KEY_PX}px + var(--phb, 0) * ${SUBDIV * CELL_PX}px)` }}
        />
        {pitches.map((p) => (
          <div className={"proll-row" + (isBlack(p) ? " black" : " white")} key={p} role="row">
            <div
              className={"proll-key" + (isBlack(p) ? " black" : " white")}
              role="button"
              aria-label={`key-${noteName(p)}`}
              onClick={() => void previewNote({ pitch: p, start: 0, dur: 0.5 })}
            >
              {noteName(p)}
            </div>
            <div className="proll-lane">
              {Array.from({ length: steps }, (_, s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`cell-${p}-${s}`}
                  className={
                    "proll-cell" +
                    (s % SUBDIV === 0 ? " beat" : "") +
                    (s === pre * SUBDIV ? " downbeat" : "") + // 拍0＝ダウンビート（弱起の境目）
                    (s < pre * SUBDIV ? " pickup" : "")
                  }
                  onClick={() => onCellClick(p, s)}
                />
              ))}
              {notes
                .map((n, gi) => ({ n, gi }))
                .filter((x) => x.n.pitch === p)
                .map(({ n, gi }) => (
                  <button
                    key={gi}
                    type="button"
                    aria-label={`note-${p}-${n.start}`}
                    className={"proll-note" + (selected.has(gi) ? " sel" : "")}
                    style={{
                      left: `${((n.start + pre) / total) * 100}%`,
                      width: `${(n.dur / total) * 100}%`,
                    }}
                    title={`${noteName(p)} ${n.start}拍 +${n.dur}`}
                    onClick={(e) => onNoteClick(gi, n, e)}
                  />
                ))}
            </div>
          </div>
        ))}
        {notes.some((n) => n.syllable) && (
          <div className="proll-lyric-lane" aria-label="lyrics">
            <div className="proll-lyric-key" aria-hidden="true">詞</div>
            <div className="proll-lyric-track" style={{ width: `${steps * CELL_PX}px` }}>
              {notes
                .filter((n) => n.syllable)
                .map((n, i) => (
                  <span
                    key={i}
                    className={"proll-syl" + (n.syllable === "ー" ? " melisma" : "")}
                    style={{ left: `${((n.start + pre) / total) * 100}%` }}
                  >
                    {n.syllable}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
