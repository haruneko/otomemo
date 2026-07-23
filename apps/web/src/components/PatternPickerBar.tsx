// パターン取得の入口＝設定行の右端に寄せる控えめな二次リンク「⤓ ライブラリから読み込む」。
// Task1g（design「### Task1g」）：クリックは chip 帯（固定4件 body）でなく **pick ダイアログ（PatternImportDialog）を開く**。
// このリンクは器（見出し）だけ持ち、ダイアログの open state と onPick→applyPattern の配線は各エディタが持つ。
// 「いま：<型>」表示（現在 patternId・手編集後は「（改）」）は維持＝選び直し兼用の家。
export function PatternPickerBar({
  nowLabel,
  onOpen,
}: {
  nowLabel?: string; // 現在の patternId（あれば「いま：」表示）。手編集後の「（改）」は呼び側が付けて渡す。
  onOpen: () => void; // クリック＝pick ダイアログを開く（エディタが open state を持つ）。
}) {
  return (
    <div className="pattern-picker pp-link" aria-label="pattern-picker">
      <button type="button" className="pp-link-toggle" aria-label="pattern-picker-toggle" onClick={onOpen}>
        <span className="pp-link-text">⤓ ライブラリから読み込む</span>
        {nowLabel && (
          <span className="pp-now" aria-label="pattern-now">
            いま：{nowLabel}
          </span>
        )}
      </button>
    </div>
  );
}
