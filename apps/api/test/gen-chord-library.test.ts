// 伴奏パターン型辞書（chordLibrary・S2・2026-07-22・design「伴奏パターン型辞書（chordLibrary・S2）」・
// research/2026-07-22-piano-comping-vocabulary.md／guitar-comping-vocabulary.md）。契約：
//  (a) pattern 未指定＝従来 genChordPattern と deepStrictEqual bit 一致（鉄則）
//  (b) pattern=型ID→当該グリッドを決定的に敷く（16分格子・vel 層が載る）
//  (c) pattern=ジャンル名→候補から決定的1つ・テンポ域絞り（域外は選ばれない）
//  (d) ギター型で voicing.style==="guitar"／strumMs が載る
import { describe, it, expect } from "vitest";
import { genChordPattern, type Frame } from "../src/music/generate";
import { COMP_TYPES, compTypeById, pickCompType, pickCompTypes, parseCompRh, parseCompLh, compHitsForBar, compLhHitsForBar, CHORD_ACCENT, CHORD_GHOST } from "../src/music/chordLibrary";

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
    expect(c[7]).toEqual({ kind: "attack", dir: "U" }); // S3：plain U は dir のみ（vel は焼かない＝render で×0.78 一元化）
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

// ── L0：レンダ真因修正（案A・研究doc 2026-07-22-pattern-quality-root-cause §3）─────────
// 鍵盤型 voicing に top:72 を積み voiceToTop 経路へ乗せる（7th 復活・RH C4-C5）。ギター型/従来経路は不変。
describe("(L0) keyboard 型の buildCompContent は voicing.top=72 を積む／guitar・従来経路は不変", () => {
  const voicingOf = (r: ReturnType<typeof genChordPattern>): Record<string, unknown> => (r.items[0]!.content as { voicing: Record<string, unknown> }).voicing;
  it("鍵盤型（PB-WHOLE/CP-SYNC16/GS-STRIDE）は voicing.top===72", () => {
    for (const id of ["PB-WHOLE", "CP-SYNC16", "GS-STRIDE"]) {
      const v = voicingOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: id }));
      expect(v.top, id).toBe(72);
    }
  });
  it("全鍵盤型（style!=='guitar'）が top===72／全ギター型は top を持たない（voiceGuitar 経路のまま）", () => {
    for (const t of COMP_TYPES) {
      const v = voicingOf(genChordPattern({ bars: 1, meter: "4/4" }, 7, { pattern: t.id }));
      if (t.style === "guitar") expect("top" in v, `${t.id} guitar は top なし`).toBe(false);
      else expect(v.top, `${t.id} keyboard は top=72`).toBe(72);
    }
  });
  it("variety 複数経路（ballad×3）も各候補の鍵盤型に top=72 が載る", () => {
    const r = genChordPattern({ bars: 2, meter: "4/4", section: { role: "verse" } }, 3, { pattern: "ballad", variety: 3 });
    for (const it of r.items) {
      const v = (it.content as { voicing: Record<string, unknown> }).voicing;
      // ballad 語彙は全て鍵盤型（PB-*・GT-BALLAD はギター）→ style で分岐
      if (v.style === "guitar") expect("top" in v, it.label).toBe(false);
      else expect(v.top, it.label).toBe(72);
    }
  });
  it("opts.style=guitar 上書き（鍵盤型を guitar 解決）は top を積まない（ギター経路）", () => {
    const v = voicingOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-WHOLE", style: "guitar" }));
    expect("top" in v).toBe(false);
    expect(v.style).toBe("guitar");
  });
  it("従来経路（pattern 未指定/未知/6-8非4拍）の voicing は top キーを生やさない＝bit 一致", () => {
    for (const r of [
      genChordPattern({ bars: 2, meter: "4/4" }, 3),
      genChordPattern({ bars: 2, meter: "4/4" }, 3, { pattern: "NOPE-XX" }),
      genChordPattern({ bars: 4, meter: "6/8" }, 3, { pattern: "PB-WHOLE" }),
    ]) {
      expect("top" in (r.items[0]!.content as { voicing: Record<string, unknown> }).voicing).toBe(false);
    }
  });
});

