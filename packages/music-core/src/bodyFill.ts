// phrase_maker `experiments/drums/fills/src/bodyfill.py` の忠実移植（2026-08-29）。
//
// これは **フィルの辞書ではなく生成器**。型を表から引くのではなく、「グルーヴが手を置いていった
// ところから、キットの地形を通って crash+kick の着地まで、**両手が辿れるいちばん安い経路**」を
// スロット単位のビーム DP で解く（＝phrase_maker が「身体性シミュレータ」と呼ぶ芯）。
// drumFill.ts（fills.py の固定10型）とは**別レイヤー**：配置スキャフォールド（FillPlacement /
// 着地 / 四肢検証）は drumFill.ts のものをそのまま再利用し、**span の中身だけ**が違う。
//
// 決定論（源流 §4）：コストは整数マイクロ単位へ量子化し、同値の並びは md5 で割る。k-best の
// 抽選も md5 の整数。**RNG も builtin hash も使わない**＝別プロセス・別言語でもバイト一致する。
//   - Python の round() は **round-half-to-even（銀行丸め）**＝`pyRound`（drumFill.ts）を使う。
//   - `_md5int` は md5 の**128bit 全体**を整数にして剰余を取る＝BigInt が要る（32bit では不一致）。
//   - ソートは Python の安定ソートと同じく (cost, md5hex) の辞書順。hex は ASCII なので
//     JS の既定文字列比較（UTF-16 コード単位）と Python のコードポイント比較は一致する。
//
// GMD prior（第一増分・opt-in）：実ドラマーの**order-0 統計のみ**（密度/打圧カーブ・ゴースト足・
// フラム率）。**bigram も n-gram もリテラル列も持たない**＝「他者コーパスは統計のみ」の内側。
// `prior` 未指定＝統計を一切使わない純物理＝源流の prior=None とバイト一致。
// 出所表記＝`GMD_ATTRIBUTION`（CC BY 4.0・表示義務）。

import { pyRound, round6, type DrumVoice, type FillEvent, INTENSITY, type IntensityCfg, type FillMeter } from "./drumFill";
import { md5Hex } from "./humanizeFill";

// ===========================================================================
// 1.1 キットの地形（2次元・右利き・物理定数）
// ===========================================================================
/** (x, y)。x は奏者から見て右へ、y は手の届き/高さ。 */
const POS: Record<string, [number, number]> = {
  snare: [0.0, 0.0],
  tom_hi: [-0.2, 0.55],
  tom_mid: [0.3, 0.6],
  tom_lo: [0.75, 0.35],
  floor: [0.9, 0.05],
  chh: [-0.6, 0.15],
  ride: [1.0, 0.55],
  crash: [-0.45, 0.9],
};
/** 打面の高さ（音高の高さ）。下降アークの引力だけが使う。 */
const H: Record<string, number> = { snare: 0.5, tom_hi: 0.8, tom_mid: 0.65, tom_lo: 0.45, floor: 0.3 };
/** リバウンド係数。高いほど2打目が楽＝ロールはスネアに棲む。 */
const REBOUND: Record<string, number> = { snare: 1.0, tom_hi: 0.7, tom_mid: 0.6, tom_lo: 0.4, floor: 0.3 };
/** フィルの中で「手」が叩ける打面（キックは足のアンカー＝別扱い）。 */
const HAND_DRUMS = ["snare", "tom_hi", "tom_mid", "tom_lo", "floor"] as const;

// 身体の運動限界
const V_COMFORT = 4.0; // 楽に振れるスティック速度（u/s）＝これ以下は無罰
const V_MAX = 8.0; // 限界の到達速度（u/s）＝これを超える移動は**不可能**
const RATE_BURST = 10.0; // 片手の瞬間連打レート（hits/s）＝3連打まで
const BOUNCE_LO_S = 0.035; // リバウンド窓（秒）＝この中でしかダブルは打てない
const BOUNCE_HI_S = 0.130;
const BOUNCE_QB = 0.125; // 2打目（バウンス）は実際の +1/32 スロットに乗る
const HAND_VEL: Record<string, number> = { R: +4, L: -4 }; // 利き手の非対称

