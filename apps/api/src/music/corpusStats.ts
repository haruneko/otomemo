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
