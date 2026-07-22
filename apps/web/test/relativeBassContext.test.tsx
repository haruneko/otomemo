import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

// 大手術スライスS6（design 修理#3 決定⑥ R1・正典 2026-07-22-surgery-plan.md §S6）：
// トレイ/サムネの相対 bass 文脈。相対 bass 候補/ネタを「セクション進行（or preview_chords）」で
// 試聴・描画する＝進行無視の絵/音を先回りで塞ぐ。既定 bit 一致（絶対 bass・他 kind の経路は不変）。

// --- api モック（SectionEditor と useMelodyGen が共有する "../src/api"）---
const apiMock = vi.hoisted(() => ({
  getComposition: vi.fn(),
  listNeta: vi.fn(),
  placeChild: vi.fn(),
  removeChild: vi.fn(),
  createNeta: vi.fn(),
  copyNeta: vi.fn(),
  recommend: vi.fn(),
  getSong: vi.fn(),
  updateSong: vi.fn(),
  updateNeta: vi.fn(),
  music: vi.fn(),
  link: vi.fn(),
  getPlacements: vi.fn(),
  getRelations: vi.fn(),
  vary: vi.fn(),
}));
vi.mock("../src/api", () => ({ api: apiMock }));

// 再生は鳴らさない（auditionCandidate は startPlayback を呼ぶ＝jsdom で音を出さない）。
// 部分モック＝startPlayback だけ差し替え（subscribeVocalBusy 等 useVocal 依存は本物を残す）。
const startPlayback = vi.hoisted(() => vi.fn(async () => ({ stop: vi.fn() })));
vi.mock("../src/playback", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, startPlayback };
});

// music は部分モック＝notesForContent だけ本物を包んで「渡された解決文脈(ctx)」を記録する。
// 他の export（resolveRelativeBass・buildPlayback・compositeNotes 等）は本物のまま＝解決は実挙動。
vi.mock("../src/music", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, notesForContent: vi.fn(actual.notesForContent as (...a: unknown[]) => unknown) };
});

import { MiniRoll } from "../src/components/MiniRoll";
import { SectionEditor } from "../src/components/SectionEditor";
import { useMelodyGen, type Cand, type MelodyGenCtx } from "../src/useMelodyGen";
import { notesForContent } from "../src/music";
import type { Lane } from "../src/components/sectionLanes";

const nfc = notesForContent as unknown as ReturnType<typeof vi.fn>;

// 相対 bass content（R 一発＝ルートを弾く）。preview_chords 無し＝進行が無ければ key の tonic に落ちる。
const relBassContent = (over: Record<string, unknown> = {}) => ({
  mode: "relative" as const,
  steps: 16,
  pattern: [{ step: 0, degree: "R", dur: 4 }],
  ...over,
});

const mkNeta = (kind: string, content: unknown, over: Partial<Neta> = {}): Neta => ({
  id: "x", kind, title: null, text: null, content,
  key: null, mode: null, tempo: null, meter: null, bars: null, mood: null,
  tags: [], created: "", updated: "", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  nfc.mockClear();
  apiMock.recommend.mockResolvedValue([]);
  apiMock.getSong.mockResolvedValue(null);
  apiMock.updateSong.mockResolvedValue({});
  apiMock.updateNeta.mockResolvedValue({});
  apiMock.getPlacements.mockResolvedValue({ parents: [], placementCount: 0 });
  apiMock.getRelations.mockResolvedValue([]);
});

// ---- (2) MiniRoll＝content が相対 bass のとき preview_chords を ctx.chords へ注入 ----
describe("MiniRoll：相対 bass サムネは preview_chords を解決文脈へ注入", () => {
  it("preview_chords 有り＝ctx.chords にその進行を渡して解決（G ルート→43）", () => {
    const preview = [{ root: 7, quality: "", start: 0, dur: 4 }];
    render(<MiniRoll neta={mkNeta("bass", relBassContent({ preview_chords: preview }), { key: 0 })} />);
    const call = nfc.mock.calls.find((c) => c[0] === "bass");
    expect(call).toBeTruthy();
    expect((call![2] as { chords?: unknown[] }).chords).toEqual(preview); // preview_chords が ctx.chords へ
    // 本物の resolveRelativeBass が G(root7) に当てた実音＝43（band(7)）が返る。
    const idx = nfc.mock.calls.indexOf(call!);
    expect((nfc.mock.results[idx]!.value as { pitch: number }[])[0]!.pitch).toBe(43);
  });

  it("preview_chords 無し＝chords キーを注入しない（従来どおり・bit一致）", () => {
    render(<MiniRoll neta={mkNeta("bass", relBassContent(), { key: 0 })} />);
    const call = nfc.mock.calls.find((c) => c[0] === "bass");
    expect((call![2] as { chords?: unknown[] }).chords).toBeUndefined();
    // それでも描画は落ちない（key の tonic=C→36 に解決）。
    const idx = nfc.mock.calls.indexOf(call!);
    expect((nfc.mock.results[idx]!.value as { pitch: number }[])[0]!.pitch).toBe(36);
  });

  it("絶対 bass サムネは chords を注入しない（他 kind の経路不変）", () => {
    render(<MiniRoll neta={mkNeta("bass", { notes: [{ pitch: 40, start: 0, dur: 1 }] }, { key: 0 })} />);
    const call = nfc.mock.calls.find((c) => c[0] === "bass");
    expect((call![2] as { chords?: unknown[] }).chords).toBeUndefined();
  });
});

