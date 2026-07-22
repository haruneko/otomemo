// 伴奏パターン型辞書（chordLibrary・S2・2026-07-22・design「伴奏パターン型辞書（chordLibrary・S2）」・
// research/2026-07-22-piano-comping-vocabulary.md／guitar-comping-vocabulary.md）。契約：
//  (a) pattern 未指定＝従来 genChordPattern と deepStrictEqual bit 一致（鉄則）
//  (b) pattern=型ID→当該グリッドを決定的に敷く（16分格子・vel 層が載る）
//  (c) pattern=ジャンル名→候補から決定的1つ・テンポ域絞り（域外は選ばれない）
//  (d) ギター型で voicing.style==="guitar"／strumMs が載る
import { describe, it, expect } from "vitest";
import { genChordPattern, type Frame } from "../src/music/generate";
import { COMP_TYPES, compTypeById, pickCompType, parseCompRh, compHitsForBar, CHORD_ACCENT, CHORD_UP, CHORD_GHOST } from "../src/music/chordLibrary";

type Hit = { step: number; dur: number; vel?: number };
type Content = { mode: string; voicing: Record<string, unknown>; steps: number; hits: Hit[] };
const contentOf = (r: ReturnType<typeof genChordPattern>): Content => r.items[0]!.content as Content;
const J = (x: unknown) => JSON.stringify(x);
const SEEDS = [1, 2, 3, 5, 42];

describe("辞書の健全性（純データ）", () => {
  it("26型・全RH16セル・tempoMin<=tempoMax・ID 一意", () => {
    expect(COMP_TYPES.length).toBe(26);
    const ids = new Set<string>();
    for (const t of COMP_TYPES) {
      expect(t.rh.length, t.id).toBe(16);
      if (t.lh) expect(t.lh.length, t.id).toBe(16);
      expect(t.tempoMin, t.id).toBeLessThanOrEqual(t.tempoMax);
      expect(ids.has(t.id), `dup ${t.id}`).toBe(false);
      ids.add(t.id);
    }
  });
  it("ギター型は style==='guitar'＋strumMs を持つ／鍵盤型は keyboard", () => {
    for (const t of COMP_TYPES) {
      if (t.style === "guitar") expect(typeof t.strumMs, t.id).toBe("number");
      else expect(t.style, t.id).toBe("keyboard");
    }
  });
  it("パーサ：休符/hold/normal/accent/soft/down/up/ghost を分類", () => {
    const c = parseCompRh(". - A > | o D d U | x . . . | . . . .");
    expect(c[0]).toEqual({ kind: "rest" });
    expect(c[1]).toEqual({ kind: "hold" });
    expect(c[2]).toEqual({ kind: "attack" }); // normal＝vel なし
    expect(c[3]).toEqual({ kind: "attack", vel: CHORD_ACCENT });
    expect(c[4]).toEqual({ kind: "attack", vel: 64 });
    expect(c[5]).toEqual({ kind: "attack", dir: "D" });
    expect(c[6]).toEqual({ kind: "attack", vel: CHORD_ACCENT, dir: "D" });
    expect(c[7]).toEqual({ kind: "attack", vel: CHORD_UP, dir: "U" });
    expect(c[8]).toEqual({ kind: "attack", vel: CHORD_GHOST, ghost: true });
  });
  it("compHitsForBar：dur=1+直後 hold 数・rest で打ち切り・ghost は dur1・vel は素通し", () => {
    // A - - - | > . A A | x - . . | . . . .
    const hits = compHitsForBar(parseCompRh("A - - - | > . A A | x - . . | . . . ."), 0);
    expect(hits).toEqual([
      { step: 0, dur: 4 }, // A + 3 hold（normal＝vel なし）
      { step: 4, dur: 1, vel: CHORD_ACCENT }, // > staccato（次が rest）
      { step: 6, dur: 1 }, // A（次が attack）
      { step: 7, dur: 1 }, // A
      { step: 8, dur: 1, vel: CHORD_GHOST }, // ghost は hold を無視して dur1
    ]);
  });
});

