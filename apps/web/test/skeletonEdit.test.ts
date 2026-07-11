import { describe, it, expect } from "vitest";
import {
  snapBeat,
  bandEnd,
  dominionSegments,
  upsertPoint,
  removePointAt,
  toggleRestAt,
  clipPhraseBeat,
  foldDisplayPitch,
  unfoldPitch,
  derivedBassPitch,
  derivedBassAt,
  explicitBassSegments,
  effectiveBassAt,
  effectiveBassSegments,
  intervalBadge,
  isStrongBeat,
  analyzeCounterpoint,
  nudgePoints,
  deletePoints,
  skeletonPlaybackNotes,
  skeletonEarNotes,
  isTap,
  TAP_SLOP,
} from "../src/skeletonEdit";
import type { SkeletonBreakpoint, SkeletonContent } from "../src/music";

// 骨格編集の純ロジック（design #20 S2）。支配帯/スナップ/null点/句クリップ/折返し/導出ベース/対位法判定/再生変換。

describe("snapBeat（スナップ丸め）", () => {
  it("2拍スナップ＝2の倍数へ", () => {
    expect(snapBeat(3.4, 2, 32)).toBe(4);
    expect(snapBeat(2.9, 2, 32)).toBe(2);
  });
  it("1拍スナップ＝整数拍へ", () => {
    expect(snapBeat(3.4, 1, 32)).toBe(3);
  });
  it("自由(0)＝0.25拍グリッド", () => {
    expect(snapBeat(3.1, 0, 32)).toBe(3);
    expect(snapBeat(3.13, 0, 32)).toBe(3.25);
  });
  it("[0,total] にクランプ", () => {
    expect(snapBeat(40, 2, 32)).toBe(32);
    expect(snapBeat(-2, 1, 32)).toBe(0);
  });
});

describe("bandEnd（支配帯の終端）", () => {
  const pts: SkeletonBreakpoint[] = [{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }, { start: 8, pitch: 69 }];
  it("次のブレークポイントまで", () => {
    expect(bandEnd(pts, 0, [], 32)).toBe(4);
    expect(bandEnd(pts, 4, [], 32)).toBe(8);
  });
  it("最後の点は曲末まで", () => {
    expect(bandEnd(pts, 8, [], 32)).toBe(32);
  });
  it("句境界で切れる（次点より手前の境界を優先）", () => {
    expect(bandEnd(pts, 0, [{ endBeat: 2 }], 32)).toBe(2);
  });
});

describe("dominionSegments（支配区間の展開・null含む）", () => {
  it("実音は次点/曲末まで", () => {
    const segs = dominionSegments([{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }], [], 8);
    expect(segs).toEqual([
      { start: 0, end: 4, pitch: 60 },
      { start: 4, end: 8, pitch: 67 },
    ]);
  });
  it("null点（骨格休符）も区間として返す（描画のハッチ用）", () => {
    const segs = dominionSegments([{ start: 0, pitch: null }, { start: 2, pitch: 62 }], [], 4);
    expect(segs).toEqual([
      { start: 0, end: 2, pitch: null },
      { start: 2, end: 4, pitch: 62 },
    ]);
  });
});

describe("点の操作（不変・sorted維持）", () => {
  const pts: SkeletonBreakpoint[] = [{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }];
  it("upsertPoint＝同拍は置換・新拍は挿入", () => {
    expect(upsertPoint(pts, 4, 69)).toEqual([{ start: 0, pitch: 60 }, { start: 4, pitch: 69 }]);
    expect(upsertPoint(pts, 2, 64)).toEqual([{ start: 0, pitch: 60 }, { start: 2, pitch: 64 }, { start: 4, pitch: 67 }]);
    expect(pts).toEqual([{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }]); // 元不変
  });
  it("removePointAt＝該当拍を削除", () => {
    expect(removePointAt(pts, 4)).toEqual([{ start: 0, pitch: 60 }]);
  });
  it("toggleRestAt＝空拍はnull挿入・実音はnull化・null点は削除", () => {
    expect(toggleRestAt(pts, 2)).toEqual([{ start: 0, pitch: 60 }, { start: 2, pitch: null }, { start: 4, pitch: 67 }]);
    expect(toggleRestAt(pts, 4)).toEqual([{ start: 0, pitch: 60 }, { start: 4, pitch: null }]);
    expect(toggleRestAt([{ start: 0, pitch: null }], 0)).toEqual([]);
  });
});

