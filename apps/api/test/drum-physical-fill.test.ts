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

  // ①回帰（2026-08-29・受け入れ監査）：shuffle(三連グルーヴ)×physical で beatsPerStep が round3 済み
  // (=0.333) のまま covered() 判定に使われ、フィル開始点（例：step30の真値10.0qbが30×0.333=9.99になる）
  // の直前が「フィル区間の外」と誤判定されて、グルーヴのキック/ハットが消し残って二重に鳴っていた不具合。
  // buildBodyFill と同じ「round3 されない正準の sub」を使うよう是正＝span 内のグルーヴ打が0件になること。
  it("shuffle(三連)×physical：フィル区間内にグルーヴの消し残りが無い（三連の丸め誤差バグの回帰）", () => {
    const F = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };
    for (const seed of [0, 2, 3, 4]) {
      const r = rh(genDrums(F, seed, { style: "shuffle.basic", fill: 0.6, fillStyle: "physical" }));
      const fn = r.fillNotes ?? [];
      if (!fn.length) continue;
      const f0 = Math.min(...fn.map((x) => x.beat)), f1 = Math.max(...fn.map((x) => x.beat));
      const leftover = r.lanes.flatMap((l) => (l as { name: string; hits: number[] }).hits.map((h) => ({ name: (l as { name: string }).name, h, q: h / 3 })))
        .filter((x) => x.q >= f0 - 1e-9 && x.q < f1);
      expect(leftover).toStrictEqual([]);
    }
  });

  // 4/4・6/8・3/4 は sub=0.25 で round3(0.25)===0.25（丸め誤差が発生しない格子）なので、
  // ①の是正（round3 済み値→正準 sub への差し替え）はこれらの出力に一切影響しない＝bit一致であることの明示回帰。
  it("4/4・6/8・3/4（sub=0.25）：①の是正後も physical フィル出力が不変", () => {
    for (const meter of ["4/4", "6/8", "3/4"] as const) {
      for (const seed of [1, 3, 5]) {
        const F = { meter, bars: 4, mood: "明るい", tempo: 100 };
        const r = rh(genDrums(F, seed, { fill: 0.6, fillStyle: "physical" }));
        // beatsPerStep はこれらの拍子では常に 0.25（三連格子ではない）＝①の分岐は no-op であることの確認。
        expect(r.beatsPerStep).toBeCloseTo(0.25, 6);
      }
    }
    // 既存の広範なテスト群（fillNotes忠実一致・span外グルーヴ生存・N小節展開等）が全通過していること自体が
    // 4/4 での bit 一致の証明（このファイルの他テストは全て 4/4 を使用）。
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

// 身体シミュレータ経路（M3・2026-08-29）＝fillStyle:"body"。型辞書を引かずに毎回 DP で解く。
describe("身体シミュレータ経路（fillStyle:\"body\"）", () => {
  const DFB = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };

  it("既定＝bit 一致：body を指定しない限り従来出力に触らない", () => {
    expect(genDrums(DFB, 7, { fill: 0.5 })).toStrictEqual(genDrums(DFB, 7, { fill: 0.5, fillStyle: "grid" }));
    expect(rh(genDrums(DFB, 7, { fill: 0.5 })).fillNotes).toBeUndefined();
  });

  it("body で fillNotes が載り、fillKind は \"body\"（型名ではない＝辞書を引いていない）", () => {
    const r = rh(genDrums(DFB, 7, { fill: 0.6, fillStyle: "body" }));
    expect(r.fillNotes!.length).toBeGreaterThan(0);
    expect(r.fillKind).toBe("body");
    expect(r.bars).toBe(4);
  });

  it("seed ごとに別の解＝型の在庫という上限が無い", () => {
    const sigs = new Set<string>();
    for (let s = 0; s < 12; s++) sigs.add(JSON.stringify(rh(genDrums(DFB, s, { fill: 0.6, fillStyle: "body" })).fillNotes));
    expect(sigs.size).toBeGreaterThan(6); // 10型の辞書では出せない多様性
  });

  it("4/4・3/4・6/8 のいずれでも解ける（16分定規の格子）", () => {
    for (const [meter, tempo] of [["4/4", 120], ["3/4", 100], ["6/8", 70]] as const) {
      const r = rh(genDrums({ ...DFB, meter, tempo }, 3, { fill: 0.6, fillStyle: "body" }));
      expect(r.fillKind).toBe("body");
      expect(r.fillNotes!.length).toBeGreaterThan(0);
    }
  });

  // 三連格子（shuffle 型）＝三連スロット増分（2026-08-29）で body が解けるようになった。
  // フィルもグルーヴと同じ三連定規に乗る＝16分を混ぜてノリを壊さない。
  it("三連格子（shuffle）でも body が解き、打点は 1/6qb 格子（三連＋半スロットのバウンス）に乗る", () => {
    let offBeat = 0;
    for (const seed of [0, 1, 2, 3, 4]) {
      // 格子の検証は純物理で（prior のフラム装飾音は設計上 +20ms 格子外に乗る＝16分経路と同じ）
      const r = rh(genDrums(DFB, seed, { style: "shuffle.basic", fill: 0.6, fillStyle: "body", bodyDrummer: "none" }));
      expect(r.fillKind).toBe("body"); // 型辞書へ落ちていない
      expect(r.fillNotes!.length).toBeGreaterThan(0);
      for (const n of r.fillNotes!) {
        const k = n.beat * 6;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-4);
        if (Math.abs(n.beat * 4 - Math.round(n.beat * 4)) > 1e-4) offBeat++; // 16分格子に乗らない＝真に三連の打点
      }
    }
    expect(offBeat).toBeGreaterThan(0); // どこかの seed で三連らしい位置が実際に出ている
    expect(GM_NOTE).toBeDefined();
  });

  it("bodyDrummer:\"none\"＝統計を使わない純物理（ペダルハットが出ない）", () => {
    const withPrior = rh(genDrums(DFB, 4, { fill: 0.6, fillStyle: "body" })).fillNotes!;
    const noPrior = rh(genDrums(DFB, 4, { fill: 0.6, fillStyle: "body", bodyDrummer: "none" })).fillNotes!;
    expect(noPrior).not.toStrictEqual(withPrior);
    expect(noPrior.some((n) => n.midi === GM_NOTE.phh)).toBe(false);
  });

  // つまみは「必ず毎回変える」ものではない（短い span では最適解が動かないこともある）。
  // 効いていることの証明＝**複数 seed のうち少なくとも1つで解が変わる**（形の辞書ではなくコストへの効き）。
  it("意図つまみ（行き先/忙しさ）が解に効く", () => {
    const of = (o: Record<string, unknown>, seed: number) =>
      JSON.stringify(rh(genDrums(DFB, seed, { fill: 0.6, fillStyle: "body", fillLength: "bar", ...o })).fillNotes);
    let depthDiff = 0, densDiff = 0;
    for (let s = 0; s < 4; s++) { // 1小節フィルは DP で ~100ms/本＝seed 数は控えめに
      if (of({ bodyDepth: 0.8 }, s) !== of({}, s)) depthDiff++;
      // 忙しさ(dense)は**純物理のときだけ効く**：GMD prior 下では骨外の密度もバウンスの
      // 引き込みも実測カーブが担うので dense 項が評価されない（源流どおり＝仕様）。
      if (of({ bodyDensity: 1.8, bodyDrummer: "none" }, s) !== of({ bodyDrummer: "none" }, s)) densDiff++;
    }
    expect(depthDiff).toBeGreaterThan(0);
    expect(densDiff).toBeGreaterThan(0);
  });

  it("フィル span の外はグルーヴが生きている（apply_fills 準拠・physical と同じ規約）", () => {
    const r = rh(genDrums(DFB, 7, { fill: 0.6, fillStyle: "body" }));
    const grid = r.steps / r.bars!;
    const inFillBar = r.lanes.some((l) => (l as { hits: number[] }).hits.some((h) => h >= 2 * grid && h < 3 * grid));
    expect(inFillBar).toBe(true);
  });
});

