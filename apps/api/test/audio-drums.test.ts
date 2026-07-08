import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  extractDrumPattern,
  transcribeFullSong,
  meterString,
  type DrumOnset,
} from "../src/audio-drums";

// #S12改 ドラム interpretation 層のTDD。窓分割×正準パターン型照合。
// 合成オンセット＝Python(perception)が出す drum_onsets を模す（差し替え不変の契約面）＋
// 実facts fixture（自作曲のみ・LostMemory=4/4・DeepSea=6+5変拍子）で実データ検証。

/** パターン仕様から複数小節の合成オンセットを作る。
 *  spec: lane -> 拍位置の配列（小節内・実数拍）。bars 小節ぶん繰り返す。 */
function synth(
  spec: Record<string, number[]>,
  opts: { bars?: number; bpm?: number; meter?: number; t0?: number; jitter?: number } = {},
): { onsets: DrumOnset[]; beatTimes: number[] } {
  const { bars = 24, bpm = 120, meter = 4, t0 = 0, jitter = 0 } = opts;
  const bp = 60 / bpm;
  const onsets: DrumOnset[] = [];
  let j = 0;
  for (let bar = 0; bar < bars; bar++) {
    for (const [kind, beats] of Object.entries(spec)) {
      for (const b of beats) {
        const jit = jitter ? ((j++ % 3) - 1) * jitter : 0;
        onsets.push([t0 + (bar * meter + b) * bp + jit, kind, 1]);
      }
    }
  }
  onsets.sort((a, b) => a[0] - b[0]);
  const nBeats = bars * meter + 4;
  const beatTimes = Array.from({ length: nBeats }, (_, i) => t0 + i * bp);
  return { onsets, beatTimes };
}

const lane = (r: { lanes: { name: string; hits: number[] }[] }, name: string) =>
  r.lanes.find((l) => l.name === name);

describe("extractDrumPattern（合成・4/4系）", () => {
  it("8ビートロック（kick1,3・snare2,4・hihat8分）→ meter=4 sub=4 高信頼・正パターン", () => {
    const { onsets, beatTimes } = synth({
      kick: [0, 2],
      snare: [1, 3],
      hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    });
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(4);
    expect(r.sub).toBe(4);
    expect(r.confidence).toBeGreaterThan(0.4);
    expect(r.rhythm.steps).toBe(16);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0, 8]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
    expect(lane(r.rhythm, "HiHat")!.hits).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(lane(r.rhythm, "Kick")!.midi).toBe(36);
    expect(lane(r.rhythm, "Snare")!.midi).toBe(38);
  });

  it("型（kick=頭/snare=バックビート）が downbeat を決める＝曲頭シフトでも小節頭に一致", () => {
    // 曲頭 t0=2.0s の8ビート。rock 型は半小節両義が無い（kick1,3↔snare2,4 が非対称）＝一意に解ける。
    const bpm = 120;
    const { onsets, beatTimes } = synth({ kick: [0, 2], snare: [1, 3] }, { t0: 2.0, bpm });
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(4);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
    // downbeat は小節頭のどれか＝(downbeat - 2.0) が小節長(2s)の整数倍
    expect(r.downbeat).not.toBeNull();
    const barLen = (60 / bpm) * 4;
    const rel = (r.downbeat! - 2.0) / barLen;
    expect(Math.abs(rel - Math.round(rel))).toBeLessThan(0.1);
  });

  it("4つ打ち＋バックビート＝半小節両義でもパターンは正規形（snare必ず4,12）", () => {
    const { onsets, beatTimes } = synth({ kick: [0, 1, 2, 3], snare: [1, 3] });
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(4);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0, 4, 8, 12]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
  });

  it("ジッタ±12msでも 8ビートを正しく抽出", () => {
    const { onsets, beatTimes } = synth(
      { kick: [0, 2], snare: [1, 3], hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
      { jitter: 0.012 },
    );
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(4);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0, 8]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
  });

  it("シャッフル（3連ハット＋バックビート）→ sub=3 検出・16分格子へスイング写像", () => {
    // ハット=拍頭+3連3つ目(2/3)＝シャッフル。16分格子では乗らない配置。
    const { onsets, beatTimes } = synth({
      kick: [0, 2],
      snare: [1, 3],
      hihat: [0, 2 / 3, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 2 / 3],
    });
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(4);
    expect(r.sub).toBe(3);
    expect(r.rhythm.steps).toBe(16); // 出力契約は常に 1step=16分
    // スイング写像: 3連{0,2}→16分{0,3} → ハットは 0,3,4,7,8,11,12,15
    expect(lane(r.rhythm, "HiHat")!.hits).toEqual([0, 3, 4, 7, 8, 11, 12, 15]);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0, 8]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
  });
});

