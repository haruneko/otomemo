// ベース語彙のジャンル型ライブラリ（WP-B1・2026-07-14・design「ベース定型型＋フィル語彙」・
// research/2026-07-14-bass-genre-vocabulary.md）。契約：
//  (a) style/fill 未指定＝従来 bit 一致 (b) style=型ID→当該グリッド固定出力（音域窓 33..48内）
//  (c) style=ジャンル→候補から決定的1つ・テンポ域外の型はジャンル指定で選ばれない（fallback）
//  (d) 6/8 は style/fill 対象外＝従来 (e) kick絡み合成の排他（style+kickLock＝style 単独と一致）
//  (f) fill＝末尾1つ手前の小節をフィル型で置換・他小節不変。
import { describe, it, expect } from "vitest";
import { genBass, type Frame } from "../src/music/generate";
import { bassTypeById, pickBassType, resolveBassFill, parseBassPattern, BASS_TYPES, BASS_FILLS } from "../src/music/bassLibrary";

type Note = { pitch: number; start: number; dur: number };
const notesOf = (r: ReturnType<typeof genBass>): Note[] => (r.items[0]!.content as { notes: Note[] }).notes;
const J = (x: unknown) => JSON.stringify(x);
const C1 = [{ root: 0, quality: "", start: 0, dur: 64 }]; // C を敷き詰め
const SEEDS = [1, 2, 3, 42];
// mkDrums（gen-bass-drums.test.ts と同形）＝キック絡み排他テスト用。
const mkDrums = (kick: number[], snare: number[], steps = 16, beatsPerStep = 0.25) => ({
  rhythm: { steps, bars: 1, beatsPerStep, lanes: [{ name: "Kick", midi: 36, hits: kick, vel: 115 }, { name: "Snare", midi: 38, hits: snare, vel: 105 }] },
});

describe("辞書の健全性（純データ）", () => {
  it("42型＋5フィル・cells は grid セル（16=4/4・12=6/8 world68）・tempoMin<=tempoMax", () => {
    expect(BASS_TYPES.length).toBe(42); // 34（L4トラックA）＋ world68 bass8（裁定D 2026-07-25）＝42（FL は別リスト）
    expect(BASS_FILLS.length).toBe(5);
    for (const t of BASS_TYPES) { expect(t.grid === 16 || t.grid === 12, t.id).toBe(true); expect(t.cells.length, t.id).toBe(t.grid); expect(t.tempoMin).toBeLessThanOrEqual(t.tempoMax); }
    for (const f of BASS_FILLS) expect(f.cells.length).toBe(16); // フィルは4/4のみ
    expect(BASS_TYPES.filter((t) => t.grid === 12).length).toBe(8); // world68 bass は8型
    // 合計 42+5=47。
    expect(BASS_TYPES.length + BASS_FILLS.length).toBe(47);
  });
  it("パーサ：tie/rest/ghost/slide/next を正しく分類", () => {
    const c = parseBassPattern("/R - . x | 5 8> . . | . . . . | . . . .");
    expect(c[0]).toEqual({ kind: "on", deg: "R", next: false }); // スライドは剥がす
    expect(c[1]).toEqual({ kind: "tie" });
    expect(c[2]).toEqual({ kind: "rest" });
    expect(c[3]).toEqual({ kind: "ghost" });
    expect(c[4]).toEqual({ kind: "on", deg: "5", next: false });
    expect(c[5]).toEqual({ kind: "on", deg: "8", next: true }); // 8> = next
  });
});

describe("(a) style/fill 未指定＝従来と bit 一致（鉄則）", () => {
  const frames: Frame[] = [
    { bars: 2, meter: "4/4" }, { bars: 4, meter: "4/4", mood: "切ない" },
    { bars: 4, meter: "4/4", mood: "明るい", tempo: 140 }, { bars: 4, meter: "6/8" },
  ];
  it("opts 無し/空/未知 style は従来と完全一致", () => {
    for (const f of frames) for (const seed of SEEDS) {
      const base = J(genBass(f, C1, seed));
      expect(J(genBass(f, C1, seed, undefined, {})), `空 ${f.meter}#${seed}`).toBe(base);
      expect(J(genBass(f, C1, seed, undefined, { style: "NOPE-XX", fill: undefined })), `未知 ${f.meter}#${seed}`).toBe(base);
    }
  });
});

