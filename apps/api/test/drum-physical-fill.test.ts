// M2＝phrase_maker 物理フィル配線テスト。最重要＝**fillStyle 未指定/"grid" は従来と bit 一致**、
// fillStyle:"physical" のときだけ fillNotes/fillBar が additive に載る（grid lanes は不変）。
import { describe, it, expect } from "vitest";
import { genDrums } from "../src/music/generate";
import { placeFill, fillMeter, GM_NOTE, type DerivedCue } from "@cm/music-core";

type Rhythm = { steps: number; bars: number; beatsPerStep: number; lanes: unknown[]; fillNotes?: { beat: number; midi: number; velocity: number }[]; fillBar?: number };
const rh = (r: ReturnType<typeof genDrums>): Rhythm => (r.items[0]!.content as { rhythm: Rhythm }).rhythm;
const DF = { meter: "4/4", bars: 4, mood: "明るい" };

describe("物理フィル配線（M2）", () => {
  it("既定＝bit 一致：fillStyle 未指定は従来と deepStrictEqual（fill ノブ有・cue 有の双方）", () => {
    const base = genDrums(DF, 7, { fill: 0.5 });
    expect(genDrums(DF, 7, { fill: 0.5, fillStyle: "grid" })).toStrictEqual(base);
    const cue: DerivedCue[] = [{ bar: 2, kind: "fill", intensity: 0.7 }];
    const withCue = { ...DF, section: { cues: cue } };
    const baseCue = genDrums(withCue, 7);
    expect(genDrums(withCue, 7, { fillStyle: "grid" })).toStrictEqual(baseCue);
    // fillNotes は grid 経路には絶対載らない
    expect(rh(baseCue).fillNotes).toBeUndefined();
  });

  it("fillStyle:\"physical\" で N小節へ展開＋fillNotes/fillBar/fillKind が載る（fillBar は grid を空ける）", () => {
    const bare = genDrums(DF, 7); // フィル無しの素 base（1小節）
    const phys = genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent" });
    const br = rh(bare), pr = rh(phys);
    expect(pr.fillNotes).toBeDefined();
    expect(pr.fillNotes!.length).toBeGreaterThan(0);
    expect(pr.fillBar).toBe(2); // bars=4 → N-2
    expect(pr.fillKind).toBe("tom_descent");
    // グリッドは N=4 小節へ展開（セクション合成はタイルしないので content が自己完結）。
    const grid = br.steps / br.bars; // base の1小節step数
    expect(pr.bars).toBe(4);
    expect(pr.steps).toBe(4 * grid);
    // phrase_maker apply_fills 準拠：空けるのは **フィル span [startQb, landingQb) と着地頭** だけ。
    //   既定＝末尾1拍（beat 3.0・length "beat"）＝span は bar2 の4拍目のみ。span 外のグルーヴは fillBar 内でも鳴る。
    const bps = pr.beatsPerStep ?? 0.25;
    const spanFrom = 2 * 4 + 3, spanTo = 2 * 4 + 4; // qb
    for (const l of pr.lanes) for (const h of (l as { hits: number[] }).hits) {
      const qb = h * bps;
      expect(qb >= spanFrom && qb <= spanTo).toBe(false); // span 内＋着地頭は空く
    }
    // fillBar でも span 前（1〜3拍目）のグルーヴは生きている＝丸ごと消さない（旧実装の誤りの回帰ガード）。
    const inFillBarBefore = pr.lanes.some((l) => (l as { hits: number[] }).hits.some((h) => h >= 2 * grid && h * bps < spanFrom));
    expect(inFillBarBefore).toBe(true);
    // 非フィル小節(0,1,3)は base bar0 groove がタイルされる＝bar1 は base+grid。
    const baseHitsByName = new Map(br.lanes.map((l) => [(l as { name: string }).name, (l as { hits: number[] }).hits]));
    for (const l of pr.lanes) {
      const nm = (l as { name: string }).name, hits = (l as { hits: number[] }).hits;
      const b0 = baseHitsByName.get(nm) ?? [];
      for (const s of b0) { expect(hits).toContain(s); expect(hits).toContain(grid + s); }
      // bar3 は着地頭(step0)だけ span 扱いで空く＝それ以外は生きる。
      for (const s of b0) if (s > 0) expect(hits).toContain(3 * grid + s);
    }
    // 全 fill note が GM ドラム番号
    const gm = new Set(Object.values(GM_NOTE));
    for (const n of pr.fillNotes!) expect(gm.has(n.midi)).toBe(true);
  });

  it("fillNotes が phrase_maker placeFill と忠実一致（明示 length/beat＝ノブが素通しされる）", () => {
    const phys = genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent", fillLength: "bar", fillBeat: 0 });
    const notes = rh(phys).fillNotes!;
    const p = placeFill(2, 0.0, "bar", "medium", "tom_descent", fillMeter("4/4"));
    const expected = [...p.events, ...p.landing].map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity }));
    expect(notes).toStrictEqual(expected);
  });

  // 既定＝phrase_maker の常用形（generate.py `_kinds_tour_fills`）＝小節の**最後の1拍**。
  //   旧既定（beat 0.0 × "bar"＝小節まるごと）は源流に無い極端形で、耳判定で「退屈・成立してない」と却下された。
  it("既定の開始拍/長さ＝末尾1拍（buildup と flashy だけ2拍＝room を取る）", () => {
    const med = rh(genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent" })).fillNotes!;
    const pMed = placeFill(2, 3.0, "beat", "medium", "tom_descent", fillMeter("4/4"));
    expect(med).toStrictEqual([...pMed.events, ...pMed.landing].map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity })));
    // buildup は medium でも2拍（room）／flashy はどの型でも2拍
    const bu = rh(genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "buildup" })).fillNotes!;
    const pBu = placeFill(2, 2.0, "2beat", "medium", "buildup", fillMeter("4/4"));
    expect(bu).toStrictEqual([...pBu.events, ...pBu.landing].map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity })));
    const fl = rh(genDrums(DF, 7, { fill: 0.9, fillStyle: "physical", fillKind: "tom_descent" })).fillNotes!;
    const pFl = placeFill(2, 2.0, "2beat", "flashy", "tom_descent", fillMeter("4/4"));
    expect(fl).toStrictEqual([...pFl.events, ...pFl.landing].map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity })));
  });

  it("cue.intensity → 強度量子化（0.2=subtle / 0.5=medium / 0.9=flashy）", () => {
    const mk = (i: number) => rh(genDrums({ ...DF, section: { cues: [{ bar: 1, kind: "fill", intensity: i }] as DerivedCue[] } }, 3, { fillStyle: "physical", fillKind: "snare_roll" })).fillNotes!;
    const sub = mk(0.2), med = mk(0.5), fla = mk(0.9);
    // flashy は密度 1.4 → subtle より打点が多い（snare_roll: n=len*4*density）
    expect(fla.length).toBeGreaterThan(sub.length);
    expect(med.length).toBeGreaterThan(sub.length);
  });

  it("最終小節フィル＝着地は越境（landing 打たない）", () => {
    // fillBar=3（bars=4 の最終小節）・length "bar" → landing は bar4＝section 外 → fillNotes に crash+kick 着地無し
    const cue: DerivedCue[] = [{ bar: 3, kind: "fill", intensity: 0.5 }];
    const notes = rh(genDrums({ ...DF, section: { cues: cue } }, 7, { fillStyle: "physical", fillKind: "snare_roll", fillLength: "bar", fillBeat: 0 })).fillNotes!;
    const p = placeFill(3, 0.0, "bar", "medium", "snare_roll", fillMeter("4/4"));
    const expected = p.events.map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity })); // landing 無し
    expect(notes).toStrictEqual(expected);
  });
});

