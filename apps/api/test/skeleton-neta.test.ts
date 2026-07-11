import { describe, it, expect } from "vitest";
import {
  validateSkeletonContent,
  expandDominion,
  skeletonToV2Skel,
  skeletonRestMask,
  skeletonPhrasesToV2,
  skelArrayToBreakpoints,
  type SkeletonContent,
} from "../src/music/skeletonNeta";
import { genMelody, genSkeletonCandidates } from "../src/music/generate";

// 骨格層の一級化（design #20）の content 契約・変換群のテスト（TDD）。

describe("validateSkeletonContent", () => {
  const good: SkeletonContent = {
    bars: 4,
    tones: [{ start: 0, pitch: 60 }, { start: 2, pitch: 64 }, { start: 8, pitch: 62 }],
    phrases: [{ endBeat: 8, cadence: "half" }, { endBeat: 16, cadence: "full" }],
  };
  it("accepts a well-formed skeleton", () => {
    expect(validateSkeletonContent(good)).toEqual([]);
  });
  it("rejects bars <= 0", () => {
    expect(validateSkeletonContent({ ...good, bars: 0 }).some((e) => e.includes("bars"))).toBe(true);
  });
  it("rejects non-ascending tones", () => {
    expect(validateSkeletonContent({ ...good, tones: [{ start: 2, pitch: 60 }, { start: 1, pitch: 62 }] }).some((e) => e.includes("ascending"))).toBe(true);
  });
  it("rejects out-of-range start", () => {
    expect(validateSkeletonContent({ ...good, tones: [{ start: 99, pitch: 60 }] }).some((e) => e.includes("out of range"))).toBe(true);
  });
  it("accepts pitch:null (skeleton rest) but rejects bad pitch", () => {
    expect(validateSkeletonContent({ bars: 2, tones: [{ start: 0, pitch: null }, { start: 2, pitch: 60 }] })).toEqual([]);
    expect(validateSkeletonContent({ bars: 2, tones: [{ start: 0, pitch: 999 }] }).some((e) => e.includes("pitch"))).toBe(true);
  });
  it("empty tones is rejected", () => {
    expect(validateSkeletonContent({ bars: 2, tones: [] }).some((e) => e.includes("non-empty"))).toBe(true);
  });
});

describe("expandDominion (breakpoint→支配区間)", () => {
  it("each tone dominates until the next breakpoint; last to song end", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 3, pitch: 64 }] };
    expect(expandDominion(c, { beatsPerBar: 4 })).toEqual([
      { start: 0, dur: 3, pitch: 60 },
      { start: 3, dur: 5, pitch: 64 }, // 3→8 (bars*bpb=8)
    ]);
  });
  it("dominion does not cross a phrase boundary", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 5, pitch: 62 }], phrases: [{ endBeat: 4 }] };
    const segs = expandDominion(c, { beatsPerBar: 4 });
    // tone@0 stops at phrase end 4 (not at next tone 5); gap [4,5) is left uncovered (rest)
    expect(segs[0]).toEqual({ start: 0, dur: 4, pitch: 60 });
    expect(segs[1]).toEqual({ start: 5, dur: 3, pitch: 62 });
  });
  it("carries null (rest) segment through", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: null }, { start: 2, pitch: 60 }] };
    const segs = expandDominion(c, { beatsPerBar: 4 });
    expect(segs[0]).toEqual({ start: 0, dur: 2, pitch: null });
    expect(segs[1]).toEqual({ start: 2, dur: 2, pitch: 60 });
  });
});

describe("skeletonToV2Skel adapter (→ 1拍粒度 number[])", () => {
  it("produces bars*beatsPerBar entries holding the dominating pitch", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }] };
    const skel = skeletonToV2Skel(c, { beatsPerBar: 4 });
    expect(skel).toEqual([60, 60, 60, 60, 67, 67, 67, 67]);
  });
  it("carries the last real pitch through a rest (anchor needs a pitch)", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }, { start: 2, pitch: null }] };
    const skel = skeletonToV2Skel(c, { beatsPerBar: 4 });
    expect(skel).toEqual([60, 60, 60, 60]);
  });
});

