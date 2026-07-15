import { describe, it, expect } from "vitest";
import { buildDigest, type DigestInterp } from "../src/music/audio-digest";
import { detectKeySegments } from "../src/music/localKey";

// ── 合成 facts/timeline ビルダー ─────────────────────────────────────────
type Seg = [number, number, string];
/** [dur, label] 列 → 秒付き timeline（開始0）。 */
function tl(items: [number, string][]): Seg[] {
  const out: Seg[] = []; let t = 0;
  for (const [d, lab] of items) { out.push([t, t + d, lab]); t += d; }
  return out;
}
/** localKey 用ループ展開（トニック=先頭4s・他2s）＝転調テストと同型。 */
function loops(secs: string[][], reps: number[]): Seg[] {
  const out: Seg[] = []; let t = 0;
  secs.forEach((syms, li) => {
    for (let r = 0; r < reps[li]!; r++) syms.forEach((s, i) => { const d = i === 0 ? 4 : 2; out.push([t, t + d, s]); t += d; });
  });
  return out;
}
function interp(timeline: Seg[], over: Partial<DigestInterp> = {}): DigestInterp {
  return { bpm: 120, meter: 4, downbeat: 0, sections: [], key: null, timeline, beatTimes: [], ...over };
}

describe("buildDigest（#S10続 v2.1 読み筋層）", () => {
  it("overview/chords/key_segments の骨格が出る（度数化）", () => {
    const timeline = tl([[4, "C:maj"], [2, "A:min"], [2, "F:maj"], [4, "G:maj"]]);
    const d = buildDigest({ bpm: 120, key: { key: "C", mode: "major" }, duration_sec: 12 }, interp(timeline, { key: { key: "C", mode: "major" } }));
    expect(d.overview).toContain("C major");
    expect(d.chords.key).toBe("C major");
    // 度数化：C=I, Am=vi, F=IV, G=V
    const degs = d.chords.freq_top.map((x) => x.deg);
    expect(degs).toContain("I");
    expect(degs).toContain("vi");
    expect(degs).toContain("IV");
    expect(d.key_segments.length).toBeGreaterThanOrEqual(1);
  });

  it("H1 借用和音：C major の ♭VII(Bb) を非ダイアトニックとして検出", () => {
    const timeline = tl([[4, "C:maj"], [2, "F:maj"], [2, "Bb:maj"], [4, "C:maj"]]);
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" } }));
    const h1 = d.spots.filter((s) => s.id === "H1");
    expect(h1.length).toBeGreaterThanOrEqual(1);
    expect(h1[0]!.fact).toContain("♭VII");
    expect(h1[0]!.fact).toContain("借用");
  });

  it("H1：ダイアトニックのみ(C F G Am)なら借用 spot は出ない", () => {
    const timeline = tl([[4, "C:maj"], [2, "F:maj"], [2, "G:maj"], [4, "A:min"]]);
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" } }));
    expect(d.spots.filter((s) => s.id === "H1")).toHaveLength(0);
  });

  it("H2 セカンダリドミナント：D7(V/V) → G(V) を検出", () => {
    const timeline = tl([[4, "C:maj"], [2, "D:7"], [2, "G:maj"], [4, "C:maj"]]);
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" } }));
    const h2 = d.spots.filter((s) => s.id === "H2");
    expect(h2.length).toBeGreaterThanOrEqual(1);
    expect(h2[0]!.fact).toContain("セカンダリドミナント");
    // D7 は II7、G は V へ解決
    expect(h2[0]!.fact).toContain("II7");
  });

  it("H5 転調：C→Eb（十分な滞在）で key_segments>1・modulation=true・H5 spot", () => {
    const timeline = loops([["C", "G", "Am", "F"], ["Eb", "Bb", "Cm", "Ab"]], [6, 6]);
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" }, bpm: 120 }));
    expect(d.modulation).toBe(true);
    expect(d.key_segments.length).toBeGreaterThanOrEqual(2);
    expect(d.spots.filter((s) => s.id === "H5").length).toBeGreaterThanOrEqual(1);
  });

  it("H5 断片化ゲート：セグメント>4 or 最短滞在<8s ならグローバル単一調へフォールバック（H5 出さない）", () => {
    // 無関係な調を次々渡り歩く＝断片化（DeepSea 型）。detectKeySegments が >4 セグメントを出す条件を確認してから digest を検証。
    const timeline = loops(
      [["C", "G", "Am", "F"], ["D", "A", "Bm", "G"], ["E", "B", "C#m", "A"], ["F#", "C#", "D#m", "B"], ["G#", "D#", "Fm", "C#"], ["A#", "F", "Gm", "D#"]],
      [2, 2, 2, 2, 2, 2],
    );
    const raw = detectKeySegments(timeline).segments;
    const minDwell = raw.length ? Math.min(...raw.map((s) => s.end - s.start)) : Infinity;
    const shouldGate = raw.length === 0 || raw.length > 4 || minDwell < 8;
    expect(shouldGate).toBe(true); // この入力は断片化（ゲート発火）
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" } }));
    expect(d.modulation).toBe(false);
    expect(d.key_segments).toHaveLength(1); // グローバル単一調
    expect(d.spots.filter((s) => s.id === "H5")).toHaveLength(0);
  });

  it("M2 音域設計：セクション別レンジ推移＋最高音の位置を検出", () => {
    const timeline = tl([[4, "C:maj"], [4, "G:maj"]]);
    // 区間0（0-4s）低め・区間1（4-8s）にサビの最高音 E5(76)
    const melody_notes: [number, number, number][] = [
      [0.5, 1, 60], [1.5, 2, 62], [4.2, 4.7, 72], [5.0, 5.5, 76], [6.0, 6.5, 74],
    ];
    const sections = [{ startSec: 0, endSec: 4, bars: 2 }, { startSec: 4, endSec: 8, bars: 2 }];
    const d = buildDigest({ key: { key: "C", mode: "major" }, melody_notes }, interp(timeline, { key: { key: "C", mode: "major" }, sections }));
    const m2 = d.spots.filter((s) => s.id === "M2");
    expect(m2.length).toBe(1);
    expect(m2[0]!.fact).toContain("最高音");
    expect(m2[0]!.fact).toContain("第2区間");
    expect(d.melody!.range!.high).toBe("E5");
  });

  it("M4 食い：メロ onset が拍/コード頭を16分前で先取りする率を検出", () => {
    const timeline = tl([[2, "C:maj"], [2, "G:maj"], [2, "C:maj"], [2, "G:maj"]]);
    const beatTimes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5];
    const sixteenth = (60 / 120) / 4; // 0.125s
    // 各拍の直前 16分（-0.125s）に食う onset を多数置く＝高い anticipation 率
    const melody_notes: [number, number, number][] = [];
    for (let b = 1; b <= 12; b++) melody_notes.push([b * 0.5 - sixteenth, b * 0.5, 64]);
    const d = buildDigest({ key: { key: "C", mode: "major" }, melody_notes }, interp(timeline, { key: { key: "C", mode: "major" }, bpm: 120, beatTimes }));
    const m4 = d.spots.filter((s) => s.id === "M4");
    expect(m4.length).toBe(1);
    expect(m4[0]!.fact).toContain("食い");
  });

  it("R3 ベース×キック：±50ms 一致率を検出", () => {
    const timeline = tl([[4, "C:maj"], [4, "G:maj"]]);
    const drum_onsets: [number, string, number][] = [[0, "kick", 1], [1, "kick", 1], [2, "kick", 1], [3, "kick", 1]];
    // ベースはキックにほぼ一致（±30ms）
    const bass_notes: [number, number, number][] = [[0.02, 0.9, 36], [1.01, 1.9, 36], [2.03, 2.9, 43], [3.0, 3.9, 43]];
    const d = buildDigest({ key: { key: "C", mode: "major" }, drum_onsets, bass_notes }, interp(timeline, { key: { key: "C", mode: "major" } }));
    const r3 = d.spots.filter((s) => s.id === "R3");
    expect(r3.length).toBe(1);
    expect(r3[0]!.fact).toContain("キック");
    expect(d.bass!.kick_lock_rate).toBe(1); // 全一致
  });

  it("F1 小節数非対称：区間の小節数列が不揃いなら検出", () => {
    const timeline = tl([[4, "C:maj"], [4, "G:maj"]]);
    const sections = [{ startSec: 0, endSec: 8, bars: 8 }, { startSec: 8, endSec: 14, bars: 6 }, { startSec: 14, endSec: 22, bars: 8 }];
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" }, sections }));
    const f1 = d.spots.filter((s) => s.id === "F1");
    expect(f1.length).toBe(1);
    expect(f1[0]!.fact).toContain("8/6/8");
  });

  it("F1：全区間8小節なら対称＝spot 出さない", () => {
    const timeline = tl([[4, "C:maj"], [4, "G:maj"]]);
    const sections = [{ startSec: 0, endSec: 8, bars: 8 }, { startSec: 8, endSec: 16, bars: 8 }];
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" }, sections }));
    expect(d.spots.filter((s) => s.id === "F1")).toHaveLength(0);
  });

  it("データ不足の類型は黙ってスキップ（melody/bass 無し → melody/bass=null・その spot 無し）", () => {
    const timeline = tl([[4, "C:maj"], [4, "G:maj"]]);
    const d = buildDigest({ key: { key: "C", mode: "major" } }, interp(timeline, { key: { key: "C", mode: "major" } }));
    expect(d.melody).toBeNull();
    expect(d.bass).toBeNull();
    expect(d.spots.filter((s) => s.id === "M2" || s.id === "M4" || s.id === "R3")).toHaveLength(0);
  });

  it("サイズ契約：現実規模の facts でも JSON 生バイト ~12KB 以下", () => {
    // 大量コード（200コード）＋メロ500音＋ベース300音＋ドラム2000オンセット＝実曲相当
    const items: [number, string][] = [];
    const cyc = ["C:maj", "G:maj", "A:min", "F:maj"];
    for (let i = 0; i < 200; i++) items.push([2, cyc[i % 4]!]);
    const timeline = tl(items);
    const melody_notes: [number, number, number][] = [];
    for (let i = 0; i < 500; i++) melody_notes.push([i * 0.8, i * 0.8 + 0.4, 60 + (i % 12)]);
    const bass_notes: [number, number, number][] = [];
    for (let i = 0; i < 300; i++) bass_notes.push([i * 1.3, i * 1.3 + 0.5, 36 + (i % 12)]);
    const drum_onsets: [number, string, number][] = [];
    for (let i = 0; i < 2000; i++) drum_onsets.push([i * 0.2, ["kick", "snare", "hihat"][i % 3]!, 1]);
    const sections = Array.from({ length: 8 }, (_, i) => ({ startSec: i * 50, endSec: i * 50 + 50, bars: 8 }));
    const d = buildDigest({ bpm: 120, key: { key: "C", mode: "major" }, duration_sec: 400, melody_notes, bass_notes, drum_onsets },
      interp(timeline, { key: { key: "C", mode: "major" }, sections }));
    const bytes = Buffer.byteLength(JSON.stringify(d), "utf8");
    expect(bytes).toBeLessThanOrEqual(12000);
  });

  it("決定性：同一入力で2回呼ぶと完全一致（JSON）", () => {
    const timeline = tl([[4, "C:maj"], [2, "D:7"], [2, "G:maj"], [2, "Bb:maj"], [4, "C:maj"]]);
    const melody_notes: [number, number, number][] = [[0.5, 1, 60], [2, 2.5, 74], [4, 4.5, 72]];
    const facts = { bpm: 120, key: { key: "C", mode: "major" }, duration_sec: 14, melody_notes };
    const iv = interp(timeline, { key: { key: "C", mode: "major" }, sections: [{ startSec: 0, endSec: 14, bars: 8 }] });
    const a = JSON.stringify(buildDigest(facts, iv));
    const b = JSON.stringify(buildDigest(facts, iv));
    expect(a).toBe(b);
  });
});