// ── スライスC：候補を複数返す（variety）──────────────────────────────────────
describe("(g) variety＝候補を複数（別々の型）返す・未指定/1 は従来 bit 一致", () => {
  it("variety 未指定/1 は単数経路と deepStrictEqual（ジャンル・型ID・omakase 横断）", () => {
    const frames: Frame[] = [
      { bars: 2, meter: "4/4", section: { role: "verse" } },
      { bars: 4, meter: "4/4", tempo: 90, section: { role: "chorus" } },
      { bars: 2, meter: "4/4" },
    ];
    for (const f of frames) for (const seed of SEEDS) for (const pat of ["ballad", "rock", "PB-WHOLE", "GT-FOLK8", "omakase"]) {
      const base = J(genChordPattern(f, seed, { pattern: pat }));
      expect(J(genChordPattern(f, seed, { pattern: pat, variety: 1 })), `${pat} v1 ${f.meter}#${seed}`).toBe(base);
      // variety=1 は変えないので undefined と一致（従来 bit 一致の担保）。
    }
  });
  it("ballad×variety=3＝別々の型が items に並ぶ（distinct・決定的・各 label に型ID＋場面）", () => {
    const f: Frame = { bars: 2, meter: "4/4", section: { role: "verse" } };
    const r = genChordPattern(f, 3, { pattern: "ballad", variety: 3 });
    expect(r.items.length).toBe(3); // ballad 語彙＝PB-WHOLE/PB-ARP8/PB-ARP16
    // 別々の型＝content が全部異なる
    const conts = r.items.map((it) => J(it.content));
    expect(new Set(conts).size).toBe(3);
    // label に型IDが入る（型名で選ぶ＝型ID＋場面タグ）
    for (const it of r.items) expect(/^[A-Z]{2}-[A-Z0-9]+ /.test(it.label), it.label).toBe(true);
    expect(r.items.every((it) => it.kind === "chord_pattern")).toBe(true);
    // 決定的：同 seed で完全一致
    expect(J(genChordPattern(f, 3, { pattern: "ballad", variety: 3 }))).toBe(J(r));
  });
  it("omakase×variety=4＝全型から別々に4件（role/tempo 全体から・distinct）", () => {
    const r = genChordPattern({ bars: 1, meter: "4/4" }, 2, { pattern: "omakase", variety: 4 });
    expect(r.items.length).toBe(4);
    expect(new Set(r.items.map((it) => J(it.content))).size).toBe(4);
  });
  it("型ID直指定＋variety=3 は単数固定（多分岐スキップ＝1件・bit）", () => {
    const r = genChordPattern({ bars: 1, meter: "4/4" }, 5, { pattern: "PB-WHOLE", variety: 3 });
    expect(r.items.length).toBe(1);
    expect(J(r)).toBe(J(genChordPattern({ bars: 1, meter: "4/4" }, 5, { pattern: "PB-WHOLE" })));
  });
  it("6/8・非4拍は variety>=2 でも従来経路（単数・bit）", () => {
    for (const meter of ["6/8", "3/4"]) {
      const r = genChordPattern({ bars: 2, meter }, 1, { pattern: "ballad", variety: 3 });
      expect(r.items.length).toBe(1);
      expect(J(r)).toBe(J(genChordPattern({ bars: 2, meter }, 1)));
    }
  });
  it("pickCompTypes：distinct・最大 n・決定的・tempo 域絞り・未知は空", () => {
    const a = pickCompTypes("ballad", "verse", undefined, 3, 3);
    expect(a.length).toBe(3);
    expect(new Set(a.map((t) => t.id)).size).toBe(3); // distinct
    expect(pickCompTypes("ballad", "verse", undefined, 3, 3).map((t) => t.id)).toEqual(a.map((t) => t.id)); // 決定的
    // tempo 域内皆無＝**空にしない**＝ジャンル語彙をテンポ距離の近い順で提示（E2E所見 2026-07-22：
    // section 既定 tempo120 でバラード/シティポップが全滅→汎用1件に落ちて「聴いて選ぶ」が成立しなかった修正）
    const far = pickCompTypes("ballad", "verse", 200, 1, 3);
    expect(far.length).toBe(3);
    expect(far[0]!.id).toBe("PB-ARP16"); // tempoMax=95＝200 に最も近い
    // tempo=120（section 既定）でも ballad 候補が出る（域外だが語彙は提示）
    expect(pickCompTypes("ballad", "verse", 120, 1, 4).length).toBeGreaterThanOrEqual(3);
    expect(pickCompTypes("citypop", "verse", 120, 1, 4).length).toBeGreaterThanOrEqual(2);
    // 未知ジャンル＝空
    expect(pickCompTypes("nope", "verse", undefined, 1, 3)).toEqual([]);
    // n 過多でも母集団を超えない
    expect(pickCompTypes("ballad", "verse", undefined, 1, 99).length).toBeLessThanOrEqual(COMP_TYPES.length);
    // omakase は全型から
    expect(pickCompTypes("omakase", undefined, undefined, 1, 5).length).toBe(5);
  });
});

