import { describe, it, expect } from "vitest";
import {
  metricWeights, lhlSyncScore, noriTargetBand, noriMeter, sectionNoriLens, SYNC_REF,
  type SyncResult, type SyncMeter,
} from "../src/index";

const M44: SyncMeter = { beatsPerBar: 4, gridPerBeat: 4 }; // 4/4・16分格子・barLen=4

describe("LHL メトリック重み（度数化）", () => {
  it("4/4・16分＝階層重み（downbeat0・半拍-1・拍-2・8分-3・16分-4）", () => {
    expect(metricWeights(4, 4)).toEqual([0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4]);
  });
  it("6/8（複合・2拍×8分3）＝downbeat0・拍-1・8分-2", () => {
    expect(metricWeights(2, 3, true)).toEqual([0, -2, -2, -1, -2, -2]);
  });
});

describe("lhlSyncScore＝シンコペ密度（単声近似・被覆する強拍との差を積算）", () => {
  it("ストレート4分（拍頭のみ）＝シンコペ0", () => {
    const r = lhlSyncScore([0, 1, 2, 3], M44);
    expect(r.raw).toBe(0);
    expect(r.perBar).toBe(0);
    expect(r.bars).toBe(1);
  });
  it("& of 2 を拍3へ保持（弱拍が強拍を被覆）＝シンコペ>0", () => {
    // onset 1.5（8分裏=-3）が次 onset 3 まで＝拍3（weight-1）を被覆 → s=-1-(-3)=2。
    const r = lhlSyncScore([0, 0.5, 1.5, 3], M44);
    expect(r.raw).toBeGreaterThan(0);
    expect(r.events).toBeGreaterThanOrEqual(1);
    expect(lhlSyncScore([0, 0.5, 1.5, 3], M44).raw).toBeGreaterThan(lhlSyncScore([0, 1, 2, 3], M44).raw);
  });
  it("ダウンビートのアンティシペーション（& of 4 で食い・次小節頭を飛ばす）を検出", () => {
    // 3.5（cell14=-3）→ 次 4.5（次小節）：被覆に cell16=次downbeat(weight0) → s=3。
    const r = lhlSyncScore([0, 1, 2, 3, 3.5, 4.5], M44);
    expect(r.raw).toBeGreaterThanOrEqual(3);
    expect(r.bars).toBe(2);
  });
  it("perBar は小節数正規化・perNote は onset 数正規化・空/1音は0", () => {
    const one = lhlSyncScore([0], M44);
    expect(one.raw).toBe(0);
    const r = lhlSyncScore([0, 0.5, 1.5, 3], M44);
    expect(r.perBar).toBeCloseTo(r.raw / r.bars, 6);
    expect(r.perNote).toBeCloseTo(r.raw / r.onsets, 6);
  });
});

describe("ノリのレンズ（役割別ターゲット帯＋補正）", () => {
  it("役割別帯：Verse は低め・Chorus はピーク帯（下寄り）・Bridge は高め", () => {
    expect(noriTargetBand({ role: "verse" })).toEqual([0.15, 0.35]);
    expect(noriTargetBand({ role: "chorus" })).toEqual([0.4, 0.6]);
    expect(noriTargetBand({ role: "bridge" })).toEqual([0.5, 0.75]);
  });
  it("テンポ補正：100–120 は +・外れ（速/遅）は −", () => {
    const [lo] = noriTargetBand({ role: "chorus", tempo: 110 });
    expect(lo).toBeCloseTo(0.47, 3);
    const [lo2] = noriTargetBand({ role: "chorus", tempo: 160 });
    expect(lo2).toBeCloseTo(0.3, 3);
  });
  it("ジャンル/和声補正：funk は帯上げ・高テンションは帯下げ", () => {
    expect(noriTargetBand({ role: "chorus", genre: "funk" })[0]).toBeCloseTo(0.55, 3);
    expect(noriTargetBand({ role: "chorus", harmonyTension: 0.8 })[0]).toBeCloseTo(0.3, 3);
  });
});

// perBar を直接持つ SyncResult を作るヘルパ（レンズは perBar/perNote のみ読む）。
const mk = (perBar: number): SyncResult => ({ raw: perBar, perBar, perNote: perBar / 4, bars: 1, onsets: 4, events: 1 });

describe("noriMeter＝候補ノリメーター（正規化・ゾーン・帯適合）", () => {
  it("norm=perBar/SYNC_REF・zone 3分・帯内 fit=1", () => {
    const m = noriMeter(mk(SYNC_REF * 0.5), { role: "chorus" }); // norm=0.5 ∈ chorus[0.4,0.6]
    expect(m.norm).toBeCloseTo(0.5, 3);
    expect(m.zone).toBe("跳ねる");
    expect(m.inBand).toBe(true);
    expect(m.fit).toBe(1);
  });
  it("帯外は fit<1 だが 0 以上（弾かない＝並べ替えのみ）", () => {
    const m = noriMeter(mk(SYNC_REF * 0.05), { role: "chorus" }); // norm=0.05 << 帯
    expect(m.inBand).toBe(false);
    expect(m.fit).toBeGreaterThanOrEqual(0);
    expect(m.fit).toBeLessThan(1);
    expect(m.zone).toBe("素直");
  });
});

describe("sectionNoriLens＝層合成の飽和/アンカーガード", () => {
  it("全層同時高＝飽和・警告（弾かず注意のみ）", () => {
    const lens = sectionNoriLens({ drums: mk(8), bass: mk(8), melody: mk(9) }, { role: "chorus" });
    expect(lens.saturated).toBe(true);
    expect(lens.warnings.length).toBeGreaterThanOrEqual(1);
    expect(lens.layers.drums).toBeDefined();
    expect(lens.layers.melody).toBeDefined();
  });
  it("床（低い層）があればアンカーOK・飽和しない", () => {
    const lens = sectionNoriLens({ drums: mk(1), bass: mk(4), melody: mk(5) }, { role: "chorus" });
    expect(lens.anchorOk).toBe(true);
    expect(lens.saturated).toBe(false);
  });
  it("2層以上で床が無い（全層 norm≥0.35）＝アンカー欠如の警告", () => {
    const lens = sectionNoriLens({ drums: mk(4), bass: mk(5) }, { role: "chorus" });
    expect(lens.anchorOk).toBe(false);
    expect(lens.warnings.some((w) => w.includes("床"))).toBe(true);
  });
  it("空入力は安全（アンカーOK・飽和なし）", () => {
    const lens = sectionNoriLens({}, {});
    expect(lens.saturated).toBe(false);
    expect(lens.anchorOk).toBe(true);
    expect(lens.sumNorm).toBe(0);
  });
});
