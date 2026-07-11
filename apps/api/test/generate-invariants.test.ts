import { describe, it, expect } from "vitest";
import {
  genChords,
  genMelody,
  genBass,
  genDrums,
  genChordPattern,
  genFromEssence,
  type Frame,
} from "../src/music/generate";

// #2 安全網：生成エンジンが実際に保証する musical 不変条件を property test で固定（design 決定1）。
// seed 依存乱数なので byte 等価は約束しない。代わりに「壊れていない」ことを多数の frame×seed で担保。
// ＝#5（generate.ts 分割）の回帰防止網。輪郭保存は engine の約束ではない（折返しはピッチクラス保存）。

type Note = { pitch: number; start: number; dur: number };
type Chord = { root: number; quality: string; start: number; dur: number };

const notesOf = (r: ReturnType<typeof genMelody>): Note[] =>
  (r.items[0]!.content as { notes: Note[] }).notes;
const chordsOf = (r: ReturnType<typeof genChords>): Chord[] =>
  (r.items[0]!.content as { chords: Chord[] }).chords;

// 探索の網：拍子・mood・小節数・seed を掛け合わせて走査。
const METERS = ["4/4", "3/4", "6/8", "5/4", "1/8", "bogus", ""];
const MOODS = ["", "明るい", "切ない", "ダンス", "バラード"];
const BARS = [1, 2, 4, 7, 16, 99];
const SEEDS = [0, 1, 7, 42, 1234, -5];

function* frames(): Generator<Frame> {
  for (const meter of METERS)
    for (const mood of MOODS) for (const bars of BARS) yield { meter, mood, bars };
}

const finiteInt = (n: number) => Number.isFinite(n) && Number.isInteger(n);

