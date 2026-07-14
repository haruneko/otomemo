import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// WP-E1：感情語→パラメータプリセット。17語が実在ノブのみを推奨・混合語は2案・過信警告を必ず添付。
// 正典＝docs/research/2026-07-14-emotion-to-parameters.md（§5 表・§4 混合2案・§6 過信警告）。
import {
  EMOTION_PRESETS,
  EMOTION_KNOBS,
  EMOTION_WARNING,
  EMOTION_DISCLAIMERS,
  suggestEmotionParams,
  type EmotionKnob,
} from "../src/music/emotionMap";

const PALETTES = new Set(["ionian", "mixolydian", "aeolian", "dorian"]);
const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("emotionMap プリセット（WP-E1）", () => {
  it("17語ちょうど（doc §5 表）", () => {
    expect(EMOTION_PRESETS.length).toBe(17);
    // 代表語が引ける
    for (const w of ["明るい", "悲しい", "切ない", "エモい", "疾走感", "浮遊感", "儚い", "懐かしい", "怒り", "恐れ", "荘厳", "穏やか", "高揚", "クール", "情熱", "決意", "幻想的"]) {
      expect(suggestEmotionParams({ word: w })).not.toBeNull();
    }
  });

  it("全プリセットの knobs が実在ノブ allowlist のみ参照（keys ⊆ EMOTION_KNOBS）", () => {
    const allow = new Set<string>(EMOTION_KNOBS);
    for (const p of EMOTION_PRESETS) {
      for (const v of p.variations) {
        for (const k of Object.keys(v.knobs)) {
          expect(allow.has(k), `${p.word}/${v.label} の未知ノブ ${k}`).toBe(true);
          const val = v.knobs[k as EmotionKnob]!;
          // registerShift は半音（-6..+6）、他は 0..1。
          if (k === "registerShift") expect(Math.abs(val)).toBeLessThanOrEqual(6);
          else expect(val >= 0 && val <= 1, `${p.word}/${v.label} の ${k}=${val} が0..1外`).toBe(true);
        }
        // mode/palette/tempo も実在レンジ。
        expect(["major", "minor"]).toContain(v.mode);
        expect(PALETTES.has(v.palette)).toBe(true);
        const [lo, hi] = v.tempoBpm;
        expect(lo).toBeGreaterThanOrEqual(40);
        expect(hi).toBeLessThanOrEqual(220);
        expect(hi).toBeGreaterThanOrEqual(lo);
      }
    }
  });

  it("スキーマ照合：allowlist の各ノブ名が実際の生成コード（mcp.ts / generate.ts）に存在する", () => {
    // 存在しないノブ名を出さない＝allowlist を実コードのノブ語彙と突き合わせる。
    const mcp = src("../src/mcp.ts");
    const gen = src("../src/music/generate.ts");
    const hay = mcp + "\n" + gen;
    for (const k of EMOTION_KNOBS) {
      expect(hay.includes(k), `ノブ ${k} が mcp.ts/generate.ts に見当たらない`).toBe(true);
    }
    // palette enum も実在（gen_chords/frame）。
    for (const p of ["ionian", "mixolydian", "aeolian", "dorian"]) expect(hay.includes(p)).toBe(true);
  });

  it("混合語（切ない/エモい/懐かしい/情熱）は正負混合＝2バリエーション（陽寄り/陰寄り）", () => {
    for (const w of ["切ない", "エモい", "懐かしい", "情熱"]) {
      const r = suggestEmotionParams({ word: w })!;
      expect(r.mix).toBe(true);
      expect(r.variations.length).toBe(2);
      // 2案は mode か palette か tempo で差がある（同一2案を出さない）。
      const [a, b] = r.variations;
      const differ = a.mode !== b.mode || a.palette !== b.palette || a.tempoBpm[0] !== b.tempoBpm[0];
      expect(differ).toBe(true);
    }
  });

  it("非混合語は1バリエーション（例 明るい/悲しい/疾走感）", () => {
    for (const w of ["明るい", "悲しい", "疾走感", "穏やか"]) {
      const r = suggestEmotionParams({ word: w })!;
      expect(r.mix).toBe(false);
      expect(r.variations.length).toBe(1);
    }
  });

  it("固定値：悲しい=短調・遅い・音数少、明るい=長調・速い", () => {
    const sad = suggestEmotionParams({ word: "悲しい" })!.variations[0];
    expect(sad.mode).toBe("minor");
    expect(sad.tempoBpm[1]).toBeLessThanOrEqual(90);
    expect(sad.knobs.density!).toBeLessThan(0.45);
    const happy = suggestEmotionParams({ word: "明るい" })!.variations[0];
    expect(happy.mode).toBe("major");
    expect(happy.tempoBpm[0]).toBeGreaterThanOrEqual(110);
  });

  it("別表記・英語・空白ゆれを吸収（happy/sad/せつない/ノスタルジー）", () => {
    expect(suggestEmotionParams({ word: "happy" })!.word).toBe("明るい");
    expect(suggestEmotionParams({ word: "SAD" })!.word).toBe("悲しい");
    expect(suggestEmotionParams({ word: "せつない" })!.word).toBe("切ない");
    expect(suggestEmotionParams({ word: "ノスタルジー" })!.word).toBe("懐かしい");
  });

  it("V-A 座標フォールバック：語が無くても最近傍プリセットを引く", () => {
    // 高valence・高arousal → 明るい/高揚 近傍
    const r = suggestEmotionParams({ V: 0.8, A: 0.75 })!;
    expect(r.matched).toBe("va");
    expect(["明るい", "高揚"]).toContain(r.word);
    // 低valence・低arousal → 悲しい近傍
    expect(suggestEmotionParams({ V: -0.7, A: 0.2 })!.word).toBe("悲しい");
  });

  it("過信警告を必ず添付（一言＋要点）", () => {
    const r = suggestEmotionParams({ word: "切ない" })!;
    expect(r.warning).toBe(EMOTION_WARNING);
    expect(r.warning.length).toBeGreaterThan(20);
    expect(r.disclaimers).toBe(EMOTION_DISCLAIMERS);
    expect(r.disclaimers.length).toBeGreaterThanOrEqual(4);
  });

  it("提案不可（word 無し・V/A 無し）は null", () => {
    expect(suggestEmotionParams({})).toBeNull();
    expect(suggestEmotionParams({ word: "存在しない造語xyz" })).toBeNull();
  });
});

describe("suggest_emotion_params MCP verb（chat面に登録・提案のみ）", () => {
  it("chat面に露出し・呼ぶと実在ノブ推奨＋過信警告を返す（emotion_shift とは別）", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { buildMcpServer } = await import("../src/mcp");
    const { Core } = await import("../src/core");
    const { openDb } = await import("../src/db");
    const core = new Core(openDb(":memory:"));
    const server = buildMcpServer(core, { surface: "chat" });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);

    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("suggest_emotion_params");

    const res = await client.callTool({ name: "suggest_emotion_params", arguments: { word: "切ない" } });
    const text = (res as { content: { text: string }[] }).content[0]!.text;
    const body = JSON.parse(text);
    expect(body.word).toBe("切ない");
    expect(body.mix).toBe(true);
    expect(body.variations.length).toBe(2);
    expect(typeof body.warning).toBe("string");
    expect(body.warning.length).toBeGreaterThan(20);
    // 返るノブが実在 allowlist のみ
    const allow = new Set<string>(EMOTION_KNOBS);
    for (const v of body.variations) for (const k of Object.keys(v.knobs)) expect(allow.has(k)).toBe(true);
  });
});
