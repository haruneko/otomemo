import { describe, it, expect } from "vitest";
// 連想エンジン 土台v：メロ×コード当てはまり（analyzeFit）＋外し音補正（fitToChords）＝worker移植。
import { analyzeFit, fitToChords, detectKeyFromNotes } from "../src/music";

const C_CHORD = [{ root: 0, quality: "", start: 0, dur: 4 }]; // C(0,4,7) が [0,4) 拍

describe("detectKeyFromNotes", () => {
  it("Cメジャースケールの旋律 → C major", () => {
    const notes = [60, 62, 64, 65, 67, 69, 71].map((pitch, i) => ({ pitch, start: i, dur: 1 }));
    expect(detectKeyFromNotes(notes)).toEqual({ key: 0, mode: "major" });
  });
});

describe("analyzeFit（当てはまり判定）", () => {
  it("M8: key指定時はmodeを取り違えない＝A/E寄りのCメジャー旋律をCマイナー採点しない（監査ケース）", () => {
    // A/E を厚く使う C メジャー旋律：ヒストグラムでは相対 A minor が上位に来やすい。
    // 旧: keyPc=0 は尊重するが mode は検出値(minor)のまま→ scalePcs(0,"minor") で E/A/B がスケール外扱い。
    const mel = [69, 64, 69, 71, 72, 76, 69, 64, 67, 69].map((pitch, i) => ({ pitch, start: i * 0.5, dur: 0.5 }));
    const chords = [{ root: 0, quality: "", start: 0, dur: 8 }];
    const r = analyzeFit(mel, chords, 0);
    expect(r.mode).toBe("major");
    expect(r.scaleOutsideRate).toBe(0); // 全音 C メジャー内
    // mode 明示も通る
    const r2 = analyzeFit(mel, chords, 0, "major");
    expect(r2.mode).toBe("major");
  });

  it("全部コードトーンなら inChordRate=1・高スコア", () => {
    const mel = [60, 64, 67].map((pitch, i) => ({ pitch, start: i, dur: 1 })); // C E G
    const r = analyzeFit(mel, C_CHORD, 0);
    expect(r.inChordRate).toBe(1);
    expect(r.score).toBeGreaterThan(0.95);
    expect(r.issues.length).toBe(0);
  });
  it("経過音は正当な非和声音＝issue無し・なお高スコア", () => {
    const mel = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }, { pitch: 64, start: 2, dur: 1 }]; // C-D-E
    const r = analyzeFit(mel, C_CHORD, 0);
    expect(r.nonChordTones.some((n) => n.type === "passing")).toBe(true);
    expect(r.issues.some((i) => i.type === "other")).toBe(false);
    expect(r.score).toBeGreaterThan(0.8);
  });
  it("跳躍がらみの外し音(other)は issue・スコア低下", () => {
    const mel = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 66, start: 1, dur: 1 }, { pitch: 60, start: 2, dur: 1 }]; // C-F#-C
    const r = analyzeFit(mel, C_CHORD, 0);
    expect(r.nonChordTones.some((n) => n.type === "other")).toBe(true);
    expect(r.issues.some((i) => i.type === "other")).toBe(true);
    expect(r.score).toBeLessThan(0.8);
  });
});

describe("fitToChords（外し音だけ直す）", () => {
  it("other の F# をコードトーン(G=67)へスナップ・当てはまり改善", () => {
    const mel = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 66, start: 1, dur: 1 }, { pitch: 60, start: 2, dur: 1 }];
    const r = fitToChords(mel, C_CHORD, 0);
    expect(r.notes[1].pitch).toBe(67); // F#(66)→G(67)
    expect(r.after.score).toBeGreaterThan(r.before);
  });
  it("正当な経過音・コードトーンは触らない", () => {
    const mel = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }, { pitch: 64, start: 2, dur: 1 }];
    const r = fitToChords(mel, C_CHORD, 0);
    expect(r.notes.map((n) => n.pitch)).toEqual([60, 62, 64]); // 経過音Dも不変
  });
});
