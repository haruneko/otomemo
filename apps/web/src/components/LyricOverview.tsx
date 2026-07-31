// スライス5「歌詞を通しで読む面」＝全画面（design §31-9/§31-10・設計WF統合 2026-07-31）。
// 姿は有力仮説（態A既定＝1句1行・表記が主役・読み/高低/メロ帯は[表示]でトグル・メロ帯はMiniRoll流用）。
// 骨格の机(SkeletonDesk)に倣う全画面。曲を1回読んで句を時間順に並べる（collectLyricRows）。
// 「読む面」だが打てる（推敲でその場に直す）＝既存句はインライン編集・詞なし位置には句を書ける／
// セクション末の「＋句を足す」は(い-c)遅延生成＝メロ作成＋配置を1操作・確定で生む・失敗で孤児を作らない。
// コンセプト死守：機械は音韻/イントネーションまで・意味/感情は人・点数を付けない・表記は常に読める。
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type CompositionNode, type Neta } from "../api";
import { beatsPerBar } from "../music";
import { collectLyricRows, type OverviewRow, type OverviewSection } from "../lyricOverview";
import { MiniRoll } from "./MiniRoll";

const PARTS_KEY = "cm-lyric-view-parts";
interface Parts { yomi: boolean; pitch: boolean; melody: boolean; facts: boolean; bar: boolean }
const DEFAULT_PARTS: Parts = { yomi: false, pitch: false, melody: false, facts: true, bar: true };
function readParts(): Parts {
  try { return { ...DEFAULT_PARTS, ...JSON.parse(localStorage.getItem(PARTS_KEY) || "{}") }; } catch { return DEFAULT_PARTS; }
}
let phraseSeq = 0;
const newPhraseId = () => `p-${Date.now().toString(36)}-${phraseSeq++}`;

