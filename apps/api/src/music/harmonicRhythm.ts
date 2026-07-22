// 和声リズム制御（⑨・第1スライス＝後処理スプリット/マージ・立場B採用／design #30・2026-07-22）。
// 正典＝docs/research/2026-07-21-melody-note-value-and-harmonic-rhythm.md §2/§5.2 ＋ design #30。
// 思想＝realize 済み実音コード列へ SPLIT/MERGE/KEEP の3原始操作を決定的（rng 不使用）に適用。
// 既定OFF＝spec 空は identity（入力配列を参照返し）＝bit一致。ガード側(generate.ts)でも実在チェック＝二重の安全。
import { type Mode } from "./function";

export type HRChord = { root: number; quality: string; start: number; dur: number; bass?: number };
export type HarmonicRhythmSpec = { preset?: "cadenceAccel" | "drive" | "sustain"; pattern?: number[] };
export type HRCtx = { key: number; mode: Mode; bpb: number; bars: number; colorful: boolean };
export type ApplyHarmonicRhythmResult = { chords: HRChord[]; warnings: string[] };

const round3 = (x: number): number => Math.round(x * 1000) / 1000;
// 度数＝調主音(key)からの半音距離（0=I/i・7=V・5=IV）。
const deg = (root: number, key: number): number => (((Math.trunc(root) - Math.trunc(key)) % 12) + 12) % 12;

