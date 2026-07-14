import type { Neta } from "../api";
import { KIND_LABEL, kindColor, CONTAINER_KINDS } from "../kinds";
import { MiniRoll, LazyPreview } from "./MiniRoll";

// #5 PC右ペインの空状態を「次の一手」ハブに（正典 docs/research/2026-07-15-ui-design-proposals.md §5）。
// 未選択時の mainpane（1280px の主戦場の6割）が一文＋ボタンだけ＝砂漠だったのを、実データ（最終更新／最近の更新）
// で埋めて再開動線を最短化する。飾りでなくデータを出す＝「実データが主役」正典に沿う。新機能・新APIは足さない
// （App が既に持つ items と既存コールバックだけで組む）。SP（mv-home）では mainpane 自体が非表示＝挙動不変。
const title = (n: Neta): string => n.title ?? n.text ?? "（無題）";

export function HomeHub({
  items,
  activeProject,
  onOpen,
  onCreateSong,
  onCreateMelody,
}: {
  items: Neta[];
  activeProject?: string;
  onOpen: (n: Neta) => void;
  onCreateSong: () => void;
  onCreateMelody?: () => void;
}) {
  // items が空＝従来の空状態（文言＋曲を組む）に退避＝初回/器が空でも迷わせない。
  if (!items.length) {
    return (
      <div className="mainpane-empty">
        <p className="muted">ネタを選ぶとここで編集できます。または曲を組む。</p>
        <button className="primary" onClick={onCreateSong}>
          ＋曲を組む
        </button>
      </div>
    );
  }

  // 最終更新順（つづき＝先頭・最近の更新＝続く最大6件）。App の resumeNeta と同じ規約（updated 降順）を自前で導出。
  const recent = [...items].sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  const resume = recent[0]!;
  const rest = recent.slice(1, 7); // 4〜6件（1件しか無ければ最近リストは畳む）

  return (
    <div className="home-hub" aria-label="home-hub">
      {activeProject && (
        <div className="hh-project" aria-label="home-hub-project">
          <span className="hh-project-label muted">器</span>
          <b className="hh-project-name">{activeProject}</b>
        </div>
      )}

      {/* つづきカード＝最終更新ネタ。タイトル・種別色・ミニプレビュー（music kind のみ）・タップで開く。 */}
      <button
        type="button"
        className="hh-resume"
        aria-label="home-hub-resume"
        style={{ ["--k" as string]: kindColor(resume.kind) }}
        onClick={() => onOpen(resume)}
      >
        <span className="hh-resume-bar" aria-hidden="true" />
        <span className="hh-resume-body">
          <small className="hh-resume-eyebrow muted">つづきから</small>
          <b className="hh-resume-title">{title(resume)}</b>
          <small className="hh-resume-kind">{KIND_LABEL[resume.kind] ?? resume.kind}</small>
        </span>
        {!CONTAINER_KINDS.includes(resume.kind) && (
          <span className="hh-resume-preview" aria-hidden="true">
            <LazyPreview minHeight={30}>
              <MiniRoll neta={resume} />
            </LazyPreview>
          </span>
        )}
      </button>

      {/* 最近の更新＝残り最大6件のミニリスト（タップで開く）。 */}
      {rest.length > 0 && (
        <div className="hh-recent">
          <div className="hh-section-head muted">最近の更新</div>
          <ul className="hh-recent-list">
            {rest.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="hh-recent-item"
                  style={{ ["--k" as string]: kindColor(n.kind) }}
                  onClick={() => onOpen(n)}
                >
                  <span className="hh-recent-dot" aria-hidden="true" />
                  <span className="hh-recent-title">{title(n)}</span>
                  <span className="hh-recent-kind muted">{KIND_LABEL[n.kind] ?? n.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ショートカット行＝既存コールバックで賄える範囲だけ（新機能は作らない）。 */}
      <div className="hh-shortcuts">
        <button type="button" className="hh-shortcut primary" onClick={onCreateSong}>
          ＋曲を組む
        </button>
        {onCreateMelody && (
          <button type="button" className="hh-shortcut" onClick={onCreateMelody}>
            ＋メロ
          </button>
        )}
      </div>
    </div>
  );
}
