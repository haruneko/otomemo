import { describe, it, expect } from "vitest";
import { notesToScore, scoreSeconds, chooseOctaveShift, resolveSingBpm } from "../src/sing";

// 隣接音程列（輪郭）を取り出すヘルパ：シフトは全音を等しく動かすので輪郭は不変であるべき。
const intervals = (keys: (number | null)[]) => {
  const ks = keys.filter((k): k is number => k != null);
  return ks.slice(1).map((k, i) => k - ks[i]!);
};

// W-K3 VOICEVOX スコア変換（純関数・TDD）。正典＝docs/research/2026-07-15-kariuta-voicevox-feasibility.md §3。
// FPS=93.75・frames=round(beats*secPerBeat*93.75)。BPM120→secPerBeat=0.5。四分音符(1拍)=round(0.5*0.5*93.75)=約23。

describe("notesToScore（メロ→VOICEVOX Score・純関数）", () => {
  const bpm = 120;

  it("先頭・末尾に休符 note を必ず付ける（無いと破綻し得る）", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1, syllable: "そ" }], bpm);
    expect(s.notes[0]!.key).toBeNull();
    expect(s.notes[0]!.lyric).toBe("");
    expect(s.notes[s.notes.length - 1]!.key).toBeNull();
    expect(s.notes[s.notes.length - 1]!.lyric).toBe("");
  });

  it("key=MIDI音高・lyric=モーラ・frame_length=拍換算（四分音符≒23フレーム）", () => {
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }], bpm);
    const body = s.notes[1]!;
    expect(body.key).toBe(62);
    expect(body.lyric).toBe("ら");
    expect(body.frame_length).toBe(Math.round(0.5 * 93.75)); // =47? secPerBeat=0.5, 1拍=0.5秒*93.75=46.875→47
  });

  it("syllable 欠落は既定モーラ（ラ）でフォールバック", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1 }], bpm);
    expect(s.notes[1]!.lyric).toBe("ラ");
  });

  it("メリスマ ー は lyric:'' で母音継続（key は保持）", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1, syllable: "そ" }, { pitch: 60, start: 1, dur: 1, syllable: "ー" }], bpm);
    const melisma = s.notes[2]!;
    expect(melisma.key).toBe(60);
    expect(melisma.lyric).toBe("");
  });

  it("start の非連続（gap>0）に休符 note を挿入", () => {
    // 0-1拍に音符、2拍から次の音符＝1拍の gap
    const s = notesToScore([{ pitch: 60, start: 0, dur: 1, syllable: "あ" }, { pitch: 62, start: 2, dur: 1, syllable: "い" }], bpm);
    // [先頭休符, あ, gap休符, い, 末尾休符]
    expect(s.notes.map((n) => n.lyric)).toEqual(["", "あ", "", "い", ""]);
    expect(s.notes[2]!.key).toBeNull();
    expect(s.notes[2]!.frame_length).toBe(Math.round(0.5 * 93.75)); // 1拍ぶんの休符
  });

  it("バンド内（52-79）のメロは無変換＝shift 0・clamp 0で音高そのまま", () => {
    const s = notesToScore([{ pitch: 62, start: 0, dur: 1, syllable: "ら" }, { pitch: 79, start: 1, dur: 1, syllable: "ら" }], bpm);
    expect(s.shift).toBe(0);
    expect(s.clamped).toBe(0);
    expect(s.notes[1]!.key).toBe(62);
    expect(s.notes[2]!.key).toBe(79);
  });

  it("dur<=0 の音符は除外（破綻ノート）", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 0, syllable: "x" }, { pitch: 62, start: 0, dur: 1, syllable: "お" }], bpm);
    expect(s.notes.map((n) => n.lyric)).toEqual(["", "お", ""]);
  });

  it("scoreSeconds＝frame 総和/93.75", () => {
    const s = notesToScore([{ pitch: 60, start: 0, dur: 2, syllable: "な" }], bpm);
    const total = s.notes.reduce((a, n) => a + n.frame_length, 0);
    expect(scoreSeconds(s)).toBeCloseTo(total / 93.75, 5);
  });
});

