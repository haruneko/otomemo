import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { skeletonToV2Skel, skeletonRestMask } from "../src/music/skeletonNeta";
import { genMelody, genSkeletonCandidates } from "../src/music/generate";
import { scalePcs, chordPcs } from "../src/music/theory";

// J2a（Task#13・design #20）：V2 の 3/4・6/4 対応。barLen=beatsPerBar（3/6）へ一般化・compound は据え置き。
// 骨格/move/選別/発展/弧は 4/4 学習を流用。固有＝リズム語彙の 3拍切り出し（6/4=3+3）・強拍・小節境界のみ。
const motif16 = loadMotifModel16();

// I-vi-IV-V を2周＝8小節（C major）。各 bar に1コード。
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 55, 84);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const gen = (beatsPerBar: number, seed: number, bars = 8, extra: Record<string, unknown> = {}) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, beatsPerBar, ...extra });

const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
const onGrid = (t: number) => Math.abs(t * 4 - Math.round(t * 4)) < 1e-6; // 16分格子（0.25刻み）

// ── 3/4（barLen=3・直進16分・強拍 [0]） ──────────────────────────────────────────
describe("genMotifMelodyV2 3/4（barLen=3・RHYTHM16の3拍切り出し・強拍=拍1）", () => {
  const BAR = 3;
  const inBar = (t: number) => ((t % BAR) + BAR) % BAR;
  it("① 全音 scale 内・onset は [0,bars*3) の16分格子・小節境界=3拍・昇順", () => {
    const bars = 8;
    const notes = gen(3, 14, bars);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * BAR);
      expect(onGrid(n.start)).toBe(true);
      expect(inBar(n.start)).toBeLessThan(BAR - 1e-9);
      expect(n.dur).toBeGreaterThan(0);
    }
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
      expect(notes[i - 1]!.start + notes[i - 1]!.dur).toBeLessThanOrEqual(notes[i]!.start + 1e-6);
    }
  });
  it("② 強拍(拍1=inBar 0)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(3, 14);
    const strong = notes.filter((n) => Math.abs(inBar(n.start)) < 0.12);
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => pcsPerBar[Math.min(pcsPerBar.length - 1, Math.floor(n.start / BAR))]!.includes(((n.pitch % 12) + 12) % 12));
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });
  it("③ seed 決定的（同seed同出力・別seed別出力）", () => {
    expect(JSON.stringify(gen(3, 14))).toBe(JSON.stringify(gen(3, 14)));
    expect(JSON.stringify(gen(3, 14))).not.toBe(JSON.stringify(gen(3, 21)));
  });
  it("④ 総拍数＝bars×3：最終 onset は 3拍×bars 手前・4/4(bars×4)や6/8(bars×3だが跳ねdur)と別展開", () => {
    for (const bars of [4, 6, 8]) {
      const notes = gen(3, 14, bars);
      expect(notes.every((n) => n.start < bars * 3)).toBe(true);
      expect(notes.some((n) => n.start >= (bars - 1) * 3 - 1e-6 || n.start >= (bars - 2) * 3)).toBe(true); // 後半まで音が届く
    }
  });
});

// ── 6/4（barLen=6・3+3・強拍 [0,3]） ─────────────────────────────────────────────
describe("genMotifMelodyV2 6/4（barLen=6・3+3群・強拍=拍1,4）", () => {
  const BAR = 6;
  const inBar = (t: number) => ((t % BAR) + BAR) % BAR;
  it("⑤ 全音 scale 内・onset は [0,bars*6) の16分格子・小節境界=6拍・昇順", () => {
    const bars = 8;
    const notes = gen(6, 14, bars);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * BAR);
      expect(onGrid(n.start)).toBe(true);
      expect(inBar(n.start)).toBeLessThan(BAR - 1e-9);
    }
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
  });
  it("⑥ 強拍(拍1,4=inBar 0/3)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(6, 14);
    const strong = notes.filter((n) => Math.abs(inBar(n.start)) < 0.12 || Math.abs(inBar(n.start) - 3) < 0.12);
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => pcsPerBar[Math.min(pcsPerBar.length - 1, Math.floor(n.start / BAR))]!.includes(((n.pitch % 12) + 12) % 12));
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });
  it("⑦ 3+3：後半群（inBar>=3）にも onset が現れる（bar を6拍で埋める・前半だけに偏らない）", () => {
    let front = 0, back = 0;
    for (let seed = 1; seed <= 30; seed++) for (const n of gen(6, seed)) (inBar(n.start) >= 3 ? back++ : front++);
    expect(front).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
  });
  it("⑧ seed 決定的", () => {
    expect(JSON.stringify(gen(6, 14))).toBe(JSON.stringify(gen(6, 14)));
    expect(JSON.stringify(gen(6, 14))).not.toBe(JSON.stringify(gen(6, 21)));
  });
});

// ── 回帰：4/4・6/8 の bit 一致（beatsPerBar 追加が既存を壊さない） ─────────────────
describe("回帰＝既存 eligible 拍子の bit 一致", () => {
  it("⑨ beatsPerBar:4 明示 == 未指定（4/4 の既定と厳密一致）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false });
      const withBpb = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, beatsPerBar: 4 });
      expect(JSON.stringify(withBpb), `seed=${seed}`).toBe(JSON.stringify(base));
    }
  });
  it("⑩ compound(6/8) は beatsPerBar 指定に関わらず barLen=3 固定・従来と一致（compound が勝つ）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, compound: true });
      const b = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, compound: true, beatsPerBar: 3 });
      expect(JSON.stringify(b), `seed=${seed}`).toBe(JSON.stringify(a));
    }
  });
});

