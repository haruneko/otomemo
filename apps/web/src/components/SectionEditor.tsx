import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Neta } from "../api";
import { KIND_LABEL } from "../kinds";
import { isProjectTag, projectName } from "../project";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";
import {
  notesForContent,
  compositeNotes,
  trackProgramOf,
  downloadMidi,
  downloadMultitrackMidi,
  beatsPerBar,
  feelOf,
  isCompoundMeter,
  isSkeleton,
  type ChordEntry,
  type Feel,
  type Note,
} from "../music";
import type { SkeletonDeskTarget } from "./SkeletonDesk"; // 型のみ＝実行時依存なし（骨格ブロック→机の入口）
import { MiniRoll } from "./MiniRoll";
import { Icon } from "./Icon";
import { useDismiss } from "../useDismiss";
// 巨大コンポの機械分割（負債D6→Task#2）＝挙動不変。レーン定義/尺定数/純関数/LaneCell/SongStatus/PlacePicker、
// および 生成/ハモリ道具(useMelodyGen)・配置ピッカー(usePlacePicker) を分離。
import { LaneCell } from "./LaneCell";
import { SongStatus } from "./SongStatus";
import { PlacePicker } from "./PlacePicker";
import { useMelodyGen, MELODY_PRESETS, GEN_PARTS, RHYTHM_PART_UI, voiceLeadingBadge, LENS_AXES, lensBadge } from "../useMelodyGen";
import { usePlacePicker } from "../usePlacePicker";
// D0（design #20 S6）：セクション文脈の計算は純関数へ抽出（机 SkeletonDesk と共有）。ここは薄い委譲。
import * as sctx from "../sectionContext";
import {
  type Lane,
  type Child,
  lanesForKind,
  maxBarsForKind,
  MIN_BARS,
  LANE_MIDI_NAME,
  loopPositions,
  spanOverlaps,
} from "./sectionLanes";
// テストが従来 SectionEditor から import している純関数は再export して import 面を不変に保つ。
export { loopPositions, spanOverlaps } from "./sectionLanes";

