import { KindIcon } from "./KindIcon";
import { KIND_LABEL } from "../kinds";

// 種別フィルタ＋mood（トップ再設計 S1 機械抽出・正準＝docs/research/2026-07-14-topview-redesign-fable.md §7）。
// ＝ App.tsx の filter-kinds（作成と同じ絵・同じ順のアイコン1行）＋mood 入力を**そのまま**切り出したコンポ。
// kindFilter/moodFilter の state は App が唯一持ち、当コンポは器（JSX）のみ。DOM/aria（kind-filter-*・
// mood-filter）は抽出前と完全同一。S3 でここをデータ導出のミニタイル＋件数バッジへ差し替える（導線/aria は不変）。
export type FilterBarProps = {
  kindFilter: string;
  setKindFilter: (k: string) => void;
  moodFilter: string;
  setMoodFilter: (m: string) => void;
  qActive: boolean; // 検索中＝種別フィルタは無効
};

// 作成タイルと同じ順：パーツ(メロ/骨格/対旋律/コード/ベース/リズム/コード楽器/リフ/管弦)→組み立て(セクション/曲)→文字(歌詞/テーマ)。
const FILTER_KINDS = [
  ["melody", "var(--k-melody)"],
  ["skeleton", "var(--k-skeleton)"],
  ["counter", "var(--k-counter)"],
  ["chord_progression", "var(--k-chord)"],
  ["bass", "var(--k-bass)"],
  ["rhythm", "var(--k-rhythm)"],
  ["chord_pattern", "var(--k-chord)"],
  ["riff", "var(--k-riff)"],
  ["section_inst", "var(--k-section_inst)"],
  ["section", "var(--k-section)"],
  ["song", "var(--k-song)"],
  ["lyric", "var(--k-lyric)"],
  ["theme", "var(--k-theme)"],
] as const;

export function FilterBar({ kindFilter, setKindFilter, moodFilter, setMoodFilter, qActive }: FilterBarProps) {
  return (
    <>
      <div className="filter-kinds" role="group" aria-label="kind-filter">
        {FILTER_KINDS.map(([k, col]) => (
          <button
            key={k}
            type="button"
            className={"filter-kind" + (kindFilter === k ? " on" : "")}
            style={{ ["--k" as string]: col }}
            aria-label={`kind-filter-${k}`}
            aria-pressed={kindFilter === k}
            disabled={qActive}
            title={qActive ? "検索中は種別フィルタは無効" : `${KIND_LABEL[k] ?? k}で絞る`}
            onClick={() => setKindFilter(kindFilter === k ? "" : k)}
          >
            <KindIcon kind={k} />
          </button>
        ))}
      </div>
      <input
        className="mood-filter-input"
        aria-label="mood-filter"
        placeholder="mood で絞る…"
        value={moodFilter}
        onChange={(e) => setMoodFilter(e.target.value)}
      />
    </>
  );
}
