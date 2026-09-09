// 検証器の型（M4・計画 §6-4「検証器の作法」#1 #3 #7 #8）。
// ここが芯＝**検査の分類を戻り値の型で強制する**。「診断のつもりがゲートになっていた」「ゲートのつもりが
// 何でも通していた」を、実行時ではなく**型と被覆率**で塞ぐ。
//
//  gate            ＝落ちたら不合格（機械が断言してよい不変条件）。
//  byConstruction  ＝生成の作りから自明に成り立つはずのもの（＝被覆率が命。効いていなければ空虚）。
//  diagnostic      ＝数値を出すだけ。**pass/ok を持たない**＝ゲートに使えない（#1「形の要求はゲートにしない」）。
//
// 型の効き方：`assertGate()` は `GateVerdict` しか受け取らない。診断を渡すと **コンパイルエラー**
// （test/verify-types.test.ts が `@ts-expect-error` で静的に担保）。DiagnosticVerdict に真偽の
// 合否フィールドを**置かない**のが仕掛け＝合否を読み出す口が無いので条件分岐に使えない。

/** 検査の3分類（§6-4 #1）。 */
export type CheckKind = "gate" | "byConstruction" | "diagnostic";

/** 被覆率＝「その検査が実際に効いた割合」（§6-4 #3 #7）。
 *  applied＝検査が実際に判定を下した対象数／total＝対象になり得た総数。
 *  total=0 も applied=0 も **空虚**（何でも通す検査）＝isVacuous が真。 */
export interface Coverage {
  readonly applied: number;
  readonly total: number;
  /** applied/total（total=0 のときは 0）。小数第4位で丸め。 */
  readonly frac: number;
}

export function coverageOf(applied: number, total: number): Coverage {
  const frac = total > 0 ? Math.round((applied / total) * 1e4) / 1e4 : 0;
  return { applied, total, frac };
}

/** 空虚＝一度も効いていない。ゲートの合格をこのまま信じてはいけない印。 */
export function isVacuous(c: Coverage): boolean {
  return c.total <= 0 || c.applied <= 0;
}

/** ゲート＝落ちたら不合格。`source` に**数値の出所（ファイル:行）**を必ず書く（§6-4 #11・負の知識16）。 */
export interface GateVerdict<D = unknown> {
  readonly kind: "gate";
  readonly id: string;
  readonly pass: boolean;
  readonly coverage: Coverage;
  readonly source: string;
  readonly problems: readonly string[];
  readonly detail: D;
}

/** 作りから自明に成り立つはずのもの。被覆率が 0 なら「成り立った」は無意味。 */
export interface ByConstructionVerdict<D = unknown> {
  readonly kind: "byConstruction";
  readonly id: string;
  readonly holds: boolean;
  readonly coverage: Coverage;
  readonly source: string;
  readonly problems: readonly string[];
  readonly detail: D;
}

/** 診断＝数値のみ。**合否フィールドを持たない**＝ゲートに使えない（§6-4 #1）。 */
export interface DiagnosticVerdict<V = unknown> {
  readonly kind: "diagnostic";
  readonly id: string;
  readonly value: V;
  readonly coverage: Coverage;
  readonly source: string;
  readonly note?: string;
}

export type Verdict<D = unknown> = GateVerdict<D> | ByConstructionVerdict<D> | DiagnosticVerdict<D>;

export function gate<D>(id: string, pass: boolean, cov: Coverage, source: string, problems: readonly string[], detail: D): GateVerdict<D> {
  return { kind: "gate", id, pass, coverage: cov, source, problems, detail };
}
export function byConstruction<D>(id: string, holds: boolean, cov: Coverage, source: string, problems: readonly string[], detail: D): ByConstructionVerdict<D> {
  return { kind: "byConstruction", id, holds, coverage: cov, source, problems, detail };
}
export function diagnostic<V>(id: string, value: V, cov: Coverage, source: string, note?: string): DiagnosticVerdict<V> {
  return { kind: "diagnostic", id, value, coverage: cov, source, note };
}

export class GateFailure extends Error {
  constructor(readonly verdict: GateVerdict<unknown>) {
    super(`gate ${verdict.id} failed (coverage ${verdict.coverage.applied}/${verdict.coverage.total}): ${verdict.problems.join(" | ")}\n  source: ${verdict.source}`);
    this.name = "GateFailure";
  }
}

/** ゲートを断言する。**GateVerdict しか受け取らない**（診断は型エラー＝§6-4 #8）。 */
export function assertGate(v: GateVerdict<unknown>): void {
  // JS からの誤用（型を迂回した呼び出し）にも実行時で蓋をする。
  if (v.kind !== "gate") throw new TypeError(`assertGate: not a gate (kind=${(v as Verdict).kind})`);
  if (!v.pass) throw new GateFailure(v);
}

export function assertGates(vs: readonly GateVerdict<unknown>[]): void {
  for (const v of vs) assertGate(v);
}

/** 被覆率の下限を断言する（§6-4 #7「レンジで assert」）＝合格が空虚でないことの担保。 */
export function assertCoverage(v: GateVerdict<unknown> | ByConstructionVerdict<unknown>, minFrac: number): void {
  if (v.coverage.frac < minFrac) {
    throw new Error(`coverage ${v.id}: ${v.coverage.frac} < ${minFrac} (applied ${v.coverage.applied}/${v.coverage.total}) — 検査が効いていない＝合格は空虚`);
  }
}
