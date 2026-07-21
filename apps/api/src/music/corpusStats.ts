// コーパス遷移統計テーブル（WP-0・design #21）の投入＋読み出し純関数 API。
// POP909 骨格の度数 n-gram（弱マルコフ材料）とモチーフ変換文法（M9）を DB へ持ち、生成/検索から引く。
// 正典＝docs/research/2026-07-14-corpus-db-diagnosis.md §6.2 ／ 2026-07-14-skeleton-corpus-stats.md。
// **リテラル旋律は非保存**（統計・度数・相対のみ）。既定生成は無変更＝storage＋read のみ（結線は WP-M1/M2）。
import type Database from "better-sqlite3";

type Db = Database.Database;

// ── 投入素材（data/corpus-stats/*.json）の最小型。全キーは任意＝欠けても防御的にスキップ ──
type BinTriple = [string, number, number]; // [label, count, pct]
type DegDist = { pc: number; pct: number; n: number }[];
export interface SkeletonStatsJson {
  major?: SkeletonModeStats;
  minor?: SkeletonModeStats;
}
interface SkeletonModeStats {
  startDeg?: DegDist;
  cadDeg?: DegDist;
  degHist?: DegDist;
  chordRel?: { pc: number; pct: number; n: number }[];
  chordRelStrong?: BinTriple[];
  chordRelWeak?: BinTriple[];
  contour?: BinTriple[];
  rangeHist?: BinTriple[];
  ornType?: BinTriple[];
  bigramFull?: Record<string, number>; // "4>2" -> count
  trigramFull?: Record<string, number>; // "4>2>2" -> count
}
export interface MotifStatsJson {
  meta?: { motifBars?: number };
  transformFreq?: Record<string, number>;
  transformPct?: Record<string, number>;
  transposeShiftSemitones?: Record<string, number>;
  lengthVarNoteDelta?: Record<string, number>;
  catByDist?: Record<string, Record<string, number>>;
}

const STYLE_POP = "pop"; // 骨格統計は POP909
const PRIOR_TRIPLE_FEATURES = ["chordRelStrong", "chordRelWeak", "contour", "rangeHist", "ornType"] as const;
const PRIOR_DEG_FEATURES = ["startDeg", "cadDeg", "degHist"] as const;

