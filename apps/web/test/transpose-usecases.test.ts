import { describe, it, expect } from "vitest";
import { compositeNotes, type CompositeChild } from "../src/music";

// 移調ユースケース総点検：メロ/コード/ベースを section に置いたとき「非異音」(調号に収まる)か。
// 非異音の基準＝合成後の全 pitch class が section の調号(7音)に収まること（ダイアトニック素材の場合）。
// 各 kind の規約: メロ=実音+「着地−key」／コード・ベース絶対=C基準+keyPc／ベース相対=section和音へ解決。

const major = (k: number) => [0, 2, 4, 5, 7, 9, 11].map((x) => (x + k) % 12);
const minor = (k: number) => [0, 2, 3, 5, 7, 8, 10].map((x) => (x + k) % 12);
const sig = (keyPc: number, mode: string) => new Set(mode === "minor" ? minor(keyPc) : major(keyPc));
const pc = (n: number) => ((n % 12) + 12) % 12;

// C基準の I-vi-IV-V（C-Am-F-G）。section keyPc で実調へ。
const chordsCmaj = (): CompositeChild => ({
  position: 0,
  node: {
    neta: {
      kind: "chord_progression",
      content: {
        chords: [
          { root: 0, quality: "", start: 0, dur: 2 },
          { root: 9, quality: "m", start: 2, dur: 2 },
          { root: 5, quality: "", start: 4, dur: 2 },
          { root: 7, quality: "", start: 6, dur: 2 },
        ],
      },
    },
  },
});
// C基準の短調 i-iv-V-i（Cm-Fm-G-Cm）。
const chordsCmin = (): CompositeChild => ({
  position: 0,
  node: {
    neta: {
      kind: "chord_progression",
      key: 0,
      mode: "minor", // 短調 content は mode を宣言する（mode-relative 移調の前提）
      content: {
        chords: [
          { root: 0, quality: "m", start: 0, dur: 2 },
          { root: 5, quality: "m", start: 2, dur: 2 },
          { root: 7, quality: "", start: 4, dur: 2 },
          { root: 0, quality: "m", start: 6, dur: 2 },
        ],
      },
    },
  },
});
// 実音メロ（key/mode を宣言）。pitches はそのまま content に入る（WYSIWYG）。
const melody = (pitches: number[], key: number, mode: string): CompositeChild => ({
  position: 0,
  node: {
    neta: { kind: "melody", key, mode, content: { notes: pitches.map((p, i) => ({ pitch: p, start: i, dur: 1 })) } },
  },
});
// 相対ベース（度数R中心・section和音に解決）。
const bassRel = (): CompositeChild => ({
  position: 0,
  node: {
    neta: {
      kind: "bass",
      content: { mode: "relative", steps: 8, pattern: [{ step: 0, degree: "R" }, { step: 4, degree: "5" }] },
    },
  },
});

const Cmaj_pitches = [60, 62, 64, 65, 67, 69, 71]; // C D E F G A B
const Cmin_pitches = [60, 62, 63, 65, 67, 68, 70]; // C D Eb F G Ab Bb
const Fsharp_min_pitches = [66, 68, 69, 71, 73, 74, 76]; // F# G# A B C# D E（F#自然短）

// 合成して、調号外の音(異音)を集める。kinds で対象を絞れる。
function outOfKey(children: CompositeChild[], keyPc: number, mode: string, kinds?: string[]): number[] {
  const notes = compositeNotes(
    kinds ? children.filter((c) => kinds.includes(c.node.neta.kind)) : children,
    keyPc,
    mode,
  );
  const s = sig(keyPc, mode);
  return [...new Set(notes.map((n) => pc(n.pitch)).filter((p) => !s.has(p)))].sort((a, b) => a - b);
}

