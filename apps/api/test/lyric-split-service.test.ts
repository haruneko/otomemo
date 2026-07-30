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
    // 見せる分は上限（各軸 top8 の統合）
    expect(r.candidates.length).toBeLessThanOrEqual(16);
    // index は candidates の範囲内
    for (const i of [...r.byFacts, ...r.byPreference]) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(r.candidates.length);
    }
    // 実データ RHYTHM16 で既出判定が動く（corpusKnown が boolean で埋まる）
    for (const c of r.candidates) expect(typeof c.corpusKnown).toBe("boolean");
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
