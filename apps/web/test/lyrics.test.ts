import { describe, it, expect } from "vitest";
import { splitMora, moraLines, setSyllable, nextNoteIndex, prevNoteIndex } from "../src/lyrics";
import type { Note } from "../src/music";

describe("lyrics mora", () => {
  it("splits moras (small kana combine; ー/っ/ん are 1 each)", () => {
    expect(splitMora("はしる")).toEqual(["は", "し", "る"]);
    expect(splitMora("きゃー")).toEqual(["きゃ", "ー"]);
    expect(splitMora("がっこう")).toEqual(["が", "っ", "こ", "う"]);
  });

  it("counts moras per line", () => {
    expect(moraLines("よる\nかける")).toEqual([
      { line: "よる", count: 2 },
      { line: "かける", count: 3 },
    ]);
  });
});

// 詞モード（1音ずつリタッチ・PianoRoll 歌詞編集モードの純ロジック）。
describe("setSyllable / nextNoteIndex / prevNoteIndex（詞モードの送りバー ◀▶）", () => {
  const N = (start: number, syllable?: string): Note => ({ pitch: 60, start, dur: 1, syllable });

  it("setSyllable：対象だけ差し替え・非破壊（他ノート/元配列は不変）", () => {
    const notes = [N(0, "あ"), N(1, "い")];
    const out = setSyllable(notes, 1, "う");
    expect(out[1]!.syllable).toBe("う");
    expect(out[0]!.syllable).toBe("あ"); // 他は不変
    expect(notes[1]!.syllable).toBe("い"); // 元配列は不変（純関数）
  });

  it("setSyllable：空/空白のみ＝クリア（undefined）", () => {
    const notes = [N(0, "あ")];
    expect(setSyllable(notes, 0, "")[0]!.syllable).toBeUndefined();
    expect(setSyllable(notes, 0, "  ")[0]!.syllable).toBeUndefined();
  });

  it("setSyllable：「ー」＝メリスマもそのまま通す", () => {
    expect(setSyllable([N(0)], 0, "ー")[0]!.syllable).toBe("ー");
  });

  it("nextNoteIndex：時間順（start昇順）で次の音符の配列インデックス", () => {
    // 配列順は時間順と違う（[2拍, 0拍, 1拍]）→ 0拍(idx1)の次は 1拍(idx2)、1拍の次は 2拍(idx0)。
    const notes = [N(2), N(0), N(1)];
    expect(nextNoteIndex(notes, 1)).toBe(2);
    expect(nextNoteIndex(notes, 2)).toBe(0);
    expect(nextNoteIndex(notes, 0)).toBeNull(); // 最後＝次なし
  });

  it("nextNoteIndex：同時刻は配列順・範囲外は null", () => {
    const notes = [N(0), N(0)];
    expect(nextNoteIndex(notes, 0)).toBe(1);
    expect(nextNoteIndex(notes, 1)).toBeNull();
    expect(nextNoteIndex(notes, -1)).toBeNull();
    expect(nextNoteIndex(notes, 9)).toBeNull();
  });

  // ◀（確定して前の音符へ）＝誤送りからの復帰（design §31-9・§31-11 の16 (a)＝候補2）。
  it("prevNoteIndex：時間順（start昇順）で前の音符の配列インデックス", () => {
    // 配列順は時間順と違う（[2拍, 0拍, 1拍]）→ 2拍(idx0)の前は 1拍(idx2)、1拍の前は 0拍(idx1)。
    const notes = [N(2), N(0), N(1)];
    expect(prevNoteIndex(notes, 0)).toBe(2);
    expect(prevNoteIndex(notes, 2)).toBe(1);
    expect(prevNoteIndex(notes, 1)).toBeNull(); // 先頭＝前なし
  });

  it("prevNoteIndex：同時刻は配列順・範囲外は null", () => {
    const notes = [N(0), N(0)];
    expect(prevNoteIndex(notes, 1)).toBe(0);
    expect(prevNoteIndex(notes, 0)).toBeNull();
    expect(prevNoteIndex(notes, -1)).toBeNull();
    expect(prevNoteIndex(notes, 9)).toBeNull();
  });

  it("prevNoteIndex と nextNoteIndex は逆向きで往復する（◀▶の対称）", () => {
    const notes = [N(2), N(0), N(1)];
    for (const i of [0, 1, 2]) {
      const nx = nextNoteIndex(notes, i);
      if (nx != null) expect(prevNoteIndex(notes, nx)).toBe(i);
    }
  });
});
