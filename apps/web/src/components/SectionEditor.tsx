import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Neta, type NetaPatch } from "../api";
import type { CowGuard } from "../useCowGuard"; // 型のみ＝実行時依存なし（CoW ガード・S2 Fix C）
import { KIND_LABEL } from "../kinds";
import { isProjectTag, projectName } from "../project";
import { useTransport } from "../useTransport";
import { useVocalRender } from "../useVocal"; // ♪仮歌（メロの楽器＝歌声）の共有レンダ＝ネタ単体▶と同じ経路
import { TransportBar } from "./TransportBar";
import {
  notesForContent,
  compositeNotes,
  vocalMelodyFromComposite,
  singOf,
  trackProgramOf,
  downloadMidi,
  downloadMultitrackMidi,
  beatsPerBar,
  feelOf,
  isCompoundMeter,
  isSkeleton,
  partTracks,
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
import { FormStrip } from "./FormStrip"; // song のフォームストリップ（design「#曲フォーム」S1）＝小節グリッドの置換
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
  cow,
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
  // CoW ガード（S2 Fix C）＝共有 section の bars/レーン設定（直接 updateNeta）も安全弁を通す。
  // NetaDialog(useNetaEditor) と同一インスタンス＝決定はエディタセッションで1つ。未指定＝従来どおり（bit-safe）。
  cow?: CowGuard;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loadErr, setLoadErr] = useState(false); // getComposition 失敗時＝空白で固まらず再試行を出す（perf耳FB 2026-07-09）
  // ③ 右端ドラッグでループ伸ばし中のプレビュー（fromPos〜endBeat をゴースト表示）。
  const [drag, setDrag] = useState<{ childId: string; laneKey: string; fromPos: number; unit: number; endBeat: number } | null>(null);
  const [eraseMode, setEraseMode] = useState(false); // 消しゴムモード＝ブロックtapで外す（PianoRollの描く/選ぶと同じモード流儀）
  const [toolsOpen, setToolsOpen] = useState(false); // いじる▾ メニュー（生成/ハモリ/書き出しを集約・メロ編集画面と整合・⑤）
  const toolsRef = useRef<HTMLDivElement>(null);
  useDismiss(toolsRef, toolsOpen, useCallback(() => setToolsOpen(false), [])); // 外タップ/Escで閉じる
  // レーンの表示/演奏の有効化（オーナー要望「使わないレーンで画面と耳を汚さない」・Fable裁定）。
  // 既定＝中身のあるレーン＋定番4（コード/メロ/ベース/ドラム）を表示。手動で出した/畳んだ/ミュートした状態は
  // section content に保存（lanes_shown/lanes_hidden/lanes_muted＝レーンidの配列）＝新 kind が増えても既定畳み。
  const secContent = (neta.content && typeof neta.content === "object" ? neta.content : {}) as {
    lanes_shown?: string[]; lanes_hidden?: string[]; lanes_muted?: string[];
  };
  const [lanesShown, setLanesShown] = useState<string[]>(() => secContent.lanes_shown ?? []);
  const [lanesHidden, setLanesHidden] = useState<string[]>(() => secContent.lanes_hidden ?? []);
  const [lanesMuted, setLanesMuted] = useState<string[]>(() => secContent.lanes_muted ?? []);
  const [addLaneOpen, setAddLaneOpen] = useState(false); // ＋レーン メニュー（畳んだレーンから選んで出す）
  const addLaneRef = useRef<HTMLDivElement>(null);
  useDismiss(addLaneRef, addLaneOpen, useCallback(() => setAddLaneOpen(false), []));
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
  // 表示するレーン／畳んでいるレーン（＝「＋レーン」候補）。song はアレンジ専用＝従来どおり全レーン（畳み無し）。
  const visibleLanesList: readonly Lane[] = isSong ? LANES : sctx.visibleLanes(secCtx, lanesShown, lanesHidden);
  const collapsedLanesList: readonly Lane[] = isSong ? [] : sctx.collapsedLanes(secCtx, lanesShown, lanesHidden);
  // section 自身への直接書き（bars/レーン設定）＝CoW ガードを通す（S2 Fix C）。落ちサビの常道＝共有セクションの
  // レーンミュートが確認なしに全配置へ効く穴の根治。cow 未指定（トップから開いた/ハーネス外）＝従来どおり即保存。
  // 返り＝false は「やめる」＝呼び出し側は楽観更新した state を戻す。"branched"＝分家へ適用済み（onForked が載せ替え）。
  const writeSelf = async (patch: NetaPatch): Promise<boolean> => {
    if (cow) {
      const res = await cow.guard(patch);
      if (res.action === "cancel") return false;
      if (res.action === "branched") return true; // 分家に書いた＝原本には書かない（この画面は再マウントされる）
    }
    await api.updateNeta(neta.id, patch).catch(() => {});
    return true;
  };
  // 手動レーン状態を section content に保存（既存 content を潰さずマージ・fire-and-forget＝setSectionBars 流儀）。
  // content スキーマは自由形＝api 変更不要（updateNeta の既存経路）。revert＝CoW「やめる」時に楽観更新を戻す。
  const persistLanes = (next: { lanes_shown: string[]; lanes_hidden: string[]; lanes_muted: string[] }, revert?: () => void) => {
    void writeSelf({ content: { ...secContent, ...next } }).then((ok) => { if (!ok) revert?.(); });
  };
  const showLane = (key: string) => {
    const shown = lanesShown.includes(key) ? lanesShown : [...lanesShown, key];
    const hidden = lanesHidden.filter((k) => k !== key);
    const prev = { shown: lanesShown, hidden: lanesHidden };
    setLanesShown(shown); setLanesHidden(hidden);
    persistLanes({ lanes_shown: shown, lanes_hidden: hidden, lanes_muted: lanesMuted }, () => { setLanesShown(prev.shown); setLanesHidden(prev.hidden); });
  };
  const hideLane = (key: string) => {
    const shown = lanesShown.filter((k) => k !== key);
    const hidden = lanesHidden.includes(key) ? lanesHidden : [...lanesHidden, key];
    const prev = { shown: lanesShown, hidden: lanesHidden };
    setLanesShown(shown); setLanesHidden(hidden);
    persistLanes({ lanes_shown: shown, lanes_hidden: hidden, lanes_muted: lanesMuted }, () => { setLanesShown(prev.shown); setLanesHidden(prev.hidden); });
  };
  const toggleMute = (key: string) => {
    const muted = lanesMuted.includes(key) ? lanesMuted.filter((k) => k !== key) : [...lanesMuted, key];
    const prev = lanesMuted;
    setLanesMuted(muted);
    persistLanes({ lanes_shown: lanesShown, lanes_hidden: lanesHidden, lanes_muted: muted }, () => setLanesMuted(prev));
  };
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
    const prev = secBars;
    setSecBars(b);
    const ok = await writeSelf({ bars: b }); // CoW ガード経由（S2 Fix C）
    if (!ok) { setSecBars(prev); return; } // やめる＝楽観更新を戻す（無変更）
    onChanged?.();
  }
  // 骨格レーンの「鳴らす」トグル（耳確認・オーナーFB 2026-07-11）。既定OFF＝従来どおり無音。保存しない（セッション内のみ）。
  const [skelAudible, setSkelAudible] = useState(false);
  // ♪仮歌（メロの楽器＝歌声）：各メロ子ネタの content.sing に従い、歌う子だけ VOICEVOX で歌わせ伴奏と同一クロックで
  // 鳴らす（入れ方はメロ側に集約＝Section 側トグルは撤去）。歌う子＝kind=melody かつ sing.enabled かつ歌詞(syllable)あり。
  // 各子は自分の配置オフセットで placed（compositeNotes([child]) で position 移調済み）＝複数メロ混在が自然に成立。
  const singingJobs = useMemo(() => {
    // 1st pass：歌う子（melody・sing.enabled・歌詞あり）を集める。ensemble はこの結合音高で決めるので全員揃えてから。
    const singers: { c: Child; sing: ReturnType<typeof singOf>; vm: ReturnType<typeof vocalMelodyFromComposite> }[] = [];
    // レーンミュート（再生のみ）された子は歌わせない＝ミュート＝合成/歌の両方から外す（一貫性）。
    for (const c of sctx.audibleChildren(secCtx, lanesMuted)) {
      const sing = c.node.neta.kind === "melody" ? singOf(c.node.neta.content) : undefined;
      if (!sing) continue;
      const vm = vocalMelodyFromComposite(compositeNotes([c], keyPc, neta.mode));
      if (!vm.hasLyric) continue; // 歌詞なし＝フォールバック楽器（歌わせない・ミュートもしない）
      singers.push({ c, sing, vm });
    }
    // A：全歌う子の結合音高＝ensemble（サーバがこの結合レンジで唯一のオクターブシフトを決める＝子ごとの割れ防止）。
    const ensemblePitches = singers.flatMap((s) => s.vm.notes.map((n) => Math.round(n.pitch)));
    const jobs: { key: string; notes: { pitch: number; start: number; dur: number; syllable?: string }[]; bpm: number; firstNoteBeat: number; speaker?: number; ensemblePitches: number[]; child: Child }[] = [];
    for (const { c, sing, vm } of singers) {
      // key に ensemble と speaker を含める＝歌う子の増減/ミュート/声色変更で shift が変わっても stale wav を返さない。
      jobs.push({
        key: JSON.stringify({ n: vm.notes, t: tempo, e: ensemblePitches, s: sing!.speaker ?? null }),
        notes: vm.notes, bpm: tempo, firstNoteBeat: vm.minStartBeat, speaker: sing!.speaker, ensemblePitches, child: c,
      });
    }
    return jobs;
  }, [children, keyPc, neta.mode, tempo, lanesMuted]); // secCtx は children/keyPc/mode 派生＝上の deps で十分
  const singingChildren = useMemo(() => new Set(singingJobs.map((j) => j.child)), [singingJobs]);
  const vocal = useVocalRender();
  const jobsRef = useRef(singingJobs);
  jobsRef.current = singingJobs;

  // #49/#58/#59 トランスポート。合成結果を再生／プレイヘッドは TOTAL(グリッド全体)尺・拍子BPB。
  // 再生ノートは playComposite＝骨格トグルONの間だけ骨格2声が混ざる（書き出しは composite のまま）。
  // getVocal＝再生押下（playPause で ensure レンダ後）に peek で最新 buffer 群を掴む（歌う子が無ければ null＝従来一致）。
  const tp = useTransport(() => playComposite(), tempo, {
    scaleBeats: TOTAL, bpb: BPB, feel: sectionFeel(), compound: isCompoundMeter(liveMeter),
    getVocal: () => vocal.peek(jobsRef.current),
  });

  // 再生＝歌う子があれば先に wav をレンダ（未キャッシュは「歌声を作っています…」busy）→ 伴奏と同期再生。停止/一時停止は素通し。
  const playPause = useCallback(async () => {
    if (tp.state === "stopped" && jobsRef.current.length) await vocal.ensure(jobsRef.current);
    tp.playPause();
  }, [tp.state, tp.playPause, vocal.ensure]);

  // Space=合成再生/一時停止（design #59）。入力中は無効。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
      e.preventDefault();
      void playPause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playPause]);

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

  // 共有バッジ（S2）：この子ネタが**複数の親から参照**されている（placementCount>=2）ものを印す＝
  // 「直すと他の曲/箇所にも効く」の可視化（copy-on-write の予告）。childId 単位で placements を引く
  // （地雷：反復配置は node.children が空なので配置ツリーには出ない共有情報＝逆引きが要る）。
  const [sharedChildIds, setSharedChildIds] = useState<Set<string>>(new Set());
  const distinctChildIds = useMemo(() => [...new Set(children.map((c) => c.node.neta.id))], [children]);
  const distinctChildKey = distinctChildIds.join(",");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const shared = new Set<string>();
      await Promise.all(
        distinctChildIds.map(async (id) => {
          const pl = await api.getPlacements(id).catch(() => ({ placementCount: 0 }));
          if ((pl.placementCount ?? 0) >= 2) shared.add(id);
        }),
      );
      if (alive) setSharedChildIds(shared);
    })();
    return () => { alive = false; };
  }, [distinctChildKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // compose 辺操作（削除/配置）の CoW ガード実行子（S3-a＝S2の既知の残の解消）。cow 無し＝そのまま原本へ（従来どおり）。
  // "branched"＝op は分家 id に対して実行済み（vary→親の辺差し替えは guardAction 内）＝原本の辺は無傷。
  const runEdgeOp = async (op: (targetId: string) => Promise<void>): Promise<boolean> => {
    if (!cow) {
      await op(neta.id);
      return true;
    }
    const res = await cow.guardAction(async (targetId) => { await op(targetId); });
    if (res.action === "cancel") return false;
    if (res.action === "branched") return true; // onForked が画面を分家へ載せ替える
    await op(neta.id);
    return true;
  };

  async function remove(childId: string, position?: number) {
    const ok = await runEdgeOp(async (targetId) => { await api.removeChild(targetId, childId, position); });
    if (!ok) return; // やめる＝辺は無傷
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
    runEdgeOp, // 候補「置く」の辺操作も CoW ガード（S3-a）
  });
  // 配置ピッカー（空セルタップ→ネタを選んで置く）＝Task#2 で usePlacePicker に分離。
  const pk = usePlacePicker({
    neta, keyPc, tempo, liveMeter,
    occupiedAt, overlapsOtherInLane, contentDur,
    sectionProjects, progForKind,
    reload: load, onChanged, onOpenNeta,
    runEdgeOp, // ピッカー配置/新規作成の辺操作も CoW ガード（S3-a）
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
    // レーンミュート（再生のみ・書き出しは全部入り）＝muted レーンの子を鳴らす合成から外す。
    // 骨格/仮歌のノート除去と同じ機構＝どれかがミュートならミュートで自然に合成される。lanesMuted 空なら children そのまま＝従来一致。
    const audibleKids = sctx.audibleChildren(secCtx, lanesMuted);
    // ♪仮歌＝歌う子の楽器音は muted フラグで再生スケジュールから外す（歌本体は vocal 経路の wav で鳴る＝二重化回避）。
    // ただし notes は残す＝弱起(負start)/尺が leadBeats・終端計算に効く（歌が伴奏と同じ弱起シフトに乗る）。書き出しは不変。
    const singKids = audibleKids.filter((c) => singingChildren.has(c));
    const restKids = audibleKids.filter((c) => !singingChildren.has(c));
    const audible = compositeNotes(restKids, keyPc, neta.mode);
    const mutedSing = compositeNotes(singKids, keyPc, neta.mode).map((n) => (n.part === "melody" ? { ...n, muted: true } : n));
    // 骨格を鳴らす＝メロ(part:"melody")をミュートし、骨格2声(Strings/Cello)を伴奏(コード/ベース/ドラム)に重ねて
    // 対位法的に聴く（メロと骨格の二重化＝ピアノが勝つのを避ける・オーナーFB 2026-07-12）。書き出し(composite)は不変。
    // 骨格レーン自体をミュートしている時は骨格2声も出さない（ミュート合成の一貫性）。
    const skel = skelAudible && !lanesMuted.includes("skeleton") ? skelEar() : [];
    const withSkel = skelAudible ? audible.filter((n) => n.part !== "melody") : audible;
    return [...withSkel, ...mutedSing, ...skel];
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
      {/* song の段階/次の一手（SongStatus）はフォームストリップの曲ヘッダへ統合（下の FormStrip 内）。 */}
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
              onExportMidiSplit={() => { setToolsOpen(false); downloadMultitrackMidi(isSong ? partTracks(composite()) : laneTracks(), `${liveTitle || "section"}-tracks.mid`, tempo, liveMeter ?? null, sectionFeel()); }}
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
      {vocal.busy && (
        <p className="fit-report" aria-label="sing-busy">歌声を作っています…</p>
      )}
      {vocal.msg && (
        <p className="fit-report" aria-label="sing-report" onClick={() => vocal.setMsg(null)}>
          {vocal.msg} <span className="muted">（タップで消す）</span>
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

      {/* song＝フォームストリップ（カード列・design「#曲フォーム」S1）／section＝従来の小節グリッド。 */}
      {isSong ? (
        <FormStrip
          neta={neta}
          children={children}
          keyPc={keyPc}
          tempo={tempo}
          mode={neta.mode}
          BPB={BPB}
          liveMeter={liveMeter}
          liveTitle={liveTitle}
          childDur={childDur}
          beatRef={tp.beatRef}
          playing={tp.state === "playing"}
          sectionProjects={sectionProjects}
          reload={load}
          onChanged={onChanged}
          onOpenNeta={onOpenNeta}
        />
      ) : (
      <>
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
        {visibleLanesList.map((lane) => (
          <div className="lane" key={lane.key}>
            <div className="lane-label">
              <span className="lane-name">{lane.label}</span>
              {/* レーンの表示/演奏（section のみ・song はアレンジ専用）。ミュート＝再生のみ／畳む＝表示のみ（配置は無傷）。 */}
              {!isSong && (
                <span className="lane-ctl">
                  <button
                    type="button"
                    className={"lane-mute" + (lanesMuted.includes(lane.key) ? " on" : "")}
                    aria-label={`mute-${lane.key}`}
                    aria-pressed={lanesMuted.includes(lane.key)}
                    title={lanesMuted.includes(lane.key) ? "ミュート中（再生のみ・MIDI書き出しは全部入り）＝タップで解除" : "このレーンをミュート（再生のみ・MIDI書き出しは全部入り）"}
                    onClick={() => toggleMute(lane.key)}
                  >
                    <Icon name={lanesMuted.includes(lane.key) ? "mute" : "volume"} size={12} />
                  </button>
                  <button
                    type="button"
                    className="lane-collapse"
                    aria-label={`collapse-${lane.key}`}
                    title="このレーンを畳む（配置は消えない・＋レーンで戻せる）"
                    onClick={() => hideLane(lane.key)}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
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
                    {/* 共有バッジ（S2）：2箇所以上で使われている子＝直すと全部に効く（分家の予告）。 */}
                    {sharedChildIds.has(c.node.neta.id) && (
                      <span className="lane-block-shared" aria-label={`shared-${c.node.neta.id}`} title="2箇所以上で使われています（直すと全部に効く・この曲だけ変えるには分家）">🔗</span>
                    )}
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
      </>
      )}

      {/* ＋レーン＝畳んでいるレーン（骨格/対旋律/リフ/コード楽器…）を選んで出す。使わない曲では画面を増やさない。 */}
      {!isSong && collapsedLanesList.length > 0 && (
        <div className="add-lane-wrap" ref={addLaneRef}>
          <button
            type="button"
            className={"tb-tool add-lane-btn" + (addLaneOpen ? " on" : "")}
            aria-label="add-lane"
            aria-expanded={addLaneOpen}
            title="使うレーンを出す（骨格・対旋律・リフ・コード楽器 等）"
            onClick={() => setAddLaneOpen((v) => !v)}
          >
            ＋レーン
          </button>
          {addLaneOpen && (
            <div className="add-lane-menu" role="menu" aria-label="add-lane-menu">
              {collapsedLanesList.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  role="menuitem"
                  className="add-lane-item"
                  aria-label={`add-lane-${l.key}`}
                  onClick={() => showLane(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
        onPlayPause={() => void playPause()}
        onRewind={tp.rewind}
        onToggleLoop={tp.toggleLoop}
        extra={(() => {
          // 「骨格を鳴らす」＝再生機能なのでトランスポートへ（オーナーFB 2026-07-12）。骨格レーンに子がある時だけ。
          // ON＝メロをミュートし骨格2声(Strings/Cello)を伴奏に重ねて対位法的に聴く（再生のみ・MIDI書き出しには入らない）。
          // ※♪仮歌トグルは撤去（入れ方はメロ側の楽器＝仮歌に集約・2026-07-15）。歌う子は▶で自動レンダ→同期再生。
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
