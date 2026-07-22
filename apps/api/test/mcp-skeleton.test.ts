import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";
import { ingestCorpusStats } from "../src/music/corpusStats";

async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, core };
}
const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;

const frame = { key: 0, mode: "major", meter: "4/4", bars: 4 };
const chords = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 5, quality: "", start: 4, dur: 4 },
  { root: 7, quality: "", start: 8, dur: 4 },
  { root: 0, quality: "", start: 12, dur: 4 },
];

describe("mcp gen_skeleton / gen_melody skeleton injection (design #20)", () => {
  it("exposes gen_skeleton", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("gen_skeleton");
  });

  it("gen_skeleton returns kind=skeleton candidates", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "gen_skeleton", arguments: { frame, chords, seed: 3 } });
    const out = JSON.parse(textOf(res));
    expect(out.items.length).toBe(1);
    expect(out.items[0].kind).toBe("skeleton");
    expect(out.items[0].content.bars).toBe(4);
    expect(out.items[0].content.tones.length).toBeGreaterThan(0);
  });

  it("gen_skeleton(skelColor) は脱平面化＝skelColor=0 と別の骨格を返す（強拍倚音を注入）", async () => {
    const { client } = await connect();
    const eight = { key: 0, mode: "major", meter: "4/4", bars: 8 };
    const eightChords = [0, 9, 5, 7, 0, 9, 5, 7].map((r, i) => ({ root: r, quality: i % 4 === 1 ? "m" : "", start: i * 4, dur: 4 }));
    const sig = (o: any) => o.items[0].content.tones.map((t: any) => `${t.start}:${t.pitch}`).join(",");
    let differ = 0;
    for (const seed of [1, 3, 5, 7, 9, 11, 13, 15]) { // 倚音注入は確率的＝seed によっては不発。複数seedで発火を確認
      const plain = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed } })));
      const colored = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed, skelColor: 0.8 } })));
      if (sig(colored) !== sig(plain)) differ++;
    }
    expect(differ).toBeGreaterThan(0); // MCP スキーマが skelColor を通し、色付けで骨格が変わる seed がある
  });

  // WP-M1 第2スライス：gen_skeleton の corpus/cadDegStrength/contourCorpus（骨格層のみ・既定OFF=bit一致）。
  const eight = { key: 0, mode: "major", meter: "4/4", bars: 8 };
  const eightChords = [0, 9, 5, 7, 0, 9, 5, 7].map((r, i) => ({ root: r, quality: i % 4 === 1 ? "m" : "", start: i * 4, dur: 4 }));
  const sig = (o: any) => o.items[0].content.tones.map((t: any) => `${t.start}:${t.pitch}`).join(",");
  const lastTone = (o: any) => o.items[0].content.tones[o.items[0].content.tones.length - 1].pitch;
  function ingestSkelPriors(core: any) {
    // 句末を非5̂の安定音へ寄せる cadDeg（2̂=pc2/3̂=pc4/1̂=pc0）＋輪郭は ascending 支配（nudge を強制発火）。
    ingestCorpusStats(core.db, {
      skeleton: {
        major: {
          cadDeg: [{ pc: 0, pct: 30, n: 300 }, { pc: 2, pct: 40, n: 400 }, { pc: 4, pct: 30, n: 300 }],
          degHist: [{ pc: 0, pct: 25, n: 250 }, { pc: 4, pct: 25, n: 250 }, { pc: 7, pct: 25, n: 250 }, { pc: 9, pct: 25, n: 250 }],
          contour: [["ascending", 900, 90], ["arch", 100, 10]],
        },
      },
    });
  }

  it("gen_skeleton(corpus:true, cadDegStrength:0) は baseline とバイト一致（gate OFF）", async () => {
    const { client, core } = await connect();
    ingestSkelPriors(core);
    for (const seed of [1, 3, 5, 7]) {
      const base = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed } })));
      const c0 = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed, corpus: true, cadDegStrength: 0 } })));
      expect(sig(c0)).toBe(sig(base));
    }
  });

  it("gen_skeleton(contourCorpus:false) は baseline とバイト一致（既定OFF）", async () => {
    const { client, core } = await connect();
    ingestSkelPriors(core);
    for (const seed of [1, 3, 5, 7]) {
      const base = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed } })));
      const c0 = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed, corpus: true } })));
      expect(sig(c0)).toBe(sig(base)); // corpus:true でも cadDegStrength=0（既定）＋contourCorpus 未指定＝bit一致
    }
  });

  it("gen_skeleton(corpus:true, cadDegStrength:8) は句末を寄せつつ最終音=主音を保持", async () => {
    const { client, core } = await connect();
    ingestSkelPriors(core);
    let differ = 0;
    for (const seed of [1, 3, 5, 7, 9, 11, 13, 15]) {
      const base = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed } })));
      const cad = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed, corpus: true, cadDegStrength: 8 } })));
      if (sig(cad) !== sig(base)) differ++;
      expect(((lastTone(cad) % 12) + 12) % 12).toBe(0); // 曲末=主音pc（C）を硬く保持
    }
    expect(differ).toBeGreaterThan(0); // cadDeg バイアスで句末が動く seed がある
  });

  it("gen_skeleton(contourCorpus:true) は構造線を寄せつつ最終音=主音を保持", async () => {
    const { client, core } = await connect();
    ingestSkelPriors(core);
    let differ = 0;
    for (const seed of [1, 3, 5, 7, 9, 11, 13, 15]) {
      const base = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed } })));
      const con = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame: eight, chords: eightChords, seed, corpus: true, contourCorpus: true } })));
      if (sig(con) !== sig(base)) differ++;
      expect(((lastTone(con) % 12) + 12) % 12).toBe(0);
    }
    expect(differ).toBeGreaterThan(0); // 輪郭型抽選→nudge で構造線が動く seed がある
  });

  it("gen_melody(skeletonNetaId) injects a captured skeleton and echoes the id for linking", async () => {
    const { client, core } = await connect();
    // 骨格を生成→capture
    const skelRes = JSON.parse(textOf(await client.callTool({ name: "gen_skeleton", arguments: { frame, chords, seed: 3 } })));
    const captured = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "skeleton", content: skelRes.items[0].content } })));
    expect(captured.id).toBeTruthy();
    // 骨格注入でメロ生成
    const mel = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5, skeletonNetaId: captured.id } })));
    expect(mel.skeletonNetaId).toBe(captured.id);
    expect(mel.items[0].content.notes.length).toBeGreaterThan(0);
    // capture 後に realized_from を張れる（gen_melody は候補返しで neta 化しないため link は呼び出し側）
    const melNeta = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", content: mel.items[0].content } })));
    await client.callTool({ name: "link", arguments: { from: melNeta.id, to: captured.id, type: "realized_from" } });
    const rels = core.getRelations(melNeta.id);
    expect(rels.some((r) => r.type === "realized_from" && r.to === captured.id)).toBe(true);
    // 骨格側からは逆引き（getBacklinks）で表面化済みメロへ辿れる（design #20 見える化・双方向）。
    const back = core.getBacklinks(captured.id, "realized_from");
    expect(back.some((r) => r.type === "realized_from" && r.from === melNeta.id)).toBe(true);
    // 骨格は realized_from の outgoing を持たない（メロ→骨格向きに張るため）。
    expect(core.getRelations(captured.id).some((r) => r.type === "realized_from")).toBe(false);
  });

  it("gen_melody(skeletonNetaId) errors on a non-skeleton neta", async () => {
    const { client } = await connect();
    const mel = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } } })));
    const res = (await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5, skeletonNetaId: mel.id } })) as { isError?: boolean };
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("not skeleton");
  });

  // S3c：gen_bass の骨格結線（ベース表面化）。同契約＝skeletonNetaId 解決→注入→id エコー。
  it("gen_bass(skeletonNetaId) injects an explicit bass region and echoes the id for linking", async () => {
    const { client } = await connect();
    const bassChords = [{ root: 0, quality: "", start: 0, dur: 8 }];
    const bassFrame = { bars: 2, meter: "4/4", key: 0 };
    // 明示ベース点（D2=38・[0,2) をペダル）を持つ骨格を capture
    const skel = { bars: 2, tones: [{ start: 0, pitch: 60 }], bass: [{ start: 0, pitch: 38 }] };
    const captured = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "skeleton", content: skel } })));
    const base = JSON.parse(textOf(await client.callTool({ name: "gen_bass", arguments: { frame: bassFrame, chords: bassChords, seed: 42 } })));
    const withSkel = JSON.parse(textOf(await client.callTool({ name: "gen_bass", arguments: { frame: bassFrame, chords: bassChords, seed: 42, skeletonNetaId: captured.id } })));
    expect(withSkel.skeletonNetaId).toBe(captured.id);
    // [0,2) が 38 へ差し替わる＝骨格前と変わる
    const notes = withSkel.items[0].content.notes as { pitch: number; start: number }[];
    expect(JSON.stringify(notes)).not.toBe(JSON.stringify(base.items[0].content.notes));
    for (const n of notes.filter((n) => n.start < 2 - 1e-9)) expect(n.pitch).toBe(38);
  });

  it("gen_bass(skeletonNetaId) errors on a non-skeleton neta", async () => {
    const { client } = await connect();
    const mel = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } } })));
    const res = (await client.callTool({ name: "gen_bass", arguments: { frame, chords, seed: 5, skeletonNetaId: mel.id } })) as { isError?: boolean };
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("not skeleton");
  });

  // S3d：対位法レポートの生成側露出（analyzeVoiceLeading 転用・読み取り専用の meta 添付）。
  it("gen_melody は chords があれば候補に voiceLeading メタを添付する（ノート不変）", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5 } })));
    const it = out.items[0];
    expect(it.content.notes.length).toBeGreaterThan(0);
    expect(it.meta?.voiceLeading).toBeTruthy(); // score/違反件数の数値レポート
    expect(typeof it.meta.voiceLeading.score).toBe("number");
    expect(typeof it.meta.voiceLeadingSummary).toBe("string");
  });

  it("gen_melody は lower が無い（chords/bass/骨格明示 全て無し）なら meta を添付しない", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, seed: 5 } })));
    expect(out.items[0].content.notes.length).toBeGreaterThan(0);
    // 対位(voiceLeading)meta は lower 不在で添付しない。WP-M3 のメロ単体レンズ(lenses)は下声非依存ゆえ付きうる。
    expect(out.items[0].meta?.voiceLeading).toBeUndefined();
    expect(out.items[0].meta?.voiceLeadingSummary).toBeUndefined();
  });

  it("gen_bass は骨格ありでベース候補に voiceLeading メタを添付（骨格 tones=上声）", async () => {
    const { client } = await connect();
    const skel = { bars: 2, tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: 64 }], bass: [{ start: 0, pitch: 38 }] };
    const captured = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "skeleton", content: skel } })));
    const bassFrame = { bars: 2, meter: "4/4", key: 0 };
    const bassChords = [{ root: 0, quality: "", start: 0, dur: 8 }];
    const withSkel = JSON.parse(textOf(await client.callTool({ name: "gen_bass", arguments: { frame: bassFrame, chords: bassChords, seed: 42, skeletonNetaId: captured.id } })));
    expect(withSkel.items[0].meta?.voiceLeading).toBeTruthy();
    // 骨格無しの gen_bass は voiceLeading メタ無し（対位相手が無い）。WP-D2 の sync ノリメーターは下声非依存ゆえ付きうる。
    const noSkel = JSON.parse(textOf(await client.callTool({ name: "gen_bass", arguments: { frame: bassFrame, chords: bassChords, seed: 42 } })));
    expect(noSkel.items[0].meta?.voiceLeading).toBeUndefined();
  });
});
