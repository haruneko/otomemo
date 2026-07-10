// gen_melody×ドラム結線（2026-07-10・design「gen_melody×ドラム結線」・
// research/2026-07-10-melody-groove-drum-interaction.md）。契約：
// (a) drums無し or 全係数0 で従来と bit 一致（鉄則）＋パターン長不一致は防御で従来
// (b) B(backbeat)＝スネア/キック実在位置の vel だけ上がる・onset/pitch/dur 一切不変
// (c) A(drumLock)＝「16分前に実キックが食う拍頭」の音だけ16分前借り（タイ＝終端不変）・push との合成＝
//     音単位の排他（二重前借り不可）・上限≤2/小節・終止/曲頭不変
// (d) C(converse)＝ドラム密ブロックで音数減・疎ブロックで増（統計）・一様密度なら bit 一致
// (e) 決定性。＋API配線（/music/gen_melody・/gen/section の rhythm→melody 結線）。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genMelody, genDrums, type Frame, type DrumsInput } from "../src/music/generate";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { scalePcs, chordPcs } from "../src/music/theory";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

type Note = { pitch: number; start: number; dur: number; vel?: number };
const J = (x: unknown) => JSON.stringify(x);
const motif16 = loadMotifModel16();

// V2テストと同じ進行（I-vi-IV-V → I-vi-V-I・C major・8小節）。
const ROOTS = [0, 9, 5, 7, 0, 9, 7, 0];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "7", "maj7"];
const BARS = ROOTS.length;
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

// ── V2 直呼び用のドラムfixture（generate.ts の前処理後の形＝絶対拍 kick/snare＋小節別密度）──
// 1小節パターン kick=[0, 1.75, 2](step0,7,8)・snare=[1,3](step4,12)＝「王道8ビート＋2拍目へ食うキック」。
// step7 のキックが「2拍目の16分前」＝A の対象拍は毎小節の2拍目。
const tile = (kickBar: number[], snareBar: number[], bars = BARS) => ({
  kick: Array.from({ length: bars }, (_, b) => kickBar.map((t) => b * 4 + t)).flat(),
  snare: Array.from({ length: bars }, (_, b) => snareBar.map((t) => b * 4 + t)).flat(),
});
const KICK_BAR = [0, 1.75, 2];
const SNARE_BAR = [1, 3];
const DRUMS_V2 = { ...tile(KICK_BAR, SNARE_BAR), densityByBar: Array.from({ length: BARS }, () => 5 + 0.3 * 8) };

type Knobs = { drumLock?: number; backbeat?: number; converse?: number };
const gen = (seed: number, knobs?: Knobs, drums?: { kick?: number[]; snare?: number[]; densityByBar?: number[] }) =>
  genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, drums, ...knobs });

// ── genMelody 直呼び用の DrumsInput（生 content 形＝parseDrums 経路の検証用）──
const DRUMS_RAW: DrumsInput = {
  rhythm: {
    steps: 16, bars: 1, beatsPerStep: 0.25,
    lanes: [
      { name: "Kick", midi: 36, hits: [0, 7, 8] },
      { name: "Snare", midi: 38, hits: [4, 12] },
      { name: "HiHat", midi: 42, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
    ],
  },
};
const FRAME: Frame = { key: 0, bars: BARS };
const CHORDS = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));

