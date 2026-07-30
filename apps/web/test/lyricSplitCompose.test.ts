import { describe, it, expect } from "vitest";
import {
  onsetFigure, decomposeOptions, matchCandidate, selectionAdded, candidateToSelection, optionLabel,
} from "../src/lyricSplitCompose";
import type { SplitCandidateDTO } from "../src/api";

// 4分音符4つ（1小節4/4）。字余り2の候補を模す（実 API と同形）。
const range = { start: 0, beats: 4 };
const cand = (splits: { noteIndex: number; slot: number }[], extra: Partial<SplitCandidateDTO> = {}): SplitCandidateDTO => ({
  notesAfter: [], splits, splitCount: new Set(splits.map((s) => s.noteIndex)).size, addedOnsets: splits.length,
  corpusKnown: null, corpusFreq: 0, cv: 0, phraseEndRatio: 1, syncPerBar: 0, specialBeatHit: false, wordBoundaryHit: false, ...extra,
});
// 「散らす」＝音符0と音符1を1つずつ／「詰める」＝音符0に2つ。
const spread = cand([{ noteIndex: 0, slot: 2 }, { noteIndex: 1, slot: 6 }], { corpusFreq: 217, corpusKnown: true });
const cram = cand([{ noteIndex: 0, slot: 1 }, { noteIndex: 0, slot: 2 }], { corpusKnown: false });
const candidates = [spread, cram];
const inRange = [0, 1, 2, 3];

describe("onsetFigure：割り方を図にする", () => {
  it("元onset=orig・足したonset=added・無=none を16枠に置く", () => {
    // 音符0を2つに割った後（start 0 と 0.5）＋残り。元の start は 0,1,2,3。
    const notesAfter = [
      { start: 0 }, { start: 0.5 }, { start: 1 }, { start: 2 }, { start: 3 },
    ];
    const cells = onsetFigure(notesAfter, [0, 1, 2, 3], range, 4, 4);
    expect(cells).toHaveLength(16);
    expect(cells[0]).toBe("orig");  // 元
    expect(cells[2]).toBe("added"); // 0.5拍=slot2＝割って足した
    expect(cells[4]).toBe("orig");  // 1拍
    expect(cells[1]).toBe("none");
  });
});

describe("decomposeOptions：候補を音符ごとの割り方に分解", () => {
  it("各音符に『割らない』を含み、候補にある割り方が選択肢になる", () => {
    const opts = decomposeOptions(candidates, inRange);
    // 音符0：割らない・{2}(散らす由来)・{1,2}(詰める由来)
    const o0 = opts.get(0)!;
    expect(o0.some((o) => o.added === 0)).toBe(true);
    expect(o0.some((o) => o.added === 1 && o.slots.join() === "2")).toBe(true);
    expect(o0.some((o) => o.added === 2 && o.slots.join() === "1,2")).toBe(true);
    // 音符1：割らない・{6}
    const o1 = opts.get(1)!;
    expect(o1.some((o) => o.added === 0)).toBe(true);
    expect(o1.some((o) => o.added === 1 && o.slots.join() === "6")).toBe(true);
    // 音符3（句末）：割らないだけ
    expect(opts.get(3)!.every((o) => o.added === 0)).toBe(true);
    // 選択肢は added 昇順
    expect(o0.map((o) => o.added)).toEqual([...o0.map((o) => o.added)].sort((a, b) => a - b));
  });
});

describe("matchCandidate / selectionAdded：選択→候補の照合と残り", () => {
  it("散らす選択は spread 候補に一致する", () => {
    const sel = new Map<number, string>([[0, "2"], [1, "6"], [2, ""], [3, ""]]);
    expect(matchCandidate(candidates, inRange, sel)).toBe(spread);
  });
  it("詰める選択は cram 候補に一致する", () => {
    const sel = new Map<number, string>([[0, "1,2"], [1, ""], [2, ""], [3, ""]]);
    expect(matchCandidate(candidates, inRange, sel)).toBe(cram);
  });
  it("どの候補とも合わない選択は null（＝適用不可）", () => {
    const sel = new Map<number, string>([[0, "2"], [1, ""], [2, ""], [3, ""]]); // 合計1＝余り2に足りない
    expect(matchCandidate(candidates, inRange, sel)).toBeNull();
  });
  it("selectionAdded は足す onset の合計を返す（残りの計算に使う）", () => {
    const opts = decomposeOptions(candidates, inRange);
    const sel = new Map<number, string>([[0, "2"], [1, "6"], [2, ""], [3, ""]]);
    expect(selectionAdded(opts, sel)).toBe(2);
    const sel1 = new Map<number, string>([[0, "2"], [1, ""], [2, ""], [3, ""]]);
    expect(selectionAdded(opts, sel1)).toBe(1);
  });
});

describe("candidateToSelection：候補→選択（リスト/おすすめの読み込み）", () => {
  it("候補の splits を音符ごとの key に戻す（往復一致）", () => {
    const sel = candidateToSelection(spread, inRange);
    expect(matchCandidate(candidates, inRange, sel)).toBe(spread);
    expect(sel.get(0)).toBe("2");
    expect(sel.get(1)).toBe("6");
    expect(sel.get(3)).toBe("");
  });
});

describe("optionLabel：内輪語なしの言葉", () => {
  it("割らない／N+1つに割る", () => {
    expect(optionLabel({ added: 0, slots: [], key: "" })).toBe("割らない");
    expect(optionLabel({ added: 1, slots: [2], key: "2" })).toBe("2つに割る");
    expect(optionLabel({ added: 2, slots: [1, 2], key: "1,2" })).toBe("3つに割る");
  });
});
