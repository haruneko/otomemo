// コード品質を「三和音 × 拡張(番号) × △(maj7) × オルタード」に分解/合成する（design 決定A・UIの直交化）。
// 保存形式は従来の quality 文字列(QUALITY_INTERVALS のキー)のまま＝合成/逆変換するだけ。
// ドミナントは「拡張の番号だけ」で記号なし（7=♭7 ドミナント既定）、長7は △ で印（决定: ユーザー）。

export type Triad = "maj" | "m" | "dim" | "aug" | "sus4" | "sus2";
export type Ext = "" | "6" | "69" | "add9" | "7" | "9" | "11" | "13" | "dim7";
export type Alt = "" | "b9" | "#9" | "#11" | "b5";
export interface ChordParts {
  tri: Triad;
  ext: Ext;
  maj7: boolean; // △＝長7（C7→Cmaj7）。拡張が7/9/13のとき有効
  alt: Alt; // オルタード（ドミナント♭9/♯9/♯11/♭5・maj7#11の♯11）
}

const P = (tri: Triad, ext: Ext, maj7 = false, alt: Alt = ""): ChordParts => ({ tri, ext, maj7, alt });

// 正準 quality → パーツ（これが分解の真実。逆引きで合成）。
const PARTS: Record<string, ChordParts> = {
  "": P("maj", ""), m: P("m", ""), dim: P("dim", ""), aug: P("aug", ""), sus4: P("sus4", ""), sus2: P("sus2", ""),
  "6": P("maj", "6"), m6: P("m", "6"), "69": P("maj", "69"), m69: P("m", "69"), add9: P("maj", "add9"),
  "7": P("maj", "7"), maj7: P("maj", "7", true), m7: P("m", "7"), mM7: P("m", "7", true),
  m7b5: P("dim", "7"), dim7: P("dim", "dim7"), aug7: P("aug", "7"), "7sus4": P("sus4", "7"),
  "9": P("maj", "9"), maj9: P("maj", "9", true), m9: P("m", "9"),
  "11": P("maj", "11"), m11: P("m", "11"),
  "13": P("maj", "13"), maj13: P("maj", "13", true), m13: P("m", "13"),
  "7b9": P("maj", "7", false, "b9"), "7#9": P("maj", "7", false, "#9"), "7#11": P("maj", "7", false, "#11"),
  "7b5": P("maj", "7", false, "b5"), "maj7#11": P("maj", "7", true, "#11"),
};
const ALIAS: Record<string, string> = { maj: "", min: "m" };
const keyOf = (p: ChordParts) => `${p.tri}|${p.ext}|${p.maj7 ? 1 : 0}|${p.alt || ""}`;
const INV: Record<string, string> = {};
for (const [q, p] of Object.entries(PARTS)) INV[keyOf(p)] = q;

export function decomposeQuality(quality: string): ChordParts {
  const canon = ALIAS[quality] ?? quality;
  return PARTS[canon] ?? P("maj", ""); // 未知は major フォールバック（vocab 外は稀）
}
export function composeQuality(p: ChordParts): string {
  return INV[keyOf(p)] ?? INV[keyOf(P(p.tri, ""))] ?? ""; // 無ければ三和音ベースへ退避
}

// --- UI 用の選択肢（三和音ごとに拡張/△/オルタードの可否が変わる） ---
export const TRIAD_OPTIONS: { v: Triad; label: string }[] = [
  { v: "maj", label: "" }, // ＝無印（C major は「C」）。ユーザー要望で空表示
  { v: "m", label: "m" },
  { v: "dim", label: "dim" },
  { v: "aug", label: "aug" },
  { v: "sus4", label: "sus4" },
  { v: "sus2", label: "sus2" },
];
const EXT_BY_TRIAD: Record<Triad, Ext[]> = {
  maj: ["", "6", "69", "add9", "7", "9", "11", "13"],
  m: ["", "6", "69", "7", "9", "11", "13"],
  dim: ["", "7", "dim7"],
  aug: ["", "7"],
  sus4: ["", "7"],
  sus2: [""],
};
export const extOptionsFor = (tri: Triad): { v: Ext; label: string }[] =>
  EXT_BY_TRIAD[tri].map((v) => ({ v, label: extLabel(tri, v) }));
function extLabel(tri: Triad, ext: Ext): string {
  if (ext === "") return "—";
  if (ext === "69") return "6/9";
  if (tri === "dim" && ext === "7") return "m7♭5";
  if (ext === "dim7") return "dim7";
  return ext; // 6/7/9/11/13/add9
}
export const maj7Applicable = (tri: Triad, ext: Ext): boolean =>
  (tri === "maj" || tri === "m") && (ext === "7" || ext === "9" || ext === "13");
export function altOptionsFor(tri: Triad, ext: Ext, maj7: boolean): { v: Alt; label: string }[] {
  if (tri !== "maj" || ext !== "7") return [{ v: "", label: "—" }];
  return maj7
    ? [{ v: "", label: "—" }, { v: "#11", label: "♯11" }] // maj7 + ♯11 = maj7♯11
    : [{ v: "", label: "—" }, { v: "b9", label: "♭9" }, { v: "#9", label: "♯9" }, { v: "#11", label: "♯11" }, { v: "b5", label: "♭5" }];
}
