// 編集画面のヘッダ（共通パーツ CP2）：← 戻る / kind / タイトル / 削除 / 保存状態ピル。
// 保存は自動（design「編集は自動保存」）。旧「保存」ボタンは状態ピル（押すと即フラッシュ）に。
import { KIND_LABEL } from "../kinds";

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
  const label = p.saveStatus === "saving" ? "保存中…" : p.saveStatus === "dirty" ? "未保存" : "保存済";
  return (
    <div className="editor-bar">
      <button className="back" onClick={p.onClose} aria-label="close">
        ← 戻る
      </button>
      <span className="kind" data-kind={p.kind}>
        {KIND_LABEL[p.kind] ?? p.kind}
      </span>
      <input aria-label="title" className="editor-title" placeholder="タイトル" value={p.title} onChange={(e) => p.setTitle(e.target.value)} />
      {/* 保存状態/削除は常に右端固定・2つで1グループ＝スマホでも分離せず一緒に右上へ収まる。 */}
      <span className="spacer" />
      <span className="editor-actions">
        <button className="danger" onClick={p.onDelete} disabled={p.busy}>
          削除
        </button>
        {/* 自動保存の状態表示＝押すと即フラッシュ（保存済のときは何もしない）。 */}
        <button
          className="save-status"
          data-state={p.saveStatus}
          aria-label="save-status"
          title={p.saveStatus === "saved" ? "自動保存済み" : "タップで今すぐ保存"}
          onClick={p.onFlush}
          disabled={p.saveStatus === "saving"}
        >
          {label}
        </button>
      </span>
    </div>
  );
}