const FLAM_GRACE_S = 0.020; // フラムの装飾音のずらし幅（秒・prior 経路のみ）
const GHOST_CAP = 0.85; // 足ゴーストのスロットあたり確率の上限

const SUB = 0.25; // スロット間隔（4分音符=1 の単位）＝16分格子（両拍子とも）

// 決定論：整数量子化と md5
const Q = 1000; // コスト→整数マイクロ単位
const T_LOTTERY = 220; // 抽選の温度（マイクロ単位・固定）
const KBEST = 8;
const BEAM = 64;
const BIG = 10 ** 6;

const qi = (x: number): number => pyRound(x * Q);
/** md5 の 128bit 全体を整数に（Python `int(md5(s).hexdigest(), 16)` と同値）。 */
const md5Int = (s: string): bigint => BigInt("0x" + md5Hex(s));
const dist = (a: string, b: string): number => Math.hypot(POS[a]![0] - POS[b]![0], POS[a]![1] - POS[b]![1]);
const clampv = (v: number): number => Math.max(1, Math.min(127, pyRound(v)));
const clampf = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** 意図つまみの実測安全域（でたらめ防止）。gamma / c_miss はつまみにしない（実測で死ぬ）。 */
export const DEPTH_LO = -0.30, DEPTH_HI = 0.80;
export const DENS_LO = 0.0, DENS_HI = 1.8;
export const CRES_LO = 0.0, CRES_HI = 1.0;
export const TAIL_LO = 0.0, TAIL_HI = 1.0;

// ===========================================================================
// 1.4 宣言された音楽的意図（これは物理ではない＝正直に名前を分ける）
// ===========================================================================
// アークは1本だけ。intensity で分岐するのは depth ほか5値のみ＝型ごとの形の表は持たない。
interface Intent { depth: number; gamma: number; c_miss: number; c_add: number; dense: number }
const INTENT: Record<string, Intent> = {
  subtle: { depth: 0.10, gamma: 0.5, c_miss: 3.0, c_add: 3.0, dense: 0.0 },
  flashy: { depth: 0.35, gamma: 1.2, c_miss: 0.6, c_add: 0.6, dense: 0.9 },
};
const INTENT_DEFAULT: Intent = { depth: 0.22, gamma: 0.85, c_miss: 1.6, c_add: 1.6, dense: 0.4 };
const intentOf = (intensity: string): Intent => INTENT[intensity] ?? INTENT_DEFAULT;

/** h(t) = H_snare − depth·(t/T)^1.2 ＝フィルのただ1本の下降ジェスチャ。 */
const arcHeight = (frac: number, depth: number): number => H["snare"]! - depth * Math.pow(frac, 1.2);
/** E(t) ＝INTENSITY の vlo/vhi/curve を再利用したクレッシェンド。 */
const energy = (frac: number, cfg: IntensityCfg): number => cfg.vlo + (cfg.vhi - cfg.vlo) * Math.pow(frac, cfg.curve);

// ===========================================================================
// GMD prior（order-0 のカーブと率だけ・n-gram は持たない）
// ===========================================================================
/** 実ドラマー1人ぶんの order-0 テクスチャ表（統計のみ）。 */
export interface GmdPrior {
  vel_curve: number[];
  density_curve: number[];
  flam_rate: number;
  ghost_kick_per_qb: number;
  ghost_kick_vel: number;
  pedal_hh_per_qb: number;
  pedal_hh_vel: number;
}
/** CC BY 4.0 の表示義務。統計の出所として製品のクレジットに出す。 */
export const GMD_ATTRIBUTION = "Groove MIDI Dataset by Google Magenta, CC BY 4.0";

/** 打圧クレッシェンド：実測の打圧輪郭を、その intensity の天井へ正規化して使う。 */
function priorVel(frac: number, cfg: IntensityCfg, prior: GmdPrior): number {
  const vc = prior.vel_curve;
  const k = Math.min(vc.length - 1, Math.floor(frac * vc.length));
  const peak = Math.max(...vc) || 1.0;
  return cfg.vhi * (vc[k]! / peak);
}
/** 実測の密度シェア（平均1に正規化）。実際のロックのフィルはほぼ平ら＝着地手前に16分を積まない。 */
function priorDensity(frac: number, prior: GmdPrior): number {
  const dc = prior.density_curve;
  const k = Math.min(dc.length - 1, Math.floor(frac * dc.length));
  return dc[k]! * dc.length;
}

