// 2026-09-13 M6a 監査 中1：隙間刺し（keyStab）／ギターのリフが立つと pattern（型・ジャンル）と variety（候補数）が
//   黙って捨てられていた（web は常に pattern＋variety=4 を送る＝トグル ON で候補が1件になり何も告げない）。
//   併用は定義されていないので「使っていない」を meta.warnings で告げる。到達口①HTTP ②MCP ③/gen/section（④web は apps/web/test）。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genChordPattern, type DrumsInput } from "../src/music/generate";

const FRAME = { bars: 4, meter: "4/4", key: 0, tempo: 120 };
const DR: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 6, 10] }, { name: "Snare", midi: 38, hits: [4, 12] }] } };
type Res = { items: { content: unknown }[]; meta?: { warnings?: string[] } };
const TYPE = "選んだ型・ジャンル（rock）は使っていません";
const ONE = "候補は 4 件でなく1件です";

describe("型・候補数を使わない時は告げる（直呼び）", () => {
  it("隙間刺し：型＋variety で両方告げる／omakase は型の通知を出さない（番兵）／出音は型なしと同じ", () => {
    const r = genChordPattern(FRAME, 3, { pattern: "rock", variety: 4, keyStab: true, drums: DR }) as Res;
    expect(r.meta?.warnings?.some((x) => x.includes("キックの隙間に刺す") && x.includes(TYPE))).toBe(true);
    expect(r.meta?.warnings?.some((x) => x.includes(ONE))).toBe(true);
    expect(r.items).toStrictEqual((genChordPattern(FRAME, 3, { keyStab: true, drums: DR }) as Res).items);
    const om = genChordPattern(FRAME, 3, { pattern: "omakase", variety: 4, keyStab: true, drums: DR }) as Res;
    expect(om.meta?.warnings).toEqual([expect.stringContaining(ONE)]);
  });
  it("ギターのリフも同じ形で告げる", () => {
    const r = genChordPattern(FRAME, 3, { pattern: "CP-SYNC16", guitarRiff: "gallop" }) as Res;
    expect(r.meta?.warnings?.some((x) => x.includes("ギターのリフ") && x.includes("CP-SYNC16"))).toBe(true);
  });
  it("隙間刺しが立たず従来経路に落ちた時は型を使うので告げない（落ち先の通知だけ）", () => {
    const r = genChordPattern(FRAME, 3, { pattern: "rock", variety: 4, keyStab: true }) as Res;
    expect(r.meta?.warnings).toEqual([expect.stringContaining("ドラムが無いので")]);
    expect(r.items.length).toBeGreaterThan(1);
  });
  it("既定（keyStab/guitarRiff 無し）は meta が生えない＝従来", () => {
    expect("meta" in genChordPattern(FRAME, 3, { pattern: "rock", variety: 4 })).toBe(false);
  });
});

describe("到達口で通知が届く", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("①HTTP", async () => {
    const r = (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: FRAME, seed: 3, pattern: "rock", variety: 4, keyStab: true, drums: DR } })).json() as Res;
    expect(r.meta?.warnings?.some((x) => x.includes(TYPE))).toBe(true);
    expect(r.meta?.warnings?.some((x) => x.includes(ONE))).toBe(true);
  });
  it("②MCP", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const cl = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), cl.connect(b)]);
    const r = await cl.callTool({ name: "gen_chord_pattern", arguments: { frame: FRAME, seed: 3, pattern: "rock", variety: 4, keyStab: true, drums: DR } });
    const j = JSON.parse((r.content as { text: string }[])[0]!.text) as Res;
    expect(j.meta?.warnings?.some((x) => x.includes(TYPE))).toBe(true);
    expect(j.meta?.warnings?.some((x) => x.includes(ONE))).toBe(true);
  });
  it("③/gen/section は型・候補数を送らない＝捨てていないので告げない（嘘の通知を出さない）", async () => {
    const r = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern", "rhythm"], chord: { keyStab: true } } })).json() as { warnings?: string[] };
    expect((r.warnings ?? []).some((x) => x.includes("型・ジャンル") || x.includes("件でなく1件"))).toBe(false);
  });
});
