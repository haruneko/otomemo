// ピアノ伴奏（phrase_maker 試作 #1 取り込み S2）＝フレーズの強弱の山 e(t)（phrase_maker `experiments/piano/fingersim/phrase_arc.py` の忠実移植）。
//
// 位置づけ＝生成器（handFrame.ts）の既定 OFF の分岐が読むだけ（試作 #1 は使っていない・設計書 §2-3「弧」）。
// e(t) はフレーズ内の位置だけの純関数で、音高を選ばない。
// 注意：math.cos は Math.cos で写した（glibc と最後の桁が違いうる・この分岐は Python との一致を要求しない＝設計書 §5 S2 (iv)）。

export interface PhraseSpec {
  phraseLenBars: number;
  peakTaus: readonly number[];
  cadenceTau: number | null;
  eFloor: number;
  eCad: number;
  kLambdaSkip: number;
  kDyad: number;
  kGrabw: number;
  kVel: number;
  kMotif: number;
  kReg: number;
  regRange: number;
  regOctaves: number;
  spanStretchThresh: number;
}

/** 源流 PhraseSpec の既定値。 */
export const DEFAULT_PHRASE_SPEC: Readonly<PhraseSpec> = Object.freeze({
  phraseLenBars: 8,
  peakTaus: [0.7],
  cadenceTau: 0.85,
  eFloor: 0.35,
  eCad: 0.2,
  kLambdaSkip: 1.0,
  kDyad: 0.6,
  kGrabw: 0.5,
  kVel: 14.0,
  kMotif: 0.0,
  kReg: 0.0,
  regRange: 12.0,
  regOctaves: 3,
  spanStretchThresh: 0.8,
});

export const phraseSpec = (over: Partial<PhraseSpec> = {}): PhraseSpec => ({ ...DEFAULT_PHRASE_SPEC, ...over });

function bump(tau: number, peaks: readonly number[]): number {
  const ps = [...peaks].sort((a, b) => a - b);
  let best = 0.0;
  for (let i = 0; i < ps.length; i++) {
    const pk = ps[i]!;
    const left = i > 0 ? ps[i - 1]! : 0.0;
    const right = i + 1 < ps.length ? ps[i + 1]! : 1.0;
    let v: number;
    if (tau <= pk) {
      const w = pk - left;
      v = w <= 1e-9 ? 0.0 : 0.5 * (1.0 - Math.cos((Math.PI * (tau - left)) / w));
    } else {
      const w = right - pk;
      v = w <= 1e-9 ? 0.0 : 0.5 * (1.0 + Math.cos((Math.PI * (tau - pk)) / w));
    }
    if (v > best) best = v;
  }
  return best;
}

function cadenceGate(tau: number, cad: number | null, eCad: number): number {
  if (cad == null || cad >= 1.0 || tau <= cad) return 1.0;
  const x = (tau - cad) / (1.0 - cad);
  return eCad + (1.0 - eCad) * 0.5 * (1.0 + Math.cos(Math.PI * x));
}

export function energyAt(tau0: number, arc: PhraseSpec): number {
  const tau = Math.min(Math.max(tau0, 0.0), 1.0);
  const b = bump(tau, arc.peakTaus);
  const gate = cadenceGate(tau, arc.cadenceTau, arc.eCad);
  return arc.eFloor + (1.0 - arc.eFloor) * b * gate;
}

/** 源流 phrase_energy：tau = (小節 + slot/grid) / フレーズ長。 */
export function phraseEnergy(b: number, slot: number, grid: number, arc: PhraseSpec): number {
  const tau = (b + (grid ? slot / grid : 0.0)) / arc.phraseLenBars;
  return energyAt(tau, arc);
}

/** 源流 arc_height：谷＝0・山＝1。 */
export function arcHeight(e: number, arc: PhraseSpec): number {
  const span = 1.0 - arc.eFloor;
  if (span <= 1e-9) return 0.0;
  return Math.min(1.0, Math.max(0.0, (e - arc.eFloor) / span));
}
