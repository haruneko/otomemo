import { describe, it, expect } from "vitest";
import { deskLoadContent, deskSaveContent, deskLensNotes, sliceBedToWindow, contactText, contactDyadNotes, staleContacts } from "../src/deskContent";
import { LENS_FOLD, LENS_REAL } from "../src/deskLens";
import { analyzeCounterpoint, intervalBadge, SKEL_MEL_PROGRAM, SKEL_BASS_PROGRAM, type MelCp } from "../src/skeletonEdit";
import type { ChordEntry, Note, SkeletonContent, SkeletonBreakpoint } from "../src/music";

// MelCp を最小構成で組む（analyzeCounterpoint 出力と同型・分岐テスト用）。
const mkCp = (over: Partial<MelCp>): MelCp => ({
  start: 0, melPitch: 64, bassPitch: 48, interval: intervalBadge(64 - 48), dissonant: false, cross: false, parallel: "", ...over,
});

// --- (b) 配置越し編集の往復（2段解除の外側＝unshift）＝bit 往復（handoff §3 D1-b） -------------------
describe("deskLoadContent / deskSaveContent（配置越し往復・shift≠0）", () => {
  it("読込 +shift → 保存 −shift で元に戻る（null 休符は不変）", () => {
    const shift = 5;
    const content: SkeletonContent = {
      bars: 4,
      tones: [{ start: 0, pitch: 60 }, { start: 4, pitch: null }, { start: 6, pitch: 67 }],
      bass: [{ start: 0, pitch: 48 }, { start: 4, pitch: null }],
      phrases: [{ endBeat: 8, cadence: "half" }, { endBeat: 16, cadence: "full" }],
    };
    const view = deskLoadContent(content, shift);
    // 実調ビュー：非 null ピッチだけ +shift、null は不変。
    expect(view.tones).toEqual([{ start: 0, pitch: 65 }, { start: 4, pitch: null }, { start: 6, pitch: 72 }]);
    expect(view.bass).toEqual([{ start: 0, pitch: 53 }, { start: 4, pitch: null }]);
    // 往復＝素材調へ戻る（deepEqual）。
    expect(deskSaveContent(view, shift)).toEqual(content);
  });

  it("bass 無し content も往復で保存キーが増えない", () => {
    const shift = -3;
    const content: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 64 }] };
    const view = deskLoadContent(content, shift);
    expect(view.tones).toEqual([{ start: 0, pitch: 61 }]);
    expect("bass" in view).toBe(false);
    const saved = deskSaveContent(view, shift);
    expect(saved).toEqual({ bars: 2, tones: [{ start: 0, pitch: 64 }] });
    expect("bass" in saved).toBe(false);
  });

  it("元の content を破壊しない", () => {
    const content: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }] };
    deskLoadContent(content, 7);
    expect(content.tones[0]!.pitch).toBe(60);
  });
});

