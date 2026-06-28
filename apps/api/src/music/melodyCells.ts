import { SKELETON_MODEL_DATA, SKELETON_MODEL_MINOR_DATA, SKELETON_REST_BY_POS } from "./skeletonModelData";
import { RHYTHM16_DATA, MOVE_TRANS_DATA, RHYTHM68_DATA } from "./motifModelData";
import { chordPcs } from "./theory";
// 有機メロの再帰モデル・層2＝joint cell（design #12-M S8 / research findings）。
// メロの中身を「度数move@slot(8分0/1)」記号で表し、骨格move(次拍への度数差)で条件づけて学習・サンプル。
// 全部「度数＋相対位置」＝テンポ/調 非依存。手当て(ランダム規則)を全廃し、データの条件付き分布で動かす。

// 音階ピッチ列（その調の音だけ昇順）。move=この列上のインデックス差＝音階度。
export function scalePitchList(scale: Set<number>, lo = 48, hi = 84): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.has(((m % 12) + 12) % 12)) out.push(m);
  return out;
}
const nearestIdx = (sp: number[], pitch: number): number => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < sp.length; i++) { const d = Math.abs(sp[i]! - pitch); if (d < bd) { bd = d; bi = i; } }
  return bi;
};
const clampScale = (sp: number[], i: number): number => sp[Math.max(0, Math.min(sp.length - 1, i))]!;

type Note = { pitch: number; start: number; dur: number };

// cell 記号 = 1拍の2つの8分slotを ";" 区切りで表す。各 token：
//   数字=onset(その度数の新音) / "s"=sustain(前音を伸ばす) / "r"=rest(休符=前音をここで切る)。
//   例 "0;2"=ド・ミ(8分2つ)、"0;s"=四分(ド伸ばし)、"0;r"=8分ド＋8分休、"r;r"=空拍(休)、"s;s"=保持。
// onset/sustain/rest を持つので、伸ばし・息継ぎ(休符)が表現できる（旧 move@slot から拡張）。
type Slot = { kind: "onset"; move: number } | { kind: "sustain" } | { kind: "rest" };
export function parseCell(cell: string): Slot[] {
  return cell.split(";").map((t): Slot => (t === "s" ? { kind: "sustain" } : t === "r" || t === "" ? { kind: "rest" } : { kind: "onset", move: Number(t) }));
}

// 1拍ぶんの onset 音だけを返す（sustain/rest は音を作らない＝跨ぎ/休は realizeMelody が精算）。
export function cellToNotes(cell: string, anchorPitch: number, scalePitches: number[], beatStart: number): Note[] {
  const base = nearestIdx(scalePitches, anchorPitch);
  const out: Note[] = [];
  parseCell(cell).forEach((s, i) => { if (s.kind === "onset" && Number.isFinite(s.move)) out.push({ pitch: clampScale(scalePitches, base + s.move), start: beatStart + i * 0.5, dur: 0.5 }); });
  return out;
}

// 学習結果：骨格move(±3クランプ)別の cell 頻度。
export interface MelodyCellModel { byMove: Map<number, Map<string, number>> }
const clamp3 = (x: number): number => Math.max(-3, Math.min(3, x));

// units＝{骨格move, その拍のcell} の列 → 条件づけ頻度を数える（リズム細胞と同じ「数えるだけ」）。
export function learnMelodyCells(units: { move: number; cell: string }[]): MelodyCellModel {
  const byMove = new Map<number, Map<string, number>>();
  for (const u of units) {
    const mv = clamp3(u.move);
    const m = byMove.get(mv) ?? byMove.set(mv, new Map()).get(mv)!;
    m.set(u.cell, (m.get(u.cell) ?? 0) + 1);
  }
  return { byMove };
}

function makeRng(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; }; }
function weightedPick(dist: Map<string, number>, r: () => number): string {
  const e = [...dist.entries()];
  const tot = e.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const [k, c] of e) { x -= c; if (x <= 0) return k; }
  return e[e.length - 1]![0];
}

// 骨格move に条件づけて cell をサンプル。該当moveが無ければ最寄りmoveへfallback（空で落ちない）。
export function sampleCell(model: MelodyCellModel, move: number, seed: number): string {
  const mv = clamp3(move);
  let dist = model.byMove.get(mv);
  if (!dist || dist.size === 0) {
    for (let d = 1; d <= 6 && (!dist || dist.size === 0); d++) dist = model.byMove.get(clamp3(mv + d)) ?? model.byMove.get(clamp3(mv - d));
  }
  if (!dist || dist.size === 0) return "0;r"; // 正準記法(拍頭onset＋ウラ休)。旧 "0@0" は parseCell で NaN になる
  return weightedPick(dist, makeRng(seed));
}

// 骨格（1拍ごとの音）＋モデル → 音符列。各拍で「次拍へのmove(度数差)」に条件づけて cell をサンプルし展開。
// 8分slot列(onset/sustain/rest)に直してから音符化：onset=新音開始／sustain=前音継続／rest=前音をそこで切り無音。
// ＝伸ばし(長音)・休符(息継ぎ)が出る＝「毎拍べったり」でなく小さなパーツの繋ぎになる。
// 骨格の各拍に載せる cell 列を生成。motifBeats 指定で「前半 motifBeats 拍をモチーフとして後半が周期的に再利用」
// ＝モチーフ(リズム＋contour)を**コミットして反復**（毎拍fresh sampleの“ランダムウォーク感”を解消・identity が立つ）。
export function genCells(skeleton: number[], model: MelodyCellModel, scalePitches: number[], opts: { seed?: number; motifBeats?: number } = {}): string[] {
  const seed = opts.seed ?? 1;
  const idx = (p: number) => nearestIdx(scalePitches, p);
  const cells: string[] = [];
  for (let i = 0; i < skeleton.length; i++) {
    if (opts.motifBeats && i >= opts.motifBeats) { cells.push(cells[i % opts.motifBeats]!); continue; } // モチーフ再利用
    const move = i + 1 < skeleton.length ? idx(skeleton[i + 1]!) - idx(skeleton[i]!) : 0;
    cells.push(sampleCell(model, move, seed + i));
  }
  return cells;
}

export function realizeMelody(skeleton: number[], model: MelodyCellModel, scalePitches: number[], opts: { seed?: number; startBeat?: number; motifBeats?: number } = {}): Note[] {
  const startBeat = opts.startBeat ?? 0;
  const idx = (p: number) => nearestIdx(scalePitches, p);
  const cells = genCells(skeleton, model, scalePitches, opts);
  type Ev = { kind: "onset" | "sustain" | "rest"; pitch?: number; time: number };
  const evs: Ev[] = [];
  for (let i = 0; i < skeleton.length; i++) {
    const slots = parseCell(cells[i]!);
    for (let s = 0; s < 2; s++) {
      const tk = slots[s] ?? { kind: "rest" as const };
      const time = startBeat + i + s * 0.5;
      if (tk.kind === "onset" && Number.isFinite(tk.move)) evs.push({ kind: "onset", pitch: clampScale(scalePitches, idx(skeleton[i]!) + tk.move), time });
      else evs.push({ kind: tk.kind === "sustain" ? "sustain" : "rest", time }); // 非有限moveは休扱い（防御）
    }
  }
  const out: Note[] = [];
  let cur: Note | null = null;
  const close = (t: number) => { if (cur) { cur.dur = Math.max(0.25, t - cur.start); out.push(cur); cur = null; } };
  for (const e of evs) {
    if (e.kind === "onset") { close(e.time); cur = { pitch: e.pitch!, start: e.time, dur: 0.5 }; }
    else if (e.kind === "rest") close(e.time); // 休＝前音を切って無音
    // sustain は何もしない＝cur が伸びる
  }
  close(startBeat + skeleton.length);
  return out;
}

