import { describe, it, expect } from "vitest";
import { normalizeProgressions, canonProgQuality, sixBasedRoot, progSignature, MIN_PROG_LEN, type ProgItem } from "../src/corpus-normalize";

const c = (root: number, quality = "") => ({ root, quality, start: 0, dur: 2 });

describe("canonProgQuality（品質語彙の正準化）", () => {
  it("major三和音の表記ゆれ(''/maj/M)は '' に集約、min→m", () => {
    expect(canonProgQuality("")).toBe("");
    expect(canonProgQuality("maj")).toBe("");
    expect(canonProgQuality("M")).toBe("");
    expect(canonProgQuality("min")).toBe("m");
    expect(canonProgQuality("m")).toBe("m");
    expect(canonProgQuality("maj7")).toBe("maj7"); // 7th系は保持
    expect(canonProgQuality("m7")).toBe("m7");
  });
});

describe("sixBasedRoot（相対長調フレーム）", () => {
  it("minor tonic(0)は vi=9 へ、major はそのまま", () => {
    expect(sixBasedRoot(0, "minor")).toBe(9); // 短調tonic → 相対長調の vi
    expect(sixBasedRoot(3, "minor")).toBe(0); // 短調♭III → 相対長調 I
    expect(sixBasedRoot(0, "major")).toBe(0);
    expect(sixBasedRoot(7, "major")).toBe(7);
  });
});

describe("normalizeProgressions（在DB正規化）", () => {
  it("① 断片ゲート：length<3 を捨てる", () => {
    const items: ProgItem[] = [
      { id: "a", mode: "major", chords: [c(0), c(7)] }, // 2和音＝断片
      { id: "b", mode: "major", chords: [c(0), c(5), c(7)] }, // 3和音＝残す
    ];
    const r = normalizeProgressions(items);
    expect(MIN_PROG_LEN).toBe(3);
    expect(r.drop).toContain("a");
    expect(r.keep.map((k) => k.id)).toEqual(["b"]);
  });

  it("③ 完全重複を1本へ畳み count 集約", () => {
    const items: ProgItem[] = [
      { id: "a", mode: "major", chords: [c(0), c(5), c(7)], count: 2 },
      { id: "b", mode: "major", chords: [c(0, "maj"), c(5), c(7)], count: 3 }, // "maj"→"" で a と同型
    ];
    const r = normalizeProgressions(items);
    expect(r.keep.length).toBe(1);
    expect(r.keep[0]!.count).toBe(5); // 2+3
    expect(r.keep[0]!.id).toBe("b"); // count 多（3>2）を代表に
    expect(r.keep[0]!.chords[0]!.quality).toBe(""); // 正準化されている
    expect(r.drop).toContain("a");
  });

  it("④ 長短分裂の統合：平行長短の同型進行を six-based署名で畳む（major代表）", () => {
    // 実チョード Am F C G を、長調版(C major: vi-IV-I-V=9m,5,0,7)と短調版(A minor: i-VI-III-VII=0m,8,3,10)で。
    const major: ProgItem = { id: "maj", mode: "major", chords: [c(9, "m"), c(5), c(0), c(7)], count: 1 };
    const minor: ProgItem = { id: "min", mode: "minor", chords: [c(0, "m"), c(8), c(3), c(10)], count: 1 };
    // 署名一致を確認
    expect(progSignature(major)).toBe(progSignature(minor));
    const r = normalizeProgressions([minor, major]);
    expect(r.keep.length).toBe(1);
    expect(r.keep[0]!.id).toBe("maj"); // major を代表に
    expect(r.keep[0]!.count).toBe(2);
    expect(r.drop).toContain("min");
  });

  it("別進行は畳まない（過剰マージ防止）", () => {
    const items: ProgItem[] = [
      { id: "a", mode: "major", chords: [c(0), c(5), c(7)] }, // I-IV-V
      { id: "b", mode: "major", chords: [c(0), c(9, "m"), c(5), c(7)] }, // I-vi-IV-V
    ];
    const r = normalizeProgressions(items);
    expect(r.keep.length).toBe(2);
    expect(r.drop).toEqual([]);
  });
});
