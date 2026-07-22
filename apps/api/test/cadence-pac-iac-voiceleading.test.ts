import { describe, it, expect } from "vitest";
import { genChords, genMelody, genMelodyCandidates } from "../src/music/generate";
import { voiceLeadingPenalty, leadingTonePenalty, type VoiceLeadingReport } from "../src/music/voiceLeading";

// PAC/IAC 区別 ＋ 声部進行の減点スコアを候補選別に結線（2026-07-22・SDD 監査反映v2）。
// 鉄則＝新ノブ既定は現行と byte 一致（既存 melody/コード bit一致テストが番人）。ここでは新経路の性質と
// 既定枝の恒等性（vlWeight=0 / cadence undefined）を固定する。

type Chord = { root: number; quality: string; start: number; dur: number; bass?: number };
const chordsOf = (r: ReturnType<typeof genChords>) => (r.items[0]!.content as { chords: Chord[] }).chords;
type N = { pitch: number; start: number; dur: number };
const candNotes = (r: ReturnType<typeof genMelodyCandidates>, i: number) => (r.items[i]!.content as { notes: N[] }).notes;
const keyOf = (ns: N[]) => ns.map((n) => `${n.pitch}@${n.start}:${n.dur}`).join(",");

const frame = { bars: 4, meter: "4/4", key: 0 };
// I 終わり進行（cadenceSoprano/PAC-IAC の着地検証に使う）
const chordsToI = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 5, quality: "", start: 4, dur: 4 },
  { root: 7, quality: "", start: 8, dur: 4 },
  { root: 0, quality: "", start: 12, dur: 4 },
];

describe("genChords cadence pac/iac（既定 bit一致＋PAC/IAC の実体）", () => {
  it("cadence undefined と \"full\" は従来一致（pac/iac 枝が既定に漏れない）", () => {
    const und = chordsOf(genChords(frame, 7, undefined));
    const full = chordsOf(genChords(frame, 7, "full"));
    expect(JSON.stringify(full)).toBe(JSON.stringify(und));
    // 既定枝は bass を一切持たない（IAC 転回が漏れていない）
    for (const c of und) expect(c.bass).toBeUndefined();
  });

  it("pac＝penult=真のV(root=key+7)/last=I(root=key)・bass なし（根音）", () => {
    const cs = chordsOf(genChords(frame, 7, "pac"));
    const last = cs[cs.length - 1]!, pen = cs[cs.length - 2]!;
    expect(((pen.root % 12) + 12) % 12).toBe(7); // V（key=0）
    expect(((last.root % 12) + 12) % 12).toBe(0); // I
    expect(last.bass).toBeUndefined(); // 根音＝転回しない
  });

  it("iac＝V→I は保つが last を第1転回（bass=第3音 pc）＝bass が実際に出力へ乗る（監査major#1回帰）", () => {
    const cs = chordsOf(genChords(frame, 7, "iac"));
    const last = cs[cs.length - 1]!, pen = cs[cs.length - 2]!;
    expect(((pen.root % 12) + 12) % 12).toBe(7); // V
    expect(((last.root % 12) + 12) % 12).toBe(0); // I
    expect(last.bass).toBe(4); // 長3度（key=0 → E=4）
  });

  it("iac（短調）＝bass=短3度 pc", () => {
    const cs = chordsOf(genChords({ bars: 4, meter: "4/4", key: 0, mode: "minor" }, 7, "iac"));
    expect(cs[cs.length - 1]!.bass).toBe(3); // 短3度（key=0 → E♭=3）
  });

  it("iac × citypop＝テンション付与(maj9等)後も第1転回 bass(第3音)を保つ（分数化と共存する境界回帰）", () => {
    const cs = chordsOf(genChords(frame, 7, "iac", { genre: "citypop" }));
    const last = cs[cs.length - 1]!;
    expect(((last.root % 12) + 12) % 12).toBe(0); // I（citypop はテンションを足すが度数は保つ）
    expect(last.bass).toBe(4); // iac 転回 bass=長3度 が citypop 変換(bass スプレッド)を通って保存される
  });

  it("iac × transition＝転調境界は末尾が準備和音へ再構築され IAC 転回(bass)が消える（design 明記の仕様境界）", () => {
    const cs = chordsOf(genChords(frame, 7, "iac", { transition: { prep: "pivot", toKey: 5 } }));
    expect(cs[cs.length - 1]!.bass).toBeUndefined(); // transition が bass 無しで再構築＝IAC 転回は無効（呼び出し側責務）
  });
});

describe("genMelody cadenceSoprano（IAC ソプラノ再ターゲット）", () => {
  it("cadenceSoprano:\"third\"＝最終音 pc==第3音（key=0 → 4）", () => {
    const ns = (genMelody(frame, chordsToI, 3, { useV2: true, cadenceSoprano: "third" }).items[0]!.content as { notes: N[] }).notes;
    expect(((ns[ns.length - 1]!.pitch % 12) + 12) % 12).toBe(4);
  });

  it("cadenceSoprano:\"fifth\"＝最終音 pc==属音（key=0 → 7）", () => {
    const ns = (genMelody(frame, chordsToI, 3, { useV2: true, cadenceSoprano: "fifth" }).items[0]!.content as { notes: N[] }).notes;
    expect(((ns[ns.length - 1]!.pitch % 12) + 12) % 12).toBe(7);
  });

  it("決定的＝cadenceSoprano 指定でも同入力→同出力", () => {
    const a = (genMelody(frame, chordsToI, 3, { useV2: true, cadenceSoprano: "third" }).items[0]!.content as { notes: N[] }).notes;
    const b = (genMelody(frame, chordsToI, 3, { useV2: true, cadenceSoprano: "third" }).items[0]!.content as { notes: N[] }).notes;
    expect(keyOf(a)).toBe(keyOf(b));
  });
});

