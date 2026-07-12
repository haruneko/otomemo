// 骨格の机（design #20 S6・スライス D1b）の純ロジック：レンズ別の再生 Note 列を作る。
// 再生機構（無停止切替＝レンズ別ゲインバス）は D1a が担当。ここは **Note 列を作りレンズ印を付けるだけ**。
// 契約（handoff §3 D1／2026-07-12-skeleton-desk-handoff.md）：
//   ・畳みレンズ＝skeletonEarNotes（2声）＋クリック（4分・小節頭アクセント）。コード楽器/ドラム(クリック以外)は入れない。
//   ・実音レンズ＝composite（編成合成）＋骨格線ミックス。
// 副作用なし・元配列を破壊しない（map で新オブジェクト）。skelEar/composite は既に机の sectionContext(D0) で
// 計算済みの値を受ける（重複計算しない＝純度も上がる）。
import type { Note } from "./music";

// --- レンズ印（D1a と共有・文字列直書き禁止）。畳み群＝"fold"／実音群＝"real"。 ---
export const LENS_FOLD = "fold";
export const LENS_REAL = "real";

// Note に lens 印を付けた拡張型。D1a が Note に `lens?: string` を足す前でも型が通るよう、
// ここで最小限の交差型を定義（フィールド名は必ず `lens`・値は LENS_FOLD/LENS_REAL）。
// D1a マージ後（Note に lens? 追加）も交差型として整合＝前方互換。
export type LensNote = Note & { lens: string };

// クリック音色の暫定既定（耳較正で見直し可・handoff §5）。
// GM percussion 76=Hi Wood Block（web の drum 合成では pitch>41→"noise" voice＝短いティック）。
// 単一 pitch でクリック性を保ち、小節頭だけ vel を上げてアクセント（音程でなく強弱で拍節を出す）。
// vel は HiHat 既定(55)近辺を弱拍に、アクセントを 90 に＝ベッドとして邪魔しない控えめ既定。暫定既定・耳較正で見直し可（handoff §5）。
const CLICK_PITCH = 76; // GM Hi Wood Block（DRUMS には無いが GM 打楽器・"noise" voice で鳴る）
const CLICK_KIT = 0; // Standard キット（drum 合成は voice ベースなので実質音は不変・明示のため付与）
const CLICK_VEL_ACCENT = 90; // 小節頭。暫定既定・耳較正で見直し可（handoff §5）
const CLICK_VEL_WEAK = 55; // その他の拍。暫定既定・耳較正で見直し可（handoff §5）

// 4分音符クリック＝1拍ごとに1音（bars*bpb 本）。小節頭（beatIndex % bpb === 0）だけアクセント。
// drum:true＋part:"drums"＋lens:"fold"。dur=1拍（drum 合成は固定長ティックだが意味として4分）。
export function clickNotes(bars: number, bpb: number): LensNote[] {
  const out: LensNote[] = [];
  const total = bars * bpb;
  for (let i = 0; i < total; i++) {
    const isDownbeat = i % bpb === 0;
    out.push({
      pitch: CLICK_PITCH,
      start: i, // 1拍=1ビート刻み
      dur: 1,
      vel: isDownbeat ? CLICK_VEL_ACCENT : CLICK_VEL_WEAK,
      drum: true,
      kit: CLICK_KIT,
      part: "drums",
      lens: LENS_FOLD,
    });
  }
  return out;
}

// 畳みレンズ＝skelEar（skeletonEarNotes の2声＝melody/bass）に lens:"fold" を付与＋クリック。
// skelEar は呼び出し側が skeletonEarNotes(...) で作った2声（机は sectionContext.skelEar 経由で得る）。
// コード楽器・ドラム（クリック以外）は入れない＝part は {melody,bass,drums(click)} のみになる。
export function foldLensNotes(skelEar: Note[], bars: number, bpb: number): LensNote[] {
  const voices: LensNote[] = skelEar.map((n) => ({ ...n, lens: LENS_FOLD }));
  return [...voices, ...clickNotes(bars, bpb)];
}

// 実音レンズ＝composite（編成合成）＋骨格線ミックス（skelEar）。各音に lens:"real" を付与。
// 元配列を破壊しない（map で新オブジェクト）。
export function realLensNotes(composite: Note[], skelEar: Note[]): LensNote[] {
  return [...composite, ...skelEar].map((n) => ({ ...n, lens: LENS_REAL }));
}
