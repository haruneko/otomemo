import { describe, it, expect } from "vitest";
import { chordChips, applyChordTrial, adoptedChordContent, chordName, type ChordTrial } from "../src/deskChords";
import { lanesForKind, type Child } from "../src/components/sectionLanes";
import { chordsOf, harmonyPlacementShift, type ChordEntry } from "../src/music";
import { analyzeCounterpoint, effectiveBassAt, effectiveBassSegments } from "../src/skeletonEdit";

// deskChords（design #20 S6 D3）＝②コード前景の純ロジック。
//   ① chordChips が earChordsRel（sctx.earChords→start−skelPosition）と deepEqual・同順（バイト等価）
//   ② applyChordTrial：G→G/B で cp の interval が 6度→4度（seams モックの具体例）＝③接点バッジが試着に追従
//   ③ 採用まで在庫不変：applyChordTrial は元配列を破壊しない（試着はローカル override）
//   ④ 導出ベースが追従：effectiveBassSegments の当該区間 pitch が bass pc に（G→G/B で 7→11）
//   ⑤ adoptedChordContent：実調 sub → 素材調へ un-shift・他 chord/フィールドは温存
const SECTION_LANES = lanesForKind("section");

type NetaOver = Partial<{ mode: string | null; key: number | null }>;
function child(kind: string, position: number, content: unknown, over: NetaOver = {}, ord = 0): Child {
  return {
    position, ord,
    node: { neta: { id: `${kind}@${position}`, kind, title: null, text: null, content, key: null, mode: null, tempo: null, meter: null, bars: null, mood: null, tags: [], created: "", updated: "", ...over }, children: [] },
  } as unknown as Child;
}

// legacy 逐語コピー（sectionContext の earChords＝バイト等価の基準）。
function legacyEarChords(children: Child[], keyPc: number, mode: string | null, skelPosition: number): ChordEntry[] {
  const chordLane = SECTION_LANES.find((l) => l.key === "chord")!;
  const kinds = chordLane.kinds as readonly string[];
  const rowOf = (c: Child) => (c.ord === 1 ? 1 : 0);
  const laneChildren = children.filter((c) => kinds.includes(c.node.neta.kind) && (chordLane.row === undefined || rowOf(c) === chordLane.row));
  return laneChildren
    .flatMap((c) => {
      const shift = harmonyPlacementShift(keyPc, mode, c.node.neta.mode, c.node.neta.key ?? 0);
      return chordsOf(c.node.neta.content).map((ch) => ({ ...ch, root: (((ch.root + shift) % 12) + 12) % 12, start: ch.start + c.position }));
    })
    .map((ch) => ({ ...ch, start: ch.start - skelPosition }));
}

describe("chordChips（earChordsRel との バイト等価＋出所）", () => {
  const children: Child[] = [
    child("chord_progression", 0, { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }] }, { key: 0, mode: "major" }),
    child("chord_progression", 2, { chords: [{ root: 5, quality: "m", start: 0, dur: 4 }] }, { key: 0, mode: "major" }),
    child("melody", 0, { notes: [{ pitch: 60, start: 0, dur: 1 }] }), // レーン外ノイズ耐性
  ];
  it("entry 列が legacy earChords→(start−skelPosition) と deepEqual・同順（keyPc=2で移調が効いても）", () => {
    const keyPc = 2, mode = "major", skelPosition = 3;
    const chips = chordChips(children, SECTION_LANES, keyPc, mode, skelPosition);
    expect(chips.map((c) => c.entry)).toEqual(legacyEarChords(children, keyPc, mode, skelPosition));
  });
  it("出所（netaId/netaChordIndex/shift）を辿れる", () => {
    const chips = chordChips(children, SECTION_LANES, 0, "major", 0);
    expect(chips.map((c) => c.netaId)).toEqual(["chord_progression@0", "chord_progression@0", "chord_progression@2"]);
    expect(chips.map((c) => c.netaChordIndex)).toEqual([0, 1, 0]);
    expect(chips.every((c) => c.shift === 0)).toBe(true); // key=0/major→section key=0/major＝shift0
  });
});

