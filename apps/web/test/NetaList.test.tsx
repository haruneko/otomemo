import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const {
  createJob,
  getJob,
  createNeta,
  link,
  placeChild,
  assignProject,
  getComposition,
  genSection,
  deleteNeta,
} = vi.hoisted(() => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
  createNeta: vi.fn(),
  link: vi.fn(),
  placeChild: vi.fn(),
  assignProject: vi.fn(),
  getComposition: vi.fn().mockResolvedValue({ children: [] }), // ④ SectionMini の遅延取得
  genSection: vi.fn(),
  deleteNeta: vi.fn(),
}));
vi.mock("../src/api", () => ({
  api: { createJob, getJob, createNeta, link, placeChild, assignProject, getComposition, genSection, deleteNeta },
}));

// F1 再生ローディング（設計2026-07-17）＋#27 再生一本化：駆動層 startPlayback を「解決を握れる」フェイクへ差し替え、
// 押下→準備中の窓（starting）をテストから制御する。notesForContent/compositeNotes は非空固定＝空 notes 早期 return を避ける
// （buildPlayback は実物＝それらから plan を組む）。playNotesMock は startPlayback の呼び出しを受ける（名前は踏襲）。
const { playNotesMock } = vi.hoisted(() => ({ playNotesMock: vi.fn() }));
vi.mock("../src/music", async (orig) => {
  const actual = await orig<typeof import("../src/music")>();
  return {
    ...actual,
    notesForContent: () => [{ pitch: 60, start: 0, dur: 1 }],
    compositeNotes: () => [{ pitch: 60, start: 0, dur: 1 }],
  };
});
const IDLE_VOCAL = { busy: false, progress: null, msg: null }; // 安定参照（useSyncExternalStore がループしない）
vi.mock("../src/playback", () => ({
  startPlayback: (...args: unknown[]) => playNotesMock(...args),
  subscribeVocalBusy: () => () => {}, // PrepStatus 購読口（本テストでは busy を出さない）
  vocalBusyState: () => IDLE_VOCAL,
}));

import { NetaList, NetaCard } from "../src/components/NetaList";

const mk = (over: Partial<Neta>): Neta => ({
  id: "abcdef12-0000",
  kind: "lyric",
  title: null,
  text: "夜",
  content: null,
  key: null,
  mode: null,
  tempo: null,
  meter: null,
  bars: null,
  mood: null,
  tags: [],
  created: "",
  updated: "",
  ...over,
});

