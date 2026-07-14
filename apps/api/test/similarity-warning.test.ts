import { describe, it, expect } from "vitest";
// WP-M8 旋律類似の独自性警告＝除外ゲート → 緑/黄/赤トリアージ。正典＝docs/research/2026-07-14-melody-similarity-warning.md。
import {
  similarityWarning,
  originalityReport,
  isCommonplaceFigure,
  SIMILARITY_DISCLAIMER,
} from "../src/music/similarityWarning";
import type { Note } from "../src/music/fit";

// 均等リズム（4分格子）でノート列を作るヘルパ。pitch は絶対値、start は連番拍。
const seq = (pitches: number[], start = 0): Note[] =>
  pitches.map((p, i) => ({ pitch: p, start: start + i, dur: 1 }));

describe("similarityWarning（トリアージ）", () => {
  it("disclaimer は常に添う（緑でも）", () => {
    const w = similarityWarning(seq([60]), seq([72]));
    expect(w.disclaimer).toBe(SIMILARITY_DISCLAIMER);
    expect(w.disclaimer).toContain("法的助言ではありません");
  });

  it("固定値：8音連続一致（非ありふれ音型・リズム一致）→ red（AND 成立）", () => {
    // ジグザグの特徴的音型（スケールでも分散和音でもない）。移調しても音程列は同じ＝b は +5 移調。
    const motif = [60, 62, 61, 65, 63, 68, 66, 71]; // 8音
    const a = seq(motif);
    const b = seq(motif.map((p) => p + 5)); // 移調不変で一致するはず
    const w = similarityWarning(a, b);
    expect(w.level).toBe("red");
    const c = w.findings.find((f) => f.kind === "contiguous");
    expect(c?.noteRun).toBeGreaterThanOrEqual(8);
    expect(c?.rhythmMatch).toBe(true);
    expect(c?.commonplace).toBe(false);
  });

  it("固定値：ありふれ音型（上行スケール8音）のみ一致 → green（除外ゲートで無罪化）", () => {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72]; // ドレミファソラシド
    const w = similarityWarning(seq(scale), seq(scale.map((p) => p + 7)));
    expect(w.level).toBe("green");
    const c = w.findings.find((f) => f.kind === "contiguous");
    expect(c?.commonplace).toBe(true); // building block として除外
  });

  it("固定値：AND 未満（6音一致・短い）→ yellow 止まり（red には上げない）", () => {
    const motif = [60, 62, 61, 65, 63, 68]; // 6音の特徴的音型
    const w = similarityWarning(seq(motif), seq(motif.map((p) => p + 3)));
    expect(w.level).toBe("yellow");
  });

  it("音高だけ長一致でリズムが違う → AND 未満で red にしない（yellow まで）", () => {
    const motif = [60, 62, 61, 65, 63, 68, 66, 71];
    const a = seq(motif); // 4分均等
    // b は同じ音程列だが IOI をばらす（付点/16分でリズム指紋を崩す）
    const b: Note[] = motif.map((p, i) => ({ pitch: p + 4, start: i * 0.5 + (i % 2 === 0 ? 0 : 0.25), dur: 0.5 }));
    const w = similarityWarning(a, b);
    expect(w.level).not.toBe("red");
    expect(["yellow", "green"]).toContain(w.level);
  });

  it("コーパス頻度による除外（§5.1）：高頻度 ngram は building block として無罪化", () => {
    const motif = [60, 62, 61, 65, 63, 68, 66, 71];
    const a = seq(motif);
    const b = seq(motif.map((p) => p + 2));
    // すべての run を「最頻」と申告する commonness → 全除外で green
    const w = similarityWarning(a, b, { commonness: () => 1 });
    expect(w.level).toBe("green");
  });

  it("無関係な2旋律 → green・findings は昇格しない", () => {
    const w = similarityWarning(seq([60, 67, 55, 70, 58]), seq([48, 50, 52, 49, 61]));
    expect(w.level).toBe("green");
  });
});

describe("isCommonplaceFigure（scènes à faire / de minimis）", () => {
  it("上行/下行スケール・クロマチック・分散和音・同音反復・同一音程は building block", () => {
    expect(isCommonplaceFigure([2, 2, 1, 2, 2])).toBe(true); // 上行スケール
    expect(isCommonplaceFigure([-2, -1, -2, -2])).toBe(true); // 下行スケール
    expect(isCommonplaceFigure([1, 1, 1])).toBe(true); // クロマチック
    expect(isCommonplaceFigure([4, 3, 4])).toBe(true); // 分散和音（3度積み）
    expect(isCommonplaceFigure([0, 0, 0])).toBe(true); // 同音反復
    expect(isCommonplaceFigure([5, 5, 5])).toBe(true); // 同一音程オスティナート
    expect(isCommonplaceFigure([2])).toBe(true); // de minimis（3音未満）
  });
  it("特徴的なジグザグ音型は building block ではない", () => {
    expect(isCommonplaceFigure([2, -1, 4, -2, 5, -2, 5])).toBe(false);
  });
});

describe("originalityReport（cryptomnesia・自作照合）", () => {
  const motif = [60, 62, 61, 65, 63, 68, 66, 71];
  it("自作既出と焼き直し一致 → hit（channel=self・ブロックしない）＋disclaimer", () => {
    const target = seq(motif);
    const corpus = [
      { id: "n1", label: "過去A", notes: seq(motif.map((p) => p + 5)) }, // 焼き直し
      { id: "n2", label: "無関係", notes: seq([48, 50, 49, 55, 52]) },
    ];
    const rep = originalityReport(target, corpus);
    expect(rep.channel).toBe("self");
    expect(rep.scanned).toBe(2);
    expect(rep.hits.length).toBe(1);
    expect(rep.hits[0]!.id).toBe("n1");
    expect(rep.hits[0]!.warning.level).toBe("red");
    expect(rep.disclaimer).toBe(SIMILARITY_DISCLAIMER);
  });
  it("骨格層ラベルを注記に添える", () => {
    const rep = originalityReport(seq(motif), [{ id: "n1", notes: seq(motif.map((p) => p + 2)) }], { layer: "skeleton" });
    expect(rep.layer).toBe("skeleton");
    expect(rep.hits[0]!.warning.findings[0]!.layer).toBe("skeleton");
  });
});
