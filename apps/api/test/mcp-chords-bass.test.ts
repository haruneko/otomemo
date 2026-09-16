// 2026-09-13 M5 監査 軽微-2：MCP の chords に bass（分数コードのベース音）が無く、zod が黙って捨てていた
//   ＝HTTP 側（chords[].bass）と非対称・gen_bass の slashBass も MCP からは効かなかった（作ったのに触れないノブ）。
import { describe, it, expect, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";
import { genBass } from "../src/music/generate";

const FRAME = { bars: 2, meter: "4/4", key: 0, tempo: 120 };
const SLASH = [{ root: 0, quality: "", start: 0, dur: 4, bass: 4 }, { root: 7, quality: "", start: 4, dur: 4, bass: 11 }];

let cl: Client;
beforeEach(async () => {
  const server = buildMcpServer(new Core(openDb(":memory:")));
  const [a, b] = InMemoryTransport.createLinkedPair();
  cl = new Client({ name: "t", version: "0" });
  await Promise.all([server.connect(a), cl.connect(b)]);
});

describe("MCP chords[].bass が届く", () => {
  // gen_chord_pattern の chords は 2026-09-16 のリフ撤去でギターの検算ごと外した（相対型は進行を受け取らない）＝gen_bass だけを見る。
  it("gen_bass の inputSchema の chords に bass がある", async () => {
    const tools = (await cl.listTools()).tools;
    for (const name of ["gen_bass"]) {
      const t = tools.find((x) => x.name === name)!;
      const item = (t.inputSchema.properties as Record<string, { items?: { properties?: Record<string, unknown> } }>).chords!.items!;
      expect(Object.keys(item.properties!)).toContain("bass");
    }
  });
  it("callTool gen_bass slashBass：bass が届き直呼びと一致（捨てられていれば bass 無しと一致してしまう）", async () => {
    const r = await cl.callTool({ name: "gen_bass", arguments: { frame: FRAME, seed: 3, chords: SLASH, slashBass: true } });
    const got = JSON.parse((r.content as { text: string }[])[0]!.text) as { items: { content: unknown }[] };
    const withBass = genBass(FRAME, SLASH, 3, undefined, { slashBass: true }).items[0]!.content;
    const without = genBass(FRAME, SLASH.map(({ bass: _b, ...c }) => c), 3, undefined, { slashBass: true }).items[0]!.content;
    expect(JSON.stringify(withBass)).not.toBe(JSON.stringify(without)); // 前提：bass は出力に効く
    expect(got.items[0]!.content).toEqual(withBass); // MCP 側は付帯キー（label 等）が付くので content で比べる
  });
});
