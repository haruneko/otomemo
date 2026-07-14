// シティポップ拡張和声プリセット（WP-C3スライス3・2026-07-14）。
// 正典＝docs/research/2026-07-14-citypop-extended-voicings.md（機能別テンション付与§1・分数コード§3・変換表§6-1・やり過ぎ警告§6-3）。
// 思想＝機械は候補まで。度数＋基本品質を「テンション付与＋分数化」した候補へ変換し、平板/濁りは warnings に**併記(ブロックしない)**。
// 既存の QUALITY_INTERVALS(maj9/m9/13/maj7#11 等)＋Chord.bass 欄で表現＝スキーマ拡張なし。実音コードで入出力。
import { type Mode } from "./function";

export type CitypopChord = { root: number; quality?: string; start?: number; dur?: number; bass?: number };

const norm = (x: number) => ((Math.trunc(x) % 12) + 12) % 12;

// 機能別テンション付与＝度数(調相対 pc)→citypop 品質（§6-1 変換表）。
// major: I/IV=maj9(浮遊), IIm/VIm=m9, IIIm=m7(9はavoid), V=13(9,13), VII°=m7b5。
const CITYPOP_MAJOR: Record<number, string> = { 0: "maj9", 2: "m9", 4: "m7", 5: "maj9", 7: "13", 9: "m9", 11: "m7b5" };
// minor: i/iv=m9, ♭III/♭VI/♭VII=maj9(借用の甘い長7), V=13(和声的短調のドミナント), ii°/vii°=m7b5。
const CITYPOP_MINOR: Record<number, string> = { 0: "m9", 2: "m7b5", 3: "maj9", 5: "m9", 7: "13", 8: "maj9", 10: "maj9", 11: "m7b5" };

// 表外の度数（借用/二次ドミナント/variety の代理）は品質ファミリで糖衣（§1 設計含意＝機能×スケールで薄く敷く）。
function fallbackQuality(q: string): string {
  const s = q || "";
  if (/dim|b5/.test(s)) return "m7b5";
  if (s === "7" || /^7/.test(s)) return "9"; // ドミナント7→9(ナチュラルテンション)
  if (/^maj7/.test(s)) return "maj9";
  if (/^(m|min)/.test(s)) return "m9"; // マイナー系→m9
  if (s === "6") return "69";
  if (s === "" || s === "maj") return "maj7"; // 素の長三和音→maj7
  return s; // aug/sus 等は触らない
}

const MAJ_FAMILY = new Set(["maj7", "maj9", "maj13", "maj7#11", "6", "69"]);

export type ApplyCitypopResult = { chords: CitypopChord[]; warnings: string[] };

/** 度数進行を citypop 拡張（テンション付与＋分数ドミナント）へ変換。既定はテンション付与、末尾カデンツの V は IV/V へ分数化。 */
export function applyCitypop(chords: CitypopChord[], opts: { key: number; mode: Mode }): ApplyCitypopResult {
  const key = norm(opts.key);
  const minor = opts.mode === "minor";
  const table = minor ? CITYPOP_MINOR : CITYPOP_MAJOR;
  const warnings: string[] = [];
  const out: CitypopChord[] = chords.map((c) => {
    const deg = norm(norm(c.root) - key);
    const quality = table[deg] ?? fallbackQuality(c.quality ?? "");
    return { ...c, quality };
  });
  // 分数化＝末尾カデンツ(…V→I)の V を IV/V(F/G)へ＝ドミナントの柔化(§3 最重要 IV/V・sus解決は人へ)。長調のみ(短調は 13 のまま)。
  if (!minor && out.length >= 2) {
    const li = out.length - 1, pi = li - 1;
    const finalDeg = norm(norm(out[li]!.root) - key);
    const penDeg = norm(norm(out[pi]!.root) - key);
    if (finalDeg === 0 && penDeg === 7) {
      out[pi] = { ...out[pi]!, root: norm(key + 5), quality: "", bass: norm(key + 7) }; // IV(F) on V(G) bass
    }
  }
  // やり過ぎ警告（§6-3・ブロックせず併記）。
  const majCount = out.filter((c) => MAJ_FAMILY.has(c.quality ?? "")).length;
  if (out.length >= 3 && majCount / out.length >= 0.6) warnings.push("均一Maj9警告：Maj7(9)系が過半で色が平板。V を 13/オルタード、IIm を m9 で締める等ドミナント緊張の差を付ける選択肢");
  const uniq = new Set(out.map((c) => c.quality ?? "")).size;
  if (out.length >= 3 && uniq === 1) warnings.push("均一テンション警告：全コードが同型テンション。機能(T/S/D)ごとに差を付けて崩す選択肢");
  return { chords: out, warnings };
}
