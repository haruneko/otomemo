// @cm/music-core — 不変の音楽知識だけを api/web で共有する SSOT（負債D3・design 決定2b）。
// ここに置くのは「移調不変・アプリ非依存の音楽定数と純粋派生」のみ。DB/Fastify/Tone/MCP など
// アプリ固有の依存やロジック（相対bass解決・生成器）は**持ち込まない**（結合を最小に）。

/** 音符の基本形（移調/テンポ不変の音楽データ）。旧: api/web の各所でローカル再定義していた
 *  `{pitch,start,dur}` 級を1本化（負債#10・Note型一元化）。pitch=C基準MIDI番号・start/dur=拍。
 *  アプリ固有の拡張フィールド（web の drum/program/part 等・api の channel 等）は各アプリ側で
 *  `Note & {…}` の交差型 or `interface … extends Note` で足す＝ここには持ち込まない。 */
export interface Note {
  pitch: number;
  start: number;
  dur: number;
  vel?: number;       // ベロシティ（省略時はデータ層/再生側の既定）
  syllable?: string;  // 歌詞の音節割当（design #16）
}

// 歌詞↔メロ プロソディ（WP-M5・design #13b）＝モーラ分割/リズム型候補/アクセント整合の純関数。
export * from "./prosody";

// メロ候補の並べ替えレンズ3種（WP-M3・design #12-M「候補レンズ」）＝純TS・記号のみ・音源不要。
// api/web が @cm/music-core から引く（voiceLeading 分析レンズと同格の共有純関数）。
export * from "./melodyLenses";

/** ピッチクラス(0-11)の音名。旧 web `PITCH_NAMES` / api `KEY_NAMES` の同一配列を1本化。
 *  型は既存に合わせ `string[]`（web の `PITCH_NAMES.indexOf(root: string)` 等の互換のため as const にしない）。 */
export const PITCH_NAMES: string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * コード品質 → ルートからの半音インターバル（C基準・度数はルートから上向き）。
 * 旧 api `theory.ts` と web `music.ts` の QUALITY_INTERVALS（34品質・完全一致）を1本化。
 * 9系は 9度=14→pc2 のようにテンションも pc 正しく積める。property test（chord-quality）で担保。
 */
export const QUALITY_INTERVALS: Record<string, number[]> = {
  // 三和音
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  // 7th
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10], // ハーフディミニッシュ
  dim7: [0, 3, 6, 9], // フルディミニッシュ7
  aug7: [0, 4, 8, 10], // =7#5
  "7b5": [0, 4, 6, 10],
  mM7: [0, 3, 7, 11], // m(maj7)
  "7sus4": [0, 5, 7, 10],
  // 6th
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  // テンション（9系は 9度=14→pc2）
  "9": [0, 4, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  m9: [0, 3, 7, 10, 2],
  add9: [0, 4, 7, 2],
  "69": [0, 4, 7, 9, 2], // 6/9
  m69: [0, 3, 7, 9, 2],
  // altered / extended dominant
  "7b9": [0, 4, 7, 10, 1],
  "7#9": [0, 4, 7, 10, 3],
  "7#11": [0, 4, 7, 10, 6],
  "13": [0, 4, 7, 10, 2, 9],
  "11": [0, 4, 7, 10, 2, 5],
  m11: [0, 3, 7, 10, 2, 5],
  m13: [0, 3, 7, 10, 2, 9],
  maj13: [0, 4, 7, 11, 2, 9],
  "maj7#11": [0, 4, 7, 11, 6],
};

const PC_BY_NAME: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** root を 0-11 ピッチクラスへ。int はそのまま、"C#"/"Db" 等の音名（#♯/b♭ 複数可）も解釈。 */
export function normRoot(root: number | string): number {
  if (typeof root === "number") return ((Math.trunc(root) % 12) + 12) % 12;
  const s = String(root).trim();
  if (!s) return 0;
  let base = PC_BY_NAME[s[0]!.toUpperCase()] ?? 0;
  for (const ch of s.slice(1)) {
    if (ch === "#" || ch === "♯") base++;
    else if (ch === "b" || ch === "♭") base--;
  }
  return ((base % 12) + 12) % 12;
}

// 品質エイリアス（表記ゆれ→QUALITY_INTERVALS の正準キー）。2026-07-08 総点検：未知品質が黙って
// メジャートライアドに落ち「min7」等のマイナーコードがメジャー化していた（旧: メロ側のスケール∩コード
// スナップで偶然隠蔽＝コード音優先スナップ化で露出）。
const QUALITY_ALIASES: Record<string, string> = {
  min: "m", min7: "m7", mi: "m", mi7: "m7", "-": "m", "-7": "m7",
  M7: "maj7", "△": "maj7", "△7": "maj7", Maj7: "maj7",
  "°": "dim", "°7": "dim7", o: "dim", o7: "dim7", "ø": "m7b5", "ø7": "m7b5",
  "+": "aug", minmaj7: "mM7", mmaj7: "mM7", "m(maj7)": "mM7",
};

