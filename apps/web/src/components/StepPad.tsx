import type { Note } from "../music";

// #35: パッドステップ入力。Cメジャー2オクターブ × 16ステップ(16分)のグリッドをタップして
// メロを置く（スマホ向けの素早い入力）。content は C基準のまま notes に書き込む。
const SCALE = [84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67, 65, 64, 62, 60]; // C6..C4 (Cmajor) 上→下
const STEPS = 16;
const STEP_DUR = 0.25; // 16分（16ステップ=4拍=1小節）

const stepOf = (start: number) => Math.round(start / STEP_DUR);

export function StepPad({ notes, onChange }: { notes: Note[]; onChange: (n: Note[]) => void }) {
  const has = (pitch: number, step: number) =>
    notes.some((n) => n.pitch === pitch && stepOf(n.start) === step);

  function toggle(pitch: number, step: number) {
    if (has(pitch, step)) {
      onChange(notes.filter((n) => !(n.pitch === pitch && stepOf(n.start) === step)));
    } else {
      onChange([...notes, { pitch, start: step * STEP_DUR, dur: STEP_DUR }]);
    }
  }

  return (
    <div className="step-pad" role="grid" aria-label="step-pad">
      {SCALE.map((pitch) => (
        <div className="step-row" role="row" key={pitch}>
          {Array.from({ length: STEPS }, (_, s) => (
            <button
              key={s}
              type="button"
              aria-label={`pad-${pitch}-${s}`}
              aria-pressed={has(pitch, s)}
              className={"step-cell" + (has(pitch, s) ? " on" : "") + (s % 4 === 0 ? " beat" : "")}
              onClick={() => toggle(pitch, s)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
