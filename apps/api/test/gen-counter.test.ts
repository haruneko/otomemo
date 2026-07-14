// WP-X3a 対旋律(counter/オブリガート) 生成の契約テスト（docs/research/2026-07-14-countermelody-obbligato.md §5）。
// ガードレールを固定値/性質で担保：
//   P0 主メロと同時発音の2度(半音/全音)を作らない・P1 音域分離(主メロの下3〜10度)・
//   P1 相補リズム(主メロ busy 拍=1拍2onset以上 では counter を鳴らさない)・
//   決定性(同 seed 同出力)・content 形(kind="counter"・program:48)・主メロ空は空 notes・API 配線(melody 必須=400)。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genCounter, type Frame } from "../src/music/generate";
import { pitchAt } from "../src/music/voiceLeading";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

type Note = { pitch: number; start: number; dur: number };
const J = (x: unknown) => JSON.stringify(x);
const minInterval = (a: number, b: number): number => { const d = (((a - b) % 12) + 12) % 12; return Math.min(d, 12 - d); };

// C major・2小節(8拍)。busy拍(2onset)/伸ばし/休符を混ぜた主メロ。
const FRAME: Frame = { key: 0, meter: "4/4", bars: 2, mode: "major" };
const MELODY: Note[] = [
  { pitch: 72, start: 0, dur: 1 },                                     // C5 拍0（単onset）
  { pitch: 74, start: 1, dur: 0.5 }, { pitch: 76, start: 1.5, dur: 0.5 }, // 拍1=2onset＝busy
  { pitch: 77, start: 2, dur: 2 },                                     // F5 拍2-3 伸ばし
  { pitch: 79, start: 4, dur: 1 },                                     // G5 拍4
  { pitch: 76, start: 5, dur: 0.5 }, { pitch: 74, start: 5.5, dur: 0.5 }, // 拍5=2onset＝busy
  { pitch: 72, start: 6, dur: 2 },                                     // C5 拍6-7 伸ばし
];
const CHORDS = [
  { root: 0, quality: "", start: 0, dur: 4 },   // C
  { root: 7, quality: "", start: 4, dur: 4 },   // G
];
const onsetsInBeat = (b: number) => MELODY.filter((n) => n.start >= b - 1e-9 && n.start < b + 1 - 1e-9).length;

function counterNotes(seed = 3, opts?: { density?: number }): Note[] {
  const r = genCounter(FRAME, MELODY, CHORDS, seed, opts);
  return (r.items[0]!.content as { notes: Note[] }).notes;
}

describe("gen_counter（対旋律）契約", () => {
  it("content 形＝kind=counter・program:48（Strings）", () => {
    const r = genCounter(FRAME, MELODY, CHORDS, 1);
    expect(r.items[0]!.kind).toBe("counter");
    expect((r.items[0]!.content as { program: number }).program).toBe(48);
  });

  it("主メロ空は空 notes（対旋律は相手が要る）", () => {
    const r = genCounter(FRAME, [], CHORDS, 1);
    expect((r.items[0]!.content as { notes: Note[] }).notes).toEqual([]);
  });

  it("決定性：同 seed で同一出力", () => {
    expect(J(counterNotes(5))).toBe(J(counterNotes(5)));
    // density=1 で必ず候補が出る（seed 非依存の骨格を確認）
    expect(counterNotes(5, { density: 1 }).length).toBeGreaterThan(0);
  });

  it("P1 音域分離＝各音は主メロの下 3〜12半音（同時発音時）", () => {
    for (const c of counterNotes(3, { density: 1 })) {
      const m = pitchAt(MELODY, c.start);
      if (m == null) continue; // 主メロ休符区間は無制約
      expect(m - c.pitch).toBeGreaterThanOrEqual(3);
      expect(m - c.pitch).toBeLessThanOrEqual(12);
    }
  });

  it("P0 同時発音の2度(半音/全音)を作らない", () => {
    for (const c of counterNotes(3, { density: 1 })) {
      const m = pitchAt(MELODY, c.start);
      if (m == null) continue;
      expect([1, 2]).not.toContain(minInterval(c.pitch, m));
    }
  });

  it("P1 相補リズム＝主メロ busy 拍(2onset以上)では counter を鳴らさない", () => {
    for (const c of counterNotes(3, { density: 1 })) {
      expect(Number.isInteger(c.start)).toBe(true); // onset は拍頭
      expect(onsetsInBeat(c.start)).toBeLessThan(2);
    }
  });

  it("拍頭はコードトーン軸（各音のピッチクラスがその時刻のコードのトーン）", () => {
    // C(0,4,7)/G(7,11,2) の構成音のみ（scale 代用でなく chords 追従）。
    const toneAt = (t: number) => (t < 4 ? new Set([0, 4, 7]) : new Set([7, 11, 2]));
    for (const c of counterNotes(3, { density: 1 })) {
      expect(toneAt(c.start).has(((c.pitch % 12) + 12) % 12)).toBe(true);
    }
  });
});

describe("gen_counter API 配線", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });

  it("/music/gen_counter：melody 必須（無しは400）・返りは direct と一致", async () => {
    const miss = await app.inject({ method: "POST", url: "/music/gen_counter", payload: { frame: FRAME, chords: CHORDS, seed: 9 } });
    expect(miss.statusCode).toBe(400);
    const r = await app.inject({ method: "POST", url: "/music/gen_counter", payload: { frame: FRAME, melody: MELODY, chords: CHORDS, seed: 9 } });
    expect(r.statusCode).toBe(200);
    expect(r.json().items[0].kind).toBe("counter");
    expect(J(r.json())).toBe(J(genCounter(FRAME, MELODY, CHORDS, 9)));
  });
});
