// 再生ローディング表示（設計 2026-07-17）赤①：useVocalRender に progress 副チャネルを足す。
// api.sing を deferred fake に差し替え、missing 2件で progress の遷移を検証：
//   null → {done:0,total:2} → {done:1,total:2} → {done:2,total:2}(finally 直前) → null
// busy: false→true→false。失敗系＝1件目 reject で progress=null・msg に失敗文言・busy=false。
// 直列ループ・cache・key は不変（progress は純粋な副チャネル）。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// api.sing を制御可能な deferred に。assetUrl はダミー文字列を返す。
const singControl = vi.hoisted(() => {
  const pending: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];
  return {
    pending,
    sing: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    ),
    reset: () => {
      pending.length = 0;
      singControl.sing.mockClear();
    },
  };
});

vi.mock("../src/api", () => ({
  api: {
    sing: singControl.sing,
    assetUrl: (id: string) => `blob:asset-${id}`,
  },
}));

// decodeVocal は即 fake AudioBuffer を返す（実デコードしない）。
vi.mock("../src/audio", () => ({
  decodeVocal: vi.fn(async () => ({ length: 1, sampleRate: 48000 })),
}));

// fetch(assetUrl).arrayBuffer() を fake（中身は使わない）。
beforeEach(() => {
  singControl.reset();
  (globalThis as any).fetch = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }));
});

import { useVocalRender } from "../src/useVocal";
import type { VocalJob } from "../src/useVocal";

function job(key: string): VocalJob {
  return { key, notes: [{ pitch: 60, start: 0, dur: 1, syllable: "ら" }], bpm: 120, firstNoteBeat: 0 };
}

// microtask を吐き切る（await 連鎖を進める）。
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("useVocalRender progress 副チャネル（設計 2026-07-17 赤①）", () => {
  it("missing 2件：progress が null→{0,2}→{1,2}→null と遷移し busy が false→true→false", async () => {
    const { result } = renderHook(() => useVocalRender());
    expect(result.current.progress).toBeNull();
    expect(result.current.busy).toBe(false);

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.ensure([job("a"), job("b")]);
    });
    // ループ開始直後：total=2, done=0, busy=true。
    await flush();
    expect(result.current.busy).toBe(true);
    expect(result.current.progress).toEqual({ done: 0, total: 2 });
    expect(singControl.sing).toHaveBeenCalledTimes(1); // 直列＝1本目だけ発火

    // 1本目 resolve → done=1、2本目 sing 発火。
    await act(async () => {
      singControl.pending[0]!.resolve({ assetId: "a", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
    });
    await flush();
    expect(result.current.progress).toEqual({ done: 1, total: 2 });
    expect(singControl.sing).toHaveBeenCalledTimes(2);

    // 2本目 resolve → finally で progress=null・busy=false。
    await act(async () => {
      singControl.pending[1]!.resolve({ assetId: "b", shift: 0, clamped: 0, speaker: 0, leadRestSec: 0 });
      await done;
    });
    await flush();
    expect(result.current.progress).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("失敗系：1本目 reject で progress=null・busy=false・msg に失敗文言", async () => {
    const { result } = renderHook(() => useVocalRender());
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.ensure([job("x"), job("y")]);
    });
    await flush();
    expect(result.current.progress).toEqual({ done: 0, total: 2 });

    await act(async () => {
      singControl.pending[0]!.reject(new Error("boom"));
      await done;
    });
    await flush();
    expect(result.current.progress).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(result.current.msg).toContain("失敗");
  });

  it("全キャッシュ済（missing なし）＝progress は null のまま（従来一致）", async () => {
    const { result } = renderHook(() => useVocalRender());
    // notes 空 job は missing に入らない＝ensure が同期的に空配列で戻る。
    await act(async () => {
      await result.current.ensure([{ key: "z", notes: [], bpm: 120, firstNoteBeat: 0 }]);
    });
    expect(result.current.progress).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(singControl.sing).not.toHaveBeenCalled();
  });
});