// ノリ（B1裁定・2026-08-29 結線）＝ genDrums が content.feel を出す配線のテスト。
// 最重要＝**humanize/swing 未指定は content.feel が生えない＝従来出力と bit 一致**。
// ここが崩れると既存の全 genDrums 呼び出し（保存済みジョブ・再現性テスト）が無言で壊れるので、
// 「feel キーの有無」自体を toStrictEqual で厳密に確認する。
describe("ドラムのノリ（content.feel・演奏レイヤー）", () => {
  const content = (r: ReturnType<typeof genDrums>) => r.items[0]!.content as { feel?: unknown };

  it("humanize/swing 未指定＝grid 経路で feel が生えず従来出力と toStrictEqual", () => {
    const withOpts = genDrums(DF, 7, { fill: 0.5 });
    const bare = genDrums(DF, 7);
    // opts 無し版と fill だけ足した版は本来 fillNotes の有無以外変わらないので、
    // ここでは同じ opts で feel 有無だけを見る＝再実行しても同じ結果（決定的）。
    expect(genDrums(DF, 7, { fill: 0.5 })).toStrictEqual(withOpts);
    expect(content(withOpts).feel).toBeUndefined();
    expect(content(bare).feel).toBeUndefined();
  });

  it("humanize/swing 未指定＝physical 経路でも feel が生えない（fillNotes は載るが feel キー無し）", () => {
    const phys = genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent" });
    expect(content(phys).feel).toBeUndefined();
    // physical 経路自体は従来どおり動く（feel 追加がこの経路を壊していないことの確認）
    expect((phys.items[0]!.content as { rhythm: { fillNotes?: unknown[] } }).rhythm.fillNotes).toBeDefined();
  });

  it("fillStyle:\"body\" のときだけ humanize の既定 0.25 が content.feel に載る", () => {
    const DFB = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };
    const body = genDrums(DFB, 7, { fill: 0.6, fillStyle: "body" });
    expect((content(body).feel as { humanize?: number } | undefined)?.humanize).toBe(0.25);
    // 比較対象＝grid/physical は既定 humanize が無いので feel 自体が生えない（body だけの特別扱いであることの回帰ガード）
    const grid = genDrums(DFB, 7, { fill: 0.6 });
    const phys = genDrums(DFB, 7, { fill: 0.6, fillStyle: "physical" });
    expect(content(grid).feel).toBeUndefined();
    expect(content(phys).feel).toBeUndefined();
  });

  it("明示 humanize は body の既定(0.25)より優先される", () => {
    const DFB = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };
    const body = genDrums(DFB, 7, { fill: 0.6, fillStyle: "body", humanize: 0.9 });
    expect((content(body).feel as { humanize?: number } | undefined)?.humanize).toBe(0.9);
  });

  it("humanize:0 を明示したら feel は生えない（buildFeel の 0=無効 と揃っている）", () => {
    const DFB = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };
    // body 経路（既定 0.25 が働きうる文脈）でも明示 0 が勝ってキー自体が消えることを確認。
    const body = genDrums(DFB, 7, { fill: 0.6, fillStyle: "body", humanize: 0 });
    expect(content(body).feel).toBeUndefined();
    // grid 経路でも同様（swing も 0 なら feel 無し）
    const grid = genDrums(DF, 7, { fill: 0.5, humanize: 0, swing: 0 });
    expect(content(grid).feel).toBeUndefined();
  });

  it("swing 指定で content.feel.swing が載る（content.rhythm の中ではなく content 直下）", () => {
    const r = genDrums(DF, 7, { fill: 0.5, swing: 0.6 });
    const c = r.items[0]!.content as { feel?: { swing?: number }; rhythm: Record<string, unknown> };
    expect(c.feel?.swing).toBe(0.6);
    // 誤って rhythm 配下に載せていないこと＝web 側 feelOf(content) が content.feel を読むための契約
    expect((c.rhythm as { feel?: unknown }).feel).toBeUndefined();
  });
});

