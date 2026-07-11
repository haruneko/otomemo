// 骨格編集の純ロジック（design #20 S2）。PianoRoll流用の skeleton モードが使う純関数群＝
// テスト先行（apps/web/test/skeletonEdit.test.ts）。UI(SkeletonEditor.tsx)は状態を持たずここへ委譲。
// 骨格＝ブレークポイント列 {start, pitch|null}＝dur を持たず次の点/句境界/曲末まで支配（GTTM time-span）。
import { skeletonPreviewNotes, type Note, type SkeletonBreakpoint, type SkeletonContent, type ChordEntry } from "./music";

const EPS = 1e-6;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const sortPts = (pts: SkeletonBreakpoint[]) => [...pts].sort((a, b) => a.start - b.start);

// --- スナップ（2拍/1拍/自由0.25） ---
export function snapBeat(beat: number, snap: number, total: number): number {
  const v = snap > 0 ? Math.round(beat / snap) * snap : Math.round(beat * 4) / 4;
  return Math.max(0, Math.min(total, r3(v)));
}

// --- 支配帯の終端（次の同声部点／句境界／曲末） ---
export function bandEnd(points: SkeletonBreakpoint[], start: number, phrases: { endBeat: number }[], total: number): number {
  let e = total;
  for (const p of points) if (p.start > start + EPS && p.start < e) e = p.start;
  for (const ph of phrases) if (ph.endBeat > start + EPS && ph.endBeat < e) e = ph.endBeat;
  return e;
}

export interface DomSeg { start: number; end: number; pitch: number | null }
// 支配区間の展開（null＝骨格休符も区間として返す＝描画のハッチ用）。曲末以降の点は捨てる。
export function dominionSegments(points: SkeletonBreakpoint[], phrases: { endBeat: number }[], total: number): DomSeg[] {
  const pts = sortPts(points);
  const out: DomSeg[] = [];
  for (const p of pts) {
    if (p.start >= total - EPS) break;
    const end = bandEnd(pts, p.start, phrases, total);
    if (end <= p.start + EPS) continue;
    out.push({ start: p.start, end, pitch: p.pitch });
  }
  return out;
}

// --- 点の操作（不変・sorted維持） ---
export function upsertPoint(points: SkeletonBreakpoint[], beat: number, pitch: number | null): SkeletonBreakpoint[] {
  const hit = points.find((p) => Math.abs(p.start - beat) < EPS);
  if (hit) return sortPts(points.map((p) => (p === hit ? { start: beat, pitch } : p)));
  return sortPts([...points, { start: beat, pitch }]);
}
export function removePointAt(points: SkeletonBreakpoint[], beat: number): SkeletonBreakpoint[] {
  return points.filter((p) => Math.abs(p.start - beat) >= EPS);
}
// 休ストリップ：空拍→null挿入／実音→null化／null点→削除。
export function toggleRestAt(points: SkeletonBreakpoint[], beat: number): SkeletonBreakpoint[] {
  const hit = points.find((p) => Math.abs(p.start - beat) < EPS);
  if (!hit) return sortPts([...points, { start: beat, pitch: null }]);
  if (hit.pitch === null) return points.filter((p) => p !== hit);
  return sortPts(points.map((p) => (p === hit ? { start: p.start, pitch: null } : p)));
}

// --- 句境界の丸め（小節境界へ・両端は曲頭/曲末を1小節残す） ---
export function clipPhraseBeat(beat: number, bpb: number, total: number): number {
  const snapped = Math.round(beat / bpb) * bpb;
  return Math.max(bpb, Math.min(total - bpb, snapped));
}

// --- 折返し表示（register transfer・計算は実音／表示だけ畳む） ---
export const foldDisplayPitch = (real: number, foldOct: number): number => real + foldOct;
export const unfoldPitch = (display: number, foldOct: number): number => display - foldOct;

