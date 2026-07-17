import { describe, it, expect } from "vitest";
import { CURATED_SING_VOICES, singVoiceLabel, type SingVoice } from "../src/music";

// 仮歌の声（VOICEVOX frame_decode 声色）の curated 表＋ラベル（設計 2026-07-17 §S1）。
// engine 不要の初期口＋フォールバック。既定は 3009 波音リツ（api 既定と一致）。
describe("CURATED_SING_VOICES（curated 声リスト）", () => {
  it("既定 3009（波音リツ・ノーマル）を含み、query 専用の 6000 は含まない", () => {
    expect(CURATED_SING_VOICES.some((v) => v.id === 3009)).toBe(true);
    expect(CURATED_SING_VOICES.some((v) => v.id === 6000)).toBe(false);
  });
  it("各要素は {id,character,style}", () => {
    for (const v of CURATED_SING_VOICES) {
      expect(typeof v.id).toBe("number");
      expect(typeof v.character).toBe("string");
      expect(typeof v.style).toBe("string");
    }
  });
});

describe("singVoiceLabel（声のラベル）", () => {
  it("キャラ・スタイルを連結", () => {
    const v: SingVoice = { id: 3065, character: "波音リツ", style: "クイーン" };
    expect(singVoiceLabel(v)).toBe("波音リツ・クイーン");
  });
});
