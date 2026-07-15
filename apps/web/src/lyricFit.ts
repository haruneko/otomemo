// 歌詞×メロ アクセント整合（W-K2）の web 側配線＝計算は @cm/music-core の純関数 analyzeLyricFit に委譲し、
// ここは hits を「歌詞チップに重ねる色クラス」へ写すだけの薄いアダプタ（design #13b・L1206）。
// 思想＝機械は候補まで：hard規則も soft ハイライトに留め、握りつぶし可（UIトグルで消せる）。
import { analyzeLyricFit, type FitHit } from "@cm/music-core";
import type { Note } from "./music";

export type { FitHit };

// severity の重み（同一ノートに複数規則が当たったら重い方を採用＝最も強い警告色で示す）。
const SEV_ORDER: Record<FitHit["severity"], number> = { red: 3, yellow: 2, info: 1 };

/** hits を noteIdx→最重hit の Map に畳む（重複規則は severity の重い方が勝つ）。 */
export function buildHitMap(hits: FitHit[]): Map<number, FitHit> {
  const m = new Map<number, FitHit>();
  for (const h of hits) {
    const cur = m.get(h.noteIdx);
    if (!cur || SEV_ORDER[h.severity] > SEV_ORDER[cur.severity]) m.set(h.noteIdx, h);
  }
  return m;
}

/** severity → 歌詞チップの追加クラス（fit-red / fit-yellow / fit-info）。CSS は transport-cards.css。 */
export function sylFitClass(sev: FitHit["severity"]): string {
  return `fit-${sev}`;
}

/**
 * notes（＋歌詞）から noteIdx→整合hit を計算。歌詞が1つも無ければ空 Map（＝ゼロ影響）。
 * noteIdx は notes 配列上のインデックス＝呼び側は同じ配列位置でチップを描く。
 */
export function computeLyricHits(notes: Note[]): Map<number, FitHit> {
  if (!notes.some((n) => n.syllable)) return new Map();
  const report = analyzeLyricFit(
    notes.map((n) => ({ pitch: n.pitch, syllable: n.syllable, start: n.start, dur: n.dur })),
  );
  // 歌詞が無いノート位置の hit（A-07 句末上げ等は歌詞非依存で当たる）は捨てる＝チップが無い所は装飾しない。
  const withSyl = new Set(notes.map((n, i) => (n.syllable ? i : -1)).filter((i) => i >= 0));
  return buildHitMap(report.hits.filter((h) => withSyl.has(h.noteIdx)));
}
