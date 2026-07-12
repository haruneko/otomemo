// セクション文脈の計算（純関数）＝SectionEditor 内クロージャの抽出先（design #20 S6 D0）。
// 目的：「骨格の机」(SkeletonDesk・D1) が SectionEditor と**同じ計算**でベッド（伴奏）を得るための共有土台。
// 抽出はバイト等価の純移設＝挙動/DOM/CSS/再生ノート列/feel/レーン描画は一切変えない（Task#2 useMelodyGen 抽出と同流儀）。
// 各関数は文脈オブジェクト SectionCtx を第1引数に取り、SectionEditor は薄いラッパで委譲する（呼び出し名/シグネチャは温存）。
import {
  notesForContent,
  harmonyPlacementShift,
  melodyPlacementShift,
  chordsOf,
  isSkeleton,
  type ChordEntry,
  type Note,
} from "./music";
import { skeletonEarNotes } from "./skeletonEdit";
import type { Lane, Child } from "./components/sectionLanes";

// 文脈＝SectionEditor が state/prop から供給する最小集合（children/LANES/keyPc/mode/BPB）。
export type SectionCtx = {
  children: Child[];
  LANES: readonly Lane[];
  keyPc: number;
  mode: string | null | undefined; // = neta.mode（配置移調の着地 mode）
  BPB: number; // 1小節の拍数（beatsPerBar(meter)）
};

// ある lane に kind が属するか（レーン定義 kinds の包含）。
export const inLane = (lane: Lane, kind: string): boolean => (lane.kinds as readonly string[]).includes(kind);
// ② コード楽器の行＝ord（1→2レーン目、それ以外→1レーン目）。row 付きレーンはこの行で絞る。
export const rowOf = (c: Child): number => (c.ord === 1 ? 1 : 0);
// このレーンに属する子（row 指定があれば rowOf で絞る）。
export function laneChildren(ctx: SectionCtx, lane: Lane): Child[] {
  return ctx.children.filter((c) => inLane(lane, c.node.neta.kind) && (lane.row === undefined || rowOf(c) === lane.row));
}

// 子の実長（拍）。ネストした section/song＝中身の実長（子を再帰で畳む）＝1小節固定でなく本当の尺（評価修正A）。
export function childDur(ctx: SectionCtx, c: Child): number {
  const k = c.node.neta.kind;
  if (k === "section" || k === "song") {
    const kids = c.node.children ?? [];
    return kids.length ? Math.max(...kids.map((kc) => kc.position + childDur(ctx, kc))) : ctx.BPB;
  }
  const ns = notesForContent(k, c.node.neta.content);
  return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : ctx.BPB;
}

// 置くネタ自体の尺（leaf は実音の長さ・未知は1小節）。配置/ループの尺重複ガードに使う。
export function contentDur(ctx: SectionCtx, kind: string, content: unknown): number {
  if (kind === "section" || kind === "song") return ctx.BPB; // ネストは picker では稀・保守的に1小節扱い
  const ns = notesForContent(kind, content);
  return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : ctx.BPB;
}

