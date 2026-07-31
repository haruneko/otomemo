// スライス5「歌詞を通しで読む面」＝全画面（design §31-9/§31-10・設計WF統合 2026-07-31）。
// 姿は有力仮説（態A既定＝1句1行・表記が主役・読み/高低/メロ帯は[表示]でトグル・メロ帯はMiniRoll流用）。
// 骨格の机(SkeletonDesk)に倣う全画面。曲を1回読んで句を時間順に並べる（collectLyricRows）。
// コンセプト死守：機械は音韻/イントネーションまで・意味/感情は人・点数を付けない・表記は常に読める。
import { useEffect, useMemo, useState } from "react";
import { api, type CompositionNode, type Neta } from "../api";
import { collectLyricRows, type OverviewRow } from "../lyricOverview";
import { MiniRoll } from "./MiniRoll";

const PARTS_KEY = "cm-lyric-view-parts";
interface Parts { yomi: boolean; pitch: boolean; melody: boolean; facts: boolean; bar: boolean }
const DEFAULT_PARTS: Parts = { yomi: false, pitch: false, melody: false, facts: true, bar: true };
function readParts(): Parts {
  try { return { ...DEFAULT_PARTS, ...JSON.parse(localStorage.getItem(PARTS_KEY) || "{}") }; } catch { return DEFAULT_PARTS; }
}

// 欠けの事実を淡色チップの言葉に（内輪語なし・色分けでなく事実で）。
function factChips(f: OverviewRow["facts"]): string[] {
  const out: string[] = [];
  if (f.jiamari) out.push(`字余り${f.jiamari}`);
  if (f.jitarazu) out.push(`字足らず${f.jitarazu}`);
  if (f.midMelody) out.push("メロが途中");
  if (f.noMelody) out.push("メロなし");
  if (f.noLyric) out.push("詞なし");
  return out;
}

// 高低（2段）＝￣高/＿低のステップ（読みの hl から・機械の担当＝イントネーション）。
function HlLine({ hl }: { hl: (0 | 1 | null)[] }) {
  return (
    <span className="lo-hl" aria-hidden="true">
      {hl.map((v, i) => <span key={i} className={v === 1 ? "hi" : v === 0 ? "lo" : "un"}>{v === 1 ? "￣" : v === 0 ? "＿" : "・"}</span>)}
    </span>
  );
}

export function LyricOverview({ songNetaId, onClose }: { songNetaId: string; onClose: () => void }) {
  const [comp, setComp] = useState<CompositionNode | null>(null);
  const [parts, setParts] = useState<Parts>(readParts);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void api.getComposition(songNetaId).then((c) => live && setComp(c)).catch(() => live && setComp(null));
    return () => { live = false; };
  }, [songNetaId]);

  const { sections, rows } = useMemo(() => collectLyricRows(comp), [comp]);
  const setPart = (k: keyof Parts, v: boolean) => {
    const next = { ...parts, [k]: v };
    setParts(next);
    try { localStorage.setItem(PARTS_KEY, JSON.stringify(next)); } catch { /* localStorage 無い環境は覚えないだけ */ }
  };
  const anyOptional = parts.yomi || parts.pitch || parts.melody; // [表示]が何か出している合図
  const title = comp?.neta.title || "この曲";

  // セクションごとに行を束ねて描く（セクション見出し→その句たち）。
  const bySection = new Map<number, OverviewRow[]>();
  for (const r of rows) { const a = bySection.get(r.sectionIndex) ?? []; a.push(r); bySection.set(r.sectionIndex, a); }

  return (
    <div className="lyric-overview" aria-label="lyric-overview">
      <div className="lo-head">
        <button type="button" className="lo-back" aria-label="lo-close" onClick={onClose}>← 戻る</button>
        <span className="lo-title">{title}</span>
        <button type="button" className={"lo-show" + (anyOptional ? " on" : "")} aria-label="lo-show-parts" onClick={() => setSheetOpen((v) => !v)}>
          表示{anyOptional ? " ●" : ""}
        </button>
      </div>

      {sheetOpen && (
        <div className="lo-sheet" aria-label="lo-parts-sheet">
          <label><input type="checkbox" aria-label="part-yomi" checked={parts.yomi} onChange={(e) => setPart("yomi", e.target.checked)} />読み（かな）</label>
          <label><input type="checkbox" aria-label="part-pitch" checked={parts.pitch} onChange={(e) => setPart("pitch", e.target.checked)} />高低（イントネーション）</label>
          <label><input type="checkbox" aria-label="part-melody" checked={parts.melody} onChange={(e) => setPart("melody", e.target.checked)} />メロの形</label>
          <label><input type="checkbox" aria-label="part-facts" checked={parts.facts} onChange={(e) => setPart("facts", e.target.checked)} />欠け・字余りの印</label>
          <label><input type="checkbox" aria-label="part-bar" checked={parts.bar} onChange={(e) => setPart("bar", e.target.checked)} />小節番号</label>
          <button type="button" className="lo-reset" onClick={() => { setParts(DEFAULT_PARTS); try { localStorage.setItem(PARTS_KEY, JSON.stringify(DEFAULT_PARTS)); } catch { /* noop */ } }}>既定に戻す</button>
        </div>
      )}

      <div className="lo-body">
        {comp === null ? (
          <p className="muted lo-empty">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="muted lo-empty">この曲にはまだ歌詞がありません。</p>
        ) : (
          sections.map((sec, si) => (
            <section key={si} className="lo-section">
              <div className="lo-section-head">
                <span className="lo-section-label">{sec.label}</span>
                <span className="lo-section-bars muted">{sec.startBar === sec.endBar ? `${sec.startBar}小節` : `${sec.startBar}–${sec.endBar}小節`}</span>
              </div>
              {(bySection.get(si) ?? []).map((r, ri) => (
                <div key={ri} className={"lo-row" + (r.text.trim() ? "" : " empty")}>
                  {parts.bar && <span className="lo-bar muted">{r.startBar}</span>}
                  <div className="lo-row-main">
                    <span className="lo-text">{r.text.trim() || "（詞なし）"}</span>
                    {parts.yomi && r.kana && <span className="lo-yomi muted">{r.kana}</span>}
                    {parts.pitch && r.hl && r.hl.length > 0 && <HlLine hl={r.hl} />}
                    {parts.melody && r.notes.length > 0 && (
                      <span className="lo-melody"><MiniRoll neta={{ kind: "melody", content: { notes: r.notes } } as unknown as Neta} notes={r.notes} /></span>
                    )}
                  </div>
                  {parts.facts && factChips(r.facts).map((c, i) => <span key={i} className="lo-fact muted">{c}</span>)}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
