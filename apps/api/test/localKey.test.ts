import { describe, it, expect } from "vitest";
import { detectKeySegments, type ChordsTimeline } from "../src/music/localKey";

// 合成 chords_timeline ビルダー。実音楽の相場に合わせ **トニック(各ループ先頭)を長め(4s)** に居座らせ、
// 残りを 2s とする＝resolveTonic の dur 重みが効く形（既存 resolveTonic テストも Dm dur=40 で同趣旨）。
// 1小節≒2コード≒~5s とみなし、転調点許容は ±2小節 ≒ ±10s で評価する。
const BAR_SEC = 5;
const TOL = 2 * BAR_SEC; // ±2小節
/** loops=各セクションのコード配列, reps=各セクションの反復回数 → {timeline, bounds(セクション境界の秒)} */
function build(loops: string[][], reps: number[]): { timeline: ChordsTimeline; bounds: number[] } {
  const out: ChordsTimeline = []; let t = 0; const bounds: number[] = [];
  loops.forEach((syms, li) => {
    for (let r = 0; r < reps[li]!; r++) {
      syms.forEach((s, i) => { const d = i === 0 ? 4 : 2; out.push([t, t + d, s]); t += d; });
    }
    if (li < loops.length - 1) bounds.push(t);
  });
  return { timeline: out, bounds };
}
const switchTimes = (segs: { start: number }[]) => segs.slice(1).map((s) => s.start);
const nearAny = (times: number[], boundary: number) => times.some((t) => Math.abs(t - boundary) <= TOL);

const CM = ["C", "G", "Am", "F"];      // C major  I-V-vi-IV（C を長く）
const DbM = ["Db", "Ab", "Bbm", "Gb"]; // Db major (+1半音)
const EbM = ["Eb", "Bb", "Cm", "Ab"];  // Eb major (+3半音)

describe("detectKeySegments 合成6系統（F3 プロト）", () => {
  it("(a) 単一調の曲＝1セグメント（過剰分割しない）", () => {
    const { segments } = detectKeySegments(build([CM], [8]).timeline);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.key).toBe(0);
    expect(segments[0]!.mode).toBe("major");
  });

  it("(b) 半音上げ転調（J-pop大サビ型）→ 転調点 ±2小節で検出", () => {
    const { timeline, bounds } = build([CM, DbM], [6, 6]);
    const { segments } = detectKeySegments(timeline);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(nearAny(switchTimes(segments), bounds[0]!)).toBe(true);
    expect(segments[0]!.key).toBe(0);                       // C
    expect(segments[segments.length - 1]!.key).toBe(1);     // Db(+1)
  });

  it("(c) 短3度上げ転調 → 転調点 ±2小節で検出", () => {
    const { timeline, bounds } = build([CM, EbM], [6, 6]);
    const { segments } = detectKeySegments(timeline);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(nearAny(switchTimes(segments), bounds[0]!)).toBe(true);
    expect(segments[0]!.key).toBe(0);                       // C
    expect(segments[segments.length - 1]!.key).toBe(3);     // Eb(+3)
  });

  it("(d) 相対調の往復（C⇄Am）→ 転調と誤認しない（1セグメント）", () => {
    // C色ループ(tonic C長め)と Am色ループ(tonic Am長め)を交互に＝同一PC集合の相対調。
    const cL = ["C", "F", "G", "C"], aL = ["Am", "Dm", "Em", "Am"];
    const { timeline } = build([cL, aL, cL, aL, cL, aL, cL, aL], [1, 1, 1, 1, 1, 1, 1, 1]);
    const { segments } = detectKeySegments(timeline);
    expect(segments).toHaveLength(1); // 相対調の往復を転調に割らない
  });

  it("(e) 1〜2コードの借用（セカンダリドミナント/モーダルインターチェンジ）→ 分割しない", () => {
    // C major の中に V/V(D7)→G のよそ見(2コード)、さらに ♭VI(Ab=モーダルインターチェンジ)を単発。
    const out: ChordsTimeline = []; let t = 0;
    const push = (s: string, d: number) => { out.push([t, t + d, s]); t += d; };
    const cm = () => { push("C", 4); push("G", 2); push("Am", 2); push("F", 2); };
    for (let r = 0; r < 3; r++) cm();
    push("D7", 2); push("G", 2);           // 属方向のよそ見（2コード）
    for (let r = 0; r < 2; r++) cm();
    push("Ab", 2);                          // ♭VI 借用（1コード）
    for (let r = 0; r < 3; r++) cm();
    const { segments } = detectKeySegments(out);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.key).toBe(0);
    expect(segments[0]!.mode).toBe("major");
  });

  it("(f) 部分転調（属調に一定長）→ 検出する", () => {
    // C(6) → G major(6, I-vi-IV-V7=G-Em-C-D7) → C(6)。中央に属調 G(=7 major) セグメントが立つ。
    const GM = ["G", "Em", "C", "D7"];
    const { timeline } = build([CM, GM, CM], [6, 6, 6]);
    const { segments } = detectKeySegments(timeline);
    expect(segments.some((s) => s.key === 7 && s.mode === "major")).toBe(true);
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });
});
