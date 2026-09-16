// 2026-09-16 リフ撤去（オーナー裁定・docs/design.md 追補 (k) の撤去記録）：外したつまみが古い呼び出しから届いても
//   ①出音は「つまみ無し」と 1bit も変わらない ②黙って捨てず meta.warnings（/gen/section は warnings）で「外しました」と告げる
//   ③外したつまみを何も送らなければ通知は生えない（従来の形）。到達口＝直呼び／HTTP／MCP（passthrough）／/gen/section。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, genChordPattern, genDrums, removedRiffKnobWarning } from "../src/music/generate";

const FRAME = { bars: 4, meter: "4/4", key: 0, tempo: 120 };
const CHORDS = [{ root: 9, quality: "m", start: 0, dur: 8 }, { root: 5, quality: "", start: 8, dur: 8 }];
const DRUMS = genDrums(FRAME, 3).items[0]!.content;
const OLD_BASS = { anchorLock: true, anchorGrammar: "gallop_pedal", anchorStrictness: "every-kick", chordFollow: true, riffVariationSteps: true };
const OLD_CHORD = { guitarRiff: "gallop", anchorLock: true, guitarShape: true, keyStab: true, guitarPalmGate: 0.5 };
type Res = { items: { content: unknown }[]; meta?: { warnings?: string[] } };
const REMOVED = "2026-09-16 に外した機能";

describe("直呼び（通知文）", () => {
  it("ベース：送られた外したつまみの名前を並べて告げる／何も無ければ null", () => {
    const w = removedRiffKnobWarning(OLD_BASS, "bass")!;
    for (const label of ["キックにルートを置く", "間のリフ（リフ文法）", "ルートを置くキック", "コードに合わせ直す", "変奏を3段で並べる"]) expect(w).toContain(`「${label}」`);
    expect(w).toContain(REMOVED);
    expect(removedRiffKnobWarning({ kickLock: 0.5, style: "JZ-WALK" }, "bass")).toBeNull();
    expect(removedRiffKnobWarning(undefined, "bass")).toBeNull();
  });
  it("コード楽器：anchorLock は「キックに刻みを揃える」と言う（部位で意味が違う）", () => {
    const w = removedRiffKnobWarning(OLD_CHORD, "chord")!;
    for (const label of ["ギターのリフ文法", "キックに刻みを揃える", "手の形で弾く", "キックの隙間に刺す（鍵盤）", "刻みの短さ"]) expect(w).toContain(`「${label}」`);
  });
});

describe("到達口：出音は従来のまま・通知が届く", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("①HTTP gen_bass／gen_chord_pattern", async () => {
    const base = { frame: FRAME, chords: CHORDS, seed: 7, drums: DRUMS };
    const plain = (await app.inject({ method: "POST", url: "/music/gen_bass", payload: base })).json() as Res;
    const old = (await app.inject({ method: "POST", url: "/music/gen_bass", payload: { ...base, ...OLD_BASS } })).json() as Res;
    expect(old.items).toStrictEqual(plain.items);
    expect(old.meta?.warnings?.some((x) => x.includes(REMOVED) && x.includes("キックにルートを置く"))).toBe(true);
    expect(plain.meta?.warnings ?? []).not.toContainEqual(expect.stringContaining(REMOVED));
    const cpPlain = (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: FRAME, seed: 7 } })).json() as Res;
    const cpOld = (await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: FRAME, seed: 7, drums: DRUMS, chords: CHORDS, ...OLD_CHORD } })).json() as Res;
    expect(cpOld.items).toStrictEqual(cpPlain.items);
    expect(cpOld.meta?.warnings?.some((x) => x.includes(REMOVED) && x.includes("ギターのリフ文法"))).toBe(true);
    expect("meta" in cpPlain).toBe(false);
  });

  it("②MCP gen_bass／gen_chord_pattern（schema から外したキーも passthrough で拾って告げる）", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const cl = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), cl.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>): Promise<Res> =>
      JSON.parse(((await cl.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text) as Res;
    const bPlain = await call("gen_bass", { frame: FRAME, chords: CHORDS, seed: 7 });
    const bOld = await call("gen_bass", { frame: FRAME, chords: CHORDS, seed: 7, ...OLD_BASS });
    expect(bOld.items).toStrictEqual(bPlain.items);
    expect(bOld.meta?.warnings?.some((x) => x.includes(REMOVED))).toBe(true);
    const cPlain = await call("gen_chord_pattern", { frame: FRAME, seed: 7 });
    const cOld = await call("gen_chord_pattern", { frame: FRAME, seed: 7, ...OLD_CHORD });
    expect(cOld.items).toStrictEqual(cPlain.items);
    expect(cOld.meta?.warnings?.some((x) => x.includes(REMOVED) && x.includes("キックの隙間に刺す（鍵盤）"))).toBe(true);
    // 外したつまみは schema に載っていない（Chat 入口の Claude に見せない）
    const tools = (await cl.listTools()).tools;
    const props = (n: string) => Object.keys((tools.find((t) => t.name === n)!.inputSchema as { properties: Record<string, unknown> }).properties);
    for (const k of Object.keys(OLD_BASS)) expect(props("gen_bass")).not.toContain(k);
    for (const k of Object.keys(OLD_CHORD)) expect(props("gen_chord_pattern")).not.toContain(k);
    expect(props("gen_bass")).toContain("style"); // 陰性対照＝空振りで緑になっていない
  });

  it("③/gen/section：body.bass／body.chord の外したつまみを部位名つきで告げる・送らなければ warnings は生えない", async () => {
    const old = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern", "bass", "rhythm"], bass: { anchorLock: true }, chord: { keyStab: true } } })).json() as { warnings?: string[] };
    expect(old.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/^ベース：.*キックにルートを置く/), expect.stringMatching(/^コード楽器：.*キックの隙間に刺す/)]));
    const plain = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: FRAME, seed: 11, parts: ["chord_pattern", "bass", "rhythm"] } })).json() as { warnings?: string[] };
    expect(plain.warnings).toBeUndefined();
  });

  it("直呼びの出音も従来と同じ（外したキーを型を無視して渡しても経路は立たない）", () => {
    expect((genBass(FRAME, CHORDS, 7, DRUMS as never, OLD_BASS as never) as Res).items).toStrictEqual((genBass(FRAME, CHORDS, 7, DRUMS as never, {}) as Res).items);
    expect((genChordPattern(FRAME, 7, OLD_CHORD as never) as Res).items).toStrictEqual((genChordPattern(FRAME, 7, undefined) as Res).items);
  });
});
