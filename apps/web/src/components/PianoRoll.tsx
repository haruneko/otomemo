import { useMemo, useState, type Ref } from "react";
import type { Note } from "../music";

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
  playheadRef,
}: {
  notes: Note[];
  onChange: (n: Note[]) => void;
  beats?: number;
  playheadRef?: Ref<HTMLDivElement>; // #58 再生プレイヘッド（--ph 比率を ref 直書き）
}) {
  const [noteLen, setNoteLen] = useState(1);

  const pitches = useMemo(() => {
    const lo = Math.min(DEFAULT_LOW, ...notes.map((n) => n.pitch));
    const hi = Math.max(DEFAULT_HIGH, ...notes.map((n) => n.pitch));
    const arr: number[] = [];
    for (let p = hi; p >= lo; p--) arr.push(p);
    return arr;
  }, [notes]);
  // 表示尺は content に追従（生成/取込で beats を超える音もはみ出さない）
  const span = useMemo(
    () => Math.max(beats, ...notes.map((n) => Math.ceil(n.start + n.dur))),
    [beats, notes],
  );
  const steps = span * SUBDIV;

  function addAt(pitch: number, step: number) {
    const start = step / SUBDIV;
    // クリック位置を覆う同ピッチの既存ノートがあれば消す（小数startのAI/MIDIノートも編集できる）
    const covering = notes.find(
      (n) => n.pitch === pitch && n.start <= start + 1e-9 && start < n.start + n.dur - 1e-9,
    );
    if (covering) {
      onChange(notes.filter((n) => n !== covering));
      return;
    }
    onChange([...notes, { pitch, start, dur: noteLen }]);
  }
  function removeNote(target: Note) {
    onChange(notes.filter((n) => n !== target));
  }

  return (
    <div className="proll-wrap">
      <div className="proll-tools">
        <span>音長(分)</span>
        {LENGTHS.map((l) => (
          <button
            key={l.v}
            type="button"
            className={"len" + (noteLen === l.v ? " on" : "")}
            onClick={() => setNoteLen(l.v)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="proll" role="grid" aria-label="piano-roll">
        {/* #58 プレイヘッド：コンテンツ座標(px)で配置＝横スクロールに追従。span*SUBDIV*CELL_PX が小節域幅。 */}
        <div
          className="proll-playhead"
          aria-hidden="true"
          ref={playheadRef}
          style={{ left: `calc(${KEY_PX}px + var(--ph, 0) * ${span * SUBDIV * CELL_PX}px)` }}
        />
        {pitches.map((p) => (
          <div className="proll-row" key={p} role="row">
            <div className={"proll-key" + (isBlack(p) ? " black" : " white")} aria-hidden="true">
              {noteName(p)}
            </div>
            <div className="proll-lane">
              {Array.from({ length: steps }, (_, s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`cell-${p}-${s}`}
                  className={"proll-cell" + (s % SUBDIV === 0 ? " beat" : "")}
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
                      left: `${(n.start / span) * 100}%`,
                      width: `${(n.dur / span) * 100}%`,
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
