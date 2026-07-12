// 骨格の机（design #20 S6・D5）：聴きレンズの「ステージ相対」一般化（seams A の縫い）。
// 焦点ステージ（①ビート/②コード/③骨格/④表面）ごとに、**同じ1つのレンズ2択**の意味が読み替わる：
//   ・①beat   ＝［パターン単体｜ベッド］
//   ・②chord  ＝［和声だけ｜編成］
//   ・③④skeleton/surface ＝［畳み｜実音］（現行のまま）
//
// ゲートは audio.ts の **2グループ ゲート据え置き**（A群=LENS_FOLD / B群=LENS_REAL）。activeLens は今後も
// LENS_FOLD/LENS_REAL のどちらか＝各ステージの2択を A群/B群に載せるだけ（audio.ts/setLensGain は無改変）。
//   ・ステージ内のレンズ切替（A⇄B）＝無停止ゲート（tp.setLensGain・位置飛ばない）。
//   ・ステージ切替（焦点①→②等）＝内容（reduce）が変わる＝tp.reloop（再生継続・loop維持・位置はループ頭へ）。
//
// bit一致鉄則：skeleton/surface の [...a, ...b] は現行 deskLensNotes(args) と音符列 deepEqual（LENS印含む）。
//   ＝deskFoldReal を割った物をそのまま a=fold（LENS_FOLD）・b=real（LENS_REAL）に載せる＝D1〜D4 の音は不変。
import type { LensNote } from "./deskLens";
import { LENS_FOLD } from "./deskLens";
import { deskFoldReal, sliceBedToWindow, clipChordsToWindow, type DeskLensArgs } from "./deskContent";
import { chordsToNotes, type ChordEntry } from "./music";

export type StageFocus = "beat" | "chord" | "skeleton" | "surface";

// ②「和声だけ」簡易合成の音色（暫定既定＝耳/手較正で見直し可・handoff §5）。素の三和音を素直に鳴らす。
const CHORD_LENS_PROGRAM = 0; // GM Acoustic Grand（和声色の確認用・voicing 込みは D7 パーキング）

export interface StageLensArgs extends DeskLensArgs {
  effChords: ChordEntry[]; // ②「和声だけ」用（試着 override 済の実効コード・ブロックローカル座標）
}

export interface StageLensSet {
  labels: [string, string]; // [A群=LENS_FOLD の表示ラベル, B群=LENS_REAL の表示ラベル]
  a: LensNote[]; // A群（LENS_FOLD 印）
  b: LensNote[]; // B群（LENS_REAL 印）
}

// ステージのレンズ2択ラベル（notes を作らず軽く読む＝トランスポート表示用）。
export function stageLabels(focus: StageFocus): [string, string] {
  switch (focus) {
    case "beat":
      return ["ドラムだけ", "伴奏"];
    case "chord":
      return ["コードだけ", "フル"];
    default: // skeleton / surface
      return ["骨格だけ", "フル"];
  }
}

// ステージ相対のレンズ2択（ラベル＋鳴らす音符列 a/b）。B群 real は全ステージで共有（フル＝実音相当）。
export function stageLensSets(focus: StageFocus, args: StageLensArgs): StageLensSet {
  const { fold, real } = deskFoldReal(args); // real＝「フル（実音相当）」＝全ステージの B群で共有
  const labels = stageLabels(focus);
  switch (focus) {
    case "beat": {
      // ①パターン単体＝ベッドのドラムのみ（窓切り出し後 n.drum で絞り LENS_FOLD 印）。ベッド＝フル(real)。
      const bed = sliceBedToWindow(args.composite, args.skelPosition, args.bars * args.bpb);
      const drums: LensNote[] = bed.filter((n) => n.drum === true).map((n) => ({ ...n, lens: LENS_FOLD }));
      return { labels, a: drums, b: real };
    }
    case "chord": {
      // ②和声だけ＝effChords を素の三和音で鳴らす簡易合成（chordsToNotes＝既存 SSOT・分数は bass も足す）。
      // part:"chord"・LENS_FOLD 印。音色は暫定既定（CHORD_LENS_PROGRAM）。編成＝フル(real)。
      // #5 是正：effChords はブロック相対で start が負もある（skelPosition>0）＝再生窓 [0, span) へ切り出し
      //   （窓頭に食い込むコードは start=0 クランプ）＝ブロック先頭で支配中のコードが無発火にならない。
      const windowChords = clipChordsToWindow(args.effChords, args.bars * args.bpb);
      const triads: LensNote[] = chordsToNotes(windowChords).map((n) => ({
        ...n,
        part: "chord",
        program: CHORD_LENS_PROGRAM,
        lens: LENS_FOLD,
      }));
      return { labels, a: triads, b: real };
    }
    case "skeleton":
    case "surface":
    default:
      // ③④＝現行のまま（畳み＝fold群・実音＝real群）。[...a,...b]＝deskLensNotes(args) と bit一致。
      return { labels, a: fold, b: real };
  }
}

// getNotes 用：両群を最初から渡す（activeLens=LENS_FOLD/REAL でゲート＝無停止 A/B）。
export function stageAllNotes(focus: StageFocus, args: StageLensArgs): LensNote[] {
  const s = stageLensSets(focus, args);
  return [...s.a, ...s.b];
}
