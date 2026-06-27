import { describe, it, expect } from "vitest";
import { parseAbcTune } from "../src/music/abc";

// S6-b コーパス取り込み：ABC記譜→notes（単旋律 Irish の実用サブセット）。
// 契約：M:/L:/K: を読み、音名(大小+,')・臨時(^_=)・長さ(数字・/分母)・休符 z を notes 化。
// オクターブ写像 C(大)=MIDI60。start/dur は拍(四分=1)。エッセンスは移調/オクターブ不変なので絶対octは無害。

describe("parseAbcTune（ABC→notes 単旋律）", () => {
  it("K:D の調号(F#,C#)・音名・長さ・オクターブ・休符を正しく notes 化", () => {
    const abc = ["X:1", "T:Test", "M:4/4", "L:1/8", "K:D", "DE F2 A,2 z2|"].join("\n");
    const t = parseAbcTune(abc);
    expect(t.title).toBe("Test");
    expect(t.meter).toBe("4/4");
    expect(t.notes).toEqual([
      { pitch: 62, start: 0, dur: 0.5 }, // D4
      { pitch: 64, start: 0.5, dur: 0.5 }, // E4
      { pitch: 66, start: 1, dur: 1 }, // F#4（K:D の調号）、長さ2=四分=1拍
      { pitch: 57, start: 2, dur: 1 }, // A,=A3（コンマで1oct下）
      // z2 は休符＝音は出さず時間だけ進む（次の音があれば start=4 から）
    ]);
  });

  it("臨時記号は小節内で持続し、小節線 | でリセット", () => {
    // K:C（調号なし）。^F でF#、同小節の次のFもF#。小節線後のFはナチュラルに戻る。
    const abc = ["M:4/4", "L:1/4", "K:C", "^F F | F z z2|"].join("\n");
    const t = parseAbcTune(abc);
    expect(t.notes.map((n) => n.pitch)).toEqual([66, 66, 65]); // F#,F#,(小節跨ぎで)F
  });

  it("臨時の明示は調号を上書き（=ナチュラル）", () => {
    const abc = ["M:4/4", "L:1/4", "K:D", "F =F z2|"].join("\n");
    const t = parseAbcTune(abc);
    expect(t.notes.map((n) => n.pitch)).toEqual([66, 65]); // 調号F#→ =F でナチュラルF
  });

  it("モード調号（A dorian=F#のみ）", () => {
    const abc = ["M:4/4", "L:1/4", "K:Ador", "F C z2|"].join("\n");
    const t = parseAbcTune(abc);
    expect(t.notes.map((n) => n.pitch)).toEqual([66, 60]); // F#（A dorian=G majの調号=F#）, C(ナチュラル)
  });

  it("空/ヘッダのみは notes 空", () => {
    expect(parseAbcTune("X:1\nT:Empty\nK:G").notes).toEqual([]);
  });
});