// 音階列の中で、指定pc集合のいずれかに該当し target に最も近いピッチ（同距離は低い方）。
function nearestPitchWithPc(target: number, pcs: number[], scalePitches: number[]): number {
  let best = target, bd = Infinity;
  for (const p of scalePitches) { if (!pcs.includes(((p % 12) + 12) % 12)) continue; const d = Math.abs(p - target); if (d < bd) { bd = d; best = p; } }
  return best;
}

// motif リズム＝1小節(8分8枠)の onset 列(x=onset/.=無)を語彙化（計測：1小節8分は語彙250・80%を97種で覆える＝学習可）。
// 2小節・16分は爆発するので motif の単位は「1小節8分」。これを sample→反復＝groove/coherence が pattern 自体から出る。
export interface BarRhythmModel { patterns: Map<string, number> }
export function learnBarRhythms(patterns: string[]): BarRhythmModel {
  const m = new Map<string, number>();
  for (const p of patterns) if (p.includes("x")) m.set(p, (m.get(p) ?? 0) + 1); // onset無しは除外
  return { patterns: m };
}
export function sampleBarRhythm(model: BarRhythmModel, seed: number): string {
  if (model.patterns.size === 0) return "x.x.x.x."; // 空＝4分打ち
  return weightedPick(model.patterns, makeRng(seed));
}

const clamp7 = (x: number): number => Math.max(-7, Math.min(7, x));
function weightedPickNum(dist: Map<number, number>, r: () => number): number {
  const e = [...dist.entries()]; const t = e.reduce((a, b) => a + b[1], 0);
  let x = r() * t; for (const [k, c] of e) { x -= c; if (x <= 0) return k; }
  return e.length ? e[e.length - 1]![0] : 0;
}

// contour＝音の動きの法則。move遷移 P(m2|m1)（半音・±7クランプ）を学習＝**跳んだら逆向き＋ステップで埋める(gap-fill)**が自然に出る。
// 計測：跳躍(|≥3|)の後 逆向き53%/ステップ59%。無条件サンプルだと「普通通らない道筋」になる（s23の破綻）→マルコフで解消。
export interface MoveModel { trans: Map<number, Map<number, number>> }
export function learnMoveTransitions(melodies: number[][]): MoveModel {
  const trans = new Map<number, Map<number, number>>();
  for (const pitches of melodies) {
    const mv: number[] = [];
    for (let i = 1; i < pitches.length; i++) mv.push(clamp7(pitches[i]! - pitches[i - 1]!));
    for (let i = 1; i < mv.length; i++) { const a = mv[i - 1]!, b = mv[i]!; const m = trans.get(a) ?? trans.set(a, new Map()).get(a)!; m.set(b, (m.get(b) ?? 0) + 1); }
  }
  return { trans };
}
function sampleMoveR(model: MoveModel, prev: number, r: () => number): number {
  const h = model.trans.get(clamp7(prev)) ?? model.trans.get(0);
  return h && h.size ? weightedPickNum(h, r) : 0;
}
// onsetCount 個の累積半音contour（先頭0）。マルコフで歩き、range超過は折返し＝音域内に収める。
export function genContour(onsetCount: number, model: MoveModel, seed: number, opts: { range?: number; revert?: number } = {}): number[] {
  const range = opts.range ?? 9;
  const revert = opts.revert ?? 0; // 0=自由歩行／>0=構造音(0)へ平均回帰＝dwell（漂流せず装飾的に留まる）
  const r = makeRng(seed);
  const out: number[] = []; let cum = 0, prev = 0;
  // 禁則＝三全音(±6)／同方向の跳躍(|≥5|)2連続（Fux）。当たれば再サンプル、ダメなら step へ。
  const forbidden = (m: number, pv: number) => Math.abs(m) === 6 || (Math.abs(m) >= 5 && Math.abs(pv) >= 5 && Math.sign(m) === Math.sign(pv));
  for (let i = 0; i < onsetCount; i++) {
    if (i > 0) {
      let m = sampleMoveR(model, prev, r), tries = 0;
      while (tries < 8 && forbidden(m, prev)) { m = sampleMoveR(model, prev, r); tries++; }
      if (Math.abs(m) === 6) m = m > 0 ? 2 : -2; // 三全音→3度内stepへ（旧:5度跳躍は跳躍過剰の一因＝実測leap19%>real14%）
      if (Math.abs(cum + m) > range) m = -Math.sign(cum || 1) * Math.min(2, Math.abs(m)); // range超過は小さな逆step（旧:同magの逆跳躍＝反転過剰46%>real34%の主因）
      cum += m; prev = m;
      if (revert > 0) cum -= Math.round(cum * revert); // 平均回帰＝構造音へ戻る（dwell）
    }
    out.push(cum);
  }
  return out;
}

