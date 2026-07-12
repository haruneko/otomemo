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
import { skeletonEarNotes, SKEL_MEL_PROGRAM, SKEL_BASS_PROGRAM, type MelCp } from "./skeletonEdit";
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

// ②「コードだけ」レンズ用（#5 是正 2026-07-13）：ブロック相対 effChords（start は既に −skelPosition 済＝負もあり）を
// 再生窓 `[0, span)` に切り出す。**窓頭に食い込むコード（start<0 かつ end>0）は start=0 へクランプし dur を詰める**
// ＝ブロック開始時点で支配中のコードを鳴らす（skelPosition>0 で先頭コードが負時刻＝Tone で無発火になる欠落を是正）。
// 窓外（end<=0 or start>=span）は捨てる（負時刻の無駄スケジュール排除）。
export function clipChordsToWindow(chords: ChordEntry[], span: number): ChordEntry[] {
  const out: ChordEntry[] = [];
  for (const c of chords) {
    const s = Math.max(0, c.start);
    const e = Math.min(span, c.start + c.dur);
    if (e > s + 1e-6) out.push({ ...c, start: s, dur: e - s });
  }
  return out;
}

// deskLensNotes / deskFoldReal の引数（D5 で deskStages.ts も同じ形を消費＝named 型に切り出し）。
export interface DeskLensArgs {
  stateReal: SkeletonContent;
  earChordsRel: ChordEntry[]; // earChords（実調・セクション位置）を骨格ブロック相対（start − skelPosition）にした列
  composite: Note[];
  skelPosition: number; // 骨格ブロックのセクション内位置（拍）＝ベッド窓の起点
  bars: number; // 骨格ブロックの小節数（=ロール幅／クリック尺／ベッド窓幅）
  bpb: number;
  previewMelody?: Note[] | null; // ④出口の試着（D4）：実音レンズのメロ枠を候補メロで差替（ブロックローカル・beat0起点）。
}

// ベッド＋レンズの再生 Note 列を **fold 群 / real 群 に割った物**（**ブロックローカル座標**）。D5 で
// レンズをステージ相対に一般化するとき、③④は「a＝fold群・b＝real群」をそのまま載せる＝bit一致の土台。
//   ・skelEar ＝ skeletonEarNotes(stateReal, {chords: earChordsRel, shift:0})。**+skelPosition しない**
//     ＝ beat 0 起点のまま＝ SkeletonEditor のロールと一致＝プレイヘッドが揃う（D1.5 の核）。
//   ・bed ＝ sliceBedToWindow(composite, skelPosition, bars*bpb)＝セクション全体 composite から骨格ブロックの
//     窓を切り出しブロックローカルへ。composite は骨格を含まない（compositeNotes が skeleton を無音扱い＝従来）。
//   ・fold 群 ＝ foldLensNotes(skelEar, bars, bpb)（2声＋クリック・クリックは bars 小節ぶん）。
//   ・real 群 ＝ realLensNotes(bed, skelEar)（編成＋骨格線）。previewMelody（D4）は real 群のみに効く。
export function deskFoldReal(args: DeskLensArgs): { fold: LensNote[]; real: LensNote[] } {
  const skelEar: Note[] = skeletonEarNotes(args.stateReal, {
    chords: args.earChordsRel,
    shift: 0, // ★二重移調しない：state は既に実調
    beatsPerBar: args.bpb,
  });
  const bed = sliceBedToWindow(args.composite, args.skelPosition, args.bars * args.bpb);
  const fold = foldLensNotes(skelEar, args.bars, args.bpb);
  // ④試着（D4）：実音レンズのメロ枠を候補で差し替える。候補メロは gen_melody(skeletonNetaId) 由来＝骨格と同じ
  //   ブロックローカル座標（beat0 起点）なので **オフセット無し**（skelEar と同座標）。skelPosition オフセットは
  //   しない＝ベッド/skelEar も既にブロックローカル（D1.5）だから（座標を揃える素直な判断）。
  //   ・現骨格線(skelEar)はゴースト＝実音群から外す（鳴らさない）。
  //   ・ベッドの既存メロ(part:"melody")もゴースト＝候補と二重化しないよう外す。伴奏(コード/ベース/ドラム)は残す。
  //   ・fold 群は現骨格のまま（試着中はレンズ=実音でミュートされる＝素直）。
  if (args.previewMelody) {
    const bedNoMel = bed.filter((n) => n.part !== "melody");
    const cand: Note[] = args.previewMelody.map((n) => ({ ...n, part: "melody" }));
    return { fold, real: realLensNotes([...bedNoMel, ...cand], []) };
  }
  return { fold, real: realLensNotes(bed, skelEar) };
}

