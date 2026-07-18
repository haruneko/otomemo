import { createPortal } from "react-dom";

// #29 P0-4 共通セルポップオーバー（長押しで開く・チップ1行＋全画面 backdrop）。
// P2 でドラム＝強く/弱く/2連/3連/消す、コード楽器＝強く/弱く/消す をチップ差し替えで再利用する
// 単一部品。位置は anchor(getBoundingClientRect) 基準の fixed（グリッドは横スクロールするため）。
export interface CellChip {
  id: string;
  label: string;
  on?: boolean; // 現在の状態（3状態トグルの点灯）
}

export function CellPopover({
  anchor,
  chips,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  chips: CellChip[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  // セル直上・中央寄せ。画面端で切れないよう左右をビューポート内へクランプ。
  const left = Math.max(8, Math.min(anchor.left + anchor.width / 2, window.innerWidth - 8));
  const top = Math.max(8, anchor.top - 8);
  return createPortal(
    <>
      {/* tools-backdrop idiom＝全画面タップで閉じる。 */}
      <div className="tools-backdrop cell-pop-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        className="cell-pop"
        role="menu"
        style={{ position: "fixed", left, top, transform: "translate(-50%, -100%)" }}
      >
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="menuitem"
            className={"chip" + (c.on ? " on" : "")}
            onClick={() => onPick(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
