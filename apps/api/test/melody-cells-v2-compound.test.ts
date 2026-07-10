import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { genMelody } from "../src/music/generate";
import { scalePcs, chordPcs } from "../src/music/theory";

// 6/8（複合2拍子）の A2レシピ統合＝genMotifMelodyV2({compound:true}) の契約。
// 骨格/move/選別/発展/弧は4/4学習を流用。6/8固有はリズム(3+3八分)・bar=3拍・強拍0/1.5・跳ねdurのみ。
const motif16 = loadMotifModel16();

// 6/8：1小節=3四分。I-vi-IV-V を2周＝8小節（C major）。各barに1コード。
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const BAR = 3; // 6/8 の1小節=3四分
const gen = (seed: number, bars = 8) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, compound: true });

const inBar = (t: number) => ((t % BAR) + BAR) % BAR;
const isStrong = (t: number) => Math.abs(inBar(t) - 0) < 0.12 || Math.abs(inBar(t) - 1.5) < 0.12;

describe("genMotifMelodyV2 compound（6/8＝骨格流用＋6/8リズム＋強拍0/1.5＋跳ね）", () => {
  it("① 返り音はすべて scale 内", () => {
    const notes = gen(14);
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("② 強拍(0/1.5拍)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(14);
    const strong = notes.filter((n) => isStrong(n.start));
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => {
      const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / BAR));
      return pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12);
    });
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("③ 全 onset が 6/8の16分12枠グリッド(0.25刻み)・小節境界=3拍・範囲 0..bars*3 に収まる（昇順）", () => {
    // 2026-07-10 統一：6/8基底を8分6枠→16分12枠へ。既定でも格子は0.25刻み（ただし既定は8分主体＝⑬で担保）。
    const bars = 8;
    const notes = gen(14, bars);
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * BAR);
      // 16分12枠グリッド＝0.25の倍数
      expect(Math.abs(n.start * 4 - Math.round(n.start * 4))).toBeLessThan(1e-6);
      // 小節内位置は 0..2.75（1小節=3拍＝12の16分枠の手前）
      expect(inBar(n.start)).toBeLessThan(BAR - 1e-9);
    }
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
  });

  it("④ seed決定的：同seedで同結果・別seedで別結果", () => {
    expect(JSON.stringify(gen(14))).toBe(JSON.stringify(gen(14)));
    expect(JSON.stringify(gen(14))).not.toBe(JSON.stringify(gen(21)));
  });

  it("⑤ 発展：B(5-6小節)は A(1-2小節)と輪郭が異なる／A''句末はその時点のコード構成音に着地", () => {
    const notes = gen(14);
    const contour = (b0: number) => {
      const seg = notes.filter((n) => n.start >= b0 * BAR && n.start < (b0 + 2) * BAR).sort((a, b) => a.start - b.start);
      const mv: number[] = [];
      for (let i = 1; i < seg.length; i++) mv.push(Math.sign(seg[i]!.pitch - seg[i - 1]!.pitch));
      return mv;
    };
    const a = contour(0);
    const b = contour(4);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // B1(2026-07-08)：終止音は「その時点のコード」の構成音（最終小節=G7ならトニック強制せずV構成音）。
    const last = notes[notes.length - 1]!;
    const bar = Math.min(pcsPerBar.length - 1, Math.floor(last.start / BAR));
    expect(pcsPerBar[bar]!.includes(((last.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("⑥ 4/4経路は不変：compound未指定なら従来の4/4挙動（小節=4拍・16分位置あり得る）", () => {
    const notes44 = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed: 14, tonicPc: 0, minor: false });
    // 4/4 は 4*8=32拍に展開（6/8 の 3*8=24 とは別）。最終 onset は 24拍以上に到達し得る。
    expect(notes44.some((n) => n.start >= 24)).toBe(true);
  });
});

describe("generate.genMelody 配線（6/8 frame → compound V2 経路）", () => {
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 3, dur: 3 }));
  it("⑦ meter=6/8 で V2(compound)経路に入り 6/8グリッドのメロが返る", () => {
    const res = genMelody({ key: 0, meter: "6/8", bars: 8, mood: "" }, chords, 14, { useV2: true });
    const item = res.items.find((x) => x.kind === "melody");
    expect(item).toBeTruthy();
    const notes = (item!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.start).toBeLessThan(8 * 3 + 1e-6); // 6/8＝1小節3拍
      expect(Math.abs(n.start * 4 - Math.round(n.start * 4))).toBeLessThan(1e-6); // 16分12枠グリッド（統一）
    }
  });
  it("⑧ meter=4/4 は不変（従来V2＝1小節4拍）", () => {
    const ch44 = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));
    const res = genMelody({ key: 0, meter: "4/4", bars: 8, mood: "" }, ch44, 14, { useV2: true });
    const item = res.items.find((x) => x.kind === "melody");
    const notes = (item!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes.some((n) => n.start >= 24)).toBe(true); // 4拍×8小節へ展開
  });
});

