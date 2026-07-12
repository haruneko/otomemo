import { describe, it, expect } from "vitest";
import { clickNotes, foldLensNotes, realLensNotes, LENS_FOLD, LENS_REAL } from "../src/deskLens";
import type { Note } from "../src/music";

// テスト用の2声 skelEar（skeletonEarNotes 相当＝part melody/bass のみ）を手で組む。
const skelEar: Note[] = [
  { pitch: 60, start: 0, dur: 1, program: 48, part: "melody" },
  { pitch: 64, start: 2, dur: 1, program: 48, part: "melody" },
  { pitch: 48, start: 0, dur: 2, program: 42, part: "bass" },
  { pitch: 47, start: 2, dur: 2, program: 42, part: "bass" },
];
// composite 相当（編成合成＝chord/drums 等いろいろ混じる）。
const composite: Note[] = [
  { pitch: 72, start: 0, dur: 1, program: 0, part: "melody" },
  { pitch: 55, start: 0, dur: 1, program: 33, part: "bass" },
  { pitch: 67, start: 0, dur: 2, program: 4, part: "chord" },
  { pitch: 36, start: 0, dur: 0.25, drum: true, part: "drums" },
];

describe("clickNotes", () => {
  it("本数＝bars*bpb", () => {
    expect(clickNotes(4, 4)).toHaveLength(16);
    expect(clickNotes(2, 3)).toHaveLength(6);
  });
  it("小節頭だけ vel が高い（アクセント）", () => {
    const bars = 3, bpb = 4;
    const cs = clickNotes(bars, bpb);
    for (let i = 0; i < cs.length; i++) {
      const isDown = i % bpb === 0;
      const vel = cs[i]!.vel!;
      if (isDown) {
        // 小節頭は同小節内の弱拍より高い
        for (let j = 1; j < bpb; j++) expect(vel).toBeGreaterThan(cs[i + j]!.vel!);
      }
    }
  });
  it("1拍刻みで start が並ぶ", () => {
    const cs = clickNotes(2, 4);
    expect(cs.map((c) => c.start)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("全音 lens:'fold'・drum:true・part:'drums'", () => {
    for (const c of clickNotes(3, 4)) {
      expect(c.lens).toBe(LENS_FOLD);
      expect(c.drum).toBe(true);
      expect(c.part).toBe("drums");
    }
  });
});

describe("foldLensNotes", () => {
  const bars = 2, bpb = 4;
  const out = foldLensNotes(skelEar, bars, bpb);
  it("出力が全て lens:'fold'", () => {
    for (const n of out) expect(n.lens).toBe(LENS_FOLD);
  });
  it("part は {melody,bass,drums} のみ（chord 楽器が混ざらない）", () => {
    const parts = new Set(out.map((n) => n.part));
    expect(parts).toEqual(new Set(["melody", "bass", "drums"]));
    expect(parts.has("chord" as never)).toBe(false);
  });
  it("click が bars*bpb 本含まれる", () => {
    const clicks = out.filter((n) => n.drum === true);
    expect(clicks).toHaveLength(bars * bpb);
  });
  it("skelEar の音数＋click 数＝総数", () => {
    expect(out).toHaveLength(skelEar.length + bars * bpb);
  });
  it("元の skelEar を破壊しない（lens undefined のまま）", () => {
    for (const n of skelEar) expect((n as { lens?: string }).lens).toBeUndefined();
  });
});

describe("realLensNotes", () => {
  const out = realLensNotes(composite, skelEar);
  it("全て lens:'real'", () => {
    for (const n of out) expect(n.lens).toBe(LENS_REAL);
  });
  it("composite+skelEar の音数一致", () => {
    expect(out).toHaveLength(composite.length + skelEar.length);
  });
  it("入力配列を破壊しない（元の lens が undefined のまま）", () => {
    for (const n of composite) expect((n as { lens?: string }).lens).toBeUndefined();
    for (const n of skelEar) expect((n as { lens?: string }).lens).toBeUndefined();
  });
});
