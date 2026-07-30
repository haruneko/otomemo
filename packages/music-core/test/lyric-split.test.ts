import { describe, it, expect } from "vitest";
import { splitCandidates, assembleSplitNotes, analyzeMoras, notesInRange, type SplitMeter } from "../src/index";

// 4/4・16分
const M44: SplitMeter = { beatsPerBar: 4, gridPerBeat: 4 };
// 呼び側の Note 型（syllable? を持つ＝web/api の Note と同形）。
type TNote = { pitch: number; start: number; dur: number; syllable?: string };
// 4分音符4つ（1小節）。start=0,1,2,3。
const quarters = (): TNote[] => [
  { pitch: 60, start: 0, dur: 1 },
  { pitch: 62, start: 1, dur: 1 },
  { pitch: 64, start: 2, dur: 1 },
  { pitch: 67, start: 3, dur: 1 },
];
const range1bar = { start: 0, beats: 4 };
const morasN = (n: number) => analyzeMoras("あいうえおかきくけこ".slice(0, n));

describe("splitCandidates：候補提示版（案A・音符を割る）", () => {
  it("余っていない（k<=0）なら候補は空＝何も割らない", () => {
    const r = splitCandidates(quarters(), morasN(4), range1bar, M44);
    expect(r.candidates).toHaveLength(0);
    const r2 = splitCandidates(quarters(), morasN(3), range1bar, M44);
    expect(r2.candidates).toHaveLength(0);
  });

  it("字余り2＝どの候補も onset を2個足し、範囲内音符がモーラ数と1対1になる", () => {
    const notes = quarters();
    const moras = morasN(6); // k = 6 - 4 = 2
    const r = splitCandidates(notes, moras, range1bar, M44);
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(c.addedOnsets).toBe(2);
      const idx = notesInRange(c.notesAfter, range1bar);
      expect(idx).toHaveLength(6); // 4 + 2
      // 1対1でかなが載る（頭から moras 順）
      const kanas = idx.map((i) => c.notesAfter[i]!.syllable);
      expect(kanas).toEqual(moras.map((m) => m.kana));
    }
  });

  it("純関数＝入力を壊さない・割った音符は元のピッチを継ぐ", () => {
    const notes = quarters();
    const before = JSON.parse(JSON.stringify(notes));
    const r = splitCandidates(notes, morasN(6), range1bar, M44);
    expect(notes).toEqual(before); // 非破壊
    // 割った後の音符のピッチは、元のいずれかの音符のピッチ（新規に音は生まれない）
    const srcPitches = new Set(notes.map((n) => n.pitch));
    for (const c of r.candidates) {
      for (const n of c.notesAfter) expect(srcPitches.has(n.pitch)).toBe(true);
    }
  });

  it("句末音は割らない（protectPhraseEnd 既定）", () => {
    const r = splitCandidates(quarters(), morasN(7), range1bar, M44); // k=3
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      expect(c.splits.every((s) => s.noteIndex !== 3)).toBe(true);
    }
  });

  it("割り位置は16分格子の上・断片は下限（16分）以上", () => {
    const r = splitCandidates(quarters(), morasN(6), range1bar, M44);
    for (const c of r.candidates) {
      // 全音符 start が16分格子（start*4 が整数）
      for (const n of c.notesAfter) expect(Math.abs(n.start * 4 - Math.round(n.start * 4))).toBeLessThan(1e-6);
      // 範囲内は下限0.25拍以上
      const idx = notesInRange(c.notesAfter, range1bar);
      for (const i of idx) expect(c.notesAfter[i]!.dur).toBeGreaterThanOrEqual(0.25 - 1e-6);
    }
  });

  it("下限音価を上げると割れる余地が減る＝候補が減る/消える", () => {
    const many = splitCandidates(quarters(), morasN(6), range1bar, M44, { floorBeats: 0.25 });
    const few = splitCandidates(quarters(), morasN(6), range1bar, M44, { floorBeats: 0.5 });
    expect(few.candidates.length).toBeLessThan(many.candidates.length);
  });

  it("並びは事実基準・好ましさ基準の2軸で、どちらも候補の並べ替え（点数で1本化しない）", () => {
    const r = splitCandidates(quarters(), morasN(6), range1bar, M44);
    const n = r.candidates.length;
    const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
    expect(sorted(r.byFacts)).toEqual([...Array(n).keys()]);
    expect(sorted(r.byPreference)).toEqual([...Array(n).keys()]);
  });

  it("コーパス無し＝4/4でも実測の裏は無い（backedByCorpus=false・corpusKnown=null）", () => {
    const r = splitCandidates(quarters(), morasN(6), range1bar, M44);
    expect(r.backedByCorpus).toBe(false);
    for (const c of r.candidates) expect(c.corpusKnown).toBeNull();
  });

  it("コーパス注入＝4/4・16分でだけ裏取りが効く（backedByCorpus=true・既出判定が出る）", () => {
    const corpus = (_pat: string) => 100; // どのパターンも既出扱い
    const r = splitCandidates(quarters(), morasN(6), range1bar, M44, { corpus });
    expect(r.backedByCorpus).toBe(true);
    for (const c of r.candidates) {
      expect(c.corpusKnown).toBe(true);
      expect(c.corpusFreq).toBeGreaterThan(0);
    }
  });

  it("好ましさ順はコーパス頻度の高い候補を前に置く", () => {
    // 特定パターンだけ高頻度にして、その候補が byPreference 先頭寄りに来ることを確認
    const corpus = (pat: string) => (pat.includes("xx") ? 500 : 1);
    const r = splitCandidates(quarters(), morasN(6), range1bar, M44, { corpus });
    const freqs = r.byPreference.map((i) => r.candidates[i]!.corpusFreq);
    // 単調非増加（先頭ほど高頻度）
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]!).toBeLessThanOrEqual(freqs[i - 1]!);
  });

  it("非4/4（6/8）は候補を出すが実測の裏は付けない（§4-4＝ハード不能ではない）", () => {
    // 6/8＝beatsPerBar:2（付点4分2つ）・gridPerBeat:3（8分3つ）。1小節=6slot。
    const notes68 = [
      { pitch: 60, start: 0, dur: 1 },
      { pitch: 62, start: 1, dur: 1 },
    ];
    const meter68: SplitMeter = { beatsPerBar: 2, gridPerBeat: 3 };
    const r = splitCandidates(notes68, morasN(3), { start: 0, beats: 2 }, meter68, { corpus: () => 100 });
    expect(r.candidates.length).toBeGreaterThan(0); // 出せる
    expect(r.backedByCorpus).toBe(false); // でも裏は無い
    for (const c of r.candidates) expect(c.corpusKnown).toBeNull();
  });

  it("範囲末を越えて伸びる音符でも、割り位置は範囲内に留まる＝モーラが脱落しない（監査 Bug4）", () => {
    // 音符1が range[0,4) を越えて start1..5 まで伸びる。字余り1。
    const notes = [{ pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 4 }, { pitch: 64, start: 3.5, dur: 0.5 }];
    const r = splitCandidates(notes, morasN(4), { start: 0, beats: 4 }, M44, { protectPhraseEnd: false });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) {
      for (const s of c.splits) expect(s.slot).toBeLessThan(16); // 範囲末(4拍=16slot)を越えない
      // 範囲内音符数＝元3＋余り1＝4＝モーラ数（脱落なし）
      expect(notesInRange(c.notesAfter, { start: 0, beats: 4 })).toHaveLength(4);
    }
  });

  it("assembleSplitNotes は端点を保持する＝格子外の音符を割っても頭と尻が動かない（監査 Bug5）", () => {
    const notes = [{ pitch: 60, start: 0.3, dur: 2 }]; // 格子外 start
    const out = assembleSplitNotes(notes, ["あ", "い"], { start: 0, beats: 4 }, M44, [{ noteIndex: 0, slot: 8 }]);
    expect(out).toHaveLength(2);
    expect(out[0]!.start).toBeCloseTo(0.3, 6);            // 先頭は元の start のまま
    expect(out[out.length - 1]!.start + out[out.length - 1]!.dur).toBeCloseTo(2.3, 6); // 末尾の end も元のまま
  });

  it("assembleSplitNotes は返却上限で切れた選択でも音符を割れる（監査 Bug1＝適用は候補一致に依存しない）", () => {
    const notes = quarters();
    const kana = morasN(6).map((m) => m.kana);
    const out = assembleSplitNotes(notes, kana, range1bar, M44, [{ noteIndex: 0, slot: 2 }, { noteIndex: 1, slot: 6 }]);
    expect(notesInRange(out, range1bar)).toHaveLength(6); // 4+2＝モーラ数と1対1
    expect(out.filter((n) => n.start >= 0 && n.start < 4).map((n) => n.syllable)).toEqual(kana);
  });

  it("促音「っ」が拍頭の新規onsetに当たる候補は specialBeatHit で印される（弾かずに添える）", () => {
    // 「あっち」＝あ/っ/ち。1音符に流すと余る＝割ると「っ」がどこかの onset に乗る。
    const moras = analyzeMoras("あっち"); // 3モーラ（normal, sokuon, normal）
    const notes = [{ pitch: 60, start: 0, dur: 2 }]; // 1音符・2拍。range 内 k=2。
    const r = splitCandidates(notes, moras, { start: 0, beats: 4 }, M44, { protectPhraseEnd: false });
    expect(r.candidates.length).toBeGreaterThan(0);
    // どれかの候補で「っ」が拍頭に乗る＝specialBeatHit を立てるものが在る（＝機械が事実として言える）
    expect(r.candidates.some((c) => c.specialBeatHit)).toBe(true);
    // 弾いていない＝specialBeatHit の有無に関わらず候補は残っている
    expect(r.candidates.some((c) => !c.specialBeatHit)).toBe(true);
  });
});