describe("物理フィル kind選択＝aimプール分け（裁定B・2026-08-21）", () => {
  // 2026-08-29 再編：方向を持つ型＋中立型（どちらにも付く）。snare_roll_32 は耳判定で既定プールから除外。
  const NEUTRAL = ["flam_accents", "sixteenth_groove"];
  const UP = ["buildup", "gallop", "snare_roll", "herta", ...NEUTRAL];
  const DOWN = ["tom_descent", "triplet_cascade", "offbeat_syncopated", ...NEUTRAL];
  const DEFAULT_POOL = [...new Set([...UP, ...DOWN])];
  const ALL = [...DEFAULT_POOL, "snare_roll_32"];
  const kindOf = (aim: "up" | "down" | undefined, seed: number) => {
    const cue: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.5, ...(aim ? { aim } : {}) }];
    return (rh(genDrums({ ...DF, section: { cues: cue } }, seed, { fillStyle: "physical" })).fillKind);
  };

  it("選抜 kind を rhythm.fillKind に自己記述する（物理経路・opt-in）", () => {
    expect(kindOf("up", 1)).toBeTypeOf("string");
    expect(ALL).toContain(kindOf("up", 1));
  });

  it("aim:up は必ず上昇/駆動プールから選ばれる（全 seed で下降型は出ない）", () => {
    for (let s = 0; s < 40; s++) expect(UP).toContain(kindOf("up", s));
  });

  it("aim:down は必ず下降プールから選ばれる（全 seed で上昇型は出ない）", () => {
    for (let s = 0; s < 40; s++) expect(DOWN).toContain(kindOf("down", s));
  });

  it("aim 未指定＝却下型を除く全型プール（選抜 kind と明示指定の出力が一致）", () => {
    const cue: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.5 }];
    const withAim = genDrums({ ...DF, section: { cues: cue } }, 5, { fillStyle: "physical" });
    const chosen = rh(withAim).fillKind!;
    const explicit = genDrums({ ...DF, section: { cues: cue } }, 5, { fillStyle: "physical", fillKind: chosen });
    expect(rh(withAim).fillNotes).toStrictEqual(rh(explicit).fillNotes);
    expect(DEFAULT_POOL).toContain(chosen);
  });

  // 耳判定（2026-08-29）：32分連打は却下＝どの既定プールからも出ない。明示 fillKind でのみ到達（捨てない）。
  it("snare_roll_32 は既定プールから出ない／明示すれば出る", () => {
    for (let s = 0; s < 60; s++) for (const aim of ["up", "down", undefined] as const) expect(kindOf(aim, s)).not.toBe("snare_roll_32");
    expect(rh(genDrums(DF, 1, { fillStyle: "physical", fill: 0.5, fillKind: "snare_roll_32" })).fillKind).toBe("snare_roll_32");
  });

  // 初版の穴＝中立型が両プールから漏れ、aim 指定時に永久に出なかった（「型の種類が少ない」の一因）。
  it("中立型（flam_accents / sixteenth_groove）が up/down 双方で選ばれうる", () => {
    for (const aim of ["up", "down"] as const) {
      const seen = new Set<string>();
      for (let s = 0; s < 80; s++) seen.add(kindOf(aim, s)!);
      for (const n of NEUTRAL) expect(seen).toContain(n);
    }
  });

  // 図形型（1回しか出ないと拍として成立しない）は既定で2拍取る＝耳判定「連打でないのは成立してない」。
  it("図形型（gallop / offbeat_syncopated）の既定長は2拍・連打型は1拍", () => {
    const span = (kind: string) => {
      const n = rh(genDrums(DF, 7, { fillStyle: "physical", fill: 0.5, fillKind: kind })).fillNotes!;
      return Math.max(...n.map((x) => x.beat)) - Math.min(...n.map((x) => x.beat));
    };
    for (const k of ["gallop", "offbeat_syncopated"]) expect(span(k)).toBeGreaterThan(1);
    for (const k of ["snare_roll", "herta", "flam_accents"]) expect(span(k)).toBeLessThanOrEqual(1);
  });

  it("fillKind 明示は aim プールより優先（明示ノブ＞プリセット）", () => {
    const cue: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.5, aim: "up" }];
    // 下降型を明示 → up プール外でも明示が勝つ
    expect(rh(genDrums({ ...DF, section: { cues: cue } }, 3, { fillStyle: "physical", fillKind: "tom_descent" })).fillKind).toBe("tom_descent");
  });
});

