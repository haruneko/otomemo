// 錨の厳しさ（design.md 追補 (k-6)・2026-09-15 オーナー裁定「変わり目だけ必須」）の移植関数レベルのテスト。
// **既定＝every-kick（源流互換）**＝py-parity 110件（anchor-lock-parity.test.ts）はこの既定で緑のまま。
// chord-change＝コード区間に入って最初のキックだけルート必須・滞在中のキックは許容音なら据え置き。
import { describe, it, expect } from "vitest";
import { lockBassRootsToSheet, type AnchorOnset, type AnchorSeg } from "../src/anchorLock";
import { loadCase, rows } from "./pyParity";

const on = (step: number, pitch: number, role = "answer"): AnchorOnset => ({ step, kind: "note", anchor: false, role, pitch, deg: "x" });
// A(9) を1小節・F(5) を1小節。低域窓は otomemo の [33,48]。
const SEGS: AnchorSeg[] = [{ rootPc: 9, startStep: 0, lengthSteps: 16 }, { rootPc: 5, startStep: 16, lengthSteps: 16 }];
const BASE = { stepsPerBar: 16, nBars: 2, accents: [] as number[], lo: 33, hi: 48, rootDeg: "R" };
const pcOf = (p: number) => ((p % 12) + 12) % 12;

describe("既定は every-kick（源流の厳格モード）＝py-parity を捨てない", () => {
  it("strictness 未指定 ＝ every-kick 明示（py-parity ケースで列一致）", () => {
    const c = loadCase("pedal_answer__amfcg__kdense__restA");
    const opt = { stepsPerBar: c.stepsPerBar, nBars: c.nBars, kick: c.kick, accents: c.accents, restOnSyncopatedKick: c.restOnSyncopatedKick, lo: c.lo, hi: c.hi, rootDeg: "0" };
    expect(rows(lockBassRootsToSheet(c.body, c.segs, opt).onsets)).toEqual(c.expected);
    expect(rows(lockBassRootsToSheet(c.body, c.segs, { ...opt, strictness: "every-kick" }).onsets)).toEqual(c.expected);
  });
});

describe("chord-change＝変わり目のキックはルート・滞在中は許容音を据え置き", () => {
  // bar0 (A): 0=A(45) 8=E(40・5度) 10=G(43・b7) 12=A#(46・非許容)／bar1 (F): 16=C(36・5度だが変わり目) 24=Eb(39・b7)
  const body = [on(0, 45, "head"), on(8, 40), on(10, 43), on(12, 46), on(16, 36), on(24, 39)];
  const kick = [0, 8, 10, 12];

  it("every-kick は全キックをルートへ（従来）", () => {
    const r = lockBassRootsToSheet(body, SEGS, { ...BASE, kick });
    for (const s of [0, 8, 10, 12, 16, 24, 26, 28]) {
      const o = r.onsets.find((x) => x.step === s);
      if (o) expect(pcOf(o.pitch), `step ${s}`).toBe(s < 16 ? 9 : 5);
    }
    expect(r.report.kept).toBe(0);
  });

  it("chord-change：5度・b7 の滞在中キックは据え置き、非許容音と変わり目は上書き", () => {
    const r = lockBassRootsToSheet(body, SEGS, { ...BASE, kick, strictness: "chord-change" });
    const at = (s: number) => r.onsets.find((x) => x.step === s)!;
    expect(at(0).pitch).toBe(45);        // 変わり目・既にルート＝昇格
    expect(at(8).pitch).toBe(40);        // 滞在中・5度＝据え置き
    expect(at(10).pitch).toBe(43);       // 滞在中・b7＝据え置き
    expect(pcOf(at(12).pitch)).toBe(9);  // 滞在中・非許容音＝ルートへ
    expect(pcOf(at(16).pitch)).toBe(5);  // 変わり目・5度でもルートへ（必須）
    expect(at(24).pitch).toBe(39);       // bar1 の滞在中 b7(Eb)＝据え置き
    expect([at(8), at(10), at(24)].every((o) => o.anchor)).toBe(true); // 錨として数える
    expect(r.report.kept).toBe(3);
    expect(r.report.overwritten).toBe(2);
    expect(r.report.coverage).toBe(1);
  });

  it("変わり目＝区間に入って最初のキック（区間頭ちょうどでなくてもよい）", () => {
    const b2 = [on(4, 40), on(8, 40), on(20, 36), on(24, 36)]; // A区間の E(5度)・F区間の C(5度)
    const r = lockBassRootsToSheet(b2, SEGS, { ...BASE, kick: [4, 8], strictness: "chord-change" });
    const at = (s: number) => r.onsets.find((x) => x.step === s)!;
    expect(pcOf(at(4).pitch)).toBe(9);  // A 区間の最初のキック＝変わり目
    expect(at(8).pitch).toBe(40);        // 2つ目＝滞在中
    expect(pcOf(at(20).pitch)).toBe(5); // F 区間の最初のキック
    expect(at(24).pitch).toBe(36);
  });

  it("stayPcs を渡すとその集合で判定する（例：A7 以外の b7 を許さない表）", () => {
    const segs: AnchorSeg[] = SEGS.map((s) => ({ ...s, stayPcs: s.rootPc === 9 ? [9, 0, 4] : [5, 9, 0] }));
    const r = lockBassRootsToSheet(body, segs, { ...BASE, kick, strictness: "chord-change" });
    const at = (s: number) => r.onsets.find((x) => x.step === s)!;
    expect(at(8).pitch).toBe(40);       // E＝表にある
    expect(pcOf(at(10).pitch)).toBe(9); // G＝表に無い＝ルートへ
  });

  it("案B（拍頭でない無音キックは休む）は滞在中のキックだけに効き、変わり目のキックは必ず挿入する", () => {
    // F 区間の最初のキックが拍頭でない step 22 に来る（体は休符）
    const r = lockBassRootsToSheet([on(0, 45, "head")], SEGS, { ...BASE, kick: [0, 6], restOnSyncopatedKick: true, strictness: "chord-change" });
    const steps = r.onsets.map((o) => o.step);
    expect(steps).toContain(0);
    expect(steps).not.toContain(6);   // A 区間の滞在中・シンコペ・無音＝休む
    expect(steps).toContain(16);      // F 区間の最初のキック（拍頭）
    expect(steps).not.toContain(22);
    const r2 = lockBassRootsToSheet([on(0, 45, "head")], SEGS, { ...BASE, kick: [6], restOnSyncopatedKick: true, strictness: "chord-change" });
    expect(r2.onsets.map((o) => o.step)).toEqual([0, 6, 22]); // 変わり目のシンコペ無音キック＝必ず挿す
    expect(pcOf(r2.onsets.find((o) => o.step === 22)!.pitch)).toBe(5);
  });
});
