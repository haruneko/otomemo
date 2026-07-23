import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
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

const open = (netas: Neta[]) => {
  api.listNeta.mockResolvedValue(netas);
  render(
    <PatternImportDialog
      kind="chord_pattern"
      fallbackName="コード楽器"
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
    open([neta({ title: "パターンX", tags: ["genre:ballad", "scene:verse"] })]);
    const card = await screen.findByLabelText("import-card-0");
    expect(card.querySelector('[data-testid="mini-roll"]')).toBeTruthy(); // MiniRoll 不変
    expect(card.textContent).toContain("パターンX"); // 名前 不変
    expect(card.textContent).toContain("Aメロ"); // Task1j：場面タグは sceneLabel で日本語化（verse→Aメロ）
    expect(card.textContent).toContain("バラード"); // 純追加＝ジャンル
    expect((screen.getByLabelText("import-genre-tag-0").querySelector(".pi-genre-dot") as HTMLElement).style.background).toBe("var(--genre-violet)");
  });
});

// ── Task1i（design「### Task1i＝読み込みダイアログに Source（プロジェクト軸）絞り」）───────────
// 母集団：ライブラリ物（scope:library）＋自プロジェクト物（scope:project＋prj:みなそこ）＋他プロジェクト物。
const POP: Neta[] = [
  neta({ id: "lib-rock", title: "工場ロック", scope: "library", tags: ["genre:rock", "scene:chorus"] }),
  neta({ id: "lib-ballad", title: "工場バラード", scope: "library", tags: ["genre:ballad"] }),
  neta({ id: "prj-mine", title: "みなそこ用", scope: "project", tags: ["prj:みなそこ", "genre:rock"] }),
  neta({ id: "prj-other", title: "別曲用", scope: "project", tags: ["prj:べつ", "genre:rock"] }),
];
const titlesShown = () =>
  screen.queryAllByText(/工場ロック|工場バラード|みなそこ用|別曲用/).map((el) => el.textContent!.trim());

async function openImport(props: Partial<React.ComponentProps<typeof PatternImportDialog>> = {}) {
  api.listNeta.mockResolvedValue(POP);
  const onPick = vi.fn();
  render(
    <PatternImportDialog
      kind="chord_pattern"
      fallbackName="コード楽器"
      onPreview={vi.fn()}
      onPick={onPick}
      onClose={vi.fn()}
      {...props}
    />,
  );
  await waitFor(() => expect(screen.queryByText("読み込み中…")).toBeNull());
  return { onPick };
}

