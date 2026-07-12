// 骨格の机（design #20 S6・スライス D1.5）の純ロジック：配置越し編集の座標系（往復）と、
// ベッド＋レンズの再生 Note 列の合成。React/audio 非依存＝[機械]テスト対象（handoff §3 D1 a,b／D1.5）。
//
// 座標系（handoff §2.3・二重移調を避ける）：
//   ・机の state は **セクション実調（配置移調 shift 済＝ビュー）** で持つ。
//   ・読み込み ＝ 素材調 content の tones/bass ピッチに **+shift**（deskLoadContent）。pitch==null は不変。
//   ・保存     ＝ 実調 state のピッチを **−shift** で素材調へ戻す（deskSaveContent）。往復で元に戻る。
//   ・鳴らす   ＝ state は既に実調なので skeletonEarNotes を **shift:0** で呼ぶ（二重移調しない）。
//
// 再生の時間座標（D1.5＝ブロックローカルへ統一）：
//   ・机の再生は **骨格ブロックローカル（beat 0 ＝ 骨格ブロック先頭）**。SkeletonEditor のロールも
//     骨格 content を beat 0 起点で描くので、transport 全体 beat（--phb）でプレイヘッドを引くと **ロールと一致**する。
//   ・skelEar（骨格2声）は **+skelPosition しない**（beat 0 起点のまま）＝ロールとプレイヘッドが揃う根拠。
//   ・ベッド（セクション全体 composite）は骨格ブロックの窓 [skelPosition, skelPosition+blockSpan) を
//     切り出し **-skelPosition** でブロックローカルへ寄せる（sliceBedToWindow）。
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

// ベッド（セクション全体 composite）を骨格ブロックの窓 [windowStart, windowStart+span) に切り出し、
// ブロックローカル座標（beat 0 ＝ 骨格ブロック先頭）へ **-windowStart** 寄せる。純関数・元配列非破壊。
//   ・対象＝**start が窓内**の音だけ（`windowStart ≤ start < windowStart+span`）。
//     再生用なので窓端に多少 dur が跨る音は素直に含める（クリップしない＝設計判断は素直な方）。
//   ・windowStart==0 は恒等シフト（従来＝ブロック先頭がセクション頭のケースと bit 一致）。
export function sliceBedToWindow(notes: Note[], windowStart: number, span: number): Note[] {
  const end = windowStart + span;
  const out: Note[] = [];
  for (const n of notes) {
    if (n.start >= windowStart - 1e-6 && n.start < end - 1e-6) out.push({ ...n, start: n.start - windowStart });
  }
  return out;
}

// ベッド＋レンズの再生 Note 列（**ブロックローカル座標**）。stateReal＝机の現 state（実調）。
//   ・skelEar ＝ skeletonEarNotes(stateReal, {chords: earChordsRel, shift:0})。**+skelPosition しない**
//     ＝ beat 0 起点のまま＝ SkeletonEditor のロールと一致＝プレイヘッドが揃う（D1.5 の核）。
//   ・bed ＝ sliceBedToWindow(composite, skelPosition, bars*bpb)＝セクション全体 composite から骨格ブロックの
//     窓を切り出しブロックローカルへ。composite は骨格を含まない（compositeNotes が skeleton を無音扱い＝従来）。
//   ・fold 群 ＝ foldLensNotes(skelEar, bars, bpb)（2声＋クリック・クリックは bars 小節ぶん）。
//   ・real 群 ＝ realLensNotes(bed, skelEar)（編成＋骨格線）。
export function deskLensNotes(args: {
  stateReal: SkeletonContent;
  earChordsRel: ChordEntry[]; // earChords（実調・セクション位置）を骨格ブロック相対（start − skelPosition）にした列
  composite: Note[];
  skelPosition: number; // 骨格ブロックのセクション内位置（拍）＝ベッド窓の起点
  bars: number; // 骨格ブロックの小節数（=ロール幅／クリック尺／ベッド窓幅）
  bpb: number;
}): LensNote[] {
  const skelEar: Note[] = skeletonEarNotes(args.stateReal, {
    chords: args.earChordsRel,
    shift: 0, // ★二重移調しない：state は既に実調
    beatsPerBar: args.bpb,
  });
  const bed = sliceBedToWindow(args.composite, args.skelPosition, args.bars * args.bpb);
  return [...foldLensNotes(skelEar, args.bars, args.bpb), ...realLensNotes(bed, skelEar)];
}
