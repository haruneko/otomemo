import { describe, it, expect } from "vitest";
import { rhythmGrid, barCells, learnRhythmCells, genRhythm, cellsToOnsets } from "../src/music/rhythmCells";

const onsetCount = (cells: string[]): number => cells.join("").split("").filter((c) => c === "x").length;

describe("rhythmGrid（拍子→格子：1セル=1拍・語彙=2^枠）", () => {
  it("単純拍子は16分4枠／複合は8分3枠", () => {
    expect(rhythmGrid("4/4")).toEqual({ beatsPerBar: 4, beatUnit: 1, slotsPerBeat: 4 }); // 16語
    expect(rhythmGrid("2/4")).toEqual({ beatsPerBar: 2, beatUnit: 1, slotsPerBeat: 4 });
    expect(rhythmGrid("3/4")).toEqual({ beatsPerBar: 3, beatUnit: 1, slotsPerBeat: 4 });
    expect(rhythmGrid("6/8")).toEqual({ beatsPerBar: 2, beatUnit: 1.5, slotsPerBeat: 3 }); // 8語・.25/.75無し
    expect(rhythmGrid("9/8")).toEqual({ beatsPerBar: 3, beatUnit: 1.5, slotsPerBeat: 3 });
    expect(rhythmGrid("3/8")).toEqual({ beatsPerBar: 1, beatUnit: 1.5, slotsPerBeat: 3 });
  });
});

describe("barCells（1小節の onset列→拍ごとの16分パターン文字列）", () => {
  it("4/4：各拍を4枠に量子化", () => {
    // 拍0[0,1):0,0.5 / 拍1[1,2):1,1.5 / 拍2[2,3):2 / 拍3[3,4):3
    expect(barCells([0, 0.5, 1, 1.5, 2, 3], "4/4")).toEqual(["x.x.", "x.x.", "x...", "x..."]);
  });
  it("空拍は伸ばし/休符＝'....'（=2^枠に含む）", () => {
    expect(barCells([0, 2], "4/4")).toEqual(["x...", "....", "x...", "...."]);
  });
  it("6/8：拍は付点四分・8分3枠（.25/.75は存在しない）", () => {
    // 拍0[0,1.5):0,0.5,1 / 拍1[1.5,3):1.5
    expect(barCells([0, 0.5, 1, 1.5], "6/8")).toEqual(["xxx", "x.."]);
  });
});

describe("learnRhythmCells（数えるだけ＝頻度＋位置条件遷移）", () => {
  it("セル頻度と P(セル|拍位置,直前) を小節内でカウント", () => {
    const bars = [
      [0, 1, 2, 3],          // → x... x... x... x...
      [0, 0.5, 1, 2, 3],     // → x.x. x... x... x...
    ];
    const m = learnRhythmCells(bars, "4/4");
    expect(m.cells.get("x...")).toBe(7); // bar1=4 + bar2=3
    expect(m.cells.get("x.x.")).toBe(1);
    // 拍2で直前 x... の次は x...（両小節で1回ずつ＝2）
    expect(m.trans.get("2|x...")?.get("x...")).toBe(2);
    // 拍1で直前 x.x.（bar2 のみ）の次は x...（1回）
    expect(m.trans.get("1|x.x.")?.get("x...")).toBe(1);
    // 拍0は小節頭＝直前なし＝遷移キーに現れない
    expect([...m.trans.keys()].some((k) => k.startsWith("0|"))).toBe(false);
  });

  it("遷移は小節をまたがない（小節頭で prev リセット＝曲順/混在に非依存）", () => {
    const m = learnRhythmCells([[0], [0]], "4/4"); // 各小節 x... .... .... ....
    expect(m.cells.get("x...")).toBe(2);
    expect(m.cells.get("....")).toBe(6);
    expect(m.trans.get("1|x...")?.get("....")).toBe(2); // 拍0(x...)→拍1(....) を2回
    expect(m.posCells.get(0)?.get("x...")).toBe(2); // 拍0は両小節とも x...
    expect(m.posCells.get(1)?.get("....")).toBe(2); // 拍1は両小節とも ....
  });
});

// 音数の異なる4種(....=0, x...=1, x.x.=2, xxxx=4)を各拍位置に学習させたモデル＝DPで任意Nを組める。
const richModel = () => learnRhythmCells([
  [],                                                    // .... ×4 (0音)
  [0, 1, 2, 3],                                          // x... ×4 (1音)
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],                      // x.x. ×4 (2音)
  Array.from({ length: 16 }, (_, i) => i * 0.25),        // xxxx ×4 (4音)
], "4/4");

describe("genRhythm（自由生成＝マルコフ／音数指定＝拍上DP）", () => {
  it("自由生成：bars×beatsPerBar 個のセル・全て語彙内・seed で決定的", () => {
    const m = richModel();
    const a = genRhythm(m, { bars: 2, seed: 7 });
    expect(a.length).toBe(8); // 2小節×4拍
    expect(a.every((c) => m.cells.has(c))).toBe(true);
    expect(genRhythm(m, { bars: 2, seed: 7 })).toEqual(a); // 同seed＝同出力
  });

  it("音数指定：合計 onset 数がちょうど目標Nになる（歌詞の音数）", () => {
    const m = richModel();
    for (const N of [3, 4, 5, 6, 7, 8]) {
      const cells = genRhythm(m, { bars: 1, syllables: N });
      expect(cells.length).toBe(4);
      expect(onsetCount(cells)).toBe(N); // ぴったり
    }
  });

  it("音数指定：複数小節でも合計＝N", () => {
    const m = richModel();
    const cells = genRhythm(m, { bars: 2, syllables: 13 });
    expect(cells.length).toBe(8);
    expect(onsetCount(cells)).toBe(13);
  });

  it("不能な音数（1小節に16音超）はエラー", () => {
    expect(() => genRhythm(richModel(), { bars: 1, syllables: 20 })).toThrow();
  });
});

describe("cellsToOnsets（セル列→onset拍位置）", () => {
  it("4/4：拍位置＋枠位置を四分拍の絶対値へ", () => {
    expect(cellsToOnsets(["x.x.", "x...", "....", "x..."], "4/4")).toEqual([0, 0.5, 1, 3]);
  });
  it("2小節目は小節長ぶんオフセット", () => {
    expect(cellsToOnsets(["x...", "....", "....", "....", "x...", "....", "....", "...."], "4/4")).toEqual([0, 4]);
  });
});
