// design §2106(g-2)：狙い「タム回し」＝bodyAim:"tom_tumble"（2026-09-16 オーナー耳判定で取り込み）。
// 中身は源流 AIM_PRESETS の「つまみの1点」＝既存 bodyFill を解き直すだけ。最重要＝未指定は bit 一致・明示つまみが勝つ・黙らない。
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { genDrums } from "../src/music/generate";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";

type Rhythm = { fillNotes?: { beat: number; midi: number; velocity: number }[]; fillKind?: string };
const rh = (r: ReturnType<typeof genDrums>): Rhythm => (r.items[0]!.content as { rhythm: Rhythm }).rhythm;
const TOMS = new Set([41, 43, 45, 47, 48, 50]);
const F = (meter: string) => ({ meter, bars: 5, tempo: 104, key: 7 });
const TUMBLE = { bodyDepth: 0.45, bodyDensity: 0.9, bodyDrummer: "none", fillLength: "bar" as const, fillBeat: 0 };

describe("bodyAim:tom_tumble（genDrums）", () => {
  it("未指定＝従来と bit 一致（body・grid とも）", () => {
    for (const seed of [1, 2, 3]) {
      expect(genDrums(F("4/4"), seed, { fill: 1, fillStyle: "body", bodyAim: undefined })).toStrictEqual(genDrums(F("4/4"), seed, { fill: 1, fillStyle: "body" }));
    }
  });

  it("タム回し＝既存つまみの1点（depth0.45/density0.9/純物理/1小節/頭から）と完全一致（4/4・3/4・6/8）", () => {
    for (const meter of ["4/4", "3/4", "6/8"]) for (const seed of [1, 2]) {
      const a = genDrums(F(meter), seed, { fill: 1, fillStyle: "body", bodyAim: "tom_tumble" });
      expect(a).toStrictEqual(genDrums(F(meter), seed, { fill: 1, fillStyle: "body", ...TUMBLE }));
      expect(rh(a).fillKind).toBe("body");
      expect(rh(a).fillNotes!.some((n) => TOMS.has(n.midi))).toBe(true);
      expect(a.meta?.warnings ?? []).toEqual([]);
    }
  });

  it("明示つまみが勝つ", () => {
    const a = genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body", bodyAim: "tom_tumble", fillLength: "2beat", bodyDrummer: "drummer1" });
    const b = genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body", ...TUMBLE, fillLength: "2beat", bodyDrummer: "drummer1" });
    expect(a).toStrictEqual(b);
  });

  it("body 以外・フィル無しは出音を変えず告げる", () => {
    const grid = genDrums(F("4/4"), 1, { fill: 1, bodyAim: "tom_tumble" });
    expect(grid.items).toStrictEqual(genDrums(F("4/4"), 1, { fill: 1 }).items);
    expect(grid.meta?.warnings?.some((w) => w.includes("タム回し"))).toBe(true);
    const noFill = genDrums(F("4/4"), 1, { fillStyle: "body", bodyAim: "tom_tumble" });
    expect(noFill.meta?.warnings?.some((w) => w.includes("タム回し"))).toBe(true);
  });

  it("知らない狙い名は無視して告げる（出音は未指定と同じ）", () => {
    const r = genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body", bodyAim: "uphill_crash" as never });
    expect(r.items).toStrictEqual(genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body" }).items);
    expect(r.meta?.warnings?.some((w) => w.includes("uphill_crash"))).toBe(true);
  });

  it("body が解けない拍子（5/4）では、落ち先の通知に加えて狙いが使えなかったと告げる", () => {
    const r = genDrums({ ...F("5/4") }, 1, { fill: 1, fillStyle: "body", bodyAim: "tom_tumble" });
    expect(r.meta?.warnings?.some((w) => w.includes("タム回し"))).toBe(true);
  });
});

describe("bodyAim の到達口", () => {
  it("POST /music/gen_drums と /gen/section（drums.bodyAim）", async () => {
    const app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
    const r = await app.inject({ method: "POST", url: "/music/gen_drums", payload: { frame: F("4/4"), seed: 1, fill: 1, fillStyle: "body", bodyAim: "tom_tumble" } });
    expect(r.json().items[0].content).toStrictEqual(genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body", bodyAim: "tom_tumble" }).items[0]!.content);
    const s = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: F("4/4"), seed: 1, parts: ["drums"], drums: { fill: 1, fillStyle: "body", bodyAim: "tom_tumble" } } });
    const kids = s.json().composition.children as { node: { neta: { kind: string; content: unknown } } }[];
    expect(kids.find((c) => c.node.neta.kind === "rhythm")!.node.neta.content).toStrictEqual(genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body", bodyAim: "tom_tumble" }).items[0]!.content);
    // 通知も素通し（黙らない）
    const w = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: F("4/4"), seed: 1, parts: ["drums"], drums: { fill: 1, bodyAim: "tom_tumble" } } });
    expect((w.json().warnings ?? []).some((x: string) => x.includes("タム回し"))).toBe(true);
  });

  it("MCP gen_drums の inputSchema に bodyAim が載り、結果が genDrums と一致", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_drums")!;
    expect(JSON.stringify(tool.inputSchema)).toContain("tom_tumble");
    const res = await client.callTool({ name: "gen_drums", arguments: { frame: F("4/4"), seed: 1, fill: 1, fillStyle: "body", bodyAim: "tom_tumble" } });
    const body = JSON.parse((res as { content: { text: string }[] }).content[0]!.text);
    expect(body.items[0].content).toStrictEqual(genDrums(F("4/4"), 1, { fill: 1, fillStyle: "body", bodyAim: "tom_tumble" }).items[0]!.content);
  });
});
