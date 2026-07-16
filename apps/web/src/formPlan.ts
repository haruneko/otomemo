// つなぎ＝計画 verb の結線（design「#曲フォーム」S3-a）の純ロジック。
// suggest_key_plan の適用振り分け（直接更新 vs 自動分家）・遷移試聴の部分窓・suggest_form の足場射影・
// エナジーΔチップ。UI(FormStrip/FormSuggest)は結線のみ＝判断はここに集約してテスト可能に保つ。
import { stripPositions } from "./formStrip";

export type KeyTarget = { key: number; mode: "major" | "minor" };
// 配置1個（position 順）。key/mode は子ネタ実体の現在値（null=未設定＝曲から継承）。
export type PlanCard = { childId: string; key: number | null; mode: string | null };

export type KeyApplication = {
  // 実体を直接 updateNeta({key,mode})＝参照共有の全配置に効く（「サビを直せば全サビに効く」側）。
  direct: { childId: string; target: KeyTarget; indices: number[] }[];
  // vary→該当辺差し替え→分家へ updateNeta＝その配置だけ転調（転調ラスサビ側）。同ターゲットは1分家を共有。
  branch: { childId: string; target: KeyTarget; indices: number[] }[];
};

const sameTarget = (a: KeyTarget, b: KeyTarget) => a.key === b.key && a.mode === b.mode;

/** suggest_key_plan の適用振り分け（S3-a・自動分家）。
 * childId ごとに配置のターゲット調を集め、**全配置が同一ターゲット**＝実体を直接更新／**割れる**＝
 * 先頭配置のターゲットを実体に・異なるターゲットの配置は分家（ターゲット調ごとに1分家・複数配置は共有）。
 * 現在の実効調（key null=曲の base 継承）と同じターゲットは no-op＝無転調プランは操作ゼロ（bit-safe）。 */
export function planKeyApplication(cards: PlanCard[], targets: KeyTarget[], base: KeyTarget): KeyApplication {
  const byChild = new Map<string, number[]>(); // childId → 配置 index 列（出現順）
  const n = Math.min(cards.length, targets.length); // targets が短い＝余った配置は触らない（防御）
  for (let i = 0; i < n; i++) {
    const id = cards[i]!.childId;
    (byChild.get(id) ?? byChild.set(id, []).get(id)!).push(i);
  }
  const direct: KeyApplication["direct"] = [];
  const branch: KeyApplication["branch"] = [];
  for (const [childId, indices] of byChild) {
    const cur = cards[indices[0]!]!;
    // 実効現在値＝未設定は曲から継承（compositeNotes の再帰合成と同じ解釈）＝同値なら書かない。
    const eff: KeyTarget = {
      key: cur.key ?? base.key,
      mode: cur.mode === "minor" ? "minor" : cur.mode === "major" ? "major" : base.mode,
    };
    const headTarget = targets[indices[0]!]!;
    // 先頭配置のターゲット＝実体へ（現在値と同じなら no-op）。
    const headIdx = indices.filter((i) => sameTarget(targets[i]!, headTarget));
    if (!sameTarget(headTarget, eff)) direct.push({ childId, target: headTarget, indices: headIdx });
    // 先頭と異なるターゲット＝分家（ターゲットごとに1グループ＝同調の複数配置は同じ分家を共有）。
    const rest = indices.filter((i) => !sameTarget(targets[i]!, headTarget));
    const groups = new Map<string, { target: KeyTarget; indices: number[] }>();
    for (const i of rest) {
      const tg = targets[i]!;
      const k = `${tg.key}/${tg.mode}`;
      (groups.get(k) ?? groups.set(k, { target: tg, indices: [] }).get(k)!).indices.push(i);
    }
    for (const g of groups.values()) branch.push({ childId, target: g.target, indices: g.indices });
  }
  return { direct, branch };
}

/** 遷移試聴（縫い目E）＝境界 boundaryBeat の前後 halfSpanBeats の部分窓でノートを切り出し 0 起点にシフト。
 * 窓をまたぐロングノートは端でクリップ（前から食い込む白玉も鳴る）。曲頭は lo=0 でクリップ（負の窓なし）。 */
export function transitionWindowNotes<T extends { start: number; dur: number }>(
  notes: T[],
  boundaryBeat: number,
  halfSpanBeats: number,
): T[] {
  const lo = Math.max(0, boundaryBeat - halfSpanBeats);
  const hi = boundaryBeat + halfSpanBeats;
  const EPS = 1e-6;
  const out: T[] = [];
  for (const note of notes) {
    const s = Math.max(note.start, lo);
    const e = Math.min(note.start + note.dur, hi);
    if (e - s <= EPS) continue; // 窓と重ならない
    out.push({ ...note, start: s - lo, dur: e - s });
  }
  return out;
}

/** suggest_form 候補（役割列＋小節数）→ 足場の配置計画（position=前置和射影・拍）。
 * position は formStrip.stripPositions と同じ射影＝compose_edge/position の契約に沿う。 */
export function scaffoldPlan(
  sections: { role: string; bars: number }[],
  BPB: number,
): { role: string; bars: number; position: number }[] {
  const durs = sections.map((s) => (s.bars > 0 ? s.bars * BPB : 0)); // bars 0/負は 0 扱い（射影防御）
  const pos = stripPositions(durs);
  return sections.map((s, i) => ({ role: s.role, bars: s.bars, position: pos[i]! }));
}

/** エナジーΔチップ（S3-a・揮発表示）＝ suggest_energy_plan の level(1..5) を前セクション比の矢印に。
 * 先頭は基準＝「→」。差 ≥+2=↑↑ / +1=↑ / 0=→ / -1=↓ / ≤-2=↓↓。 */
export function energyChips(sections: { level: number }[]): string[] {
  return sections.map((s, i) => {
    if (i === 0) return "→";
    const d = s.level - sections[i - 1]!.level;
    return d >= 2 ? "↑↑" : d === 1 ? "↑" : d === 0 ? "→" : d === -1 ? "↓" : "↓↓";
  });
}
