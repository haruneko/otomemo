// #31 スライス1：ネタの画面から歌詞（句）まで通っているかの番人（統合の継ぎ目・design §31-7/§31-9）。
//
// ⚠ 上位（docs/research の3本・design #31・requirements・architecture の 2026-07-29 追記）は**オーナー未レビュー**。
//    歌詞の置き場は案(い)の**仮置き**。ここで縛るのは「画面の受け渡しが繋がっていること」だけで、
//    句の中身の決め（範囲・読みの写し方）は PianoRoll-lyric / useNetaEditor-lyric / music-core 側の番人が持つ。
//
// なぜ要るか：句の面は useNetaEditor（state）・PianoRoll（欄と読み）と別々に作られ、
// NetaDialog → KindEditorBody → PianoRoll の受け渡しだけが誰の担当でもなく空いていた。
// ここが外れると、部品の番人は全部緑のまま実機でだけ詞が書けない（＝この test が落ちる）。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, getRelations, getPlacements, singVoices, readings } = vi.hoisted(() => ({
  updateNeta: vi.fn().mockResolvedValue({}),
  getRelations: vi.fn().mockResolvedValue([]),
  getPlacements: vi.fn().mockResolvedValue({ parents: [], placementCount: 0 }),
  singVoices: vi.fn().mockResolvedValue([]),
  // 読み取り（api の /music/reading）＝Python を呼ばずに実機と同じ形を返す。
  // 「雨の日は」＝あ め の ひ わ（5モーラ。表記をそのまま splitMora に渡すと4に化ける）。
  readings: vi.fn().mockResolvedValue([
    {
      words: [{ surface: "雨の日は", read: "アメノヒハ", pron: "アメノヒワ", moraCount: 5 }],
      moras: [
        { kana: "あ", word: 0 }, { kana: "め", word: 0 }, { kana: "の", word: 0 },
        { kana: "ひ", word: 0 }, { kana: "わ", word: 0 },
      ],
      hl: [0, 1, 1, 1, 1],
      breaks: [],
    },
  ]),
}));
vi.mock("../src/api", () => ({ api: { updateNeta, getRelations, getPlacements, singVoices, readings } }));
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({ lineRef: { current: null }, timeRef: { current: null }, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("../src/audio", async (orig) => ({
  ...(await orig<typeof import("../src/audio")>()),
  playNotes: vi.fn(),
}));

import { NetaDialog } from "../src/components/NetaDialog";

const base: Neta = {
  id: "x", kind: "melody", title: null, text: null, content: null,
  key: null, mode: null, tempo: null, meter: null, bars: null, mood: null,
  tags: [], created: "", updated: "",
};
const melody: Neta = {
  ...base,
  content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }], program: 0 },
};

describe("NetaDialog → 歌詞（句）の受け渡し", () => {
  /**
   * 表記の入力欄を開いて返す（歌詞パネル・2026-07-30 の裁定 §31-11 の16）。
   * 常時出ているのは歌詞1行だけで、表記欄はタップで開く奥にある。ここで見たいのは結線（受け渡し）なので開く。
   */
  const openLyric = async (): Promise<HTMLElement> => {
    await userEvent.click(await screen.findByLabelText("lyric-line"));
    return screen.getByLabelText("lyric-text");
  };

  beforeEach(() => {
    localStorage.clear();
    updateNeta.mockClear();
    updateNeta.mockResolvedValue({});
    readings.mockClear();
  });

  it("メロのネタで詞を書く欄が出る（配線されている）", { timeout: 30_000 }, async () => {
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    // 常時は1行＝それ自体が配線の印。開けば表記欄が出る。
    expect(await screen.findByLabelText("lyric-line")).toBeInTheDocument();
    expect(await openLyric()).toBeInTheDocument();
  });

  it("詞を書くと content.lyric に句が保存される（閉じて開き直しても残る形）", { timeout: 30_000 }, async () => {
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.type(await openLyric(), "雨の日は");
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const content = updateNeta.mock.calls.at(-1)![1].content;
    expect(content.lyric.phrases).toHaveLength(1);
    expect(content.lyric.phrases[0].text).toBe("雨の日は");
    expect(content.notes).toHaveLength(2); // 詞を書いても音符は増えも減りもしない
  });

  it("読みは1回まとめて取りに行き、音符のかなが読みどおりになる（音符は増えない）", { timeout: 30_000 }, async () => {
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await userEvent.type(await openLyric(), "雨の日は");
    // 読み取りの契機は「読みを反映」だけ（2026-07-30 改訂・design §31-3(d)）＝押すまで機械は動かない。
    await userEvent.click(screen.getByLabelText("lyric-apply-reading"));
    await waitFor(() => expect(readings).toHaveBeenCalledTimes(1), { timeout: 15_000 });
    expect(readings.mock.calls[0]![0]).toEqual(["雨の日は"]);
    await waitFor(() => expect(screen.getByLabelText("lyric-reading-state")).toHaveTextContent("読み：あめのひわ（5音）"), { timeout: 15_000 });
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const content = updateNeta.mock.calls.at(-1)![1].content;
    expect(content.notes).toHaveLength(2); // モーラが5でも音符は2のまま（割るのは「流し込む」だけ）
    expect(content.notes.map((n: { syllable?: string }) => n.syllable)).toEqual(["あ", "め"]);
    expect(content.lyric.phrases[0].reading.forText).toBe("雨の日は");
  });

  it("歌詞を書かないメロは content に lyric キーが生えない（既存の保存と bit 一致）", { timeout: 30_000 }, async () => {
    render(<NetaDialog neta={melody} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByLabelText("lyric-line");
    await userEvent.type(screen.getByLabelText("title"), "あ"); // 歌詞以外を触って保存させる（触らないと保存自体を投げない）
    await userEvent.click(screen.getByLabelText("save-status"));
    await waitFor(() => expect(updateNeta).toHaveBeenCalled());
    const content = updateNeta.mock.calls.at(-1)![1].content;
    expect(content.lyric).toBeUndefined();
    expect(readings).not.toHaveBeenCalled(); // 表記が無ければ読みも頼まない
  });

  it("メロ以外（歌詞ネタ）には詞を書く欄が出ない", { timeout: 30_000 }, async () => {
    const lyricNeta: Neta = { ...base, kind: "lyric", text: "夜", content: null };
    render(<NetaDialog neta={lyricNeta} onClose={vi.fn()} onChanged={vi.fn()} />);
    await screen.findByLabelText("text");
    expect(screen.queryByLabelText("lyric-text")).toBeNull();
  });
});