describe("genMelody 不変条件", () => {
  // J3(2026-07-11 Task#15)：genMelody は V2 一本化（旧経路④撤去）。対応拍子（4/4・3/4・6/4・6/8系複合）は
  // 非空・有限整数・決定的な妥当メロを返す。V2 の音域窓は tonic中心（key0 で約[55,72]・folding/pickupで前後）
  // ＝旧④の [60,84] ハードコードでなく広めの [48,84] で「暴れない」を担保する。
  it("対応拍子×mood×bars×seed：非空・有限整数・妥当音域[48,84]", () => {
    // Task#17(2026-07-12)：J2a由来の 6/4 負dur bug（render/renderPreserve のブロック末フォールバックが
    // barLen=4 ハードコード）を是正済み＝6/4 も担保対象に復帰。
    const OK_METERS = ["4/4", "3/4", "6/4", "6/8", "bogus", ""]; // bogus/空=4/4扱い
    for (const meter of OK_METERS)
      for (const mood of MOODS)
        for (const bars of BARS)
          for (const seed of SEEDS) {
            const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 64 }];
            const notes = notesOf(genMelody({ meter, mood, bars, pickup: 1 }, chords, seed, { useV2: true }));
            const where = `${meter}/${mood}/${bars}#${seed}`;
            expect(notes.length, `非空: ${where}`).toBeGreaterThan(0);
            for (const n of notes) {
              expect(finiteInt(n.pitch), `有限整数pitch: ${where} ${n.pitch}`).toBe(true);
              expect(Number.isFinite(n.start), `start: ${where}`).toBe(true);
              expect(n.dur, `dur>0: ${where}`).toBeGreaterThan(0);
              expect(n.pitch, `下限: ${where}`).toBeGreaterThanOrEqual(48);
              expect(n.pitch, `上限: ${where}`).toBeLessThanOrEqual(84);
            }
          }
  }, 30000); // 網羅で数秒かかる＝並行負荷でも既定5sで落ちないよう余裕。

  // J3：V2 未対応の変拍子（2/4・5/4・7/8・1/8・7/4 等）は total 尺が合わず丸め不可＝黙って壊さず明示エラー。
  it("未対応拍子（5/4・1/8 等）は明示エラーを投げる（黙って壊さない）", () => {
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 64 }];
    for (const meter of ["5/4", "1/8", "7/8", "2/4", "7/4"]) {
      expect(() => genMelody({ meter, bars: 4 }, chords, 1, { useV2: true }), `${meter} useV2`).toThrow(/未対応/);
      expect(() => genMelody({ meter, bars: 4 }, chords, 1), `${meter} 直呼び`).toThrow(/未対応/);
    }
  });

  it("V2 register は tonic中心窓 [tp-5, tp+12]（2026-07-09 Round2/P1・主音を音域最下端に置かない）", () => {
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 5, quality: "", start: 4, dur: 4 }, { root: 7, quality: "", start: 8, dur: 4 }, { root: 0, quality: "", start: 12, dur: 4 }];
    for (const key of [0, 7, 9, 2, 11]) {
      const tp = Math.max(60, Math.min(65, 60 + (((key % 12) + 12) % 12))); // Round3: tessitura安定のため両端clamp
      const tonicPc = ((key % 12) + 12) % 12;
      const tonicReg = tp + (((tonicPc - tp) % 12) + 12) % 12; // 窓内の主音ピッチ
      let sawBelowTonic = false;
      for (const seed of SEEDS) {
        const notes = notesOf(genMelody({ key, bars: 4, meter: "4/4" }, chords.map((c) => ({ ...c, root: (c.root + key) % 12 })), seed, { useV2: true }));
        expect(notes.length, `非空 key=${key}#${seed}`).toBeGreaterThan(0);
        for (const n of notes) {
          if (n.start < 0) continue; // 弱起は別
          expect(n.pitch, `V2下限 key=${key}#${seed}`).toBeGreaterThanOrEqual(tp - 5);
          expect(n.pitch, `V2上限 key=${key}#${seed}`).toBeLessThanOrEqual(tp + 12);
          if (n.pitch < tonicReg) sawBelowTonic = true;
        }
      }
      // 主音の下に音が出る＝床にピン留めされていない（脱平面化が production に届いている証拠）
      expect(sawBelowTonic, `key=${key}: 主音の下にメロが出る`).toBe(true);
    }
  });

  it("可変長ブロック(asymmetric [3,3,2])：空尾破綻なし・不変条件・決定的（2026-07-09 D本丸容器）", () => {
    const chords: Chord[] = Array.from({ length: 8 }, (_, i) => ({ root: [0, 9, 5, 7, 0, 9, 5, 7][i]!, quality: i % 4 === 1 ? "m" : "", start: i * 4, dur: 4 }));
    for (let seed = 1; seed <= 40; seed++) {
      const notes = notesOf(genMelody({ key: 0, bars: 8, meter: "4/4" }, chords, seed, { useV2: true, phrasing: "asymmetric" }));
      expect(notes.length, `#${seed} 非空`).toBeGreaterThan(0);
      // 空尾破綻なし＝最後の音が終盤(bar6以降)にある（3小節モチーフの埋め草不足で末尾がスカスカにならない）。
      const last = notes[notes.length - 1]!;
      expect(last.start, `#${seed} 末尾まで音がある(空尾破綻なし)`).toBeGreaterThanOrEqual(24);
      // 音域・決定性・昇順
      for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(50); expect(n.pitch).toBeLessThanOrEqual(80); }
      for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
    }
    const a = notesOf(genMelody({ key: 0, bars: 8, meter: "4/4" }, chords, 7, { useV2: true, phrasing: "asymmetric" }));
    const b = notesOf(genMelody({ key: 0, bars: 8, meter: "4/4" }, chords, 7, { useV2: true, phrasing: "asymmetric" }));
    expect(b).toEqual(a); // 決定的
  });

  it("決定性：同一(frame,chords,seed)は同一出力", () => {
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 8 }];
    for (const seed of SEEDS) {
      const a = notesOf(genMelody({ bars: 4, meter: "4/4", mood: "明るい" }, chords, seed));
      const b = notesOf(genMelody({ bars: 4, meter: "4/4", mood: "明るい" }, chords, seed));
      expect(b).toEqual(a);
    }
  });

  it("chords 無しでも壊れない（scale フォールバック）", () => {
    for (const seed of SEEDS) {
      const notes = notesOf(genMelody({ bars: 4 }, undefined, seed));
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every((n) => finiteInt(n.pitch))).toBe(true);
    }
  });
});

