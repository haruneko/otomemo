import { describe, it, expect } from "vitest";
import {
  type SectionCtx,
  inLane,
  rowOf,
  laneChildren,
  childDur,
  contentDur,
  sectionChords,
  sectionBass,
  sectionDrums,
  earChords,
  skelEar,
} from "../src/sectionContext";
import { lanesForKind, type Child, type Lane } from "../src/components/sectionLanes";
import { notesForContent, harmonyPlacementShift, melodyPlacementShift, chordsOf, isSkeleton, type Note, type ChordEntry } from "../src/music";
import { skeletonEarNotes } from "../src/skeletonEdit";

// D0（design #20 S6）：SectionEditor 内クロージャの純関数抽出のテスト。
// ①各関数の性質（連結オフセット/rowOf/移調/beatsPerStep混在防御/骨格2段座標系）
// ②抽出前後のバイト等価（legacy 逐語コピーと純関数を同一 children で deepEqual 突合）。

const SECTION_LANES = lanesForKind("section");

// --- フィクスチャ組み立て（Child = { position, ord, node:{ neta, children } }） ---
type NetaOver = Partial<{ mode: string | null; key: number | null; title: string | null }>;
function neta(id: string, kind: string, content: unknown, over: NetaOver = {}) {
  return {
    id, kind, title: null, text: id, content,
    key: null, mode: null, tempo: null, meter: null, bars: null, mood: null,
    tags: [] as string[], created: "", updated: "", ...over,
  };
}
function child(kind: string, position: number, content: unknown, over: NetaOver = {}, ord = 0): Child {
  return { position, ord, node: { neta: neta(`${kind}@${position}`, kind, content, over), children: [] } } as unknown as Child;
}

