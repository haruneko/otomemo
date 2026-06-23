// seed 付き乱数（mulberry32）。Python random と同じ列にはならないが、seed で再現可能＝テスト安定。
// 生成エンジン（generate.ts）から分離（#5 神ファイル分割）。依存ゼロの純部品。
export class Rng {
  private s: number;
  constructor(seed?: number | null) {
    this.s = (seed ?? 0x9e3779b9) >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  choices<T>(arr: readonly T[], weights: number[]): T {
    // 重みは負/非有限/欠落を 0 とみなす（短い weights 配列や NaN が pitch まで伝播するのを断つ）。
    const w = (i: number): number => {
      const x = weights[i];
      return typeof x === "number" && x > 0 ? x : 0;
    };
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += w(i);
    if (!(total > 0)) return arr[arr.length - 1]!; // 全0/空/非有限 → 末尾へ決定的フォールバック
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= w(i);
      if (r < 0) return arr[i]!;
    }
    return arr[arr.length - 1]!;
  }
}
