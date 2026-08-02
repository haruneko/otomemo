import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildMcpServer } from "../src/mcp";
import { genLyricMelodyCandidates, genMelody } from "../src/music/generate";
import { planLyricMelody } from "../src/music/lyricsPlan";
import { CHAT_VERB_NAMES } from "../src/chat-session";

// 歌詞先行メロ M-1（design #13d・WP-L1）＝候補生成の再ランク＋音数一致 property＋MCP 出口。

const frame = { key: 0, mode: "major" as const, meter: "4/4", bars: 4 };
const chords = [
  { root: 0, quality: "maj7", start: 0, dur: 1 }, { root: 9, quality: "min7", start: 1, dur: 1 },
  { root: 5, quality: "maj7", start: 2, dur: 1 }, { root: 7, quality: "7", start: 3, dur: 1 },
];

describe("genLyricMelodyCandidates 音数一致 property（全候補）", () => {
  it("どの候補も notes 数 = 計画オンセット数（onsetMatch=true）", () => {
    const plan = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    const res = genLyricMelodyCandidates(frame, chords, { useV2: true, plan, n: 12, k: 3 });
    expect(res.items.length).toBeGreaterThan(0);
    for (const it of res.items) {
      const notes = (it.content as { notes: { pitch: number; syllable?: string }[] }).notes;
      expect(notes.length).toBe(plan.onsetTotal); // 音数⇔モーラ（オンセット）100%一致
      const fit = (it.meta as { lyricFit: { onsetMatch: boolean } }).lyricFit;
      expect(fit.onsetMatch).toBe(true);
      expect(notes.every((n) => typeof n.syllable === "string" && n.syllable.length > 0)).toBe(true); // syllable 済み
    }
  });
  it("候補メタに整合レポート（score / 句頭A-01赤 / 赤黄件数）が付く", () => {
    const plan = planLyricMelody(["きみのなまえを", "そらにえがく"], { bars: 4, beatsPerBar: 4 });
    const res = genLyricMelodyCandidates(frame, chords, { useV2: true, plan, n: 10, k: 3 });
    const m = (res.items[0]!.meta as { lyricFit: Record<string, unknown> }).lyricFit;
    for (const key of ["score", "a01Head", "a01Total", "red", "yellow", "onsetMatch"]) expect(m).toHaveProperty(key);
    expect(typeof m.score).toBe("number");
  });
  it("句頭A-01赤の少ない順にソート（先頭候補の a01Head が最小）", () => {
    const plan = planLyricMelody(["あかいゆうひ", "しずかなうみ"], { bars: 4, beatsPerBar: 4 });
    // accents を明示して整合が候補で割れる状況を作る（頭高の連続＝句頭で下がる想定）。
    const accents = [{ kana: "あかい", kernel: 1 }, { kana: "ゆうひ", kernel: 0 }, { kana: "しずかな", kernel: 1 }, { kana: "うみ", kernel: 0 }];
    const res = genLyricMelodyCandidates(frame, chords, { useV2: true, plan, accents, n: 12, k: 5 });
    const heads = res.items.map((it) => (it.meta as { lyricFit: { a01Head: number } }).lyricFit.a01Head);
    for (let i = 1; i < heads.length; i++) expect(heads[i]!).toBeGreaterThanOrEqual(heads[0]!); // 先頭が最小（同点は許容）
  });
  it("計画空＝通常候補へフォールバック（保険）", () => {
    const res = genLyricMelodyCandidates(frame, chords, { useV2: true, plan: planLyricMelody([], { bars: 4 }) });
    expect(res.items.length).toBeGreaterThan(0);
  });
});