// 隣接同一（root+quality+bass 一致）を1枠へ畳む（dur 加算・偽の再打鍵を残さない・audio-chords 畳み semantics と一致）。
function collapse(chords: HRChord[]): HRChord[] {
  const out: HRChord[] = [];
  for (const c of chords) {
    const last = out[out.length - 1];
    if (last && last.root === c.root && last.quality === c.quality && last.bass === c.bass) {
      last.dur = round3(last.dur + c.dur);
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

// dev 不変条件バリデータ（警告のみ・chords は書き換えない＝生成後構造バリデータ常設の先例と同流儀 git ce919ff/0869707）。
// Σdur===bars*bpb・start 単調増・隙間/重複ゼロ・start/dur が 0.5*bpb か整数拍の倍数、を検査。
function validateInvariants(chords: HRChord[], ctx: HRCtx): string[] {
  const w: string[] = [];
  const { bpb, bars } = ctx;
  const halfBar = bpb / 2;
  const onGrid = (v: number): boolean => {
    const isIntMul = Math.abs(v - Math.round(v)) < 1e-6;
    const isHalfMul = Math.abs(v / halfBar - Math.round(v / halfBar)) < 1e-6;
    return isIntMul || isHalfMul;
  };
  let total = 0;
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i]!;
    total += c.dur;
    if (i === 0 && Math.abs(c.start) > 1e-6) w.push(`和声リズム: 先頭 start=${c.start}≠0`);
    if (i > 0) {
      const prev = chords[i - 1]!;
      if (c.start <= prev.start - 1e-6) w.push(`和声リズム: start 非単調（index ${i}）`);
      const prevEnd = round3(prev.start + prev.dur);
      if (Math.abs(c.start - prevEnd) > 1e-6) w.push(`和声リズム: 隙間/重複（index ${i}: ${prevEnd}→${c.start}）`);
    }
    if (!onGrid(c.start) || !onGrid(c.dur)) w.push(`和声リズム: 格子外（index ${i}: start=${c.start} dur=${c.dur}）`);
  }
  if (Math.abs(round3(total) - bars * bpb) > 1e-6) w.push(`和声リズム: Σdur=${round3(total)}≠${bars * bpb}（bars*bpb）`);
  return w;
}

// preset cadenceAccel（終止加速・⑩のリズム版）。
// ① 発火＝deg(last)===0 かつ penult=素の V（deg7・bass 無し）→ penult を半小節 SPLIT（前半=IV〔colorful=IIm7〕・後半=元 V 色を継承）。
// ② skip+warn＝penult が分数ドミナント（bass の度数=7＝citypop の IV/V）→ 分割せず warnings。
// ③ KEEP＝上記以外（vii°/plagal/aeolian/loop の penult、transition で最終が非トニックになった場合＝deg(last)≠0 ゲートで自動排除）。
function cadenceAccel(chords: HRChord[], ctx: HRCtx): ApplyHarmonicRhythmResult {
  const { key, bpb, colorful } = ctx;
  const n = chords.length;
  if (n < 2) return { chords, warnings: [] };
  const last = chords[n - 1]!;
  const pen = chords[n - 2]!;
  if (deg(last.root, key) !== 0) return { chords, warnings: [] }; // ③（transition 非トニック終止を自動排除）
  // ② 分数ドミナント（citypop の IV/V）＝ドミナント柔化済ゆえ分割せず（v1）
  if (pen.bass !== undefined && deg(pen.bass, key) === 7 && deg(pen.root, key) !== 7) {
    return { chords, warnings: ["和声リズム(cadenceAccel): penult は既に分数ドミナント(IV/V)＝ドミナント柔化済ゆえ分割せず（v1）"] };
  }
  // ① 素の V を SPLIT
  if (deg(pen.root, key) === 7 && pen.bass === undefined) {
    const h = round3(bpb / 2);
    const first: HRChord = colorful
      ? { root: ((key + 2) % 12 + 12) % 12, quality: "m7", start: pen.start, dur: h }        // IIm7（colorful・実測 IIm→V は 0 件ゆえ colorful 限定）
      : { root: ((key + 5) % 12 + 12) % 12, quality: "", start: pen.start, dur: h };           // IV（実測最頻 IV→V 9 件）
    const second: HRChord = { ...pen, start: round3(pen.start + h), dur: round3(bpb - h) };     // 元 penult 和音の root/quality/bass を継承（V の色を保全）
    return { chords: [...chords.slice(0, n - 2), first, second, last], warnings: [] };
  }
  return { chords, warnings: [] }; // ③
}

// preset drive（畳み掛け・一律2/小節）。適格小節＝index 0..bars-3（penult/last を保護）を半小節 SPLIT（後半=次コード先取り）。
// collapse が勝つ＝先取り併合が起きるため受け入れは枠数でなく collapse 後の Σdur/境界で検査。
function drive(chords: HRChord[], ctx: HRCtx): ApplyHarmonicRhythmResult {
  const { bpb, bars } = ctx;
  const n = chords.length;
  const snap = chords.map((c) => ({ ...c })); // 併合前スナップショットに対して先取り（drive の入力を汚さない）
  const h = round3(bpb / 2);
  const out: HRChord[] = [];
  for (let i = 0; i < n; i++) {
    if (i <= bars - 3 && i + 1 < n) {
      const cur = snap[i]!;
      const nx = snap[i + 1]!;
      out.push({ ...cur, start: cur.start, dur: h });
      out.push({ root: nx.root, quality: nx.quality, ...(nx.bass !== undefined ? { bass: nx.bass } : {}), start: round3(cur.start + h), dur: round3(bpb - h) });
    } else {
      out.push({ ...snap[i]! });
    }
  }
  return { chords: out, warnings: [] };
}

// preset sustain（伸ばし・2小節1和音）。index ペア (0,1),(2,3)… のうち penult/last を含まぬペアのみ左貪欲 MERGE。bars<=3 は no-op。
// ⚠️実測裏付けゼロ（在DB 0/210）＝理論⑤（遅い和声リズム=静的）のみの支持。既定OFF で同梱・採否はオーナー耳が審判。
function sustain(chords: HRChord[], ctx: HRCtx): ApplyHarmonicRhythmResult {
  const { bars } = ctx;
  const n = chords.length;
  const out: HRChord[] = [];
  let i = 0;
  while (i < n) {
    // ペア (i,i+1) は i+1 が penult(bars-2) でも last(bars-1) でもない（i+1<=bars-3）なら MERGE。
    if (i + 1 < n && i + 1 <= bars - 3) {
      const a = chords[i]!;
      const b = chords[i + 1]!;
      out.push({ ...a, dur: round3(a.dur + b.dur) }); // k の dur を伸ばし k+1 を drop
      i += 2;
    } else {
      out.push({ ...chords[i]! });
      i += 1;
    }
  }
  return { chords: out, warnings: [] };
}

// 任意 pattern（拍配列・小節ごと循環・合計=bpb）。v1 は半小節/整数拍のみ（サブ拍境界は整数拍へ丸め＋warnings）。
// 分割枠 filler は「次コード先取り」。合計≠bpb は pattern を無視して identity＋warn。
function snapBeat(rel: number, bpb: number): number {
  const cands: number[] = [bpb / 2];
  for (let b = 0; b <= bpb; b++) cands.push(b);
  let best = cands[0]!, bd = Infinity;
  for (const c of cands) { const d = Math.abs(c - rel); if (d < bd) { bd = d; best = c; } }
  return best;
}
function applyPattern(chords: HRChord[], pattern: number[], ctx: HRCtx): ApplyHarmonicRhythmResult {
  const { bpb } = ctx;
  const warnings: string[] = [];
  const cleaned = pattern.filter((x) => typeof x === "number" && Number.isFinite(x) && x > 0);
  const sum = cleaned.reduce((a, b) => a + b, 0);
  if (cleaned.length === 0 || Math.abs(sum - bpb) > 1e-6) {
    warnings.push(`和声リズム pattern の合計(${round3(sum)})が拍/小節(${bpb})と不一致＝pattern を無視（v1）`);
    return { chords, warnings };
  }
  const n = chords.length;
  const out: HRChord[] = [];
  let subBeatWarned = false;
  for (let i = 0; i < n; i++) {
    const barStart = chords[i]!.start;
    const bounds: number[] = [0];
    let off = 0;
    for (const d of cleaned) { off += d; bounds.push(off); }
    for (let j = 1; j < bounds.length - 1; j++) {
      const raw = bounds[j]!;
      const snapped = snapBeat(raw, bpb);
      if (Math.abs(snapped - raw) > 1e-6 && !subBeatWarned) {
        warnings.push("和声リズム pattern にサブ拍境界＝整数拍/半小節へ丸め（v1・下段整数拍サンプラの取りこぼし回避）");
        subBeatWarned = true;
      }
      bounds[j] = snapped;
    }
    for (let j = 0; j < bounds.length - 1; j++) {
      const s = bounds[j]!, e = bounds[j + 1]!;
      const dur = round3(e - s);
      if (dur <= 1e-6) continue; // 丸めで潰れた枠は drop
      const src = chords[Math.min(i + j, n - 1)]!; // filler=次コード先取り
      out.push({ root: src.root, quality: src.quality, ...(src.bass !== undefined ? { bass: src.bass } : {}), start: round3(barStart + s), dur });
    }
  }
  return { chords: out, warnings };
}

/** 実音コード列へ和声リズム制御を適用。spec 空は identity（入力配列を参照返し＝bit一致）。返り {chords, warnings}。 */
export function applyHarmonicRhythm(chords: HRChord[], spec: HarmonicRhythmSpec | undefined | null, ctx: HRCtx): ApplyHarmonicRhythmResult {
  const hasPattern = !!spec && Array.isArray(spec.pattern) && spec.pattern.length > 0;
  if (!spec || (!spec.preset && !hasPattern)) return { chords, warnings: [] }; // 空 spec=identity（参照返し）
  let res: ApplyHarmonicRhythmResult;
  if (spec.preset === "cadenceAccel") res = cadenceAccel(chords, ctx);
  else if (spec.preset === "drive") res = drive(chords, ctx);
  else if (spec.preset === "sustain") res = sustain(chords, ctx);
  else if (hasPattern) res = applyPattern(chords, spec.pattern!, ctx);
  else return { chords, warnings: [] }; // 未知 preset＝無変換
  const collapsed = collapse(res.chords); // 隣接同一を畳む
  const warnings = [...res.warnings, ...validateInvariants(collapsed, ctx)];
  return { chords: collapsed, warnings };
}