// ── 修理#1：型IDの残留（patternId・監査違反③）───────────────────────────────
describe("(h) patternId＝適用した型IDを content に刻む（未解決経路は生やさない＝bit一致）", () => {
  const cid = (r: ReturnType<typeof genChordPattern>) => (r.items[0]!.content as { patternId?: string }).patternId;
  it("型ID直指定＝patternId にその型ID（単数経路）", () => {
    expect(cid(genChordPattern({ bars: 2, meter: "4/4" }, 1, { pattern: "PB-WHOLE" }))).toBe("PB-WHOLE");
    expect(cid(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "GT-FOLK8" }))).toBe("GT-FOLK8");
  });
  it("ジャンル名（単数経路）＝解決した型の id が載る", () => {
    const f: Frame = { bars: 2, meter: "4/4", section: { role: "verse" } };
    const id = cid(genChordPattern(f, 3, { pattern: "ballad" }));
    expect(id).toBeTruthy();
    expect(compTypeById(id!)?.genre).toBe("ballad");
  });
  it("variety 複数＝各 item の patternId が label の型IDと一致（distinct）", () => {
    const f: Frame = { bars: 2, meter: "4/4", section: { role: "verse" } };
    const r = genChordPattern(f, 3, { pattern: "ballad", variety: 3 });
    const ids = r.items.map((it) => (it.content as { patternId?: string }).patternId);
    expect(new Set(ids).size).toBe(3); // 別々の型
    for (const it of r.items) {
      const pid = (it.content as { patternId?: string }).patternId!;
      expect(it.label.startsWith(pid), `${it.label} は ${pid} で始まる`).toBe(true); // label=`型ID 場面`
    }
  });
  it("従来経路（pattern 未指定/未知/6-8非4拍）は patternId キーを生やさない（bit一致）", () => {
    for (const r of [
      genChordPattern({ bars: 2, meter: "4/4" }, 3),
      genChordPattern({ bars: 2, meter: "4/4" }, 3, { pattern: "NOPE-XX" }),
      genChordPattern({ bars: 4, meter: "6/8" }, 3, { pattern: "PB-WHOLE" }),
      genChordPattern({ bars: 2, meter: "4/4" }, 3, { pattern: "omakase" }), // 単数 omakase は未解決→従来
    ]) {
      expect("patternId" in (r.items[0]!.content as object)).toBe(false);
    }
  });
});

describe("回帰：compTypeById／既知 ID", () => {
  it("compTypeById は正典 ID を返す・未知は undefined", () => {
    expect(compTypeById("GT-FOLK8")?.genre).toBe("folk");
    expect(compTypeById("CP-SYNC16")?.genre).toBe("citypop");
    expect(compTypeById("XX")).toBeUndefined();
  });
});

