// 錨の厳しさ（design.md 追補 (k-6)・2026-09-15 オーナー裁定「変わり目だけ必須」）。
// **不変条件は4口から返る content で確かめる**：①コードの変わり目のキックは全部ルート ②滞在中のキックの音は許容音
// （oracle＝このファイルの小さな表＝生成器の表を import しない）。被覆率（変わり目キック数・滞在中キック数が 0 でない）と変異検査を添える。
// anchorLock:true の出音は**裁定により意図して変わる**（旧＝全キックでルート）。旧挙動は anchorStrictness:"every-kick" で残る。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, genDrums, type DrumsInput } from "../src/music/generate";

type Note = { pitch: number; start: number; dur: number };
type Chord = { root: number; quality: string; start: number; dur: number };
const BF = { meter: "4/4", bars: 4, key: 0 };
// 真因調査の試聴条件3（vi-IV-I-V・キック [0,8,10,12]）＝旧挙動で答句4音がルートへ上書きされた譜。
const CANON: Chord[] = [{ root: 9, quality: "m", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }, { root: 0, quality: "", start: 8, dur: 4 }, { root: 7, quality: "", start: 12, dur: 4 }];
// 小節の途中でコードが変わる進行（変わり目のキックが小節頭以外に来る）。
const MIXED: Chord[] = [{ root: 9, quality: "m", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 2 }, { root: 7, quality: "7", start: 6, dur: 2 }, { root: 0, quality: "", start: 8, dur: 8 }];
const drums = (kick: number[]): DrumsInput => ({ rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: kick }, { name: "Snare", midi: 38, hits: [4, 12] }] } });
const K3 = [0, 8, 10, 12];
const KM = [0, 6, 10, 14];

// ── oracle（生成器の表を使わない） ──
const TONES: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10] };
const chordAt = (cs: Chord[], t: number) => cs.find((c) => c.start <= t + 1e-9 && t < c.start + c.dur - 1e-9) ?? cs[cs.length - 1]!;
const allowed = (c: Chord): Set<number> => {
  const iv = new Set(TONES[c.quality]!);
  iv.add(7); if (!iv.has(11)) iv.add(10); // 5度（この表の和音はどれも完全5度）・b7（長7度が無ければ）
  return new Set([...iv].map((x) => (x + c.root) % 12));
};
const pc = (p: number) => ((p % 12) + 12) % 12;

/** キックを「変わり目」「滞在中」に分けて、返った notes に2本の不変条件を当てる。 */
function audit(notes: Note[], cs: Chord[], kick: number[], bars = 4) {
  const r = { change: 0, stay: 0, stayNonRoot: 0, badChange: [] as number[], badStay: [] as number[], changeMissing: [] as number[] };
  let lastKey: string | null = null; // 同じコード（root と quality）が続く間は滞在中
  for (let b = 0; b < bars; b++) for (const k of [...kick].sort((x, y) => x - y)) {
    const t = b * 4 + k * 0.25;
    const c = chordAt(cs, t);
    const n = notes.find((x) => Math.abs(x.start - t) < 1e-9);
    const key = `${c.root % 12}|${c.quality}`;
    if (key !== lastKey) {
      lastKey = key; r.change++;
      if (!n) r.changeMissing.push(t); else if (pc(n.pitch) !== c.root % 12) r.badChange.push(t);
    } else {
      r.stay++;
      if (n) { if (!allowed(c).has(pc(n.pitch))) r.badStay.push(t); if (pc(n.pitch) !== c.root % 12) r.stayNonRoot++; }
    }
  }
  return r;
}
const notesOf = (r: ReturnType<typeof genBass>) => (r.items[0]!.content as { notes: Note[] }).notes;

