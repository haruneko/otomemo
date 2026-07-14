import { describe, it, expect } from "vitest";
import { applyFeel, warpTime, unwarpTime, pink1f, humanizeProfile, HUMANIZE_YORE_MS, type Feel, type HumanizeWarn } from "../src/index";

type Note = { pitch: number; start: number; dur: number; vel?: number };
// ストレート格子のサンプル（8分＋16分混在＝衝突が起きうる素材）。
const straight = (): Note[] => [
  { pitch: 60, start: 0, dur: 0.5 },    // 拍頭8分
  { pitch: 62, start: 0.5, dur: 0.25 }, // 8分裏
  { pitch: 64, start: 0.75, dur: 0.25 },// 16分裏
  { pitch: 65, start: 1, dur: 0.5 },    // 次拍頭
  { pitch: 67, start: 1.5, dur: 0.5 },  // 8分裏
];

describe("feel層 applyFeel＝非破壊タイムワープ（swing/humanize）", () => {
  it("feel 無し/空/swing0＝恒等（bit一致・入力不変＝純関数）", () => {
    const src = straight();
    const snap = JSON.stringify(src);
    for (const f of [null, undefined, {}, { swing: 0 }, { humanize: 0 }] as (Feel | null | undefined)[]) {
      expect(applyFeel(src, f)).toEqual(src);
    }
    expect(JSON.stringify(src)).toBe(snap); // 入力を書き換えていない
  });

  it("warpTime：拍内区分線形・折れ点 0.5→0.5+s/6・窓境界で連続", () => {
    // s=1（2:1）：8分裏 0.5→2/3、16分 0.25→1/3・0.75→5/6、拍頭/拍末は不動。
    expect(warpTime(0, 1, 1)).toBeCloseTo(0, 6);
    expect(warpTime(0.5, 1, 1)).toBeCloseTo(2 / 3, 6);
    expect(warpTime(0.25, 1, 1)).toBeCloseTo(1 / 3, 6);
    expect(warpTime(0.75, 1, 1)).toBeCloseTo(5 / 6, 6);
    expect(warpTime(1, 1, 1)).toBeCloseTo(1, 6);     // 窓境界＝連続（次拍頭は不動）
    expect(warpTime(1.5, 1, 1)).toBeCloseTo(1 + 2 / 3, 6); // 次窓でも同型
    // s=0.5：折れ点 0.5+0.5/6 = 0.5833
    expect(warpTime(0.5, 0.5, 1)).toBeCloseTo(0.5 + 0.5 / 6, 6);
  });

  it("単調性：任意入力で start の順序が保存される（順序保存⇒衝突不能）", () => {
    for (const s of [0.3, 0.6, 0.9, 1]) {
      const warped = applyFeel(straight(), { swing: s }).map((n) => n.start);
      for (let i = 1; i < warped.length; i++) expect(warped[i]!).toBeGreaterThan(warped[i - 1]!);
    }
  });

  it("16分は入れ子で跳ね、跳ねた8分裏と衝突しない（フラムの根絶）", () => {
    // 8分裏0.5→0.667・16分0.75→0.833＝0.167差（従来の焼き込みは0.65 vs 0.75=0.10で衝突していた）。
    const w = applyFeel(straight(), { swing: 1 });
    for (let i = 1; i < w.length; i++) {
      const gap = w[i]!.start - w[i - 1]!.start;
      expect(gap).toBeGreaterThan(0.15); // どの隣接onsetも0.15拍超＝極短音/フラムが出ない
    }
  });

  it("start と end を両方写像＝長短（long-short）が正しく出る", () => {
    const w = applyFeel([
      { pitch: 60, start: 0, dur: 0.5 },   // 拍頭8分＝伸びる
      { pitch: 62, start: 0.5, dur: 0.5 }, // 8分裏＝縮む
    ], { swing: 1 });
    expect(w[0]!.start).toBeCloseTo(0, 6);
    expect(w[0]!.dur).toBeCloseTo(2 / 3, 3);   // 0→2/3 に伸長（long）
    expect(w[1]!.start).toBeCloseTo(2 / 3, 3);
    expect(w[1]!.dur).toBeCloseTo(1 / 3, 3);   // 2/3→1 に短縮（short）
    expect(w[0]!.dur).toBeGreaterThan(w[1]!.dur); // long > short
  });

  it("compound(6/8)＝スイング対象外（恒等）", () => {
    const src = straight();
    expect(applyFeel(src, { swing: 1 }, { compound: true })).toEqual(src);
  });

  it("swingUnit='sixteenth'＝16分ペアで跳ねる（窓0.5拍）", () => {
    // 16分裏 0.25→窓[0,0.5)の 0.5位置→0.5*(0.5+1/6)*2... 実質 warpTime(0.25,1,0.5)。
    expect(warpTime(0.25, 1, 0.5)).toBeCloseTo(0.5 * (0.5 + 1 / 6) / 0.5 * 0.5, 6); // = 0.5*bp
    const w = applyFeel([{ pitch: 60, start: 0.25, dur: 0.25 }], { swing: 1, swingUnit: "sixteenth" });
    expect(w[0]!.start).toBeCloseTo(warpTime(0.25, 1, 0.5), 3); // applyFeel は 3桁丸め
    expect(w[0]!.start).not.toBe(0.25); // 16分ペアで実際に動く
  });

  it("可逆性：unwarpTime∘warpTime = id（quantize/往復編集が定義可能）", () => {
    for (const s of [0.3, 0.6, 1]) for (const t of [0.1, 0.25, 0.4, 0.5, 0.75, 0.9, 1.3, 2.65]) {
      expect(unwarpTime(warpTime(t, s, 1), s, 1)).toBeCloseTo(t, 6);
    }
  });

  it("humanize：0=恒等／>0は決定的（同seed同結果）・端音不動・微小(±~0.03)", () => {
    const src = straight();
    expect(applyFeel(src, { humanize: 0 })).toEqual(src);
    const a = applyFeel(src, { humanize: 1, seed: 7 });
    const b = applyFeel(src, { humanize: 1, seed: 7 });
    expect(a).toEqual(b); // 決定的
    expect(a[0]!.start).toBe(src[0]!.start); // 句頭不動
    expect(a[a.length - 1]!.start).toBe(src[src.length - 1]!.start); // 終止不動
    for (let i = 1; i < a.length - 1; i++) expect(Math.abs(a[i]!.start - src[i]!.start)).toBeLessThanOrEqual(0.031);
    expect(JSON.stringify(applyFeel(src, { humanize: 1, seed: 7 }))).not.toBe(JSON.stringify(src)); // 実際に動く
  });

  it("swing→humanize の順（両掛けでも単調＝順序保存）", () => {
    const w = applyFeel(straight(), { swing: 0.9, humanize: 0.5, seed: 3 }).map((n) => n.start);
    for (let i = 1; i < w.length; i++) expect(w[i]!).toBeGreaterThanOrEqual(w[i - 1]!);
  });
});

