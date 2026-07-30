// 案A＝音符を割る「候補提示版」（design #31 §31-5・2026-07-30c オーナー裁定で採用）。
// 正典＝docs/research/2026-07-30-lyric-overflow-note-split-research.md §3（手続き4段）／§4-4（非4/4の扱い）。
// 思想（絶対）：**候補までを機械が出し、選ぶのは人**＝1本化しない・既定は何もしない。
//   柔らかい条件は弾かず「添える事実」として数値/フラグで返す（sectionNoriLens の warnings と同じ流儀）。
// 純TS・記号（音符の start/dur と拍子）だけ＝**コーパスは注入**（music-core はコーパスを持たない）。
//   実在性の裏取りは 4/4・16分格子でコーパスがあるときだけ有効（backedByCorpus）。非4/4は候補を出すが
//   「拍の重みからの位置提案・実曲統計の裏はまだ」と正直にラベル（§4-4＝6/8 はハード不能でなく裏取りだけが 4/4 限定）。

import type { Mora } from "./prosody";
import { metricWeights, lhlSyncScore } from "./syncopation";
import { notesInRange, placeMoras, type LyricNoteLike, type PhraseRange } from "./lyric";

const DEFAULT_FLOOR_BEATS = 0.25; // 16分。これ以上は割らない
const CV_BAND_CENTER = 0.6; // 音価CVの快適帯（0.50–0.70）の中央＝好ましさ並べの寄せ先
const EPS = 1e-6;

export interface SplitMeter {
  beatsPerBar: number; // 4/4 → 4
  gridPerBeat: number; // 16分 → 4
  tempo?: number; // BPM（下限を実時間で見たいとき用・当面は未使用＝研究 §4-2 穴1）
}

/** 1候補＝「割り位置の集合」＋割った後の音符＋添える事実。 */
export interface SplitCandidate<T extends LyricNoteLike = LyricNoteLike> {
  /** 追加した onset（元の音符 index と、小節原点からの絶対 slot）。 */
  splits: { noteIndex: number; slot: number }[];
  /** 割った後の全音符（範囲外は素通し・start 昇順）。syllable はモーラを1対1で写した後。 */
  notesAfter: T[];
  /** 割った元音符の数（distinct）。 */
  splitCount: number;
  /** 足した onset 総数（= 余りモーラ数 k）。 */
  addedOnsets: number;
  /** C-6：割った後の各小節の16枠パターンが全部コーパス既出か（裏取り無効時は null）。 */
  corpusKnown: boolean | null;
  /** C-6：コーパス頻度の総和（既出でないバーは0・裏取り無効時は0）。 */
  corpusFreq: number;
  /** C-5：範囲内音価のCV（std/mean）。帯 0.50–0.70。 */
  cv: number;
  /** 句末音 / 句平均 の音価比。 */
  phraseEndRatio: number;
  /** lhlSyncScore.perBar（食い＝シンコペ密度）。 */
  syncPerBar: number;
  /** C-8：促音「っ」が拍頭の新規 onset に当たっているか（避けたい）。 */
  specialBeatHit: boolean;
  /** C-8：新規 onset が語の内部に立っているか（words 指定時のみ・避けたい）。 */
  wordBoundaryHit: boolean;
}

export interface SplitResult<T extends LyricNoteLike = LyricNoteLike> {
  candidates: SplitCandidate<T>[];
  /** 4/4・16分でコーパス注入があるとき true＝添える事実に実測の裏がある（研究 §4-4）。 */
  backedByCorpus: boolean;
  /** 上限で打ち切ったか＝呼び側が「静かに切らない」ために知らせる材料（研究「no silent caps」）。 */
  truncated: boolean;
  /** 事実基準の並び（candidates への index 列・割った音符数の少ない順ほか）。 */
  byFacts: number[];
  /** 好ましさ基準の並び（コーパス頻度順・CVが帯の中央に近い順）。 */
  byPreference: number[];
}

