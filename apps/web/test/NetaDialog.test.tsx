import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, deleteNeta, getRelations, detectKeyFromChords, playNotes, phStart, phStop, getPlacements, vary, getComposition, placeChild, removeChild, singVoices } =
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
    // 仮歌の声の列挙（2026-07-17）＝起動時に一度取得。engine 非依存にモック。
    singVoices: vi.fn().mockResolvedValue([
      { id: 3009, character: "波音リツ", style: "ノーマル" },
      { id: 3003, character: "ずんだもん", style: "ノーマル" },
    ]),
  }));
vi.mock("../src/api", () => ({ api: { updateNeta, deleteNeta, getRelations, detectKeyFromChords, getPlacements, vary, getComposition, placeChild, removeChild, singVoices } }));
// Tone を読み込まないよう usePlayhead と playNotes だけ差し替え（他の music エクスポートは実物）
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({
    lineRef: { current: null },
    timeRef: { current: null },
    start: phStart,
    stop: phStop,
  }),
}));
// #27：再生は駆動層 playback.ts→audio.playNotes 経由。音源エンジン(playNotes)だけ差し替え（music/playback は実物）。
vi.mock("../src/audio", async (orig) => ({
  ...(await orig<typeof import("../src/audio")>()),
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
    expect(screen.queryByLabelText("cow-prompt")).toBeNull(); // 3択ガードは出ない（parentId 無し＝ガード無効の維持）
    // S9：共有バッジは parentId 無しでも出る（トップ開きのガード欠如を補う「気づき」＝design 決定⑤）。
    expect(await screen.findByText("5箇所で使用中")).toBeInTheDocument();
  });

  // ── 仮歌の声（VOICEVOX 声色）選択・案B二段（2026-07-17） ──
  it("案B：音色で『仮歌（歌声）』を選んだ時だけ『声』ドロップダウンが出る（楽器のままなら出ない）", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta")); // メタを開く
    // 楽器（既定）＝声ドロップダウンは出ない
    expect(screen.queryByLabelText("voice")).toBeNull();
    // 音色で「仮歌（歌声）」を選ぶ→声ドロップダウンが現れる
    await userEvent.selectOptions(screen.getByLabelText("program"), "sing");
    expect(await screen.findByLabelText("voice")).toBeInTheDocument();
    // 楽器に戻す→声ドロップダウンは消える
    await userEvent.selectOptions(screen.getByLabelText("program"), "0");
    expect(screen.queryByLabelText("voice")).toBeNull();
  });

  it("声を選ぶと content.sing.speaker に保存／未選択（既定）は speaker キー無し（bit一致）", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    // 歌声を選ぶ（声は未選択＝既定）→保存 content は speaker キーを持たない（後方互換 bit一致）
    await userEvent.selectOptions(screen.getByLabelText("program"), "sing");
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    expect(updateNeta.mock.calls.at(-1)![1].content).toEqual({
      notes: [{ pitch: 60, start: 0, dur: 1 }], program: 0, sing: { enabled: true },
    });
    // 声を選ぶ→content.sing.speaker が載る
    await userEvent.selectOptions(screen.getByLabelText("voice"), "3003");
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta.mock.calls.at(-1)![1].content.sing.speaker).toBe(3003));
    expect(updateNeta.mock.calls.at(-1)![1].content.sing).toEqual({ enabled: true, speaker: 3003 });
  });

  it("既存 content.sing.speaker はエディタ初期値に反映される", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }], sing: { enabled: true, speaker: 3065 } } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    const voice = await screen.findByLabelText("voice");
    expect((voice as HTMLSelectElement).value).toBe("3065");
  });

  // ── C-6「feel の家」（修理#3 決定①）：単体ネタで跳ね/人間味を保持・編集・undo する ──
  it("feel を持つメロを編集保存しても content.feel が残る（savePatch 再構成漏れバグの根治＝意図的変更）", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }], feel: { swing: 0.5, humanize: 0.25, seed: 1 } } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    await userEvent.selectOptions(screen.getByLabelText("key"), "9"); // 何か1つ編集＝自動保存が走る
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.feel).toEqual({ swing: 0.5, humanize: 0.25, seed: 1 }); // 旧実装は再構成で落ちていた
    expect(patch.content.notes).toEqual([{ pitch: 60, start: 0, dur: 1 }]); // 元 notes は保持
  });

  it("feel を持たないメロは保存しても content に feel キーが生えない（byte一致）", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    await userEvent.selectOptions(screen.getByLabelText("key"), "9");
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }], program: 0 }); // feel キー無し
    expect("feel" in patch.content).toBe(false);
  });

  it("ノリ行で跳ね/人間味を両0にすると content.feel が消える（キー削除＝無指定へ復帰）", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }], feel: { swing: 0, humanize: 0.15, seed: 1 } } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    await userEvent.click(screen.getByLabelText("nori-humanize-off")); // 人間味OFF＋跳ね0＝両0→undefined
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content).toEqual({ notes: [{ pitch: 60, start: 0, dur: 1 }], program: 0 });
  });

  it("ノリ行の変更は undo で戻る（feel が snapshot に載っている）", async () => {
    const melody: Neta = { ...neta, kind: "melody", text: null, content: { notes: [{ pitch: 60, start: 0, dur: 1 }], feel: { swing: 0, humanize: 0.15, seed: 1 } } };
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    await userEvent.click(screen.getByLabelText("nori-humanize-strong")); // humanize 0.15→0.35
    await userEvent.click(screen.getByLabelText("undo")); // 戻す＝feel が元へ
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    expect(updateNeta.mock.calls.at(-1)![1].content.feel).toEqual({ swing: 0, humanize: 0.15, seed: 1 });
  });

  it("ノリ行は melody/bass/counter/riff にだけ出る（chord/rhythm/chord_pattern には出さない）", async () => {
    // toggle-meta の開閉は localStorage 記憶＝連続 render で持ち越す。aria-expanded を見て open を保証する。
    const ensureMetaOpen = async () => {
      const t = screen.getByLabelText("toggle-meta");
      if (t.getAttribute("aria-expanded") !== "true") await userEvent.click(t);
    };
    const melody: Neta = { ...neta, kind: "melody", text: null, content: null };
    const { unmount } = render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await ensureMetaOpen();
    expect(screen.getByLabelText("nori-swing")).toBeInTheDocument(); // melody＝出る
    unmount();
    const rhythmNeta: Neta = { ...neta, kind: "rhythm", text: null, content: null };
    render(<NetaDialog neta={rhythmNeta} onClose={vi.fn()} onChanged={vi.fn()} />);
    await ensureMetaOpen();
    expect(screen.queryByLabelText("nori-swing")).toBeNull(); // rhythm＝出さない
  });

  it("chord_pattern は spread で feel を保持（二重載せしない・ノリ行は出さない）", async () => {
    const cp: Neta = {
      ...neta,
      kind: "chord_pattern",
      text: null,
      content: { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, powerChord: false, arpDir: "up", style: "auto" }, steps: 32, hits: [{ step: 0, dur: 8 }], lh: { mode: "root" }, feel: { swing: 0.3, humanize: 0.15, seed: 5 } },
    };
    render(<NetaDialog neta={cp} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    expect(screen.queryByLabelText("nori-swing")).toBeNull(); // chord_pattern＝ノリ行は出さない
    await userEvent.selectOptions(screen.getByLabelText("program"), "24"); // 音色を変える＝自動保存
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.feel).toEqual({ swing: 0.3, humanize: 0.15, seed: 5 }); // spread で生存
    expect(patch.content.program).toBe(24);
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

// ── S9（共有バッジ・修理#3 決定⑤）：ヘッダに placementCount>=2 の「N箇所で使用中」小バッジ ──
// マウント時 api.getPlacements(neta.id) を1回・.catch(()=>null)＝失敗時非表示。parentId 無しでも出す
// （＝トップ開きの3択ガード欠如を補う「気づき」の緩和策・design 決定⑤）。api 無改変・読み取りのみ。
describe("NetaDialog 共有バッジ（S9）", () => {
  beforeEach(() => {
    getPlacements.mockReset();
  });
  afterEach(() => {
    // 後続 describe（S7 等）へ拒否/未定義モックを持ち越さない（benign な既定へ戻す）。
    getPlacements.mockReset();
    getPlacements.mockResolvedValue({ parents: [], placementCount: 0 });
  });

  it("placementCount>=2 なら「N箇所で使用中」バッジを出す", async () => {
    getPlacements.mockResolvedValue({
      parents: [{ parentId: "s1", positions: [0] }, { parentId: "s2", positions: [0] }],
      placementCount: 2,
    });
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("2箇所で使用中")).toBeInTheDocument();
    expect(getPlacements).toHaveBeenCalledWith("x");
  });

  it("placementCount<=1 ならバッジを出さない", async () => {
    getPlacements.mockResolvedValue({ parents: [{ parentId: "s1", positions: [0] }], placementCount: 1 });
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(getPlacements).toHaveBeenCalledWith("x"));
    expect(screen.queryByText(/箇所で使用中/)).toBeNull();
  });

  it("getPlacements 失敗時はバッジを出さない（.catch→非表示）", async () => {
    getPlacements.mockRejectedValue(new Error("boom"));
    render(<NetaDialog neta={neta} onClose={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(getPlacements).toHaveBeenCalledWith("x"));
    expect(screen.queryByText(/箇所で使用中/)).toBeNull();
  });
});

