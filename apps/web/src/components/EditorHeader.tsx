// 編集画面のヘッダ（共通パーツ CP2）：← 戻る / タイトル / 保存状態・削除（右上アイコン）。
// 保存は自動（design「編集は自動保存」）。kind ラベルは撤去＝一行目を軽く（種類は本体で分かる・2026-07-04）。
// 削除＝ゴミ箱アイコン／保存済＝丸チェックアイコン（押すと即フラッシュ）。全編集画面で共通。
import { Icon } from "./Icon";

export function EditorHeader(p: {
  kind: string;
  title: string;
  setTitle: (v: string) => void;
  onClose: () => void;
  saveStatus: "saved" | "saving" | "dirty";
  onFlush: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const saveTitle = p.saveStatus === "saving" ? "保存中…" : p.saveStatus === "dirty" ? "未保存（タップで今すぐ保存）" : "自動保存済み";
  return (
    <div className="editor-bar">
      <button className="back" onClick={p.onClose} aria-label="close">
        ← 戻る
      </button>
      <input aria-label="title" className="editor-title" placeholder="タイトル" value={p.title} onChange={(e) => p.setTitle(e.target.value)} />
      {/* 右上アイコン群：保存状態(丸チェック)＋削除(ゴミ箱)。 */}
      <span className="editor-actions">
        <button
          className="icon-status"
          data-state={p.saveStatus}
          aria-label="save-status"
          title={saveTitle}
          onClick={p.onFlush}
          disabled={p.saveStatus === "saving"}
        >
          <Icon name={p.saveStatus === "saved" ? "check-circle" : "circle"} size={20} />
        </button>
        <button className="icon-danger" onClick={p.onDelete} disabled={p.busy} aria-label="削除" title="削除">
          <Icon name="trash" size={19} />
        </button>
      </span>
    </div>
  );
}
