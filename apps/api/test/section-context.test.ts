import { describe, it, expect } from "vitest";
// 耳FB(2026-07-08)対応：frame.mode一級化＋density/swingノブの契約（design#12-M）。
// 背景＝Section自動生成が (1)mode無しで短調でもメジャー生成 (2)配置でメロだけ+3移調 → 濁り/変な跳躍。
import { genMelody, genChords } from "../src/music/generate";
import { extractMotif16 } from "../src/music/melodyCells";

type N = { pitch: number; start: number; dur: number };
const notesOf = (r: { items: { content: unknown }[] }): N[] => (r.items[0]!.content as { notes: N[] }).notes;

// Am の導音なし進行（i ♭VI ♭VII i ×2）＝spRaised が発火しない＝出力は純粋な自然的短音階のはず。
const AM_CHORDS = [9, 5, 7, 9, 5, 7, 9, 9].map((root, i) => ({ root, quality: root === 9 ? "m" : "", start: i * 4, dur: 4 }));

describe("frame.mode 一級化（短調セクションの生成文脈）", () => {
  it("mode:'minor' でメロがAメジャー音(C#/F#/G#)を歌わない（旧: mood無しだと常にメジャースケール）", () => {
    const majorOnly = new Set([1, 6, 8]); // A major にだけある pc
    for (const seed of [1, 5, 9]) {
      const r = genMelody({ key: 9, bars: 8, mode: "minor" }, AM_CHORDS, seed, { useV2: true });
      for (const n of notesOf(r)) {
        const pc = ((n.pitch % 12) + 12) % 12;
        expect(majorOnly.has(pc), `seed=${seed} t=${n.start} pc=${pc}`).toBe(false);
      }
    }
  });
  it("mode は mood より優先・mood フォールバックは従来通り", () => {
    const a = genMelody({ key: 9, bars: 4, mode: "minor", mood: "明るい" }, AM_CHORDS, 3, { useV2: true });
    const majorOnly = new Set([1, 6, 8]);
    for (const n of notesOf(a)) expect(majorOnly.has(((n.pitch % 12) + 12) % 12)).toBe(false);
    const b = genChords({ bars: 4, mood: "切ない" }, 3); // moodだけ＝従来のマイナー判定
    expect(((b.items[0]!.content as { chords: { quality: string }[] }).chords[0]!.quality)).toBe("m");
  });
  it("genChords も mode:'minor' で i 始まり（mood不要）", () => {
    const r = genChords({ bars: 4, key: 9, mode: "minor" }, 3);
    const c0 = (r.items[0]!.content as { chords: { root: number; quality: string }[] }).chords[0]!;
    expect(c0).toEqual(expect.objectContaining({ root: 9, quality: "m" }));
  });
});

describe("density（細かさ）/ swing（跳ね）ノブ", () => {
  const CHORDS = [0, 5, 7, 0].map((root, i) => ({ root, quality: "", start: i * 8, dur: 8 }));
  it("density 高は低より音数が多い（8seed平均・単調性）", () => {
    let lo = 0, hi = 0;
    for (let seed = 1; seed <= 8; seed++) {
      lo += notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, seed, { useV2: true, density: 0.1 })).length;
      hi += notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, seed, { useV2: true, density: 0.9 })).length;
    }
    expect(hi).toBeGreaterThan(lo * 1.2); // 明確な差（>20%）
  });
  it("swing=1 で8分裏が 2/3 位置へ・音は重ならない", () => {
    for (const seed of [2, 7]) {
      const notes = notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, seed, { useV2: true, swing: 1 }));
      const sorted = [...notes].sort((a, b) => a.start - b.start);
      let sawSwung = false;
      for (let i = 0; i < sorted.length; i++) {
        const frac = ((sorted[i]!.start % 1) + 1) % 1;
        expect(Math.abs(frac - 0.5) < 0.01, `t=${sorted[i]!.start}: 素の8分裏が残っている`).toBe(false);
        if (Math.abs(frac - 2 / 3) < 0.02) sawSwung = true;
        if (i + 1 < sorted.length) expect(sorted[i]!.start + sorted[i]!.dur).toBeLessThanOrEqual(sorted[i + 1]!.start + 1e-6);
      }
      expect(sawSwung).toBe(true); // 跳ねた音が実在
    }
  });
  it("ノブ未指定は従来挙動と一致（後方互換）", () => {
    const a = notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, 5, { useV2: true }));
    const b = notesOf(genMelody({ key: 0, bars: 8 }, CHORDS, 5, { useV2: true, density: undefined, swing: undefined }));
    expect(b).toEqual(a);
  });
});

