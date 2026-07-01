import { describe, it, expect } from "vitest";
import { nudgeNotes, duplicateSel, deleteSel, copySel, pasteNotes } from "../src/noteEdit";
import type { Note } from "../src/music";

const N = (pitch: number, start: number, dur = 1): Note => ({ pitch, start, dur });

describe("noteEdit（選択編集の純ロジック・design N2）", () => {
  const notes = [N(60, 0), N(62, 1), N(64, 2)];

  it("nudge：選択だけ音程/時間を動かす（未選択は不変・pitchクランプ）", () => {
    const out = nudgeNotes(notes, new Set([1]), 2, 1); // idx1 を +2半音 +1拍
    expect(out[0]).toEqual(N(60, 0)); // 未選択そのまま
    expect(out[1]).toEqual(N(64, 2)); // 62→64, 1→2
    expect(out[2]).toEqual(N(64, 2));
    // クランプ：上限127・下限start0
    expect(nudgeNotes([N(126, 0)], new Set([0]), 5, 0)[0]!.pitch).toBe(127);
    expect(nudgeNotes([N(60, 0)], new Set([0]), 0, -3)[0]!.start).toBe(0);
  });

  it("duplicate：選択を +offset にコピー・戻り選択はコピー側", () => {
    const r = duplicateSel(notes, new Set([0, 2]), 4);
    expect(r.notes).toHaveLength(5); // 3 + 2コピー
    expect(r.notes[3]).toEqual(N(60, 4)); // 0番のコピー
    expect(r.notes[4]).toEqual(N(64, 6)); // 2番のコピー
    expect([...r.selection].sort()).toEqual([3, 4]); // コピーが選択される
  });

  it("delete：選択を消す", () => {
    expect(deleteSel(notes, new Set([1]))).toEqual([N(60, 0), N(64, 2)]);
  });

  it("copy：クリップボードは min-start=0 に正規化", () => {
    const clip = copySel(notes, new Set([1, 2])); // start 1,2
    expect(clip).toEqual([N(62, 0), N(64, 1)]); // 最小start(1)を0に寄せる
  });

  it("paste：クリップボードを atBeat に置く・戻り選択は貼った側", () => {
    const clip = copySel(notes, new Set([0, 1])); // [60@0, 62@1]
    const r = pasteNotes(notes, clip, 8);
    expect(r.notes).toHaveLength(5);
    expect(r.notes[3]).toEqual(N(60, 8));
    expect(r.notes[4]).toEqual(N(62, 9));
    expect([...r.selection].sort()).toEqual([3, 4]);
  });

  it("純関数：入力を破壊しない", () => {
    const src = [N(60, 0)];
    nudgeNotes(src, new Set([0]), 2, 1);
    duplicateSel(src, new Set([0]), 4);
    expect(src[0]).toEqual(N(60, 0));
  });
});
