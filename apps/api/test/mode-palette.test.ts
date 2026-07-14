import { describe, it, expect } from "vitest";
import { genChords, genMelody } from "../src/music/generate";
import { scalePcs, MIXO_SCALE, DORIAN_SCALE, chordPcs, normRoot, type Palette } from "../src/music/theory";

// WP-C1（2026-07-14・旋法パレット＋エオリアン終止）。正典＝docs/research/2026-07-14-mode-usage-stats.md。
type Chord = { root: number; quality: string; start: number; dur: number };
const chordsOf = (opts: Parameters<typeof genChords>[3], frame: Record<string, unknown>, seed: number): Chord[] =>
  (genChords(frame, seed, undefined, opts).items[0]!.content as { chords: Chord[] }).chords;

describe("scalePcs（palette 集合差替）", () => {
  it("palette 未指定＝mode から＝従来 bit 一致", () => {
    expect([...scalePcs(0, "major")]).toEqual([...scalePcs(0, "major", undefined)]);
    expect([...scalePcs(0, "minor")]).toEqual([...scalePcs(0, "minor", undefined)]);
    // ionian/aeolian は親 mode と同集合
    expect([...scalePcs(3, "major", "ionian")].sort((a, b) => a - b)).toEqual([...scalePcs(3, "major")].sort((a, b) => a - b));
    expect([...scalePcs(3, "minor", "aeolian")].sort((a, b) => a - b)).toEqual([...scalePcs(3, "minor")].sort((a, b) => a - b));
  });
  it("mixolydian は ♭7̂ を含み 7̂(11) を含まない・dorian は ♮6̂(9) を含み ♭6̂(8) を含まない（key=C）", () => {
    const mixo = scalePcs(0, "major", "mixolydian");
    expect(mixo.has(10)).toBe(true); // ♭7
    expect(mixo.has(11)).toBe(false); // ♮7 は無い
    expect([...mixo].sort((a, b) => a - b)).toEqual([...MIXO_SCALE]);
    const dorian = scalePcs(0, "minor", "dorian");
    expect(dorian.has(9)).toBe(true); // ♮6
    expect(dorian.has(8)).toBe(false); // ♭6 は無い
    expect([...dorian].sort((a, b) => a - b)).toEqual([...DORIAN_SCALE]);
  });
});

describe("genChords 旋法パレット（WP-C1）", () => {
  it("既定 bit 一致：palette 未指定 ≡ ionian(major)/aeolian(minor)、回帰ゼロ", () => {
    for (const [mode, pal] of [["major", "ionian"], ["minor", "aeolian"]] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const base = JSON.stringify(genChords({ bars: 8, mode }, seed).items[0]!.content);
        const withPal = JSON.stringify(genChords({ bars: 8, mode }, seed, undefined, { palette: pal }).items[0]!.content);
        expect(withPal, `${mode}/${pal} seed=${seed}`).toBe(base);
      }
    }
  });

  it("mixolydian：♭VII が出現し、その次は必ず I（自前 ♭VII→I 20/24 規則）", () => {
    let sawFlat7 = false;
    for (let seed = 1; seed <= 30; seed++) {
      const key = seed % 12;
      const ch = chordsOf({ palette: "mixolydian" }, { bars: 8, mode: "major", key }, seed);
      const bVII = (key + 10) % 12;
      const I = key % 12;
      for (let i = 0; i < ch.length; i++) {
        if (ch[i]!.root === bVII) {
          sawFlat7 = true;
          // 「次=I」規則：♭VII の直後（存在すれば）は必ず I
          if (i + 1 < ch.length) expect(ch[i + 1]!.root, `seed=${seed} i=${i}: ♭VII の次が I でない(${ch[i + 1]!.root})`).toBe(I);
        }
      }
      // 始終は I 不変（旋法でも壊さない）
      expect(ch[0]!.root).toBe(I);
      expect(ch[ch.length - 1]!.root).toBe(I);
    }
    expect(sawFlat7, "mixolydian で ♭VII が1度も出なかった").toBe(true);
  });

  it("dorian：IV(長・♮3) が中間に出現し、終止には置かない（自前 IV長 last 2/26）", () => {
    let sawIVmaj = false;
    for (let seed = 1; seed <= 30; seed++) {
      const key = seed % 12;
      const ch = chordsOf({ palette: "dorian" }, { bars: 8, mode: "minor", key }, seed);
      const IV = (key + 5) % 12;
      for (let i = 0; i < ch.length; i++) {
        if (ch[i]!.root === IV && ch[i]!.quality === "") {
          sawIVmaj = true;
          expect(i, `seed=${seed}: IV(長) が終止スロットに置かれた`).toBeLessThan(ch.length - 1);
          expect(i, `seed=${seed}: IV(長) が先頭に置かれた`).toBeGreaterThan(0);
        }
      }
    }
    expect(sawIVmaj, "dorian で IV(長) が1度も出なかった").toBe(true);
  });
});