// 学習骨格＝実曲の「構造音の度数遷移」を P(度数 | コード根(調相対), 直前度数) で学習（手書きUrlinieを置換）。
// 計測：実曲の骨格は密度低(dwell長)・tonic/3度中心・低い。＝手書きでなくデータで度数分布/密度を合わせる。
export interface SkeletonModel { trans: Map<string, Map<number, number>> }
// 同梱済み学習骨格（POP909から長短別に学習）を Map へ復元（初回のみ・以後キャッシュ）。minor=短調モデル。
let _shippedSkel: SkeletonModel | null = null, _shippedSkelMin: SkeletonModel | null = null;
function buildSkel(data: Record<string, Record<string, number>>): SkeletonModel {
  const trans = new Map<string, Map<number, number>>();
  for (const [k, m] of Object.entries(data)) { const mm = new Map<number, number>(); for (const [d, c] of Object.entries(m)) mm.set(Number(d), c); trans.set(k, mm); }
  return { trans };
}
export function loadSkeletonModel(minor = false): SkeletonModel {
  if (minor) return (_shippedSkelMin ??= buildSkel(SKELETON_MODEL_MINOR_DATA));
  return (_shippedSkel ??= buildSkel(SKELETON_MODEL_DATA));
}
export function learnSkeleton(units: { chordRel: number; prevDeg: number; deg: number }[]): SkeletonModel {
  const trans = new Map<string, Map<number, number>>();
  for (const u of units) {
    const k = `${((u.chordRel % 12) + 12) % 12}|${u.prevDeg}`;
    const m = trans.get(k) ?? trans.set(k, new Map()).get(k)!;
    m.set(u.deg, (m.get(u.deg) ?? 0) + 1);
  }
  return { trans };
}
function sampleSkelDeg(model: SkeletonModel, chordRel: number, prevDeg: number, r: () => number): number {
  const cr = ((chordRel % 12) + 12) % 12;
  let h = model.trans.get(`${cr}|${prevDeg}`);
  if (!h || !h.size) h = model.trans.get(`${cr}|-1`);                                   // 直前無視
  if (!h || !h.size) for (const [k, m] of model.trans) { if (k.startsWith(`${cr}|`) && m.size) { h = m; break; } } // 任意prev・同コード
  if (!h || !h.size) for (const [, m] of model.trans) { if (m.size) { h = m; break; } } // 何でも
  return h && h.size ? weightedPickNum(h, r) : 0;
}
// コード根(調相対pc)列＋学習モデル → 骨格ピッチ列(bars*beatsPerBar)。各強拍で度数をサンプルし声部進行で配置、次強拍まで保持。
export function genSkeletonFromModel(chordRootsPerBar: number[], model: SkeletonModel, scalePitches: number[], opts: { tonicPc?: number; seed?: number; beatsPerBar?: number; strongQuarters?: number[]; start?: number; motif?: boolean; repetition?: number; rangeSteps?: number } = {}): number[] {
  const tonicPc = (((opts.tonicPc ?? 0) % 12) + 12) % 12;
  const bpb = opts.beatsPerBar ?? 4;
  const strongQ = opts.strongQuarters ?? [0, 2];
  const r = makeRng(opts.seed ?? 1);
  const near = nearestIdx(scalePitches, opts.start ?? 60);
  let tonicIdx = 0, bd = Infinity;
  for (let i = 0; i < scalePitches.length; i++) if (((scalePitches[i]! % 12) + 12) % 12 === tonicPc) { const d = Math.abs(i - near); if (d < bd) { bd = d; tonicIdx = i; } }
  const bars = chordRootsPerBar.length;
  const total = bars * bpb;
  // 中景の核＝**動機の反復(parallelism)**：2小節motifの頭の輪郭を反復・尾を句機能で変える(問いと答え)＝AA'BB'。
  // 音階ステップ(index)空間で反復＝調内維持。音域窓でクランプ＝下降ドリフト防止。実曲の骨格反復率54-60%に対応。
  const slots: { beat: number; cr: number }[] = [];
  for (let bar = 0; bar < bars; bar++) { const cr = (((chordRootsPerBar[bar]! - tonicPc) % 12) + 12) % 12; for (const q of strongQ) slots.push({ beat: bar * bpb + q, cr }); }
  const spu = strongQ.length * 2;
  // 制約① rangeSteps＝構造線の音域(音階ステップ)。6度差≈5-6。既定12(≒1.7oct)。主音やや下〜上に窓。
  const span = Math.max(2, opts.rangeSteps ?? 10);
  const lo = tonicIdx - Math.round(span * 0.35), hi = tonicIdx + Math.round(span * 0.5), cl = (i: number) => Math.max(lo, Math.min(hi, i)); // 上方向を抑える（主音の上に5度程度＝climb抑制）
  // 声部進行：前音に最寄りのオクターブ＋**中心(主音レジスタ)へ寄せる**＝音域端へのドリフト→大跳躍を防ぐ。
  const idxOf = (deg: number, pi: number) => { let best = cl(tonicIdx + deg), bdL = Infinity; for (let oc = -2; oc <= 2; oc++) { const i2 = tonicIdx + deg + 7 * oc; if (i2 < lo || i2 > hi) continue; const d = Math.abs(i2 - pi) + 0.7 * Math.abs(i2 - tonicIdx); if (d < bdL) { bdL = d; best = i2; } } return best; };
  // 制約② repetition＝反復強度 0=反復なし(隣接31%)〜1=強反復(61%)。既定0.85(≒58%・耳で「弱い」解消・実曲42%超だが裸の骨格は他の同一性手掛りが無い分 強めが要る)。
  const rep = opts.repetition ?? 0.85;
  const useMotif = opts.motif !== false && rep > 0;
  const I: number[] = new Array(slots.length).fill(tonicIdx);
  const smp = (cr: number, pv: number) => ((sampleSkelDeg(model, cr, pv, r) % 7) + 7) % 7;
  let pv = -1, pi = tonicIdx, hA: number[] | null = null, hB: number[] | null = null;
  const nu = Math.ceil(slots.length / spu);
  for (let u = 0; u < nu; u++) {
    const base = u * spu, reuse = !useMotif ? null : (u % 4 === 1 ? hA : u % 4 === 3 ? hB : null), phraseEnd = u % 2 === 1;
    for (let s = 0; s < spu && base + s < slots.length; s++) {
      const cr = slots[base + s]!.cr;
      let idx: number;
      if (!reuse || s === 0) idx = idxOf(smp(cr, pv), pi);
      else if (s < spu - 1) { // 頭＝動機の反復。repetition＝「頭の正確なステップ移動を反復」する確率。残りはfresh＝varied反復。
        idx = r() < rep ? cl(pi + (reuse[s] ?? 0)) : idxOf(smp(cr, pv), pi);
      } else idx = phraseEnd ? idxOf(0, pi) : idxOf(smp(cr, pv), pi); // 尾：句末=主音(答え)
      I[base + s] = idx; pi = idx; pv = ((idx - tonicIdx) % 7 + 7) % 7;
    }
    if (useMotif && u % 4 === 0) { hA = [0]; for (let s = 1; s < spu; s++) hA.push((I[base + s] ?? tonicIdx) - (I[base + s - 1] ?? tonicIdx)); } // 連続ステップ移動(符号付き大きさ)を記録＝正確な輪郭の反復用
    if (useMotif && u % 4 === 2) { hB = [0]; for (let s = 1; s < spu; s++) hB.push((I[base + s] ?? tonicIdx) - (I[base + s - 1] ?? tonicIdx)); }
  }
  const points = slots.map((sl, i) => ({ beat: sl.beat, pitch: scalePitches[Math.max(0, Math.min(scalePitches.length - 1, I[i]!))]! }));
  const out: number[] = [];
  for (let b = 0; b < total; b++) { let p = points[0]?.pitch ?? scalePitches[tonicIdx]!; for (const pt of points) { if (pt.beat <= b + 1e-6) p = pt.pitch; else break; } out.push(p); }
  return out;
}

