import { describe, it, expect } from "vitest";
import { reflow, insertAt, removeAt, snapLength, wrapRows, degreeColor } from "../src/chordTimeline";
import type { ChordEntry } from "../src/music";

const C = (root: number, quality: string, start: number, dur: number, bass?: number): ChordEntry =>
  ({ root, quality, start, dur, ...(bass != null ? { bass } : {}) });
const total = (cs: ChordEntry[]) => cs.reduce((s, c) => s + c.dur, 0);

describe("chordTimeline.reflow", () => {
  it("recomputes start from cumulative dur（手入力/ズレを排除）", () => {
    const out = reflow([C(0, "", 99, 4), C(7, "", 5, 2), C(9, "m", 0, 4)]);
    expect(out.map((c) => c.start)).toEqual([0, 4, 6]);
    expect(out.map((c) => c.dur)).toEqual([4, 2, 4]);
  });
});

describe("chordTimeline.insertAt", () => {
  const base = [C(0, "", 0, 4), C(7, "7", 4, 2)];
  it("境界indexに直前コードを複製→reflow（総拍=旧+dur）", () => {
    const out = insertAt(base, 1); // boundary between 0 and 1 → duplicate base[0]
    expect(out).toEqual([
      C(0, "", 0, 4),
      C(0, "", 4, 4), // duplicate of base[0] (dur 4)
      C(7, "7", 8, 2),
    ]);
    expect(total(out)).toBe(total(base) + 4);
  });
  it("index===0/空は素のメジャー1小節（bpb）", () => {
    expect(insertAt([], 0, 3)).toEqual([C(0, "", 0, 3)]);
    const out = insertAt(base, 0, 4);
    expect(out[0]).toEqual(C(0, "", 0, 4));
    expect(total(out)).toBe(total(base) + 4);
  });
  it("複製は bass も引き継ぐ", () => {
    const withBass = [C(0, "", 0, 4, 4)];
    expect(insertAt(withBass, 1)).toEqual([C(0, "", 0, 4, 4), C(0, "", 4, 4, 4)]);
  });
  it("末尾追加（index===len）は最後を複製", () => {
    const out = insertAt(base, base.length);
    expect(out[2]).toEqual(C(7, "7", 6, 2));
    expect(total(out)).toBe(total(base) + 2);
  });
});

describe("chordTimeline.removeAt", () => {
  it("削除→reflow（総拍=旧−dur）", () => {
    const base = [C(0, "", 0, 4), C(7, "7", 4, 2), C(9, "m", 6, 4)];
    const out = removeAt(base, 1);
    expect(out).toEqual([C(0, "", 0, 4), C(9, "m", 4, 4)]);
    expect(total(out)).toBe(total(base) - 2);
  });
});

describe("chordTimeline.snapLength", () => {
  it("最近傍にスナップ（bpb=4: {1,1.5,2,3,4,6,8,12}）", () => {
    expect(snapLength(0.9, 4)).toBe(1);
    expect(snapLength(1.4, 4)).toBe(1.5); // dotted quarter
    expect(snapLength(2.4, 4)).toBe(2);
    expect(snapLength(3.2, 4)).toBe(3); // dotted half
    expect(snapLength(5.1, 4)).toBe(6); // dotted whole
    expect(snapLength(7.1, 4)).toBe(8);
    expect(snapLength(100, 4)).toBe(12); // clamp to max allowed
  });
  it("6/8（bpb=3）でも拍子基準でスナップ", () => {
    expect(snapLength(2.9, 3)).toBe(3); // 1小節=3拍
    expect(snapLength(4, 3)).toBe(4.5); // 付点1小節（等距離3/4.5でなく4は4.5寄り）
  });
});

describe("chordTimeline.wrapRows", () => {
  it("(a) Cメロ実データ＝2段・段境界(beat16)で割れない", () => {
    const cmelo = [
      C(10, "maj7", 0, 4), C(0, "7", 4, 4), C(2, "m7", 8, 6), C(0, "7", 14, 2),
      C(10, "maj7", 16, 4), C(0, "7", 20, 4), C(2, "m7", 24, 2), C(0, "7", 26, 2),
      C(10, "maj7", 28, 2), C(0, "7", 30, 2),
    ];
    const rows = wrapRows(cmelo, 4, 4);
    expect(rows.length).toBe(2);
    expect(rows[0]!.segments.length).toBe(4); // idx0..3 (0-16)
    expect(rows[1]!.segments.length).toBe(6); // idx4..9 (16-32)
    // どのセグメントも tail=false＝段跨ぎ分割ゼロ（idx3 は 14-16 でぴったり段末、idx4 は 16 から head）。
    for (const row of rows) for (const s of row.segments) expect(s.tail).toBe(false);
    // idx4 は row1 の先頭 head（beat16 で切られた続きではない）。
    expect(rows[1]!.segments[0]).toMatchObject({ index: 4, startBeat: 0, widthBeat: 4, head: true, tail: false });
  });

  it("(b) 合成の段跨ぎ＝start14 dur4 が head(14-16)+tail(0-2) に割れる", () => {
    const rows = wrapRows([C(0, "", 14, 4)], 4, 4); // 14-18
    expect(rows.length).toBe(2);
    expect(rows[0]!.segments).toEqual([{ index: 0, startBeat: 14, widthBeat: 2, head: true, tail: false }]);
    expect(rows[1]!.segments).toEqual([{ index: 0, startBeat: 0, widthBeat: 2, head: false, tail: true }]);
  });

  it("段内の小節境界またぎは1本の連続セグメント（付点で2小節に跨る）", () => {
    // start2 dur3（2-5・小節境界4をまたぐが段内）＝1セグメント。
    const rows = wrapRows([C(0, "", 2, 3)], 4, 4);
    expect(rows.length).toBe(1);
    expect(rows[0]!.segments).toEqual([{ index: 0, startBeat: 2, widthBeat: 3, head: true, tail: false }]);
  });

  it("空配列は空段", () => {
    expect(wrapRows([], 4, 4)).toEqual([]);
  });
});

describe("chordTimeline.degreeColor", () => {
  it("root pc→hue=pc*30 の hsl", () => {
    expect(degreeColor(0)).toBe("hsl(0 70% 55%)"); // I
    expect(degreeColor(2)).toBe("hsl(60 70% 55%)"); // II
    expect(degreeColor(10)).toBe("hsl(300 70% 55%)"); // ♭VII
    expect(degreeColor(12)).toBe("hsl(0 70% 55%)"); // 折り返し
  });
});
