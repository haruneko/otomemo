// gen_melody×ベース結線＝対位バイアス（2026-07-10・design「gen_melody×ベース結線」・
// research/2026-07-10-melody-bass-counterpoint.md）。契約：
// (a) bass無し or counter=0 で従来と bit 一致（鉄則） (b) counter>0 で強拍の対ベース反行が統計的に増え
// 並行/隠伏の違反が減る (c) 同時発音の b9 衝突が減る (d) onset/dur 不変＝ピッチ選好のみ・A/A'' 反復維持
// (e) 決定性（同 seed 同出力）。＋API配線（/music/gen_melody・/gen/section の bass→melody 依存順）。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genMelody, type Frame } from "../src/music/generate";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { scalePcs, chordPcs } from "../src/music/theory";
import { analyzeVoiceLeading, pitchAt } from "../src/music/voiceLeading";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

type Note = { pitch: number; start: number; dur: number };
const J = (x: unknown) => JSON.stringify(x);
const motif16 = loadMotifModel16();

// V2テストと同じ進行（I-vi-IV-V → I-vi-V-I・C major）。
const ROOTS = [0, 9, 5, 7, 0, 9, 7, 0];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "7", "maj7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));
const inBar = (t: number) => ((t % 4) + 4) % 4;
const isStrong = (t: number) => Math.abs(inBar(t)) < 0.12 || Math.abs(inBar(t) - 2) < 0.12;

// ベース fixture＝拍頭ルート＋3拍目3度（36..47帯・genBass と同レジスタ）。3度は b9 機会を作る
// （C の E(40)↔メロF・G7 の B(47)↔メロC＝どちらもスケール内なので生成メロが実際に踏む）。
const mkBass = (bars = 8): Note[] => {
  const out: Note[] = [];
  for (let b = 0; b < bars; b++) {
    const r = ROOTS[b]!, q = QUALS[b]!;
    const third = (r + (q.startsWith("min") ? 3 : 4)) % 12;
    out.push({ pitch: 36 + r, start: b * 4, dur: 2 }, { pitch: 36 + third, start: b * 4 + 2, dur: 2 });
  }
  return out;
};
const BASS = mkBass();
const bAt = (notes: Note[]) => { const s = [...notes].sort((a, b) => a.start - b.start); return (t: number) => pitchAt(s, t); };

const gen = (seed: number, counter?: number, bass?: Note[]) =>
  genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, {
    seed, tonicPc: 0, minor: false, counter,
    bassPitchAt: bass ? bAt(bass) : undefined,
  });

// 禁則跳躍の免除＝両端コード音のアルペジオ（melody-cells-v2.test と同じ流儀）。
const arpOK = (arr: Note[], i: number): boolean => {
  const a = Math.abs(arr[i]!.pitch - arr[i - 1]!.pitch);
  if (a > 12) return false;
  const isCT = (n: Note): boolean => {
    const pc = ((n.pitch % 12) + 12) % 12;
    const b = Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4));
    return pcsPerBar[b]!.includes(pc);
  };
  return isCT(arr[i - 1]!) && isCT(arr[i]!);
};

describe("(a) 既定＝従来と bit 一致（鉄則）", () => {
  it("bass を渡しても counter=0/未指定なら従来と完全一致", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base = J(gen(seed));
      expect(J(gen(seed, 0, BASS)), `seed=${seed} counter=0`).toBe(base);
      expect(J(gen(seed, undefined, BASS)), `seed=${seed} counter未指定`).toBe(base);
    }
  });
  it("bass 無しなら counter を立てても無効＝従来と完全一致", () => {
    for (let seed = 1; seed <= 20; seed++) expect(J(gen(seed, 1)), `seed=${seed}`).toBe(J(gen(seed)));
  });
  it("counter>0 かつ bass 有りで出力が実際に変わる（ノブが効く）", () => {
    const diff = [1, 2, 3, 5, 8, 13, 14, 21].some((s) => J(gen(s, 1, BASS)) !== J(gen(s)));
    expect(diff).toBe(true);
  });
  it("genMelody 経路でも同じ鉄則（bass+counter:0＝一致／counter>0 bass無し＝一致）", () => {
    const frame: Frame = { key: 0, bars: 8 };
    const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));
    for (const seed of [1, 7, 14]) {
      const base = J(genMelody(frame, chords, seed, { useV2: true }));
      expect(J(genMelody(frame, chords, seed, { useV2: true, bass: BASS, counter: 0 })), `seed=${seed}`).toBe(base);
      expect(J(genMelody(frame, chords, seed, { useV2: true, counter: 0.7 })), `seed=${seed} bass無し`).toBe(base);
      expect(J(genMelody(frame, chords, seed, { useV2: true, bass: [] as Note[], counter: 0.7 })), `seed=${seed} bass空`).toBe(base);
    }
  });
});

