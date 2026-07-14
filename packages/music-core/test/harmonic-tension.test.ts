import { describe, it, expect } from "vitest";
import {
  chromaVector,
  tivOfPcs,
  tivNorm,
  dissonance,
  keyTIV,
  tivAngle,
  tensionProfile,
  detectModalLoop,
  scoreCandidate,
  harmonicTensionLens,
  cadenceRelief,
  fitToBand,
  rankByTension,
  TIV_WEIGHTS,
  TENSION_BANDS,
  type TensionChord,
} from "../src/index";

// WP-C4 和声張力カーブレンズ（TIS）。正典＝docs/research/2026-07-14-harmonic-tension-curve.md。
// 思想＝審判でなく設計レンズ＝候補を弾かず並べ替えるだけ・単一正解を出さない・モーダルループで降格。
// 固定値テスト＝単一pc の TIV（DFT 手計算）と不協和の両端。相対テスト＝ドミナント>トニック・偽終止非減点。

const pc = (r: number, iv: number[]): number[] => iv.map((i) => ((r + i) % 12 + 12) % 12);
const maj = (r: number) => pc(r, [0, 4, 7]);
const min = (r: number) => pc(r, [0, 3, 7]);
const dom7 = (r: number) => pc(r, [0, 4, 7, 10]);
const chords = (list: number[][]): TensionChord[] => list.map((pcs) => ({ pcs }));

describe("TIV（DFT→6次元・固定値／研究 §2.1）", () => {
  it("単一pc {0} の TIV ＝各次元が重みそのもの（DFT の DC 位相・手計算）", () => {
    const t = tivOfPcs([0]);
    // n=0 のみ・ang=0 → cos=1,sin=0 → re[k]=w[k], im[k]=0。
    expect(t.re.map((x) => Math.round(x * 100) / 100)).toEqual([...TIV_WEIGHTS]);
    expect(t.im.every((x) => Math.abs(x) < 1e-9)).toBe(true);
  });
  it("単一pc のノルム＝sqrt(Σw^2)＝中心から最遠（最協和の縁）", () => {
    const expected = Math.sqrt(TIV_WEIGHTS.reduce((a, w) => a + w * w, 0));
    expect(tivNorm(tivOfPcs([0]))).toBeCloseTo(expected, 6);
  });
  it("移調不変：pc集合を移調してもノルム（＝不協和）は不変", () => {
    expect(tivNorm(tivOfPcs(maj(0)))).toBeCloseTo(tivNorm(tivOfPcs(maj(7))), 9);
  });
  it("クロマは集合（重複pcを畳む）", () => {
    expect(chromaVector([0, 0, 12, 4, 7])).toEqual([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
  });
});

describe("不協和 c＝1−‖T‖/M（研究 §2.2・§4：両端固定＋テンションで単調増）", () => {
  it("単一pc＝0（最協和）／全12pc＝1（最不協和）", () => {
    expect(dissonance([0])).toBeCloseTo(0, 6);
    expect(dissonance([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBeCloseTo(1, 6);
    expect(dissonance([])).toBe(0);
  });
  it("テンションを積むほど単調増（三和音<7th<9th）＝別ロジック不要（研究 §4.1）", () => {
    const triad = dissonance(maj(0));
    const seventh = dissonance(dom7(0));
    const ninth = dissonance([0, 4, 7, 11, 2]);
    expect(triad).toBeLessThan(seventh);
    expect(seventh).toBeLessThan(ninth);
  });
});

describe("キー角度距離 d2（トニック＝安息点／研究 §5.2）", () => {
  it("トニック三和音はキーと角度0（安息）／ドミナントは遠い／♭II はさらに遠い", () => {
    const K = keyTIV(0, "major");
    const aI = tivAngle(tivOfPcs(maj(0)), K);
    const aV = tivAngle(tivOfPcs(maj(7)), K);
    const abII = tivAngle(tivOfPcs(maj(1)), K);
    expect(aI).toBeCloseTo(0, 6);
    expect(aV).toBeGreaterThan(aI);
    expect(abII).toBeGreaterThan(aV);
  });
});

describe("張力プロファイル（単調性：ドミナント>トニック／研究 §5・受け入れ）", () => {
  it("I–IV–V7–I：V7 の張力がトニック(頭/末)より高い＝終止に向け解けるアーチ", () => {
    const prof = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), maj(5), dom7(7), maj(0)]));
    const t = prof.curve.map((p) => p.tension);
    expect(prof.modalLoop).toBe(false);
    expect(t[2]!).toBeGreaterThan(t[0]!); // V7 > I(頭)
    expect(t[2]!).toBeGreaterThan(t[3]!); // V7 > I(末＝解決)
    expect(prof.curve).toHaveLength(4);
    expect(t.every((x) => x >= 0 && x <= 1)).toBe(true);
  });
  it("bass≠root（転回）は表面張力 ss を加算（研究 §1.3）", () => {
    const rootPos = tensionProfile({ tonic: 0, mode: "major" }, [{ pcs: maj(0), root: 0, bass: 0 }]);
    const inverted = tensionProfile({ tonic: 0, mode: "major" }, [{ pcs: maj(0), root: 0, bass: 4 }]);
    expect(inverted.curve[0]!.components.ss).toBeGreaterThan(rootPos.curve[0]!.components.ss);
  });
});

describe("モーダルループ降格（研究 §6-3・task「機能進行が薄い＝降格」）", () => {
  it("機能進行（I–IV–V7–I）は降格しない＝score が付く", () => {
    const prof = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), maj(5), dom7(7), maj(0)]));
    expect(prof.modalLoop).toBe(false);
    expect(scoreCandidate(prof, "verse")).not.toBeNull();
  });
  it("エオリアン循環 i–♭VII–♭VI–♭VII（ドミナント不在・宙吊り）は降格（score=null）", () => {
    const prof = tensionProfile({ tonic: 9, mode: "minor" }, chords([min(9), maj(7), maj(5), maj(7)]));
    expect(prof.modalLoop).toBe(true);
    expect(scoreCandidate(prof, "verse")).toBeNull();
    expect(harmonicTensionLens({ tonic: 9, mode: "minor" }, chords([min(9), maj(7), maj(5), maj(7)]), "verse").warning).toBeTruthy();
  });
  it("アクシス I–V–vi–IV（機能希薄ループ）は降格", () => {
    const prof = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), maj(7), min(9), maj(5)]));
    expect(prof.modalLoop).toBe(true);
  });
  it("ペダル/ドローン（同一和音の連続＝平坦）は降格", () => {
    const prof = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), maj(0), maj(0), maj(0)]));
    expect(prof.modalLoop).toBe(true);
  });
  it("2和音以下は降格判定しない（短すぎ）", () => {
    expect(detectModalLoop(chords([maj(0), maj(7)]), [{ d2: 0 }, { d2: 1 }], [0.2, 0.5])).toBe(false);
  });
});

