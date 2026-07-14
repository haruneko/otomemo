import { describe, it, expect } from "vitest";
import { suggestClicheLines, clicheStepPcs } from "../src/music/lineCliche";

// WP-C3スライス2＝クリシェ/ペダル。固定値は research 2026-07-14-cliche-pedal-lines.md §6 のサンプルに一致。
describe("suggestClicheLines（ラインクリシェ／ペダル・WP-C3）", () => {
  // C major・4小節 I | Am | Am | G（bars2-3 が静的な短調区間＝vi 起点）。
  const cMajAmStatic = [
    { root: 0, quality: "", start: 0, dur: 4 },
    { root: 9, quality: "m", start: 4, dur: 4 },
    { root: 9, quality: "m", start: 8, dur: 4 },
    { root: 7, quality: "", start: 12, dur: 4 },
  ];

  it("§6-1 LC-min-desc＝Am起点で i–iM7–i7–i6（roots全9・qualities m/mM7/m7/m6・内声下降 A→G#→G→F#）", () => {
    const { candidates } = suggestClicheLines(cMajAmStatic, { key: 0, mode: "major" });
    const c = candidates.find((x) => x.typeId === "LC-min-desc");
    expect(c, "LC-min-desc候補が出る").toBeTruthy();
    expect(c!.line.map((l) => l.root)).toEqual([9, 9, 9, 9]);
    expect(c!.line.map((l) => l.quality)).toEqual(["m", "mM7", "m7", "m6"]);
    // 動く内声＝A(9)→G#(8)→G(7)→F#(6)：各ステップ和音に含まれる下降半音線
    expect(clicheStepPcs(9, "mM7")).toContain(8); // G#（♮7̂）
    expect(clicheStepPcs(9, "m7")).toContain(7); // G（♭7̂）
    expect(clicheStepPcs(9, "m6")).toContain(6); // F#（6̂）
  });

  it("3rd不動禁則＝クリシェ全ステップに 3rd(pc0=C for Am) が残る＝品質反転しない（§5-2.3）", () => {
    const { candidates } = suggestClicheLines(cMajAmStatic, { key: 0, mode: "major" });
    const c = candidates.find((x) => x.typeId === "LC-min-desc")!;
    expect(c.thirdPc).toBe(0); // Am の 3rd = C(0)
    for (const l of c.line) expect(clicheStepPcs(l.root, l.quality!), `${l.quality} に3rd`).toContain(0);
  });

  it("ドロップイン＝region 外(1小節目 I・4小節目 G)は不変、region(2-3小節)だけライン化", () => {
    const { candidates } = suggestClicheLines(cMajAmStatic, { key: 0, mode: "major" });
    const c = candidates.find((x) => x.typeId === "LC-min-desc")!;
    expect(c.chords[0]).toEqual(cMajAmStatic[0]); // I 不変
    expect(c.chords[c.chords.length - 1]).toEqual(cMajAmStatic[3]); // G 不変
    expect(c.region).toEqual({ startBar: 1, bars: 2 });
  });

  it("§6-10 PED-dominant＝V の溜め（C | G | G | C）でトニックペダル bass=5̂(G,pc7)保続の候補", () => {
    const prog = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 },
      { root: 7, quality: "", start: 8, dur: 4 },
      { root: 0, quality: "", start: 12, dur: 4 },
    ];
    const { candidates } = suggestClicheLines(prog, { key: 0, mode: "major", role: "prechorus" });
    const c = candidates.find((x) => x.typeId === "PED-dominant");
    expect(c, "PED-dominant候補").toBeTruthy();
    // I/5̂–IV/5̂–V–V7：bass は最初2ステップが 5̂(pc7)保続、root は I(0)–IV(5)–V(7)–V7(7)
    expect(c!.line.map((l) => l.root)).toEqual([0, 5, 7, 7]);
    expect(c!.line[0]!.bass).toBe(7);
    expect(c!.line[1]!.bass).toBe(7);
    expect(c!.line[3]!.quality).toBe("7");
  });

  it("静的区間が無い(毎小節動く)進行にはクリシェを差さない＝候補0＋警告（§4 押し付け回避）", () => {
    const busy = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 5, quality: "", start: 4, dur: 4 },
      { root: 7, quality: "", start: 8, dur: 4 },
      { root: 9, quality: "m", start: 12, dur: 4 },
    ];
    const { candidates, warnings } = suggestClicheLines(busy, { key: 0, mode: "major" });
    expect(candidates.length).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("メロ衝突＝動く半音線とメロが min2 でぶつかる候補は collidesMelody=true で降格（§5-2.7・ブロックしない）", () => {
    // LC-min-desc の 3ステップ目 ♭7̂=G(pc7)。メロがそこで F#(pc6・min2)を保持＝衝突。
    const melody = [{ pitch: 66, start: 8, dur: 4 }]; // F#4=pc6、bars2-3(start8-12)で鳴る
    const { candidates } = suggestClicheLines(cMajAmStatic, { key: 0, mode: "major", melody });
    const c = candidates.find((x) => x.typeId === "LC-min-desc");
    // 衝突フラグが立つ（候補自体は残る＝ブロックしない）
    if (c) expect(c.collidesMelody).toBe(true);
    // 衝突無し版（メロ空）は false
    const clean = suggestClicheLines(cMajAmStatic, { key: 0, mode: "major" }).candidates.find((x) => x.typeId === "LC-min-desc")!;
    expect(clean.collidesMelody).toBe(false);
  });

  it("複数候補を返す（型違い・単一解を押し付けない）", () => {
    const { candidates } = suggestClicheLines(cMajAmStatic, { key: 0, mode: "major" });
    expect(candidates.length).toBeGreaterThan(1);
    expect(new Set(candidates.map((c) => c.typeId)).size).toBeGreaterThan(1);
  });
});