export interface SplitOptions {
  maxPerNote?: number; // 音符あたり追加 onset 上限（既定2）
  floorBeats?: number; // 下限音価（既定0.25拍＝16分）
  protectPhraseEnd?: boolean; // 句末音は割らない（既定 true・C-4）
  families?: { straight?: boolean; syncopated?: boolean; secondTier?: boolean };
  corpus?: (bar16: string) => number | undefined; // C-6 注入（4/4・16分のときだけ裏取りに効く）
  words?: readonly number[]; // モーラ index → 語 id（C-8 用・無ければ語境界は常に false）
  limit?: number; // 返す候補の上限（既定400）
}

type Frag = [number, number]; // [startSlot, endSlot)

/**
 * 字余りの句に対して「音楽的に成立する割り方」の候補を出す（採用は人＝適用は呼び側）。
 * notes は句を含む全音符（範囲外は素通し）。moras は句のモーラ列（かな＋kind）。
 * 余りモーラ k = moras 数 − 範囲内音符数。k<=0（余っていない）なら候補は空。
 */
export function splitCandidates<T extends LyricNoteLike>(
  notes: readonly T[],
  moras: readonly Mora[],
  range: PhraseRange,
  meter: SplitMeter,
  opts: SplitOptions = {},
): SplitResult<T> {
  const gpb = Math.max(1, Math.floor(meter.gridPerBeat));
  const bpb = Math.max(1, Math.floor(meter.beatsPerBar));
  const cells = bpb * gpb;
  const w = metricWeights(bpb, gpb);
  const floorSlots = Math.max(1, Math.round((opts.floorBeats ?? DEFAULT_FLOOR_BEATS) * gpb));
  const maxJ = Math.max(0, Math.floor(opts.maxPerNote ?? 2));
  const protectEnd = opts.protectPhraseEnd ?? true;
  const fam = { straight: true, syncopated: true, secondTier: true, ...(opts.families ?? {}) };
  const limit = Math.max(1, opts.limit ?? 400);
  const backedByCorpus = !!opts.corpus && bpb === 4 && gpb === 4;

  const order = notesInRange(notes, range); // 範囲内音符 index（時間順）
  const inRangeCount = order.length;
  const k = moras.length - inRangeCount;
  const emptyResult: SplitResult<T> = { candidates: [], backedByCorpus, truncated: false, byFacts: [], byPreference: [] };
  if (k <= 0 || inRangeCount === 0) return emptyResult;

  // slot 原点＝句頭が属する小節の頭（重みの modulo とコーパス照合を小節境界基準に固定）。
  const originBeat = Math.floor((range.start + EPS) / bpb) * bpb;
  const toSlot = (beat: number) => Math.round((beat - originBeat) * gpb);
  const weightAt = (slot: number) => w[((slot % cells) + cells) % cells]!;

  // ── 段1：断片の中の割り位置候補（家族A/B/C）──
  function positionsIn(frag: Frag, syncUsed: boolean): { p: number; sync: boolean }[] {
    const [a, b] = frag;
    const lo = a + floorSlots;
    const hi = b - floorSlots;
    if (lo > hi) return [];
    const cand: number[] = [];
    for (let p = lo; p <= hi; p++) cand.push(p);
    const mid = (a + b) / 2;
    const rank = (x: number, y: number) =>
      weightAt(y) - weightAt(x) || Math.abs(x - mid) - Math.abs(y - mid) || x - y;
    const best = [...cand].sort(rank)[0]!; // A＝最強位置（同点は中点寄り）
    const out: { p: number; sync: boolean }[] = [];
    const push = (p: number, sync: boolean) => {
      if (!out.some((o) => o.p === p)) out.push({ p, sync });
    };
    if (fam.straight) push(best, false);
    if (fam.secondTier) {
      // C＝2番目に強い重み階層の位置
      const bw = weightAt(best);
      const second = cand.filter((p) => weightAt(p) < bw - EPS).sort(rank)[0];
      if (second !== undefined) push(second, false);
    }
    if (fam.syncopated && !syncUsed) {
      // B＝最強の16分1つ手前（食い）。音符あたり最大1（syncUsed で縛る）。
      const pb = best - 1;
      if (pb >= lo && pb <= hi && pb !== best) push(pb, true);
    }
    return out;
  }

  // 音符 [a, a+L) に j 個の onset を入れる集合を j ごとに列挙。
  function enumNote(a: number, L: number): number[][][] {
    const byJ: number[][][] = Array.from({ length: maxJ + 1 }, () => []);
    byJ[0] = [[]];
    const seen: Set<string>[] = Array.from({ length: maxJ + 1 }, () => new Set());
    const rec = (frags: Frag[], placed: number[], syncUsed: boolean) => {
      if (placed.length >= maxJ) return;
      for (let fi = 0; fi < frags.length; fi++) {
        for (const { p, sync } of positionsIn(frags[fi]!, syncUsed)) {
          const nf: Frag[] = [
            ...frags.slice(0, fi),
            [frags[fi]![0], p],
            [p, frags[fi]![1]],
            ...frags.slice(fi + 1),
          ];
          const np = [...placed, p].sort((x, y) => x - y);
          const key = np.join(",");
          const nj = np.length;
          if (seen[nj]!.has(key)) continue;
          seen[nj]!.add(key);
          byJ[nj]!.push(np);
          rec(nf, np, syncUsed || sync);
        }
      }
    };
    rec([[a, a + L]], [], false);
    return byJ;
  }

  const noteSlot = order.map((ni) => toSlot(notes[ni]!.start));
  const noteLen = order.map((ni) => Math.max(1, Math.round(notes[ni]!.dur * gpb)));
  const perNote = order.map((_, i) => enumNote(noteSlot[i]!, noteLen[i]!));
  const endIdx = protectEnd ? order.length - 1 : -1;

  // ── 段2：句全体で合計 j = k をDFS（句末は既定 j=0・C-4）──
  const hardCap = limit * 6; // 並べ替え前の暴走止め（研究の実測は数百＝これで足りる）
  const combos: { splits: { noteIndex: number; slot: number }[] }[] = [];
  let truncated = false;
  const maxReach = order.map(() => 0);
  for (let i = order.length - 1; i >= 0; i--) {
    const here = i === endIdx ? 0 : Math.min(maxJ, (perNote[i]!.length - 1));
    maxReach[i] = here + (i + 1 < order.length ? maxReach[i + 1]! : 0);
  }
  const combine = (i: number, remaining: number, acc: { noteIndex: number; slot: number }[]) => {
    if (truncated) return;
    if (combos.length >= hardCap) { truncated = true; return; }
    if (remaining > (i < order.length ? maxReach[i]! : 0)) return; // 到達不能で枝刈り
    if (i === order.length) { if (remaining === 0) combos.push({ splits: acc }); return; }
    const maxHere = i === endIdx ? 0 : Math.min(maxJ, remaining);
    for (let j = 0; j <= maxHere; j++) {
      const sets = perNote[i]![j];
      if (!sets || sets.length === 0) continue;
      for (const set of sets) {
        const add = set.map((slot) => ({ noteIndex: order[i]!, slot }));
        combine(i + 1, remaining - j, acc.concat(add));
        if (truncated) return;
      }
    }
  };
  combine(0, k, []);

  // ── 段4：割った後の音符と添える事実を作る ──
  const kanaList = moras.map((m) => m.kana);
  const origStartSet = new Set(order.map((ni) => Math.round(notes[ni]!.start / (1 / gpb))));
  const words = opts.words;

  const buildCandidate = (splits: { noteIndex: number; slot: number }[]): SplitCandidate<T> => {
    const bySrc = new Map<number, number[]>();
    for (const s of splits) {
      const arr = bySrc.get(s.noteIndex);
      if (arr) arr.push(s.slot);
      else bySrc.set(s.noteIndex, [s.slot]);
    }
    const out: T[] = [];
    for (let i = 0; i < notes.length; i++) {
      const src = notes[i]!;
      const adds = bySrc.get(i);
      if (!adds || adds.length === 0) {
        out.push({ ...src });
        continue;
      }
      const startSlot = toSlot(src.start);
      const endSlot = startSlot + Math.max(1, Math.round(src.dur * gpb));
      const onsets = [startSlot, ...adds].sort((x, y) => x - y);
      for (let o = 0; o < onsets.length; o++) {
        const sSlot = onsets[o]!;
        const eSlot = o + 1 < onsets.length ? onsets[o + 1]! : endSlot;
        out.push({ ...src, start: originBeat + sSlot / gpb, dur: (eSlot - sSlot) / gpb });
      }
    }
    out.sort((x, y) => x.start - y.start);
    const notesAfter = placeMoras(out, kanaList, range);

    // 事実（範囲内音符で計算）
    const idx = notesInRange(notesAfter, range);
    const durs = idx.map((i) => notesAfter[i]!.dur);
    const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
    const variance = durs.reduce((a, d) => a + (d - mean) * (d - mean), 0) / durs.length;
    const cv = mean > EPS ? Math.sqrt(variance) / mean : 0;
    const phraseEndRatio = mean > EPS ? durs[durs.length - 1]! / mean : 0;

    const onsetsBeat = idx.map((i) => notesAfter[i]!.start - originBeat);
    const syncPerBar = lhlSyncScore(onsetsBeat, { beatsPerBar: bpb, gridPerBeat: gpb, barLen: bpb }).perBar;

    // C-8：促音が拍頭の新規onsetに当たる／新規onsetが語内部に立つ
    let specialBeatHit = false;
    let wordBoundaryHit = false;
    for (let m = 0; m < idx.length; m++) {
      const note = notesAfter[idx[m]!]!;
      const slot = toSlot(note.start);
      const isNew = !origStartSet.has(Math.round(note.start / (1 / gpb)));
      if (!isNew) continue;
      if (moras[m]?.kind === "sokuon" && slot % gpb === 0) specialBeatHit = true;
      if (words && m > 0 && words[m] !== undefined && words[m] === words[m - 1]) wordBoundaryHit = true;
    }

    // C-6：4/4・16分・コーパスありのときだけ既出照合
    let corpusKnown: boolean | null = null;
    let corpusFreq = 0;
    if (backedByCorpus && opts.corpus) {
      const firstBar = Math.floor((range.start + EPS) / bpb);
      const lastBar = Math.ceil((range.start + range.beats - EPS) / bpb) - 1;
      corpusKnown = true;
      for (let bar = firstBar; bar <= lastBar; bar++) {
        const grid = new Array(cells).fill(".");
        let any = false;
        for (const i of idx) {
          const s = toSlot(notesAfter[i]!.start) - (bar - firstBar) * cells;
          if (s >= 0 && s < cells) {
            grid[s] = "x";
            any = true;
          }
        }
        if (!any) continue; // onset の無い小節は照合対象から外す
        const pat = grid.join("");
        const freq = opts.corpus(pat);
        if (freq === undefined) corpusKnown = false;
        else corpusFreq += freq;
      }
    }

    return {
      splits,
      notesAfter,
      splitCount: bySrc.size,
      addedOnsets: splits.length,
      corpusKnown,
      corpusFreq,
      cv,
      phraseEndRatio,
      syncPerBar,
      specialBeatHit,
      wordBoundaryHit,
    };
  };

  let cands = combos.map((c) => buildCandidate(c.splits));

  // ── 段3/§3-4：並べ替え（点数で1本化しない・2軸を併記）──
  const factsCmp = (a: SplitCandidate<T>, b: SplitCandidate<T>) =>
    a.splitCount - b.splitCount ||
    Number(a.specialBeatHit) - Number(b.specialBeatHit) ||
    Number(a.wordBoundaryHit) - Number(b.wordBoundaryHit) ||
    Number(b.corpusKnown ?? false) - Number(a.corpusKnown ?? false) ||
    b.corpusFreq - a.corpusFreq;
  cands.sort(factsCmp);
  if (cands.length > limit) {
    truncated = true;
    cands = cands.slice(0, limit);
  }
  const byFacts = cands.map((_, i) => i); // 既に事実順
  const byPreference = cands
    .map((_, i) => i)
    .sort(
      (x, y) =>
        cands[y]!.corpusFreq - cands[x]!.corpusFreq ||
        Math.abs(cands[x]!.cv - CV_BAND_CENTER) - Math.abs(cands[y]!.cv - CV_BAND_CENTER) ||
        x - y,
    );

  return { candidates: cands, backedByCorpus, truncated, byFacts, byPreference };
}
