// ドラムフィルの相関ヒューマナイズ＝phrase_maker `humanize.py` の忠実移植（M2）。
// i.i.d. の一様ジッタは不採用。2成分・いずれも決定論：
//  (1) キット全体で共有する低周波 Breath（全打点が同じ緩いドリフトを読む＝相関）、
//  (2) voice 別の系統オフセット（もたり/前ノリ）。
//
// 決定論の核＝seed。phrase_maker は md5（builtin hash() 不使用）：stable_seed(s)=int(md5(s)[:8],16)。
// Breath は Python の random.Random(seed) で uniform(0,2π) を3回引く（ph1,ph2,vph）。よって
// **Python の MT19937（init_by_array 種＋genrand_res53）をビット互換で実装**しないと位相が一致しない。
// 下の MT19937 は CPython random と同じ列を出す（seed<2^32 は key=[seed]）。verify 済み（本ファイル下部テスト）。
//
// 純 TS（node/browser 両対応・crypto 非依存）＝bit 単位で再現可能。

// ---------------------------------------------------------------------------
// md5（純 TS・RFC 1321）。stable_seed 用に先頭 8 hex（=32bit）だけ使う。
// ---------------------------------------------------------------------------
export function md5Hex(input: string): string {
  // UTF-8 バイト列へ
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let c = input.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    else { // surrogate pair
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K: number[] = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

  const orig = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = orig * 8; // 入力は短文字列（seed 文字列）＝<2^32 bit 前提
  for (let i = 0; i < 4; i++) bytes.push((bitLen >>> (8 * i)) & 0xff); // 下位 32bit
  for (let i = 0; i < 4; i++) bytes.push(0); // 上位 32bit＝0（JS の >>> は5bitマスクで 32桁シフトが無効化されるため明示的に 0 を置く）

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rotl = (x: number, c: number) => (x << c) | (x >>> (32 - c));
  for (let off = 0; off < bytes.length; off += 64) {
    const M: number[] = [];
    for (let i = 0; i < 16; i++) {
      M[i] = (bytes[off + i * 4]! | (bytes[off + i * 4 + 1]! << 8) | (bytes[off + i * 4 + 2]! << 16) | (bytes[off + i * 4 + 3]! << 24)) >>> 0;
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i]! + M[g]!) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i]!)) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const toHex = (n: number) => {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
    return s;
  };
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

/** phrase_maker stable_seed：int(md5(s)[:8],16)（builtin hash() 不使用）。 */
export function stableSeed(s: string): number {
  return parseInt(md5Hex(s).slice(0, 8), 16);
}

// ---------------------------------------------------------------------------
// MT19937（CPython random 互換）。seed は 32bit 整数（key=[seed]）。
//   random() = genrand_res53、uniform(a,b)=a+(b-a)*random()。
// ---------------------------------------------------------------------------
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;

export class PyRandom {
  private mt = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed: number) { this.seedInt(seed >>> 0); }

  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1]!;
      // 1812433253 * (prev ^ (prev>>30)) + i
      this.mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.mti = N;
  }

  /** CPython init_by_array（seed<2^32 は key=[seed], keylength=1）。 */
  private seedInt(seed: number): void {
    const key = [seed >>> 0];
    this.initGenrand(19650218);
    let i = 1, j = 0;
    let k = Math.max(N, key.length);
    for (; k; k--) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (((this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) >>> 0) + key[j]! + j) >>> 0;
      i++; j++;
      if (i >= N) { this.mt[0] = this.mt[N - 1]!; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (k = N - 1; k; k--) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (((this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) >>> 0) - i) >>> 0;
      i++;
      if (i >= N) { this.mt[0] = this.mt[N - 1]!; i = 1; }
    }
    this.mt[0] = 0x80000000;
  }

  private genrandInt32(): number {
    let y: number;
    const mag01 = [0, MATRIX_A];
    if (this.mti >= N) {
      let kk: number;
      for (kk = 0; kk < N - M; kk++) {
        y = ((this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK)) >>> 0;
        this.mt[kk] = (this.mt[kk + M]! ^ (y >>> 1) ^ mag01[y & 1]!) >>> 0;
      }
      for (; kk < N - 1; kk++) {
        y = ((this.mt[kk]! & UPPER_MASK) | (this.mt[kk + 1]! & LOWER_MASK)) >>> 0;
        this.mt[kk] = (this.mt[kk + (M - N)]! ^ (y >>> 1) ^ mag01[y & 1]!) >>> 0;
      }
      y = ((this.mt[N - 1]! & UPPER_MASK) | (this.mt[0]! & LOWER_MASK)) >>> 0;
      this.mt[N - 1] = (this.mt[M - 1]! ^ (y >>> 1) ^ mag01[y & 1]!) >>> 0;
      this.mti = 0;
    }
    y = this.mt[this.mti++]!;
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** CPython random_random（genrand_res53）：53bit の [0,1)。 */
  random(): number {
    const a = this.genrandInt32() >>> 5; // 27 bits
    const b = this.genrandInt32() >>> 6; // 26 bits
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  uniform(lo: number, hi: number): number { return lo + (hi - lo) * this.random(); }
}

// ---------------------------------------------------------------------------
// 系統的な voice 別マイクロタイミング（ミリ秒・符号つき／- = 前ノリ）。humanize.py SYS_MS。
// ---------------------------------------------------------------------------
export const SYS_MS: Record<string, number> = {
  snare: +12.0, ghost: +7.0, sidestick: +9.0,
  chh: -7.0, ohh: -7.0, phh: -5.0, ride: -5.0, ridebell: -5.0,
  kick: +2.0, crash: 0.0,
  tom_hi: +3.0, tom_mid: +4.0, tom_lo: +5.0, floor: +5.0,
};

const TWO_PI = 2 * Math.PI;

/** キット全体で共有する低周波の相関ドリフト。humanize.py Breath。 */
export class Breath {
  readonly p1 = 3.7; readonly p2 = 6.1; readonly vp = 8.3;
  readonly ph1: number; readonly ph2: number; readonly vph: number;
  constructor(seed: number) {
    const rng = new PyRandom(seed);
    this.ph1 = rng.uniform(0, TWO_PI);
    this.ph2 = rng.uniform(0, TWO_PI);
    this.vph = rng.uniform(0, TWO_PI);
  }
  /** ±~7ms の緩いドリフト（秒）。 */
  dt(t: number): number {
    return 0.0045 * Math.sin((TWO_PI * t) / this.p1 + this.ph1)
      + 0.0028 * Math.sin((TWO_PI * t) / this.p2 + this.ph2);
  }
  /** ±~4 の速度スウェル。 */
  dv(t: number): number { return 4.0 * Math.sin((TWO_PI * t) / this.vp + this.vph); }
}

/** 相関ドリフト＋voice 別オフセットを適用。humanize.py humanize_seconds。dt/dv は元 t_sec に基づく。 */
export function humanizeSeconds(voice: string, tSec: number, vel: number, breath: Breath): { t: number; velocity: number } {
  const t = tSec + breath.dt(tSec) + (SYS_MS[voice] ?? 0.0) / 1000.0;
  // int(max(1,min(127,round(vel+dv)))) ＝ round-half-to-even
  const raw = vel + breath.dv(tSec);
  const f = Math.floor(raw);
  const diff = raw - f;
  const rounded = diff < 0.5 ? f : diff > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
  const velocity = Math.max(1, Math.min(127, rounded));
  return { t: Math.max(0.0, t), velocity };
}
