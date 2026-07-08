// メロディの規則ベース自動評価（E-rule）。理論(skeleton/contour/harmony 研究)をスコア関数化。
// ＝「耳なし反復」の土台：brush-up を指標の上下で回せる。各 metric 0..1（高=良）、score は加重平均。
// 相棒の E-AI（LLM のゲシュタルト判定）と相補（rule=具体違反を正確に／AI=musicality を曖昧に）。
import { chordPcs, normRoot } from "./theory";
import { meterInfo } from "./meter";
import type { BarRhythmModel, MoveModel } from "./melodyCells";

type Note = { pitch: number; start: number; dur: number };
type Chord = { root?: number | string; quality?: string; start?: number; dur?: number };

export interface MelodyEval { score: number; metrics: Record<string, number>; critique: string[] }

// 根音→ピッチクラス（SSOT: theory.normRoot＝Unicode♯♭・重臨時記号も安全）。
const rootPc = (r?: number | string): number => normRoot(r ?? "C");

// 0..1 にクランプ。target 中心の三角スコア（target で1・幅 w で0）。
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const tri = (x: number, target: number, w: number) => clamp01(1 - Math.abs(x - target) / w);

export function evalMelody(notes: Note[], opts: { chords?: Chord[]; key?: number; meter?: string } = {}): MelodyEval {
  const ns = [...notes].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.start - b.start);
  const metrics: Record<string, number> = {};
  const critique: string[] = [];
  if (ns.length < 2) return { score: 0, metrics, critique: ["音が少なすぎる"] };

  const ivs: number[] = [];
  for (let i = 1; i < ns.length; i++) ivs.push(ns[i]!.pitch - ns[i - 1]!.pitch);

  // ① 禁則跳躍なし率（三全音±6・7度±10,11・8度超）。Fux。
  const forbid = ivs.filter((d) => Math.abs(d) === 6 || Math.abs(d) === 10 || Math.abs(d) === 11 || Math.abs(d) > 12).length;
  metrics.noForbiddenLeaps = clamp01(1 - forbid / ivs.length);
  if (forbid > 0) critique.push(`禁則跳躍(三全音/7度/8度超) ${forbid}個`);

  // ② gap-fill：跳躍(|≥5|)の後が逆向きstep か（Narmour R/Fux leap recovery）。跳躍なしは満点。
  const leaps: number[] = [];
  for (let i = 0; i < ivs.length - 1; i++) if (Math.abs(ivs[i]!) >= 5) leaps.push(Math.sign(ivs[i + 1]!) === -Math.sign(ivs[i]!) && Math.abs(ivs[i + 1]!) <= 2 ? 1 : 0);
  metrics.gapFill = leaps.length ? leaps.reduce((a, b) => a + b, 0) / leaps.length : 1;
  if (leaps.length && metrics.gapFill < 0.4) critique.push("跳躍が逆向きstepで回収されてない");

  // ③ 順次率（step|≤2|の割合）。target ~0.65。
  const step = ivs.filter((d) => Math.abs(d) <= 2).length / ivs.length;
  metrics.stepRatio = tri(step, 0.65, 0.5);

  // ④ 単一クライマックス（最高音が1つ＝アーチ。Fux）。最高音の出現回数で減点。
  const hi = Math.max(...ns.map((n) => n.pitch));
  const hiCount = ns.filter((n) => n.pitch === hi).length;
  metrics.singleClimax = clamp01(1 - (hiCount - 1) * 0.25);
  if (hiCount > 2) critique.push(`頂点(最高音)が${hiCount}回＝アーチ曖昧`);

  // ⑤ 主音終止（最後の音が調主音＝close）。key 指定時。
  if (typeof opts.key === "number") {
    const lastPc = ((ns[ns.length - 1]!.pitch % 12) + 12) % 12;
    metrics.cadenceClose = lastPc === (((opts.key % 12) + 12) % 12) ? 1 : 0;
    if (metrics.cadenceClose === 0) critique.push("主音で終止していない（open or 未解決）");
  }

  // ⑥ 息継ぎ（隙間 or 長音がある＝べったりでない）。
  let hasGap = false; for (let i = 1; i < ns.length; i++) if (ns[i]!.start - (ns[i - 1]!.start + ns[i - 1]!.dur) > 0.1) hasGap = true;
  const hasLong = ns.some((n) => n.dur >= 1.5);
  metrics.breathing = hasGap || hasLong ? 1 : 0;
  if (metrics.breathing === 0) critique.push("息継ぎ/長音がなくべったり");

  // ⑦ 音域（歌える範囲＝1オクターブ+少々）。span が広すぎると減点。
  const span = hi - Math.min(...ns.map((n) => n.pitch));
  metrics.inRange = tri(span, 9, 12); // 9半音中心・±12で0（極端に狭/広を減点）
  if (span > 16) critique.push(`音域 ${span}半音＝広すぎ`);

  // ⑧ 強拍コードトーン率（chords+meter 指定時）。GTTM/古典則。
  if (opts.chords?.length) {
    const info = meterInfo(opts.meter ?? "4/4");
    const bar = info.beatsPerBar;
    const chAt = (t: number) => { const c = opts.chords!.find((x) => t >= (x.start ?? 0) - 1e-6 && t < (x.start ?? 0) + (x.dur ?? bar)); return c ? chordPcs(rootPc(c.root), c.quality ?? "") : null; };
    let ct = 0, tot = 0;
    for (const n of ns) {
      const inBar = ((n.start % bar) + bar) % bar;
      if (!info.strongPositions.some((p) => Math.abs(inBar - p) < 0.12)) continue; // 強拍のみ
      const pcs = chAt(n.start); if (!pcs) continue; tot++;
      if (pcs.includes(((n.pitch % 12) + 12) % 12)) ct++;
    }
    if (tot > 0) { metrics.chordToneStrong = ct / tot; if (ct / tot < 0.8) critique.push(`強拍コードトーン率 ${Math.round(100 * ct / tot)}%（低）`); }
  }

  // 加重平均（指標が無いものは除外）。協和/終止/禁則を重め。
  const W: Record<string, number> = { noForbiddenLeaps: 2, gapFill: 1, stepRatio: 1, singleClimax: 1, cadenceClose: 1.5, breathing: 1, inRange: 1, chordToneStrong: 2 };
  let sw = 0, sv = 0;
  for (const [k, v] of Object.entries(metrics)) { const w = W[k] ?? 1; sw += w; sv += w * v; }
  const score = sw ? sv / sw : 0;
  return { score, metrics, critique };
}

