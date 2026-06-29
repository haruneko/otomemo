import { type Ref } from "react";
import { type RhythmContent, DRUM_LABEL, DRUM_KITS } from "../music";
import { BarsControl } from "./BarsControl";

const NAME_PX = 58; // rhythm-name(56) + gap(2)
const BEAT_PX = 88; // 1拍=4step×22 ＝#74 プレイヘッドの px/beat

// リズムのステップグリッド（design #19「リズム step（自作・小）」）。レーン×ステップを on/off。
// 拍子→1小節のstep数（1step=16分=0.25拍）。4/4=16, 6/8=12, 3/4=12。複合(6/8系)はビート=6step毎。
function meterSteps(meter?: string): { stepsPerBar: number; beatStep: number } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  const n = m ? Number(m[1]) : 4;
  const d = m ? Number(m[2]) : 4;
  const stepsPerBar = n > 0 && d > 0 ? Math.round((n * 16) / d) : 16;
  const compound = d === 8 && n % 3 === 0 && n >= 6;
  return { stepsPerBar, beatStep: compound ? 6 : 4 }; // 複合は付点ビート(6step)、単純は四分(4step)
}

export function RhythmEditor({
  rhythm,
  onChange,
  meter,
  playheadRef,
  scrollerRef,
}: {
  rhythm: RhythmContent;
  onChange: (r: RhythmContent) => void;
  meter?: string; // 拍子（6/8 等で grid を変える）
  playheadRef?: Ref<HTMLDivElement>; // #74 再生プレイヘッド
  scrollerRef?: Ref<HTMLDivElement>;
}) {
  const { stepsPerBar, beatStep } = meterSteps(meter);
  function toggle(li: number, step: number) {
    const lanes = rhythm.lanes.map((l, k) => {
      if (k !== li) return l;
      const on = l.hits.includes(step);
      return {
        ...l,
        hits: on ? l.hits.filter((s) => s !== step) : [...l.hits, step].sort((a, b) => a - b),
      };
    });
    onChange({ ...rhythm, lanes });
  }

  // 小節数（1〜4）。1小節=stepsPerBar（拍子依存：4/4=16, 6/8=12）。縮小は**非破壊**。
  const bars = Math.max(1, Math.round(rhythm.steps / stepsPerBar));
  function setBars(n: number) {
    onChange({ ...rhythm, steps: Math.max(1, Math.min(4, n)) * stepsPerBar });
  }

  return (
    <div className="rhythm-editor" ref={scrollerRef}>
      <div className="rhythm-toolbar">
        <BarsControl bars={bars} max={4} onChange={setBars} />
        {/* ドラムキット（アコ/エレキ）選択＝GM bank128 preset。再生＆MIDI ch10 program に反映。 */}
        <label className="drum-kit-pick">
          キット
          <select
            aria-label="drum-kit"
            value={rhythm.kit ?? 0}
            onChange={(e) => onChange({ ...rhythm, kit: Number(e.target.value) })}
          >
            <optgroup label="アコースティック">
              {DRUM_KITS.filter((k) => k.group === "acoustic").map((k) => (
                <option key={k.program} value={k.program}>{k.label}</option>
              ))}
            </optgroup>
            <optgroup label="エレキ">
              {DRUM_KITS.filter((k) => k.group === "electric").map((k) => (
                <option key={k.program} value={k.program}>{k.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      <div
        className="proll-playhead"
        aria-hidden="true"
        ref={playheadRef}
        style={{ left: `calc(${NAME_PX}px + var(--phb, 0) * ${BEAT_PX}px)` }}
      />
      {rhythm.lanes.map((l, li) => (
        <div className="rhythm-row" key={l.name}>
          <span className="rhythm-name">{DRUM_LABEL[l.name] ?? l.name}</span>
          {Array.from({ length: rhythm.steps }, (_, s) => (
            <button
              key={s}
              type="button"
              aria-label={`hit-${l.name}-${s}`}
              className={
                "rhythm-cell" +
                (l.hits.includes(s) ? " on" : "") +
                (s % stepsPerBar === 0 ? " bar" : s % beatStep === 0 ? " beat" : "")
              }
              onClick={() => toggle(li, s)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
