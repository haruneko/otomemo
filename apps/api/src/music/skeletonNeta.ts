// 骨格層の一級化（design #20・2026-07-11）。kind="skeleton" の content 契約とその変換群。
// 骨格＝ブレークポイント方式（GTTM time-span / Schenker prolongation）。各構造音は「次のブレークポイント
// （または句境界／曲末）まで」を支配する＝dur を持たない。pitch:null＝骨格休符（支配音の無い区間）。
// 純関数のみ。生成器(generate.ts)へは一方向依存（ここは generate.ts を import しない＝循環回避）。

export interface SkeletonBreakpoint {
  start: number; // 句頭からの拍位置（四分基準・昇順）
  pitch: number | null; // MIDI 絶対（key/mode カラム基準・移調は配置時）。null=骨格休符
}
export interface SkeletonPhrase {
  endBeat: number; // 句末の拍位置（構造情報＝骨格が持つ。実際の息継ぎ長は表面の持ち物）
  cadence?: string; // 終止型ラベル（full/half 等・任意）
}
export interface SkeletonContent {
  bars: number;
  tones: SkeletonBreakpoint[]; // 上声（Urlinie 近似）のブレークポイント列
  bass?: SkeletonBreakpoint[]; // 下声（Bassbrechung）。省略時はコード root から導出＝明示は例外のみ
  phrases?: SkeletonPhrase[];
}
export interface SkeletonSegment {
  start: number;
  dur: number;
  pitch: number | null;
}

// バリデーション。返り＝エラー文字列の配列（空＝正当）。範囲判定に拍数(beatsPerBar)が要る＝既定4/4。
export function validateSkeletonContent(content: unknown, opts: { beatsPerBar?: number } = {}): string[] {
  const errs: string[] = [];
  if (!content || typeof content !== "object") return ["content is not an object"];
  const c = content as Partial<SkeletonContent>;
  const bpb = opts.beatsPerBar ?? 4;
  if (!(typeof c.bars === "number" && Number.isInteger(c.bars) && c.bars > 0)) {
    errs.push("bars must be a positive integer");
  }
  const total = (typeof c.bars === "number" ? c.bars : 0) * bpb;
  const checkLine = (name: string, line: unknown, required: boolean): void => {
    if (line == null) {
      if (required) errs.push(`${name} is required`);
      return;
    }
    if (!Array.isArray(line)) { errs.push(`${name} must be an array`); return; }
    if (required && line.length === 0) errs.push(`${name} must be non-empty`);
    let prev = -Infinity;
    for (let i = 0; i < line.length; i++) {
      const bp = line[i] as Partial<SkeletonBreakpoint>;
      if (!bp || typeof bp !== "object") { errs.push(`${name}[${i}] is not an object`); continue; }
      if (!(typeof bp.start === "number" && Number.isFinite(bp.start))) { errs.push(`${name}[${i}].start must be a finite number`); continue; }
      if (bp.start < 0) errs.push(`${name}[${i}].start must be >= 0`);
      if (total > 0 && bp.start >= total) errs.push(`${name}[${i}].start (${bp.start}) is out of range [0,${total})`);
      if (bp.start <= prev) errs.push(`${name} must be strictly ascending by start (at index ${i})`);
      prev = bp.start;
      if (bp.pitch != null && !(typeof bp.pitch === "number" && Number.isInteger(bp.pitch) && bp.pitch >= 0 && bp.pitch <= 127)) {
        errs.push(`${name}[${i}].pitch must be null or an integer in [0,127]`);
      }
    }
  };
  checkLine("tones", c.tones, true);
  checkLine("bass", c.bass, false);
  if (c.phrases != null) {
    if (!Array.isArray(c.phrases)) errs.push("phrases must be an array");
    else {
      let prev = -Infinity;
      for (let i = 0; i < c.phrases.length; i++) {
        const p = c.phrases[i] as Partial<SkeletonPhrase>;
        if (!p || typeof p !== "object") { errs.push(`phrases[${i}] is not an object`); continue; }
        if (!(typeof p.endBeat === "number" && Number.isFinite(p.endBeat))) { errs.push(`phrases[${i}].endBeat must be a finite number`); continue; }
        if (p.endBeat <= 0) errs.push(`phrases[${i}].endBeat must be > 0`);
        if (total > 0 && p.endBeat > total + 1e-9) errs.push(`phrases[${i}].endBeat (${p.endBeat}) exceeds total ${total}`);
        if (p.endBeat <= prev) errs.push(`phrases must be strictly ascending by endBeat (at index ${i})`);
        prev = p.endBeat;
      }
    }
  }
  return errs;
}