describe("(b) 強拍の運動＝反行/斜行が増え・並行/隠伏の違反が減る（統計・40seed集計）", () => {
  // 強拍 onset ごとの (メロ運動 du, ベース運動 dl) を評価器と同じ隣接標本で数える。
  const motion = (notes: Note[], bass: Note[]) => {
    const at = bAt(bass);
    let moving = 0, contrary = 0;
    const s = [...notes].sort((a, b) => a.start - b.start);
    for (let i = 1; i < s.length; i++) {
      if (!isStrong(s[i]!.start)) continue;
      const bl = at(s[i]!.start), pb = at(s[i - 1]!.start);
      if (bl == null || pb == null) continue;
      const du = s[i]!.pitch - s[i - 1]!.pitch, dl = bl - pb;
      if (du === 0 || dl === 0) continue;
      moving++;
      if (Math.sign(du) === -Math.sign(dl)) contrary++;
    }
    return { moving, contrary };
  };
  it("counter=1 で反行率が下がらない（上がる方向）・評価器の違反合計が増えない", () => {
    let m0 = 0, c0 = 0, m1 = 0, c1 = 0, v0 = 0, v1 = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = gen(seed), b = gen(seed, 1, BASS);
      const ra = motion(a, BASS), rb = motion(b, BASS);
      m0 += ra.moving; c0 += ra.contrary; m1 += rb.moving; c1 += rb.contrary;
      const va = analyzeVoiceLeading(a, BASS), vb = analyzeVoiceLeading(b, BASS);
      v0 += va.parallelFifths + va.parallelOctaves + va.directFifths + va.directOctaves;
      v1 += vb.parallelFifths + vb.parallelOctaves + vb.directFifths + vb.directOctaves;
    }
    expect(m0).toBeGreaterThan(0);
    expect(c1 / m1, `反行率 counter=1(${(c1 / m1).toFixed(3)}) >= counter=0(${(c0 / m0).toFixed(3)})`).toBeGreaterThanOrEqual(c0 / m0);
    expect(v1, `違反合計 counter=1(${v1}) <= counter=0(${v0})`).toBeLessThanOrEqual(v0);
    // どちらかは実際に改善している（両方無変化＝ノブが対位に効いていない、を弾く）
    expect(v1 < v0 || c1 / m1 > c0 / m0, `改善が実在（viol ${v0}→${v1}・contrary ${(c0 / m0).toFixed(3)}→${(c1 / m1).toFixed(3)}）`).toBe(true);
  });
});

describe("(c) 同時発音の b9 衝突が減る（統計・40seed集計）", () => {
  // b9 を確実に作る fixture＝Cmaj7 小節はベースが B(47) をペダル＝コード音 C(pc0) が対ベース b9 になる。
  // 免除は仕様どおり残る：経過音(passing)・終止着地(保護)・弱拍のコード音(掃除は非CTのみ)＝strong 非終止で数える。
  const BASS_B9: Note[] = ROOTS.map((r, b) => ({ pitch: r === 0 ? 47 : 36 + r, start: b * 4, dur: 4 }));
  const b9Strong = (notes: Note[], bass: Note[]) => {
    const at = bAt(bass);
    let n = 0;
    notes.forEach((x, i) => {
      if (i === notes.length - 1) return; // 終止は保護＝対象外
      const bl = at(x.start);
      if (bl == null || (((x.pitch - bl) % 12) + 12) % 12 !== 1) return;
      if (isStrong(x.start)) n++;
    });
    return n;
  };
  it("counter=1 で強拍(非終止)の b9 同時発音が減る", () => {
    let n0 = 0, n1 = 0;
    for (let seed = 1; seed <= 40; seed++) { n0 += b9Strong(gen(seed), BASS_B9); n1 += b9Strong(gen(seed, 1, BASS_B9), BASS_B9); }
    expect(n0, "fixture が b9 機会を実際に持つ（前提）").toBeGreaterThan(10);
    expect(n1, `b9 counter=1(${n1}) < counter=0(${n0})`).toBeLessThan(n0);
  });
});

