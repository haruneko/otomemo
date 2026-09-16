// ピアノ伴奏（phrase_maker 試作 #1 取り込み S3）＝バンドの中のピアノとしてまとめる部分＋2拍替わりの区切り。
// 正典＝docs/drafts/2026-09-16-handframe-evolution-design.md §3-1（テスト (a)〜(e)）・§5 S3。
// 一致は「耳で合格した音を運べた証明」＝診断であって進捗ではない（進捗は耳A）。
import { applyFeelByPart } from "../src/index";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateHandFrameBand, splitIntoCells, containerFromGridText, grabDensityCfg, HF_BAND_CONTAINER_TEXT,
  type BandChord, type HandFrameBandOptions,
} from "../src/handFrameBand";

type RefNote = { pitch: number; start: number; end: number; vel: number; hand: string; cell: number };
type Ref = { tempo: number; seed: number; cellBeats: number; chordsPerCell: string[]; notes: RefNote[]; pedal: { down: number; up: number }[] };
const here = dirname(fileURLToPath(import.meta.url));
const load = (f: string): Ref => JSON.parse(readFileSync(join(here, "fixtures/handframe", f), "utf8"));

const ch = (root: string, quality: string, beats: number): BandChord => ({ root, quality, beats });
// 試作 #1 の進行＝Fmaj7｜G｜Em7｜Am7→G を4回（16小節）
const HALF_PROG: BandChord[] = Array.from({ length: 4 }, () => [ch("F", "maj7", 4), ch("G", "", 4), ch("E", "m7", 4), ch("A", "m7", 2), ch("G", "", 2)]).flat();
// 1小節に丸めた版＝Fmaj7｜G｜Em7｜Am7 を4回
const BAR_PROG: BandChord[] = Array.from({ length: 4 }, () => [ch("F", "maj7", 4), ch("G", "", 4), ch("E", "m7", 4), ch("A", "m7", 4)]).flat();
const DRY: HandFrameBandOptions = { tempo: 96, seed: 1234, humanize: false };

const asRef = (notes: readonly (readonly [number, number, number, number, string, number])[]) =>
  notes.map(([pitch, start, end, vel, hand, cell]) => ({ pitch, start, end, vel, hand, cell }));

describe("区切り（§3-1）", () => {
  it("最短のコード長で 2拍 or 1小節・区切りの頭で鳴っているコード", () => {
    const h = splitIntoCells(HALF_PROG);
    expect(h.cellBeats).toBe(2);
    expect(h.cells.length).toBe(32);
    expect(h.cells.slice(0, 8).map((c) => `${c.root}${c.quality}`)).toEqual(["Fmaj7", "Fmaj7", "G", "G", "Em7", "Em7", "Am7", "G"]);
    expect(splitIntoCells(BAR_PROG).cellBeats).toBe(4);
    const one = splitIntoCells([ch("C", "", 3), ch("G", "", 1), ch("F", "", 4)]);
    expect(one.cellBeats).toBe(2);
    expect(one.warnings.length).toBe(1);
    expect(one.cells.map((c) => c.root)).toEqual(["C", "C", "F", "F"]);
  });
  it("器の読み取りと掴む位置の段（試作 #1 の器・段2＝マス4だけ）", () => {
    const c8 = containerFromGridText(HF_BAND_CONTAINER_TEXT[8]);
    expect(c8).toEqual({ grid: 8, onsets: [0, 2, 4, 6], kick: [0, 6], snare: [4], accents: [4] });
    expect([...grabDensityCfg(c8, 2).grabSlots]).toEqual([4]);
    const c16 = containerFromGridText(HF_BAND_CONTAINER_TEXT[16]);
    expect([...grabDensityCfg(c16, 2).grabSlots]).toEqual([4, 8, 12]);
  });
});