// ===========================================================================
// 骨の投影＝譜面自身のリズムを引用する
// ===========================================================================
/** span のスロットごとの、譜面リズムの引用。 */
export interface BodySkeleton { onset: boolean[]; accent: boolean[]; kick: boolean[] }
/** 1小節ぶんの譜面（step は 0.25qb 定規＝スロットと同じ物差し）。 */
export interface BodyRhythmSpec { grid: number; onsets: number[]; accents?: number[]; kick?: number[] }

/** 譜面1小節を span のスロットへ写す。sheet step と slot は同じ定規なので写像は恒等。 */
export function skeletonFromSpec(rhythm: BodyRhythmSpec, meter: FillMeter, bar: number, startQb: number, nSlots: number): BodySkeleton {
  const grid = rhythm.grid || Math.round(meter.qbeatsPerBar / SUB);
  const startStep = Math.round((startQb - bar * meter.qbeatsPerBar) / SUB);
  const onsetSteps = new Set(rhythm.onsets ?? []);
  const accentSteps = new Set(rhythm.accents ?? []);
  const kickSteps = new Set(rhythm.kick ?? []);
  const onset: boolean[] = [], accent: boolean[] = [], kick: boolean[] = [];
  for (let i = 0; i < nSlots; i++) {
    const st = ((startStep + i) % grid + grid) % grid;
    onset.push(onsetSteps.has(st));
    accent.push(accentSteps.has(st));
    kick.push(kickSteps.has(st));
  }
  return { onset, accent, kick };
}

// ===========================================================================
// 1.2/1.3 境界条件つきのビーム DP（スロット単位）
// ===========================================================================
interface Hand { pos: string; lastSlot: number; run: number }
type Hit = [slot: number, drum: string, hand: string, isBounceChild: boolean];
interface Path {
  cost: number;
  handR: Hand; handL: Hand;
  hits: Hit[];
  lastbi: [string, string] | null;
  lastHand: string | null;
  streak: number;
}
const cloneHand = (h: Hand): Hand => ({ pos: h.pos, lastSlot: h.lastSlot, run: h.run });
const pathKey = (p: Path): string => p.hits.map(([s, d, h, b]) => `${s}:${d}:${h}:${b ? 1 : 0}`).join("|");

/** 片手のレート法則。隣接スロット（lag==1）の連打は3打まで＆RATE_BURST 以下。 */
function rateOk(hand: Hand, slot: number, slotS: number): [boolean, number] {
  if (hand.lastSlot < 0) return [true, 1];
  const lag = slot - hand.lastSlot;
  if (lag <= 0) return [false, hand.run];
  if (lag === 1) {
    const rate = 1.0 / slotS;
    if (rate > RATE_BURST || hand.run >= 3) return [false, hand.run];
    return [true, hand.run + 1];
  }
  return [true, 1];
}
function moveSpeed(hand: Hand, drum: string, slot: number, slotS: number): number {
  if (hand.lastSlot < 0) return 0.0; // グルーヴから来る＝時間はたっぷりある
  return dist(hand.pos, drum) / ((slot - hand.lastSlot) * slotS);
}

export interface BodyTrace {
  nSlots: number; nHits: number; candidates: number; bestCost: number;
  drumSeq: string[]; handSeq: string[]; nBounces: number;
  slotMs: number; bouncePlayable: boolean; prior: boolean;
  nFlams: number; nGhostKick: number; nPedalHh: number;
}

/**
 * span を解く。返りは (絶対qb の events, 対応する手, trace)。
 * 実行可能性の補題（§1.3）：REST は常に合法で手を自由に動かせる＝経路は必ず存在する
 * ＝DP は失敗しない＝スキャフォールドの着地は常に正直。
 */