describe("移調ユースケース：メロ＋コード＋ベースが section で非異音か", () => {
  it("UC1 C調素材一式 → Cmaj section：全部 C メジャー調号内", () => {
    const kids = [chordsCmaj(), melody(Cmaj_pitches, 0, "major"), bassRel()];
    expect(outOfKey(kids, 0, "major")).toEqual([]);
  });

  it("UC2 C調素材一式 → Dmaj section(keyPc=2)：全部 D メジャー調号内", () => {
    const kids = [chordsCmaj(), melody(Cmaj_pitches, 0, "major"), bassRel()];
    expect(outOfKey(kids, 2, "major")).toEqual([]);
  });

  it("UC3 ★F#m メロ＋C調コード → Cmaj section：メロは相対短(A)へ＝C調号内・コードもC調号内", () => {
    const kids = [chordsCmaj(), melody(Fsharp_min_pitches, 6, "minor"), bassRel()];
    expect(outOfKey(kids, 0, "major")).toEqual([]);
  });

  it("UC4 短調素材一式（Cm基準）→ Am section(keyPc=9,minor)：A自然短の調号内", () => {
    // 短調メロは Cm 実音、key=0/mode=minor。コードは Cm 基準。section Am。
    const kids = [chordsCmin(), melody(Cmin_pitches, 0, "minor"), bassRel()];
    // E(属和音)の導音 G#(8) は和声短＝調号外として許容（コードのみ）。メロ/ベースは自然短内であるべき。
    expect(outOfKey(kids, 9, "minor", ["melody", "bass"])).toEqual([]);
  });

  it("UC5 コード単独：C基準 → 各 section key で調号内（chromatic transpose の健全性）", () => {
    for (const [k, m] of [[0, "major"], [5, "major"], [7, "major"], [2, "major"]] as const) {
      expect(outOfKey([chordsCmaj()], k, m, ["chord_progression"])).toEqual([]);
    }
  });

  it("UC6 ベース相対単独：section 和音のルート/5度に解決＝調号内", () => {
    for (const k of [0, 2, 7]) {
      const kids = [chordsCmaj(), bassRel()];
      expect(outOfKey(kids, k, "major", ["bass"])).toEqual([]);
    }
  });

  it("UC7 F#m メロ → Dmaj section(keyPc=2)：Dの相対短(Bm)へ＝D調号内", () => {
    const kids = [chordsCmaj(), melody(Fsharp_min_pitches, 6, "minor")];
    expect(outOfKey(kids, 2, "major")).toEqual([]);
  });

  it("UC8 G長調メロ(実音G・key=7) → Cmaj section：G→C へ＝C調号内", () => {
    const Gmaj_pitches = [67, 69, 71, 72, 74, 76, 78]; // G A B C D E F#
    const kids = [chordsCmaj(), melody(Gmaj_pitches, 7, "major")];
    expect(outOfKey(kids, 0, "major")).toEqual([]);
  });

  it("UC9 mode食い違い（長調メロ→短調section / 短調メロ→長調section）も相対で非異音", () => {
    // 長調メロ(C,key0) → Am section：相対長(C)へ＝A自然短の調号内(=C長調号)
    expect(outOfKey([melody(Cmaj_pitches, 0, "major")], 9, "minor", ["melody"])).toEqual([]);
    // 短調メロ(F#m,key6) → Cmaj section：UC3で既出だが単独でも
    expect(outOfKey([melody(Fsharp_min_pitches, 6, "minor")], 0, "major", ["melody"])).toEqual([]);
  });

  it("UC10【仕様・要注意】メロの調を実音に合わせず放置(F#音だがkey=0)＝C基準扱いで異音化する", () => {
    // F#自然短の実音を key=0(C)で宣言＝主音を偽る→Cmaj section で異音が出る（=メロの調設定は必須）。
    const bad = outOfKey([melody(Fsharp_min_pitches, 0, "major")], 0, "major", ["melody"]);
    expect(bad.length).toBeGreaterThan(0); // 異音が出る＝「調を設定して」の根拠
  });
});

// 実音 root の F#m 進行（ユーザーが ChordEditor で F#m を選んで作る形）。key=6, mode=minor。
// i-VI-VII-i = F#m - D - E - F#m。
const chordsFsharpMin = (): CompositeChild => ({
  position: 0,
  node: {
    neta: {
      kind: "chord_progression",
      key: 6,
      mode: "minor",
      content: {
        chords: [
          { root: 6, quality: "m", start: 0, dur: 2 },
          { root: 2, quality: "", start: 2, dur: 2 },
          { root: 4, quality: "", start: 4, dur: 2 },
          { root: 6, quality: "m", start: 6, dur: 2 },
        ],
      },
    },
  },
});

describe("★コードの key-aware 移調：実音 root の F#m 進行を section に置く", () => {
  it("UC11 F#m進行 → F#m section(keyPc=6)：F#m のまま＝非異音（旧は+6で二重移調しCm化していた）", () => {
    expect(outOfKey([chordsFsharpMin()], 6, "minor", ["chord_progression"])).toEqual([]);
  });

  it("UC12 F#m進行 → Am section(keyPc=9)：Am へ移調＝C調号内（非異音）", () => {
    expect(outOfKey([chordsFsharpMin()], 9, "minor", ["chord_progression"])).toEqual([]);
  });

  it("UC13 F#m進行＋F#mメロ → F#m section：両方 F#m で揃う（非異音）", () => {
    const kids = [chordsFsharpMin(), melody(Fsharp_min_pitches, 6, "minor")];
    expect(outOfKey(kids, 6, "minor")).toEqual([]);
  });

  it("UC14 F#m進行＋F#mメロ → Am section：両方 Am へ揃う（非異音）", () => {
    const kids = [chordsFsharpMin(), melody(Fsharp_min_pitches, 6, "minor")];
    expect(outOfKey(kids, 9, "minor")).toEqual([]);
  });

  it("UC15 ベース相対は F#m 進行の実調ルートに解決（key-aware の sectionChords）", () => {
    const kids = [chordsFsharpMin(), bassRel()];
    expect(outOfKey(kids, 6, "minor", ["bass"])).toEqual([]); // F#m section でベースが F#/C# 等に
  });
});

