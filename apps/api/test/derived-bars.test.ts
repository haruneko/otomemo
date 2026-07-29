// 尺（bars）が空のまま作られるネタに、音符から尺を入れる（design #31-0 の宿題）。
// 歌詞の句は「そのメロの尺」を範囲の既定にするので、尺が無いと音符の広がりに頼ることになり、
// 音符が0個のメロ（詞だけ先に書く場合）で範囲が決まらない。
//
// 安全性の要：bars は曲の中でのメロの尺には使われていない（childDur/contentDur は音符だけを見る）
// ＝配置も出音も動かない。ここでは「明示を上書きしない」「音符の無いものに触らない」を縛る。
import { describe, it, expect } from "vitest";
import { withDerivedBars } from "../src/core";

const mel = (over: Record<string, unknown> = {}) => ({
  kind: "melody",
  content: { notes: [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 4, dur: 1 }] }, // 終端5拍
  ...over,
});

describe("withDerivedBars（尺が空なら音符から入れる）", () => {
  it("4/4：終端5拍→2小節（小節単位へ切り上げ）", () => {
    expect(withDerivedBars(mel() as never).bars).toBe(2);
  });

  it("ちょうど小節線で終わるなら切り上げない（4拍→1小節）", () => {
    const n = { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 4 }] } };
    expect(withDerivedBars(n as never).bars).toBe(1);
  });

  it("6/8（1小節=3拍）：終端5拍→2小節", () => {
    expect(withDerivedBars(mel({ meter: "6/8" }) as never).bars).toBe(2);
  });

  it("呼び側が尺を言っていれば上書きしない", () => {
    expect(withDerivedBars(mel({ bars: 8 }) as never).bars).toBe(8);
  });

  it("音符が無ければ触らない（コード進行・テキスト・空のメロ）", () => {
    expect(withDerivedBars({ kind: "chord_progression", content: { chords: [] } } as never).bars).toBeUndefined();
    expect(withDerivedBars({ kind: "lyric", text: "詞" } as never).bars).toBeUndefined();
    expect(withDerivedBars({ kind: "melody", content: { notes: [] } } as never).bars).toBeUndefined();
  });

  it("長さ0の音符しか無ければ触らない（0小節を作らない）", () => {
    const n = { kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 0 }] } };
    expect(withDerivedBars(n as never).bars).toBeUndefined();
  });

  it("弱起（負の start）でも1小節以上になる", () => {
    const n = { kind: "melody", content: { notes: [{ pitch: 60, start: -1, dur: 1 }] } };
    expect(withDerivedBars(n as never).bars).toBe(1);
  });

  it("入力を壊さない（純関数）", () => {
    const src = mel() as never;
    const copy = JSON.parse(JSON.stringify(src));
    withDerivedBars(src);
    expect(src).toEqual(copy);
  });
});
