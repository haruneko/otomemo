// 画面 B（生成したピアノ伴奏の編集・2026-09-23 裁定）のマス目操作と弾き直しの結線。
import { describe, expect, it } from "vitest";
import { handFrameToChordPattern, regenerateHandFrameContent, rhythmOfExplicit } from "@cm/music-core";
import { chordsOfGen, cycleRhCell, isGeneratedPiano, toggleLhCell } from "../src/components/PianoAccompEditor";
import { notesForContent } from "../src/music";

const PROG = [{ root: "F", quality: "maj7", beats: 4 }, { root: "G", quality: "", beats: 4 }, { root: "E", quality: "m7", beats: 4 }, { root: "A", quality: "m7", beats: 2 }, { root: "G", quality: "", beats: 2 }];
const made = handFrameToChordPattern(PROG, { tempo: 96, seed: 3, key: 0 }).content;

describe("画面 B", () => {
  it("生成したピアノ伴奏だけを画面 B で開く", () => {
    expect(isGeneratedPiano(made)).toBe(true);
    expect(isGeneratedPiano({ mode: "strum", hits: [] })).toBe(false);
    expect(isGeneratedPiano({ gen: { engine: "handframe" } })).toBe(false); // 弾き直しの文脈が無い古い内容は従来の画面
  });
  it("右手のマス＝空→和音→単音→空・左手＝入れ替え", () => {
    let r = { rh: [] as { step: number; kind: "grab" | "single" }[], lh: [] as number[] };
    r = cycleRhCell(r, 5); expect(r.rh).toEqual([{ step: 5, kind: "grab" }]);
    r = cycleRhCell(r, 5); expect(r.rh).toEqual([{ step: 5, kind: "single" }]);
    r = cycleRhCell(r, 5); expect(r.rh).toEqual([]);
    r = toggleLhCell(toggleLhCell(r, 8), 0); expect(r.lh).toEqual([0, 8]);
    expect(toggleLhCell(r, 8).lh).toEqual([0]);
  });
  it("マスを変えて弾き直すと、実際に鳴る音がその位置で変わる（単音にした所は1音で鳴る）", () => {
    const r = rhythmOfExplicit(made);
    const g = r.rh.find((h) => h.kind === "grab" && h.step % 8 !== 0 && !r.lh.includes(h.step))!; // 左手が押さえない位置＝右手だけを数える
    const next = regenerateHandFrameContent(made, { rhythm: cycleRhCell(r, g.step) }); // 和音→単音
    const ctx = { key: 0, chords: chordsOfGen(made) };
    const at = (c: unknown, step: number) => notesForContent("chord_pattern", c, ctx).filter((n) => Math.abs(n.start - step / 4) < 1e-6).length;
    expect(at(made, g.step)).toBeGreaterThanOrEqual(2);
    expect(at(next, g.step)).toBe(1);
  });
});
