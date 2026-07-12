import { describe, it, expect } from "vitest";
import { realizedMelodyCount, voiceLeadingBadge } from "../src/useMelodyGen";

// 分岐スタック「→吹いたメロ N」（design #20 S6・D4）＝getRelations(骨格id) 出力から realized_from×melody を数える。
describe("realizedMelodyCount（分岐スタック N）", () => {
  const rel = (type: string, kind: string) => ({ type, neta: { id: "x", kind } });

  it("realized_from かつ相手が melody のものだけ数える", () => {
    const rels = [rel("realized_from", "melody"), rel("realized_from", "melody"), rel("realized_from", "bass"), rel("related", "melody")];
    expect(realizedMelodyCount(rels)).toBe(2); // melody×2 のみ（bass/related は除外）
  });

  it("空・null neta は 0", () => {
    expect(realizedMelodyCount([])).toBe(0);
    expect(realizedMelodyCount([{ type: "realized_from", neta: null }])).toBe(0);
  });

  it("吹き直しで増える＝件数がそのまま N（骨格不変・旧メロ不滅の体感の根拠）", () => {
    const grow = (n: number) => Array.from({ length: n }, () => rel("realized_from", "melody"));
    expect(realizedMelodyCount(grow(1))).toBe(1);
    expect(realizedMelodyCount(grow(3))).toBe(3);
  });
});

// voiceLeadingBadge（S3d の要約を再実装しない＝トレイのバッジにそのまま出す・D4 で消費）。
describe("voiceLeadingBadge（④トレイの対位バッジ）", () => {
  it("違反ありは ⚠＋種別、無ければ対位OK、meta 無しは null", () => {
    expect(voiceLeadingBadge(undefined)).toBeNull();
    expect(voiceLeadingBadge({ voiceLeading: { score: 1, parallelFifths: 0, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0 } })).toEqual({ text: "対位OK", warn: false });
    const warn = voiceLeadingBadge({ voiceLeading: { score: 0.5, parallelFifths: 2, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0 } });
    expect(warn?.warn).toBe(true);
    expect(warn?.text).toContain("並5×2");
  });
});