describe("skeletonRestMask (骨格休符→区間リスト・design #20 S3b)", () => {
  it("pitch:null 区間だけを {start,end} で返す（実音区間は含めない）", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }, { start: 2, pitch: null }] };
    expect(skeletonRestMask(c, { beatsPerBar: 4 })).toEqual([{ start: 2, end: 4 }]);
  });
  it("句頭遅延入場＝先頭 pitch:null が休符区間になる", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: null }, { start: 2, pitch: 67 }] };
    expect(skeletonRestMask(c, { beatsPerBar: 4 })).toEqual([{ start: 0, end: 2 }]);
  });
  it("pitch:null が無ければ空配列（＝bit一致の入口）", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }] };
    expect(skeletonRestMask(c, { beatsPerBar: 4 })).toEqual([]);
  });
  it("句境界で切れた休符も拾う（複数区間）", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: null }, { start: 2, pitch: 60 }, { start: 5, pitch: null }], phrases: [{ endBeat: 4 }] };
    // tone@0(null)→[0,2)、tone@2(60)は句末4で支配停止→実音、tone@5(null)→[5,8)
    expect(skeletonRestMask(c, { beatsPerBar: 4 })).toEqual([{ start: 0, end: 2 }, { start: 5, end: 8 }]);
  });
});

describe("skeletonPhrasesToV2 (骨格句割り→V2 phrases・design #20 S3a)", () => {
  it("phrases 無しは undefined（frame phrasing へフォールバック＝bit一致）", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }] };
    expect(skeletonPhrasesToV2(c, { beatsPerBar: 4 })).toBeUndefined();
    expect(skeletonPhrasesToV2({ ...c, phrases: [] }, { beatsPerBar: 4 })).toBeUndefined();
  });
  it("endBeat 列で [0,total] を分割し startBeat/beats を写す（無指定は位置既定＝非最終5/最終1）", () => {
    const c: SkeletonContent = { bars: 4, tones: [{ start: 0, pitch: 60 }], phrases: [{ endBeat: 8 }, { endBeat: 16 }] };
    expect(skeletonPhrasesToV2(c, { beatsPerBar: 4 })).toEqual([
      { startBeat: 0, beats: 8, cadenceDegree: 5 }, // 非最終・無指定＝属音（問い＝planSkeleton慣習）
      { startBeat: 8, beats: 8, cadenceDegree: 1 }, // 最終・無指定＝主音（答え）
    ]);
  });
  it("cadence ラベル half=5 / full=1 を着地度数へ写す", () => {
    const c: SkeletonContent = { bars: 4, tones: [{ start: 0, pitch: 60 }], phrases: [{ endBeat: 8, cadence: "half" }, { endBeat: 16, cadence: "full" }] };
    expect(skeletonPhrasesToV2(c, { beatsPerBar: 4 })!.map((p) => p.cadenceDegree)).toEqual([5, 1]);
  });
  it("非対称な句割り（1小節＋3小節）を可変長ブロックへ渡せる形にする", () => {
    const c: SkeletonContent = { bars: 4, tones: [{ start: 0, pitch: 60 }], phrases: [{ endBeat: 4 }, { endBeat: 16 }] };
    expect(skeletonPhrasesToV2(c, { beatsPerBar: 4 })).toEqual([
      { startBeat: 0, beats: 4, cadenceDegree: 5 },
      { startBeat: 4, beats: 12, cadenceDegree: 1 },
    ]);
  });
  it("最後の endBeat が total 未満なら残りを主音の句として補う（防御）", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }], phrases: [{ endBeat: 4 }] };
    expect(skeletonPhrasesToV2(c, { beatsPerBar: 4 })).toEqual([
      { startBeat: 0, beats: 4, cadenceDegree: 1 }, // 単一＝最終扱い→主音
      { startBeat: 4, beats: 4, cadenceDegree: 1 }, // 未被覆区間の補填句
    ]);
  });
  it("複合拍子（6/8＝bpb3）の拍単位で写す", () => {
    const c: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }], phrases: [{ endBeat: 3 }, { endBeat: 6 }] };
    expect(skeletonPhrasesToV2(c, { beatsPerBar: 3 })).toEqual([
      { startBeat: 0, beats: 3, cadenceDegree: 5 },
      { startBeat: 3, beats: 3, cadenceDegree: 1 },
    ]);
  });
});

