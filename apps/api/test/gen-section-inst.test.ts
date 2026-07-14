// WP-X3c セクション楽器(ホーン/ストリングス＝管弦) 生成の契約テスト
// （docs/research/2026-07-14-horn-string-arranging.md §2/§3/§6）。1ネタ多声・進行追従(chord_pattern親戚)。
// 固定値/性質で担保：content 形(ChordPatternContent＝strum/voicing/hits＋program/role)・多声(voicing三和音)・
// role=pad(ハーモニックリズムにアタック＝コード変わり目・全域を隙間なく伸ばす)/stab(裏の16分1個 staccato)・
// 既定 pad・GM音色(pad48/stab61)・決定性。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genSectionInst, type Frame } from "../src/music/generate";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

type Hit = { step: number; dur: number };
type Content = { mode: string; voicing: { tones: string[]; openClose: string; top?: number }; steps: number; hits: Hit[]; program: number; role: string };
const J = (x: unknown) => JSON.stringify(x);
const FRAME: Frame = { key: 0, meter: "4/4", bars: 2, mode: "major" };
const CHORDS = [
  { root: 0, quality: "", start: 0, dur: 2 },   // C（小節前半）
  { root: 7, quality: "", start: 2, dur: 2 },   // G（小節後半）＝コード変わり目 step8
  { root: 9, quality: "m", start: 4, dur: 4 },  // Am（2小節目）
];
const contentOf = (r: ReturnType<typeof genSectionInst>) => r.items[0]!.content as Content;

describe("gen_section_inst（管弦）契約", () => {
  it("content 形＝kind=section_inst・ChordPatternContent(多声=三和音voicing)・role", () => {
    const c = contentOf(genSectionInst(FRAME, CHORDS, 1));
    const r = genSectionInst(FRAME, CHORDS, 1);
    expect(r.items[0]!.kind).toBe("section_inst");
    expect(c.mode).toBe("strum");
    expect(Array.isArray(c.hits)).toBe(true);
    expect(c.voicing.tones.length).toBeGreaterThanOrEqual(2); // 多声（strum で同時発音＝三和音）
    expect(["pad", "stab"]).toContain(c.role);
  });

  it("既定は pad・GM Strings(48)／stab は Brass(61)", () => {
    expect(contentOf(genSectionInst(FRAME, CHORDS, 1)).role).toBe("pad");
    expect(contentOf(genSectionInst(FRAME, CHORDS, 1)).program).toBe(48);
    expect(contentOf(genSectionInst(FRAME, CHORDS, 1, { role: "stab" })).program).toBe(61);
  });

  it("決定性：同 seed で同一出力", () => {
    expect(J(genSectionInst(FRAME, CHORDS, 4, { role: "stab" }))).toBe(J(genSectionInst(FRAME, CHORDS, 4, { role: "stab" })));
  });

  it("pad＝ハーモニックリズムにアタック（コード変わり目 step にヒット・全域を隙間なく伸ばす）", () => {
    const c = contentOf(genSectionInst(FRAME, CHORDS, 1, { role: "pad" }));
    const onsetSteps = new Set(c.hits.map((h) => h.step));
    // コード変わり目 step（start*4）＝0,8,16 に必ずアタック。
    for (const ch of CHORDS) expect(onsetSteps.has(Math.round(ch.start * 4))).toBe(true);
    // pad は面＝ヒットが全域を隙間なく覆う（dur 合計＝steps・重なりなし）。
    const sorted = [...c.hits].sort((a, b) => a.step - b.step);
    let cursor = 0;
    for (const h of sorted) { expect(h.step).toBe(cursor); cursor += h.dur; }
    expect(cursor).toBe(c.steps);
  });

  it("stab＝裏(& の8分)を短く突く（dur=1・step%4===2 の staccato）", () => {
    const c = contentOf(genSectionInst(FRAME, CHORDS, 1, { role: "stab" }));
    expect(c.hits.length).toBeGreaterThan(0);
    for (const h of c.hits) {
      expect(h.dur).toBe(1);           // 16分1個＝短くミュート（stab は短いほど良い）
      expect(h.step % 4).toBe(2);      // 各拍の裏（&）
    }
  });
});

describe("gen_section_inst API 配線", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });
  it("/music/gen_section_inst：返りは direct と一致・role 透過", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_section_inst", payload: { frame: FRAME, chords: CHORDS, seed: 9, role: "stab" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().items[0].kind).toBe("section_inst");
    expect(J(r.json())).toBe(J(genSectionInst(FRAME, CHORDS, 9, { role: "stab" })));
  });
});
