import { describe, it, expect } from "vitest";
import { buildVocalJob } from "../src/useNetaEditor";

// 2026-07-17 バグ回帰：単体メロエディタで声(speaker)を変えても反映されない＝
// ①job が speaker を api.sing へ渡していない ②キャッシュキーに speaker が無く古い wav を再利用、の2点。
describe("buildVocalJob（単体エディタの仮歌ジョブ＝声を再生へ反映）", () => {
  const notes = [
    { pitch: 60, start: 0, dur: 1, syllable: "ラ" },
    { pitch: 62, start: 1, dur: 1, syllable: "ラ" },
  ];

  it("選んだ声を api.sing へ渡す＝job.speaker に載る（未選択=undefined=既定リツ）", () => {
    expect(buildVocalJob(notes, 120, 3003).speaker).toBe(3003);
    expect(buildVocalJob(notes, 120, undefined).speaker).toBeUndefined();
  });

  it("声を変えると key が変わる＝古い声の wav キャッシュを再利用しない（バグ再現）", () => {
    const risu = buildVocalJob(notes, 120, 3009).key;
    const zunda = buildVocalJob(notes, 120, 3003).key;
    expect(risu).not.toBe(zunda); // 旧実装は {n,t} のみ＝同一キー＝声変更が反映されなかった
  });

  it("同じ声・同じ音は同一 key（キャッシュヒット＝二重合成しない）", () => {
    expect(buildVocalJob(notes, 120, 3003).key).toBe(buildVocalJob(notes, 120, 3003).key);
  });

  it("notes/bpm/firstNoteBeat はそのまま組む（弱起=負start も min で拾う）", () => {
    const j = buildVocalJob([{ pitch: 67, start: -0.5, dur: 1, syllable: "ソ" }], 100, undefined);
    expect(j.bpm).toBe(100);
    expect(j.firstNoteBeat).toBe(-0.5);
    expect(j.notes).toEqual([{ pitch: 67, start: -0.5, dur: 1, syllable: "ソ" }]);
  });
});
