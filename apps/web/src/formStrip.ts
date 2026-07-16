// 曲フォーム＝フォームストリップ（design「#曲フォーム」・正典 docs/research/2026-07-16-song-form-assembly.md §4.2）の純ロジック。
// song のセクション列を「カード列」として俯瞰・並べ替え・挿入・削除する土台。データ契約(compose_edge/position)は不変で、
// **position はカード順からの前置和射影**として都度再計算する（グリッド版と同じ辺を読む）。UI(FormStrip.tsx)は
// これらの純関数を組むだけ＝ロジックはここに集約してテスト可能に保つ。

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
export function roleOf(tags: readonly string[] | null | undefined): string | undefined {
  const t = (tags ?? []).find((x) => x.startsWith("role:"));
  return t ? t.slice("role:".length) : undefined;
}
export function roleInfo(role: string | undefined): { label: string; color?: string } | undefined {
  if (!role) return undefined;
  return ROLE_INFO[role] ?? { label: role }; // 未知役割＝生値・無地
}