describe("(a) 既定＝従来と bit 一致（鉄則）", () => {
  it("V2: drums を渡しても全係数0/未指定なら従来と完全一致", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base = J(gen(seed));
      expect(J(gen(seed, {}, DRUMS_V2)), `seed=${seed} 係数未指定`).toBe(base);
      expect(J(gen(seed, { drumLock: 0, backbeat: 0, converse: 0 }, DRUMS_V2)), `seed=${seed} 係数0`).toBe(base);
    }
  });
  it("V2: drums 無しなら係数を立てても無効＝従来と完全一致", () => {
    for (let seed = 1; seed <= 20; seed++)
      expect(J(gen(seed, { drumLock: 1, backbeat: 1, converse: 1 })), `seed=${seed}`).toBe(J(gen(seed)));
  });
  it("V2: drums＋係数>0 で出力が実際に変わる（各ノブが効く）", () => {
    const seeds = [1, 2, 3, 5, 8, 13, 14, 21];
    expect(seeds.some((s) => J(gen(s, { drumLock: 1 }, DRUMS_V2)) !== J(gen(s))), "drumLock").toBe(true);
    expect(seeds.some((s) => J(gen(s, { backbeat: 1 }, DRUMS_V2)) !== J(gen(s))), "backbeat").toBe(true);
  });
  it("genMelody 経路でも同じ鉄則（drums+係数0＝一致／係数>0 drums無し＝一致／不正drums＝一致）", () => {
    for (const seed of [1, 7, 14]) {
      const base = J(genMelody(FRAME, CHORDS, seed, { useV2: true }));
      expect(J(genMelody(FRAME, CHORDS, seed, { useV2: true, drums: DRUMS_RAW })), `seed=${seed} 係数未指定`).toBe(base);
      expect(J(genMelody(FRAME, CHORDS, seed, { useV2: true, drums: DRUMS_RAW, drumLock: 0, backbeat: 0, converse: 0 })), `seed=${seed} 係数0`).toBe(base);
      expect(J(genMelody(FRAME, CHORDS, seed, { useV2: true, drumLock: 1, backbeat: 1, converse: 1 })), `seed=${seed} drums無し`).toBe(base);
      // パターン長が小節長(4拍)の整数倍でない＝防御で drums 無し扱い（gen_bass の不一致→従来経路と同方針）
      const odd: DrumsInput = { rhythm: { steps: 10, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 7] }] } };
      expect(J(genMelody(FRAME, CHORDS, seed, { useV2: true, drums: odd, drumLock: 1, backbeat: 1, converse: 1 })), `seed=${seed} 不一致drums`).toBe(base);
    }
  });
  it("compound(6/8) は3段とも対象外＝bit一致（research ⑤-6）", () => {
    const pcs68 = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));
    const gen68 = (seed: number, knobs?: Knobs, drums?: { kick?: number[]; snare?: number[]; densityByBar?: number[] }) =>
      genMotifMelodyV2(pcs68, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, compound: true, drums, ...knobs });
    const d68 = { kick: [0, 1.25, 1.5], snare: [1.5], densityByBar: Array.from({ length: BARS }, (_, i) => (i % 2 ? 2 : 8)) };
    for (const seed of [1, 7, 14])
      expect(J(gen68(seed, { drumLock: 1, backbeat: 1, converse: 1 }, d68)), `seed=${seed}`).toBe(J(gen68(seed)));
  });
});

describe("(b) B＝backbeat：velocity のみ・onset/pitch/dur 不変", () => {
  const on16 = (t: number, list: number[]) => list.some((x) => Math.round(x * 4) === Math.round(t * 4));
  it("backbeat=1: スネア位置 vel=112・キック位置(非スネア) vel=106・他は vel 無し（humanize なし＝基底100）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base = gen(seed);
      const b = gen(seed, { backbeat: 1 }, DRUMS_V2);
      expect(b.length, `seed=${seed}`).toBe(base.length);
      expect(J(b.map((n) => [n.pitch, n.start, n.dur])), `seed=${seed} onset/pitch/dur`).toBe(J(base.map((n) => [n.pitch, n.start, n.dur])));
      for (const n of b) {
        if (on16(n.start, DRUMS_V2.snare)) expect(n.vel, `seed=${seed} t=${n.start} スネア`).toBe(112);
        else if (on16(n.start, DRUMS_V2.kick)) expect(n.vel, `seed=${seed} t=${n.start} キック`).toBe(106);
        else expect(n.vel, `seed=${seed} t=${n.start} 非ドラム位置`).toBeUndefined();
      }
    }
  });
  it("backbeat=0.5: ブーストが係数比例（スネア+6/キック+3）", () => {
    const b = gen(3, { backbeat: 0.5 }, DRUMS_V2);
    for (const n of b) {
      if (on16(n.start, DRUMS_V2.snare)) expect(n.vel).toBe(106);
      else if (on16(n.start, DRUMS_V2.kick)) expect(n.vel).toBe(103);
    }
  });
  it("humanize 併用: humanize の vel に加算される（クランプ55..118内）・timing は humanize 単独と一致", () => {
    for (const seed of [1, 7, 14]) {
      const only = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, humanize: 0.5 });
      const withB = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, humanize: 0.5, drums: DRUMS_V2, backbeat: 1 });
      expect(J(withB.map((n) => [n.pitch, n.start, n.dur])), `seed=${seed}`).toBe(J(only.map((n) => [n.pitch, n.start, n.dur])));
      for (let i = 0; i < withB.length; i++) {
        const t = withB[i]!.start;
        const boost = on16(t, DRUMS_V2.snare) ? 12 : on16(t, DRUMS_V2.kick) ? 6 : 0;
        expect(withB[i]!.vel, `seed=${seed} i=${i}`).toBe(Math.max(55, Math.min(118, (only[i]!.vel ?? 100) + boost)));
      }
    }
  });
});

