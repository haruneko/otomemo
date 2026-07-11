// リズムパーツ層 L1 プリセット（design #20 S4-1・表面化オプション＝一級netaにしない・api内の名前付き定数）。
// パーツ＝1小節の16分オンセットパターン（V2 RHYTHM16 と同じ「x=onset/.=無」16枠表現）。音価はパターンの疎密が決める
// ＝V2 render が「次onsetまでの gap を dur で埋める」ので疎なパターン＝白玉/長音（agogic 対比＝backlog「音価不足」の解）。
// POP909 の RHYTHM16 語彙統計（x...............=最頻732 / x.x.x.x.x.x.x.x.=362 / x.x.x.x.x.......=296 等）＋
// 音楽的キュレーションで10個。長音（whole/half2/dotted/driveHold）を必ず含める＝音価コントラストの担保。

export type RhythmPartPreset = { id: string; label: string; pattern: string; intent: string };

// pattern は必ず16文字（4拍×16分）。slot s → 拍 s*0.25。3/6拍は先頭12枠を切り出して使う（partPatternOnsets）。
export const RHYTHM_PART_LIST: RhythmPartPreset[] = [
  { id: "whole", label: "白玉", pattern: "x...............", intent: "全音符＝最長のタメ（4/4=4拍サスティン・agogic対比の要）。POP909最頻語彙" },
  { id: "half2", label: "二分×2", pattern: "x.......x.......", intent: "拍1と拍3に長音2つ＝ゆったりした2分割" },
  { id: "dotted", label: "付点タメ", pattern: "x.....x.........", intent: "拍0で溜め→1.5拍後に一撃＝付点四分の間(ま)" },
  { id: "quarters", label: "四分刻み", pattern: "x...x...x...x...", intent: "拍頭を素直に4つ＝行進的な芯" },
  { id: "eighths", label: "8分刻み", pattern: "x.x.x.x.x.x.x.x.", intent: "8分の走り＝POP909最頻の刻み。歌の地" },
  { id: "driveHold", label: "刻み→タメ", pattern: "x.x.x.x.x.......", intent: "前半8分で押して後半は白玉＝押し引き。POP909頻出" },
  { id: "sixteenths", label: "駆け16分", pattern: "xxxxxxxx........", intent: "前半16分ラン→後半ロング＝疾走と余韻の対比" },
  { id: "syncope", label: "シンコペ", pattern: "x..x..x..x..x...", intent: "dotted-16グリッド(0/0.75/1.5/2.25/3.0)＝トレシーヨ的な食い" },
  { id: "offhead", label: "頭抜き", pattern: "....x.x.x.x.x...", intent: "拍頭を空けて拍1から入る＝弱起・間を作る歌い出し" },
  { id: "backbeat", label: "アフター", pattern: "....x.......x...", intent: "2拍と4拍(拍1,3=slot4,12)に置く＝バックビート寄りの跳ね" },
];

export const RHYTHM_PART_PRESETS: Record<string, string> = Object.fromEntries(RHYTHM_PART_LIST.map((p) => [p.id, p.pattern]));

// パーツパターン → 1小節内の onset 拍列（bar 起点の相対拍・昇順）。
// barLen=4 は16枠全部（slot s→s*0.25）。barLen=3 は先頭12枠を切り出し（V2 の "3拍切り出し" 流儀）。
// barLen=6 は 3+3＝先頭12枠を +0/+3拍へ2度敷く（J2a の 6/4=3+3 と整合）。それ以外は先頭 barLen*4 枠。
export function partPatternOnsets(pattern: string, barLen: number): number[] {
  if (typeof pattern !== "string" || pattern.length < 16) return [];
  const groupSlots = 12; // 3拍切り出し幅
  const beatsFrom = (offBeat: number, slots: number): number[] => {
    const out: number[] = [];
    for (let s = 0; s < slots && s < pattern.length; s++) if (pattern[s] === "x") out.push(offBeat + s * 0.25);
    return out;
  };
  if (barLen === 4) return beatsFrom(0, 16);
  if (barLen === 6) return [...beatsFrom(0, groupSlots), ...beatsFrom(3, groupSlots)]; // 6/4=3+3
  if (barLen === 3) return beatsFrom(0, groupSlots); // 3/4=先頭3拍
  return beatsFrom(0, Math.min(16, barLen * 4)); // 素直なフォールバック
}

// L1 の解決：出力の絶対 bar → partId（rotate を bar でローテ）。未知idや空は null（＝その小節はパーツ未適用）。
// L2（placement/custom）は resolvePartPatternAtBar が担う（S4-2）。この rotate-only 版は L1 の純粋解決として残す。
export function resolvePartIdAtBar(rotate: string[] | undefined, absBar: number): string | null {
  if (!rotate || rotate.length === 0) return null;
  const id = rotate[((absBar % rotate.length) + rotate.length) % rotate.length];
  return id && RHYTHM_PART_PRESETS[id] ? id : null;
}

// ── リズムパーツ層 L2＋採取＋インラインcustom（design #20 S4-2・Task#8）──
// 契約：rhythmParts = { rotate?, placement?: [{bar,partId}], custom?: [{id,pattern}] }。
// パーツ出所＝(a)プリセット (b)採取(extractRhythmPart) (c)手置き＝(b)(c)は custom で id 付与しプリセット外から渡す。
export type RhythmPartsOpt = {
  rotate?: string[];
  placement?: { bar: number; partId: string }[];
  custom?: { id: string; pattern: string }[];
};