// セクション役割文脈（frame.section・2026-07-10・研究doc=2026-07-10-section-role-framing.md）
// 契約：役割プリセット（未指定ノブの既定差替）＋registerShift（飽和付きシフト）＋seedMotif配線。
// 優先順位＝明示ノブ＞roleプリセット＞従来既定。未指定＝従来 bit 一致。
describe("セクション役割文脈（frame.section）", () => {
  const CH = [0, 5, 7, 0].map((root, i) => ({ root, quality: "", start: i * 8, dur: 8 })); // C major 8小節
  const V2 = { useV2: true } as const;
  const mean = (ns: N[]) => ns.reduce((a, n) => a + n.pitch, 0) / Math.max(1, ns.length);
  const maxP = (ns: N[]) => Math.max(...ns.map((n) => n.pitch));

  // (a) section 未指定/空 = 従来 bit 一致
  it("(a) section 未指定・空 section は従来と bit 一致（複数frame×seed）", () => {
    for (const key of [0, 9]) {
      const mode = key === 9 ? ("minor" as const) : ("major" as const);
      for (const seed of [1, 4, 7]) {
        const base = notesOf(genMelody({ key, bars: 8, mode }, CH, seed, V2));
        const empty = notesOf(genMelody({ key, bars: 8, mode, section: {} }, CH, seed, V2));
        expect(empty).toEqual(base);
      }
    }
  });

  // (f) 決定性
  it("(f) 決定性：同一 frame(section)×seed は同一出力", () => {
    const f = { key: 0, bars: 8, section: { role: "chorus" as const } };
    for (const seed of [2, 5]) {
      expect(notesOf(genMelody(f, CH, seed, V2))).toEqual(notesOf(genMelody(f, CH, seed, V2)));
    }
  });

  // (c) chorus registerShift 効く（音域中心が上がる）
  it("(c) role=chorus は音域中心が上がる（registerShift +）", () => {
    let base = 0, cho = 0;
    for (let seed = 1; seed <= 8; seed++) {
      base += mean(notesOf(genMelody({ key: 0, bars: 8 }, CH, seed, V2)));
      cho += mean(notesOf(genMelody({ key: 0, bars: 8, section: { role: "chorus" } }, CH, seed, V2)));
    }
    expect(cho).toBeGreaterThan(base);
  });

  // (c) 飽和：巨大 registerShift でも最高音が上限(tpBase'+12 ≤ 82)を超えない
  it("(c) registerShift の飽和：巨大シフトでも最高音 ≤ 82", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const ns = notesOf(genMelody({ key: 0, bars: 8 }, CH, seed, { ...V2, registerShift: 100 }));
      expect(maxP(ns)).toBeLessThanOrEqual(82);
    }
  });

  // (b) 明示ノブ ＞ プリセット（density）
  it("(b) 明示ノブ＞プリセット：role=chorus + density=0.1 明示 → 音数はプリセット(0.65)より少ない", () => {
    let presetN = 0, explicitN = 0;
    for (let seed = 1; seed <= 8; seed++) {
      presetN += notesOf(genMelody({ key: 0, bars: 8, section: { role: "chorus" } }, CH, seed, V2)).length;
      explicitN += notesOf(genMelody({ key: 0, bars: 8, section: { role: "chorus" } }, CH, seed, { ...V2, density: 0.1 })).length;
    }
    expect(explicitN).toBeLessThan(presetN);
  });

  // (b) 明示 registerShift=0 が chorus プリセット(+4)を上書き（中心が下がる／registerShift 単独を隔離）
  it("(b) 明示 registerShift=0 は role=chorus のプリセット+4を打ち消す（中心が下がる）", () => {
    let shifted = 0, zeroed = 0;
    for (let seed = 1; seed <= 8; seed++) {
      shifted += mean(notesOf(genMelody({ key: 0, bars: 8, section: { role: "chorus" } }, CH, seed, V2)));
      zeroed += mean(notesOf(genMelody({ key: 0, bars: 8, section: { role: "chorus" } }, CH, seed, { ...V2, registerShift: 0 })));
    }
    expect(zeroed).toBeLessThan(shifted);
  });

  // (e) role別プリセットの意味論：verse vs chorus で density 既定が変わる（chorus 音数 > verse）
  it("(e) role別プリセット：chorus は verse より音数が多い（density 既定 0.65 vs 0.45）", () => {
    let v = 0, c = 0;
    for (let seed = 1; seed <= 10; seed++) {
      v += notesOf(genMelody({ key: 0, bars: 8, section: { role: "verse" } }, CH, seed, V2)).length;
      c += notesOf(genMelody({ key: 0, bars: 8, section: { role: "chorus" } }, CH, seed, V2)).length;
    }
    expect(c).toBeGreaterThan(v);
  });

  // (d) seedMotif 配線：前セクションのモチーフを種にすると先頭ブロックのリズム枠が共有される
  it("(d) seedMotif 配線：前セクションのメロを種にすると先頭ブロックの onset が種と一致", () => {
    const prev = notesOf(genMelody({ key: 0, bars: 8 }, CH, 11, V2));
    const seed2 = prev.filter((n) => n.start >= 0 && n.start < 8); // 前セクションの先頭2小節（block0）
    const withSeed = notesOf(genMelody({ key: 0, bars: 8, section: { seedMotif: seed2 } }, CH, 3, V2));
    const noSeed = notesOf(genMelody({ key: 0, bars: 8 }, CH, 3, V2));
    expect(withSeed).not.toEqual(noSeed); // 配線が生きている（種で出力が変わる）
    const round = (t: number) => Math.round(t * 1000) / 1000;
    const wantOns = new Set(extractMotif16(seed2).ons.filter((t) => t < 8).map(round));
    const gotOns = new Set(withSeed.filter((n) => n.start >= 0 && n.start < 8).map((n) => round(n.start)));
    expect(gotOns).toEqual(wantOns);
  });

  // 頑健化：不正 role は黙って落ちる（従来動作）＋別表記 pre_chorus を吸収
  it("不正 role は落とし従来と一致・pre_chorus は prechorus として解釈", () => {
    const base = notesOf(genMelody({ key: 0, bars: 8 }, CH, 6, V2));
    const bad = notesOf(genMelody({ key: 0, bars: 8, section: { role: "nonsense" as unknown as "verse" } }, CH, 6, V2));
    expect(bad).toEqual(base); // 不正 role＝プリセット無し＝従来
    const alias = notesOf(genMelody({ key: 0, bars: 8, section: { role: "pre_chorus" as unknown as "prechorus" } }, CH, 6, V2));
    const canon = notesOf(genMelody({ key: 0, bars: 8, section: { role: "prechorus" } }, CH, 6, V2));
    expect(alias).toEqual(canon);
  });
});
