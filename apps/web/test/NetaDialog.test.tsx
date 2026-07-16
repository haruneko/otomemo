import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, deleteNeta, getRelations, detectKeyFromChords, playNotes, phStart, phStop, getPlacements, vary, getComposition, placeChild, removeChild } =
  vi.hoisted(() => ({
    updateNeta: vi.fn().mockResolvedValue({}),
    deleteNeta: vi.fn().mockResolvedValue({ deleted: true }),
    getRelations: vi.fn().mockResolvedValue([]),
    detectKeyFromChords: vi.fn(),
    playNotes: vi.fn(),
    phStart: vi.fn(),
    phStop: vi.fn(),
    // CoW（分家の安全弁・S2）
    getPlacements: vi.fn().mockResolvedValue({ parents: [], placementCount: 0 }),
    vary: vi.fn(),
    getComposition: vi.fn(),
    placeChild: vi.fn().mockResolvedValue({ ok: true }),
    removeChild: vi.fn().mockResolvedValue({ ok: true }),
  }));
vi.mock("../src/api", () => ({ api: { updateNeta, deleteNeta, getRelations, detectKeyFromChords, getPlacements, vary, getComposition, placeChild, removeChild } }));
// Tone を読み込まないよう usePlayhead と playNotes だけ差し替え（他の music エクスポートは実物）
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({
    lineRef: { current: null },
    timeRef: { current: null },
    start: phStart,
    stop: phStop,
  }),
}));
vi.mock("../src/music", async (orig) => ({
  ...(await orig<typeof import("../src/music")>()),
  playNotes,
}));

import { NetaDialog } from "../src/components/NetaDialog";

const neta: Neta = {
  id: "x",
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
  tags: ["サビ"],
  created: "",
  updated: "",
};

