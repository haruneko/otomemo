import { describe, it, expect } from "vitest";
import { openDb } from "../src/db";
import {
  buildPhrasePatterns,
  ingestPhrasePatterns,
  hasPhrasePatterns,
  loadPhrasePatterns,
} from "../src/music/corpusStats";

// (A) メロ句辞書（#21拡張・design「コーパス遷移統計テーブル 第2弾」(A)）。
// 在DB melody library の phase_ok 句を度数+リズムへ相対化（リテラル絶対pitch非保存）。生成結線(WP-M1)は別スライス。

describe("(A) buildPhrasePatterns（pitch→度数+oct・リズム保持・畳み込み）", () => {
  it("pitch を tonic相対度数(deg 0..11)+oct へ・start/dur は保持", () => {
    const rows = buildPhrasePatterns([
      { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 0.5 }, { pitch: 67, start: 1.5, dur: 0.5 }], mode: "major", count: 2, phaseOk: true },
    ]);
    expect(rows).toHaveLength(1);
    const degs = JSON.parse(rows[0]!.degrees) as { deg: number; oct: number; start: number; dur: number }[];
    expect(degs[0]).toEqual({ deg: 0, oct: 5, start: 0, dur: 1 }); // C4=60 → deg0/oct5
    expect(degs[1]).toEqual({ deg: 4, oct: 5, start: 1, dur: 0.5 }); // E4=64 → deg4
    expect(degs[2]).toEqual({ deg: 7, oct: 5, start: 1.5, dur: 0.5 }); // G4=67 → deg7
    expect(rows[0]!.count).toBe(2);
    expect(rows[0]!.phase_ok).toBe(1);
    expect(rows[0]!.tonic_pc).toBe(0);
  });

  it("同型句（同 degrees/meter/bars/pickup）は 1 行へ畳み count 加算", () => {
    const one: Parameters<typeof buildPhrasePatterns>[0][number] = { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }], mode: "major", count: 3, phaseOk: true };
    const rows = buildPhrasePatterns([one, { ...one, count: 5 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(8);
  });

  it("mode 違いは別行（畳まない）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 63, start: 1, dur: 1 }];
    const rows = buildPhrasePatterns([
      { notes, mode: "major", count: 1, phaseOk: true },
      { notes, mode: "minor", count: 1, phaseOk: true },
    ]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.mode))).toEqual(new Set(["major", "minor"]));
  });

  it("空/非有限pitch は捨てる", () => {
    expect(buildPhrasePatterns([{ notes: [], mode: "major" }])).toHaveLength(0);
    const rows = buildPhrasePatterns([{ notes: [{ pitch: NaN, start: 0, dur: 1 }, { pitch: 60, start: 1, dur: 1 }], mode: "major" }]);
    expect(JSON.parse(rows[0]!.degrees)).toHaveLength(1); // NaN 除去で1音
  });
});

describe("(A) ingest / has / load（在DB round-trip・phase_ok/count 保持）", () => {
  it("has は投入前 false・投入後 true／load が degrees を parse し count 降順", () => {
    const db = openDb(":memory:");
    expect(hasPhrasePatterns(db)).toBe(false);
    const rows = buildPhrasePatterns([
      { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 }], mode: "major", count: 9, phaseOk: true },
      { notes: [{ pitch: 60, start: 0, dur: 2 }, { pitch: 67, start: 2, dur: 2 }], mode: "major", count: 2, phaseOk: true },
    ]);
    ingestPhrasePatterns(db, rows, "pop");
    expect(hasPhrasePatterns(db)).toBe(true);
    const loaded = loadPhrasePatterns(db, "pop", "major");
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.count).toBe(9); // 最頻が先頭
    expect(Array.isArray(loaded[0]!.degrees)).toBe(true);
    expect(loaded[0]!.degrees[0]).toEqual({ deg: 0, oct: 5, start: 0, dur: 1 });
  });

  it("ingest は冪等（同 PK 上書き＝重複しない）", () => {
    const db = openDb(":memory:");
    const rows = buildPhrasePatterns([{ notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }], mode: "major", count: 3, phaseOk: true }]);
    ingestPhrasePatterns(db, rows, "pop");
    ingestPhrasePatterns(db, rows, "pop");
    expect(loadPhrasePatterns(db, "pop", "major")).toHaveLength(1);
  });
});
