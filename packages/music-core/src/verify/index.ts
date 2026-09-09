// 横断の検証器（M4）＝計画 `docs/drafts/2026-09-09-phrasemaker-port-master-plan.md` §5-2 M4・§6-4。
// **観測するだけ**＝生成経路には一切触らない（既存の出音は 1bit も変えない）。
//
// 収録：
//  - types        ＝gate / byConstruction / diagnostic を**戻り値の型で強制**（#8）＋被覆率（#3 #7）
//  - bandOverlap  ＝低域の棲み分け（gate は gap>0・overlap_frac は診断）
//  - limbs        ＝四肢衝突（フィル専用だった判定をグルーヴ全体へ一般化）
//  - coverage     ＝被覆率（検査の被覆率／パートの被覆率＝源流 coverage_metrics）
//  - microtiming  ＝microtiming_structural（**診断**）
//  - nondeterminism ＝乱数・実行時刻の禁止呼び出しの番人（gate。禁止語はこの番人自身も対象なので
//                      本ファイルにも生の綴りは書かない）
//
// 作法（§6-4）：検算側は生成が使う表を import しない（#2）＝この配下は verify/ 内以外へ依存しない。
export * from "./types";
export * from "./bandOverlap";
export * from "./limbs";
export * from "./coverage";
export * from "./microtiming";
export * from "./nondeterminism";
// fretboard ＝指板の到達可能性（M3-3e）。ギター gen2 の自前 DP を弦数・調弦・重みで一般化＝4弦ベースにも
//   6弦ギターにも同じ1本。**検証器**（gate＝到達不能0／diagnostic＝弾きにくさ）＝生成の主導権は握らない。
export * from "./fretboard";