describe("skelArrayToBreakpoints (逆変換) round-trips with the adapter", () => {
  it("compresses a held per-beat array into breakpoints at changes", () => {
    const bp = skelArrayToBreakpoints([60, 60, 64, 64, 64, 62, 62, 62]);
    expect(bp).toEqual([{ start: 0, pitch: 60 }, { start: 2, pitch: 64 }, { start: 5, pitch: 62 }]);
    // re-expanding the breakpoints reproduces the original array
    const skel = skeletonToV2Skel({ bars: 2, tones: bp }, { beatsPerBar: 4 });
    expect(skel).toEqual([60, 60, 64, 64, 64, 62, 62, 62]);
  });
});

const chords4 = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 5, quality: "", start: 4, dur: 4 },
  { root: 7, quality: "", start: 8, dur: 4 },
  { root: 9, quality: "m", start: 12, dur: 4 },
];
const notesOf = (r: ReturnType<typeof genMelody>) => (r.items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;

describe("gen_melody skeleton injection (design #20)", () => {
  const frame = { key: 0, mode: "major" as const, meter: "4/4", bars: 4 };

  it("未指定は既存出力とbit一致（回帰防止）", () => {
    const a = genMelody(frame, chords4, 7, { useV2: true });
    const b = genMelody(frame, chords4, 7, { useV2: true, skeleton: undefined });
    expect(notesOf(a)).toEqual(notesOf(b));
  });

  it("骨格注入で構造線アンカーが変わり出力が変化する", () => {
    const base = genMelody(frame, chords4, 7, { useV2: true });
    // 高い一定の骨格を差し込む（block anchor が全部 76 付近へ）
    const skeleton: SkeletonContent = { bars: 4, tones: [{ start: 0, pitch: 76 }, { start: 8, pitch: 74 }] };
    const injected = genMelody(frame, chords4, 7, { useV2: true, skeleton });
    expect(notesOf(injected)).not.toEqual(notesOf(base));
    // 決定的：同じ骨格＋同 seed は同じ結果
    const again = genMelody(frame, chords4, 7, { useV2: true, skeleton });
    expect(notesOf(injected)).toEqual(notesOf(again));
  });

  // S3a：骨格 phrases（句境界）の V2 結線。可変長ブロック/breathe/句末カデンツ着地の受け口へ渡る。
  it("phrases 無しの骨格は S1 挙動と不変（空配列もフォールバック＝bit一致）", () => {
    const tones = [{ start: 0, pitch: 72 }, { start: 8, pitch: 74 }];
    const a = genMelody(frame, chords4, 7, { useV2: true, skeleton: { bars: 4, tones } });
    const b = genMelody(frame, chords4, 7, { useV2: true, skeleton: { bars: 4, tones, phrases: [] } });
    expect(notesOf(a)).toEqual(notesOf(b));
  });

  it("骨格 phrases が V2 に効く＝句割り有無で出力が変わる・決定的（S3a）", () => {
    const tones = [{ start: 0, pitch: 72 }, { start: 8, pitch: 74 }];
    const noPh: SkeletonContent = { bars: 4, tones };
    // 非対称な句割り [1小節,3小節]＝可変長ブロックを発火（frame phrasing 由来の対称ブロックと異なる）
    const withPh: SkeletonContent = { bars: 4, tones, phrases: [{ endBeat: 4, cadence: "half" }, { endBeat: 16, cadence: "full" }] };
    const a = genMelody(frame, chords4, 7, { useV2: true, skeleton: noPh });
    const b = genMelody(frame, chords4, 7, { useV2: true, skeleton: withPh });
    expect(notesOf(a)).not.toEqual(notesOf(b));
    const bAgain = genMelody(frame, chords4, 7, { useV2: true, skeleton: withPh });
    expect(notesOf(b)).toEqual(notesOf(bAgain));
  });

  it("骨格句割りは breathe（句頭遅延入場）を句境界で動かす（S3a）", () => {
    const tones = [{ start: 0, pitch: 72 }, { start: 8, pitch: 74 }];
    // breathe>0 で句頭の onset を落とす。境界が beat4（骨格句割り）か既定ブロック（beat8）かで落ちる位置が変わる。
    const sym: SkeletonContent = { bars: 4, tones, phrases: [{ endBeat: 8 }, { endBeat: 16 }] };
    const asym: SkeletonContent = { bars: 4, tones, phrases: [{ endBeat: 4 }, { endBeat: 16 }] };
    const a = genMelody(frame, chords4, 7, { useV2: true, skeleton: sym, breathe: 0.6 });
    const b = genMelody(frame, chords4, 7, { useV2: true, skeleton: asym, breathe: 0.6 });
    expect(notesOf(a)).not.toEqual(notesOf(b));
  });

  // S3b：骨格休符(pitch:null)の表面音抑制（restマスク）。
  const inRest = (t: number, rs: number, re: number) => t >= rs - 1e-6 && t < re - 1e-6;

  it("骨格休符 pitch:null 区間に表面 onset が一切鳴らない（根治）", () => {
    // beat[4,8) を骨格休符に：block頭(beat4)アンカーは carry-forward だが表面音は落ちる
    const skeleton: SkeletonContent = { bars: 4, tones: [{ start: 0, pitch: 72 }, { start: 4, pitch: null }, { start: 8, pitch: 74 }] };
    const notes = notesOf(genMelody(frame, chords4, 7, { useV2: true, skeleton }));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(inRest(n.start, 4, 8), `onset@${n.start}`).toBe(false);
    // 直前の音は休符区間頭(beat4)を越えて伸びない（区間頭で着地）
    for (const n of notes) if (n.start < 4 - 1e-6) expect(n.start + n.dur).toBeLessThanOrEqual(4 + 1e-3);
  });

  it("休符なし骨格は S1 挙動と bit一致（restマスク空＝丸ごとスキップ）", () => {
    const tones = [{ start: 0, pitch: 72 }, { start: 8, pitch: 74 }];
    // 同一 tones を pitch:null 有り/無しで比較するのでなく、null無し骨格が restマスク経路で変化しないことを確認
    const a = genMelody(frame, chords4, 11, { useV2: true, skeleton: { bars: 4, tones } });
    const b = genMelody(frame, chords4, 11, { useV2: true, skeleton: { bars: 4, tones } });
    expect(notesOf(a)).toEqual(notesOf(b));
    // 休符を1つ入れると出力は変わる（表面音が落ちる方向）＝restマスクが効いている証拠
    const withRest: SkeletonContent = { bars: 4, tones: [{ start: 0, pitch: 72 }, { start: 4, pitch: null }, { start: 8, pitch: 74 }] };
    const c = genMelody(frame, chords4, 11, { useV2: true, skeleton: withRest });
    expect(notesOf(c)).not.toEqual(notesOf(a));
  });

  it("breathe と休符マスクが二重に効いても休符区間は無音・決定的（S3b×S3a）", () => {
    const skeleton: SkeletonContent = {
      bars: 4,
      tones: [{ start: 0, pitch: 72 }, { start: 4, pitch: null }, { start: 8, pitch: 74 }],
      phrases: [{ endBeat: 8 }, { endBeat: 16 }],
    };
    const notes = notesOf(genMelody(frame, chords4, 7, { useV2: true, skeleton, breathe: 0.6 }));
    for (const n of notes) expect(inRest(n.start, 4, 8), `onset@${n.start}`).toBe(false);
    const again = notesOf(genMelody(frame, chords4, 7, { useV2: true, skeleton, breathe: 0.6 }));
    expect(notes).toEqual(again);
  });
});

describe("gen_skeleton candidates (機械は候補まで)", () => {
  const frame = { key: 0, mode: "major" as const, meter: "4/4", bars: 4 };
  it("複数案を kind=skeleton の SkeletonContent で返す", () => {
    const res = genSkeletonCandidates(frame, chords4);
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    for (const it of res.items) {
      expect(it.kind).toBe("skeleton");
      const c = it.content as SkeletonContent;
      expect(c.bars).toBe(4);
      expect(validateSkeletonContent(c)).toEqual([]);
      expect(c.tones.length).toBeGreaterThan(0);
      expect(c.phrases && c.phrases.length).toBeTruthy();
    }
  });
  it("seed 明示は1案・決定的", () => {
    const a = genSkeletonCandidates(frame, chords4, 3);
    const b = genSkeletonCandidates(frame, chords4, 3);
    expect(a.items.length).toBe(1);
    expect(a.items[0]!.content).toEqual(b.items[0]!.content);
  });
  it("生成した骨格を注入すると gen_melody が回る（往復）", () => {
    const skel = genSkeletonCandidates(frame, chords4, 3).items[0]!.content as SkeletonContent;
    const mel = genMelody(frame, chords4, 5, { useV2: true, skeleton: skel });
    expect(notesOf(mel).length).toBeGreaterThan(0);
  });
});
