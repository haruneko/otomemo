import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Neta } from "../src/api";

// Task1h（design「### Task1h＝読み込みダイアログにジャンルの小アクセント」）カード表示 TDD：
//  (a) genre タグ有りカード＝色ドット＋日本語ラベルが出る。
//  (c) genre タグ無しネタ＝ドット/ラベル無しで崩れない（自作パターン等）。
//  (d) 既存の名・scene・MiniRoll は不変（純追加＝ジャンル追加で回帰しない・PatternImportDialog 外は無改修）。
const api = vi.hoisted(() => ({ listNeta: vi.fn() }));
vi.mock("../src/api", () => ({ api }));
// MiniRoll は content 依存の描画＝本テストの主題外なのでスタブ（描画の有無だけ確認できれば十分）。
vi.mock("../src/components/MiniRoll", () => ({ MiniRoll: () => <div data-testid="mini-roll" /> }));

import { PatternImportDialog } from "../src/components/PatternImportDialog";

const neta = (over: Partial<Neta> = {}): Neta => ({
  id: "n1", kind: "chord_pattern", title: "GT-FOLK8 フォーク", text: null,
  content: { patternId: "GT-FOLK8" }, key: 0, mode: null, tempo: null, meter: null,
  bars: null, mood: null, scope: "library", tags: [], created: "", updated: "", ...over,
});

const open = (netas: Neta[], showScene = false) => {
  api.listNeta.mockResolvedValue(netas);
  render(
    <PatternImportDialog
      kind="chord_pattern"
      fallbackName="コード楽器"
      showScene={showScene}
      onPreview={vi.fn()}
      onPick={vi.fn()}
      onClose={vi.fn()}
    />,
  );
};

describe("Task1h (a) genre タグ有りカード＝色ドット＋日本語ラベル", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genre:rock＝『ロック』ラベル＋var(--genre-red) のドットが出る", async () => {
    open([neta({ tags: ["genre:rock"] })]);
    const card = await screen.findByLabelText("import-card-0");
    expect(card.textContent).toContain("ロック"); // 日本語ラベル併記
    const tag = screen.getByLabelText("import-genre-tag-0");
    const dot = tag.querySelector(".pi-genre-dot") as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.style.background).toBe("var(--genre-red)"); // genreColor(rock)＝固定色
  });

  it("複数 genre タグは先頭（主要1つ）を採る", async () => {
    open([neta({ tags: ["lib:factory", "genre:citypop", "genre:pop"] })]);
    const card = await screen.findByLabelText("import-card-0");
    expect(card.textContent).toContain("シティポップ");
    const dot = screen.getByLabelText("import-genre-tag-0").querySelector(".pi-genre-dot") as HTMLElement;
    expect(dot.style.background).toBe("var(--genre-aqua)");
  });
});

describe("Task1h (c) genre タグ無しネタ＝ドット無しで崩れない", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genre タグ無し（自作パターン等）＝ドット/ラベルを出さない・名前は出る", async () => {
    open([neta({ title: "自作フレーズ", tags: [] })]);
    const card = await screen.findByLabelText("import-card-0");
    expect(card.textContent).toContain("自作フレーズ"); // 名前は不変
    expect(screen.queryByLabelText("import-genre-tag-0")).toBeNull(); // ドット/ラベル無し
    expect(card.querySelector(".pi-genre-dot")).toBeNull();
  });

  it("未知 genre＝ドット無し（fallback 色にしない）", async () => {
    open([neta({ tags: ["genre:zzz-unknown"] })]);
    await screen.findByLabelText("import-card-0");
    expect(screen.queryByLabelText("import-genre-tag-0")).toBeNull();
  });
});

describe("Task1h (d) 既存の名・scene・MiniRoll は不変（純追加）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genre＋scene＝MiniRoll・名前・場面タグは従来どおり＋ジャンルが加わるだけ", async () => {
    open([neta({ title: "verse comp", tags: ["genre:ballad", "scene:verse"] })], true);
    const card = await screen.findByLabelText("import-card-0");
    expect(card.querySelector('[data-testid="mini-roll"]')).toBeTruthy(); // MiniRoll 不変
    expect(card.textContent).toContain("verse comp"); // 名前 不変
    expect(card.textContent).toContain("verse"); // scene タグ 不変
    expect(card.textContent).toContain("バラード"); // 純追加＝ジャンル
    expect((screen.getByLabelText("import-genre-tag-0").querySelector(".pi-genre-dot") as HTMLElement).style.background).toBe("var(--genre-violet)");
  });
});
