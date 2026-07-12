// 骨格の机（design #20 S6・スライス D1c）の純ロジック：配置越し編集の座標系（往復）と、
// ベッド＋レンズの再生 Note 列の合成。React/audio 非依存＝[機械]テスト対象（handoff §3 D1 a,b）。
//
// 座標系（handoff §2.3・二重移調を避ける）：
//   ・机の state は **セクション実調（配置移調 shift 済＝ビュー）** で持つ。
//   ・読み込み ＝ 素材調 content の tones/bass ピッチに **+shift**（deskLoadContent）。pitch==null は不変。
//   ・保存     ＝ 実調 state のピッチを **−shift** で素材調へ戻す（deskSaveContent）。往復で元に戻る。
//   ・鳴らす   ＝ state は既に実調なので skeletonEarNotes を **shift:0** で呼ぶ（二重移調しない）。
import type { Note, ChordEntry, SkeletonContent, SkeletonBreakpoint } from "./music";
import { skeletonEarNotes } from "./skeletonEdit";
import { foldLensNotes, realLensNotes, type LensNote } from "./deskLens";

// pitch を d だけ動かす（休符 pitch==null は不変）。tones/bass 双方に同じだけ効く（melodyPlacementShift 流儀）。
const shiftPts = (pts: SkeletonBreakpoint[] | undefined, d: number): SkeletonBreakpoint[] | undefined =>
  pts?.map((p) => (p.pitch == null ? { ...p } : { ...p, pitch: p.pitch + d }));

// 素材調 content → 実調ビュー state（+shift）。bars/phrases はそのまま。
export function deskLoadContent(content: SkeletonContent, shift: number): SkeletonContent {
  return {
    bars: content.bars,
    tones: shiftPts(content.tones, shift) ?? [],
    ...(content.bass ? { bass: shiftPts(content.bass, shift) } : {}),
    ...(content.phrases ? { phrases: content.phrases.map((ph) => ({ ...ph })) } : {}),
  };
}

// 実調ビュー state → 素材調 content（−shift）。updateNeta の content payload に使う。
// deskSaveContent(deskLoadContent(c, s), s) === c（往復・bit）を deskContent.test で固定。
export function deskSaveContent(state: SkeletonContent, shift: number): SkeletonContent {
  return {
    bars: state.bars,
    tones: shiftPts(state.tones, -shift) ?? [],
    ...(state.bass ? { bass: shiftPts(state.bass, -shift) } : {}),
    ...(state.phrases ? { phrases: state.phrases.map((ph) => ({ ...ph })) } : {}),
  };
}

// ベッド＋レンズの再生 Note 列。stateReal＝机の現 state（実調）。
//   ・skelEarReal ＝ skeletonEarNotes(stateReal, {chords: earChordsRel, shift:0})（state が既に実調＝shift 不要）
//     を **+skelPosition** で骨格ブロック相対→セクション座標へ。
//   ・fold 群 ＝ foldLensNotes(skelEarReal, bars, bpb)（2声＋クリック）。
//   ・real 群 ＝ realLensNotes(composite, skelEarReal)（編成＋骨格線）。
//   composite は骨格を含まない（compositeNotes が skeleton を無音扱い＝従来どおり）。
export function deskLensNotes(args: {
  stateReal: SkeletonContent;
  earChordsRel: ChordEntry[]; // earChords（実調・セクション位置）を骨格ブロック相対（start − skelPosition）にした列
  composite: Note[];
  skelPosition: number; // 骨格ブロックのセクション内位置（拍）
  bars: number; // クリックの尺（=セクション全体の小節数）
  bpb: number;
}): LensNote[] {
  const skelEarReal: Note[] = skeletonEarNotes(args.stateReal, {
    chords: args.earChordsRel,
    shift: 0, // ★二重移調しない：state は既に実調
    beatsPerBar: args.bpb,
  }).map((n) => ({ ...n, start: n.start + args.skelPosition }));
  return [...foldLensNotes(skelEarReal, args.bars, args.bpb), ...realLensNotes(args.composite, skelEarReal)];
}
