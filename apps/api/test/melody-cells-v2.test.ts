import { describe, it, expect } from "vitest";
import { genMotifMelodyV2, loadMotifModel16, scalePitchList } from "../src/music/melodyCells";
import { scalePcs, chordPcs } from "../src/music/theory";

// A2レシピ（docs/research/melody-recipe-validated.md）の production 実装＝genMotifMelodyV2 の契約。
const motif16 = loadMotifModel16();

// I-vi-IV-V → I-vi-V-I ＝8小節（C major・最終小節は I＝トニック着地の検証が意味を持つ形。
// B1(2026-07-08)以降、終止音は最終コード追従＝V終わりだと主音でなくVのコード音に着地する）。
const ROOTS = [0, 9, 5, 7, 0, 9, 7, 0];
const QUALS = ["maj7", "min7", "maj7", "7", "maj7", "min7", "7", "maj7"];
const sp = scalePitchList(scalePcs(0, "major"), 58, 83);
const pcsPerBar = ROOTS.map((r, i) => chordPcs(r, QUALS[i]!));

const gen = (seed: number, bars = 8) =>
  genMotifMelodyV2(pcsPerBar.slice(0, bars), ROOTS.slice(0, bars), QUALS.slice(0, bars), sp, motif16, { seed, tonicPc: 0, minor: false });

const inBar = (t: number) => ((t % 4) + 4) % 4;
const isStrong = (t: number) => Math.abs(inBar(t) - 0) < 0.12 || Math.abs(inBar(t) - 2) < 0.12;