describe("Python と bit 一致（揺れ off・8分裏 on）", () => {
  it("(c) 2拍替わり＝基準音 F-A（音高・始まり・終わり・音量・手・区切り番号）とペダル窓", () => {
    const ref = load("reference_half_mid.json");
    const r = generateHandFrameBand(HALF_PROG, { ...DRY, seed: ref.seed });
    expect(r.cellBeats).toBe(2);
    expect(asRef(r.notes)).toEqual(ref.notes);
    expect(r.pedals.map(([down, up]) => ({ down, up }))).toEqual(ref.pedal);
  });
  it("(b) 1小節1コード＝区切り＝小節で基準音 F-C（Python 4/4 版）と一致", () => {
    const ref = load("reference_bar_rounded_mid.json");
    const r = generateHandFrameBand(BAR_PROG, { ...DRY, seed: ref.seed });
    expect(r.cellBeats).toBe(4);
    expect(asRef(r.notes)).toEqual(ref.notes);
    expect(r.pedals.map(([down, up]) => ({ down, up }))).toEqual(ref.pedal);
  });
});

describe("§3-1 (a)(d)(e)・ペダル窓・左手", () => {
  const r = generateHandFrameBand(HALF_PROG, DRY);
  const cellSec = (2 * 60) / 96;
  const toks = splitIntoCells(HALF_PROG).cells.map((c) => `${c.root}${c.quality}`);
  it("(a) コードが替わる区切りの頭は右手が鳴る・同じコードが続く区切りの頭は右手が鳴らない", () => {
    let changed = 0, same = 0;
    toks.forEach((t, k) => {
      const head = r.notes.filter((n) => n[4] === "R" && n[5] === k && Math.abs(n[1] - k * cellSec) < 1e-9);
      if (k === 0 || t !== toks[k - 1]) { expect(head.length).toBeGreaterThanOrEqual(2); changed++; }
      else { expect(head.length).toBe(0); same++; }
    });
    expect(changed).toBeGreaterThan(0);
    expect(same).toBeGreaterThan(0);
  });
  it("(d) 2拍替わりと1小節に丸めた版で出力が違う（丸めていない反証）", () => {
    const b = generateHandFrameBand(BAR_PROG, DRY);
    expect(asRef(b.notes)).not.toEqual(asRef(r.notes));
    // 2拍替わりの G（4小節目3拍目）の頭で右手が鳴る
    const gHead = r.notes.filter((n) => n[4] === "R" && Math.abs(n[1] - 7 * cellSec) < 1e-9);
    expect(gHead.length).toBeGreaterThan(0);
  });
  it("(e) コードが替わる境目をまたぐ音が無い", () => {
    for (const n of r.notes) {
      const k = Math.ceil(n[2] / cellSec - 1e-9) - 1;
      for (let c = n[5] + 1; c <= k; c++) expect(toks[c]).toBe(toks[n[5]]);
    }
  });
  it("ペダル窓＝区切り（頭で踏み・次の区切りの 20ms 前に離す）・content は拍で持つ", () => {
    expect(r.pedals.length).toBe(32);
    r.pedals.forEach(([dn, up], i) => { expect(dn).toBeCloseTo(i * cellSec, 12); expect(up).toBeCloseTo((i + 1) * cellSec - 0.02, 12); });
    expect(r.content.pedal!.length).toBe(32);
    expect(r.content.pedal![1]!.start).toBeCloseTo(2, 12);
    expect(r.content.pedal![0]!.dur).toBeCloseTo(2 - 0.02 * 96 / 60, 12);
    const noPed = generateHandFrameBand(HALF_PROG, { ...DRY, sustainPedal: false });
    expect(noPed.pedals).toEqual([]);
    expect("pedal" in noPed.content).toBe(false);
  });
  it("左手＝3度と7度の和音がベースの上限（48）より上・根音を含まない", () => {
    const cells = splitIntoCells(HALF_PROG).cells;
    const lh = r.notes.filter((n) => n[4] === "L");
    expect(lh.length).toBeGreaterThan(0);
    const root: Record<string, number> = { F: 5, G: 7, E: 4, A: 9 };
    for (const n of lh) {
      expect(n[0]).toBeGreaterThan(48);
      expect(n[0] % 12).not.toBe(root[cells[n[5]]!.root as string]);
    }
    const rh = r.notes.filter((n) => n[4] === "R");
    for (const n of rh) expect(n[0]).toBeGreaterThan(48);
  });
});

