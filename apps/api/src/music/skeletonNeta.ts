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
// ※S3b：休符の「表面を鳴らさない」根治は別チャネル skeletonRestMask（下）が担う＝ここは生成の内部足場（アンカー）
//   なので carry-forward のまま据え置く（アンカーは耳に直接出ない・最終出力で当該区間を抑制すれば無音になる）。
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

// 骨格休符マスク（design #20 S3b）：SkeletonContent → pitch:null の支配区間を {start,end}[]（拍単位・昇順）で返す。
// 「骨格に休符（句頭遅延入場などの間）がある区間＝表面でも音を出さない」の根治用チャネル。genMotifMelodyV2 の
// restMask opts に渡し、全後処理の後（return直前）で①区間内 onset を落とす②区間へ食い込む dur を区間頭で切る。
// pitch:null が無い骨格（＝従来）は空配列＝呼び出し側で丸ごとスキップ＝bit一致。beatsPerBar は V2 の barLen に合わせる。
export function skeletonRestMask(content: SkeletonContent, opts: { beatsPerBar?: number } = {}): { start: number; end: number }[] {
  const bpb = opts.beatsPerBar ?? 4;
  const segs = expandDominion(content, { beatsPerBar: bpb });
  const out: { start: number; end: number }[] = [];
  for (const s of segs) if (s.pitch == null && s.dur > 1e-9) out.push({ start: s.start, end: s.start + s.dur });
  return out;
}

// V2 句割りアダプタ（design #20 S3a）：骨格の phrases（句末拍 endBeat 列）→ genMotifMelodyV2 が使う
// phrases 表現 {startBeat, beats, cadenceDegree}[]（可変長ブロック・breathe句頭遅延・句末カデンツ着地の受け口）。
// endBeat 列で [0,total] を分割＝startBeat=前句末（先頭0）・beats=区間長。cadence ラベル→着地度数：
// half=5(属音・半終止)/full=1(主音・完全終止)/無指定・未知=位置既定（最終句=1主音・非最終=5属音＝planSkeleton慣習）。
// phrases 無し（未指定/空）＝undefined を返す＝呼び出し側は従来 frame phrasing 由来へフォールバック＝bit一致。
export function skeletonPhrasesToV2(
  content: SkeletonContent,
  opts: { beatsPerBar?: number } = {},
): { startBeat: number; beats: number; cadenceDegree: number }[] | undefined {
  const phrases = content.phrases;
  if (!phrases || phrases.length === 0) return undefined;
  const bpb = opts.beatsPerBar ?? 4;
  const total = content.bars * bpb;
  const sorted = [...phrases].sort((a, b) => a.endBeat - b.endBeat);
  const out: { startBeat: number; beats: number; cadenceDegree: number }[] = [];
  let prev = 0;
  for (let i = 0; i < sorted.length; i++) {
    const end = Math.min(sorted[i]!.endBeat, total);
    if (end <= prev + 1e-9) continue; // 非増加/重複/範囲外は握り潰す（防御・validate済みでも安全側）
    out.push({ startBeat: prev, beats: end - prev, cadenceDegree: cadenceToDegree(sorted[i]!.cadence, i === sorted.length - 1) });
    prev = end;
  }
  // 末尾の未被覆区間（最後の endBeat < total）＝残りを1句として主音で閉じる（防御・通常は endBeat 末=total）。
  if (prev < total - 1e-9) out.push({ startBeat: prev, beats: total - prev, cadenceDegree: 1 });
  return out.length ? out : undefined;
}

// 終止ラベル→着地度数。V2 が解する 5(属音)/2(上主音)/その他(主音) へ寄せる。無指定/未知は位置で既定。
function cadenceToDegree(cadence: string | undefined, isLast: boolean): number {
  const c = (cadence ?? "").trim().toLowerCase();
  if (c === "half" || c === "hc" || c === "half_cadence") return 5;
  if (c === "full" || c === "authentic" || c === "perfect" || c === "pac" || c === "iac" || c === "full_cadence") return 1;
  if (c === "supertonic" || c === "2") return 2;
  return isLast ? 1 : 5; // planSkeleton慣習：最終句=主音（答え）/非最終句=属音（問い）
}

// 明示ベースの支配区間（design #20 S3c＝ベース表面化）。**web の apps/web/src/skeletonEdit.ts の
// explicitBassSegments と同一規則＝表示（web プレビュー）と生成（api genBass）で explicit/derived の切替が一致**。
// 規則：各明示点は次の明示点まで支配。**最後の明示点は「直前間隔ぶん」だけ支配→以降は導出へ復帰**（単独点は2拍）
// ＝単独ペダル点が曲全体を支配してしまう expandDominion(line:"bass") とは意図的に異なる（「書いた区間だけ上書き」）。
// 句境界(endBeat)は支配を打ち切る＝句末で導出に戻る。pitch:null＝骨格ベース休符（当該区間はベースを鳴らさない）。
// bass 未指定/空＝空配列＝呼び出し側（genBass）は全区間コード導出＝従来と bit 一致。
export function explicitBassSegments(content: SkeletonContent, opts: { beatsPerBar?: number } = {}): SkeletonSegment[] {
  const bpb = opts.beatsPerBar ?? 4;
  const total = content.bars * bpb;
  const pts = [...(content.bass ?? [])].sort((a, b) => a.start - b.start);
  const bounds = (content.phrases ?? []).map((p) => p.endBeat);
  const out: SkeletonSegment[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i]!.start;
    if (s >= total - 1e-9) break;
    // 次の明示点まで／最後の点は直前間隔ぶん（導出が復帰できる・単独点は2拍）。
    let e = i + 1 < pts.length ? pts[i + 1]!.start : s + (pts.length > 1 ? s - pts[i - 1]!.start : 2);
    e = Math.min(e, total);
    for (const b of bounds) if (b > s + 1e-9 && b < e - 1e-9) e = b; // 句をまたがない＝句末で導出に戻る
    if (e <= s + 1e-9) continue;
    out.push({ start: s, dur: e - s, pitch: pts[i]!.pitch });
  }
  return out;
}

// 明示ベースピッチ（絶対 MIDI）を genBass の低域窓 [lo,hi]（既定 33..55＝A1..G3）へオクターブで畳む。
// 在域なら保持・外なら最寄り oct へ寄せ、最後に clamp（web derivedBassPitch の C2 帯慣行に倣う低域化）。
export function foldBassPitch(pitch: number, lo = 33, hi = 55): number {
  let p = pitch;
  while (p < lo) p += 12;
  while (p > hi) p -= 12;
  return Math.max(lo, Math.min(hi, p));
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