// ── S7（修理#3 決定②④・ベースの家 本丸）：相対 bass の patternId/patternEdited/feel 透過・（改）・トグル confirm・管弦ゲート ──
describe("NetaDialog S7 ベースの家（相対 bass）", () => {
  beforeEach(() => {
    updateNeta.mockClear();
    updateNeta.mockResolvedValue({});
    // S9：マウント時に共有バッジが getPlacements を1回引く。afterEach の restoreAllMocks が
    // hoisted モックの実装を消す（undefined 返し）ため、毎テスト benign な既定を張り直す。
    getPlacements.mockResolvedValue({ parents: [], placementCount: 0 });
  });
  afterEach(() => vi.restoreAllMocks());

  const relBass = (over: Record<string, unknown> = {}): Neta => ({
    ...neta, kind: "bass", text: null, key: 0, mode: "major", tempo: 120, meter: "4/4",
    content: { mode: "relative", steps: 16, pattern: [{ step: 0, degree: "R", dur: 4 }], ...over },
  });

  it("patternId 持ち相対ネタ：patternId と feel を保存で透過（pattern も保持）", async () => {
    const nb = relBass({ patternId: "RK-8ROOT", feel: { swing: 0.5, humanize: 0.25, seed: 1 } });
    render(<NetaDialog neta={nb} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("toggle-meta"));
    await userEvent.selectOptions(screen.getByLabelText("key"), "9"); // 何か1つ編集＝自動保存
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.patternId).toBe("RK-8ROOT");
    expect(patch.content.feel).toEqual({ swing: 0.5, humanize: 0.25, seed: 1 });
    expect(patch.content.pattern).toEqual([{ step: 0, degree: "R", dur: 4 }]);
    expect("patternEdited" in patch.content).toBe(false); // メタ編集（key）では（改）は付かない
  });

  it("patternId 持ち相対ネタの手編集（セル配置）→ patternEdited:true 付与", async () => {
    const nb = relBass({ patternId: "RK-8ROOT" });
    render(<NetaDialog neta={nb} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("bass-5-4")); // 空セルへ5度＝グリッド手編集
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect(patch.content.patternEdited).toBe(true);
    expect(patch.content.patternId).toBe("RK-8ROOT"); // 来歴は残す
    expect(patch.content.pattern.find((p: { step: number; degree: string }) => p.step === 4 && p.degree === "5")).toBeTruthy();
  });

  it("patternId 無し相対ネタの手編集→ patternEdited は生えない＝現行 byte 一致", async () => {
    render(<NetaDialog neta={relBass()} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("bass-5-4")); // 手編集
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const patch = updateNeta.mock.calls.at(-1)![1];
    expect("patternEdited" in patch.content).toBe(false);
    expect("patternId" in patch.content).toBe(false);
    // キー順＝現行（mode/steps/pattern/program）。新キーが割り込まない＝byte 一致。
    expect(Object.keys(patch.content)).toEqual(["mode", "steps", "pattern", "program"]);
    expect(patch.content.mode).toBe("relative");
    expect(patch.content.program).toBe(33); // bass 既定音色
  });

  it("絶対↔相対トグル：現モードに中身が有れば confirm（中身有→出る）", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false); // やめる＝切替しない
    // 絶対 bass（notes 有り）＝初期 absolute モード。
    const ab: Neta = { ...neta, kind: "bass", text: null, key: 0, meter: "4/4", content: { notes: [{ pitch: 40, start: 0, dur: 1 }] } };
    render(<NetaDialog neta={ab} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "相対" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1); // 中身有＝確認が出る
    // やめた＝相対グリッドに切り替わらない（絶対のまま＝bass-R-0 度数セルが無い）。
    expect(screen.queryByLabelText("bass-R-0")).toBeNull();
  });

  it("絶対↔相対トグル：現モードが空なら confirm を出さず即切替（空→出ない）", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const ab: Neta = { ...neta, kind: "bass", text: null, key: 0, meter: "4/4", content: { notes: [] } };
    render(<NetaDialog neta={ab} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "相対" }));
    expect(confirmSpy).not.toHaveBeenCalled(); // 空＝無言で切替
    expect(await screen.findByLabelText("bass-R-0")).toBeTruthy(); // 相対グリッドへ
  });

  it("管弦(section_inst)では「パターンを選ぶ」帯が消える（ゲート発効）／コード楽器では出る", () => {
    const cpContent = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 0, dur: 4 }] };
    const { unmount } = render(<NetaDialog neta={{ ...neta, kind: "section_inst", text: null, content: cpContent }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByLabelText("pattern-picker")).toBeNull(); // 管弦＝帯なし（型の誤適用を断つ）
    unmount();
    render(<NetaDialog neta={{ ...neta, kind: "chord_pattern", text: null, content: cpContent }} onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByLabelText("pattern-picker")).toBeTruthy(); // コード楽器＝従来どおり帯あり
  });
});
