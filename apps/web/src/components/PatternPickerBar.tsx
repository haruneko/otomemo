import { useState } from "react";

// パターン選択の家＝ネタ単体エディタ（修理#1・正典＝docs/research/2026-07-22-performance-editing-architecture-audit.md 推奨差分1）。
// 型辞書の入口を Section「いじる▾」から単体エディタへ持ち込む折りたたみ帯（コード楽器＝ChordPatternEditor／ドラム＝RhythmEditor で共用）。
// **既定閉＝開かなければ候補機構は非活性＝既存エディタの描画・挙動は不変**（開いて初めてジャンルchip→候補→▶試聴→適用）。
// 現在型（patternId）があれば見出しに「いま：<型名>」を表示＝選び直し兼用の家。
// 生成・実音化・採用（onChange）の中身は各エディタが closure で注入＝この帯は器（UI）だけ持つ。
export interface PatternCand {
  key: string; // React key＋dedupe キー（型IDが基本・無ければ content JSON）
  name: string; // 型名（型ID or 「おまかせ」）
  scene?: string; // 場面タグ（コード楽器のみ・ドラムは無し）
  audition: () => void; // ▶試聴（各エディタが notesForContent→startPlayback を注入）
  apply: () => void; // 適用＝content 置換（onChange・Undo に自然に乗る）
}

export function PatternPickerBar({
  nowLabel,
  chips,
  onFetch,
}: {
  nowLabel?: string; // 現在の patternId（あれば「いま：」表示）
  chips: { v: string; label: string }[]; // ジャンルchip（先頭＝おまかせ番兵 v:""）
  onFetch: (genre: string) => Promise<PatternCand[]>; // ジャンル→候補（最大4件）
}) {
  const [open, setOpen] = useState(false);
  const [genre, setGenre] = useState(chips[0]?.v ?? "");
  const [cands, setCands] = useState<PatternCand[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCands = async () => {
    setLoading(true);
    try {
      setCands(await onFetch(genre));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pattern-picker" aria-label="pattern-picker">
      <button
        type="button"
        className="pp-toggle"
        aria-label="pattern-picker-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pp-title">パターンを選ぶ {open ? "▾" : "▸"}</span>
        {nowLabel && <span className="pp-now" aria-label="pattern-now">いま：{nowLabel}</span>}
      </button>
      {open && (
        <div className="pp-body">
          <div className="pp-genres seg" role="group" aria-label="pattern-genres">
            {chips.map((c) => (
              <button
                key={c.v || "omakase"}
                type="button"
                aria-label={`pgenre-${c.v || "omakase"}`}
                className={genre === c.v ? "on" : ""}
                aria-pressed={genre === c.v}
                onClick={() => setGenre(c.v)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" className="pp-fetch" aria-label="pattern-fetch" disabled={loading} onClick={() => void fetchCands()}>
            {loading ? "…" : "候補を出す"}
          </button>
          {cands.length > 0 && (
            <div className="pp-cards" aria-label="pattern-cands">
              {cands.map((cd, i) => (
                <div key={cd.key} className="pp-card" aria-label={`pattern-card-${i}`}>
                  <span className="pp-card-name">{cd.name}</span>
                  {cd.scene && <span className="pp-card-scene muted">{cd.scene}</span>}
                  <button type="button" className="pp-audition" aria-label={`pattern-audition-${i}`} onClick={cd.audition}>▶</button>
                  <button type="button" className="pp-apply primary" aria-label={`pattern-apply-${i}`} onClick={cd.apply}>適用</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
