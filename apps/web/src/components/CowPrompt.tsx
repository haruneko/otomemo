// CoW（分家の安全弁・design S2）の確認モーダル＝useCowGuard の cowPrompt/resolveCow を描く薄い見た目。
// NetaDialog が唯一のレンダ地点（useNetaEditor と SectionEditor は同一ガードを共有＝プロンプトも1つ）。
import type { CowChoice } from "../useCowGuard";

export function CowPrompt({
  prompt,
  onChoose,
}: {
  prompt: { count: number } | null;
  onChoose: (v: CowChoice) => void;
}) {
  if (!prompt) return null;
  return (
    <div className="cow-backdrop" role="dialog" aria-label="cow-prompt" aria-modal="true">
      <div className="cow-modal">
        <p className="cow-msg">このネタは<b>{prompt.count}箇所</b>で使われています。この変更をどうしますか？</p>
        <div className="cow-actions">
          <button type="button" className="cow-btn" aria-label="cow-all" title="共有したまま全部に反映（サビを直せば全サビに効く）" onClick={() => onChoose("all")}>全部に効かす</button>
          <button type="button" className="cow-btn primary" aria-label="cow-branch" title="この曲だけ変える＝分家（同じものとして育てる・元は無傷）" onClick={() => onChoose("branch")}>この曲だけ変える（分家）</button>
          <button type="button" className="cow-btn ghost" aria-label="cow-cancel" onClick={() => onChoose("cancel")}>やめる</button>
        </div>
      </div>
    </div>
  );
}
