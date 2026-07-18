// #27 useVocalRender は駆動層 playback.ts の busy/progress/msg を購読する薄いフックへ縮退。
// ここでは「hook が module の busy 状態を購読して再描画する」ことだけを確認（ensure/progress の中身は playback.test.ts）。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const singControl = vi.hoisted(() => {
  const pending: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];
  return {
    pending,
    sing: vi.fn(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }); })),
    reset: () => { pending.length = 0; singControl.sing.mockClear(); },
  };
});
vi.mock("../src/api", () => ({ api: { sing: singControl.sing, assetUrl: (id: string) => `blob:asset-${id}` } }));
vi.mock("../src/audio", () => ({ decodeVocal: vi.fn(async () => ({ length: 1, sampleRate: 48000 })) }));

beforeEach(() => {
  singControl.reset();
  (globalThis as any).fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }));
});

import { useVocalRender } from "../src/useVocal";
import { __resetPlaybackForTest } from "../src/playback";
import type { VocalJob } from "../src/useVocal";

const job = (key: string): VocalJob => ({ key, notes: [{ pitch: 60, start: 0, dur: 1, syllable: "ら" }], bpm: 120, firstNoteBeat: 0 });
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

describe("useVocalRender（#27 購読フックへ縮退）", () => {
  beforeEach(() => __resetPlaybackForTest());

  it("ensure 中は busy=true、完了で busy=false（module 状態を購読して再描画）", async () => {
    const { result } = renderHook(() => useVocalRender());
    expect(result.current.busy).toBe(false);
    let done!: Promise<unknown>;
    act(() => { done = result.current.ensure([job("a")]); });
    await flush();
    expect(result.current.busy).toBe(true);
    expect(result.current.progress).toEqual({ done: 0, total: 1 });
    await act(async () => {
      singControl.pending[0]!.resolve({ assetId: "a", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
      await done;
    });
    await flush();
    expect(result.current.busy).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it("wav キャッシュは module 共有＝別フックインスタンスでも peek で即取れる", async () => {
    const a = renderHook(() => useVocalRender());
    let done!: Promise<unknown>;
    act(() => { done = a.result.current.ensure([job("shared")]); });
    await flush();
    await act(async () => {
      singControl.pending[0]!.resolve({ assetId: "shared", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
      await done;
    });
    await flush();
    // 別インスタンス（カード相当）が peek で即ヒット＝フック毎 ref だった旧実装なら null。
    const b = renderHook(() => useVocalRender());
    expect(b.result.current.peek([job("shared")])).not.toBeNull();
  });
});
