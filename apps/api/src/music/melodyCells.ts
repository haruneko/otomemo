import { SKELETON_MODEL_DATA, SKELETON_MODEL_MINOR_DATA, SKELETON_REST_BY_POS } from "./skeletonModelData";
import { RHYTHM16_DATA, MOVE_TRANS_DATA, RHYTHM68_DATA } from "./motifModelData";
import { RHYTHM_PART_PRESETS, partPatternOnsets, buildCustomPartMap, type RhythmPartsOpt } from "./rhythmParts"; // リズムパーツ層 L1/L2（design #20 S4-1/S4-2）
import { chordPcs } from "./theory";
import { classifyNCT, isResolvedNct } from "./degree";
import { type Note } from "@cm/music-core"; // 音符基本形の SSOT（負債#10・Note型一元化）

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
// 動機の度数列（絶対形）を mv（差分）から遅延導出＝deg[0]=0 の開始音アンカー・cumsum（Phase2案B・U1）。
// mv を source-of-truth に保ち、preserve レンダの実現点でのみ導出＝二重表現の同期崩壊を構造的に回避（コード#2）。
// 同度(deg[i]===deg[i-1])＝反復音・回帰が第一級で表現される。invert(mv→-mv)は deg→-deg に自動追従。
export const motifDegrees = (mv: number[]): number[] => {
  const deg: number[] = []; let c = 0;
  for (let i = 0; i < mv.length; i++) { c += i === 0 ? 0 : mv[i]!; deg.push(c); }
  return deg;
};

// 決定的 RNG（線形合同法）＝seed から [0,1) 列を再現。sampleBarRhythm 等 production の重み付き抽選で使う。
function makeRng(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; }; }
// 文字列キー分布からの重み付き抽選（sampleBarRhythm が使用）。
function weightedPick(dist: Map<string, number>, r: () => number): string {
  const e = [...dist.entries()];
  const tot = e.reduce((a, b) => a + b[1], 0);
  let x = r() * tot;
  for (const [k, c] of e) { x -= c; if (x <= 0) return k; }
  return e[e.length - 1]![0];
}

// A2/A3(2026-07-08・design#12-M 短調V7方針)：コード音は調外でも歌える＝pc集合の最近接ピッチを
// **半音空間**で探す（範囲[lo,hi]・同距離は低い方）。旧: スケール∩コードで探すため短調Vの導音(G#)や
// セカンダリードミナントの色音(B♭ over C7)に構造的に乗れなかった。
export function nearestChordTonePitch(target: number, pcs: number[], lo: number, hi: number): number {
  let best = target, bd = Infinity;
  const tpc = ((target % 12) + 12) % 12;
  for (const pc of pcs) {
    const up = target + ((((pc % 12) + 12) % 12) - tpc + 12) % 12; // target以上の最寄り同pc
    for (const cand of [up - 12, up]) {
      if (cand < lo || cand > hi) continue;
      const d = Math.abs(cand - target);
      if (d < bd || (d === bd && cand < best)) { bd = d; best = cand; } // 同距離は低い方＝pcs順に依らず決定的
    }
  }
  return bd === Infinity ? target : best;
}

// 音階列の中で、指定pc集合のいずれかに該当し target に最も近いピッチ（同距離は低い方）。
// A3統一：実体は nearestChordTonePitch（音域はスケール列の端）＝コード音なら調外も可。
function nearestPitchWithPc(target: number, pcs: number[], scalePitches: number[]): number {
  if (!pcs.length) return target;
  return nearestChordTonePitch(target, pcs, scalePitches[0] ?? 48, scalePitches[scalePitches.length - 1] ?? 84);
}

