import { useState } from "react";
import {
  KINDS_COLORED,
  type ColorKind,
  loadColors,
  saveColors,
  applyColors,
  DEFAULT_COLORS,
  THEME_PRESETS,
} from "../theme";

export function ThemeSettings() {
  const [colors, setColors] = useState(loadColors);

  // 色セット一式を反映（state＋CSS変数＋保存）。個別更新/プリセット/リセットで共有。
  function setAll(next: Record<ColorKind, string>) {
    setColors(next);
    applyColors(next);
    saveColors(next);
  }

  function update(k: ColorKind, hex: string) {
    setAll({ ...colors, [k]: hex });
  }

  function applyPreset(name: string) {
    const p = THEME_PRESETS.find((x) => x.name === name);
    if (p) setAll({ ...p.colors }); // プリセットは土台＝以降に個別上書きも可能
  }

  function reset() {
    setAll({ ...DEFAULT_COLORS });
  }

  return (
    <details className="theme">
      <summary>テーマ（色）</summary>
      {/* 色のセット（テーマ）から選ぶ。細かい個別調整は下のグリッドで上書きできる。 */}
      <label className="theme-preset">
        色のセット
        <select
          aria-label="theme-preset"
          defaultValue=""
          onChange={(e) => {
            applyPreset(e.target.value);
            e.target.value = ""; // 同じプリセットを再選択できるようにリセット
          }}
        >
          <option value="" disabled>
            選ぶ…
          </option>
          {THEME_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
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
