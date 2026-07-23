import { useState } from "react";
import { type Neta } from "../api";
import { Icon } from "./Icon";
import { PatternImportDialog } from "./PatternImportDialog";

// Task1j（design「### Task1j＝パターン取込の共通化…」）：3エディタ（chord/bass/rhythm）が各自持っていた
// **入口ボタン＋importOpen state＋PatternImportDialog の定型配線** を1つに集約する共通コンポーネント。
// これで「楽器を1つ増やす＝取込の器を丸ごと作る」重複を排し、絞りの日本語化/データ駆動 scene も1箇所で効く。
//
// **bit一致の鉄則**：audition/apply の実体（notesForContent＋buildPlayback＋startPlayback＋再生停止・content 形・
// key/tempo/program/chords 文脈）は **各エディタに残す**＝ここは open/dialog/入口ボタンだけ持ち、
//  - onPick(neta) → onApply(neta.content)（＝各エディタの applyPattern：content コピー・copy_neta 不使用）
//  - onPreview(neta) → onAudition(neta.content)（＝各エディタの auditionPattern：試聴の実音経路）
//  - onClose（✕/背景）→ onClose?()（＝各エディタの ppPlay.stop：再生停止）＋閉
// を注入で受ける（＝レンダ結果・content 出力は従来と同一）。
export function PatternImportControl({
  kind,
  fallbackName,
  onApply,
  onAudition,
  nowLabel,
  activeProject,
  contentFilter,
  onClose,
}: {
  kind: string; // 開いたエディタの kind（固定）。PatternImportDialog の母集団 kind 絞りへ。
  fallbackName: string; // title/patternId 欠落時のカード名。
  onApply: (content: unknown) => void; // 採用＝各エディタの applyPattern（content 形は editor 固有）。
  onAudition: (content: unknown) => void; // ▶試聴＝各エディタの auditionPattern（再生文脈は editor 固有）。
  nowLabel?: string; // 現在の patternId（あれば「いま：」表示）。手編集後の「（改）」は呼び側が付けて渡す。
  activeProject?: string; // Task1i：Source（プロジェクト軸）絞りをダイアログへ下ろす（純追加）。
  contentFilter?: (n: Neta) => boolean; // bass relative 番兵など母集団の追加フィルタ。
  onClose?: () => void; // 閉じる時の後始末（各エディタの ppPlay.stop＝試聴の停止）。純追加・省略可。
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pattern-picker pp-link" aria-label="pattern-picker">
      {/* 入口＝ライブラリアイコン（積み重なったコレクション）**単体のボタン**（オーナーFB「アイコンだけで」）。
          文言はホバー/読み上げ用の title/aria に退避。「いま：<型>」は選び直し兼用でボタン外の小テキストに維持。 */}
      <button
        type="button"
        className="pp-icon-btn"
        aria-label="pattern-picker-toggle"
        title="ライブラリから読み込む"
        onClick={() => setOpen(true)}
      >
        <Icon name="import" size={18} />
      </button>
      {nowLabel && (
        <span className="pp-now" aria-label="pattern-now">
          いま：{nowLabel}
        </span>
      )}
      {open && (
        <PatternImportDialog
          kind={kind}
          fallbackName={fallbackName}
          contentFilter={contentFilter}
          activeProject={activeProject}
          onPreview={(n) => onAudition(n.content)}
          onPick={(n) => {
            onApply(n.content);
            setOpen(false);
          }}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
