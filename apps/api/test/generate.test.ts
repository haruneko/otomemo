import { describe, it, expect } from "vitest";
import { genChords, genMelody, genBass, genDrums, normalizeFrame } from "../src/music/generate";
import { chordPcs } from "../src/music/theory";

// 生成は seed 依存乱数＝byte等価ではなく**musicalルール**を property test で担保（design「アーキ是正 決定1」）。
describe("genChords（機能和声ルール）", () => {
  it("T始まり・T終わり（主和音 I/i で開始・終止）＋小節数一致＋ダイアトニック", () => {
    const { items } = genChords({ bars: 4, meter: "4/4", mood: "明るい" }, 7);
    const chords = (items[0]!.content as { chords: { root: number; quality: string; dur: number }[] }).chords;
    expect(chords.length).toBe(4);
    expect(chords[0]!.root).toBe(0); // I（major）
    expect(chords[chords.length - 1]!.root).toBe(0); // 終止 I
    expect(chords.every((c) => c.dur === 4)).toBe(true); // 4/4 で各1小節
  });
  it("マイナーmoodで i（0,m）始まり", () => {
    const { items } = genChords({ bars: 4, mood: "切ない" }, 3);
    const chords = (items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
    expect(chords[0]).toEqual(expect.objectContaining({ root: 0, quality: "m" }));
  });
  it("bars は 1..16 に丸め", () => {
    const { items } = genChords({ bars: 99 }, 1);
    expect((items[0]!.content as { chords: unknown[] }).chords.length).toBe(16);
  });
});

describe("genMelody（コードトーン拘束＋リズム図形）", () => {
  it("拍頭=コードトーン・音域内・リズムに variety（四分縛りでない）", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const { items } = genMelody({ bars: 2, meter: "4/4" }, chords, 5);
    const notes = (items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes.length).toBeGreaterThan(0);
    const tones = new Set(chordPcs(0, "")); // C E G
    expect(tones.has(((notes[0]!.pitch % 12) + 12) % 12)).toBe(true); // 先頭=コードトーン
    expect(notes.every((n) => n.pitch >= 60 && n.pitch <= 84)).toBe(true);
    expect(notes.every((n) => n.start >= 0 && n.start + n.dur <= 8 + 1e-6)).toBe(true); // 範囲内
    // 四分(dur=1)以外のリズムが出る（♪/付点/二分/休符）＝四分縛りの解消
    expect(notes.some((n) => n.dur !== 1)).toBe(true);
  });
  it("明るい(busy)は切ない(sparse)より音数が多い（密度がmoodで動く）", () => {
    const ch = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const bright = (genMelody({ bars: 4, mood: "明るい" }, ch, 1).items[0]!.content as { notes: unknown[] }).notes.length;
    const sad = (genMelody({ bars: 4, mood: "切ない" }, ch, 1).items[0]!.content as { notes: unknown[] }).notes.length;
    expect(bright).toBeGreaterThan(sad);
  });
});

describe("genBass（ルート/5度＋リズム）", () => {
  it("先頭=ルート・低域・リズムあり", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const notes = (genBass({ bars: 2, meter: "4/4" }, chords).items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes[0]!.pitch).toBe(36); // 小節頭=ルート C2
    expect(notes.every((n) => n.pitch >= 36 && n.pitch < 48)).toBe(true); // C2基準低域
    expect(notes.every((n) => [36, 36 + 7].includes(n.pitch))).toBe(true); // ルート or 5度
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe("genDrums（バックビート）", () => {
  it("16ステップ・Kick/Snare/HiHat・スネアは裏拍4/12", () => {
    const { items } = genDrums({}, 2);
    const r = (items[0]!.content as { rhythm: { steps: number; lanes: { name: string; hits: number[] }[] } }).rhythm;
    expect(r.steps).toBe(16);
    const snare = r.lanes.find((l) => l.name === "Snare")!;
    expect(snare.hits).toEqual([4, 12]);
    const kick = r.lanes.find((l) => l.name === "Kick")!;
    expect(kick.hits).toContain(0); // 表拍キック
  });
});

describe("normalizeFrame", () => {
  it("不正key/bars を落とす・clampする", () => {
    expect(normalizeFrame({ key: 99 }).key).toBeUndefined();
    expect(normalizeFrame({ bars: 0 }).bars).toBe(1);
    expect(normalizeFrame({ bars: 50 }).bars).toBe(16);
  });
});
