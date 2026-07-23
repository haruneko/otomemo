import { describe, it, expect } from "vitest";
import type { Neta } from "../src/api";
import { genreColor, genreLabel, genreTagOf } from "../src/genres";

// Task1h（design「### Task1h＝読み込みダイアログにジャンルの小アクセント」）純ロジック：
//  (b) genreColor は各ジャンル固定（同 genre→同色・不変）。未知/空＝""（fallback 色にしない＝ドット無し）。
//  ＋ genreLabel（既存 chip 日本語）／genreTagOf（genre: タグ先頭を剥がす）。

const mkNeta = (tags: string[]): Neta => ({
  id: "n1", kind: "chord_pattern", title: "x", text: null, content: {},
  key: 0, mode: null, tempo: null, meter: null, bars: null, mood: null,
  scope: "library", tags, created: "", updated: "",
});

describe("Task1h (b) genreColor＝各ジャンル固定・theme-aware CSS 変数", () => {
  it("同 genre は常に同色（不変）＝var(--genre-<key>)", () => {
    expect(genreColor("rock")).toBe(genreColor("rock"));
    expect(genreColor("rock")).toBe("var(--genre-red)");
    expect(genreColor("citypop")).toBe("var(--genre-aqua)");
    expect(genreColor("jpop")).toBe("var(--genre-magenta)");
  });

  it("全ジャンル（union）に固定割当がある＝色が付く", () => {
    const genres = ["rock", "pop", "citypop", "ballad", "dance", "edm", "funk", "anison", "jazz", "gospel", "folk", "reggae", "vocarock", "jpop", "metal"];
    for (const g of genres) expect(genreColor(g)).toMatch(/^var\(--genre-[a-z]+\)$/);
  });

  it("割当は重複しない（各ジャンル固有の色キー）", () => {
    const genres = ["rock", "pop", "citypop", "ballad", "dance", "edm", "funk", "anison", "jazz", "gospel", "folk", "reggae", "vocarock", "jpop", "metal"];
    const colors = genres.map(genreColor);
    expect(new Set(colors).size).toBe(genres.length);
  });

  it("未知/空＝\"\"（ドット無し・fallback 色にしない）", () => {
    expect(genreColor("")).toBe("");
    expect(genreColor("unknownstyle")).toBe("");
  });
});

describe("Task1h genreLabel＝既存 chip 日本語＋補完", () => {
  it("chip の日本語を流用", () => {
    expect(genreLabel("rock")).toBe("ロック");
    expect(genreLabel("citypop")).toBe("シティポップ");
    expect(genreLabel("dance")).toBe("4つ打ち");
    expect(genreLabel("vocarock")).toBe("ボカロック");
  });
  it("不足を補完（rock 以外の追加語彙）", () => {
    expect(genreLabel("jazz")).toBe("ジャズ");
    expect(genreLabel("gospel")).toBe("ゴスペル");
    expect(genreLabel("reggae")).toBe("レゲエ");
    expect(genreLabel("metal")).toBe("メタル");
    expect(genreLabel("jpop")).toBe("J-POP");
    expect(genreLabel("edm")).toBe("EDM");
  });
  it("未知は原文を返す（保険）", () => {
    expect(genreLabel("weirdgenre")).toBe("weirdgenre");
  });
});

describe("Task1h genreTagOf＝genre: タグ先頭を剥がす", () => {
  it("genre: タグ先頭を1つ剥がす", () => {
    expect(genreTagOf(mkNeta(["genre:rock"]))).toBe("rock");
    expect(genreTagOf(mkNeta(["lib:factory", "genre:citypop", "scene:verse"]))).toBe("citypop");
  });
  it("genre タグ無し＝undefined（＝ドット無し）", () => {
    expect(genreTagOf(mkNeta(["scene:verse"]))).toBeUndefined();
    expect(genreTagOf(mkNeta([]))).toBeUndefined();
  });
});
