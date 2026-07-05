import { describe, it, expect } from "vitest";
import { genChords, planSkeletonTones } from "../src/music/generate";
import { chordPcs, scalePcs } from "../src/music/theory";
import { meterInfo } from "../src/music/meter";

// S6-a（spec §10.7）：骨格音＝和声連動の「連結ピラー＋頂点一音」。
// 幾何アーチに各小節を独立スナップしていた旧実装の「彷徨い」を、前の骨格音から繋がる選択に置換。
// 不変条件：各骨格音は その小節のコードトーン／音域内／連結（隣との跳びが小）／頂点は0.62に一音だけ。

type Chord = { root: number; quality: string; start: number; dur: number };
const chordsOf = (r: ReturnType<typeof genChords>): Chord[] =>
  (r.items[0]!.content as { chords: Chord[] }).chords;
const pc = (p: number) => ((p % 12) + 12) % 12;
const chordAtBar = (chords: Chord[], beat: number): Chord | undefined =>
  chords.find((c) => c.start <= beat + 1e-6 && beat < c.start + c.dur - 1e-6);

const MOODS = ["", "明るい", "ダンス"]; // major mood（mode=major で照合）
const METERS = ["4/4", "3/4", "6/8"];
const BARS = [4, 7, 8];
const SEEDS = [0, 1, 42];
const KEYS = [0, 7];

function* cases(): Generator<{ bars: number; meter: string; mood: string; seed: number; key: number }> {
  for (const meter of METERS)
    for (const mood of MOODS)
      for (const bars of BARS) for (const seed of SEEDS) for (const key of KEYS) yield { bars, meter, mood, seed, key };
}

const planFor = (c: { bars: number; meter: string; mood: string; seed: number; key: number }) => {
  const chords = chordsOf(genChords({ meter: c.meter, mood: c.mood, bars: c.bars, key: c.key }, c.seed));
  const bpb = meterInfo(c.meter).beatsPerBar;
  const scale = scalePcs(c.key, "major");
  return { skel: planSkeletonTones(c.bars, chords, bpb, scale, { lo: 60, hi: 84 }), chords, bpb };
};

describe("S6-a planSkeletonTones：和声連動の連結骨格＋頂点一音", () => {
  it("小節数ぶん・音域[60,84]・各音はその小節のコードトーン", () => {
    for (const c of cases()) {
      const { skel, chords, bpb } = planFor(c);
      const w = `${c.meter}/${c.mood}/${c.bars}#${c.seed}K${c.key}`;
      expect(skel.length, `本数: ${w}`).toBe(c.bars);
      for (let bar = 0; bar < c.bars; bar++) {
        const p = skel[bar]!;
        expect(p >= 60 && p <= 84, `音域: ${w}[${bar}]=${p}`).toBe(true);
        const ch = chordAtBar(chords, bar * bpb);
        if (ch) {
          const tones = new Set(chordPcs(ch.root, ch.quality ?? ""));
          expect(tones.has(pc(p)), `コードトーン: ${w}[${bar}] pc=${pc(p)}`).toBe(true);
        }
      }
    }
  });

  it("連結：隣り合う骨格音の平均跳躍が小さい（彷徨わない）", () => {
    for (const c of cases()) {
      const { skel } = planFor(c);
      let sum = 0;
      for (let i = 1; i < skel.length; i++) sum += Math.abs(skel[i]! - skel[i - 1]!);
      const mean = sum / Math.max(1, skel.length - 1);
      expect(mean, `平均跳躍 ${c.meter}/${c.mood}/${c.bars}#${c.seed}K${c.key} = ${mean.toFixed(1)}`).toBeLessThanOrEqual(7);
    }
  });

  it("頂点一音：最高骨格音は ≈0.62 の小節に唯一", () => {
    for (const c of cases()) {
      const { skel } = planFor(c);
      const climax = Math.round((c.bars - 1) * 0.62);
      const max = Math.max(...skel);
      const argmaxCount = skel.filter((p) => p === max).length;
      const w = `${c.meter}/${c.mood}/${c.bars}#${c.seed}K${c.key}`;
      expect(skel[climax], `頂点位置: ${w} climax=${climax}`).toBe(max);
      expect(argmaxCount, `頂点は唯一: ${w}`).toBe(1);
    }
  });

  it("決定的（純関数・同入力同出力）", () => {
    const c = { bars: 8, meter: "4/4", mood: "明るい", seed: 5, key: 0 };
    const chords = chordsOf(genChords({ meter: c.meter, mood: c.mood, bars: c.bars, key: c.key }, c.seed));
    const bpb = meterInfo(c.meter).beatsPerBar;
    const scale = scalePcs(0, "major");
    const a = planSkeletonTones(8, chords, bpb, scale, { lo: 60, hi: 84 });
    const b = planSkeletonTones(8, chords, bpb, scale, { lo: 60, hi: 84 });
    expect(a).toEqual(b);
  });
});
