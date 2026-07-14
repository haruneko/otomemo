import { describe, it, expect } from "vitest";
import { genChords, genMelody, genBass, genDrums, genFromEssence, genChordPattern, normalizeFrame } from "../src/music/generate";
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
  it("bars は 1..MAX_BARS(64) に丸め（旧16上限は撤廃・2026-07-14 H1）", () => {
    const { items } = genChords({ bars: 99 }, 1);
    expect((items[0]!.content as { chords: unknown[] }).chords.length).toBe(64);
    const g32 = genChords({ bars: 32 }, 1); // 32小節は素直に通す（16で切らない）
    expect((g32.items[0]!.content as { chords: unknown[] }).chords.length).toBe(32);
  });

  it("I3a: 隣接同和音(C→C等)を出さない・終止前はドミナント準備（bars>=3）", () => {
    for (const mood of ["明るい", "切ない"]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { items } = genChords({ bars: 8, mood }, seed);
        const chords = (items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
        for (let i = 1; i < chords.length; i++) {
          const same = chords[i]!.root === chords[i - 1]!.root && chords[i]!.quality === chords[i - 1]!.quality;
          expect(same, `${mood} seed=${seed} i=${i}: 隣接同和音`).toBe(false);
        }
        const pen = chords[chords.length - 2]!;
        // 終止前＝D機能。長調 V/vii°、短調も V7/vii°（C0d 2026-07-09: ♭VII=subtonic は D位置に置かない＝
        // 生成が解析器 function.ts と一致。♭VII は loop ノブでのみ登場）。
        const okPen = [7, 11];
        expect(okPen.includes(pen.root), `${mood} seed=${seed}: 終止前=D機能(V/vii°) got ${pen.root}`).toBe(true);
      }
    }
  });

  it("I3b: mood がコードの色に効く＝おしゃれ系は7thパレット・明るいは三和音（旧: moodは長短切替のみ）", () => {
    const plain = (genChords({ bars: 8, mood: "明るい" }, 5).items[0]!.content as { chords: { quality: string }[] }).chords;
    const jazzy = (genChords({ bars: 8, mood: "おしゃれ" }, 5).items[0]!.content as { chords: { quality: string }[] }).chords;
    expect(jazzy.some((c) => /7/.test(c.quality))).toBe(true);
    expect(plain.every((c) => !/7/.test(c.quality))).toBe(true);
  });

  // ── Step3（2026-07-09・design#12-M）：カデンツ選択器 ──
  const lastRoots = (opts: { bars?: number; mood?: string; key?: number; cadence?: "full" | "half" | "deceptive" | "plagal" }) => {
    const { cadence, ...frame } = opts;
    const ch = (genChords({ bars: 8, ...frame }, 5, cadence).items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
    return { pen: ch[ch.length - 2]!, fin: ch[ch.length - 1]! };
  };

  it("Step3① cadence未指定=full=従来完全一致（回帰ゼロ）", () => {
    for (const mood of ["明るい", "切ない", "おしゃれ"]) {
      for (let seed = 1; seed <= 20; seed++) {
        const base = JSON.stringify(genChords({ bars: 8, mood }, seed).items[0]!.content);
        expect(JSON.stringify(genChords({ bars: 8, mood }, seed, "full").items[0]!.content), `${mood} seed=${seed}`).toBe(base);
        expect(JSON.stringify(genChords({ bars: 8, mood }, seed, undefined).items[0]!.content), `${mood} seed=${seed} undef`).toBe(base);
      }
    }
  });

  it("Step3② half=V終わり／deceptive=V→vi(長調)・V→♭VI(短調)／plagal=IV→I（key=C）", () => {
    // 長調C：V=G(7), vi=Am(9,m), IV=F(5), I=C(0)
    expect(lastRoots({ key: 0, mood: "明るい", cadence: "half" }).fin.root).toBe(7); // 終止=V(G)
    const dec = lastRoots({ key: 0, mood: "明るい", cadence: "deceptive" });
    expect(dec.pen.root).toBe(7); // penult=V
    expect(dec.fin).toEqual(expect.objectContaining({ root: 9, quality: "m" })); // 偽終止=vi(Am)
    const pl = lastRoots({ key: 0, mood: "明るい", cadence: "plagal" });
    expect(pl.pen.root).toBe(5); // penult=IV(F)
    expect(pl.fin.root).toBe(0); // 変終止=I(C)
    // 短調：deceptive の final=♭VI（Cm→ root 8 major）
    const decMin = lastRoots({ key: 0, mood: "切ない", cadence: "deceptive" });
    expect(decMin.fin.root).toBe(8); // ♭VI（A♭）
  });

  it("C① borrow/secondaryDom 未指定・空opts＝従来bit一致（回帰ゼロ）", () => {
    for (const mood of ["明るい", "切ない", "おしゃれ"]) {
      for (let seed = 1; seed <= 20; seed++) {
        const base = JSON.stringify(genChords({ bars: 8, mood }, seed).items[0]!.content);
        expect(JSON.stringify(genChords({ bars: 8, mood }, seed, undefined, {}).items[0]!.content), `${mood}#${seed}`).toBe(base);
      }
    }
  });

  it("C② borrow=1で長調にサブドミナントマイナー iv(Fm=root5,m) が出る", () => {
    const countIv = (borrow: number) => {
      let c = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const ch = (genChords({ key: 0, bars: 8, mood: "明るい" }, seed, undefined, { borrow }).items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
        c += ch.filter((x) => x.root === 5 && x.quality === "m").length; // Fm=iv借用
      }
      return c;
    };
    expect(countIv(0), "既定は借用iv=0（Fmは長調ダイアトニックに無い）").toBe(0);
    expect(countIv(1), "borrow=1でiv(Fm)が出る").toBeGreaterThan(0);
  });

  it("C③ secondaryDom=1で二次ドミナント(非ダイアトニックのdom7)が出る", () => {
    const diatonicMajRoots = new Set([0, 2, 4, 5, 7, 9, 11]);
    const countSecD = (secondaryDom: number) => {
      let c = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const ch = (genChords({ key: 0, bars: 8, mood: "明るい" }, seed, undefined, { secondaryDom }).items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
        // V/x = dom7 で、ダイアトニックのV(G7=root7)以外＝二次ドミナント
        c += ch.filter((x) => x.quality === "7" && x.root !== 7).length;
      }
      return c;
    };
    expect(countSecD(1), "secondaryDom=1で非ダイアトニックのdom7(二次ドミナント)が出る").toBeGreaterThan(0);
    // メロ自動整合（B1）：二次ドミナントの色音にメロが乗れる＝別途analyze_fitで担保（ここは和声のみ検証）
  });

  it("C④ loop=true で循環進行（短調 i-♭VI-♭VII エオリアン／長調 I-V-vi-IV アクシス）", () => {
    const maj = (genChords({ key: 0, bars: 6, mood: "明るい" }, 5, undefined, { loop: true }).items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
    expect(maj.map((c) => c.root)).toEqual([0, 7, 9, 5, 0, 7]); // I-V-vi-IV 循環（C-G-Am-F-C-G）
    const min = (genChords({ key: 0, bars: 6, mood: "切ない" }, 5, undefined, { loop: true }).items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
    expect(min.map((c) => c.root)).toEqual([0, 8, 10, 0, 8, 10]); // i-♭VI-♭VII 循環（Cm-A♭-B♭）
    expect(min[0]!.quality).toBe("m"); // i は短三和音
    // loop は末尾を主音に強制しない＝閉じずに回す
    expect(min[min.length - 1]!.root).toBe(10); // ♭VII で開いて終わる
  });

  it("C⑤ variety 未指定・空opts＝従来bit一致（回帰ゼロ・WP-C3スライス1）", () => {
    for (const mood of ["明るい", "切ない", "おしゃれ"]) {
      for (let seed = 1; seed <= 20; seed++) {
        const base = JSON.stringify(genChords({ bars: 8, mood }, seed).items[0]!.content);
        expect(JSON.stringify(genChords({ bars: 8, mood }, seed, undefined, { variety: 0 }).items[0]!.content), `${mood}#${seed}`).toBe(base);
      }
    }
  });

  it("C⑥ variety>0 で既存語彙(substitutesOf)接続＝ユニーク進行数が増える（6進行収束の緩和・WP-C3スライス1）", () => {
    // 短い枠(bars=3/4)は基底が数種に収束（audit C「6進行収束」の実体）。variety で substitutesOf 語彙が入り多様化。
    const uniq = (bars: number, variety: number) => {
      const set = new Set<string>();
      for (let seed = 1; seed <= 100; seed++) {
        const ch = (genChords({ key: 0, bars, mood: "明るい" }, seed, undefined, { variety }).items[0]!.content as { chords: { root: number; quality: string }[] }).chords;
        set.add(ch.map((c) => `${c.root}:${c.quality}`).join("-"));
      }
      return set.size;
    };
    expect(uniq(3, 0), "bars=3の基底は数種に収束").toBeLessThanOrEqual(4);
    expect(uniq(4, 0.6), "variety=0.6で多様化").toBeGreaterThan(uniq(4, 0));
    expect(uniq(3, 0.6), "bars=3でも収束が緩む").toBeGreaterThan(uniq(3, 0));
  });

  it("C⑦ variety でも T始まり/T終わり（先頭・末尾の主音）は不変", () => {
    for (const mood of ["明るい", "切ない"]) {
      for (let seed = 1; seed <= 30; seed++) {
        const ch = (genChords({ key: 0, bars: 8, mood }, seed, undefined, { variety: 1 }).items[0]!.content as { chords: { root: number }[] }).chords;
        expect(ch[0]!.root, `${mood}#${seed} 先頭=I`).toBe(0);
        expect(ch[ch.length - 1]!.root, `${mood}#${seed} 末尾=I`).toBe(0);
      }
    }
  });

  it("Step3③ メロは追従不要でカデンツに自動整合（half=V終わりは主音を強制しない・B1）", async () => {
    const { genMelody } = await import("../src/music/generate");
    const frame = { key: 0, bars: 8, mood: "明るい" };
    const ch = (genChords(frame, 5, "half").items[0]!.content as { chords: { root: number; quality: string; start: number; dur: number }[] }).chords;
    const notes = (genMelody(frame, ch, 5, { useV2: true }).items[0]!.content as { notes: { pitch: number; start: number }[] }).notes;
    const last = notes[notes.length - 1]!;
    const pc = ((last.pitch % 12) + 12) % 12;
    // 最終コード=V(G)=pcs{7,11,2}。終止音はその構成音（主音C=0を強制しない＝半終止の開き）。
    expect([7, 11, 2].includes(pc), `終止音pc=${pc}∈V`).toBe(true);
  });
});

describe("genFromEssence エッセンス→違うメロ（S5a・北極星）", () => {
  const ref = [
    { pitch: 60, start: 0, dur: 0.5 }, { pitch: 64, start: 0.5, dur: 0.5 },
    { pitch: 62, start: 1, dur: 0.5 }, { pitch: 67, start: 1.5, dur: 0.5 },
    { pitch: 65, start: 2, dur: 1 },
  ];
  const ch = [{ root: 0, quality: "", start: 0, dur: 8 }];
  it("リズム指紋(IOI)を継ぐ＝同じノリ", () => {
    const out = (genFromEssence(ref, { bars: 1 }, ch, 3).items[0]!.content as { notes: { start: number; dur: number }[] }).notes;
    expect(out.map((n) => n.start)).toEqual(ref.map((n) => n.start)); // オンセット＝同じ
  });
  it("輪郭(身振り)を継ぐが、絶対ピッチ列は別物（似て非なる）", () => {
    const out = (genFromEssence(ref, { bars: 1 }, ch, 3).items[0]!.content as { notes: { pitch: number }[] }).notes;
    const sign = (a: number[]) => a.slice(1).map((p, i) => Math.sign(p - a[i]!));
    expect(sign(out.map((n) => n.pitch))).toEqual(sign(ref.map((n) => n.pitch))); // 上下動＝同じ
    expect(JSON.stringify(out.map((n) => n.pitch))).not.toBe(JSON.stringify(ref.map((n) => n.pitch))); // でも音は別
  });
  it("決定的（同seed一致）＋音域内", () => {
    const a = genFromEssence(ref, { bars: 1 }, ch, 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(genFromEssence(ref, { bars: 1 }, ch, 7)));
    expect((a.items[0]!.content as { notes: { pitch: number }[] }).notes.every((n) => n.pitch >= 60 && n.pitch <= 84)).toBe(true);
  });
});

describe("genFromEssence 崩し強度＋複数参照ブレンド（崩し機能）", () => {
  const ref = [
    { pitch: 60, start: 0, dur: 0.5 }, { pitch: 64, start: 0.5, dur: 0.5 },
    { pitch: 62, start: 1, dur: 0.5 }, { pitch: 67, start: 1.5, dur: 0.5 },
    { pitch: 65, start: 2, dur: 0.5 }, { pitch: 64, start: 2.5, dur: 0.5 },
    { pitch: 69, start: 3, dur: 0.5 }, { pitch: 67, start: 3.5, dur: 0.5 },
  ];
  const ref2 = [
    { pitch: 67, start: 0, dur: 0.5 }, { pitch: 65, start: 0.5, dur: 0.5 },
    { pitch: 64, start: 1, dur: 0.5 }, { pitch: 60, start: 1.5, dur: 0.5 },
    { pitch: 62, start: 2, dur: 0.5 }, { pitch: 64, start: 2.5, dur: 0.5 },
    { pitch: 65, start: 3, dur: 0.5 }, { pitch: 64, start: 3.5, dur: 0.5 },
  ];
  const ch = [{ root: 0, quality: "", start: 0, dur: 8 }];
  const pcs = (r: ReturnType<typeof genFromEssence>) => (r.items[0]!.content as { notes: { pitch: number; start: number }[] }).notes;

  it("strength=0 は従来と完全一致（後方互換）", () => {
    expect(JSON.stringify(genFromEssence(ref, { bars: 2 }, ch, 3, { strength: 0 }))).toBe(
      JSON.stringify(genFromEssence(ref, { bars: 2 }, ch, 3)),
    );
  });
  it("strength を上げると音が変わる（崩しが効く）＝どれかの seed で差分・ノリ(オンセット)は保つ・音域内", () => {
    const anyDiff = [1, 2, 3, 4, 5].some(
      (s) =>
        JSON.stringify(pcs(genFromEssence(ref, { bars: 2 }, ch, s, { strength: 1 })).map((n) => n.pitch)) !==
        JSON.stringify(pcs(genFromEssence(ref, { bars: 2 }, ch, s, { strength: 0 })).map((n) => n.pitch)),
    );
    expect(anyDiff).toBe(true);
    const hard = pcs(genFromEssence(ref, { bars: 2 }, ch, 3, { strength: 1 }));
    expect(hard.map((n) => n.start)).toEqual(ref.map((n) => n.start)); // リズム指紋は保つ
    expect(hard.every((n) => n.pitch >= 60 && n.pitch <= 84)).toBe(true);
    expect(JSON.stringify(genFromEssence(ref, { bars: 2 }, ch, 3, { strength: 1 }))).toBe(
      JSON.stringify(genFromEssence(ref, { bars: 2 }, ch, 3, { strength: 1 })),
    ); // 決定的
  });
  it("複数参照ブレンド：オンセットは主参照・音域内・決定的", () => {
    const out = pcs(genFromEssence(ref, { bars: 2 }, ch, 5, { blendWith: [ref2] }));
    expect(out.map((n) => n.start)).toEqual(ref.map((n) => n.start));
    expect(out.every((n) => n.pitch >= 60 && n.pitch <= 84)).toBe(true);
    expect(JSON.stringify(genFromEssence(ref, { bars: 2 }, ch, 5, { blendWith: [ref2] }))).toBe(
      JSON.stringify(genFromEssence(ref, { bars: 2 }, ch, 5, { blendWith: [ref2] })),
    );
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
  it("6/8：複合拍ネイティブ＝付点ビート(0,1.5)頭にルート・小節長3拍", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 12 }];
    const notes = (genBass({ bars: 4, meter: "6/8" }, chords, 42).items[0]!.content as {
      notes: { pitch: number; start: number; dur: number }[];
    }).notes;
    expect(Math.max(...notes.map((n) => n.start + n.dur))).toBeLessThanOrEqual(12 + 1e-6); // 4小節×3拍
    const posInBar = [...new Set(notes.map((n) => Math.round((n.start % 3) * 100) / 100))];
    expect(posInBar.includes(0) && posInBar.includes(1.5)).toBe(true); // 2つの付点ビート頭
    // 付点ビート頭(0,1.5)はルート
    const heads = notes.filter((n) => Math.abs(n.start % 1.5) < 1e-6);
    expect(heads.every((n) => n.pitch === 36)).toBe(true);
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
  it("6/8：12ステップ・付点ビート(0,6)キック・八分ハット", () => {
    const r = (genDrums({ meter: "6/8" }, 2).items[0]!.content as {
      rhythm: { steps: number; lanes: { name: string; hits: number[] }[] };
    }).rhythm;
    expect(r.steps).toBe(12); // 6/8＝12ステップ(6八分)
    const kick = r.lanes.find((l) => l.name === "Kick")!;
    expect(kick.hits).toContain(0); // 付点ビート1
    const hat = r.lanes.find((l) => l.name === "HiHat")!;
    expect(hat.hits.every((s) => s % 2 === 0)).toBe(true); // 八分(偶数step)でハット
  });
});

describe("genChordPattern（コード楽器パターン・CP4）", () => {
  it("kind=chord_pattern・steps=bars*16(4/4)・拍頭hits・voicing R/3/5・決定的", () => {
    const a = genChordPattern({ bars: 2, meter: "4/4" }, 5);
    const it0 = a.items[0]!;
    expect(it0.kind).toBe("chord_pattern");
    const c = it0.content as { steps: number; hits: { step: number; dur: number }[]; voicing: { tones: string[] }; mode: string };
    expect(c.steps).toBe(32); // 2小節×16
    expect(c.hits.map((h) => h.step)).toEqual([0, 4, 8, 12, 16, 20, 24, 28]); // 既定=拍頭(4step毎)
    expect(c.hits.every((h) => h.dur === 4)).toBe(true); // 各音の長さ＝拍(4step)
    expect(c.voicing.tones).toEqual(["R", "3", "5"]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(genChordPattern({ bars: 2, meter: "4/4" }, 5))); // 決定的
  });
  it("6/8：steps=bars*12", () => {
    const c = genChordPattern({ bars: 2, meter: "6/8" }, 5).items[0]!.content as { steps: number };
    expect(c.steps).toBe(24); // 2小節×12
  });
});

describe("normalizeFrame", () => {
  it("不正key/bars を落とす・clampする", () => {
    expect(normalizeFrame({ key: 99 }).key).toBeUndefined();
    expect(normalizeFrame({ bars: 0 }).bars).toBe(1);
    expect(normalizeFrame({ bars: 50 }).bars).toBe(50); // MAX_BARS(64)以下は素直に通す（旧16上限は撤廃・H1）
    expect(normalizeFrame({ bars: 99 }).bars).toBe(64); // 超過は安全弁64へクランプ
  });
});