describe("(a) pattern 未指定＝従来と bit 一致（鉄則）", () => {
  const frames: Frame[] = [
    { bars: 2, meter: "4/4" }, { bars: 4, meter: "4/4", mood: "切ない" },
    { bars: 4, meter: "4/4", mood: "明るい", tempo: 140 }, { bars: 4, meter: "6/8" },
    { bars: 2, meter: "3/4" },
  ];
  it("opts 無し/空/未知 pattern は従来と完全一致", () => {
    for (const f of frames) for (const seed of SEEDS) {
      const base = J(genChordPattern(f, seed));
      expect(J(genChordPattern(f, seed, undefined)), `undef ${f.meter}#${seed}`).toBe(base);
      expect(J(genChordPattern(f, seed, {})), `空 ${f.meter}#${seed}`).toBe(base);
      expect(J(genChordPattern(f, seed, { pattern: "NOPE-XX" })), `未知 ${f.meter}#${seed}`).toBe(base);
    }
  });
  it("6/8・3/4（非4拍）は型ID を指定しても従来経路（bit 一致）", () => {
    for (const meter of ["6/8", "3/4"]) for (const seed of SEEDS) {
      const f: Frame = { bars: 4, meter };
      expect(J(genChordPattern(f, seed, { pattern: "PB-WHOLE" })), `${meter}#${seed}`).toBe(J(genChordPattern(f, seed)));
    }
  });
});

describe("(b) pattern=型ID＝当該グリッドを決定的に敷く（16分格子・vel 層）", () => {
  it("PB-WHOLE＝各拍頭に白玉（dur4）・seed 非依存・steps=bars*16", () => {
    const c1 = contentOf(genChordPattern({ bars: 2, meter: "4/4" }, 1, { pattern: "PB-WHOLE" }));
    const c9 = contentOf(genChordPattern({ bars: 2, meter: "4/4" }, 999, { pattern: "PB-WHOLE" }));
    expect(J(c1)).toBe(J(c9)); // 型ID は seed 不問で固定
    expect(c1.mode).toBe("strum");
    expect(c1.steps).toBe(32); // 2小節*16
    // 2小節ぶんの各拍頭（0,4,8,12,16,20,24,28）に dur4。
    expect(c1.hits.map((h) => h.step)).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
    expect(c1.hits.every((h) => h.dur === 4)).toBe(true);
  });
  it("DN-OFFBEAT＝裏スタブ（step2/6/10/14・dur1・vel=112）＝vel 層が載る", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 3, { pattern: "DN-OFFBEAT" }));
    expect(c.hits.map((h) => h.step)).toEqual([2, 6, 10, 14]);
    expect(c.hits.every((h) => h.dur === 1 && h.vel === CHORD_ACCENT)).toBe(true);
  });
  it("全型・全 seed：hits は 16分格子内（0<=step<steps・step 整数・dur>=1）", () => {
    for (const t of COMP_TYPES) for (const seed of SEEDS) {
      const c = contentOf(genChordPattern({ bars: 2, meter: "4/4" }, seed, { pattern: t.id }));
      expect(c.steps, t.id).toBe(32);
      expect(c.hits.length, `${t.id} は空でない`).toBeGreaterThan(0);
      for (const h of c.hits) {
        expect(Number.isInteger(h.step), `${t.id} step 整数`).toBe(true);
        expect(h.step, t.id).toBeGreaterThanOrEqual(0);
        expect(h.step, t.id).toBeLessThan(32);
        expect(h.dur, t.id).toBeGreaterThanOrEqual(1);
        expect(h.step + h.dur, `${t.id} dur が小節内`).toBeLessThanOrEqual(32);
        if (h.vel != null) { expect(h.vel, t.id).toBeGreaterThanOrEqual(1); expect(h.vel, t.id).toBeLessThanOrEqual(127); }
      }
    }
  });
  it("arp 型（PB-ARP16/AN-CHORUS）は mode='arp'", () => {
    expect(contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-ARP16" })).mode).toBe("arp");
    expect(contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "AN-CHORUS" })).mode).toBe("arp");
  });
});

