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
export function genContour(onsetCount: number, model: MoveModel, seed: number, opts: { range?: number } = {}): number[] {
  const range = opts.range ?? 9;
  const r = makeRng(seed);
  const out: number[] = []; let cum = 0, prev = 0;
  // 禁則＝三全音(±6)／同方向の跳躍(|≥5|)2連続（Fux）。当たれば再サンプル、ダメなら step へ。
  const forbidden = (m: number, pv: number) => Math.abs(m) === 6 || (Math.abs(m) >= 5 && Math.abs(pv) >= 5 && Math.sign(m) === Math.sign(pv));
  for (let i = 0; i < onsetCount; i++) {
    if (i > 0) {
      let m = sampleMoveR(model, prev, r), tries = 0;
      while (tries < 8 && forbidden(m, prev)) { m = sampleMoveR(model, prev, r); tries++; }
      if (Math.abs(m) === 6) m = m > 0 ? 5 : -5; // 三全音→完全5度へ寄せる
      if (Math.abs(cum + m) > range) m = -Math.sign(cum || 1) * Math.abs(m); // range超過は折返し
      cum += m; prev = m;
    }
    out.push(cum);
  }
  return out;
}

// 統合＝有機メロ生成。コード追従骨格＋2小節motifリズム(語彙sample・反復)＋Markov contour(gap-fill)＋位置段階snap。
// chordPcsPerBar[bar]＝その小節のコード構成pc。返り＝音符列（durは次onsetまで・末は伸ばし）。
export function genMotifMelody(chordPcsPerBar: number[][], scalePitches: number[], rhythmModel: BarRhythmModel, moveModel: MoveModel, opts: { seed?: number; tonicPc?: number; fifthPc?: number; ending?: "open" | "close"; start?: number; contourRange?: number; distinctMotifs?: number; cadenceForce?: number; meter?: { beatsPerBar?: number; eighthsPerBar?: number; strongQuarters?: number[] } } = {}): Note[] {
  const seed = opts.seed ?? 1;
  const bars = chordPcsPerBar.length;
  // meter：4/4 既定（4四分/小節・8枠/小節・強拍0,2）。6/8＝{3, 6, [0,1.5]}。中景(contour)は流用。
  const bpb = opts.meter?.beatsPerBar ?? 4;        // 1小節の四分数
  const epb = opts.meter?.eighthsPerBar ?? 8;      // 1小節の8分枠数（=bpb*2）
  const strongQ = opts.meter?.strongQuarters ?? [0, 2];
  const range = opts.contourRange ?? 5;            // contour 振れ幅（FMDスイープで5が最も実曲寄り）
  const nM = Math.max(1, opts.distinctMotifs ?? 2); // 区別する2小節motifの数（FMD: 2=AABB最小・4は実曲から遠い）
  const idx = (p: number) => nearestIdx(scalePitches, p);
  const skel = genSkeleton(chordPcsPerBar, scalePitches, { ending: opts.ending ?? "close", tonicPc: opts.tonicPc ?? 0, fifthPc: opts.fifthPc ?? 7, start: opts.start ?? 67, beatsPerBar: bpb });
  // nM 個の (2小節motif=リズム+contour) を用意。ブロックは循環で割当（変化を与える）。
  const motifs = Array.from({ length: nM }, (_, k) => {
    const sd = seed + k * 101;
    const pat = [sampleBarRhythm(rhythmModel, sd), sampleBarRhythm(rhythmModel, sd + 37)];
    const ons: number[] = [];
    for (let bar = 0; bar < 2; bar++) for (let s = 0; s < epb; s++) if (pat[bar]![s] === "x") ons.push(bar * epb + s);
    return { ons, sem: genContour(ons.length, moveModel, sd + 5, { range }) };
  });
  const notes: Note[] = [];
  for (let blk = 0; blk * 2 < bars; blk++) {
    const baseBar = blk * 2;
    const anchor = skel[baseBar * bpb] ?? 67;
    const { ons, sem } = motifs[blk % nM]!;
    ons.forEach((sl, i) => {
      const t = baseBar * bpb + sl * 0.5; // 8分=0.5四分（複合でも8分は0.5四分）
      if (t >= bars * bpb - 1e-6) return;
      notes.push({ pitch: clampScale(scalePitches, idx(anchor + sem[i]!)), start: t, dur: 0.5 });
    });
  }
  notes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < notes.length; i++) notes[i]!.dur = (notes[i + 1]?.start ?? notes[i]!.start + 0.5) - notes[i]!.start;
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
export function snapToChordTones(notes: Note[], chordPcsAt: (beat: number) => number[], scalePitches: number[], opts: { longDur?: number; shortFree?: number; barQuarters?: number; strongQuarters?: number[] } = {}): void {
  const longDur = opts.longDur ?? 1.5;     // これ以上は位置に関わらず縛る（カデンツ/着地）
  const shortFree = opts.shortFree ?? 0.3; // これ未満は強拍でも通す（解決じみた極短音）
  const barQuarters = opts.barQuarters ?? 4;         // 1小節の四分数（4/4=4, 6/8=3）
  const strongQuarters = opts.strongQuarters ?? [0, 2]; // 小節内の強拍位置（四分）（6/8=[0,1.5]）
  for (const n of notes) {
    const inBar = ((n.start % barQuarters) + barQuarters) % barQuarters;
    const strong = strongQuarters.some((q) => Math.abs(inBar - q) < 0.12);
    if (!((strong && n.dur >= shortFree) || n.dur >= longDur)) continue; // それ以外は自由
    const pcs = chordPcsAt(n.start);
    if (pcs.length && !pcs.includes(((n.pitch % 12) + 12) % 12)) n.pitch = nearestPitchWithPc(n.pitch, pcs, scalePitches);
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
