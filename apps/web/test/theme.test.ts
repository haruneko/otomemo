import { describe, it, expect, beforeEach } from "vitest";
import { loadColors, saveColors, DEFAULT_COLORS, THEME_PRESETS, KINDS_COLORED } from "../src/theme";

beforeEach(() => localStorage.clear());

describe("theme colors", () => {
  it("returns defaults when nothing saved", () => {
    expect(loadColors()).toEqual(DEFAULT_COLORS);
  });

  it("persists overrides and merges with defaults", () => {
    saveColors({ ...DEFAULT_COLORS, melody: "#000000" });
    expect(loadColors().melody).toBe("#000000");
    expect(loadColors().rhythm).toBe(DEFAULT_COLORS.rhythm);
  });
});

describe("THEME_PRESETS（#12 色セット）", () => {
  it("既定プリセットは DEFAULT_COLORS と一致", () => {
    expect(THEME_PRESETS.find((p) => p.name === "既定")!.colors).toEqual(DEFAULT_COLORS);
  });

  it("各プリセットは全 kind を正しい #rrggbb で持つ", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of THEME_PRESETS) {
      for (const k of KINDS_COLORED) {
        expect(p.colors[k], `${p.name}/${k}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("変換プリセットは既定から色が動く（モノクロはR=G=B）", () => {
    const mono = THEME_PRESETS.find((p) => p.name === "モノクロ")!.colors;
    const m = mono.melody.slice(1);
    expect(m.slice(0, 2)).toBe(m.slice(2, 4)); // R==G
    expect(m.slice(2, 4)).toBe(m.slice(4, 6)); // G==B
    expect(THEME_PRESETS.find((p) => p.name === "パステル")!.colors.melody).not.toBe(DEFAULT_COLORS.melody);
  });
});