describe("clipPhraseBeat（句境界の丸め・クランプ）", () => {
  it("小節境界へ丸め、両端は曲頭/曲末を残す", () => {
    expect(clipPhraseBeat(5, 4, 32)).toBe(4);
    expect(clipPhraseBeat(7, 4, 32)).toBe(8);
    expect(clipPhraseBeat(0, 4, 32)).toBe(4); // 最小1小節
    expect(clipPhraseBeat(40, 4, 32)).toBe(28); // 曲末の1小節手前まで
  });
});

describe("折返し表示（register transfer）", () => {
  it("表示=実音+foldOct / 逆変換で戻る", () => {
    expect(foldDisplayPitch(48, 24)).toBe(72);
    expect(unfoldPitch(72, 24)).toBe(48);
  });
});

describe("導出ベース（コードroot/分数）", () => {
  it("root pc を低域(C2帯)代表音へ", () => {
    expect(derivedBassPitch(0)).toBe(36); // C2
    expect(derivedBassPitch(7)).toBe(43); // G2
  });
  it("derivedBassAt＝被覆コードのroot（分数はbass優先）", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }, { root: 7, quality: "", start: 4, dur: 4, bass: 4 }];
    expect(derivedBassAt(0, chords)).toBe(36); // C
    expect(derivedBassAt(5, chords)).toBe(40); // G/E → E2
    expect(derivedBassAt(20, chords)).toBe(null); // 範囲外
  });
});

describe("明示ベース区間と実効ベース", () => {
  const bass: SkeletonBreakpoint[] = [{ start: 16, pitch: 48 }, { start: 18, pitch: 47 }, { start: 20, pitch: 46 }, { start: 22, pitch: 45 }];
  it("最後の点は直前間隔ぶん支配", () => {
    expect(explicitBassSegments(bass, [], 32)).toEqual([
      { start: 16, end: 18, pitch: 48 },
      { start: 18, end: 20, pitch: 47 },
      { start: 20, end: 22, pitch: 46 },
      { start: 22, end: 24, pitch: 45 },
    ]);
  });
  it("明示があれば明示・無ければ導出", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 32 }];
    expect(effectiveBassAt(17, bass, chords, [], 32)).toBe(48); // 明示
    expect(effectiveBassAt(0, bass, chords, [], 32)).toBe(36); // 導出（明示外）
    expect(effectiveBassAt(30, bass, chords, [], 32)).toBe(36); // 明示区間の後は導出に復帰
  });
  it("null明示（骨格休符）はそのまま無音", () => {
    expect(effectiveBassAt(1, [{ start: 0, pitch: null }], [{ root: 0, quality: "", start: 0, dur: 4 }], [], 4)).toBe(null);
  });
  it("effectiveBassSegments＝明示は explicit・導出は derived で区間化", () => {
    const chords = [{ root: 0, quality: "", start: 0, dur: 32 }];
    const segs = effectiveBassSegments(bass, chords, [], 32);
    // 0..16 導出(C=36)、16..24 明示(48..45)、24..32 導出に復帰(36)
    expect(segs[0]).toEqual({ start: 0, end: 16, pitch: 36, source: "derived" });
    expect(segs.find((s) => s.start === 16)).toMatchObject({ pitch: 48, source: "explicit" });
    expect(segs[segs.length - 1]).toEqual({ start: 24, end: 32, pitch: 36, source: "derived" });
  });
});