describe("extractDrumPattern（3/4・6拍子）", () => {
  it("ワルツ（kick頭・snare2,3拍）→ meter=3 steps=12", () => {
    const { onsets, beatTimes } = synth({ kick: [0], snare: [1, 2] }, { meter: 3, bars: 32 });
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(3);
    expect(r.rhythm.steps).toBe(12);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 8]);
  });

  it("6拍子（オーナー型: kick頭・snare4拍目）→ meter=6 steps=24", () => {
    const { onsets, beatTimes } = synth(
      { kick: [0], snare: [3], hihat: [0, 1, 2, 3, 4, 5] },
      { meter: 6, bars: 24 },
    );
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.meter).toBe(6);
    expect(r.rhythm.steps).toBe(24);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([12]);
  });
});

describe("extractDrumPattern（グレースフルな諦め）", () => {
  it("6+5 交互の変拍子 → 低信頼（どの meter でも型が立たない）", () => {
    // 6拍小節と5拍小節が交互＝バー長も中身も揃わず窓 fold が滲む
    // （5拍側のパターンも変える＝「スパイスの変拍子小節はフレーズも崩す」現実の形）
    const bpm = 120;
    const bp = 60 / bpm;
    const onsets: DrumOnset[] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
      const m = i % 2 === 0 ? 6 : 5;
      for (const b of m === 6 ? [0, 2, 4] : [0, 3]) onsets.push([t + b * bp, "kick", 1]);
      onsets.push([t + (m === 6 ? 3 : 2) * bp, "snare", 1]);
      for (let b = 0; b < m; b++) onsets.push([t + b * bp, "hihat", 1]);
      t += m * bp;
    }
    const beatTimes = Array.from({ length: Math.ceil(t / bp) }, (_, i) => i * bp);
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.confidence).toBeLessThan(0.3);
  });

  it("オンセット無し → confidence=0・lanes空", () => {
    const beatTimes = Array.from({ length: 16 }, (_, i) => i * 0.5);
    const r = extractDrumPattern(beatTimes, []);
    expect(r.confidence).toBe(0);
    expect(r.rhythm.lanes).toEqual([]);
  });

  it("疎すぎるオンセット → 低信頼", () => {
    const beatTimes = Array.from({ length: 16 }, (_, i) => i * 0.5);
    const r = extractDrumPattern(beatTimes, [
      [0, "kick", 1],
      [2, "snare", 1],
    ]);
    expect(r.confidence).toBeLessThan(0.3);
  });

  it("forceMeter＝ユーザー指定は変拍子データでもその meter で折り畳む", () => {
    const bpm = 120;
    const bp = 60 / bpm;
    const onsets: DrumOnset[] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
      const m = i % 2 === 0 ? 6 : 5;
      for (const b of m === 6 ? [0, 2, 4] : [0, 2]) onsets.push([t + b * bp, "kick", 1]);
      onsets.push([t + 3 * bp, "snare", 1]);
      t += m * bp;
    }
    const beatTimes = Array.from({ length: Math.ceil(t / bp) }, (_, i) => i * bp);
    const r = extractDrumPattern(beatTimes, onsets, { forceMeter: 4 });
    expect(r.meter).toBe(4);
    expect(r.rhythm.steps).toBe(16);
  });
});