// 統合＝有機メロ生成。コード追従骨格＋2小節motifリズム(語彙sample・反復)＋Markov contour(gap-fill)＋位置段階snap。
// chordPcsPerBar[bar]＝その小節のコード構成pc。返り＝音符列（durは次onsetまで・末は伸ばし）。
export function genMotifMelody(chordPcsPerBar: number[][], scalePitches: number[], rhythmModel: BarRhythmModel, moveModel: MoveModel, opts: { seed?: number; tonicPc?: number; fifthPc?: number; ending?: "open" | "close"; start?: number; contourRange?: number; distinctMotifs?: number; cadenceForce?: number; revert?: number; skelModel?: SkeletonModel; skeletonRest?: boolean; appoggiatura?: number; repetition?: number; rangeSteps?: number; meter?: { beatsPerBar?: number; eighthsPerBar?: number; strongQuarters?: number[] } } = {}): Note[] {
  const seed = opts.seed ?? 1;
  const bars = chordPcsPerBar.length;
  // meter：4/4 既定（4四分/小節・8枠/小節・強拍0,2）。6/8＝{3, 6, [0,1.5]}。中景(contour)は流用。
  const bpb = opts.meter?.beatsPerBar ?? 4;        // 1小節の四分数
  const epb = opts.meter?.eighthsPerBar ?? 8;      // 1小節の8分枠数（=bpb*2）
  const strongQ = opts.meter?.strongQuarters ?? [0, 2];
  const range = opts.contourRange ?? 5;            // contour 振れ幅（FMDスイープで5が最も実曲寄り）
  const nM = Math.max(1, opts.distinctMotifs ?? 2); // 区別する2小節motifの数（FMD: 2=AABB最小・4は実曲から遠い）
  const idx = (p: number) => nearestIdx(scalePitches, p);
  const skel = opts.skelModel
    ? genSkeletonFromModel(chordPcsPerBar.map((pcs) => pcs[0] ?? 0), opts.skelModel, scalePitches, { tonicPc: opts.tonicPc ?? 0, seed, beatsPerBar: bpb, strongQuarters: strongQ, start: opts.start ?? 60, repetition: opts.repetition, rangeSteps: opts.rangeSteps })
    : genSkeleton(chordPcsPerBar, scalePitches, { ending: opts.ending ?? "close", tonicPc: opts.tonicPc ?? 0, fifthPc: opts.fifthPc ?? 7, start: opts.start ?? 67, beatsPerBar: bpb });
  // 骨格を**半音クラッシュの時だけ**コードトーンへ寄せる（avoid-note解消＋短調Vの導音）。全音離れた経過音は残す＝実曲の「良い雑さ」。
  if (opts.skelModel) for (let b = 0; b < skel.length; b++) { const pcs = chordPcsPerBar[Math.min(bars - 1, Math.floor(b / bpb))]; if (pcs && pcs.length) { const pc = ((skel[b]! % 12) + 12) % 12; if (!pcs.includes(pc)) { if (pcs.includes((pc + 11) % 12)) skel[b]! -= 1; else if (pcs.includes((pc + 1) % 12)) skel[b]! += 1; } } }
  // nM 個の (2小節motif=リズム+contour) を用意。ブロックは循環で割当（変化を与える）。
  const rev = opts.revert ?? 0; // contour 平均回帰（dwell）。検証：revert>0/拍別アンカーは FMD 退行ゆえ既定off。
  const motifs = Array.from({ length: nM }, (_, k) => {
    const sd = seed + k * 101;
    const pat = [sampleBarRhythm(rhythmModel, sd), sampleBarRhythm(rhythmModel, sd + 37)];
    const ons: number[] = [];
    for (let bar = 0; bar < 2; bar++) for (let s = 0; s < epb; s++) if (pat[bar]![s] === "x") ons.push(bar * epb + s);
    return { ons, sem: genContour(ons.length, moveModel, sd + 5, { range, revert: rev }) };
  });
  // 骨格休符マスク：強拍スロット(2拍粒)別の rest率(同梱・実曲)で、その2拍を無音化＝**句頭の遅延入場**。
  // 実曲は曲頭強拍を86%休む（入りが遅れる）。骨格=構造の単位に休符を置く＝表面の2小節規則休符(筋悪)でなく句頭へ正しく配置。
  const restMask = new Array<boolean>(bars * bpb).fill(false);
  if (opts.skelModel && opts.skeletonRest !== false) {
    const rr = makeRng(seed + 777);
    for (let bar = 0; bar < bars; bar++) for (let qi = 0; qi < strongQ.length; qi++) {
      const slot = bar * strongQ.length + qi; // 強拍スロット通し番号
      if (rr() < (SKELETON_REST_BY_POS[slot % SKELETON_REST_BY_POS.length] ?? 0)) {
        const t0 = bar * bpb + strongQ[qi]!;
        for (let b = Math.floor(t0); b < t0 + 2 && b < bars * bpb; b++) restMask[b] = true; // 2拍(骨格保持長)を無音化
      }
    }
  }
  // 八分の核＝**骨格点＋決定的diminution**：onsetが強拍上なら骨格音そのもの、拍間なら隣り合う骨格点A→Bを
  // 音程に応じて埋める（3度+=経過音／2度・同=刺繍）。**決定的**ゆえ骨格が反復(AA'BB')する所で八分も同じ図形が戻る＝反復が伝播。
  const total1 = bars * bpb;
  const dimin = (t: number): number => {
    const seg = Math.floor(t / 2) * 2; // 直前の強拍(2拍grid)
    const A = skel[Math.min(total1 - 1, seg)] ?? 67, B = skel[Math.min(total1 - 1, seg + 2)] ?? A;
    if (t - seg < 0.25) return A; // 強拍上＝骨格点を置く
    const ai = idx(A), bi = idx(B), steps = bi - ai, frac = (t - seg) / 2; // 2拍区間内の進捗 0..0.75
    if (Math.abs(steps) >= 2) return clampScale(scalePitches, ai + Math.round(steps * frac)); // 経過音(A→Bを順次に)
    const nb = steps !== 0 ? Math.sign(steps) : (Math.round(t * 2) % 2 === 0 ? 1 : -1); // 刺繍(隣)／同方向
    return frac >= 0.6 ? clampScale(scalePitches, ai + steps) : clampScale(scalePitches, ai + nb);
  };
  const notes: Note[] = [];
  for (let blk = 0; blk * 2 < bars; blk++) {
    const baseBar = blk * 2;
    const { ons } = motifs[Math.floor(blk / 2) % nM]!; // リズムmotifを骨格反復(AA'BB')に揃える＝A,A'に同じリズム＝八分の反復が伝播([0,0,1,1])
    ons.forEach((sl) => {
      const t = baseBar * bpb + sl * 0.5; // 8分=0.5四分
      if (t >= bars * bpb - 1e-6) return;
      if (restMask[Math.floor(t + 1e-6)]) return; // 骨格休符域＝無音(遅延入場)
      notes.push({ pitch: dimin(t), start: t, dur: 0.5 });
    });
  }
  notes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < notes.length; i++) notes[i]!.dur = (notes[i + 1]?.start ?? notes[i]!.start + 0.5) - notes[i]!.start;
  for (const n of notes) for (let b = Math.ceil(n.start + 1e-6); b < n.start + n.dur - 1e-6; b++) if (restMask[b]) { n.dur = b - n.start; break; } // 直前音は休符域の手前で切る＝息継ぎ
  snapToChordTones(notes, (beat) => chordPcsPerBar[Math.min(bars - 1, Math.floor(beat / bpb))] ?? [], scalePitches, { barQuarters: bpb, strongQuarters: strongQ });
  // 表面の gap-fill：跳躍(|≥5|)の直後が逆向きstepでなければ、弱位置の次音を逆向き1stepへ（強拍=協和は触らない）。
  // ＝ブロック境界の跳躍が解決しない問題（E-rule の gapFill=0）を表面で回収。
  for (let j = 2; j < notes.length; j++) {
    const pm = notes[j - 1]!.pitch - notes[j - 2]!.pitch;
    if (Math.abs(pm) < 5) continue;
    const cm = notes[j]!.pitch - notes[j - 1]!.pitch;
    if (Math.sign(cm) === -Math.sign(pm) && Math.abs(cm) <= 2) continue; // 既に回収済み
    const inBar = ((notes[j]!.start % bpb) + bpb) % bpb;
    if (strongQ.some((q) => Math.abs(inBar - q) < 0.12)) continue; // 強拍は協和維持で触らない
    notes[j]!.pitch = clampScale(scalePitches, idx(notes[j - 1]!.pitch) - Math.sign(pm)); // 逆向き1step
  }
  // 倚音(appoggiatura)挿入＝中景の表情：強拍コードトーンの一部を「次の解決音(CT)の1音上」へ上げる＝下行解決する強拍の非和声。
  // 計測：実曲の強拍は57%CT(=43%が倚音/掛留)だが我々は99%＝綺麗すぎ。contourは強拍に非和声を作らない(骨格=CTに張付く)ので能動挿入。
  if (opts.appoggiatura) { const ra = makeRng(seed + 41);
    for (let i = 0; i < notes.length - 1; i++) {
      const n = notes[i]!, nx = notes[i + 1]!, inBar = ((n.start % bpb) + bpb) % bpb;
      if (!strongQ.some((q) => Math.abs(inBar - q) < 0.12) || n.dur >= 1.5 || nx.start - n.start > 1.01) continue; // 強拍・非カデンツ・次音が隣接
      const pcsN = chordPcsPerBar[Math.min(bars - 1, Math.floor(n.start / bpb))] ?? [];
      const pcsX = chordPcsPerBar[Math.min(bars - 1, Math.floor(nx.start / bpb))] ?? [];
      if (!pcsN.includes(((n.pitch % 12) + 12) % 12) || !pcsX.includes(((nx.pitch % 12) + 12) % 12) || ra() >= opts.appoggiatura) continue; // 元=強拍CT・次=解決音(CT)
      const cand = clampScale(scalePitches, idx(nx.pitch) + 1); // 解決音の1音上
      if (!pcsN.includes(((cand % 12) + 12) % 12) && Math.abs(cand - nx.pitch) <= 2) n.pitch = cand; // 非和声なら倚音化(下行解決)
    }
  }
  // 終止 cadence：最後の音を close=調tonic / open=調5度 へ（確率 cadenceForce）。
  // 計測 close=主音73%＝100%強制は硬すぎ→確率化。既定0.73（自前データ準拠。FMDは0が最小だが参照=曲中切片で句末でない交絡ゆえ採らない）。
  if (notes.length && makeRng(seed + 99)() < (opts.cadenceForce ?? 0.73)) { const endPc = (opts.ending ?? "close") === "open" ? (opts.fifthPc ?? 7) : (opts.tonicPc ?? 0); notes[notes.length - 1]!.pitch = nearestPitchWithPc(notes[notes.length - 1]!.pitch, [endPc], scalePitches); }
  return notes;
}