describe("bit一致（phrases 直渡し未指定＝従来）", () => {
  it("genMelody に phrases を渡さない＝従来出力と同一（回帰）", () => {
    const a = genMelody(frame, chords, 7, { useV2: true });
    const b = genMelody(frame, chords, 7, { useV2: true, phrases: undefined });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── MCP e2e（gen_melody lyrics オプション）──
async function connect() {
  const core = new Core(openDb(":memory:"));
  const server = buildMcpServer(core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client };
}
const textOf = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text;

describe("gen_melody(lyrics) MCP e2e", () => {
  it("歌詞を渡すと音数一致の候補＋lyricFit メタ＋accentSource が返る", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, lyrics: "しずむゆうひが\nうみをそめる" } })));
    expect(out.items.length).toBeGreaterThan(0);
    const plan = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    for (const it of out.items) {
      expect(it.content.notes.length).toBe(plan.onsetTotal);
      expect(it.meta.lyricFit.onsetMatch).toBe(true);
    }
    expect(["pyopenjtalk", "heuristic"]).toContain(out.accentSource); // 実機は pyopenjtalk・未導入時は heuristic（graceful）
    expect(out.lyricPlan.syllableCount).toBe(plan.onsetTotal);
  });
  it("lyrics 未指定＝従来の候補生成（回帰・onsetMatch メタ無し）", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, seed: 7 } })));
    expect(out.items.length).toBeGreaterThan(0);
    expect(out.accentSource).toBeUndefined();
  });
  it("6/8系は歌詞先行未対応＝通常生成に落として note で明示", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame: { ...frame, meter: "6/8" }, chords, lyrics: "しずむゆうひ" } })));
    expect(out.items.length).toBeGreaterThan(0);
    expect(String(out.note ?? "")).toContain("未対応");
  });
});

// ── スライス7（design §31-10）＝詞先メロが句を持って生まれる／音符数が変わる新挙動は既定OFF ──
describe("スライス7：詞先生成の返り content に句が載る", () => {
  it("候補ごとに content.lyric.phrases＝行の表記・範囲は句割りと一致（音符は変わらない）", () => {
    const plan = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    const res = genLyricMelodyCandidates(frame, chords, { useV2: true, plan, n: 6, k: 2 });
    for (const it of res.items) {
      const c = it.content as { notes: unknown[]; lyric?: { phrases: { text: string; start: number; beats: number }[] } };
      expect(c.lyric?.phrases.map((p) => p.text)).toEqual(["しずむゆうひが", "うみをそめる"]);
      expect(c.lyric?.phrases.map((p) => p.start)).toEqual(plan.phrases.map((p) => p.startBeat));
      expect(c.notes.length).toBe(plan.onsetTotal); // 句が載っても音符は変わらない
    }
  });
});

describe("スライス7：読みを取る新挙動は既定OFF（耳で確かめてから既定を反転）", () => {
  it("gen_melody(lyrics) の既定＝従来の数え方（っ/ー は音符を立てない・表記は字のまま）", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, lyrics: "がっこうへ\nそーらへ" } })));
    const legacy = planLyricMelody(["がっこうへ", "そーらへ"], { bars: 4, beatsPerBar: 4 });
    expect(legacy.onsetTotal).toBe(7); // が,こ,う,へ / そ,ら,へ
    for (const it of out.items) expect(it.content.notes.length).toBe(7);
    expect(out.lyricPlan.readingSource).toBe("none");
  });
  it("readLyrics=true＝表記から読みを取る（pyopenjtalk 未導入なら従来へ落ちて壊れない）", async () => {
    const { client } = await connect();
    const out = JSON.parse(textOf(await client.callTool({ name: "gen_melody", arguments: { frame, chords, lyrics: "君の名前を", readLyrics: true } })));
    expect(out.items.length).toBeGreaterThan(0);
    expect(["pyopenjtalk", "failed"]).toContain(out.lyricPlan.readingSource); // 取れたか・取れず従来へ落ちたか
    const n = out.items[0].content.notes.length;
    expect(n).toBe(out.lyricPlan.readingSource === "pyopenjtalk" ? 7 : 5); // きみのなまえを(7) / 表記5字のまま
  });
});

describe("CHAT_VERBS 整合（gen_melody は既存 verb＝新 verb 名を足していない）", () => {
  it("歌詞先行は新規 verb 名(gen_lyric_melody)を作らず既存 gen_melody への lyrics オプションで実装", () => {
    expect(CHAT_VERB_NAMES).not.toContain("gen_lyric_melody");
  });
  // 2026-07-27是正：design #13d(c) の「既存 chat verb gen_melody」という前提は当時実は誤り（legacy専用ブロックに
  // 取り残され chat面未登録＋CHAT_VERB_NAMES 許可漏れ＝プレイブックの指示が黙って死んでいた＝BUG#1型）。
  // ここで前提を実態に合わせた（gen_melody を chat面へ移設＋許可リストに追加）＝以下でその整合を確認する。
  it("gen_melody は CHAT_VERB_NAMES に含まれる（design #13d(c)の前提＝chatから呼べる既存verb、を実態に合わせた是正）", () => {
    expect(CHAT_VERB_NAMES).toContain("gen_melody");
  });
});