function factChips(f: OverviewRow["facts"]): string[] {
  const out: string[] = [];
  if (f.jiamari) out.push(`字余り${f.jiamari}`);
  if (f.jitarazu) out.push(`字足らず${f.jitarazu}`);
  if (f.midMelody) out.push("メロが途中");
  if (f.noMelody) out.push("メロなし");
  if (f.noLyric) out.push("詞なし");
  return out;
}

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
  const [editing, setEditing] = useState<{ netaId: string; phraseIndex: number } | null>(null); // 表記のインライン編集中
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<number | null>(null); // ＋句を足す中のセクションindex
  const [addDraft, setAddDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  const refetch = () => api.getComposition(songNetaId).then((c) => setComp(c)).catch(() => setComp(null));
  useEffect(() => { let live = true; void api.getComposition(songNetaId).then((c) => live && setComp(c)).catch(() => live && setComp(null)); return () => { live = false; }; }, [songNetaId]);
  useEffect(() => { if (editing || adding !== null) editRef.current?.focus(); }, [editing, adding]);

  const { sections, rows } = useMemo(() => collectLyricRows(comp), [comp]);
  const setPart = (k: keyof Parts, v: boolean) => {
    const next = { ...parts, [k]: v };
    setParts(next);
    try { localStorage.setItem(PARTS_KEY, JSON.stringify(next)); } catch { /* localStorage 無い環境は覚えないだけ */ }
  };
  const anyOptional = parts.yomi || parts.pitch || parts.melody;
  const title = comp?.neta.title || "この曲";

  // 既存句の表記を保存（空にしたら句を消す＝PianoRoll と同じ約束）。phraseIndex=-1＝詞なしメロへ句を新設。
  async function saveText(netaId: string, phraseIndex: number, text: string) {
    setBusy(true);
    try {
      const fresh = await api.getNeta(netaId);
      const content: { notes?: unknown; lyric?: { phrases: { id: string; start: number; beats: number; text: string }[] } } =
        JSON.parse(JSON.stringify(fresh?.content ?? {}));
      const layer = content.lyric ?? { phrases: [] };
      const t = text.trim();
      if (phraseIndex >= 0) {
        if (!t) layer.phrases.splice(phraseIndex, 1); // 空＝句ごと消す
        else layer.phrases[phraseIndex] = { ...layer.phrases[phraseIndex]!, text };
      } else if (t) {
        layer.phrases.push({ id: newPhraseId(), start: 0, beats: beatsPerBar(fresh?.meter), text });
      }
      content.lyric = layer.phrases.length ? layer : undefined;
      await api.updateNeta(netaId, { content });
      await refetch();
    } finally { setBusy(false); setEditing(null); setDraft(""); }
  }

  // ＋句を足す＝(い-c) 遅延生成：メロ作成＋配置を1操作。失敗したら作った実体を消す（孤児を作らない）。
  async function addPhrase(sec: OverviewSection, text: string) {
    const t = text.trim();
    if (!t) { setAdding(null); setAddDraft(""); return; }
    setBusy(true);
    let created: string | null = null;
    try {
      const bpb = beatsPerBar(sec.meter);
      const melody = await api.createNeta({
        kind: "melody", scope: "project",
        content: { notes: [], lyric: { phrases: [{ id: newPhraseId(), start: 0, beats: bpb, text }] } },
      });
      created = melody.id;
      await api.placeChild(sec.netaId, melody.id, sec.nextBeat, 999);
      await refetch();
    } catch {
      if (created) { try { await api.deleteNeta(created); } catch { /* 掃除の失敗は握りつぶす（本エラーを優先） */ } }
    } finally { setBusy(false); setAdding(null); setAddDraft(""); }
  }

  const bySection = new Map<number, OverviewRow[]>();
  for (const r of rows) { const a = bySection.get(r.sectionIndex) ?? []; a.push(r); bySection.set(r.sectionIndex, a); }

  const editorBar = (value: string, onChange: (v: string) => void, onCommit: () => void, onCancel: () => void, ph: string) => (
    <textarea
      ref={editRef} className="lo-edit" aria-label="lo-edit" rows={1} value={value} placeholder={ph}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCommit(); } else if (e.key === "Escape") onCancel(); }}
      onBlur={onCommit}
    />
  );

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

      <div className="lo-body" aria-busy={busy}>
        {comp === null ? (
          <p className="muted lo-empty">読み込み中…</p>
        ) : sections.length === 0 ? (
          <p className="muted lo-empty">この曲にはまだセクションがありません。</p>
        ) : (
          sections.map((sec, si) => (
            <section key={si} className="lo-section">
              <div className="lo-section-head">
                <span className="lo-section-label">{sec.label}</span>
                <span className="lo-section-bars muted">{sec.startBar === sec.endBar ? `${sec.startBar}小節` : `${sec.startBar}–${sec.endBar}小節`}</span>
              </div>
              {(bySection.get(si) ?? []).map((r, ri) => {
                const isEditing = editing && editing.netaId === r.netaId && editing.phraseIndex === r.phraseIndex;
                return (
                  <div key={ri} className={"lo-row" + (r.text.trim() ? "" : " empty")}>
                    {parts.bar && <span className="lo-bar muted">{r.startBar}</span>}
                    <div className="lo-row-main">
                      {isEditing
                        ? editorBar(draft, setDraft, () => void saveText(r.netaId, r.phraseIndex, draft), () => { setEditing(null); setDraft(""); }, "表記を直す（Enterで確定）")
                        : (
                          <button type="button" className="lo-text-btn" aria-label={`lo-edit-row-${r.netaId}-${r.phraseIndex}`}
                            onClick={() => { setEditing({ netaId: r.netaId, phraseIndex: r.phraseIndex }); setDraft(r.text); }}>
                            <span className="lo-text">{r.text.trim() || "（詞なし・タップで書く）"}</span>
                          </button>
                        )}
                      {!isEditing && parts.yomi && r.kana && <span className="lo-yomi muted">{r.kana}</span>}
                      {!isEditing && parts.pitch && r.hl && r.hl.length > 0 && <HlLine hl={r.hl} />}
                      {!isEditing && parts.melody && r.notes.length > 0 && (
                        <span className="lo-melody"><MiniRoll neta={{ kind: "melody", content: { notes: r.notes } } as unknown as Neta} notes={r.notes} /></span>
                      )}
                    </div>
                    {!isEditing && parts.facts && factChips(r.facts).map((c, i) => <span key={i} className="lo-fact muted">{c}</span>)}
                  </div>
                );
              })}
              {/* ＋句を足す＝(い-c) 遅延生成（確定で生む）。 */}
              <div className="lo-add">
                {adding === si
                  ? editorBar(addDraft, setAddDraft, () => void addPhrase(sec, addDraft), () => { setAdding(null); setAddDraft(""); }, "ここに詞を書く（Enterで生まれる）")
                  : <button type="button" className="lo-add-btn" aria-label={`lo-add-${si}`} onClick={() => { setAdding(si); setAddDraft(""); }}>＋ 句を足す</button>}
              </div>
            </section>
          ))
        )}
        {comp && sections.length > 0 && rows.length === 0 && <p className="muted lo-hint">このセクションに「＋句を足す」で詞を書けます。</p>}
      </div>
    </div>
  );
}