// 前借り(アンティシペーション)＝groove＝**位置固定**で一定の食い。計測：食い(次拍を跨ぐ)は各拍の最後の16分"a"
// (位置3/7/11/15)に集中(~18%・毎拍同じ)＝16分が次拍を食う。ランダムでなく**毎小節 同じ拍を同じ量**で食うから反復と噛んで groove になる。
// beats＝小節内のどの拍(0-3)の onset を食うか。offset＝前借り量(既定0.25=16分"a")。notes を破壊的に更新。
export function anticipate(notes: Note[], opts: { beats?: number[]; offset?: number } = {}): void {
  const beats = opts.beats ?? [2]; // 既定＝各小節3拍目を食う
  const off = opts.offset ?? 0.25; // 16分前借り＝"a"
  const s = [...notes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < s.length; i++) {
    const n = s[i]!;
    const inBar = ((n.start % 4) + 4) % 4;
    if (!beats.some((b) => Math.abs(inBar - b) < 0.06)) continue; // 指定拍の onset のみ・毎小節一定
    const prev = s[i - 1]!;
    const newStart = n.start - off;
    if (newStart <= prev.start + 0.1) continue; // 前音より前へは出さない
    n.dur += n.start - newStart; n.start = newStart; // タイで跨ぐ（終端は不変）
    if (prev.start + prev.dur > newStart) prev.dur = Math.max(0.1, newStart - prev.start); // 前音を詰める
  }
}

// コードトーンへのスナップ＝**位置段階**（計測：強拍90%/弱拍・ウラ55-60%/長音やや高）。
// 縛る＝強拍(小節内0,2拍・極短は除く) or 長音(dur≥longDur)。弱拍頭/ウラ/短音は**通す**＝passing/滑らかさが生きる。
// （小節頭は start を4拍周期の倍数と仮定。chordPcsAt(beat)＝その拍のコード構成pc。）
export function snapToChordTones(notes: Note[], chordPcsAt: (beat: number) => number[], scalePitches: number[], opts: { longDur?: number; shortFree?: number; barQuarters?: number; strongQuarters?: number[]; appoggiatura?: number; seed?: number } = {}): void {
  const longDur = opts.longDur ?? 1.5;     // これ以上は位置に関わらず縛る（カデンツ/着地）
  const shortFree = opts.shortFree ?? 0.3; // これ未満は強拍でも通す（解決じみた極短音）
  const barQuarters = opts.barQuarters ?? 4;         // 1小節の四分数（4/4=4, 6/8=3）
  const strongQuarters = opts.strongQuarters ?? [0, 2]; // 小節内の強拍位置（四分）（6/8=[0,1.5]）
  const appo = opts.appoggiatura ?? 0; // 倚音率：強拍の非和声音が「次音へ順次解決」する時、確率appoで残す＝実曲の強拍CT57%(43%は倚音/掛留)を再現
  const r = makeRng(opts.seed ?? 7);
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const inBar = ((n.start % barQuarters) + barQuarters) % barQuarters;
    const strong = strongQuarters.some((q) => Math.abs(inBar - q) < 0.12);
    if (!((strong && n.dur >= shortFree) || n.dur >= longDur)) continue; // それ以外は自由
    const pcs = chordPcsAt(n.start);
    if (!pcs.length || pcs.includes(((n.pitch % 12) + 12) % 12)) continue; // 既にコードトーン
    if (appo > 0 && strong && n.dur < longDur) { // 倚音：非和声だが次が順次でコードトーン(=解決)なら確率で残す（カデンツ長音は除く）
      const nx = notes[i + 1];
      if (nx && Math.abs(nx.pitch - n.pitch) <= 2 && chordPcsAt(nx.start).includes(((nx.pitch % 12) + 12) % 12) && r() < appo) continue;
    }
    n.pitch = nearestPitchWithPc(n.pitch, pcs, scalePitches);
  }
}