describe("(b) style=型ID＝当該グリッドを固定出力（seed 非依存・窓 33..48内）", () => {
  it("RK-8ROOT（C）＝8分ルート連打・全て pitch36・dur0.25", () => {
    const out1 = notesOf(genBass({ bars: 1, meter: "4/4" }, C1, 1, undefined, { style: "RK-8ROOT" }));
    const out999 = notesOf(genBass({ bars: 1, meter: "4/4" }, C1, 999, undefined, { style: "RK-8ROOT" }));
    expect(J(out1)).toBe(J(out999)); // 型ID は seed 不問で固定
    expect(out1.map((n) => n.start)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(out1.every((n) => n.pitch === 36 && n.dur === 0.25)).toBe(true);
  });
  it("BL-WHOLE（C）＝全音符1発（start0/dur4/pitch36）", () => {
    const out = notesOf(genBass({ bars: 1, meter: "4/4" }, C1, 3, undefined, { style: "BL-WHOLE" }));
    expect(out).toEqual([{ pitch: 36, start: 0, dur: 4 }]);
  });
  it("CP-OCT8（C）＝R↔オクターブ往復（36/48 交互・48=C3 は窓内）", () => {
    const out = notesOf(genBass({ bars: 1, meter: "4/4" }, C1, 7, undefined, { style: "CP-OCT8" }));
    expect(out.map((n) => n.pitch)).toEqual([36, 48, 36, 48, 36, 48, 36, 48]);
    expect(out.map((n) => n.start)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });
  it("全型・全 seed で音域窓 33..48 内（度数→実音は fold・型 grid に合う拍子で敷く）", () => {
    for (const t of BASS_TYPES) for (const seed of SEEDS) {
      const meter = t.grid === 12 ? "6/8" : "4/4"; // world68 は 6/8 枠（realizeBassGrid grid=12）
      const out = notesOf(genBass({ bars: 2, meter }, [{ root: 7, quality: "", start: 0, dur: 64 }], seed, undefined, { style: t.id }));
      for (const n of out) { expect(n.pitch, `${t.id}#${seed}`).toBeGreaterThanOrEqual(33); expect(n.pitch).toBeLessThanOrEqual(48); }
    }
  });
});

describe("(c) style=ジャンル→候補から決定的1つ・テンポ域外は選ばれない", () => {
  it("rock chorus tempo180＝RK-GALLOP のみ域内（RK-8ROOT は120-170で除外）", () => {
    const f: Frame = { bars: 1, meter: "4/4", tempo: 180, section: { role: "chorus" } };
    const out = notesOf(genBass(f, C1, 3, undefined, { style: "rock" }));
    // RK-GALLOP＝R . R R の16分ギャロップ（各拍 0,0.5,0.75）。
    expect(out.map((n) => n.start)).toEqual([0, 0.5, 0.75, 1, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5, 3.75]);
    expect(J(notesOf(genBass(f, C1, 3, undefined, { style: "rock" })))).toBe(J(out)); // 決定的
  });
  it("ballad tempo180＝域内の型が無い→従来経路へ fallback（bit 一致）", () => {
    const f: Frame = { bars: 2, meter: "4/4", tempo: 180 };
    for (const seed of SEEDS) expect(J(genBass(f, C1, seed, undefined, { style: "ballad" })), `#${seed}`).toBe(J(genBass(f, C1, seed)));
  });
  it("pickBassType：tempo 域内のみ適格・域外は null", () => {
    expect(pickBassType("ballad", "verse", 180, 1)).toBeNull(); // BL は 60-95
    expect(pickBassType("rock", "chorus", 180, 1)?.id).toBe("RK-GALLOP"); // 唯一域内
    expect(pickBassType("nope", "verse", 120, 1)).toBeNull(); // 未知ジャンル
    // ジャンルエイリアス（disco→citypop）。
    expect(pickBassType("disco", "verse", 110, 1)?.genre).toBe("citypop");
  });
});

describe("(d) 6/8 で 4/4型/fill は対象外＝従来経路（grid ガード・bit 一致）", () => {
  it("6/8 に 4/4 型(RK-8ROOT)や fill を指定しても従来と一致（world68 6/8型は別テスト w68）", () => {
    const f: Frame = { bars: 4, meter: "6/8" };
    for (const seed of SEEDS) {
      expect(J(genBass(f, C1, seed, undefined, { style: "RK-8ROOT" })), `style#${seed}`).toBe(J(genBass(f, C1, seed))); // grid16 型は 6/8 枠で敷けない
      expect(J(genBass(f, C1, seed, undefined, { fill: "FL-WALKUP" })), `fill#${seed}`).toBe(J(genBass(f, C1, seed)));
    }
  });
});

// ── 裁定D：6/8 無国籍民族調（world68・grid:12・realizeBassGrid grid=12）───────────
describe("(w68) world68 bass＝6/8 枠で12セル格子・4/4枠では従来経路（grid ガード）", () => {
  const W = [{ root: 0, quality: "", start: 0, dur: 64 }]; // C 敷き詰め（6/8）
  it("world68 は8型・genre:world68・grid:12", () => {
    const w = BASS_TYPES.filter((t) => t.genre === "world68");
    expect(w.length).toBe(8);
    for (const t of w) { expect(t.grid, t.id).toBe(12); expect(t.cells.length, t.id).toBe(12); }
  });
  it("w68-bs-anchor（6/8・C）＝大拍 step0/6＝拍0と3に R（step×0.25拍・BASS_STEP_TO_BEAT）", () => {
    const out = notesOf(genBass({ bars: 1, meter: "6/8" }, W, 1, undefined, { style: "w68-bs-anchor" }));
    expect(out.map((n) => n.start)).toEqual([0, 1.5]); // step0=0拍, step6=1.5拍（大拍2つ＝付点4分=3拍/2）
    expect(out.every((n) => n.pitch === 36)).toBe(true); // R=C2
  });
  it("w68-bs-drone（6/8・C）＝1発 dur3拍（1小節=3拍・step0..11 タイ）", () => {
    const out = notesOf(genBass({ bars: 1, meter: "6/8" }, W, 1, undefined, { style: "w68-bs-drone" }));
    expect(out).toEqual([{ pitch: 36, start: 0, dur: 3 }]);
  });
  it("w68-bs-jig（6/8・C）＝奇数step歩行 R-5-6-8-6-5（大拍0/1.5含む・全 onset 拍位置正）", () => {
    const out = notesOf(genBass({ bars: 1, meter: "6/8" }, W, 3, undefined, { style: "w68-bs-jig" }));
    expect(out.map((n) => n.start)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]); // step0,2,4,6,8,10 ×0.25拍
    expect(out.map((n) => n.pitch)).toEqual([36, 43, 45, 48, 45, 43]); // R36,5=43,6=45,8=48,6=45,5=43
  });
  it("relative:true＝mode relative・steps=bars*12・patternId（seed 冪等）", () => {
    const c = genBass({ bars: 2, meter: "6/8" }, W, 1, undefined, { style: "w68-bs-anchor", relative: true }).items[0]!.content as { mode: string; steps: number; patternId: string };
    expect(c.mode).toBe("relative");
    expect(c.steps).toBe(24); // 2小節×12
    expect(c.patternId).toBe("w68-bs-anchor");
  });
  it("w68-bs-approach＝末尾 #7> が next（次小節頭ルートへ先取り）で BassStep に保存", () => {
    const c = genBass({ bars: 1, meter: "6/8" }, W, 1, undefined, { style: "w68-bs-approach", relative: true }).items[0]!.content as { pattern: { step: number; degree: string; next?: boolean }[] };
    const last = c.pattern[c.pattern.length - 1]!;
    expect(last.degree).toBe("#7");
    expect(last.next).toBe(true);
    expect(last.step).toBe(10); // step10（大拍外・次頭を予告）
  });
  it("world68 型を 4/4 枠に指定＝grid ガードで従来経路（bit 一致）", () => {
    const f: Frame = { bars: 2, meter: "4/4" };
    for (const seed of SEEDS) expect(J(genBass(f, C1, seed, undefined, { style: "w68-bs-anchor" })), `#${seed}`).toBe(J(genBass(f, C1, seed)));
  });
});

describe("(e) kick絡み合成の排他（style 格子が正準・kickLock と二重適用しない）", () => {
  it("style+kickLock+drums は style 単独と完全一致（kickLock 無視）", () => {
    const f: Frame = { bars: 2, meter: "4/4" };
    const d = mkDrums([0, 6, 10], [4, 12]);
    for (const seed of SEEDS) {
      const alone = J(genBass(f, C1, seed, undefined, { style: "RK-8ROOT" }));
      expect(J(genBass(f, C1, seed, d, { style: "RK-8ROOT", kickLock: 1 })), `kickLock1#${seed}`).toBe(alone);
      expect(J(genBass(f, C1, seed, d, { style: "RK-8ROOT", kickLock: -1 })), `kickLock-1#${seed}`).toBe(alone);
    }
  });
});

describe("(f) セクション末フィル＝末尾1つ手前の小節を置換・他小節不変", () => {
  it("fill=FL-WALKUP：fillBar(bars-2)にフィル・bars0,1 は base 不変", () => {
    const f: Frame = { bars: 4, meter: "4/4" };
    const base = notesOf(genBass(f, C1, 5));
    const out = notesOf(genBass(f, C1, 5, undefined, { fill: "FL-WALKUP" }));
    const fs = 8, fe = 12; // fillBar = bars-2 = 2 → [8,12)
    // bars 0,1（start<8）は base と一致（不変）。
    expect(J(out.filter((n) => n.start < fs - 1e-9))).toBe(J(base.filter((n) => n.start < fs - 1e-9)));
    // fillBar は FL-WALKUP 実音（C：R36→5=43→6=45→b7=46→#7=47→R>=36）。
    const inFill = out.filter((n) => n.start >= fs - 1e-9 && n.start < fe - 1e-9);
    expect(inFill).toEqual([
      { pitch: 36, start: 8, dur: 0.25 }, { pitch: 43, start: 10, dur: 0.25 },
      { pitch: 45, start: 10.5, dur: 0.25 }, { pitch: 46, start: 11, dur: 0.25 },
      { pitch: 47, start: 11.5, dur: 0.25 }, { pitch: 36, start: 11.75, dur: 0.25 },
    ]);
  });
  it("fill=数値 0..1：<0.5=下降/>=0.5=上昇（決定的）", () => {
    expect(resolveBassFill(0.2, 0)?.dir).toBe("down");
    expect(resolveBassFill(0.9, 0)?.dir).toBe("up");
    const f: Frame = { bars: 4, meter: "4/4" };
    expect(J(genBass(f, C1, 5, undefined, { fill: 0.9 }))).toBe(J(genBass(f, C1, 5, undefined, { fill: 0.9 }))); // 決定的
  });
  it("bars<2 はフィル不可＝base のまま", () => {
    const f: Frame = { bars: 1, meter: "4/4" };
    expect(J(genBass(f, C1, 5, undefined, { fill: 0.5 }))).toBe(J(genBass(f, C1, 5)));
  });
});

describe("回帰：既存 genBass 契約（skeleton/型不変の確認）", () => {
  it("bassTypeById は正典 ID を返す・未知は undefined", () => {
    expect(bassTypeById("FK-ONE")?.genre).toBe("funk");
    expect(bassTypeById("XX")).toBeUndefined();
  });
});
