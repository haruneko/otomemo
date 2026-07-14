import { describe, it, expect } from "vitest";
import { normalizeFrame, genMelody, type Frame } from "../src/music/generate";
import { attachMelodyLenses } from "../src/music/melodyLensesReport";
import { resolveVoiceProfile } from "@cm/music-core";

// WP-M4 voice_profile＋ボカロモード（design #16 frame）。
// 受け入れ：未指定=bit一致・profile指定でレンズスコアが変わる・vocaloidでC6超ノートが難度ペナ0・音域窓がprofileへ追従。

const CHORDS = [
  { root: 0, quality: "", start: 0, dur: 4 }, { root: 9, quality: "m", start: 4, dur: 4 },
  { root: 5, quality: "", start: 8, dur: 4 }, { root: 7, quality: "", start: 12, dur: 4 },
];
const BASE: Frame = { bars: 4, meter: "4/4", key: 0 };
const notesOf = (r: ReturnType<typeof genMelody>) => (r.items[0]!.content as { notes: { pitch: number }[] }).notes;

describe("normalizeFrame × voice_profile（未指定/不正は落とす＝bit一致）", () => {
  it("有効プリセット名は保持", () => {
    expect(normalizeFrame({ voice_profile: "male_pop" } as Frame).voice_profile).toBe("male_pop");
    expect(normalizeFrame({ voice_profile: "ボカロ" } as Frame).voice_profile).toBe("ボカロ");
  });
  it("未指定/未知プリセットは undefined（＝従来 frame と同一）", () => {
    expect(normalizeFrame({}).voice_profile).toBeUndefined();
    expect(normalizeFrame({ voice_profile: "存在しない" } as Frame).voice_profile).toBeUndefined();
  });
  it("カスタム（base+上書き）は保持", () => {
    const f = normalizeFrame({ voice_profile: { base: "male_pop", tessHigh: 72 } } as Frame);
    expect(f.voice_profile).toBeTruthy();
  });
});

describe("genMelody × voice_profile（未指定=bit一致・指定=音域窓が追従）", () => {
  it("voice_profile 未指定は従来生成と bit 一致（不正 spec も落として同一）", () => {
    const plain = genMelody(BASE, CHORDS, 7, { useV2: true });
    const invalid = genMelody({ ...BASE, voice_profile: "存在しない声種" } as Frame, CHORDS, 7, { useV2: true });
    expect(JSON.stringify(invalid.items[0]!.content)).toBe(JSON.stringify(plain.items[0]!.content));
  });
  it("男性プロファイルは女性/ボカロより低い音域窓（最高音が下がる）", () => {
    const male = notesOf(genMelody({ ...BASE, voice_profile: "male_pop" } as Frame, CHORDS, 7, { useV2: true }));
    const voca = notesOf(genMelody({ ...BASE, voice_profile: "vocaloid" } as Frame, CHORDS, 7, { useV2: true }));
    const maxMale = Math.max(...male.map((n) => n.pitch));
    const maxVoca = Math.max(...voca.map((n) => n.pitch));
    expect(maxMale).toBeLessThan(maxVoca); // 音域窓が profile の tessitura へ追従
  });
  it("ボカロプロファイルは未指定と異なる出力（窓が上へ変わる）", () => {
    const plain = genMelody(BASE, CHORDS, 7, { useV2: true });
    const voca = genMelody({ ...BASE, voice_profile: "vocaloid" } as Frame, CHORDS, 7, { useV2: true });
    expect(JSON.stringify(voca.items[0]!.content)).not.toBe(JSON.stringify(plain.items[0]!.content));
  });
});

describe("attachMelodyLenses × frame.voice_profile（レンズスコアが profile 依存）", () => {
  type Item = { kind: string; content: unknown; label: string; meta?: { lenses?: { singability: number } } };
  // C6=84 を含む高音大跳躍メロ（人間には難／ボカロには易）。
  const highMel = [
    { pitch: 72, start: 0, dur: 0.5 }, { pitch: 84, start: 0.5, dur: 0.5 },
    { pitch: 72, start: 1, dur: 0.5 }, { pitch: 83, start: 1.5, dur: 0.5 },
  ];
  const withProfile = (vp: string) => {
    const res = { items: [{ kind: "melody", content: { notes: highMel }, label: "案1" } as Item] };
    attachMelodyLenses(res, { key: 0, beatsPerBar: 4, sectionRole: "chorus", profile: resolveVoiceProfile(vp) });
    return res.items[0]!.meta!.lenses!.singability;
  };
  it("女性 profile とボカロ profile で singability が変わる（ボカロの方が高い）", () => {
    const female = withProfile("female_pop");
    const voca = withProfile("vocaloid");
    expect(voca).not.toBe(female);
    expect(voca).toBeGreaterThan(female);
  });
});