// 骨格生成 v2＝**Urlinie準拠**（Schenker/Fux/GTTM）：頭音 Kopfton(3̂/5̂)から 1̂ への**順次下降の構造線**を
// 背景に敷き、各拍はその小節のコードトーンで接地。**単一クライマックス**（頭が最高）＋**interruption**（句の中点で
// 一旦 2̂ へ＝半終止 open、後半で 1̂ へ完全下降 close）。旧 v1 の小節内アルペジオ跳躍を順次連結へ置換。
// chordPcsPerBar[bar]＝その小節のコード構成pc。返り＝bars*4 拍ぶんの骨格ピッチ列。
export function genSkeleton(chordPcsPerBar: number[][], scalePitches: number[], opts: { ending?: "open" | "close"; tonicPc?: number; fifthPc?: number; start?: number; beatsPerBar?: number } = {}): number[] {
  const { ending = "close", tonicPc = 0, fifthPc = 7, start = 67, beatsPerBar = 4 } = opts;
  const bars = chordPcsPerBar.length;
  const totalBeats = bars * beatsPerBar;
  const tonicPcN = ((tonicPc % 12) + 12) % 12;
  // 主音の音階インデックス（start 近傍のレジスタ）
  const near = nearestIdx(scalePitches, start);
  let tonicIdx = 0, bd = Infinity;
  for (let i = 0; i < scalePitches.length; i++) if (((scalePitches[i]! % 12) + 12) % 12 === tonicPcN) { const d = Math.abs(i - near); if (d < bd) { bd = d; tonicIdx = i; } }
  const kopf = bars >= 8 ? 4 : 2; // 5̂（長尺）/ 3̂（既定）＝音階度（主音から上の段数）
  const half = Math.max(1, Math.floor(bars / 2) * beatsPerBar); // interruption の中点（拍）
  const out: number[] = [];
  for (let beat = 0; beat < totalBeats; beat++) {
    // 背景の目標度数：前半 Kopfton→1（2̂ で半終止）、後半 Kopfton→0（1̂ で完全下降）
    let deg: number;
    if (beat < half) { const f = half > 1 ? beat / (half - 1) : 0; deg = kopf - f * (kopf - 1); }
    else { const span = totalBeats - half; const f = span > 1 ? (beat - half) / (span - 1) : 0; deg = kopf - f * kopf; }
    const targetPitch = scalePitches[Math.max(0, Math.min(scalePitches.length - 1, tonicIdx + Math.round(deg)))]!;
    out.push(nearestPitchWithPc(targetPitch, chordPcsPerBar[Math.floor(beat / beatsPerBar)]!, scalePitches)); // 目標度数に最も近いコードトーンで接地
  }
  if (out.length) out[out.length - 1] = nearestPitchWithPc(out[out.length - 1]!, [ending === "open" ? fifthPc : tonicPc], scalePitches);
  return out;
}

// ── A2レシピ（検証済・docs/research/melody-recipe-validated.md）の production 実装。
// 骨格(句頭アンカー)＋モチーフ選別(N=12 score最良)＋輪郭駆動の近景(強拍=輪郭が指す音の最近CT)＋
// 発展(A/A'尾変奏/B反行+弧/A''トニック着地)＋16分解像度。旧 genMotifMelody は保持（回帰防止）。
export interface MotifModel16 { rhythm16: Record<string, number>; move: MoveModel }
let _shippedMotif16: MotifModel16 | null = null;
// 同梱データ(RHYTHM16_DATA/MOVE_TRANS_DATA・統計のみ)から MotifModel16 を構築（初回のみ・以後キャッシュ）。
export function loadMotifModel16(): MotifModel16 {
  if (_shippedMotif16) return _shippedMotif16;
  const trans = new Map<number, Map<number, number>>();
  for (const [a, m] of Object.entries(MOVE_TRANS_DATA)) {
    const mm = new Map<number, number>();
    for (const [k, c] of Object.entries(m)) mm.set(Number(k), c);
    trans.set(Number(a), mm);
  }
  return (_shippedMotif16 = { rhythm16: RHYTHM16_DATA, move: { trans } });
}

// Record<string,number> から重み付き抽選（weightedPick の Record 版＝_A2 の wpS）。
function weightedPickRec(rec: Record<string, number>, r: () => number): string {
  const e = Object.entries(rec);
  const tot = e.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const [k, c] of e) { x -= c; if (x <= 0) return k; }
  return e[0]?.[0] ?? "";
}

interface Motif16 { ons: number[]; mv: number[]; run: boolean[] }

