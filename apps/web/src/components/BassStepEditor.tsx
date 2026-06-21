import { type Ref } from "react";
import type { BassDegree, BassStep } from "../music";

// #bass S2: 相対ベースの度数ステップエディタ（半リズムパート）。
// 各ステップで degree をサイクル(R→3→5→7→8→approach→off)。dur は1step（後で伸長機能を足せる）。
// 度数をコードに当てて再生時に解決＝ここは「何度を打つか」だけを編集する（オクターブは自動）。
const STEPS = 16; // 1小節（1step=16分）
const BEAT_PX = 88; // 1拍=4step。StepPad と同じプレイヘッド係数。
// off→R→3→5→7→8→approach→off のサイクル（語彙はこれ以上増やさない／design）。
const CYCLE: (BassDegree | null)[] = [null, "R", "3", "5", "7", "8", "approach"];
const LABEL: Record<string, string> = {
  R: "R",
  "3": "3",
  "5": "5",
  "7": "7",
  "8": "8",
  approach: "→", // approach=次の解決ルートへ半音で寄せる（歩く）
};

export function BassStepEditor({
  pattern,
  onChange,
  playheadRef,
  scrollerRef,
}: {
  pattern: BassStep[];
  onChange: (p: BassStep[]) => void;
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const degreeAt = (step: number): BassDegree | null =>
    pattern.find((p) => p.step === step)?.degree ?? null;

  function cycle(step: number) {
    const cur = degreeAt(step);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length] ?? null;
    const rest = pattern.filter((p) => p.step !== step);
    onChange(next === null ? rest : [...rest, { step, degree: next, dur: 1 }].sort((a, b) => a.step - b.step));
  }

  return (
    <div className="bass-step" role="grid" aria-label="bass-step" ref={scrollerRef}>
      <div
        className="proll-playhead"
        aria-hidden="true"
        ref={playheadRef}
        style={{ left: `calc(var(--phb, 0) * ${BEAT_PX}px)` }}
      />
      <div className="step-row" role="row">
        {Array.from({ length: STEPS }, (_, s) => {
          const d = degreeAt(s);
          return (
            <button
              key={s}
              type="button"
              aria-label={`bass-${s}`}
              aria-pressed={d !== null}
              className={"step-cell deg" + (d !== null ? " on" : "") + (s % 4 === 0 ? " beat" : "")}
              onClick={() => cycle(s)}
            >
              {d !== null ? LABEL[d] : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