// B2：音ごと折り返し（輪郭破壊）を廃止し、全体オクターブシフトでバンドに寄せる。輪郭＝隣接音程列は不変。
describe("chooseOctaveShift（全体オクターブシフト・純関数）", () => {
  it("バンド内(52-79)に全部収まっていればシフト0", () => {
    expect(chooseOctaveShift([62, 64, 67, 73, 79])).toBe(0);
  });
  it("高すぎるメロは下へシフト＝out最小の中で中央寄せ（タイなら中央）", () => {
    // 84-91 は高すぎ。-12(72-79)も-24(60-67)も全部バンド内＝out同数タイ。
    // タイは中央(65.5)寄せ＝-24(平均63.25)が -12(平均75.25)より中央に近い。
    expect(chooseOctaveShift([84, 86, 88, 91])).toBe(-24);
  });
  it("低すぎるメロは上へシフト＝out最小の中で中央寄せ", () => {
    // 40-47 は低すぎ。+24(64-71)が中央に最も近い（+12=52-59より中央寄り）。
    expect(chooseOctaveShift([40, 43, 45, 47])).toBe(24);
  });
  it("空配列はシフト0", () => {
    expect(chooseOctaveShift([])).toBe(0);
  });
});

describe("notesToScore の音域処理（B2・輪郭保存）", () => {
  it("オーナー実検体（62-73）はバンド内＝shift 0・輪郭そのまま", () => {
    const src = [62, 65, 69, 73, 71, 67, 64, 62];
    const s = notesToScore(src.map((p, i) => ({ pitch: p, start: i, dur: 1, syllable: "ら" })), 92);
    expect(s.shift).toBe(0);
    expect(s.clamped).toBe(0);
    expect(s.notes.map((n) => n.key)).toEqual([null, ...src, null]);
  });

  it("高いメロ（74-85）は全体シフトで輪郭を保存（音ごと折りで輪郭を壊さない）", () => {
    const src = [74, 78, 81, 85, 83, 79, 76, 74]; // 85>79 で旧foldなら85だけ-12＝輪郭破壊
    const s = notesToScore(src.map((p, i) => ({ pitch: p, start: i, dur: 1, syllable: "ら" })), 120);
    expect(s.shift).toBe(-12); // -12で 62-73＝全部バンド内
    expect(s.clamped).toBe(0);
    // 隣接音程列（輪郭）は入力と完全一致
    expect(intervals(s.notes.map((n) => n.key))).toEqual(intervals(src));
  });

  it("バンド幅を超える極端に広いメロは、最良シフト後に外れ音だけクランプし clamped を返す", () => {
    // 40と84は4オクターブ差＝どのシフトでも片方が外れる。黙って変えずclampedで開示。
    const s = notesToScore([{ pitch: 40, start: 0, dur: 1, syllable: "あ" }, { pitch: 84, start: 1, dur: 1, syllable: "い" }], 120);
    expect(s.clamped).toBeGreaterThan(0);
    // クランプされた音もバンド内に収まる
    for (const n of s.notes) if (n.key != null) expect(n.key).toBeGreaterThanOrEqual(52), expect(n.key).toBeLessThanOrEqual(79);
  });
});

describe("resolveSingBpm（B1・tempo は neta のDB列が正準）", () => {
  it("n.tempo（DB列）を第一候補にする", () => {
    expect(resolveSingBpm({ tempo: 92, content: { tempo: 140, bpm: 100 } })).toBe(92);
  });
  it("n.tempo が null なら content.tempo → content.bpm の順にフォールバック", () => {
    expect(resolveSingBpm({ tempo: null, content: { tempo: 140 } })).toBe(140);
    expect(resolveSingBpm({ tempo: null, content: { bpm: 100 } })).toBe(100);
  });
  it("どこにも無ければ 120", () => {
    expect(resolveSingBpm({ tempo: null, content: {} })).toBe(120);
    expect(resolveSingBpm({ content: undefined })).toBe(120);
  });
});
