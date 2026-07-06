import { describe, it, expect } from "vitest";
import { commonProgressions } from "../src/common-progressions";

describe("commonProgressions（横断曲 n-gram 頻度）", () => {
  // (a) 2曲が異なる調でも同じ度数列（i-VI-III-VII）に正規化される
  it("AmとEmの同型進行が同じ度数列に正規化されsongCount=2になる", () => {
    const songs = [
      { title: "Am曲", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
      { title: "Em曲", chords: [{ root: 4, quality: "m" }, { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 2, quality: "" }] },
    ];
    const { common } = commonProgressions(songs);
    // 4コードの4-gramが両曲に出る→ songCount=2
    const found4 = common.find((c) => c.degrees.length === 4 && c.songCount === 2);
    expect(found4).toBeDefined();
    expect(found4!.songCount).toBe(2);
    expect(found4!.songs).toContain("Am曲");
    expect(found4!.songs).toContain("Em曲");
    // 度数列の先頭は minor chord（相対調の曖昧さで "0:m" か "9:m" になるが minor は保証）
    expect(found4!.degrees[0]).toMatch(/:m$/); // minor quality が末尾
  });

  // メイン調相対（resolveTonic）：Am-F-C-G は分布＋first(Am)から **A minor** と判定＝度数は短調フレーム
  // ["0:m","8:","3:","10:"]（i-VI-III-VII）。example は短調基準(Am)で実音化＝元の **Am-F-C-G** に戻る（弾ける自然な進行）。
  it("メイン調相対（短調フレーム i-VI-III-VII）＋ example は Am-F-C-G に戻る", () => {
    const songs = [
      { title: "Am曲", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
      { title: "Em曲", chords: [{ root: 4, quality: "m" }, { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 2, quality: "" }] },
    ];
    const { common } = commonProgressions(songs);
    const top4 = common.find((c) => c.degrees.length === 4 && c.songCount === 2);
    expect(top4).toBeDefined();
    // 短調フレーム＝トニックが 0:m（i）で始まる
    expect(top4!.degrees[0]).toBe("0:m");
    const ex = top4!.example;
    // 実音が Am-F-C-G（root 9,5,0,7 / 先頭が minor）＝弾ける自然な進行
    expect(ex.map((e) => e.root)).toEqual([9, 5, 0, 7]);
    expect(ex.map((e) => e.quality)).toEqual(["m", "", "", ""]);
    // start/dur が設定されている
    expect(ex[0]!.start).toBe(0);
    expect(ex[0]!.dur).toBeGreaterThan(0);
    // 4コード分存在する
    expect(ex).toHaveLength(4);
  });

  // (b) 部分的な重なり
  it("3曲で一部だけ共通する場合、songCountが異なる値になる", () => {
    // 曲A,曲C は Am-F-C-G 型、曲B は異なる型
    const songs = [
      { title: "曲A", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
      { title: "曲B", chords: [{ root: 0, quality: "" }, { root: 4, quality: "m" }, { root: 5, quality: "" }, { root: 7, quality: "7" }] },
      { title: "曲C", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
    ];
    const { common } = commonProgressions(songs);
    // songCount は降順
    for (let i = 0; i < common.length - 1; i++) {
      expect(common[i]!.songCount).toBeGreaterThanOrEqual(common[i + 1]!.songCount);
    }
    // 曲Aと曲Cの共通4-gram が songCount=2 で存在する
    const twoSong = common.find((c) => c.degrees.length === 4 && c.songCount === 2);
    expect(twoSong?.songs).toContain("曲A");
    expect(twoSong?.songs).toContain("曲C");
  });

  // (c) エッジケース：空・1曲
  it("空の曲リスト → common=[], stats.songs=0", () => {
    const { common, stats } = commonProgressions([]);
    expect(common).toEqual([]);
    expect(stats.songs).toBe(0);
  });

  it("コードなし曲のみ → n-gramが作れないのでcommon=[]", () => {
    const { common } = commonProgressions([{ title: "empty", chords: [] }]);
    expect(common).toEqual([]);
  });

  it("1曲のみ → songCountは最大1", () => {
    const songs = [
      { title: "曲A", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
    ];
    const { common } = commonProgressions(songs);
    expect(common.every((c) => c.songCount <= 1)).toBe(true);
  });

  it("コードが1つだけでは2-gram以上を作れない", () => {
    const songs = [
      { title: "曲A", chords: [{ root: 9, quality: "m" }] },
      { title: "曲B", chords: [{ root: 9, quality: "m" }] },
    ];
    const { common } = commonProgressions(songs);
    expect(common.filter((c) => c.degrees.length >= 2)).toHaveLength(0);
  });

  // ランキング検証
  it("ランキング：songCount降順が最優先", () => {
    const songs = [
      { title: "A1", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
      { title: "A2", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
      { title: "A3", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
    ];
    const { common } = commonProgressions(songs);
    for (let i = 0; i < common.length - 1; i++) {
      expect(common[i]!.songCount).toBeGreaterThanOrEqual(common[i + 1]!.songCount);
    }
  });

  // stats
  it("stats.songs は入力曲数と一致", () => {
    const songs = [
      { title: "A", chords: [{ root: 9, quality: "m" }] },
      { title: "B", chords: [{ root: 4, quality: "m" }] },
      { title: "C", chords: [{ root: 0, quality: "" }] },
    ];
    const { stats } = commonProgressions(songs);
    expect(stats.songs).toBe(3);
  });

  it("stats.modes は major/minor のカウントを格納する", () => {
    const songs = [
      // Am-F-C-G: A minor
      { title: "マイナー", chords: [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }] },
      // C-G-Am-Em: C major と A minor が競合するが何か検出される
      { title: "メジャー混在", chords: [{ root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" }] },
    ];
    const { stats } = commonProgressions(songs);
    expect(stats.songs).toBe(2);
    const totalModes = Object.values(stats.modes).reduce((s, v) => s + v, 0);
    expect(totalModes).toBe(2); // 2曲分
  });
});