export function planEvents(
  startQb: number, nSlots: number, skel: BodySkeleton, cfg: IntensityCfg, intent: Intent,
  tempo: number, seedSalt: number, habit: Map<string, number> | null,
  prior: GmdPrior | null, tailAnchor: number,
): { events: FillEvent[]; hands: string[]; trace: BodyTrace } {
  const beatDur = 60.0 / tempo;
  const slotS = SUB * beatDur;
  const bounceS = BOUNCE_QB * beatDur;
  const bouncePlayable = BOUNCE_LO_S <= bounceS && bounceS <= BOUNCE_HI_S;

  const { depth, gamma, c_miss: cMiss, c_add: cAdd, dense } = intent;

  // 境界条件（§1.3）：グルーヴは右手をハットに、左手をスネアに置いて去る。
  const init: Path = {
    cost: 0,
    handR: { pos: "chh", lastSlot: -BIG, run: 0 },
    handL: { pos: "snare", lastSlot: -BIG, run: 0 },
    hits: [], lastbi: null, lastHand: null, streak: 0,
  };
  let beam: Path[] = [init];

  for (let i = 0; i < nSlots; i++) {
    const frac = nSlots ? i / nSlots : 1.0;
    const hT = arcHeight(frac, depth);
    const isOn = skel.onset[i]!;
    const isAc = skel.accent[i]!;
    const cand: Path[] = [];

    for (const p of beam) {
      // ---- 行動A：休む（常に合法） ----
      cand.push({
        cost: p.cost + qi(isOn ? cMiss : 0.0), // グルーヴの onset を飛ばすのはコスト
        handR: cloneHand(p.handR), handL: cloneHand(p.handL),
        hits: p.hits, lastbi: p.lastbi, lastHand: p.lastHand, streak: p.streak,
      });

      // ---- 行動B：片手が1つの打面を叩く（＋任意でバウンス） ----
      for (const [hlabel, hand, other] of [["R", p.handR, p.handL], ["L", p.handL, p.handR]] as const) {
        const [okRate, newRun] = rateOk(hand, i, slotS);
        if (!okRate) continue;
        // スティッキング：同じ手の3連続は無し。直前と同じ手はダブルまで。
        let newStreak: number;
        if (p.lastHand === hlabel) {
          if (p.streak >= 2) continue;
          newStreak = p.streak + 1;
        } else newStreak = 1;

        for (const drum of HAND_DRUMS) {
          const speed = moveSpeed(hand, drum, i, slotS);
          if (speed > V_MAX) continue; // 物理的に届かない＝禁止
          let c = 0.0;
          if (!isOn) {
            if (prior !== null) {
              // GMD：骨から外れた追加打は**実測の（平らな）密度カーブ**に沿う
              // ＝着地手前に16分を積み上げない。
              c += cAdd * (1.6 - 0.6 * priorDensity(frac, prior));
            } else {
              // 骨外の密度：C_add(t) は着地に向けて減衰＝flashy は crash へ16分化し、
              // subtle（dense=0）はグルーヴの疎な言い換えに留まる。
              c += cAdd * (1.0 - 0.85 * frac) - dense * (frac ** 2) * 1.2;
            }
          }
          c += 0.15 * Math.max(0.0, speed - V_COMFORT); // 楽な速度の超過分
          const g = gamma * (isAc ? 2.0 : 1.0);
          c += g * Math.abs(H[drum]! - hT); // 下降アークの引力
          // 利き手のリード：右手がアクセントと山場を持つ＝R の平均打圧 > L。
          if (hlabel === "L") {
            if (isAc) c += 0.10;
            c += 0.12 * frac; // 山場が近いほど左手は高くつく
          }
          // クロスオーバー罰（右手が左手より左に来る）
          const nxR = hlabel === "R" ? drum : other.pos;
          const nxL = hlabel === "L" ? drum : other.pos;
          if (POS[nxR]![0] < POS[nxL]![0] - 1e-9) c += 0.25;
          // 癖の割引：同じ (打面,手) の連なりは安くなる＝この build の中でモチーフが再帰する
          const bi: [string, string] = [drum, hlabel];
          if (habit && p.lastbi !== null) {
            const cnt = habit.get(`${p.lastbi[0]},${p.lastbi[1]}|${drum},${hlabel}`) ?? 0;
            if (cnt) c -= Math.min(0.20, 0.08 * cnt) * (0.3 + g * Math.abs(H[drum]! - hT));
          }
          const nh: Hand = { pos: drum, lastSlot: i, run: newRun };
          const nR = hlabel === "R" ? nh : cloneHand(other);
          const nL = hlabel === "L" ? nh : cloneHand(other);
          const hits2: Hit[] = [...p.hits, [i, drum, hlabel, false]];
          const baseCost = p.cost + qi(c);
          cand.push({ cost: baseCost, handR: nR, handL: nL, hits: hits2, lastbi: bi, lastHand: hlabel, streak: newStreak });

          // ---- 任意：フラム/ユニゾン（prior 経路のみ） ----
          // 両手が同じスロットを叩く。DP は1スロット1行動なのでこの枝が無いと作れない。
          // スロットごとの md5 ゲートが頻度を**実測の flam_rate** に結びつける（決定論）。
          const flamOk = prior !== null && (prior.flam_rate ?? 0) > 0
            && Number(md5Int(`${seedSalt}:flamgate:${i}`) % 10000n) / 10000.0 < prior.flam_rate;
          if (flamOk) {
            const [oOk, oRun] = rateOk(other, i, slotS);
            if (oOk) {
              let best: [string, number] | null = null;
              for (const d2 of HAND_DRUMS) {
                const sp2 = moveSpeed(other, d2, i, slotS);
                if (sp2 > V_MAX) continue;
                const cc = 0.15 * Math.max(0.0, sp2 - V_COMFORT) + 0.5 * g * Math.abs(H[d2]! - hT);
                if (best === null || cc < best[1]) best = [d2, cc];
              }
              if (best !== null) {
                const [d2, compCost] = best;
                const olabel = hlabel === "R" ? "L" : "R";
                const oh: Hand = { pos: d2, lastSlot: i, run: oRun };
                const fR = hlabel === "R" ? nh : oh;
                const fL = hlabel === "R" ? oh : nh;
                const cx = POS[fR.pos]![0] < POS[fL.pos]![0] - 1e-9 ? 0.25 : 0.0;
                const cFlam = c + compCost + cx - 0.10; // ゲートが率を決めた＝フラムは安く保つ
                cand.push({
                  cost: p.cost + qi(cFlam), handR: fR, handL: fL,
                  hits: [...hits2, [i, d2, olabel, false]], lastbi: bi, lastHand: hlabel, streak: 1,
                });
              }
            }
          }

          // ---- 任意：バウンスの子（実際の +1/32 スロット） ----
          // バウンスは「ダブルの2打目」なので、この打が手の切り替え（newStreak==1）のときだけ
          // 打てる。打つと手が塞がり（次スロットは休み）ダブルが閉じる。
          if (bouncePlayable && newStreak === 1 && newRun < 3) {
            // バウンスのコストはリバウンドが高いほど安い（ロールはスネアに棲む）。
            // prior 下では着地への引き込みを落とす（平らな密度＝末尾の乱打をしない＝
            // 音数でなく打圧で山場を作る）。
            let cb = prior !== null
              ? 0.35 / REBOUND[drum]!
              : 0.35 / REBOUND[drum]! - dense * (frac ** 2) * 1.0;
            // tail_anchor：末尾の連打がアークの高さから外れることに代金を払わせる紐
            // ＝忙しいフィルが「フロアタム回しのまま終わる」ようにする（既定0＝評価されない）。
            if (tailAnchor) cb += tailAnchor * Math.pow(frac, 1.2) * Math.abs(H[drum]! - hT);
            const bnh: Hand = { pos: drum, lastSlot: i, run: 3 }; // 塞がる＝次は休み
            const bR = hlabel === "R" ? bnh : cloneHand(other);
            const bL = hlabel === "L" ? bnh : cloneHand(other);
            cand.push({
              cost: baseCost + qi(cb), handR: bR, handL: bL,
              hits: [...hits2, [i, drum, hlabel, true]], lastbi: bi, lastHand: hlabel, streak: 2,
            });
          }
        }
      }
    }

    // ビームへ刈り込む＝(コスト, md5) の決定的な順序
    const keyed = cand.map((q) => ({ q, k: pathKey(q) }));
    const tie = new Map<string, string>();
    for (const { q, k } of keyed) if (!tie.has(k)) tie.set(k, md5Hex(`${seedSalt}:prune:${k}`));
    keyed.sort((a, b) => (a.q.cost - b.q.cost) || cmp(tie.get(a.k)!, tie.get(b.k)!));
    const seen = new Set<string>();
    beam = [];
    for (const { q, k } of keyed) {
      if (seen.has(k)) continue;
      seen.add(k);
      beam.push(q);
      if (beam.length >= BEAM) break;
    }
  }

  // ---- 終端コスト（§1.3）：少なくとも片手は crash に届くべき ----
  for (const p of beam) {
    const reach = Math.min(dist(p.handR.pos, "crash"), dist(p.handL.pos, "crash")) / slotS;
    if (reach > V_MAX) p.cost += qi(0.2 * (reach - V_MAX));
  }
  {
    const keyed = beam.map((q) => ({ q, k: pathKey(q) }));
    const tie = new Map<string, string>();
    for (const { q, k } of keyed) if (!tie.has(k)) tie.set(k, md5Hex(`${seedSalt}:final:${k}`));
    keyed.sort((a, b) => (a.q.cost - b.q.cost) || cmp(tie.get(a.k)!, tie.get(b.k)!));
    beam = keyed.map((x) => x.q);
  }

  // ---- k-best ＋ 決定的な抽選（§1.3） ----
  const c0 = beam[0]!.cost;
  // 最適の110%帯。ただし温度1単位ぶんの**絶対下限**を置く：整数マイクロ単位のコスト
  // （と癖割引で0近傍/負になる c0）では素の百分率が潰れて抽選が飢える（§7.iii）。
  const ceil = c0 + Math.max(Math.trunc(0.12 * Math.abs(c0)), T_LOTTERY);
  const pool: Path[] = [];
  {
    const seen = new Set<string>();
    for (const q of beam) {
      if (q.cost > ceil) break;
      const k = pathKey(q);
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(q);
      if (pool.length >= KBEST) break;
    }
  }
  const weights = pool.map((q) => Math.max(1, pyRound(Math.exp(-(q.cost - c0) / T_LOTTERY) * 1_000_000)));
  const total = weights.reduce((a, b) => a + b, 0);
  const draw = Number(md5Int(`${seedSalt}:lottery`) % BigInt(total));
  let acc = 0, chosen = pool[0]!;
  for (let j = 0; j < pool.length; j++) {
    acc += weights[j]!;
    if (draw < acc) { chosen = pool[j]!; break; }
  }

  // ---- 選ばれた経路を Event と手の列へ実体化 ----
  const events: FillEvent[] = [];
  const hands: string[] = [];
  const parentVel = new Map<string, number>();
  const graceQb = FLAM_GRACE_S / beatDur;
  // 子でない手打ちが2つ乗っているスロット＝フラム（prior 経路だけが作れる）。
  // 左手の打を、少し弱く・少し遅い装飾音として実体化する。
  const slotHands = new Map<number, string[]>();
  for (const [slot, , hl, isChild] of chosen.hits) {
    if (!isChild) slotHands.set(slot, [...(slotHands.get(slot) ?? []), hl]);
  }
  for (const [slot, drum, hlabel, isChild] of chosen.hits) {
    const frac = nSlots ? slot / nSlots : 1.0;
    const base = (prior !== null ? priorVel(frac, cfg, prior) : energy(frac, cfg)) + HAND_VEL[hlabel]!;
    const isFlamGrace = prior !== null && !isChild && (slotHands.get(slot)?.length ?? 0) >= 2 && hlabel === "L";
    let vel: number, off: number;
    if (isChild) {
      const pv = parentVel.get(`${slot}:${drum}:${hlabel}`) ?? base;
      vel = clampv(pv - 12.0 * (1.0 / REBOUND[drum]!));
      off = slot * SUB + BOUNCE_QB;
    } else if (isFlamGrace) {
      vel = clampv(base - 15);
      off = slot * SUB + graceQb;
    } else {
      vel = clampv(base);
      parentVel.set(`${slot}:${drum}:${hlabel}`, vel);
      off = slot * SUB;
    }
    events.push({ beat: round6(startQb + off), voice: drum as DrumVoice, velocity: vel });
    hands.push(hlabel);
  }

  // ---- 足のアンカー：骨の構造キックの位置にキック ----
  const kickSlots = new Set<number>();
  for (let i = 0; i < nSlots; i++) {
    if (!skel.kick[i]) continue;
    kickSlots.add(i);
    const frac = nSlots ? i / nSlots : 1.0;
    const baseKv = prior !== null ? priorVel(frac, cfg, prior) : energy(frac, cfg);
    events.push({ beat: round6(startQb + i * SUB), voice: "kick", velocity: clampv(baseKv - 10) });
    hands.push("F");
  }

  // ---- GMD 足ゴースト層（prior のみ）：実測の率で静かなキックとペダルハット。
  //      スロットごとの md5 抽選（RNG 不使用）。ゴーストキックは構造キックの位置を避ける
  //      （右足を二度使わない）。ペダルハットは空いている左足＝何とも衝突しない。 ----
  if (prior !== null) {
    const gkP = Math.min(GHOST_CAP, (prior.ghost_kick_per_qb ?? 0) * SUB);
    const phP = Math.min(GHOST_CAP, (prior.pedal_hh_per_qb ?? 0) * SUB);
    const gkVel = pyRound(prior.ghost_kick_vel ?? 45.0);
    const phVel = pyRound(prior.pedal_hh_vel ?? 40.0);
    for (let i = 0; i < nSlots; i++) {
      const off = i * SUB;
      if (!kickSlots.has(i)) {
        const d = Number(md5Int(`${seedSalt}:gkick:${i}`) % 10000n) / 10000.0;
        if (d < gkP) { events.push({ beat: round6(startQb + off), voice: "kick", velocity: clampv(gkVel) }); hands.push("F"); }
      }
      const d2 = Number(md5Int(`${seedSalt}:phh:${i}`) % 10000n) / 10000.0;
      if (d2 < phP) { events.push({ beat: round6(startQb + off), voice: "phh", velocity: clampv(phVel) }); hands.push("F"); }
    }
  }

  // ---- 癖の更新（この build の中でモチーフが再帰する） ----
  if (habit) {
    const seq = chosen.hits.filter(([, , , child]) => !child).map(([, d, h]) => `${d},${h}`);
    for (let j = 0; j + 1 < seq.length; j++) {
      const k = `${seq[j]}|${seq[j + 1]}`;
      habit.set(k, (habit.get(k) ?? 0) + 1);
    }
  }

  // 安定した並び（beat, voice）
  const order = events.map((_, j) => j).sort((a, b) =>
    (events[a]!.beat - events[b]!.beat) || cmp(events[a]!.voice, events[b]!.voice));
  const evSorted = order.map((j) => events[j]!);
  const handsSorted = order.map((j) => hands[j]!);

  let nFlams = 0;
  for (const hl of slotHands.values()) if (hl.length >= 2) nFlams++;
  const kickBeats = new Set([...kickSlots].map((i) => round6(startQb + i * SUB)));
  const trace: BodyTrace = {
    nSlots, nHits: chosen.hits.length, candidates: pool.length, bestCost: c0,
    drumSeq: chosen.hits.filter(([, , , c]) => !c).map(([, d]) => d),
    handSeq: chosen.hits.filter(([, , , c]) => !c).map(([, , h]) => h),
    nBounces: chosen.hits.filter(([, , , c]) => c).length,
    slotMs: pyRound(slotS * 1000 * 100) / 100, bouncePlayable, prior: prior !== null, nFlams,
    nGhostKick: evSorted.filter((e) => e.voice === "kick" && !kickBeats.has(e.beat)).length,
    nPedalHh: evSorted.filter((e) => e.voice === "phh").length,
  };
  return { events: evSorted, hands: handsSorted, trace };
}