describe("NetaList", () => {
  it("renders a card per neta with tags", () => {
    // トップ再設計 S4 で既定はリスト密度（タグ非表示）になったので、タグ表示はカード密度で確認する。
    localStorage.setItem("cm-list-density", "card");
    render(
      <NetaList
        items={[
          mk({ id: "1", text: "夜", tags: ["サビ"] }),
          mk({ id: "2", kind: "melody", title: "m" }),
        ]}
      />,
    );
    expect(screen.getAllByLabelText("neta-card")).toHaveLength(2);
    expect(screen.getByText("#サビ")).toBeInTheDocument();
  });

  it("hides prj: tags from the semantic tag chips", () => {
    render(<NetaCard neta={mk({ id: "p", text: "夜", tags: ["サビ", "prj:みなそこ"] })} />);
    expect(screen.getByText("#サビ")).toBeInTheDocument();
    expect(screen.queryByText("#prj:みなそこ")).not.toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(<NetaList items={[]} />);
    expect(screen.getByText("まだネタがありません。")).toBeInTheDocument();
  });

  it("opens the neta in the main pane when the card body is clicked", async () => {
    const onOpen = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} onOpen={onOpen} />);
    await userEvent.click(screen.getByText("夜を駆ける"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("LV2: 副アクションは既定で畳まれ「…」で開く", async () => {
    render(<NetaCard neta={mk({ id: "x", kind: "melody", title: "m" })} />);
    // 既定＝主要2つ(相談＋…)のみ。複製/生成は隠れている。
    expect(screen.queryByRole("button", { name: "複製" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "作例を生成" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("more-x"));
    expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作例を生成" })).toBeInTheDocument();
  });

  // 監査#3：作例を生成は「プロジェクトの音楽系kind(音楽∪コンテナ)」だけに露出。
  // 非音楽kind（歌詞/テーマ/知識/参考）では一式生成が無意味＝…を開いても出さない。
  it("hides 「作例を生成」on non-music kinds — 監査#3", async () => {
    render(<NetaCard neta={mk({ id: "x", kind: "lyric", text: "夜" })} />);
    await userEvent.click(screen.getByLabelText("more-x"));
    expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument(); // …は開いている
    expect(screen.queryByRole("button", { name: "作例を生成" })).not.toBeInTheDocument();
  });

  // 監査#3：ライブラリscopeのカードでも作例を生成は出さない（音楽kindでもプロジェクト外は対象外）。
  it("hides 「作例を生成」on library-scope cards — 監査#3", async () => {
    render(<NetaCard neta={mk({ id: "x", kind: "melody", title: "m" })} scope="library" />);
    await userEvent.click(screen.getByLabelText("more-x"));
    expect(screen.getByRole("button", { name: "＋プロジェクトへ" })).toBeInTheDocument(); // library の…は開いている
    expect(screen.queryByRole("button", { name: "作例を生成" })).not.toBeInTheDocument();
  });

  it("P3: 「…」→「プロジェクトへ」ピッカーで既存プロジェクトに入れる(member=true)", async () => {
    assignProject.mockResolvedValue({});
    render(<NetaCard neta={mk({ id: "x", kind: "melody", title: "m" })} projects={["みなそこ"]} />);
    await userEvent.click(screen.getByLabelText("more-x"));
    await userEvent.click(screen.getByLabelText("assign-x")); // プロジェクトへ ▾
    await userEvent.click(screen.getByRole("button", { name: "みなそこ" }));
    expect(assignProject).toHaveBeenCalledWith("x", "みなそこ", true);
  });

  it("P3: 在籍しているプロジェクトは✓表示＝押すと出す(member=false)", async () => {
    assignProject.mockResolvedValue({});
    render(
      <NetaCard
        neta={mk({ id: "y", kind: "melody", title: "m", tags: ["prj:みなそこ"] })}
        projects={["みなそこ"]}
      />,
    );
    await userEvent.click(screen.getByLabelText("more-y"));
    await userEvent.click(screen.getByLabelText("assign-y"));
    await userEvent.click(screen.getByRole("button", { name: "✓ みなそこ" }));
    expect(assignProject).toHaveBeenCalledWith("y", "みなそこ", false);
  });

  it("P3: 「＋新しいプロジェクト」で作成しつつ入れる", async () => {
    assignProject.mockResolvedValue({});
    const spy = vi.spyOn(window, "prompt").mockReturnValue("新器");
    render(<NetaCard neta={mk({ id: "z", kind: "melody", title: "m" })} projects={[]} />);
    await userEvent.click(screen.getByLabelText("more-z"));
    await userEvent.click(screen.getByLabelText("assign-z"));
    await userEvent.click(screen.getByLabelText("assign-new-z"));
    expect(assignProject).toHaveBeenCalledWith("z", "新器", true);
    spy.mockRestore();
  });

  it("LV2: 並べ替え=タイトル順で表示順が変わる", async () => {
    localStorage.clear();
    render(
      <NetaList
        items={[
          mk({ id: "1", kind: "melody", title: "ん最後" }),
          mk({ id: "2", kind: "melody", title: "あ最初" }),
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("並べ替え"), "title");
    const cards = screen.getAllByLabelText("neta-card");
    expect(cards[0]).toHaveTextContent("あ最初");
    expect(cards[1]).toHaveTextContent("ん最後");
  });

  it("「作例を生成」＝決定的 /gen/section で一式を作る（worker非依存・監査GN-08の修正）", async () => {
    genSection.mockResolvedValue({ section: { id: "s1" }, composition: { children: [] } });
    const onChanged = vi.fn();
    render(
      <NetaCard
        neta={mk({ id: "x", kind: "melody", title: "夜想", key: 2, meter: "6/8", tempo: 92 })}
        onChanged={onChanged}
      />,
    );
    await userEvent.click(screen.getByLabelText("more-x")); // LV2: 副アクションは「…」の裏
    await userEvent.click(screen.getByRole("button", { name: "作例を生成" }));
    await waitFor(() => expect(genSection).toHaveBeenCalled());
    // ネタの調/拍子/テンポを frame に渡す。title はネタ名から。
    expect(genSection).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({ key: 2, meter: "6/8", tempo: 92 }),
        title: expect.stringContaining("夜想"),
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // 旧 worker ジョブ経路（createJob→poll）は使わない＝ハングしない。
    expect(createJob).not.toHaveBeenCalled();
  });

  it("相談 opens the chat for that neta (relocated from inline panel)", async () => {
    const onChat = vi.fn();
    render(<NetaCard neta={mk({ id: "x", text: "夜を駆ける" })} onChat={onChat} />);
    await userEvent.click(screen.getByRole("button", { name: "相談" }));
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ id: "x" }));
  });

  it("#11 library: 連続する同名を×Nに束ね、タップで展開する", async () => {
    localStorage.clear();
    render(
      <NetaList
        scope="library"
        items={[
          mk({ id: "a", kind: "melody", title: "pop pattern" }),
          mk({ id: "b", kind: "melody", title: "pop pattern" }),
          mk({ id: "c", kind: "melody", title: "pop pattern" }),
          mk({ id: "d", kind: "melody", title: "other" }),
        ]}
      />,
    );
    // 束ね：先頭(a)＋other(d)＝2枚だけ見える。b,c は畳まれている。
    expect(screen.getAllByLabelText("neta-card")).toHaveLength(2);
    expect(screen.getByLabelText("bundle-a")).toHaveTextContent("×3");
    await userEvent.click(screen.getByLabelText("bundle-a"));
    expect(screen.getAllByLabelText("neta-card")).toHaveLength(4);
  });

  it("#11 project: 同名でも束ねない（表示は不変）", () => {
    localStorage.clear();
    render(
      <NetaList
        scope="project"
        items={[
          mk({ id: "a", kind: "melody", title: "pop pattern" }),
          mk({ id: "b", kind: "melody", title: "pop pattern" }),
          mk({ id: "c", kind: "melody", title: "pop pattern" }),
        ]}
      />,
    );
    expect(screen.getAllByLabelText("neta-card")).toHaveLength(3);
    expect(screen.queryByLabelText("bundle-a")).not.toBeInTheDocument();
  });

  it("section card has a composite play button (#73)", () => {
    render(<NetaCard neta={mk({ id: "s1", kind: "section", title: "曲A" })} />);
    expect(screen.getByLabelText("play-s1")).toBeInTheDocument();
  });

  // ゴミ箱（一覧から直接削除）＝カードにゴミ箱ボタンが常時見える。
  it("shows a trash (delete) button on the card", () => {
    render(<NetaCard neta={mk({ id: "d1", text: "消す候補" })} />);
    expect(screen.getByLabelText("delete-d1")).toBeInTheDocument();
  });

  // 確認 OK → 削除 API を呼び、一覧再取得(onChanged)を促す。文言/APIは編集ヘッダの削除と同一を流用。
  it("confirms then deletes via api.deleteNeta and refreshes the list", async () => {
    deleteNeta.mockClear();
    deleteNeta.mockResolvedValue({ deleted: true });
    const onChanged = vi.fn();
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NetaCard neta={mk({ id: "d2", text: "消す" })} onChanged={onChanged} />);
    await userEvent.click(screen.getByLabelText("delete-d2"));
    expect(spy).toHaveBeenCalled();
    expect(deleteNeta).toHaveBeenCalledWith("d2");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    spy.mockRestore();
  });

  // ── F1 再生ローディング表示（設計2026-07-17・漏れ#8 ネタ簡易再生）─────────────────────────
  // (a) 準備中は busy 表示＋再押下 no-op。playNotes を pending にして starting 窓に留める。
  it("F1#8: 準備中は▶が busy 表示になり、再押下は no-op（playNotes は1回だけ）", async () => {
    playNotesMock.mockReset();
    let resolvePlay!: (h: unknown) => void;
    playNotesMock.mockImplementation(() => new Promise((res) => { resolvePlay = res; }));
    render(<NetaCard neta={mk({ id: "p8", kind: "melody", title: "旋律", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } })} />);
    const btn = screen.getByLabelText("play-p8");
    await userEvent.click(btn); // 開始→playNotes pending（starting=true）
    await waitFor(() => expect(btn).toHaveAttribute("aria-busy", "true"));
    expect(playNotesMock).toHaveBeenCalledTimes(1);
    await userEvent.click(btn); // 再押下＝準備中は no-op
    await userEvent.click(btn);
    expect(playNotesMock).toHaveBeenCalledTimes(1); // 増えない＝ガード有効
    resolvePlay({ stop: vi.fn() }); // 後片付け
    await waitFor(() => expect(btn).not.toHaveAttribute("aria-busy"));
  });

  // (b) section の toggle は getComposition の await より前に押下反応（starting/playing）を出す。
  it("F1#8: section の▶は getComposition fetch 待ちの間もすぐ busy 反応する（fetch前フィードバック）", async () => {
    playNotesMock.mockReset();
    playNotesMock.mockResolvedValue({ stop: vi.fn() });
    let resolveComp!: (v: unknown) => void;
    getComposition.mockImplementationOnce(() => new Promise((res) => { resolveComp = res; }));
    // dense＝リスト表示（SectionMini プレビューを出さない）＝getComposition の初回呼び出しは toggle 由来に固定。
    render(<NetaCard dense neta={mk({ id: "s8", kind: "section", title: "曲A" })} />);
    const btn = screen.getByLabelText("play-s8");
    await userEvent.click(btn);
    // getComposition は未解決のまま＝それより前に押下反応（aria-busy）が出ている＝setPlaying(true) が await の前。
    await waitFor(() => expect(btn).toHaveAttribute("aria-busy", "true"));
    expect(getComposition).toHaveBeenCalledWith("s8");
    expect(playNotesMock).not.toHaveBeenCalled(); // まだ fetch 待ち＝発音前
    // buildPlayback は実物＝子から compositeNotes で実 notes を組む（非空にして早期 return を避ける）。
    resolveComp({ children: [{ position: 0, node: { neta: { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, key: 0, mode: "major" } } }] });
    await waitFor(() => expect(playNotesMock).toHaveBeenCalled());
  });

  // 確認キャンセル → 削除 API を呼ばない（消えない）。
  it("does not delete when the confirm is cancelled", async () => {
    deleteNeta.mockClear();
    const onChanged = vi.fn();
    const spy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NetaCard neta={mk({ id: "d3", text: "消さない" })} onChanged={onChanged} />);
    await userEvent.click(screen.getByLabelText("delete-d3"));
    expect(spy).toHaveBeenCalled();
    expect(deleteNeta).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
