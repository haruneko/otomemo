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
import { genBass } from "../src/music/generate";
import { BF, CONDS, type Note } from "./fixtures/riffVariationConds";

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