describe("生成器直呼び：新しい契約（変わり目＝ルート／滞在中＝許容音）＋被覆率", () => {
  for (const [name, cs, kick] of [["条件3 vi-IV-I-V", CANON, K3], ["小節途中のコードチェンジ", MIXED, KM]] as const) {
    for (const grammar of ["pedal_answer", "gallop_pedal", "octave_call_response"]) {
      it(`${name}・${grammar}：①②が成り立ち、変わり目・滞在中のキックがどちらも 0 でない`, () => {
        const a = audit(notesOf(genBass(BF, [...cs], 11, drums([...kick]), { anchorLock: true, anchorGrammar: grammar })), [...cs], [...kick]);
        expect(a.badChange).toEqual([]);
        expect(a.changeMissing).toEqual([]);
        expect(a.badStay).toEqual([]);
        expect(a.change).toBeGreaterThan(0);
        expect(a.stay).toBeGreaterThan(0);
      });
    }
  }
  it("条件3（pedal_answer）で滞在中のキックに非ルートの許容音が実際に残る＝規則が空虚でない（裁定による意図した変更）", () => {
    const a = audit(notesOf(genBass(BF, CANON, 11, drums(K3), { anchorLock: true })), CANON, K3);
    expect(a.stayNonRoot).toBeGreaterThan(0);
    const strict = audit(notesOf(genBass(BF, CANON, 11, drums(K3), { anchorLock: true, anchorStrictness: "every-kick" })), CANON, K3);
    expect(strict.stayNonRoot).toBe(0); // 源流互換モードは全キックでルート（従来）
  });
  it("every-kick は案B 既定 OFF（源流互換）・chord-change は案B 既定 ON（明示の false/true が勝つ）", () => {
    const kick = [0, 5, 9, 13];
    const cc = genBass(BF, CANON, 11, drums(kick), { anchorLock: true });
    expect(cc).toStrictEqual(genBass(BF, CANON, 11, drums(kick), { anchorLock: true, anchorRestOnSyncopatedKick: true }));
    expect(notesOf(genBass(BF, CANON, 11, drums(kick), { anchorLock: true, anchorRestOnSyncopatedKick: false })).length).toBeGreaterThan(notesOf(cc).length);
    const ek = genBass(BF, CANON, 11, drums(kick), { anchorLock: true, anchorStrictness: "every-kick" });
    expect(ek).toStrictEqual(genBass(BF, CANON, 11, drums(kick), { anchorLock: true, anchorStrictness: "every-kick", anchorRestOnSyncopatedKick: false }));
  });
  it("知らない厳しさは既定（変わり目だけ）で生成し、meta.warnings で告げる", () => {
    const r = genBass(BF, CANON, 11, drums(K3), { anchorLock: true, anchorStrictness: "loose" as never });
    expect(r.meta?.warnings?.some((w) => w.includes("loose"))).toBe(true);
    expect(notesOf(r)).toEqual(notesOf(genBass(BF, CANON, 11, drums(K3), { anchorLock: true })));
  });
  it("anchorLock 無しで厳しさだけ渡しても出音は従来（bit 一致）で、効かないことを告げる", () => {
    const r = genBass(BF, CANON, 11, drums(K3), { anchorStrictness: "every-kick" });
    expect(notesOf(r)).toStrictEqual(notesOf(genBass(BF, CANON, 11, drums(K3))));
    expect(r.meta?.warnings?.some((w) => w.includes("キックにルートを置く") && w.includes("だけ"))).toBe(true);
  });
});

describe("変異検査（出力に故障を注入＝それぞれ落ちる）", () => {
  const base = () => notesOf(genBass(BF, CANON, 11, drums(K3), { anchorLock: true })).map((n) => ({ ...n }));
  it("陽性対照：無傷は通る", () => {
    const a = audit(base(), CANON, K3);
    expect(a.badChange.length + a.badStay.length + a.changeMissing.length).toBe(0);
  });
  it("変わり目のキックを1つ非ルートにする → ①が落ちる", () => {
    const n = base();
    const hit = n.find((x) => Math.abs(x.start - 4) < 1e-9)!; // F 区間の最初のキック
    hit.pitch += 7;
    expect(audit(n, CANON, K3).badChange.length).toBe(1);
  });
  it("滞在中のキックに非許容音を入れる → ②が落ちる", () => {
    const n = base();
    const hit = n.find((x) => Math.abs(x.start - 6) < 1e-9)!; // F 区間の step 8（滞在中）
    hit.pitch = hit.pitch - pc(hit.pitch) + 6; // F に対する長7度（E=4）でも b7 でもない F#
    expect(audit(n, CANON, K3).badStay.length).toBe(1);
  });
});

// ── 到達口 ──
const FRAME2 = { bars: 4, meter: "4/4", key: 0 };
const direct = (o: object) => notesOf(genBass(FRAME2, CANON, 42, drums(K3), o));