// ── 投入（純関数：db への INSERT OR REPLACE のみ＝冪等）。返り＝投入行数の内訳 ──
export interface IngestSources {
  skeleton?: SkeletonStatsJson | null;
  motif1?: MotifStatsJson | null; // 1bar
  motif2?: MotifStatsJson | null; // 2bar
  style?: string; // 骨格 style（既定 pop）
}
export function ingestCorpusStats(db: Db, sources: IngestSources): { noteTransitions: number; skeletonPriors: number; motifTransforms: number } {
  const style = sources.style ?? STYLE_POP;
  let noteTransitions = 0, skeletonPriors = 0, motifTransforms = 0;
  const insNT = db.prepare(`INSERT OR REPLACE INTO corpus_note_transition (style, mode, ngram, from_ctx, to_deg, count) VALUES (?, ?, ?, ?, ?, ?)`);
  const insSP = db.prepare(`INSERT OR REPLACE INTO corpus_skeleton_prior (style, mode, feature, bin, pct, n) VALUES (?, ?, ?, ?, ?, ?)`);
  const insMT = db.prepare(`INSERT OR REPLACE INTO corpus_motif_transform (scope_bars, feature, bin, count, pct) VALUES (?, ?, ?, ?, ?)`);

  const run = db.transaction(() => {
    const skel = sources.skeleton;
    if (skel) {
      for (const mode of ["major", "minor"] as const) {
        const m = skel[mode];
        if (!m) continue;
        // n-gram：from_ctx = "4>2" の最終度数を to_deg・残りを文脈に分解
        for (const [key, ngram] of [[m.bigramFull, 2] as const, [m.trigramFull, 3] as const]) {
          for (const [ctx, count] of Object.entries(key ?? {})) {
            const parts = ctx.split(">");
            if (parts.length !== ngram) continue;
            const to = Number(parts[parts.length - 1]);
            if (!Number.isFinite(to)) continue;
            insNT.run(style, mode, ngram, parts.slice(0, -1).join(">"), to, Math.round(Number(count)));
            noteTransitions++;
          }
        }
        // 度数分布 prior（bin=pc）
        for (const feat of PRIOR_DEG_FEATURES) {
          for (const d of (m[feat] ?? []) as DegDist) {
            if (!Number.isFinite(d?.pc)) continue;
            insSP.run(style, mode, feat, String(d.pc), Number(d.pct) || 0, Math.round(Number(d.n) || 0));
            skeletonPriors++;
          }
        }
        // chordRel（bin=pc・{pc,pct,n}）
        for (const d of m.chordRel ?? []) {
          if (!Number.isFinite(d?.pc)) continue;
          insSP.run(style, mode, "chordRel", String(d.pc), Number(d.pct) || 0, Math.round(Number(d.n) || 0));
          skeletonPriors++;
        }
        // ラベル分布 prior（[label,count,pct]）
        for (const feat of PRIOR_TRIPLE_FEATURES) {
          for (const t of (m[feat] ?? []) as BinTriple[]) {
            if (!Array.isArray(t) || t.length < 3) continue;
            insSP.run(style, mode, feat, String(t[0]), Number(t[2]) || 0, Math.round(Number(t[1]) || 0));
            skeletonPriors++;
          }
        }
      }
    }
    for (const [motif, scopeBars] of [[sources.motif1, 1] as const, [sources.motif2, 2] as const]) {
      if (!motif) continue;
      const freq = motif.transformFreq ?? {};
      const pct = motif.transformPct ?? {};
      for (const [name, c] of Object.entries(freq)) {
        insMT.run(scopeBars, "transform", name, Math.round(Number(c)), pct[name] ?? null);
        motifTransforms++;
      }
      for (const [feat, obj] of [["transposeShift", motif.transposeShiftSemitones] as const, ["lengthDelta", motif.lengthVarNoteDelta] as const]) {
        for (const [bin, c] of Object.entries(obj ?? {})) { insMT.run(scopeBars, feat, bin, Math.round(Number(c)), null); motifTransforms++; }
      }
      for (const [transform, byBucket] of Object.entries(motif.catByDist ?? {})) {
        for (const [bucket, c] of Object.entries(byBucket ?? {})) { insMT.run(scopeBars, "catByDist", `${transform}:${bucket}`, Math.round(Number(c)), null); motifTransforms++; }
      }
    }
  });
  run();
  return { noteTransitions, skeletonPriors, motifTransforms };
}

// ── 読み出し（純関数：DB クエリのみ。未投入なら空／false＝degrade gracefully） ──
export function hasCorpusStats(db: Db): boolean {
  const row = db.prepare(`SELECT COUNT(*) c FROM corpus_note_transition`).get() as { c: number };
  return (row?.c ?? 0) > 0;
}

export interface NoteTransitionModel {
  // from_ctx（"4" or "4>2"）→ [to_deg, count] の配列（count 降順）
  bigram: Map<string, [number, number][]>;
  trigram: Map<string, [number, number][]>;
}
export function loadNoteTransitions(db: Db, style: string, mode: string): NoteTransitionModel {
  const rows = db.prepare(`SELECT ngram, from_ctx, to_deg, count FROM corpus_note_transition WHERE style=? AND mode=? ORDER BY count DESC`)
    .all(style, mode) as { ngram: number; from_ctx: string; to_deg: number; count: number }[];
  const bigram = new Map<string, [number, number][]>();
  const trigram = new Map<string, [number, number][]>();
  for (const r of rows) {
    const map = r.ngram === 3 ? trigram : bigram;
    (map.get(r.from_ctx) ?? map.set(r.from_ctx, []).get(r.from_ctx)!).push([r.to_deg, r.count]);
  }
  return { bigram, trigram };
}

export interface PriorEntry { bin: string; pct: number; n: number }
export function loadSkeletonPriors(db: Db, style: string, mode: string): Record<string, PriorEntry[]> {
  const rows = db.prepare(`SELECT feature, bin, pct, n FROM corpus_skeleton_prior WHERE style=? AND mode=? ORDER BY n DESC`)
    .all(style, mode) as { feature: string; bin: string; pct: number; n: number }[];
  const out: Record<string, PriorEntry[]> = {};
  for (const r of rows) (out[r.feature] ??= []).push({ bin: r.bin, pct: r.pct, n: r.n });
  return out;
}

