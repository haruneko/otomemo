// スライス5「歌詞を通しで読む面」＝全画面（design §31-9/§31-10・設計WF統合 2026-07-31）。
// 姿は有力仮説（態A既定＝1句1行・表記が主役・読み/高低/メロ帯は[表示]でトグル・メロ帯はMiniRoll流用）。
// 骨格の机(SkeletonDesk)に倣う全画面。曲を1回読んで句を時間順に並べる（collectLyricRows）。
// 「読む面」だが打てる（推敲でその場に直す）＝既存句はインライン編集・詞なし位置には句を書ける／
// セクション末の「＋句を足す」は(い-c)遅延生成＝メロ作成＋配置を1操作・確定で生む・失敗で孤児を作らない。
// コンセプト死守：機械は音韻/イントネーションまで・意味/感情は人・点数を付けない・表記は常に読める。
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type CompositionNode, type Neta } from "../api";
import { beatsPerBar } from "../music";
import { roleInfo, ROLE_KEYS, stripPositions } from "../formStrip";
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
  const [editing, setEditing] = useState<{ netaId: string; phraseIndex: number } | null>(null); // □/表記のインライン編集中
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [partMenu, setPartMenu] = useState(false); // ＋パートを足すの役割メニュー
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  const refetch = () => api.getComposition(songNetaId).then((c) => setComp(c)).catch(() => setComp(null));
  useEffect(() => { let live = true; void api.getComposition(songNetaId).then((c) => live && setComp(c)).catch(() => live && setComp(null)); return () => { live = false; }; }, [songNetaId]);
  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  const { sections, rows, songNextBeat } = useMemo(() => collectLyricRows(comp), [comp]);
  const setPart = (k: keyof Parts, v: boolean) => {
    const next = { ...parts, [k]: v };
    setParts(next);
    try { localStorage.setItem(PARTS_KEY, JSON.stringify(next)); } catch { /* localStorage 無い環境は覚えないだけ */ }
  };
  const anyOptional = parts.yomi || parts.pitch || parts.melody;
  const title = comp?.neta.title || "この曲";

  // 句の表記を保存。**空にしても消さず□（プレイスホルダ）として残す**（2026-07-31 裁定＝四角い穴を開けて埋める）。
  // phraseIndex=-1＝詞なしメロへ句を新設。曲の句（netaId=曲）もメロの句も同じ経路（updateNeta content.lyric）。
  async function saveText(netaId: string, phraseIndex: number, text: string) {
    setBusy(true);
    try {
      const fresh = await api.getNeta(netaId);
      const content: { notes?: unknown; lyric?: { phrases: { id: string; start: number; beats: number; text: string }[] } } =
        JSON.parse(JSON.stringify(fresh?.content ?? {}));
      const layer = content.lyric ?? { phrases: [] };
      if (phraseIndex >= 0 && layer.phrases[phraseIndex]) {
        layer.phrases[phraseIndex] = { ...layer.phrases[phraseIndex]!, text }; // 空＝□のまま（消さない）
      } else if (phraseIndex < 0) {
        layer.phrases.push({ id: newPhraseId(), start: 0, beats: beatsPerBar(fresh?.meter), text });
      }
      content.lyric = layer.phrases.length ? layer : undefined;
      await api.updateNeta(netaId, { content });
      await refetch();
    } finally { setBusy(false); setEditing(null); setDraft(""); }
  }

  // ＋ここに歌詞＝**曲に□の穴（text 空の句）を開ける**（メロは作らない＝(い-c) は穴に適用しない・メロ化は後段）。
  // 曲が歌詞の穴・下書きを持つ（2026-07-31 裁定）。開けた□はそのまま残り、タップで埋めると文字になる。
  async function addHole(sec: OverviewSection) {
    setBusy(true);
    try {
      const fresh = await api.getNeta(songNetaId);
      const content: { lyric?: { phrases: { id: string; start: number; beats: number; text: string }[] } } =
        JSON.parse(JSON.stringify(fresh?.content ?? {}));
      const layer = content.lyric ?? { phrases: [] };
      layer.phrases.push({ id: newPhraseId(), start: sec.startBeat, beats: beatsPerBar(fresh?.meter), text: "" });
      content.lyric = layer;
      await api.updateNeta(songNetaId, { content });
      await refetch();
    } finally { setBusy(false); }
  }

  // メロにする＝曲の句（□/詞先の下書き）から**メロを作って配置し、曲側からは外す**（(い-c) 遅延生成でメロ化）。
  // ＝詞先→曲先の橋。失敗したら作った実体を消す（孤児を作らない）。
  async function makeMelody(row: OverviewRow) {
    const sec = sections[row.sectionIndex];
    if (!sec) return;
    setBusy(true);
    let created: string | null = null;
    try {
      const songFresh = await api.getNeta(songNetaId);
      const songContent: { lyric?: { phrases: { id: string; start: number; beats: number; text: string }[] } } =
        JSON.parse(JSON.stringify(songFresh?.content ?? {}));
      const phrase = songContent.lyric?.phrases[row.phraseIndex];
      if (!phrase) { setBusy(false); return; }
      const relPos = Math.max(0, phrase.start - sec.startBeat); // 曲拍→セクション内相対拍
      const melody = await api.createNeta({
        kind: "melody", scope: "project",
        content: { notes: [], lyric: { phrases: [{ ...phrase, start: 0 }] } },
      });
      created = melody.id;
      await api.placeChild(sec.netaId, melody.id, relPos, 999);
      songContent.lyric!.phrases.splice(row.phraseIndex, 1); // 曲側から外す（メロへ移った）
      const nextSong = songContent.lyric!.phrases.length ? songContent : { ...songContent, lyric: undefined };
      await api.updateNeta(songNetaId, { content: nextSong });
      await refetch();
    } catch {
      if (created) { try { await api.deleteNeta(created); } catch { /* 掃除失敗は握りつぶす */ } }
    } finally { setBusy(false); }
  }

  // 曲の□/下書きを消す（メロは触らない）。
  async function deleteHole(row: OverviewRow) {
    setBusy(true);
    try {
      const fresh = await api.getNeta(songNetaId);
      const content: { lyric?: { phrases: unknown[] } } = JSON.parse(JSON.stringify(fresh?.content ?? {}));
      content.lyric?.phrases.splice(row.phraseIndex, 1);
      const next = content.lyric?.phrases.length ? content : { ...content, lyric: undefined };
      await api.updateNeta(songNetaId, { content: next });
      await refetch();
    } finally { setBusy(false); }
  }

  // パートを並べ替える（↑/↓）＝セクションの順を入れ替え、position を前置和で振り直す（FormStrip と同じ射影）。
  // ＝末尾に足したAメロ/Bメロを Cメロ の前へ動かせる（曲＝順に並ぶセクション）。
  async function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    setBusy(true);
    try {
      const ordered = sections.map((s) => ({ netaId: s.netaId, dur: Math.max(beatsPerBar(s.meter), s.nextBeat || 0) }));
      [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
      const positions = stripPositions(ordered.map((s) => s.dur));
      // placeChild は追加（compose_edge は同 child を複数置ける）＝先に既存の配置を全部消してから振り直す。
      for (const s of ordered) await api.removeChild(songNetaId, s.netaId);
      for (let i = 0; i < ordered.length; i++) await api.placeChild(songNetaId, ordered[i]!.netaId, positions[i]!, i);
      await refetch();
    } finally { setBusy(false); }
  }

  // ＋パートを足す＝**新しいセクション（Aメロ/Bメロ…）を曲の末尾に開ける**（穴の粒度 曲＞セクション＞句）。
  // ＝歌詞を入れる前に「置き場」を用意する。失敗したら作った実体を消す（孤児を作らない）。
  async function addSection(role: string) {
    setPartMenu(false);
    setBusy(true);
    let created: string | null = null;
    try {
      const song = await api.getNeta(songNetaId);
      const sec = await api.createNeta({ kind: "section", scope: "project", meter: song?.meter ?? undefined, tags: [`role:${role}`], content: {} });
      created = sec.id;
      await api.placeChild(songNetaId, sec.id, songNextBeat, 999);
      await refetch();
    } catch {
      if (created) { try { await api.deleteNeta(created); } catch { /* 掃除失敗は握りつぶす */ } }
    } finally { setBusy(false); }
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
                {/* パートの並べ替え＝末尾に足したパートを狙った位置へ動かす。 */}
                <span className="lo-section-move">
                  <button type="button" aria-label={`lo-move-up-${si}`} title="このパートを上へ" disabled={si === 0} onClick={() => void moveSection(si, -1)}>↑</button>
                  <button type="button" aria-label={`lo-move-down-${si}`} title="このパートを下へ" disabled={si === sections.length - 1} onClick={() => void moveSection(si, 1)}>↓</button>
                </span>
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
                            {r.text.trim()
                              ? <span className="lo-text">{r.text}</span>
                              : <span className="lo-box" aria-label="lo-hole">▭ ここに歌詞</span>}
                          </button>
                        )}
                      {!isEditing && parts.yomi && r.kana && <span className="lo-yomi muted">{r.kana}</span>}
                      {!isEditing && parts.pitch && r.hl && r.hl.length > 0 && <HlLine hl={r.hl} />}
                      {!isEditing && parts.melody && r.notes.length > 0 && (
                        <span className="lo-melody"><MiniRoll neta={{ kind: "melody", content: { notes: r.notes } } as unknown as Neta} notes={r.notes} /></span>
                      )}
                    </div>
                    {!isEditing && parts.facts && factChips(r.facts).map((c, i) => <span key={i} className="lo-fact muted">{c}</span>)}
                    {/* 曲が持つ句（□/詞先の下書き）だけ＝メロにする（詞先→曲先の橋）と消す。 */}
                    {!isEditing && r.netaId === songNetaId && (
                      <span className="lo-row-actions">
                        <button type="button" className="lo-mk-melody" aria-label={`lo-make-melody-${r.phraseIndex}`} title="この句からメロを作る（詞先→曲先）" onClick={() => void makeMelody(r)}>メロにする</button>
                        <button type="button" className="lo-del-hole" aria-label={`lo-del-${r.phraseIndex}`} title="この穴を消す" onClick={() => void deleteHole(r)}>×</button>
                      </span>
                    )}
                  </div>
                );
              })}
              {/* ＋ここに歌詞＝曲に□の穴を開ける（メロは作らない・タップで埋める）。 */}
              <div className="lo-add">
                <button type="button" className="lo-add-btn" aria-label={`lo-add-${si}`} onClick={() => void addHole(sec)}>＋ ここに歌詞</button>
              </div>
            </section>
          ))
        )}
        {/* ＋パートを足す＝新しいセクション（Aメロ/Bメロ…）を曲に開ける＝歌詞を入れる置き場を作る。 */}
        {comp && (
          <div className="lo-add-part">
            <button type="button" className="lo-add-part-btn" aria-label="lo-add-part" onClick={() => setPartMenu((v) => !v)}>＋ パートを足す</button>
            {partMenu && (
              <div className="lo-part-menu" aria-label="lo-part-menu">
                {ROLE_KEYS.map((role) => (
                  <button type="button" key={role} aria-label={`lo-part-${role}`} onClick={() => void addSection(role)}>
                    {roleInfo(role)?.label ?? role}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
