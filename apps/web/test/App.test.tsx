import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../src/api", () => ({
  KINDS: ["lyric", "melody"],
  api: {
    listNeta: vi.fn().mockResolvedValue([]),
    createNeta: vi.fn().mockResolvedValue(undefined), // 返り値は使わない（setActive されるが編集面は本テスト対象外）
    facets: vi.fn().mockResolvedValue({ kind: [], mood: [], meter: [], key: [], kindCounts: {}, tags: [] }),
    listProjectNames: vi.fn().mockResolvedValue([]),
    getProjectCounts: vi.fn().mockResolvedValue({ all: 0, unassigned: 0, projects: [] }),
    listJobs: vi.fn().mockResolvedValue([]),
  },
}));

import { api } from "../src/api";
import type { Neta } from "../src/api";

import { App } from "../src/App";

// 種別件数(kindCounts)の集計テスト用の最小ネタ。NetaList が読む形だけ満たす。
let seq = 0;
const mk = (kind: string): Neta => ({
  id: `n${seq++}`, kind, title: `${kind}-${seq}`, text: null, content: null,
  key: null, mode: null, tempo: null, meter: null, bars: null, mood: null,
  tags: [], created: "2026-07-14", updated: "2026-07-14",
});
// kind→件数 で items をまとめて作る。
const itemsOf = (spec: Record<string, number>): Neta[] =>
  Object.entries(spec).flatMap(([k, n]) => Array.from({ length: n }, () => mk(k)));

