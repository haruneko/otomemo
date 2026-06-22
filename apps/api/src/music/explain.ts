// 連想エンジン：説明・命名。機能解析(S2)＋名前あてを束ねた「事実」を返す。"なぜ"の語りは Claude の役。
// ＝理論を覚えてなくても「これ何進行/構造」が分かる（道具が教える）。
import { type Chord } from "./theory";
import { analyzeProgression, type Mode, type Func, type CadenceType } from "./function";
import { identifyProgression } from "./identify";

export type Explanation = {
  key: number;
  mode: Mode;
  name: string | null; // 定番に十分近ければ名前、なければ null
  nameSimilarity: number;
  degrees: { roman: string; function: Func }[];
  cadence: { type: CadenceType; at: number };
};

/** コード進行の「事実」をまとめる：調・名前あて・ローマ数字/機能・終止。Claude はこれを読んで"なぜ"を語る。 */
export function explainProgression(
  chords: Chord[],
  opts: { key?: number; mode?: Mode; nameThreshold?: number } = {},
): Explanation {
  const an = analyzeProgression(chords, opts);
  const id = identifyProgression(chords, { key: an.key, mode: an.mode, top: 1 })[0];
  const threshold = opts.nameThreshold ?? 0.6;
  const name = id && id.similarity >= threshold ? id.name : null;
  return {
    key: an.key,
    mode: an.mode,
    name,
    nameSimilarity: id?.similarity ?? 0,
    degrees: an.degrees.map((d) => ({ roman: d.roman, function: d.function })),
    cadence: an.cadence,
  };
}
