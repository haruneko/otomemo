import { type Ref } from "react";
import { type RhythmContent } from "../music";

const NAME_PX = 58; // rhythm-name(56) + gap(2)
const BEAT_PX = 88; // 1拍=4step×22 ＝#74 プレイヘッドの px/beat

// リズムのステップグリッド（design #19「リズム step（自作・小）」）。レーン×ステップを on/off。
export function RhythmEditor({
  rhythm,
  onChange,
  playheadRef,
  scrollerRef,
}: {
  rhythm: RhythmContent;
  onChange: (r: RhythmContent) => void;
  playheadRef?: Ref<HTMLDivElement>; // #74 再生プレイヘッド
  scrollerRef?: Ref<HTMLDivElement>;
}) {
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

  return (
    <div className="rhythm-editor" ref={scrollerRef}>
      <div
        className="proll-playhead"
        aria-hidden="true"
        ref={playheadRef}
        style={{ left: `calc(${NAME_PX}px + var(--phb, 0) * ${BEAT_PX}px)` }}
      />
      {rhythm.lanes.map((l, li) => (
        <div className="rhythm-row" key={l.name}>
          <span className="rhythm-name">{l.name}</span>
          {Array.from({ length: rhythm.steps }, (_, s) => (
            <button
              key={s}
              type="button"
              aria-label={`hit-${l.name}-${s}`}
              className={
                "rhythm-cell" + (l.hits.includes(s) ? " on" : "") + (s % 4 === 0 ? " beat" : "")
              }
              onClick={() => toggle(li, s)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