// --- legacy 逐語コピー（抽出前の SectionEditor クロージャ・バイト等価の基準） ---
function legacy(children: Child[], LANES: readonly Lane[], keyPc: number, mode: string | null | undefined, BPB: number) {
  const inLaneL = (lane: Lane, kind: string) => (lane.kinds as readonly string[]).includes(kind);
  const rowOfL = (c: Child) => (c.ord === 1 ? 1 : 0);
  const laneChildrenL = (lane: Lane) =>
    children.filter((c) => inLaneL(lane, c.node.neta.kind) && (lane.row === undefined || rowOfL(c) === lane.row));
  function childDurL(c: Child): number {
    const k = c.node.neta.kind;
    if (k === "section" || k === "song") {
      const kids = c.node.children ?? [];
      return kids.length ? Math.max(...kids.map((kc) => kc.position + childDurL(kc as Child))) : BPB;
    }
    const ns = notesForContent(k, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  }
  const contentDurL = (kind: string, content: unknown): number => {
    if (kind === "section" || kind === "song") return BPB;
    const ns = notesForContent(kind, content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  };
  function sectionChordsL() {
    const chordLane = LANES.find((l) => l.key === "chord")!;
    const out: { root?: number; quality?: string; start?: number; dur?: number }[] = [];
    for (const c of laneChildrenL(chordLane)) {
      const content = c.node.neta.content as { chords?: typeof out } | null;
      const offset = (c.position ?? 0) * BPB;
      for (const ch of content?.chords ?? []) out.push({ ...ch, start: (ch.start ?? 0) + offset });
    }
    return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  }
  function sectionBassL(): Note[] {
    const bassLane = LANES.find((l) => l.key === "bass")!;
    const chords = sectionChordsL().map((c) => ({ root: c.root ?? 0, quality: c.quality ?? "", start: c.start ?? 0, dur: c.dur ?? BPB }));
    const out: Note[] = [];
    for (const c of laneChildrenL(bassLane)) {
      const offset = (c.position ?? 0) * BPB;
      for (const n of notesForContent("bass", c.node.neta.content, { key: keyPc, chords })) out.push({ ...n, start: n.start + offset });
    }
    return out.sort((a, b) => a.start - b.start);
  }
  function sectionDrumsL() {
    type DrumRhythm = { steps?: number; bars?: number; beatsPerStep?: number; lanes?: { name?: string; midi?: number; hits?: number[]; vel?: number }[] };
    const lane = LANES.find((l) => l.key === "rhythm");
    if (!lane) return null;
    let bps = 0;
    let endStep = 0;
    const merged = new Map<string, { name?: string; midi?: number; hits: Set<number>; vel?: number }>();
    for (const c of laneChildrenL(lane)) {
      const r = (c.node.neta.content as { rhythm?: DrumRhythm } | null)?.rhythm;
      if (!r || !Array.isArray(r.lanes) || !r.steps || !r.beatsPerStep || r.steps <= 0 || r.beatsPerStep <= 0) continue;
      if (!bps) bps = r.beatsPerStep;
      if (Math.abs(r.beatsPerStep - bps) > 1e-9) continue;
      const off = Math.round((c.position ?? 0) / bps);
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
        bars: Math.max(1, Math.round((endStep * bps) / BPB)),
        beatsPerStep: bps,
        lanes: [...merged.values()].map((l) => ({ name: l.name, midi: l.midi, hits: [...l.hits].sort((a, b) => a - b), vel: l.vel })),
      },
    };
  }
  function earChordsL(): ChordEntry[] {
    const chordLane = LANES.find((l) => l.key === "chord");
    if (!chordLane) return [];
    return laneChildrenL(chordLane).flatMap((c) => {
      const shift = harmonyPlacementShift(keyPc, mode, c.node.neta.mode, c.node.neta.key ?? 0);
      return chordsOf(c.node.neta.content).map((ch) => ({
        ...ch,
        root: (((ch.root + shift) % 12) + 12) % 12,
        start: ch.start + c.position,
      }));
    });
  }
  function skelEarL(): Note[] {
    const lane = LANES.find((l) => l.key === "skeleton");
    if (!lane) return [];
    const chords = earChordsL();
    return laneChildrenL(lane).flatMap((c) => {
      const content = c.node.neta.content;
      if (!isSkeleton(content)) return [];
      const shift = melodyPlacementShift(keyPc, mode, c.node.neta.mode, c.node.neta.key ?? 0);
      const rel = chords.map((ch) => ({ ...ch, start: ch.start - c.position }));
      return skeletonEarNotes(content, { chords: rel, shift, beatsPerBar: BPB }).map((n) => ({ ...n, start: n.start + c.position }));
    });
  }
  return { laneChildrenL, childDurL, contentDurL, sectionChordsL, sectionBassL, sectionDrumsL, earChordsL, skelEarL };
}

// ---------------- 単体テスト（既存コメントが述べる性質） ----------------

describe("inLane / rowOf", () => {
  const chordLane = SECTION_LANES.find((l) => l.key === "chord")!;
  it("inLane＝レーンの kinds 包含", () => {
    expect(inLane(chordLane, "chord")).toBe(true);
    expect(inLane(chordLane, "chord_progression")).toBe(true);
    expect(inLane(chordLane, "melody")).toBe(false);
  });
  it("rowOf＝ord 1 のみ2行目・他は1行目", () => {
    expect(rowOf(child("chord_pattern", 0, null, {}, 1))).toBe(1);
    expect(rowOf(child("chord_pattern", 0, null, {}, 0))).toBe(0);
    expect(rowOf(child("chord_pattern", 0, null, {}, 2))).toBe(0); // 1以外は0
  });
});

describe("laneChildren（row 絞り込み）", () => {
  it("row 付きレーンは rowOf==row のみ拾う", () => {
    const cp0 = child("chord_pattern", 0, null, {}, 0);
    const cp1 = child("chord_pattern", 0, null, {}, 1);
    const ctx: SectionCtx = { children: [cp0, cp1], LANES: SECTION_LANES, keyPc: 0, mode: "major", BPB: 4 };
    const lane0 = SECTION_LANES.find((l) => l.key === "chord_pattern")!; // row 0
    const lane1 = SECTION_LANES.find((l) => l.key === "chord_pattern2")!; // row 1
    expect(laneChildren(ctx, lane0)).toEqual([cp0]);
    expect(laneChildren(ctx, lane1)).toEqual([cp1]);
  });
});

describe("childDur / contentDur", () => {
  it("leaf＝実音の末尾・空は BPB", () => {
    const ctx: SectionCtx = { children: [], LANES: SECTION_LANES, keyPc: 0, mode: "major", BPB: 4 };
    const mel = child("melody", 0, { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 2, dur: 2 }] });
    expect(childDur(ctx, mel)).toBe(4); // 2+2
    expect(childDur(ctx, child("melody", 0, { notes: [] }))).toBe(4); // 空→BPB
    expect(contentDur(ctx, "melody", { notes: [{ pitch: 60, start: 0, dur: 3 }] })).toBe(3);
    expect(contentDur(ctx, "section", null)).toBe(4); // ネストは保守的に1小節
  });
});

