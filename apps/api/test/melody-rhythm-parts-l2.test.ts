import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { RHYTHM_PART_PRESETS, partPatternOnsets, isValidPartPattern, extractRhythmPart, sanitizeRhythmParts, resolvePartPatternAtBar, buildCustomPartMap } from "../src/music/rhythmParts";
import { genMelody } from "../src/music/generate";
import { scalePcs, chordPcs } from "../src/music/theory";

// リズムパーツ層 L2＋採取＋インラインcustom（design #20 S4-2・Task#8）。
// 優先則＝placement > rotate > L0（従来抽選）。採取＝既存メロから16枠オンセット抽出。custom＝プリセット外のインラインパーツ。
const motif16 = loadMotifModel16();
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 55, 84);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const gen = (bars: number, seed: number, extra: Record<string, unknown> = {}, beatsPerBar = 4) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, beatsPerBar, ...extra });

const onsetsInBar = (notes: { start: number }[], bar: number, barLen: number): number[] =>
  notes.filter((n) => n.start >= bar * barLen - 1e-9 && n.start < (bar + 1) * barLen - 1e-9).map((n) => Math.round((n.start - bar * barLen) * 1000) / 1000).sort((a, b) => a - b);

describe("S4-2 placement 優先則（placement > rotate > L0）", () => {
  it("rotate=[eighths] 全小節 ＋ placement=[{bar:1,whole}]＝bar1 は白玉・他は8分（placementが勝つ）", () => {
    const notes = gen(8, 7, { rhythmParts: { rotate: ["eighths"], placement: [{ bar: 1, partId: "whole" }] } });
    expect(onsetsInBar(notes, 1, 4)).toEqual(partPatternOnsets(RHYTHM_PART_PRESETS.whole!, 4)); // [0]
    for (const bar of [0, 2, 3, 4, 5, 6, 7]) expect(onsetsInBar(notes, bar, 4)).toEqual(partPatternOnsets(RHYTHM_PART_PRESETS.eighths!, 4));
  });
  it("複数 placement（同一barは後勝ち）", () => {
    const notes = gen(4, 3, { rhythmParts: { rotate: ["eighths"], placement: [{ bar: 2, partId: "whole" }, { bar: 2, partId: "quarters" }] } });
    expect(onsetsInBar(notes, 2, 4)).toEqual(partPatternOnsets(RHYTHM_PART_PRESETS.quarters!, 4)); // 後勝ち＝quarters [0,1,2,3]
  });
  it("placement 単独（rotate 無し）＝該当barはパーツ・非該当barは従来抽選(L0)を保持", () => {
    const base = gen(8, 21); // パーツ無し＝L0
    const withP = gen(8, 21, { rhythmParts: { placement: [{ bar: 2, partId: "whole" }] } });
    expect(onsetsInBar(withP, 2, 4)).toEqual([0]); // bar2 は白玉
    // 非該当 bar は L0（従来抽選）を保持＝base と同じ onset（空にならない・別抽選にならない）
    for (const bar of [0, 1, 3, 4, 5, 6, 7]) expect(onsetsInBar(withP, bar, 4)).toEqual(onsetsInBar(base, bar, 4));
  });
  it("placement 未知id＝無視して rotate へフォールスルー", () => {
    const notes = gen(4, 3, { rhythmParts: { rotate: ["eighths"], placement: [{ bar: 1, partId: "nope" }] } });
    expect(onsetsInBar(notes, 1, 4)).toEqual(partPatternOnsets(RHYTHM_PART_PRESETS.eighths!, 4)); // rotate が生きる
  });
});

