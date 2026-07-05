// コード品質を「三和音 × 拡張(番号) × オルタード」に分解/合成する（design 決定A・UIの直交化）。
// 保存形式は従来の quality 文字列(QUALITY_INTERVALS のキー)のまま＝合成/逆変換するだけ。
// **長7 vs ドミナントは三和音の「maj／空欄」で切替**（ユーザー決定）：
//   C , 7  → C7（空欄＝ドミナント♭7・記号いらない）／ C maj 7 → Cmaj7（maj＝長7）。
// マイナーの7thは自動で♭7（Cm7）。少数の mM7 は minor の拡張「maj7」で出す。

export type Triad = "" | "maj" | "m" | "dim" | "aug" | "sus4" | "sus2";
export type Ext = "" | "6" | "69" | "add9" | "7" | "M7" | "9" | "11" | "13" | "dim7";
export type Alt = "" | "b9" | "#9" | "#11" | "b5";
export interface ChordParts {
  tri: Triad;
  ext: Ext;
  alt: Alt; // オルタード（ドミナント♭9/♯9/♯11/♭5・maj7#11の♯11）
}

const P = (tri: Triad, ext: Ext, alt: Alt = ""): ChordParts => ({ tri, ext, alt });

// 正準 quality → パーツ（これが分解の真実。逆引きで合成）。
const PARTS: Record<string, ChordParts> = {
  "": P("", ""), m: P("m", ""), dim: P("dim", ""), aug: P("aug", ""), sus4: P("sus4", ""), sus2: P("sus2", ""),
  "6": P("", "6"), m6: P("m", "6"), "69": P("", "69"), m69: P("m", "69"), add9: P("", "add9"),
  "7": P("", "7"), maj7: P("maj", "7"), m7: P("m", "7"), mM7: P("m", "M7"),
  m7b5: P("dim", "7"), dim7: P("dim", "dim7"), aug7: P("aug", "7"), "7sus4": P("sus4", "7"),
  "9": P("", "9"), maj9: P("maj", "9"), m9: P("m", "9"),
  "11": P("", "11"), m11: P("m", "11"),
  "13": P("", "13"), maj13: P("maj", "13"), m13: P("m", "13"),
  "7b9": P("", "7", "b9"), "7#9": P("", "7", "#9"), "7#11": P("", "7", "#11"),
  "7b5": P("", "7", "b5"), "maj7#11": P("maj", "7", "#11"),
};
const ALIAS: Record<string, string> = { maj: "", min: "m" };
const keyOf = (p: ChordParts) => `${p.tri}|${p.ext}|${p.alt || ""}`;
const INV: Record<string, string> = {};
for (const [q, p] of Object.entries(PARTS)) INV[keyOf(p)] = q;

export function decomposeQuality(quality: string): ChordParts {
  const canon = ALIAS[quality] ?? quality;
  return PARTS[canon] ?? P("", ""); // 未知は素のメジャーへ（vocab 外は稀）
}
export function composeQuality(p: ChordParts): string {
  if (p.tri === "maj" && p.ext === "") return ""; // maj 単独＝C（拡張なしは素のメジャー）
  return INV[keyOf(p)] ?? INV[keyOf({ tri: p.tri, ext: "", alt: "" })] ?? "";
}

// --- UI 用の選択肢（三和音ごとに拡張/オルタードの可否が変わる） ---
export const TRIAD_OPTIONS: { v: Triad; label: string }[] = [
  { v: "", label: "" }, // 空欄＝素のメジャー／ドミナント系。C は「C」、C+7 は「C7」
  { v: "maj", label: "maj" }, // 長7系。maj+7 = Cmaj7
  { v: "m", label: "m" },
  { v: "dim", label: "dim" },
  { v: "aug", label: "aug" },
  { v: "sus4", label: "sus4" },
  { v: "sus2", label: "sus2" },
];
const EXT_BY_TRIAD: Record<Triad, Ext[]> = {
  "": ["", "6", "69", "add9", "7", "9", "11", "13"], // ドミナント系（7=♭7）
  maj: ["", "7", "9", "13"], // 長7系（7=△7）。maj+—=C
  m: ["", "6", "69", "7", "M7", "9", "11", "13"], // m+M7=mM7
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
  if (ext === "M7") return "maj7"; // minor の長7（mM7）
  if (tri === "dim" && ext === "7") return "m7♭5";
  if (ext === "dim7") return "dim7";
  return ext; // 6/7/9/11/13/add9
}
export function altOptionsFor(tri: Triad, ext: Ext): { v: Alt; label: string }[] {
  if (ext !== "7") return [{ v: "", label: "—" }];
  if (tri === "") return [{ v: "", label: "—" }, { v: "b9", label: "♭9" }, { v: "#9", label: "♯9" }, { v: "#11", label: "♯11" }, { v: "b5", label: "♭5" }];
  if (tri === "maj") return [{ v: "", label: "—" }, { v: "#11", label: "♯11" }]; // maj7♯11
  return [{ v: "", label: "—" }];
}