describe("(c) pattern=ジャンル名＝候補から決定的1つ・テンポ域絞り", () => {
  it("ballad verse→PB-* から決定的（同 seed で一致）・steps 正", () => {
    const f: Frame = { bars: 2, meter: "4/4", section: { role: "verse" } };
    const c = contentOf(genChordPattern(f, 3, { pattern: "ballad" }));
    expect(J(contentOf(genChordPattern(f, 3, { pattern: "ballad" })))).toBe(J(c)); // 決定的
    expect(c.steps).toBe(32);
    expect(c.hits.length).toBeGreaterThan(0);
  });
  it("dance chorus tempo125＝DN-* のみ域内（AN 等は除外）", () => {
    const picked = pickCompType("dance", "chorus", 125, 3);
    expect(picked?.genre).toBe("dance");
    expect(picked!.tempoMin).toBeLessThanOrEqual(125);
    expect(picked!.tempoMax).toBeGreaterThanOrEqual(125);
  });
  it("pickCompType：tempo 域外は null／未知ジャンルは null／エイリアス（edm→dance・disco→funk）", () => {
    expect(pickCompType("ballad", "verse", 200, 1)).toBeNull(); // PB は 60-95
    expect(pickCompType("nope", "verse", 120, 1)).toBeNull(); // 未知
    expect(pickCompType("edm", "verse", 124, 1)?.genre).toBe("dance"); // エイリアス
    expect(pickCompType("disco", "verse", 110, 1)?.genre).toBe("funk"); // エイリアス
  });
  it("ジャンル指定で域内が皆無→従来経路へ fallback（bit 一致）", () => {
    const f: Frame = { bars: 2, meter: "4/4", tempo: 200, section: { role: "verse" } };
    for (const seed of SEEDS) expect(J(genChordPattern(f, seed, { pattern: "ballad" })), `#${seed}`).toBe(J(genChordPattern(f, seed)));
  });
});

describe("(d) ギター型で voicing.style==='guitar'／strumMs が載る", () => {
  it("GT-FOLK8＝style guitar＋strumMs（型の相場）・mode strum", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "GT-FOLK8" }));
    expect(c.voicing.style).toBe("guitar");
    expect(typeof c.voicing.strumMs).toBe("number");
    expect(c.mode).toBe("strum");
  });
  it("全ギター型で style=guitar＋strumMs が content に載る", () => {
    for (const t of COMP_TYPES.filter((x) => x.style === "guitar")) {
      const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 7, { pattern: t.id }));
      expect(c.voicing.style, t.id).toBe("guitar");
      expect(typeof c.voicing.strumMs, t.id).toBe("number");
    }
  });
  it("GT-POWER16＝powerChord:true が voicing に載る", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "GT-POWER16" }));
    expect(c.voicing.powerChord).toBe(true);
  });
  it("鍵盤型（PB-WHOLE）は voicing に style キーを生やさない（keyboard は省略）", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-WHOLE" }));
    expect("style" in c.voicing).toBe(false);
    expect("strumMs" in c.voicing).toBe(false);
  });
  it("opts.style 明示は鍵盤型でも guitar を上書き・opts.strumMs も上書き", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-WHOLE", style: "guitar", strumMs: 30 }));
    expect(c.voicing.style).toBe("guitar");
    expect(c.voicing.strumMs).toBe(30);
  });
});

describe("回帰：compTypeById／既知 ID", () => {
  it("compTypeById は正典 ID を返す・未知は undefined", () => {
    expect(compTypeById("GT-FOLK8")?.genre).toBe("folk");
    expect(compTypeById("CP-SYNC16")?.genre).toBe("citypop");
    expect(compTypeById("XX")).toBeUndefined();
  });
});