export function SectionEditor({
  neta,
  keyPc,
  tempo,
  meter,
  reloadSignal,
  onChanged,
  onOpenNeta,
  onOpenSkeletonDesk,
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
  // #20 S6骨格の机：骨格ブロックタップ→机（全画面）で開く。未指定＝従来どおり onOpenNeta（潜る）。
  onOpenSkeletonDesk?: (t: SkeletonDeskTarget) => void;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loadErr, setLoadErr] = useState(false); // getComposition 失敗時＝空白で固まらず再試行を出す（perf耳FB 2026-07-09）
  // ③ 右端ドラッグでループ伸ばし中のプレビュー（fromPos〜endBeat をゴースト表示）。
  const [drag, setDrag] = useState<{ childId: string; laneKey: string; fromPos: number; unit: number; endBeat: number } | null>(null);
  const [eraseMode, setEraseMode] = useState(false); // 消しゴムモード＝ブロックtapで外す（PianoRollの描く/選ぶと同じモード流儀）
  const [toolsOpen, setToolsOpen] = useState(false); // いじる▾ メニュー（生成/ハモリ/書き出しを集約・メロ編集画面と整合・⑤）
  const toolsRef = useRef<HTMLDivElement>(null);
  useDismiss(toolsRef, toolsOpen, useCallback(() => setToolsOpen(false), [])); // 外タップ/Escで閉じる
  // #5 container kind でレーン/尺を差し替え（song=section を並べる編成・section=パート専用）。
  const isSong = neta.kind === "song";
  const LANES = lanesForKind(neta.kind);
  const MAX_BARS = maxBarsForKind(neta.kind);
  // ライブの拍子（編集中の meter prop 優先。App の active(=neta prop) は stale なことがあるので neta.meter は使わない）。
  const liveMeter = meter ?? neta.meter ?? undefined;
  const liveTitle = (title ?? neta.title ?? "").trim(); // 生成/作成/MIDI名に使うライブタイトル
  const BPB = beatsPerBar(liveMeter); // 1小節の拍数（#51・編集中はprop優先）
  // D0（design #20 S6）：セクション文脈計算は sectionContext.ts の純関数へ委譲（机 D1 と共有）。
  // 呼び出し名/シグネチャ/挙動を温存＝JSX・useMelodyGen・usePlacePicker への受け渡しは不変。
  const secCtx: sctx.SectionCtx = { children, LANES, keyPc, mode: neta.mode, BPB };
  const childDur = (c: Child): number => sctx.childDur(secCtx, c);
  const contentDur = (kind: string, content: unknown): number => sctx.contentDur(secCtx, kind, content);
  const laneChildren = (lane: Lane): Child[] => sctx.laneChildren(secCtx, lane);
  const sectionChords = () => sctx.sectionChords(secCtx);
  const sectionBass = (): Note[] => sctx.sectionBass(secCtx);
  const sectionDrums = () => sctx.sectionDrums(secCtx);
  const earChords = (): ChordEntry[] => sctx.earChords(secCtx);
  const skelEar = (): Note[] => sctx.skelEar(secCtx);
  // セクション尺（小節数）＝可変（評価修正A）。ユーザー設定(secBars=neta.bars)と配置済みcontentの長い方、上限MAX_BARS。
  const [secBars, setSecBars] = useState(() => Math.max(MIN_BARS, neta.bars ?? MIN_BARS));
  // 子の実尺の最大。childDur が壊れた content で NaN を返しても画面に「NaN」を出さない＝有限値のみで算出（防御）。
  const ends = children.map((c) => c.position + childDur(c)).filter((x) => Number.isFinite(x));
  const contentEnd = ends.length ? Math.max(0, ...ends) : 0;
  const BARS = Math.min(MAX_BARS, Math.max(secBars, Math.ceil(contentEnd / BPB - 1e-6))) || Math.max(MIN_BARS, secBars);
  const TOTAL = BARS * BPB;
  // 小節が多い時だけトラックに最小幅を与えて横スクロール（セルが潰れないように・8小節までは従来どおり伸縮）。
  const trackStyle = BARS > 10 ? { minWidth: `${BARS * 34}px` } : undefined;
  async function setSectionBars(n: number) {
    const b = Math.max(MIN_BARS, Math.min(MAX_BARS, n));
    setSecBars(b);
    await api.updateNeta(neta.id, { bars: b }).catch(() => {});
    onChanged?.();
  }
  // 骨格レーンの「鳴らす」トグル（耳確認・オーナーFB 2026-07-11）。既定OFF＝従来どおり無音。保存しない（セッション内のみ）。
  const [skelAudible, setSkelAudible] = useState(false);
  // #49/#58/#59 トランスポート。合成結果を再生／プレイヘッドは TOTAL(グリッド全体)尺・拍子BPB。
  // 再生ノートは playComposite＝骨格トグルONの間だけ骨格2声が混ざる（書き出しは composite のまま）。
  const tp = useTransport(() => playComposite(), tempo, { scaleBeats: TOTAL, bpb: BPB, feel: sectionFeel(), compound: isCompoundMeter(liveMeter) });

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
    try {
      setLoadErr(false);
      const tree = await api.getComposition(neta.id);
      setChildren(tree.children);
    } catch {
      setLoadErr(true); // 取得失敗＝白画面で固まらせず、下の再試行バーで復帰できる
    }
  }, [neta.id]);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const laneOf = (kind: string) => LANES.find((l) => sctx.inLane(l, kind));
  const others = children.filter((c) => !laneOf(c.node.neta.kind));

  // #5 song の section/song ブロック概形＝中身を合成した notes（ドラムは音域を乱すので除く）。
  // 単体パート(メロ/ベース等)は MiniRoll が content から描くので undefined（従来通り）。
  function blockPreviewNotes(c: Child): Note[] | undefined {
    const k = c.node.neta.kind;
    if (k !== "section" && k !== "song") return undefined;
    return compositeNotes(c.node.children ?? [], c.node.neta.key ?? keyPc, c.node.neta.mode).filter((n) => !n.drum);
  }

  // その位置が既にブロックで埋まっているか（レーン全体でなく**占有セルだけ**不可＝別小節には置ける）。
  const occupiedAt = (lane: Lane, position: number) =>
    laneChildren(lane).some((c) => c.position <= position + 1e-6 && position < c.position + childDur(c) - 1e-6);
  // 同レーンの「別ネタ」と尺(スパン)が重なるか＝点判定 occupiedAt の穴(はみ出し重複)を塞ぐ。
  const overlapsOtherInLane = (lane: Lane, childId: string, pos: number, dur: number) =>
    laneChildren(lane).some((c) => c.node.neta.id !== childId && spanOverlaps(pos, dur, c.position, childDur(c)));
  // この曲(section)が属する器＝母集団の既定ソース（A）。無ければ「自作すべて」。
  const sectionProjects = (neta.tags ?? []).filter(isProjectTag).map(projectName);
  const progForKind = (kind: string) => (kind === "bass" ? 33 : kind === "rhythm" ? undefined : kind === "counter" || kind === "section_inst" ? 48 : 0);

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
    // #20 S6骨格の机：骨格ブロックは机（全画面・ベッド上で編集）で開く。骨格以外は完全に従来どおり。
    const isSkel = c.node.neta.kind === "skeleton" || isSkeleton(c.node.neta.content);
    if (isSkel && onOpenSkeletonDesk) {
      onOpenSkeletonDesk({
        sectionId: neta.id,
        sectionKey: keyPc,
        sectionMode: neta.mode,
        meter: liveMeter,
        tempo,
        skelNetaId: c.node.neta.id,
        skelPosition: c.position,
        skelOrd: c.ord,
      });
      return;
    }
    onOpenNeta?.(c.node.neta); // 通常：tap＝子ネタを編集画面で開く（潜る）
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
      if (overlapsOtherInLane(lane, childId, p, childDur(c))) continue; // 別ネタと尺が重なる位置には置かない（はみ出し重複防止）
      await api.placeChild(neta.id, childId, p, c.ord).catch(() => {});
    }
    // 削除：縮めた分＝existing で wanted に無いこの子の反復だけ外す（他の子や元ブロックは触らない）。
    for (const e of existing) {
      if (!wanted.some((p) => near(p, e))) await api.removeChild(neta.id, childId, e).catch(() => {});
    }
    await load();
    onChanged?.();
  }

  // 生成/ハモリ道具（いじる▾）＝メロ生成ノブ・候補トレイ・ハモリ/fit（Task#2 で useMelodyGen に分離）。
  // section 文脈を関数で渡す＝当コンポが state を持ち、フックは純粋に近い（挙動不変）。
  const gen = useMelodyGen({
    neta, keyPc, tempo, liveMeter, liveTitle, BARS, BPB,
    lanes: LANES, laneChildren, laneOf,
    sectionChords, sectionBass, sectionDrums,
    contentDur, childDur, progForKind,
    reload: load, onChanged,
  });
  // 配置ピッカー（空セルタップ→ネタを選んで置く）＝Task#2 で usePlacePicker に分離。
  const pk = usePlacePicker({
    neta, keyPc, tempo, liveMeter,
    occupiedAt, overlapsOtherInLane, contentDur,
    sectionProjects, progForKind,
    reload: load, onChanged, onOpenNeta,
  });

  // 合成：子を section の調へ移調（rhythm除く）＋位置オフセット（共有: compositeNotes）
  function composite(): Note[] {
    return compositeNotes(children, keyPc, neta.mode);
  }
  // 骨格の耳確認（オーナーFB 2026-07-11）：「鳴らす」ON の間だけ再生に骨格2声（メロ実音＋実効ベース+1oct・
  // Strings/Cello）を混ぜる＝ドラムと合わせて聞ける。**合成(composite)と MIDI 書き出しは不変＝無音のまま**。
  // コードは compositeNotes と同じ key-aware 移調でセクション実調へ→骨格位置相対に（earChords/skelEar は sectionContext へ委譲・上部）。
  // 再生専用の合成＝トグルONなら骨格2声を足す。書き出し(downloadMidi/laneTracks)は composite のまま＝混入しない。
  function playComposite(): Note[] {
    // 骨格を鳴らす＝メロ(part:"melody")をミュートし、骨格2声(Strings/Cello)を伴奏(コード/ベース/ドラム)に重ねて
    // 対位法的に聴く（メロと骨格の二重化＝ピアノが勝つのを避ける・オーナーFB 2026-07-12）。書き出し(composite)は不変。
    return skelAudible ? [...composite().filter((n) => n.part !== "melody"), ...skelEar()] : composite();
  }
  // アンサンブル feel（design.md「フィール層分離」Stage4）：セクション内メロトラックの content.feel を
  // **全トラックに同一適用**＝スイングは声部単位でなく時間軸の共有性質（メロだけ跳ねる事故を避ける）。無ければストレート。
  function sectionFeel(): Feel | undefined {
    for (const c of children) { const f = feelOf(c.node.neta.content); if (f) return f; }
    return undefined;
  }
  // #55 多トラック書出：レーン(メロ/コード/ベース/リズム)別に1トラックずつ。空レーンは省く。
  // バグ#1(2026-07-13)：各トラックの GM音色を composite notes の program から採る（trackProgramOf）＝
  // コード楽器2(ハープ46)等が MIDI で program 0(ピアノ)に潰れないように。drum は kit で扱うので program 不要。
  function laneTracks() {
    return LANES.map((lane) => {
      const notes = compositeNotes(laneChildren(lane), keyPc, neta.mode);
      return {
        name: LANE_MIDI_NAME[lane.key] ?? lane.key, // ASCII＝DAWで文字化けしない（日本語ラベルは使わない）
        notes,
        drum: lane.key === "rhythm",
        program: lane.key === "rhythm" ? undefined : trackProgramOf(notes),
      };
    }).filter((t) => t.notes.length);
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
        <div className="assign-wrap" ref={toolsRef}>
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
          {toolsOpen && <div className="tools-backdrop" aria-hidden="true" onClick={() => setToolsOpen(false)} />}
          {toolsOpen && (
            <div className="assign-menu to-right tools-menu" aria-label="tools-menu">
              {/* P3（2026-07-10・UX再設計）：モバイルは下から迫り上がるシート。掴み＋見出し＋閉じる（CSSで sheet 化）。 */}
              <div className="sheet-head">
                <span className="sheet-grab" aria-hidden="true" />
                <span className="sheet-title">いじる</span>
                <button type="button" className="sheet-close" aria-label="close-tools" onClick={() => setToolsOpen(false)}>✕</button>
              </div>
              {/* 生成/ハモリはパートを作る道具＝section 専用。song(編成)は書き出しのみ（#5）。 */}
              {/* E2E[高]：候補生成中もプリセット/生成ボタンを出す＝別プリセットで作り直しがワンタップ（旧: 候補ありで生成UI丸ごと非表示＝多段操作）。候補は別パネル(トレイ)で並行表示。 */}
              {!isSong && (
                <>
                  <div className="tools-sep">この進行に生成</div>
                  {GEN_PARTS.filter((part) => !part.needsChords || sectionChords().length > 0).map((part) => (
                    <button
                      key={part.op}
                      type="button"
                      className="tool-item"
                      aria-label={`gen-${part.op}`}
                      disabled={gen.genBusy}
                      onClick={() => { setToolsOpen(false); void gen.genPart(part); }}
                    >
                      {gen.genBusy ? "生成中…" : part.label}
                    </button>
                  ))}
                  {/* ドラム定型ビート＋フィル（WP-D1・2026-07-14）：おまかせ=未送信=従来。style=ジャンル/型、fill=セクション末に挿入。 */}
                  <label className="tool-item" aria-label="drum-style" onClick={(e) => e.stopPropagation()}>
                    ビート型
                    <select value={gen.drumStyle} onChange={(e) => gen.setDrumStyle(e.target.value)}>
                      <option value="">おまかせ</option>
                      <optgroup label="ジャンル">
                        <option value="jpop">J-pop</option>
                        <option value="rock">ロック</option>
                        <option value="dance">ダンス/EDM</option>
                        <option value="ballad">バラード</option>
                        <option value="funk">ファンク/R&B</option>
                      </optgroup>
                      <optgroup label="型（直指定）">
                        <option value="beat8.basic">8ビート基本</option>
                        <option value="beat8.syncopated">8ビート食い込み</option>
                        <option value="beat16.basic">16ビート</option>
                        <option value="beat16.ghost">16ゴースト</option>
                        <option value="four.rock">4つ打ちロック</option>
                        <option value="four.house">4つ打ちハウス</option>
                        <option value="halftime.basic">ハーフタイム</option>
                        <option value="shuffle.basic">シャッフル</option>
                        <option value="six8.ballad">6/8バラード</option>
                      </optgroup>
                    </select>
                  </label>
                  <label className="tool-item" aria-label="drum-fill" onClick={(e) => e.stopPropagation()}>
                    フィル
                    <select value={String(gen.drumFill)} onChange={(e) => gen.setDrumFill(Number(e.target.value))}>
                      <option value="0">なし</option>
                      <option value="0.3">弱（軽い節目）</option>
                      <option value="0.6">中（遷移フィル）</option>
                      <option value="0.9">強（大遷移）</option>
                    </select>
                  </label>
                  {/* ベース語彙のジャンル型ライブラリ（WP-B1・2026-07-14）：おまかせ=未送信=従来。style=ジャンル/型、bassFill=セクション末に挿入。 */}
                  <label className="tool-item" aria-label="bass-style" onClick={(e) => e.stopPropagation()}>
                    ベース型
                    <select value={gen.bassStyle} onChange={(e) => gen.setBassStyle(e.target.value)}>
                      <option value="">おまかせ</option>
                      <optgroup label="ジャンル">
                        <option value="rock">ロック</option>
                        <option value="ballad">バラード</option>
                        <option value="citypop">シティポップ</option>
                        <option value="funk">ファンク</option>
                        <option value="edm">EDM</option>
                        <option value="vocarock">ボカロック</option>
                      </optgroup>
                      <optgroup label="型（直指定）">
                        <option value="RK-8ROOT">8分ルート弾き</option>
                        <option value="RK-GALLOP">ギャロップ</option>
                        <option value="BL-WHOLE">全音符バラード</option>
                        <option value="BL-APPROACH">アプローチ橋渡し</option>
                        <option value="CP-OCT8">オクターブ奏法</option>
                        <option value="CP-WALK">歩くシティポップ</option>
                        <option value="FK-ONE">ファンク the one</option>
                        <option value="ED-OFFBEAT">オフビート</option>
                        <option value="ED-SUSTAIN">ロー持続</option>
                        <option value="VR-8DRIVE">高速8分ドライブ</option>
                      </optgroup>
                    </select>
                  </label>
                  <label className="tool-item" aria-label="bass-fill" onClick={(e) => e.stopPropagation()}>
                    ベースフィル
                    <select value={String(gen.bassFill)} onChange={(e) => gen.setBassFill(Number(e.target.value))}>
                      <option value="0">なし</option>
                      <option value="0.2">下降（落ち着かせ）</option>
                      <option value="0.9">上昇（駆け上がり）</option>
                    </select>
                  </label>
                  {/* 骨格を生成（design #20 S2）：構造線(2声骨格)を機械に叩き台で出す→骨格レーンへ。
                      構造(skelForm・design #12-M 2026-07-13)＝2/4/8で使い回すフォーム型リテラル回帰を選んでから生成。 */}
                  <label className="tool-item" aria-label="skel-form" onClick={(e) => e.stopPropagation()}>
                    構造
                    <select value={gen.skelForm} onChange={(e) => gen.setSkelForm(e.target.value as "" | "period" | "aaba" | "cadence-swap" | "sentence")}>
                      <option value="">おまかせ</option>
                      <option value="period">前半くり返し</option>
                      <option value="aaba">AABA</option>
                      <option value="cadence-swap">終止だけ変えて反復</option>
                      <option value="sentence">提示→畳み掛け(sentence)</option>
                    </select>
                  </label>
                  <button type="button" className="tool-item" aria-label="gen-skeleton" disabled={gen.genBusy} onClick={() => { setToolsOpen(false); void gen.genSkeleton(); }}>
                    {gen.genBusy ? "生成中…" : "骨格"}
                  </button>
                  {/* P4/P5（2026-07-10・UX再設計）：プリセット主役＋🎲サイコロ＋耳語ラベルの詳細（群でまとめる）。押す前に設定→生成。 */}
                  {sectionChords().length > 0 && (
                    <div className="gen-knobs" onClick={(e) => e.stopPropagation()}>
                      <div className="preset-head">
                        <div className="preset-row" aria-label="melody-presets">
                          {MELODY_PRESETS.map((p) => (
                            <button key={p.name} type="button" className={"chip" + (gen.preset === p.name ? " on" : "")} aria-label={`preset-${p.name}`} aria-pressed={gen.preset === p.name} onClick={() => gen.applyPreset(p.name, p.v)}>{p.label}</button>
                          ))}
                        </div>
                        <button type="button" className="dice-btn" aria-label="dice-roll" title="ノブをランダムに振る（ロックは固定）" onClick={gen.rollDice}><Icon name="dice" size={18} /></button>
                      </div>
                      <button
                        type="button"
                        className={"knob-details-toggle" + (gen.detailsOpen ? " on" : "")}
                        aria-label="knob-details-toggle"
                        aria-expanded={gen.detailsOpen}
                        onClick={() => gen.setDetailsOpen((v) => !v)}
                      >
                        {gen.detailsOpen ? "▾ 細かく設定する" : "▸ 細かく設定する"}
                      </button>
                      {gen.detailsOpen && <>
                        <div className="knob-group-h">リズムのノリ</div>
                        {gen.sliderRow("density", "細かさ", gen.density, gen.setDensity, "スカスカ", "ぎっしり", "density")}
                        {gen.sliderRow("swing", "跳ね", gen.swing, gen.setSwing, "まっすぐ", "はねる", "swing")}
                        {gen.segRow("runs", "駆け上がり", "16分の走り", gen.runs, gen.setRuns, "runs")}
                        {gen.segRow("push", "前ノリ", "拍を食う", gen.push, gen.setPush, "push")}
                        <label className="knob-row">
                          <span className="knob-name">最小音符<small>速い曲は粗く</small></span>
                          <select aria-label="finest" value={gen.finest} onChange={(e) => { gen.setFinest(e.target.value as "" | "quarter" | "eighth"); gen.setPreset(""); }}>
                            <option value="">おまかせ(速さ連動)</option>
                            <option value="quarter">4分まで</option>
                            <option value="eighth">8分まで</option>
                          </select>
                        </label>
                        {/* リズムパーツ層 L1（design #20 S4-1）：プリセットを押した順に小節へローテで敷く。未選択=従来抽選 */}
                        <div className="knob-seg" aria-label="rhythmParts">
                          <span className="knob-name">リズムパーツ<small>小節に順に敷く(白玉=長音)</small></span>
                          <span className="seg-ctl seg-wrap">
                            {RHYTHM_PART_UI.map((rp) => {
                              const idx = gen.rhythmParts.indexOf(rp.id);
                              return (
                                <button key={rp.id} type="button" className={"seg-b" + (idx >= 0 ? " on" : "")} aria-label={`rpart-${rp.id}`} aria-pressed={idx >= 0} title={idx >= 0 ? `${idx + 1}番目に敷く` : "小節に敷く"} onClick={() => gen.toggleRhythmPart(rp.id)}>{rp.label}{idx >= 0 ? <sup>{idx + 1}</sup> : null}</button>
                              );
                            })}
                          </span>
                        </div>
                        <label className="knob-row" aria-label="voice">
                          <span className="knob-name">声種<small>音域と歌いやすさの基準</small></span>
                          <select value={gen.voice} onChange={(e) => { gen.setVoice(e.target.value as "" | "female_pop" | "male_pop" | "mix" | "vocaloid"); gen.setPreset(""); }}>
                            <option value="">おまかせ(女性平均)</option>
                            <option value="female_pop">女性ポップ</option>
                            <option value="male_pop">男性ポップ</option>
                            <option value="mix">ミックス</option>
                            <option value="vocaloid">ボカロ(C6開放)</option>
                          </select>
                        </label>
                        <div className="knob-group-h">歌い回し</div>
                        {gen.segRow("expression", "タメ", "強拍のもたれ", gen.expression, gen.setExpression, "expression")}
                        {gen.segRow("hook", "口ずさみ", "反復音フック", gen.hook, gen.setHook, "hook")}
                        {gen.sliderRow("foreground", "冒険度", gen.foreground, gen.setForeground, "おなじみ", "冒険", "foreground")}
                        {gen.sliderRow("articulation", "歯切れ", gen.articulation, gen.setArticulation, "なめらか", "くっきり", "articulation")}
                        <div className="knob-group-h">フレーズの組み立て</div>
                        <label className="knob-row" aria-label="phrasing">
                          <span className="knob-name">句割り</span>
                          <select value={gen.phrasing} onChange={(e) => { gen.setPhrasing(e.target.value as "" | "symmetric" | "asymmetric" | "period" | "sentence"); gen.setPreset(""); }}>
                            <option value="">おまかせ</option>
                            <option value="symmetric">対称(問→答)</option>
                            <option value="asymmetric">非対称(3+3+2)</option>
                            <option value="period">4小節句[4,4]</option>
                            <option value="sentence">短短長[2,2,4]</option>
                          </select>
                        </label>
                        <label className="knob-row" aria-label="form">
                          <span className="knob-name">展開</span>
                          <select value={gen.form} onChange={(e) => { gen.setForm(e.target.value as "" | "sentence"); gen.setPreset(""); }}>
                            <option value="">おまかせ</option>
                            <option value="sentence">起承転結(文)</option>
                          </select>
                        </label>
                        {gen.segRow("breathe", "息継ぎ", "句アタマの間", gen.breathe, gen.setBreathe, "breathe")}
                        {gen.sliderRow("flow", "つなぎ", gen.flow, gen.setFlow, "ぶつ切れ", "長く連結", "flow")}
                        {gen.sliderRow("pickup", "歌い出し", gen.pickup, gen.setPickup, "拍アタマ", "弱起(食い込み)", "pickup")}
                        {sectionBass().length > 0 && <>
                          <div className="knob-group-h">他パートとの絡み</div>
                          <div className="knob-seg" aria-label="counter">
                            <span className="knob-name">ベースをよける<small>並行5度8度を避ける</small></span>
                            <span className="seg-ctl">
                              {([["OFF", ""], ["弱", "weak"], ["中", "mid"], ["強", "strong"]] as [string, "" | "weak" | "mid" | "strong"][]).map(([lab, v]) => (
                                <button key={v || "off"} type="button" className={"seg-b" + (gen.counter === v ? " on" : "")} aria-label={`counter-${v || "off"}`} aria-pressed={gen.counter === v} onClick={() => { gen.setCounter(v); gen.setPreset(""); }}>{lab}</button>
                              ))}
                            </span>
                          </div>
                        </>}
                        <div className="knob-group-h">人間味・仕上げ</div>
                        {/* WP-D2 humanize 較正：揺れは 1/f（人間寄り）・部位別に上限（K/S/HH タイト〜メロ自由）。OFF=機械通り／弱=既定の自然な揺れ／強=生っぽく(盛りすぎは自動で頭打ち) */}
                        {gen.segRow("humanize", "人間味", "自然な揺れ(1/f)・盛り上限あり", gen.humanize, gen.setHumanize, "humanize")}
                      </>}
                    </div>
                  )}
                  {gen.melodyLaneNotes().length > 0 && (
                    <>
                      <div className="tools-sep">メロ加工</div>
                      <button type="button" className="tool-item" aria-label="harmony-up" title="調内で平行3度上の第2声部" onClick={() => { setToolsOpen(false); gen.makeHarmony(2); }}>上ハモ</button>
                      <button type="button" className="tool-item" aria-label="harmony-down" title="調内で平行3度下の第2声部" onClick={() => { setToolsOpen(false); gen.makeHarmony(-2); }}>下ハモ</button>
                      {sectionChords().length > 0 && (
                        <>
                          <button type="button" className="tool-item" aria-label="fit-to-chords" title="メロの各音を近いコードトーンへ寄せる" disabled={gen.genBusy} onClick={() => { setToolsOpen(false); void gen.fitToChords(); }}>コードに合わせる</button>
                          <button type="button" className="tool-item" aria-label="analyze-fit" title="メロとコードの噛み合いを診断（読むだけ）" onClick={() => { setToolsOpen(false); void gen.analyzeFit(); }}>噛み合い診断</button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="tools-sep">書き出し</div>
              <button type="button" className="tool-item" aria-label="export-midi" onClick={() => { setToolsOpen(false); downloadMidi(composite(), `${liveTitle || "section"}.mid`, tempo, liveMeter ?? null, undefined, sectionFeel()); }}>MIDI</button>
              <button type="button" className="tool-item" aria-label="export-midi-split" title="メロ/コード/ベース/リズムを別トラックに" onClick={() => { setToolsOpen(false); downloadMultitrackMidi(laneTracks(), `${liveTitle || "section"}-tracks.mid`, tempo, liveMeter ?? null, sectionFeel()); }}>MIDI（分割）</button>
            </div>
          )}
        </div>
        {/* 「骨格を鳴らす」は再生機能＝下端トランスポートへ移設（オーナーFB 2026-07-12）。ここ(いじる横)には置かない。 */}
      </div>
      {loadErr && (
        <p className="fit-report" aria-label="load-error" onClick={() => void load()}>
          読み込みに失敗しました <span className="muted">（タップで再試行）</span>
        </p>
      )}
      {gen.fitReport && (
        <p className="fit-report" aria-label="fit-report" onClick={() => gen.setFitReport(null)}>
          {gen.fitReport} <span className="muted">（タップで消す）</span>
        </p>
      )}

      {gen.cands.length > 0 && (
        <div
          className="reshape-bar"
          aria-label="part-candidate"
          style={{ ["--k" as string]: `var(--k-${gen.cands[0]!.kind === "chord_progression" ? "chord" : gen.cands[0]!.kind})` }}
        >
          <span className="reshape-label">
            {laneOf(gen.cands[0]!.kind)?.label ?? gen.cands[0]!.kind}候補 {gen.cands.length}件（この進行に生成・見て選ぶ）
            {/* 候補レンズ（design #12-M・WP-M3）：選んだ軸で並べ替えるだけ＝候補は弾かない。既定=生成順=bit一致。メロ候補のみ。 */}
            {gen.cands[0]!.kind === "melody" && (
              <select className="lens-select" aria-label="lens-axis" value={gen.lensAxis} onChange={(e) => gen.setLensAxis(e.target.value as typeof gen.lensAxis)} title="並べ替え軸（レンズ＝候補を弾かず並べ替えるだけ）">
                {LENS_AXES.map((a) => <option key={a.id} value={a.id}>並べ替え：{a.label}</option>)}
              </select>
            )}
          </span>
          {/* P2（2026-07-10・UX再設計）：候補を横スクロールのトレイで並べて比較。各カード＝MiniRoll＋メタ＋試聴/keep/置く/捨てる。 */}
          <div className="cand-tray" aria-label="candidate-tray">
            {gen.displayCands.map((c) => {
              const cn = notesForContent(c.kind, c.content);
              const bars = cn.length ? Math.max(1, Math.ceil(Math.max(...cn.map((n) => n.start + n.dur)) / BPB - 1e-6)) : 0;
              const kept = gen.keptCids.has(c.cid);
              // 対位法バッジ（design #20 S3d・指摘のみ・禁止しない）：違反ありは ⚠＋種別、無ければ小さく「対位OK」。
              const vl = voiceLeadingBadge(c.meta);
              // レンズスコアバッジ（design #12-M・WP-M3）：並べ替え軸を選んだ時だけ、その軸のスコアを表示（審判でなく目安）。
              const lb = lensBadge(c.meta, gen.lensAxis);
              return (
                <div key={c.cid} className={"cand-card" + (kept ? " kept" : "")} aria-label="candidate-card">
                  {cn.length > 0 && (
                    <span className="cand-preview" aria-label="candidate-preview">
                      <MiniRoll neta={neta} notes={cn} />
                      <span className="cand-meta">
                        {bars}小節・{cn.length}音{kept ? " ♡" : ""}
                        {vl && <span className={"cand-vl" + (vl.warn ? " warn" : " ok")} aria-label="voiceleading-badge" title={c.meta?.voiceLeadingSummary}>{vl.text}</span>}
                        {lb && <span className="cand-lens" aria-label="lens-badge" title={`${lb.label}スコア（並べ替えの目安・審判ではない）`}>{lb.label} {lb.text}</span>}
                      </span>
                    </span>
                  )}
                  <div className="cand-actions">
                    <button type="button" className="tb-tool" aria-label="audition-candidate" title="試聴" onClick={() => void gen.auditionCandidate(c)}>▶</button>
                    <button type="button" className="tb-tool" aria-label="keep-candidate" aria-pressed={kept} title="気に入ったら残す" onClick={() => gen.toggleKeep(c.cid)}>{kept ? "♥" : "♡"}</button>
                    <button type="button" className="tb-tool primary" aria-label="place-candidate" title="レーンに置く" onClick={() => void gen.placeCandidate(c)}>置く</button>
                    <button type="button" className="tb-tool" aria-label="drop-candidate" title="捨てる" onClick={() => gen.removeCand(c.cid)}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cand-tray-foot">
            <button type="button" className="tb-tool" aria-label="more-candidates" disabled={gen.genBusy} onClick={() => gen.lastPartRef.current && void gen.genPart(gen.lastPartRef.current, { skeletonNetaId: gen.lastPartRef.current.skeletonNetaId })}>
              {gen.genBusy ? "…" : <><Icon name="dice" size={14} /> もっと</>}
            </button>
            <button type="button" className="tb-tool" aria-label="close-candidate" onClick={gen.closeCandidate}>閉じる</button>
          </div>
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
                  onTap={(pos) => void pk.openPicker(lane, pos)}
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
                  <MiniRoll neta={c.node.neta} notes={blockPreviewNotes(c)} />
                  <span className="lane-block-label">
                    {c.node.neta.title ?? c.node.neta.text ?? KIND_LABEL[c.node.neta.kind] ?? c.node.neta.kind}
                  </span>
                  {/* 骨格ブロック（design #20 S2）：吹く▶＝gen_melody(skeletonNetaId)／コード無し時はコードを推定(harmonize)。 */}
                  {!eraseMode && c.node.neta.kind === "skeleton" && (
                    <span className="skel-block-actions">
                      <span role="button" tabIndex={0} className="skel-blow" aria-label={`blow-${c.node.neta.id}`} title="この骨格からメロを作る" onClick={(e) => { e.stopPropagation(); gen.blowSkeleton(c); }}>メロを作る▶</span>
                      {/* ベース表面化（design #20 S3c）：明示ベース点/休符がある骨格から実体ベースを吹く（無ければroot導出=従来ベース生成と同じ）。 */}
                      <span role="button" tabIndex={0} className="skel-blow" aria-label={`blow-bass-${c.node.neta.id}`} title="この骨格からベースを作る（明示ベース区間を反映）" onClick={(e) => { e.stopPropagation(); gen.blowSkeletonBass(c); }}>ベ▶</span>
                      {/* 対旋律（WP-X3a）：メロレーンの主メロを相手に対旋律を作る（主メロの間まに絡む第2声・realized_from流儀）。 */}
                      <span role="button" tabIndex={0} className="skel-blow" aria-label={`blow-counter-${c.node.neta.id}`} title="主メロを相手に対旋律を作る（間まに絡む第2声）" onClick={(e) => { e.stopPropagation(); void gen.blowSkeletonCounter(c); }}>対旋律を作る▶</span>
                      {sectionChords().length === 0 && (
                        <span role="button" tabIndex={0} className="skel-estimate" aria-label={`estimate-${c.node.neta.id}`} title="骨格からコードを推定（harmonize）" onClick={(e) => { e.stopPropagation(); void gen.estimateChords(c); }}>コードを推定</span>
                      )}
                    </span>
                  )}
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
              {drag &&
                drag.laneKey === lane.key &&
                (() => {
                  // ゴーストは「実際に確定するコピー」までスナップ＝見た目＝結果（中点を過ぎたぶんだけ伸びる）。
                  const ps = loopPositions(drag.fromPos, drag.unit, drag.endBeat, TOTAL);
                  const end = (ps.length ? Math.max(...ps) : drag.fromPos) + drag.unit; // 最後のコピー終端（無ければ元ブロック終端）
                  return (
                    <div
                      className="loop-ghost"
                      aria-hidden="true"
                      style={{
                        left: `${(drag.fromPos / TOTAL) * 100}%`,
                        width: `${((Math.min(end, TOTAL) - drag.fromPos) / TOTAL) * 100}%`,
                      }}
                    />
                  );
                })()}
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

      {pk.picker && (
        <PlacePicker
          picker={pk.picker}
          neta={neta}
          liveTitle={liveTitle}
          BPB={BPB}
          keyPc={keyPc}
          pq={pk.pq}
          setPq={pk.setPq}
          pickerSource={pk.pickerSource}
          setPickerSource={pk.setPickerSource}
          pickerOtherMeter={pk.pickerOtherMeter}
          setPickerOtherMeter={pk.setPickerOtherMeter}
          pickerRecs={pk.pickerRecs}
          placeAt={pk.placeAt}
          previewNeta={pk.previewNeta}
          createInLane={pk.createInLane}
          onClose={() => pk.setPicker(null)}
        />
      )}
      <TransportBar
        state={tp.state}
        loopOn={tp.loopOn}
        timeRef={tp.timeRef}
        onPlayPause={tp.playPause}
        onRewind={tp.rewind}
        onToggleLoop={tp.toggleLoop}
        extra={(() => {
          // 「骨格を鳴らす」＝再生機能なのでトランスポートへ（オーナーFB 2026-07-12）。骨格レーンに子がある時だけ。
          // ON＝メロをミュートし骨格2声(Strings/Cello)を伴奏に重ねて対位法的に聴く（再生のみ・MIDI書き出しには入らない）。
          const skelLane = LANES.find((l) => l.key === "skeleton");
          return skelLane && laneChildren(skelLane).length > 0 ? (
            <button
              type="button"
              className={"tp-btn tp-skel" + (skelAudible ? " on" : "")}
              aria-label="skeleton-audible"
              aria-pressed={skelAudible}
              title="骨格を鳴らす（メロをミュートして骨格2声を伴奏に重ね対位法で確認・再生のみ）"
              onClick={() => setSkelAudible((v) => !v)}
            >
              骨格{skelAudible ? "中" : ""}
            </button>
          ) : null;
        })()}
      />
    </div>
  );
}
