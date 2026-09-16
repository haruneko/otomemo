// アレンジ「文脈試聴」（正準＝docs/design.md「### アレンジS1＝写像規則の契約」の「文脈試聴」項＋同節末尾の
// 2026-08-02 夕裁定「ライブラリ入口の一本化」と「実装の細部（2026-09-16）」）。
//
// 入口はレーン空きセル→配置ピッカー（PlacePicker）の一本。ピッカーの▶で「その候補をそのセル（レーン行・位置）に
// 置いた状態のセクション全体（主旋律込み）」を startPlayback の既存 loop でループ試聴する。
// ＝候補を**仮想子として追加**して SectionEditor.getPlan と同じ流儀（sctx.audibleChildren → buildPlayback tree）で合成。
// 空きセルに置くので既存の子と二重にはならない（旧・差し替えモードは唯一の呼び手＝取込ダイアログの撤去で廃止）。
import { buildPlayback, beatsPerBar, feelOf, type PlaybackPlan } from "./music";
import * as sctx from "./sectionContext";
import { lanesForKind, maxBarsForKind, MIN_BARS, type Child } from "./components/sectionLanes";
import type { Neta } from "./api";

// 文脈＝セクション（key/mode/tempo/meter/bars/content(lanes_muted, feel)）とその子配置。
export type ContextAuditionCtx = {
  section: Neta;
  children: Child[];
};
// 置こうとしている候補＝ネタと、置く先（位置＝拍・レーン行 ord）。
export type AuditionPlacement = { neta: Neta; position: number; ord: number };

// セクションの総拍（＝ループ終端）。SectionEditor の BARS/TOTAL と同じ式：
//   ユーザー設定尺（neta.bars・下限 MIN_BARS）と配置済み中身の実尺の長い方、上限 maxBarsForKind。
function sectionTotalBeats(secCtx: sctx.SectionCtx, sec: Neta): number {
  const secBars = Math.max(MIN_BARS, sec.bars ?? MIN_BARS);
  const ends = secCtx.children.map((c) => c.position + sctx.childDur(secCtx, c)).filter((x) => Number.isFinite(x));
  const contentEnd = ends.length ? Math.max(0, ...ends) : 0;
  const bars =
    Math.min(maxBarsForKind(sec.kind), Math.max(secBars, Math.ceil(contentEnd / secCtx.BPB - 1e-6))) ||
    Math.max(MIN_BARS, secBars);
  return bars * secCtx.BPB;
}

/** 文脈試聴のプラン（候補を仮想子として追加したセクション可聴合成＋ループ範囲）。 */
export function contextAuditionPlan(
  ctx: ContextAuditionCtx,
  cand: AuditionPlacement,
): { plan: PlaybackPlan; loop: { startBeat: number; endBeat: number } } {
  const sec = ctx.section;
  const keyPc = sec.key ?? 0;
  const BPB = beatsPerBar(sec.meter);
  const virtual = { position: cand.position, ord: cand.ord, node: { neta: cand.neta, children: [] } } as unknown as Child;
  const secCtx: sctx.SectionCtx = { children: [...ctx.children, virtual], LANES: lanesForKind(sec.kind), keyPc, mode: sec.mode, BPB };
  const secContent = (sec.content && typeof sec.content === "object" ? sec.content : {}) as { lanes_muted?: string[] };
  // レーンミュートは getPlan と同じく既存の子にだけ効かせる。候補は押した意図＝ミュート中のレーンでも必ず鳴らす。
  const baseCtx: sctx.SectionCtx = { ...secCtx, children: ctx.children };
  const children = [...sctx.audibleChildren(baseCtx, secContent.lanes_muted ?? []), virtual];
  const plan = buildPlayback({
    kind: "tree",
    children,
    key: keyPc,
    mode: sec.mode,
    tempo: sec.tempo ?? 120,
    meter: sec.meter ?? undefined,
    feel: feelOf(sec.content),
  });
  return { plan, loop: { startBeat: 0, endBeat: sectionTotalBeats(secCtx, sec) } };
}
