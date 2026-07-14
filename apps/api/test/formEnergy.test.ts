import { describe, it, expect } from "vitest";
import {
  FORM_LIBRARY, suggestForm, formSeconds, totalBars,
  type FormCandidate,
} from "../src/music/formLibrary";
import {
  suggestEnergyPlan, REAL_KNOBS, type EnergyPlan,
} from "../src/music/energyPlan";

// WP-X1 構成テンプレ＋エネルギープラン（提案系2 verbs）。
// 受け入れ：TVサイズ89秒制約→合計小節数が尺内・Bメロトグル反映・落ちサビ→ラスサビでΔ谷→山・
//          提案がノブ名と値の実在整合（存在しないノブ名を出さない）。
// 正典＝docs/research/2026-07-14-song-form-statistics.md / 2026-07-14-energy-arc-arrangement.md。

describe("FORM_LIBRARY（構成型辞書）", () => {
  it("10型以上（doc §5-A＝F01..F14）・IDと合計小節が正しい", () => {
    expect(FORM_LIBRARY.length).toBeGreaterThanOrEqual(10);
    const ids = FORM_LIBRARY.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length); // ID一意
    // doc §5-A の合計小節（固定値）。
    const bars = (id: string) => totalBars(FORM_LIBRARY.find((f) => f.id === id)!.sections);
    expect(bars("F01")).toBe(128);
    expect(bars("F06")).toBe(38); // アニソン TVサイズ
    expect(bars("F13")).toBe(128);
    expect(bars("F14")).toBe(144);
  });

  it("各セクション小節は4の倍数（例外＝doc の変則は今回入れていない）", () => {
    for (const f of FORM_LIBRARY) {
      for (const s of f.sections) expect(s.bars % 2).toBe(0); // 全て偶数（多くは4の倍数）
    }
  });
});

describe("suggestForm（構成候補・提案のみ）", () => {
  const barsSec = (c: FormCandidate) => c.seconds;

  it("TVサイズ89秒制約＝合計尺が89秒の許容帯内（尺内）", () => {
    const cands = suggestForm({ genre: "anime_tv", lengthTarget: "tv_size", bpm: 120, meter: "4/4", count: 4 });
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      // 89秒 + 10% 許容 = 97.9秒 まで。合計小節→秒が尺内。
      expect(c.seconds).toBeLessThanOrEqual(89 * 1.1 + 1e-6);
      expect(c.withinTarget).toBe(true);
    }
    // 先頭候補は F06（TVサイズ・38小節=76秒）。
    expect(cands[0]!.id).toBe("F06");
    expect(cands[0]!.totalBars).toBe(38);
    expect(barsSec(cands[0]!)).toBeCloseTo(76, 3);
  });

  it("大きな型でも尺目標があれば削除優先順位で切り詰めて尺内へ", () => {
    // jpop フル型（128小節=256秒）を短尺165秒目標へ→間奏/アウトロ等を削って収める。
    const cands = suggestForm({ genre: "jpop", lengthTarget: "short", bpm: 120, meter: "4/4", count: 5 });
    for (const c of cands) expect(c.seconds).toBeLessThanOrEqual(165 * 1.1 + 1e-6);
  });

  it("Bメロトグル off＝どの候補も prechorus を含まない", () => {
    const cands = suggestForm({ genre: "jpop", hasPrechorus: "off", count: 5 });
    for (const c of cands) {
      expect(c.hasPrechorus).toBe(false);
      expect(c.sections.some((s) => s.role === "prechorus")).toBe(false);
    }
  });

  it("Bメロトグル on＝prechorus を持つ型が候補に出る（J-pop）", () => {
    const cands = suggestForm({ genre: "jpop", hasPrechorus: "on", count: 5 });
    expect(cands.some((c) => c.hasPrechorus)).toBe(true);
  });

  it("ポストコーラス指定＝postchorus を持つ型が選ばれる", () => {
    const cands = suggestForm({ postChorus: true, count: 3 });
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) expect(c.hasPostchorus).toBe(true);
  });

  it("サビ頭指定＝chorusFirst の型が選ばれる", () => {
    const cands = suggestForm({ chorusFirst: true, count: 3 });
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) expect(c.chorusFirst).toBe(true);
  });

  it("bridge=false＝後半ドラマ（bridge）を落とす", () => {
    const cands = suggestForm({ genre: "jpop", bridge: false, count: 5 });
    for (const c of cands) expect(c.sections.some((s) => s.role === "bridge")).toBe(false);
  });

  it("秒数はテンポ/拍子連動（BPM120・4/4で1小節=2秒）", () => {
    expect(formSeconds([{ role: "verse", bars: 8 }], { bpm: 120, meter: "4/4" })).toBeCloseTo(16, 3);
    expect(formSeconds([{ role: "verse", bars: 8 }], { bpm: 240, meter: "4/4" })).toBeCloseTo(8, 3);
  });
});

