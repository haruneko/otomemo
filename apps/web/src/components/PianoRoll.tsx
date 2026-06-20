import type { Note } from "../music";

const LOW = 60; // C4
const HIGH = 83; // B5

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (p: number) => `${NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const isBlack = (p: number) => NAMES[p % 12]!.includes("#");

export function PianoRoll({
  notes,
  onChange,
  beats = 16,
}: {
  notes: Note[];
  onChange: (n: Note[]) => void;
  beats?: number;
}) {
  const pitches: number[] = [];
  for (let p = HIGH; p >= LOW; p--) pitches.push(p);

  const has = (p: number, b: number) => notes.some((n) => n.pitch === p && n.start === b);
  function toggle(p: number, b: number) {
    if (has(p, b)) onChange(notes.filter((n) => !(n.pitch === p && n.start === b)));
    else onChange([...notes, { pitch: p, start: b, dur: 1 }]);
  }

  return (
    <div className="proll" role="grid" aria-label="piano-roll">
      {pitches.map((p) => (
        <div className="proll-row" key={p} role="row">
          <div className={"proll-key" + (isBlack(p) ? " black" : " white")} aria-hidden="true">
            {noteName(p)}
          </div>
          {Array.from({ length: beats }, (_, b) => (
            <button
              key={b}
              type="button"
              role="gridcell"
              aria-label={`pitch-${p}-beat-${b}`}
              className={
                "proll-cell" + (has(p, b) ? " on" : "") + (p % 12 === 0 ? " octave" : "")
              }
              onClick={() => toggle(p, b)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
