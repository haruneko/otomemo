// audio.ts の純ロジック（副作用なし）を検証。Tone.js/smplr/soundfont2 は再生時のみ動的import
// されるため、これらの純関数を import しても実音源は読まれない（負債 D1: 無テスト解消）。
// 再生そのもの(Tone/Transport)はモックせず、純関数だけを対象にする。
import { describe, it, expect } from "vitest";
import {
  drumKey,
  velToMidi,
  drumDetune,
  drumNameFor,
  resolveSF2Ctor,
  presetBank,
  presetNum,
  presetName,
  lensesOf,
  lensGateTargets,
  melodicMapKey,
} from "../src/audio";

describe("drumKey — (キット, GM番号) の合成キー（ビットシフト）", () => {
  it("kit=0 は pitch をそのまま返す", () => {
    expect(drumKey(0, 0)).toBe(0);
    expect(drumKey(0, 36)).toBe(36);
    expect(drumKey(0, 255)).toBe(255);
  });
  it("kit を 8bit 左シフトして pitch を下位に載せる", () => {
    expect(drumKey(1, 0)).toBe(256); // 1<<8
    expect(drumKey(1, 36)).toBe(256 + 36);
    expect(drumKey(2, 42)).toBe(512 + 42);
  });
  it("復元可能: key>>8 で kit、key&0xff で pitch（prepareDrumKits の前提）", () => {
    const k = drumKey(3, 46);
    expect(k >> 8).toBe(3);
    expect(k & 0xff).toBe(46);
  });
});

describe("melodicMapKey — 音色(program)込みルーティングキー（コード楽器×2 のバグ修正・2026-07-13）", () => {
  it("同じ part(chord) でも program 違いは別キー＝別 sampler へ（2つ目の音色が1つ目に潰れない）", () => {
    expect(melodicMapKey(undefined, "chord", 0)).not.toBe(melodicMapKey(undefined, "chord", 46));
  });
  it("同 part・同 program は同キー（安定ルーティング・毎音同じ sampler）", () => {
    expect(melodicMapKey(undefined, "chord", 46)).toBe(melodicMapKey(undefined, "chord", 46));
  });
  it("lens 違いは別キー（レンズ別ゲート）", () => {
    expect(melodicMapKey("A", "chord", 0)).not.toBe(melodicMapKey(undefined, "chord", 0));
  });
});

describe("velToMidi — velocity(0..1) → MIDI(0..127)", () => {
  it("端点と中間を四捨五入して返す", () => {
    expect(velToMidi(0)).toBe(0);
    expect(velToMidi(1)).toBe(127);
    expect(velToMidi(0.5)).toBe(64); // 63.5 → 64（四捨五入）
  });
  it("Math.round の丸め（0.5 は上へ）", () => {
    expect(velToMidi(0.1)).toBe(13); // 12.7 → 13
    expect(velToMidi(0.8)).toBe(102); // 101.6 → 102
  });
});

describe("drumDetune — cents 補正の純計算", () => {
  // 式（コメント準拠）: detune = (originalPitch - root)*100 + coarseTune*100 + fineTune
  it("originalPitch==root かつ tune 0 なら 0", () => {
    expect(drumDetune(60, 60)).toBe(0);
  });
  it("originalPitch と root の差を cents(=半音*100) にする", () => {
    expect(drumDetune(60, 48)).toBe(1200); // 1オクターブ上へ補正
    expect(drumDetune(48, 60)).toBe(-1200);
  });
  it("coarseTune は 100cents/半音、fineTune はそのまま cents で加算", () => {
    expect(drumDetune(60, 60, 2, 0)).toBe(200);
    expect(drumDetune(60, 60, 0, 30)).toBe(30);
    expect(drumDetune(62, 60, 1, 25)).toBe(200 + 100 + 25); // (62-60)*100 + 1*100 + 25
  });
  it("coarse/fine 省略時は 0 扱い（既定引数）", () => {
    expect(drumDetune(64, 60)).toBe(400);
  });
});

