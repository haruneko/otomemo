import { describe, it, expect } from "vitest";
import { analyzeVoiceLeading } from "../src/music/voiceLeading";

// メロ×低音の声部進行レンズ（分析のみ・#8 2026-07-09）。対位法の客観違反を数える。
const n = (pitch: number, start: number, dur = 1) => ({ pitch, start, dur });

describe("analyzeVoiceLeading（メロ×低音の声部進行）", () => {
  it("① 並行5度＝両声部が完全5度を保ったまま同方向＝検出", () => {
    // 上:G4(67)→A4(69) 下:C3(48)→D3(50)。iv=19→19（%12=7）・両者+2＝並行5度。
    const r = analyzeVoiceLeading([n(67, 0), n(69, 1)], [n(48, 0), n(50, 1)]);
    expect(r.parallelFifths).toBe(1);
    expect(r.score).toBeLessThan(1);
  });

  it("② 並行8度＝完全8度を保ち同方向＝検出", () => {
    // 上:C5(72)→D5(74) 下:C4(60)→D4(62)。iv=12→12（%12=0）・両者+2＝並行8度。
    const r = analyzeVoiceLeading([n(72, 0), n(74, 1)], [n(60, 0), n(62, 1)]);
    expect(r.parallelOctaves).toBe(1);
  });

  it("③ 反行/斜行で完全協和を保っても並行ではない＝検出しない", () => {
    // 上:G4(67)→A4(69)(+2) 下:C3(48)→B2(47)(-1)＝反行。並行5度でない。
    const r = analyzeVoiceLeading([n(67, 0), n(69, 1)], [n(48, 0), n(47, 1)]);
    expect(r.parallelFifths).toBe(0);
  });

  it("④ 直行(隠伏)5度＝同方向＋上声跳躍で5度へ突入＝検出", () => {
    // 上:C4(60)→A4(69)(+9跳躍) 下:C3(48)→D3(50)(+2)。iv0=12(%0)→iv1=19(%7)・同方向・上声跳躍＝隠伏5度。
    const r = analyzeVoiceLeading([n(60, 0), n(69, 1)], [n(48, 0), n(50, 1)]);
    expect(r.directFifths).toBe(1);
  });

  it("⑤ 声部交差＝上声が下声より低い瞬間を検出", () => {
    const r = analyzeVoiceLeading([n(48, 0)], [n(60, 0)]);
    expect(r.voiceCrossings).toBe(1);
  });

  it("⑥ 綺麗な反行のみ＝違反ゼロ・score=1", () => {
    // 上:E4(64)→F4(65)(+1) 下:C4(60)→B3(59)(-1)＝反行・完全協和を跨がない。
    const r = analyzeVoiceLeading([n(64, 0), n(65, 1)], [n(60, 0), n(59, 1)]);
    expect(r.parallelFifths + r.parallelOctaves + r.directFifths + r.directOctaves + r.voiceCrossings).toBe(0);
    expect(r.score).toBe(1);
  });

  it("⑦ 空・単音でも落ちない（機会ゼロ=score1）", () => {
    expect(analyzeVoiceLeading([], []).score).toBe(1);
    expect(analyzeVoiceLeading([n(60, 0)], [n(48, 0)]).score).toBe(1);
  });
});
