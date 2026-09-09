// M4 band_overlap＝低域の棲み分け。**ゲートは gap_semitones>0 だけ・overlap_frac は診断**。
// 源流：ensemble.py:3225-3241（計測）／gesture_p14.py:1143-1145 gate8（実ゲート値 0.10）。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertCoverage, assertGate, bandGapGate, bandOverlapDiagnostic, measureBandOverlap,
  SRC_GATE8_OVERLAP_FRAC_MAX,
} from "../src/index";

// 素材：ベース＝E1..A2 帯、上物＝C4 以上（棲み分けが成立している素直な配置）。
const BASS = [28, 33, 35, 40, 45];        // E1 A1 B1 E2 A2
const PIANO = [60, 64, 67, 72];           // C4 E4 G4 C5

describe("band_overlap（計測）＝源流と同じ式", () => {
  it("gap = min(上物) - max(ベース)・overlap_frac = |共通| / min(|集合|)", () => {
    const m = measureBandOverlap(BASS, PIANO);
    expect(m.gapSemitones).toBe(60 - 45);
    expect(m.overlapFrac).toBe(0);
    expect(m.bassRange).toEqual([28, 45]);
    expect(m.upperRange).toEqual([60, 72]);
  });
  it("重なりがある場合の overlap_frac は小さい方の集合を分母にする", () => {
    // ベース 4音・上物 2音・共通 1音 → 1/min(4,2)=0.5
    const m = measureBandOverlap([40, 45, 47, 48], [48, 60]);
    expect(m.overlapSemitones).toEqual([48]);
    expect(m.overlapFrac).toBe(0.5);
    expect(m.gapSemitones).toBe(48 - 48);
  });
  it("片側が無音なら計測は成立しない（源流も overlap_frac=None）", () => {
    expect(measureBandOverlap([], PIANO).overlapFrac).toBeNull();
    expect(measureBandOverlap(BASS, []).gapSemitones).toBeNull();
  });
});

describe("ゲート＝gap>0（陰性対照つき）", () => {
  it("陽性：棲み分けが成立していれば通る＋被覆率 1", () => {
    const g = bandGapGate(BASS, PIANO);
    expect(g.kind).toBe("gate");
    expect(g.pass).toBe(true);
    expect(() => assertGate(g)).not.toThrow();
    expect(() => assertCoverage(g, 1)).not.toThrow();
  });
  it("陰性対照：上物がベース帯へ潜ると落ちる（gap<=0）", () => {
    const g = bandGapGate(BASS, [44, 60, 64]); // 上物 min=44 < ベース max=45
    expect(g.pass).toBe(false);
    expect(g.problems.join()).toMatch(/gap_semitones=-1/);
    expect(() => assertGate(g)).toThrow(/band_overlap\.gap/);
  });
  it("陰性対照：ちょうど同じ音（gap=0）も落ちる（>0 が条件）", () => {
    expect(bandGapGate(BASS, [45, 60]).pass).toBe(false);
  });
  it("空虚な合格を作らない：片側無音は合格にせず被覆率 0 で申告する", () => {
    const g = bandGapGate(BASS, []);
    expect(g.pass).toBe(false);
    expect(g.coverage.applied).toBe(0);
    expect(() => assertCoverage(g, 0.5)).toThrow();
  });
});

describe("変異検査（§6-4 #6）＝出力に故障を注入して不変条件が実際に落ちるか", () => {
  it("(m2) 上物を半音ずつ下げていくと、gap が 0 になった瞬間にゲートが落ちる", () => {
    const results: boolean[] = [];
    for (let d = 0; d <= 16; d++) results.push(bandGapGate(BASS, PIANO.map((p) => p - d)).pass);
    expect(results[0]).toBe(true);
    expect(results[14]).toBe(true);   // gap 15-14 = 1
    expect(results[15]).toBe(false);  // gap 0
    expect(results[16]).toBe(false);  // gap -1
  });
  it("(m4) 低域の床を無効化＝ベース最高音を上物の中へ上げると落ちる", () => {
    const mutated = [...BASS.slice(0, 4), 65]; // 錨/床が消えて F4 まで上がった
    expect(bandGapGate(BASS, PIANO).pass).toBe(true);
    expect(bandGapGate(mutated, PIANO).pass).toBe(false);
  });
});

describe("overlap_frac は診断であってゲートではない（§6-4 #1）", () => {
  it("診断は合否フィールドを持たない・源流の閾値は記録するだけ", () => {
    const d = bandOverlapDiagnostic([40, 45, 47, 48], [48, 60]);
    expect(d.kind).toBe("diagnostic");
    expect("pass" in d).toBe(false);
    expect(d.value.overlapFrac).toBe(0.5);
    expect(d.value.withinSourceGate8).toBe(false); // 0.5 > 0.10＝記録するだけ・赤にしない
    expect(d.source).toMatch(/gesture_p14\.py:1143-1145/);
  });
  it("棲み分けが成立していれば源流閾値も満たす（記録値）", () => {
    expect(bandOverlapDiagnostic(BASS, PIANO).value.withinSourceGate8).toBe(true);
  });
});

describe("数値の出所（§6-4 #11・負の知識16）", () => {
  it("ゲート閾値は 0.10（gate8）であって 0.34（_FV_TAU＝フィル近重複）ではない", () => {
    expect(SRC_GATE8_OVERLAP_FRAC_MAX).toBe(0.10);
    const dir = new URL("../src/verify/", import.meta.url).pathname;
    const texts = readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(dir, f), "utf8"));
    // 0.34 が「閾値として」紛れ込んでいないこと（言及は負の知識のコメントのみ＝行に「フィル近重複」がある）。
    for (const t of texts) {
      for (const line of t.split("\n")) {
        if (line.includes("0.34")) expect(line).toMatch(/レーベンシュタイン|フィル近重複/);
      }
    }
  });
});