describe("到達口①＝/music/gen_bass", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  const post = async (p: object) => ((await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME2, chords: CANON, seed: 42, drums: drums(K3), anchorLock: true, ...p } })).json() as { items: { content: { notes: Note[] } }[]; meta?: { warnings?: string[] } });
  it("既定＝chord-change の content が①②を満たす／anchorStrictness・案B の明示 false が届く", async () => {
    const d = await post({});
    const a = audit(d.items[0]!.content.notes, CANON, K3);
    expect(a.badChange.length + a.badStay.length + a.changeMissing.length).toBe(0);
    expect(a.stay).toBeGreaterThan(0);
    expect(d.items[0]!.content.notes).toEqual(direct({ anchorLock: true }));
    expect((await post({ anchorStrictness: "every-kick" })).items[0]!.content.notes).toEqual(direct({ anchorLock: true, anchorStrictness: "every-kick" }));
    const kick = [0, 5, 9, 13];
    const off = (await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME2, chords: CANON, seed: 42, drums: drums(kick), anchorLock: true, anchorRestOnSyncopatedKick: false } })).json() as { items: { content: { notes: Note[] } }[] };
    expect(off.items[0]!.content.notes).toEqual(notesOf(genBass(FRAME2, CANON, 42, drums(kick), { anchorLock: true, anchorRestOnSyncopatedKick: false })));
    expect(off.items[0]!.content.notes).not.toEqual(notesOf(genBass(FRAME2, CANON, 42, drums(kick), { anchorLock: true })));
  });
  it("知らない値は meta.warnings", async () => {
    expect((await post({ anchorStrictness: "loose" })).meta?.warnings?.some((w) => w.includes("loose"))).toBe(true);
  });
});

describe("到達口②＝MCP gen_bass", () => {
  it("inputSchema に anchorStrictness（enum）が載り、callTool で届く", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_bass")!;
    const props = (tool.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.anchorStrictness?.enum).toEqual(["chord-change", "every-kick"]);
    const call = async (args: object) => (JSON.parse(((await client.callTool({ name: "gen_bass", arguments: { frame: FRAME2, chords: CANON, seed: 42, drums: drums(K3), anchorLock: true, ...args } })) as { content: { text: string }[] }).content[0]!.text) as { items: { content: { notes: Note[] } }[] });
    const cc = (await call({})).items[0]!.content.notes;
    const ek = (await call({ anchorStrictness: "every-kick" })).items[0]!.content.notes;
    expect(cc).toEqual(direct({ anchorLock: true }));
    expect(ek).toEqual(direct({ anchorLock: true, anchorStrictness: "every-kick" }));
    expect(ek).not.toEqual(cc);
    const a = audit(cc, CANON, K3);
    expect(a.badChange.length + a.badStay.length + a.changeMissing.length).toBe(0);
  });
});

describe("到達口③＝/gen/section（body.bass 素通し）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("bass.anchorStrictness が届き、返った content が①②を満たす（生成済みドラムと進行で）", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const seed = 42;
    const get = async (bass: object) => {
      const j = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame, seed, parts: ["chords", "bass", "drums"], bass: { anchorLock: true, ...bass } } })).json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
      const kid = (k: string) => j.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
      return { bass: (kid("bass") as { notes: Note[] }).notes, chords: (kid("chord_progression") as { chords: Chord[] }).chords };
    };
    const cc = await get({});
    const ek = await get({ anchorStrictness: "every-kick" });
    const d = genDrums(frame, seed).items[0]!.content as DrumsInput;
    expect(ek.bass).toEqual(notesOf(genBass(frame, ek.chords, seed, d, { anchorLock: true, anchorStrictness: "every-kick" })));
    expect(cc.bass).toEqual(notesOf(genBass(frame, cc.chords, seed, d, { anchorLock: true })));
    // 変わり目は必ずルート（セクションの進行の quality はこの表に無いこともあるので①だけ見る）
    const kick = d.rhythm!.lanes!.find((l) => l.midi === 36)!.hits!.map((s) => s * (16 / d.rhythm!.steps!));
    const a = audit(cc.bass, cc.chords.map((c) => ({ ...c, quality: "" })), kick);
    expect(a.badChange).toEqual([]);
    expect(a.changeMissing).toEqual([]);
    expect(a.change).toBeGreaterThan(0);
  });
});