/** 品質の正準キー化（表記ゆれ→QUALITY_INTERVALS のキー）。未知はそのまま返す（呼び側でフォールバック）。 */
export function canonicalQuality(quality: string): string {
  const q = quality ?? "";
  if (QUALITY_INTERVALS[q]) return q;
  const a = QUALITY_ALIASES[q];
  return a !== undefined ? a : q;
}

/** コードの構成ピッチクラス（0-11）。エイリアス解決→未知 quality は短調系接頭ならマイナー、他はメジャートライアド扱い。 */
export function chordPcs(root: number | string, quality: string): number[] {
  const r = normRoot(root);
  const q = quality ?? "";
  const alias = QUALITY_ALIASES[q];
  const ivals =
    QUALITY_INTERVALS[q] ??
    (alias !== undefined ? QUALITY_INTERVALS[alias] : undefined) ??
    (/^(m|min|dim)/.test(q) && !/^maj/i.test(q) ? [0, 3, 7] : [0, 4, 7]);
  return ivals.map((i) => (r + i) % 12);
}

// ── フィール層（2026-07-11・design.md「フィール層分離」／研究 2026-07-11-swing-feel-layer-audit.md）──
// スイング/微小タイミングは performative＝ストレート格子(SSOT)に**後からかける非破壊のタイムマップ**。
// api(生成/MIDI書き出し)・web(再生)で**単一実装を共有**（dual実装のドリフト回避）。移調/テンポ不変の純関数
// ＝music-core の趣旨に合致。Note 型は持ち込まず {start,dur} にジェネリック（pitch/vel等は透過）。
export type Feel = {
  swing?: number;                     // 0..1（0=ストレート・1=3連2/3＝2:1）
  swingUnit?: "eighth" | "sixteenth"; // 跳ねの単位（既定 eighth＝拍内の8分ペア／sixteenth＝8分内の16分ペア）
  humanize?: number;                  // 0..1（微小タイミング揺れ・velocity はデータ層＝ここでは扱わない）
  seed?: number;                      // humanize の決定的シード
};
export type FeelCtx = { barLen?: number; compound?: boolean; tempo?: number };

const feelR3 = (x: number): number => Math.round(x * 1000) / 1000;
const feelClamp01 = (x: number): number => Math.max(0, Math.min(1, x));
function feelRng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 拍内タイムワープ W_s：窓 w（8分スイング=1拍／16分スイング=0.5拍）ごとに局所 u∈[0,1) を区分線形写像。
// 折れ点 u=0.5 → 0.5+s/6（s=1で 2/3）。両区間の傾き (1±s/3)>0 ＝**単調**。窓境界で連続＝全体で順序保存。
export function warpTime(t: number, s: number, w: number): number {
  if (s <= 0) return t;
  const k = Math.floor(t / w + 1e-9);
  const base = k * w;
  const u = (t - base) / w;
  const bp = 0.5 + s / 6;
  const Wu = u <= 0.5 ? u * (bp / 0.5) : bp + (u - 0.5) * ((1 - bp) / 0.5);
  return base + Wu * w;
}
// 逆写像（単調全単射ゆえ存在）＝quantize/往復編集用。swing のみ（humanize は非可逆な揺れ）。
export function unwarpTime(t: number, s: number, w: number): number {
  if (s <= 0) return t;
  const k = Math.floor(t / w + 1e-9);
  const base = k * w;
  const y = (t - base) / w;
  const bp = 0.5 + s / 6;
  const u = y <= bp ? y * (0.5 / bp) : 0.5 + (y - bp) * (0.5 / (1 - bp));
  return base + u * w;
}

// notes（ストレート格子）→ feel 適用後の新配列（入力不変＝純関数）。feel 空/0＝恒等（bit一致）。
// ①swing ワープ（start/end両写像・compoundはskip・単調ゆえ順序不変）→②humanize タイミング揺れ
// （ワープ後の時間上・端音不動・前音を越えない・velocity は触らない＝データ層）の順。
export function applyFeel<T extends { start: number; dur: number }>(notes: readonly T[], feel: Feel | null | undefined, ctx: FeelCtx = {}): T[] {
  const out: T[] = notes.map((n) => ({ ...n }));
  if (!feel) return out;
  const sw = feelClamp01(feel.swing ?? 0);
  const hum = feelClamp01(feel.humanize ?? 0);

  if (sw > 0 && !ctx.compound) {
    const w = feel.swingUnit === "sixteenth" ? 0.5 : 1.0;
    for (const n of out) {
      const s2 = warpTime(n.start, sw, w);
      const e2 = warpTime(n.start + n.dur, sw, w);
      n.start = feelR3(s2);
      n.dur = feelR3(Math.max(0, e2 - s2));
    }
  }

  if (hum > 0 && out.length > 2) {
    const hr = feelRng((feel.seed ?? 1) + 29);
    const decay = 0.6;
    let te = 0;
    for (let i = 1; i < out.length - 1; i++) {
      te = decay * te + (1 - decay) * (hr() * 2 - 1);
      const ns = feelR3(out[i]!.start + hum * te * 0.03);
      if (ns > out[i - 1]!.start + 0.02) out[i]!.start = ns;
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < out.length; i++) { const g = out[i + 1]!.start - out[i]!.start; if (g > 0) out[i]!.dur = Math.min(out[i]!.dur, feelR3(g)); }
  }

  return out;
}