// C1(2026-07-08)：句頭アンカー＝骨格(beat索引・長さbars*bpb)から「ブロック頭barのdownbeat＝skel[bar*bpb]」を引く。
// 旧バグ＝skel[bar]（bar番号をbeat扱い）でアンカーが曲頭数拍に縮退・構造線後半が未使用だった。
export function blockAnchorFromSkeleton(skel: number[], bar: number, beatsPerBar: number, fallback: number): number {
  return skel[Math.min(skel.length - 1, bar * beatsPerBar)] ?? fallback;
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
export function genSkeletonFromModel(chordRootsPerBar: number[], model: SkeletonModel, scalePitches: number[], opts: { tonicPc?: number; seed?: number; beatsPerBar?: number; strongQuarters?: number[]; start?: number; motif?: boolean; repetition?: number; rangeSteps?: number; phraseEnds?: { bar: number; deg: number }[]; arc?: "arch" } = {}): number[] {
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
  const nuAll = Math.max(1, Math.ceil(slots.length / spu));
  // 脱平面化(2026-07-09 批判レビューCP)：構造線を「主音平面」でなく **Kopfton→主音の下降(Urlinie近似)** へ。
  // ctr(u)=曲頭 tonic+kopf(≈3度上)から曲末 tonic へ線形下降。声部進行の引きをこの ctr へ（旧: 主音レジスタへ 0.7 の
  // 強い引き→全部主音へ潰れていた＝実測 主音pc43%/同音44%）。引きを 0.3 へ弱め、度数サンプルが素直に立つように。
  const kopf = Math.min(hi - tonicIdx, Math.max(2, Math.round(span * 0.4))); // Kopfton の高さ(音階ステップ・≈5̂)
  // arc："arch"＝下降線でなく **山なり**（sin：句頭tonic→中間で頂点kopf→句末tonic）。実メロのサビは登って落ちる弧が多い
  // （research 2026-07-10 頂点位置 0.09→実0.32 の是正）。既定(未指定)＝従来の Kopfton→主音 下降＝bit一致。
  const ctrOf = (u: number) => {
    const frac = nuAll > 1 ? u / (nuAll - 1) : 0;
    const shape = opts.arc === "arch" ? Math.sin(Math.PI * frac) : 1 - frac;
    return cl(tonicIdx + Math.round(kopf * shape));
  };
  // 声部進行：前音に最寄りのオクターブ＋**構造線 ctr へ緩く寄せる**（旧: 主音へ強く寄せ平面化）。
  const idxOf = (deg: number, pi: number, ctr: number) => { let best = cl(tonicIdx + deg), bdL = Infinity; for (let oc = -2; oc <= 2; oc++) { const i2 = tonicIdx + deg + 7 * oc; if (i2 < lo || i2 > hi) continue; const d = Math.abs(i2 - pi) + 0.2 * Math.abs(i2 - ctr); if (d < bdL) { bdL = d; best = i2; } } return best; };
  // 制約② repetition＝反復強度 0=反復なし(隣接31%)〜1=強反復(61%)。既定0.85(≒58%・耳で「弱い」解消・実曲42%超だが裸の骨格は他の同一性手掛りが無い分 強めが要る)。
  const rep = opts.repetition ?? 0.85;
  const useMotif = opts.motif !== false && rep > 0;
  const I: number[] = new Array(slots.length).fill(tonicIdx);
  const smp = (cr: number, pv: number) => ((sampleSkelDeg(model, cr, pv, r) % 7) + 7) % 7;
  let pv = -1, pi = ctrOf(0), hA: number[] | null = null, hB: number[] | null = null; // 開始は Kopfton レジスタ（旧: 主音）
  const nu = nuAll;
  // D-P1(2026-07-09 監査D)：句割りを骨格に伝える。phraseEnds 指定時は unit尾のバーが句末なら句のカデンツ度数へ着地
  // （対称=各unit尾に整合／非対称=unit尾に落ちる句末のみ・可変長ブロックP2は別）。未指定=従来 u%2 の 5̂/1̂（bit一致）。
  const pe = opts.phraseEnds;
  for (let u = 0; u < nu; u++) {
    const base = u * spu, reuse = !useMotif ? null : (u % 4 === 1 ? hA : u % 4 === 3 ? hB : null), phraseEnd = u % 2 === 1, lastU = u === nu - 1, ctr = ctrOf(u);
    const tailBar = Math.floor((slots[Math.min(base + spu - 1, slots.length - 1)]!.beat) / bpb);
    const peHit = pe?.find((x) => x.bar === tailBar); // この unit尾のバーが句末か
    for (let s = 0; s < spu && base + s < slots.length; s++) {
      const cr = slots[base + s]!.cr;
      let idx: number;
      if (!reuse || s === 0) idx = idxOf(smp(cr, pv), pi, ctr);
      else if (s < spu - 1) { // 頭＝動機の反復。repetition＝「頭の正確なステップ移動を反復」する確率。残りはfresh＝varied反復。
        idx = r() < rep ? cl(pi + (reuse[s] ?? 0)) : idxOf(smp(cr, pv), pi, ctr);
      } else if (pe) idx = lastU ? idxOf(0, pi, tonicIdx) : peHit ? idxOf(peHit.deg, pi, ctr) : idxOf(smp(cr, pv), pi, ctr); // 句割り駆動：句末は cadence度数着地・非句末は自由
      else idx = lastU ? idxOf(0, pi, tonicIdx) : phraseEnd ? idxOf(4, pi, ctr) : idxOf(smp(cr, pv), pi, ctr); // 従来：最終=主音/中間句末=5̂
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

export interface Motif16 { ons: number[]; mv: number[]; run: boolean[] }

// render の逆＝部分メロ(Note[])から Motif16 を抽出。補完(completion)の種にする。
// ons=各音の「先頭音の小節頭」からの相対拍（start%barLen 起点で詰める）／mv=[0, …連続音のclamp7半音差]／
// run=隣接onsetが<=0.26（16分走句）。partial が 1-2小節想定でも不揃いでも落ちない（防御）。
export function extractMotif16(notes: { pitch: number; start: number; dur?: number }[], barLen = 4): Motif16 {
  const ns = [...(notes ?? [])].filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.start)).sort((a, b) => a.start - b.start);
  if (ns.length === 0) return { ons: [0], mv: [0], run: [false] };
  const base = Math.floor(ns[0]!.start / barLen) * barLen; // 先頭音の小節頭＝相対拍の原点
  const ons = ns.map((n) => Math.max(0, n.start - base));
  const mv: number[] = [0];
  for (let i = 1; i < ns.length; i++) mv.push(clamp7(ns[i]!.pitch - ns[i - 1]!.pitch)); // 先頭0＋以降は半音差(±7クランプ)
  const run = ns.map((_, i) => (i > 0 && ons[i]! - ons[i - 1]! <= 0.26) || (i < ns.length - 1 && ons[i + 1]! - ons[i]! <= 0.26));
  return { ons, mv, run };
}

// A2レシピ本体。chordPcsPerBar/roots/quals は各bar(=4拍)のコード、scalePitches=その調の音階ピッチ列、
// motif16=loadMotifModel16()。骨格は opts.skelModel(genSkeletonFromModel) を句頭アンカーに使う。返り＝Note[]。
// 純粋・seed決定的（makeRng のみ・Math.random/Date 不使用）。
export function genMotifMelodyV2(
  chordPcsPerBar: number[][],
  chordRootsPerBar: number[],
  chordQuals: string[],
  scalePitches: number[],
  motif16: MotifModel16,
  opts: { seed?: number; tonicPc?: number; minor?: boolean; skelModel?: SkeletonModel; skel?: number[]; motifBars?: number; compound?: boolean; beatsPerBar?: number; seedMotif?: Motif16; keepFirstBlocks?: number; repetition?: number; rangeSteps?: number; chordPcsAt?: (t: number) => number[]; density?: number; swing?: number; expression?: number; phrases?: { startBeat: number; beats: number; cadenceDegree: number }[]; runs?: number; push?: number; foreground?: number; breathe?: number; humanize?: number; form?: "sentence"; skelStart?: number; bassPitchAt?: (t: number) => number | null; counter?: number; drums?: { kick?: number[]; snare?: number[]; densityByBar?: number[] }; drumLock?: number; backbeat?: number; converse?: number; hook?: number; articulation?: number; inflect?: number; motifMode?: "preserve"; finest?: "quarter" | "eighth"; flow?: number; pickup?: number; arc?: "arch"; restMask?: { start: number; end: number }[]; rhythmParts?: RhythmPartsOpt } = {},
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
  // J2a(design #20・Task#13)：直進系(simple)は barLen=beatsPerBar へ一般化（4/4→4・3/4→3・6/4→6）。
  // compound(6/8/9/8/12/8) は据え置き＝barLen=3 固定（付点四分2群を1小節扱い）。既存は値が変わらず bit一致。
  const barLen = compound ? 3 : (opts.beatsPerBar ?? 4); // 1小節の四分数
  const bScale = barLen / 4; // 拍あたり密度を保存する線形スケール（barLen=4 で ×1.0＝IEEE754 厳密不変＝bit一致）
  // 強拍（骨格柱／後処理CT／表情／濁り掃除／単一頂点）＝meterInfo strongPositions に一致。
  // 4/4→[0,2]（bit一致）・6/8→[0,1.5]（据え置き）・3/4→[0]（拍1のみ・柱1本の割り切り）・6/4→[0,3]（3+3）。
  const strongPos = compound ? [0, 1.5] : barLen === 3 ? [0] : barLen === 6 ? [0, 3] : [0, 2];
  // density(2026-07-08 ノブ・design#12-M)：リズム語彙を音数で再重み付け＝細かさの制御（0=疎〜1=密・未指定=従来分布）。
  const dens = opts.density === undefined ? undefined : Math.max(0, Math.min(1, opts.density));
  const densW = (onsets: number): number => (dens === undefined ? 1 : Math.pow(onsets + 1, (dens - 0.5) * 4));
  // runs(2026-07-09 Step4・design#12-M)：走句の出やすさ。語彙を「隣接16分ペア数」で再重み付け＋選別ペナルティを減衰。
  // 未指定=従来分布。16分0%の犯人は語彙でなく選別抑圧なので、抑圧を解除して狙って走句を出す（新ピッチ論理なし）。
  const rns = opts.runs === undefined ? undefined : Math.max(0, Math.min(1, opts.runs));
  // hook(2026-07-10・Phase2案B・U2)：反復音(move=0)を動機の骨として保持する強さ。既定0＝従来通り必ず±1へ潰す＝bit一致。
  // hookKeep は「位置重み付き」＝句頭/句末(frac 0/1)で高く・中間(0.5)で低い（一律確率は"どもり"を作る＝理論#4）。
  // 単一r()ドロー形（下 :625/:686 で使用）＝hook=0 で u<0（常偽）→従来の u<0.5?1:-1 と同一の1回消費＝bit一致（コード#1）。
  const hk = Math.max(0, Math.min(1, opts.hook ?? 0));
  const hookKeep = (frac: number): number => (hk <= 0 ? 0 : hk * (0.3 + 0.7 * Math.abs(2 * frac - 1)));
  // finest(2026-07-10・オーナーFB)：最小音符の上限＝これより細かい onset を弾く。高BPMで16分が速すぎ潰れるのを防ぐ。
  // 16分格子の slot 単位で判定＝eighth は奇数slot(16分裏)を、quarter は 4の倍数以外を落とす。未指定=無制限=従来。
  const finSkip = (s: number): boolean => (opts.finest === "eighth" ? s % 2 !== 0 : opts.finest === "quarter" ? s % 4 !== 0 : false);
  const runPairs = (p: string): number => { let c = 0; for (let i = 0; i + 1 < p.length; i++) if (p[i] === "x" && p[i + 1] === "x") c++; return c; };
  const runW = (p: string): number => (rns === undefined ? 1 : Math.pow(runPairs(p) + 1, rns * 1.5));
  const rhythmVocab: Record<string, number> = dens === undefined && rns === undefined
    ? motif16.rhythm16
    : Object.fromEntries(Object.entries(motif16.rhythm16).map(([p, w]) => [p, w * densW((p.match(/x/g) ?? []).length) * runW(p)]));

  // 6/8リズム＝統一12枠語彙（RHYTHM68_DATA・16分基底）を densW×runW で再重み付けして抽選＝4/4 rhythmVocab と同型。
  // runW は runs未指定で ≡1 ＝既定は8分主体語が優勢。runs>0 で隣接16分ペア語（走句）が増幅。jig性格は語彙重みが担う。
  const pick68u = (r: () => number): string => {
    const rows = RHYTHM68_DATA.map(([p, w]) => [p, w * densW((p.match(/x/g) ?? []).length) * runW(p)] as [string, number]);
    const tot = rows.reduce((a, b) => a + b[1], 0);
    let x = r() * tot;
    for (const [p, w] of rows) { x -= w; if (x <= 0) return p; }
    return rows[0]![0];
  };

  // 各barのコード構成pc（chordPcsPerBar 優先・無ければ root/quality から復元）。
  const pcsOfBar = (bar: number): number[] => {
    const b = Math.max(0, Math.min(bars - 1, bar));
    const pre = chordPcsPerBar[b];
    if (pre && pre.length) return pre;
    return chordPcs((chordRootsPerBar[b] ?? tonicPc) % 12, chordQuals[b] ?? "");
  };
  const barOf = (t: number): number => Math.floor(t / barLen);
  // C3(2026-07-08)：小節内コードチェンジ対応＝時刻ベースのコード参照（generate.ts が chordAt の閉包を渡す）。
  // 未指定は従来どおり小節頭サンプル。骨格(roots per bar)は小節単位のまま＝構造レベルは主和音で足りる。
  const pcsAtT = (t: number): number[] => opts.chordPcsAt?.(t) ?? pcsOfBar(barOf(t));
  // A2/A3(2026-07-08)：短調でコードが導音(7̂)を含む小節は、経過音側も ♭7̂→導音 に持ち上げた
  // 「和声的短音階」列で歩く＝V7上の G♮(♭7̂) と G#(導音) の半音衝突を構造的に防ぐ（design#12-M）。
  const leadPc = (tonicPc + 11) % 12, subtPc = (tonicPc + 10) % 12;
  const spRaised = minor ? sp.map((p) => ((((p % 12) + 12) % 12) === subtPc ? p + 1 : p)) : sp;
  const barHasLead = (bar: number): boolean => { if (!minor) return false; for (let q = 0; q < barLen; q++) if (pcsAtT(bar * barLen + q).includes(leadPc)) return true; return false; };
  const spAt = (bar: number): number[] => (barHasLead(bar) ? spRaised : sp);

  // モチーフ生成＝16分リズムパターンを2小節ぶん抽選し、各onsetへ move（run=16分走句は方向保持・他はMarkov）。
  const mkMotif = (r: () => number, bb: number = mb): Motif16 | null => {
    const mb = bb; // プロトタイプ：ブロック長でパラメータ化（クロージャ mb を局所退避）
    const ons: number[] = [];
    if (compound) {
      // 6/8：16分12枠を常時基底(t=bar*3+s*0.25)＝4/4(16枠)と同型。runsは pick68u の語彙再重み付けで走句を増やす（grid切替なし）。
      // 末尾~0.75拍は息継ぎ。onset上下限 2*mb..5*mb（runsで上限拡張）・孤立フィルタ>1.6。既定は8分主体語が優勢＝密度は上がらない。
      for (let bar = 0; bar < mb; bar++) {
        const p = pick68u(r);
        for (let s = 0; s < 12; s++) {
          if (p[s] !== "x" || finSkip(s)) continue; // finest＝最小音符上限より細かい onset を弾く
          const t = bar * 3 + s * 0.25;
          if (t >= mb * 3 - 0.75) continue;
          ons.push(t);
        }
      }
      // density: 受け入れ音数帯を可変（未指定=従来 2..5/小節）。疎側は間隔許容も広げる（棄却飢餓→既定モチーフ固定化を防ぐ）。
      const lo68 = dens === undefined ? 2 * mb : Math.max(1 * mb, Math.round((1 + 2.5 * dens) * mb));
      const hi68b = dens === undefined ? 5 * mb : Math.max(lo68 + 1, Math.round((3 + 3.5 * dens) * mb));
      const hi68 = rns === undefined ? hi68b : hi68b + Math.round(rns * 4 * mb); // runs＝走句ぶん受入音数を拡張
      if (ons.length < lo68 || ons.length > hi68) return null;
      const g = ons.slice(1).map((t, i) => t - ons[i]!);
      if (g.length && Math.max(...g) > (dens === undefined ? 1.6 : 1.6 + (1 - dens) * 1.2)) return null;
    } else {
      // 直進系(simple)：1小節=16分(barLen*4)枠。4/4=16枠1抽選/小節（従来・bit一致）。
      // J2a：3/4=RHYTHM16 の先頭3拍(12枠)を切り出し1抽選/小節。6/4=3+3＝12枠を bar内 +0/+3拍へ2抽選。
      // barLen=4 は groupsPerBar=1/groupBeats=4/groupSlots=16＝t=bar*4+s*0.25・1抽選＝元コードと厳密同順（bit一致）。
      const groupsPerBar = barLen === 6 ? 2 : 1; // 6/4 = 3+3
      const groupBeats = barLen === 4 ? 4 : 3; // 切り出し幅（4/4 は4拍語彙をそのまま）
      const groupSlots = groupBeats * 4; // 16 or 12
      for (let bar = 0; bar < mb; bar++) {
        for (let g = 0; g < groupsPerBar; g++) {
          const p = weightedPickRec(rhythmVocab, r);
          for (let s = 0; s < groupSlots; s++) {
            if (p[s] !== "x" || finSkip(s)) continue; // finest＝最小音符上限より細かい onset を弾く
            const t = bar * barLen + g * groupBeats + s * 0.25;
            if (t >= mb * barLen - 1.5) continue; // 末尾~1.5拍は息継ぎ（ブロック単位・拍子非依存）
            ons.push(t);
          }
        }
      }
      // density: 受け入れ音数帯を可変（未指定=従来 2..4/小節）。bScale で拍あたり密度を保存（barLen=4 で厳密不変）。
      const loN = dens === undefined ? 2 * mb * bScale : Math.max(1 * mb * bScale, Math.round((1 + 2 * dens) * mb * bScale));
      const hiN0 = dens === undefined ? 4 * mb * bScale : Math.max(loN + 1, Math.round((2.5 + 4 * dens) * mb * bScale));
      const hiN = rns === undefined ? hiN0 : hiN0 + Math.round(rns * 3 * mb * bScale); // runs＝走句ぶん受入音数を拡張
      if (ons.length < loN || ons.length > hiN) return null;
      if (ons[0]! < 0.5 && r() < 0.5) ons[0] = Math.max(opts.finest === "eighth" || opts.finest === "quarter" ? 0.5 : 0.25, ons[0]!); // finest時は16分(0.25)へ動かさない
      const _gap = ons.slice(1).map((t, i) => t - ons[i]!);
      const gapCap = dens === undefined ? Math.max(2.0, mb) : Math.max(2.0, mb, 2 + (1 - dens) * 2);
      if (_gap.length && Math.max(..._gap) > gapCap) return null; // 孤立音(大間隔)モチーフは棄却＝繋がった塊のみ（長尺ほど内部restは許容）
    }
    // 16分走句(run)＝隣接0.25判定。4/4は常時。6/8はruns未指定=8分格子(≥0.5)ゆえ全false＝bit一致、
    // runs>0の12枠のみ隣接16分が生じ走句になる（既存の run方向保持・gap-fill にそのまま乗る＝新ピッチ論理なし）。
    const run = ons.map((t, i) => (i > 0 && t - ons[i - 1]! <= 0.26) || (i < ons.length - 1 && ons[i + 1]! - t <= 0.26));
    const mv: number[] = [0];
    let rdir = r() < 0.5 ? 1 : -1, leaps = 0, zeroRun = 0;
    for (let i = 1; i < ons.length; i++) {
      let m: number;
      if (run[i]) { if (!run[i - 1]) rdir = r() < 0.5 ? 1 : -1; m = rdir; }
      else {
        m = weightedPickNum(moveTrans.get(clamp7(mv[i - 1]!)) ?? new Map(), r);
        if (m === 0) {
          // hook：単一r()ドロー。hook=0 は従来通り必ず±1（u<0 常偽）＝bit一致。hook>0 は位置重み＋連打上限2で反復音を保持。
          const u = r();
          const keep = hk > 0 && zeroRun < 2 && u < hookKeep((i - 1) / Math.max(1, ons.length - 1));
          m = keep ? 0 : (u < 0.5 ? 1 : -1);
        }
        if (Math.abs(m) >= 3) { if (leaps >= 1) m = Math.sign(m); else leaps++; }
      }
      zeroRun = m === 0 ? zeroRun + 1 : 0;
      mv.push(m);
    }
    for (let i = 1; i < mv.length - 1; i++) if (Math.abs(mv[i]!) >= 3) mv[i + 1] = -Math.sign(mv[i]!) * Math.abs(mv[i + 1]! || 1); // 跳躍後は逆向き(gap-fill)
    return { ons, mv, run };
  };

  // スコア＝range4-6・方向転換~2・跳躍≤1・16分走句少・明確なピーク(中央やや後)・始点付近に戻る・音数~6。
  const score = (M: Motif16, bb: number = mb): number => {
    const mb = bb;
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
    // density指定時は 16分/走句ペナルティを密度に連動（密=許す/疎=強く抑制）・音数は目標密度への距離で採点。
    const runDamp = rns === undefined ? 1 : 1 - 0.85 * rns; // runs＝16分/走句ペナルティを減衰＝走句を許す
    const n16Pen = (dens === undefined ? 0.7 : 1.4 * (1 - dens)) * runDamp;
    const runPen = (dens === undefined ? 0.8 : 1.6 * (1 - dens)) * runDamp;
    const lenTarget = (dens === undefined ? 3 : 1.5 + 3.5 * dens) * mb + (rns === undefined ? 0 : rns * 3 * mb);
    const lenPen = dens === undefined && rns === undefined ? 0.4 * Math.max(0, M.ons.length - 3 * mb) : 0.4 * Math.abs(M.ons.length - lenTarget);
    return -Math.abs(range - 5) - Math.abs(dirs - 2) - 2 * Math.max(0, leaps - 1) - runPen * Math.max(0, runN - 2) - n16Pen * n16 - 0.4 * endRet - 2 * peakMid - lenPen - 1.3 * Math.max(0, maxGap - 1.5) - 0.6 * Math.max(0, firstOns - 1);
  };

  // 選別＝12個生成しスコア最良を採用（クソ乱数排除）。全滅時は安全な既定モチーフ。
  const genBest = (r: () => number, bb: number = mb): Motif16 => {
    let best: Motif16 | null = null, bs = -1e9;
    for (let i = 0; i < 12; i++) { const m = mkMotif(r, bb); if (!m) continue; const s = score(m, bb); if (s > bs) { bs = s; best = m; } }
    if (best) return best;
    // 全滅時の安全な既定モチーフ。bb>2(可変長の長尺ブロック)は blockBars でスケールして空尾破綻を防ぐ（監査D実装評価）。
    // bb≤2 は従来の 2小節ハードコード（既定 path の bit一致を保つ）。
    if (bb > 2) {
      const ons: number[] = [], mv: number[] = [], run: boolean[] = [];
      const beats = compound ? [0, 1, 2] : [0.5, 1.5, 2.5]; // 1小節ぶんの安全onset
      for (let bar = 0; bar < bb; bar++) for (const o of beats) { const t = bar * barLen + o; if (t < bb * barLen - (compound ? 0.75 : 1.5)) { ons.push(t); mv.push(ons.length === 1 ? 0 : (ons.length % 2 ? 1 : -1)); run.push(false); } }
      if (ons.length) return { ons, mv, run };
    }
    return compound
      ? { ons: [0, 0.5, 1, 1.5, 2.5], mv: [0, 1, 1, -1, 2], run: [false, false, false, false, false] }
      : { ons: [0.5, 1, 1.5, 2.5, 3], mv: [0, 2, -1, 2, -1], run: [false, false, false, false, false] };
  };

  // 尾変奏＝前半を保持し後半の move を引き直す（A'＝問いに対する変化した答え）。
  const varyTail = (M: Motif16, r: () => number): Motif16 => {
    const k = Math.max(2, Math.ceil(M.ons.length / 2));
    const mv = M.mv.slice(0, k);
    const rdir = r() < 0.5 ? 1 : -1;
    let zeroRun = 0;
    for (let i = k; i < M.ons.length; i++) {
      if (M.run[i]) { mv.push(rdir); zeroRun = 0; continue; }
      let m = weightedPickNum(moveTrans.get(clamp7(mv[i - 1]!)) ?? new Map(), r);
      if (m === 0) {
        const u = r(); // hook 単一ドロー（hook=0 でbit一致）
        m = (hk > 0 && zeroRun < 2 && u < hookKeep((i - 1) / Math.max(1, M.ons.length - 1))) ? 0 : (u < 0.5 ? 1 : -1);
      }
      if (Math.abs(m) >= 3) m = Math.sign(m) * 2;
      zeroRun = m === 0 ? zeroRun + 1 : 0;
      mv.push(m);
    }
    return { ons: M.ons, mv, run: M.run };
  };

  // 反行＝move を符号反転（B＝対比だが M から派生・輪郭が上下逆）。
  const invert = (M: Motif16): Motif16 => ({ ons: M.ons, mv: M.mv.map((m, i) => (i === 0 ? 0 : -m)), run: M.run });
  // 自由材料(Step5・foreground)＝M のリズムは保ち contour を引き直す。varyTail と違い**同音(move=0)を潰さず
  // 跳躍(|move|≥3)もクランプしない**＝実曲の「跳ぶ/留まる」を回復（ダルダル解消）。禁則は後処理が除去。
  const freeVary = (M: Motif16, r: () => number): Motif16 => {
    const k = Math.max(1, Math.ceil(M.ons.length / 3));
    const mv = M.mv.slice(0, k);
    for (let i = k; i < M.ons.length; i++) {
      if (M.run[i]) { mv.push((mv[i - 1] ?? 0) >= 0 ? 1 : -1); continue; } // 走句は方向保持（従来同様）
      const m = weightedPickNum(moveTrans.get(clamp7(mv[i - 1]!)) ?? new Map(), r); // 0も跳躍もそのまま採る
      mv.push(m);
    }
    return { ons: M.ons, mv, run: M.run };
  };
  // 断片化(fragmentation・sentence継続部・2026-07-09 D本丸)：Mの**先頭半小節セル**(逐語)を、ブロックを通して
  // 半小節ごとに反復＝断片の畳み掛け＝密度が増え「加速→カデンツ」の推進(起承転結の"転")。freeVary(再生成)でなく
  // 逐語サブセル抽出＝覚えられる動機の同一性を保つ（理論評価: 継続に freeVary厳禁）。onsetは16分格子上に乗る。
  const fragment = (M: Motif16, bb: number = mb): Motif16 => {
    const half = barLen / 2;
    const cell = M.ons.filter((t) => t < half); // 先頭半小節のサブセル
    if (cell.length < 1) return M;
    const cmv = cell.map((_, i) => M.mv[i] ?? 0), crun = cell.map((_, i) => M.run[i] ?? false);
    const ons: number[] = [], mv: number[] = [], run: boolean[] = [], total = bb * barLen;
    for (let off = 0; off + half <= total - 0.5; off += half) cell.forEach((t, i) => { ons.push(off + t); mv.push(cmv[i]!); run.push(crun[i]!); }); // 末尾~0.5拍は息継ぎ
    return ons.length ? { ons, mv, run } : M;
  };

  // 近景レンダ＝コミットした輪郭(move)を辿る。強拍(onMain)は「輪郭が指す音の最近コードトーン」＝形を保ち和声に乗る。
  // 16分走句はスカラーsnap。toTonic で句末をトニックへ着地。tr=音域移高(弧の+5等)。
  const snapList = (c: number, list: number[]): number => { let b = c, bd = 99; for (const q of list) { const d = Math.abs(q - c); if (d < bd) { bd = d; b = q; } } return b; };
  const snapSc = (c: number): number => snapList(c, sp);
  // A2/A3: 強拍のCTスナップは半音空間＝導音/色音にも乗れる（旧: スケール∩コード）。
  const ctOf = (c: number, pc: number[]): number => (pc.length ? nearestChordTonePitch(c, pc, sp[0] ?? 48, sp[sp.length - 1] ?? 84) : snapSc(c));
  // anchor は呼び手で弧のリフト済み（D5: 旧 tr=半音直加算→スケール段リフトへ）。
  const render = (M: Motif16, bar0: number, anchor: number, toTonic: boolean, bb: number = mb): Note[] => {
    const mb = bb;
    const out: Note[] = [];
    let prev = anchor;
    for (let i = 0; i < M.ons.length; i++) {
      const t = bar0 * barLen + M.ons[i]!;
      // 強拍(onMain)：4/4=8分グリッド上かつ非走句／6/8=付点四分ビート頭(inbar 0 と 1.5)。ここは輪郭が指す音の最近CTに乗せる。
      const inbar = ((M.ons[i]! % barLen) + barLen) % barLen;
      const onMain = compound
        ? (Math.abs(inbar) < 0.1 || Math.abs(inbar - 1.5) < 0.1)
        : (Math.abs(M.ons[i]! - Math.round(M.ons[i]! * 2) / 2) < 0.01 && !M.run[i]);
      const pcs = pcsAtT(t); // C3: 時刻ベース＝小節内コードチェンジ追従
      let p: number;
      if (i === 0) p = ctOf(anchor, pcs);
      else if (toTonic && i === M.ons.length - 1) {
        // B1(2026-07-08 design#12-M)：終止はコードを見て着地＝主音が最終コードに含まれる時のみ主音。
        // 含まれない時(V終わりのユーザー進行等)は最寄りのコード音（主音強制=未解決sus4を回避・半終止らしい開き）。
        if (!pcs.length || pcs.includes(tonicPc)) {
          let b = prev, bd = 99;
          for (const q of sp) { if (((q % 12) + 12) % 12 !== tonicPc) continue; if (Math.abs(q - prev) < bd) { bd = Math.abs(q - prev); b = q; } }
          p = b;
        } else {
          p = ctOf(prev, pcs);
        }
      } else {
        const want = prev + M.mv[i]!;
        const L = spAt(barOf(t)); // 弱拍の歩行も導音小節では和声的短音階（A2/A3）
        if (rns !== undefined && M.run[i] && !onMain) {
          // 走句(runs)＝半音±1の `want` を snapList すると全音境界で prev に戻り同音潰れ（タイブレーク先着＝低い方）。
          // 走句音だけ「prev のスケール段から ±1段」で確実に隣接スケール音へ進める＝スカラー走句（clampScale/nearestIdx）。
          // runs未指定/非走句/強拍(onMain)は現行 snap のまま＝bit一致・強拍CT・弧・終止は無改変。生成側 rdir=±1 の意味を段移動へ解釈するだけ。
          p = clampScale(L, nearestIdx(L, prev) + (M.mv[i]! >= 0 ? 1 : -1));
        } else {
          p = onMain ? ctOf(want, pcs) : snapList(want, L);
          if (p === prev) p = snapList(prev + (M.mv[i]! >= 0 ? 1 : -1), L);
        }
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

  // ── Phase2案B（2026-07-10）：動機保存レンダ（motifMode:"preserve"・別関数＝既定パス無改変）──
  // 個別音snapでなく「動機全体を移高段kで和声に合わせる＝音を曲げず置き場所を選ぶ」。各音は deg で置くので
  // 同degグループ(反復音)は自動で同pitch・輪郭符号も自動保存（realizeの同一性不変量 a/b をタダで満たす）。
  // 和声適応はkの選択のみ＝強拍CT/カデンツ着地/音域/ヒステリシスのコスト最小。mv を「スケール段」として解釈。
  const preserve = opts.motifMode === "preserve";
  const inflectN = Math.max(0, Math.min(1, opts.inflect ?? 0));
  const placeByLabel = new Map<string, { baseIdx: number; k: number }>(); // ラベル別＝同素材ブロック(A/A'')は初回の(anchor,k)を再利用＝回帰が同音高で戻る（理論#6・M10自己相関＝フック回収点）
  let prevPreserveEnd: number | null = null; // 前ブロック終端pitch＝w4(継目跳躍)コスト用
  const renderPreserve = (M: Motif16, bar0: number, toTonic: boolean, label: string, bb: number = mb): Note[] => {
    const mbp = bb;
    // mv はエンジン共通で「半音差」（genBest の moveTrans も extractMotif16 の clamp7 も半音）。そのまま段にすると跳躍が
    // 膨張(P5→オクターブ)＝半音→スケール段へ換算（理論眼②・監査指摘）。round(|m|*7/12)＝1,2→1段/3,4→2/5→3/7→4/12→7。
    // 同度(0)と輪郭符号は保存＝反復音・同一性は不変、跳躍だけ実音楽の段幅に収める。seedMotif も半音表記で渡す（例外なし＝
    // 補完 extractMotif16 の種も正しく換算＝tail の膨張を解消）。
    const stepMv = M.mv.map((m) => (m === 0 ? 0 : Math.sign(m) * Math.max(1, Math.round((Math.abs(m) * 7) / 12))));
    const deg = motifDegrees(stepMv);
    const L = spAt(barOf(bar0 * barLen)); // 短調の導音/色音小節は和声的短音階（sp でなく spAt）
    const prior = placeByLabel.get(label); // 同ラベル既出なら anchor を再利用＝A''がAと同音高で戻る
    const baseIdx = prior ? prior.baseIdx : nearestIdx(L, an(bar0));
    const onMainAt = (i: number): boolean => {
      const inbar = ((M.ons[i]! % barLen) + barLen) % barLen;
      return compound ? (Math.abs(inbar) < 0.1 || Math.abs(inbar - 1.5) < 0.1) : (Math.abs(M.ons[i]! - Math.round(M.ons[i]! * 2) / 2) < 0.01 && !M.run[i]);
    };
    const pitchAt = (k: number, i: number): number => clampScale(L, baseIdx + k + deg[i]!);
    // 強拍の和声適合を「率」でなく「質」で測る（理論T5）：CT=0／非CTでも2度以内(倚音)=軽く／b9/avoid・対ベースb9=重く。
    const strongQual = (p: number, t: number): number => {
      const pc = ((p % 12) + 12) % 12, pcs = pcsAtT(t);
      let pen = 0;
      if (pcs.length && !pcs.includes(pc)) {
        const b9chord = pcs.includes((pc + 11) % 12); // pc の半音下がコード音＝pc は m9/avoid（メジャー上の4度等）
        let minChrom = 12; for (const c of pcs) { const d = Math.min(((pc - c) % 12 + 12) % 12, ((c - pc) % 12 + 12) % 12); if (d < minChrom) minChrom = d; }
        pen += b9chord ? 4 : (minChrom <= 2 ? 1 : 3); // 2度以内(倚音)は軽い・遠い非CTは重い
      }
      const bl = opts.bassPitchAt?.(t); // w2：対ベース b9 衝突を罰（bassPitchAt 無し＝0）
      if (bl != null && (((pc - bl) % 12 + 12) % 12) === 1) pen += 3;
      return pen;
    };
    // k選択＝置き場所で和声適応。同ラベル既出(A/A''の回帰)は初回の k を**そのまま再利用**＝逐語反復（M10自己相関・
    // フック回収点）。初回のみ探索：カデンツ着地(最優先)＋強拍の質＋音域＋前ブロック終端跳躍(w4)。
    let bestK: number;
    if (prior) {
      bestK = prior.k; // 同ラベル＝初回の baseIdx/k を literal 再利用＝A==A'==A''（renderPreserve出力が一致・和声差は後処理が吸収）
    } else {
      bestK = 0; let bestCost = Infinity;
      for (let k = -4; k <= 4; k++) {
        let strongPen = 0, rangeMiss = 0, cadMiss = 0;
        for (let i = 0; i < M.ons.length; i++) {
          if (baseIdx + k + deg[i]! < 0 || baseIdx + k + deg[i]! > L.length - 1) rangeMiss++;
          if (onMainAt(i)) strongPen += strongQual(pitchAt(k, i), bar0 * barLen + M.ons[i]!);
        }
        if (toTonic) {
          const li = M.ons.length - 1, pcs = pcsAtT(bar0 * barLen + M.ons[li]!);
          cadMiss = pcs.length && !pcs.includes(((pitchAt(k, li) % 12) + 12) % 12) ? 1 : 0; // カデンツ>動機＝終音は和声着地(強)
        }
        const seam = prevPreserveEnd == null ? 0 : Math.max(0, Math.abs(pitchAt(k, 0) - prevPreserveEnd) - 7) / 2; // w4：前ブロック終端との跳躍(>5度)を抑制
        const cost = 100 * cadMiss + 2 * strongPen + 5 * rangeMiss + seam;
        if (cost < bestCost) { bestCost = cost; bestK = k; }
      }
      placeByLabel.set(label, { baseIdx, k: bestK }); // 初回のみ記録＝以降の同ラベルはこの anchor/k を再利用
    }
    const out: Note[] = [];
    for (let i = 0; i < M.ons.length; i++) {
      const t = bar0 * barLen + M.ons[i]!;
      let p = pitchAt(bestK, i);
      // inflect：末尾1音のみ±1段の適応変奏（フォールバック＝tonal answer・末尾は可変・理論足す#1）。既定0=無効。
      if (inflectN > 0 && i === M.ons.length - 1 && !toTonic) {
        const pcs = pcsAtT(t);
        if (pcs.length && !pcs.includes(((p % 12) + 12) % 12)) { const up = clampScale(L, nearestIdx(L, p) + 1); if (pcs.includes(((up % 12) + 12) % 12)) p = up; else { const dn = clampScale(L, nearestIdx(L, p) - 1); if (pcs.includes(((dn % 12) + 12) % 12)) p = dn; } }
      }
      const isRep = (i > 0 && deg[i] === deg[i - 1]) || (i < M.ons.length - 1 && deg[i + 1] === deg[i]); // 反復音グループ＝保護対象
      const note = { pitch: p, start: t, dur: compound ? 0.5 : 0.25 } as Note & { _mp?: boolean };
      if (isRep) note._mp = true;
      out.push(note);
    }
    if (out.length) prevPreserveEnd = out[out.length - 1]!.pitch; // w4：次ブロックの継目跳躍コスト用
    // dur（render と同一＝ジグ跳ね/4-4息継ぎ）。
    if (compound) { for (let i = 0; i < out.length; i++) { const g = (out[i + 1]?.start ?? (bar0 + mbp) * 3) - out[i]!.start; const onM = Math.abs(out[i]!.start % 1.5) < 0.1; out[i]!.dur = g > 1.0 ? Math.min(g, onM ? 1.2 : 0.55) : Math.min(g, onM ? 1.4 : 0.55); } }
    else { for (let i = 0; i < out.length; i++) { const gap = (out[i + 1]?.start ?? (bar0 + mbp) * 4) - out[i]!.start; const onB = Math.abs(out[i]!.start - Math.floor(out[i]!.start / 2) * 2) < 0.25; out[i]!.dur = gap > 1.4 ? Math.min(gap, onB ? 1.6 : 1.05) : Math.min(gap, 2); } }
    return out;
  };

  // 骨格＝genSkeletonFromModel（句頭アンカー）。発展＝2小節ブロックで A/A'/B(反行+弧)/A''(トニック着地) を循環。
  // C1/C2(2026-07-08)：骨格は beat索引(bars*bpb)＝アンカーは「ブロック頭barのdownbeat＝skel[bar*bpb]」で引く
  // （旧: skel[bar]＝bar番号をbeat扱い＝曲頭数拍に縮退・Urlinie後半が未使用）。6/8 は bpb=3 で生成（旧: 4/4決め打ち）。
  // D-P1(2026-07-09 監査D)：phrases 指定時は句末バー＋カデンツ度数を骨格へ渡す＝骨格が句割りを見る（未指定=従来）。
  const phraseEnds = opts.phrases?.map((p) => ({ bar: Math.max(0, Math.floor((p.startBeat + p.beats - 0.001) / barLen)), deg: p.cadenceDegree === 5 ? 4 : p.cadenceDegree === 2 ? 1 : 0 }));
  // 骨格注入（design #20）：opts.skel（人間製/機械候補の SkeletonContent 由来・1拍粒度 number[]）が来たら
  // genSkeletonFromModel をバイパスしてそれを構造線に使う。未指定＝従来どおりモデル生成＝bit一致。
  const skel = opts.skel ?? genSkeletonFromModel(chordRootsPerBar, opts.skelModel ?? loadSkeletonModel(minor), sp, { tonicPc, seed, beatsPerBar: barLen, strongQuarters: strongPos, start: opts.skelStart ?? 62, repetition: opts.repetition, rangeSteps: opts.rangeSteps, phraseEnds, arc: opts.arc }); // C4/F4: 骨格ノブをV2でも透過。skelStart=前セクション最終音の近傍（section.prevEndPitch・未指定=62=bit一致）
  const r = makeRng(seed + 5);
  // seedMotif 指定時は genBest をスキップしてそれを M に（補完=与モチーフを発展）。既定(未指定)は現挙動と完全一致。
  const M = opts.seedMotif ?? genBest(r);
  // hook床(Phase2案B・理論眼①)：preserve×hook≥0.5 で動機に反復音ペアが1組も無い時、句頭に1組注入＝「hookを上げたのに
  // フックが1個も出ない博打」を無くす。preserve かつ seedMotif無し かつ hook強い時のみ＝既定/非preserveは無改変＝bit一致。
  if (preserve && hk >= 0.5 && !opts.seedMotif && M.mv.length >= 3 && !M.mv.slice(1).some((m) => m === 0)) {
    const j = M.run[1] ? (M.run[2] ? -1 : 2) : 1; // 走句でない早い位置（句頭アンカー＝ラーラ）
    if (j > 0) M.mv[j] = 0;
  }
  const kfb = Math.max(0, Math.floor(opts.keepFirstBlocks ?? 0)); // >0：先頭 kfb ブロックは素材(A=M)・以降を A'/B/A'' 発展
  const an = (bar: number): number => blockAnchorFromSkeleton(skel, bar, barLen, sp[Math.floor(sp.length / 2)] ?? 62);
  const nBlk = Math.ceil(bars / mb);
  const notes: Note[] = [];
  // 既定(kfb=0)＝従来の A/A'/B/A'' 循環。kfb>0＝先頭 kfb ブロックは A(M)、残りは varyTail(1)/invert(2)/M(3) を循環。
  const roleOf = (blk: number): number => (kfb > 0 ? (blk < kfb ? 0 : ((blk - kfb) % 3) + 1) : blk % 4);
  const fg = Math.max(0, Math.min(1, opts.foreground ?? 0)); // Step5：自由材料の割合（0=従来・派生ブロックを確率で freeVary へ）
  // sentence形式(D本丸・2026-07-09)：固定グリッド上で 提示(bi)→反復(移高sequence)→継続(断片化)→カデンツ の
  // 機能割当。可変長は使わない(理論/実装評価: 過程が形式を生む・容器は最後)。既定(form未指定)=従来AABA=bit一致。
  // 展開技法として sequence(Mの輪郭を移高して再生=最も可聴なpop展開)と fragment(継続の畳み掛け=加速)を導入。
  const sentence = opts.form === "sentence";
  // 可変長ブロック(監査D本丸・容器・2026-07-09)：phrases 指定時は句を1ブロックとし**句長のモチーフ**で作る
  // （[3,3,2]なら3小節/3小節/2小節ブロック＝真の非対称）。既定/補完(phrases無し or seedMotif)は従来の固定mb・単一M
  // ＝bit一致・rng draw順を保つ。長さ別モチーフ辞書(motifByLen)で同一長は基底を共有＝発展で同一性。
  const varLen = !!(opts.phrases && opts.phrases.length && !opts.seedMotif);
  const blocks: { bar0: number; bars: number }[] = varLen
    ? opts.phrases!.map((p) => ({ bar0: Math.floor(p.startBeat / barLen), bars: Math.max(1, Math.round(p.beats / barLen)) }))
    : Array.from({ length: nBlk }, (_, i) => ({ bar0: i * mb, bars: mb }));
  const motifByLen = new Map<number, Motif16>();
  const motifFor = (L: number): Motif16 => { if (!varLen) return M; let mm = motifByLen.get(L); if (!mm) { mm = genBest(r, L); motifByLen.set(L, mm); } return mm; };
  // ── C: 密度の相補（converse・design「gen_melody×ドラム結線」・research/2026-07-10-melody-groove-drum-interaction.md）──
  // 小節ごとのドラム密度(densityByBar=kick+snare+0.3*hihat)をブロック単位（＝句境界を跨がない）で平均し、
  // 中央値比 rel から scale=clamp(1−converse×(rel−1)×K, 0.7, 1.3)（K=0.3＝弱いバイアス）。実現＝ブロックの
  // motif 写像への**決定的な onset 追加/削除**（rng不使用・基底モチーフ共有＝A/A''の同一性維持・先頭/末尾 onset
  // 保持＝句頭/終止安全）。converse=0 or densityByBar無し or compound＝経路に入らない＝bit一致。
  // 一様密度（genDrums の1小節パターン等）は rel=1＝scale=1＝無変化＝これも bit 一致。
  const conv = Math.max(0, Math.min(1, opts.converse ?? 0));
  const densBar = !compound && conv > 0 && opts.drums?.densityByBar?.length ? opts.drums.densityByBar : null;
  const densMed = (() => { if (!densBar) return 0; const a = [...densBar].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2; })();
  const convScale = (bar0: number, L: number): number => {
    if (!densBar || !(densMed > 0)) return 1;
    let s = 0, n = 0;
    for (let b = bar0; b < bar0 + L && b < densBar.length; b++) { s += densBar[b]!; n++; }
    if (!n) return 1;
    return Math.max(0.7, Math.min(1.3, 1 - conv * (s / n / densMed - 1) * 0.3));
  };
  const applyConverse = (Mv: Motif16, scale: number, bb: number): Motif16 => {
    const target = Math.max(2, Math.round(Mv.ons.length * scale));
    if (target === Mv.ons.length || Mv.ons.length < 3) return Mv;
    const ons = [...Mv.ons], mv = [...Mv.mv], run = [...Mv.run];
    if (target < ons.length) {
      // 間引き＝弱位置優先（16分裏>8分裏>拍頭）・先頭/末尾は保持。削った move は消える＝輪郭が僅かに縮む
      // （弱バイアスの範囲・跳躍の合成は後処理②fixForbidden/③gapFill が回収）。同重みは後ろ側から。
      const weight = (t: number): number => { const q = Math.round(t * 4) % 4; return q === 1 || q === 3 ? 3 : q === 2 ? 2 : 1; };
      const idxs = ons.map((_, i) => i).filter((i) => i > 0 && i < ons.length - 1)
        .sort((a, b) => weight(ons[b]!) - weight(ons[a]!) || b - a)
        .slice(0, ons.length - target)
        .sort((a, b) => b - a);
      for (const i of idxs) { ons.splice(i, 1); mv.splice(i, 1); run.splice(i, 1); }
    } else {
      // 追い足し＝最大ギャップ(≥1拍)の中点を8分格子へ・隣接歩進(±1=前moveの向き)＝gap-fill流儀。
      // 置けない（詰まっている/端に寄る）ならそこで止める＝無理に詰めない（弱バイアス）。
      let add = target - ons.length, guard = 0;
      while (add > 0 && guard++ < 16) {
        let gi = -1, gw = 1.0 - 1e-6;
        for (let i = 0; i + 1 < ons.length; i++) { const g = ons[i + 1]! - ons[i]!; if (g > gw) { gw = g; gi = i; } }
        if (gi < 0) break;
        const t = Math.round((ons[gi]! + gw / 2) * 2) / 2;
        if (!(t > ons[gi]! + 0.26 && t < ons[gi + 1]! - 0.26 && t < bb * barLen - 1.5)) break;
        ons.splice(gi + 1, 0, t);
        mv.splice(gi + 1, 0, (mv[gi] ?? 0) >= 0 ? 1 : -1);
        run.splice(gi + 1, 0, false);
        add--;
      }
    }
    return { ons, mv, run };
  };
  // ── リズムパーツ層 L1（design #20 S4-1）：セクション割当ローテ＝出力小節に名前付きパーツを敷く ──
  // 単一共有モチーフ M では絶対barのパーツを運べないため seam は「ブロックレンダ直前の variant 差し替え」。
  // 各ブロック[bar0,L]の絶対barからパーツの onset 列を組み、輪郭(mv)は共有 Mi から巡回借用（rng不消費＝決定的・
  // 動機の輪郭同一性を保つ）。密度受入帯(loN/hiN)/孤立ギャップ棄却/finestは mkMotif 内でしか効かない＝パーツ経路は
  // 自動でバイパス＝パーツ優先。compound(6/8系)は16枠語彙とgridが違うため対象外＝無視（bit一致）。
  // S4-2（Task#8）：per-bar 解決＝placement > rotate > L0（同一barにplacementが勝つ・無いbarはrotate・どちらも無ければ従来抽選=L0）。
  // custom＝インラインパーツ（採取結果/手置きをプリセット外から）。partsActive＝rotate か placement のどちらかに known id が1つでもあれば活性。
  const rp = opts.rhythmParts;
  const customMap = buildCustomPartMap(rp?.custom);
  const knownId = (id: string | undefined): boolean => !!(id && (customMap[id] ?? RHYTHM_PART_PRESETS[id]));
  const partsActive = !compound && !!rp && ((rp.rotate ?? []).some((id) => knownId(id)) || (rp.placement ?? []).some((p) => knownId(p?.partId)));
  // per-bar 種別：{pat}=パーツ置換／"empty"=rotate が覆うが未知id（S4-1＝無音節点）／"l0"=どこも覆わない（従来抽選のまま残す）。
  // rotate 非空＝全barを覆う（未知でも "empty"）＝l0 は生じない → 下の allPart 経路（S4-1 と bit 一致）に必ず入る。l0 は placement 単独（rotate無し）でのみ発生。
  const resolveBar = (absBar: number): { pat: string } | "empty" | "l0" => {
    if (rp!.placement && rp!.placement.length) {
      let hit: string | undefined;
      for (const p of rp!.placement) if (p && p.bar === absBar) hit = p.partId; // 後勝ち
      if (hit !== undefined) { const pat = customMap[hit] ?? RHYTHM_PART_PRESETS[hit]; if (pat) return { pat }; } // 未知idは rotate/l0 へフォールスルー
    }
    if (rp!.rotate && rp!.rotate.length) {
      const id = rp!.rotate[((absBar % rp!.rotate.length) + rp!.rotate.length) % rp!.rotate.length];
      const pat = id ? (customMap[id] ?? RHYTHM_PART_PRESETS[id]) : undefined;
      return pat ? { pat } : "empty"; // rotate が覆う＝未知でも empty（S4-1 の「未知は無音節点」を保つ＝bit一致）
    }
    return "l0"; // rotate 無し・placement 未該当＝L0（従来抽選）
  };
  const buildPartVariant = (variant: Motif16, Mi: Motif16, bar0: number, L: number): Motif16 | null => {
    const kinds = Array.from({ length: L }, (_, j) => resolveBar(bar0 + j));
    const anyPart = kinds.some((k) => typeof k === "object");
    if (!anyPart) return null; // このブロックにパーツ無し＝差し替えない（l0/empty のみ＝通常 variant のまま）
    const hasL0 = kinds.some((k) => k === "l0");
    if (!hasL0) {
      // rotate 経路 or 全bar placement＝パーツ onset のみ・輪郭は Mi から巡回借用（S4-1 と bit 一致）。empty bar は onset 無し。
      const ons: number[] = [];
      for (let j = 0; j < L; j++) { const k = kinds[j]!; if (typeof k === "object") for (const b of partPatternOnsets(k.pat, barLen)) ons.push(j * barLen + b); }
      if (!ons.length) return null;
      ons.sort((a, b) => a - b);
      const run = ons.map((t, i) => (i > 0 && t - ons[i - 1]! <= 0.26) || (i < ons.length - 1 && ons[i + 1]! - t <= 0.26));
      const src = Mi.mv; // 輪郭は共有モチーフから巡回借用（i=0はアンカー＝0・以降は src[1..] を巡回）
      const mv = ons.map((_, i) => (i === 0 ? 0 : (src[i] ?? src[1 + ((i - 1) % Math.max(1, src.length - 1))] ?? (i % 2 ? 1 : -1))));
      return { ons, mv, run };
    }
    // 混在（placement 疎・rotate 無し）：パーツ bar は置換、l0 bar は元 variant の onset/輪郭を残す（＝従来抽選をそのまま）。
    const entries: { t: number; mv: number }[] = [];
    for (let i = 0; i < variant.ons.length; i++) {
      const t = variant.ons[i]!, barIdx = Math.floor(t / barLen);
      if (barIdx >= 0 && barIdx < L && typeof kinds[barIdx] === "object") continue; // パーツ置換 bar の元 onset は落とす（empty は placement 単独では生じない）
      entries.push({ t, mv: variant.mv[i] ?? 0 }); // l0 bar＝従来抽選の onset/輪郭を保持
    }
    const src = Mi.mv;
    for (let j = 0; j < L; j++) { const k = kinds[j]!; if (typeof k !== "object") continue; const bo = partPatternOnsets(k.pat, barLen); for (let x = 0; x < bo.length; x++) entries.push({ t: j * barLen + bo[x]!, mv: src[1 + ((j + x) % Math.max(1, src.length - 1))] ?? (x % 2 ? 1 : -1) }); }
    if (!entries.length) return null;
    entries.sort((a, b) => a.t - b.t);
    const ons = entries.map((e) => e.t);
    const run = ons.map((t, i) => (i > 0 && t - ons[i - 1]! <= 0.26) || (i < ons.length - 1 && ons[i + 1]! - t <= 0.26));
    const mv = entries.map((e, i) => (i === 0 ? 0 : e.mv)); // 先頭はアンカー＝0
    return { ons, mv, run };
  };

  const nB = blocks.length;
  // 提示(bi)→反復(seq)→…→継続断片(frag・カデンツ直前1つ)→カデンツ(cad)。対策6（2026-07-11）＝断片化は「継続部＝
  // カデンツ直前」に限定（Caplin：presentation は基本動機＋反復で伸ばし、fragmentation は解放=cad と対で最後に畳み掛ける）。
  // 旧＝中間ブロック全部 frag（長尺で提示が消え畳み掛けっぱなし）。nB=4（8小節）は bi/seq/frag/cad で従来一致。
  const sRole = (i: number): "bi" | "seq" | "frag" | "cad" => (i === nB - 1 ? "cad" : i === 0 ? "bi" : i === nB - 2 ? "frag" : "seq");
  const bBlockBars = new Set<number>(); // 単一頂点のB塊(弧のピーク)判定用
  for (let bi = 0; bi < nB; bi++) {
    const bar0 = blocks[bi]!.bar0, L = blocks[bi]!.bars, last = bi === nB - 1;
    const rbb = varLen ? L : mb; // render/断片の長さ（既定=mb でbit一致）
    const Mi = motifFor(L);
    let variant: Motif16, anchor: number, label: string;
    if (sentence) {
      const fn = sRole(bi);
      variant = fn === "frag" ? fragment(Mi, rbb) : Mi; // bi/seq/cad=覚えられる動機M(逐語)、継続=断片化
      const ab = an(bar0);
      anchor = fn === "seq" ? clampScale(sp, nearestIdx(sp, ab) + 2) : ab; // 反復は2スケール段 移高=sequence(同一性＋運動)
      label = fn;
    } else {
      const role = roleOf(bi);
      // preserve×hook＝反復音フックは「提示→逐語反復(basic ideaの反復)→対比→回帰」が本領（Caplin sentence・理論#3）。
      // 初回反復(A')を尾変奏でなく逐語(exact)にする＝動機の同一性を最も可聴に宣言。B(反行)/A''は従来。preserve時のみ＝bit一致。
      const exactFirstRep = preserve && hk > 0 && role === 1;
      variant = exactFirstRep ? Mi : role === 1 ? varyTail(Mi, r) : role === 2 ? invert(Mi) : Mi; // A / A'(preserve+hook=逐語 / 他=尾変奏) / B(反行) / A''
      if (fg > 0 && role !== 0 && !last && r() < fg) variant = freeVary(Mi, r); // 派生ブロックを自由材料に（fg=0では抽選しない＝bit一致）
      const anchorBase = an(bar0);
      anchor = role === 2 ? clampScale(sp, nearestIdx(sp, anchorBase) + 2) : anchorBase; // 弧＝B塊を音域ピークへ
      if (role === 2) for (let b = bar0; b < bar0 + L; b++) bBlockBars.add(b);
      label = role === 2 ? "B" : "A"; // A/A'/A''は同素材＝同ラベル(同k優先)、Bは別（ヒステリシス用）
    }
    if (densBar && !partsActive) variant = applyConverse(variant, convScale(bar0, L), rbb); // C: ブロック単位の密度相補（densBar無し/パーツ活性＝経路に入らない）
    if (partsActive) { const pv = buildPartVariant(variant, Mi, bar0, L); if (pv) variant = pv; } // S4-1/S4-2: パーツで onset グリッドを敷く（per-bar・l0 bar は元 variant 維持）
    notes.push(...(preserve ? renderPreserve(variant, bar0, last, label, rbb) : render(variant, bar0, anchor, last, rbb)));
  }
  notes.sort((a, b) => a.start - b.start);

  // ── 句頭遅延入場(#9・breathe・2026-07-09)：句頭の onset を落として「入りの遅れ」＝呼吸を作る（実曲86%が曲頭休）──
  // 各句(無ければブロック)の冒頭 breathe*1.5拍ぶんの onset を drop。句を空にしない・最終音は保護。既定0=drop無し=bit一致。
  const breathe = Math.max(0, Math.min(1, opts.breathe ?? 0));
  if (breathe > 0 && notes.length > 2) {
    const delay = breathe * 1.5;
    const ranges = opts.phrases && opts.phrases.length
      ? opts.phrases.map((p) => ({ s: p.startBeat, e: p.startBeat + p.beats }))
      : Array.from({ length: nBlk }, (_, b) => ({ s: b * mb * barLen, e: (b + 1) * mb * barLen }));
    const lastIdx = notes.length - 1;
    const drop = new Set<number>();
    for (const { s, e } of ranges) {
      const idxs = notes.map((n, i) => [i, n.start] as [number, number]).filter(([, t]) => t >= s - 1e-6 && t < e - 1e-6).sort((a, b) => a[1] - b[1]);
      if (idxs.length < 2) continue; // 1音以下の句は触らない（空防止）
      if (!idxs.some(([, t]) => t >= s + delay - 1e-6)) continue; // 全部が遅延窓内なら残す（句を空にしない）
      for (const [i, t] of idxs) if (t < s + delay - 1e-6 && i !== lastIdx) drop.add(i); // 冒頭窓内を drop（最終音は保護）
    }
    if (drop.size) { const kept = notes.filter((_, i) => !drop.has(i)); notes.length = 0; notes.push(...kept); }
  }

  // ── 保護マスク（Phase2案B U4・2026-07-10）：動機由来の反復音を後処理の"足踏み散らし"から守る ──
  // renderPreserve が _mp タグを付けた note（同degグループ＝反復音）を、sort/breathe 後（index確定後）に
  // start時刻でなく note オブジェクト参照で拾う＝index安定性(コード#3a)。default(preserve無し)は空集合＝全ガードno-op＝bit一致。
  const motifProtected = new Set<number>();
  if (preserve) { for (let i = 0; i < notes.length; i++) if ((notes[i] as { _mp?: boolean })._mp) motifProtected.add(i); for (const n of notes) delete (n as { _mp?: boolean })._mp; }

  // ── 自己チェック(E-rule)対策の後処理（D1-D4 再設計 2026-07-08・design#12-M）──
  // 順序＝①強拍CT→②禁則→③gap-fill→④単一頂点→⑤検証。規約＝(a)全パス終止音保護（B3）
  // (b)強拍を動かす時は必ずコード音内＝①の結果を後段が壊さない (c)④の頂点keeperはB塊(role=2)優先＝弧の意図を守る。
  // strongPos は関数冒頭で meterInfo strongPositions に一致させ定義済（4/4[0,2]・6/8[0,1.5]・3/4[0]・6/4[0,3]）。
  const onStrong = (t: number): boolean => { const ib = ((t % barLen) + barLen) % barLen; return strongPos.some((p) => Math.abs(ib - p) < 0.12); };
  // A2/A3: 後処理のCTスナップも半音空間（ctOfと同実装）＝導音/色音に乗れる。スケール歩行は導音小節で spRaised（spAt）。
  const ctP = (pitch: number, pcs: number[]): number => ctOf(pitch, pcs);
  // target 近傍へ置く：強拍=その小節のコード音／弱拍=スケール音（導音小節は和声的短音階）。
  const placeNear = (i: number, target: number, force = false): void => {
    if (!force && motifProtected.has(i)) return; // U4：動機由来の反復音は書込先でも動かさない（default空集合＝no-op＝bit一致）。force=禁則/gap掃除は硬いガードレールゆえ保護に優先（§3.3 内部禁則=fallback確定）
    const t = notes[i]!.start, bar = barOf(t);
    const L = spAt(bar);
    notes[i]!.pitch = onStrong(t) ? ctP(target, pcsAtT(t)) : clampScale(L, nearestIdx(L, target));
  };
  const isForbiddenIv = (a: number): boolean => a === 6 || a === 10 || a === 11 || a > 12;
  // 和声考慮(2026-07-09 批判レビュー・跳躍B)：両端がコード音の跳躍は「アルペジオ」＝三全音/7度でも正当
  // （属7の 3-♭7 三全音・コード内7度）。禁則除去/gap-fill回収の対象外にする＝和声盲の禁則で潰さない。
  // 8度超(>12)は歌えない声域跳躍なので免除しない（この関数の外＝下の呼び出しで a<=12 のみ免除）。
  const pcAt = (p: number): number => ((p % 12) + 12) % 12;
  const bothChordTones = (i: number): boolean => i >= 1 && pcsAtT(notes[i - 1]!.start).includes(pcAt(notes[i - 1]!.pitch)) && pcsAtT(notes[i]!.start).includes(pcAt(notes[i]!.pitch));
  // 禁則修正の置き先を「アンカー(隣接音)と禁則にならない」候補から選ぶ（dim和音等で最寄りコード音が
  // また三全音＝不動点、を防ぐ）。候補：強拍=コード音（半音空間）／弱拍=スケール音。無ければ placeNear へ。
  const placeNonForbidden = (i: number, target: number, anchors: number[], force = false): void => {
    if (!force && motifProtected.has(i)) return; // U4：動機由来の反復音は書込先でも動かさない（default空集合＝no-op＝bit一致）。force=禁則掃除は保護に優先
    const t = notes[i]!.start, bar = barOf(t);
    const cands: number[] = [];
    if (onStrong(t)) {
      const pcs = pcsAtT(t);
      for (let p = sp[0] ?? 48; p <= (sp[sp.length - 1] ?? 84); p++) if (pcs.includes(((p % 12) + 12) % 12)) cands.push(p);
    } else {
      cands.push(...spAt(bar));
    }
    let best = -1, bd = Infinity;
    for (const c of cands) {
      if (anchors.some((a) => isForbiddenIv(Math.abs(c - a)))) continue;
      const d = Math.abs(c - target);
      if (d < bd || (d === bd && c < best)) { bd = d; best = c; }
    }
    if (best >= 0) notes[i]!.pitch = best;
    else placeNear(i, target, force); // force伝播＝禁則掃除のフォールバックでも保護に優先（コードレビュー#1・default空集合ゆえbit一致）
  };
  // ── 対位バイアス（メロ×ベース・design「gen_melody×ベース結線」・research/2026-07-10-melody-bass-counterpoint.md）──
  // 評価器 analyzeVoiceLeading の指標（並行/隠伏5度8度・b9・反行）を snap の選好関数へ転用。効かせるのは
  // ①強拍CTスナップの距離式と 弱拍掃除の対ベースb9 の2点のみ＝onset/dur と mv列（輪郭）は不変＝反復を壊さない。
  // 鉄則：counter=0 or bass無し＝対位経路に入らない＝従来と bit 一致（構造的保証）。
  const counter = Math.max(0, Math.min(1, opts.counter ?? 0));
  const bassAt = counter > 0 && opts.bassPitchAt ? opts.bassPitchAt : undefined;
  // 重みの比は理論（research④＝並行3:隠伏1.5:b9 4:反行0.5）。絶対値は counter スイープの実測で×2 較正
  // （距離項=半音。counter*W が 1 を超えて初めて snap 先が動く＝旧値だと 0.2-0.4 帯が tie-break のみで無効だった。
  // ×2 で counter=0.2 から効き、counter=1 でも pitch 変更 ~2%＝反復は壊れない・実測は research doc ⑤）。
  const W_PAR = 6, W_DIR = 3, W_B9 = 8, W_CONTRA = 1;
  const counterTerm = (c: number, t: number, prevMel: number, prevT: number): number => {
    const bl = bassAt!(t);
    if (bl == null) return 0;
    const pb = bassAt!(prevT) ?? bl; // 直前標本＝評価器と同じ隣接遷移（pitchAt を共用）
    const iv1 = (((c - bl) % 12) + 12) % 12, iv0 = (((prevMel - pb) % 12) + 12) % 12;
    const du = c - prevMel, dl = bl - pb;
    const sameDir = du !== 0 && dl !== 0 && Math.sign(du) === Math.sign(dl);
    let pen = 0;
    if (sameDir && iv0 === iv1 && (iv1 === 0 || iv1 === 7)) pen += W_PAR; // 並行完全協和＝「持続」のみ罰（単発は許す）
    else if (sameDir && Math.abs(du) > 2 && (iv1 === 0 || iv1 === 7)) pen += W_DIR; // 隠伏＝同方向＋上声跳躍で完全協和へ突入
    if (iv1 === 1) pen += W_B9; // 対ベース実音の b9（強拍snap文脈＝持続音）
    if (dl !== 0 && du !== 0 && Math.sign(du) === -Math.sign(dl)) pen -= W_CONTRA; // 反行ボーナス（罰でなく負項）
    return pen;
  };
  // ① 強拍をコードトーンへ（句末着地は保持＝最後の音は触らない）。以降のパスは規約(b)でCT性を保つ。
  // anti-unison(2026-07-09 監査B)：snap結果が直前音と同一ピッチになる時だけ「同pc以外の最寄りコード音(禁則を
  // 作らない)」を選ぶ＝強拍CT不変量・禁則ガードを保ったまま snap衝突の足踏みを散らす（同音28→21%実測）。
  // 対位（bassAt 有り）：候補コード音 q を d=|q-tgt|+counter*counterTerm で argmin＝「どのコード音か」の選好だけ変わる。
  // i==0（直前音なし）は運動項が定義できないため b9（同時発音）項のみ＝簡約 counterTerm。
  for (let i = 0; i < notes.length - 1; i++) if (onStrong(notes[i]!.start) && !motifProtected.has(i)) { // U4：強拍CT/anti-unison も動機由来反復音は素通し
    const pcs = pcsAtT(notes[i]!.start), tgt = notes[i]!.pitch;
    const cTerm = (q: number): number => {
      if (!bassAt) return 0;
      if (i > 0) return counter * counterTerm(q, notes[i]!.start, notes[i - 1]!.pitch, notes[i - 1]!.start);
      const bl = bassAt(notes[i]!.start);
      return bl != null && (((q - bl) % 12) + 12) % 12 === 1 ? counter * W_B9 : 0; // 句頭＝b9のみ罰
    };
    let p = ctP(tgt, pcs);
    if (bassAt) { // 対位経路＝候補列挙＋距離最小化（tie-break は昇順走査の先着＝低い方＝ctOf と同じ）
      let best = -1, bd = Infinity;
      for (let q = sp[0] ?? 48; q <= (sp[sp.length - 1] ?? 84); q++) {
        if (!pcs.includes(((q % 12) + 12) % 12)) continue; // コード音のみ（CT不変量保持）
        const d = Math.abs(q - tgt) + cTerm(q);
        if (d < bd) { bd = d; best = q; }
      }
      if (best >= 0) p = best;
    }
    if (i > 0 && p === notes[i - 1]!.pitch) { // 直前と同音＝別のコード音へ
      let best = -1, bd = Infinity;
      for (let q = sp[0] ?? 48; q <= (sp[sp.length - 1] ?? 84); q++) {
        if (!pcs.includes(((q % 12) + 12) % 12)) continue; // コード音のみ（CT不変量保持）
        if (q === notes[i - 1]!.pitch) continue; // 直前と同音は避ける
        if (isForbiddenIv(Math.abs(q - notes[i - 1]!.pitch))) continue; // 禁則を作らない
        const d = Math.abs(q - tgt) + cTerm(q); // 対位項も同式（bassAt 無し＝0＝従来）
        if (d < bd) { bd = d; best = q; }
      }
      if (best >= 0) p = best; // 見つからなければ従来snap（悪化させない）
    }
    notes[i]!.pitch = p;
  }
  // ② 禁則跳躍(三全音6/10/11/8度超)→同方向≈3度に縮める。③ 跳躍(|≥5|半音)後は逆向きstepで回収。
  const fixForbidden = (): void => {
    for (let i = 1; i < notes.length; i++) {
      const iv = notes[i]!.pitch - notes[i - 1]!.pitch, a = Math.abs(iv);
      if (isForbiddenIv(a) && !(a <= 12 && bothChordTones(i))) { // 両端コード音のアルペジオ跳躍(≤8度)は許可
        if (i === notes.length - 1) {
          // 終止保護（B3）：最終音(着地)は動かさず、直前音を着地の手前(≈3度)へ寄せる。
          // アンカー＝着地音と、さらに手前の音（i-2との間に新禁則を作らない）。
          const anchors = [notes[i]!.pitch, ...(i - 2 >= 0 ? [notes[i - 2]!.pitch] : [])];
          placeNonForbidden(i - 1, notes[i]!.pitch - (Math.sign(iv) || 1) * 3, anchors, true);
          if (isForbiddenIv(Math.abs(notes[i]!.pitch - notes[i - 1]!.pitch)))
            placeNonForbidden(i - 1, notes[i]!.pitch - (Math.sign(iv) || 1) * 3, [notes[i]!.pitch], true); // 両立不能なら着地優先
        } else {
          placeNonForbidden(i, notes[i - 1]!.pitch + (Math.sign(iv) || 1) * 3, [notes[i - 1]!.pitch], true);
        }
      }
    }
  };
  const gapFill = (): void => {
    for (let i = 1; i < notes.length - 1; i++) {
      const iv = notes[i]!.pitch - notes[i - 1]!.pitch;
      if (Math.abs(iv) >= 5 && !bothChordTones(i)) { // 両端コード音のアルペジオ跳躍は回収しない（跳ねっぱなしを許す）
        const nx = notes[i + 1]!.pitch - notes[i]!.pitch;
        if (!(Math.sign(nx) === -Math.sign(iv) && Math.abs(nx) <= 2) && i + 1 < notes.length - 1) { // 句末(最後)は触らない＝終止保護
          placeNear(i + 1, notes[i]!.pitch - (Math.sign(iv) || 1) * 1.5); // gap-fillは平滑化(跳躍は合法)＝保護を尊重（禁則のみ force）
        }
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) { fixForbidden(); gapFill(); }
  // ④ 単一頂点＝keeperはB塊(弧のピーク・D3)優先→無ければ最初の頂点。他の頂点は「hi未満」へ：
  //   強拍=hi未満の最寄りコード音（D2: 一律hi-1の台地でなく文脈で下げ、①のCT性も保つ）／弱拍=スケール1段下。
  const hi = Math.max(...notes.map((n) => n.pitch));
  const peakIdx: number[] = [];
  for (let i = 0; i < notes.length - 1; i++) if (notes[i]!.pitch === hi) peakIdx.push(i); // 句末は除外＝終止保護
  if (peakIdx.length > 1) {
    const inB = (t: number): boolean => bBlockBars.has(barOf(t)); // B塊(弧のピーク)＝可変長対応（旧: roleOf(floor(bar/mb)) と既定一致）
    // 単一頂点keeperは保護反復音を優先（§4b・preserveは複数平頂点が正常＝反復音フックは足場型）。無ければ従来のB塊/先頭。
    const keeper = peakIdx.find((i) => motifProtected.has(i)) ?? peakIdx.find((i) => inB(notes[i]!.start)) ?? peakIdx[0]!;
    for (const i of peakIdx) {
      if (i === keeper || motifProtected.has(i)) continue; // §4b：保護反復音は平坦化しない（default空集合＝bit一致）
      const t = notes[i]!.start, bar = barOf(t);
      if (onStrong(t)) {
        const pcs = pcsAtT(t);
        let best = -1;
        for (let p = hi - 1; p >= (sp[0] ?? 48); p--) { if (pcs.includes(((p % 12) + 12) % 12)) { best = p; break; } } // hi未満の最寄りコード音
        const L = spAt(bar);
        notes[i]!.pitch = best >= 0 ? best : clampScale(L, nearestIdx(L, hi) - 1);
      } else {
        const L = spAt(bar);
        notes[i]!.pitch = clampScale(L, nearestIdx(L, hi) - 1);
      }
    }
  }
  // ⑤ 検証＝④が作り得る禁則を最終修正（D1: 「直した禁則の再導入」をパイプの最後で締める）。
  // 終止保護分岐(直前音を動かす)が i-2 との間に新禁則を作り得るため、有界ループで収束させる（実測: 2回で960/960）。
  for (let k = 0; k < 3; k++) fixForbidden();

  // ── 句末カデンツ着地パス（phrases・design#12-M Step2/P0-b・2026-07-09）──
  // planSkeleton の句割りを受け、各句の最終onsetを cadenceDegree のpc（1=主音/5=属音=半終止の開き）へ着地。
  // ブロックに紐づけず「句境界の実beat」で行う＝対称/非対称どちらも正しい位置で呼吸。B1和声追従＝
  // そのpcがコードにあれば採用・無ければ最寄りコード音。approach音の禁則は着地保護で直前音を動かして回収。
  const cadenceIdx = new Set<number>();
  if (opts.phrases && opts.phrases.length) {
    const hiP = Math.max(...notes.map((n) => n.pitch)); // 単一頂点維持＝着地は頂点を超えない
    const cadPc = (deg: number): number => (((tonicPc + (deg === 5 ? 7 : deg === 2 ? 2 : 0)) % 12) + 12) % 12; // 1=主音/5=属音/2=上主音
    for (const ph of opts.phrases) {
      const endBeat = ph.startBeat + ph.beats;
      let li = -1;
      for (let i = 0; i < notes.length; i++) if (notes[i]!.start >= ph.startBeat - 1e-6 && notes[i]!.start < endBeat - 1e-6) li = i;
      if (li < 0) continue;
      const t = notes[li]!.start, cur = notes[li]!.pitch, pcs = pcsAtT(t), want = cadPc(ph.cadenceDegree);
      let np: number;
      if (!pcs.length || pcs.includes(want)) { // cadence pc がコードにある＝そのpcへ着地
        let b = cur, bd = 99;
        for (const q of sp) { if (((q % 12) + 12) % 12 !== want) continue; if (Math.abs(q - cur) < bd) { bd = Math.abs(q - cur); b = q; } }
        np = b;
      } else np = ctP(cur, pcs); // 無ければ最寄りコード音（B1＝V終わりの開き等）
      while (np > hiP && np - 12 >= (sp[0] ?? 48)) np -= 12; // 頂点超えはオクターブ下げ（pc保持・単一頂点維持）
      notes[li]!.pitch = np;
      cadenceIdx.add(li);
      // 着地への禁則跳躍は着地を保護し直前音を寄せて回収（終止保護と同流儀）。
      if (li > 0 && isForbiddenIv(Math.abs(np - notes[li - 1]!.pitch))) {
        const anchors = [np, ...(li - 2 >= 0 ? [notes[li - 2]!.pitch] : [])];
        placeNonForbidden(li - 1, np - (Math.sign(np - notes[li - 1]!.pitch) || 1) * 3, anchors);
      }
    }
    // カデンツ着地は li→li+1（次句頭）の跳躍を無検査＝preserve+phrases で三全音が残る穴（コードレビュー#3）。
    // preserve のみ着地後に禁則掃除を1回（default は経路に入らず bit一致・既存の穴は別スコープ）。
    if (preserve) fixForbidden();
  }

  // ── 表情パス＝強拍非和声(expression ノブ・design#12-M Step1・2026-07-09)──
  // 後処理①が強拍をほぼ100%コードトーンにする＝綺麗すぎ(実曲57-90%)。確率 expr で強拍CTを
  // 「次音(コード音)へ歩進解決する非和声」＝倚音(appoggiatura)/掛留(suspension)へ置換する。
  // 保証：classifyNCT で other(孤立)を弾き・隣接の禁則を作らず・終止音と句頭(i=0)は不変・単一頂点を保つ。
  const expr = Math.max(0, Math.min(1, opts.expression ?? 0));
  if (expr > 0 && notes.length > 2) {
    const er = makeRng(seed + 17);
    const clampBar = (b: number): number => Math.max(0, Math.min(bars - 1, b));
    // classifyNCT/CT判定は bar 単位のコード（chordRootsPerBar/chordQuals）で統一＝生成器と評価が揃う。
    const chordOf = (b: number): { root: number; quality: string } => ({ root: (chordRootsPerBar[clampBar(b)] ?? tonicPc) % 12, quality: chordQuals[clampBar(b)] ?? "" });
    const pcsBar = (b: number): number[] => { const c = chordOf(b); return chordPcs(c.root, c.quality); };
    const hiPitch = Math.max(...notes.map((n) => n.pitch)); // 単一頂点保護＝これ以上に上げない
    const locked = new Set<number>(); // 隣接強拍を両方変換すると解決先が動いて相手が孤立化＝解決音(i+1)をロック
    for (let i = 1; i < notes.length - 1; i++) { // i=0(句頭)と最終音(終止)は保護＝触らない
      if (locked.has(i) || cadenceIdx.has(i)) continue; // 直前の変換の解決音／句末カデンツ着地は動かさない
      const t = notes[i]!.start;
      if (!onStrong(t)) continue;
      const bar = barOf(t);
      const pcs = pcsBar(bar);
      const cur = notes[i]!.pitch;
      if (!pcs.includes(((cur % 12) + 12) % 12)) continue; // 既に非和声＝対象外(二重掛けしない)
      const prev = notes[i - 1]!.pitch, next = notes[i + 1]!.pitch;
      // 解決の受けが要る：次音がコード音でなければ倚音として成立しない
      if (!pcsBar(barOf(notes[i + 1]!.start)).includes(((next % 12) + 12) % 12)) continue;
      if (er() >= expr) continue;
      const L = spAt(bar);
      // 候補：既定は解決音(next)の1スケール度上＝もたれて下行歩進解決する倚音。
      let cand = clampScale(L, nearestIdx(L, next) + 1);
      // 掛留：直前音が非和声にでき、かつ歩進で次へ解決するなら前音を保持(held→stepOut)。
      const prevPc = ((prev % 12) + 12) % 12, dPN = Math.abs(prev - next);
      if (!pcs.includes(prevPc) && dPN >= 1 && dPN <= 2) cand = prev;
      const candPc = ((cand % 12) + 12) % 12, dCN = Math.abs(cand - next);
      if (pcs.includes(candPc)) continue; // 結局コード音＝意味なし
      if (dCN < 1 || dCN > 2) continue; // 次へ歩進解決でない
      if (cand >= hiPitch) continue; // 単一頂点＝頂点に並ぶ/超える置換はしない
      if (isForbiddenIv(Math.abs(cand - prev)) || isForbiddenIv(dCN)) continue; // 禁則を作らない
      if (!isResolvedNct(classifyNCT(prev, cand, next, chordOf(bar)))) continue; // other(孤立)を弾く
      notes[i]!.pitch = cand;
      locked.add(i + 1); // 解決音は以降の変換で動かさない（相手を孤立させない）
    }
  }

  // ── 弱拍の露出した濁り(avoid note)掃除(2026-07-09 批判レビュー・コード外音A2)──
  // 弱拍がスケール歩行で「コード音の半音上(m2/m9)」に居座る**偶発的な濁り**だけを最寄りの安全音へ寄せる。
  // 短い順次の経過音(passing＝両側step同方向)は**色気なので残す**（掃除しすぎ＝無菌化に逆戻り＝避ける）。
  // 強拍/終止/句頭/カデンツ着地/表情NCT は不変。決定ルール(rng不使用)。禁則・単一頂点は保護。
  {
    const hiA = Math.max(...notes.map((n) => n.pitch));
    const isClash = (p: number, t: number): boolean => { const c = pcsAtT(t); const pc = pcAt(p); return !c.includes(pc) && c.includes((pc + 11) % 12); }; // コード音の半音上に居る
    // 対ベース実音の b9（挿入点C・design「gen_melody×ベース結線」）：既存 isClash は「コードpcの半音上」しか
    // 見えない＝ベースが5度等を弾いている瞬間の衝突が盲点。非コード音かつベース実音の半音上(m9)を濁りに追加。
    // bassAt 無し（bass未指定 or counter=0）＝常に false＝従来と bit 一致。passing 免除・安全候補防御は共用。
    const isClashBass = (p: number, t: number): boolean => { if (!bassAt) return false; const bl = bassAt(t); return bl != null && !pcsAtT(t).includes(pcAt(p)) && (((p - bl) % 12) + 12) % 12 === 1; };
    for (let i = 1; i < notes.length - 1; i++) {
      const t = notes[i]!.start;
      if (onStrong(t) || cadenceIdx.has(i) || motifProtected.has(i)) continue; // 弱拍のみ・カデンツ着地は不変・U4動機由来反復音も不変
      if (notes[i]!.pitch === hiA) continue; // 頂点音は動かさない（単一頂点保護）
      if (!isClash(notes[i]!.pitch, t) && !isClashBass(notes[i]!.pitch, t)) continue; // コード音 or 非濁り＝そのまま
      const prev = notes[i - 1]!.pitch, next = notes[i + 1]!.pitch, cur = notes[i]!.pitch;
      const din = cur - prev, dout = next - cur;
      // 短い順次の経過音(両側 step≤2・同方向)は色気＝残す。露出(跳躍入り/出・刺繍で濁る)だけ掃除。
      if (Math.abs(din) >= 1 && Math.abs(din) <= 2 && Math.abs(dout) >= 1 && Math.abs(dout) <= 2 && Math.sign(din) === Math.sign(dout)) continue;
      const L = spAt(barOf(t));
      let best = -1, bd = 99;
      for (const q of L) {
        if (q >= hiA) continue; // 単一頂点保護（頂点に並ばない）
        if (q === prev || q === next) continue; // 隣と同音＝足踏みは作らない（掃除で無菌化しない）
        if (isClash(q, t) || isClashBass(q, t)) continue; // 別の濁り（対ベースb9含む）へは動かさない
        if (isForbiddenIv(Math.abs(q - prev)) || isForbiddenIv(Math.abs(next - q))) continue; // 禁則を作らない
        const d = Math.abs(q - cur);
        if (d < bd || (d === bd && q > best)) { bd = d; best = q; } // 最寄り・同距離なら上を採る
      }
      if (best >= 0) notes[i]!.pitch = best; // 安全な非足踏み候補が無ければ濁りは残す（悪化させない）
    }
  }

  // ── A: キック食い（drumLock・design「gen_melody×ドラム結線」）＝push の対象拍を「実キック位置」で駆動する精緻化。
  // 対象＝拍頭ちょうどの音のうち「その拍頭の16分前(step-1)に実キックが食っている」拍のみ。確率 drumLock で16分前借り
  // （dur+=0.25 のタイ＝終端不変・前音は詰める＝anticipate と同式）。保護＝曲頭(i=0)/終止(last)は push と同じ。
  // 上限＝前借り≤2/小節（全整列＝ユニゾン化ガード・research③-A）。push との合成＝**音単位の排他（実効max）**：
  // ここで食った音は拍頭から外れ、後段 push の対象から構造的に外れる＝一音は最大1回・0.25拍しか前借りされない。
  // drumLock=0 or kick無し or compound＝丸ごとスキップ＝bit一致。rng は独立派生(seed+61)＝他段の列を乱さない。
  const dLock = Math.max(0, Math.min(1, opts.drumLock ?? 0));
  const dKick = opts.drums?.kick ?? [];
  if (dLock > 0 && !compound && dKick.length > 0 && notes.length > 2) {
    const kr = makeRng(seed + 61);
    const k16 = new Set(dKick.map((t) => Math.round(t * 4)));
    const pulled = new Map<number, number>(); // bar → この段の前借り数
    for (let i = 1; i < notes.length - 1; i++) { // 曲頭・終止は保護
      const n = notes[i]!;
      if (Math.abs(n.start - Math.round(n.start)) > 0.01) continue; // 拍頭ちょうどのみ
      const beat = Math.round(n.start);
      if (!k16.has(beat * 4 - 1)) continue; // 16分前に実キックが食っている拍のみ
      const bar = Math.floor(beat / barLen);
      if ((pulled.get(bar) ?? 0) >= 2) continue; // 上限≤2/小節
      if (kr() >= dLock) continue;
      const prev = notes[i - 1]!, ns = beat - 0.25;
      if (ns <= prev.start + 0.1) continue; // 前音を越えない
      n.dur += n.start - ns; n.start = ns; // タイで跨ぐ＝終端不変
      if (prev.start + prev.dur > ns) prev.dur = Math.max(0.1, ns - prev.start); // 前音を詰める
      pulled.set(bar, (pulled.get(bar) ?? 0) + 1);
    }
    notes.sort((a, b) => a.start - b.start);
  }

  // push(2026-07-09 Step4・design#12-M)：division-level syncopation＝前借り(食い)。既存 anticipate(位置固定・タイ・
  // 終端不変)で毎小節同じ拍を16分ぶん前へ。push量で対象拍を可変(0.33=3拍/0.66=1,3拍/1=1,2,3拍)。6/8は対象外。
  const push = Math.max(0, Math.min(1, opts.push ?? 0));
  if (push > 0 && !compound && notes.length > 1) {
    const beats = push > 0.75 ? [0, 1, 2] : push > 0.4 ? [0, 2] : [2];
    const lastN = notes[notes.length - 1]!, sStart = lastN.start, sDur = lastN.dur; // 終止は前借りしない＝保護
    anticipate(notes, { beats, offset: 0.25 });
    lastN.start = sStart; lastN.dur = sDur;
    notes.sort((a, b) => a.start - b.start);
  }

  // swing はフィール層へ移行（2026-07-11・design.md「フィール層分離」／研究 2026-07-11-swing-feel-layer-audit）。
  // 生成側は **notes をストレート格子のまま返し**、swing は content.feel に載せて再生/書き出し境界で applyFeel
  // が拍内単調ワープを掛ける（16分は入れ子で跳ね衝突しない・往復編集可逆）。旧「x.5だけ後段書き換え＋衝突
  // band-aid＋dur=gapクランプ」は撤去。opts.swing は generate.ts で content.feel.swing へ回す（ここでは不使用）。

  // ── pickup(2026-07-11・弱起・アウフタクト)：句頭の最初の音を前の息継ぎ窓へ少し出す＝実メロ70%/生成0%の埋め ──
  // 句頭(phrases 指定は各句頭・無ければブロック境界)の音を前へずらしダウンビートへタイ。曲頭は除外・onset1点移動のみ＝反復を壊さない。
  // flow より前＝息継ぎ窓が残っているうちに借りる。既定0＝不変＝bit一致。
  const pickup = Math.max(0, Math.min(1, opts.pickup ?? 0));
  if (pickup > 0 && notes.length > 2) {
    const headBeats = opts.phrases && opts.phrases.length ? opts.phrases.map((p) => p.startBeat).filter((b) => b > 0.1) : Array.from({ length: Math.max(0, nBlk - 1) }, (_, k) => (k + 1) * mb * barLen);
    for (const hb of headBeats) {
      const hi = notes.findIndex((n) => n.start >= hb - 1e-6 && n.start - hb < 0.6);
      if (hi <= 0) continue;
      const prev = notes[hi - 1]!;
      const room = notes[hi]!.start - (prev.start + prev.dur);
      const shift = Math.min(pickup, Math.max(0, room - 0.1), 0.75); // 弱起量（最大0.75拍・前音手前0.1は残す）
      if (shift < 0.1) continue;
      notes[hi]!.start = Math.round((notes[hi]!.start - shift) * 1000) / 1000;
      notes[hi]!.dur = Math.round((notes[hi]!.dur + shift) * 1000) / 1000; // ダウンビートまでタイ
    }
    notes.sort((a, b) => a.start - b.start);
  }

  // ── flow(2026-07-11・オーナーFB「塊がぶつ切れ」→「でも息継ぎが無いのもダメ」)：句内は連結・句末は息を残す ──
  // 症状（research 2026-07-10-melody-phrasing-length-direction）＝各ブロック末尾に息継ぎが焼き込まれ長い塊/白玉が出ない。
  // だが gap を無差別に埋めると句末の息まで消え全レガート化＝逆に不自然。so **句内の穴だけ連結・句末境界は息を残す**：
  //   ・句内 gap → 次onsetまで連結（flow*4拍上限）＝塊が伸び白玉が出る
  //   ・句末境界（phrases 各句末／無指定は4小節毎にフォールバック）→ 境界の breathAmt 手前まで＝money note→息継ぎ
  //   ・曲末（最終音）→ セクション末まで鳴らす（末尾は息不要）
  // 後段で dur のみ延長（onset/pitch/mv 不変＝反復・和声後処理・既存ノブと無干渉）。既定0＝dur不変＝bit一致。
  const flow = Math.max(0, Math.min(1, opts.flow ?? 0));
  if (flow > 0 && notes.length > 0) {
    const secEnd = bars * barLen;
    // interior 句末境界（曲末は除く＝末尾は鳴らし切る）。phrases 指定＝各句末／無指定＝4小節毎にフォールバック。
    const bounds = (opts.phrases && opts.phrases.length
      ? opts.phrases.map((p) => p.startBeat + p.beats)
      : Array.from({ length: Math.max(0, Math.ceil(bars / 4) - 1) }, (_, k) => (k + 1) * 4 * barLen)
    ).filter((b) => b < secEnd - 1e-6);
    // 対策2-C（着地位置ジッタ・2026-07-11）：句末の息量をseed決定的に句ごとにばらす＝終止の来る位置の単峰を崩す
    // （女性終止＝早めに歌い終え息長め ↔ 歌い切り＝息短め）。0.75〜2.5拍。main r() を汚さず独立ハッシュで再現的。
    const jitBreath = (k: number): number => {
      let x = (seed * 374761393 + (k + 1) * 668265263) >>> 0;
      x = ((x ^ (x >>> 13)) * 1274126177) >>> 0;
      const u = ((x ^ (x >>> 16)) >>> 0) / 4294967296; // [0,1)
      return 0.75 + u * 1.75; // [0.75, 2.5]
    };
    // 各句末境界の近傍で「実際の息継ぎ（最大の無音gap）」を1つ選び保護＝pickup で句頭が境界前へずれても gap の実位置で拾う。
    const breathOf = new Map<number, number>(); // 保護する音index → その句末に残す息量（ジッタ済）
    bounds.forEach((pb, k) => {
      let bestI = -1, bestGap = 0;
      for (let i = 0; i + 1 < notes.length; i++) {
        const gStart = notes[i]!.start + notes[i]!.dur, gEnd = notes[i + 1]!.start, g = gEnd - gStart;
        if (gEnd > pb - 2.5 && gStart < pb + 0.5 && g > bestGap) { bestGap = g; bestI = i; } // 境界近傍[pb-2.5,pb+0.5]の最大gap
      }
      if (bestI >= 0) breathOf.set(bestI, jitBreath(k)); // その音の後ろの息は埋めない（句末の呼吸・息量は句ごとにばらす）
    });
    // 和声ガード（2026-07-11・オーナーFB「flowで不協和」）：延長がコード変わり目をまたいで**非和声かつ半音衝突**に
    // なる手前で歌い終える（＝跨いだ先で濁る音は境界で切る）。和声音＝共通音なら跨いで伸ばしてよい（切らない）。
    const pcHalfClash = (pc: number, pcs: number[]): boolean => pcs.length > 0 && !pcs.includes(pc) && pcs.some((p) => { const d = (((pc - p) % 12) + 12) % 12; return d === 1 || d === 11; });
    const dissoCap = (pc: number, curEnd: number, target: number): number => {
      for (let t = Math.ceil(curEnd * 2 - 1e-6) / 2; t < target - 1e-6; t += 0.5) if (pcHalfClash(pc, pcsAtT(t))) return t; // 変わり目(curEnd以降の拍/半拍境界)で衝突なら手前で切る
      return target;
    };
    for (let i = 0; i < notes.length; i++) {
      const cur = notes[i]!;
      const nextStart = i + 1 < notes.length ? notes[i + 1]!.start : secEnd;
      const curEnd = cur.start + cur.dur;
      let newDur: number;
      if (breathOf.has(i)) {
        // 句末＝必ず息を残す。次onsetの breathAmt 手前で歌い終える＝money note は伸ばし・詰まった音は短縮して息を彫る。
        const breathAmt = breathOf.get(i)!;
        newDur = Math.max(0.25, Math.min(nextStart - breathAmt, curEnd + flow * 4) - cur.start);
      } else {
        newDur = Math.min(nextStart, curEnd + flow * 4) - cur.start; // 句内・曲末＝次onset(末尾はセクション末)まで連結（延長のみ）
        if (newDur < cur.dur) newDur = cur.dur;
      }
      newDur = dissoCap((((cur.pitch % 12) + 12) % 12), curEnd, cur.start + newDur) - cur.start; // コード衝突の手前で頭打ち
      if (Math.abs(newDur - cur.dur) > 0.01 && newDur >= 0.1) cur.dur = Math.round(newDur * 1000) / 1000;
    }
  }

  // ── リズムパーツ層 L1（design #20 S4-1）：音価＝パターンの疎密が決める＝「次onsetまでの gap を dur で埋める」──
  // render/flow の dur はキャップ(1.6/1.05拍等)で長音が出ない（backlog「音価不足」の根）。パーツ活性時のみ
  // flow/articulation の後・restMask の前で dur を次onset（最終音はセクション末）まで上書き＝疎パーツが白玉/長音になる
  // （agogic 対比）。articulation は先に走るので反復音 micropause は残る／restMask は後で休符区間を切る。
  // パーツ非活性＝この上書きに入らない＝bit一致。
  if (partsActive && notes.length) {
    const secEnd = bars * barLen;
    for (let i = 0; i < notes.length; i++) {
      const next = i + 1 < notes.length ? notes[i + 1]!.start : secEnd;
      const d = next - notes[i]!.start;
      if (d > 0.05) notes[i]!.dur = Math.round(d * 1000) / 1000;
    }
  }

  // humanize(2026-07-09 監査E → 2026-07-11 feel層分離)：**velocity(強弱アクセント)はデータ層に残す**＝譜面に
  // 書ける compositional 情報（backbeat が vel-only でデータ層にいるのと整合）。**タイミング揺れは feel 層へ移行**
  // （applyFeel・content.feel.humanize＝ストレート格子を歪めない）。決定的(makeRng)・LRC相関(前の揺れに相関する乱歩)。
  // 既定0＝velフィールドを付けず start 不変＝bit一致。web/MIDI は n.vel ?? 100 で既に対応。
  const hum = Math.max(0, Math.min(1, opts.humanize ?? 0));
  if (hum > 0 && notes.length > 0) {
    const hr = makeRng(seed + 29);
    const decay = 0.6; // 相関の強さ（LRC近似）
    let ve = 0;
    for (const n of notes) {
      ve = decay * ve + (1 - decay) * (hr() * 2 - 1); // velocity の相関乱歩
      const posBoost = onStrong(n.start) ? 8 : -4; // 強拍やや強・裏やや弱
      n.vel = Math.max(55, Math.min(118, Math.round(96 + posBoost + hum * ve * 18)));
    }
    // timing 揺れは applyFeel(content.feel.humanize) が担当＝ここでは start/dur 不変（SSOTストレート維持）。
  }

  // ── B: バックビート・アクセント（backbeat・design「gen_melody×ドラム結線」）＝velocity のみ・onset/pitch/dur 不変
  // （最低リスク＝research③-B）。humanize の posBoost（メトリカル強拍±）に対する第2項＝**ドラム実在位置**のブースト：
  // スネア位置+12/キック位置+6 を backbeat 倍して加算（16分グリッドへ round して照合＝humanize/swing/前借り後の
  // 位置でも噛む）。humanize 無しでも単独で効く（基底 vel ?? 100＝web/MIDI の既定と同じ・非該当音は vel を付けない）。
  // backbeat=0 or kick/snare無し or compound＝丸ごとスキップ＝bit一致。決定的（rng不使用）。
  const bkb = Math.max(0, Math.min(1, opts.backbeat ?? 0));
  const dSnare = opts.drums?.snare ?? [], dKickB = opts.drums?.kick ?? [];
  if (bkb > 0 && !compound && (dSnare.length > 0 || dKickB.length > 0)) {
    const s16 = new Set(dSnare.map((t) => Math.round(t * 4)));
    const kb16 = new Set(dKickB.map((t) => Math.round(t * 4)));
    for (const n of notes) {
      const st = Math.round(n.start * 4);
      const boost = s16.has(st) ? 12 : kb16.has(st) ? 6 : 0;
      if (boost > 0) n.vel = Math.max(55, Math.min(118, Math.round((n.vel ?? 100) + bkb * boost)));
    }
  }

  // ── アーティキュレーション後段（Phase2案B U6・2026-07-10・理論眼④）──
  // 反復音連打はレガートだと1本の長音に潰れる（Bresin 2001＝micropause必須）。articulation で dur を縮め隙間を作る。
  // 反復音＝強めに切る(micropause)＋連打頭アクセント。他音＝軽くスタッカート。既定0＝dur/vel無変更＝bit一致。決定的。
  const art = Math.max(0, Math.min(1, opts.articulation ?? 0));
  if (art > 0 && notes.length > 1) {
    for (let i = 0; i < notes.length; i++) {
      const ioi = (notes[i + 1]?.start ?? notes[i]!.start + notes[i]!.dur) - notes[i]!.start;
      if (ioi <= 0) continue;
      const isRep = i + 1 < notes.length && notes[i + 1]!.pitch === notes[i]!.pitch; // 次音が同pitch＝連打
      const factor = isRep ? 1 - art * 0.4 : 1 - art * 0.25; // 反復音は深く切る（gap≥0.4·IOI@art=1）・他は軽く
      notes[i]!.dur = Math.min(notes[i]!.dur, Math.max(0.05, ioi * factor)); // gap 下限 0.05拍
      if (isRep) notes[i]!.vel = Math.max(55, Math.min(118, Math.round((notes[i]!.vel ?? 100) + art * 10))); // 連打頭アクセント
    }
  }

  // ── 骨格休符マスク（design #20 S3b・2026-07-11）：骨格の pitch:null 区間＝「表面でも音を出さない」の根治。
  // 全後処理（flow延長/humanize/articulation…）の後・returnの直前で当該区間の表面音を落とす。RNG不消費。
  // ①onsetが休符区間内の音は drop（表面でも鳴らさない）②durが休符区間へ食い込む音は区間頭で切る（直前音の
  // 自然な着地/減衰は殺さない）。restMask undefined/空＝骨格に休符なし or 骨格未指定＝丸ごとスキップ＝bit一致。
  const restMask = opts.restMask;
  if (restMask && restMask.length && notes.length) {
    const inRest = (t: number): boolean => restMask.some((r) => t >= r.start - 1e-6 && t < r.end - 1e-6);
    const kept: Note[] = [];
    for (const n of notes) {
      if (inRest(n.start)) continue; // 休符区間に入る onset は落とす
      let end = n.start + n.dur;
      for (const r of restMask) if (n.start < r.start - 1e-6 && end > r.start) end = Math.min(end, r.start); // 食い込む dur は区間頭で切る
      const d = Math.max(0.05, end - n.start);
      n.dur = Math.round(d * 1000) / 1000;
      kept.push(n);
    }
    notes.length = 0; notes.push(...kept);
  }
  return notes;
}

// メロディ補完(completion)＝ユーザーの部分メロ(先頭数小節)を種に V2 が残りを発展で埋める。
// partial→extractMotif16(seedMotif)→V2(seedMotif/keepFirstBlocks)で全小節生成→**partial の小節は実音を保持**し
// 残り(coveredBars 以降)を発展ぶんで埋める。接続は best-effort（種末尾から跳ねすぎたらオクターブ寄せ）。
// 著作権：ユーザー自作 partial を発展させるだけ＝セーフ。partial無し/不揃いでも落ちない。
export function completeMelody(
  partial: { pitch: number; start: number; dur?: number }[],
  chordPcsPerBar: number[][],
  chordRootsPerBar: number[],
  chordQuals: string[],
  scalePitches: number[],
  motif16: MotifModel16,
  opts: { seed?: number; tonicPc?: number; minor?: boolean; skelModel?: SkeletonModel; compound?: boolean; chordPcsAt?: (t: number) => number[] } = {},
): Note[] {
  const barLen = opts.compound ? 3 : 4;
  const bars = chordPcsPerBar.length;
  const ns = [...(partial ?? [])].filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.start)).sort((a, b) => a.start - b.start);
  // partial 無し＝通常 V2（回帰：補完を呼んでも種が無ければ素の生成と一致）。
  if (ns.length === 0) return genMotifMelodyV2(chordPcsPerBar, chordRootsPerBar, chordQuals, scalePitches, motif16, { seed: opts.seed, tonicPc: opts.tonicPc, minor: opts.minor, skelModel: opts.skelModel, compound: opts.compound, chordPcsAt: opts.chordPcsAt });
  const maxEnd = Math.max(...ns.map((n) => n.start + (n.dur ?? 0.25)));
  const coveredBars = Math.max(1, Math.min(bars, Math.ceil(maxEnd / barLen - 1e-6))); // partial が覆う小節数（実音保持の範囲）
  // G1(2026-07-08)：モチーフ長と種は「完全に埋まった小節」基準。半端小節(小節途中で終わる partial)を
  // そのまま種に使うと、空白がモチーフに焼き込まれ全ブロックに大穴が反復されていた（旧: 3.5拍無音×4回等）。
  const fullBarsCovered = Math.floor(maxEnd / barLen + 1e-6);
  const mb = Math.max(1, Math.min(4, Math.max(1, fullBarsCovered)));
  const seedSrc = fullBarsCovered >= 1 ? ns.filter((n) => n.start < fullBarsCovered * barLen - 1e-6) : ns;
  const seedMotif = extractMotif16(seedSrc.length ? seedSrc : ns, barLen);
  const head: Note[] = ns.map((n) => ({ pitch: n.pitch, start: n.start, dur: Math.max(0.25, n.dur ?? 0.25) })); // partial は実音保持
  if (coveredBars >= bars) return head; // partial が全体を覆う＝埋める余地なし
  // V2 を seedMotif で回す（block0=種・以降=発展）。先頭ブロック(=partial 区間)は捨て、tail のみ採用。
  const full = genMotifMelodyV2(chordPcsPerBar, chordRootsPerBar, chordQuals, scalePitches, motif16, {
    seed: opts.seed, tonicPc: opts.tonicPc, minor: opts.minor, skelModel: opts.skelModel, compound: opts.compound,
    motifBars: mb, seedMotif, keepFirstBlocks: 1, chordPcsAt: opts.chordPcsAt,
    motifMode: "preserve", // Phase2案B・design§5：補完はユーザー動機の同一性を保つ＝preserve既定（partial有り経路のみ・空partialは上の従来V2で一致）
  });
  // G1: 半端小節がある時は「完全小節境界」から maxEnd 以降を採用＝境界小節の残りを発展ブロックで埋める
  // （stub の実音とは maxEnd フィルタで重ねない）。半端が無ければ従来どおり coveredBars 境界。
  const cut = (fullBarsCovered >= 1 && fullBarsCovered < coveredBars ? fullBarsCovered : coveredBars) * barLen;
  const tail = full.filter((n) => n.start >= cut - 1e-6 && n.start >= maxEnd - 1e-6);
  // 接続(best-effort)：tail 先頭が partial 末尾から1oct超で跳ねたら、tail **全体**を近いオクターブへ寄せる
  // （G2: 旧は先頭1音だけ補正→2音目への新オクターブ跳躍を作っていた。全体shiftなら内部音程を保存）。
  // ちょうど1octはオクターブ跳躍＝協和として許容。音域を出る音が生じるshiftはしない（従来挙動へfallback）。
  if (tail.length && head.length) {
    const iv = tail[0]!.pitch - head[head.length - 1]!.pitch;
    if (Math.abs(iv) > 12) {
      const shift = -Math.sign(iv) * 12 * Math.floor((Math.abs(iv) - 1) / 12);
      const lo = scalePitches[0] ?? 48, hi = scalePitches[scalePitches.length - 1] ?? 84;
      if (tail.every((n) => n.pitch + shift >= lo && n.pitch + shift <= hi)) {
        for (const n of tail) n.pitch += shift;
      } else {
        tail[0]!.pitch = clampScale(scalePitches, nearestIdx(scalePitches, tail[0]!.pitch) - Math.sign(iv) * 7);
      }
    }
  }
  return [...head, ...tail];
}
