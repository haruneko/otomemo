import { useCallback, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { api, type Neta, type CompositionNode } from "../api";
import { KIND_LABEL } from "../kinds";
import { isProjectTag, projectName } from "../project";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";

// レーンの1セル＝ドロップ先（#52②c）。kind が合えばカードを落として配置。
function LaneCell({
  laneKey,
  kinds,
  bar,
  position,
  row,
  onTap,
  disabled,
}: {
  laneKey: string;
  kinds: readonly string[];
  bar: number;
  position: number;
  row?: number; // ② コード楽器の行（D&Dドロップ時の ord に使う）
  onTap: (position: number) => void;
  disabled?: boolean; // 単一パートが埋まってる＝置けない（CV3）
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${laneKey}-${bar}`, data: { kinds, position, row }, disabled });
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
  beatsPerBar,
  PITCH_NAMES,
  type Note,
  type PlaybackHandle,
} from "../music";
import { MiniRoll } from "./MiniRoll";
import { KindIcon } from "./KindIcon";
import { Icon } from "./Icon";
import { harmonyVoice } from "../harmony";

// 配置タイムライン（design #19）。section/song を メロ/コード/ベース/リズムの4レーン×小節 で組む。
// レーンは子の kind から導出（スキーマ変更なし）。空セルをタップ→ネタを選んで置く。
// 調/テンポは section が支配。rhythm(ドラム)は移調しない。
// レーン順＝層モデル（進行が一番上→メロ→コード楽器→ベース→リズム→ネスト）。
// 配置は「占有セルのみ不可」＝同じ位置に二重で置けないだけ（別小節には自由に置ける・CV3 是正）。
// ②（2026-07-03）コード楽器は2レーン（ピアノ＋パッド等を同時に鳴らす）。同 kind の行識別は
// placement の `ord`（0=1／1=2）で行う（ord は並び/zヒントで本質非依存）。row を持つレーンは
// laneChildren を rowOf で絞る。再生は元々全 chord_pattern 子を鳴らすので発音側は変更不要。
const LANES: readonly { key: string; label: string; kinds: readonly string[]; row?: number }[] = [
  { key: "chord", label: "コード進行", kinds: ["chord", "chord_progression"] },
  { key: "melody", label: "メロ", kinds: ["melody"] },
  { key: "chord_pattern", label: "コード楽器1", kinds: ["chord_pattern"], row: 0 },
  { key: "chord_pattern2", label: "コード楽器2", kinds: ["chord_pattern"], row: 1 },
  { key: "bass", label: "ベース", kinds: ["bass"] },
  { key: "rhythm", label: "リズム", kinds: ["rhythm"] },
  { key: "section", label: "セクション", kinds: ["section"] }, // #15 section をネスト配置
];
const MIN_BARS = 8;
const MAX_BARS = 32; // セクション尺の上限（16小節等の曲を1セクションで組めるように・評価修正A）
// ピッカー種別タブの色＝作成タイルと揃える（種別色・アイコン+ラベル）。chord_pattern は chord 色。
const LANE_COLOR: Record<string, string> = {
  chord: "var(--k-chord)",
  melody: "var(--k-melody)",
  chord_pattern: "var(--k-chord)",
  chord_pattern2: "var(--k-chord)",
  bass: "var(--k-bass)",
  rhythm: "var(--k-rhythm)",
  section: "var(--k-section)",
};

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
  onOpenNeta,
  title,
}: {
  neta: Neta;
  keyPc: number;
  tempo: number;
  meter?: string; // 編集中ライブ反映用（未指定は neta.meter）
  title?: string; // 編集中ライブタイトル（未指定は neta.title・App activeがstaleな新規曲対策）
  reloadSignal?: number; // 外部(D&D配置)からの再読込トリガ
  onChanged?: () => void;
  onOpenNeta?: (n: Neta) => void; // ブロックタップ→子ネタを編集画面で開く（潜る）
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [picker, setPicker] = useState<{ lane: Lane; position: number; all: Neta[] } | null>(null);
  // ③ 右端ドラッグでループ伸ばし中のプレビュー（fromPos〜endBeat をゴースト表示）。
  const [drag, setDrag] = useState<{ childId: string; laneKey: string; fromPos: number; unit: number; endBeat: number } | null>(null);
  const [pq, setPq] = useState(""); // ピッカーの絞り込み
  // ピッカーの母集団を器で絞る（A）＝どのプロジェクトのネタから選ぶか（""=自作すべて）。
  const [pickerSource, setPickerSource] = useState<string>("");
  const [pickerOtherMeter, setPickerOtherMeter] = useState(false); // 拍子違いも出すか（既定=一致のみ・B）
  const [eraseMode, setEraseMode] = useState(false); // 消しゴムモード＝ブロックtapで外す（PianoRollの描く/選ぶと同じモード流儀）
  const [toolsOpen, setToolsOpen] = useState(false); // いじる▾ メニュー（生成/ハモリ/書き出しを集約・メロ編集画面と整合・⑤）
  // ②文脈系：この進行に◯を生成（section のコード＋frame から候補→試聴→レーンに置く）。
  const [cand, setCand] = useState<{ kind: string; content: unknown } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const candPlay = useRef<PlaybackHandle | null>(null);
  const lastPartRef = useRef<{ op: string; needsChords: boolean; prog?: number; label: string } | null>(null);
  // ライブの拍子（編集中の meter prop 優先。App の active(=neta prop) は stale なことがあるので neta.meter は使わない）。
  const liveMeter = meter ?? neta.meter ?? undefined;
  const liveTitle = (title ?? neta.title ?? "").trim(); // 生成/作成/MIDI名に使うライブタイトル
  // ネタの所属プロジェクト（prj: タグ由来）。母集団を器で絞る（A）に使う。
  const netaProjects = (n: Neta) => (n.tags ?? []).filter(isProjectTag).map(projectName);
  // ピッカーの相性（B）：拍子一致（bpb比較）。meter 未指定(null)は"不特定"＝中立で表示（断片を隠さない）。
  const sameMeter = (n: Neta) => n.meter == null || beatsPerBar(n.meter) === BPB;
  const fifthsPos = (pc: number) => (((pc * 7) % 12) + 12) % 12;
  const keyDist = (n: Neta) => {
    if (n.key == null) return 3; // keyless＝中立（一致と不一致の中間）
    const d = Math.abs(fifthsPos(n.key) - fifthsPos(keyPc));
    return Math.min(d, 12 - d);
  };
  const BPB = beatsPerBar(liveMeter); // 1小節の拍数（#51・編集中はprop優先）
  // セクション尺（小節数）＝可変（評価修正A）。ユーザー設定(secBars=neta.bars)と配置済みcontentの長い方、上限MAX_BARS。
  const [secBars, setSecBars] = useState(() => Math.max(MIN_BARS, neta.bars ?? MIN_BARS));
  const contentEnd = children.length ? Math.max(0, ...children.map((c) => c.position + childDur(c))) : 0;
  const BARS = Math.min(MAX_BARS, Math.max(secBars, Math.ceil(contentEnd / BPB - 1e-6)));
  const TOTAL = BARS * BPB;
  // 小節が多い時だけトラックに最小幅を与えて横スクロール（セルが潰れないように・8小節までは従来どおり伸縮）。
  const trackStyle = BARS > 10 ? { minWidth: `${BARS * 34}px` } : undefined;
  async function setSectionBars(n: number) {
    const b = Math.max(MIN_BARS, Math.min(MAX_BARS, n));
    setSecBars(b);
    await api.updateNeta(neta.id, { bars: b }).catch(() => {});
    onChanged?.();
  }
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
  // ② コード楽器の行＝ord（1→2レーン目、それ以外→1レーン目）。row 付きレーンはこの行で絞る。
  const rowOf = (c: Child) => (c.ord === 1 ? 1 : 0);
  const laneChildren = (lane: Lane) =>
    children.filter((c) => inLane(lane, c.node.neta.kind) && (lane.row === undefined || rowOf(c) === lane.row));
  const others = children.filter((c) => !laneOf(c.node.neta.kind));

  function childDur(c: Child): number {
    const k = c.node.neta.kind;
    // ネストした section/song＝中身の実長（子を再帰で畳む）＝1小節固定でなく本当の尺（評価修正A）。
    if (k === "section" || k === "song") {
      const kids = c.node.children ?? [];
      return kids.length ? Math.max(...kids.map((kc) => kc.position + childDur(kc))) : BPB;
    }
    const ns = notesForContent(k, c.node.neta.content);
    return ns.length ? Math.max(...ns.map((n) => n.start + n.dur)) : BPB;
  }

  // その位置が既にブロックで埋まっているか（レーン全体でなく**占有セルだけ**不可＝別小節には置ける）。
  const occupiedAt = (lane: Lane, position: number) =>
    laneChildren(lane).some((c) => c.position <= position + 1e-6 && position < c.position + childDur(c) - 1e-6);
  // この曲(section)が属する器＝母集団の既定ソース（A）。無ければ「自作すべて」。
  const sectionProjects = (neta.tags ?? []).filter(isProjectTag).map(projectName);
  async function openPicker(lane: Lane, position: number) {
    if (occupiedAt(lane, position)) return; // 既に埋まってる所には置かせない（CV3・占有セルのみ）
    // 自作ネタのみ取得（コーパス=libraryは直接選ばせない＝推薦経由・Phase2）。
    const all = await api.listNeta({ scope: "project", limit: 2000 });
    setPq("");
    setPickerSource(sectionProjects[0] ?? ""); // 既定＝この曲の器
    setPickerOtherMeter(false);
    setPicker({ lane, position, all });
  }
  async function placeAt(child: Neta) {
    if (!picker) return;
    try {
      // ライブラリ項目は project にコピーしてから配置（元コーパスを汚さない・編集はコピー側）。
      const target = child.scope === "library" ? await api.copyNeta(child.id) : child;
      const ord = picker.lane.row ?? 0; // ② コード楽器レーンは行を ord に。他は 0。
      // 置く＝1小節ぶんだけ（小節別に別パターンを置ける）。繰り返したい時は右端ドラッグ(③)で。
      // ※旧・自動末尾充填は撤去＝別リズムを小節別に置くと重なって ABBBBB になる問題の元だった。
      await api.placeChild(neta.id, target.id, picker.position, ord);
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

  // ブロック操作＝消しゴム中は tap で外す／通常は tap で子ネタを編集（潜る）。右端グリップ(③伸ばし)は別。
  // 「モードで tap の意味が変わる」＝PianoRoll の描く/選ぶと同じ流儀（紛らわしい長押し=外すは撤去）。
  function onBlockClick(e: React.MouseEvent, c: Child) {
    e.stopPropagation();
    if (eraseMode) {
      void remove(c.node.neta.id, c.position); // 消しゴム：tap 一発で外す
      return;
    }
    onOpenNeta?.(c.node.neta); // 通常：tap＝子ネタを編集画面で開く（潜る）
  }
  // ピッカーの「＋新規作成」：このレーンの kind で空ネタを作って配置→そのまま編集を開く
  //（探して無ければ作る導線）。コード進行は chord_progression を既定に。
  async function createInLane() {
    if (!picker) return;
    const kinds = picker.lane.kinds;
    const kind = kinds.includes("chord_progression") ? "chord_progression" : kinds[0]!;
    // 作る部品に section のライブ拍子を刻む＝単体編集でも6/8で表示される（評価バグ②）。
    const created = await api.createNeta({ kind, title: pq.trim() || undefined, meter: liveMeter });
    await api.placeChild(neta.id, created.id, picker.position, picker.lane.row ?? 0).catch(() => {});
    setPicker(null);
    await load();
    onChanged?.();
    onOpenNeta?.(created); // 作ったらすぐ中身を描けるよう編集へ
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
        frame: { key: keyPc, meter: liveMeter, tempo, bars: BARS },
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
      title: `${liveTitle || "曲"} ${lane?.label ?? cand.kind}`,
      content: cand.content,
      key: keyPc,
      tempo,
      meter: liveMeter,
      tags: neta.tags,
    });
    await api.placeChild(neta.id, created.id, 0, lane?.row ?? 0);
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
      {/* 道具は メロ編集画面に整合：[✎通常][⌫消しゴム] modes（左）… [✨いじる▾]（右）。
          生成/ハモリ/書き出しは全部 いじる メニューに集約＝バラ撒きボタンを畳んで薄く（②⑤）。 */}
      <div className="roll-toolbar section-toolbar">
        <div className="proll-modes" role="group" aria-label="section-mode">
          <button type="button" aria-label="mode-edit" title="通常（タップで編集）" className={!eraseMode ? "on" : ""} onClick={() => setEraseMode(false)}>
            <Icon name="edit" size={18} />
          </button>
          <button type="button" aria-label="mode-erase" title="消しゴム（タップで外す）" className={eraseMode ? "on" : ""} onClick={() => setEraseMode(true)}>
            <Icon name="eraser" size={18} />
          </button>
        </div>
        <span className="tb-divider" aria-hidden="true" />
        <div className="assign-wrap">
          <button
            type="button"
            className={"tb-tool tools-btn" + (toolsOpen ? " on" : "")}
            aria-label="tools"
            aria-expanded={toolsOpen}
            title="この進行をいじる（生成・ハモリ・書き出し）"
            onClick={() => setToolsOpen((v) => !v)}
          >
            <Icon name="wand" size={16} /> いじる ▾
          </button>
          {toolsOpen && (
            <div className="assign-menu to-right tools-menu" aria-label="tools-menu">
              {!cand && (
                <>
                  <div className="tools-sep">この進行に生成</div>
                  {GEN_PARTS.filter((part) => !part.needsChords || sectionChords().length > 0).map((part) => (
                    <button
                      key={part.op}
                      type="button"
                      className="tool-item"
                      aria-label={`gen-${part.op}`}
                      disabled={genBusy}
                      onClick={() => { setToolsOpen(false); void genPart(part); }}
                    >
                      {genBusy ? "生成中…" : part.label}
                    </button>
                  ))}
                  {melodyLaneNotes().length > 0 && (
                    <>
                      <div className="tools-sep">メロ加工</div>
                      <button type="button" className="tool-item" aria-label="harmony-up" title="調内で平行3度上の第2声部" onClick={() => { setToolsOpen(false); makeHarmony(2); }}>上ハモ</button>
                      <button type="button" className="tool-item" aria-label="harmony-down" title="調内で平行3度下の第2声部" onClick={() => { setToolsOpen(false); makeHarmony(-2); }}>下ハモ</button>
                      {sectionChords().length > 0 && (
                        <>
                          <button type="button" className="tool-item" aria-label="fit-to-chords" title="メロの各音を近いコードトーンへ寄せる" disabled={genBusy} onClick={() => { setToolsOpen(false); void fitToChords(); }}>コードに合わせる</button>
                          <button type="button" className="tool-item" aria-label="analyze-fit" title="メロとコードの噛み合いを診断（読むだけ）" onClick={() => { setToolsOpen(false); void analyzeFit(); }}>噛み合い診断</button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="tools-sep">書き出し</div>
              <button type="button" className="tool-item" aria-label="export-midi" onClick={() => { setToolsOpen(false); downloadMidi(composite(), `${liveTitle || "section"}.mid`, tempo, liveMeter ?? null); }}>MIDI</button>
              <button type="button" className="tool-item" aria-label="export-midi-split" title="メロ/コード/ベース/リズムを別トラックに" onClick={() => { setToolsOpen(false); downloadMultitrackMidi(laneTracks(), `${liveTitle || "section"}-tracks.mid`, tempo, liveMeter ?? null); }}>MIDI（分割）</button>
            </div>
          )}
        </div>
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

      {/* セクション尺（小節数）＝可変（評価修正A）。placed content より短くはできない（自動で伸びる）。 */}
      <div className="section-bars" aria-label="section-bars">
        <span className="muted">小節</span>
        <button type="button" aria-label="bars-dec" disabled={BARS <= MIN_BARS} onClick={() => void setSectionBars(BARS - 1)}>−</button>
        <span aria-label="bars-count">{BARS}</span>
        <button type="button" aria-label="bars-inc" disabled={BARS >= MAX_BARS} onClick={() => void setSectionBars(BARS + 1)}>＋</button>
      </div>
      <div className="lanes" aria-label="timeline" ref={tp.scrollerRef}>
        <div className="playhead" aria-hidden="true" ref={tp.lineRef} />
        <div className="lane-ruler">
          <div className="lane-label" />
          <div className="ruler-bars" style={trackStyle}>
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
            <div className="lane-track" style={trackStyle}>
              {Array.from({ length: BARS }, (_, b) => (
                <LaneCell
                  key={b}
                  laneKey={lane.key}
                  kinds={lane.kinds}
                  bar={b}
                  position={b * BPB}
                  row={lane.row}
                  disabled={occupiedAt(lane, b * BPB)}
                  onTap={(pos) => void openPicker(lane, pos)}
                />
              ))}
              {laneChildren(lane).map((c) => (
                <button
                  key={`${c.node.neta.id}@${c.position}`}
                  type="button"
                  className={"lane-block" + (eraseMode ? " erasing" : "")}
                  data-kind={c.node.neta.kind}
                  aria-label={`block-${c.node.neta.id}@${c.position}`}
                  title={eraseMode ? "タップで外す" : `${c.node.neta.title ?? c.node.neta.text ?? ""} @${c.position}拍 — タップで編集`}
                  style={{
                    left: `${(c.position / TOTAL) * 100}%`,
                    width: `${(Math.min(childDur(c), TOTAL - c.position) / TOTAL) * 100}%`,
                  }}
                  onClick={(e) => onBlockClick(e, c)}
                >
                  <MiniRoll neta={c.node.neta} />
                  <span className="lane-block-label">
                    {c.node.neta.title ?? c.node.neta.text ?? KIND_LABEL[c.node.neta.kind] ?? c.node.neta.kind}
                  </span>
                  {/* ③ 右端グリップ＝ドラッグでループ伸ばし。消しゴム中は無効（誤操作防止）。 */}
                  {!eraseMode && (
                    <span
                      className="block-resize"
                      aria-label={`extend-${c.node.neta.id}@${c.position}`}
                      title="右へドラッグで繰り返し（ループ）"
                      onPointerDown={(e) => onGripDown(e, c, lane)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
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
      <p className="muted lanes-hint">
        空きをタップ→置く/新規作成／ブロックをタップで編集（⌫消しゴムでタップ＝外す）／右端ドラッグで繰り返し
      </p>

      {others.length > 0 && (
        <div className="section-others">
          <span className="muted">その他：</span>
          {others.map((c) => (
            <span key={`${c.node.neta.id}@${c.position}`} className="rel-item">
              {KIND_LABEL[c.node.neta.kind] ?? c.node.neta.kind} @{c.position}
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
                  style={{ ["--k" as string]: LANE_COLOR[l.key] ?? "var(--accent)" }}
                  onClick={() => setPicker((p) => (p ? { ...p, lane: l } : p))}
                >
                  <KindIcon kind={l.kinds[0]!} />
                  <span>{l.label}</span>
                </button>
              ))}
            </div>
            {/* 母集団を器で絞る（A）＋拍子一致のみ（B）。生コーパスは出さない＝自作から選ぶ。 */}
            <div className="picker-scope-row">
              <label className="picker-source">
                <span className="muted">元</span>
                <select aria-label="picker-source" value={pickerSource} onChange={(e) => setPickerSource(e.target.value)}>
                  <option value="">自作すべて</option>
                  {[...new Set(picker.all.flatMap(netaProjects))].sort().map((pj) => (
                    <option key={pj} value={pj}>{pj}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={"picker-meter-toggle" + (pickerOtherMeter ? " on" : "")}
                aria-label="picker-other-meter"
                aria-pressed={pickerOtherMeter}
                title={pickerOtherMeter ? "拍子一致のみに戻す" : "拍子違いも出す"}
                onClick={() => setPickerOtherMeter((v) => !v)}
              >
                拍子違いも
              </button>
            </div>
            <div className="picker-search-row">
              <input
                aria-label="picker-search"
                className="editor-tags"
                placeholder="絞り込み…（曲名・アーティスト）"
                value={pq}
                onChange={(e) => setPq(e.target.value)}
              />
            </div>
            {/* 探して無ければ作る：このレーンの kind で新規作成→配置→編集へ。 */}
            <button type="button" className="picker-create" aria-label="picker-create" onClick={() => void createInLane()}>
              ＋ {pq.trim() ? `「${pq.trim()}」を` : ""}新しい{picker.lane.label}を作る
            </button>
            <div className="picker-list">
              {(() => {
                const q = pq.toLowerCase();
                const list = picker.all
                  .filter(
                    (n) =>
                      inLane(picker.lane, n.kind) &&
                      n.id !== neta.id &&
                      n.scope !== "library" && // コーパスは直接出さない（推薦経由・Phase2）
                      (pickerSource === "" || netaProjects(n).includes(pickerSource)) && // A: 母集団を器で絞る
                      (pickerOtherMeter || sameMeter(n)) && // B: 拍子一致のみ（既定）
                      (n.title ?? n.text ?? "").toLowerCase().includes(q),
                  )
                  // B: 調が近い順→最近順（拍子は既に一致で絞れている）。
                  .sort((a, b) => keyDist(a) - keyDist(b) || (b.created ?? "").localeCompare(a.created ?? ""));
                if (list.length === 0)
                  return <p className="muted">置ける{picker.lane.label}のネタがありません（元/拍子の条件を緩めるか、＋新規作成）</p>;
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
                        {KIND_LABEL[n.kind] ?? n.kind}
                        {n.mood ? ` · ${n.mood}` : ""}
                        {n.key != null ? ` · ${PITCH_NAMES[n.key]}` : ""}
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
