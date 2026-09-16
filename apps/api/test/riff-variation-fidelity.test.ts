// 繰り返しに変奏の層（design.md 追補 (k-7)）＝「層が出したセル → 最終の音」の対応（2026-09-16 監査 中①）。
// 監査の変異 M1（ベースの半音→度数の表から b3 を抜く）・M5（3枚目以降の反復を1小節ずらす）が全テスト緑で通った穴を塞ぐ。
// 8小節（反復4枚＝断片化〔多めの偶数枚目〕・3枚目以降・最後の拡大の経路を全部通す）で、varyRiffTiles が返したタイルを横取りし、
//   ① 層が出した発音セル（キック以外）は、最終 notes の同じ時刻に、そのコードのルートから deg 半音（pc で）の音として在る
//   ② 最終 notes のキック以外の音は、どれも層が出した発音セルに対応する（ずれた／余計な音が無い）
// を確かめる。錨（キック step）は層の後で置かれる＝対応の対象外。後段（fill/approach/chordFollow）は付けない。
import { describe, it, expect, vi } from "vitest";
const cap = vi.hoisted(() => ({ level: 0 as number, last: null as null | { index: number; cells: { step: number; kind: string; deg: number }[] }[] }));
vi.mock("@cm/music-core", async (orig) => {
  const m = await orig<typeof import("@cm/music-core")>();
  return { ...m, varyRiffTiles: (t: Parameters<typeof m.varyRiffTiles>[0], o: Parameters<typeof m.varyRiffTiles>[1]) => { const r = m.varyRiffTiles(t, o); if (o.level === cap.level) cap.last = r.tiles; return r; } }; // 打ち消し・段どうしの比較で別の level も呼ばれる＝狙いの level だけ取る
});
import { genBass, genDrums, type DrumsInput } from "../src/music/generate";
import type { Note } from "./fixtures/riffVariationConds";

const BARS = 8;
const F = { meter: "4/4", bars: BARS, key: 0 };
const PROG: [number, string][] = [[9, "m"], [5, ""], [0, ""], [7, ""]];
const CS = Array.from({ length: BARS }, (_, i) => ({ root: PROG[i % 4]![0], quality: PROG[i % 4]![1], start: i * 4, dur: 4 }));
const pc = (p: number) => ((p % 12) + 12) % 12;

describe("監査 中①：層の出力 → 最終 notes の対応（8小節・文法3×ドラム3×seed3×中/多め）", () => {
  it("発音セルと最終の音（キック以外）が時刻・pc で1対1に対応する", () => {
    let checked = 0, fragmentSeen = 0;
    for (const grammar of ["pedal_answer", "gallop_pedal", "octave_call_response"]) for (const ds of ["beat8.basic", "four.rock", "beat16.ghost"]) for (const seed of [7, 21, 42]) for (const v of [0.5, 1]) {
      const drums = genDrums(F, 1, { style: ds }).items[0]!.content as DrumsInput;
      const r = drums.rhythm!;
      const kick = new Set(r.lanes!.find((l) => l.midi === 36)!.hits!.map((s) => s * (16 / r.steps!)));
      cap.last = null; cap.level = v;
      const notes = (genBass(F, CS, seed, drums, { anchorLock: true, anchorGrammar: grammar, riffVariation: v }).items[0]!.content as { notes: Note[] }).notes;
      const tag = `${grammar} ${ds} s${seed} v${v}`;
      expect(cap.last, tag).not.toBeNull();
      expect(cap.last!.length, tag).toBe(BARS / 2);
      const want = new Map<number, number>(); // global step → 期待 pc
      for (const t of cap.last!) for (const c of t.cells) {
        const g = t.index * 32 + c.step;
        if (c.kind === "ghost" || c.kind === "dead" || kick.has(g % 16)) continue;
        want.set(g, pc(CS[Math.floor(g / 16)]!.root + c.deg));
      }
      if (v === 1 && cap.last!.some((t) => t.index === 2 && t.cells.length < cap.last![0]!.cells.length)) fragmentSeen++;
      const got = new Map<number, number>();
      for (const n of notes) { const g = Math.round(n.start * 4); if (!kick.has(g % 16)) got.set(g, pc(n.pitch)); }
      expect([...got.entries()].sort((a, b) => a[0] - b[0]), tag).toEqual([...want.entries()].sort((a, b) => a[0] - b[0]));
      checked++;
    }
    expect(checked).toBe(3 * 3 * 3 * 2);
    expect(fragmentSeen, "断片化の経路（3枚目＝index 2）を実際に通っている").toBeGreaterThan(0);
  });
});
