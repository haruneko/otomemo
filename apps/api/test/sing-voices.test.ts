import { describe, it, expect, vi } from "vitest";
import { frameDecodeVoices, listSingVoices, CURATED_SING_VOICES } from "../src/sing";

// VOICEVOX 歌わせる声の列挙（設計 docs/research/2026-07-17-voicevox-voice-selection.md ②）。
// engine 問い合わせを本命・curated をフォールバック。列挙のために engine を spawn しない（起きている時だけ ping→/singers）。
// type=sing の 6000（query 専用モデル）と talk は声の選択肢に出さない＝frame_decode のみ。

// 実機 /singers を模した最小レスポンス（frame_decode 複数＋sing 6000＋旧 talk）。
const SINGERS = [
  { name: "四国めたん", speaker_uuid: "u1", styles: [
    { name: "ノーマル", id: 3002, type: "frame_decode" },
    { name: "あまあま", id: 3000, type: "frame_decode" },
    { name: "ノーマル", id: 2, type: "talk" }, // トーク（歌唱でない）＝除外対象
  ] },
  { name: "波音リツ", speaker_uuid: "u2", styles: [
    { name: "ノーマル", id: 3009, type: "frame_decode" },
    { name: "ノーマル", id: 6000, type: "sing" }, // query 専用モデル＝声の選択肢に出さない
  ] },
];

describe("frameDecodeVoices（純関数・frame_decode のみ抽出）", () => {
  it("frame_decode だけを {id,character,style} で返す（sing 6000 と talk を除外）", () => {
    const vs = frameDecodeVoices(SINGERS);
    expect(vs).toEqual([
      { id: 3002, character: "四国めたん", style: "ノーマル" },
      { id: 3000, character: "四国めたん", style: "あまあま" },
      { id: 3009, character: "波音リツ", style: "ノーマル" },
    ]);
    // 6000（type=sing）は入っていない
    expect(vs.some((v) => v.id === 6000)).toBe(false);
    // talk も入っていない
    expect(vs.some((v) => v.id === 2)).toBe(false);
  });

  it("styles 欠落・空でも落ちない（空配列を返す）", () => {
    expect(frameDecodeVoices([{ name: "空", styles: [] } as never])).toEqual([]);
    expect(frameDecodeVoices([{ name: "壊" } as never])).toEqual([]);
  });
});

describe("listSingVoices（engine 問い合わせ本命・curated フォールバック）", () => {
  it("engine up＝/singers を frame_decode で絞って返す", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/version")) return new Response("0.25.2", { status: 200 });
      if (url.endsWith("/singers")) return new Response(JSON.stringify(SINGERS), { status: 200 });
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
    const vs = await listSingVoices(fetchImpl);
    expect(vs).toEqual(frameDecodeVoices(SINGERS));
    expect(vs.every((v) => v.id !== 6000)).toBe(true);
  });

  it("engine down（/version が !ok）＝curated フォールバックを返す（spawn しない）", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const vs = await listSingVoices(fetchImpl);
    expect(vs).toBe(CURATED_SING_VOICES);
  });

  it("engine ping が例外（未起動）＝curated フォールバック（/singers を叩かない）", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/version")) throw new Error("ECONNREFUSED");
      throw new Error("should not reach /singers");
    }) as unknown as typeof fetch;
    const vs = await listSingVoices(fetchImpl);
    expect(vs).toBe(CURATED_SING_VOICES);
  });

  it("/singers が frame_decode ゼロ（想定外レスポンス）＝curated フォールバック", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/version")) return new Response("ok", { status: 200 });
      return new Response(JSON.stringify([{ name: "x", styles: [{ name: "n", id: 6000, type: "sing" }] }]), { status: 200 });
    }) as unknown as typeof fetch;
    const vs = await listSingVoices(fetchImpl);
    expect(vs).toBe(CURATED_SING_VOICES);
  });

  it("CURATED_SING_VOICES は既定 3009（波音リツ）を含み・6000 を含まない", () => {
    expect(CURATED_SING_VOICES.some((v) => v.id === 3009)).toBe(true);
    expect(CURATED_SING_VOICES.some((v) => v.id === 6000)).toBe(false);
  });
});
