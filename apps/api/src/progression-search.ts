// 連想エンジン 機構⑤：進行の retrieval（タグ足切り＋構造類似＋人気度）。
// 「切ない/〇〇っぽい/サビ向き の進行を引く」＝コーパス(neta:chord_progression)から連想で寄せる。
// core(DB) と music ドメイン(度数化/距離)を束ねる。薄いコーパスでは弱い候補しか出ない＝捏造はしない。
import type { Core } from "./core";
import type { Neta } from "./types";
import { toDegrees, progressionDistance, type Chord } from "./music";

export type ProgQuery = { tags?: string[]; like?: { chords: Chord[]; key?: number }; limit?: number };
export type ProgHit = { id: string; title: string | null; score: number; similarity: number; matchedTags: string[] };

const POPULAR = new Set(["ヒット", "定番"]);

/** 進行コーパスから連想で引く。tags 指定時は1つ以上一致で足切り(OR)、like 指定時は度数列の構造類似、
 * 人気度タグで微加点。score 降順で上位。該当が弱ければ素直に弱いまま返す（捏造しない）。 */
export function findProgressions(core: Core, query: ProgQuery): ProgHit[] {
  const all: Neta[] = core.listNeta({ kind: "chord_progression", limit: 1000 });
  const wantTags = query.tags ?? [];
  const likeDeg = query.like ? toDegrees(query.like.chords, query.like.key ?? 0) : null;
  const hits: ProgHit[] = [];
  for (const n of all) {
    const matchedTags = wantTags.filter((t) => n.tags.includes(t));
    if (wantTags.length && matchedTags.length === 0) continue; // OR足切り
    let similarity = 0;
    if (likeDeg) {
      const chords = (n.content as { chords?: Chord[] } | null)?.chords;
      if (Array.isArray(chords) && chords.length) {
        const deg = toDegrees(chords, n.key ?? 0);
        const denom = 2 * Math.max(deg.length, likeDeg.length, 1);
        similarity = Math.max(0, 1 - progressionDistance(deg, likeDeg) / denom);
      }
    }
    const pop = n.tags.some((t) => POPULAR.has(t)) ? 0.5 : 0;
    const score = matchedTags.length + similarity + pop;
    hits.push({
      id: n.id,
      title: n.title ?? null,
      score: Math.round(score * 1000) / 1000,
      similarity: Math.round(similarity * 1000) / 1000,
      matchedTags,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(1, query.limit ?? 10));
}
