import { FilterBar } from "./FilterBar";

// 絞る引き出し（トップ再設計 S2・正準＝docs/research/2026-07-14-topview-redesign-fable.md §3.2/§7）。
// アクション行の `絞る▾` で開くボトムシート。中身＝種別フィルタ（全種別）＋mood（＝FilterBar を再利用）。
// トップから種別フィルタの壁を畳む（S3 で上位6をトップにミニタイルで出し、この引き出しは全種別タイル格子＋
// 「まだ0件」ゾーンへ育てる）。kindFilter/moodFilter の state は App が唯一持つ＝当コンポは器のみ。
export type FilterDrawerProps = {
  kindFilter: string;
  setKindFilter: (k: string) => void;
  moodFilter: string;
  setMoodFilter: (m: string) => void;
  qActive: boolean;
  onClose: () => void;
};

export function FilterDrawer({ kindFilter, setKindFilter, moodFilter, setMoodFilter, qActive, onClose }: FilterDrawerProps) {
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
          <div className="cm-shelf-lab">種別で絞る（再タップで解除）</div>
          <FilterBar
            kindFilter={kindFilter}
            setKindFilter={setKindFilter}
            moodFilter={moodFilter}
            setMoodFilter={setMoodFilter}
            qActive={qActive}
          />
        </div>
      </div>
    </>
  );
}
