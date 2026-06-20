import { type RhythmContent } from "../music";

// リズムのステップグリッド（design #19「リズム step（自作・小）」）。レーン×ステップを on/off。
export function RhythmEditor({
  rhythm,
  onChange,
}: {
  rhythm: RhythmContent;
  onChange: (r: RhythmContent) => void;
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
    <div className="rhythm-editor">
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
