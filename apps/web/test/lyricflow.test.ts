import { describe, it, expect } from "vitest";
import { flowLyric, splitMora } from "../src/lyrics";
import type { Note } from "../src/music";

const N = (start: number, dur: number, pitch = 60): Note => ({ pitch, start, dur });
const sum = (ns: Note[]) => Math.round(ns.reduce((s, n) => s + n.dur, 0) * 1000) / 1000;

describe("flowLyric（歌詞→メロ流し込み・design L2）", () => {
  it("一致：モーラ数=音符数なら1:1で syllable 割当", () => {
    const out = flowLyric([N(0, 1), N(1, 1)], ["あ", "い"]);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "い"]);
    expect(out).toHaveLength(2);
  });

  it("音符が多い：余りはメリスマ ー", () => {
    const out = flowLyric([N(0, 1), N(1, 1), N(2, 1)], ["あ", "ん"]);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "ん", "ー"]);
  });

  it("歌詞が多い：一番長い音符を半分に分割して枠を増やす（総尺は保存）", () => {
    const out = flowLyric([N(0, 2)], ["あ", "い", "う"]); // 1音符に3モーラ
    expect(out).toHaveLength(3);
    expect(out.map((n) => n.syllable)).toEqual(["あ", "い", "う"]);
    expect(sum(out)).toBe(2); // 総尺は変えない
    expect(out.every((n) => n.dur >= 0.25)).toBe(true); // 16分を下回らない
  });

  it("拗音は1モーラ（きょう=きょ/う の2モーラ→2音符に割れる）", () => {
    expect(splitMora("きょう")).toEqual(["きょ", "う"]);
    const out = flowLyric([N(0, 1), N(1, 1)], splitMora("きょう"));
    expect(out.map((n) => n.syllable)).toEqual(["きょ", "う"]);
  });

  it("これ以上割れない（16分）のに歌詞が多い：余りを最後の音符に連結", () => {
    const out = flowLyric([N(0, 0.25)], ["あ", "い"]); // 16分1個に2モーラ
    expect(out).toHaveLength(1);
    expect(out[0]!.syllable).toBe("あい");
  });

  it("元データは破壊しない（純関数）", () => {
    const notes = [N(0, 2)];
    flowLyric(notes, ["あ", "い"]);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.syllable).toBeUndefined();
  });
});