describe("applyChordTrial（G→G/B で③接点バッジが 6度→4度に追従）", () => {
  // C major・G コード上の E（メロ pitch 64）。導出ベース G(root7→pc47帯) との音程＝6度。G/B(bass11) にすると 4度。
  const chords: ChordEntry[] = [{ root: 7, quality: "", start: 0, dur: 4 }];
  const tones = [{ start: 0, pitch: 64 }]; // E
  const cpLabel = (chs: ChordEntry[]) =>
    analyzeCounterpoint(tones, (b) => effectiveBassAt(b, [], chs, [], 4))[0]!.interval!.label;
  it("試着前＝6度・G/B 試着後＝4度", () => {
    expect(cpLabel(chords)).toBe("6度");
    const trial: ChordTrial = { chordIndex: 0, sub: { root: 7, quality: "", bass: 11 } };
    expect(cpLabel(applyChordTrial(chords, trial))).toBe("4度");
  });
  it("在庫不変：applyChordTrial は元配列/要素を破壊しない（試着はローカル override）", () => {
    const trial: ChordTrial = { chordIndex: 0, sub: { root: 7, quality: "", bass: 11 } };
    const before = JSON.parse(JSON.stringify(chords));
    applyChordTrial(chords, trial);
    expect(chords).toEqual(before); // 破壊なし
    expect(applyChordTrial(chords, null)).toBe(chords); // trial 無し＝同一参照
  });
});

describe("導出ベースが試着に追従（effectiveBassSegments）", () => {
  const chords: ChordEntry[] = [{ root: 7, quality: "", start: 0, dur: 4 }];
  it("G→G/B で当該区間 pitch が root(7帯)→bass(11帯) に（36+pc）", () => {
    const seg0 = effectiveBassSegments([], chords, [], 4)[0]!;
    expect(((seg0.pitch % 12) + 12) % 12).toBe(7); // G
    const trialChords = applyChordTrial(chords, { chordIndex: 0, sub: { root: 7, quality: "", bass: 11 } });
    const seg1 = effectiveBassSegments([], trialChords, [], 4)[0]!;
    expect(((seg1.pitch % 12) + 12) % 12).toBe(11); // B（下声が動く）
  });
});

describe("adoptedChordContent（実調→素材調 un-shift・他 chord 温存）", () => {
  it("shift0＝そのまま該当 index を差替・他は不変", () => {
    const content = { chords: [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }], meta: "keep" };
    const out = adoptedChordContent(content, 1, { root: 2, quality: "m" }, 0);
    expect(out.meta).toBe("keep"); // 他フィールド温存
    expect(out.chords).toEqual([{ root: 0, quality: "", start: 0, dur: 4 }, { root: 2, quality: "m", start: 4, dur: 4 }]);
  });
  it("shift=2（実調 D）で採用＝root/bass を −shift して素材調へ戻す", () => {
    const content = { chords: [{ root: 2, quality: "", start: 0, dur: 4 }] }; // 素材=D
    // 実調で G/B（root7,bass11）を採用・shift=2 → 素材は root5,bass9。
    const out = adoptedChordContent(content, 0, { root: 7, quality: "", bass: 11 }, 2);
    expect(out.chords).toEqual([{ root: 5, quality: "", start: 0, dur: 4, bass: 9 }]);
  });
});

describe("chordName", () => {
  it("root+quality・分数は /bass", () => {
    expect(chordName({ root: 0, quality: "" })).toBe("C");
    expect(chordName({ root: 9, quality: "m" })).toBe("Am");
    expect(chordName({ root: 7, quality: "", bass: 11 })).toBe("G/B");
    expect(chordName({ root: 7, quality: "", bass: 7 })).toBe("G"); // bass==root は分数表記しない
  });
});