// fillEngine と meta.warnings（オーナー裁定・2026-08-29）：body を頼んで解けなかったときは黙って
// 型辞書へ落ちずに知らせる。content 自身の自己記述（fillEngine）＋ meta.warnings（MCP からも聞こえる）の二重化。
describe("body フォールバックの通知（fillEngine / meta.warnings）", () => {
  // shuffle（三連格子）で fillBeat をあえて三連スロットに乗らない位置(1.5拍)へ明示指定＝body の DP が
  // 解けない現実的なケース（4/4・shuffle.basic 自体は通常 body で解ける＝三連スロット非対応ではなく
  // 「その開始拍は三連格子に乗らない」という現実の失敗理由）。
  const UNSOLVABLE = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };
  const unsolvableOpts = { style: "shuffle.basic", fill: 0.6, fillStyle: "body" as const, fillBeat: 1.5 };

  it("body が解けない格子では型辞書へ落ち、fillEngine=\"physical\" と meta.warnings にオーナー指定の文言が載る", () => {
    const r = genDrums(UNSOLVABLE, 7, unsolvableOpts);
    const rhythm = rh(r);
    expect(rhythm.fillNotes!.length).toBeGreaterThan(0); // 型辞書経路で何かは作られている
    expect((r.items[0]!.content as { rhythm: { fillEngine?: string } }).rhythm.fillEngine).toBe("physical");
    expect(r.meta?.warnings).toContain("生成できなかったのでテンプレートから選択しました");
  });

  it("body で解けたときは fillEngine=\"body\"・meta.warnings は載らない", () => {
    const DFB = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };
    const r = genDrums(DFB, 7, { fill: 0.6, fillStyle: "body" });
    expect((r.items[0]!.content as { rhythm: { fillEngine?: string } }).rhythm.fillEngine).toBe("body");
    expect(r.meta?.warnings).toBeUndefined();
  });

  it("fillStyle:\"physical\"（型辞書を最初から要求）では fillEngine=\"physical\"・warnings は載らない", () => {
    const r = genDrums(DF, 7, { fill: 0.5, fillStyle: "physical", fillKind: "tom_descent" });
    expect((r.items[0]!.content as { rhythm: { fillEngine?: string } }).rhythm.fillEngine).toBe("physical");
    expect(r.meta?.warnings).toBeUndefined();
  });

  it("fillStyle 未指定/\"grid\" では fillEngine キー自体を生やさない（従来 bit 一致を壊さない）", () => {
    const r = genDrums(DF, 7, { fill: 0.5 });
    expect((r.items[0]!.content as { rhythm: { fillEngine?: string } }).rhythm.fillEngine).toBeUndefined();
  });
});

