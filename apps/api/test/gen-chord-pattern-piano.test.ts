// ピアノ伴奏の生成を入口へつなぐ（S5・opt-in・既定 OFF）。正典＝docs/design.md「和音パターンの明示の音」の「入口」。
//   ①piano:true＋進行で、明示の音＋ペダル＋feel（keepDur）の content を返す（写しの関数と一致）
//   ②4拍子以外・進行なしは従来の経路で生成し meta.warnings で告げる ③piano 未指定は従来と bit 一致
//   到達口＝直呼び／HTTP／MCP（inputSchema に載る）／/gen/section（body.chord）。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { handFrameToChordPattern } from "@cm/music-core";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genChordPattern } from "../src/music/generate";

const FRAME = { bars: 4, meter: "4/4", key: 0, tempo: 96 };
const CHORDS = [
  { root: 5, quality: "maj7", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 },
  { root: 4, quality: "m7", start: 8, dur: 4 }, { root: 9, quality: "m7", start: 12, dur: 2 }, { root: 7, quality: "", start: 14, dur: 2 },
];
const BAND = CHORDS.map((c) => ({ root: c.root, quality: c.quality, beats: c.dur }));
type Item = { kind: string; label: string; content: Record<string, unknown> };
type Res = { items: Item[]; meta?: { warnings?: string[] } };

describe("直呼び", () => {
  it("piano:true＝写しと同じ content に feel（keepDur）を載せて返す・warnings なし", () => {
    const r = genChordPattern(FRAME, 11, { piano: true, chords: CHORDS });
    const want = handFrameToChordPattern(BAND, { tempo: 96, seed: 11, key: 0 });
    expect(r.meta).toBeUndefined();
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.kind).toBe("chord_pattern");
    expect(r.items[0]!.content).toEqual({ ...want.content, feel: want.feel });
    const c = r.items[0]!.content as { hits: { notes?: unknown[] }[]; pedal?: unknown[]; feel?: { keepDur?: boolean } };
    expect(c.hits.every((h) => Array.isArray(h.notes) && h.notes.length > 0)).toBe(true);
    expect(c.pedal!.length).toBeGreaterThan(0);
    expect(c.feel!.keepDur).toBe(true);
  });
  it("8分裏の単音・打鍵の揺れの off が届く（揺れ off＝feel なし）", () => {
    const r = genChordPattern(FRAME, 11, { piano: true, chords: CHORDS, pianoOffbeatSingles: false, pianoHumanize: false });
    const want = handFrameToChordPattern(BAND, { tempo: 96, seed: 11, key: 0, offbeatSingles: false, humanize: false });
    expect(r.items[0]!.content).toEqual(want.content);
    expect("feel" in (r.items[0]!.content as object)).toBe(false);
  });
  it("variety＝種を1ずつ変えた候補を n 件", () => {
    const r = genChordPattern(FRAME, 11, { piano: true, chords: CHORDS, variety: 4 });
    expect(r.items.map((i) => (i.content as { gen: { seed: number } }).gen.seed)).toEqual([11, 12, 13, 14]);
    expect(new Set(r.items.map((i) => i.label)).size).toBe(4);
  });
  it("4拍子以外・進行なし＝従来の経路（piano なしと同じ）＋落ち先を告げる", () => {
    const f34 = { ...FRAME, meter: "3/4" };
    const a = genChordPattern(f34, 11, { piano: true, chords: CHORDS });
    expect(a.items).toStrictEqual(genChordPattern(f34, 11, undefined).items);
    expect(a.meta?.warnings?.[0]).toContain("4拍子");
    const b = genChordPattern(FRAME, 11, { piano: true });
    expect(b.items).toStrictEqual(genChordPattern(FRAME, 11, undefined).items);
    expect(b.meta?.warnings?.[0]).toContain("コード進行");
    const f68 = { ...FRAME, meter: "6/8" };
    expect(genChordPattern(f68, 11, { piano: true, chords: CHORDS }).meta?.warnings?.[0]).toContain("4拍子");
  });
  it("piano 未指定・false は従来と bit 一致", () => {
    expect(JSON.stringify(genChordPattern(FRAME, 11, { piano: false, chords: CHORDS }))).toBe(JSON.stringify(genChordPattern(FRAME, 11, {})));
  });
});

