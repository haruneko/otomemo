// 画面 B（2026-09-23 オーナー裁定）＝マス目（いつ弾くか）は人・どの音かは機械が弾き直す。
// 正典＝docs/design.md「生成したピアノ伴奏の扱い」の「編集画面＝画面 B」。
// 契約：①往復一致（読み取ったマス目で弾き直すと完全一致）②指定どおりに鳴る（種類も）③変えた位置より前は変わらない。
import { describe, expect, it } from "vitest";
import { generateHandFrameBand, rhythmOfBand, type BandChord, type HandFrameBandOptions, type HandFrameRhythm } from "../src/handFrameBand";
import { handFrameToChordPattern, rhythmOfExplicit } from "../src/explicitNotes";

const ch = (root: string, quality: string, beats: number): BandChord => ({ root, quality, beats });
const HALF: BandChord[] = Array.from({ length: 2 }, () => [ch("F", "maj7", 4), ch("G", "", 4), ch("E", "m7", 4), ch("A", "m7", 2), ch("G", "", 2)]).flat();
const BAR: BandChord[] = Array.from({ length: 2 }, () => [ch("C", "", 4), ch("A", "m", 4), ch("D", "m7", 4), ch("G", "7", 4)]).flat();
const BASE: HandFrameBandOptions = { tempo: 96, seed: 1234 };

const stepOf = (beats: number) => Math.round(beats * 4);
/** 16分の位置ごとの右手の音数・左手の有無 */
function shape(r: ReturnType<typeof generateHandFrameBand>) {
  const rh = new Map<number, number>(); const lh = new Set<number>();
  r.content.notes.forEach((n, i) => { const s = stepOf(n.start); if (r.notes[i]![4] === "L") lh.add(s); else rh.set(s, (rh.get(s) ?? 0) + 1); });
  return { rh, lh };
}
const clone = (x: HandFrameRhythm): HandFrameRhythm => ({ rh: x.rh.map((h) => ({ ...h })), lh: [...x.lh] });

describe("①往復一致（開いただけ・触っただけでは音が変わらない）", () => {
  const cases: [string, BandChord[], HandFrameBandOptions][] = [
    ["2拍替わり", HALF, BASE], ["1小節替わり", BAR, BASE], ["種違い", HALF, { ...BASE, seed: 7 }],
    ["8分裏なし", HALF, { ...BASE, offbeatSingles: false }], ["揺れなし", BAR, { ...BASE, humanize: false }],
    ["右手 C5 から", BAR, { ...BASE, rhFrom: 72 }], ["試作の置き方", HALF, { ...BASE, register: "source" }],
  ];
  for (const [name, prog, opts] of cases) {
    it(name, () => {
      const free = generateHandFrameBand(prog, opts);
      const again = generateHandFrameBand(prog, { ...opts, rhythm: rhythmOfBand(free) });
      expect(again.notes).toEqual(free.notes);
      expect(again.content).toEqual(free.content);
    });
  }
  it("和音パターンの形から読んでも同じ（web が持つのはこちら）", () => {
    const { content } = handFrameToChordPattern(HALF, BASE);
    const free = generateHandFrameBand(HALF, BASE);
    expect(rhythmOfExplicit(content)).toEqual(rhythmOfBand(free));
  });
});

describe("②指定どおりに鳴る・③変えた位置より前は変わらない", () => {
  const free = generateHandFrameBand(HALF, BASE);
  const r0 = rhythmOfBand(free);
  // 前の打点は、音の高さ・始まり・強さが同じ。長さは「次の打点まで」伸ばす音が新しい打点で切られる分だけ変わりうる＝変えた位置の手前で終わる音は長さも同じ。
  const beforeEq = (a: typeof free, b: typeof free, step: number) => {
    const pre = (x: typeof free) => x.content.notes.filter((n) => stepOf(n.start) < step)
      .map((n) => ({ pitch: n.pitch, start: n.start, vel: n.vel, dur: n.start + n.dur <= step / 4 + 1e-9 ? n.dur : "cut-or-held" }));
    const pa = pre(a), pb = pre(b);
    expect(pa.map((n) => ({ ...n, dur: 0 }))).toEqual(pb.map((n) => ({ ...n, dur: 0 })));
    pa.forEach((n, i) => { if (typeof n.dur === "number" && typeof pb[i]!.dur === "number") expect(n.dur).toBe(pb[i]!.dur); });
  };

  it("右手の打点を消す＝そこは鳴らない・前は同じ", () => {
    const target = r0.rh.find((h) => h.step >= 40)!;
    const r = clone(r0); r.rh = r.rh.filter((h) => h !== r.rh.find((x) => x.step === target.step));
    const got = generateHandFrameBand(HALF, { ...BASE, rhythm: r });
    expect(shape(got).rh.has(target.step)).toBe(false);
    beforeEq(got, free, target.step);
  });

  it("器に無い16分の位置に和音を足す＝2音以上鳴る", () => {
    const step = 16 * 2 + 1;
    const r = clone(r0); r.rh.push({ step, kind: "grab" });
    const got = generateHandFrameBand(HALF, { ...BASE, rhythm: r });
    expect(shape(got).rh.get(step) ?? 0).toBeGreaterThanOrEqual(2);
    beforeEq(got, free, step);
  });

  it("和音⇔単音の入れ替え＝指定の種類で鳴る", () => {
    const g = r0.rh.find((h) => h.kind === "grab" && h.step > 8)!;
    const s = r0.rh.find((h) => h.kind === "single" && h.step > 8)!;
    const r = clone(r0);
    r.rh.find((h) => h.step === g.step)!.kind = "single";
    r.rh.find((h) => h.step === s.step)!.kind = "grab";
    const got = shape(generateHandFrameBand(HALF, { ...BASE, rhythm: r }));
    expect(got.rh.get(g.step)).toBe(1);
    expect(got.rh.get(s.step) ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("どんな指定でも、右手は指定の位置にだけ・指定の種類で鳴る（種いくつか・ランダムな編集）", () => {
    let x = 99;
    const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let trial = 0; trial < 20; trial++) {
      const r: HandFrameRhythm = { rh: [], lh: [] };
      for (let st = 0; st < 128; st++) {
        const u = rnd();
        if (u < 0.2) r.rh.push({ step: st, kind: "grab" });
        else if (u < 0.45) r.rh.push({ step: st, kind: "single" });
        if (rnd() < 0.08) r.lh.push(st);
      }
      const got = generateHandFrameBand(HALF, { ...BASE, seed: trial, rhythm: r });
      const sh = shape(got);
      expect([...sh.rh.keys()].sort((a, b) => a - b)).toEqual(r.rh.map((h) => h.step));
      for (const h of r.rh) expect(h.kind === "grab" ? sh.rh.get(h.step)! >= 2 : sh.rh.get(h.step) === 1).toBe(true);
      expect([...sh.lh].sort((a, b) => a - b)).toEqual(r.lh);
    }
  });

  it("左手＝指定の時に 3度と7度の殻を C3〜B3 で押さえ直す", () => {
    const r = clone(r0); r.lh = [0, 6, 20];
    const got = generateHandFrameBand(HALF, { ...BASE, rhythm: r });
    const L = got.content.notes.filter((_, i) => got.notes[i]![4] === "L");
    expect([...new Set(L.map((n) => stepOf(n.start)))]).toEqual([0, 6, 20]);
    for (const n of L) expect(n.pitch >= 48 && n.pitch <= 59).toBe(true);
    expect(L.filter((n) => stepOf(n.start) === 6).length).toBe(2);
  });
});