// ---- (1a) auditionCandidate（useMelodyGen）の isRel に相対 bass を追加 ----
describe("auditionCandidate：相対 bass 候補をセクション進行で試聴", () => {
  const makeCtx = (): MelodyGenCtx => ({
    neta: mkNeta("section", null, { id: "sec1", mode: "major" }),
    keyPc: 0,
    tempo: 120,
    liveMeter: "4/4",
    liveTitle: "曲",
    BARS: 8,
    BPB: 4,
    lanes: [],
    laneChildren: () => [],
    laneOf: () => undefined,
    sectionChords: () => [{ root: 7, quality: "", start: 0, dur: 4 }], // G 進行
    sectionBass: () => [],
    sectionDrums: () => null,
    contentDur: () => 4,
    childDur: () => 0,
    progForKind: (k) => (k === "bass" ? 33 : 0),
    reload: vi.fn(async () => {}),
    onChanged: vi.fn(),
  });

  it("相対 bass＝ctx.chords にセクション進行を渡して解決（G→43）・再生される", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    const cand: Cand = { kind: "bass", content: relBassContent(), cid: 1 };
    await act(async () => { await result.current.auditionCandidate(cand); });

    const call = nfc.mock.calls.find((c) => c[0] === "bass" && (c[1] as { mode?: string }).mode === "relative");
    expect(call).toBeTruthy();
    const ctxArg = call![2] as { chords?: { root?: number }[]; key?: number };
    expect(ctxArg.chords).toEqual([{ root: 7, quality: "", start: 0, dur: 4 }]);
    const idx = nfc.mock.calls.indexOf(call!);
    expect((nfc.mock.results[idx]!.value as { pitch: number }[])[0]!.pitch).toBe(43);
    expect(startPlayback).toHaveBeenCalledTimes(1);
  });

  it("絶対 bass 候補＝ctx 無し（従来どおり・bit一致）", async () => {
    const { result } = renderHook(() => useMelodyGen(makeCtx()));
    const cand: Cand = { kind: "bass", content: { notes: [{ pitch: 40, start: 0, dur: 1 }] }, cid: 2 };
    await act(async () => { await result.current.auditionCandidate(cand); });

    const call = nfc.mock.calls.find((c) => c[0] === "bass");
    expect(call).toBeTruthy();
    expect(call![2]).toBeUndefined(); // 絶対 bass は ctx を渡さない＝解決文脈の注入なし
  });
});

// ---- (1b) SectionEditor 候補カードの isRel に相対 bass を追加 ----
describe("SectionEditor 候補カード：相対 bass はセクション進行で描画", () => {
  it("相対 bass 候補の MiniRoll は ctx.chords にセクション進行を受けて解決する", async () => {
    apiMock.getComposition.mockResolvedValue({
      neta: mkNeta("section", null, { id: "s1" }),
      children: [
        { position: 0, ord: 0, node: { neta: mkNeta("chord_progression", { chords: [{ root: 7, quality: "", start: 0, dur: 4 }] }, { id: "ch1" }), children: [] } },
      ],
    });
    apiMock.music.mockResolvedValue({ items: [{ kind: "bass", content: relBassContent() }] });

    render(<SectionEditor neta={mkNeta("section", null, { id: "s1" })} keyPc={0} tempo={120} />);
    await screen.findByLabelText("block-ch1@0");
    await userEvent.click(screen.getByLabelText("tools"));
    await userEvent.click(screen.getByLabelText("gen-gen_bass")); // ベースをこの進行に生成
    await screen.findByLabelText("candidate-card");

    // 候補カードの MiniRoll が相対 bass content を「セクション進行(root7)」で解決したことを ctx で確認。
    const call = nfc.mock.calls.find((c) => c[0] === "bass" && (c[1] as { mode?: string }).mode === "relative");
    expect(call).toBeTruthy();
    const ctxArg = call![2] as { chords?: { root?: number }[] };
    expect(ctxArg.chords?.some((ch) => ch.root === 7)).toBe(true);
  });
});
