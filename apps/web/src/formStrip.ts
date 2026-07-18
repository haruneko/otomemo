// 曲フォーム＝フォームストリップ（design「#曲フォーム」・正典 docs/research/2026-07-16-song-form-assembly.md §4.2）の純ロジック。
// song のセクション列を「縦セットリスト」として俯瞰・並べ替え・挿入・削除する土台（#28 で横カード帯→縦行へ是正）。
// データ契約(compose_edge/position)は不変で、**position はカード順からの前置和射影**として都度再計算する（グリッド版と同じ辺を読む）。
// UI(FormStrip.tsx)はこれらの純関数を組むだけ＝ロジックはここに集約してテスト可能に保つ。
import { PITCH_NAMES } from "./music";

// カード（＝配置1個）の最小情報。position は順序から射影で決まるので持たない（childId＋尺＋ord＋その配置の実position）。
export type StripCard = {
  childId: string; // 子ネタ(section)の id
  dur: number; // 尺（拍）＝childDur（セクションの実長）
  ord: number; // compose_edge の ord（song のセクションは基本0・place_child に渡す）
  position: number; // 現在サーバ上の配置位置（拍）。reconcile で「今どこにあるか」を知るために保持。
};

// compose_edge の辺（親は文脈から自明）。position は射影で決まる・ord は place_child に渡す。
export type Edge = { childId: string; position: number; ord: number };

const EPS = 1e-6;

// 前置和射影：カードの尺列 → 各カードの開始 position（拍）。先頭=0、以降は直前までの尺の累積。
// ＝カードを隙間なく詰めて並べる（フォームストリップの「順序が位置を決める」中核）。
export function stripPositions(durs: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const d of durs) {
    out.push(acc);
    acc += d > 0 ? d : 0; // 尺0/負は0扱い（NaN・壊れた content で射影が壊れないよう防御）
  }
  return out;
}

// カード列（この順に並べたい）→ 目標の辺集合（childId＋射影position＋ord）。
export function cardsToEdges(cards: StripCard[]): Edge[] {
  const pos = stripPositions(cards.map((c) => c.dur));
  return cards.map((c, i) => ({ childId: c.childId, position: pos[i]!, ord: c.ord }));
}

// ×N畳み：連続する同一 childId を1グループに束ねる（サビ×2 等の反復を1カードに）。
// indices＝元カード列での添字（展開表示・削除・並べ替えの逆引きに使う）。
export type StripRun = { childId: string; count: number; indices: number[] };
export function collapseRuns(childIds: string[]): StripRun[] {
  const runs: StripRun[] = [];
  childIds.forEach((id, i) => {
    const last = runs[runs.length - 1];
    if (last && last.childId === id) {
      last.count += 1;
      last.indices.push(i);
    } else {
      runs.push({ childId: id, count: 1, indices: [i] });
    }
  });
  return runs;
}

// 辺の差分（多重集合マッチ）：現在の辺(old)→目標(new)。据え置ける辺(同 childId＋同 position)は触らず、
// 消すべき辺(remove)と置くべき辺(place)だけを返す＝並べ替え/挿入/削除を最小の place/remove に落とす。
// 同一 childId の複数配置(×N)も position で区別してマッチ（位置は EPS 許容）。
export function reconcileEdges(oldEdges: Edge[], newEdges: Edge[]): { place: Edge[]; remove: Edge[] } {
  const key = (e: Edge) => `${e.childId}@${Math.round(e.position / EPS)}`;
  const oldByKey = new Map<string, Edge[]>();
  for (const e of oldEdges) {
    const k = key(e);
    (oldByKey.get(k) ?? oldByKey.set(k, []).get(k)!).push(e);
  }
  const place: Edge[] = [];
  for (const e of newEdges) {
    const bucket = oldByKey.get(key(e));
    if (bucket && bucket.length) bucket.shift(); // 既にある＝据え置き（1つ消費）
    else place.push(e); // 無い＝置く
  }
  const remove: Edge[] = [];
  for (const bucket of oldByKey.values()) for (const e of bucket) remove.push(e); // 残った old＝目標に無い＝消す
  return { place, remove };
}