// ── 2026-07-10：6/8を16分12枠へ統一（常時基底・runsは再重み付け）＝4/4と同型 ──
// 旧「8分6枠＋runs時だけ12枠」の二重グリッドを廃止。既定は8分主体語が優勢で16分は稀、runsで漸増（grid切替なし）。
describe("genMotifMelodyV2 compound × runs（6/8＝16分12枠常時基底・runsで走句漸増）", () => {
  const genR = (seed: number, o: { runs?: number; density?: number }, bars = 8) =>
    genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false, compound: true, ...o });
  const is16Off = (t: number) => Math.abs(((t * 4) % 2) - 1) < 0.1; // 8分格子外(.25/.75)＝16分

  it("⑨ runs 未指定＝決定的（同seed同出力）・gen() と一致", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(JSON.stringify(genR(seed, {})), `seed=${seed}`).toBe(JSON.stringify(gen(seed)));
    }
  });

  it("⑬ 既定(runs未指定)は8分主体＝16分率が低い（<0.05）／runsで単調に増える", () => {
    const rate = (o: { runs?: number }) => {
      let tot = 0, off = 0;
      for (let seed = 1; seed <= 40; seed++) {
        for (const n of genR(seed, o)) { tot++; if (is16Off(n.start)) off++; }
      }
      return off / tot;
    };
    const base = rate({}), r4 = rate({ runs: 0.4 }), r8 = rate({ runs: 0.8 });
    expect(base, `既定16分率(${base.toFixed(3)})<0.05＝8分主体`).toBeLessThan(0.05);
    expect(r4, `runs0.4(${r4.toFixed(3)})>=既定`).toBeGreaterThanOrEqual(base);
    expect(r8, `runs0.8(${r8.toFixed(3)})>runs0.4`).toBeGreaterThan(r4);
  });

  it("⑩ runs=1・seed sweep で16分onset率>0.1・走句性(隣接0.25ペア)が出る", () => {
    let tot = 0, off = 0, adj = 0, offN = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const starts = genR(seed, { runs: 1 }).map((n) => n.start).sort((a, b) => a - b);
      for (let i = 0; i < starts.length; i++) {
        tot++;
        if (is16Off(starts[i]!)) {
          off++; offN++;
          if ((i > 0 && starts[i]! - starts[i - 1]! <= 0.26) || (i < starts.length - 1 && starts[i + 1]! - starts[i]! <= 0.26)) adj++;
        }
      }
    }
    expect(off / tot, `16分率(${(off / tot).toFixed(3)})>0.1`).toBeGreaterThan(0.1);
    expect(offN ? adj / offN : 0, `16分の隣接率(${offN ? (adj / offN).toFixed(3) : 0})>0.5＝走句`).toBeGreaterThan(0.5);
  });

  it("⑪ runs=1でも決定的・音域維持・onset昇順・dur>0で音が次を食わない", () => {
    for (const runs of [0.5, 1]) {
      expect(JSON.stringify(genR(14, { runs }))).toBe(JSON.stringify(genR(14, { runs })));
      for (let seed = 1; seed <= 20; seed++) {
        const notes = genR(seed, { runs });
        expect(notes.length).toBeGreaterThan(0);
        for (const n of notes) {
          expect(n.pitch).toBeGreaterThanOrEqual(58);
          expect(n.pitch).toBeLessThanOrEqual(83);
          expect(n.dur).toBeGreaterThan(0);
        }
        for (let i = 1; i < notes.length; i++) {
          expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
          // 前音の dur が次の onset を跨がない（16分ペアがジグ跳ねで潰れない）
          expect(notes[i - 1]!.start + notes[i - 1]!.dur).toBeLessThanOrEqual(notes[i]!.start + 1e-6);
        }
      }
    }
  });

  it("⑫ runs=1・6/8でも全音がscale内・強拍コードトーン率>0.5（12枠でも品質不変）", () => {
    const notes = genR(14, { runs: 1 });
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
    const strong = notes.filter((n) => isStrong(n.start));
    const ct = strong.filter((n) => {
      const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / BAR));
      return pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12);
    });
    expect(strong.length).toBeGreaterThan(0);
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("⑭ 走句がスケール的に繋がる＝16分連鎖の同音潰れが少ない・順次が多い（2026-07-10 案B・6/8）", () => {
    let chain = 0, rep = 0, step = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const notes = genR(seed, { runs: 1 }).sort((a, b) => a.start - b.start);
      for (let i = 1; i < notes.length; i++) {
        if (notes[i]!.start - notes[i - 1]!.start <= 0.26) {
          chain++;
          const d = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
          if (d === 0) rep++;
          if (d >= 1 && d <= 2) step++;
        }
      }
    }
    expect(chain, "16分連鎖が実在").toBeGreaterThan(50);
    expect(rep / chain, `同音率(${(rep / chain).toFixed(3)})<0.25（従来~0.42から半減以下）`).toBeLessThan(0.25);
    expect(step / chain, `順次(1-2半音)率(${(step / chain).toFixed(3)})>0.7`).toBeGreaterThan(0.7);
  });
});
