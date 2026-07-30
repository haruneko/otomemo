import { describe, it, expect } from "vitest";
import { splitCandidatesForApi } from "../src/music/lyricSplitService";

describe("splitCandidatesForApi：コーパス注入と整形", () => {
  const notes = [0, 1, 2, 3].map((i) => ({ pitch: 60 + i, start: i, dur: 1 }));
  const range = { start: 0, beats: 4 };
  const meter = { beatsPerBar: 4, gridPerBeat: 4 };

  it("4/4＝実測の裏が付く（backedByCorpus=true）・2軸の並びが返る", () => {
    const r = splitCandidatesForApi({ notes, reading: ["あ", "い", "う", "え", "お", "か"], range, meter });
    expect(r.backedByCorpus).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
    // プルダウン分解のため全候補を返す（上限600で頭打ち）。
    expect(r.candidates.length).toBeLessThanOrEqual(600);
    // index は candidates の範囲内・2軸とも全候補を指す
    expect(r.byFacts).toHaveLength(r.candidates.length);
    expect(r.byPreference).toHaveLength(r.candidates.length);
    for (const i of [...r.byFacts, ...r.byPreference]) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(r.candidates.length);
    }
    // 各候補に splits（音符ごとの割り方）が付く＝プルダウン分解の素
    for (const c of r.candidates) {
      expect(typeof c.corpusKnown).toBe("boolean"); // 実データ RHYTHM16 で既出判定が動く
      expect(Array.isArray(c.splits)).toBe(true);
    }
  });

  it("余っていなければ候補は空", () => {
    const r = splitCandidatesForApi({ notes, reading: ["あ", "い", "う", "え"], range, meter });
    expect(r.candidates).toHaveLength(0);
  });

  it("不正入力は投げる（http 側が 400 に落とす）", () => {
    // @ts-expect-error 故意に notes を欠く
    expect(() => splitCandidatesForApi({ reading: ["あ"], range, meter })).toThrow();
  });
});