export interface MotifEntry { bin: string; count: number; pct: number | null }
export function loadMotifTransforms(db: Db, scopeBars: number): Record<string, MotifEntry[]> {
  const rows = db.prepare(`SELECT feature, bin, count, pct FROM corpus_motif_transform WHERE scope_bars=? ORDER BY count DESC`)
    .all(scopeBars) as { feature: string; bin: string; count: number; pct: number | null }[];
  const out: Record<string, MotifEntry[]> = {};
  for (const r of rows) (out[r.feature] ??= []).push({ bin: r.bin, count: r.count, pct: r.pct });
  return out;
}

// ── 消費の純関数：count 重み標本化（生成側 WP-M1/M2 が呼ぶ・0..1 の rand を注入＝決定性はテスト可能） ──
export function sampleByCount<T extends { count?: number }>(entries: (T & { count: number })[] | [unknown, number][], rand: number): number | string | null {
  // 受け口を [value, count][] に正規化（bigram の [to_deg,count] を素直に食える）
  const pairs = entries.map((e) => (Array.isArray(e) ? e : [(e as { bin?: string }).bin, (e as { count: number }).count])) as [number | string, number][];
  const total = pairs.reduce((s, [, c]) => s + (c > 0 ? c : 0), 0);
  if (total <= 0) return null;
  let x = Math.max(0, Math.min(1, rand)) * total;
  for (const [v, c] of pairs) { if (c <= 0) continue; x -= c; if (x <= 1e-9) return v; }
  return pairs[pairs.length - 1]![0];
}

// ══ (D) コード遷移統計（#21拡張・2026-07-21・正典＝design「コーパス遷移統計テーブル 第2弾」）══
//   在DB正規化進行から root+正準品質トークンの n-gram を数え、next_chord/genChords の**重み**にする。
//   思想（design 補強）＝頻度は idiom バイアスであってランカーではない。正当性は文法が、緊張の置き場は
//   構造層が、レアな妙味はスパイス関数が担う。ここは「同機能内でどれが手癖か」の地の部分だけに効かせる。
export type ChordTokInput = { root: number; quality: string };
// コードトークン＝度数(0..11)＋正準品質。">" を含まない（from_ctx 連結が安全）。例 I="0q"・vi="9qm"・V7="7q7"。負値も安全。
export function chordTok(c: ChordTokInput): string {
  return `${(((c.root % 12) + 12) % 12)}q${c.quality ?? ""}`;
}
export interface CorpusProgression { chords: ChordTokInput[]; mode?: string; count?: number }
export interface ChordTransitionRow { mode: string; ngram: number; from_ctx: string; to_tok: string; count: number }
// 純関数：正規化進行列 → n-gram カウント行（進行の count で重み付け・線形＝ループ折り返しはしない[初版]）。
export function buildChordTransitions(progs: CorpusProgression[]): ChordTransitionRow[] {
  const acc = new Map<string, number>(); // key = mode|ngram|from_ctx|to_tok
  const add = (mode: string, ngram: number, from: string, to: string, w: number) => {
    const k = `${mode}|${ngram}|${from}|${to}`;
    acc.set(k, (acc.get(k) ?? 0) + w);
  };
  for (const p of progs ?? []) {
    const mode = p.mode === "minor" ? "minor" : "major";
    const w = p.count && p.count > 0 ? p.count : 1;
    const toks = (p.chords ?? []).map(chordTok);
    for (let i = 1; i < toks.length; i++) {
      add(mode, 2, toks[i - 1]!, toks[i]!, w);
      if (i >= 2) add(mode, 3, `${toks[i - 2]}>${toks[i - 1]}`, toks[i]!, w);
    }
  }
  const rows: ChordTransitionRow[] = [];
  for (const [k, count] of acc) {
    const [mode, ngramS, from_ctx, to_tok] = k.split("|");
    rows.push({ mode: mode!, ngram: Number(ngramS), from_ctx: from_ctx!, to_tok: to_tok!, count });
  }
  return rows;
}
// 投入（追加のみ・冪等 INSERT OR REPLACE）。build スクリプト/CLI から呼ぶ。style は "pop"（在DB U-FRET）。
export function ingestChordTransitions(db: Db, rows: ChordTransitionRow[], style = "pop"): number {
  const ins = db.prepare(`INSERT OR REPLACE INTO corpus_chord_transition (style, mode, ngram, from_ctx, to_tok, count) VALUES (?, ?, ?, ?, ?, ?)`);
  let n = 0;
  const run = db.transaction(() => { for (const r of rows) { ins.run(style, r.mode, r.ngram, r.from_ctx, r.to_tok, Math.round(r.count)); n++; } });
  run();
  return n;
}
export function hasChordTransitions(db: Db): boolean {
  const row = db.prepare(`SELECT COUNT(*) c FROM corpus_chord_transition`).get() as { c: number };
  return (row?.c ?? 0) > 0;
}
export interface ChordTransitionModel {
  bigram: Map<string, [string, number][]>;  // from_ctx(tok) → [to_tok, count][]（count 降順）
  trigram: Map<string, [string, number][]>; // "tokA>tokB" → 同上
}
export function loadChordTransitions(db: Db, style: string, mode: string): ChordTransitionModel {
  const rows = db.prepare(`SELECT ngram, from_ctx, to_tok, count FROM corpus_chord_transition WHERE style=? AND mode=? ORDER BY count DESC`)
    .all(style, mode) as { ngram: number; from_ctx: string; to_tok: string; count: number }[];
  const bigram = new Map<string, [string, number][]>();
  const trigram = new Map<string, [string, number][]>();
  for (const r of rows) {
    const map = r.ngram === 3 ? trigram : bigram;
    (map.get(r.from_ctx) ?? map.set(r.from_ctx, []).get(r.from_ctx)!).push([r.to_tok, r.count]);
  }
  return { bigram, trigram };
}
// ── 意外性（温度）ダイヤル（design 補強 2026-07-21）：頻度は**ランカーでなく重み**。w_i = (count_i + floor)^(1/T)。
//   T<1=王道（最頻へ尖る）／T>1=攻め（裾の"正当"候補が顔を出す）。floor>0＝コーパス未見の正当候補も0にしない
//   （正当性は文法が担う＝頻度で弾かない）。空/未ヒット＝全て floor＝一様（素通し）。生成側は sampleByCount で消費。
export function transitionWeights(cands: string[], entries: [string, number][] | undefined, opts: { temperature?: number; floor?: number } = {}): number[] {
  const T = Math.max(0.05, Math.min(8, opts.temperature ?? 1));
  const floor = Math.max(1e-6, opts.floor ?? 0.5);
  const cnt = new Map(entries ?? []);
  return cands.map((c) => Math.pow((cnt.get(c) ?? 0) + floor, 1 / T));
}