describe("(d) 副作用ガード＝onset/dur 不変・モチーフ反復(A/A'')維持", () => {
  it("counter=1 でも start/dur は全 seed で bit 不変（ピッチ選好のみ＝リズム/輪郭の器は触らない）", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = gen(seed), b = gen(seed, 1, BASS);
      expect(b.length, `seed=${seed}`).toBe(a.length);
      expect(J(b.map((n) => [n.start, n.dur])), `seed=${seed}`).toBe(J(a.map((n) => [n.start, n.dur])));
    }
  });
  it("A(bar0-1)とA''(bar6-7)の輪郭一致率が counter 適用後も落ちない（反復＝歌の同一性）", () => {
    const contourMatch = (notes: Note[]): number | null => {
      const seg = (b0: number) => notes.filter((n) => n.start >= b0 * 4 && n.start < (b0 + 2) * 4).sort((x, y) => x.start - y.start);
      const sig = (s: Note[]) => { const out: number[] = []; for (let i = 1; i < s.length; i++) out.push(Math.sign(s[i]!.pitch - s[i - 1]!.pitch)); return out; };
      const a = sig(seg(0)), c = sig(seg(6));
      const n = Math.min(a.length, c.length);
      if (n < 2) return null;
      let m = 0;
      for (let i = 0; i < n; i++) if (a[i] === c[i]) m++;
      return m / n;
    };
    let s0 = 0, s1 = 0, cnt = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = contourMatch(gen(seed)), b = contourMatch(gen(seed, 1, BASS));
      if (a == null || b == null) continue;
      s0 += a; s1 += b; cnt++;
    }
    expect(cnt).toBeGreaterThan(10);
    // counter は snap 先の選好のみ＝反復の輪郭一致は僅差まで（0.1 マージン）しか落ちない
    expect(s1 / cnt, `A/A''一致率 counter=1(${(s1 / cnt).toFixed(3)}) >= base(${(s0 / cnt).toFixed(3)})-0.1`).toBeGreaterThanOrEqual(s0 / cnt - 0.1);
  });
  it("counter=1 でも 禁則ゼロ(アルペジオ除く)・音域維持・単一頂点（合法性不変）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const notes = gen(seed, 1, BASS);
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect((a === 6 || a === 10 || a === 11 || a > 12) && !arpOK(notes, i), `seed=${seed} i=${i}: 禁則|${a}|`).toBe(false);
      }
      for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(58); expect(n.pitch).toBeLessThanOrEqual(83); }
      const hi = Math.max(...notes.map((n) => n.pitch));
      expect(notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1).length <= 1, `seed=${seed}: 単一頂点`).toBe(true);
    }
  });
});

describe("(e) 決定性", () => {
  it("同 seed＋同 bass＋同 counter で同出力", () => {
    expect(J(gen(14, 0.3, BASS))).toBe(J(gen(14, 0.3, BASS)));
    expect(J(gen(14, 1, BASS))).toBe(J(gen(14, 1, BASS)));
  });
});

describe("API 配線（/music/gen_melody・/gen/section の bass→melody 結線）", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));
  it("/music/gen_melody: bass+counter を透過（direct 呼び出しと一致）", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/music/gen_melody",
      payload: { frame: { key: 0, bars: 8 }, chords, seed: 14, bass: BASS, counter: 0.7 },
    });
    expect(r.statusCode).toBe(200);
    expect(J(r.json())).toBe(J(genMelody({ key: 0, bars: 8 }, chords, 14, { useV2: true, bass: BASS, counter: 0.7 })));
  });
  it("/music/gen_melody: bass={notes} 形も受ける・counter=0/bass無しは従来と一致（回帰）", async () => {
    const base = J(genMelody({ key: 0, bars: 8 }, chords, 14, { useV2: true }));
    const r0 = await app.inject({ method: "POST", url: "/music/gen_melody", payload: { frame: { key: 0, bars: 8 }, chords, seed: 14 } });
    expect(J(r0.json())).toBe(base);
    const r1 = await app.inject({ method: "POST", url: "/music/gen_melody", payload: { frame: { key: 0, bars: 8 }, chords, seed: 14, bass: { notes: BASS }, counter: 0 } });
    expect(J(r1.json())).toBe(base);
    const r2 = await app.inject({ method: "POST", url: "/music/gen_melody", payload: { frame: { key: 0, bars: 8 }, chords, seed: 14, bass: { notes: BASS }, counter: 0.7 } });
    expect(J(r2.json())).toBe(J(genMelody({ key: 0, bars: 8 }, chords, 14, { useV2: true, bass: BASS, counter: 0.7 })));
  });
  it("/gen/section: melody:{counter} 指定で生成済みベースがメロへ渡る（bass→melody 依存順）", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const r = await app.inject({
      method: "POST",
      url: "/gen/section",
      payload: { frame, seed: 42, parts: ["chords", "bass", "melody", "drums"], melody: { counter: 0.5 } },
    });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const kindOf = (k: string) => comp.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
    const gchords = (kindOf("chord_progression") as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    const gbass = (kindOf("bass") as { notes: Note[] }).notes;
    const mel = (kindOf("melody") as { notes: Note[] }).notes;
    // 期待＝生成済み bass notes を counter=0.5 で melody へ渡した結果と一致（結線の実体）
    const expected = (genMelody(frame, gchords, 42, { useV2: true, bass: gbass, counter: 0.5 }).items[0]!.content as { notes: Note[] }).notes;
    expect(mel).toEqual(expected);
  });
  it("/gen/section: melody ノブ未指定は従来と bit 一致（回帰・bass が生成されていても）", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed: 7, parts: ["chords", "bass", "melody", "drums"] } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const gchords = (comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    const mel = (comp.composition.children.find((c) => c.node.neta.kind === "melody")!.node.neta.content as { notes: Note[] }).notes;
    expect(mel).toEqual((genMelody(frame, gchords, 7, { useV2: true }).items[0]!.content as { notes: Note[] }).notes);
    // 配置順（ord＝レーンの並び）も従来どおり：進行→メロ→ベース→リズム
    expect(comp.composition.children.map((c) => c.node.neta.kind)).toEqual(["chord_progression", "melody", "bass", "rhythm"]);
  });
});
