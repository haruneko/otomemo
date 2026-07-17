// 再生ローディング表示（設計 2026-07-17）赤④：仮歌レンダ中の▶二重押下ガード。
// 歌う melody（sing.enabled＋syllable）で api.sing を deferred（未解決のまま）に差し替え、▶を2度押しても
// api.sing は子の数ぶん（=1回）だけ＝重複 fetch しない。busy 中は pending が立ち aria-busy=true。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Neta } from "../src/api";

const { updateNeta, deleteNeta, getRelations, getPlacements, playNotes, sing, assetUrl } = vi.hoisted(() => ({
  updateNeta: vi.fn().mockResolvedValue({}),
  deleteNeta: vi.fn().mockResolvedValue({ deleted: true }),
  getRelations: vi.fn().mockResolvedValue([]),
  getPlacements: vi.fn().mockResolvedValue({ parents: [], placementCount: 0 }),
  playNotes: vi.fn().mockResolvedValue({ stop: vi.fn(), pause: vi.fn(), resume: vi.fn() }),
  // deferred：resolve せず in-flight のまま＝busy を保持。
  sing: vi.fn(() => new Promise(() => {})),
  assetUrl: (id: string) => `blob:asset-${id}`,
}));

vi.mock("../src/api", () => ({
  api: { updateNeta, deleteNeta, getRelations, getPlacements, sing, assetUrl },
}));
vi.mock("../src/usePlayhead", () => ({
  usePlayhead: () => ({ lineRef: { current: null }, timeRef: { current: null }, start: vi.fn(), stop: vi.fn() }),
}));
// Tone を起動しないよう playNotes だけ差し替え（decodeVocal 等 audio の他 export は実物＝sing 未解決で未到達）。
vi.mock("../src/music", async (orig) => ({
  ...(await orig<typeof import("../src/music")>()),
  playNotes,
}));

import { NetaDialog } from "../src/components/NetaDialog";

const singingMelody: Neta = {
  id: "m", kind: "melody", title: null, text: null,
  content: { notes: [{ pitch: 60, start: 0, dur: 1, syllable: "ら" }], program: 0, sing: { enabled: true } } as unknown as Neta["content"],
  key: 0, mode: "major", tempo: 120, meter: "4/4", bars: null, mood: null, tags: [], created: "", updated: "",
};

describe("仮歌レンダ中の▶二重押下ガード（設計 2026-07-17 赤④）", () => {
  beforeEach(() => {
    localStorage.clear();
    sing.mockClear();
    updateNeta.mockClear();
    getRelations.mockClear();
    getPlacements.mockClear();
  });

  it("busy 中に▶を2度押しても api.sing は1回だけ（重複 ensure なし）", async () => {
    render(<NetaDialog neta={singingMelody} onClose={vi.fn()} onChanged={vi.fn()} />);
    const pp = await screen.findByLabelText("play-pause");

    await userEvent.click(pp); // 1回目＝ensure 開始→api.sing 発火（deferred で pending）→busy=true
    // busy 反映＝▶が aria-busy=true（pending が立つ）。
    await waitFor(() => expect(pp).toHaveAttribute("aria-busy", "true"));
    expect(sing).toHaveBeenCalledTimes(1);

    await userEvent.click(pp); // 2回目＝busy ガードで no-op（ensure 再発火しない）
    // 少し待っても sing は増えない。
    await new Promise((r) => setTimeout(r, 50));
    expect(sing).toHaveBeenCalledTimes(1);
  });
});