// --- (a) deskLens 消費の確認＝机の getNotes 合成が正しい（handoff §3 D1-a） -------------------------
describe("deskLensNotes（畳み群＝fold のみ／実音群＝real）", () => {
  const stateReal: SkeletonContent = {
    bars: 2,
    tones: [{ start: 0, pitch: 64 }, { start: 4, pitch: 67 }],
    bass: [{ start: 0, pitch: 48 }],
  };
  const earChordsRel: ChordEntry[] = [{ root: 0, quality: "", start: 0, dur: 8 }];
  // composite 相当＝編成合成（chord 楽器・ドラムを含む）。
  const composite: Note[] = [
    { pitch: 72, start: 0, dur: 1, program: 0, part: "melody" },
    { pitch: 67, start: 0, dur: 2, program: 4, part: "chord" },
    { pitch: 36, start: 0, dur: 0.25, drum: true, part: "drums" },
  ];
  const bars = 2, bpb = 4;
  const out = deskLensNotes({ stateReal, earChordsRel, composite, skelPosition: 0, bars, bpb });
  const fold = out.filter((n) => n.lens === LENS_FOLD);
  const real = out.filter((n) => n.lens === LENS_REAL);

  it("全ての音がレンズ印を持つ（fold か real のどちらか）", () => {
    expect(fold.length + real.length).toBe(out.length);
  });

  it("畳み群：クリック＝bars*bpb 本・コード楽器は混ざらない", () => {
    const clicks = fold.filter((n) => n.drum === true);
    expect(clicks).toHaveLength(bars * bpb);
    expect(fold.some((n) => n.part === "chord")).toBe(false); // コード楽器非混入
    // 2声（melody/bass）＝クリック以外は skelEar のみ
    const voices = fold.filter((n) => !n.drum);
    expect(voices.length).toBeGreaterThan(0);
    expect(new Set(voices.map((n) => n.part))).toEqual(new Set(["melody", "bass"]));
  });

  it("実音群：composite＋骨格線（skelEarReal）＝composite の chord/drum を含む", () => {
    const skelReCount = fold.length - bars * bpb; // fold ＝ skelEarReal ＋ click
    expect(real.length).toBe(composite.length + skelReCount);
    expect(real.some((n) => n.part === "chord")).toBe(true); // composite の和声が入る
    expect(real.some((n) => n.drum === true)).toBe(true); // composite のドラムが入る
    // 骨格線（program 48=String / 42=Cello）も real に混ざる
    expect(real.some((n) => n.program === 48 || n.program === 42)).toBe(true);
  });

  it("D1.5 ブロックローカル：skelEar は skelPosition に **依存しない**（beat 0 起点＝ロール一致）", () => {
    const at0 = deskLensNotes({ stateReal, earChordsRel, composite, skelPosition: 0, bars, bpb });
    const at8 = deskLensNotes({ stateReal, earChordsRel, composite, skelPosition: 8, bars, bpb });
    const voices = (out: typeof at0) => out.filter((n) => n.lens === LENS_FOLD && !n.drum).map((n) => n.start).sort((a, b) => a - b);
    // 骨格2声の start は skelPosition が 0 でも 8 でも同じ＝ +skelPosition していない（プレイヘッド一致の根拠）。
    expect(voices(at8)).toEqual(voices(at0));
    // 具体的に骨格 content どおり（tones の start 0/4 が beat 0 起点で残る）。
    expect(Math.min(...voices(at8))).toBe(0);
  });

  // --- D4 試着（candPreview）：実音レンズのメロ枠を候補で差し替え・現骨格線/現メロはゴースト。 ---
  describe("previewMelody（④試着＝ベッド上で候補を差し込む）", () => {
    const previewMelody: Note[] = [
      { pitch: 76, start: 0, dur: 1, part: "melody" },
      { pitch: 74, start: 2, dur: 1, part: "melody" },
    ];
    // 既存メロ入りベッド（part:"melody" が居る＝二重化しうる状況）。
    const bedComposite: Note[] = [
      { pitch: 72, start: 0, dur: 1, program: 0, part: "melody" }, // 現メロ（ゴースト対象）
      { pitch: 67, start: 0, dur: 2, program: 4, part: "chord" }, // 伴奏（残す）
      { pitch: 36, start: 0, dur: 0.25, drum: true, part: "drums" }, // 伴奏（残す）
    ];
    const withPrev = deskLensNotes({ stateReal, earChordsRel, composite: bedComposite, skelPosition: 0, bars, bpb, previewMelody });
    const realPrev = withPrev.filter((n) => n.lens === LENS_REAL);

    it("実音群のメロ＝候補に差し替わる（現メロ pitch72 は消え・候補 pitch76/74 が居る）", () => {
      const mel = realPrev.filter((n) => n.part === "melody");
      expect(mel.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([74, 76]);
      expect(mel.some((n) => n.pitch === 72)).toBe(false); // 現メロはゴースト（除外）
    });
    it("伴奏（コード/ドラム）はベッドとして残る", () => {
      expect(realPrev.some((n) => n.part === "chord")).toBe(true);
      expect(realPrev.some((n) => n.drum === true)).toBe(true);
    });
    it("現骨格線（skelEar・String/Cello）は実音群からゴースト＝鳴らさない", () => {
      expect(realPrev.some((n) => n.program === 48 || n.program === 42)).toBe(false);
    });
    it("previewMelody 未指定＝従来（bit一致・骨格線が残る）", () => {
      const plain = deskLensNotes({ stateReal, earChordsRel, composite: bedComposite, skelPosition: 0, bars, bpb });
      const realPlain = plain.filter((n) => n.lens === LENS_REAL);
      expect(realPlain.some((n) => n.program === 48 || n.program === 42)).toBe(true); // 骨格線が居る
      expect(realPlain.some((n) => n.pitch === 72)).toBe(true); // 現メロも居る
    });
  });
});

// --- D6: staleContacts（②で採用したコード区間に載る接点だけ stale＝membership の純関数） --------------
describe("staleContacts（編集区間に載る接点だけ true・半開 [start,end)）", () => {
  // 接点3つ：start 0 / 4 / 6（ブロックローカル）。
  const cp: MelCp[] = [
    mkCp({ start: 0 }), mkCp({ start: 4 }), mkCp({ start: 6 }),
  ];
  it("編集区間に載る接点だけ true・区間外は false", () => {
    // bar2 [4,8) を編集＝start 4/6 が stale・start 0 は非 stale。
    expect(staleContacts([{ start: 4, end: 8 }], cp)).toEqual([false, true, true]);
  });
  it("editedRanges 空＝全 false（②未編集・骨格だけ触った状態）", () => {
    expect(staleContacts([], cp)).toEqual([false, false, false]);
  });
  it("半開区間：start==range.start は載る・start==range.end は載らない（次コード側）", () => {
    // [0,4)：start 0 は載る、start 4 は end==4 で載らない。
    expect(staleContacts([{ start: 0, end: 4 }], cp)).toEqual([true, false, false]);
  });
  it("複数区間：いずれかに載れば true", () => {
    expect(staleContacts([{ start: 0, end: 2 }, { start: 6, end: 8 }], cp)).toEqual([true, false, true]);
  });
  it("重複区間は素直に許容（membership は or＝結果は変わらない）", () => {
    expect(staleContacts([{ start: 4, end: 8 }, { start: 4, end: 8 }], cp)).toEqual([false, true, true]);
  });
  it("接点空＝空配列", () => {
    expect(staleContacts([{ start: 0, end: 8 }], [])).toEqual([]);
  });
});

// --- D1.5 ベッドの窓切り出し（ブロックローカル化）＝プレイヘッドとロールを一致させる機構 --------------
describe("sliceBedToWindow（窓 [start, start+span) を切り出し -start シフト）", () => {
  const notes: Note[] = [
    { pitch: 60, start: 0, dur: 1, part: "melody" },
    { pitch: 62, start: 7.5, dur: 1, part: "melody" }, // 窓内（境界近く）
    { pitch: 64, start: 8, dur: 1, part: "melody" }, // 次ブロック頭＝窓外（start==end は除外）
    { pitch: 65, start: 12, dur: 1, part: "melody" }, // 窓外
  ];
  it("windowStart=8, span=8：窓 [8,16) の音だけ・start が -8 される", () => {
    const out = sliceBedToWindow(notes, 8, 8);
    expect(out.map((n) => [n.pitch, n.start])).toEqual([[64, 0], [65, 4]]);
  });
  it("窓外（start<windowStart / start>=end）は除外", () => {
    const out = sliceBedToWindow(notes, 0, 8);
    // start 0/7.5 が対象（8 は end==8 で除外・12 は窓外）。
    expect(out.map((n) => n.pitch)).toEqual([60, 62]);
  });
  it("windowStart=0 は恒等シフト（bit 一致・従来ケース）", () => {
    const out = sliceBedToWindow(notes, 0, 24); // span 大＝全部窓内
    expect(out.map((n) => n.start)).toEqual(notes.map((n) => n.start));
  });
  it("元配列を破壊しない", () => {
    const snap = notes.map((n) => n.start);
    sliceBedToWindow(notes, 8, 8);
    expect(notes.map((n) => n.start)).toEqual(snap);
  });
});

// --- D2: 接点の説明文（指摘のみ・禁止しない）分岐 -------------------------------------------------
describe("contactText（対位法の指摘のみ・禁止しない）", () => {
  it("並行5度＝度数でなく『並行5度』＋『避ける』（優先＝parallel を dissonant より前）", () => {
    // parallel と dissonant を同時に立てても parallel が勝つ（分岐の優先順位）。
    const t = contactText(mkCp({ parallel: "P5", dissonant: true, interval: intervalBadge(7) }));
    expect(t).toContain("並行5度");
    expect(t).toContain("避ける");
  });
  it("並行8度＝『並行8度』", () => {
    expect(contactText(mkCp({ parallel: "P8" }))).toContain("並行8度");
  });
  it("声部交差＝『交差』＋『意図』＋『可』（parallel が無い時）", () => {
    const t = contactText(mkCp({ cross: true }));
    expect(t).toContain("交差");
    expect(t).toMatch(/意図/);
    expect(t).toContain("可");
  });
  it("強拍の不協和＝度数 label＋『味』＋『解決』（掛留/倚音の言い回し）", () => {
    const iv = intervalBadge(62 - 60); // 2度
    const t = contactText(mkCp({ start: 0, melPitch: 62, bassPitch: 60, interval: iv, dissonant: true }));
    expect(t).toContain(iv.label); // 「2度」
    expect(t).toContain("味");
    expect(t).toContain("解決");
  });
  it("強拍の協和＝度数 label＋『素直』", () => {
    const iv = intervalBadge(67 - 60); // 5度（協和）
    const t = contactText(mkCp({ melPitch: 67, bassPitch: 60, interval: iv, dissonant: false }));
    expect(t).toContain(iv.label);
    expect(t).toContain("素直");
  });
  it("弱拍の不協和（dissonant=false）＝度数＋『経過』＋『素直』", () => {
    const iv = intervalBadge(65 - 60); // 4度（不協和だが弱拍＝dissonant false）
    expect(iv.consonant).toBe(false);
    const t = contactText(mkCp({ start: 1, melPitch: 65, bassPitch: 60, interval: iv, dissonant: false }));
    expect(t).toContain(iv.label);
    expect(t).toContain("経過");
    expect(t).toContain("素直");
  });
  it("ベース無し（interval=null・骨格休符区間）＝『ベース無し』", () => {
    expect(contactText(mkCp({ bassPitch: null, interval: null }))).toContain("ベース無し");
  });
  it("どの分岐も禁止語（ダメ/間違い/禁止/NG/悪い）を含まない＝指摘のみ", () => {
    const samples: MelCp[] = [
      mkCp({ parallel: "P5" }), mkCp({ parallel: "P8" }), mkCp({ cross: true }),
      mkCp({ interval: intervalBadge(2), dissonant: true }),
      mkCp({ interval: intervalBadge(3), dissonant: false }),
      mkCp({ interval: intervalBadge(5), dissonant: false }),
      mkCp({ bassPitch: null, interval: null }),
    ];
    for (const m of samples) {
      const t = contactText(m);
      for (const bad of ["ダメ", "間違い", "禁止", "NG", "悪い"]) expect(t).not.toContain(bad);
    }
  });
});

// --- D2: バッジ label は intervalBadge テーブル崇拝（再実装しない） -----------------------------------
describe("接点バッジ label ＝ analyzeCounterpoint の m.interval.label（intervalBadge 一致）", () => {
  it("各メロ点の interval.label は mod-12 単音程テーブルと一致（ストリップが出す値と同一）", () => {
    const mel: SkeletonBreakpoint[] = [
      { start: 0, pitch: 64 }, { start: 2, pitch: 67 }, { start: 4, pitch: 74 }, { start: 6, pitch: 71 },
    ];
    const bassAt = (b: number) => (b < 4 ? 48 : 50); // 実効ベース（区間で変える）
    const cp = analyzeCounterpoint(mel, bassAt);
    for (const m of cp) {
      // ストリップは m.interval.label をそのまま描く＝再実装しない。テーブルと一致を assert。
      expect(m.interval!.label).toBe(intervalBadge(m.melPitch - m.bassPitch!).label);
    }
  });
});

// --- D2: ダイアッドは 2音だけ（メロ＋実効ベース+1oct）・ベッド非混入 ---------------------------------
describe("contactDyadNotes（この瞬間だけ聴く＝2音のみ）", () => {
  it("bassPitch あり＝メロ＋ベース+1oct の2音・program/part 正・ベッド音は無い", () => {
    const m = mkCp({ melPitch: 72, bassPitch: 48 });
    const notes = contactDyadNotes(m);
    expect(notes).toHaveLength(2);
    const mel = notes.find((n) => n.part === "melody")!;
    const bass = notes.find((n) => n.part === "bass")!;
    expect(mel.pitch).toBe(72);
    expect(mel.program).toBe(SKEL_MEL_PROGRAM);
    expect(bass.pitch).toBe(48 + 12); // 実効ベース +1oct
    expect(bass.program).toBe(SKEL_BASS_PROGRAM);
    // ベッド（chord/drums）は構造的に混ざらない＝part は melody/bass だけ・drum なし。
    expect(notes.some((n) => n.drum)).toBe(false);
    expect(new Set(notes.map((n) => n.part))).toEqual(new Set(["melody", "bass"]));
  });
  it("bassPitch=null（骨格休符区間）＝メロ1音のみ", () => {
    const notes = contactDyadNotes(mkCp({ melPitch: 60, bassPitch: null, interval: null }));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.part).toBe("melody");
    expect(notes[0]!.pitch).toBe(60);
  });
  it("bassOct 引数で畳みオクターブを変えられる（既定 12）", () => {
    const notes = contactDyadNotes(mkCp({ melPitch: 64, bassPitch: 40 }), 24);
    expect(notes.find((n) => n.part === "bass")!.pitch).toBe(40 + 24);
  });
});