describe("transcribeFullSong（全曲書き起こし＝畳まない・小節ごとの実パターン）", () => {
  it("小節0-3と4-7で叩きが違う曲→各小節の生パターンをそのまま書き起こす（折り畳まない）", () => {
    // 前半4小節=8ビート(kick1,3)／後半4小節=4つ打ち(kick0,1,2,3)。hihatは全小節8分。
    const bpm = 120, bp = 60 / bpm, meter = 4;
    const onsets: DrumOnset[] = [];
    for (let bar = 0; bar < 8; bar++) {
      const kicks = bar < 4 ? [0, 2] : [0, 1, 2, 3];
      for (const b of kicks) onsets.push([(bar * meter + b) * bp, "kick", 1]);
      for (const b of [1, 3]) onsets.push([(bar * meter + b) * bp, "snare", 1]);
      for (const b of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) onsets.push([(bar * meter + b) * bp, "hihat", 1]);
    }
    onsets.sort((a, b) => a[0] - b[0]);
    const beatTimes = Array.from({ length: 8 * meter + 4 }, (_, i) => i * bp);
    const t = transcribeFullSong(beatTimes, onsets, { meter: 4, sub: 4, downbeat: 0 })!;
    expect(t).not.toBeNull();
    expect(t.bars).toBe(8);
    expect(t.steps).toBe(128); // 8小節×16
    // 前半小節=kick[0,8]・後半小節=kick[0,4,8,12]＝畳まず別々に出る
    expect(t.barPatterns[0]!.kick).toEqual([0, 8]);
    expect(t.barPatterns[4]!.kick).toEqual([0, 4, 8, 12]);
    expect(t.barPatterns[0]!.snare).toEqual([4, 12]);
    // 全曲通しの hits（小節2のキックは step 32,40）
    const kick = t.lanes.find((l) => l.name === "Kick")!.hits;
    expect(kick.slice(0, 4)).toEqual([0, 8, 16, 24]); // 小節0,1 の kick（各[0,8]）
    expect(kick).toContain(64); // 小節4 の頭
    expect(kick).toContain(68); // 小節4 の step4（4つ打ち）
  });

  it("downbeat未確定なら null（＝書き起こさない）", () => {
    const beatTimes = Array.from({ length: 16 }, (_, i) => i * 0.5);
    expect(transcribeFullSong(beatTimes, [[0, "kick", 1]], { meter: 4, sub: 4, downbeat: null })).toBeNull();
  });
});

describe("extractDrumPattern（実facts fixture＝自作曲）", () => {
  const fx = (name: string) =>
    JSON.parse(readFileSync(join(__dirname, "fixtures", `drum-facts-${name}.json`), "utf8")) as {
      beat_times: number[];
      drum_onsets: DrumOnset[];
    };

  it("LostMemory（打ち込み4/4）→ meter=4 sub=4 信頼>=0.3・スネアはバックビート", () => {
    const f = fx("lostmemory");
    const r = extractDrumPattern(f.beat_times, f.drum_onsets);
    expect(r.meter).toBe(4);
    expect(r.sub).toBe(4);
    expect(r.confidence).toBeGreaterThanOrEqual(0.3);
    const sn = lane(r.rhythm, "Snare")!;
    expect(sn.hits).toContain(4);
    expect(sn.hits).toContain(12);
  });

  it("DeepSea（6+5変拍子）→ 低信頼（捏造しない）", () => {
    const f = fx("deepsea");
    const r = extractDrumPattern(f.beat_times, f.drum_onsets);
    expect(r.confidence).toBeLessThan(0.3);
  });

  // SURFACE それじゃあバイバイ（他者曲＝factsをコミットしない）。ローカルにある時だけ実行。
  const surfacePath = "/tmp/drum_facts/surface.v3.json";
  it.skipIf(!existsSync(surfacePath))("SURFACE（実曲4/4シャッフル）→ meter=4 sub=3", () => {
    const f = JSON.parse(readFileSync(surfacePath, "utf8")) as {
      beat_times: number[];
      drum_onsets: DrumOnset[];
    };
    const r = extractDrumPattern(f.beat_times, f.drum_onsets);
    expect(r.meter).toBe(4);
    expect(r.sub).toBe(3);
  });
});

describe("meterString", () => {
  it("3→3/4・4→4/4・6→6/8", () => {
    expect(meterString(3)).toBe("3/4");
    expect(meterString(4)).toBe("4/4");
    expect(meterString(6)).toBe("6/8");
  });
});