// 尺は「配置(placement)」でなく「セクション(childId)」の属性＝各 childId の尺を**無傷な配置から解決**する。
// getComposition は反復配置（同一 child の2個目以降）の node.children を空で返し、childDur がそこで 1小節へ
// フォールバックする。配置ごとの childDur をそのまま射影に使うと、反復ランの後ろのセクションが左へ詰まって
// **compose_edge の position が壊れる**（表示でなくデータ破損）。id ごとに全 placement の childDur の**最大**を取り
// （children を持つ配置が勝つ）1本に解決＝position を射影する全経路（applyOrder/insertSection/合計尺）でこれを使う。
export function resolveDurById(placements: { childId: string; dur: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of placements) {
    const d = Number.isFinite(p.dur) && p.dur > 0 ? p.dur : 0; // 壊れ尺(NaN/0/負)は0扱い→他の無傷配置が勝つ
    const cur = m.get(p.childId);
    if (cur === undefined || d > cur) m.set(p.childId, d);
  }
  return m;
}

// 合計尺（拍）＝曲全体の span。position 昇順の配置列（childId＋position＋その配置の尺）から出す。
// **×N（連続する同一 child の複数配置）は「ランの先頭配置の尺 × 個数」で span を測る**＝getComposition が反復配置の
// 2個目以降の node.children を畳んで childDur が小さく出ても過少カウントしない（サビ×2 が末尾でもヘッダが実尺に一致）。
// position=前置和射影と整合＝各ランは先頭 position から count×dur 分連続する前提（射影後は必ず連続）。
export function totalSpanBeats(cards: { childId: string; position: number; dur: number }[]): number {
  let max = 0;
  let i = 0;
  while (i < cards.length) {
    const head = cards[i]!;
    let count = 1;
    while (i + count < cards.length && cards[i + count]!.childId === head.childId) count++; // 連続同一＝1ラン
    const d = head.dur > 0 ? head.dur : 0; // 尺0/負/NaN は0扱い（射影が壊れない防御）
    const end = head.position + count * d; // 先頭 position から count×(先頭尺) 分＝反復ぶんを取りこぼさない
    if (end > max) max = end;
    i += count;
  }
  return max;
}

// セクション役割（design L488 `role:` 名前空間タグ）→ 表示ラベル/色クラス。tags から最初の role: を読む。
// 未知の役割は生値を出す（色は無地）。役割タグ無し＝undefined（カードは無地）。
const ROLE_INFO: Record<string, { label: string; color: string }> = {
  intro: { label: "Intro", color: "var(--k-section)" },
  verse: { label: "Aメロ", color: "var(--k-melody)" },
  prechorus: { label: "Bメロ", color: "var(--k-counter)" },
  chorus: { label: "サビ", color: "var(--k-chord)" },
  drop_chorus: { label: "落ちサビ", color: "var(--k-bass)" },
  last_chorus: { label: "大サビ", color: "var(--k-riff)" },
  bridge: { label: "Cメロ", color: "var(--k-skeleton)" },
  interlude: { label: "間奏", color: "var(--k-section_inst)" },
  outro: { label: "Outro", color: "var(--k-rhythm)" },
};
// #28 役割の付与UI（⋯シート）で選べる役割の並び＝ROLE_INFO の宣言順（イントロ→…→アウトロ）。役割は色/ミニマップ/生成/key_plan の起点。
export const ROLE_KEYS = Object.keys(ROLE_INFO);
// tags の role: を差し替える（既存の非 role タグは温存）。role=undefined で役割を外す。
export function withRole(tags: readonly string[] | null | undefined, role: string | undefined): string[] {
  const rest = (tags ?? []).filter((t) => !t.startsWith("role:"));
  return role ? [...rest, `role:${role}`] : rest;
}
export function roleOf(tags: readonly string[] | null | undefined): string | undefined {
  const t = (tags ?? []).find((x) => x.startsWith("role:"));
  return t ? t.slice("role:".length) : undefined;
}
export function roleInfo(role: string | undefined): { label: string; color?: string } | undefined {
  if (!role) return undefined;
  return ROLE_INFO[role] ?? { label: role }; // 未知役割＝生値・無地
}

