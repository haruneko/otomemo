import { useState, type Ref } from "react";
import type { BassStep } from "../music";
import { previewNote } from "../audio";
import { BarsControl } from "./BarsControl";
import { NoteValuePicker } from "./NoteValuePicker";

// このエディタが grid で編集する 6 レーンの度数（BassStep.degree はこれより広い＝修理#2 で 2/6/クロマチック/next を追加）。
// レーン外の度数（型生成された相対ベースの b7/6/#4 や next）は grid には現れないが pattern には**非破壊で保持**される
// （メロ/リズムの範囲外音と同じ流儀）。フルな度数編集 UI は次スライス（監査 §4 B'3「その他」レーン）。
type BassLaneDegree = "R" | "3" | "5" | "7" | "8" | "approach";

// プレビュー用：度数→実音高（C2=36 基準の代表音）。再生時は調/コードで解決するが、入力フィードバックは
// C基準で度数の高さを鳴らす（R=C2/3=E2/5=G2/7=B♭2/8=C3/approach=B1）。
const BASS_PREVIEW_PITCH: Record<BassLaneDegree, number> = {
  R: 36, "3": 40, "5": 43, "7": 46, "8": 48, approach: 35,
};

// #bass S2: 相対ベースの度数エディタ（半リズムパート）。
// **度数レーン**(行=R/3/5/7/8/approach)×**ステップ**(列)。各ステップはモノフォニック＝1度数だけ。
// セルをタップでそのレーン×ステップに置く（同ステップの他レーンは消える）。音長は長さツールで選ぶ。
// 度数はコード/調に当てて再生時に解決＝ここは「何度を・いつ・どれだけ」だけ編集（オクターブは自動）。
const BEAT_PX = 88; // 1拍=4step（20px cell+2px gap）＝プレイヘッドの px/beat。1小節=16step。
// 上ほど高い度数（ピアノロールと同じ向き）：上から 8/7/5/3/R、approach は最下段。
const LANES: { d: BassLaneDegree; label: string }[] = [
  { d: "8", label: "8" },
  { d: "7", label: "7" },
  { d: "5", label: "5" },
  { d: "3", label: "3" },
  { d: "R", label: "R" },
  { d: "approach", label: "→" }, // approach=次の解決ルートへ半音で寄せる（歩く）
];
// 音長（step数・1step=16分）。16/8/4/2/1 を他エディタ(メロ/コード楽器)と揃える。
const LENGTHS = [
  { label: "16", v: 1 },
  { label: "8", v: 2 },
  { label: "4", v: 4 },
  { label: "2", v: 8 },
  { label: "1", v: 16 },
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
  const [dotted, setDotted] = useState(false); // 付点：音長×1.5（6/8 の付点音価に対応）
  const bars = Math.max(1, Math.round(steps / 16));
  // 小節数を変える：縮小は**非破壊**（範囲外の音は描画しないだけで保持・melodyと同じ）。
  const setBars = (n: number) => onStepsChange(Math.max(1, Math.min(4, n)) * 16);

  const startAt = (lane: BassLaneDegree, step: number) =>
    pattern.find((p) => p.step === step && p.degree === lane);
  // このレーンで step を覆っている音（start < step < start+dur）＝サステイン表示用
  const sustainAt = (lane: BassLaneDegree, step: number) =>
    pattern.some((p) => p.degree === lane && p.step < step && step < p.step + (p.dur || 1));

  function toggle(lane: BassLaneDegree, step: number) {
    if (startAt(lane, step)) {
      // 同じ所をタップ＝消す
      onChange(pattern.filter((p) => !(p.step === step && p.degree === lane)));
      return;
    }
    // モノフォニック：同ステップ始まりの音を消してから置く
    const rest = pattern.filter((p) => p.step !== step);
    onChange([...rest, { step, degree: lane, dur: dotted ? len * 1.5 : len }].sort((a, b) => a.step - b.step));
    // 置いた度数を即鳴らす（C基準の代表音・ベース音色）。
    void previewNote({ pitch: BASS_PREVIEW_PITCH[lane], start: 0, dur: 0.4, program: 33 });
  }

  return (
    <div className="bass-step">
      <BarsControl bars={bars} max={4} onChange={setBars} />
      <div className="bass-lens">
        <NoteValuePicker
          options={LENGTHS}
          value={len}
          dotted={dotted}
          onChange={setLen}
          onToggleDotted={() => setDotted((d) => !d)}
        />
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
