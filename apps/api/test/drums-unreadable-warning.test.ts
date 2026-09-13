// 2026-09-13 M5 監査 軽微-1：drums を送ったのに形式が読めない（beatsPerStep 抜け等）時、「ドラムが無い」と言わない。
//   通知が嘘をつくのがいちばん悪い＝落ち先を言い分ける。経路の判定は従来どおり（出音は不変＝落ちた時の従来出力と一致）。
import { describe, it, expect } from "vitest";
import { genChordPattern, genBass, type DrumsInput } from "../src/music/generate";

const FRAME = { bars: 4, meter: "4/4", key: 9, tempo: 140 };
const CHORDS = [{ root: 9, quality: "m", start: 0, dur: 16 }];
const NO_BPS = { rhythm: { steps: 16, bars: 1, lanes: [{ name: "Kick", midi: 36, hits: [0, 6, 10] }, { name: "Snare", midi: 38, hits: [4, 12] }] } } as DrumsInput;
type R = { items: { content: unknown }[]; meta?: { warnings?: string[] } };
const w = (r: unknown) => (r as R).meta?.warnings ?? [];

describe("drums が読めない時は「ドラムが無い」と言わない（落ち先の言い分け）", () => {
  it("ギターの chug ロック", () => {
    const r = genChordPattern(FRAME, 1, { guitarRiff: "gallop", anchorLock: true, drums: NO_BPS } as never);
    expect(w(r).some((x) => x.includes("ドラムの形式が読めない"))).toBe(true);
    expect(w(r).some((x) => x.includes("ドラムが無い"))).toBe(false);
    // 出音は drums 無しで落ちた時と同じ
    const none = genChordPattern(FRAME, 1, { guitarRiff: "gallop", anchorLock: true } as never);
    expect((r as R).items).toEqual((none as R).items);
    expect(w(none).some((x) => x.includes("ドラムが無い"))).toBe(true);
  });
  it("鍵盤の隙間刺し", () => {
    const r = genChordPattern(FRAME, 1, { keyStab: true, drums: NO_BPS } as never);
    expect(w(r).some((x) => x.includes("ドラムの形式が読めない"))).toBe(true);
    expect(w(r).some((x) => x.includes("ドラムが無い"))).toBe(false);
  });
  it("ベースの「キックにルートを置く」", () => {
    const r = genBass(FRAME, CHORDS, 1, NO_BPS, { anchorLock: true } as never);
    expect(w(r).some((x) => x.includes("ドラムの形式が読めない"))).toBe(true);
    expect(w(r).some((x) => x.includes("ドラムが無い"))).toBe(false);
    expect((r as R).items).toEqual((genBass(FRAME, CHORDS, 1, undefined, { anchorLock: true } as never) as R).items);
  });
});
