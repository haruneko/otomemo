// 2026-09-16 オーナー耳裁定（案A＋B）：試聴で選ばれた試作と実装の音高列が一致することを固定データで確認。
import { describe, it, expect } from "vitest";
import { resolveChordPattern } from "../src/music";
import golden from "./fixtures/voicing-ab-golden.json";

describe("鍵盤ボイシング 案A＋B（2026-09-16 耳裁定）", () => {
  for (const p of (golden as any).patterns) {
    it(`${p.id}：試作（listen6 AB）と音高・時刻・長さが一致`, () => {
      const notes = resolveChordPattern(p.content, (golden as any).chords, 0, 96, p.program);
      expect(notes.map((n) => [n.pitch, n.start, n.dur])).toEqual(p.ab);
    });
  }
  it("Fmaj7（左手ルートあり）＝右手 E4 A4 C5／Em7＝D4 G4 B4／G 三和音は3音のまま", () => {
    const content: any = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 0, dur: 16 }], lh: { mode: "root" } };
    const rh = (root: number, quality: string) => resolveChordPattern(content, [{ root, quality, start: 0, dur: 4 } as any], 0).filter((n) => n.pitch > 48).map((n) => n.pitch).sort((a, b) => a - b);
    expect(rh(5, "maj7")).toEqual([64, 69, 72]);
    expect(rh(4, "m7")).toEqual([62, 67, 71]);
    expect(rh(7, "")).toEqual([62, 67, 71]);
  });
  it("左手なし＝案Aのみ（Fmaj7＝E4 F4 A4 C5）", () => {
    const content: any = { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72 }, steps: 16, hits: [{ step: 0, dur: 16 }] };
    expect(resolveChordPattern(content, [{ root: 5, quality: "maj7", start: 0, dur: 4 } as any], 0).map((n) => n.pitch).sort((a, b) => a - b)).toEqual([64, 65, 69, 72]);
  });
});