// ベース絶対（実音 notes・key/mode 宣言）。F#自然短の低域ベース。
const bassAbs = (pitches: number[], key: number, mode: string): CompositeChild => ({
  position: 0,
  node: { neta: { kind: "bass", key, mode, content: { notes: pitches.map((p, i) => ({ pitch: p, start: i, dur: 1 })) } } },
});
const Fsharp_bass = [42, 44, 45, 47, 49, 50, 52]; // F#2 G#2 A2 B2 C#3 D3 E3（F#自然短・低域）

describe("★ベースの key-aware 移調（コードと同様か）", () => {
  it("UC16 ベース絶対 F#m → F#m section：そのまま＝非異音", () => {
    expect(outOfKey([bassAbs(Fsharp_bass, 6, "minor")], 6, "minor", ["bass"])).toEqual([]);
  });
  it("UC17 ベース絶対 F#m → Am section：Am へ移調＝C調号内（非異音）", () => {
    expect(outOfKey([bassAbs(Fsharp_bass, 6, "minor")], 9, "minor", ["bass"])).toEqual([]);
  });
  it("UC18 ベース絶対＋F#mコード＋F#mメロ → F#m section：全部 F#m で揃う", () => {
    const kids = [chordsFsharpMin(), melody(Fsharp_min_pitches, 6, "minor"), bassAbs(Fsharp_bass, 6, "minor")];
    expect(outOfKey(kids, 6, "minor")).toEqual([]);
  });
  it("UC19 C基準ベース(key=0) → 各section key：従来の +keyPc 同等で非異音（後退ゼロ）", () => {
    const Cbass = [36, 38, 40, 41, 43, 45, 47]; // C2..B2
    for (const [k, m] of [[0, "major"], [2, "major"], [9, "minor"]] as const)
      expect(outOfKey([bassAbs(Cbass, 0, "major")], k, m, ["bass"])).toEqual([]);
  });
});

// 入れ子 section：内側 section が自分の調(key+mode)を持つ。子(メロ/コード/ベース)を内側調で合成し位置オフセット。
const nestedSection = (innerKey: number, innerMode: string, children: CompositeChild[]): CompositeChild => ({
  position: 0,
  node: { neta: { kind: "section", key: innerKey, mode: innerMode, content: {} }, children },
});

describe("★入れ子 section が壊れないか（多調・合成）", () => {
  it("UC20 外側Cmaj に 内側F#m section(メロ+コード+ベース) を入れる：内側は F#m のまま非異音", () => {
    const inner = nestedSection(6, "minor", [
      chordsFsharpMin(),
      melody(Fsharp_min_pitches, 6, "minor"),
      bassAbs(Fsharp_bass, 6, "minor"),
    ]);
    // 外側 Cmaj(0,major) で合成。内側 F#m の内容は **F#m の調号(=A長調号)内**に収まるべき。
    const notes = compositeNotes([inner], 0, "major");
    const innerSig = sig(6, "minor");
    const bad = [...new Set(notes.map((n) => pc(n.pitch)).filter((p) => !innerSig.has(p)))];
    expect(bad).toEqual([]); // 内側は内側調のまま＝外側調で二重移調しない
  });

  it("UC21 内側 section が調未設定なら外側調を継承（Dmaj 継承）", () => {
    const inner = nestedSection(undefined as unknown as number, undefined as unknown as string, [
      chordsCmaj(), // C基準コード
      melody(Cmaj_pitches, 0, "major"),
    ]);
    // 外側 Dmaj(2,major)。内側は key 未設定→外側 D を継承し、C基準内容が D へ。
    const notes = compositeNotes([inner], 2, "major");
    const bad = [...new Set(notes.map((n) => pc(n.pitch)).filter((p) => !sig(2, "major").has(p)))];
    expect(bad).toEqual([]);
  });

  it("UC22 二重入れ子（song > section > 中身）でも各層の調で正しく合成", () => {
    const innerFsharp = nestedSection(6, "minor", [chordsFsharpMin(), melody(Fsharp_min_pitches, 6, "minor")]);
    const song = nestedSection(0, "major", [innerFsharp]); // 外側song Cmaj に F#m section
    const notes = compositeNotes([song], 0, "major");
    const innerSig = sig(6, "minor");
    const bad = [...new Set(notes.map((n) => pc(n.pitch)).filter((p) => !innerSig.has(p)))];
    expect(bad).toEqual([]); // 二段入れ子でも F#m 内容は F#m のまま
  });
});