describe("(c) A＝drumLock：実キック食い位置へ16分前借り", () => {
  it("drumLock=1: 各音は base か base-0.25（音単位≤1回）・移動は「16分前キック食いの拍頭」のみ・終端(start+dur)不変・pitch不変", () => {
    let moved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const base = gen(seed);
      const a = gen(seed, { drumLock: 1 }, DRUMS_V2);
      expect(a.length, `seed=${seed}`).toBe(base.length);
      for (let i = 0; i < a.length; i++) {
        const d = base[i]!.start - a[i]!.start;
        expect(d === 0 || Math.abs(d - 0.25) < 1e-9, `seed=${seed} i=${i}: 前借りは0か0.25のみ(d=${d})`).toBe(true);
        expect(a[i]!.pitch, `seed=${seed} i=${i}: pitch不変`).toBe(base[i]!.pitch);
        if (d > 0) {
          // 移動した音＝元は拍頭ちょうど・その16分前(0.25拍前)に実キック
          expect(Math.abs(base[i]!.start - Math.round(base[i]!.start)) < 0.01, `seed=${seed} i=${i}: 元は拍頭`).toBe(true);
          expect(DRUMS_V2.kick.some((k) => Math.round(k * 4) === Math.round(base[i]!.start * 4) - 1), `seed=${seed} i=${i}: 16分前にキック`).toBe(true);
          expect(a[i]!.start + a[i]!.dur, `seed=${seed} i=${i}: タイ＝終端不変`).toBeCloseTo(base[i]!.start + base[i]!.dur, 9);
          moved++;
        }
      }
      // 終止音・曲頭は不変
      expect(a[0]!.start).toBe(base[0]!.start);
      expect(a[a.length - 1]!.start).toBe(base[base.length - 1]!.start);
      expect(a[a.length - 1]!.dur).toBe(base[base.length - 1]!.dur);
    }
    expect(moved, "20seedで実際に前借りが発生").toBeGreaterThan(0);
  });
  it("上限≤2/小節（食いキックだらけのドラムでもユニゾン化しない）", () => {
    const manyKick = [0.75, 1.75, 2.75]; // 毎拍の16分前に食う（beats 1,2,3 が対象）
    const drums = { ...tile(manyKick, SNARE_BAR), densityByBar: Array.from({ length: BARS }, () => 5) };
    for (let seed = 1; seed <= 20; seed++) {
      const base = gen(seed);
      const a = gen(seed, { drumLock: 1 }, drums);
      const perBar = new Map<number, number>();
      for (let i = 0; i < a.length; i++) {
        if (base[i]!.start - a[i]!.start > 0) {
          const bar = Math.floor(base[i]!.start / 4);
          perBar.set(bar, (perBar.get(bar) ?? 0) + 1);
        }
      }
      for (const [bar, cnt] of perBar) expect(cnt, `seed=${seed} bar=${bar}`).toBeLessThanOrEqual(2);
    }
  });
  it("push=1 併用＝音単位の排他：二重前借り(−0.5)は起きない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false });
      const both = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 0, minor: false, push: 1, drums: DRUMS_V2, drumLock: 1 });
      expect(both.length, `seed=${seed}`).toBe(base.length);
      for (let i = 0; i < both.length; i++) {
        const d = base[i]!.start - both[i]!.start;
        expect(d === 0 || Math.abs(d - 0.25) < 1e-9, `seed=${seed} i=${i}: 二重前借り禁止(d=${d})`).toBe(true);
      }
    }
  });
});

