// 編集画面のヘッダ（共通パーツ CP2）：← 戻る / kind / タイトル / 削除 / 保存。
export function EditorHeader(p: {
  kind: string;
  title: string;
  setTitle: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="editor-bar">
      <button className="back" onClick={p.onClose} aria-label="close">
        ← 戻る
      </button>
      <span className="kind" data-kind={p.kind}>
        {p.kind}
      </span>
      <input aria-label="title" className="editor-title" placeholder="タイトル" value={p.title} onChange={(e) => p.setTitle(e.target.value)} />
      {/* 保存/削除は常に右端固定・2つで1グループ＝スマホでも分離せず一緒に右上へ収まる。 */}
      <span className="spacer" />
      <span className="editor-actions">
        <button className="danger" onClick={p.onDelete} disabled={p.busy}>
          削除
        </button>
        <button className="primary" onClick={p.onSave} disabled={p.busy}>
          保存
        </button>
      </span>
    </div>
  );
}