// A2レシピ本体。chordPcsPerBar/roots/quals は各bar(=4拍)のコード、scalePitches=その調の音階ピッチ列、
// motif16=loadMotifModel16()。骨格は opts.skelModel(genSkeletonFromModel) を句頭アンカーに使う。返り＝Note[]。
// 純粋・seed決定的（makeRng のみ・Math.random/Date 不使用）。
export function genMotifMelodyV2(
  chordPcsPerBar: number[][],
  chordRootsPerBar: number[],
  chordQuals: string[],
  scalePitches: number[],
  motif16: MotifModel16,
  opts: { seed?: number; tonicPc?: number; minor?: boolean; skelModel?: SkeletonModel; motifBars?: number; compound?: boolean } = {},
): Note[] {
  const seed = opts.seed ?? 1;
  const tonicPc = (((opts.tonicPc ?? 0) % 12) + 12) % 12;
  const minor = opts.minor ?? false;
  const sp = scalePitches;
  const bars = chordPcsPerBar.length;
  const moveTrans = motif16.move.trans;
  const mb = Math.max(1, Math.min(4, Math.round(opts.motifBars ?? 2))); // モチーフ/ブロック長（小節）。短=反復多/長=展開的。
  // 拍子分岐：既定=4/4（1小節=4四分・16分16枠グリッド）。compound=6/8等（1小節=3四分・8分6枠グリッド・3+3）。
  // 骨格/move/選別/発展/弧は共通。差し替えるのは「リズム語彙・時間map・onset上下限・孤立フィルタ・跳ね(dur)」のみ（_68.ts 忠実）。
  const compound = opts.compound ?? false;
  const barLen = compound ? 3 : 4; // 1小節の四分数
  // 6/8リズム＝設計重み付き6枠パターンを抽選（RHYTHM68_DATA）。runningはやや強め＝jig寄り。
  const pick68 = (r: () => number): string => {
    const tot = RHYTHM68_DATA.reduce((a, b) => a + b[1], 0);
    let x = r() * tot;
    for (const [p, w] of RHYTHM68_DATA) { x -= w; if (x <= 0) return p; }
    return RHYTHM68_DATA[0]![0];
  };

  // 各barのコード構成pc（chordPcsPerBar 優先・無ければ root/quality から復元）。
  const pcsOfBar = (bar: number): number[] => {
    const b = Math.max(0, Math.min(bars - 1, bar));
    const pre = chordPcsPerBar[b];
    if (pre && pre.length) return pre;
    return chordPcs((chordRootsPerBar[b] ?? tonicPc) % 12, chordQuals[b] ?? "");
  };

  // モチーフ生成＝16分リズムパターンを2小節ぶん抽選し、各onsetへ move（run=16分走句は方向保持・他はMarkov）。
  const mkMotif = (r: () => number): Motif16 | null => {
    const ons: number[] = [];
    if (compound) {
      // 6/8：1小節=8分6枠(3+3)。t=bar*3+e*0.5。末尾~0.75拍は息継ぎ。onset上下限 2*mb..5*mb・孤立フィルタ>1.6。
      for (let bar = 0; bar < mb; bar++) {
        const p = pick68(r);
        for (let e = 0; e < 6; e++) {
          if (p[e] !== "x") continue;
          const t = bar * 3 + e * 0.5;
          if (t >= mb * 3 - 0.75) continue;
          ons.push(t);
        }
      }
      if (ons.length < 2 * mb || ons.length > 5 * mb) return null;
      const g = ons.slice(1).map((t, i) => t - ons[i]!);
      if (g.length && Math.max(...g) > 1.6) return null;
    } else {
      // 4/4：1小節=16分16枠。t=bar*4+s*0.25。末尾~1.5拍は息継ぎ。
      for (let bar = 0; bar < mb; bar++) {
        const p = weightedPickRec(motif16.rhythm16, r);
        for (let s = 0; s < 16; s++) {
          if (p[s] !== "x") continue;
          const t = bar * 4 + s * 0.25;
          if (t >= mb * 4 - 1.5) continue; // 末尾~1.5拍は息継ぎ
          ons.push(t);
        }
      }
      if (ons.length < 2 * mb || ons.length > 4 * mb) return null;
      if (ons[0]! < 0.5 && r() < 0.5) ons[0] = Math.max(0.25, ons[0]!);
      const _gap = ons.slice(1).map((t, i) => t - ons[i]!);
      if (_gap.length && Math.max(..._gap) > Math.max(2.0, mb)) return null; // 孤立音(大間隔)モチーフは棄却＝繋がった塊のみ（長尺ほど内部restは許容）
    }
    // 16分走句(run)＝4/4のみ（隣接0.25）。6/8は8分グリッドゆえ走句概念なし＝全false（_68 と同じ純Markov contour）。
    const run = compound ? ons.map(() => false) : ons.map((t, i) => (i > 0 && t - ons[i - 1]! <= 0.26) || (i < ons.length - 1 && ons[i + 1]! - t <= 0.26));
    const mv: number[] = [0];
    let rdir = r() < 0.5 ? 1 : -1, leaps = 0;
    for (let i = 1; i < ons.length; i++) {
      let m: number;
      if (run[i]) { if (!run[i - 1]) rdir = r() < 0.5 ? 1 : -1; m = rdir; }
      else {
        m = weightedPickNum(moveTrans.get(clamp7(mv[i - 1]!)) ?? new Map(), r);
        if (m === 0) m = r() < 0.5 ? 1 : -1;
        if (Math.abs(m) >= 3) { if (leaps >= 1) m = Math.sign(m); else leaps++; }
      }
      mv.push(m);
    }
    for (let i = 1; i < mv.length - 1; i++) if (Math.abs(mv[i]!) >= 3) mv[i + 1] = -Math.sign(mv[i]!) * Math.abs(mv[i + 1]! || 1); // 跳躍後は逆向き(gap-fill)
    return { ons, mv, run };
  };

  // スコア＝range4-6・方向転換~2・跳躍≤1・16分走句少・明確なピーク(中央やや後)・始点付近に戻る・音数~6。
  const score = (M: Motif16): number => {
    let cum = 0, hi = 0, lo = 0, peakAt = 0; const cums = [0];
    for (let i = 1; i < M.mv.length; i++) { cum += M.mv[i]!; cums.push(cum); if (cum > hi) { hi = cum; peakAt = i; } lo = Math.min(lo, cum); }
    const range = hi - lo;
    let dirs = 0, pd = 0;
    for (let i = 1; i < M.mv.length; i++) { if (M.mv[i] !== 0 && Math.sign(M.mv[i]!) !== Math.sign(pd) && pd !== 0) dirs++; if (M.mv[i] !== 0) pd = M.mv[i]!; }
    const leaps = M.mv.filter((m) => Math.abs(m) >= 3).length;
    const runN = M.run.filter(Boolean).length;
    const n16 = M.ons.filter((t) => Math.abs(((t * 4) % 2) - 1) < 0.1).length; // 16分裏onset数＝「動きの細かさ」
    const gaps = M.ons.slice(1).map((t, i) => t - M.ons[i]!);
    const maxGap = gaps.length ? Math.max(...gaps) : 0; // モチーフ内の最大間隔＝「孤立音(塊から離れたポツン1音)」
    const firstOns = M.ons[0]!; // 先頭onset＝遅いとブロック頭が無音
    const endRet = Math.abs(cums[cums.length - 1]!);
    const peakMid = Math.abs(peakAt / (M.mv.length - 1) - 0.55);
    // 16分過多(動き細かい)・密度過多(細切れ)・大間隔(孤立音)・頭の遅れ(先頭無音)を減点＝歌える/繋がった塊を選ぶ。
    return -Math.abs(range - 5) - Math.abs(dirs - 2) - 2 * Math.max(0, leaps - 1) - 0.8 * Math.max(0, runN - 2) - 0.7 * n16 - 0.4 * endRet - 2 * peakMid - 0.4 * Math.max(0, M.ons.length - 3 * mb) - 1.3 * Math.max(0, maxGap - 1.5) - 0.6 * Math.max(0, firstOns - 1);
  };

  // 選別＝12個生成しスコア最良を採用（クソ乱数排除）。全滅時は安全な既定モチーフ。
  const genBest = (r: () => number): Motif16 => {
    let best: Motif16 | null = null, bs = -1e9;
    for (let i = 0; i < 12; i++) { const m = mkMotif(r); if (!m) continue; const s = score(m); if (s > bs) { bs = s; best = m; } }
    return best ?? (compound
      ? { ons: [0, 0.5, 1, 1.5, 2.5], mv: [0, 1, 1, -1, 2], run: [false, false, false, false, false] }
      : { ons: [0.5, 1, 1.5, 2.5, 3], mv: [0, 2, -1, 2, -1], run: [false, false, false, false, false] });
  };

  // 尾変奏＝前半を保持し後半の move を引き直す（A'＝問いに対する変化した答え）。
  const varyTail = (M: Motif16, r: () => number): Motif16 => {
    const k = Math.max(2, Math.ceil(M.ons.length / 2));
    const mv = M.mv.slice(0, k);
    let rdir = r() < 0.5 ? 1 : -1;
    for (let i = k; i < M.ons.length; i++) {
      if (M.run[i]) { mv.push(rdir); continue; }
      let m = weightedPickNum(moveTrans.get(clamp7(mv[i - 1]!)) ?? new Map(), r);
      if (m === 0) m = r() < 0.5 ? 1 : -1;
      if (Math.abs(m) >= 3) m = Math.sign(m) * 2;
      mv.push(m);
    }
    return { ons: M.ons, mv, run: M.run };
  };

  // 反行＝move を符号反転（B＝対比だが M から派生・輪郭が上下逆）。
  const invert = (M: Motif16): Motif16 => ({ ons: M.ons, mv: M.mv.map((m, i) => (i === 0 ? 0 : -m)), run: M.run });

  // 近景レンダ＝コミットした輪郭(move)を辿る。強拍(onMain)は「輪郭が指す音の最近コードトーン」＝形を保ち和声に乗る。
  // 16分走句はスカラーsnap。toTonic で句末をトニックへ着地。tr=音域移高(弧の+5等)。
  const snapSc = (c: number): number => { let b = c, bd = 99; for (const q of sp) { const d = Math.abs(q - c); if (d < bd) { bd = d; b = q; } } return b; };
  const ctOf = (c: number, pc: number[]): number => { let b = c, bd = 99; for (const q of sp) { if (!pc.includes(((q % 12) + 12) % 12)) continue; const d = Math.abs(q - c); if (d < bd) { bd = d; b = q; } } return b; };
  const render = (M: Motif16, bar0: number, anchor: number, tr: number, toTonic: boolean): Note[] => {
    const out: Note[] = [];
    let prev = anchor + tr;
    for (let i = 0; i < M.ons.length; i++) {
      const t = bar0 * barLen + M.ons[i]!;
      // 強拍(onMain)：4/4=8分グリッド上かつ非走句／6/8=付点四分ビート頭(inbar 0 と 1.5)。ここは輪郭が指す音の最近CTに乗せる。
      const inbar = ((M.ons[i]! % barLen) + barLen) % barLen;
      const onMain = compound
        ? (Math.abs(inbar) < 0.1 || Math.abs(inbar - 1.5) < 0.1)
        : (Math.abs(M.ons[i]! - Math.round(M.ons[i]! * 2) / 2) < 0.01 && !M.run[i]);
      const pcs = pcsOfBar(Math.floor(t / barLen));
      let p: number;
      if (i === 0) p = ctOf(anchor + tr, pcs);
      else if (toTonic && i === M.ons.length - 1) {
        let b = prev, bd = 99;
        for (const q of sp) { if (((q % 12) + 12) % 12 !== tonicPc) continue; if (Math.abs(q - prev) < bd) { bd = Math.abs(q - prev); b = q; } }
        p = b;
      } else {
        const want = prev + M.mv[i]!;
        p = onMain ? ctOf(want, pcs) : snapSc(want);
        if (p === prev) p = snapSc(prev + (M.mv[i]! >= 0 ? 1 : -1));
      }
      out.push({ pitch: p, start: t, dur: compound ? 0.5 : 0.25 });
      prev = p;
    }
    if (compound) {
      // 6/8 跳ね(jig)＝裏拍は短く(0.55)・拍頭(start%1.5≈0)は伸ばす(1.2/1.4)＝はねるグルーヴ。
      for (let i = 0; i < out.length; i++) {
        const g = (out[i + 1]?.start ?? (bar0 + mb) * 3) - out[i]!.start;
        const onM = Math.abs(out[i]!.start % 1.5) < 0.1;
        out[i]!.dur = g > 1.0 ? Math.min(g, onM ? 1.2 : 0.55) : Math.min(g, onM ? 1.4 : 0.55);
      }
    } else {
      // 句末で音を切り息継ぎ：大gap(>1.4)のみ on拍1.6/裏1.05で切る（少しレガート＝つなげる）・短gapは詰める。
      for (let i = 0; i < out.length; i++) {
        const gap = (out[i + 1]?.start ?? (bar0 + mb) * 4) - out[i]!.start;
        const onB = Math.abs(out[i]!.start - Math.floor(out[i]!.start / 2) * 2) < 0.25;
        out[i]!.dur = gap > 1.4 ? Math.min(gap, onB ? 1.6 : 1.05) : Math.min(gap, 2);
      }
    }
    return out;
  };

  // 骨格＝genSkeletonFromModel（句頭アンカー）。発展＝2小節ブロックで A/A'/B(反行+弧)/A''(トニック着地) を循環。
  const skel = genSkeletonFromModel(chordRootsPerBar, opts.skelModel ?? loadSkeletonModel(minor), sp, { tonicPc, seed, beatsPerBar: 4, strongQuarters: [0, 2], start: 62 });
  const r = makeRng(seed + 5);
  const M = genBest(r);
  const an = (bar: number): number => skel[Math.min(skel.length - 1, bar)] ?? sp[Math.floor(sp.length / 2)] ?? 62;
  const nBlk = Math.ceil(bars / mb);
  const notes: Note[] = [];
  for (let blk = 0; blk < nBlk; blk++) {
    const bar0 = blk * mb;
    const role = blk % 4;
    const last = blk === nBlk - 1;
    const variant = role === 1 ? varyTail(M, r) : role === 2 ? invert(M) : M; // A / A'(尾変奏) / B(反行) / A''
    const tr = role === 2 ? 3 : 0; // 弧＝Bを音域ピーク(+3)へ（+5は音域広げ/多頂点になりがち＝自己チェックで -inRange/-singleClimax）
    notes.push(...render(variant, bar0, an(bar0), tr, last));
  }
  notes.sort((a, b) => a.start - b.start);

  // ── 自己チェック(E-rule)対策の後処理：①強拍CT ②禁則跳躍除去 ③跳躍回収(gap-fill) ④単一頂点 ──
  const strongPos = compound ? [0, 1.5] : [0, 2];
  const onStrong = (t: number): boolean => { const ib = ((t % barLen) + barLen) % barLen; return strongPos.some((p) => Math.abs(ib - p) < 0.12); };
  const ctP = (pitch: number, pcs: number[]): number => { let b = pitch, bd = 99; for (const q of sp) { if (!pcs.includes(((q % 12) + 12) % 12)) continue; const d = Math.abs(q - pitch); if (d < bd) { bd = d; b = q; } } return b; };
  // ② 禁則跳躍(三全音6/7度10,11/8度超)→同方向2スケール段(≈3度)に縮める。③ 跳躍(|≥5|半音)後は逆向きstepで回収。2pass。
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < notes.length; i++) {
      const iv = notes[i]!.pitch - notes[i - 1]!.pitch, a = Math.abs(iv);
      if (a === 6 || a === 10 || a === 11 || a > 12) notes[i]!.pitch = clampScale(sp, nearestIdx(sp, notes[i - 1]!.pitch) + (Math.sign(iv) || 1) * 2);
    }
    for (let i = 1; i < notes.length - 1; i++) {
      const iv = notes[i]!.pitch - notes[i - 1]!.pitch;
      if (Math.abs(iv) >= 5) {
        const nx = notes[i + 1]!.pitch - notes[i]!.pitch;
        if (!(Math.sign(nx) === -Math.sign(iv) && Math.abs(nx) <= 2) && i + 1 < notes.length - 1) { // 句末(最後)は触らない＝終止保護
          const target = notes[i]!.pitch - (Math.sign(iv) || 1) * 1.5;
          notes[i + 1]!.pitch = onStrong(notes[i + 1]!.start) ? ctP(target, pcsOfBar(Math.floor(notes[i + 1]!.start / barLen))) : clampScale(sp, nearestIdx(sp, target));
        }
      }
    }
  }
  // ① 強拍をコードトーンへ（句末トニック着地は保持＝最後の音は触らない）。
  for (let i = 0; i < notes.length - 1; i++) if (onStrong(notes[i]!.start)) notes[i]!.pitch = ctP(notes[i]!.pitch, pcsOfBar(Math.floor(notes[i]!.start / barLen)));
  // ④ 単一頂点＝最高音が複数なら後続をスケール1段下げ（アーチ明確化）。
  const hi = Math.max(...notes.map((n) => n.pitch)), peaks = notes.filter((n, idx) => n.pitch === hi && idx < notes.length - 1); // 句末は除外＝終止保護
  if (peaks.length > 1) for (let k = 1; k < peaks.length; k++) peaks[k]!.pitch = clampScale(sp, nearestIdx(sp, hi) - 1);
  return notes;
}