describe("drumNameFor — GM打楽器番号 → SF2楽器名（sfParsed 未ロード=純 regex 経路）", () => {
  // モジュールの sfParsed は再生前は null。kitPreset=0(既定) と sfParsed=null では
  // 権威マップ経路が両方スキップされ、純粋な pitch別 正規表現マッチのみが走る。
  const names = [
    "Standard Kick 1",
    "Standard Kick 3",
    "Standard Snare 1",
    "Standard Snare 2",
    "Electric Snare",
    "Hand Clap",
    "Side Stick",
    "Closed Hi-Hat",
    "Open Hi-Hat",
    "Standard Tom 1",
    "Crash Cymbal 1",
    "Splash Cymbal",
    "Ride Cymbal 1",
    "Ride Bell",
    "Cowbell",
    "Tambourine",
    "China Cymbal",
    "Reverse Cymbal",
  ];

  it("kick(<=36): Standard Kick 優先", () => {
    expect(drumNameFor(35, names)).toBe("Standard Kick 1");
    expect(drumNameFor(36, names)).toBe("Standard Kick 1");
  });
  it("snare 38 は Standard Snare 1、40 は Standard Snare 2 を先に狙う", () => {
    expect(drumNameFor(38, names)).toBe("Standard Snare 1");
    expect(drumNameFor(40, names)).toBe("Standard Snare 2");
  });
  it("37=rim/side stick、39=hand clap", () => {
    expect(drumNameFor(37, names)).toBe("Side Stick");
    expect(drumNameFor(39, names)).toBe("Hand Clap");
  });
  it("hi-hat: 42/44=closed, 46=open 優先", () => {
    expect(drumNameFor(42, names)).toBe("Closed Hi-Hat");
    expect(drumNameFor(44, names)).toBe("Closed Hi-Hat");
    expect(drumNameFor(46, names)).toBe("Open Hi-Hat"); // open.*hi-hat が先
  });
  it("tom(41/43/45/47/48/50)", () => {
    expect(drumNameFor(41, names)).toBe("Standard Tom 1");
    expect(drumNameFor(50, names)).toBe("Standard Tom 1");
  });
  it("crash 49/57、splash 55、china/reverse 52、ride 51/59・bell 53", () => {
    expect(drumNameFor(49, names)).toBe("Crash Cymbal 1");
    expect(drumNameFor(57, names)).toBe("Crash Cymbal 1");
    expect(drumNameFor(55, names)).toBe("Splash Cymbal");
    expect(drumNameFor(52, names)).toBe("China Cymbal"); // /china|reverse/ が先にマッチ
    expect(drumNameFor(51, names)).toBe("Ride Cymbal 1");
    expect(drumNameFor(59, names)).toBe("Ride Cymbal 1");
    expect(drumNameFor(53, names)).toBe("Ride Bell");
  });
  it("cowbell 56、tambourine 54", () => {
    expect(drumNameFor(56, names)).toBe("Cowbell");
    expect(drumNameFor(54, names)).toBe("Tambourine");
  });
  it("該当楽器が names に無ければ null（後退ゼロ→簡易キットへ）", () => {
    expect(drumNameFor(36, [])).toBeNull();
    expect(drumNameFor(56, ["Standard Kick 1"])).toBeNull(); // cowbell が無い
  });
  it("既定外 pitch は perc/drum の総称に落ちる", () => {
    expect(drumNameFor(60, ["Latin Perc"])).toBe("Latin Perc");
    expect(drumNameFor(60, ["Some Drum"])).toBe("Some Drum");
    expect(drumNameFor(60, ["Piano"])).toBeNull();
  });
  it("snare フォールバック: 40 で専用名が無ければ generic snare へ", () => {
    expect(drumNameFor(40, ["Snare"])).toBe("Snare"); // electric/standard 無し→/snare/
  });
});

describe("resolveSF2Ctor — soundfont2 の UMD/ESM 差を吸収", () => {
  class Ctor {}
  it("named export SoundFont2 を最優先", () => {
    expect(resolveSF2Ctor({ SoundFont2: Ctor })).toBe(Ctor);
  });
  it("default.SoundFont2 → default → mod の順で辿る", () => {
    expect(resolveSF2Ctor({ default: { SoundFont2: Ctor } })).toBe(Ctor);
    expect(resolveSF2Ctor({ default: Ctor })).toBe(Ctor);
    expect(resolveSF2Ctor(Ctor)).toBe(Ctor);
  });
});

describe("presetBank/presetNum/presetName — header 直下/直属 両対応アクセサ", () => {
  it("header 直下を読む", () => {
    const p = { header: { bank: 128, preset: 3, name: "Standard" } };
    expect(presetBank(p)).toBe(128);
    expect(presetNum(p)).toBe(3);
    expect(presetName(p)).toBe("Standard");
  });
  it("header 無しは直属プロパティにフォールバック", () => {
    const p = { bank: 0, preset: 40, name: "Violin" };
    expect(presetBank(p)).toBe(0);
    expect(presetNum(p)).toBe(40);
    expect(presetName(p)).toBe("Violin");
  });
  it("bank/preset 未定義は 0、name 未定義は undefined", () => {
    expect(presetBank({})).toBe(0);
    expect(presetNum({})).toBe(0);
    expect(presetName({})).toBeUndefined();
  });
});

// #20 S6骨格の机: レンズバスの純状態ロジック（実ノード配線は jsdom 不可＝純関数のみ検証）。
describe("lensesOf — notes 内の distinct な lens 印（定義順・undefined 除外）", () => {
  it("lens 無しの notes は空配列（＝レンズ層を作らない＝従来経路）", () => {
    expect(lensesOf([{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }])).toEqual([]);
  });
  it("distinct な lens を初出順で返す（重複は畳む）", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1, lens: "fold" },
      { pitch: 62, start: 1, dur: 1, lens: "real" },
      { pitch: 64, start: 2, dur: 1, lens: "fold" }, // 重複
    ];
    expect(lensesOf(notes)).toEqual(["fold", "real"]);
  });
  it("lens 付き/無し混在は付きのみ拾う", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1 },
      { pitch: 62, start: 1, dur: 1, lens: "real" },
    ];
    expect(lensesOf(notes)).toEqual(["real"]);
  });
});

describe("lensGateTargets — レンズゲートの目標ゲイン", () => {
  it("activeLens 指定＝それだけ1・他0", () => {
    expect(lensGateTargets(["fold", "real"], "real")).toEqual({ fold: 0, real: 1 });
    expect(lensGateTargets(["fold", "real"], "fold")).toEqual({ fold: 1, real: 0 });
  });
  it("activeLens 未指定＝全レンズ開（全1）", () => {
    expect(lensGateTargets(["fold", "real"])).toEqual({ fold: 1, real: 1 });
  });
  it("activeLens が present に無い＝全0（そのレンズは存在しないので全部閉じる）", () => {
    expect(lensGateTargets(["fold", "real"], "solo")).toEqual({ fold: 0, real: 0 });
  });
  it("present が空＝空オブジェクト", () => {
    expect(lensGateTargets([], "fold")).toEqual({});
  });
});