describe("genMelodyCandidates vlWeight（既定0=bit一致＋声部減点の結線）", () => {
  it("vlWeight 未指定 と vlWeight:0 は候補ノート列が完全一致（w=0 の算術恒等）", () => {
    const a = genMelodyCandidates(frame, chordsToI, null, { useV2: true, k: 3, n: 8 });
    const b = genMelodyCandidates(frame, chordsToI, null, { useV2: true, k: 3, n: 8, vlWeight: 0 });
    expect(a.items.length).toBe(b.items.length);
    for (let i = 0; i < a.items.length; i++) expect(keyOf(candNotes(b, i))).toBe(keyOf(candNotes(a, i)));
  });

  it("seed 明示は vlWeight を無視（早期 return＝genMelody と一致・監査#3）", () => {
    const cand = genMelodyCandidates(frame, chordsToI, 42, { useV2: true, vlWeight: 0.5 });
    const single = genMelody(frame, chordsToI, 42, { useV2: true });
    expect(cand.items.length).toBe(1);
    expect(keyOf(candNotes(cand, 0))).toBe(keyOf((single.items[0]!.content as { notes: N[] }).notes));
  });

  it("vlWeight>0 でクラッシュせず top-k を返す（reranker 経路）", () => {
    const r = genMelodyCandidates(frame, chordsToI, null, { useV2: true, k: 3, n: 8, vlWeight: 0.5 });
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    expect(r.items.length).toBeLessThanOrEqual(3);
    for (const it of r.items) expect((it.content as { notes: N[] }).notes.length).toBeGreaterThan(0);
  });

  it("lower 解決不能（bass/skeleton/chords 全て無し）でも throw せず候補を返す（監査#4）", () => {
    const r = genMelodyCandidates({ key: 0, mode: "major", meter: "4/4", bars: 4 }, undefined, null, { useV2: true, k: 3, n: 8, vlWeight: 0.5 });
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("vlWeight>0・決定的＝同入力→同出力", () => {
    const a = genMelodyCandidates(frame, chordsToI, null, { useV2: true, k: 3, n: 8, vlWeight: 0.4 });
    const b = genMelodyCandidates(frame, chordsToI, null, { useV2: true, k: 3, n: 8, vlWeight: 0.4 });
    expect(a.items.map((_, i) => keyOf(candNotes(a, i)))).toEqual(b.items.map((_, i) => keyOf(candNotes(b, i))));
  });
});

describe("voiceLeadingPenalty / leadingTonePenalty（純関数ユニット）", () => {
  const mkRep = (p: Partial<VoiceLeadingReport>): VoiceLeadingReport => ({ score: 1, parallelFifths: 0, parallelOctaves: 0, directFifths: 0, directOctaves: 0, voiceCrossings: 0, spots: [], ...p });

  it("voiceLeadingPenalty: null=0・並行5度=6・隠伏8度=3・交差=6・合成", () => {
    expect(voiceLeadingPenalty(null)).toBe(0);
    expect(voiceLeadingPenalty(mkRep({ parallelFifths: 1 }))).toBe(6);
    expect(voiceLeadingPenalty(mkRep({ directOctaves: 1 }))).toBe(3);
    expect(voiceLeadingPenalty(mkRep({ voiceCrossings: 1 }))).toBe(6);
    expect(voiceLeadingPenalty(mkRep({ parallelFifths: 1, directFifths: 1, voiceCrossings: 1 }))).toBe(6 + 3 + 6);
  });

  it("leadingTonePenalty: 導音→主音(半音上)=0件・導音→下降=1件（atCadenceOnly:false 全域）", () => {
    // tonicPc=0 → 導音=B(11)。B→C(+1)=解決、B→A(-2)=未解決。
    const resolved = [{ pitch: 71, start: 0, dur: 1 }, { pitch: 72, start: 1, dur: 1 }];
    const drop = [{ pitch: 71, start: 0, dur: 1 }, { pitch: 69, start: 1, dur: 1 }];
    expect(leadingTonePenalty(resolved, 0, { atCadenceOnly: false })).toBe(0);
    expect(leadingTonePenalty(drop, 0, { atCadenceOnly: false })).toBe(1);
  });

  it("leadingTonePenalty: atCadenceOnly=true＝V/V7/vii° 上のみ数え・非ドミナント経過は0（監査#5）", () => {
    const drop = [{ pitch: 71, start: 0, dur: 1 }, { pitch: 69, start: 1, dur: 1 }];
    // ドミナント（G major=V）区間 → 数える
    expect(leadingTonePenalty(drop, 0, { atCadenceOnly: true, chords: [{ root: 7, quality: "", start: 0, dur: 2 }] })).toBe(1);
    // 非ドミナント（C major=I）区間 → 経過的 7̂ 下行は罰しない
    expect(leadingTonePenalty(drop, 0, { atCadenceOnly: true, chords: [{ root: 0, quality: "", start: 0, dur: 2 }] })).toBe(0);
    // chords 未渡し（ドミナント判定不能）→ 減点なし（全域 fallback しない）
    expect(leadingTonePenalty(drop, 0, { atCadenceOnly: true })).toBe(0);
    // vii°（B dim）区間 → 真のドミナント → 数える
    expect(leadingTonePenalty(drop, 0, { atCadenceOnly: true, chords: [{ root: 11, quality: "dim", start: 0, dur: 2 }] })).toBe(1);
  });
});
