// 四肢（2本の手＋2本の足）衝突の検証＝**グルーヴ全体へ一般化**（M4 Scope 2）。
// 源流＝phrase_maker `experiments/drums/gen2/src/validate.py`（clean グリッド上で同時刻グループを判定）と
// `experiments/drums/gen2/src/gm.py` の LIMB 表。
// otomemo には既に `drumFill.ts` の `validateLimbs`（フィル専用・FillEvent 前提）として移植済み。
// ここではその判定本体を **voice 名と四肢だけを持つ汎用イベント**へ切り出し、フィルにも定型ビート
// （レーン＋step）にも同じ判定を当てられるようにする。drumFill 側は薄い変換を被せて本関数へ委譲する
// ＝メッセージ・丸め・グループ化を1文字も変えない（既存の出音・テストは 1bit も動かさない）。

import { coverageOf, gate, type GateVerdict } from "./types";

export const SRC_LIMB_VALIDATE = "phrase_maker experiments/drums/gen2/src/validate.py (validate/group_by_beat)";
export const SRC_LIMB_MAP = "phrase_maker experiments/drums/gen2/src/gm.py (LIMB)";

/** RF=右足（キック）・LF=左足（ペダルハット）・HAND=両手のいずれか。gm.py LIMB と同じ3値。 */
export type Limb = "RF" | "LF" | "HAND";

/** 汎用の打点イベント。at＝時刻（拍でも step でもよい・同時刻判定にしか使わない）。 */
export interface LimbEvent {
  readonly at: number;
  readonly voice: string;
  readonly limb: Limb;
}

export interface LimbResult {
  readonly ok: boolean;
  readonly problems: string[];
  readonly maxSimul: number;
}

function round4(x: number): number { return Math.round(x * 1e4) / 1e4; }

/**
 * 同時刻グループごとに「2手＋2足で弾けるか」を判定（validate.py の忠実移植・一般化）。
 * unitLabel はメッセージの時間単位名（drumFill 互換のため既定 "beat"）。
 */
export function validateLimbEvents(events: readonly LimbEvent[], eps = 1e-6, unitLabel = "beat"): LimbResult {
  const groups = new Map<number, LimbEvent[]>();
  for (const e of events) {
    const key = Math.round(e.at / eps) * eps;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const problems: string[] = [];
  let maxSimul = 0;
  for (const at of keys) {
    const grp = groups.get(at)!;
    const voices = grp.map((e) => e.voice);
    const rf = grp.filter((e) => e.limb === "RF").length;
    const lf = grp.filter((e) => e.limb === "LF").length;
    const hand = grp.filter((e) => e.limb === "HAND").length;
    const total = grp.length;
    maxSimul = Math.max(maxSimul, total);
    const b = round4(at);
    if (total > 4) problems.push(`${unitLabel} ${b}: ${total} simultaneous voices > 4 (${voices.join(",")})`);
    if (rf > 1) problems.push(`${unitLabel} ${b}: ${rf} kick voices (need 1 right foot) ${voices.join(",")}`);
    if (lf > 1) problems.push(`${unitLabel} ${b}: ${lf} pedal-hat voices (need 1 left foot) ${voices.join(",")}`);
    if (hand > 2) problems.push(`${unitLabel} ${b}: ${hand} hand voices > 2 hands ${voices.join(",")}`);
    if (new Set(voices).size !== voices.length) problems.push(`${unitLabel} ${b}: duplicate voice at same instant ${voices.join(",")}`);
  }
  return { ok: problems.length === 0, problems, maxSimul };
}

/**
 * GM ドラム番号→四肢。gm.py の LIMB は voice 名の表なので、**番号でしか分からない経路**
 * （定型ビート辞書のレーンは GM 番号で持つ）へ広げるための最小の一般化：
 *   35/36（バスドラム）→RF・44（ペダルハイハット）→LF・それ以外→HAND。
 * gm.py に載っている番号（36=kick・44=phh・他）とは一致する＝表を作り替えていない。
 */
export function limbOfGmNote(midi: number): Limb {
  if (midi === 35 || midi === 36) return "RF";
  if (midi === 44) return "LF";
  return "HAND";
}

/** 定型ビート／フィルのレーン（drumLibrary の OutLane と同形の最小部分）。 */
export interface GrooveLane {
  readonly name: string;
  readonly midi: number;
  readonly hits: readonly number[];
}

/** レーン群 → 汎用イベント列（voice＝レーン名＝ゴーストとスネアは別 voice＝gm.py と同じ扱い）。 */
export function limbEventsFromLanes(lanes: readonly GrooveLane[]): LimbEvent[] {
  const out: LimbEvent[] = [];
  for (const l of lanes) for (const h of l.hits) out.push({ at: h, voice: l.name, limb: limbOfGmNote(l.midi) });
  return out;
}

/**
 * グルーヴ全体の四肢ゲート。被覆率＝**同時打点が2つ以上ある時刻の割合**
 * ＝この検査が判定を下せた割合（単発しかないグルーヴでは 0＝合格しても何も証明していない）。
 */
export function grooveLimbGate(lanes: readonly GrooveLane[], id = "limbs.groove"): GateVerdict<LimbResult> {
  const events = limbEventsFromLanes(lanes);
  const bySlot = new Map<number, number>();
  for (const e of events) bySlot.set(e.at, (bySlot.get(e.at) ?? 0) + 1);
  let applied = 0;
  for (const n of bySlot.values()) if (n >= 2) applied++;
  const r = validateLimbEvents(events, 1e-6, "step");
  return gate(id, r.ok, coverageOf(applied, bySlot.size), `${SRC_LIMB_VALIDATE} / ${SRC_LIMB_MAP}`, r.problems, r);
}
