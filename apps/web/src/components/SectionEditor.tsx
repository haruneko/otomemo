import { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { api, type Neta, type CompositionNode } from "../api";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";

// レーンの1セル＝ドロップ先（#52②c）。kind が合えばカードを落として配置。
function LaneCell({
  laneKey,
  kinds,
  bar,
  position,
  onTap,
  disabled,
}: {
  laneKey: string;
  kinds: readonly string[];
  bar: number;
  position: number;
  onTap: (position: number) => void;
  disabled?: boolean; // 単一パートが埋まってる＝置けない（CV3）
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${laneKey}-${bar}`, data: { kinds, position }, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={"lane-cell" + (isOver ? " over" : "") + (disabled ? " locked" : "")}
      aria-label={`place-${laneKey}-${bar}`}
      disabled={disabled}
      onClick={() => !disabled && onTap(position)}
    />
  );
}
import {
  notesForContent,
  compositeNotes,
  downloadMidi,
  downloadMultitrackMidi,
  playNotes,
  type Note,
  type PlaybackHandle,
} from "../music";
import { MiniRoll } from "./MiniRoll";
import { harmonyVoice } from "../harmony";

// 配置タイムライン（design #19）。section/song を メロ/コード/ベース/リズムの4レーン×小節 で組む。
// レーンは子の kind から導出（スキーマ変更なし）。空セルをタップ→ネタを選んで置く。
// 調/テンポは section が支配。rhythm(ドラム)は移調しない。
// レーン順＝層モデル（進行が一番上→メロ→コード楽器→ベース→リズム→ネスト）。
// 配置は「占有セルのみ不可」＝同じ位置に二重で置けないだけ（別小節には自由に置ける・CV3 是正）。
const LANES = [
  { key: "chord", label: "コード進行", kinds: ["chord", "chord_progression"] },
  { key: "melody", label: "メロ", kinds: ["melody"] },
  { key: "chord_pattern", label: "コード楽器", kinds: ["chord_pattern"] },
  { key: "bass", label: "ベース", kinds: ["bass"] },
  { key: "rhythm", label: "リズム", kinds: ["rhythm"] },
  { key: "section", label: "セクション", kinds: ["section"] }, // #15 section をネスト配置
] as const;
const BARS = 8;

// #51: 拍子(meter "n/d")から1小節の拍数を導出。beat=四分=1.0 基準で num*4/den。
// 4/4→4.0、6/8→3.0、3/4→3.0。未指定/不正は 4/4。
export function beatsPerBar(meter: string | null | undefined): number {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return 4;
  const num = Number(m[1]);
  const den = Number(m[2]);
  return num > 0 && den > 0 ? (num * 4) / den : 4;
}

type Lane = (typeof LANES)[number];
type Child = CompositionNode["children"][number];

// ③ ループ伸ばしのタイル位置＝元ブロック(fromPos)の後ろに unit 刻みで反復（各ループが endBeat と
// グリッド total 内に完全に収まる位置だけ）。純関数＝配置の契約としてテストする。
export function loopPositions(fromPos: number, unit: number, endBeat: number, total: number): number[] {
  const out: number[] = [];
  if (unit <= 0) return out;
  for (let p = fromPos + unit; p + unit <= endBeat + 1e-6 && p + unit <= total + 1e-6; p += unit) {
    out.push(Math.round(p * 1e6) / 1e6);
  }
  return out;
}

// #83/#55 曲(song)の段階・次の一手パネル。song overlay を読み込み、編集して保存（blur時）。
function SongStatus({ netaId }: { netaId: string }) {
  const [stage, setStage] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    void api.getSong(netaId).then((s) => {
      if (live && s) {
        setStage(s.stage ?? "");
        setNextAction(s.next_action ?? "");
      }
    });
    return () => {
      live = false;
    };
  }, [netaId]);
  async function save() {
    await api.updateSong(netaId, { stage: stage || null, next_action: nextAction || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div className="song-status">
      <label>
        段階
        <input
          value={stage}
          placeholder="ラフ / アレンジ / 詞 / ミックス…"
          onChange={(e) => setStage(e.target.value)}
          onBlur={save}
        />
      </label>
      <label>
        次の一手
        <input
          value={nextAction}
          placeholder="サビのメロを詰める…"
          onChange={(e) => setNextAction(e.target.value)}
          onBlur={save}
        />
      </label>
      {saved && <span className="song-status-saved">✓</span>}
    </div>
  );
}

export function SectionEditor({
  neta,
  keyPc,
  tempo,
  meter,
  reloadSignal,
  onChanged,
}: {
  neta: Neta;
  keyPc: number;
  tempo: number;
  meter?: string; // 編集中ライブ反映用（未指定は neta.meter）
  reloadSignal?: number; // 外部(D&D配置)からの再読込トリガ
  onChanged?: () => void;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [picker, setPicker] = useState<{ lane: Lane; position: number; all: Neta[] } | null>(null);
  // ③ 右端ドラッグでループ伸ばし中のプレビュー（fromPos〜endBeat をゴースト表示）。
  const [drag, setDrag] = useState<{ childId: string; laneKey: string; fromPos: number; unit: number; endBeat: number } | null>(null);
  const [pq, setPq] = useState(""); // ピッカーの絞り込み
  // ②文脈系：この進行に◯を生成（section のコード＋frame から候補→試聴→レーンに置く）。
  const [cand, setCand] = useState<{ kind: string; content: unknown } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const candPlay = useRef<PlaybackHandle | null>(null);
  const lastPartRef = useRef<{ op: string; needsChords: boolean; prog?: number; label: string } | null>(null);
  const BPB = beatsPerBar(meter ?? neta.meter); // 1小節の拍数（#51・編集中はprop優先）
  const TOTAL = BARS * BPB;
  // #49/#58/#59 トランスポート。合成結果を再生／プレイヘッドは TOTAL(グリッド全体)尺・拍子BPB。
  const tp = useTransport(() => composite(), tempo, { scaleBeats: TOTAL, bpb: BPB });

  // Space=合成再生/一時停止（design #59）。入力中は無効。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      tp.playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tp.playPause]);

  const load = useCallback(async () => {
    const tree = await api.getComposition(neta.id);
    setChildren(tree.children);
  }, [neta.id]);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const inLane = (lane: Lane, kind: string) => (lane.kinds as readonly string[]).includes(kind);
  const laneOf = (kind: string) => LANES.find((l) => inLane(l, kind));
  const laneChildren = (lane: Lane) => children.filter((c) => inLane(lane, c.node.neta.kind));
  const others = children.filter((c) => !laneOf(c.node.neta.kind));

  function childDur(c: Child): number {
    const ns = notesForContent(c.node.neta.kind, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  }

  // その位置が既にブロックで埋まっているか（レーン全体でなく**占有セルだけ**不可＝別小節には置ける）。
  const occupiedAt = (lane: Lane, position: number) =>
    laneChildren(lane).some((c) => c.position <= position + 1e-6 && position < c.position + childDur(c) - 1e-6);
  async function openPicker(lane: Lane, position: number) {
    if (occupiedAt(lane, position)) return; // 既に埋まってる所には置かせない（CV3・占有セルのみ）
    // project＋library 両方を候補に（library=連想元コーパス・椎名林檎等）。種別は picker 内で切替。
    const all = await api.listNeta({ scope: "all", limit: 2000 });
    setPq("");
    setPicker({ lane, position, all });
  }
  async function placeAt(child: Neta) {
    if (!picker) return;
    try {
      // ライブラリ項目は project にコピーしてから配置（元コーパスを汚さない・編集はコピー側）。
      const target = child.scope === "library" ? await api.copyNeta(child.id) : child;
      await api.placeChild(neta.id, target.id, picker.position, children.length);
    } catch {
      // section ネストで循環になる配置は core が拒否（400）→ そっと無視（配置しない）
      setPicker(null);
      return;
    }
    setPicker(null);
    await load();
    onChanged?.();
  }
  async function remove(childId: string, position?: number) {
    await api.removeChild(neta.id, childId, position);
    await load();
    onChanged?.();
  }

  // ③ 右端ドラッグでループ伸ばし＝同じ子を小節境界のループ単位でタイル反復配置（compose_edge は
  // PKに position を含み反復配置可・#54＝スキーマ不要）。縮めたらこの子の反復だけ末尾から外す。
  function beatFromClientX(clientX: number, trackEl: HTMLElement): number {
    const r = trackEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return ratio * TOTAL;
  }
  function onGripDown(e: React.PointerEvent, c: Child, lane: Lane) {
    e.stopPropagation(); // ブロック本体の onClick(=外す) を抑止
    e.preventDefault();
    const trackEl = (e.currentTarget as HTMLElement).closest(".lane-track") as HTMLElement | null;
    if (!trackEl) return;
    const unit = Math.max(BPB, Math.ceil(childDur(c) / BPB) * BPB); // ループ単位＝小節境界に丸めた子の尺
    const clamp = (x: number) => Math.max(c.position + unit, Math.min(TOTAL, beatFromClientX(x, trackEl)));
    const move = (ev: PointerEvent) =>
      setDrag({ childId: c.node.neta.id, laneKey: lane.key, fromPos: c.position, unit, endBeat: clamp(ev.clientX) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const end = clamp(ev.clientX);
      setDrag(null);
      void applyLoop(c, lane, unit, end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  async function applyLoop(c: Child, lane: Lane, unit: number, endBeat: number) {
    const childId = c.node.neta.id;
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
    // 反復させたい位置（元ブロック fromPos は据え置き、以降 unit 刻み・グリッド内・各ループが収まる範囲）。
    const wanted = loopPositions(c.position, unit, endBeat, TOTAL);
    const existing = laneChildren(lane)
      .filter((x) => x.node.neta.id === childId && x.position > c.position + 1e-6)
      .map((x) => x.position);
    // 追加：wanted で未配置かつ他ブロックに占有されてない所へ（同じ ord=行を維持）。
    for (const p of wanted) {
      if (existing.some((e) => near(e, p))) continue;
      if (occupiedAt(lane, p)) continue;
      await api.placeChild(neta.id, childId, p, c.ord).catch(() => {});
    }
    // 削除：縮めた分＝existing で wanted に無いこの子の反復だけ外す（他の子や元ブロックは触らない）。
    for (const e of existing) {
      if (!wanted.some((p) => near(p, e))) await api.removeChild(neta.id, childId, e).catch(() => {});
    }
    await load();
    onChanged?.();
  }

  // ②文脈系：この進行にメロ。section のコード進行を1本に連結（各コード子を小節位置ぶんオフセット）。
  function sectionChords() {
    const chordLane = LANES.find((l) => l.key === "chord")!;
    const out: { root?: number; quality?: string; start?: number; dur?: number }[] = [];
    for (const c of laneChildren(chordLane)) {
      const content = c.node.neta.content as { chords?: typeof out } | null;
      const offset = (c.position ?? 0) * BPB;
      for (const ch of content?.chords ?? []) out.push({ ...ch, start: (ch.start ?? 0) + offset });
    }
    return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  }
  // 生成パーツ（この進行に◯）。メロ/ベースはコードが要る、ドラムは frame だけ。
  const GEN_PARTS = [
    { label: "メロ", op: "gen_melody", needsChords: true, prog: 0 },
    { label: "ベース", op: "gen_bass", needsChords: true, prog: 33 },
    { label: "ドラム", op: "gen_drums", needsChords: false, prog: undefined },
  ] as const;
  const progForKind = (kind: string) => (kind === "bass" ? 33 : kind === "rhythm" ? undefined : 0);
  async function genPart(part: { op: string; needsChords: boolean; prog?: number; label: string }) {
    if (genBusy) return;
    lastPartRef.current = part;
    const chords = sectionChords();
    if (part.needsChords && !chords.length) return;
    setGenBusy(true);
    try {
      const r = await api.music<{ items: { kind: string; content: unknown }[] }>(part.op, {
        frame: { key: keyPc, meter: neta.meter, tempo, bars: BARS },
        chords,
        seed: Math.floor(Math.random() * 1e6), // 押すたび別案
      });
      const item = r.items?.[0];
      if (item) setCand({ kind: item.kind, content: item.content });
    } finally {
      setGenBusy(false);
    }
  }
  // メロレーンの（最初の）メロ notes＝ハモリ/fit の入力。
  function melodyLaneNotes(): Note[] {
    const ml = LANES.find((l) => l.key === "melody")!;
    const c = laneChildren(ml)[0];
    return c ? notesForContent("melody", c.node.neta.content) : [];
  }
  const isMinor = (neta.mode ?? "").toLowerCase().includes("min");
  // ハモリ（上/下＝並行第2声部・調内平行3度・決定的）。候補→メロレーンに置く（原メロと重なって鳴る）。
  function makeHarmony(degSteps: number) {
    const mel = melodyLaneNotes();
    if (!mel.length) return;
    lastPartRef.current = null; // 決定的＝別案なし
    setCand({ kind: "melody", content: { notes: harmonyVoice(mel, keyPc, isMinor, degSteps) } });
  }
  // コードに合わせる（fit_to_chords）：メロの各音を近いコードトーンへ寄せた候補。
  async function fitToChords() {
    const mel = melodyLaneNotes();
    const chords = sectionChords();
    if (!mel.length || !chords.length || genBusy) return;
    setGenBusy(true);
    try {
      const r = await api.music<{ notes: Note[] }>("fit_to_chords", { melody: mel, chords, key: keyPc });
      lastPartRef.current = null;
      if (r.notes?.length) setCand({ kind: "melody", content: { notes: r.notes } });
    } finally {
      setGenBusy(false);
    }
  }
  // 噛み合い診断（analyze_fit・読むだけ）：メロ×コードの当てはまりを一言で。
  const [fitReport, setFitReport] = useState<string | null>(null);
  async function analyzeFit() {
    const mel = melodyLaneNotes();
    const chords = sectionChords();
    if (!mel.length || !chords.length) return;
    const r = await api.music<{ score: number; inChordRate: number; issues?: string[] }>("analyze_fit", {
      melody: mel,
      chords,
      key: keyPc,
    });
    const pct = Math.round((r.inChordRate ?? 0) * 100);
    const verdict = r.score >= 0.75 ? "よく噛み合ってる" : r.score >= 0.5 ? "まあまあ" : "ズレ気味";
    setFitReport(`噛み合い：${verdict}（コードトーン率 ${pct}%${r.issues?.length ? "・" + r.issues[0] : ""}）`);
  }
  async function auditionCandidate() {
    candPlay.current?.stop();
    if (!cand) return;
    const ns = notesForContent(cand.kind, cand.content);
    if (ns.length) candPlay.current = await playNotes(ns, tempo, { program: progForKind(cand.kind) });
  }
  async function placeCandidate() {
    if (!cand) return;
    candPlay.current?.stop();
    const lane = laneOf(cand.kind);
    const created = await api.createNeta({
      kind: cand.kind,
      title: `${neta.title ?? "曲"} ${lane?.label ?? cand.kind}`,
      content: cand.content,
      key: keyPc,
      tempo,
      meter: neta.meter ?? undefined,
      tags: neta.tags,
    });
    await api.placeChild(neta.id, created.id, 0, children.length);
    setCand(null);
    await load();
    onChanged?.();
  }
  function closeCandidate() {
    candPlay.current?.stop();
    setCand(null);
  }

  // 合成：子を section の調へ移調（rhythm除く）＋位置オフセット（共有: compositeNotes）
  function composite(): Note[] {
    return compositeNotes(children, keyPc, neta.mode);
  }
  // #55 多トラック書出：レーン(メロ/コード/ベース/リズム)別に1トラックずつ。空レーンは省く。
  function laneTracks() {
    return LANES.map((lane) => ({
      name: lane.label,
      notes: compositeNotes(laneChildren(lane), keyPc, neta.mode),
      drum: lane.key === "rhythm",
    })).filter((t) => t.notes.length);
  }

  return (
    <div className="section-editor">
      {neta.kind === "song" && <SongStatus netaId={neta.id} />}
      <div className="section-actions">
        <button
          type="button"
          onClick={() => downloadMidi(composite(), `${neta.title ?? "section"}.mid`, tempo, neta.meter)}
        >
          MIDI
        </button>
        <button
          type="button"
          title="メロ/コード/ベース/リズムを別トラックに分けて書き出す"
          onClick={() =>
            downloadMultitrackMidi(laneTracks(), `${neta.title ?? "section"}-tracks.mid`, tempo, neta.meter)
          }
        >
          MIDI(分割)
        </button>
        {!cand &&
          GEN_PARTS.filter((part) => !part.needsChords || sectionChords().length > 0).map((part) => (
            <button
              key={part.op}
              type="button"
              className="tb-tool"
              aria-label={`gen-${part.op}`}
              title={`この進行に合う${part.label}の候補を生成（決定的・Claude不要）`}
              disabled={genBusy}
              onClick={() => void genPart(part)}
            >
              {genBusy ? "生成中…" : `この進行に${part.label}`}
            </button>
          ))}
        {!cand && melodyLaneNotes().length > 0 && (
          <>
            <button type="button" className="tb-tool" aria-label="harmony-up" title="上ハモ＝調内で平行3度上の第2声部" onClick={() => makeHarmony(2)}>
              上ハモ
            </button>
            <button type="button" className="tb-tool" aria-label="harmony-down" title="下ハモ＝調内で平行3度下の第2声部" onClick={() => makeHarmony(-2)}>
              下ハモ
            </button>
            {sectionChords().length > 0 && (
              <>
                <button type="button" className="tb-tool" aria-label="fit-to-chords" title="メロの各音を近いコードトーンへ寄せる" disabled={genBusy} onClick={() => void fitToChords()}>
                  コードに合わせる
                </button>
                <button type="button" className="tb-tool" aria-label="analyze-fit" title="メロとコードの噛み合いを診断（読むだけ）" onClick={() => void analyzeFit()}>
                  噛み合い診断
                </button>
              </>
            )}
          </>
        )}
      </div>
      {fitReport && (
        <p className="fit-report" aria-label="fit-report" onClick={() => setFitReport(null)}>
          {fitReport} <span className="muted">（タップで消す）</span>
        </p>
      )}

      {cand && (
        <div
          className="reshape-bar"
          aria-label="part-candidate"
          style={{ ["--k" as string]: `var(--k-${cand.kind === "chord_progression" ? "chord" : cand.kind})` }}
        >
          <span className="reshape-label">{laneOf(cand.kind)?.label ?? cand.kind}候補（この進行に生成）</span>
          <button type="button" className="tb-tool" aria-label="audition-candidate" onClick={() => void auditionCandidate()}>
            ▶試聴
          </button>
          <button type="button" className="tb-tool" disabled={genBusy} onClick={() => lastPartRef.current && void genPart(lastPartRef.current)}>
            {genBusy ? "…" : "別案"}
          </button>
          <button type="button" className="tb-tool primary" aria-label="place-candidate" onClick={() => void placeCandidate()}>
            {laneOf(cand.kind)?.label ?? ""}レーンに置く
          </button>
          <button type="button" className="tb-tool" aria-label="close-candidate" onClick={closeCandidate}>
            閉じる
          </button>
        </div>
      )}

      <div className="lanes" aria-label="timeline" ref={tp.scrollerRef}>
        <div className="playhead" aria-hidden="true" ref={tp.lineRef} />
        <div className="lane-ruler">
          <div className="lane-label" />
          <div className="ruler-bars">
            {Array.from({ length: BARS }, (_, b) => (
              <div key={b} className="bar-num">
                {b + 1}
              </div>
            ))}
          </div>
        </div>
        {LANES.map((lane) => (
          <div className="lane" key={lane.key}>
            <div className="lane-label">{lane.label}</div>
            <div className="lane-track">
              {Array.from({ length: BARS }, (_, b) => (
                <LaneCell
                  key={b}
                  laneKey={lane.key}
                  kinds={lane.kinds}
                  bar={b}
                  position={b * BPB}
                  disabled={occupiedAt(lane, b * BPB)}
                  onTap={(pos) => void openPicker(lane, pos)}
                />
              ))}
              {laneChildren(lane).map((c) => (
                <button
                  key={`${c.node.neta.id}@${c.position}`}
                  type="button"
                  className="lane-block"
                  data-kind={c.node.neta.kind}
                  aria-label={`block-${c.node.neta.id}@${c.position}`}
                  title={`${c.node.neta.title ?? c.node.neta.text ?? ""} @${c.position}拍 — タップで外す`}
                  style={{
                    left: `${(c.position / TOTAL) * 100}%`,
                    width: `${(Math.min(childDur(c), TOTAL - c.position) / TOTAL) * 100}%`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(c.node.neta.id, c.position);
                  }}
                >
                  <MiniRoll neta={c.node.neta} />
                  <span className="lane-block-label">
                    {c.node.neta.title ?? c.node.neta.text ?? c.node.neta.kind}
                  </span>
                  {/* ③ 右端グリップ＝ドラッグでループ伸ばし（この子を反復配置）。本体タップ(=外す)とは分離。 */}
                  <span
                    className="block-resize"
                    aria-label={`extend-${c.node.neta.id}@${c.position}`}
                    title="右へドラッグで繰り返し（ループ）"
                    onPointerDown={(e) => onGripDown(e, c, lane)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
              ))}
              {drag && drag.laneKey === lane.key && (
                <div
                  className="loop-ghost"
                  aria-hidden="true"
                  style={{
                    left: `${(drag.fromPos / TOTAL) * 100}%`,
                    width: `${((Math.min(drag.endBeat, TOTAL) - drag.fromPos) / TOTAL) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="muted lanes-hint">空きをタップ→置くネタを選ぶ／ブロックをタップで外す</p>

      {others.length > 0 && (
        <div className="section-others">
          <span className="muted">その他：</span>
          {others.map((c) => (
            <span key={`${c.node.neta.id}@${c.position}`} className="rel-item">
              {c.node.neta.kind} @{c.position}
              <button
                type="button"
                aria-label={`remove-${c.node.neta.id}@${c.position}`}
                onClick={() => void remove(c.node.neta.id, c.position)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {picker && (
        <div className="dialog-backdrop" onClick={() => setPicker(null)}>
          <div
            className="dialog"
            role="dialog"
            aria-label="place-picker"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <span>{picker.position / BPB + 1} 小節目に置く</span>
              <button aria-label="close" onClick={() => setPicker(null)}>
                ✕
              </button>
            </header>
            {/* 種別を選ぶ（セクション or パート＝メロ/コード/ベース/リズム）。 */}
            <div className="picker-kinds">
              {LANES.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  aria-label={`picker-kind-${l.key}`}
                  className={l.key === picker.lane.key ? "on" : ""}
                  onClick={() => setPicker((p) => (p ? { ...p, lane: l } : p))}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <input
              aria-label="picker-search"
              className="editor-tags"
              placeholder="絞り込み…（曲名・アーティスト）"
              value={pq}
              onChange={(e) => setPq(e.target.value)}
            />
            <div className="picker-list">
              {(() => {
                const q = pq.toLowerCase();
                const list = picker.all.filter(
                  (n) =>
                    inLane(picker.lane, n.kind) &&
                    n.id !== neta.id &&
                    (n.title ?? n.text ?? "").toLowerCase().includes(q),
                );
                if (list.length === 0)
                  return <p className="muted">置ける{picker.lane.label}のネタがありません</p>;
                return list.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="picker-item"
                    data-kind={n.kind}
                    onClick={() => void placeAt(n)}
                  >
                    <div className="picker-item-roll">
                      <MiniRoll neta={n} />
                    </div>
                    <div className="picker-item-meta">
                      <strong>{n.title ?? n.text ?? "(無題)"}</strong>
                      <span className="muted">
                        {n.kind}
                        {n.mood ? ` · ${n.mood}` : ""}
                        {n.key != null ? ` · ${["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][n.key]}` : ""}
                      </span>
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
      <TransportBar
        state={tp.state}
        loopOn={tp.loopOn}
        timeRef={tp.timeRef}
        onPlayPause={tp.playPause}
        onRewind={tp.rewind}
        onToggleLoop={tp.toggleLoop}
      />
    </div>
  );
}