describe("genMotifMelodyV2（A2レシピ＝骨格＋選別＋輪郭駆動＋発展＋弧）", () => {
  it("① 返り音はすべて scale 内（その調の音階ピッチ）", () => {
    const notes = gen(14);
    const scaleSet = new Set(sp.map((p) => ((p % 12) + 12) % 12));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(scaleSet.has(((n.pitch % 12) + 12) % 12)).toBe(true);
  });

  it("② 強拍(0/2拍)のコードトーン率が高い（>0.5）", () => {
    const notes = gen(14);
    const strong = notes.filter((n) => isStrong(n.start));
    expect(strong.length).toBeGreaterThan(0);
    const ct = strong.filter((n) => {
      const bar = Math.min(pcsPerBar.length - 1, Math.floor(n.start / 4));
      return pcsPerBar[bar]!.includes(((n.pitch % 12) + 12) % 12);
    });
    expect(ct.length / strong.length).toBeGreaterThan(0.5);
  });

  it("③ 全 onset が 0..bars*4 の範囲に収まる（小節数×拍）", () => {
    const bars = 8;
    const notes = gen(14, bars);
    for (const n of notes) {
      expect(n.start).toBeGreaterThanOrEqual(0);
      expect(n.start).toBeLessThan(bars * 4);
    }
    // start 昇順
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
  });

  it("④ seed決定的：同seedで同結果・別seedで別結果", () => {
    expect(JSON.stringify(gen(14))).toBe(JSON.stringify(gen(14)));
    expect(JSON.stringify(gen(14))).not.toBe(JSON.stringify(gen(21)));
  });

  it("⑤ 発展：B(5-6小節)は反行で A(1-2小節)と輪郭が異なる／A''は句末トニック着地", () => {
    const notes = gen(14);
    const contour = (b0: number) => {
      const seg = notes.filter((n) => n.start >= b0 * 4 && n.start < (b0 + 2) * 4).sort((a, b) => a.start - b.start);
      const mv: number[] = [];
      for (let i = 1; i < seg.length; i++) mv.push(Math.sign(seg[i]!.pitch - seg[i - 1]!.pitch));
      return mv;
    };
    const a = contour(0); // A
    const b = contour(4); // B（反行＝bar5-6）
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // 反行＝同位置の符号が大半で逆（完全一致でないことを確認＝輪郭が異なる）。
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    // A''（最終句）の最後の音はトニック(pc=0)へ着地。
    const last = notes[notes.length - 1]!;
    expect(((last.pitch % 12) + 12) % 12).toBe(0);
  });

  it("⑥ bars=4 等の短尺でも壊れない（終止音はその時点のコード構成音）", () => {
    const notes = gen(14, 4); // 4小節目=G7（B1: トニックが無いコードなら最寄りコード音に着地）
    expect(notes.length).toBeGreaterThan(0);
    const last = notes[notes.length - 1]!;
    const bar = Math.min(3, Math.floor(last.start / 4));
    const pc = ((last.pitch % 12) + 12) % 12;
    expect(pcsPerBar[bar]!.includes(pc)).toBe(true);
  });

  it("⑧ 句頭アンカー＝骨格のブロック頭bar downbeat（C1回帰：骨格はbeat索引・bar番号で引かない）", async () => {
    const { blockAnchorFromSkeleton } = await import("../src/music/melodyCells");
    const skel44 = Array.from({ length: 32 }, (_, i) => 60 + i); // 8小節×4拍・beat i の構造音=60+i
    expect(blockAnchorFromSkeleton(skel44, 0, 4, 62)).toBe(60);
    expect(blockAnchorFromSkeleton(skel44, 2, 4, 62)).toBe(68); // bar2 頭＝beat8（旧バグ: skel[2]=62＝bar0の3拍目）
    expect(blockAnchorFromSkeleton(skel44, 4, 4, 62)).toBe(76); // bar4 頭＝beat16
    expect(blockAnchorFromSkeleton(skel44, 6, 4, 62)).toBe(84);
    const skel68 = Array.from({ length: 24 }, (_, i) => 60 + i); // 6/8＝bpb3
    expect(blockAnchorFromSkeleton(skel68, 4, 3, 62)).toBe(72); // bar4 頭＝beat12
    expect(blockAnchorFromSkeleton(skel44, 100, 4, 62)).toBe(91); // 範囲外は末尾へクランプ
  });

  it("⑨ 終止のコード追従：終止音は「その時点のコード」の構成音（Vならsus4未解決の主音強制をしない）（B1）", () => {
    const rootsV = [0, 9, 5, 7, 0, 9, 5, 7];
    const qualsV = ["maj7", "min7", "maj7", "7", "maj7", "min7", "maj7", "7"]; // 最終小節=G7
    const pcsV = rootsV.map((r, i) => chordPcs(r, qualsV[i]!));
    let sawOverV = false;
    for (const seed of [3, 7, 14, 21]) {
      const notes = genMotifMelodyV2(pcsV, rootsV, qualsV, sp, motif16, { seed, tonicPc: 0, minor: false });
      const last = notes[notes.length - 1]!;
      const bar = Math.min(7, Math.floor(last.start / 4));
      const pc = ((last.pitch % 12) + 12) % 12;
      // 終止音は自分が鳴っている小節のコード構成音（旧: コード無視で主音強制＝G7上のC）。
      expect(pcsV[bar]!.includes(pc), `seed=${seed} bar=${bar}: 終止音pc=${pc}∈chord`).toBe(true);
      if (qualsV[bar] === "7") sawOverV = true;
    }
    expect(sawOverV).toBe(true); // 少なくとも1本はV上で終わっている＝V終止のケースを実際に検証した
  });

  it("⑩ 後処理の保証が最終出力で成立：禁則跳躍ゼロ＋単一頂点（D1/D2＝パス相互破壊の回帰）", () => {
    // 旧: 実行順が②③→①強拍CT→④頂点で、後段が直した禁則を再導入しても再チェックが無かった。
    for (let seed = 1; seed <= 30; seed++) {
      const notes = gen(seed);
      // 禁則音程（三全音/7度/8度超）が残らない
      for (let i = 1; i < notes.length; i++) {
        const a = Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch);
        expect(a === 6 || a === 10 || a === 11 || a > 12, `seed=${seed} i=${i}: 禁則|${a}|が残留`).toBe(false);
      }
      // 単一頂点（終止音は保護対象なので除外して数える）
      const hi = Math.max(...notes.map((n) => n.pitch));
      const peaks = notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1).length;
      expect(peaks <= 1, `seed=${seed}: 頂点が${peaks}個`).toBe(true);
    }
  });

  it("⑦ 終止保護：禁則跳躍パスが最終音(トニック着地)を上書きしない（B3回帰・実バグseed固定）", async () => {
    // スイープ(2026-07-08)で発見：直前音→終止が禁則音程(三全音等)の時、②禁則パスに終止保護が無く
    // 最終音が +2 スケール段へ書き換えられ主音から外れた（960本中6本・例 key=B♭ 終止E♭）。
    const { genMelody, genChords } = await import("../src/music/generate");
    const cases = [
      { key: 10, mood: "明るい", seed: 8 },
      { key: 10, mood: "切ない", seed: 3 },
      { key: 11, mood: "明るい", seed: 12 },
    ];
    for (const c of cases) {
      const frame = { key: c.key, bars: 8, mood: c.mood };
      const ch = (genChords(frame, c.seed).items[0]!.content as { chords: unknown }).chords as { root: number; quality: string; start: number; dur: number }[];
      const r = genMelody(frame, ch, c.seed, { useV2: true });
      const notes = (r.items[0]!.content as { notes: { pitch: number; start: number }[] }).notes;
      const last = notes[notes.length - 1]!;
      expect(((last.pitch % 12) + 12) % 12, `key=${c.key} seed=${c.seed}`).toBe(c.key);
    }
  });
});
