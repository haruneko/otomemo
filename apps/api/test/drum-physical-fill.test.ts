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

  it("fillStyle:\"physical\" で fillNotes/fillBar が載る（grid lanes は素の base のまま）", () => {
    const bare = genDrums(DF, 7); // フィル無しの素 base
    const phys = genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent" });
    const br = rh(bare), pr = rh(phys);
    expect(pr.fillNotes).toBeDefined();
    expect(pr.fillNotes!.length).toBeGreaterThan(0);
    expect(pr.fillBar).toBe(2); // bars=4 → N-2
    // 物理経路は grid lanes を一切触らない＝素 base の lanes と一致（フィルは fillNotes に分離）
    expect(pr.lanes).toStrictEqual(br.lanes);
    // 全 note が GM ドラム番号
    const gm = new Set(Object.values(GM_NOTE));
    for (const n of pr.fillNotes!) expect(gm.has(n.midi)).toBe(true);
  });

  it("fillNotes が phrase_maker placeFill と忠実一致（tom_descent・medium・bar・4/4・bar2）", () => {
    const phys = genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent" });
    const notes = rh(phys).fillNotes!;
    // intensity 0.5→medium、length "bar"、fillBar=2 → placeFill(2,0,"bar","medium","tom_descent")
    const p = placeFill(2, 0.0, "bar", "medium", "tom_descent", fillMeter("4/4"));
    const expected = [...p.events, ...p.landing].map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity }));
    expect(notes).toStrictEqual(expected);
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
    const notes = rh(genDrums({ ...DF, section: { cues: cue } }, 7, { fillStyle: "physical", fillKind: "snare_roll" })).fillNotes!;
    const p = placeFill(3, 0.0, "bar", "medium", "snare_roll", fillMeter("4/4"));
    const expected = p.events.map((e) => ({ beat: e.beat, midi: GM_NOTE[e.voice], velocity: e.velocity })); // landing 無し
    expect(notes).toStrictEqual(expected);
  });
});

describe("物理フィル kind選択＝aimプール分け（裁定B・2026-08-21）", () => {
  const UP = ["buildup", "gallop", "snare_roll", "snare_roll_32", "herta"];
  const DOWN = ["tom_descent", "triplet_cascade", "offbeat_syncopated"];
  const ALL = [...UP, ...DOWN, "flam_accents", "sixteenth_groove"];
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

  it("aim 未指定＝全10型プール（＝従来の純ランダムと同一の選抜＝bit 一致）", () => {
    // aim 無しは pool=FILL_KINDS なので選抜式が現行と同一。fillNotes が fillKind 明示無しの現行出力と一致。
    const cue: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.5 }];
    const withAim = genDrums({ ...DF, section: { cues: cue } }, 5, { fillStyle: "physical" });
    const chosen = rh(withAim).fillKind!;
    const explicit = genDrums({ ...DF, section: { cues: cue } }, 5, { fillStyle: "physical", fillKind: chosen });
    expect(rh(withAim).fillNotes).toStrictEqual(rh(explicit).fillNotes);
    expect(ALL).toContain(chosen);
  });

  it("fillKind 明示は aim プールより優先（明示ノブ＞プリセット）", () => {
    const cue: DerivedCue[] = [{ bar: 1, kind: "fill", intensity: 0.5, aim: "up" }];
    // 下降型を明示 → up プール外でも明示が勝つ
    expect(rh(genDrums({ ...DF, section: { cues: cue } }, 3, { fillStyle: "physical", fillKind: "tom_descent" })).fillKind).toBe("tom_descent");
  });
});
