// レシピ resolve 用 RNG ソルト表（凍結・M0契約 §4）。正典＝docs/drafts/2026-08-20-phrasemaker-M0-contract.md §4。
//
// 既存流儀＝`new Rng(seed + salt)`（apps/api の rng.ts mulberry32・generate.ts の seed+101、
// melodyCells.ts の drumLock seed+61 と同型）。役割別に固定＝新つまみ＝新ソルト＝既存レシピの音に
// 触らない（後付け不可なので初日に凍結）。値の衝突が無いことをテストで固定（rng-salt.test.ts）。
//
// ⚠ 注記（現行コード準拠・カスケード §3-3）：`fill=+37` は**将来枠＝未実装**。現行の fill は**生 seed**
// を使う（apps/api generate.ts の `resolveFillType(..., seed)`・`resolveBassFill(..., seed ?? 42)`）。
// この定数は**レシピ resolve 実装時（M1 以降）にソルト派生へ寄せる時に使う**。cues 無しの既存出力が
// 不動なのは「cue 経路が発火しない」ことによる＝ソルトの話ではない。

/** 役割別 RNG ソルト（凍結）。`new Rng(seed + RNG_SALT.kick)` の形で使う。 */
export const RNG_SALT = {
  kick: 11,
  snare: 13,
  ghost: 17,
  hihat: 19,
  ride: 23,
  tom: 29,
  fill: 37, // 将来枠＝未実装（上の注記）。現行 fill は生 seed。
  jitter: 41,
  altTake: 43, // 別案 seed
} as const;

export type RngSaltRole = keyof typeof RNG_SALT;
