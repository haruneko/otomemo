// ピッカーの「おすすめ（コーパス）」ランキング（Phase2・#20）。
// 生1781リストを直接選ばせない＝サーバ側で「関連数件だけ」返す（design.md「推薦経由」）。
// 軸（ユーザー選定＝軽い方式）：拍子一致 → 調が近い順（五度圏）→ ばらけ（id ハッシュで擬似シャッフル）→ 上位K。
// ※コーパスのメロは全て keyless(C基準断片) ＝ 調は中立になり実質「拍子＋ばらけ」に落ちる（進行は調付きもある）。
import { meterInfo } from "./meter";

export interface RecItem {
  id: string;
  meter?: string | null;
  key?: number | null;
}

// 五度圏の位置（pc*7 mod 12）。近さ＝五度圏距離（0..6）。
const fifths = (pc: number) => (((pc * 7) % 12) + 12) % 12;

// 決定的な擬似ハッシュ（同 keyDist 内でDB順のクラスタを崩して"ばらけ"させる。乱数を使わない＝再現可能）。
function hashId(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
}

/** items（同一 kind の library ネタ）から、frame(meter/key) に関連する上位 top 件を選ぶ。純関数＝TDD対象。 */
export function rankRecommendations<T extends RecItem>(
  items: T[],
  opts: { meter?: string | null; key?: number | null; top?: number },
): T[] {
  const top = opts.top ?? 6;
  const bpb = meterInfo(opts.meter).beatsPerBar;
  // 拍子一致（meter 未指定のネタは中立＝断片を隠さない）。
  const sameMeter = (n: RecItem) => n.meter == null || meterInfo(n.meter).beatsPerBar === bpb;
  // 調の近さ（五度圏距離）。どちらか keyless は中立(3＝一致と最遠の中間)。
  const keyDist = (n: RecItem) => {
    if (opts.key == null || n.key == null) return 3;
    const d = Math.abs(fifths(n.key) - fifths(opts.key));
    return Math.min(d, 12 - d);
  };
  return items
    .filter(sameMeter)
    .map((n) => ({ n, kd: keyDist(n), hh: hashId(n.id) }))
    .sort((a, b) => a.kd - b.kd || a.hh - b.hh)
    .slice(0, top)
    .map((x) => x.n);
}
