import { describe, it, expect } from "vitest";
// 耳FB(2026-07-08)対応：frame.mode一級化＋density/swingノブの契約（design#12-M）。
// 背景＝Section自動生成が (1)mode無しで短調でもメジャー生成 (2)配置でメロだけ+3移調 → 濁り/変な跳躍。
import { genMelody, genChords } from "../src/music/generate";

type N = { pitch: number; start: number; dur: number };
const notesOf = (r: { items: { content: unknown }[] }): N[] => (r.items[0]!.content as { notes: N[] }).notes;

// Am の導音なし進行（i ♭VI ♭VII i ×2）＝spRaised が発火しない＝出力は純粋な自然的短音階のはず。
const AM_CHORDS = [9, 5, 7, 9, 5, 7, 9, 9].map((root, i) => ({ root, quality: root === 9 ? "m" : "", start: i * 4, dur: 4 }));

describe("frame.mode 一級化（短調セクションの生成文脈）", () => {
  it("mode:'minor' でメロがAメジャー音(C#/F#/G#)を歌わない（旧: mood無しだと常にメジャースケール）", () => {
    const majorOnly = new Set([1, 6, 8]); // A major にだけある pc
    for (const seed of [1, 5, 9]) {
      const r = genMelody({ key: 9, bars: 8, mode: "minor" }, AM_CHORDS, seed, { useV2: true });
      for (const n of notesOf(r)) {
        const pc = ((n.pitch % 12) + 12) % 12;
        expect(majorOnly.has(pc), `seed=${seed} t=${n.start} pc=${pc}`).toBe(false);
      }
    }
  });
  it("mode は mood より優先・mood フォールバックは従来通り", () => {
    const a = genMelody({ key: 9, bars: 4, mode: "minor", mood: "明るい" }, AM_CHORDS, 3, { useV2: true });
    const majorOnly = new Set([1, 6, 8]);
    for (const n of notesOf(a)) expect(majorOnly.has(((n.pitch % 12) + 12) % 12)).toBe(false);
    const b = genChords({ bars: 4, mood: "切ない" }, 3); // moodだけ＝従来のマイナー判定
    expect(((b.items[0]!.content as { chords: { quality: string }[] }).chords[0]!.quality)).toBe("m");
  });
  it("genChords も mode:'minor' で i 始まり（mood不要）", () => {
    const r = genChords({ bars: 4, key: 9, mode: "minor" }, 3);
    const c0 = (r.items[0]!.content as { chords: { root: number; quality: string }[] }).chords[0]!;
    expect(c0).toEqual(expect.objectContaining({ root: 9, quality: "m" }));
  });
});

describe("density（細かさ）/ swing（跳ね）ノブ", () => {
  const CHORDS = [0, 5, 7, 0].map((root, i) => ({ root, quality: "", start: i * 8, dur: 8 }));
  it("density 高は低より音数が多い（8seed平均・単調性）", () => {
    let lo = 0, hi = 0;
    for (let seed = 1; seed <= 8; seed++) {
      lo += notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, seed, { useV2: true, density: 0.1 })).length;
      hi += notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, seed, { useV2: true, density: 0.9 })).length;
    }
    expect(hi).toBeGreaterThan(lo * 1.2); // 明確な差（>20%）
  });
  it("swing=1 で8分裏が 2/3 位置へ・音は重ならない", () => {
    for (const seed of [2, 7]) {
      const notes = notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, seed, { useV2: true, swing: 1 }));
      const sorted = [...notes].sort((a, b) => a.start - b.start);
      let sawSwung = false;
      for (let i = 0; i < sorted.length; i++) {
        const frac = ((sorted[i]!.start % 1) + 1) % 1;
        expect(Math.abs(frac - 0.5) < 0.01, `t=${sorted[i]!.start}: 素の8分裏が残っている`).toBe(false);
        if (Math.abs(frac - 2 / 3) < 0.02) sawSwung = true;
        if (i + 1 < sorted.length) expect(sorted[i]!.start + sorted[i]!.dur).toBeLessThanOrEqual(sorted[i + 1]!.start + 1e-6);
      }
      expect(sawSwung).toBe(true); // 跳ねた音が実在
    }
  });
  it("ノブ未指定は従来挙動と一致（後方互換）", () => {
    const a = notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, 5, { useV2: true }));
    const b = notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, 5, { useV2: true, density: undefined, swing: undefined }));
    expect(b).toEqual(a);
  });
});