// --- 導出ベース（コード root/分数）。pc を低域 C2帯(36..47) の代表音へ（骨格スケッチ用・mock踏襲） ---
export const derivedBassPitch = (pc: number): number => 36 + (((Math.round(pc) % 12) + 12) % 12);
export function derivedBassAt(beat: number, chords: ChordEntry[]): number | null {
  for (const c of chords) if (c.start <= beat + EPS && beat < c.start + c.dur - EPS) return derivedBassPitch(c.bass ?? c.root);
  return null;
}

// --- 明示ベース区間（最後の点は直前間隔ぶん支配＝導出が復帰できる）／実効ベース ---
export function explicitBassSegments(bass: SkeletonBreakpoint[], phrases: { endBeat: number }[], total: number): DomSeg[] {
  const pts = sortPts(bass);
  const out: DomSeg[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i]!.start;
    let e = i + 1 < pts.length ? pts[i + 1]!.start : s + (pts.length > 1 ? s - pts[i - 1]!.start : 2);
    e = Math.min(e, total);
    for (const ph of phrases) if (ph.endBeat > s + EPS && ph.endBeat < e) e = ph.endBeat;
    if (e <= s + EPS) continue;
    out.push({ start: s, end: e, pitch: pts[i]!.pitch });
  }
  return out;
}
// 実効ベース＝明示があれば明示（null=休符もそのまま）、無ければコード導出。
export function effectiveBassAt(beat: number, bass: SkeletonBreakpoint[], chords: ChordEntry[], phrases: { endBeat: number }[], total: number): number | null {
  for (const seg of explicitBassSegments(bass, phrases, total)) {
    if (beat >= seg.start - EPS && beat < seg.end - EPS) return seg.pitch; // null もそのまま
  }
  return derivedBassAt(beat, chords);
}

// 実効ベースを区間化（描画：明示=実線 source"explicit"／導出=点線 source"derived"）。
// 境界＝コード変わり目＋明示点区間の端＋句境界＋曲頭。同 pitch/source は連結。
export interface BassSeg { start: number; end: number; pitch: number; source: "explicit" | "derived" }
export function effectiveBassSegments(bass: SkeletonBreakpoint[], chords: ChordEntry[], phrases: { endBeat: number }[], total: number): BassSeg[] {
  const ex = explicitBassSegments(bass, phrases, total);
  const bounds = new Set<number>([0]);
  for (const c of chords) { bounds.add(c.start); bounds.add(c.start + c.dur); }
  for (const s of ex) { bounds.add(s.start); bounds.add(s.end); }
  for (const ph of phrases) bounds.add(ph.endBeat);
  const starts = [...bounds].filter((b) => b >= 0 && b < total - EPS).sort((a, b) => a - b);
  const out: BassSeg[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i]!;
    const e = i + 1 < starts.length ? starts[i + 1]! : total;
    if (e <= s + EPS) continue;
    const mid = s + (e - s) / 2;
    const covered = ex.find((seg) => mid >= seg.start - EPS && mid < seg.end - EPS);
    const source: "explicit" | "derived" = covered ? "explicit" : "derived";
    const pitch = covered ? covered.pitch : derivedBassAt(mid, chords);
    if (pitch === null) continue; // 明示null（骨格休符）/導出無し＝描画しない
    const last = out[out.length - 1];
    if (last && last.pitch === pitch && last.source === source && Math.abs(last.end - s) < EPS) last.end = e;
    else out.push({ start: s, end: e, pitch, source });
  }
  return out;
}

// --- 音程バッジ（実ピッチ差を mod-12 単音程へ還元＝10度→3度の対位法慣習） ---
export interface IntervalInfo { label: string; consonant: boolean }
const DEGREE: Record<number, IntervalInfo> = {
  0: { label: "8度", consonant: true }, 1: { label: "2度", consonant: false }, 2: { label: "2度", consonant: false },
  3: { label: "3度", consonant: true }, 4: { label: "3度", consonant: true }, 5: { label: "4度", consonant: false },
  6: { label: "♭5", consonant: false }, 7: { label: "5度", consonant: true }, 8: { label: "6度", consonant: true },
  9: { label: "6度", consonant: true }, 10: { label: "7度", consonant: false }, 11: { label: "7度", consonant: false },
};
export function intervalBadge(semi: number): IntervalInfo {
  return DEGREE[(((Math.round(semi) % 12) + 12) % 12)]!;
}
export const isStrongBeat = (beat: number): boolean => Math.abs(beat % 2) < EPS;

