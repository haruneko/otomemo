import { describe, it, expect } from "vitest";
import { detectChord, midiBarChords } from "../src/music/chordDetect";
import { chordPcs } from "../src/music/theory";

// 和声PCヒストグラム → コード判定。
const hist = (pcs: number[]): number[] => {
  const h = new Array(12).fill(0);
  for (const p of pcs) h[((p % 12) + 12) % 12] += 1;
  return h;
};

describe("detectChord（PC集合→コード）", () => {
  it("C major triad → root0 quality''", () => {
    const c = detectChord(hist(chordPcs(0, "")));
    expect(c.root).toBe(0);
    expect(["", "maj7", "6"]).toContain(c.quality); // メジャー系
  });
  it("C minor → root0 m", () => {
    const c = detectChord(hist(chordPcs(0, "m")));
    expect(c.root).toBe(0);
    expect(["m", "m7", "m6"]).toContain(c.quality);
  });
  it("G7 → root7 7", () => {
    const c = detectChord(hist(chordPcs(7, "7")));
    expect(c.root).toBe(7);
    expect(["7", ""]).toContain(c.quality);
  });
  it("A minor → root9 m", () => {
    const c = detectChord(hist(chordPcs(9, "m")));
    expect(c.root).toBe(9);
  });
});

describe("midiBarChords（小節ごとのコード列）", () => {
  it("1小節C・2小節Am の和声 → [C, Am]", () => {
    // 4/4・各小節に三和音を鳴らす（ch0 で和音）
    const bar = (root: number, q: string, barIdx: number): { pitch: number; start: number; dur: number; channel: number }[] =>
      chordPcs(root, q).map((pc) => ({ pitch: 60 + pc, start: barIdx * 4, dur: 4, channel: 0 }));
    const notes = [...bar(0, "", 0), ...bar(9, "m", 1)];
    const ch = midiBarChords(notes, "4/4", 1);
    expect(ch.length).toBe(2);
    expect(ch[0]!.root).toBe(0);
    expect(ch[1]!.root).toBe(9);
  });
  it("ドラム(ch9)は無視する", () => {
    const notes = [
      ...chordPcs(0, "").map((pc) => ({ pitch: 60 + pc, start: 0, dur: 4, channel: 0 })),
      { pitch: 38, start: 0, dur: 4, channel: 9 }, // スネア＝無視
    ];
    const ch = midiBarChords(notes, "4/4", 1);
    expect(ch[0]!.root).toBe(0);
  });
});
