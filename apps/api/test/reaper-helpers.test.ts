import { describe, it, expect } from "vitest";
import { keyToPc, frameVals, hasMusic } from "../src/reaper";

// reaper.ts の純粋ヘルパの境界を直接固定する。materialize 分岐自体は job.test.ts が
// 通しで押さえているが、キー表記の揺れ（フラット/ダブル臨時記号/別名）や frame の
// バリデーションは Claude 出力の揺れに直に晒される契約なので、ここで単体で網羅する。

describe("keyToPc（キー表記→ピッチクラス・Claude出力の揺れに耐える）", () => {
  it("数値 0..11 はそのまま通す", () => {
    expect(keyToPc(0)).toBe(0);
    expect(keyToPc(9)).toBe(9);
    expect(keyToPc(11)).toBe(11);
  });
  it("範囲外の数値は undefined（12/-1 を勝手に丸めない）", () => {
    expect(keyToPc(12)).toBeUndefined();
    expect(keyToPc(-1)).toBeUndefined();
  });
  it("ナチュラル音名（大文字小文字どちらも）", () => {
    expect(keyToPc("C")).toBe(0);
    expect(keyToPc("A")).toBe(9);
    expect(keyToPc("g")).toBe(7); // 先頭を大文字化
    expect(keyToPc("B")).toBe(11);
  });
  it("シャープ（# と ♯ 両方）", () => {
    expect(keyToPc("C#")).toBe(1);
    expect(keyToPc("F♯")).toBe(6);
    expect(keyToPc("G#")).toBe(8);
  });
  it("フラット（b と ♭ 両方）＝reap 経由テストでは未カバーの経路", () => {
    expect(keyToPc("Bb")).toBe(10);
    expect(keyToPc("D♭")).toBe(1);
    expect(keyToPc("Gb")).toBe(6);
  });
  it("ダブル臨時記号・境界越えを 12 で正規化", () => {
    expect(keyToPc("F##")).toBe(7); // 5+2
    expect(keyToPc("Bbb")).toBe(9); // 11-2
    expect(keyToPc("B#")).toBe(0); // 11+1 → 12 → 0
    expect(keyToPc("Cb")).toBe(11); // 0-1 → -1 → 11
  });
  it("不正入力は undefined（無音で null 化＝捏造しない）", () => {
    expect(keyToPc("H")).toBeUndefined(); // 存在しない音名
    expect(keyToPc("")).toBeUndefined();
    expect(keyToPc(null)).toBeUndefined();
    expect(keyToPc({})).toBeUndefined();
    expect(keyToPc(undefined)).toBeUndefined();
  });
});

describe("frameVals（断片ヒントの取り出し＋バリデーション）", () => {
  it("frame でない入力は空オブジェクト", () => {
    expect(frameVals(null)).toEqual({});
    expect(frameVals("x")).toEqual({});
    expect(frameVals(42)).toEqual({});
  });
  it("key は keyToPc 経由（文字列も数値も）", () => {
    expect(frameVals({ key: "A" })).toEqual({ key: 9 });
    expect(frameVals({ key: 5 })).toEqual({ key: 5 });
    expect(frameVals({ key: "H" })).toEqual({}); // 不正キーは付けない
  });
  it("meter は time_signature 別名も許容・空文字は捨てる", () => {
    expect(frameVals({ meter: "6/8" })).toEqual({ meter: "6/8" });
    expect(frameVals({ time_signature: "3/4" })).toEqual({ meter: "3/4" });
    expect(frameVals({ meter: "" })).toEqual({}); // 空は付けない
  });
  it("tempo は正の数のみ", () => {
    expect(frameVals({ tempo: 120 })).toEqual({ tempo: 120 });
    expect(frameVals({ tempo: 0 })).toEqual({}); // 0 は捨てる
    expect(frameVals({ tempo: -20 })).toEqual({});
    expect(frameVals({ tempo: "120" })).toEqual({}); // 文字列は捨てる
  });
  it("bars は正の数を四捨五入", () => {
    expect(frameVals({ bars: 8 })).toEqual({ bars: 8 });
    expect(frameVals({ bars: 8.4 })).toEqual({ bars: 8 }); // Math.round
    expect(frameVals({ bars: 7.6 })).toEqual({ bars: 8 });
    expect(frameVals({ bars: 0 })).toEqual({}); // 0 は捨てる
  });
  it("mood は非空文字列のみ", () => {
    expect(frameVals({ mood: "切ない" })).toEqual({ mood: "切ない" });
    expect(frameVals({ mood: "" })).toEqual({});
  });
  it("複合＝拾えるものだけ拾う", () => {
    expect(frameVals({ key: "A", time_signature: "6/8", tempo: 90, bars: 4.2, mood: "疾走", junk: 1 })).toEqual({
      key: 9,
      meter: "6/8",
      tempo: 90,
      bars: 4,
      mood: "疾走",
    });
  });
});

describe("hasMusic（音楽 content の有無判定）", () => {
  it("null/非オブジェクトは false", () => {
    expect(hasMusic(null)).toBe(false);
    expect(hasMusic(undefined)).toBe(false);
    expect(hasMusic({})).toBe(false);
  });
  it("notes は非空で true", () => {
    expect(hasMusic({ notes: [{ pitch: 60 }] })).toBe(true);
    expect(hasMusic({ notes: [] })).toBe(false);
  });
  it("chords は非空で true", () => {
    expect(hasMusic({ chords: [{ root: 0 }] })).toBe(true);
    expect(hasMusic({ chords: [] })).toBe(false);
  });
  it("相対bass の pattern（notes/chords 無し）を落とさない", () => {
    expect(hasMusic({ mode: "relative", pattern: [{ step: 0, degree: "R" }] })).toBe(true);
    expect(hasMusic({ pattern: [] })).toBe(false);
  });
  it("rhythm.lanes は hit があれば true・無ければ false", () => {
    expect(hasMusic({ rhythm: { lanes: [{ hits: [0, 4] }] } })).toBe(true);
    expect(hasMusic({ rhythm: { lanes: [{ hits: [] }, { hits: [] }] } })).toBe(false);
    expect(hasMusic({ rhythm: { lanes: [{ hits: [] }, { hits: [8] }] } })).toBe(true); // どれか1レーンに hit
  });
});
