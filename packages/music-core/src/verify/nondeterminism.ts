// 決定論の番人（M4 Scope 5）＝新コードに非決定な呼び出しを混ぜない。
// 計画 §6-3：JS には PYTHONHASHSEED の対応物が無いので「別プロセス決定論」の代わりに
// **禁止呼び出しの走査**を置く（現状 music-core/src は 0 件＝これを維持する番人）。
// 乱数は mulberry32＋ソルト表（rngSalt.ts）・md5 整数（bodyFill.ts）＝seed から再現できるものだけ。
//
// 実装上の注意：**この番人が自分自身を引っかけない**よう、禁止語は断片の連結で組み立てる
// （このファイルのどこにも禁止語の生の綴りは現れない）。

import { coverageOf, gate, type GateVerdict } from "./types";

export const SRC_GREP_GATE = "計画 §6-3（ゴールデン回帰・bit 一致）／§5-2 M4 Scope";

export interface NondeterminismRule {
  readonly id: string;
  readonly re: RegExp;
  readonly why: string;
}

const rule = (a: string, b: string, id: string, why: string): NondeterminismRule => ({ id, re: new RegExp(a + b, "g"), why });

/** 禁止する呼び出し（seed から再現できない＝bit 一致・ゴールデン回帰を壊す）。 */
export const NONDETERMINISM_RULES: readonly NondeterminismRule[] = [
  rule("Math\\.", "random", "math-random", "seed から再現できない乱数（代わりに rngSalt の mulberry32）"),
  rule("Date\\.", "now", "date-now", "実行時刻が出力に混ざる"),
  rule("new ", "Date", "new-date", "実行時刻が出力に混ざる"),
  rule("crypto", "\\.", "crypto", "暗号乱数・UUID は再現不能"),
];

export interface NondeterminismHit {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
}

export interface ScannedFile { readonly path: string; readonly text: string }

/** ソース群を走査して禁止呼び出しを拾う（純関数＝fs には触らない。fs 側はテストが担う）。 */
export function findNondeterminism(files: readonly ScannedFile[]): NondeterminismHit[] {
  const hits: NondeterminismHit[] = [];
  for (const f of files) {
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]!;
      for (const r of NONDETERMINISM_RULES) {
        r.re.lastIndex = 0;
        if (r.re.test(text)) hits.push({ file: f.path, line: i + 1, rule: r.id, text: text.trim() });
      }
    }
  }
  return hits;
}

/** ゲート＝1件でもあれば赤。被覆率＝中身のあるファイル数／渡されたファイル数（空振り防止）。 */
export function nondeterminismGate(files: readonly ScannedFile[], id = "determinism.grep"): GateVerdict<NondeterminismHit[]> {
  const hits = findNondeterminism(files);
  const applied = files.filter((f) => f.text.length > 0).length;
  return gate(id, hits.length === 0, coverageOf(applied, files.length), SRC_GREP_GATE,
    hits.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text}`), hits);
}
