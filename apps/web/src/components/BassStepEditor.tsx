import { useState, type Ref } from "react";
import type { BassDegree, BassStep } from "../music";
import { BarsControl } from "./BarsControl";

// #bass S2: 相対ベースの度数エディタ（半リズムパート）。
// **度数レーン**(行=R/3/5/7/8/approach)×**ステップ**(列)。各ステップはモノフォニック＝1度数だけ。
// セルをタップでそのレーン×ステップに置く（同ステップの他レーンは消える）。音長は長さツールで選ぶ。
// 度数はコード/調に当てて再生時に解決＝ここは「何度を・いつ・どれだけ」だけ編集（オクターブは自動）。
const BEAT_PX = 88; // 1拍=4step。StepPad と同じプレイヘッド係数。1小節=16step。
// 上ほど高い度数（ピアノロールと同じ向き）：上から 8/7/5/3/R、approach は最下段。
const LANES: { d: BassDegree; label: string }[] = [
  { d: "8", label: "8" },
  { d: "7", label: "7" },
  { d: "5", label: "5" },
  { d: "3", label: "3" },
  { d: "R", label: "R" },
  { d: "approach", label: "→" }, // approach=次の解決ルートへ半音で寄せる（歩く）
];
// 音長（step数）。1=16分 / 2=8分 / 4=4分。
const LENGTHS = [
  { label: "16", v: 1 },
  { label: "8", v: 2 },
  { label: "4", v: 4 },
];

export function BassStepEditor({
  pattern,
  onChange,
  steps,
  onStepsChange,
  playheadRef,
  scrollerRef,
}: {
  pattern: BassStep[];
  onChange: (p: BassStep[]) => void;
  steps: number;
  onStepsChange: (steps: number) => void;
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const [len, setLen] = useState(2); // 既定 8分
  const bars = Math.max(1, Math.round(steps / 16));
  // 小節数を変える：縮めるとき範囲外の音は捨てる。
  const setBars = (n: number) => {
    const s = Math.max(1, Math.min(4, n)) * 16;
    onChange(pattern.filter((p) => p.step < s));
    onStepsChange(s);
  };

  const startAt = (lane: BassDegree, step: number) =>
    pattern.find((p) => p.step === step && p.degree === lane);
  // このレーンで step を覆っている音（start < step < start+dur）＝サステイン表示用
  const sustainAt = (lane: BassDegree, step: number) =>
    pattern.some((p) => p.degree === lane && p.step < step && step < p.step + (p.dur || 1));

  function toggle(lane: BassDegree, step: number) {
    if (startAt(lane, step)) {
      // 同じ所をタップ＝消す
      onChange(pattern.filter((p) => !(p.step === step && p.degree === lane)));
      return;
    }
    // モノフォニック：同ステップ始まりの音を消してから置く
    const rest = pattern.filter((p) => p.step !== step);
    onChange([...rest, { step, degree: lane, dur: len }].sort((a, b) => a.step - b.step));
  }

  return (
    <div className="bass-step">
      <BarsControl bars={bars} max={4} onChange={setBars} />
      <div className="bass-lens">
        音長
        {LENGTHS.map((l) => (
          <button
            key={l.v}
            type="button"
            className={len === l.v ? "on" : ""}
            onClick={() => setLen(l.v)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="bass-grid" role="grid" aria-label="bass-step" ref={scrollerRef}>
        <div
          className="proll-playhead"
          aria-hidden="true"
          ref={playheadRef}
          style={{ left: `calc(40px + var(--phb, 0) * ${BEAT_PX}px)` }}
        />
        {LANES.map((lane) => (
          <div className="bass-lane" role="row" key={lane.d}>
            <div className="bass-lane-label">{lane.label}</div>
            {Array.from({ length: steps }, (_, s) => {
              const on = !!startAt(lane.d, s);
              const sus = sustainAt(lane.d, s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`bass-${lane.d}-${s}`}
                  aria-pressed={on}
                  className={
                    "step-cell deg" +
                    (on ? " on" : sus ? " sustain" : "") +
                    (s % 4 === 0 ? " beat" : "")
                  }
                  onClick={() => toggle(lane.d, s)}
                >
                  {on ? lane.label : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
