// コーパス遷移統計テーブル（WP-0・design #21）の契約テスト＝スキーマ round-trip／投入／読み出し／冪等／標本化。
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "../src/db";
import {
  ingestCorpusStats, hasCorpusStats, loadNoteTransitions, loadSkeletonPriors, loadMotifTransforms, sampleByCount,
  type SkeletonStatsJson, type MotifStatsJson,
} from "../src/music/corpusStats";

// 小 fixture（実 JSON 形状の縮小版）
const SKEL: SkeletonStatsJson = {
  major: {
    startDeg: [{ pc: 4, pct: 21.7, n: 1672 }, { pc: 0, pct: 20.8, n: 1598 }],
    cadDeg: [{ pc: 0, pct: 23.6, n: 1817 }],
    degHist: [{ pc: 0, pct: 20.9, n: 11752 }],
    chordRel: [{ pc: 0, pct: 21.4, n: 11976 }],
    chordRelStrong: [["7", 5597, 19.9]],
    chordRelWeak: [["0", 6417, 23]],
    contour: [["arch", 2959, 38.5], ["valley", 1900, 25.3]],
    rangeHist: [["10", 2373, 30.8]],
    ornType: [["leap:weak", 51161, 31.8]],
    bigramFull: { "0>0": 3033, "3>2": 1962, "4>2>ignored": 5 }, // 最後は分解不一致で捨てられる
    trigramFull: { "0>0>0": 819, "3>2>1": 400 },
  },
  minor: {
    startDeg: [{ pc: 0, pct: 26.8, n: 1000 }],
    bigramFull: { "0>5": 500 },
  },
};
const MOTIF1: MotifStatsJson = {
  meta: { motifBars: 1 },
  transformFreq: { literal: 55401, transpose: 5208 },
  transformPct: { literal: 11.72, transpose: 1.1 },
  transposeShiftSemitones: { "1": 1778, "-5": 328 },
  lengthVarNoteDelta: { "1": 76002 },
  catByDist: { literal: { adjacent: 100, d2_4: 50 } },
};
const MOTIF2: MotifStatsJson = { meta: { motifBars: 2 }, transformFreq: { literal: 111 }, transformPct: { literal: 9.9 } };

