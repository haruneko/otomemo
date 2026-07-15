import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Neta } from "../api";
import { decodeVocal } from "../audio"; // ♪仮歌：wav→AudioBuffer デコード（再生と同一 AudioContext）
import { KIND_LABEL } from "../kinds";
import { isProjectTag, projectName } from "../project";
import { useTransport } from "../useTransport";
import { TransportBar } from "./TransportBar";
import {
  notesForContent,
  compositeNotes,
  vocalMelodyFromComposite,
  muteMelodyForVocal,
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
import { TinkerSheet } from "./TinkerSheet";
import { useMelodyGen, voiceLeadingBadge, LENS_AXES, lensBadge } from "../useMelodyGen";
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
  // ♪仮歌（Section）：メロレーンを VOICEVOX で歌わせ、伴奏と**同一クロック**で鳴らす（譜割り検証の本番）。
  // vocalMel＝合成メロ声部（複数配置/隙間/オフセットは compositeNotes が連結済み）→歌唱ノート＋整合情報（純関数）。
  const vocalMel = useMemo(() => vocalMelodyFromComposite(compositeNotes(children, keyPc, neta.mode)), [children, keyPc, neta.mode]);
  // singBuf がどの入力(歌唱ノート＋テンポ)のものか＝メロ/テンポ/歌詞が変われば別キー＝作り直し（hash 違い＝新asset）。
  const singInputKey = useMemo(() => JSON.stringify({ n: vocalMel.notes, t: tempo }), [vocalMel, tempo]);
  const [singOn, setSingOn] = useState(false); // 仮歌ON＝メロ楽器をミュートして歌を再生に乗せる（既定OFF＝bit一致）
  const [singBuf, setSingBuf] = useState<AudioBuffer | null>(null); // デコード済み歌唱 wav
  const [singBusy, setSingBusy] = useState(false); // 合成中スピナー
  const [singMsg, setSingMsg] = useState<string | null>(null); // 音域移調/クランプ注記・失敗メッセージ
  const singKeyRef = useRef<string | null>(null); // singBuf の入力キー（キャッシュ判定用）
  // #49/#58/#59 トランスポート。合成結果を再生／プレイヘッドは TOTAL(グリッド全体)尺・拍子BPB。
  // 再生ノートは playComposite＝骨格トグルONの間だけ骨格2声が混ざる（書き出しは composite のまま）。
  // 仮歌ON＝vocal に AudioBuffer を渡す＝playNotes が伴奏と同一 transport クロックで歌を鳴らす（OFF/未生成＝従来一致）。
  const tp = useTransport(() => playComposite(), tempo, {
    scaleBeats: TOTAL, bpb: BPB, feel: sectionFeel(), compound: isCompoundMeter(liveMeter),
    vocal: singOn && singBuf ? { buffer: singBuf, startBeat: vocalMel.startBeat } : null,
  });

  // メロ/テンポ/歌詞が仮歌ON中に変わったら＝古い歌が伴奏とズレる＝自動でOFFにし作り直しを促す（正直な v1）。
  useEffect(() => {
    if (singOn && singKeyRef.current !== null && singKeyRef.current !== singInputKey) {
      setSingOn(false);
      setSingMsg("メロが変わりました。もう一度 ♪仮歌 を押して作り直してください。");
    }
  }, [singInputKey, singOn]);

  // ♪仮歌トグル：ON で（必要なら）合成→デコード→再生に乗せる／OFF でメロ楽器へ復帰。
  const toggleSing = useCallback(async () => {
    if (singOn) { setSingOn(false); return; } // OFF＝vocal を渡さない＝メロ楽器が復帰（muteMelodyForVocal を外す）
    if (!vocalMel.hasLyric) return; // 歌詞なしは disabled のはず（防御）
    if (singBuf && singKeyRef.current === singInputKey) { setSingMsg(null); setSingOn(true); return; } // 同一入力＝再合成せず
    setSingBusy(true);
    setSingMsg(null);
    try {
      const r = await api.sing(vocalMel.notes, tempo); // 同一入力なら api 側 content-hash で合成スキップ
      const bytes = await fetch(api.assetUrl(r.assetId)).then((x) => x.arrayBuffer());
      const buf = await decodeVocal(bytes);
      setSingBuf(buf);
      singKeyRef.current = singInputKey;
      setSingOn(true);
      const notes: string[] = [];
      if (r.shift) notes.push(`歌える音域へ ${r.shift > 0 ? "+" : ""}${r.shift} 半音移調`);
      if (r.clamped) notes.push(`${r.clamped}音を音域内に丸め`);
      if (vocalMel.clampedPickup) notes.push(`弱起 ${vocalMel.clampedPickup}音を頭出し0へクランプ`);
      setSingMsg(notes.length ? notes.join("／") : null);
    } catch (e) {
      setSingOn(false);
      setSingMsg(`仮歌の生成に失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSingBusy(false);
    }
  }, [singOn, singBuf, singInputKey, vocalMel, tempo]);

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
    const base = skelAudible ? [...composite().filter((n) => n.part !== "melody"), ...skelEar()] : composite();
    // ♪仮歌ON＝メロ楽器音をミュート（歌が主・二重化を避ける）。歌本体は vocal 経路（AudioBuffer）で乗る。書き出しは不変。
    return singOn && singBuf ? muteMelodyForVocal(base) : base;
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
            <TinkerSheet
              gen={gen}
              isSong={isSong}
              sectionChords={sectionChords}
              sectionBass={sectionBass}
              onClose={() => setToolsOpen(false)}
              onExportMidi={() => { setToolsOpen(false); downloadMidi(composite(), `${liveTitle || "section"}.mid`, tempo, liveMeter ?? null, undefined, sectionFeel()); }}
              onExportMidiSplit={() => { setToolsOpen(false); downloadMultitrackMidi(laneTracks(), `${liveTitle || "section"}-tracks.mid`, tempo, liveMeter ?? null, sectionFeel()); }}
            />
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
      {singMsg && (
        <p className="fit-report" aria-label="sing-report" onClick={() => setSingMsg(null)}>
          {singMsg} <span className="muted">（タップで消す）</span>
        </p>
      )}

      {gen.cands.length > 0 && (
        <div
          className="reshape-bar"
          aria-label="part-candidate"
          style={{ ["--k" as string]: `var(--k-${gen.cands[0]!.kind === "chord_progression" ? "chord" : gen.cands[0]!.kind})` }}
        >
          <span className="reshape-label">
            候補 {gen.cands.length}件（この進行に生成・見て選ぶ）
          </span>
          {/* P2/T5（UX再設計・おまかせで一式）：候補を kind 別グループで並べる＝一式で複数パーツが積まれても
              「どのパーツの候補か」が分かる。各カード＝MiniRoll＋メタ＋試聴/keep/置く/捨てる。トレイ自体は1つ。 */}
          <div className="cand-tray" aria-label="candidate-tray">
            {(() => {
              // kind 別にグループ化（表示順＝displayCands の順＝生成順/レンズ順）。
              const groups: { kind: string; cands: typeof gen.displayCands }[] = [];
              for (const c of gen.displayCands) {
                const g = groups.find((x) => x.kind === c.kind);
                if (g) g.cands.push(c); else groups.push({ kind: c.kind, cands: [c] });
              }
              return groups.map((grp) => (
                <div key={grp.kind} className="cand-group" aria-label={`cand-group-${grp.kind}`}>
                  <div className="cand-group-h">
                    {laneOf(grp.kind)?.label ?? grp.kind}候補 {grp.cands.length}件
                    {/* 候補レンズ（design #12-M・WP-M3）：選んだ軸で並べ替えるだけ＝候補は弾かない。既定=生成順=bit一致。メロ候補のみ。 */}
                    {grp.kind === "melody" && (
                      <select className="lens-select" aria-label="lens-axis" value={gen.lensAxis} onChange={(e) => gen.setLensAxis(e.target.value as typeof gen.lensAxis)} title="並べ替え軸（レンズ＝候補を弾かず並べ替えるだけ）">
                        {LENS_AXES.map((a) => <option key={a.id} value={a.id}>並べ替え：{a.label}</option>)}
                      </select>
                    )}
                  </div>
                  {grp.cands.map((c) => {
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
                          <button type="button" className="tb-tool" aria-label="drop-candidate" title="捨てる" onClick={() => gen.removeCand(c.cid)}><Icon name="trash" size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
          <div className="cand-tray-foot">
            <button type="button" className="tb-tool" aria-label="more-candidates" disabled={gen.genBusy || !gen.hasLastPart} title={!gen.hasLastPart ? "直前の生成がまだない" : undefined} onClick={() => gen.lastPartRef.current && void gen.genPart(gen.lastPartRef.current, { skeletonNetaId: gen.lastPartRef.current.skeletonNetaId })}>
              {gen.genBusy ? "…" : <><Icon name="dice" size={14} /> もっと</>}
            </button>
            <button type="button" className="tb-tool" aria-label="close-candidate" onClick={gen.closeCandidate}>閉じる</button>
          </div>
        </div>
      )}

      {/* セクション尺（小節数）＝可変（評価修正A）。placed content より短くはできない（自動で伸びる）。 */}
      {/* ±8 は「8小節フレーズ」単位のジャンプ（8→32 が3タップ・M3 是正）。±1 は微調整で併存。 */}
      <div className="section-bars" aria-label="section-bars">
        <span className="muted">小節</span>
        <button type="button" aria-label="bars-dec8" disabled={BARS <= MIN_BARS} title="8小節減らす" onClick={() => void setSectionBars(BARS - 8)}>−8</button>
        <button type="button" aria-label="bars-dec" disabled={BARS <= MIN_BARS} onClick={() => void setSectionBars(BARS - 1)}>−</button>
        <span aria-label="bars-count">{BARS}</span>
        <button type="button" aria-label="bars-inc" disabled={BARS >= MAX_BARS} onClick={() => void setSectionBars(BARS + 1)}>＋</button>
        <button type="button" aria-label="bars-inc8" disabled={BARS >= MAX_BARS} title="8小節増やす" onClick={() => void setSectionBars(BARS + 8)}>＋8</button>
      </div>
      <div className="lanes" aria-label="timeline" ref={tp.scrollerRef}>
        {/* content 幅の内枠：BARS>10 で lane-track に min-width が付き横スクロールになる。playhead を
            この内枠の中に置く＝playhead の `left: calc(44px + --ph*(100%-44px))` の 100% が「可視幅」でなく
            「content 幅」を指す＝blocks/ruler（同じ content 幅基準）と必ず一致（32小節でプレイヘッドがズレる回帰の根治）。 */}
        <div className="lanes-inner" style={trackStyle ? { minWidth: `${44 + BARS * 34}px` } : undefined}>
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
      </div>
      <p className="muted lanes-hint">
        空きをタップ→置く/新規作成／ブロックをタップで編集（消しゴムモードでタップ＝外す）／右端ドラッグで繰り返し
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
          const skelBtn =
            skelLane && laneChildren(skelLane).length > 0 ? (
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
          // ♪仮歌＝メロを VOICEVOX で歌わせ伴奏と同期再生（譜割り検証）。歌詞(syllable)付き音が無ければ disabled。
          const singTitle = singBusy
            ? "歌声を作っています…"
            : !vocalMel.hasLyric
              ? "メロに歌詞(syllable)がありません。メロを開いて歌詞を載せてください。"
              : singOn
                ? "仮歌を止めてメロ楽器へ戻す"
                : "メロを歌わせて伴奏と一緒に鳴らす（仮歌・同期再生）";
          const singBtn = (
            <button
              type="button"
              className={"tp-btn tp-sing" + (singOn ? " on" : "")}
              aria-label="vocal-guide"
              aria-pressed={singOn}
              disabled={singBusy || !vocalMel.hasLyric}
              title={singTitle}
              onClick={() => void toggleSing()}
            >
              {singBusy ? "♪…" : singOn ? "仮歌中" : "♪仮歌"}
            </button>
          );
          return (
            <>
              {skelBtn}
              {singBtn}
            </>
          );
        })()}
      />
    </div>
  );
}
