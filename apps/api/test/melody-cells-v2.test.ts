import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { scalePcs, chordPcs } from "../src/music/theory";

// A2レシピ（docs/research/melody-recipe-validated.md）の production 実装＝genMotifMelodyV2 の契約。
const motif16 = loadMotifModel16();

// I-vi-IV-V を2周＝8小節（C major）。
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const gen = (seed: number, bars = 8) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false });

const inBar = (t: number) => ((t % 4) + 4) % 4;
const isStrong = (t: number) => Math.abs(inBar(t) - 0) < 0.12 || Math.abs(inBar(t) - 2) < 0.12;

describe("genMotifMelodyV2（A2レシピ＝骨格＋選別＋輪郭駆動＋発展＋弧）", () => {
  it("① 返り音はすべて scale 内（その調の音階ピッチ）", () => {
    const notes = gen(14);
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("② 強拍(0/2拍)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(14);
    const strong = notes.filter((n) => isStrong(n.start));
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => {
      const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4));
      return pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12);
    });
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("③ 全 onset が 0..bars*4 の範囲に収まる（小節数×拍）", () => {
    const bars = 8;
    const notes = gen(14, bars);
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * 4);
    }
    // start 昇順
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
  });

  it("④ seed決定的：同seedで同結果・別seedで別結果", () => {
    expect(JSON.stringify(gen(14))).toBe(JSON.stringify(gen(14)));
    expect(JSON.stringify(gen(14))).not.toBe(JSON.stringify(gen(21)));
  });

  it("⑤ 発展：B(5-6小節)は反行で A(1-2小節)と輪郭が異なる／A''は句末トニック着地", () => {
    const notes = gen(14);
    const contour = (b0: number) => {
      const seg = notes.filter((n) => n.start >= b0 * 4 && n.start < (b0 + 2) * 4).sort((a, b) => a.start - b.start);
      const mv: number[] = [];
      for (let i = 1; i < seg.length; i++) mv.push(Math.sign(seg[i]!.pitch - seg[i - 1]!.pitch));
      return mv;
    };
    const a = contour(0); // A
    const b = contour(4); // B（反行＝bar5-6）
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // 反行＝同位置の符号が大半で逆（完全一致でないことを確認＝輪郭が異なる）。
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // A''（最終句）の最後の音はトニック(pc=0)へ着地。
    const last = notes[notes.length - 1]!;
    expect(((last.pitch % 12) + 12) % 12).toBe(0);
  });

  it("⑥ bars=4 等の短尺でも壊れない（最終句がトニック着地）", () => {
    const notes = gen(14, 4);
    expect(notes.length).toBeGreaterThan(0);
    expect(((notes[notes.length - 1]!.pitch % 12) + 12) % 12).toBe(0);
  });
});
