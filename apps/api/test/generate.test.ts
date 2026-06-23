import { describe, it, expect } from "vitest";
import { genChords, genMelody, genBass, genDrums, normalizeFrame } from "../src/music/generate";
import { chordPcs } from "../src/music/theory";

// 生成は seed 依存乱数＝byte等価ではなく**musicalルール**を property test で担保（design「アーキ是正 決定1」）。
describe("genChords（機能和声ルール）", () => {
  it("T始まり・T終わり（主和音 I/i で開始・終止）＋小節数一致＋ダイアトニック", () => {
    const { items } = genChords({ bars: 4, meter: "4/4", mood: "明るい" }, 7);
    const chords = (items[0]!.content as { chords: { root: number; quality: string; dur: number }[] }).chords;
    expect(chords.length).toBe(4);
    expect(chords[0]!.root).toBe(0); // I（major）
    expect(chords[chords.length - 1]!.root).toBe(0); // 終止 I
    expect(chords.every((c) => c.dur === 4)).toBe(true); // 4/4 で各1小節
  });
  it("マイナーmoodで i（0,m）始まり", () => {
    const { items } = genChords({ bars: 4, mood: "切ない" }, 3);
    const chords = (items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
    expect(chords[0]).toEqual(expect.objectContaining({ root: 0, quality: "m" }));
  });
  it("bars は 1..16 に丸め", () => {
    const { items } = genChords({ bars: 99 }, 1);
    expect((items[0]!.content as { chords: unknown[] }).chords.length).toBe(16);
  });
});

describe("genMelody（コードトーン拘束＋リズム図形）", () => {
  it("拍頭=コードトーン・音域内・リズムに variety（四分縛りでない）", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const { items } = genMelody({ bars: 2, meter: "4/4" }, chords, 5);
    const notes = (items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes.length).toBeGreaterThan(0);
    const tones = new Set(chordPcs(0, "")); // C E G
    expect(tones.has(((notes[0]!.pitch % 12) + 12) % 12)).toBe(true); // 先頭=コードトーン
    expect(notes.every((n) => n.pitch >= 60 && n.pitch <= 84)).toBe(true);
    expect(notes.every((n) => n.start >= 0 && n.start + n.dur <= 8 + 1e-6)).toBe(true); // 範囲内
    // 四分(dur=1)以外のリズムが出る（♪/付点/二分/休符）＝四分縛りの解消
    expect(notes.some((n) => n.dur !== 1)).toBe(true);
  });
  it("明るい(busy)は切ない(sparse)より音数が多い（密度がmoodで動く）", () => {
    const ch = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const bright = (genMelody({ bars: 4, mood: "明るい" }, ch, 1).items[0]!.content as { notes: unknown[] }).notes.length;
    const sad = (genMelody({ bars: 4, mood: "切ない" }, ch, 1).items[0]!.content as { notes: unknown[] }).notes.length;
    expect(bright).toBeGreaterThan(sad);
  });
  it("同一seedで決定的（再現する）", () => {
    const ch = [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4 }];
    const a = genMelody({ bars: 4, meter: "4/4", mood: "明るい" }, ch, 42);
    const b = genMelody({ bars: 4, meter: "4/4", mood: "明るい" }, ch, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("モチーフ反復：小節をまたいでリズム(dur列)が高い一致率で繰り返す（純乱数なら出ない）", () => {
    // 1コードで4小節 → 同じ動機が反復されるので、小節ごとの dur 列が高頻度で一致するはず。
    const ch = [{ root: 0, quality: "", start: 0, dur: 16 }];
    const notes = (genMelody({ bars: 4, meter: "4/4" }, ch, 5).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    // 小節ごとに dur 列を集める（small=startの小数も含めたリズム指紋）。
    const fingerprint = (bar: number): string =>
      notes
        .filter((n) => n.start >= bar * 4 && n.start < (bar + 1) * 4)
        .map((n) => `${(n.start % 4).toFixed(2)}:${n.dur.toFixed(2)}`)
        .join("|");
    const bars = [0, 1, 2, 3].map(fingerprint);
    // 基準=最初の小節と一致する小節が複数ある（反復＝記号エンジン特有）。
    const matches = bars.filter((b) => b === bars[0]).length;
    expect(matches).toBeGreaterThanOrEqual(2); // 反復が観測できる
  });
  it("モチーフ反復：相対音程(コントゥア)も小節をまたいで繰り返す傾向がある", () => {
    const ch = [{ root: 0, quality: "", start: 0, dur: 16 }];
    const notes = (genMelody({ bars: 4, meter: "4/4" }, ch, 11).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    const intervals = (bar: number): string =>
      notes
        .filter((n) => n.start >= bar * 4 && n.start < (bar + 1) * 4)
        .map((n) => n.pitch)
        .reduce<{ prev: number | null; out: string[] }>(
          (acc, p) => {
            if (acc.prev !== null) acc.out.push(String(p - acc.prev));
            acc.prev = p;
            return acc;
          },
          { prev: null, out: [] },
        )
        .out.join(",");
    const bars = [0, 1, 2, 3].map(intervals);
    const matches = bars.filter((b) => b === bars[0] && b.length > 0).length;
    expect(matches).toBeGreaterThanOrEqual(2); // コントゥアの反復が観測できる
  });
});

describe("genMelody 骨格（S1c・フレーズ/息継ぎ/カデンツ着地）", () => {
  const ch = [{ root: 0, quality: "", start: 0, dur: 16 }]; // Cずっと
  it("各 phrase 末に息継ぎ（休符の間）が空く＝全部 onset で埋まらない", () => {
    const notes = (genMelody({ bars: 4, meter: "4/4" }, ch, 5).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    for (const [lo, hi] of [[0, 8], [8, 16]] as [number, number][]) {
      const inPh = notes.filter((n) => n.start >= lo && n.start < hi);
      const lastEnd = Math.max(...inPh.map((n) => n.start + n.dur));
      expect(hi - lastEnd).toBeGreaterThan(0.3); // 句末に息継ぎ
    }
  });
  it("カデンツ着地：最終句は主音(pc0)・前楽節末は属音(pc7)へ", () => {
    const notes = (genMelody({ bars: 4, meter: "4/4" }, ch, 5).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    const lastOf = (lo: number, hi: number) =>
      notes.filter((n) => n.start >= lo && n.start < hi).sort((a, b) => a.start - b.start).at(-1)!;
    expect(((lastOf(0, 8).pitch % 12) + 12) % 12).toBe(7); // 前楽節末=属音G
    expect(((lastOf(8, 16).pitch % 12) + 12) % 12).toBe(0); // 最終=主音C
  });
  it("決定的（同seed一致）＋音域内", () => {
    const a = genMelody({ bars: 4, meter: "4/4" }, ch, 9);
    const b = genMelody({ bars: 4, meter: "4/4" }, ch, 9);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const notes = (a.items[0]!.content as { notes: { pitch: number }[] }).notes;
    expect(notes.every((n) => n.pitch >= 60 && n.pitch <= 84)).toBe(true);
  });
});

describe("genMelody 拍子・弱起（S1d）", () => {
  const ch = [{ root: 0, quality: "", start: 0, dur: 24 }];
  it("6/8：小節長=3拍基準・複合拍ネイティブ（付点ビート1.5に乗る/付点長音が出る）", () => {
    const notes = (genMelody({ bars: 4, meter: "6/8" }, ch, 5).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    expect(Math.max(...notes.map((n) => n.start + n.dur))).toBeLessThanOrEqual(12 + 1e-6); // 4小節×3拍
    const posInBar = notes.map((n) => Math.round((n.start % 3) * 100) / 100);
    expect(posInBar.includes(1.5)).toBe(true); // 第2付点ビート頭に乗る＝複合拍の感触
    expect(notes.some((n) => Math.abs(n.dur - 1.5) < 1e-6 || Math.abs(n.dur - 1) < 1e-6)).toBe(true); // 付点四分/四分
  });
  it("弱起 pickup>0：負startの upbeat が前置され、拍0(ダウンビート)は保たれ、歩進で滑り込む", () => {
    const notes = (genMelody({ bars: 4, meter: "4/4", pickup: 1 }, ch, 5).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    const pickup = notes.filter((n) => n.start < 0);
    expect(pickup.length).toBe(1); // 弱起1音
    expect(pickup[0]!.start).toBe(-1);
    const downbeat = notes.filter((n) => n.start >= 0).reduce((a, b) => (b.start < a.start ? b : a));
    expect(downbeat.start).toBe(0); // 拍0は後ろにずれない
    expect(Math.abs(pickup[0]!.pitch - downbeat.pitch)).toBeLessThanOrEqual(2); // 歩進で滑り込む
  });
  it("pickup 既定0：負start無し（既存挙動不変）", () => {
    const notes = (genMelody({ bars: 2, meter: "4/4" }, ch, 5).items[0]!.content as { notes: { start: number }[] }).notes;
    expect(notes.every((n) => n.start >= 0)).toBe(true);
  });
});

describe("genBass（ルート/5度＋リズム）", () => {
  it("先頭=ルート・低域・リズムあり", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const notes = (genBass({ bars: 2, meter: "4/4" }, chords).items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }).notes;
    expect(notes[0]!.pitch).toBe(36); // 小節頭=ルート C2
    expect(notes.every((n) => n.pitch >= 36 && n.pitch < 48)).toBe(true); // C2基準低域
    expect(notes.every((n) => [36, 36 + 7].includes(n.pitch))).toBe(true); // ルート or 5度
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe("genDrums（バックビート）", () => {
  it("16ステップ・Kick/Snare/HiHat・スネアは裏拍4/12", () => {
    const { items } = genDrums({}, 2);
    const r = (items[0]!.content as { rhythm: { steps: number; lanes: { name: string; hits: number[] }[] } }).rhythm;
    expect(r.steps).toBe(16);
    const snare = r.lanes.find((l) => l.name === "Snare")!;
    expect(snare.hits).toEqual([4, 12]);
    const kick = r.lanes.find((l) => l.name === "Kick")!;
    expect(kick.hits).toContain(0); // 表拍キック
  });
});

describe("normalizeFrame", () => {
  it("不正key/bars を落とす・clampする", () => {
    expect(normalizeFrame({ key: 99 }).key).toBeUndefined();
    expect(normalizeFrame({ bars: 0 }).bars).toBe(1);
    expect(normalizeFrame({ bars: 50 }).bars).toBe(16);
  });
});
