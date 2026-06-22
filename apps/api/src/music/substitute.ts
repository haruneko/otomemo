// 連想エンジン：代替コード。機能代理/相対/セカンダリードミナント/裏コード/同主調借用 を決定的に列挙。
// 「3つ目のコードの代替は？」「ベタ→ひねる」の合法手出し。データ不要・S2の機能(functionOf)を使う。
import { type Degree } from "./theory";
import { functionOf, type Mode } from "./function";

export type Substitute = { degree: number; quality: string; kind: string; why: string };

const norm = (x: number) => ((Math.trunc(x) % 12) + 12) % 12;
const isMinorQuality = (q: string) => /^(m|min|dim)/.test(q) && !/^maj/.test(q);

// ダイアトニックの三和音品質（機能代理の品質源）。
const DIATONIC_MAJOR: Record<number, string> = { 0: "", 2: "m", 4: "m", 5: "", 7: "", 9: "m", 11: "dim" };
const DIATONIC_MINOR: Record<number, string> = { 0: "m", 2: "dim", 3: "", 5: "m", 7: "m", 8: "", 10: "" };
// 同主調からの借用（機能別・メジャー調に短調側を借りる定番）。S=iv, D=bVII, T=bVI。
const MODAL_BORROW: Record<string, [number, string][]> = { S: [[5, "m"]], D: [[10, ""]], T: [[8, ""]] };

/** コード（度数＋品質）の代替候補。opts.next を渡すと「次へのセカンダリードミナント」も足す。 */
export function substitutesOf(chord: Degree, opts: { mode?: Mode; next?: Degree } = {}): Substitute[] {
  const mode = opts.mode ?? "major";
  const dia = mode === "minor" ? DIATONIC_MINOR : DIATONIC_MAJOR;
  const d = norm(chord.degree);
  const q0 = chord.quality || "";
  const out: Substitute[] = [];

  // 1. 機能代理（同じ T/S/D のダイアトニックコード）
  const F = functionOf(d, mode);
  if (F !== "?") {
    for (const [degStr, q] of Object.entries(dia)) {
      const dd = Number(degStr);
      if (dd !== d && functionOf(dd, mode) === F) {
        out.push({ degree: dd, quality: q, kind: "functional", why: `同じ${F}機能の代理` });
      }
    }
  }
  // 2. 相対（長↔短の3度関係・2音共有）
  if (!isMinorQuality(q0)) out.push({ degree: norm(d - 3), quality: "m", kind: "relative", why: "平行調の関係（2音共有）" });
  else out.push({ degree: norm(d + 3), quality: "", kind: "relative", why: "平行調の関係（2音共有）" });
  // 3. セカンダリードミナント（次コードの V7）
  if (opts.next) {
    out.push({ degree: norm(opts.next.degree + 7), quality: "7", kind: "secondary_dominant", why: "次のコードへのセカンダリードミナント(V7/x)" });
  }
  // 4. 裏コード（ドミナント7の増4度代理）
  if (q0 === "7") out.push({ degree: norm(d + 6), quality: "7", kind: "tritone_sub", why: "裏コード（増4度の代理ドミナント）" });
  // 5. 同主調借用（メジャー調・機能別の定番）
  if (mode === "major") {
    for (const [dd, q] of MODAL_BORROW[F] ?? []) {
      if (!(dd === d && q === q0)) out.push({ degree: dd, quality: q, kind: "modal_interchange", why: "同主調からの借用" });
    }
  }

  // 入力そのもの除外＋(degree,quality,kind)で重複排除
  const seen = new Set<string>();
  return out.filter((s) => {
    if (s.degree === d && s.quality === q0) return false;
    const k = `${s.degree}:${s.quality}:${s.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