// ── S3：左手(LH)内蔵＋ギター D/U 配線 ──────────────────────────────────────────
describe("S3 (e) ギター型の hits に dir(D/U) が透過", () => {
  it("GT-DU8＝表拍D・裏U が hit.dir へ（U は vel を焼かない＝render で×0.78）", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "GT-DU8" }));
    // GT-DU8 rh = "D - U - | D - U - | D - U - | D - U -" → D=step0,4,8,12 / U=step2,6,10,14
    const dirs = new Map(c.hits.map((h) => [h.step, h.dir]));
    expect(dirs.get(0)).toBe("D");
    expect(dirs.get(2)).toBe("U");
    // plain U は vel を持たない（dir のみ）＝二重掛け回避。
    expect(c.hits.find((h) => h.step === 2)!.vel).toBeUndefined();
    // アクセントダウン `d`(GT-BACKBEAT 等)は vel を保持
    const b = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "GT-BACKBEAT" }));
    const accentDown = b.hits.find((h) => h.dir === "D" && h.vel === CHORD_ACCENT);
    expect(accentDown, "GT-BACKBEAT にアクセントダウンあり").toBeTruthy();
  });
  it("鍵盤型（PB-WHOLE）の hits に dir キーは生えない（bit）", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-WHOLE" }));
    expect(c.hits.every((h) => !("dir" in h))).toBe(true);
  });
  it("compHitsForBar：dir セルは dir を透過・dir 無しセルはキーを生やさない", () => {
    const hits = compHitsForBar(parseCompRh("D - U - | . . . . | . . . . | . . . ."), 0);
    expect(hits[0]).toEqual({ step: 0, dur: 2, dir: "D" }); // D + hold
    expect(hits[1]).toEqual({ step: 2, dur: 2, dir: "U" }); // U + hold（vel 無し）
    const kb = compHitsForBar(parseCompRh("A - - - | . . . . | . . . . | . . . ."), 0);
    expect("dir" in kb[0]!).toBe(false); // dir 無しセルは dir キー無し
  });
});

describe("S3 (f) keyboard 型は content.lh を custom で載せる／guitar 型は載せない", () => {
  it("PB-WHOLE＝content.lh={mode:custom, hits(deg)}・小節ぶん敷かれる", () => {
    const c = contentOf(genChordPattern({ bars: 2, meter: "4/4" }, 1, { pattern: "PB-WHOLE" })) as unknown as { lh?: { mode: string; hits: { step: number; dur: number; deg: string }[] } };
    expect(c.lh?.mode).toBe("custom");
    // PB-WHOLE lh = "R - - - | - - - - | - - - - | - - - -" → 1小節=step0 の R（dur16）。2小節=step0,16。
    expect(c.lh?.hits.map((h) => h.step)).toEqual([0, 16]);
    expect(c.lh?.hits.every((h) => h.deg === "R")).toBe(true);
  });
  it("PB-ARP16＝lh に R/5 が度数で載る（deg 透過）", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-ARP16" })) as unknown as { lh?: { hits: { deg: string }[] } };
    // PB-ARP16 lh = "R - - - | 5 - - - | R - - - | 5 - - -"
    expect(c.lh?.hits.map((h) => h.deg)).toEqual(["R", "5", "R", "5"]);
  });
  it("ギター型（GT-FOLK8）は content.lh を持たない（ギターに左手なし）", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "GT-FOLK8" })) as unknown as { lh?: unknown };
    expect("lh" in c).toBe(false);
  });
  it("opts.style=guitar で鍵盤型を上書き＝lh を載せない（ギター解決だから）", () => {
    const c = contentOf(genChordPattern({ bars: 1, meter: "4/4" }, 1, { pattern: "PB-WHOLE", style: "guitar" })) as unknown as { lh?: unknown };
    expect("lh" in c).toBe(false);
  });
  it("従来経路（pattern 未指定）は lh/dir を触らない（bit 一致・鉄則の再確認）", () => {
    const c = contentOf(genChordPattern({ bars: 2, meter: "4/4" }, 3)) as unknown as { lh?: unknown; hits: { dir?: string }[] };
    expect("lh" in c).toBe(false);
    expect(c.hits.every((h) => !("dir" in h))).toBe(true);
  });
  it("compLhHitsForBar：attack を deg 付き hit へ・hold で dur 伸長・rest 打ち切り", () => {
    const cells = parseCompLh("R - - - | 5 - . . | . . . . | . . . .");
    expect(compLhHitsForBar(cells, 0)).toEqual([
      { step: 0, dur: 4, deg: "R" }, // R + 3 hold
      { step: 4, dur: 2, deg: "5" }, // 5 + 1 hold（次が rest）
    ]);
  });
});
