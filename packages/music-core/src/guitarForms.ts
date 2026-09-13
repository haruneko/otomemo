// 5d フォーム DB（M5）＝phrase_maker `experiments/guitar/gen2/handshape.py:37-230` の**導出規則だけ**の移植。
// 正典＝計画 §4-5「`Tuning` からフォーム DB を導出・B弦 +3 補正」・§5-2 M5 Scope 5d。
//
// 何を解いているか：「手の形（フォーム）」が盤に載るかを**調弦から導く**（表を手書きしない）。
//   - POWER2（R+5）＝ルート弦と次の弦が完全4度（5半音）なら次の弦の +2 フレット
//   - POWER3（R+5+8）＝続く2本とも完全4度
//   - OCTAVE（R+8）＝2本上の弦で +2（開放差10）／**+3（開放差9＝標準調弦の G–B 間の長3度）**＝B弦補正はここ1箇所
//   - GAIN_SAFE_INTERVALS＝歪ませたとき同時に鳴らしてよい音程 {0,7,12}（フォーム追加の唯一の入口）
// 調弦（`Tuning`）は M3-3e の `verify/fretboard.ts` と**同じ型**＝4弦ベース・6弦・7弦・drop-D が同じ規則で動く。
//
// **重み・移動時間の定数はここに無い**（5e＝枠のみ・移植しない）。ここは盤の幾何＝耳の調律を含まない。
// 参照値＝`tools/py-parity/cases-guitar/forms.json`（4調弦×5フォーム）。

import type { Tuning } from "./verify/fretboard";

export type GtrForm = "mono" | "open" | "power2" | "power3" | "octave";
/** 源流の FORM 番号順（HandShape の並び順＝決定論の走査順） */
export const GTR_FORMS: readonly GtrForm[] = ["mono", "open", "power2", "power3", "octave"];
export const GTR_FORM_OFFSETS: Readonly<Record<GtrForm, readonly number[]>> = {
  mono: [0], open: [0], power2: [0, 7], power3: [0, 7, 12], octave: [0, 12],
};
/** 歪み量ゲート（`handshape.py:75`）。 */
export const GAIN_SAFE_INTERVALS: ReadonlySet<number> = new Set([0, 7, 12]);
/** 探索帯（ロックのリフの帯・`handshape.py:85`）＝幾何の帯であって重みではない。 */
export const GTR_FRET_SEARCH_MAX = 15;
/** FORM_OPEN の待機フレット候補（`handshape.py:87`）。 */
export const GTR_PARK_FRETS: readonly number[] = Array.from({ length: 13 }, (_, i) => i);
export const GTR_FORMS_SOURCE = "phrase_maker experiments/guitar/gen2/handshape.py:37-230";

export function formGainOk(form: GtrForm, gain: "high" | "clean" = "high"): boolean {
  if (gain !== "high") return true;
  return GTR_FORM_OFFSETS[form].every((o) => GAIN_SAFE_INTERVALS.has(o));
}

export interface HandShape { readonly form: GtrForm; readonly string: number; readonly fret: number }

export function tuningIntervals(t: Pick<Tuning, "openMidi">): number[] {
  const om = t.openMidi;
  return om.slice(0, -1).map((m, s) => om[s + 1]! - m);
}

/** オクターブ形の2本上の弦での補正フレット（開放差 10→+2／9→+3＝B弦補正）。載らなければ null。 */
export function octaveCorr(t: Pick<Tuning, "openMidi">, s: number): number | null {
  const om = t.openMidi;
  if (s + 2 >= om.length) return null;
  const d = om[s + 2]! - om[s]!;
  return d === 10 ? 2 : d === 9 ? 3 : null;
}

/** そのフォームが成立するルート弦（`valid_root_strings`）。 */
export function validRootStrings(form: GtrForm, t: Pick<Tuning, "openMidi">): number[] {
  const n = t.openMidi.length;
  const iv = tuningIntervals(t);
  const all = Array.from({ length: n }, (_, s) => s);
  if (form === "mono" || form === "open") return all;
  if (form === "power2") return all.filter((s) => s < n - 1 && iv[s] === 5);
  if (form === "power3") return all.filter((s) => s < n - 2 && iv[s] === 5 && iv[s + 1] === 5);
  return all.filter((s) => s < n - 2 && octaveCorr(t, s) !== null);
}

/** そのフォームが鳴らす (弦, フレット)。盤の構造が許さなければ null（`shape_placements`）。 */
export function shapePlacements(sh: HandShape, t: Pick<Tuning, "openMidi">): [number, number][] | null {
  const n = t.openMidi.length;
  const { string: s, fret: f } = sh;
  if (s < 0 || s >= n) return null;
  if (sh.form === "open") return GTR_PARK_FRETS.includes(f) ? [[s, 0]] : null;
  if (sh.form === "mono") return f >= 1 ? [[s, f]] : null;
  if (f < 0) return null;
  const iv = tuningIntervals(t);
  if (sh.form === "power2") return s + 1 < n && iv[s] === 5 ? [[s, f], [s + 1, f + 2]] : null;
  if (sh.form === "power3") return s + 2 < n && iv[s] === 5 && iv[s + 1] === 5 ? [[s, f], [s + 1, f + 2], [s + 2, f + 2]] : null;
  const corr = octaveCorr(t, s);
  return corr === null ? null : [[s, f], [s + 2, f + corr]];
}

export function formFits(sh: HandShape, t: Pick<Tuning, "openMidi">, fretMax = GTR_FRET_SEARCH_MAX): boolean {
  const pl = shapePlacements(sh, t);
  return pl !== null && pl.every(([s, f]) => s >= 0 && s < t.openMidi.length && f >= 0 && f <= fretMax);
}

/** 盤に載る全 HandShape（弦→フレット昇順＝決定論）。載らない形は**列挙されない**（事後 reject しない）。 */
export function enumerateShapes(form: GtrForm, t: Pick<Tuning, "openMidi">, fretMax = GTR_FRET_SEARCH_MAX): HandShape[] {
  const out: HandShape[] = [];
  for (const s of validRootStrings(form, t)) {
    const frets = form === "open" ? GTR_PARK_FRETS : form === "mono" ? Array.from({ length: fretMax }, (_, i) => i + 1) : Array.from({ length: fretMax + 1 }, (_, i) => i);
    for (const f of frets) {
      const sh: HandShape = { form, string: s, fret: f };
      if (formFits(sh, t, fretMax)) out.push(sh);
    }
  }
  return out;
}

/** フォームを盤に射影した音高（**音高はここで初めて生まれる**）。 */
export function shapePitches(sh: HandShape, t: Pick<Tuning, "openMidi">): number[] {
  const pl = shapePlacements(sh, t);
  if (pl === null) throw new Error(`shape does not fit the fretboard: ${JSON.stringify(sh)}`);
  return pl.map(([s, f]) => t.openMidi[s]! + f);
}

export function usesOpenString(sh: HandShape, t: Pick<Tuning, "openMidi">): boolean {
  const pl = shapePlacements(sh, t);
  return pl !== null && pl.some(([, f]) => f === 0);
}
