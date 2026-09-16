// 繰り返しに変奏の層（design.md 追補 (k-7)）の変異検査＝api 経路（S2 ベース・S3 ギター）。
// music-core の varyRiffTiles を差し替えて、摂動テスト／診断が本当に落ちる（動く）かを確かめる。
//   m-a 層を恒等関数に差し替える → 摂動（最終出力が level 0 と違う条件の存在）が落ち、打ち消し警告が全条件に出る
//   m-e 保護集合を空にする → 診断（変わった音の総数）が動く＝感度がある
import { describe, it, expect, vi, afterEach } from "vitest";
const mut = vi.hoisted(() => ({ mode: "none" as "none" | "identity" | "noprotect" }));
vi.mock("@cm/music-core", async (orig) => {
  const m = await orig<typeof import("@cm/music-core")>();
  return {
    ...m,
    varyRiffTiles: (t: Parameters<typeof m.varyRiffTiles>[0], o: Parameters<typeof m.varyRiffTiles>[1]) =>
      mut.mode === "identity" ? { tiles: t.map((x) => ({ ...x, cells: x.cells.map((c) => ({ ...c })) })), report: { tiles: [] } }
      : m.varyRiffTiles(t, mut.mode === "noprotect" ? { ...o, protectedSteps: new Set<number>() } : o),
  };
});
import { genBass, genChordPattern } from "../src/music/generate";
import { realizeGuitarRiff, type GtrRealizeHit } from "@cm/music-core";
import { BF, CONDS, PROGS, drumsOf, type Note, type Chord } from "./fixtures/riffVariationConds";

const notesOf = (r: ReturnType<typeof genBass>) => (r.items[0]!.content as { notes: Note[] }).notes;
function bassSweep() {
  let changedCond = 0, cancel = 0, symDiff = 0;
  for (const c of CONDS) {
    const r0 = notesOf(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true }));
    const r = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 1 });
    const n = notesOf(r);
    if (JSON.stringify(n) !== JSON.stringify(r0)) changedCond++;
    if (r.meta?.warnings?.some((w) => w.includes("打ち消され"))) cancel++;
    const key = (x: Note) => `${x.pitch}@${x.start}/${x.dur}`;
    const a = new Set(r0.map(key)), b = new Set(n.map(key));
    symDiff += [...b].filter((x) => !a.has(x)).length + [...a].filter((x) => !b.has(x)).length;
  }
  return { changedCond, cancel, symDiff };
}

afterEach(() => { mut.mode = "none"; });

describe("変異検査：ベース（S2）", () => {
  it("陽性対照：無傷なら摂動が存在し、打ち消し警告は変化の無い条件だけ", () => {
    const s = bassSweep();
    expect(s.changedCond).toBeGreaterThan(0);
    expect(s.cancel).toBe(CONDS.length - s.changedCond);
  });
  it("m-a 層を恒等に → 摂動が落ちる（変化 0 条件）・全条件で打ち消し警告", () => {
    mut.mode = "identity";
    const s = bassSweep();
    expect(s.changedCond).toBe(0);
    expect(s.cancel).toBe(CONDS.length);
  });
  it("m-e 保護集合を空に → 診断（変わった音の総数）が動く", () => {
    const base = bassSweep();
    mut.mode = "noprotect";
    const s = bassSweep();
    expect(s.symDiff).not.toBe(base.symDiff);
  });
});

const GCONDS = ["power_chug", "pedal_answer", "gallop"].flatMap((g) => Object.values(PROGS).flatMap((cs) =>
  ([["beat8.basic", 7], ["beat16.basic", 21], ["beat8.syncopated", 42]] as const).map(([ds, seed]) => ({ g, cs, drums: drumsOf(ds), seed }))));
function guitarSweep() {
  let changedCond = 0, cancel = 0, symDiff = 0;
  for (const c of GCONDS) {
    const o = { guitarRiff: c.g, anchorLock: true, drums: c.drums, chords: c.cs };
    const ca = (x: Chord[], b: number) => x.find((y) => y.start <= b + 1e-9 && b < y.start + y.dur - 1e-9) ?? x[x.length - 1]!;
    const real = (r: ReturnType<typeof genChordPattern>) => realizeGuitarRiff((r.items[0]!.content as { hits: GtrRealizeHit[] }).hits, { chordAtStep: (s) => ca(c.cs, s * 0.25), keyPc: 0, tempo: 120, engine: "chordfollow", seed: 5 }).notes;
    const n0 = real(genChordPattern(BF, c.seed, o));
    const r = genChordPattern(BF, c.seed, { ...o, riffVariation: 1 });
    const n = real(r);
    if (JSON.stringify(n) !== JSON.stringify(n0)) changedCond++;
    if (r.meta?.warnings?.some((w) => w.includes("打ち消され"))) cancel++;
    const key = (x: { pitch: number; start: number; dur: number }) => `${x.pitch}@${x.start}/${x.dur}`;
    const a = new Set(n0.map(key)), b = new Set(n.map(key));
    symDiff += [...b].filter((x) => !a.has(x)).length + [...a].filter((x) => !b.has(x)).length;
  }
  return { changedCond, cancel, symDiff };
}

describe("変異検査：ギター（S3・ロック中）", () => {
  it("陽性対照：無傷なら摂動が存在する", () => {
    const s = guitarSweep();
    expect(s.changedCond).toBeGreaterThan(0);
    expect(s.cancel).toBe(GCONDS.length - s.changedCond);
  });
  it("m-a 層を恒等に → 摂動が落ちる・全条件で打ち消し警告", () => {
    mut.mode = "identity";
    const s = guitarSweep();
    expect(s.changedCond).toBe(0);
    expect(s.cancel).toBe(GCONDS.length);
  });
  it("m-e 保護集合を空に → 診断（変わった音の総数）が動く", () => {
    const base = guitarSweep();
    mut.mode = "noprotect";
    const s = guitarSweep();
    expect(s.symDiff).not.toBe(base.symDiff);
  });
});