describe("Task1i Source（プロジェクト軸）絞り", () => {
  beforeEach(() => vi.clearAllMocks());

  // (a) Source select は3値。activeProject 有無で「このプロジェクト」option の出/不出。
  it("(a) Source select＝3値・activeProject 有りで『このプロジェクト』が出る", async () => {
    await openImport({ activeProject: "みなそこ" });
    const sel = screen.getByLabelText("import-source") as HTMLSelectElement;
    const values = within(sel).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["", "library", "project"]);
    expect(screen.getByText("このプロジェクト")).toBeTruthy();
  });

  // (c) activeProject 無し＝『このプロジェクト』option を出さない（フォールバック）。既定は全部。
  it("(c) activeProject 無し＝project option 非表示・既定は母集団まるごと", async () => {
    await openImport({});
    const sel = screen.getByLabelText("import-source") as HTMLSelectElement;
    const values = within(sel).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(["", "library"]);
    expect(screen.queryByText("このプロジェクト")).toBeNull();
    expect(titlesShown().sort()).toEqual(["みなそこ用", "別曲用", "工場バラード", "工場ロック"]);
  });

  // (b) library＝scope:library のみ／project＝scope:project＋prj一致のみ／全部＝両方。
  it("(b) library＝scope:library のみ", async () => {
    await openImport({ activeProject: "みなそこ" });
    fireEvent.change(screen.getByLabelText("import-source"), { target: { value: "library" } });
    expect(titlesShown().sort()).toEqual(["工場バラード", "工場ロック"]);
  });

  it("(b) このプロジェクト＝scope:project かつ prj 一致のみ（他プロジェクトは出ない）", async () => {
    await openImport({ activeProject: "みなそこ" });
    fireEvent.change(screen.getByLabelText("import-source"), { target: { value: "project" } });
    expect(titlesShown()).toEqual(["みなそこ用"]);
  });

  it("(b) 全部（既定 ''）＝library と project の両方", async () => {
    await openImport({ activeProject: "みなそこ" });
    expect(titlesShown().sort()).toEqual(["みなそこ用", "別曲用", "工場バラード", "工場ロック"]);
  });

  // (d) genre/scene と AND。
  it("(d) Source は genre 絞りと AND（library ∧ rock）", async () => {
    await openImport({ activeProject: "みなそこ" });
    fireEvent.change(screen.getByLabelText("import-source"), { target: { value: "library" } });
    fireEvent.change(screen.getByLabelText("import-genre"), { target: { value: "rock" } });
    expect(titlesShown()).toEqual(["工場ロック"]);
  });

  // 短縮ラベル（案C）：既定 option は「ジャンル」「場面」「ソース」（「：すべて」を落とす）。
  it("(案C) 既定ラベルが短縮されている（ソース/ジャンル/場面）", async () => {
    await openImport({ activeProject: "みなそこ" });
    expect((within(screen.getByLabelText("import-source")).getAllByRole("option")[0] as HTMLOptionElement).textContent).toBe("ソース");
    expect((within(screen.getByLabelText("import-genre")).getAllByRole("option")[0] as HTMLOptionElement).textContent).toBe("ジャンル");
    expect((within(screen.getByLabelText("import-scene")).getAllByRole("option")[0] as HTMLOptionElement).textContent).toBe("場面");
  });

  // (e) onPick は選んだ neta をそのまま返す（apply/試聴 経路 bit 一致・Source は候補の絞りだけ）。
  it("(e) onPick は選んだ neta を無改変で返す", async () => {
    const { onPick } = await openImport({ activeProject: "みなそこ" });
    fireEvent.change(screen.getByLabelText("import-source"), { target: { value: "project" } });
    fireEvent.click(screen.getByLabelText("import-pick-0"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect((onPick.mock.calls[0]![0] as Neta).id).toBe("prj-mine");
  });
});

// ── Task1j（design「### Task1j」）＝絞りの日本語化＋データ駆動 scene の TDD ─────────────────
describe("Task1j (c) genre/scene option が日本語ラベル（genreLabel/sceneLabel）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genre option＝英語 value・日本語ラベル（rock→ロック／ballad→バラード）", async () => {
    await openImport({ activeProject: "みなそこ" });
    const genreOpts = within(screen.getByLabelText("import-genre")).getAllByRole("option") as HTMLOptionElement[];
    // value は英語タグ値のまま（絞りロジック不変）・表示は日本語。
    const rock = genreOpts.find((o) => o.value === "rock")!;
    const ballad = genreOpts.find((o) => o.value === "ballad")!;
    expect(rock.textContent).toBe("ロック");
    expect(ballad.textContent).toBe("バラード");
    expect(genreOpts[0]!.textContent).toBe("ジャンル"); // 既定ラベル（案C 短縮）
  });

  it("scene option＝英語 value・日本語ラベル（chorus→サビ）", async () => {
    await openImport({ activeProject: "みなそこ" });
    const sceneOpts = within(screen.getByLabelText("import-scene")).getAllByRole("option") as HTMLOptionElement[];
    const chorus = sceneOpts.find((o) => o.value === "chorus")!;
    expect(chorus.textContent).toBe("サビ");
    expect(sceneOpts[0]!.textContent).toBe("場面");
  });
});

describe("Task1j (b) scene UI は母集団に scene: 有りで自動表示（showScene 撤去＝データ駆動）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("母集団に scene: タグが無ければ scene select を出さない", async () => {
    api.listNeta.mockResolvedValue([neta({ tags: ["genre:rock"] })]); // scene: 無し
    render(<PatternImportDialog kind="chord_pattern" fallbackName="x" onPreview={vi.fn()} onPick={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("読み込み中…")).toBeNull());
    expect(screen.queryByLabelText("import-scene")).toBeNull();
  });

  it("母集団に scene: タグが有れば scene select を出す（kind に依らずデータ駆動）", async () => {
    api.listNeta.mockResolvedValue([neta({ kind: "bass", tags: ["scene:verse"] })]);
    render(<PatternImportDialog kind="bass" fallbackName="x" onPreview={vi.fn()} onPick={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("読み込み中…")).toBeNull());
    expect(screen.getByLabelText("import-scene")).toBeTruthy();
  });
});