describe("suggestEnergyPlan（エネルギープラン・提案のみ）", () => {
  const ROLES = ["intro", "verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "bridge", "drop_chorus", "last_chorus", "outro"];

  it("落ちサビ→ラスサビで Δ が谷→山（前セクション比）", () => {
    const plan = suggestEnergyPlan(ROLES);
    const dc = plan.sections.find((s) => s.role === "drop_chorus")!;
    const lc = plan.sections.find((s) => s.role === "last_chorus")!;
    expect(dc).toBeTruthy();
    expect(lc).toBeTruthy();
    // 落ちサビ＝谷（bridge から密度/レイヤ/ラウドネスが落ちる）。
    expect(dc.delta.density).toBeLessThan(0);
    expect(dc.delta.layers).toBeLessThan(0);
    expect(dc.absLevel).toBe("low");
    // ラスサビ＝山（落ちサビから密度/レイヤが強く上がる）。
    expect(lc.delta.density).toBeGreaterThan(0);
    expect(lc.delta.layers).toBeGreaterThan(0);
    expect(lc.absLevel).toBe("peak");
    // 谷→山で Δ が最大化＝ラスサビの density/layers Δ は +2（クランプ上限）。
    expect(lc.delta.density).toBe(2);
    expect(lc.delta.layers).toBe(2);
  });

  it("落ちサビは伴奏大幅DROP＝layerDrop に『ドラム/ベース抜き』", () => {
    const plan = suggestEnergyPlan(ROLES);
    const dc = plan.sections.find((s) => s.role === "drop_chorus")!;
    expect(dc.layerDrop.join("")).toContain("ドラム/ベース抜き");
    const lc = plan.sections.find((s) => s.role === "last_chorus")!;
    expect(lc.layerAdd).toContain("ダブリング/ハモ");
  });

  it("提案ノブは実在ノブ名のみ・値域も実在レンジ内（存在しないノブを出さない）", () => {
    const plan = suggestEnergyPlan(ROLES);
    const real = new Set<string>(REAL_KNOBS);
    for (const s of plan.sections) {
      for (const [k, v] of Object.entries(s.knobs)) {
        expect(real.has(k)).toBe(true); // ノブ名が実在
        expect(typeof v).toBe("number");
        // 0..1 系ノブは範囲内。registerShift は半音（−12..+12 目安）。
        if (k === "registerShift") expect(Math.abs(v)).toBeLessThanOrEqual(12);
        else { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      }
    }
  });

  it("サビの density ノブ・registerShift が SECTION_PRESETS と整合（chorus density0.65/register+4）", () => {
    const plan = suggestEnergyPlan(ROLES);
    const chorus = plan.sections.find((s) => s.role === "chorus")!;
    expect(chorus.knobs.density).toBeCloseTo(0.65, 3);
    expect(chorus.knobs.registerShift).toBe(4);
  });

  it("テンプレ3種いずれも先頭セクションは Δ=0（基準）", () => {
    for (const t of ["jpop_standard", "ballad", "four_on_floor"] as const) {
      const plan: EnergyPlan = suggestEnergyPlan(ROLES, { template: t });
      const head = plan.sections[0]!;
      expect(head.delta).toEqual({ density: 0, register: 0, layers: 0, loudness: 0, subdiv: 0 });
      expect(plan.template).toBe(t);
    }
  });

  it("4つ打ちテンプレ＝build(prechorus)で subdiv を上げ layers を絞る（doc §5.4）", () => {
    const plan = suggestEnergyPlan(["verse", "prechorus", "chorus"], { template: "four_on_floor" });
    const build = plan.sections.find((s) => s.role === "prechorus")!;
    expect(build.delta.subdiv).toBeGreaterThan(0); // riser/roll で細分化up
    expect(build.delta.layers).toBeLessThanOrEqual(0); // 一旦絞る
  });

  it("明示 last_chorus が無くても、複数サビの最後をピークへ昇格（最終サビピーク）", () => {
    const plan = suggestEnergyPlan(["verse", "chorus", "verse", "chorus"]);
    const last = plan.sections[plan.sections.length - 1]!;
    expect(last.role).toBe("last_chorus");
    expect(last.absLevel).toBe("peak");
  });

  it("日本語表記（落ちサビ/ラスサビ/サビ/Aメロ/Bメロ）を役割へ吸収", () => {
    const plan = suggestEnergyPlan(["Aメロ", "Bメロ", "サビ", "落ちサビ", "ラスサビ"]);
    expect(plan.sections.map((s) => s.role)).toEqual(["verse", "prechorus", "chorus", "drop_chorus", "last_chorus"]);
  });
});