describe("genChords 不変条件", () => {
  it("長さ=bars(1..16)・bars>=2でI/i始終・dur>0・root∈0..11", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const chords = chordsOf(genChords(f, seed));
        const expectBars = Math.max(1, Math.min(16, f.bars!));
        const where = `${f.meter}/${f.mood}/${f.bars}#${seed}`;
        expect(chords.length, `len=bars: ${where}`).toBe(expectBars);
        expect(chords[0]!.root, `I始まり: ${where}`).toBe(0);
        if (expectBars >= 2) expect(chords[chords.length - 1]!.root, `I終わり: ${where}`).toBe(0);
        for (const c of chords) {
          expect(c.dur, `dur>0: ${where}`).toBeGreaterThan(0);
          expect(c.root, `root域: ${where}`).toBeGreaterThanOrEqual(0);
          expect(c.root, `root域: ${where}`).toBeLessThan(12);
        }
      }
  });
});

describe("genBass / genDrums / genChordPattern 不変条件", () => {
  it("bass: 非空・低域・有限整数・決定的", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 64 }];
        const r1 = genBass(f, chords, seed);
        const notes = (r1.items[0]!.content as { notes: Note[] }).notes;
        expect(notes.length).toBeGreaterThan(0);
        for (const n of notes) {
          expect(finiteInt(n.pitch)).toBe(true);
          expect(n.pitch).toBeGreaterThanOrEqual(24);
          expect(n.pitch).toBeLessThanOrEqual(55);
        }
        const r2 = genBass(f, chords, seed);
        expect((r2.items[0]!.content as { notes: Note[] }).notes).toEqual(notes);
      }
  });

  it("drums: steps∈{12,16}・hit は範囲内・決定的", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const r = genDrums(f, seed);
        const rhythm = (r.items[0]!.content as { rhythm: { steps: number; lanes: { hits: number[] }[] } }).rhythm;
        expect([12, 16]).toContain(rhythm.steps);
        for (const lane of rhythm.lanes)
          for (const h of lane.hits) {
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(rhythm.steps);
          }
        const r2 = genDrums(f, seed);
        expect((r2.items[0]!.content as { rhythm: unknown }).rhythm).toEqual(rhythm);
      }
  });

  it("chord_pattern: steps>0・hit step は範囲内", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const r = genChordPattern(f, seed);
        const c = r.items[0]!.content as { steps: number; hits: { step: number; dur: number }[] };
        expect(c.steps).toBeGreaterThan(0);
        for (const h of c.hits) {
          expect(h.step).toBeGreaterThanOrEqual(0);
          expect(h.step).toBeLessThan(c.steps);
        }
      }
  });
});

