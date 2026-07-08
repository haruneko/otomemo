import { describe, it, expect } from "vitest";
// Aクラスタ（短調ドミナント統一・design.md #12-M 2026-07-08 正準方針）の契約テスト。
// 方針＝V7維持・メロが追従：(1)コード音は調外でも歌える (2)4モジュールの短調表を統一
// (3)機能/終止判定は品質込み（♭VII→i を「完全終止」と誤ラベルしない・vii°→i を検出）。

describe("A2/A3: コード音は調外でも歌える（nearestChordTonePitch）", () => {
  it("Am自然的短音階の枠外でも E7 の導音 G# に乗れる", async () => {
    const { nearestChordTonePitch } = await import("../src/music/melodyCells");
    // E7 = {4,8,11,2}。target=G4(67) の最寄りコード音は G#4(68)（旧: スケール∩コードで E(64) に落ちた）
    expect(nearestChordTonePitch(67, [4, 8, 11, 2], 57, 83)).toBe(68);
    // セカンダリードミナント C7 の b7(B♭=10) にも乗れる（Cメジャースケール外）
    expect(nearestChordTonePitch(70, [0, 4, 7, 10], 57, 83)).toBe(70);
    // 同距離タイは低い方（既存 nearestPitchWithPc と同じ規約）
    expect(nearestChordTonePitch(66, [4, 8], 57, 83)).toBe(64); // 66から E(64)とG#(68)は等距離2→低い方
    // 範囲外は返さない（範囲内の最寄りへ）
    expect(nearestChordTonePitch(58, [0], 60, 83)).toBe(60);
    // 空pcsは target 素通し（呼び手でフォールバック）
    expect(nearestChordTonePitch(67, [], 57, 83)).toBe(67);
  });

  it("V2統合: Am の V7(E7) 小節で G♮ を歌わず、導音 G# が到達可能", async () => {
    const { genMotifMelodyV2, loadMotifModel16, scalePitchList } = await import("../src/music/melodyCells");
    const { scalePcs, chordPcs } = await import("../src/music/theory");
    const motif16 = loadMotifModel16();
    // Am | E7 | Am | E7 ×2＝8小節（tonicPc=9・自然的短音階）
    const ROOTS = [9, 4, 9, 4, 9, 4, 9, 4];
    const QUALS = ["m", "7", "m", "7", "m", "7", "m", "7"];
    const sp = scalePitchList(scalePcs(9, "minor"), 60, 84); // 本番genMelodyと同じ音域（57始まりだと骨格のtonicレジスタ選択が最低域に張り付く既知の境界クセ）
    const pcs = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));
    let sawLeadingTone = false;
    for (let seed = 1; seed <= 12; seed++) {
      const notes = genMotifMelodyV2(pcs, ROOTS, QUALS, sp, motif16, { seed, tonicPc: 9, minor: true });
      for (const n of notes) {
        const bar = Math.floor(n.start / 4);
        if (bar < 8 && QUALS[bar] === "7") {
          const pc = ((n.pitch % 12) + 12) % 12;
          expect(pc, `seed=${seed} bar=${bar} t=${n.start}: G♮ over E7`).not.toBe(7); // ♭7̂とG#の半音衝突禁止
          if (pc === 8) sawLeadingTone = true;
        }
      }
    }
    expect(sawLeadingTone).toBe(true); // 導音がV7上で実際に使われる（旧: 構造的に到達不能）
  });
});

describe("A4: 短調ダイアトニック表の統一（V7を全モジュールが知る）", () => {
  it("harmonize: V7 を輪郭に持つメロの小節は E系ドミナント が候補上位", async () => {
    const { harmonize } = await import("../src/music/harmonize");
    // Am 調で E-G#-B-D を歌う小節
    const melody = [
      { pitch: 64, start: 0, dur: 1 },
      { pitch: 68, start: 1, dur: 1 },
      { pitch: 71, start: 2, dur: 1 },
      { pitch: 74, start: 3, dur: 1 },
    ];
    const out = harmonize(melody, 9, { mode: "minor", top: 3 });
    const top = out[0]!.candidates[0]!;
    expect(top.root).toBe(4); // E
    expect(top.quality).toBe("7"); // ドミナント（旧: "m"＝導音G#を支えられずEmにもならない採点だった）
  });
  it("continuation: 短調の D→T 候補にドミナント品質のVが出る・♭VIIも提案から消えない", async () => {
    const { nextChordCandidates } = await import("../src/music/continuation");
    const afterI = nextChordCandidates([{ degree: 0, quality: "m" }], { mode: "minor", top: 8 });
    const degs = afterI.map((c) => `${c.degree}:${c.quality}`);
    expect(degs).toContain("7:7"); // V7（旧: 7:m）
    expect(degs).toContain("10:"); // ♭VII（SUB化しても提案に残る）
    const afterV = nextChordCandidates([{ degree: 7, quality: "7" }], { mode: "minor", top: 4 });
    expect(afterV[0]!.degree).toBe(0); // V7→i 解決が先頭
  });
  it("substitute: 短調Vの機能代理に ♭VII が出ない・vii° は出る", async () => {
    const { substitutesOf } = await import("../src/music/substitute");
    const subs = substitutesOf({ degree: 7, quality: "7" }, { mode: "minor" });
    const functional = subs.filter((s) => s.kind === "functional").map((s) => s.degree);
    expect(functional).not.toContain(10); // ♭VIIはVの代理でない（backdoorは別kind）
    expect(functional).toContain(11); // vii°＝導音ドミナントは正当な代理
  });
});

describe("A5/A6/A7: 終止判定は品質込み（function.ts）", () => {
  it("♭VII→i は authentic でなく modal", async () => {
    const { cadenceOf } = await import("../src/music/function");
    const c = cadenceOf([{ degree: 10, quality: "" }, { degree: 0, quality: "m" }], "minor");
    expect(c.type).toBe("modal");
  });
  it("v(m)→i も authentic でなく modal", async () => {
    const { cadenceOf } = await import("../src/music/function");
    const c = cadenceOf([{ degree: 7, quality: "m" }, { degree: 0, quality: "m" }], "minor");
    expect(c.type).toBe("modal");
  });
  it("V7→i は authentic（従来通り）／vii°→i も authentic（旧: none）", async () => {
    const { cadenceOf } = await import("../src/music/function");
    expect(cadenceOf([{ degree: 7, quality: "7" }, { degree: 0, quality: "m" }], "minor").type).toBe("authentic");
    expect(cadenceOf([{ degree: 11, quality: "dim" }, { degree: 0, quality: "m" }], "minor").type).toBe("authentic");
  });
  it("♭VII 終わりは half でない（旧: 緊張のない下主音を half 扱い）", async () => {
    const { cadenceOf } = await import("../src/music/function");
    const c = cadenceOf([{ degree: 0, quality: "m" }, { degree: 10, quality: "" }], "minor");
    expect(c.type).not.toBe("half");
  });
  it("V7 終わりは half（従来通り）／長調の V→I authentic・IV→I plagal 後退なし", async () => {
    const { cadenceOf } = await import("../src/music/function");
    expect(cadenceOf([{ degree: 0, quality: "m" }, { degree: 7, quality: "7" }], "minor").type).toBe("half");
    expect(cadenceOf([{ degree: 7, quality: "" }, { degree: 0, quality: "" }], "major").type).toBe("authentic");
    expect(cadenceOf([{ degree: 5, quality: "" }, { degree: 0, quality: "" }], "major").type).toBe("plagal");
    expect(cadenceOf([{ degree: 7, quality: "" }, { degree: 9, quality: "m" }], "major").type).toBe("deceptive");
  });
});