// コーパス尤度（E-corpus）＝**既存の学習済み重み**（リズム語彙＋move遷移）で「らしさ」を測る。
// LLM/外部モデル不要・純TS・per-sample。生成メロの①各小節リズムパターン②onset間move が
// 学習分布でどれだけ尤もらしいか（平滑化付き幾何平均）。候補の順位付け＝自己進化の“曖昧”判定側。
export function corpusTypicality(notes: Note[], model: { rhythm: BarRhythmModel; move: MoveModel }, opts: { beatsPerBar?: number; eighthsPerBar?: number } = {}): { score: number; rhythmTypicality: number; moveTypicality: number } {
  const ns = [...notes].filter((n) => Number.isFinite(n.pitch)).sort((a, b) => a.start - b.start);
  if (ns.length < 2) return { score: 0, rhythmTypicality: 0, moveTypicality: 0 };
  const bpb = opts.beatsPerBar ?? 4;
  const epb = opts.eighthsPerBar ?? 8;
  // F2(2026-07-08)：リズム語彙は4/4の8枠で学習済（corpusBias 8分binning）。他グリッド(6/8=6枠等)は
  // 全ミス＝平滑床の定数でスコアを水増しするだけなので、リズム項は「判定不能=0」としmoveのみで測る。
  const rhythmSupported = epb === 8 && bpb === 4;
  let rhythmTypicality = 0;
  if (rhythmSupported) {
    // ① リズム：小節ごとの onset 列を学習語彙の確率で（ε平滑）
    const rTot = [...model.rhythm.patterns.values()].reduce((a, b) => a + b, 0) || 1;
    const V = Math.max(1, model.rhythm.patterns.size);
    const byBar = new Map<number, Set<number>>();
    for (const n of ns) { const bar = Math.floor(n.start / bpb); const slot = Math.round((n.start - bar * bpb) * 2); if (slot >= 0 && slot < epb) (byBar.get(bar) ?? byBar.set(bar, new Set()).get(bar)!).add(slot); }
    let rLog = 0, rN = 0;
    for (const [, slots] of byBar) { const g = Array(epb).fill("."); for (const s of slots) g[s] = "x"; const p = ((model.rhythm.patterns.get(g.join("")) ?? 0) + 0.5) / (rTot + 0.5 * V); rLog += Math.log(p); rN++; }
    rhythmTypicality = rN ? Math.exp(rLog / rN) * V : 0; // ×V で「一様より上か」を正規化（>1 で平均以上）
  }
  // ② move：onset間の半音move を P(m2|m1) で（ε平滑）
  const mv: number[] = []; for (let i = 1; i < ns.length; i++) mv.push(Math.max(-7, Math.min(7, ns[i]!.pitch - ns[i - 1]!.pitch)));
  let mLog = 0, mN = 0;
  for (let i = 1; i < mv.length; i++) { const h = model.move.trans.get(mv[i - 1]!); const tot = h ? [...h.values()].reduce((a, b) => a + b, 0) : 0; const p = ((h?.get(mv[i]!) ?? 0) + 0.3) / (tot + 0.3 * 15); mLog += Math.log(p); mN++; }
  const moveTypicality = mN ? Math.exp(mLog / mN) * 15 : 0; // ×15（move語彙幅）で正規化
  // 0..1 へ：典型度(>1=平均以上)を squash。リズム項が判定不能なグリッドでは move のみ。
  const sq = (x: number) => x / (1 + x);
  const score = rhythmSupported
    ? sq(Math.sqrt(Math.max(0, rhythmTypicality) * Math.max(0, moveTypicality)))
    : sq(Math.max(0, moveTypicality));
  return { score, rhythmTypicality, moveTypicality };
}