describe("genFromEssence 不変条件", () => {
  it("参照空なら通常生成へフォールバック・非空・音域", () => {
    const r = genFromEssence([], { bars: 4 }, undefined, 3);
    const notes = notesOf(r);
    expect(notes.length).toBeGreaterThan(0);
  });
  it("参照ありでも音域[60,84]・決定的", () => {
    const ref = [
      { pitch: 64, start: 0, dur: 1 },
      { pitch: 67, start: 1, dur: 1 },
      { pitch: 60, start: 2, dur: 1 },
    ];
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 8 }];
    const a = notesOf(genFromEssence(ref, { bars: 2 }, chords, 9));
    expect(a.length).toBeGreaterThan(0);
    for (const n of a) {
      expect(n.pitch).toBeGreaterThanOrEqual(60);
      expect(n.pitch).toBeLessThanOrEqual(84);
    }
    const b = notesOf(genFromEssence(ref, { bars: 2 }, chords, 9));
    expect(b).toEqual(a);
  });
  it("F4: styleコーパス(motifModel)がV2生成に効く＝渡すと出力が変わる（旧: V2で無視）", async () => {
    const { learnBarRhythms, learnMoveTransitions } = await import("../src/music/melodyCells");
    const chords: Chord[] = [
      { root: 0, quality: "", start: 0, dur: 8 },
      { root: 7, quality: "", start: 8, dur: 8 },
      { root: 0, quality: "", start: 16, dur: 16 },
    ];
    const model = {
      rhythm: learnBarRhythms(["x...x...", "x...x..."]), // 極端に疎（2onset/小節）＝既定16分語彙と別世界
      move: learnMoveTransitions([[60, 72, 60, 72, 60]]), // 跳躍だらけ＝既定と別分布
    };
    const a = genMelody({ key: 0, bars: 8 }, chords, 7, { useV2: true });
    const b = genMelody({ key: 0, bars: 8 }, chords, 7, { useV2: true, motifModel: model });
    expect(JSON.stringify(a.items[0]!.content)).not.toBe(JSON.stringify(b.items[0]!.content));
  });

  it("F4/C4: repetition が V2 骨格に効く＝0 と 1 で出力が変わる（旧: V2で無視）", () => {
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 32 }];
    const a = genMelody({ key: 0, bars: 8 }, chords, 7, { useV2: true, repetition: 0 });
    const b = genMelody({ key: 0, bars: 8 }, chords, 7, { useV2: true, repetition: 1 });
    expect(JSON.stringify(a.items[0]!.content)).not.toBe(JSON.stringify(b.items[0]!.content));
  });

  it("句末着地もコード追従（B2）＝G7で終わる進行の最終音はG7構成音（V2）", () => {
    const chords: Chord[] = [
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 5, quality: "", start: 4, dur: 4 },
      { root: 7, quality: "7", start: 8, dur: 8 },
    ];
    const g7 = new Set([7, 11, 2, 5]);
    for (const seed of [2, 5, 9]) {
      const r = genMelody({ key: 0, bars: 4 }, chords, seed, { useV2: true }); // J3：V2 一本化（旧applyPhrasing撤去）
      const notes = notesOf(r).sort((a, b) => a.start - b.start);
      const last = notes[notes.length - 1]!;
      const pc = ((last.pitch % 12) + 12) % 12;
      expect(g7.has(pc), `seed=${seed}: 句末pc=${pc}（度数snapのコード無視は理論破綻）`).toBe(true);
    }
  });

  it("frame.key を尊重する＝F#メジャーの曲なら経過音も F#メジャースケール内（E1回帰）", () => {
    // 拍頭以外(小数start)はコードsnapを通らず素のスケール歩行＝キー無視バグ(常にC)だと C 調の音が混ざる。
    const ref = [
      { pitch: 66, start: 0, dur: 0.5 },
      { pitch: 68, start: 0.5, dur: 0.5 },
      { pitch: 70, start: 1.5, dur: 0.5 },
      { pitch: 68, start: 2.5, dur: 0.5 },
      { pitch: 66, start: 3.5, dur: 0.5 },
    ];
    const chords: Chord[] = [{ root: 6, quality: "", start: 0, dur: 8 }]; // F#
    const fsMajor = new Set([6, 8, 10, 11, 1, 3, 5]);
    const out = notesOf(genFromEssence(ref, { bars: 2, key: 6 }, chords, 5));
    expect(out.length).toBeGreaterThan(0);
    for (const n of out) expect(fsMajor.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });
});