describe("NetaDialog", () => {
  beforeEach(() => {
    localStorage.clear(); // メタ折りたたみ状態が test 間に残らないよう
    // CoW/自動保存の呼び出し履歴を test 間で持ち越さない（not.toHaveBeenCalled 系の誤発火防止）。
    updateNeta.mockClear();
    updateNeta.mockResolvedValue({});
    getPlacements.mockClear();
    getPlacements.mockResolvedValue({ parents: [], placementCount: 0 });
    vary.mockClear();
    getComposition.mockClear();
    placeChild.mockClear();
    removeChild.mockClear();
  });

  it("編集すると自動保存される（明示「保存」不要・押さずに残る）", async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(<NetaDialog neta={neta} onClose={onClose} onChanged={onChanged} />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "朝を待つ");
    // 何も押さずデバウンス(600ms)で PATCH が飛ぶ＝メモの当たり前（design 自動保存）
    await waitFor(() => expect(updateNeta).toHaveBeenCalled(), { timeout: 1500 });
    expect(updateNeta.mock.calls.at(-1)![1].text).toBe("朝を待つ");
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // 自動保存は閉じない（保存＝閉じるの2役を解体）
  });

  it("← 戻る は未保存ぶんをフラッシュしてから閉じる", async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    render(<NetaDialog neta={neta} onClose={onClose} onChanged={onChanged} />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "宵闇");
    await userEvent.click(screen.getByLabelText("close")); // ← 戻る
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateNeta).toHaveBeenCalled();
    expect(updateNeta.mock.calls.at(-1)![1].text).toBe("宵闇");
  });

  // userEvent 連打が多くフルスイート並列時に既定5sを超えることがある（2026-07-15夜間監査で3連続タイムアウト・
  // 単体では5.3sで緑）＝ロジックでなく負荷のフレークなので、このテストだけ期限を延ばす。
  it("shows a piano roll for melody and saves notes", { timeout: 20_000 }, async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0"));
    await userEvent.click(screen.getByLabelText("toggle-meta")); // メタは既定で畳む→開く
    await userEvent.selectOptions(screen.getByLabelText("key"), "9");
    await userEvent.selectOptions(screen.getByLabelText("mode"), "minor"); // 長短を選べる（調号）
    const tempoInput = screen.getByLabelText("tempo");
    await userEvent.clear(tempoInput);
    await userEvent.type(tempoInput, "140");
    // 拍子は単体メロ編集でも変えられる（旧=container限定の非対称を解消・監査 MB-05）。
    await userEvent.selectOptions(screen.getByLabelText("meter"), "6/8");
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }], program: 0 }); // #47
    expect(patch.key).toBe(9);
    expect(patch.mode).toBe("minor"); // A短として保存（メロ配置の相対移調に効く）
    expect(patch.tempo).toBe(140);
    expect(patch.meter).toBe("6/8"); // 単体メロでも拍子を保存
  });

  it("transport: play→pause→rewind drives playhead (#57/#58/#59)", async () => {
    const pause = vi.fn();
    const stop = vi.fn();
    playNotes.mockResolvedValue({ stop, pause, resume: vi.fn() });
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0")); // ノートを1つ置く

    const pp = screen.getByLabelText("play-pause");
    await userEvent.click(pp); // stopped → playing
    await waitFor(() => expect(playNotes).toHaveBeenCalled());
    expect(phStart).toHaveBeenCalled();
    await waitFor(() => expect(pp).toHaveAttribute("aria-pressed", "true"));

    await userEvent.click(pp); // playing → paused（位置保持）
    expect(pause).toHaveBeenCalled();
    expect(pp).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByLabelText("rewind")); // 頭出し→stopped
    expect(stop).toHaveBeenCalled();
    expect(phStop).toHaveBeenCalled();
  });

  it("transport: loop toggle restarts playback while playing (#59)", async () => {
    playNotes.mockClear(); // 前テストの呼び出し回数をリセット
    playNotes.mockResolvedValue({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() });
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("cell-60-0"));

    await userEvent.click(screen.getByLabelText("play-pause"));
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(1));
    const loop = screen.getByLabelText("loop");
    await userEvent.click(loop); // 再生中のループON→鳴らし直し
    await waitFor(() => expect(loop).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(playNotes).toHaveBeenCalledTimes(2));
    // 2回目はループ指定で呼ばれる
    expect(playNotes.mock.calls[1]![2].loop).toEqual({ startBeat: 0, endBeat: 1 });
  });

  it("edits a chord progression and saves content.chords", async () => {
    const cp: Neta = { ...neta, kind: "chord_progression", text: null, content: null };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    // 空＝初手ガイド（旧「＋コード」フットは空のとき非表示・二重解消）。「最初のコードを置く」で1コード追加。
    await userEvent.click(screen.getByLabelText("place-first-chord"));
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ chords: [{ root: 0, quality: "", start: 0, dur: 4 }] }); // CP1: 進行は抽象＝program持たない
  });

  it("#9 調を推定：コードから key+mode を設定し、再クリックで候補を切替", async () => {
    detectKeyFromChords.mockResolvedValue({
      candidates: [
        { key: 6, mode: "minor", score: 1 }, // F#m
        { key: 9, mode: "major", score: 0.8 }, // A
      ],
    });
    const cp: Neta = {
      ...neta,
      kind: "chord_progression",
      text: null,
      content: { chords: [{ root: 6, quality: "m", start: 0, dur: 4 }] },
    };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta")); // メタは既定で畳む→開く
    // 1回目：第1候補 F#m を設定
    await userEvent.click(screen.getByLabelText("detect-key"));
    await waitFor(() => expect((screen.getByLabelText("key") as HTMLSelectElement).value).toBe("6"));
    expect((screen.getByLabelText("mode") as HTMLSelectElement).value).toBe("minor");
    // 2回目：次候補 A(長調) へ切替
    await userEvent.click(screen.getByLabelText("detect-key"));
    await waitFor(() => expect((screen.getByLabelText("key") as HTMLSelectElement).value).toBe("9"));
    expect((screen.getByLabelText("mode") as HTMLSelectElement).value).toBe("major");
    // 保存パッチに反映
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    expect(updateNeta.mock.calls.at(-1)![1].key).toBe(9);
    expect(updateNeta.mock.calls.at(-1)![1].mode).toBe("major");
  });

  it("edits a rhythm and saves content.rhythm", async () => {
    const r: Neta = { ...neta, kind: "rhythm", text: null, content: null };
    render(<NetaDialog neta={r} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("hit-Kick-0"));
    await userEvent.click(screen.getByLabelText("save-status")); // 状態ピル＝押すと即フラッシュ
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.rhythm.lanes[0]).toEqual({ name: "Kick", midi: 36, hits: [0] });
  });

  it("shows related neta (連関)", async () => {
    getRelations.mockResolvedValueOnce([
      { type: "result", neta: { ...neta, id: "m1", kind: "melody", title: "メロ案", text: null } },
    ]);
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText(/メロディ: メロ案/)).toBeInTheDocument(); // 種別は日本語ラベル
  });

  it("remounts with fresh state when the keyed neta changes (no stale swap)", () => {
    const a: Neta = { ...neta, id: "a", kind: "lyric", title: "AAA", text: null };
    const b: Neta = { ...neta, id: "b", kind: "lyric", title: "BBB", text: null };
    const { rerender } = render(<NetaDialog key={a.id} neta={a} onClose={vi.fn()} />);
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("AAA");
    rerender(<NetaDialog key={b.id} neta={b} onClose={vi.fn()} />);
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("BBB");
  });

  // ── CoW（分家の安全弁・S2）：共有子の初回編集で確認モーダル ──
  it("親から潜った共有子(placementCount>=2)を編集すると確認モーダルが出る", async () => {
    getPlacements.mockResolvedValueOnce({ parents: [{ parentId: "sec1", positions: [0] }], placementCount: 2 });
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} parentId="sec1" />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "改変");
    // 初回編集の保存時に確認が挟まる＝この間は原本へ書かない
    expect(await screen.findByLabelText("cow-prompt", undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(updateNeta).not.toHaveBeenCalled();
  });

  it("「全部に効かす」＝原本へそのまま保存（共有は維持）", async () => {
    getPlacements.mockResolvedValueOnce({ parents: [{ parentId: "sec1", positions: [0] }], placementCount: 2 });
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} parentId="sec1" />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "改変");
    await userEvent.click(await screen.findByLabelText("cow-all"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("x", expect.objectContaining({ text: "改変" }), undefined));
    expect(vary).not.toHaveBeenCalled();
  });

  it("「この曲だけ変える（分家）」＝子を vary し現在の親の辺だけ差し替え・編集を分家へ・onForked", async () => {
    getPlacements.mockResolvedValueOnce({ parents: [{ parentId: "sec1", positions: [0] }], placementCount: 2 });
    vary.mockResolvedValueOnce({ ...neta, id: "x2" });
    getComposition.mockResolvedValueOnce({ neta: { id: "sec1" }, children: [{ position: 0, ord: 0, node: { neta: { ...neta, id: "x" }, children: [] } }] });
    updateNeta.mockResolvedValue({ ...neta, id: "x2", text: "改変" });
    const onForked = vi.fn();
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} parentId="sec1" onForked={onForked} />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "改変");
    await userEvent.click(await screen.findByLabelText("cow-branch"));
    await waitFor(() => expect(vary).toHaveBeenCalledWith("x")); // 子を分家
    expect(removeChild).toHaveBeenCalledWith("sec1", "x", 0); // 現在の親の辺を外し
    expect(placeChild).toHaveBeenCalledWith("sec1", "x2", 0, 0); // 分家を同 position/ord で置く
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("x2", expect.objectContaining({ text: "改変" })));
    await waitFor(() => expect(onForked).toHaveBeenCalledWith(expect.objectContaining({ id: "x2" })));
  });

  // Fix A（エイリアシング安全弁の穴）：「やめる」を選んだ編集が、←戻る や unmount の keepalive フラッシュで
  // 原本に書かれてはならない。2回明示拒否した編集が原本に載る事故（design「安全弁の無い分家モデルは出荷しない」）の再現。
  it("Fix A: 「やめる」後は ←戻る で閉じず・unmount の keepalive フラッシュも原本に書かない", async () => {
    getPlacements.mockResolvedValue({ parents: [{ parentId: "sec1", positions: [0] }], placementCount: 2 });
    const onClose = vi.fn();
    const { unmount } = render(<NetaDialog neta={neta} onClose={onClose} onChanged={vi.fn()} parentId="sec1" />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "書かないで");
    // デバウンス600ms→初回フラッシュで確認→「やめる」
    await userEvent.click(await screen.findByLabelText("cow-cancel", undefined, { timeout: 2000 }));
    // ←戻る＝close フラッシュ→再確認→もう一度「やめる」
    await userEvent.click(screen.getByLabelText("close"));
    await userEvent.click(await screen.findByLabelText("cow-cancel", undefined, { timeout: 2000 }));
    await waitFor(() => expect(screen.queryByLabelText("cow-prompt")).toBeNull());
    expect(onClose).not.toHaveBeenCalled(); // やめる＝閉じない（エディタに留まる＝「やめる」の意味を保つ）
    unmount(); // 別ネタ切替相当＝unmount エフェクトの keepalive フラッシュが走る
    await new Promise((r) => setTimeout(r, 100)); // 非同期フラッシュの完了余地
    expect(updateNeta).not.toHaveBeenCalled(); // 原本に一度も書かれない（旧実装＝ここで書いていた）
  });

  // Fix B: 分家に適用する patch が title を常に含み、vary の付けた「元title′」が原値で潰れていた。
  it("Fix B: title を触っていなければ分家の「元title′」を潰さない", async () => {
    const titled: Neta = { ...neta, title: "サビ" };
    getPlacements.mockResolvedValue({ parents: [{ parentId: "sec1", positions: [0] }], placementCount: 2 });
    vary.mockResolvedValueOnce({ ...titled, id: "x2", title: "サビ′" });
    getComposition.mockResolvedValueOnce({ neta: { id: "sec1" }, children: [{ position: 0, ord: 0, node: { neta: { ...titled }, children: [] } }] });
    render(<NetaDialog neta={titled} onClose={vi.fn()} onChanged={vi.fn()} parentId="sec1" />);
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "改変");
    await userEvent.click(await screen.findByLabelText("cow-branch", undefined, { timeout: 2000 }));
    // title はユーザー未変更＝branch の「サビ′」を維持（原値「サビ」で潰さない）
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("x2", expect.objectContaining({ title: "サビ′", text: "改変" })));
  });

  it("Fix B: ユーザーがこのセッションで title を変えていたらユーザー値を尊重", async () => {
    const titled: Neta = { ...neta, title: "サビ" };
    getPlacements.mockResolvedValue({ parents: [{ parentId: "sec1", positions: [0] }], placementCount: 2 });
    vary.mockResolvedValueOnce({ ...titled, id: "x2", title: "サビ′" });
    getComposition.mockResolvedValueOnce({ neta: { id: "sec1" }, children: [{ position: 0, ord: 0, node: { neta: { ...titled }, children: [] } }] });
    render(<NetaDialog neta={titled} onClose={vi.fn()} onChanged={vi.fn()} parentId="sec1" />);
    const ti = screen.getByLabelText("title");
    await userEvent.clear(ti);
    await userEvent.type(ti, "俺のサビ");
    await userEvent.click(await screen.findByLabelText("cow-branch", undefined, { timeout: 2000 }));
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("x2", expect.objectContaining({ title: "俺のサビ" })));
  });

  it("トップから開いた（parentId 無し）＝ガード無し＝共有でも従来どおり原本保存（bit-safe）", async () => {
    getPlacements.mockResolvedValue({ parents: [], placementCount: 5 }); // 共有でも
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />); // parentId 無し
    const ta = screen.getByLabelText("text");
    await userEvent.clear(ta);
    await userEvent.type(ta, "改変");
    await waitFor(() => expect(updateNeta).toHaveBeenCalledWith("x", expect.objectContaining({ text: "改変" }), undefined));
    expect(screen.queryByLabelText("cow-prompt")).toBeNull(); // 確認は出ない
    expect(getPlacements).not.toHaveBeenCalled(); // そもそも共有判定もしない
  });

  it("deletes after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChanged = vi.fn();
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(deleteNeta).toHaveBeenCalledWith("x"));
    expect(onChanged).toHaveBeenCalled();
  });
});