/** Python の文字列比較（コードポイント順）。hex/ASCII なので UTF-16 比較と一致する。 */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ===========================================================================
// 入口：fills.place_fill と同じ形（FillPlacement を返す）
// ===========================================================================
export interface BodyFillPlacement {
  kind: "body"; intensity: string; bar: number; beat: number; meter: FillMeter;
  startQb: number; lengthQb: number; landingQb: number;
  events: FillEvent[]; landing: FillEvent[];
  hands: string[]; trace: BodyTrace;
}

export interface BodyFillOpts {
  rhythm: BodyRhythmSpec; bar: number; beat: number; length: number | string;
  intensity: string; meter: FillMeter; tempo: number; seedSalt: number;
  habit?: Map<string, number> | null; resolve?: boolean; prior?: GmdPrior | null;
  /** 行き先＝アークの到達点 [-0.30, 0.80]。負は crash へ**上る**タム回し。 */
  depth?: number;
  /** 忙しさ＝骨外/ロールの量 [0.0, 1.8]。0 はグルーヴの疎な木霊、1.8 は16分の乱舞。 */
  density?: number;
  /** 0..1 ＝ダイナミクスの掘り下げ（弱く始めて着地へ急に立ち上げる）。 */
  crescendo?: number;
  /** 0..1 ＝末尾の連打をスネアの引力に潰させず、行き先のタムに留める紐。 */
  tailAnchor?: number;
}