// ③④の getNotes（畳み群＋実音群を最初から渡す＝activeLens でゲート）。D1〜D4 はこれを消費。
// D5 のステージ相対（deskStages.stageLensSets）は skeleton/surface でこの出力と音符列 deepEqual（bit一致）。
export function deskLensNotes(args: DeskLensArgs): LensNote[] {
  const { fold, real } = deskFoldReal(args);
  return [...fold, ...real];
}

// --- 接点（対位法）の説明文と「この瞬間だけ聴く」ダイアッド（design #20 S6・D2） ---------------------
// 思想（#20）：機械は候補・完成は人間＝**指摘のみ・禁止しない**。「ダメ/間違い」でなく「避ける/意図なら可/味」の
// 語彙で、なぜ引っかかるか（＝声部の独立・強拍の緊張）を短く言うだけ。判断はオーナーに返す。

// 接点1つの説明文（MelCp を消費・analyzeCounterpoint 出力そのまま）。分岐の優先順位＝
//   parallel → cross → dissonant → 協和/弱拍 → ベース無し。
// 根拠：parallel/cross は「動きの質（並行・交差）」で、その拍が協和でも指摘したい構造上の癖＝dissonant（点の
//   縦の響き）より優先して前に出す（両立時は動きの癖を先に伝える方が編集の手がかりになる）。
// ※文言は暫定既定＝耳/手較正（handoff §5）で語感を見直し可。オーナー語彙（味/意図/可）で禁止語を避ける。
export function contactText(m: MelCp): string {
  if (m.parallel === "P5" || m.parallel === "P8") {
    const deg = m.parallel === "P5" ? "並行5度" : "並行8度";
    return `${deg}。声部の独立が薄れる。避けるか、経過として通すなら可。`;
  }
  if (m.cross) {
    return "声部交差（メロがベースより下）。意図があれば可・ふつうは避ける。";
  }
  if (m.interval === null) {
    return "ベース無し（骨格休符の区間）。この拍は縦の相手がいない。";
  }
  if (m.dissonant) {
    // 強拍かつ不協和。
    return `強拍の${m.interval.label}。掛留・倚音として次で解決するなら味。`;
  }
  // 協和、または弱拍（弱拍なら経過の不協和もここ＝縦の緊張は弱い）。
  const weakPassing = !m.interval.consonant ? "（弱拍の経過）" : "";
  return `${m.interval.label}${weakPassing}。素直な響き。`;
}

// --- B-lite「変化→耳」：②のコード差替が③の詰めた対位を黙って腐らせる問題を **見せる**（design #20 S6・D6） -----
// 思想（#20）：機械は指摘まで・自動修正はしない。②で編集された（採用された）コード区間を机のセッション内で記録し、
//   ③の接点のうち **当該区間に載るもの** を stale（＝差替でこの拍の縦の相手が変わった＝要確認）と印す。
//   ここは range membership だけの純関数（[機械]テスト対象）＝acknowledge（試聴で消える）は器側 React state。
//
// 判定：cp[i].start が editedRanges のいずれかの **半開区間 [start, end)** に載れば true。
//   ・半開＝コードの支配（effectiveBassAt/dominionSegments）と同じ境界規約＝コード末端 start==end は次コード側。
//   ・editedRanges 空＝全 false（②未編集・骨格だけ触った状態では立たない＝D6 の要件）。
//   ・重複区間は素直に許容＝membership は or なので重なっても結果は変わらない（呼び側で dedup 不要）。
export function staleContacts(editedRanges: { start: number; end: number }[], cp: MelCp[]): boolean[] {
  const EPS = 1e-6;
  return cp.map((m) => editedRanges.some((r) => m.start >= r.start - EPS && m.start < r.end - EPS));
}

// 「この瞬間だけ聴く」＝当該接点の **2音だけ**（メロ点＋実効ベース+1oct）を返す。ベッドは一切混ざらない
//   ＝引数が MelCp 単体なので構造的に混入しようがない（handoff §3 D2 の要件）。program は骨格2声の音色
//   （メロ=SKEL_MEL_PROGRAM / ベース=SKEL_BASS_PROGRAM）に揃える。持続（dur）は呼び出し側が previewNote の
//   holdSec で上書きするためここは placeholder（0.8拍相当・暫定既定）。bassPitch=null（骨格休符区間）は1音のみ。
export function contactDyadNotes(m: MelCp, bassOct = 12): Note[] {
  const notes: Note[] = [{ pitch: m.melPitch, start: 0, dur: 0.8, program: SKEL_MEL_PROGRAM, part: "melody" }];
  if (m.bassPitch != null) {
    notes.push({ pitch: m.bassPitch + bassOct, start: 0, dur: 0.8, program: SKEL_BASS_PROGRAM, part: "bass" });
  }
  return notes;
}
