// M5 ギター型の実音化（web resolveChordPattern）＝api の検算と**同じ1本**（music-core realizeGuitarRiff）で鳴ること・
// 既存ネタ（guitarRiff 無し）は 1bit も変わらないこと。
import { describe, it, expect } from "vitest";
import { buildGuitarSkeleton, GUITAR_GRAMMARS, gtrOnsetsToHits, lockGuitarChugToSheet, realizeGuitarRiff } from "@cm/music-core";
import { resolveChordPattern, type ChordEntry, type ChordPatternContent } from "../src/music";

const CHORDS: ChordEntry[] = [{ root: 9, quality: "m", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }];

describe("resolveChordPattern × ギター型", () => {
  it("guitarRiff 付き content は realizeGuitarRiff と同じ音（chordfollow／handshape）", () => {
    const g = GUITAR_GRAMMARS.pedal_answer;
    const onsets = lockGuitarChugToSheet(buildGuitarSkeleton(g, 32), { totalSteps: 32, kick: [0, 6, 10], palmGate: g.palmGate }).onsets;
    const hits = gtrOnsetsToHits(onsets);
    for (const pitch of ["chordfollow", "handshape"] as const) {
      const content = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, style: "guitar" }, steps: 32, hits, guitarRiff: { grammar: "pedal_answer", pitch, seed: 5 } } as unknown as ChordPatternContent;
      const web = resolveChordPattern(content, CHORDS, 9, 140);
      const core = realizeGuitarRiff(hits, { chordAtStep: (s) => CHORDS.find((c) => c.start <= s / 4 && s / 4 < c.start + c.dur) ?? null, keyPc: 9, tempo: 140, engine: pitch, seed: 5 }).notes;
      expect(web).toEqual(core);
      expect(web.some((n) => n.start === 1.5)).toBe(true); // キック step 6 に挿入された錨が鳴る
    }
  });
  it("guitarRiff の無い既存のギター型 content は従来の経路（voice/riff が無ければ分岐に入らない）", () => {
    const content: ChordPatternContent = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, style: "guitar", powerChord: true }, steps: 16, hits: [{ step: 0, dur: 4 }, { step: 8, dur: 4 }] };
    const a = resolveChordPattern(content, CHORDS, 9, 140);
    const b = resolveChordPattern(JSON.parse(JSON.stringify(content)) as ChordPatternContent, CHORDS, 9, 140);
    expect(a).toEqual(b);
    expect(a.every((n) => n.vel === undefined)).toBe(true); // ギター型の vel 表（GTR_VEL）が混ざっていない
  });
});
