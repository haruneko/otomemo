import { describe, it, expect } from "vitest";
import { PITCH_NAMES, QUALITY_INTERVALS, normRoot, chordPcs } from "../src/index";

// @cm/music-core は api/web が共有する不変知識の SSOT。ここが唯一の定義なので、
// 旧 api theory.ts / web music.ts が満たしていた契約をこのパッケージで固定する。

describe("PITCH_NAMES", () => {
  it("12音名・シャープ表記・C始まり", () => {
    expect(PITCH_NAMES).toEqual(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
    expect(PITCH_NAMES.length).toBe(12);
  });
});

describe("QUALITY_INTERVALS（34品質・旧api/web完全一致テーブル）", () => {
  it("キー数と代表品質", () => {
    expect(Object.keys(QUALITY_INTERVALS).length).toBe(34);
    expect(QUALITY_INTERVALS[""]).toEqual([0, 4, 7]);
    expect(QUALITY_INTERVALS.m).toEqual([0, 3, 7]);
    expect(QUALITY_INTERVALS.maj7).toEqual([0, 4, 7, 11]);
    expect(QUALITY_INTERVALS.m7b5).toEqual([0, 3, 6, 10]);
    expect(QUALITY_INTERVALS["13"]).toEqual([0, 4, 7, 10, 2, 9]);
  });
  it("全品質が非空・pc 化で 0-11・重複なし", () => {
    for (const [q, ivals] of Object.entries(QUALITY_INTERVALS)) {
      const pcs = chordPcs(0, q);
      expect(pcs.length, q).toBe(ivals.length);
      expect(pcs.every((p) => p >= 0 && p <= 11), q).toBe(true);
      expect(new Set(pcs).size, `${q} に重複pc`).toBe(ivals.length);
    }
  });
});

describe("normRoot", () => {
  it("数値はピッチクラスへ折り返し", () => {
    expect(normRoot(0)).toBe(0);
    expect(normRoot(12)).toBe(0);
    expect(normRoot(-1)).toBe(11);
    expect(normRoot(25)).toBe(1);
  });
  it("音名（ナチュラル/シャープ/フラット/複数臨時記号）", () => {
    expect(normRoot("C")).toBe(0);
    expect(normRoot("A")).toBe(9);
    expect(normRoot("C#")).toBe(1);
    expect(normRoot("Db")).toBe(1);
    expect(normRoot("Bb")).toBe(10);
    expect(normRoot("B#")).toBe(0);
    expect(normRoot("Cb")).toBe(11);
    expect(normRoot("F##")).toBe(7);
  });
  it("空文字は 0、未知音名は base 0 起点", () => {
    expect(normRoot("")).toBe(0);
  });
});

describe("chordPcs", () => {
  it("root からインターバルを積む（root=C）", () => {
    expect(chordPcs(0, "").slice().sort((a, b) => a - b)).toEqual([0, 4, 7]);
    expect(chordPcs(0, "m7").slice().sort((a, b) => a - b)).toEqual([0, 3, 7, 10]);
  });
  it("root 移調で全 pc がシフト（G maj）", () => {
    expect(chordPcs(7, "").slice().sort((a, b) => a - b)).toEqual([2, 7, 11]); // G B D
  });
  it("音名 root も解釈", () => {
    expect(chordPcs("A", "m").slice().sort((a, b) => a - b)).toEqual([0, 4, 9]); // A C E
  });
  it("未知 quality はトライアド扱い", () => {
    expect(chordPcs(0, "no-such-quality").slice().sort((a, b) => a - b)).toEqual([0, 4, 7]);
  });
});
