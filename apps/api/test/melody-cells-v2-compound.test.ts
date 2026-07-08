import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { genMelody } from "../src/music/generate";
import { scalePcs, chordPcs } from "../src/music/theory";

// 6/8（複合2拍子）の A2レシピ統合＝genMotifMelodyV2({compound:true}) の契約。
// 骨格/move/選別/発展/弧は4/4学習を流用。6/8固有はリズム(3+3八分)・bar=3拍・強拍0/1.5・跳ねdurのみ。
const motif16 = loadMotifModel16();

// 6/8：1小節=3四分。I-vi-IV-V を2周＝8小節（C major）。各barに1コード。
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const BAR = 3; // 6/8 の1小節=3四分
const gen = (seed: number, bars = 8) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, compound: true });

const inBar = (t: number) => ((t % BAR) + BAR) % BAR;
const isStrong = (t: number) => Math.abs(inBar(t) - 0) < 0.12 || Math.abs(inBar(t) - 1.5) < 0.12;

describe("genMotifMelodyV2 compound（6/8＝骨格流用＋6/8リズム＋強拍0/1.5＋跳ね）", () => {
  it("① 返り音はすべて scale 内", () => {
    const notes = gen(14);
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("② 強拍(0/1.5拍)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(14);
    const strong = notes.filter((n) => isStrong(n.start));
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => {
      const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / BAR));
      return pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12);
    });
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("③ 全 onset が 6/8グリッド(0.5刻み)・小節境界=3拍・範囲 0..bars*3 に収まる（昇順）", () => {
    const bars = 8;
    const notes = gen(14, bars);
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * BAR);
      // 8分グリッド＝0.5の倍数
      expect(Math.abs(n.start * 2 - Math.round(n.start * 2))).toBeLessThan(1e-6);
      // 小節内位置は 0..2.5（1小節=3拍＝6八分枠の手前）
      expect(inBar(n.start)).toBeLessThan(BAR - 1e-9);
    }
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
  });

  it("④ seed決定的：同seedで同結果・別seedで別結果", () => {
    expect(JSON.stringify(gen(14))).toBe(JSON.stringify(gen(14)));
    expect(JSON.stringify(gen(14))).not.toBe(JSON.stringify(gen(21)));
  });

  it("⑤ 発展：B(5-6小節)は A(1-2小節)と輪郭が異なる／A''句末はその時点のコード構成音に着地", () => {
    const notes = gen(14);
    const contour = (b0: number) => {
      const seg = notes.filter((n) => n.start >= b0 * BAR && n.start < (b0 + 2) * BAR).sort((a, b) => a.start - b.start);
      const mv: number[] = [];
      for (let i = 1; i < seg.length; i++) mv.push(Math.sign(seg[i]!.pitch - seg[i - 1]!.pitch));
      return mv;
    };
    const a = contour(0);
    const b = contour(4);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // B1(2026-07-08)：終止音は「その時点のコード」の構成音（最終小節=G7ならトニック強制せずV構成音）。
    const last = notes[notes.length - 1]!;
    const bar = Math.min(pcsPerBar.length - 1, Math.floor(last.start / BAR));
    expect(pcsPerBar[bar]!.includes(((last.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("⑥ 4/4経路は不変：compound未指定なら従来の4/4挙動（小節=4拍・16分位置あり得る）", () => {
    const notes44 = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed: 14, tonicPc: 0, minor: false });
    // 4/4 は 4*8=32拍に展開（6/8 の 3*8=24 とは別）。最終 onset は 24拍以上に到達し得る。
    expect(notes44.some((n) => n.start >= 24)).toBe(true);
  });
});

describe("generate.genMelody 配線（6/8 frame → compound V2 経路）", () => {
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 3, dur: 3 }));
  it("⑦ meter=6/8 で V2(compound)経路に入り 6/8グリッドのメロが返る", () => {
    const res = genMelody({ key: 0, meter: "6/8", bars: 8, mood: "" }, chords, 14, { useV2: true });
    const item = res.items.find((x) => x.kind === "melody");
    expect(item).toBeTruthy();
    const notes = (item!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.start).toBeLessThan(8 * 3 + 1e-6); // 6/8＝1小節3拍
      expect(Math.abs(n.start * 2 - Math.round(n.start * 2))).toBeLessThan(1e-6); // 8分グリッド
    }
  });
  it("⑧ meter=4/4 は不変（従来V2＝1小節4拍）", () => {
    const ch44 = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));
    const res = genMelody({ key: 0, meter: "4/4", bars: 8, mood: "" }, ch44, 14, { useV2: true });
    const item = res.items.find((x) => x.kind === "melody");
    const notes = (item!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes.some((n) => n.start >= 24)).toBe(true); // 4拍×8小節へ展開
  });
});
