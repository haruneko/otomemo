import { useState } from "react";
import {
  KINDS_COLORED,
  type ColorKind,
  loadColors,
  saveColors,
  applyColors,
  DEFAULT_COLORS,
} from "../theme";

export function ThemeSettings() {
  const [colors, setColors] = useState(loadColors);

  function update(k: ColorKind, hex: string) {
    const next = { ...colors, [k]: hex };
    setColors(next);
    applyColors(next);
    saveColors(next);
  }

  function reset() {
    const next = { ...DEFAULT_COLORS };
    setColors(next);
    applyColors(next);
    saveColors(next);
  }

  return (
    <details className="theme">
      <summary>テーマ（色）</summary>
      <div className="theme-grid">
        {KINDS_COLORED.map((k) => (
          <label key={k} className="theme-row">
            <input
              type="color"
              aria-label={`color-${k}`}
              value={colors[k]}
              onChange={(e) => update(k, e.target.value)}
            />
            <span>{k}</span>
          </label>
        ))}
      </div>
      <button type="button" onClick={reset}>
        既定に戻す
      </button>
    </details>
  );
}
