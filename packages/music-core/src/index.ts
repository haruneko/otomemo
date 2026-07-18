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

// シンコペ密度スコア＋「ノリ」レンズ（WP-D2・2026-07-14）＝純TS・onset/拍子のみ・音源不要。
export * from "./syncopation";

// 和声張力カーブレンズ（WP-C4・2026-07-14）＝TIS（DFT→6D TIV→μ/θ）で進行の張力プロファイルを計算し
// 役割別の目標帯へ適合score・モーダルループで自動降格。純TS・度数+品質+key のみ・音源不要（メロレンズと同格）。
export * from "./harmonicTension";

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
// humanize 知覚較正（WP-D2・2026-07-14・研究 2026-07-14-humanize-perception-defaults.md §③⑥）。
// 部位別 timing SD/系統オフセット/リミット（ms）。SD は「既定ノブ25%＝この値」の基準（ノブは線形スケール）。
export type HumanizePart = "kick" | "snare" | "hihat" | "bass" | "melody" | "chords";
type HumanizeProfile = { sd: number; offset: number; limit: number };
// K=基準杭(最小)・Snare=laid-back(+offset・early禁)・Hihat=表情主担当・Bass=kick追従(小)・Melody=最自由。
const HUMANIZE_PROFILES: Record<HumanizePart, HumanizeProfile> = {
  kick:   { sd: 3,  offset: 0, limit: 20 },
  snare:  { sd: 4,  offset: 4, limit: 20 },
  hihat:  { sd: 7,  offset: 1, limit: 20 },
  bass:   { sd: 4,  offset: 0, limit: 30 },
  chords: { sd: 8,  offset: 3, limit: 35 },
  melody: { sd: 10, offset: 5, limit: 40 },
};
const HUMANIZE_DEFAULT: HumanizeProfile = { sd: 8, offset: 2, limit: 40 };
export const HUMANIZE_YORE_MS = 40; // 単発ずれの「ヨレ」閾（研究 §②・専門家 +40% 苛立ち帯）
export function humanizeProfile(part?: HumanizePart): HumanizeProfile {
  return (part && HUMANIZE_PROFILES[part]) || HUMANIZE_DEFAULT;
}
// テンポ帯倍率（研究 §⑥）：速い分割は絶対6ms前後で潰れる→詰める／遅いは緩める余地。
function humanizeTempoMul(tempo: number): number {
  return tempo >= 140 ? 0.7 : tempo <= 90 ? 1.3 : 1.0;
}
export interface HumanizeWarn { kind: "humanize-yore"; part: HumanizePart | "default"; peakMs: number }

export type FeelCtx = {
  barLen?: number;
  compound?: boolean;
  tempo?: number;
  part?: HumanizePart;                     // humanize 部位（未指定＝default プロファイル）
  onWarn?: (w: HumanizeWarn) => void;      // ヨレ警告（設定が単発40ms超え得る時・決定的・RNG非依存）
};

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