// ── (WP-M1) 骨格度数 prior：loadSkeletonPriors（bin=クロマチックpc "0".."11"）→ **スケール度0..6** の重み Map。
//   `genSkeletonFromModel` の度数サンプルは 0..6 空間ゆえ pc→度数へ写す。非ダイアトニックbin（各<1%）は破棄・合計1へ正規化。
//   骨格構造音の度数分布を POP909 degHist へ弱バイアス（既定OFF＝未注入で bit 一致）。乱数不使用＝決定的。
const MAJOR_PC2DEG = new Map<number, number>([[0, 0], [2, 1], [4, 2], [5, 3], [7, 4], [9, 5], [11, 6]]);
const MINOR_PC2DEG = new Map<number, number>([[0, 0], [2, 1], [3, 2], [5, 3], [7, 4], [8, 5], [10, 6]]);
export function skeletonDegPrior(priors: Record<string, PriorEntry[]>, feature: "degHist" | "startDeg" | "cadDeg", minor: boolean): Map<number, number> {
  const pc2deg = minor ? MINOR_PC2DEG : MAJOR_PC2DEG;
  const acc = new Map<number, number>();
  for (const e of priors[feature] ?? []) {
    const deg = pc2deg.get((((Number(e.bin) % 12) + 12) % 12));
    if (deg === undefined) continue; // 非ダイアトニック（各<1%）は畳まず破棄
    acc.set(deg, (acc.get(deg) ?? 0) + (Number(e.pct) || 0));
  }
  const total = [...acc.values()].reduce((a, b) => a + b, 0);
  if (total > 0) for (const [k, v] of acc) acc.set(k, v / total); // 正規化＝strength の意味を安定に
  return acc;
}