// 調バッジ（design「#曲フォーム」S2）：セクションの key が曲(song)の key と違う時だけ半音差を「+1」「-3」形式で。
// **同じ調 or key 未設定なら null**（バッジを出さない）＝転調ラスサビ(key+1)等だけが目立つ。差は -5..+6 の最短表現
// （key+11 は同じ音高集合の -1 として出す＝人が読む向きに素直）。分家 A′ とは別スロット（分家＝系譜・調＝frame）。
export function keyDiffLabel(childKey: number | null | undefined, songKey: number): string | null {
  if (childKey == null) return null; // 調未設定のセクション＝比較しない
  const diff = (((childKey - songKey) % 12) + 12) % 12; // 0..11
  const signed = diff <= 6 ? diff : diff - 12; // -5..+6（最短の転調向き）
  if (signed === 0) return null; // 曲と同じ調＝バッジ無し
  return signed > 0 ? `+${signed}` : `${signed}`;
}

// #28 実キー名バッジ＝「F +5」形式。謎バッジ「+5」単独を廃し、セクションの実際の調名を主に、曲との半音差を従に。
// key 未設定（曲キー継承）＝null（バッジを出さない＝転調しているセクションだけ目立つ）。同調なら「F」だけ（差は付けない）。
export function sectionKeyBadge(
  childKey: number | null | undefined,
  childMode: string | null | undefined,
  songKey: number,
): string | null {
  if (childKey == null) return null;
  const name = `${PITCH_NAMES[((childKey % 12) + 12) % 12]}${childMode === "minor" ? "m" : ""}`;
  const diff = keyDiffLabel(childKey, songKey);
  return diff ? `${name} ${diff}` : name;
}

// #28 時間住所＝「8小節 · 1-8」。前置和射影の副産物（開始 bar と尺）から、グリッド無しで「今どこ・どこから」を読ませる。
// ×N は count×bars ぶんを1住所にまとめる（畳んだブロックの占有範囲）。1-based（人が読む小節番号）。
export function timeAddress(startBar: number, bars: number): string {
  const b = Math.max(0, Math.round(bars));
  const s = Math.max(1, Math.round(startBar));
  if (b <= 0) return `${b}小節`;
  const end = s + b - 1;
  return `${b}小節 · ${s}-${end}`;
}

// #28 非破壊フォーム適用（提案▾）＝既存配置を全消しせず、候補の役割枠へ既存セクションをマージする純ロジック。
// 各候補枠に「同じ役割の既存セクション」があれば温存（その childId を使う）・無ければ空足場を新規作成。
// 候補に役割枠が無い既存（余り）は末尾に温存＝**作業中アレンジを失わない**（design #28「既存を役割枠へマージ」）。
// 返り＝並べたい順のアイテム列（existing=温存/new=足場を作る）。position は呼び出し側が前置和射影で振る。
export type MergeItem = { kind: "existing"; childId: string } | { kind: "new"; role: string; bars: number };
export function mergeFormPlan(
  existing: { childId: string; role: string | undefined }[],
  candidate: { role: string; bars: number }[],
): MergeItem[] {
  const pool = [...existing];
  const out: MergeItem[] = [];
  for (const slot of candidate) {
    const i = pool.findIndex((e) => e.role === slot.role); // 同役割の既存を1つ消費（先頭優先）
    if (i >= 0) {
      out.push({ kind: "existing", childId: pool[i]!.childId });
      pool.splice(i, 1);
    } else {
      out.push({ kind: "new", role: slot.role, bars: slot.bars });
    }
  }
  for (const e of pool) out.push({ kind: "existing", childId: e.childId }); // 余った既存＝末尾に温存（失わない）
  return out;
}
