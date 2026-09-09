// M4 coverage＝「検証が実際に効いた割合」を数値で出す（§6-4 #3 #7）。
// (A) 検査の被覆率＝各 Verdict の coverage／(B) パートの被覆率＝源流 ensemble.py coverage_metrics。
import { describe, it, expect } from "vitest";
import {
  assertGate, bandGapGate, coverageOf, coverageSummary, gate, grooveLimbGate,
  partCoverage, partCoverageGate, type CoveredPart,
} from "../src/index";

const barLen = 4; // 4/4・拍単位
// 4小節を最後まで鳴らす2パート。
const full = (name: string, pitchStarts: number[]): CoveredPart => ({ name, notes: pitchStarts.map((s) => ({ start: s, dur: 1 })) });
const BASS = full("bass", [0, 2, 4, 6, 8, 10, 12, 14, 15]);
const CHORDS = full("chords", [0, 4, 8, 12, 15]);

describe("パート被覆率（源流 coverage_metrics の移植）", () => {
  it("最後まで鳴っているパートは span_frac=1・bars_covered=1・dropout なし", () => {
    const rep = partCoverage([BASS, CHORDS], barLen);
    expect(rep.nBars).toBe(4);
    expect(rep.parts.every((p) => p.spanFrac === 1 && p.barsCoveredFrac === 1 && !p.dropout)).toBe(true);
    expect(rep.warnings).toEqual([]);
  });
  it("陰性対照①：無音のパートは SILENT で捕まる（黙って落ちても隠れない）", () => {
    const rep = partCoverage([BASS, { name: "guitar", notes: [] }], barLen);
    expect(rep.warnings.join()).toMatch(/guitar: SILENT/);
    expect(rep.parts[1]!.dropout).toBe(true);
  });
  it("陰性対照②：途中で切れるパートは DROPOUT（源流のギター統合バグの形）", () => {
    const g = partCoverageGate([BASS, full("guitar", [0, 1, 2, 3])], barLen);
    expect(g.pass).toBe(false);
    expect(g.problems.join()).toMatch(/guitar: DROPOUT span_frac=0\.25/);
    expect(() => assertGate(g)).toThrow(/coverage\.parts/);
  });
  it("陰性対照③：末尾は鳴っていても途中に穴があれば bars_covered が落ちる", () => {
    const holed = full("keys", [0, 1, 12, 13, 15]); // 2・3小節目が空
    const rep = partCoverage([BASS, holed], barLen);
    expect(rep.parts[1]!.spanFrac).toBe(1);          // 末尾だけ見ると健全に見える
    expect(rep.parts[1]!.barsCoveredFrac).toBe(0.5); // 穴はここで出る
  });
  it("変異検査：末尾の音を削っていくと、span_frac が 0.9 を割った瞬間に落ちる", () => {
    const notes = [0, 2, 4, 6, 8, 10, 12, 14, 15];
    const cut = (k: number) => partCoverageGate([BASS, full("x", notes.slice(0, notes.length - k))], barLen);
    expect(cut(0).pass).toBe(true);
    expect(cut(0).detail.parts[1]!.spanFrac).toBe(1);
    expect(cut(1).detail.parts[1]!.spanFrac).toBe(0.9375); // まだ 0.9 以上＝通る
    expect(cut(1).pass).toBe(true);
    expect(cut(2).detail.parts[1]!.spanFrac).toBe(0.8125); // ここで割る
    expect(cut(2).pass).toBe(false);
  });
});

describe("検査の被覆率のまとめ（空虚な検査を名指しする）", () => {
  it("効いていない検査を vacuous として並べる（赤にはしない＝数で見せる）", () => {
    const bandOk = bandGapGate([28, 40], [60, 64]);
    const soloGroove = grooveLimbGate([{ name: "Kick", midi: 36, hits: [0, 4] }]); // 同時打点なし＝空虚
    const s = coverageSummary([bandOk, soloGroove]);
    expect(s.kind).toBe("diagnostic");
    expect(s.value.vacuous).toEqual(["limbs.groove"]);
    expect(s.value.checks).toBe(2);
    expect(s.value.meanFrac).toBe(0.5);
  });
  it("被覆率 0 のゲートばかりなら meanFrac 0＝『何でも通す検査』が一目で分かる", () => {
    const s = coverageSummary([gate("a", true, coverageOf(0, 5), "-", [], null), gate("b", true, coverageOf(0, 0), "-", [], null)]);
    expect(s.value.meanFrac).toBe(0);
    expect(s.value.vacuous).toEqual(["a", "b"]);
  });
});
