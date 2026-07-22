import { describe, it, expect } from "vitest";
import { applyFeel, applyFeelEnsemble, feelOf, humanizePartOf, notesToMidi, type Note } from "../src/music";

// #29 P1-2：feel の部位別適用（applyFeelEnsemble）＝再生・MIDI 書き出しの単一入口。
// 契約＝feel 無し/全0 は bit 一致・swing のみは part 分割に無関係（単一 applyFeel 一致）・humanize>0 のみ意図的変化。

// メロ/コード/ベース/ドラム（kick/snare/hihat）を混ぜた代表的なアンサンブル notes。
const ensemble = (): Note[] => {
  const out: Note[] = [];
  for (let i = 0; i < 8; i++) out.push({ pitch: 60 + i, start: i * 0.5, dur: 0.5, part: "melody" });
  for (let i = 0; i < 4; i++) out.push({ pitch: 48, start: i, dur: 1, part: "chord" });
  for (let i = 0; i < 8; i++) out.push({ pitch: 36, start: i * 0.5, dur: 0.5, part: "bass" });
  // ドラム：kick(36)/snare(38)/hihat(42) をインターリーブ。
  for (let i = 0; i < 16; i++) {
    const pitch = i % 4 === 0 ? 36 : i % 2 === 0 ? 42 : i % 4 === 1 ? 38 : 42;
    out.push({ pitch, start: i * 0.25, dur: 0.25, drum: true });
  }
  return out;
};

describe("#29 P1-2 applyFeelEnsemble（feel 部位別配線）", () => {
  it("feel 無し＝同一参照（再生入力 bit 一致）", () => {
    const src = ensemble();
    expect(applyFeelEnsemble(src, undefined, { tempo: 120 })).toBe(src);
    expect(applyFeelEnsemble(src, null, { tempo: 120 })).toBe(src);
  });

  it("全0 feel＝値一致（入力を変えない）", () => {
    const src = ensemble();
    expect(applyFeelEnsemble(src, { swing: 0, humanize: 0 }, { tempo: 120 })).toEqual(src);
  });

  it("MIDI バイト：feel 無し と 全0 feel と（従来経路）が byte 一致", () => {
    const src = ensemble();
    const none = notesToMidi(src, 120, "4/4", undefined, undefined);
    const zero = notesToMidi(src, 120, "4/4", undefined, { swing: 0, humanize: 0 });
    expect(Array.from(zero)).toEqual(Array.from(none));
  });

  it("swing のみ＝part 分割に無関係（単一 applyFeel と deepEqual）", () => {
    const src = ensemble();
    for (const feel of [{ swing: 0.6 }, { swing: 1, swingUnit: "sixteenth" as const }]) {
      expect(applyFeelEnsemble(src, feel, { tempo: 120 })).toEqual(applyFeel(src, feel, { tempo: 120 }));
    }
  });

  it("humanize>0＝決定的（同 seed 同出力）で feel 無しと変わる", () => {
    const src = ensemble();
    const a = applyFeelEnsemble(src, { humanize: 0.35, seed: 4 }, { tempo: 120 });
    const b = applyFeelEnsemble(src, { humanize: 0.35, seed: 4 }, { tempo: 120 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(src);
  });

  it("humanizePartOf：ドラム midi／MixPart の網羅マップ", () => {
    // ドラムはレーン midi で分ける。
    expect(humanizePartOf({ pitch: 36, start: 0, dur: 1, drum: true })).toBe("kick");
    expect(humanizePartOf({ pitch: 35, start: 0, dur: 1, drum: true })).toBe("kick");
    expect(humanizePartOf({ pitch: 38, start: 0, dur: 1, drum: true })).toBe("snare");
    expect(humanizePartOf({ pitch: 50, start: 0, dur: 1, drum: true })).toBe("snare");
    expect(humanizePartOf({ pitch: 42, start: 0, dur: 1, drum: true })).toBe("hihat");
    expect(humanizePartOf({ pitch: 51, start: 0, dur: 1, drum: true })).toBe("hihat");
    expect(humanizePartOf({ pitch: 49, start: 0, dur: 1, drum: true })).toBe("kick"); // Crash＝アンカー
    expect(humanizePartOf({ pitch: 39, start: 0, dur: 1, drum: true })).toBe("snare"); // Clap
    expect(humanizePartOf({ pitch: 60, start: 0, dur: 1, drum: true })).toBeUndefined(); // 未マップ percussion→default
    // MixPart 由来。
    expect(humanizePartOf({ pitch: 60, start: 0, dur: 1, part: "melody" })).toBe("melody");
    expect(humanizePartOf({ pitch: 60, start: 0, dur: 1, part: "counter" })).toBe("melody");
    expect(humanizePartOf({ pitch: 60, start: 0, dur: 1, part: "chord" })).toBe("chords");
    expect(humanizePartOf({ pitch: 40, start: 0, dur: 1, part: "bass" })).toBe("bass");
    // part 無し（単体再生）＝メロ扱い（防御既定）。
    expect(humanizePartOf({ pitch: 60, start: 0, dur: 1 })).toBe("melody");
  });
});

// S4（2026-07-22）：genBass / genChordPattern が content.feel を載せる＝web 消費経路が生きている担保。
// feelOf は kind 非依存で content.feel を読む（bass/chord_pattern content 形でも同じ）＝結線追加なしで消費される。
describe("S4 feel 消費経路（bass/chord_pattern content.feel を web が読む）", () => {
  it("feelOf：bass content 形（{notes,feel}）から feel を読む", () => {
    const bassContent = { notes: [{ pitch: 36, start: 0, dur: 1 }], feel: { swing: 0.6 } };
    expect(feelOf(bassContent)).toEqual({ swing: 0.6 });
  });
  it("feelOf：chord_pattern content 形（{mode,voicing,steps,hits,feel}）から feel を読む", () => {
    const cpContent = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 16, hits: [{ step: 0, dur: 4 }], feel: { swing: 0.5, humanize: 0.3, seed: 5 } };
    expect(feelOf(cpContent)).toEqual({ swing: 0.5, humanize: 0.3, seed: 5 });
  });
  it("bass/chord notes に共有 feel を掛けると part 別プロファイルで別々に humanize される（アンサンブル共有）", () => {
    const notes: Note[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ pitch: 36, start: i * 0.5, dur: 0.5, part: "bass" as const })),
      ...Array.from({ length: 8 }, (_, i) => ({ pitch: 48, start: i * 0.5, dur: 0.5, part: "chord" as const })),
    ];
    const felt = applyFeelEnsemble(notes, { humanize: 0.5, seed: 5 }, { tempo: 120 });
    // 同数・多重集合保存（並べ替えのみ）＝落ちない・増えない。
    expect(felt.length).toBe(notes.length);
    // humanize>0 で bass part と chord part が別 salt/プロファイル＝入力から動く（＝素通しでない）。
    expect(felt).not.toEqual(notes);
  });
});