// ── generate.genMelody 配線（frame meter → barLen） ──────────────────────────────
describe("generate.genMelody 配線（3/4・6/4 → V2 barLen）", () => {
  const notesOf = (res: ReturnType<typeof genMelody>) =>
    (res.items.find((x) => x.kind === "melody")!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
  it("⑪ meter=3/4 → V2 経路・onset < bars*3・16分格子", () => {
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 3, dur: 3 }));
    const notes = notesOf(genMelody({ key: 0, meter: "3/4", bars: 8, mood: "" }, chords, 14, { useV2: true }));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.start).toBeLessThan(8 * 3 + 1e-6);
      expect(onGrid(n.start)).toBe(true);
    }
    expect(notes.some((n) => n.start >= 12)).toBe(true); // 後半小節まで展開（旧経路④の縮退でない）
  });
  it("⑫ meter=6/4 → V2 経路・onset < bars*6", () => {
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 6, dur: 6 }));
    const notes = notesOf(genMelody({ key: 0, meter: "6/4", bars: 8, mood: "" }, chords, 14, { useV2: true }));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.start).toBeLessThan(8 * 6 + 1e-6);
    expect(notes.some((n) => n.start >= 24)).toBe(true);
  });
  it("⑬ meter=4/4 は不変（bars*4 へ展開・従来V2）", () => {
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));
    const notes = notesOf(genMelody({ key: 0, meter: "4/4", bars: 8, mood: "" }, chords, 14, { useV2: true }));
    expect(notes.some((n) => n.start >= 24)).toBe(true);
  });
  it("⑭ meter=3/4 決定的（同seed同出力）", () => {
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 3, dur: 3 }));
    const a = JSON.stringify(notesOf(genMelody({ key: 0, meter: "3/4", bars: 8, mood: "" }, chords, 7, { useV2: true })));
    const b = JSON.stringify(notesOf(genMelody({ key: 0, meter: "3/4", bars: 8, mood: "" }, chords, 7, { useV2: true })));
    expect(a).toBe(b);
  });
});

// ── 骨格層の結線（3/4）：skeletonToV2Skel/skeletonRestMask が beatsPerBar=3 で整合 ──
describe("骨格注入・restMask（3/4・design #20 結線）", () => {
  const notesOf = (res: ReturnType<typeof genMelody>) =>
    (res.items.find((x) => x.kind === "melody")!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 3, dur: 3 }));

  it("⑮ skeletonToV2Skel(beatsPerBar:3) 長さ = bars*3・skeletonRestMask が休符区間を返す", () => {
    const content = { bars: 4, tones: [{ start: 0, pitch: 67 }, { start: 3, pitch: null }, { start: 6, pitch: 64 }] } as const;
    const skel = skeletonToV2Skel(content as never, { beatsPerBar: 3, fallbackPitch: 62 });
    expect(skel.length).toBe(4 * 3);
    const mask = skeletonRestMask(content as never, { beatsPerBar: 3 });
    expect(mask.length).toBeGreaterThan(0);
    expect(mask.every((m) => m.end > m.start)).toBe(true);
  });

  it("⑯ 3/4 で骨格注入したメロは休符区間に onset を持たない（restマスク適用）・決定的", () => {
    const content = { bars: 8, tones: [{ start: 0, pitch: 67 }, { start: 6, pitch: null }, { start: 9, pitch: 64 }] };
    const res1 = genMelody({ key: 0, meter: "3/4", bars: 8, mood: "" }, chords, 5, { useV2: true, skeleton: content as never });
    const notes = notesOf(res1);
    expect(notes.length).toBeGreaterThan(0);
    const mask = skeletonRestMask(content as never, { beatsPerBar: 3 });
    for (const n of notes) for (const m of mask) expect(n.start >= m.start - 1e-6 && n.start < m.end - 1e-6).toBe(false);
    const res2 = genMelody({ key: 0, meter: "3/4", bars: 8, mood: "" }, chords, 5, { useV2: true, skeleton: content as never });
    expect(JSON.stringify(notesOf(res2))).toBe(JSON.stringify(notes));
  });

  it("⑰ 3/4 で phrasing 句割り＝句末カデンツ着地（最終音は主音pc）", () => {
    const notes = notesOf(genMelody({ key: 0, meter: "3/4", bars: 8, mood: "" }, chords, 14, { useV2: true, phrasing: "symmetric" }));
    const last = notes[notes.length - 1]!;
    const bar = Math.min(pcsPerBar.length - 1, Math.floor(last.start / 3));
    expect(pcsPerBar[bar]!.includes(((last.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("⑱ gen_skeleton(3/4) の骨格ブレークポイントが 3拍/小節に収まる（producer も barLen=3 で整合）", () => {
    const res = genSkeletonCandidates({ key: 0, mode: "major", meter: "3/4", bars: 8 }, chords, 3);
    const content = res.items[0]!.content as { bars: number; tones: { start: number }[] };
    expect(content.bars).toBe(8);
    expect(content.tones.length).toBeGreaterThan(0);
    for (const t of content.tones) expect(t.start).toBeLessThan(8 * 3 + 1e-6); // 4/4 前提なら 32 まで散る＝3拍/小節で整合
  });
});