describe("genChords cadence=aeolian（エオリアン終止・WP-C1）", () => {
  it("短調：末尾が ♭VI→♭VII→i（key=Am/C）", () => {
    for (const key of [0, 9, 5]) {
      const ch = (genChords({ bars: 8, mode: "minor", key }, 5, "aeolian").items[0]!.content as { chords: Chord[] }).chords;
      const n = ch.length;
      expect(ch[n - 1]!.root, `key=${key} last=i`).toBe(key % 12); // i
      expect(ch[n - 1]!.quality).toBe("m");
      expect(ch[n - 2]!.root, `key=${key} penult=♭VII`).toBe((key + 10) % 12); // ♭VII
      expect(ch[n - 3]!.root, `key=${key} antepenult=♭VI`).toBe((key + 8) % 12); // ♭VI
    }
  });
  it("長調：末尾が ♭VI→♭VII→I（借用フラット）", () => {
    const key = 0;
    const ch = (genChords({ bars: 8, mode: "major", key }, 5, "aeolian").items[0]!.content as { chords: Chord[] }).chords;
    const n = ch.length;
    expect(ch[n - 1]!.root).toBe(0); // I
    expect(ch[n - 2]!.root).toBe(10); // ♭VII
    expect(ch[n - 3]!.root).toBe(8); // ♭VI
  });
  it("既存 cadence 値の挙動は不変（half/deceptive/plagal は従来通り・aeolian 追加で回帰なし）", () => {
    for (const cad of ["half", "deceptive", "plagal"] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const ch = (genChords({ bars: 8, mode: "major" }, seed, cad).items[0]!.content as { chords: Chord[] }).chords;
        expect(ch.length).toBe(8);
        expect(ch[0]!.root).toBe(0);
      }
    }
  });
});

describe("旋法パレットのメロ整合＝E-rule スイープ（禁則0維持・WP-C1）", () => {
  // 禁則跳躍＝三全音(6)/7度(10,11)/8度超(>12)。ただし両端がその時点のコード音のアルペジオは免除
  // （melody-cells-v2.test と同じ流儀・genMelody が保証する 0）。
  it("mixolydian/dorian/aeolian のコード＋frame.palette で生成したメロが禁則跳躍ゼロ（旋法音が avoid で消されない）", () => {
    const cases: { mode: "major" | "minor"; palette: Palette }[] = [
      { mode: "major", palette: "mixolydian" },
      { mode: "minor", palette: "dorian" },
      { mode: "minor", palette: "aeolian" },
    ];
    for (const { mode, palette } of cases) {
      for (let seed = 1; seed <= 20; seed++) {
        const frame = { bars: 4, meter: "4/4", key: 0, mode, palette };
        const chords = (genChords(frame, seed, undefined, { palette }).items[0]!.content as { chords: Chord[] }).chords;
        const pcsAt = (t: number): number[] => {
          const c = chords.find((x) => x.start <= t && t < x.start + x.dur) ?? chords[chords.length - 1]!;
          return chordPcs(normRoot(c.root), c.quality);
        };
        const mel = (genMelody(frame, chords, seed).items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
        expect(mel.length, `${palette} seed=${seed} empty`).toBeGreaterThan(0);
        for (let i = 1; i < mel.length; i++) {
          const a = Math.abs(mel[i]!.pitch - mel[i - 1]!.pitch);
          const isCT = (n: { pitch: number; start: number }): boolean => pcsAt(n.start).includes(((n.pitch % 12) + 12) % 12);
          const arp = a <= 12 && isCT(mel[i - 1]!) && isCT(mel[i]!);
          expect((a === 6 || a === 10 || a === 11 || a > 12) && !arp, `${palette} seed=${seed} i=${i}: 禁則|${a}|`).toBe(false);
        }
      }
    }
  });
});
