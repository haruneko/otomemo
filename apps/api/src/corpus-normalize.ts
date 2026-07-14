// 進行コーパスの在DB正規化（R0・2026-07-14）。U-FRET 生データは消失＝再ingest不能なので、
// 既存 neta(chord_progression) を「素材として使える」形へ純関数で畳む。副作用（DB更新）は呼び側。
//   ① 断片ゲート：length<3（≤2和音の自明バンプ）を捨てる
//   ② 品質語彙の正準化：min→m 等（music-core.canonicalQuality）＋ major三和音は "" に集約
//   ③ dedup＋count：正規化後に同一のものを1本へ畳み、出現数を count に集約
//   ④ 長短分裂の統合：ループ毎独立キー判定で割れた平行長短を six-based（de Clercq 2021）署名で畳む
//      ＝短調を相対長調の度数枠（minor tonic = vi = +9）へ写像した根音列で同一性を判定
import { canonicalQuality } from "@cm/music-core";

export interface ProgChord { root: number; quality: string; start: number; dur: number }
export interface ProgItem { id: string; mode: "major" | "minor"; chords: ProgChord[]; count?: number }
export interface NormKeep { id: string; mode: "major" | "minor"; chords: ProgChord[]; count: number }
export interface NormResult { keep: NormKeep[]; drop: string[] }

export const MIN_PROG_LEN = 3; // 断片ゲート：これ未満は捨てる

// 品質の正準トークン：major三和音の表記ゆれ(""/maj/M)は "" に、minor三和音(m/min)は "m" に集約。
// music-core は "maj"/"min" も有効な interval キー＝そのまま返すので、三和音の綴りはここで畳む。
export function canonProgQuality(q: string): string {
  const c = canonicalQuality(q ?? "");
  if (c === "" || c === "maj" || c === "M") return ""; // major三和音
  if (c === "m" || c === "min") return "m"; // minor三和音
  return c; // 7th系・テンション等は canonicalQuality の正準キーを保持
}

// six-based 度数枠の根音（0..11）：minor は相対長調フレームへ（minor tonic=0 → vi=pc9）。
// major は保存済み度数（tonic=0基準）そのまま。これで平行長短の同型進行が同じ根音列になる。
export function sixBasedRoot(root: number, mode: "major" | "minor"): number {
  const r = ((root % 12) + 12) % 12;
  return mode === "minor" ? (r + 9) % 12 : r;
}

// 進行の正準署名（mode非依存）：six-based根音＋正準品質の列。相対長短の割れ・完全重複を同一視。
export function progSignature(item: { mode: "major" | "minor"; chords: ProgChord[] }): string {
  return item.chords.map((c) => `${sixBasedRoot(c.root, item.mode)}:${canonProgQuality(c.quality)}`).join(",");
}

/**
 * 進行群を正規化＝断片除去→品質正準化→six-based署名で dedup（count集約）。
 * 代表は「major を優先→count 多→先着」。keep=更新する進行（品質正準化済＋count）、drop=削除するid。
 */
export function normalizeProgressions(items: ProgItem[]): NormResult {
  const drop: string[] = [];
  const survivors: ProgItem[] = [];
  for (const it of items) {
    if ((it.chords?.length ?? 0) < MIN_PROG_LEN) drop.push(it.id); // ① 断片ゲート
    else survivors.push(it);
  }
  // ②③④ 署名でグルーピング
  const groups = new Map<string, ProgItem[]>();
  for (const it of survivors) {
    const sig = progSignature(it);
    (groups.get(sig) ?? groups.set(sig, []).get(sig)!).push(it);
  }
  const keep: NormKeep[] = [];
  for (const g of groups.values()) {
    const totalCount = g.reduce((s, it) => s + (it.count ?? 1), 0);
    // 代表選定：major 優先 → count 多 → 先着（配列順）
    const rep = [...g].sort((a, b) =>
      (a.mode === b.mode ? 0 : a.mode === "major" ? -1 : 1) || (b.count ?? 1) - (a.count ?? 1),
    )[0]!;
    keep.push({
      id: rep.id,
      mode: rep.mode,
      chords: rep.chords.map((c) => ({ ...c, quality: canonProgQuality(c.quality) })), // ② 品質正準化
      count: totalCount,
    });
    for (const it of g) if (it.id !== rep.id) drop.push(it.id); // 重複・分裂の相方を削除
  }
  return { keep, drop };
}
