// ギターの刻みの音価のつまみ（design.md 追補 (k-4)・2026-09-15 オーナー裁定「つまみで選ぶ」＝真因調査 案6）。
// guitarPalmGate＝文法の palmGate の代わり（0.1〜1）／guitarGhostVel＝ghost の vel（1〜127）。**未指定＝源流値＝1ビットも変わらない**。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { realizeGuitarRiff } from "@cm/music-core";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genChordPattern, type DrumsInput } from "../src/music/generate";

type Hit = { step: number; dur: number; vel: number; voice: string; riff: { kind: string } };
const FRAME = { bars: 4, meter: "4/4", key: 9, tempo: 140 };
const CHORDS = [{ root: 9, quality: "m", start: 0, dur: 8 }, { root: 7, quality: "", start: 8, dur: 8 }];
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 6, 10] }, { name: "Snare", midi: 38, hits: [4, 12] }] } };
const hitsOf = (r: ReturnType<typeof genChordPattern>) => (r.items[0]!.content as { hits: Hit[] }).hits;
const PALM: Record<string, number> = { power_chug: 0.8, pedal_answer: 0.85, gallop: 0.65 }; // 源流の値（oracle）

describe("既定は1ビットも変えない", () => {
  for (const g of Object.keys(PALM)) {
    it(`${g}：つまみ undefined ＝ 未指定（ロック有無とも）`, () => {
      expect(genChordPattern(FRAME, 3, { guitarRiff: g, guitarPalmGate: undefined, guitarGhostVel: undefined })).toStrictEqual(genChordPattern(FRAME, 3, { guitarRiff: g }));
      expect(genChordPattern(FRAME, 3, { guitarRiff: g, anchorLock: true, drums: DR, guitarPalmGate: undefined })).toStrictEqual(genChordPattern(FRAME, 3, { guitarRiff: g, anchorLock: true, drums: DR }));
    });
  }
});

describe("つまみが content の dur／vel に効く", () => {
  for (const g of Object.keys(PALM)) {
    for (const lock of [false, true]) {
      it(`${g}${lock ? "＋錨" : ""}：palmGate を 1.0 にすると全打点の dur が 1/源流値 倍・step と vel は不変`, () => {
        const base = hitsOf(genChordPattern(FRAME, 3, { guitarRiff: g, ...(lock ? { anchorLock: true, drums: DR } : {}) }));
        const long = hitsOf(genChordPattern(FRAME, 3, { guitarRiff: g, guitarPalmGate: 1, ...(lock ? { anchorLock: true, drums: DR } : {}) }));
        expect(long.map((h) => h.step)).toEqual(base.map((h) => h.step));
        expect(long.map((h) => h.vel)).toEqual(base.map((h) => h.vel));
        for (let i = 0; i < base.length; i++) expect(long[i]!.dur).toBeCloseTo(base[i]!.dur / PALM[g]!, 2);
      });
    }
  }
  it("ghostVel は ghost の vel だけを変える（dur・他の kind は不変）＝実音化した notes にも届く", () => {
    const base = hitsOf(genChordPattern(FRAME, 3, { guitarRiff: "power_chug" }));
    const loud = hitsOf(genChordPattern(FRAME, 3, { guitarRiff: "power_chug", guitarGhostVel: 70 }));
    const ghosts = base.filter((h) => h.riff.kind === "ghost").length;
    expect(ghosts).toBeGreaterThan(0); // 空虚でない
    loud.forEach((h, i) => {
      expect(h.dur).toBe(base[i]!.dur);
      expect(h.vel).toBe(h.riff.kind === "ghost" ? 70 : base[i]!.vel);
    });
    expect(base.filter((h) => h.riff.kind === "ghost").every((h) => h.vel === 46)).toBe(true); // 源流値
    const notes = realizeGuitarRiff(loud as never, { chordAtStep: (s) => (s < 32 ? CHORDS[0]! : CHORDS[1]!), tempo: 140 }).notes;
    expect(notes.some((n) => n.vel === 70)).toBe(true);
    expect(notes.some((n) => n.vel === 46)).toBe(false);
  });
  it("範囲外は丸めて告げる／リフ文法なしで渡したら効かないと告げる（落ち先ごとに文言）", () => {
    const hi = genChordPattern(FRAME, 3, { guitarRiff: "gallop", guitarPalmGate: 3, guitarGhostVel: 300 });
    expect(hitsOf(hi)).toEqual(hitsOf(genChordPattern(FRAME, 3, { guitarRiff: "gallop", guitarPalmGate: 1, guitarGhostVel: 127 })));
    const w = hi.meta?.warnings ?? [];
    expect(w.some((x) => x.includes("刻みの短さ") && x.includes("1"))).toBe(true);
    expect(w.some((x) => x.includes("弱音の強さ") && x.includes("127"))).toBe(true);
    const none = genChordPattern(FRAME, 3, { guitarPalmGate: 0.5 });
    expect(none.meta?.warnings?.some((x) => x.includes("リフ文法を選んだ時だけ") && x.includes("刻みの短さ"))).toBe(true);
    const none2 = genChordPattern(FRAME, 3, { guitarGhostVel: 60 });
    expect(none2.meta?.warnings?.some((x) => x.includes("リフ文法を選んだ時だけ") && x.includes("弱音の強さ"))).toBe(true);
    expect(none.items).toStrictEqual(genChordPattern(FRAME, 3, {}).items);
  });
});

