// リズム骨格＝拍セルモデル（Layer①・spec design#12-M S7／melody-generation §12）。
// 1セル=1拍、枠=拍子の最小分割、語彙=2^枠（列挙）。学習は「数えるだけ」＝頻度＋位置条件遷移。
// コーパスの生メロは保存せず、ここで得る小さな表（頻度/遷移）だけを使う＝著作権セーフ。

// 拍子→格子。単純拍子=16分4枠（4/4→16語）、複合拍子(d=8,n%3=0)=8分3枠（6/8→8語・.25/.75が存在しない）。
export interface RhythmGrid { beatsPerBar: number; beatUnit: number; slotsPerBeat: number }
export function rhythmGrid(meter: string): RhythmGrid {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter);
  if (!m) throw new Error(`bad meter: ${meter}`);
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (d === 8 && n % 3 === 0) return { beatsPerBar: n / 3, beatUnit: 1.5, slotsPerBeat: 3 }; // 複合：付点四分ビート・8分3枠
  const beatUnit = 4 / d; // 単純：1拍＝分母音符を四分単位で（d=4→1, d=2→2）
  return { beatsPerBar: n, beatUnit, slotsPerBeat: Math.round(beatUnit / 0.25) }; // 16分枠
}

// 1小節の onset列（四分単位・小節頭=0基準）→ 各拍のパターン文字列（'x'=打点, '.'=無）。空拍は'....'。
export function barCells(onsets: number[], meter: string): string[] {
  const { beatsPerBar, beatUnit, slotsPerBeat } = rhythmGrid(meter);
  const slotSize = beatUnit / slotsPerBeat;
  const out: string[] = [];
  for (let b = 0; b < beatsPerBar; b++) {
    const base = b * beatUnit;
    const g = new Array<string>(slotsPerBeat).fill(".");
    for (const t of onsets) {
      const rel = t - base;
      if (rel >= -1e-6 && rel < beatUnit - 1e-6) {
        const idx = Math.round(rel / slotSize);
        if (idx >= 0 && idx < slotsPerBeat) g[idx] = "x";
      }
    }
    out.push(g.join(""));
  }
  return out;
}

// 学習結果＝拍セルの頻度＋位置条件つき遷移。
export interface RhythmModel {
  meter: string;
  grid: RhythmGrid;
  cells: Map<string, number>;                    // セル→出現回数（全位置）
  posCells: Map<number, Map<string, number>>;    // 拍位置→セル頻度（小節頭/遷移欠落時の基底）
  trans: Map<string, Map<string, number>>;       // "拍位置|直前セル" → (次セル→回数)
}

// コーパス（小節ごとの onset列）→ モデル。遷移は小節内のみ（小節頭で prev リセット＝曲順/混在に非依存）。
export function learnRhythmCells(bars: number[][], meter: string): RhythmModel {
  const grid = rhythmGrid(meter);
  const cells = new Map<string, number>();
  const posCells = new Map<number, Map<string, number>>();
  const trans = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const onsets of bars) {
    const cs = barCells(onsets, meter);
    let prev = "";
    for (let p = 0; p < cs.length; p++) {
      const c = cs[p]!;
      bump(cells, c);
      bump(posCells.get(p) ?? posCells.set(p, new Map()).get(p)!, c);
      if (prev) bump(trans.get(`${p}|${prev}`) ?? trans.set(`${p}|${prev}`, new Map()).get(`${p}|${prev}`)!, c);
      prev = c;
    }
  }
  return { meter, grid, cells, posCells, trans };
}

const onsetsOf = (cell: string): number => { let n = 0; for (const ch of cell) if (ch === "x") n++; return n; };
const posDist = (m: RhythmModel, pos: number): Map<string, number> => m.posCells.get(pos) ?? m.cells;
// 小さな決定的 RNG（seed 再現用）。
function makeRng(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; }; }
function weightedPick(dist: Map<string, number>, r: () => number): string {
  const e = [...dist.entries()];
  const tot = e.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const [k, c] of e) { x -= c; if (x <= 0) return k; }
  return e[e.length - 1]![0];
}

// 自由生成＝位置条件マルコフを歩く（直前セルの遷移があればそれ・無ければ位置基底）。
function genFree(m: RhythmModel, total: number, seed: number): string[] {
  const r = makeRng(seed);
  const bpb = m.grid.beatsPerBar;
  const out: string[] = [];
  let prev = "";
  for (let i = 0; i < total; i++) {
    const pos = i % bpb;
    if (pos === 0) prev = ""; // 小節頭は学習と同じく直前なし
    const dist = (prev && m.trans.get(`${pos}|${prev}`)) || posDist(m, pos);
    const c = weightedPick(dist, r);
    out.push(c);
    prev = c;
  }
  return out;
}

// 音数指定＝拍上DP。状態=累積onset数、各拍で位置基底セルを候補に（遷移確率で重み付け）、合計=target の最良列を返す。
// 候補は posDist（位置で見たセル全部）＝遷移が疎でも音数制約を満たせる。null=不能。
function genCount(m: RhythmModel, total: number, target: number): string[] | null {
  const bpb = m.grid.beatsPerBar;
  type St = { logp: number; seq: string[] };
  let dp = new Map<number, St>();
  for (const [c, base] of posDist(m, 0)) { const k = onsetsOf(c); if (k > target) continue; const lp = Math.log(base); const cur = dp.get(k); if (!cur || lp > cur.logp) dp.set(k, { logp: lp, seq: [c] }); }
  for (let i = 1; i < total; i++) {
    const pos = i % bpb;
    const nx = new Map<number, St>();
    for (const [cum, st] of dp) {
      const prev = st.seq[st.seq.length - 1]!;
      const tdist = pos !== 0 ? m.trans.get(`${pos}|${prev}`) : undefined;
      for (const [c, base] of posDist(m, pos)) {
        const k = cum + onsetsOf(c);
        if (k > target) continue;
        const lp = st.logp + Math.log(base * (1 + (tdist?.get(c) ?? 0))); // 位置基底×(1+遷移)＝遷移でバイアス・候補は塞がない
        const cur = nx.get(k);
        if (!cur || lp > cur.logp) nx.set(k, { logp: lp, seq: [...st.seq, c] });
      }
    }
    dp = nx;
  }
  return dp.get(target)?.seq ?? null;
}

// リズム生成：syllables 指定なら音数DP（合計onset=syllables を保証）、無指定なら自由生成。
export function genRhythm(m: RhythmModel, opts: { bars: number; syllables?: number; seed?: number }): string[] {
  const total = opts.bars * m.grid.beatsPerBar;
  if (opts.syllables == null) return genFree(m, total, opts.seed ?? 1);
  const r = genCount(m, total, opts.syllables);
  if (!r) throw new Error(`音数 ${opts.syllables} は ${opts.bars}小節(${m.meter})で実現不能`);
  return r;
}

// セル列→onset の拍位置（四分単位・曲頭0基準）。エンジン(buildMotif)へ渡す形。
export function cellsToOnsets(cells: string[], meter: string): number[] {
  const { beatsPerBar, beatUnit, slotsPerBeat } = rhythmGrid(meter);
  const slotSize = beatUnit / slotsPerBeat;
  const barLen = beatsPerBar * beatUnit;
  const out: number[] = [];
  cells.forEach((c, i) => {
    const base = Math.floor(i / beatsPerBar) * barLen + (i % beatsPerBar) * beatUnit;
    for (let j = 0; j < c.length; j++) if (c[j] === "x") out.push(Math.round((base + j * slotSize) * 1000) / 1000);
  });
  return out;
}