// 支配区間展開：ブレークポイント列 → {start, dur, pitch|null}[]。各音は次のブレークポイント
// （句境界 phrases があれば句をまたがない）または曲末まで支配。line 未指定＝tones を使う。
export function expandDominion(content: SkeletonContent, opts: { beatsPerBar?: number; line?: "tones" | "bass" } = {}): SkeletonSegment[] {
  const bpb = opts.beatsPerBar ?? 4;
  const total = content.bars * bpb;
  const raw = (opts.line === "bass" ? content.bass : content.tones) ?? [];
  const tones = [...raw].sort((a, b) => a.start - b.start);
  const bounds = (content.phrases ?? []).map((p) => p.endBeat).filter((b) => b > 0 && b < total - 1e-9);
  const out: SkeletonSegment[] = [];
  for (let i = 0; i < tones.length; i++) {
    const start = tones[i]!.start;
    if (start >= total - 1e-9) break;
    let end = i + 1 < tones.length ? tones[i + 1]!.start : total;
    for (const pb of bounds) if (pb > start + 1e-9 && pb < end - 1e-9) end = pb; // 句をまたがない
    if (end <= start + 1e-9) continue;
    out.push({ start, dur: end - start, pitch: tones[i]!.pitch });
  }
  return out;
}

// V2 骨格アダプタ：SkeletonContent → genMotifMelodyV2 が使う骨格表現（number[] 長さ bars*beatsPerBar・
// 1拍粒度で支配音を保持＝genSkeletonFromModel の返り形と同一）。骨格休符/未支配区間は直前の実音を保持
// （V2 の blockAnchorFromSkeleton はブロック頭の拍で anchor pitch を読む＝null を置けないため carry-forward）。
export function skeletonToV2Skel(content: SkeletonContent, opts: { beatsPerBar?: number; fallbackPitch?: number } = {}): number[] {
  const bpb = opts.beatsPerBar ?? 4;
  const total = content.bars * bpb;
  const segs = expandDominion(content, { beatsPerBar: bpb });
  const firstReal = content.tones.find((t) => t.pitch != null)?.pitch;
  let lastReal = firstReal ?? opts.fallbackPitch ?? 60;
  const out: number[] = new Array(total);
  for (let b = 0; b < total; b++) {
    const seg = segs.find((s) => b >= s.start - 1e-9 && b < s.start + s.dur - 1e-9);
    if (seg && seg.pitch != null) { out[b] = seg.pitch; lastReal = seg.pitch; }
    else out[b] = lastReal; // 休符/未支配＝直前の実音を anchor に流用
  }
  return out;
}

// 逆変換：genSkeletonFromModel の返り（1拍粒度・保持済み number[]）→ ブレークポイント列。
// ピッチが直前拍から変わる位置にだけ点を置く＝dur を持たない骨格へ圧縮。
export function skelArrayToBreakpoints(skel: number[]): SkeletonBreakpoint[] {
  const out: SkeletonBreakpoint[] = [];
  let prev: number | null = null;
  for (let b = 0; b < skel.length; b++) {
    const p = skel[b]!;
    if (prev === null || p !== prev) { out.push({ start: b, pitch: p }); prev = p; }
  }
  return out;
}
