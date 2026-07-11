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
// placement（L2）は #8（S4-2）で実装＝ここでは rotate のみ解決（型は契約側で予約済み）。
export function resolvePartIdAtBar(rotate: string[] | undefined, absBar: number): string | null {
  if (!rotate || rotate.length === 0) return null;
  const id = rotate[((absBar % rotate.length) + rotate.length) % rotate.length];
  return id && RHYTHM_PART_PRESETS[id] ? id : null;
}
