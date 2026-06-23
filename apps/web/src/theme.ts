// 色テーマ（kind→色）。:root の --k-<kind> を上書きして反映、localStorage に保存。
export const KINDS_COLORED = [
  "rhythm",
  "melody",
  "bass",
  "chord",
  "chord_progression",
  "lyric",
  "theme",
  "section",
  "song",
  "knowledge",
  "other",
] as const;
export type ColorKind = (typeof KINDS_COLORED)[number];

export const DEFAULT_COLORS: Record<ColorKind, string> = {
  rhythm: "#e8533f",
  melody: "#4fa8e0",
  bass: "#2fa6b0",
  chord: "#7c6ce0",
  chord_progression: "#b7a0f0",
  lyric: "#f0c544",
  theme: "#2bb789",
  section: "#e08a3c",
  song: "#d98cc4",
  knowledge: "#8a93a6",
  other: "#6b7280",
};

const KEY = "cm-theme-colors";

export function loadColors(): Record<ColorKind, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_COLORS };
    return { ...DEFAULT_COLORS, ...(JSON.parse(raw) as Partial<Record<ColorKind, string>>) };
  } catch {
    return { ...DEFAULT_COLORS };
  }
}

export function saveColors(colors: Record<ColorKind, string>): void {
  localStorage.setItem(KEY, JSON.stringify(colors));
}

export function applyColors(colors: Record<ColorKind, string>): void {
  for (const k of KINDS_COLORED) {
    document.documentElement.style.setProperty(`--k-${k}`, colors[k]);
  }
}

// --- カラーテーマ・プリセット（色セットから選ぶ・#12）---
// 既定パレットを coherent に変換して各プリセットを作る（kind の意味＝色相は保ち、明度/彩度だけ動かす）。
// 個別の色いじりはプリセット適用後も上書き可能（プリセットは"土台"）。
function hexToRgb(h: string): [number, number, number] {
  const m = h.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (n: number): string => clamp(n).toString(16).padStart(2, "0");
const rgbToHex = (r: number, g: number, b: number): string => `#${toHex(r)}${toHex(g)}${toHex(b)}`;
const lum = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;
const pastelize = (h: string): string => {
  const [r, g, b] = hexToRgb(h); // 白に寄せて淡く
  return rgbToHex(r + (255 - r) * 0.45, g + (255 - g) * 0.45, b + (255 - b) * 0.45);
};
const vivid = (h: string): string => {
  const [r, g, b] = hexToRgb(h); // 灰から離して鮮やかに
  const l = lum(r, g, b);
  return rgbToHex(l + (r - l) * 1.4, l + (g - l) * 1.4, l + (b - l) * 1.4);
};
const mono = (h: string): string => {
  const [r, g, b] = hexToRgb(h); // 彩度を落としてモノクロ（明度で見分ける）
  const l = lum(r, g, b);
  return rgbToHex(l + (r - l) * 0.15, l + (g - l) * 0.15, l + (b - l) * 0.15);
};
const mapColors = (fn: (h: string) => string): Record<ColorKind, string> =>
  Object.fromEntries(KINDS_COLORED.map((k) => [k, fn(DEFAULT_COLORS[k])])) as Record<ColorKind, string>;

export const THEME_PRESETS: { name: string; colors: Record<ColorKind, string> }[] = [
  { name: "既定", colors: { ...DEFAULT_COLORS } },
  { name: "パステル", colors: mapColors(pastelize) },
  { name: "ビビッド", colors: mapColors(vivid) },
  { name: "モノクロ", colors: mapColors(mono) },
];
