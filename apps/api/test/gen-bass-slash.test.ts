// gen_bass × chord.bass（分数コード/転回の低音伝播・slashBass ノブ・2026-07-22）。
// 背景：genChords は分数コード(citypop)/IAC 第1転回で chord.bass を出し、web resolveChordPattern は
//   ch.bass をベース pc に使うが、genBass は root しか読まず非対称だった（コーディネータ指摘の gap）。
// 契約：(a) slashBass 未指定/false は chord.bass を無視＝bass 有無で bit 一致（鉄則・新ノブは既定OFF）
//       (b) slashBass:true でアンカー（小節頭/チェンジ頭）が chord.bass の pc へ（間の5度/octは和声root基準）
//       (c) genChords cadence:iac（末尾 I 第1転回）→ slashBass:true で末尾ベースが第3音
import { describe, it, expect } from "vitest";
import { genBass, genChords, type Frame } from "../src/music/generate";

type Note = { pitch: number; start: number; dur: number };
const notesOf = (r: ReturnType<typeof genBass>): Note[] => (r.items[0]!.content as { notes: Note[] }).notes;
const J = (x: unknown) => JSON.stringify(x);
const pcOf = (m: number) => ((m % 12) + 12) % 12;

const F: Frame = { bars: 4, meter: "4/4" };
const SEEDS = [1, 2, 3, 42];
// G/B（Gの第1転回＝root=G(7)・bass=B(11)）を敷く。plain は同じだが bass フィールド無し。
const slashChords = [{ root: 7, quality: "", start: 0, dur: 16, bass: 11 }];
const plainChords = [{ root: 7, quality: "", start: 0, dur: 16 }];

describe("(a) 既定 OFF＝chord.bass を無視（bit 一致・鉄則）", () => {
  const frames: Frame[] = [
    { bars: 2, meter: "4/4" },
    { bars: 4, meter: "4/4", mood: "切ない" },
    { bars: 4, meter: "4/4", mood: "明るい", tempo: 140 },
  ];
  it("slashBass 未指定：bass 付き chords と bass 無し chords が完全一致（全 seed・全 frame）", () => {
    for (const f of frames)
      for (const seed of SEEDS)
        expect(J(notesOf(genBass(f, slashChords, seed)))).toBe(J(notesOf(genBass(f, plainChords, seed))));
  });
  it("slashBass:false も同様に無視", () => {
    for (const seed of SEEDS)
      expect(J(notesOf(genBass(F, slashChords, seed, null, { slashBass: false })))).toBe(J(notesOf(genBass(F, plainChords, seed))));
  });
});

describe("(b) slashBass:true＝アンカーが chord.bass の pc へ", () => {
  it("各小節頭のベース音の pc が bass(11=B) になる（OFF は root 7=G）", () => {
    for (const seed of SEEDS) {
      const on = notesOf(genBass(F, slashChords, seed, null, { slashBass: true }));
      const heads = on.filter((n) => Number.isInteger(n.start) && n.start % 4 === 0);
      expect(heads.length).toBeGreaterThan(0);
      for (const h of heads) expect(pcOf(h.pitch)).toBe(11); // 転回の低音 B
      const off = notesOf(genBass(F, plainChords, seed));
      for (const h of off.filter((n) => Number.isInteger(n.start) && n.start % 4 === 0)) expect(pcOf(h.pitch)).toBe(7); // root G
    }
  });
  it("決定的：同入力→同出力", () => {
    expect(J(notesOf(genBass(F, slashChords, 5, null, { slashBass: true })))).toBe(J(notesOf(genBass(F, slashChords, 5, null, { slashBass: true }))));
  });
  it("kickLock 経路（ドラム結線）でもアンカーが bass へ", () => {
    const drums = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: [0, 8], vel: 115 }, { name: "Snare", midi: 38, hits: [4, 12], vel: 105 }] } };
    for (const seed of SEEDS) {
      const on = notesOf(genBass(F, slashChords, seed, drums, { kickLock: 0.8, slashBass: true }));
      const head = on.filter((n) => n.start < 0.5).sort((a, b) => a.start - b.start)[0]!;
      expect(pcOf(head.pitch)).toBe(11);
    }
  });
});

describe("(c) genChords cadence:iac × slashBass（末尾第1転回の低音伝播）", () => {
  it("末尾小節のベース頭が chord.bass(第3音)＝slashBass:true 時のみ", () => {
    const f: Frame = { bars: 4, meter: "4/4", key: 0 }; // C major
    const chords = (genChords(f, 7, "iac").items[0]!.content as { chords: { root: number; quality: string; start: number; dur: number; bass?: number }[] }).chords;
    const last = chords[chords.length - 1]!;
    expect(last.bass).not.toBeUndefined();
    expect(pcOf(last.bass!)).not.toBe(pcOf(last.root)); // bass が root と別（転回として意味がある）
    const onLast = notesOf(genBass(f, chords, 7, null, { slashBass: true })).filter((n) => n.start >= last.start - 1e-9).sort((a, b) => a.start - b.start)[0]!;
    expect(pcOf(onLast.pitch)).toBe(pcOf(last.bass!)); // ON＝第3音
    const offLast = notesOf(genBass(f, chords, 7)).filter((n) => n.start >= last.start - 1e-9).sort((a, b) => a.start - b.start)[0]!;
    expect(pcOf(offLast.pitch)).toBe(pcOf(last.root)); // OFF＝root
  });
});