describe("右手の高さ（pianoRhFrom・2026-09-23 裁定）", () => {
  it("72＝写しの rhFrom:72 と同じ・来歴に残る・未指定は C4 から（来歴に rhFrom なし）", () => {
    const hi = genChordPattern(FRAME, 11, { piano: true, chords: CHORDS, pianoRhFrom: 72 });
    const want = handFrameToChordPattern(BAND, { tempo: 96, seed: 11, key: 0, rhFrom: 72 });
    expect((hi.items[0]!.content as { hits: unknown }).hits).toEqual(want.content.hits);
    expect((hi.items[0]!.content as { gen: { rhFrom?: number; register: string } }).gen).toMatchObject({ rhFrom: 72, register: "piano" });
    const lo = genChordPattern(FRAME, 11, { piano: true, chords: CHORDS });
    expect((lo.items[0]!.content as { gen: { rhFrom?: number } }).gen.rhFrom).toBeUndefined();
    expect((hi.items[0]!.content as { hits: unknown }).hits).not.toEqual((lo.items[0]!.content as { hits: unknown }).hits);
  });
});

describe("到達口", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("HTTP /music/gen_chord_pattern", async () => {
    const r = (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: FRAME, seed: 11, chords: CHORDS, piano: true, pianoHumanize: false, pianoRhFrom: 72 } })).json() as Res;
    expect(r.items[0]!.content).toEqual(genChordPattern(FRAME, 11, { piano: true, chords: CHORDS, pianoHumanize: false, pianoRhFrom: 72 }).items[0]!.content);
    expect(r.meta).toBeUndefined();
    const w = (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: { ...FRAME, meter: "3/4" }, seed: 11, chords: CHORDS, piano: true } })).json() as Res;
    expect(w.meta?.warnings?.[0]).toContain("4拍子");
  });

  it("MCP gen_chord_pattern（inputSchema に載る）", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const cl = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), cl.connect(b)]);
    const t = (await cl.listTools()).tools.find((x) => x.name === "gen_chord_pattern")!;
    expect(Object.keys(t.inputSchema.properties as object)).toEqual(expect.arrayContaining(["piano", "pianoOffbeatSingles", "pianoHumanize", "pianoRhFrom", "chords"]));
    const got = JSON.parse(((await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: FRAME, seed: 11, chords: CHORDS, piano: true, pianoOffbeatSingles: false } })).content as { text: string }[])[0]!.text) as Res;
    expect(got.items[0]!.content).toEqual(genChordPattern(FRAME, 11, { piano: true, chords: CHORDS, pianoOffbeatSingles: false }).items[0]!.content);
    const w = JSON.parse(((await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: { ...FRAME, meter: "6/8" }, seed: 11, chords: CHORDS, piano: true } })).content as { text: string }[])[0]!.text) as Res;
    expect(w.meta?.warnings?.[0]).toContain("4拍子");
  });

  it("/gen/section body.chord.piano＝生成した進行でピアノ伴奏・4拍子以外は warnings", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 5, parts: ["chords", "comp"], chord: { piano: true } } })).json() as {
      composition: { children: { node: { neta: { kind: string; content: Record<string, unknown> } } }[] }; warnings?: string[];
    };
    expect(r.warnings).toBeUndefined();
    const cp = r.composition.children.find((c) => c.node.neta.kind === "chord_pattern")!.node.neta.content;
    const prog = r.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: typeof CHORDS };
    expect(cp).toEqual(genChordPattern(FRAME, 5, { piano: true, chords: prog.chords }).items[0]!.content);
    expect(Array.isArray(cp.pedal)).toBe(true);
    const w = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { ...FRAME, meter: "3/4" }, seed: 5, parts: ["chords", "comp"], chord: { piano: true } } })).json() as { warnings?: string[] };
    expect(w.warnings?.some((x) => x.includes("4拍子"))).toBe(true);
  });
});
