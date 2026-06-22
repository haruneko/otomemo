// 連想エンジン 機構④：継続（次のコード候補）。機能文法 T→S/D, S→D, D→T のベースライン（データ不要）。
// 「この進行の次は？/サビへ緊張を作る」の足場。質は進行間の遷移統計（コーパス）で上がる＝今は素朴版（confirm-list）。
import { type Degree } from "./theory";
import { functionOf, type Mode, type Func } from "./function";

const DIA_MAJOR: [number, string][] = [[0, ""], [2, "m"], [4, "m"], [5, ""], [7, ""], [9, "m"], [11, "dim"]];
const DIA_MINOR: [number, string][] = [[0, "m"], [2, "dim"], [3, ""], [5, "m"], [7, "m"], [8, ""], [10, ""]];
// 機能の遷移選好（worker _FUNC_NEXT を簡約）：トニックは離れ、サブドミ→ドミナント、ドミナント→解決。
const NEXT_FUNC: Record<Func, Func[]> = { T: ["S", "D"], S: ["D", "T"], D: ["T"], "?": ["T", "S", "D"] };

export type NextCandidate = { degree: number; quality: string; function: Func; why: string };

function whyFor(from: Func, to: Func): string {
  if (to === "D") return "ドミナントへ＝緊張を高める（サビ前・締めに効く）";
  if (to === "T") return from === "D" ? "ドミナント→トニックで解決" : "トニックへ＝落ち着く";
  if (to === "S") return "サブドミナントへ＝展開を広げる";
  return "次の機能へ";
}

/** 進行の最後のコードの機能から、次に来やすいコード候補を上位 top件（既定4）。 */
export function nextChordCandidates(progression: Degree[], opts: { mode?: Mode; top?: number } = {}): NextCandidate[] {
  const mode = opts.mode ?? "major";
  const dia = mode === "minor" ? DIA_MINOR : DIA_MAJOR;
  const prog = progression ?? [];
  const last = prog[prog.length - 1];
  const lastDeg = last ? ((last.degree % 12) + 12) % 12 : -1;
  const F: Func = last ? functionOf(last.degree, mode) : "T";
  const prefer = NEXT_FUNC[F] ?? ["T", "S", "D"];

  const out: NextCandidate[] = [];
  for (const nf of prefer) {
    for (const [deg, q] of dia) {
      if (functionOf(deg, mode) === nf && deg !== lastDeg) {
        out.push({ degree: deg, quality: q, function: nf, why: whyFor(F, nf) });
      }
    }
  }
  const seen = new Set<number>();
  const res = out.filter((c) => (seen.has(c.degree) ? false : (seen.add(c.degree), true)));
  return res.slice(0, Math.max(1, opts.top ?? 4));
}