describe("S4-2 rotate 併用回帰（placement を足しても rotate 経路は不変）", () => {
  it("placement=[] は rotate のみと bit 一致", () => {
    const a = gen(8, 42, { rhythmParts: { rotate: ["syncope", "offhead", "whole"] } });
    const b = gen(8, 42, { rhythmParts: { rotate: ["syncope", "offhead", "whole"], placement: [] } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("custom を渡しても rotate/placement が引かなければ bit 一致", () => {
    const a = gen(8, 42, { rhythmParts: { rotate: ["eighths", "whole"] } });
    const b = gen(8, 42, { rhythmParts: { rotate: ["eighths", "whole"], custom: [{ id: "unused", pattern: "x.x.x.x.x.x.x.x." }] } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("S4-2 インライン custom パーツ", () => {
  it("custom id を rotate から引ける（プリセット外パターンが敷かれる）", () => {
    const pat = "x.....x...x....."; // 任意16枠（onset 3つ：0/1.5/2.5拍）
    const notes = gen(4, 9, { rhythmParts: { rotate: ["myPart"], custom: [{ id: "myPart", pattern: pat }] } });
    for (let bar = 0; bar < 4; bar++) expect(onsetsInBar(notes, bar, 4)).toEqual(partPatternOnsets(pat, 4));
  });
  it("custom id を placement から引ける", () => {
    const pat = "xxxx............"; // 先頭16分4連
    const notes = gen(4, 9, { rhythmParts: { rotate: ["whole"], placement: [{ bar: 3, partId: "run4" }], custom: [{ id: "run4", pattern: pat }] } });
    expect(onsetsInBar(notes, 3, 4)).toEqual(partPatternOnsets(pat, 4)); // [0,0.25,0.5,0.75]
    expect(onsetsInBar(notes, 0, 4)).toEqual([0]); // rotate=whole
  });
  it("custom がプリセット id を上書きできる", () => {
    const notes = gen(4, 9, { rhythmParts: { rotate: ["whole"], custom: [{ id: "whole", pattern: "x...x...x...x..." }] } });
    for (let bar = 0; bar < 4; bar++) expect(onsetsInBar(notes, bar, 4)).toEqual([0, 1, 2, 3]); // 上書き＝quarters相当
  });
});

describe("S4-2 採取 extractRhythmPart（16枠化）", () => {
  it("4/4：拍頭/裏拍/16分を最寄り16分スロットへ量子化", () => {
    // onset: 0(拍頭) / 0.5(8分裏) / 0.75(16分) / 2.25(16分) の4音を bar0 に
    const notes = [{ start: 0 }, { start: 0.5 }, { start: 0.75 }, { start: 2.25 }];
    expect(extractRhythmPart(notes, 0, { beatsPerBar: 4 })).toBe("x.xx.....x......");
    expect(isValidPartPattern(extractRhythmPart(notes, 0))).toBe(true);
  });
  it("bar 指定＝その小節ぶんだけ・他小節は無視", () => {
    const notes = [{ start: 4 }, { start: 5 }, { start: 8 }]; // bar1 に 4,5拍（相対0,1）／bar2 に 8拍
    expect(extractRhythmPart(notes, 1, { beatsPerBar: 4 })).toBe("x...x...........");
  });
  it("3/4：先頭12枠のみ使用（残り枠は '.'・partPatternOnsets と対称）", () => {
    // 3/4 bar0 に 相対0,1.5,2.5拍
    const notes = [{ start: 0 }, { start: 1.5 }, { start: 2.5 }];
    const pat = extractRhythmPart(notes, 0, { beatsPerBar: 3 });
    expect(pat).toBe("x.....x...x.....");
    expect(pat.length).toBe(16);
    // 採取→再適用でオンセットが往復する（3/4＝先頭3拍）
    expect(partPatternOnsets(pat, 3)).toEqual([0, 1.5, 2.5]);
  });
  it("採取→custom として再利用＝別セクションへリズム移植（往復）", () => {
    const src = gen(8, 5); // 既存メロ
    const pat = extractRhythmPart(src, 2, { beatsPerBar: 4 });
    expect(isValidPartPattern(pat)).toBe(true);
    const notes = gen(4, 9, { rhythmParts: { rotate: ["harvested"], custom: [{ id: "harvested", pattern: pat }] } });
    for (let bar = 0; bar < 4; bar++) expect(onsetsInBar(notes, bar, 4)).toEqual(partPatternOnsets(pat, 4));
  });
});

describe("S4-2 バリデーション（16文字・x/. のみ）", () => {
  it("isValidPartPattern", () => {
    expect(isValidPartPattern("x...............")).toBe(true);
    expect(isValidPartPattern("x.x.x.x.x.x.x.x.")).toBe(true);
    expect(isValidPartPattern("x..............")).toBe(false); // 15文字
    expect(isValidPartPattern("x...............x")).toBe(false); // 17文字
    expect(isValidPartPattern("x..X............")).toBe(false); // 大文字X
    expect(isValidPartPattern("x..1............")).toBe(false); // 数字
    expect(isValidPartPattern(12)).toBe(false);
    expect(isValidPartPattern(undefined)).toBe(false);
  });
  it("buildCustomPartMap＝不正pattern/空idを捨てる", () => {
    const m = buildCustomPartMap([{ id: "ok", pattern: "x..............." }, { id: "bad", pattern: "xxx" }, { id: "", pattern: "x.x.x.x.x.x.x.x." }]);
    expect(Object.keys(m)).toEqual(["ok"]);
  });
});

describe("S4-2 sanitizeRhythmParts（http/mcp 共通・範囲外bar/未知id/不正pattern無視）", () => {
  it("効果ゼロ（rotate/placement 共に空）＝undefined（bit一致）", () => {
    expect(sanitizeRhythmParts(undefined)).toBeUndefined();
    expect(sanitizeRhythmParts({})).toBeUndefined();
    expect(sanitizeRhythmParts({ rotate: [] })).toBeUndefined();
    expect(sanitizeRhythmParts({ custom: [{ id: "x", pattern: "x..............." }] })).toBeUndefined(); // custom 単独＝敷き先なし
  });
  it("placement：範囲外bar/未知id/非整数bar を落とす", () => {
    const out = sanitizeRhythmParts({ placement: [
      { bar: 1, partId: "whole" }, // OK
      { bar: -1, partId: "whole" }, // 負bar 無視
      { bar: 1.5, partId: "whole" }, // 非整数 無視
      { bar: 99, partId: "whole" }, // 範囲外(bars=8) 無視
      { bar: 2, partId: "nope" }, // 未知id 無視
    ] }, { bars: 8 });
    expect(out?.placement).toEqual([{ bar: 1, partId: "whole" }]);
  });
  it("custom id を known として placement で許可・不正pattern の custom は落とす", () => {
    const out = sanitizeRhythmParts({ placement: [{ bar: 0, partId: "mine" }, { bar: 1, partId: "bogus" }], custom: [{ id: "mine", pattern: "x..............." }, { id: "bogus", pattern: "xx" }] });
    expect(out?.placement).toEqual([{ bar: 0, partId: "mine" }]); // bogus は不正patternで custom 落ち→未知→placement 落ち
    expect(out?.custom).toEqual([{ id: "mine", pattern: "x..............." }]);
  });
  it("rotate の未知idは保持（engine が無視＝S4-1 と同じ）", () => {
    const out = sanitizeRhythmParts({ rotate: ["whole", "nope"] });
    expect(out?.rotate).toEqual(["whole", "nope"]);
  });
});

describe("S4-2 resolvePartPatternAtBar（純関数・placement>rotate>null）", () => {
  const cm = buildCustomPartMap([{ id: "c1", pattern: "xxxx............" }]);
  it("placement が rotate に勝つ", () => {
    const rp = { rotate: ["eighths"], placement: [{ bar: 1, partId: "whole" }] };
    expect(resolvePartPatternAtBar(rp, 1, cm)).toBe(RHYTHM_PART_PRESETS.whole);
    expect(resolvePartPatternAtBar(rp, 0, cm)).toBe(RHYTHM_PART_PRESETS.eighths);
  });
  it("custom id を引ける", () => {
    expect(resolvePartPatternAtBar({ rotate: ["c1"] }, 0, cm)).toBe("xxxx............");
  });
  it("どこも覆わない＝null", () => {
    expect(resolvePartPatternAtBar({ placement: [{ bar: 5, partId: "whole" }] }, 0, cm)).toBeNull();
  });
});

describe("S4-2 generate.ts 経路（gen_melody 透過・placement/custom）", () => {
  const frame = { key: 0, meter: "4/4", bars: 8, mode: "major" as const };
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i, dur: 1 }));
  it("placement で 2小節目だけ白玉", () => {
    const res = genMelody(frame, chords, 7, { useV2: true, rhythmParts: { rotate: ["eighths"], placement: [{ bar: 1, partId: "whole" }] } });
    const notes = (res.items[0]!.content as { notes: { start: number }[] }).notes;
    expect(onsetsInBar(notes, 1, 4)).toEqual([0]);
    expect(onsetsInBar(notes, 0, 4)).toEqual(partPatternOnsets(RHYTHM_PART_PRESETS.eighths!, 4));
  });
});

// ── MCP e2e（gen_melody placement/custom ＋ extract_rhythm_part）──
async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client };
}
const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;
const onsetsAt = (notes: { start: number }[], bar: number, barLen: number) => onsetsInBar(notes, bar, barLen);

describe("S4-2 MCP e2e", () => {
  const frame = { key: 0, mode: "major", meter: "4/4", bars: 8 };
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i, dur: 1 }));
  it("gen_melody(placement)＝2小節目だけ白玉（Chat「2小節目だけ白玉に」）", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 7, rhythmParts: { rotate: ["eighths"], placement: [{ bar: 1, partId: "whole" }] } } })));
    const notes = out.items[0].content.notes as { start: number }[];
    expect(onsetsAt(notes, 1, 4)).toEqual([0]);
    expect(onsetsAt(notes, 0, 4)).toEqual(partPatternOnsets(RHYTHM_PART_PRESETS.eighths!, 4));
  });
  it("gen_melody(custom)＝インラインパーツを rotate から敷ける", async () => {
    const { client } = await connect();
    const pat = "xxxx............";
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 7, rhythmParts: { rotate: ["run4"], custom: [{ id: "run4", pattern: pat }] } } })));
    const notes = out.items[0].content.notes as { start: number }[];
    for (let bar = 0; bar < 8; bar++) expect(onsetsAt(notes, bar, 4)).toEqual(partPatternOnsets(pat, 4));
  });
  it("gen_melody：範囲外bar/未知id placement は無視され bit一致（サニタイズ）", async () => {
    const { client } = await connect();
    const clean = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 7, rhythmParts: { rotate: ["eighths"] } } })));
    const dirty = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 7, rhythmParts: { rotate: ["eighths"], placement: [{ bar: 99, partId: "whole" }, { bar: 2, partId: "nope" }] } } })));
    expect(JSON.stringify(dirty.items[0].content)).toBe(JSON.stringify(clean.items[0].content));
  });
  it("extract_rhythm_part＝メロから16枠採取→custom で再利用（往復）", async () => {
    const { client } = await connect();
    const gm = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 5 } })));
    const srcNotes = gm.items[0].content.notes as { start: number }[];
    const ex = JSON.parse(textOf(await client.callTool({ name: "extract_rhythm_part", arguments: { notes: srcNotes, bar: 2, beatsPerBar: 4 } })));
    expect(/^[x.]{16}$/.test(ex.pattern)).toBe(true);
    // 採取したパターンを custom で別seedメロへ敷く＝そのbarのonsetがパターン通り
    const re = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 9, rhythmParts: { rotate: ["h"], custom: [{ id: "h", pattern: ex.pattern }] } } })));
    const reNotes = re.items[0].content.notes as { start: number }[];
    for (let bar = 0; bar < 8; bar++) expect(onsetsAt(reNotes, bar, 4)).toEqual(partPatternOnsets(ex.pattern, 4));
  });
});