beforeEach(() => {
  // 既定＝空一覧。件数を見るテストは自前で mockResolvedValue する（前テストの残留を防ぐ）。
  (api.listNeta as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([]);
  (api.createNeta as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined);
  // 種別の実在集合・件数は facets 由来（0件ゴースト判定＋バッジの権威）。既定＝空、件数系テストで上書き。
  (api.facets as ReturnType<typeof vi.fn>)
    .mockReset()
    .mockResolvedValue({ kind: [], mood: [], meter: [], key: [], kindCounts: {}, tags: [], projects: [] });
});

describe("App", () => {
  it("renders title and empty state", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Otomemo" })).toBeInTheDocument(); // ヘッダ左のアプリ名ロゴ
    await waitFor(() =>
      expect(screen.getByText("まだネタがありません。")).toBeInTheDocument(),
    );
  });

  it("renders the 2-pane workspace (notebook rail + main pane)", () => {
    render(<App />);
    expect(screen.getByLabelText("notebook")).toBeInTheDocument();
    expect(screen.getByLabelText("mainpane")).toBeInTheDocument();
  });

  it("toggles the notebook rail open/closed", async () => {
    render(<App />);
    const rail = screen.getByLabelText("notebook");
    expect(rail.className).not.toContain("closed");
    await userEvent.click(screen.getByLabelText("toggle-rail"));
    expect(rail.className).toContain("closed");
  });

  it("opens the settings dialog with theme colors", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByRole("dialog", { name: "settings" })).toBeInTheDocument();
    expect(screen.getByText("テーマ（色）")).toBeInTheDocument();
  });

  // トップ再設計 S2：作成タイルはトップから消え「＋作る▾」の棚（ボトムシート）へ。
  // 既定でトップに .create-tiles が無いこと＝壁の撤去を回帰で固定。
  it("hides the create tiles from the top (they live in the ＋作る shelf) — S2", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".create-tiles")).toBeNull(); // トップに作成タイルの壁は無い
    expect(screen.getByLabelText("open-create-shelf")).toBeInTheDocument(); // 代わりに＋作る▾の扉
  });

  // ＋作る→棚が開く→メロtapで createBlank("melody") を呼び棚が閉じる（S2 主動線＝作成2タップ）。
  it("opens the create shelf and creates a melody, then closes — S2", async () => {
    render(<App />);
    expect(screen.queryByRole("dialog", { name: "create-shelf" })).toBeNull();
    await userEvent.click(screen.getByLabelText("open-create-shelf"));
    expect(screen.getByRole("dialog", { name: "create-shelf" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("＋メロ"));
    expect(api.createNeta).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "melody", title: "新しいメロ" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "create-shelf" })).toBeNull());
  });

  // 負債D6 の分割回帰：取込パネルは棚(CreateShelf)の中。棚を開いてトグル→取込各手段が現れる。
  it("toggles the import panel inside the create shelf (ImportPanel 分割の回帰)", async () => {
    render(<App />);
    expect(screen.queryByLabelText("analyze-url")).toBeNull();
    await userEvent.click(screen.getByLabelText("open-create-shelf")); // 棚を開く
    expect(screen.queryByLabelText("analyze-url")).toBeNull(); // 取込は既定畳み
    await userEvent.click(screen.getByLabelText("toggle-import"));
    // 取込の各手段が現れる（MIDI/楽譜/音源URL/歌詞）。
    expect(screen.getByLabelText("analyze-url")).toBeInTheDocument();
    expect(screen.getByText("MIDI取込")).toBeInTheDocument();
    expect(screen.getByText("楽譜取込")).toBeInTheDocument();
    expect(screen.getByText("歌詞取込")).toBeInTheDocument();
    // もう一度押すと畳まれる。
    await userEvent.click(screen.getByLabelText("toggle-import"));
    expect(screen.queryByLabelText("analyze-url")).toBeNull();
  });

  // 絞る▾で引き出しが開き、mood が扉の奥に居る（S2）。実在kindはタイル・非実在kindはゴースト（S3）。
  // 実在判定は facets（DB全体の権威）＝最新100件窓に載らない古い kind(analysis 等)もタップ可能なタイルに
  // なる（0件ゴースト＝非タップに化けない・2026-07-15監査）。riff は items にも facets にも無い＝ゴースト。
  it("opens the filter drawer; facets-existing kinds are tappable tiles, absent kinds are ghosts — S2/S3", async () => {
    (api.listNeta as ReturnType<typeof vi.fn>).mockResolvedValue(itemsOf({ melody: 2 }));
    // analysis は items（最新100件）に無いが facets で実在＝タップ可能タイルになるべき（ゴースト化しない）。
    // 件数(kindCounts)も facets 由来＝DB権威（analysis は窓外でも実数を持つ）。
    (api.facets as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: ["melody", "analysis"], mood: [], meter: [], key: [],
      kindCounts: { melody: 2, analysis: 3 }, tags: [], projects: [],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("kind-filter-melody")).toBeInTheDocument()); // トップ種別行に出た
    await userEvent.click(screen.getByLabelText("open-filter-drawer"));
    const drawer = screen.getByRole("dialog", { name: "filter-drawer" });
    expect(within(drawer).getByLabelText("kind-filter-melody")).toBeInTheDocument(); // items 実在=タイル
    expect(within(drawer).getByLabelText("kind-filter-analysis")).toBeInTheDocument(); // facets 実在=タップ可
    expect(within(drawer).queryByLabelText("kind-zero-analysis")).toBeNull(); // 非タップのゴーストではない
    expect(within(drawer).getByLabelText("kind-zero-riff")).toBeInTheDocument(); // items/facets どちらにも無い=ゴースト
    expect(within(drawer).getByLabelText("mood-filter")).toBeInTheDocument();
  });

  // S3：トップ種別行＝件数降順・上位6・実在(>0)のみ（0件kindはトップに出ない＝露出∝実利用）。
  it("shows top-6 kind mini-tiles by count and hides 0-count kinds — S3", async () => {
    const spec = { chord_progression: 5, melody: 3, counter: 2, bass: 2, rhythm: 1, chord_pattern: 1, lyric: 1 };
    (api.listNeta as ReturnType<typeof vi.fn>).mockResolvedValue(itemsOf(spec));
    // トップ種別行の件数は facets の kindCounts（DB権威）が正典＝実数でモック。
    (api.facets as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: Object.keys(spec), mood: [], meter: [], key: [], kindCounts: spec, tags: [], projects: [],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("kind-filter-chord_progression")).toBeInTheDocument());
    const row = screen.getByRole("group", { name: "kind-filter" }); // トップ種別行（引き出しは閉じている）
    const tiles = within(row).getAllByRole("button");
    expect(tiles).toHaveLength(6); // 上位6のみ（7種入れたが lyric は溢れる）
    expect(within(row).queryByLabelText("kind-filter-lyric")).toBeNull(); // 7位はトップ非表示
    expect(within(row).queryByLabelText("kind-filter-riff")).toBeNull(); // 0件はトップ非表示
    // 件数バッジ（先頭=最多 chord_progression=5）。
    expect(within(within(row).getByLabelText("kind-filter-chord_progression")).getByText("5")).toBeInTheDocument();
  });

  // S4：つづき行＝現スコープ最終更新の1件を一覧の上にピン（tap→開く）。
  it("pins a resume row for the most-recently-updated neta — S4", async () => {
    const older: Neta = { ...mk("melody"), title: "古いメロ", updated: "2026-07-10" };
    const newer: Neta = { ...mk("bass"), title: "きのうのベース", updated: "2026-07-13" };
    (api.listNeta as ReturnType<typeof vi.fn>).mockResolvedValue([older, newer]);
    render(<App />);
    const resume = await screen.findByLabelText("resume");
    expect(resume).toHaveTextContent("きのうのベース"); // updated 最大の1件
    expect(resume).not.toHaveTextContent("古いメロ");
  });

  // S5：検索語が種別名に前方一致→「＋『◯◯』を作る」行が出て createBlank を呼ぶ（検索から作成へ地続き）。
  it("suggests creating a kind from the search box (B-lite) — S5", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("search"), "メロ");
    const sug = await screen.findByLabelText("create-suggest");
    expect(sug).toHaveTextContent("「メロディ」を作る");
    await userEvent.click(sug);
    expect(api.createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "melody" }));
  });

  // 監査#4：検索合流は「棚のタイルが作る kind」に一致させる。旧実装は KINDS 順で bare chord(ラベル"コード")に
  // 当たり createBlank("chord") したが、棚の「コード」タイルは chord_progression を作る＝別物。SHELF_KINDS 参照で是正。
  it("search-merge suggests the same kind the create-shelf tile makes (chord→chord_progression) — 監査#4", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("search"), "コード");
    const sug = await screen.findByLabelText("create-suggest");
    expect(sug).toHaveTextContent("「コード進行」を作る");
    await userEvent.click(sug);
    expect(api.createNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "chord_progression" }));
    expect(api.createNeta).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "chord" }));
  });

  // 監査2026-07-15：作る棚/絞る引き出しも「戻る」ガードの対象（開いたら guard を積み、popstate で1レイヤ閉じる）。
  // 従来 anyOpen に入っておらず、SPで棚を開いて戻るとアプリごと抜けるバグがあった。
  it("arms the back guard for the create shelf and closes it on popstate", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(<App />);
    await userEvent.click(screen.getByLabelText("open-create-shelf"));
    expect(push).toHaveBeenCalledWith({ cmOverlay: true }, ""); // guard が積まれる
    window.dispatchEvent(new PopStateEvent("popstate")); // ブラウザ/Androidの戻る
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "create-shelf" })).toBeNull());
    expect(screen.getByLabelText("open-create-shelf")).toBeInTheDocument(); // アプリは生きている
  });

  it("arms the back guard for the filter drawer and closes it on popstate", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(<App />);
    await userEvent.click(screen.getByLabelText("open-filter-drawer"));
    expect(push).toHaveBeenCalledWith({ cmOverlay: true }, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "filter-drawer" })).toBeNull());
    expect(screen.getByLabelText("open-filter-drawer")).toBeInTheDocument();
  });

  // Fable UX監査⑤：チャットFAB は一覧では出るが、ネタを開いている間（active）は隠す＝エディタを覆わない。
  it("hides the chat FAB while a neta is open (editor view) — 監査⑤", async () => {
    // content 付きの resume ネタ＝openTop が getNeta を介さず即 setActive（NetaDialog を開く）。
    const lyric: Neta = { ...mk("lyric"), title: "歌詞ネタ", content: "ラララ", updated: "2026-07-20" };
    (api.listNeta as ReturnType<typeof vi.fn>).mockResolvedValue([lyric]);
    render(<App />);
    // 一覧（active 無し）では FAB が出る。
    expect(await screen.findByLabelText("chat")).toBeInTheDocument();
    // つづき行 tap → ネタを開く（active セット）。
    await userEvent.click(await screen.findByLabelText("resume"));
    // エディタ表示中は FAB が消える。
    await waitFor(() => expect(screen.queryByLabelText("chat")).toBeNull());
  });

  // S3：トップ種別タイルをtap→kindFilter が効いて listNeta が kind 付きで呼ばれる（絞り込み動線1タップ）。
  it("filters by tapping a top kind tile — S3", async () => {
    (api.listNeta as ReturnType<typeof vi.fn>).mockResolvedValue(itemsOf({ melody: 2, bass: 1 }));
    // トップ種別タイルの実在・件数は facets 由来（DB権威）。
    (api.facets as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: ["melody", "bass"], mood: [], meter: [], key: [], kindCounts: { melody: 2, bass: 1 }, tags: [], projects: [],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("kind-filter-melody")).toBeInTheDocument());
    const row = screen.getByRole("group", { name: "kind-filter" });
    await userEvent.click(within(row).getByLabelText("kind-filter-melody"));
    await waitFor(() =>
      expect(api.listNeta).toHaveBeenCalledWith(expect.objectContaining({ kind: "melody" })),
    );
  });
});