// 通知の正確さ（2026-08-29）。**通知が嘘をつくのがいちばん悪い**ので、落ち先で文言を分ける。
// 型辞書に落ちた＝別物だが鳴る／型辞書でも作れなかった＝何も鳴らない、は利用者にとって別の出来事。
describe("フォールバック通知は落ち先で言い分ける", () => {
  const warns = (frame: Record<string, unknown>, opts: Record<string, unknown>) =>
    (genDrums(frame as never, 3, opts as never) as { meta?: { warnings?: string[] } }).meta?.warnings ?? [];
  const F4 = { meter: "4/4", bars: 4, mood: "明るい", tempo: 120 };

  it("型辞書へ落ちた（フィルは鳴る）＝「テンプレートから選択しました」", () => {
    const w = warns(F4, { style: "shuffle.basic", fill: 0.6, fillStyle: "body", fillBeat: 1.5 });
    expect(w.join("")).toContain("テンプレートから選択");
    // 実際にフィルが鳴っていること＝「選択した」が嘘でないこと
    const r = rh(genDrums(F4 as never, 3, { style: "shuffle.basic", fill: 0.6, fillStyle: "body", fillBeat: 1.5 } as never));
    expect(r.fillNotes!.length).toBeGreaterThan(0);
  });

  it("型辞書でも作れなかった（何も鳴らない）＝「選択しました」と言わない", () => {
    for (const meter of ["5/4", "7/8"]) {
      const w = warns({ ...F4, meter }, { fill: 0.6, fillStyle: "body" });
      expect(w.join("")).toContain("フィルを作れませんでした");
      expect(w.join("")).not.toContain("テンプレートから選択"); // 嘘をつかない
      const r = rh(genDrums({ ...F4, meter } as never, 3, { fill: 0.6, fillStyle: "body" } as never));
      expect(r.fillNotes ?? []).toHaveLength(0); // 実際に鳴っていない
    }
  });

  it("正常に解けたときは何も言わない（黙って良い顔もしないが、要らない通知も出さない）", () => {
    expect(warns(F4, { style: "shuffle.basic", fill: 0.6, fillStyle: "body" })).toHaveLength(0);
    expect(warns(F4, { style: "beat8.basic", fill: 0.6, fillStyle: "body" })).toHaveLength(0);
  });
});