describe("音程バッジ（mod-12単音程還元）", () => {
  it("協和=3/5/6/8度、不協和=2/4/7度", () => {
    expect(intervalBadge(0)).toEqual({ label: "8度", consonant: true });
    expect(intervalBadge(12)).toEqual({ label: "8度", consonant: true }); // 10度→3度 の慣習と同様、mod12
    expect(intervalBadge(4)).toEqual({ label: "3度", consonant: true });
    expect(intervalBadge(7)).toEqual({ label: "5度", consonant: true });
    expect(intervalBadge(2)).toEqual({ label: "2度", consonant: false });
    expect(intervalBadge(5)).toEqual({ label: "4度", consonant: false });
    expect(intervalBadge(10)).toEqual({ label: "7度", consonant: false });
  });
  it("16度(2oct)も3度へ還元＝実音差をmod12", () => {
    expect(intervalBadge(16).label).toBe("3度");
  });
});

describe("isStrongBeat", () => {
  it("4/4の強拍(0,2,...)", () => {
    expect(isStrongBeat(0)).toBe(true);
    expect(isStrongBeat(2)).toBe(true);
    expect(isStrongBeat(1)).toBe(false);
  });
});

describe("analyzeCounterpoint（指摘のみ）", () => {
  it("各メロ点に音程・強拍不協和・交差・並行を付す", () => {
    const mel: SkeletonBreakpoint[] = [{ start: 0, pitch: 67 }, { start: 2, pitch: 62 }];
    // ベース＝常に C(実音48・G→…) を返す簡易関数
    const bassAt = (b: number) => (b < 2 ? 48 : 55); // C3 / G3
    const r = analyzeCounterpoint(mel, bassAt);
    expect(r[0]).toMatchObject({ start: 0, melPitch: 67, bassPitch: 48, cross: false });
    expect(r[0]!.interval!.label).toBe("5度"); // 67-48=19 → mod12=7
    expect(r[1]!.interval!.label).toBe("5度"); // 62-55=7 → 5度
  });
  it("声部交差＝メロ<ベース（実音）", () => {
    const mel: SkeletonBreakpoint[] = [{ start: 0, pitch: 40 }];
    const r = analyzeCounterpoint(mel, () => 48);
    expect(r[0]!.cross).toBe(true);
  });
  it("並行5度＝連続で同方向・両声5度", () => {
    const mel: SkeletonBreakpoint[] = [{ start: 0, pitch: 55 }, { start: 2, pitch: 57 }];
    // bass: C(48)→D(50)、両声とも上行・どちらも5度(55-48=7,57-50=7)
    const bassAt = (b: number) => (b < 2 ? 48 : 50);
    const r = analyzeCounterpoint(mel, bassAt);
    expect(r[1]!.parallel).toBe("P5");
  });
  it("ベースnullの点は判定スキップ（bassPitch=null）", () => {
    const r = analyzeCounterpoint([{ start: 0, pitch: 60 }], () => null);
    expect(r[0]!.bassPitch).toBe(null);
    expect(r[0]!.cross).toBe(false);
  });
});

describe("選択編集（skeletonEdit 独自実装・noteEdit と同流儀＝nudge/削除）", () => {
  const pts: SkeletonBreakpoint[] = [{ start: 0, pitch: 60 }, { start: 2, pitch: null }, { start: 4, pitch: 67 }];
  it("nudgePoints＝選択(index)を音程/拍で移動・null点は音程不動", () => {
    const out = nudgePoints(pts, new Set([0, 1]), 2, 1, 32);
    expect(out[0]).toEqual({ start: 1, pitch: 62 }); // +2半音,+1拍
    expect(out.find((p) => p.pitch === null)).toEqual({ start: 3, pitch: null }); // null点は拍だけ移動
  });
  it("deletePoints＝選択indexを削除", () => {
    expect(deletePoints(pts, new Set([1]))).toEqual([{ start: 0, pitch: 60 }, { start: 4, pitch: 67 }]);
  });
});

