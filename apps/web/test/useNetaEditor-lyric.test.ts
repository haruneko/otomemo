// #31 スライス1（design §31-7）：メロの自動保存が句（content.lyric）を落とさないこと。
//
// ⚠ 上位（docs/design.md #31・requirements「歌詞を書く」・architecture 同日追記）は**オーナー未レビュー**。
//    歌詞の置き場も案(い)の**仮置き**＝確定ではない。ただしここで縛るのは「メロ自身の content を素通しする」
//    ことだけなので、置き場がどの案に決まっても変わらない（design §31-0 の検算）。
//
// 背景：savePatch() は kind ごとに content を**キー決め打ちで作り直す**ので、載せ忘れたキーは 600ms 後の
// 自動保存で消える。同じ理由で feel が落ちていた前例が同じファイルにある（C-6）。その直し方に倣い、
// 「未指定ならキーを生やさない＝既存データと bit 一致」まで含めて縛る。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Neta } from "../src/api";

const { updateNeta, getRelations, getPlacements, singVoices } = vi.hoisted(() => ({
  updateNeta: vi.fn().mockResolvedValue({}),
  getRelations: vi.fn().mockResolvedValue([]),
  getPlacements: vi.fn().mockResolvedValue({ parents: [], placementCount: 0 }),
  singVoices: vi.fn().mockResolvedValue([]),
}));
vi.mock("../src/api", () => ({ api: { updateNeta, getRelations, getPlacements, singVoices } }));
// Tone/rAF を読まないよう再生まわりだけ差し替え（NetaDialog.test.tsx と同じ流儀）。
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({ lineRef: { current: null }, timeRef: { current: null }, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("../src/audio", async (orig) => ({
  ...(await orig<typeof import("../src/audio")>()),
  playNotes: vi.fn(),
}));

import { useNetaEditor, lyricOf } from "../src/useNetaEditor";

const base: Neta = {
  id: "m1",
  kind: "melody",
  title: null,
  text: null,
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
};
const melody = (content: unknown): Neta => ({ ...base, content });
const NOTES = [{ pitch: 60, start: 0, dur: 1 }];
const LYRIC = { phrases: [{ id: "p1", start: 0, beats: 16, text: "雨の日は" }] };

/** 音符を1つ動かして自動保存を確定させ、送られた patch を返す。 */
async function editAndFlush(neta: Neta) {
  const { result } = renderHook(() => useNetaEditor(neta, { onClose: vi.fn() }));
  act(() => result.current.setNotes([{ pitch: 62, start: 0, dur: 1 }]));
  await act(async () => {
    await result.current.flush();
  });
  return { patch: updateNeta.mock.calls.at(-1)![1] as { content: Record<string, unknown> }, result };
}

beforeEach(() => {
  updateNeta.mockClear();
});

describe("useNetaEditor：歌詞（句）の自動保存（design §31-7）", () => {
  it("歌詞を書いたメロの音符を動かしても content.lyric が消えない", async () => {
    const { patch } = await editAndFlush(melody({ notes: NOTES, lyric: LYRIC }));
    expect(patch.content.lyric).toEqual(LYRIC); // 旧実装は content 再構成で落としていた
    expect(patch.content.notes).toEqual([{ pitch: 62, start: 0, dur: 1 }]); // 動かした音符は反映
  });

  it("歌詞の無いメロは保存しても content に lyric キーが生えない（既存データと bit 一致）", async () => {
    const { patch } = await editAndFlush(melody({ notes: NOTES }));
    expect(patch.content).toEqual({ notes: [{ pitch: 62, start: 0, dur: 1 }], program: 0 });
    expect("lyric" in patch.content).toBe(false);
  });

  it("feel と歌詞を両方持つメロは両方残る（feel の直し方に倣った＝どちらも落とさない）", async () => {
    const feel = { swing: 0.5, humanize: 0.25, seed: 1 };
    const { patch } = await editAndFlush(melody({ notes: NOTES, feel, lyric: LYRIC }));
    expect(patch.content.feel).toEqual(feel);
    expect(patch.content.lyric).toEqual(LYRIC);
  });

  it("setLyric で書いた句が保存される（歌詞だけを直しても自動保存が走る）", async () => {
    const { result } = renderHook(() => useNetaEditor(melody({ notes: NOTES }), { onClose: vi.fn() }));
    act(() => result.current.setLyric(LYRIC));
    await act(async () => {
      await result.current.flush();
    });
    const patch = updateNeta.mock.calls.at(-1)![1] as { content: { lyric: unknown } };
    expect(patch.content.lyric).toEqual(LYRIC);
  });

  it("句を空にすると lyric キーごと消える（空の層を残さない）", async () => {
    const { result } = renderHook(() => useNetaEditor(melody({ notes: NOTES, lyric: LYRIC }), { onClose: vi.fn() }));
    act(() => result.current.setLyric(undefined));
    await act(async () => {
      await result.current.flush();
    });
    const patch = updateNeta.mock.calls.at(-1)![1] as { content: Record<string, unknown> };
    expect("lyric" in patch.content).toBe(false);
  });

  it("歌詞の無いメロを開いて閉じるだけなら保存を投げない（空振りの差分を作らない）", async () => {
    const { result } = renderHook(() => useNetaEditor(melody({ notes: NOTES }), { onClose: vi.fn() }));
    await act(async () => {
      await result.current.flush();
    });
    expect(updateNeta).not.toHaveBeenCalled();
  });

  it("歌詞を持つメロを開いて閉じるだけでも保存を投げない（開いただけで差分にならない）", async () => {
    const { result } = renderHook(() => useNetaEditor(melody({ notes: NOTES, lyric: LYRIC }), { onClose: vi.fn() }));
    await act(async () => {
      await result.current.flush();
    });
    expect(updateNeta).not.toHaveBeenCalled();
  });
});

describe("lyricOf（content から歌詞の層を読む・feelOf と同型）", () => {
  it("content.lyric をそのまま返す", () => {
    expect(lyricOf({ notes: [], lyric: LYRIC })).toEqual(LYRIC);
  });
  it("無い／null／オブジェクトでない content は undefined", () => {
    expect(lyricOf(null)).toBeUndefined();
    expect(lyricOf({ notes: [] })).toBeUndefined();
    expect(lyricOf("x")).toBeUndefined();
    expect(lyricOf({ lyric: "x" })).toBeUndefined();
  });
});