// 1/f（ピンク）ノイズ＝Voss-McCartney（決定的・出力[-1,1]）。研究 §①＝白色でなく長距離相関が人間寄り（Hennig）。
// nOct 個の乱数源を 2^k ステップ毎に更新し平均＝低周波が強い相関系列。同 seed 同系列（bit 再現性）。
export function pink1f(seed: number, n: number, nOct = 5): number[] {
  const rng = feelRng(seed);
  const src = new Array<number>(nOct);
  for (let k = 0; k < nOct; k++) src[k] = rng() * 2 - 1;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < nOct; k++) if (i % (1 << k) === 0) src[k] = rng() * 2 - 1;
    let s = 0;
    for (let k = 0; k < nOct; k++) s += src[k]!;
    s /= nOct;
    out[i] = s < -1 ? -1 : s > 1 ? 1 : s; // 安全クランプ（拍比経路の上限保証）
  }
  return out;
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
    // ①1/f（ピンク）ノイズ＝白色でなく長距離相関（研究 §①・Hennig）。決定的（seed 派生）。
    const pink = pink1f((feel.seed ?? 1) + 29, out.length);
    const tempo = ctx.tempo;
    const useMs = typeof tempo === "number" && tempo > 0; // tempo 指定時のみ ms 絶対時間＋部位別。
    if (useMs) {
      // ②ms 絶対時間＋部位別リミット（研究 §②③⑥）。ノブ 25%＝表 SD の基準・100% で 4 倍（＝盛り上限帯）。
      const prof = humanizeProfile(ctx.part);
      const mul = humanizeTempoMul(tempo!);
      const msPerBeat = 60000 / tempo!;
      // ③ヨレ警告＝設定が単発 40ms を超え得る（決定的・RNG 非依存）。既定帯（hum≤0.3）では未発火。
      const peakMs = 4 * hum * prof.sd * mul;
      if (ctx.onWarn && peakMs > HUMANIZE_YORE_MS) ctx.onWarn({ kind: "humanize-yore", part: ctx.part ?? "default", peakMs: Math.round(peakMs * 10) / 10 });
      const lim = prof.limit;
      for (let i = 1; i < out.length - 1; i++) {
        let ms = 4 * hum * prof.sd * mul * pink[i]! + hum * prof.offset * mul; // 系統オフセット（laid-back +）は 4倍せず薄く。
        if (ms > lim) ms = lim; else if (ms < -lim) ms = -lim;                  // 部位別クランプ（超過は据え置き）。
        const ns = feelR3(out[i]!.start + ms / msPerBeat);
        if (ns > out[i - 1]!.start + 0.02) out[i]!.start = ns;
      }
    } else {
      // tempo 無指定＝従来同等の拍比スケール（上限 0.031 拍を維持）。1/f 化のみ反映。
      for (let i = 1; i < out.length - 1; i++) {
        const ns = feelR3(out[i]!.start + hum * pink[i]! * 0.03);
        if (ns > out[i - 1]!.start + 0.02) out[i]!.start = ns;
      }
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 0; i + 1 < out.length; i++) { const g = out[i + 1]!.start - out[i]!.start; if (g > 0) out[i]!.dur = Math.min(out[i]!.dur, feelR3(g)); }
  }

  return out;
}

// 部位間の seed salt＝各パートの 1/f 系列を非相関化（同 seed だと全パートが同時に同じ向きへよろける不自然さ）。
// undefined（default プロファイル）＝salt 0。値は任意（互いに素っぽく散らすだけ・決定性には無関係）。
export const PART_SEED_SALT: Record<HumanizePart, number> = {
  kick: 11, snare: 23, hihat: 37, bass: 53, chords: 67, melody: 83,
};

// applyFeel を部位別に被せる薄いラッパ（#29 P1）。notes を partOf でグループ化し、各グループへ
// 部位別プロファイル（FeelCtx.part）＋seed salt で applyFeel を掛け、元の位置へ書き戻す。
// 契約（bit 一致の線引き）：
//  ・feel 無し ⇒ **入力そのまま返す**（同一参照・map もしない）。
//  ・humanize<=0（swing のみ）⇒ applyFeel を**1回だけ**呼ぶ＝現行と完全一致（swing は per-note 独立写像で分割は無関係）。
//  ・humanize>0 ⇒ 部位別化（意図的変化）。決定性のみ保証（同 seed 同出力）・音数/多重集合は不変（並べ替えのみ）。
export function applyFeelByPart<T extends { start: number; dur: number }>(
  notes: readonly T[],
  feel: Feel | null | undefined,
  ctx: FeelCtx,
  partOf: (n: T) => HumanizePart | undefined,
): T[] {
  if (!feel) return notes as T[]; // 無 feel＝恒等（同一参照）＝呼び側の if(feel) ガードと二重で bit 安全。
  const hum = feelClamp01(feel.humanize ?? 0);
  if (hum <= 0) return applyFeel(notes, feel, ctx); // swing のみ＝単一 applyFeel＝現行一致。
  // humanize>0：partOf でグループ化（undefined グループ含む）→ 部位別プロファイル＋seed salt で decorrelate。
  const groups = new Map<HumanizePart | undefined, { idx: number[]; notes: T[] }>();
  notes.forEach((n, i) => {
    const p = partOf(n);
    let g = groups.get(p);
    if (!g) { g = { idx: [], notes: [] }; groups.set(p, g); }
    g.idx.push(i);
    g.notes.push(n);
  });
  const out = new Array<T>(notes.length);
  for (const [part, g] of groups) {
    const salt = part ? PART_SEED_SALT[part] : 0;
    const felt = applyFeel(g.notes, { ...feel, seed: (feel.seed ?? 1) + salt }, { ...ctx, part });
    // グループ j 番目の出力を元の位置 origIdx[j] へ（長さ・多重集合を保存。humanize 内 sort による同時刻近傍の
    // 入れ替わりは許容＝スケジューラ/MIDI は順序非依存）。
    g.idx.forEach((origIdx, j) => { out[origIdx] = felt[j]!; });
  }
  return out;
}
