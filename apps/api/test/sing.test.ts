import { describe, it, expect } from "vitest";
import { notesToScore, scoreSeconds } from "../src/sing";

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

  it("音域外はオクターブ折り返しで [48,72] に収める", () => {
    const s = notesToScore([{ pitch: 84, start: 0, dur: 1, syllable: "た" }, { pitch: 36, start: 1, dur: 1, syllable: "か" }], bpm);
    expect(s.notes[1]!.key).toBe(72); // 84→72（C6→C5）
    expect(s.notes[2]!.key).toBe(48); // 36→48（C2→C3）
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