describe("sectionChords（連結オフセット・position*BPB）", () => {
  it("各コード子を position*BPB ぶんオフセットし start 昇順で連結", () => {
    const BPB = 4;
    const c0 = child("chord_progression", 0, { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] });
    const c1 = child("chord_progression", 2, { chords: [{ root: 5, quality: "", start: 0, dur: 4 }] });
    const ctx: SectionCtx = { children: [c0, c1], LANES: SECTION_LANES, keyPc: 0, mode: "major", BPB };
    const out = sectionChords(ctx);
    // c1 offset = 2*4 = 8。start 昇順：0, 4, 8。
    expect(out.map((c) => c.start)).toEqual([0, 4, 8]);
    expect(out.map((c) => c.root)).toEqual([0, 7, 5]);
  });
});

describe("earChords（harmonyPlacementShift 移調＋位置は素の position）", () => {
  it("keyPc/mode 差で root が移調され start は +position", () => {
    // section=D major(keyPc=2), chord content key=0 major → shift = +2。
    const ch = child("chord_progression", 3, { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }] }, { key: 0, mode: "major" });
    const ctx: SectionCtx = { children: [ch], LANES: SECTION_LANES, keyPc: 2, mode: "major", BPB: 4 };
    const shift = harmonyPlacementShift(2, "major", "major", 0);
    const out = earChords(ctx);
    expect(out.map((c) => c.root)).toEqual([(0 + shift + 12) % 12, (5 + shift + 12) % 12]);
    expect(out.map((c) => c.start)).toEqual([0 + 3, 4 + 3]); // earChords は +c.position（*BPB でない）
  });
});

describe("sectionDrums（beatsPerStep 混在の防御＝合算不能な子は捨てる）", () => {
  it("先頭子と異なる beatsPerStep の子は捨て、同一解像度のみ合算", () => {
    const d0 = child("rhythm", 0, { rhythm: { steps: 8, beatsPerStep: 0.5, lanes: [{ midi: 36, hits: [0, 4] }] } });
    const dBad = child("rhythm", 4, { rhythm: { steps: 4, beatsPerStep: 1, lanes: [{ midi: 38, hits: [0, 1] }] } }); // 解像度違い→捨て
    const ctx: SectionCtx = { children: [d0, dBad], LANES: SECTION_LANES, keyPc: 0, mode: "major", BPB: 4 };
    const out = sectionDrums(ctx)!;
    expect(out.rhythm.beatsPerStep).toBe(0.5);
    expect(out.rhythm.steps).toBe(8); // dBad は無視＝ endStep は d0 のみ
    expect(out.rhythm.lanes.map((l) => l.midi)).toEqual([36]); // 38(捨てた子)は出ない
    expect(out.rhythm.lanes[0]!.hits).toEqual([0, 4]);
  });
  it("リズム子なし＝null", () => {
    const ctx: SectionCtx = { children: [], LANES: SECTION_LANES, keyPc: 0, mode: "major", BPB: 4 };
    expect(sectionDrums(ctx)).toBeNull();
  });
});