// --- 対位法フィードバック（指摘のみ）：各メロ点に実効ベースとの音程・強拍不協和・声部交差・並行5/8度 ---
export interface MelCp {
  start: number;
  melPitch: number;
  bassPitch: number | null;
  interval: IntervalInfo | null;
  dissonant: boolean; // 強拍かつ不協和
  cross: boolean; // 実音でメロ<ベース
  parallel: "" | "P5" | "P8";
}
export function analyzeCounterpoint(mel: SkeletonBreakpoint[], bassAt: (beat: number) => number | null): MelCp[] {
  const pts = sortPts(mel).filter((p) => p.pitch !== null) as { start: number; pitch: number }[];
  const out: MelCp[] = [];
  let prev: { mel: number; bass: number } | null = null;
  for (const p of pts) {
    const bp = bassAt(p.start);
    if (bp === null) {
      out.push({ start: p.start, melPitch: p.pitch, bassPitch: null, interval: null, dissonant: false, cross: false, parallel: "" });
      prev = null;
      continue;
    }
    const interval = intervalBadge(p.pitch - bp);
    const dissonant = !interval.consonant && isStrongBeat(p.start);
    const cross = p.pitch < bp;
    let parallel: "" | "P5" | "P8" = "";
    if (prev) {
      const i1 = (((prev.mel - prev.bass) % 12) + 12) % 12;
      const i2 = (((p.pitch - bp) % 12) + 12) % 12;
      const same = (p.pitch - prev.mel > 0 && bp - prev.bass > 0) || (p.pitch - prev.mel < 0 && bp - prev.bass < 0);
      if (same && i1 === i2 && (i2 === 7 || i2 === 0)) parallel = i2 === 7 ? "P5" : "P8";
    }
    out.push({ start: p.start, melPitch: p.pitch, bassPitch: bp, interval, dissonant, cross, parallel });
    prev = { mel: p.pitch, bass: bp };
  }
  return out;
}

// --- noteEdit アダプタ（選択編集流用）：tones→Note[] 写像（dur=0＝durを持たない）・null点はプレースホルダ ---
export function pointsToNotes(points: SkeletonBreakpoint[]): Note[] {
  return sortPts(points).map((p) => ({ pitch: p.pitch ?? 60, start: p.start, dur: 0 }));
}
// Note[]→点：dur を破棄し、元の点（同index）が null なら null を復元。
export function notesToPoints(notes: Note[], original: SkeletonBreakpoint[]): SkeletonBreakpoint[] {
  const orig = sortPts(original);
  return sortPts(
    notes.map((n, i) => ({ start: r3(n.start), pitch: orig[i]?.pitch === null ? null : n.pitch })),
  );
}
// 選択(index集合)を音程/拍で移動（null点は音程不動）。noteEdit.nudgeNotes と同流儀。
export function nudgePoints(points: SkeletonBreakpoint[], sel: Set<number>, dPitch: number, dBeats: number, total: number): SkeletonBreakpoint[] {
  const pts = sortPts(points);
  return sortPts(
    pts.map((p, i) =>
      sel.has(i)
        ? { start: Math.max(0, Math.min(total, r3(p.start + dBeats))), pitch: p.pitch === null ? null : Math.max(0, Math.min(127, p.pitch + dPitch)) }
        : p,
    ),
  );
}
// 選択(index集合)を削除。
export function deletePoints(points: SkeletonBreakpoint[], sel: Set<number>): SkeletonBreakpoint[] {
  return sortPts(points).filter((_, i) => !sel.has(i));
}