describe("skeletonPlaybackNotes（対位法/実音の2声）", () => {
  const content: SkeletonContent = {
    bars: 2,
    tones: [{ start: 0, pitch: 64 }, { start: 4, pitch: 67 }],
    bass: [{ start: 0, pitch: 48 }],
  };
  it("メロ実音＋ベース（対位法=+1oct）を鳴らす", () => {
    const ns = skeletonPlaybackNotes(content, { counterpoint: true, chords: [] });
    const mel = ns.filter((n) => n.part === "melody");
    const bass = ns.filter((n) => n.part === "bass");
    expect(mel.map((n) => n.pitch)).toEqual([64, 67]);
    // 明示ベース48が対位法で+12=60、支配は次点/曲末まで（1点→曲末8拍）
    expect(bass[0]!.pitch).toBe(60);
  });
  it("音色既定＝メロ GM48(Strings)・ベース GM42(Cello)（オーナーFB 2026-07-11）", () => {
    const ns = skeletonPlaybackNotes(content, { counterpoint: true, chords: [] });
    expect(ns.find((n) => n.part === "melody")!.program).toBe(48);
    expect(ns.find((n) => n.part === "bass")!.program).toBe(42);
  });
  it("実音モード＝ベースはそのままの高さ", () => {
    const ns = skeletonPlaybackNotes(content, { counterpoint: false, chords: [] });
    expect(ns.filter((n) => n.part === "bass")[0]!.pitch).toBe(48);
  });
  it("コード導出ベース（明示なし）もコードrootで鳴る", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 72 }] };
    const chords = [{ root: 0, quality: "", start: 0, dur: 4 }];
    const ns = skeletonPlaybackNotes(c, { counterpoint: false, chords });
    expect(ns.filter((n) => n.part === "bass")[0]!.pitch).toBe(36); // C2
  });
});

describe("isTap（タップとパンの区別＝スクロール誤タップ対策・オーナーFB）", () => {
  it("閾値内＝タップ", () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(TAP_SLOP - 1, 0)).toBe(true);
    expect(isTap(-3, 4)).toBe(true);
  });
  it("閾値超え（縦横どちらでも）＝パン＝タップでない", () => {
    expect(isTap(TAP_SLOP + 1, 0)).toBe(false);
    expect(isTap(0, -TAP_SLOP - 1)).toBe(false);
    expect(isTap(30, 40)).toBe(false);
  });
  it("カスタム閾値", () => {
    expect(isTap(5, 0, 4)).toBe(false);
    expect(isTap(3, 0, 4)).toBe(true);
  });
});

describe("skeletonEarNotes（セクション耳確認＝合成再生への骨格2声ミックス）", () => {
  const content: SkeletonContent = {
    bars: 1,
    tones: [{ start: 0, pitch: 64 }],
    bass: [{ start: 0, pitch: 48 }],
  };
  it("shift で両声とも移調・対位法(+1oct)固定・Strings/Cello音色", () => {
    const ns = skeletonEarNotes(content, { chords: [], shift: 2 });
    const mel = ns.find((n) => n.part === "melody")!;
    const bass = ns.find((n) => n.part === "bass")!;
    expect(mel.pitch).toBe(66); // 64+2
    expect(bass.pitch).toBe(62); // 48+2 +12(対位法)
    expect(mel.program).toBe(48);
    expect(bass.program).toBe(42);
  });
  it("shift 省略＝0（そのまま）・導出ベースはコードrootから（rootは呼び出し側で移調済み前提）", () => {
    const c: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 72 }] };
    const ns = skeletonEarNotes(c, { chords: [{ root: 7, quality: "", start: 0, dur: 4 }] });
    expect(ns.find((n) => n.part === "bass")!.pitch).toBe(43 + 12); // G2+対位法1oct
  });
});
