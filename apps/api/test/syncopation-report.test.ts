import { describe, it, expect } from "vitest";
import { attachSyncScore } from "../src/music/syncopationReport";

// WP-D2 シンコペ「ノリメーター」の生成側添付。思想＝審判でなく並べ替え眼鏡（帯適合 fit で並べる・弾かない）。
// bit一致鉄則：添付は meta.sync への加算のみ＝候補 content は不変。

type SyncMeta = { perBar: number; perNote: number; norm: number; zone: string; band: [number, number]; fit: number; inBand: boolean };
type Item = { kind: string; content: unknown; label: string; meta?: { sync?: SyncMeta } };

describe("attachSyncScore（候補への読み取り専用ノリメーター添付）", () => {
  it("melody 候補に sync={perBar,perNote,norm,zone,band,fit,inBand} を付す", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 0.5 }, { pitch: 62, start: 0.5, dur: 0.5 },
      { pitch: 64, start: 1.5, dur: 0.5 }, { pitch: 65, start: 3, dur: 1 }, // & of 2 を拍3へ保持＝シンコペ
    ];
    const res = { items: [{ kind: "melody", content: { notes }, label: "案1" } as Item] };
    attachSyncScore(res, { beatsPerBar: 4, role: "chorus", tempo: 110 });
    const s = res.items[0]!.meta!.sync!;
    expect(typeof s.perBar).toBe("number");
    expect(s.norm).toBeGreaterThanOrEqual(0);
    expect(s.norm).toBeLessThanOrEqual(1);
    expect(["素直", "跳ねる", "攻める"]).toContain(s.zone);
    expect(s.band.length).toBe(2);
    expect(s.fit).toBeGreaterThanOrEqual(0);
    expect(s.fit).toBeLessThanOrEqual(1);
  });

  it("drums 候補（rhythm.lanes の hits）にも付く", () => {
    const res = { items: [{ kind: "rhythm", content: { rhythm: {
      steps: 16, bars: 1, beatsPerStep: 0.25,
      lanes: [{ name: "Kick", midi: 36, hits: [0, 6, 10] }, { name: "Snare", midi: 38, hits: [4, 12] }],
    } }, label: "ドラム" } as Item] };
    attachSyncScore(res, { beatsPerBar: 4, tempo: 120 });
    expect(res.items[0]!.meta!.sync).toBeDefined();
    expect(typeof res.items[0]!.meta!.sync!.perBar).toBe("number");
  });

  it("content は不変（bit一致鉄則）", () => {
    const notes = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 }, { pitch: 64, start: 2, dur: 1 }];
    const res = { items: [{ kind: "bass", content: { notes }, label: "ベース" } as Item] };
    const before = JSON.stringify(res.items[0]!.content);
    attachSyncScore(res, { beatsPerBar: 4 });
    expect(JSON.stringify(res.items[0]!.content)).toBe(before);
  });

  it("対象外 kind はスキップ（meta 付かない）", () => {
    const res = { items: [{ kind: "skeleton", content: { tones: [] }, label: "骨格" } as Item] };
    attachSyncScore(res, { beatsPerBar: 4 });
    expect(res.items[0]!.meta?.sync).toBeUndefined();
  });
});