// ②文脈系：この進行にメロ。section のコード進行を1本に連結（各コード子を**配置位置(拍)ぶん**オフセット）。
// #6 是正(2026-07-13)：position は拍（LaneCell=bar*BPB／compositeNotes・earChords も +position）＝**×BPB は誤り**
//   （非0位置にコードを置くと gen/fit へ4倍ずれた和声文脈が渡っていた）。earChords と同じ +position に統一。
export function sectionChords(ctx: SectionCtx): { root?: number; quality?: string; start?: number; dur?: number }[] {
  const chordLane = ctx.LANES.find((l) => l.key === "chord")!;
  const out: { root?: number; quality?: string; start?: number; dur?: number }[] = [];
  for (const c of laneChildren(ctx, chordLane)) {
    const content = c.node.neta.content as { chords?: typeof out } | null;
    const offset = c.position ?? 0; // 拍（#6・×BPB を外した）
    for (const ch of content?.chords ?? []) out.push({ ...ch, start: (ch.start ?? 0) + offset });
  }
  return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

// ベースレーンの notes を1本に連結（sectionChords と同じ流儀＝子を小節位置ぶんオフセット）。
// メロ生成の対位入力（design「gen_melody×ベース結線」）。相対 bass はコードレーンに当てて実音化。
export function sectionBass(ctx: SectionCtx): Note[] {
  const bassLane = ctx.LANES.find((l) => l.key === "bass")!;
  const chords = sectionChords(ctx).map((c) => ({ root: c.root ?? 0, quality: c.quality ?? "", start: c.start ?? 0, dur: c.dur ?? ctx.BPB }));
  const out: Note[] = [];
  for (const c of laneChildren(ctx, bassLane)) {
    const offset = c.position ?? 0; // 拍（#6・sectionChords と同じく ×BPB を外した）
    for (const n of notesForContent("bass", c.node.neta.content, { key: ctx.keyPc, chords })) out.push({ ...n, start: n.start + offset });
  }
  return out.sort((a, b) => a.start - b.start);
}

// リズム(ドラム)レーンの子を1本の step グリッドへマージ（design「gen_melody×ドラム結線」）。
// content 形＝genDrums 出力 {rhythm:{steps,beatsPerStep,lanes}}。子ごとに hits を配置位置(拍÷beatsPerStep)ぶん
// オフセットし、レーン(midi|name)単位で合算（位置＝拍解釈は compositeNotes と同じ）。beatsPerStep が先頭子と
// 異なる子・不正 content は捨てる（防御）。レーンが空なら null＝gen_melody へ渡さない＝従来。
export function sectionDrums(ctx: SectionCtx): { rhythm: { steps: number; bars: number; beatsPerStep: number; lanes: { name?: string; midi?: number; hits: number[]; vel?: number }[] } } | null {
  type DrumRhythm = { steps?: number; bars?: number; beatsPerStep?: number; lanes?: { name?: string; midi?: number; hits?: number[]; vel?: number }[] };
  const lane = ctx.LANES.find((l) => l.key === "rhythm");
  if (!lane) return null;
  let bps = 0;
  let endStep = 0;
  const merged = new Map<string, { name?: string; midi?: number; hits: Set<number>; vel?: number }>();
  for (const c of laneChildren(ctx, lane)) {
    const r = (c.node.neta.content as { rhythm?: DrumRhythm } | null)?.rhythm;
    if (!r || !Array.isArray(r.lanes) || !r.steps || !r.beatsPerStep || r.steps <= 0 || r.beatsPerStep <= 0) continue;
    if (!bps) bps = r.beatsPerStep;
    if (Math.abs(r.beatsPerStep - bps) > 1e-9) continue; // グリッド解像度が混在＝合算不能な子は捨てる
    const off = Math.round((c.position ?? 0) / bps); // 配置位置(拍)→step オフセット
    for (const l of r.lanes) {
      const key = `${l.midi ?? ""}|${l.name ?? ""}`;
      const m = merged.get(key) ?? merged.set(key, { name: l.name, midi: l.midi, hits: new Set(), vel: l.vel }).get(key)!;
      for (const h of l.hits ?? []) if (Number.isInteger(h) && h >= 0 && h < r.steps) m.hits.add(off + h);
    }
    endStep = Math.max(endStep, off + r.steps);
  }
  if (!bps || !endStep || !merged.size) return null;
  return {
    rhythm: {
      steps: endStep,
      bars: Math.max(1, Math.round((endStep * bps) / ctx.BPB)),
      beatsPerStep: bps,
      lanes: [...merged.values()].map((l) => ({ name: l.name, midi: l.midi, hits: [...l.hits].sort((a, b) => a - b), vel: l.vel })),
    },
  };
}

// 骨格の耳確認（オーナーFB 2026-07-11）用のコード列＝compositeNotes と同じ key-aware 移調でセクション実調へ。
// コードは骨格の座標系に載せるため、各コード子を配置位置(拍)ぶんオフセット（骨格位置相対化は skelEar 側で行う）。
export function earChords(ctx: SectionCtx): ChordEntry[] {
  const chordLane = ctx.LANES.find((l) => l.key === "chord");
  if (!chordLane) return [];
  return laneChildren(ctx, chordLane).flatMap((c) => {
    const shift = harmonyPlacementShift(ctx.keyPc, ctx.mode, c.node.neta.mode, c.node.neta.key ?? 0);
    return chordsOf(c.node.neta.content).map((ch) => ({
      ...ch,
      root: (((ch.root + shift) % 12) + 12) % 12,
      start: ch.start + c.position,
    }));
  });
}

// 骨格レーンの実音ミックス（メロ実音＋実効ベース+1oct）。骨格自体はメロ配置規則で移調。
// **合成(composite)と MIDI 書き出しには入らない＝再生の耳確認のみ**（従来どおり）。
export function skelEar(ctx: SectionCtx): Note[] {
  const lane = ctx.LANES.find((l) => l.key === "skeleton");
  if (!lane) return [];
  const chords = earChords(ctx);
  return laneChildren(ctx, lane).flatMap((c) => {
    const content = c.node.neta.content;
    if (!isSkeleton(content)) return [];
    const shift = melodyPlacementShift(ctx.keyPc, ctx.mode, c.node.neta.mode, c.node.neta.key ?? 0);
    const rel = chords.map((ch) => ({ ...ch, start: ch.start - c.position })); // 骨格位置相対（導出ベースの座標系を揃える）
    return skeletonEarNotes(content, { chords: rel, shift, beatsPerBar: ctx.BPB }).map((n) => ({ ...n, start: n.start + c.position }));
  });
}
