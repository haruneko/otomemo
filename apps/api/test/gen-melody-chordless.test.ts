import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";
import { genMelody } from "../src/music/generate";

// J2b（design #20・Task#14）：chordless（コード進行なし）のメロ生成を旧経路④→V2 へ移す。
// V2ゲートから `chords>0` を撤去し、chords 空時は全小節を key の主音根＋ダイアトニックpc集合で代用する。
// 鉄則：chords 有り時は bit 一致（別途 golden 実証＋既存851全緑）。ここでは chordless 側の性質を固める。

type N = { pitch: number; start: number; dur: number };
const notesOf = (r: ReturnType<typeof genMelody>) => (r.items[0]!.content as { notes: N[] }).notes;

// key の major/minor ダイアトニック pc 集合（C=0 基準を key で回す）。
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // natural minor
const diatonicSet = (key: number, minor: boolean) =>
  new Set((minor ? MINOR : MAJOR).map((d) => ((d + key) % 12 + 12) % 12));

describe("J2b chordless メロ生成（generate 直・V2 受け皿）", () => {
  it("chords 無しでも空にならず・全音が key(major) のダイアトニック内", () => {
    const key = 7; // G major
    const notes = notesOf(genMelody({ key, mode: "major", meter: "4/4", bars: 8 }, undefined, 5, { useV2: true }));
    expect(notes.length).toBeGreaterThan(0);
    const dia = diatonicSet(key, false);
    for (const n of notes) expect(dia.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("chords 無し・minor でも全音が key(minor) のダイアトニック内", () => {
    const key = 9; // A minor
    const notes = notesOf(genMelody({ key, mode: "minor", meter: "4/4", bars: 8 }, undefined, 3, { useV2: true }));
    expect(notes.length).toBeGreaterThan(0);
    const dia = diatonicSet(key, true);
    for (const n of notes) expect(dia.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("総拍数＝onset は [0, bars*bpb) 内（4/4・8小節）", () => {
    const notes = notesOf(genMelody({ key: 0, mode: "major", meter: "4/4", bars: 8 }, [], 5, { useV2: true }));
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(8 * 4 + 1e-6);
    }
    expect(notes.some((n) => n.start >= 16)).toBe(true); // 後半まで展開＝旧経路④の縮退でない
  });

  it("決定性＝同 seed で同一出力（chordless）", () => {
    const a = genMelody({ key: 0, mode: "major", meter: "4/4", bars: 8 }, undefined, 9, { useV2: true });
    const b = genMelody({ key: 0, mode: "major", meter: "4/4", bars: 8 }, undefined, 9, { useV2: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("chordless は旧経路④ではなく V2＝chords 有り(空 quals) と質的に近い展開量（縮退でない）", () => {
    // chords あり（全 C＝tonic 代用と同じ和声文脈）と chordless で、V2 内部が同じ合成文脈を受ける。
    const chordsC = Array.from({ length: 8 }, (_, i) => ({ root: 0, quality: "", start: i * 4, dur: 4 }));
    const withC = notesOf(genMelody({ key: 0, mode: "major", meter: "4/4", bars: 8 }, chordsC, 5, { useV2: true }));
    const withNone = notesOf(genMelody({ key: 0, mode: "major", meter: "4/4", bars: 8 }, undefined, 5, { useV2: true }));
    // 合成コード文脈（root=tonic・qual=""）は「全小節 C」と rootsPerBar/qualsPerBar が一致
    // ＝chordPcsPerBar だけ差（C三和音 vs ダイアトニック7音）。展開量は同オーダー（縮退した④ではない）。
    expect(withNone.length).toBeGreaterThan(withC.length * 0.5);
    expect(withNone.length).toBeLessThan(withC.length * 2);
  });

  it("J2a と合流＝chordless 3/4 でも V2（onset<bars*3・後半展開）", () => {
    const notes = notesOf(genMelody({ key: 0, mode: "major", meter: "3/4", bars: 8 }, undefined, 5, { useV2: true }));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.start).toBeLessThan(8 * 3 + 1e-6);
    expect(notes.some((n) => n.start >= 12)).toBe(true);
  });

  it("句末カデンツはコード非依存の度数で機能＝最終音は key の主音pc（chordless・phrasing 指定）", () => {
    const key = 2; // D major
    const notes = notesOf(genMelody({ key, mode: "major", meter: "4/4", bars: 8, phrasing: "period" }, undefined, 5, { useV2: true }));
    const last = notes[notes.length - 1]!;
    // period の最終句は full cadence＝主音着地（cadPc は tonicPc・コード非依存）。
    expect(((last.pitch % 12) + 12) % 12).toBe(((key % 12) + 12) % 12);
  });
});

// ── MCP inMemory e2e：chords 無し＋骨格注入（web「骨格から吹く」コード無しケース）──
async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client };
}
const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;

describe("J2b MCP e2e：chordless gen_melody（骨格注入・restMask 込み）", () => {
  it("gen_melody(chords 無し) は空にならず・meta（対位）を添付しない（lower 不在＝S3d スキップ）", async () => {
    const { client } = await connect();
    const frame = { key: 0, mode: "major", meter: "4/4", bars: 8 };
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, seed: 5 } })));
    expect(out.items[0].content.notes.length).toBeGreaterThan(0);
    // 対位(voiceLeading)meta は lower 不在で添付しない（S3d スキップ）。WP-M3 のメロ単体レンズ(lenses)は下声非依存ゆえ付く。
    expect(out.items[0].meta?.voiceLeading).toBeUndefined();
    expect(out.items[0].meta?.voiceLeadingSummary).toBeUndefined();
  });

  it("chords 無し＋骨格注入（skeletonNetaId）＝骨格の休符区間(restMask)で表面音が落ちる", async () => {
    const { client } = await connect();
    const frame = { key: 0, mode: "major", meter: "4/4", bars: 4 };
    // 骨格：[0,4) を pitch=64 が支配・[4,8) は休符(null)・以降 60。コード無しでも骨格は独立に成立。
    const skel = {
      bars: 4,
      tones: [
        { start: 0, pitch: 64 },
        { start: 4, pitch: null },
        { start: 8, pitch: 62 },
      ],
    };
    const captured = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "skeleton", content: skel } })));
    const out = JSON.parse(
      textOf(await client.callTool({ name: "gen_melody", arguments: { frame, seed: 5, skeletonNetaId: captured.id } })),
    );
    expect(out.skeletonNetaId).toBe(captured.id); // 注入され id エコー＝web 骨格結線の受けが V2 で成立
    const notes = out.items[0].content.notes as N[];
    expect(notes.length).toBeGreaterThan(0);
    // restMask [4,8) の区間には表面音が無い（休符が抜ける）。
    const inRest = notes.filter((n) => n.start >= 4 - 1e-9 && n.start < 8 - 1e-9);
    expect(inRest.length).toBe(0);
    // 骨格ありは無しと出力が変わる（骨格が効いている＝縮退でない）。
    const noSkel = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, seed: 5 } })));
    expect(JSON.stringify(notes)).not.toBe(JSON.stringify(noSkel.items[0].content.notes));
  });

  it("chords 無し＋骨格注入＋3/4（J2a 合流）でも成立＝onset<bars*3", async () => {
    const { client } = await connect();
    const frame = { key: 0, mode: "major", meter: "3/4", bars: 4 };
    const skel = { bars: 4, tones: [{ start: 0, pitch: 64 }, { start: 6, pitch: 60 }] };
    const captured = JSON.parse(textOf(await client.callTool({ name: "capture", arguments: { kind: "skeleton", content: skel } })));
    const out = JSON.parse(
      textOf(await client.callTool({ name: "gen_melody", arguments: { frame, seed: 5, skeletonNetaId: captured.id } })),
    );
    const notes = out.items[0].content.notes as N[];
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.start).toBeLessThan(4 * 3 + 1e-6);
  });
});