describe("偽終止/IV–I は減点しない（研究 §3.2・§5.4・受け入れ）", () => {
  it("cadenceRelief：verse は解決/未解決を中立（偽終止 V7–vi を罰しない）", () => {
    const authentic = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), maj(5), dom7(7), maj(0)]));
    const deceptive = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), maj(5), dom7(7), min(9)]));
    // verse では終止型で relief に差を付けない＝偽終止でも減点なし。
    expect(cadenceRelief(authentic.curve, "verse")).toBe(cadenceRelief(deceptive.curve, "verse"));
  });
  it("prechorus/bridge は高張力の終端（宙吊り＝未解決の快）を良とする＝relief が高い", () => {
    const rising = tensionProfile({ tonic: 0, mode: "major" }, chords([maj(0), min(2), maj(5), dom7(7)]));
    expect(cadenceRelief(rising.curve, "prechorus")).toBeGreaterThan(0.3);
  });
});

describe("役割別帯・並べ替え（研究 §5.4-5・機械は候補まで）", () => {
  it("役割帯テーブルが全役割を持つ", () => {
    for (const r of ["verse", "prechorus", "chorus", "bridge"]) expect(TENSION_BANDS[r]).toBeDefined();
  });
  it("fitToBand：帯に完全に乗るカーブは 0 逸脱", () => {
    // 全点が verse 帯 [0.15,0.45] 内のカーブ→逸脱0。
    const curve = [0.3, 0.3, 0.3, 0.3].map((tension, index) => ({ index, tension, components: { c: 0, d2: 0, d1: 0, ss: 0 } }));
    expect(fitToBand(curve, "verse")).toBe(0);
  });
  it("rankByTension：score 高い候補が上位・null（降格）は原順で末尾", () => {
    const order = rankByTension([{ score: 0.1 }, { score: null }, { score: 0.5 }, { score: null }]);
    expect(order).toEqual([2, 0, 1, 3]);
  });
  it("rankByTension：同点は生成順（安定）＝既定=生成順の流儀", () => {
    expect(rankByTension([{ score: 0.4 }, { score: 0.4 }, { score: 0.4 }])).toEqual([0, 1, 2]);
  });
});