describe("WP-0 corpus_* テーブル：スキーマ round-trip", () => {
  it("openDb で3テーブルが用意され、投入前は hasCorpusStats=false", () => {
    const db = openDb(":memory:");
    for (const t of ["corpus_note_transition", "corpus_skeleton_prior", "corpus_motif_transform"]) {
      expect(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get()).toEqual({ c: 0 });
    }
    expect(hasCorpusStats(db)).toBe(false);
  });

  it("ingest→read：note_transition の bigram/trigram が from_ctx 分解される", () => {
    const db = openDb(":memory:");
    const res = ingestCorpusStats(db, { skeleton: SKEL });
    // "4>2>ignored"(ngram2に長さ不一致) は捨てる＝major bigram=2, trigram=2, minor bigram=1
    expect(res.noteTransitions).toBe(5);
    expect(hasCorpusStats(db)).toBe(true);
    const nt = loadNoteTransitions(db, "pop", "major");
    expect(nt.bigram.get("0")).toEqual([[0, 3033]]); // "0>0" → ctx "0" to 0
    expect(nt.bigram.get("3")).toEqual([[2, 1962]]); // "3>2"
    expect(nt.trigram.get("0>0")).toEqual([[0, 819]]); // "0>0>0" → ctx "0>0"
    expect(nt.trigram.get("3>2")).toEqual([[1, 400]]);
    // minor は独立
    expect(loadNoteTransitions(db, "pop", "minor").bigram.get("0")).toEqual([[5, 500]]);
  });

  it("ingest→read：skeleton_prior の度数分布/ラベル分布/chordRel が feature 別に読める", () => {
    const db = openDb(":memory:");
    ingestCorpusStats(db, { skeleton: SKEL });
    const p = loadSkeletonPriors(db, "pop", "major");
    expect(p.startDeg).toContainEqual({ bin: "4", pct: 21.7, n: 1672 });
    expect(p.contour).toContainEqual({ bin: "arch", pct: 38.5, n: 2959 });
    // M1穴の chordal skip 材料＝強拍 chordRel
    expect(p.chordRelStrong).toEqual([{ bin: "7", pct: 19.9, n: 5597 }]);
    expect(p.chordRel).toEqual([{ bin: "0", pct: 21.4, n: 11976 }]);
    expect(p.ornType).toEqual([{ bin: "leap:weak", pct: 31.8, n: 51161 }]);
  });

  it("ingest→read：motif_transform が scope_bars 別・feature 別（transform/transposeShift/lengthDelta/catByDist）", () => {
    const db = openDb(":memory:");
    const res = ingestCorpusStats(db, { motif1: MOTIF1, motif2: MOTIF2 });
    expect(res.motifTransforms).toBe(2 + 2 + 1 + 2 + 1); // transform2+shift2+len1+cat2 (1bar) + transform1 (2bar)
    const m1 = loadMotifTransforms(db, 1);
    expect(m1.transform).toContainEqual({ bin: "literal", count: 55401, pct: 11.72 });
    expect(m1.transposeShift).toContainEqual({ bin: "-5", count: 328, pct: null });
    expect(m1.catByDist).toContainEqual({ bin: "literal:adjacent", count: 100, pct: null });
    const m2 = loadMotifTransforms(db, 2);
    expect(m2.transform).toEqual([{ bin: "literal", count: 111, pct: 9.9 }]);
    expect(loadMotifTransforms(db, 1).transform.length).toBeGreaterThan(0); // scope 分離
  });

  it("冪等：二度 ingest しても件数が増えない（INSERT OR REPLACE）", () => {
    const db = openDb(":memory:");
    ingestCorpusStats(db, { skeleton: SKEL, motif1: MOTIF1 });
    const c1 = db.prepare(`SELECT COUNT(*) c FROM corpus_note_transition`).get() as { c: number };
    ingestCorpusStats(db, { skeleton: SKEL, motif1: MOTIF1 });
    const c2 = db.prepare(`SELECT COUNT(*) c FROM corpus_note_transition`).get() as { c: number };
    expect(c2.c).toBe(c1.c);
  });

  it("sampleByCount：count 重みで決定的に標本化（0..1 rand 注入）", () => {
    const entries: [number, number][] = [[0, 90], [5, 10]]; // 90:10
    expect(sampleByCount(entries, 0.0)).toBe(0);
    expect(sampleByCount(entries, 0.5)).toBe(0); // 45<90 → 0
    expect(sampleByCount(entries, 0.95)).toBe(5); // 85.5>90? no → 0.95*100=95>90 → 5
    expect(sampleByCount([] as [number, number][], 0.5)).toBeNull();
    // PriorEntry 形（{bin,count}）も食える
    expect(sampleByCount([{ bin: "arch", count: 100 }], 0.5)).toBe("arch");
  });

  it("未投入 DB は degrade gracefully（空 map・空 record）", () => {
    const db = openDb(":memory:");
    expect(loadNoteTransitions(db, "pop", "major").bigram.size).toBe(0);
    expect(loadSkeletonPriors(db, "pop", "major")).toEqual({});
    expect(loadMotifTransforms(db, 1)).toEqual({});
  });
});

// 実素材（data/corpus-stats/*.json）が読める形か＝壊れていない事の smoke（存在時のみ）。
describe("WP-0 実 JSON 素材 smoke（存在時）", () => {
  const dir = join(__dirname, "..", "..", "..", "data", "corpus-stats");
  const skelPath = join(dir, "skeleton-corpus-stats-20260714.json");
  it.runIf(existsSync(skelPath))("実 skeleton JSON を投入すると note_transition/prior が大量に入る", () => {
    const db = openDb(":memory:");
    const skeleton = JSON.parse(readFileSync(skelPath, "utf8")) as SkeletonStatsJson;
    const m1 = join(dir, "motif-transform-stats-1bar.json");
    const m2 = join(dir, "motif-transform-stats-2bar.json");
    const res = ingestCorpusStats(db, {
      skeleton,
      motif1: existsSync(m1) ? JSON.parse(readFileSync(m1, "utf8")) : null,
      motif2: existsSync(m2) ? JSON.parse(readFileSync(m2, "utf8")) : null,
    });
    expect(res.noteTransitions).toBeGreaterThan(500); // bigram142+trigram862 級×2mode
    expect(res.skeletonPriors).toBeGreaterThan(50);
    expect(res.motifTransforms).toBeGreaterThan(10);
    // major bigram の最頻 self（"0>0" 等）が引ける
    const nt = loadNoteTransitions(db, "pop", "major");
    expect(nt.bigram.size).toBeGreaterThan(10);
    expect(nt.trigram.size).toBeGreaterThan(10);
  });
});