// custom パターンのバリデーション＝ちょうど16文字・x/. のみ（16枠オンセット表現）。
export function isValidPartPattern(x: unknown): x is string {
  return typeof x === "string" && /^[x.]{16}$/.test(x);
}

// custom 配列 → id→pattern マップ（不正 pattern/空 id は捨てる・後勝ち）。
export function buildCustomPartMap(custom?: { id: string; pattern: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  if (Array.isArray(custom)) for (const c of custom) if (c && typeof c.id === "string" && c.id && isValidPartPattern(c.pattern)) m[c.id] = c.pattern;
  return m;
}

// id → pattern（custom がプリセットに優先＝インラインで上書き可）。未知は null。
function patternForId(id: string | undefined, customMap: Record<string, string>): string | null {
  if (!id) return null;
  return customMap[id] ?? RHYTHM_PART_PRESETS[id] ?? null;
}

// L2 per-bar 解決：placement > rotate > null（L0）。同一 bar に複数 placement は後勝ち。
// placement の未知id/該当barなし＝rotate へフォールスルー。返りは pattern 文字列（未適用＝null）。
export function resolvePartPatternAtBar(rp: RhythmPartsOpt, absBar: number, customMap: Record<string, string>): string | null {
  if (rp.placement && rp.placement.length) {
    let hit: string | undefined;
    for (const p of rp.placement) if (p && p.bar === absBar) hit = p.partId; // 後勝ち
    const pat = patternForId(hit, customMap);
    if (pat) return pat; // placement が勝つ（有効時）。未知/該当なしは rotate へ落ちる
  }
  if (rp.rotate && rp.rotate.length) {
    const id = rp.rotate[((absBar % rp.rotate.length) + rp.rotate.length) % rp.rotate.length];
    return patternForId(id, customMap);
  }
  return null;
}

// 採取（パーツ出所b）：既存メロの notes から指定小節の16分オンセットパターン("x/."16文字)を抽出する純関数。
// slot s（0..15）→ 小節内相対拍 s*0.25。beatsPerBar<4（3/4等）は先頭 beatsPerBar*4 枠のみ使用（partPatternOnsets の3拍切り出しと対称）＝残り枠は "."。
// 量子化＝各 onset を最寄り16分へ round。裏拍(0.75拍→slot3)/16分(0.25拍→slot1)も拾える。小節外の音は無視。
export function extractRhythmPart(notes: { start?: number }[], bar: number, opts: { beatsPerBar?: number } = {}): string {
  const bpb = opts.beatsPerBar ?? 4;
  const usable = Math.min(16, Math.max(1, Math.round(bpb * 4))); // 3/4=12枠・4/4=16枠・6/4は先頭16枠(4拍)まで＝割り切り
  const barStart = bar * bpb;
  const slots = new Array(16).fill(".");
  for (const n of notes) {
    if (typeof n.start !== "number") continue; // start 無し＝位置不定＝採取対象外
    const rel = n.start - barStart;
    if (rel < -1e-6 || rel >= bpb - 1e-9) continue; // この小節外
    const s = Math.round(rel / 0.25);
    if (s >= 0 && s < usable) slots[s] = "x";
  }
  return slots.join("");
}

// http/mcp 共通サニタイズ：未知の外形/不正値を落とし RhythmPartsOpt へ。効果ゼロ（rotate/placement 共に空）＝undefined＝bit一致。
// - custom：id 文字列＋16文字 x/. パターンのみ採用。
// - rotate：文字列のみ（未知idは engine が無視＝S4-1 と同じ・bit一致）。
// - placement：整数 bar>=0（bars 既知なら <bars）＋ known(preset∪custom) id のみ。範囲外bar/未知id は無視。
export function sanitizeRhythmParts(raw: unknown, opts: { bars?: number } = {}): RhythmPartsOpt | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as { rotate?: unknown; placement?: unknown; custom?: unknown };
  const custom: { id: string; pattern: string }[] = [];
  if (Array.isArray(o.custom)) {
    for (const c of o.custom) {
      if (c && typeof c === "object") {
        const id = (c as { id?: unknown }).id, pat = (c as { pattern?: unknown }).pattern;
        if (typeof id === "string" && id && isValidPartPattern(pat)) custom.push({ id, pattern: pat });
      }
    }
  }
  const known = new Set<string>([...Object.keys(RHYTHM_PART_PRESETS), ...custom.map((c) => c.id)]);
  const rotate = Array.isArray(o.rotate) ? o.rotate.filter((s): s is string => typeof s === "string") : undefined;
  const maxBar = typeof opts.bars === "number" && opts.bars > 0 ? opts.bars : Infinity;
  const placement = Array.isArray(o.placement)
    ? o.placement.filter((p): p is { bar: number; partId: string } => {
        if (!p || typeof p !== "object") return false;
        const bar = (p as { bar?: unknown }).bar, partId = (p as { partId?: unknown }).partId;
        return typeof bar === "number" && Number.isInteger(bar) && bar >= 0 && bar < maxBar && typeof partId === "string" && known.has(partId);
      })
    : undefined;
  const hasRotate = !!(rotate && rotate.length);
  const hasPlacement = !!(placement && placement.length);
  if (!hasRotate && !hasPlacement) return undefined; // custom 単独＝敷き先が無く効果ゼロ＝bit一致
  return { rotate: hasRotate ? rotate : undefined, placement: hasPlacement ? placement : undefined, custom: custom.length ? custom : undefined };
}
