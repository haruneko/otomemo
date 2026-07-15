import { KindTiles } from "./KindTiles";
import { FILTER_KINDS } from "../kinds";

// 絞る引き出し（トップ再設計 S2→S3・正典＝docs/research/2026-07-14-topview-redesign-fable.md §3.2/§10）。
// アクション行の `絞る▾` で開くボトムシート。中身＝全種別の3列タイル格子（件数バッジ・件数降順）＋
// 「まだ0件」ゾーン（破線ゴースト＝作ればトップに現れる）＋mood。棚(CreateShelf)と同じ3列格子で対にする。
// 導出＝件数はクライアント集計(kindCounts)＝追加APIなし・露出∝実利用。state は App が唯一持つ。
export type FilterDrawerProps = {
  kindFilter: string;
  setKindFilter: (k: string) => void;
  moodFilter: string;
  setMoodFilter: (m: string) => void;
  kindCounts: Record<string, number>;
  existsKinds: Set<string>; // DB上に実在する kind（facets ∪ ロード中 items）。0件ゴースト判定の権威。
  onClose: () => void;
};

export function FilterDrawer({ kindFilter, setKindFilter, moodFilter, setMoodFilter, kindCounts, existsKinds, onClose }: FilterDrawerProps) {
  // 全 filterable 種別を「実在するか」で二分＝有り（タイル・タップ可）／0件（非タップのゴースト）。
  // 実在判定は existsKinds＝facets に依る（窓落ちの古い kind も絞り込める）。件数バッジ(kindCounts)も
  // facets 由来＝DB権威の正確な実数（旧「最新100件窓の best-effort」を解消）。件数降順で並べる。
  const nonzero = FILTER_KINDS.filter((k) => existsKinds.has(k))
    .map((k) => [k, kindCounts[k] ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const zeroKinds = FILTER_KINDS.filter((k) => !existsKinds.has(k));
  return (
    <>
      <div className="cm-sheet-backdrop" aria-hidden="true" onClick={onClose} />
      <div className="cm-sheet" role="dialog" aria-label="filter-drawer">
        <div className="cm-sheet-head">
          <span className="sheet-grab" aria-hidden="true" />
          <b className="cm-sheet-title">絞り込み</b>
          <button type="button" className="sheet-close" aria-label="close-filter-drawer" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cm-sheet-body">
          <div className="cm-shelf-lab">種別（件数順・上位はトップにもタイルで出ている・再タップで解除）</div>
          <KindTiles
            entries={nonzero}
            kindFilter={kindFilter}
            setKindFilter={setKindFilter}
            variant="grid"
            zeroKinds={zeroKinds}
            onPick={onClose}
          />
          <div className="cm-shelf-lab">mood で絞る</div>
          <input
            className="mood-filter-input"
            aria-label="mood-filter"
            placeholder="mood（例：哀愁・きらきら）…"
            value={moodFilter}
            onChange={(e) => setMoodFilter(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