describe("段・揺れ・8分裏の単音（診断）", () => {
  it("掴む量の段 1→4 で、2音以上をまとめて押さえる打鍵（区切り頭以外）が減らない（種4本の合計）", () => {
    const counts = [1, 2, 3, 4].map((level) => {
      let n = 0;
      for (const seed of [1, 2, 3, 4]) {
        const r = generateHandFrameBand(BAR_PROG, { ...DRY, seed, level });
        const g = new Map<number, number>();
        for (const x of r.notes) if (x[4] === "R") g.set(x[1], (g.get(x[1]) ?? 0) + 1);
        for (const [t, c] of g) if (c >= 2 && Math.abs(t / 2.5 - Math.round(t / 2.5)) > 1e-9) n++;
      }
      return n;
    });
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    expect(counts[3]!).toBeGreaterThan(counts[0]!);
  });

  it("揺れ on：音高・時刻・ペダルは off と同じで、右手の強さの散らばり（SD）が元（13.4）と同程度・feel を返す", () => {
    const sds: number[] = [];
    for (const seed of [1234, 7, 2024, 99]) {
      const off = generateHandFrameBand(HALF_PROG, { ...DRY, seed });
      const on = generateHandFrameBand(HALF_PROG, { ...DRY, seed, humanize: true });
      expect(on.notes.map((n) => [n[0], n[1], n[2], n[4]])).toEqual(off.notes.map((n) => [n[0], n[1], n[2], n[4]]));
      expect(on.pedals).toEqual(off.pedals);
      expect(on.feel).toEqual({ humanize: expect.any(Number), seed, keepDur: true });
      expect(off.feel).toBeNull();
      const v = on.notes.filter((n) => n[4] === "R").map((n) => n[3]);
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      sds.push(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length));
      for (const x of v) { expect(x).toBeGreaterThanOrEqual(24); expect(x).toBeLessThanOrEqual(120); }
    }
    const mean = sds.reduce((a, b) => a + b, 0) / sds.length;
    expect(mean).toBeGreaterThan(9);
    expect(mean).toBeLessThan(18);
    // 決定論
    expect(generateHandFrameBand(HALF_PROG, { ...DRY, humanize: true }).notes).toEqual(generateHandFrameBand(HALF_PROG, { ...DRY, humanize: true }).notes);
  });

  it("既定は試作 #1 どおり（揺れ on・8分裏 on・ペダル on・段2）", () => {
    const d = generateHandFrameBand(HALF_PROG, { tempo: 96, seed: 1234 });
    expect(d.diag).toMatchObject({ humanize: true, offbeatSingles: true, sustainPedal: true, level: 2 });
    expect(d.feel).not.toBeNull();
  });

  it("8分裏の単音 off：8分裏（区切り内のマス 2・6）に打鍵が無い・on には有る・ペダルは同じ", () => {
    const sd = (2 * 60) / 96 / 8;
    const slotOf = (t: number, cell: number) => Math.round((t - cell * 8 * sd) / sd);
    const on = generateHandFrameBand(HALF_PROG, DRY);
    const off = generateHandFrameBand(HALF_PROG, { ...DRY, offbeatSingles: false });
    const offbeat = (r: typeof on) => r.notes.filter((n) => n[4] === "R" && slotOf(n[1], n[5]) % 4 === 2).length;
    expect(offbeat(on)).toBeGreaterThan(0);
    expect(offbeat(off)).toBe(0);
    expect(off.pedals).toEqual(on.pedals);
    expect(off.diag.grabSlots).toEqual(on.diag.grabSlots);
  });
});

describe("ピアノ伴奏に feel を掛けても音の長さは生成したとおり（耳A 2026-09-17「左手が抜ける」の修正）", () => {
  it("返す feel は keepDur＝applyFeelByPart 後も各音の長さが元と一致・発音時刻だけ揺れる", () => {
    for (const seed of [1234, 7, 2024]) {
      const r = generateHandFrameBand(HALF_PROG, { tempo: 96, seed });
      expect(r.feel).toMatchObject({ keepDur: true });
      const notes = r.content.notes.map((n, i) => ({ ...n, id: i }));
      const felt = applyFeelByPart(notes, r.feel, { tempo: 96 }, () => "chords");
      const byId = new Map(felt.map((n) => [n.id, n]));
      let moved = 0;
      for (const n of notes) {
        const f = byId.get(n.id)!;
        expect(f.dur).toBe(n.dur);
        expect(f.pitch).toBe(n.pitch);
        if (f.start !== n.start) moved++;
      }
      expect(moved).toBeGreaterThan(0);
    }
  });
});
