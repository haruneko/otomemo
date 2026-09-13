// M6a-6a 鍵盤の隙間刺し＝到達口④（web の実音化）。api が返す相対形（keyboard strum の hits）を web resolveChordPattern が
// 既存の経路で鳴らし、**鳴った音**がキックの拍に重ならずスネアの拍に在ること（純関数の出口でなく実音に assert）。
import { describe, it, expect } from "vitest";
import { keyStabSlots, keyStabHits } from "@cm/music-core";
import { resolveChordPattern, type ChordEntry, type ChordPatternContent } from "../src/music";

const CHORDS: ChordEntry[] = [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 9, quality: "m", start: 4, dur: 4 }];
const KICK = [0, 6, 10];
const SNARE = [4, 12];

describe("resolveChordPattern × 鍵盤の隙間刺し", () => {
  const { slots } = keyStabSlots({ onsets: [...KICK, ...SNARE], kick: KICK, accents: [] });
  const content = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 32, hits: keyStabHits(slots, 2, 112), keyStab: {}, engine: { version: "pm-1.0.0" } } as unknown as ChordPatternContent;
  it("鳴った音はスネアの拍（1・3 拍＝beat 1,3,5,7）だけ・キックの拍に0・各刺しが和音", () => {
    const notes = resolveChordPattern(content, CHORDS, 0, 120);
    const starts = [...new Set(notes.map((n) => n.start))].sort((a, b) => a - b);
    expect(starts).toEqual([1, 3, 5, 7]);
    const kickBeats = new Set([0, 1, 2].flatMap((b) => KICK.map((k) => b * 4 + k / 4)));
    expect(notes.filter((n) => kickBeats.has(n.start)).length).toBe(0);
    for (const s of starts) expect(notes.filter((n) => n.start === s).length).toBeGreaterThanOrEqual(3);
    // 変異：刺しを1つキックの位置（step 6）へ動かすとキック重なりが出る＝この assert は空虚でない
    const bad = { ...content, hits: content.hits.map((h, i) => (i === 0 ? { ...h, step: 6 } : h)) } as ChordPatternContent;
    expect(resolveChordPattern(bad, CHORDS, 0, 120).filter((n) => kickBeats.has(n.start)).length).toBeGreaterThan(0);
  });
  it("keyStab/engine を剥がした content と同じ音（web は新キーで分岐しない＝既存経路で鳴る）", () => {
    const plain = JSON.parse(JSON.stringify(content)) as ChordPatternContent & { keyStab?: unknown; engine?: unknown };
    delete plain.keyStab; delete plain.engine;
    expect(resolveChordPattern(content, CHORDS, 0, 120)).toEqual(resolveChordPattern(plain, CHORDS, 0, 120));
  });
});
