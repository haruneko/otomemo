import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  extractDrumPattern,
  transcribeFullSong,
  extractSectionPatterns,
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

describe("extractDrumPattern（高BPM格子適応＝#γ・2026-07-15）", () => {
  // 決定的PRNG（テストが seed 固定で再現）。実オンセットの時刻ジッタ（STFTフレーム±23ms級）を模す。
  const mulberry32 = (a: number) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 8ビート（kick表・snareバックビート・8分ハット）を bpm・±J秒ジッタ・seedで合成。
  const synthJit = (bpm: number, J: number, seed: number, spec: Record<string, number[]>) => {
    const bars = 48, meter = 4, bp = 60 / bpm;
    const rnd = mulberry32(seed);
    const onsets: DrumOnset[] = [];
    for (let bar = 0; bar < bars; bar++)
      for (const [kind, beats] of Object.entries(spec))
        for (const b of beats) onsets.push([(bar * meter + b) * bp + (rnd() * 2 - 1) * J, kind, 1]);
    onsets.sort((a, b) => a[0] - b[0]);
    const beatTimes = Array.from({ length: bars * meter + 4 }, (_, i) => i * bp);
    return { onsets, beatTimes };
  };
  const rock8 = { kick: [0, 2], snare: [1, 3], hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] };

  it("235BPM 8ビート＋ジッタ±28ms → 8分格子適応で高信頼・正パターン（16分格子では滲んで死ぬ帯）", () => {
    // 235BPM の16分unit=63.8ms・採用窓 QUANT_TOL±30%=±19ms。±28msジッタは16分格子の位相集中を
    // 割る（適応前は conf≈0＝実測）が、8分格子(127.5ms・±38ms)は生き残る＝格子適応の効きを固定。
    const { onsets, beatTimes } = synthJit(235, 0.028, 1, rock8);
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.confidence).toBeGreaterThanOrEqual(0.3);
    expect(r.meter).toBe(4);
    expect(r.sub).toBe(4); // 出力の sub は検出値（ストレート）。8分照合は内部格子だけ＝契約は16分のまま
    expect(r.rhythm.steps).toBe(16);
    expect(lane(r.rhythm, "Kick")!.hits).toEqual([0, 8]);
    expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
  });

  it("適応は高BPMのみ発火＝閾値下(180BPM)は従来16分格子のまま不変・閾値上(235BPM)も同じ正パターン", () => {
    // 型追加(FAST_TEMPLATES)は matchSub===2 限定＝低中BPMの語彙・格子に一切影響しない構造保証。
    for (const bpm of [180, 235]) {
      const { onsets, beatTimes } = synthJit(bpm, 0.01, 7, rock8);
      const r = extractDrumPattern(beatTimes, onsets);
      expect(r.meter).toBe(4);
      expect(r.sub).toBe(4);
      expect(r.confidence).toBeGreaterThanOrEqual(0.3);
      expect(lane(r.rhythm, "Kick")!.hits).toEqual([0, 8]);
      expect(lane(r.rhythm, "Snare")!.hits).toEqual([4, 12]);
    }
  });

  it("決定的＝同一facts なら meter/conf は走行間で不変（タイブレークの非決定性緩和）", () => {
    const { onsets, beatTimes } = synthJit(235, 0.02, 3, rock8);
    const a = extractDrumPattern(beatTimes, onsets);
    const b = extractDrumPattern(beatTimes, onsets);
    expect(a.meter).toBe(b.meter);
    expect(a.confidence).toBe(b.confidence);
    expect(a.template).toBe(b.template);
  });

  it("λ弛緩(matchSub=2限定)でも捏造しない＝高BPM 6+5変拍子＋kickブリード → 低信頼", () => {
    // OVERLAP_LAMBDA_FAST=0.15（Fable裁定 2026-07-15）の弛緩しすぎ回帰防止。
    // ブリード（kick毎に同時刻の偽snare）があり、かつ型に居ない変拍子＝緩いλでも立ってはいけない。
    const bpm = 235, bp = 60 / bpm;
    const rnd = mulberry32(5);
    const onsets: DrumOnset[] = [];
    let t = 0;
    for (let i = 0; i < 80; i++) {
      const m = i % 2 === 0 ? 6 : 5;
      for (const b of m === 6 ? [0, 2, 4] : [0, 3]) {
        const tt = t + b * bp + (rnd() * 2 - 1) * 0.02;
        onsets.push([tt, "kick", 1], [tt, "snare", 0.6]); // snare側へのブリードを模す
      }
      onsets.push([t + (m === 6 ? 3 : 2) * bp + (rnd() * 2 - 1) * 0.02, "snare", 1]);
      for (let b = 0; b < m; b++) onsets.push([t + b * bp + (rnd() * 2 - 1) * 0.02, "hihat", 1]);
      t += m * bp;
    }
    onsets.sort((a, b) => a[0] - b[0]);
    const beatTimes = Array.from({ length: Math.ceil(t / bp) }, (_, i) => i * bp);
    const r = extractDrumPattern(beatTimes, onsets);
    expect(r.confidence).toBeLessThan(0.3);
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

describe("extractSectionPatterns（crash区間×区間ごと畳み＝理想の区間ネタ化）", () => {
  it("crashで区切った2区間で別グルーヴ→区間ごとに綺麗なパターン（畳みは区間内でのみ）", () => {
    const bpm = 120, bp = 60 / bpm, meter = 4;
    const onsets: DrumOnset[] = [];
    for (let bar = 0; bar < 32; bar++) {
      const kicks = bar < 16 ? [0, 2] : [0, 1, 2, 3]; // 前半=8ビート/後半=4つ打ち
      for (const b of kicks) onsets.push([(bar * meter + b) * bp, "kick", 1]);
      for (const b of [1, 3]) onsets.push([(bar * meter + b) * bp, "snare", 1]);
      for (const b of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) onsets.push([(bar * meter + b) * bp, "hihat", 1]);
    }
    // 各区間の頭にクラッシュ（bar0・bar16）
    onsets.push([0, "crash", 5], [16 * meter * bp, "crash", 5]);
    onsets.sort((a, b) => a[0] - b[0]);
    const beatTimes = Array.from({ length: 32 * meter + 4 }, (_, i) => i * bp);
    const secs = extractSectionPatterns(beatTimes, onsets);
    expect(secs.length).toBe(2);
    const k = (s: (typeof secs)[number]) => s.pattern.rhythm.lanes.find((l) => l.name === "Kick")!.hits;
    expect(k(secs[0]!)).toEqual([0, 8]); // 前半区間=8ビート
    expect(k(secs[1]!)).toEqual([0, 4, 8, 12]); // 後半区間=四つ打ち
    expect(secs[0]!.pattern.meter).toBe(4);
  });

  it("crash無し→全曲1区間として畳む（後方互換）", () => {
    const { onsets, beatTimes } = synth({ kick: [0, 2], snare: [1, 3], hihat: [0, 1, 2, 3] }, { bars: 24 });
    const secs = extractSectionPatterns(beatTimes, onsets);
    expect(secs.length).toBe(1);
    expect(secs[0]!.pattern.rhythm.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0, 8]);
    expect(secs[0]!.pattern.rhythm.lanes.find((l) => l.name === "Crash")).toBeUndefined(); // crash無→レーン無
  });

  it("区間頭のcrashが Crash レーン(midi49)として step0 に載る＝弾き直せる", () => {
    const bpm = 120, bp = 60 / bpm, meter = 4;
    const onsets: DrumOnset[] = [];
    for (let bar = 0; bar < 32; bar++) {
      const kicks = bar < 16 ? [0, 2] : [0, 1, 2, 3];
      for (const b of kicks) onsets.push([(bar * meter + b) * bp, "kick", 1]);
      for (const b of [1, 3]) onsets.push([(bar * meter + b) * bp, "snare", 1]);
      for (const b of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) onsets.push([(bar * meter + b) * bp, "hihat", 1]);
    }
    onsets.push([0, "crash", 5], [16 * meter * bp, "crash", 5]); // 各区間頭にcrash
    onsets.sort((a, b) => a[0] - b[0]);
    const beatTimes = Array.from({ length: 32 * meter + 4 }, (_, i) => i * bp);
    const secs = extractSectionPatterns(beatTimes, onsets);
    for (const s of secs) {
      const cr = s.pattern.rhythm.lanes.find((l) => l.name === "Crash");
      expect(cr).toBeDefined();
      expect(cr!.midi).toBe(49);
      expect(cr!.hits).toEqual([0]); // 区間頭＝step0
    }
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
