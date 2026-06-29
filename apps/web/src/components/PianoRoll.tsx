import { useMemo, useState, type Ref } from "react";
import type { Note } from "../music";
import { previewNote } from "../audio";
import { NoteValuePicker } from "./NoteValuePicker";

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
}: {
  notes: Note[];
  onChange: (n: Note[]) => void;
  beats?: number;
  pickup?: number; // 弱起（アウフタクト）：拍0の前に置ける lead-in 拍数。負 start の音を扱う。
  playheadRef?: Ref<HTMLDivElement>; // #58 再生プレイヘッド（--phb 生beatを ref直書き）
  scrollerRef?: Ref<HTMLDivElement>; // #74 追従スクロール対象（.proll）
  low?: number; // 既定で見せる最低音（bass は E1=28 など低域既定）
  high?: number; // 既定で見せる最高音
}) {
  const [noteLen, setNoteLen] = useState(1);
  const [dotted, setDotted] = useState(false); // 付点：選択音価を ×1.5（6/8 の付点四分=1.5拍 等）

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

  return (
    <div className="proll-wrap">
      <div className="proll-tools">
        <NoteValuePicker
          label="音長(分)"
          options={LENGTHS}
          value={noteLen}
          dotted={dotted}
          onChange={setNoteLen}
          onToggleDotted={() => setDotted((d) => !d)}
        />
      </div>
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
            <div className={"proll-key" + (isBlack(p) ? " black" : " white")} aria-hidden="true">
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
                  onClick={() => addAt(p, s)}
                />
              ))}
              {notes
                .filter((n) => n.pitch === p)
                .map((n, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`note-${p}-${n.start}`}
                    className="proll-note"
                    style={{
                      left: `${((n.start + pre) / total) * 100}%`,
                      width: `${(n.dur / total) * 100}%`,
                    }}
                    title={`${noteName(p)} ${n.start}拍 +${n.dur}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNote(n);
                    }}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
