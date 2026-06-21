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