describe("到達口", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("①/music/gen_chord_pattern：両つまみが届く（直呼びと一致）", async () => {
    const j = (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: FRAME, seed: 3, guitarRiff: "pedal_answer", guitarPalmGate: 0.5, guitarGhostVel: 30 } })).json() as { items: { content: { hits: Hit[] } }[] };
    expect(j.items[0]!.content.hits).toEqual(hitsOf(genChordPattern(FRAME, 3, { guitarRiff: "pedal_answer", guitarPalmGate: 0.5, guitarGhostVel: 30 })));
    expect(j.items[0]!.content.hits).not.toEqual(hitsOf(genChordPattern(FRAME, 3, { guitarRiff: "pedal_answer" })));
  });
  it("②MCP：inputSchema に載り、callTool で届く", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const cl = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), cl.connect(ct)]);
    const props = ((await cl.listTools()).tools.find((t) => t.name === "gen_chord_pattern")!.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props.guitarPalmGate).toBeDefined();
    expect(props.guitarGhostVel).toBeDefined();
    const r = await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: FRAME, seed: 3, guitarRiff: "power_chug", guitarPalmGate: 0.95, guitarGhostVel: 64 } });
    const j = JSON.parse((r.content as { text: string }[])[0]!.text) as { items: { content: { hits: Hit[] } }[] };
    expect(j.items[0]!.content.hits).toEqual(hitsOf(genChordPattern(FRAME, 3, { guitarRiff: "power_chug", guitarPalmGate: 0.95, guitarGhostVel: 64 })));
  });
  it("③/gen/section：body.chord.guitarPalmGate／guitarGhostVel が届く", async () => {
    const get = async (chord: object) => {
      const j = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_progression", "chord_pattern"], chord } })).json() as { composition: { children: { node: { neta: { kind: string; content: { hits: Hit[] } } } }[] } };
      return j.composition.children.find((c) => c.node.neta.kind === "chord_pattern")!.node.neta.content.hits;
    };
    const base = await get({ guitarRiff: "power_chug" });
    const knob = await get({ guitarRiff: "power_chug", guitarPalmGate: 1, guitarGhostVel: 90 });
    expect(knob.map((h) => h.step)).toEqual(base.map((h) => h.step));
    knob.forEach((h, i) => {
      expect(h.dur).toBeCloseTo(base[i]!.dur / 0.8, 2);
      if (h.riff.kind === "ghost") expect(h.vel).toBe(90);
    });
  });
});
