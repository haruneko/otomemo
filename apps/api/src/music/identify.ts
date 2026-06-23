// 連想エンジン：名前あて。ユーザーの進行を名前付き進行DBへ S1(度数化+距離)で照合。
// 回転不変（ループの開始位置ずれ）・調不変（度数化を通す）。データ不要＝S1直結のユーザー価値。
import { type Chord, type Degree } from "./theory";
import { toDegrees, detectKeyFromChords, progressionDistance } from "./index";
import { NAMED_PROGRESSIONS } from "./progressions";

export type IdentifyResult = { name: string; similarity: number; key: number; mode: "major" | "minor" };

// 距離→類似度 0..1（melody_similarity と同じ正規化：1=同型）。
function similarity(a: Degree[], b: Degree[]): number {
  const denom = 2 * Math.max(a.length, b.length, 1);
  return Math.max(0, 1 - progressionDistance(a, b) / denom);
}

// 名前付き進行の全回転に対する最大類似度（ループ進行は開始位置が任意なので回転不変にする）。
function bestRotationSimilarity(user: Degree[], named: Degree[]): number {
  let best = 0;
  for (let r = 0; r < named.length; r++) {
    const rot = named.slice(r).concat(named.slice(0, r));
    best = Math.max(best, similarity(user, rot));
  }
  return best;
}

/** ユーザーの進行 → 名前付き進行の近い順（既定 top3）。調未指定なら推定して度数化。 */
function scoreInKey(chords: Chord[], key: number, mode: "major" | "minor", top: number): IdentifyResult[] {
  const user = toDegrees(chords, key);
  const scored = NAMED_PROGRESSIONS.map((p) => ({
    name: p.name,
    similarity: Math.round(bestRotationSimilarity(user, p.degrees) * 1000) / 1000,
    key,
    mode,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, Math.max(1, top));
}

export function identifyProgression(
  chords: Chord[],
  opts: { key?: number; mode?: "major" | "minor"; top?: number } = {},
): IdentifyResult[] {
  const top = Math.max(1, opts.top ?? 3);
  // 調が両方指定なら確定。そうでなければ**候補(major/相対minor等)を複数試し、最も当たる調を採る**
  // ＝相対短調に飛んで名前を外す事故を防ぐ（dogfood P2：トライアドの王道が小室に化ける問題）。
  const candidates =
    opts.key !== undefined && opts.mode !== undefined
      ? [{ key: opts.key, mode: opts.mode }]
      : detectKeyFromChords(chords, 2).map((c) => ({ key: opts.key ?? c.key, mode: opts.mode ?? c.mode }));
  let best: IdentifyResult[] = [];
  let bestTop = -1;
  for (const c of candidates) {
    const res = scoreInKey(chords, c.key, c.mode, top);
    const s = res[0]?.similarity ?? 0;
    if (s > bestTop) (bestTop = s), (best = res);
  }
  return best;
}
