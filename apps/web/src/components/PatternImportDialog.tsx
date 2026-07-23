import { useEffect, useMemo, useState } from "react";
import { api, type Neta } from "../api";
import { MiniRoll } from "./MiniRoll";
import { sceneTagOf } from "./patternLibrary";
import { genreColor, genreLabel, genreTagOf } from "../genres";

// Task1g（design「### Task1g＝パターン取得を…ライブラリをブラウズ」）：パターン取得を「ネタ選択ダイアログで
// ライブラリ全体を検索/ブラウズして1件選ぶ」形に作り直す pick モードのダイアログ。
// **place モード（PlacePicker＝Section に子を置く）とは別コンポーネント＝place の DOM/挙動は完全 bit 一致**
// （PlacePicker.tsx は無改修）。共通の見た目（dialog 枠・検索・カード＝MiniRoll＋▶試聴・リスト）は
// PlacePicker と同じ CSS クラス（dialog-backdrop/picker-list/picker-item …）＋MiniRoll コンポーネントを再利用する。
//
// pick モードの契約（place と逆・用途別＝design 427-C）：
//  - 母集団＝**ライブラリを見せる**＝`scope:"all"`（工場出荷 library ＋ 自作 project を同 kind で一括）。
//  - kind 固定（開いたエディタ＝chord_pattern / bass / rhythm）。bass は content.mode==="relative" 番兵（contentFilter）。
//  - タップ＝**onPick(neta)**＝placeChild せず・copy_neta 呼ばず・content を呼び側の applyPattern へ返すだけ。
//  - place 専用UI（小節位置パンくず・createInLane・コーパスおすすめ strip）は出さない。

// タグ集合から <prefix> 付きの値を重複なく取り出す（genre:/scene: の絞り込み select 用）。
function tagValues(netas: Neta[], prefix: string): string[] {
  const s = new Set<string>();
  for (const n of netas) for (const t of n.tags ?? []) if (t.startsWith(prefix)) s.add(t.slice(prefix.length));
  return [...s].sort();
}
// 表示名＝ネタ title → content.patternId（chord/bass=top-level・rhythm={rhythm:{patternId}}）→ fallback。
function displayName(n: Neta, fallback: string): string {
  const c = n.content as { patternId?: string; rhythm?: { patternId?: string } } | null;
  return n.title || c?.patternId || c?.rhythm?.patternId || fallback;
}

export function PatternImportDialog({
  kind,
  fallbackName,
  showScene = false,
  contentFilter,
  onPreview,
  onPick,
  onClose,
}: {
  kind: string; // 開いたエディタの kind（固定・多kind混入なし）。
  fallbackName: string; // title/patternId 欠落時のカード名。
  showScene?: boolean; // scene:<role> 絞り＋カードの場面タグ（コード楽器のみ true）。
  contentFilter?: (n: Neta) => boolean; // bass relative 番兵など母集団の追加フィルタ。
  onPreview: (n: Neta) => void; // ▶試聴（呼び側が既存 auditionPattern(content) を注入＝実音経路不変）。
  onPick: (n: Neta) => void; // タップ＝採用（呼び側が既存 applyPattern(content) を注入＝content コピー・copy_neta 不使用）。
  onClose: () => void;
}) {
  const [all, setAll] = useState<Neta[]>([]);
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("");
  const [scene, setScene] = useState("");
  const [loading, setLoading] = useState(true);

  // 母集団取得＝ライブラリ＋自作を同 kind で一括（scope:"all"＝工場出荷 library も見せる＝pick は「ライブラリを見せる」）。
  useEffect(() => {
    let live = true;
    setLoading(true);
    void api
      .listNeta({ kind, scope: "all", limit: 500 })
      .then((ns) => live && setAll(contentFilter ? ns.filter(contentFilter) : ns))
      .catch(() => live && setAll([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const genres = useMemo(() => tagValues(all, "genre:"), [all]);
  const scenes = useMemo(() => tagValues(all, "scene:"), [all]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((n) => {
      if (genre && !(n.tags ?? []).includes(`genre:${genre}`)) return false;
      if (scene && !(n.tags ?? []).includes(`scene:${scene}`)) return false;
      if (needle && !`${n.title ?? ""} ${n.text ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, q, genre, scene]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog pattern-import" role="dialog" aria-label="pattern-import" onClick={(e) => e.stopPropagation()}>
        <header className="picker-head">
          <span className="picker-crumb">
            <span className="crumb-fix">ライブラリから読み込む</span>
          </span>
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="picker-search-row">
          <input
            aria-label="import-search"
            className="editor-tags"
            placeholder="絞り込み…（型名）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {/* genre/scene タグ絞り（chip でなく select）。母集団に在るタグ値だけを出す（seed 済みのみ）。 */}
        <div className="picker-filter-row">
          <select aria-label="import-genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="">ジャンル：すべて</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          {showScene && scenes.length > 0 && (
            <select aria-label="import-scene" value={scene} onChange={(e) => setScene(e.target.value)}>
              <option value="">場面：すべて</option>
              {scenes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
        <div className="picker-list">
          {loading ? (
            <p className="muted">読み込み中…</p>
          ) : list.length === 0 ? (
            <p className="muted">ライブラリに該当パターンがありません（絞り込みを緩めてください）</p>
          ) : (
            list.map((n, i) => {
              // Task1h＝ジャンルの小アクセント（design「### Task1h」）：genre: タグ先頭→色ドット＋日本語ラベル。
              // genre タグ無し/未知＝genreColor が ""＝ドット・ラベルを出さない（純追加＝自作パターンでも崩れない）。
              const g = genreTagOf(n);
              const gc = g ? genreColor(g) : "";
              return (
              <div key={n.id} className="picker-item" data-kind={n.kind} aria-label={`import-card-${i}`}>
                {/* タップ＝onPick(neta)＝content を呼び側へ返す（placeChild/copy_neta 不使用）。 */}
                <button type="button" className="picker-item-tap" aria-label={`import-pick-${i}`} onClick={() => onPick(n)}>
                  <div className="picker-item-roll">
                    <MiniRoll neta={n} />
                  </div>
                  <div className="picker-item-meta">
                    <strong>{displayName(n, fallbackName)}</strong>
                    {(gc || (showScene && sceneTagOf(n))) && (
                      <span className="pi-meta-row">
                        {gc && (
                          <span className="pi-genre" aria-label={`import-genre-tag-${i}`}>
                            <span className="pi-genre-dot" style={{ background: gc }} aria-hidden="true" />
                            {genreLabel(g!)}
                          </span>
                        )}
                        {showScene && sceneTagOf(n) && <span className="muted">{sceneTagOf(n)}</span>}
                      </span>
                    )}
                  </div>
                </button>
                <button type="button" className="picker-play" aria-label={`import-preview-${i}`} title="試聴" onClick={() => onPreview(n)}>
                  ▶
                </button>
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
