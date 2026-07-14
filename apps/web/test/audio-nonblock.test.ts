// design#24「再生開始の非ブロック契約」の受け入れ(a)〜(d)。
// 実 SF2/Tone/smplr は読まず、ensureSoundFont が使う makeSampler を遅延フェイク(__setSfTestHooks)へ
// 差し替えて有界待ち(≤COLD_START_WAIT_MS=400ms)を検証。(d)は usePlayhead.stop() の CSS変数リセット。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ensureSoundFont, setActiveSoundFont, __setSfTestHooks } from "../src/audio";
import { usePlayhead } from "../src/usePlayhead";

// 制御可能な「ロード完了を後から解決する」フェイク sampler ファクトリ。
// resolve() を呼ぶまで makeSampler は未解決＝先読みが in-flight のまま。
function deferredSampler() {
  const sampler = {
    ready: Promise.resolve(),
    instrumentNames: [] as string[],
    loadInstrument: async () => {},
  };
  let resolve!: (v: typeof sampler) => void;
  const promise = new Promise<typeof sampler>((r) => (resolve = r));
  return { sampler, make: () => promise, resolve: () => resolve(sampler) };
}

let urlSeq = 0;
function freshUrl() {
  return `blob:sf-test-${urlSeq++}`; // 毎テスト別URL＝setActiveSoundFont が確実に resetSfCaches
}

describe("#24 再生開始の非ブロック契約 — ensureSoundFont 有界待ち", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // 差し替えを本体へ戻し、state をリセット（他テストへ漏らさない）。
    __setSfTestHooks({ makeSampler: null, reset: true });
    setActiveSoundFont(null);
    vi.useRealTimers();
  });

  // (a) in-flight ロード中の ensureSoundFont(…, false) は ~400ms 以内に null（await で数秒待たない）。
  it("(a) in-flight ロード中の waitIfCold=false は ≤400ms で null を返す（無限待ちしない）", async () => {
    const d = deferredSampler(); // 解決しない＝ロードは400ms内に間に合わない
    __setSfTestHooks({ makeSampler: d.make, reset: true });
    setActiveSoundFont(freshUrl());

    // 先読み相当（waitIfCold=true）で in-flight ロードを起こす（解決しないので pending のまま）。
    const prewarm = ensureSoundFont({}, 0, true);
    // 同一ボタン押下相当（waitIfCold=false）。ここが有界待ち。
    let settled = false;
    const play = ensureSoundFont({}, 0, false).then((v) => {
      settled = true;
      return v;
    });

    // 399ms 時点ではまだ待っている（タイムアウト未発火＝バウンド前に諦めない）。
    await vi.advanceTimersByTimeAsync(399);
    expect(settled).toBe(false);
    // 400ms でタイムアウト発火 → null フォールバック。
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await play).toBeNull();

    // 裏ロードは中断されない：後から解決すれば prewarm は SF2 を受け取る（次回から鳴る）。
    d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(await prewarm).toBe(d.sampler);
  });

  // (b) 400ms 以内にロード完了すれば SF2（same sampler）を返す＝従来の返り値経路。
  it("(b) 400ms 以内にロード完了すれば SF2 sampler を返す（instrument切替経路を通る）", async () => {
    const d = deferredSampler();
    __setSfTestHooks({ makeSampler: d.make, reset: true });
    setActiveSoundFont(freshUrl());

    const prewarm = ensureSoundFont({}, 0, true);
    const play = ensureSoundFont({}, 0, false);

    // タイムアウト(400ms)より前にロード完了。
    d.resolve();
    await vi.advanceTimersByTimeAsync(50); // < 400ms
    expect(await play).toBe(d.sampler); // null でなく SF2 sampler
    expect(await prewarm).toBe(d.sampler);
  });

  // (c) waitIfCold=true（明示・先読み）は従来通り完了まで無限待ち＝400ms超でも諦めない。
  it("(c) waitIfCold=true は有界にせず完了まで待つ（400ms超でも null にしない）", async () => {
    const d = deferredSampler();
    __setSfTestHooks({ makeSampler: d.make, reset: true });
    setActiveSoundFont(freshUrl());

    let settled = false;
    const p = ensureSoundFont({}, 0, true).then((v) => {
      settled = true;
      return v;
    });

    // 400ms を大きく超えても未解決（有界待ちの対象外）。
    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toBe(false);

    d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(await p).toBe(d.sampler);
  });

  // 冷スタート（in-flight ロードすら無い）＋waitIfCold=false は即 null（従来どおり待たない）。
  it("冷スタート(進行中ロード無し)の waitIfCold=false は即フォールバック（null）", async () => {
    const d = deferredSampler();
    __setSfTestHooks({ makeSampler: d.make, reset: true });
    setActiveSoundFont(freshUrl());

    // alreadyLoading=false のまま最初に false 指定で呼ぶ＝即 null（裏で新規ロードは開始される）。
    const v = await ensureSoundFont({}, 0, false);
    expect(v).toBeNull();
  });
});

describe("#24 (d) usePlayhead.stop() は --ph/--phb もリセット", () => {
  it("停止後にプレイヘッドCSS変数(--ph/--phb)が0へ戻る（前回値が残らない）", () => {
    const { result } = renderHook(() => usePlayhead());
    const el = document.createElement("div");
    // 再生中に残った状態を模す：比率0.7・生beat5.5・表示block。
    el.style.setProperty("--ph", "0.7");
    el.style.setProperty("--phb", "5.5");
    el.style.display = "block";
    result.current.lineRef.current = el;

    act(() => result.current.stop());

    expect(el.style.getPropertyValue("--ph")).toBe("0");
    expect(el.style.getPropertyValue("--phb")).toBe("0");
    expect(el.style.display).toBe("none"); // 従来の非表示も維持
  });
});