// 3/4 のグルーヴ格子（2026-08-29・耳判定「3/4だけ変」の回帰ガード）。
// 旧実装は 4/4 の16格子を 3拍へ引き伸ばし、1step=3/16拍・1小節=3.008拍・バックビートが
// 0.75/2.26拍という非拍位置に落ちていた。3/4 は 12格子（16分×3拍）で beatsPerStep=0.25。
describe("3/4 のドラム格子（単純拍子3拍）", () => {
  const r34 = (seed: number, style?: string) =>
    rh(genDrums({ meter: "3/4", bars: 1, mood: "明るい", tempo: 100 } as never, seed, style ? { style } : undefined));

  it("12格子・beatsPerStep=0.25・1小節ぴったり3拍（引き伸ばさない）", () => {
    for (const seed of [0, 2, 5, 9]) {
      const r = r34(seed);
      expect(r.steps).toBe(12);
      expect(r.beatsPerStep).toBe(0.25);
      expect(r.steps * r.beatsPerStep!).toBe(3); // 3.008 に膨らまない
    }
  });

  it("全打点が16分格子（0.25拍）の上に乗る＝非拍位置に落ちない", () => {
    for (const seed of [0, 2, 5, 9]) {
      const r = r34(seed);
      for (const l of r.lanes) for (const h of (l as { hits: number[] }).hits) {
        expect(h).toBeLessThan(12);
        expect(Number.isInteger(h * r.beatsPerStep! * 4)).toBe(true);
      }
    }
  });

  it("4/4 型を 3/4 に当てない（型が無いので既定グルーヴへ落とす）", () => {
    const r = r34(2, "beat8.basic");
    expect(r.steps).toBe(12); // 16格子の 4/4 型が漏れてこない
    expect((r as { patternId?: string }).patternId).toBeUndefined();
  });

  it("4/4 は従来どおり16格子（この修正で触っていない＝bit 一致）", () => {
    const r = rh(genDrums({ meter: "4/4", bars: 1, mood: "明るい", tempo: 100 } as never, 2));
    expect(r.steps).toBe(16);
    expect(r.beatsPerStep).toBe(0.25);
  });
});
