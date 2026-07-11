import { describe, it, expect } from "vitest";
import {
  resolveLowerVoice,
  skeletonUpperVoice,
  summarizeVoiceLeading,
  attachMelodyVoiceLeading,
  attachBassVoiceLeading,
} from "../src/music/voiceLeadingReport";
import type { SkeletonContent } from "../src/music/skeletonNeta";

// 対位法レポートの生成側露出（design #20 S3d）。純関数群＝lower 解決・サマリ・items[].meta 添付。
const chords = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 7, quality: "", start: 4, dur: 4 },
];

describe("summarizeVoiceLeading", () => {
  it("違反なしは「違反なし・score」", () => {
    expect(summarizeVoiceLeading({ score: 1, parallelFifths: 0, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0, spots: [] }))
      .toBe("違反なし・score1.00");
  });
  it("違反ありは種別×件数を列挙", () => {
    expect(summarizeVoiceLeading({ score: 0.9, parallelFifths: 1, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 1, spots: [] }))
      .toBe("並行5度1・交差1・score0.90");
  });
});

describe("resolveLowerVoice（実効ベースの解決順 a→b→c）", () => {
  it("(a) bass notes があればそのまま最優先（骨格/コードより）", () => {
    const bass = [{ pitch: 40, start: 0, dur: 2 }, { pitch: 45, start: 2, dur: 2 }];
    const low = resolveLowerVoice({ bass, chords, skeleton: { bars: 1, tones: [{ start: 0, pitch: 60 }], bass: [{ start: 0, pitch: 38 }] } });
    expect(low).toEqual([{ pitch: 40, start: 0, dur: 2 }, { pitch: 45, start: 2, dur: 2 }]);
  });
  it("(b) 骨格の明示ベース区間だけ上書き・残りはコード導出（マージ）", () => {
    // 2小節・[0,2) にペダル D2(38)明示。残り区間はコード root 低域(36+root)導出。
    const skeleton: SkeletonContent = { bars: 2, tones: [{ start: 0, pitch: 60 }], bass: [{ start: 0, pitch: 38 }] };
    const low = resolveLowerVoice({ skeleton, chords, beatsPerBar: 4 });
    expect(low).not.toBeNull();
    // [0,2) は明示 38（低域窓 33..55 内なので保持）
    for (const n of low!.filter((n) => n.start < 2 - 1e-9)) expect(n.pitch).toBe(38);
    // [4,8) はコード root=7 導出＝36+7=43 が現れる
    expect(low!.some((n) => n.start >= 4 - 1e-9 && n.pitch === 43)).toBe(true);
  });
  it("(b) 骨格ベース休符(pitch:null)区間は下声を作らない", () => {
    const skeleton: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }], bass: [{ start: 0, pitch: null }] };
    const low = resolveLowerVoice({ skeleton, chords: [{ root: 0, start: 0, dur: 4 }], beatsPerBar: 4 });
    // [0,2) は休符＝下声なし。以降はコード導出（root=0→36）で埋まる
    expect((low ?? []).some((n) => n.start < 2 - 1e-9)).toBe(false);
  });
  it("(c) bass も骨格明示も無ければコード root 低域代用", () => {
    const low = resolveLowerVoice({ chords });
    expect(low).toEqual([{ pitch: 36, start: 0, dur: 4 }, { pitch: 43, start: 4, dur: 4 }]);
  });
  it("bass も骨格明示も chords も無ければ null（レポート無し）", () => {
    expect(resolveLowerVoice({})).toBeNull();
    expect(resolveLowerVoice({ skeleton: { bars: 1, tones: [{ start: 0, pitch: 60 }] } })).toBeNull(); // tonesのみ＝明示ベース無し＝(b)不成立→(c)コード無し→null
  });
});

describe("skeletonUpperVoice（骨格 tones→上声 Note[]）", () => {
  it("tones を支配区間で展開・休符除外", () => {
    const skel: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }, { start: 2, pitch: null }] };
    const up = skeletonUpperVoice(skel, 4);
    expect(up.length).toBe(1);
    expect(up[0]!.pitch).toBe(60);
  });
});

describe("attachMelodyVoiceLeading（items[].meta 添付・bit一致）", () => {
  it("lower 解決できれば各候補に meta を足す（notes は不変）", () => {
    const notes = [{ pitch: 67, start: 0, dur: 1 }, { pitch: 69, start: 1, dur: 1 }];
    const res = { items: [{ kind: "melody", content: { notes }, label: "案1" }] as { content: unknown; meta?: Record<string, unknown> }[] };
    const before = JSON.stringify(res.items[0]!.content);
    attachMelodyVoiceLeading(res, { chords, beatsPerBar: 4 });
    expect(JSON.stringify(res.items[0]!.content)).toBe(before); // notes は bit 不変
    const meta = res.items[0]!.meta as { voiceLeading?: unknown; voiceLeadingSummary?: string };
    expect(meta?.voiceLeading).toBeTruthy();
    expect(typeof meta?.voiceLeadingSummary).toBe("string");
  });
  it("lower が無い（bass/骨格明示/chords 全て無し）なら meta を足さない", () => {
    const res = { items: [{ kind: "melody", content: { notes: [{ pitch: 60, start: 0, dur: 1 }] }, label: "案1" }] as { content: unknown; meta?: Record<string, unknown> }[] };
    attachMelodyVoiceLeading(res, {});
    expect(res.items[0]!.meta).toBeUndefined();
  });
});

describe("attachBassVoiceLeading（骨格 tones を上声に）", () => {
  it("骨格ありでベース候補に meta を足す", () => {
    const skeleton: SkeletonContent = { bars: 1, tones: [{ start: 0, pitch: 60 }, { start: 2, pitch: 64 }] };
    const res = { items: [{ kind: "bass", content: { notes: [{ pitch: 36, start: 0, dur: 2 }, { pitch: 43, start: 2, dur: 2 }] }, label: "ベース" }] as { content: unknown; meta?: Record<string, unknown> }[] };
    attachBassVoiceLeading(res, { skeleton, beatsPerBar: 4 });
    expect((res.items[0]!.meta as { voiceLeading?: unknown })?.voiceLeading).toBeTruthy();
  });
  it("骨格が無ければ meta を足さない（対位相手が無い）", () => {
    const res = { items: [{ kind: "bass", content: { notes: [{ pitch: 36, start: 0, dur: 1 }] }, label: "ベース" }] as { content: unknown; meta?: Record<string, unknown> }[] };
    attachBassVoiceLeading(res, {});
    expect(res.items[0]!.meta).toBeUndefined();
  });
});
