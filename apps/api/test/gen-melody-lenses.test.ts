import { describe, it, expect } from "vitest";
import { attachMelodyLenses } from "../src/music/melodyLensesReport";
import { genMelodyCandidates } from "../src/music/generate";

// WP-M3 候補レンズ（design #12-M「候補レンズ」）の生成側添付。思想＝審判でなく並べ替え眼鏡。
// bit一致鉄則：添付は meta.lenses への加算のみ＝候補ノートの content は不変。

type Item = { kind: string; content: unknown; label: string; meta?: { lenses?: { expectation: number; hook: number; singability: number } } };

const melItem = (notes: { pitch: number; start: number; dur: number }[]): Item => ({ kind: "melody", content: { notes }, label: "案1" });

describe("attachMelodyLenses（候補への読み取り専用メタ添付）", () => {
  it("melody 候補に lenses={expectation,hook,singability} を付す（全て0..1）", () => {
    const res = { items: [melItem([
      { pitch: 67, start: 0, dur: 0.5 }, { pitch: 69, start: 0.5, dur: 0.5 },
      { pitch: 67, start: 1, dur: 0.5 }, { pitch: 69, start: 1.5, dur: 0.5 },
      { pitch: 74, start: 2, dur: 0.5 }, { pitch: 72, start: 2.5, dur: 0.5 },
    ])] };
    attachMelodyLenses(res, { key: 0, beatsPerBar: 4, sectionRole: "chorus" });
    const l = res.items[0]!.meta!.lenses!;
    for (const v of [l.expectation, l.hook, l.singability]) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("content（ノート）は不変（bit一致鉄則）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }];
    const res = { items: [melItem(notes)] };
    const before = JSON.stringify(res.items[0]!.content);
    attachMelodyLenses(res, { beatsPerBar: 4 });
    expect(JSON.stringify(res.items[0]!.content)).toBe(before);
  });

  it("非 melody 候補はスキップ（meta 付かない）", () => {
    const res = { items: [{ kind: "skeleton", content: { tones: [] }, label: "骨格" } as Item] };
    attachMelodyLenses(res, { beatsPerBar: 4 });
    expect(res.items[0]!.meta?.lenses).toBeUndefined();
  });

  it("chorus 位置ゲートで hook が verse より高い（同じメロ・レンズが frame 文脈を読む）", () => {
    const notes = [
      { pitch: 67, start: 0, dur: 0.5 }, { pitch: 69, start: 0.5, dur: 0.5 },
      { pitch: 67, start: 1, dur: 0.5 }, { pitch: 69, start: 1.5, dur: 0.5 },
      { pitch: 74, start: 2, dur: 0.5 }, { pitch: 72, start: 2.5, dur: 0.5 },
    ];
    const chorus = { items: [melItem(notes)] };
    const verse = { items: [melItem(notes)] };
    attachMelodyLenses(chorus, { beatsPerBar: 4, sectionRole: "chorus" });
    attachMelodyLenses(verse, { beatsPerBar: 4, sectionRole: "verse" });
    expect(chorus.items[0]!.meta!.lenses!.hook).toBeGreaterThan(verse.items[0]!.meta!.lenses!.hook);
  });

  it("genMelodyCandidates の実出力に添付できる（経路統合スモーク）", () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const chords = [
      { root: 0, quality: "", start: 0, dur: 4 }, { root: 9, quality: "m", start: 4, dur: 4 },
      { root: 5, quality: "", start: 8, dur: 4 }, { root: 7, quality: "", start: 12, dur: 4 },
    ];
    const res = genMelodyCandidates(frame, chords, null, { useV2: true, k: 3, n: 8 }) as unknown as { items: Item[] };
    attachMelodyLenses(res, { key: 0, beatsPerBar: 4, sectionRole: "verse" });
    for (const it of res.items) expect(it.meta!.lenses!.expectation).toBeGreaterThanOrEqual(0);
  });
});