describe("skelEar（骨格位置相対＋2段座標系）", () => {
  it("コードを骨格位置相対へ→ skeletonEarNotes → 出力を +position で戻す", () => {
    const BPB = 4;
    const position = 4;
    const chord = child("chord_progression", 0, { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] }, { key: 0, mode: "major" });
    const skelContent = { bars: 2, tones: [{ start: 0, pitch: 0 }, { start: 4, pitch: 7 }], bass: [{ start: 0, pitch: 0 }] };
    const skel = child("skeleton", position, skelContent, { key: 0, mode: "major" });
    const ctx: SectionCtx = { children: [chord, skel], LANES: SECTION_LANES, keyPc: 0, mode: "major", BPB };
    const out = skelEar(ctx);
    expect(out.length).toBeGreaterThan(0);
    // すべての音符が骨格の配置位置 position 以降にある（+c.position で戻したから）。
    expect(out.every((n) => n.start >= position - 1e-9)).toBe(true);
    // 座標系の等価：手で「rel 化→skeletonEarNotes→+position」を再現した列と一致。
    const earCh = earChords(ctx);
    const rel = earCh.map((c) => ({ ...c, start: c.start - position }));
    const shift = melodyPlacementShift(0, "major", "major", 0);
    const expected = skeletonEarNotes(skelContent, { chords: rel, shift, beatsPerBar: BPB }).map((n) => ({ ...n, start: n.start + position }));
    expect(out).toEqual(expected);
  });
});

// ---------------- バイト等価の実証（抽出前 legacy と純関数の deepEqual 突合） ----------------

describe("バイト等価：抽出前後で出力が deepEqual", () => {
  const BPB = 4;
  const keyPc = 2; // D（移調が効くよう非ゼロ）
  const mode = "major";
  // 代表フィクスチャ：コード2子（別位置・非ゼロkey）＋ベース＋ドラム2子（解像度混在）＋骨格。
  const children: Child[] = [
    child("chord_progression", 0, { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "7", start: 4, dur: 4 }] }, { key: 0, mode: "major" }),
    child("chord_progression", 2, { chords: [{ root: 5, quality: "m", start: 0, dur: 4 }] }, { key: 0, mode: "major" }),
    child("bass", 0, { notes: [{ pitch: 36, start: 0, dur: 2 }, { pitch: 43, start: 2, dur: 2 }] }),
    child("bass", 4, { notes: [{ pitch: 38, start: 0, dur: 4 }] }),
    child("rhythm", 0, { rhythm: { steps: 8, beatsPerStep: 0.5, lanes: [{ midi: 36, hits: [0, 4], vel: 100 }, { midi: 42, hits: [0, 2, 4, 6] }] } }),
    child("rhythm", 4, { rhythm: { steps: 4, beatsPerStep: 1, lanes: [{ midi: 38, hits: [0, 2] }] } }), // 解像度違い→捨て
    child("skeleton", 0, { bars: 2, tones: [{ start: 0, pitch: 0 }, { start: 4, pitch: 4 }], bass: [{ start: 0, pitch: 0 }] }, { key: 0, mode: "major" }),
    child("melody", 0, { notes: [{ pitch: 60, start: 0, dur: 1 }] }), // レーン外ノイズ耐性
  ];
  const ctx: SectionCtx = { children, LANES: SECTION_LANES, keyPc, mode, BPB };
  const L = legacy(children, SECTION_LANES, keyPc, mode, BPB);

  it("sectionChords 一致", () => expect(sectionChords(ctx)).toEqual(L.sectionChordsL()));
  it("sectionBass 一致", () => expect(sectionBass(ctx)).toEqual(L.sectionBassL()));
  it("sectionDrums 一致", () => expect(sectionDrums(ctx)).toEqual(L.sectionDrumsL()));
  it("earChords 一致", () => expect(earChords(ctx)).toEqual(L.earChordsL()));
  it("skelEar 一致", () => expect(skelEar(ctx)).toEqual(L.skelEarL()));
  it("childDur 一致（各子）", () => {
    for (const c of children) expect(childDur(ctx, c)).toBe(L.childDurL(c));
  });
  it("laneChildren 一致（全レーン）", () => {
    for (const lane of SECTION_LANES) expect(laneChildren(ctx, lane)).toEqual(L.laneChildrenL(lane));
  });
});