// --- タップとパンの区別（スクロール誤タップ対策・オーナーFB 2026-07-11） ---
// pointerdown 位置からの移動が閾値内なら「静止タップ」。超えたらパン（スクロール）＝打点しない。
// PianoRoll はセルが <button onClick>（タッチスクロールでは click が発火しない）＝同方式を click＋この保険で移植。
export const TAP_SLOP = 8; // px。指ブレは許し、スクロールの初動は弾く
export function isTap(dx: number, dy: number, slop = TAP_SLOP): boolean {
  return Math.abs(dx) <= slop && Math.abs(dy) <= slop;
}

// 骨格の既定音色（オーナーFB 2026-07-11）：メロ=GM48 String Ensemble／ベース=GM42 Cello。
// per-note program は scheduleTimes→playEvent がそのまま GM 音色へ解決する（合成再生と同機構）。
export const SKEL_MEL_PROGRAM = 48;
export const SKEL_BASS_PROGRAM = 42;

// --- 再生の2声（対位法=ベース+1oct／実音=そのまま） ---
export interface SkelPlayOpts { counterpoint: boolean; chords: ChordEntry[]; beatsPerBar?: number; bassOct?: number; melProgram?: number; bassProgram?: number }
// メロ実音＋実効ベース（明示＋導出）を鳴らす Note 列。part で音色差別化（melody/bass）。
export function skeletonPlaybackNotes(content: SkeletonContent, opts: SkelPlayOpts): Note[] {
  const bpb = opts.beatsPerBar ?? 4;
  const total = content.bars * bpb;
  const phrases = content.phrases ?? [];
  const melProg = opts.melProgram ?? SKEL_MEL_PROGRAM;
  const bassProg = opts.bassProgram ?? SKEL_BASS_PROGRAM;
  const mel: Note[] = skeletonPreviewNotes(content, bpb).map((n) => ({ ...n, program: melProg, part: "melody" as const }));
  // ベースのセグメント境界＝コード変わり目＋明示点＋句境界＋曲頭。
  const bounds = new Set<number>([0]);
  for (const c of opts.chords) bounds.add(c.start);
  for (const b of content.bass ?? []) bounds.add(b.start);
  for (const ph of phrases) if (ph.endBeat < total - EPS) bounds.add(ph.endBeat);
  const starts = [...bounds].filter((b) => b >= 0 && b < total - EPS).sort((a, b) => a - b);
  const off = opts.counterpoint ? (opts.bassOct ?? 12) : 0;
  const bass: Note[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i]!;
    const e = i + 1 < starts.length ? starts[i + 1]! : total;
    const bp = effectiveBassAt(s + EPS, content.bass ?? [], opts.chords, phrases, total);
    if (bp === null) continue;
    const pitch = bp + off;
    const last = bass[bass.length - 1];
    if (last && last.pitch === pitch && Math.abs(last.start + last.dur - s) < EPS) last.dur += e - s; // 同音は連結
    else bass.push({ pitch, start: s, dur: e - s, program: bassProg, part: "bass" });
  }
  return [...mel, ...bass];
}

// --- セクション耳確認（オーナーFB 2026-07-11）：骨格レーン「鳴らす」トグルON時に合成再生へ混ぜる2声 ---
// 合成は design #20 どおり無音のまま（compositeNotes 不変・MIDI書き出しにも入れない）。再生ノートにだけ足す。
// shift＝配置先セクションへの移調半音（melodyPlacementShift 流儀・両声に同じだけ効く）。chords は
// 呼び出し側でセクション実調・骨格位置相対に整えて渡す（導出ベースが同じ座標系で鳴るように）。
export function skeletonEarNotes(content: SkeletonContent, opts: { chords: ChordEntry[]; shift?: number; beatsPerBar?: number }): Note[] {
  const shift = opts.shift ?? 0;
  const mv = (pts?: SkeletonBreakpoint[]) => pts?.map((t) => (t.pitch == null ? t : { ...t, pitch: t.pitch + shift }));
  const shifted: SkeletonContent = { ...content, tones: mv(content.tones)!, ...(content.bass ? { bass: mv(content.bass) } : {}) };
  return skeletonPlaybackNotes(shifted, { counterpoint: true, chords: opts.chords, beatsPerBar: opts.beatsPerBar });
}
