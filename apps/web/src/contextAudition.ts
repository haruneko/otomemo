// アレンジS1「文脈試聴」（正準＝docs/design.md「### アレンジS1＝写像規則の契約」の「文脈試聴」項）。
//
// 現状の候補/パターン試聴は**単体音ワンショット**（auditionPattern＝kind:"notes"・loop 無し）。
// S1 は候補 content を**いま編集中のコード楽器ネタの差し替え**としてセクション可聴合成
// （kind:"tree"・audibleChildren）へ流し込み、startPlayback の既存 loop を付けて鳴らす
// ＝「主旋律と一緒にループ試聴」。入口は既存 PatternImportDialog（＋ゴーストCTA）を使い回す。
//
// 設計メモ（なぜ「重ねる」でなく「差し替える」か）：候補を仮想子として**足す**と、いま編集中の
// コード楽器ネタが同時に鳴って伴奏が二重になる。差し替え＝「この枠にこの候補を入れたらどう鳴るか」＝
// 採用後の音そのものを先に聴ける（＝試聴の意味）。
//
// なぜ SectionEditor でなくここ（純関数）か：コード楽器エディタは SectionEditor の子ではなく、
// 「セクションから潜って開く別の編集画面（NetaDialog）」＝React の親子で文脈は降りてこない。
// そこで合成の規則だけを純関数として切り出し、文脈データ（親セクション＋その子ツリー＋編集中ネタid）は
// NetaDialog が既存 prop の parentId から api.getComposition で1回引いて props で下ろす
// （新しいグローバル状態も context API も作らない）。合成の中身は SectionEditor.getPlan と同じ流儀
// ＝sctx.audibleChildren → buildPlayback({kind:"tree"})。
import { buildPlayback, beatsPerBar, feelOf, type PlaybackPlan } from "./music";
import * as sctx from "./sectionContext";
import { lanesForKind, maxBarsForKind, MIN_BARS, type Child } from "./components/sectionLanes";
import type { Neta } from "./api";

// 文脈＝api.getComposition(parentId) の返り（親ネタ＋子配置）と、いま編集中の子ネタ id。
// これだけで key/mode/tempo/meter/bars・レーンミュート・可聴子集合がすべて決まる。
export type ContextAuditionCtx = {
  section: Neta; // 親（section）ネタ＝key/mode/tempo/meter/bars/content(lanes_muted, feel)
  children: Child[]; // セクションの子配置（getComposition の children そのまま）
  childNetaId: string; // いま編集中の子ネタ id＝候補 content の差し替え先
};

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

/**
 * 文脈試聴のプラン（セクション可聴合成＋ループ範囲）を作る。
 * フォールバック条件＝**null を返したら呼び側は従来のワンショット試聴へ落ちる**：
 *  - 子が1つも無いセクション（＝合成する文脈が無い）
 *  - 編集中ネタがこのセクションに配置されていない（＝差し替え先が無い＝単体編集中と同じ）
 */
export function contextAuditionPlan(
  ctx: ContextAuditionCtx,
  content: unknown,
): { plan: PlaybackPlan; loop: { startBeat: number; endBeat: number } } | null {
  const sec = ctx.section;
  if (!ctx.children.length) return null;
  const isMine = (c: Child) => c.node.neta.id === ctx.childNetaId;
  const placed = ctx.children.filter(isMine);
  if (!placed.length) return null; // セクションに居ない＝文脈試聴にならない＝ワンショットへ

  const keyPc = sec.key ?? 0;
  const BPB = beatsPerBar(sec.meter);
  const secCtx: sctx.SectionCtx = { children: ctx.children, LANES: lanesForKind(sec.kind), keyPc, mode: sec.mode, BPB };
  // レーンミュートは SectionEditor.getPlan と同じく audibleChildren で先に外す（section content に保存された状態）。
  const secContent = (sec.content && typeof sec.content === "object" ? sec.content : {}) as { lanes_muted?: string[] };
  const swap = (c: Child): Child => ({ ...c, node: { ...c.node, neta: { ...c.node.neta, content } } });
  const audible = sctx.audibleChildren(secCtx, secContent.lanes_muted ?? []).map((c) => (isMine(c) ? swap(c) : c));
  // 自分のレーンをミュート中でも「▶を押した候補」だけは必ず鳴らす（押した意図＝この音を聴きたい）。
  const children = audible.some(isMine) ? audible : [...audible, ...placed.map(swap)];

  const plan = buildPlayback({
    kind: "tree",
    children,
    key: keyPc,
    mode: sec.mode,
    tempo: sec.tempo ?? 120,
    meter: sec.meter ?? undefined,
    feel: feelOf(sec.content), // section content.feel 優先（無ければ buildPlayback が子ツリーから拾う＝getPlan と同じ）
  });
  return { plan, loop: { startBeat: 0, endBeat: sectionTotalBeats(secCtx, sec) } };
}