describe("(d) C＝converse：密度の相補（ドラム密→メロ疎・ドラム疎→メロ密）", () => {
  it("一様密度（genDrums の1小節パターン相当）は converse=1 でも bit 一致（rel=1＝無変化）", () => {
    for (const seed of [1, 7, 14, 21])
      expect(J(gen(seed, { converse: 1 }, DRUMS_V2)), `seed=${seed}`).toBe(J(gen(seed)));
  });
  it("濃淡ドラム: 密ブロックで音数が増えず・疎ブロックで減らず、合計で相補が実在（30seed統計）", () => {
    // 4小節周期＝bar0-1 密(10.6)/bar2-3 疎(2.2)。mb=2 ブロックが密/疎に交互に当たる。
    const densityByBar = Array.from({ length: BARS }, (_, b) => (b % 4 < 2 ? 10.6 : 2.2));
    const drums = { ...tile(KICK_BAR, SNARE_BAR), densityByBar };
    const countIn = (notes: Note[], denseSide: boolean) =>
      notes.filter((n) => { const bar = Math.floor(n.start / 4); return (bar % 4 < 2) === denseSide; }).length;
    let dense0 = 0, dense1 = 0, sparse0 = 0, sparse1 = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const base = gen(seed);
      const c = gen(seed, { converse: 1 }, drums);
      dense0 += countIn(base, true); dense1 += countIn(c, true);
      sparse0 += countIn(base, false); sparse1 += countIn(c, false);
      // 決定的規則＝格子維持：全 onset は16分格子上・終止音の start は不変
      for (const n of c) expect(Math.abs(n.start * 4 - Math.round(n.start * 4)) < 1e-6, `seed=${seed} t=${n.start}`).toBe(true);
      expect(c[c.length - 1]!.start, `seed=${seed} 終止`).toBe(base[base.length - 1]!.start);
    }
    expect(dense1, `密側 ${dense0}→${dense1}（減る方向）`).toBeLessThan(dense0);
    expect(sparse1, `疎側 ${sparse0}→${sparse1}（増える方向）`).toBeGreaterThan(sparse0);
  });
});

describe("(e) 決定性", () => {
  it("同 seed＋同 drums＋同係数で同出力", () => {
    for (const knobs of [{ drumLock: 0.5 }, { backbeat: 0.7 }, { converse: 0.8 }, { drumLock: 1, backbeat: 1, converse: 1 }] as Knobs[])
      expect(J(gen(14, knobs, DRUMS_V2))).toBe(J(gen(14, knobs, DRUMS_V2)));
  });
});

describe("API 配線（/music/gen_melody・/gen/section の rhythm→melody 結線）", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });
  it("/music/gen_melody: drums＋3ノブを透過（direct 呼び出しと一致）・係数0/drums無しは従来と一致", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/music/gen_melody",
      payload: { frame: FRAME, chords: CHORDS, seed: 14, drums: DRUMS_RAW, drumLock: 0.5, backbeat: 0.5, converse: 0.5 },
    });
    expect(r.statusCode).toBe(200);
    expect(J(r.json())).toBe(J(genMelody(FRAME, CHORDS, 14, { useV2: true, drums: DRUMS_RAW, drumLock: 0.5, backbeat: 0.5, converse: 0.5 })));
    const base = J(genMelody(FRAME, CHORDS, 14, { useV2: true }));
    const r0 = await app.inject({ method: "POST", url: "/music/gen_melody", payload: { frame: FRAME, chords: CHORDS, seed: 14, drums: DRUMS_RAW } });
    expect(J(r0.json()), "drums有り係数未指定＝従来").toBe(base);
  });
  it("/gen/section: melody:{backbeat等} 指定で生成済みドラムがメロへ渡る（rhythm→melody 結線）", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const r = await app.inject({
      method: "POST",
      url: "/gen/section",
      payload: { frame, seed: 42, parts: ["chords", "bass", "melody", "drums"], melody: { backbeat: 0.5, drumLock: 0.4 } },
    });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const kindOf = (k: string) => comp.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
    const gchords = (kindOf("chord_progression") as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    const gbass = (kindOf("bass") as { notes: Note[] }).notes;
    const gdrums = kindOf("rhythm") as DrumsInput;
    expect(J(gdrums), "rhythm は genDrums と一致（前提）").toBe(J(genDrums(frame, 42).items[0]!.content));
    const mel = (kindOf("melody") as { notes: Note[] }).notes;
    const expected = (genMelody(frame, gchords, 42, { useV2: true, bass: gbass, drums: gdrums, backbeat: 0.5, drumLock: 0.4 }).items[0]!.content as { notes: Note[] }).notes;
    expect(mel).toEqual(expected);
  });
  it("/gen/section: melody ノブ未指定は従来と bit 一致（回帰・drums が生成されていても）", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed: 7, parts: ["chords", "bass", "melody", "drums"] } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const gchords = (comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    const mel = (comp.composition.children.find((c) => c.node.neta.kind === "melody")!.node.neta.content as { notes: Note[] }).notes;
    expect(mel).toEqual((genMelody(frame, gchords, 7, { useV2: true }).items[0]!.content as { notes: Note[] }).notes);
  });
});
