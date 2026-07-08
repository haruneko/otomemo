import { describe, it, expect } from "vitest";
import { completeMelody, extractMotif16, genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { genMelody } from "../src/music/generate";
import { scalePcs, chordPcs } from "../src/music/theory";

// メロディ補完(completion)＝部分メロを種に V2 が残りを発展で埋める、の契約テスト。
const motif16 = loadMotifModel16();

// I-vi-IV-V を2周＝8小節（C major）。melody-cells-v2.test.ts と同じ枠。
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

// 2小節の自作 partial（scale内・拍頭はコードトーン寄り）。
const PARTIAL = [
  { pitch: 60, start: 0, dur: 0.5 }, // C (C△)
  { pitch: 64, start: 0.5, dur: 0.5 }, // E
  { pitch: 67, start: 1, dur: 1 }, // G
  { pitch: 72, start: 2, dur: 1 }, // C
  { pitch: 67, start: 3, dur: 1 }, // G
  { pitch: 69, start: 4, dur: 1 }, // A (Am7)
  { pitch: 67, start: 5, dur: 1 }, // G
  { pitch: 64, start: 6, dur: 2 }, // E
];

const inBar = (t: number) => ((t % 4) + 4) % 4;
const isStrong = (t: number) => Math.abs(inBar(t) - 0) < 0.12 || Math.abs(inBar(t) - 2) < 0.12;

const complete = (seed: number, bars = 8, partial = PARTIAL) =>
  completeMelody(partial, pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false });

describe("completeMelody（部分メロ→モチーフ発展で全小節補完）", () => {
  it("① partial の小節が出力に実音保持される（先頭がそのまま）", () => {
    const out = complete(7);
    expect(out.length).toBeGreaterThan(PARTIAL.length);
    for (let i = 0; i < PARTIAL.length; i++) {
      expect(out[i]!.pitch).toBe(PARTIAL[i]!.pitch);
      expect(out[i]!.start).toBe(PARTIAL[i]!.start);
    }
  });

  it("② 出力が frame.bars(=8小節) 全体を覆う（partial 以降も埋まる）", () => {
    const bars = 8;
    const out = complete(7, bars);
    const cut = 2 * 4; // partial=2小節
    expect(out.some((n) => n.start >= cut)).toBe(true); // 残りが埋まっている
    expect(Math.max(...out.map((n) => n.start))).toBeGreaterThanOrEqual((bars - 2) * 4); // 末尾ブロックまで到達
    for (const n of out) expect(n.start).toBeLessThan(bars * 4);
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeGreaterThanOrEqual(out[i - 1]!.start); // 昇順
  });

  it("③ seed決定的：同seedで同結果・別seedで別結果（head は不変・tail が変わる）", () => {
    expect(JSON.stringify(complete(7))).toBe(JSON.stringify(complete(7)));
    expect(JSON.stringify(complete(7))).not.toBe(JSON.stringify(complete(21)));
  });

  it("④ 全音 scale 内・強拍コードトーン率 > 0.5", () => {
    const out = complete(7);
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    for (const n of out) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
    const strong = out.filter((n) => isStrong(n.start));
    const ct = strong.filter((n) => pcsPerBar[Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4))]!.includes(((n.pitch % 12) + 12) % 12));
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("⑤ partial のモチーフが後続に発展＝onset 図形(リズム輪郭)が再来する", () => {
    const out = complete(7);
    const seedOns = extractMotif16(PARTIAL, 4).ons; // [0,0.5,1,2,3,4,5,6]
    const cut = 2 * 4;
    const blkLen = 2 * 4; // mb=2小節
    const block = out.filter((n) => n.start >= cut - 1e-6 && n.start < cut + blkLen - 1e-6).map((n) => Math.round((n.start - cut) * 100) / 100);
    expect(block).toEqual(seedOns.map((o) => Math.round(o * 100) / 100)); // 種の onset 図形が後続ブロックに再来
  });

  it("⑥ partial 無し時は通常 V2 と完全一致（回帰）", () => {
    const empty = completeMelody([], pcsPerBar, ROOTS, QUALS, sp, motif16, { seed: 7, tonicPc: 0, minor: false });
    const v2 = genMotifMelodyV2(pcsPerBar, ROOTS, QUALS, sp, motif16, { seed: 7, tonicPc: 0, minor: false });
    expect(JSON.stringify(empty)).toBe(JSON.stringify(v2));
  });

  it("⑦ 不揃い/1小節 partial でも落ちない（防御）", () => {
    const one = complete(7, 8, [{ pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1.5, dur: 0.5 }]);
    expect(one.length).toBeGreaterThan(2);
    expect(one[0]!.pitch).toBe(60);
  });

  it("⑧ G1: partial が小節途中で終わっても境界小節に無音の穴を作らない", () => {
    // partial は 4.5拍まで＝bar1 の途中。旧: coveredBars=2 で 4.5..8 を誰も埋めず無音。
    const midBar = [
      { pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 1, dur: 1 },
      { pitch: 67, start: 2, dur: 1 }, { pitch: 72, start: 3, dur: 1 },
      { pitch: 69, start: 4, dur: 0.5 },
    ];
    const out = complete(7, 8, midBar);
    // 4.5〜8拍（境界小節の残り）に onset が存在する
    expect(out.some((n) => n.start >= 4.5 - 1e-6 && n.start < 8 - 1e-6)).toBe(true);
    // partial は実音保持
    for (let i = 0; i < midBar.length; i++) expect(out[i]!.pitch).toBe(midBar[i]!.pitch);
  });

  it("⑨ G2: 接続のオクターブ寄せは tail 全体を shift＝2音目への新オクターブ跳躍を作らない", () => {
    // 低域の partial（種末尾 48台）→ 生成 tail は 60台後半で始まりがち＝旧: tail[0]だけ下げて tail[0]→tail[1] が跳ぶ。
    const lowPartial = [
      { pitch: 60, start: 0, dur: 1 }, { pitch: 59, start: 1, dur: 1 },
      { pitch: 60, start: 2, dur: 1 }, { pitch: 59, start: 3, dur: 1 },
      { pitch: 60, start: 4, dur: 1 }, { pitch: 59, start: 5, dur: 1 }, { pitch: 59, start: 6, dur: 2 },
    ];
    for (const seed of [3, 7, 14]) {
      const out = complete(seed, 8, lowPartial);
      const headLen = lowPartial.length;
      if (out.length <= headLen + 1) continue;
      const joinIv = Math.abs(out[headLen]!.pitch - out[headLen - 1]!.pitch);
      const nextIv = Math.abs(out[headLen + 1]!.pitch - out[headLen]!.pitch);
      // 接続点も、その直後も、オクターブ超の跳躍にしない（どちらか一方だけ直すのは付け替えただけ）
      expect(joinIv, `seed=${seed} join`).toBeLessThanOrEqual(12);
      expect(nextIv, `seed=${seed} next`).toBeLessThanOrEqual(12);
    }
  });
});

describe("genMelody / MCP 経路（opts.partial）", () => {
  const chords = ROOTS.map((r, i) => ({ root: r, quality: QUALS[i]!, start: i * 4, dur: 4 }));
  it("genMelody(partial) は melody item を返し partial を保持", () => {
    const res = genMelody({ key: 0, meter: "4/4", bars: 8 }, chords, 7, { useV2: true, partial: PARTIAL });
    const notes = (res.items[0]!.content as { notes: { pitch: number; start: number }[] }).notes;
    expect(res.items[0]!.kind).toBe("melody");
    expect(notes[0]!.pitch).toBe(60);
    expect(notes.some((n) => n.start >= 8)).toBe(true);
  });
});