// ── humanize 知覚較正（WP-D2・2026-07-14）＝1/f 化・部位別リミット・ヨレ警告 ──
// 8音のストレート格子（中間音が humanize 対象＝端音不動）。
const line8 = (): { pitch: number; start: number; dur: number }[] =>
  Array.from({ length: 8 }, (_, i) => ({ pitch: 60 + i, start: i * 0.5, dur: 0.5 }));

describe("humanize 知覚較正（1/f・部位別リミット・ヨレ警告）", () => {
  it("pink1f：出力[-1,1]・同 seed 同系列（決定的）・別 seed で変わる", () => {
    const a = pink1f(7, 64);
    const b = pink1f(7, 64);
    expect(a).toEqual(b);                                  // 決定的（bit 再現性）
    expect(a.every((x) => x >= -1 && x <= 1)).toBe(true);  // [-1,1]
    expect(pink1f(8, 64)).not.toEqual(a);                  // seed 依存
  });

  it("humanize 0＝bit一致（tempo/part 有無に不依存）", () => {
    const src = line8();
    for (const ctx of [{}, { tempo: 120 }, { tempo: 120, part: "kick" as const }]) {
      expect(applyFeel(src, { humanize: 0 }, ctx)).toEqual(src);
    }
  });

  it("tempo 無指定＝拍比経路（上限0.03拍）・1/f 化で決定的", () => {
    const src = line8();
    const a = applyFeel(src, { humanize: 1, seed: 5 });
    const b = applyFeel(src, { humanize: 1, seed: 5 });
    expect(a).toEqual(b);
    for (let i = 1; i < a.length - 1; i++) expect(Math.abs(a[i]!.start - src[i]!.start)).toBeLessThanOrEqual(0.031);
  });

  it("部位別クランプ：tempo 指定時、各部位のずれが ms リミット内（Kick<Hihat 相対タイト）", () => {
    const src = line8();
    const tempo = 120;
    const msPerBeat = 60000 / tempo;
    const maxMs = (part: "kick" | "hihat" | "bass" | "melody") => {
      const w = applyFeel(src, { humanize: 1, seed: 9 }, { tempo, part });
      let m = 0;
      for (let i = 1; i < w.length - 1; i++) m = Math.max(m, Math.abs(w[i]!.start - src[i]!.start) * msPerBeat);
      return m;
    };
    // 各部位の最大ずれは自分のリミット（+丸め余裕）を超えない。
    expect(maxMs("kick")).toBeLessThanOrEqual(humanizeProfile("kick").limit + 1);
    expect(maxMs("hihat")).toBeLessThanOrEqual(humanizeProfile("hihat").limit + 1);
    expect(maxMs("bass")).toBeLessThanOrEqual(humanizeProfile("bass").limit + 1);
    expect(maxMs("melody")).toBeLessThanOrEqual(humanizeProfile("melody").limit + 1);
  });

  it("ヨレ警告：盛りすぎ設定（melody×高humanize×遅テンポ）で発火・既定帯では未発火", () => {
    const src = line8();
    // melody hum=1・♩80(遅=×1.3)：peak=4·1·10·1.3=52ms>40 → 発火。
    const warns: HumanizeWarn[] = [];
    applyFeel(src, { humanize: 1, seed: 3 }, { tempo: 80, part: "melody", onWarn: (w) => warns.push(w) });
    expect(warns.length).toBeGreaterThanOrEqual(1);
    expect(warns[0]!.kind).toBe("humanize-yore");
    expect(warns[0]!.peakMs).toBeGreaterThan(HUMANIZE_YORE_MS);

    // 既定帯（kick hum=0.25・♩120）は未発火（4·0.25·3=3ms）。
    const safe: HumanizeWarn[] = [];
    applyFeel(src, { humanize: 0.25, seed: 3 }, { tempo: 120, part: "kick", onWarn: (w) => safe.push(w) });
    expect(safe.length).toBe(0);
  });
});