/**
 * 身体生成版の `placeFill`。契約（bar/beat/length/intensity/meter/resolve）も返り値も同じなので、
 * 着地・四肢検証・apply 側はそのまま再利用できる。kind は "body"。
 * 意図つまみは全て既定 undefined＝プリセットとバイト一致（形の辞書は増えない＝毎回 DP が解く）。
 */
export function planBodyFill(o: BodyFillOpts): BodyFillPlacement {
  if (!(o.intensity in INTENSITY)) throw new Error(`unknown intensity ${o.intensity}`);
  // 共有プリセットは**必ずコピーしてから**上書きする（参照を書き換えると以降の build が壊れる）。
  const cfg: IntensityCfg = { ...INTENSITY[o.intensity]! };
  const intent: Intent = { ...intentOf(o.intensity) };
  if (o.depth !== undefined) intent.depth = clampf(o.depth, DEPTH_LO, DEPTH_HI);
  if (o.density !== undefined) intent.dense = clampf(o.density, DENS_LO, DENS_HI);
  if (o.crescendo !== undefined) {
    // ダイナミクスの色付け：クレッシェンドが深いほど弱く始まり、着地へ急に立ち上がる
    // （curve<1 は遅く上がる）。vhi と着地は触らない＝天井は intensity のもの。
    const cres = clampf(o.crescendo, CRES_LO, CRES_HI);
    cfg.vlo = clampf(cfg.vlo - 30.0 * cres, 1.0, cfg.vhi - 1.0);
    cfg.curve = clampf(cfg.curve * (1.0 + 0.6 * cres), 0.4, 2.5);
  }
  const tailAnchor = clampf(o.tailAnchor ?? 0.0, TAIL_LO, TAIL_HI);

  const units = typeof o.length === "string" ? o.meter.lengthUnits(o.length) : Number(o.length);
  if (!Number.isFinite(units) || units <= 0) throw new Error(`numeric length must be > 0, got ${o.length}`);
  const lengthQb = units * o.meter.qbPerUnit;
  const startQb = o.meter.toQb(o.bar, o.beat);
  const landingQb = startQb + lengthQb;
  const nSlots = Math.max(1, Math.round(lengthQb / SUB));

  const skel = skeletonFromSpec(o.rhythm, o.meter, o.bar, startQb, nSlots);
  const { events, hands, trace } = planEvents(
    startQb, nSlots, skel, cfg, intent, o.tempo, o.seedSalt, o.habit ?? null, o.prior ?? null, tailAnchor);

  const landing: FillEvent[] = (o.resolve ?? true)
    ? [{ beat: round6(landingQb), voice: "crash", velocity: cfg.land_crash },
       { beat: round6(landingQb), voice: "kick", velocity: cfg.land_kick }]
    : [];

  return {
    kind: "body", intensity: o.intensity, bar: o.bar, beat: o.beat, meter: o.meter,
    startQb: round6(startQb), lengthQb: round6(lengthQb), landingQb: round6(landingQb),
    events, landing, hands, trace,
  };
}
