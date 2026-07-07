import { useDroppable } from "@dnd-kit/core";

// レーンの1セル＝ドロップ先（#52②c）。kind が合えばカードを落として配置。
// SectionEditor.tsx から機械分割（負債D6）＝挙動不変。
export function LaneCell({
  laneKey,
  kinds,
  bar,
  position,
  row,
  onTap,
  disabled,
}: {
  laneKey: string;
  kinds: readonly string[];
  bar: number;
  position: number;
  row?: number; // ② コード楽器の行（D&Dドロップ時の ord に使う）
  onTap: (position: number) => void;
  disabled?: boolean; // 単一パートが埋まってる＝置けない（CV3）
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${laneKey}-${bar}`, data: { kinds, position, row }, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={"lane-cell" + (isOver ? " over" : "") + (disabled ? " locked" : "")}
      aria-label={`place-${laneKey}-${bar}`}
      disabled={disabled}
      onClick={() => !disabled && onTap(position)}
    />
  );
}
