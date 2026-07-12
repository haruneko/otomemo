// 骨格の机（design #20 S6・スライス D1c＝器＋入口配線）。
// 骨格を **セクションの伴奏ベッドをループさせながら** 編集し、畳み/実音レンズを **止めずに** A/B する全画面。
// api は無改変（getComposition/updateNeta を消費するだけ）。SkeletonEditor（③前景）をそのまま子に吊るす。
// ①②④は後続スライス（D5/D3/D4）＝今回は③前景＋共有ループ＋レンズ2択のみ（handoff §3 D1）。
//
// 座標系（handoff §2.3・二重移調を避ける・deskContent.ts で固定）：
//   state は **セクション実調（配置移調 shift 済＝ビュー）**。読込＝+shift（deskLoadContent）／保存＝−shift（deskSaveContent）。
//   鳴らす（deskLensNotes）は state が既に実調なので skeletonEarNotes を shift:0 で呼ぶ。
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Neta } from "../api";
import { previewNote } from "../audio";
import { Icon } from "./Icon";
import { SkeletonEditor } from "./SkeletonEditor";
import { useTransport } from "../useTransport";
import { useEditHistory } from "../history";
import { useMelodyGen, voiceLeadingBadge, realizedMelodyCount, type Cand, type MelodyGenCtx } from "../useMelodyGen";
import * as sctx from "../sectionContext";
import { lanesForKind, MIN_BARS, maxBarsForKind, type Child, type Lane } from "./sectionLanes";
import { deskLoadContent, deskSaveContent, contactText, contactDyadNotes, staleContacts } from "../deskContent";
import { stageAllNotes, stageLabels, type StageFocus } from "../deskStages";
import { analyzeCounterpoint, effectiveBassAt, effectiveBassSegments, type MelCp } from "../skeletonEdit";
import { chordChips, applyChordTrial, adoptedChordContent, chordName, type ChordSub, type ChordTrial } from "../deskChords";
import { LENS_FOLD, LENS_REAL } from "../deskLens";
import {
  beatsPerBar,
  compositeNotes,
  melodyPlacementShift,
  isSkeleton,
  notesForContent,
  pitchName,
  type ChordEntry,
  type Note,
  type SkeletonBreakpoint,
  type SkeletonContent,
} from "../music";

// 入口（SectionEditor の骨格ブロックタップ）が組み立てて渡す机の焦点。
export interface SkeletonDeskTarget {
  sectionId: string;
  sectionKey: number;
  sectionMode: string | null;
  meter?: string;
  tempo: number;
  skelNetaId: string;
  skelPosition: number; // 骨格ブロックのセクション内位置（拍）
  skelOrd: number;
}

export type SkeletonDeskProps = SkeletonDeskTarget & { onClose: () => void };

const SAVE_DEBOUNCE_MS = 500; // NetaeEditor/SectionEditor 流儀（暫定既定）

// ルーラー/ブレースの座標定数。SkeletonEditor と同値（PPB=44・gutter=40）＝ロールと1px もずれないため。
// 将来は SkeletonEditor 側と共通化（handoff §1「ロール抽出」時に SSOT へ）。
const PPB = 44; // 1拍の px 幅
const GUTTER = 40; // 鍵盤/ラベル列の幅（ロールの beat 0 が始まる x）
// ブレースのつまみは pointer capture のドラッグ専用（SkeletonEditor の句境界ハンドルと同方式）＝
// setPointerCapture 中はスクローラへ流れず、地のゾーンは非インタラクティブ＝スクロール誤爆なし。

// pc（0–11）→ 音名（オクターブ無し）。ヘッダ表示用。
const keyLabel = (pc: number): string => pitchName(60 + ((pc % 12) + 12) % 12).replace(/-?\d+$/, "");

export function SkeletonDesk(p: SkeletonDeskProps) {
  const { sectionId, sectionKey, sectionMode, meter, tempo, skelNetaId, skelPosition, skelOrd } = p;
  const BPB = beatsPerBar(meter);
  const LANES = lanesForKind("section");

  // --- state（すべて実調ビュー） ---
  const [children, setChildren] = useState<Child[]>([]);
  const [sectionNeta, setSectionNeta] = useState<Neta | null>(null); // ④出口（D4）：MelodyGenCtx.neta＝section neta を保持
  const [sectionTitle, setSectionTitle] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [tones, setTones] = useState<SkeletonBreakpoint[]>([]);
  const [bass, setBass] = useState<SkeletonBreakpoint[]>([]);
  const [phrases, setPhrases] = useState<{ endBeat: number; cadence?: string }[]>([]);
  const [bars, setBars] = useState(4);
  const [rollMode, setRollMode] = useState<"draw" | "select" | "erase">("draw");
  const [counterpoint, setCounterpoint] = useState(true); // SkeletonEditor 内トグル（候補試聴/凡例用）
  const [activeLens, setActiveLens] = useState<string>(LENS_FOLD); // 既定＝A群（LENS_FOLD）。ステージで意味が読み替わる
  // D5: 聴きレンズの焦点ステージ（①ビート/②コード/③骨格/④表面）。既定＝skeleton＝起動時は現行③体験のまま。
  //   レンズ2択のラベルと reduce（鳴らす音符列）が focusStage で読み替わる（seams A）。切替＝reloop（内容が変わる）。
  const [focusStage, setFocusStage] = useState<StageFocus>("skeleton");

  // --- ②コード前景（D3）：試着はローカル state（在庫不変）。採用でのみ updateNeta が飛ぶ。 ---
  const [chordPop, setChordPop] = useState<{ chipIndex: number; x: number; y: number } | null>(null); // 開いているチップのポップ
  const [chordCands, setChordCands] = useState<ChordSub[] | null>(null); // substitute_chord 候補（巡回対象）
  const [chordTrial, setChordTrial] = useState<ChordTrial | null>(null); // 試着中の差替（earChords への override・在庫は不変）
  const [chordBusy, setChordBusy] = useState(false); // 候補取得中
  const [chordUndo, setChordUndo] = useState<{ netaId: string; prevContent: unknown } | null>(null); // 直前採用の1手戻し（skeleton の↶↷とは別ドメイン）

  // --- D6 B-lite「変化→耳」：②で採用されたコード区間（ブロックローカル）をセッション内で記録＝③接点の stale 判定源。
  //   非永続（updateNeta しない・DB に持たない・閉じたら消える＝React state のみ）。編集来歴の永続追跡/クロスセクション
  //   波及は backlog 送り（design S6 明記）。acknowledged＝試聴で確認した接点 start（stale から外す＝オオカミ少年化しない）。
  const [editedChordRanges, setEditedChordRanges] = useState<{ start: number; end: number }[]>([]);
  const [acknowledgedStale, setAcknowledgedStale] = useState<Set<number>>(new Set());

  // --- ④出口トレイ（D4）：吹く→試着→置く＋分岐スタック。 ---
  const [realizedRels, setRealizedRels] = useState<{ type: string; neta: Neta | null }[]>([]); // 焦点骨格の realized_from backlink（分岐スタック）
  const [candPreview, setCandPreview] = useState<Cand | null>(null); // ベッド上で試着中の候補（getNotes に差し込む・在庫は不変）
  const [stackOpen, setStackOpen] = useState(false); // 「→吹いたメロ N」一覧の開閉

  const shiftRef = useRef(0); // 配置移調（読込時に確定・保存で外す）
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef(false); // 未 flush の編集があるか（閉じる時に確定保存）
  const skipSaveRef = useRef(false); // 読込直後の state セットで保存を走らせない
  const didInitLoop = useRef(false);

  // --- 読み込み：自前 composition（handoff §2.2）＝机が開いている間の鮮度は自分で持つ ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tree = await api.getComposition(sectionId);
        if (!alive) return;
        setChildren(tree.children);
        setSectionNeta(tree.neta);
        setSectionTitle(tree.neta.title ?? "");
        // 焦点＝タップした骨格子（id＋position＋ord で一意・無ければ id 一致にフォールバック）。
        const child =
          tree.children.find((c) => c.node.neta.id === skelNetaId && Math.abs(c.position - skelPosition) < 1e-6 && c.ord === skelOrd) ??
          tree.children.find((c) => c.node.neta.id === skelNetaId);
        const content = child?.node.neta.content;
        if (child && isSkeleton(content)) {
          const shift = melodyPlacementShift(sectionKey, sectionMode, child.node.neta.mode, child.node.neta.key ?? 0);
          shiftRef.current = shift;
          const view = deskLoadContent(content, shift); // 実調へ +shift
          skipSaveRef.current = true; // この state セットは編集でない＝保存しない
          setTones(view.tones);
          setBass(view.bass ?? []);
          setPhrases(view.phrases ?? []);
          setBars(view.bars);
        }
        setLoaded(true);
      } catch {
        if (alive) setLoadErr(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [sectionId, skelNetaId, skelPosition, skelOrd, sectionKey, sectionMode]);

  // --- ④出口（D4）：置いた後の鮮度更新。children/sectionNeta だけ取り直し、**骨格編集 state(tones/bass/phrases)
  //   は触らない**（編集中を潰さない）。焦点骨格の content は children に居るが机は state から描く＝影響なし。 ---
  const reloadChildren = useCallback(async () => {
    try {
      const tree = await api.getComposition(sectionId);
      setChildren(tree.children);
      setSectionNeta(tree.neta);
      setSectionTitle(tree.neta.title ?? "");
    } catch {
      /* 取り直し失敗は黙って無視（次の操作で再取得） */
    }
  }, [sectionId]);

  // 分岐スタック「→吹いたメロ N」＝焦点骨格の realized_from backlink（getRelations）。吹いて置くたびに増える。
  const refreshRelations = useCallback(async () => {
    try {
      setRealizedRels(await api.getRelations(skelNetaId));
    } catch {
      /* 取得失敗は空のまま（バッジは 0 = 非表示） */
    }
  }, [skelNetaId]);
  useEffect(() => {
    void refreshRelations();
  }, [refreshRelations]);

  // --- 保存：実調 state → −shift → 素材調 content を updateNeta（debounce flush） ---
  const stateRef = useRef<SkeletonContent | null>(null);
  stateRef.current = { bars, tones, ...(bass.length ? { bass } : {}), ...(phrases.length ? { phrases } : {}) };
  const doSave = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const content = deskSaveContent(st, shiftRef.current); // 素材調へ戻す（配置移調を外す）
    void api.updateNeta(skelNetaId, { content }).catch(() => {});
    pendingRef.current = false;
  }, [skelNetaId]);

  useEffect(() => {
    if (!loaded) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    pendingRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [tones, bass, phrases, bars, loaded, doSave]);

  // アンマウント（閉じる/戻る）で未 flush を確定保存＝取りこぼしゼロ。
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingRef.current) doSave();
    },
    [doSave],
  );

  // --- Undo（content snapshot 流儀）。読込完了で baseline を張り直す（空→読込を undo 対象にしない）。 ---
  const snap = { tones, bass, phrases, bars };
  const applySnap = useCallback((s: typeof snap) => {
    setTones(s.tones);
    setBass(s.bass);
    setPhrases(s.phrases);
    setBars(s.bars);
  }, []);
  const hist = useEditHistory(snap, applySnap, { resetKey: loaded ? skelNetaId : `${skelNetaId}:loading` });

  // --- ②コード前景の土台（D3）。chordChips＝earChords（実調・骨格ブロック相対）＋出所（netaId/chord index/shift）。
  //   entry は sctx.earChords→(start−skelPosition) と deepEqual・同順（deskChords.test で固定）＝earChordsRel の SSOT。
  const chips = chordChips(children, LANES, sectionKey, sectionMode, skelPosition);
  const earChordsRel: ChordEntry[] = chips.map((c) => c.entry);
  // 試着 override を当てた実効コード列。cp・導出ベース・③（getNotes/SkeletonEditor）はこれを見る＝③が試着に追従。
  //   採用まで earChordsRel（在庫由来）は不変・override はローカル state のみ（updateNeta は飛ばさない）。
  const effChords: ChordEntry[] = applyChordTrial(earChordsRel, chordTrial);

  // --- ④出口（D4）：机で MelodyGenCtx を組み useMelodyGen を1つ起動。SectionEditor と同じ文脈計算(sctx)で
  //   ベッド/コード/ベース/ドラムを渡す＝「吹く」が SectionEditor の骨格ブロック[吹く▶]と bit 一致で動く。 ---
  const secCtx: sctx.SectionCtx = { children, LANES, keyPc: sectionKey, mode: sectionMode, BPB };
  // セクション尺（小節数）＝SectionEditor と同式（neta.bars と配置済み content の長い方、上限 MAX）。
  const contentEnd = children.reduce((m, c) => Math.max(m, c.position + sctx.childDur(secCtx, c)), 0);
  const sectionBars = Math.min(maxBarsForKind("section"), Math.max(MIN_BARS, sectionNeta?.bars ?? MIN_BARS, Math.ceil(contentEnd / BPB - 1e-6)));
  // 焦点＝タップした骨格子（id＋position＋ord で一意・無ければ id 一致にフォールバック＝D1c と同じ探し方）。
  const focusChild =
    children.find((c) => c.node.neta.id === skelNetaId && Math.abs(c.position - skelPosition) < 1e-6 && c.ord === skelOrd) ??
    children.find((c) => c.node.neta.id === skelNetaId);
  // MelodyGenCtx.neta＝section neta（読込前は最小 neta でフォールバック＝吹くは loaded ゲート後なので実害なし）。
  const genNeta: Neta =
    sectionNeta ?? { id: sectionId, kind: "section", title: sectionTitle || null, text: null, content: null, key: sectionKey, mode: sectionMode, tempo, meter: meter ?? null, bars: null, mood: null, tags: [], created: "", updated: "" };
  const laneChildren = (l: Lane): Child[] => sctx.laneChildren(secCtx, l);
  const laneOf = (kind: string): Lane | undefined => LANES.find((l) => sctx.inLane(l, kind));
  const genCtx: MelodyGenCtx = {
    neta: genNeta,
    keyPc: sectionKey,
    tempo,
    liveMeter: meter,
    liveTitle: sectionTitle,
    BARS: sectionBars,
    BPB,
    lanes: LANES,
    laneChildren,
    laneOf,
    sectionChords: () => sctx.sectionChords(secCtx),
    sectionBass: () => sctx.sectionBass(secCtx),
    sectionDrums: () => sctx.sectionDrums(secCtx),
    contentDur: (kind, content) => sctx.contentDur(secCtx, kind, content),
    childDur: (c) => sctx.childDur(secCtx, c),
    progForKind: (k) => (k === "bass" ? 33 : k === "rhythm" ? undefined : 0),
    reload: reloadChildren,
    onChanged: () => void refreshRelations(),
  };
  const gen = useMelodyGen(genCtx);
  const realizedN = realizedMelodyCount(realizedRels);

  // D1.5: 再生座標は **骨格ブロックローカル**。scaleBeats＝blockSpan＝ロール幅（=bars*BPB）＝ SkeletonEditor が
  // 骨格を beat 0 起点で描く幅と一致＝プレイヘッド（--phb）がロールと揃う。ベッドは deskLensNotes 内で窓切り出し。
  const blockSpan = bars * BPB;

  // --- 接点ストリップ（D2）：各メロ点の対位法要約。SkeletonEditor のロール（cp バッジ）と同じ計算＝
  //   analyzeCounterpoint(tones, 実効ベース)。ブロックローカル座標（earChordsRel も相対）＝ロールと一致。
  //   ※ intervalBadge のテーブルを崇拝＝バッジ label は m.interval.label をそのまま出す（再実装しない）。
  const cp: MelCp[] = analyzeCounterpoint(tones, (b) => effectiveBassAt(b, bass, effChords, phrases, blockSpan));

  // D6：接点ごとの stale フラグ。純関数（editedChordRanges 由来）から、試聴で確認済み（acknowledged）を差し引く＝
  //   一度耳で確かめた接点は騒がない。骨格編集では editedChordRanges が増えない＝stale は立たない（②採用でのみ立つ）。
  const staleFlags = staleContacts(editedChordRanges, cp).map((s, i) => s && !acknowledgedStale.has(cp[i]!.start));
  const staleCount = staleFlags.reduce((n, s) => n + (s ? 1 : 0), 0);
  // 試聴で確認＝その接点 start を acknowledged に入れ、以後 stale から外す（次に②で同区間を再採用すると再び立つ＝adopt で解除）。
  const acknowledgeStale = (start: number) => setAcknowledgedStale((prev) => new Set(prev).add(start));

  // 範囲ブレース（D1.5）。既定＝ブロック全体 [0, blockSpan]。bars 伸縮でクランプ（窓が blockSpan を超えない）。
  const [range, setRange] = useState<{ startBeat: number; endBeat: number } | null>(null);
  const clampStart = Math.max(0, Math.min(range?.startBeat ?? 0, blockSpan - BPB));
  const clampEnd = Math.max(clampStart + BPB, Math.min(range?.endBeat ?? blockSpan, blockSpan));
  const effRange = { startBeat: clampStart, endBeat: clampEnd };

  // --- ベッド＋レンズの再生 Note 列（純合成は deskStages へ委譲＝ステージ相対の a/b を両方渡す）。 ---
  //   focusStage で reduce（鳴らす音符列）が読み替わる：③④＝deskLensNotes と bit一致・①ドラムのみ・②素の三和音。
  //   両群を最初から返し activeLens（A=LENS_FOLD/B=LENS_REAL）でゲート＝無停止 A/B（audio.ts 2グループゲート据え置き）。
  const getNotes = useCallback((): Note[] => {
    if (!loaded) return [];
    const stateReal: SkeletonContent = { bars, tones, ...(bass.length ? { bass } : {}), ...(phrases.length ? { phrases } : {}) };
    // ④試着（D4）：候補メロが選ばれていれば実音レンズのメロ枠へ差し込む（ブロックローカル＝gen_melody(skeletonNetaId) 由来）。
    const previewMelody = candPreview ? notesForContent(candPreview.kind, candPreview.content) : null;
    return stageAllNotes(focusStage, {
      stateReal,
      earChordsRel: effChords, // 試着中は override 済＝reloop（採用時）で次ループから音も追従。停止中に再生すれば即最新。
      effChords, // ②「和声だけ」の簡易三和音の入力（試着 override 込の実効コード）
      composite: compositeNotes(children, sectionKey, sectionMode), // 骨格は無音（従来どおり）
      skelPosition, // ベッド窓の起点（skelEar 自体は beat 0 起点のまま＝ロール一致）
      bars, // 骨格ブロックの小節数（クリック尺／ベッド窓幅）
      bpb: BPB,
      previewMelody, // null＝従来（bit一致）。候補ありは現骨格線/現メロをゴーストして候補を鳴らす。
    });
    // earChordsRel/children 等は毎レンダ再計算＝useTransport が cfg ref で最新を読む（stale なし）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, bars, tones, bass, phrases, children, BPB, sectionKey, sectionMode, skelPosition, candPreview, focusStage]);

  const tp = useTransport(getNotes, tempo, { scaleBeats: blockSpan, bpb: BPB, activeLens, range: effRange });

  // --- 範囲ブレースのルーラー：ロール（tp.scrollerRef）と横スクロールを同期＝ずれない。 ---
  // 骨格ゾーン（ticks/braces）だけを translate＝ロール content と同じ量だけ左へ流れる（beat 位置が一致）。
  // 「窓」ラベルの gutter は translate 外＝ロールの sticky keycol と同じく左端に据え置き。
  const rulerZoneRef = useRef<HTMLDivElement>(null); // transform も beatFromClientX も同一要素（beat0=rect.left）
  const contactZoneRef = useRef<HTMLDivElement>(null); // 接点ストリップ（ルーラーと同じ scroll 同期＝ロール一致）
  const chordZoneRef = useRef<HTMLDivElement>(null); // ②コード前景（D3）＝ルーラー/接点と同じ scroll 同期＝ロール一致
  const beatZoneRef = useRef<HTMLDivElement>(null); // ①ビート前景（D5）＝ルーラー/接点/②と同じ scroll 同期＝ロール一致
  useEffect(() => {
    const sc = (tp.scrollerRef as React.RefObject<HTMLDivElement>).current;
    const zone = rulerZoneRef.current;
    if (!sc || !zone) return;
    const sync = () => {
      const tx = `translateX(${-sc.scrollLeft}px)`;
      zone.style.transform = tx;
      if (contactZoneRef.current) contactZoneRef.current.style.transform = tx; // 接点行もロールと同じだけ流す
      if (chordZoneRef.current) chordZoneRef.current.style.transform = tx; // ②コード行もロールと同じだけ流す
      if (beatZoneRef.current) beatZoneRef.current.style.transform = tx; // ①ビート行もロールと同じだけ流す
    };
    sync();
    sc.addEventListener("scroll", sync, { passive: true });
    return () => sc.removeEventListener("scroll", sync);
    // loaded で SkeletonEditor がマウントされ scrollerRef が付く。blockSpan 変化で幅が変わっても再同期。
  }, [loaded, blockSpan, tp.scrollerRef]);

  // ブレース掴み＝pointer capture＋小節境界スナップ。setPointerCapture 中はスクローラへイベントが流れない
  // ＝スクロール誤爆なし（つまみは小さく、ゾーン地は非インタラクティブ）。確定（up）で tp.reloop＝新窓を反映。
  const beatFromClientX = (clientX: number): number => {
    const r = rulerZoneRef.current?.getBoundingClientRect();
    return r ? (clientX - r.left) / PPB : 0;
  };
  const snapBar = (beat: number): number => Math.round(beat / BPB) * BPB;
  const onBraceDown = (e: React.PointerEvent, edge: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    const h = e.currentTarget as HTMLElement;
    h.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const snapped = snapBar(beatFromClientX(ev.clientX));
      setRange((prev) => {
        const cur = prev ?? { startBeat: 0, endBeat: blockSpan };
        if (edge === "start") return { startBeat: Math.max(0, Math.min(snapped, cur.endBeat - BPB)), endBeat: cur.endBeat };
        return { startBeat: cur.startBeat, endBeat: Math.min(blockSpan, Math.max(snapped, cur.startBeat + BPB)) };
      });
    };
    const up = () => {
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", up);
      tp.reloop(); // 再生中なら新窓でループし直す（無停止でない＝D1.5 スコープ内）
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up);
  };

  // 机は常にループ再生（トップライン書き）。初回マウントで loopOn を立てる（stopped＝再生し直さない）。
  useEffect(() => {
    if (didInitLoop.current) return;
    didInitLoop.current = true;
    tp.toggleLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // レンズ無停止切替：begin（再スケジュール）を回さず、ゲートだけ開閉＝再生位置が飛ばない（この器の核）。
  // activeLens state も更新＝再ループ時の初期ゲート（initLensGates）が正しいレンズを開く。
  const toggleLens = (next: string) => {
    if (next === activeLens) return;
    tp.setLensGain(activeLens, false);
    tp.setLensGain(next, true);
    setActiveLens(next);
  };

  // D5: ステージ切替（焦点①→②等）＝reduce（鳴らす音符列）が変わる＝tp.reloop（再生継続・loop維持・位置はループ頭へ）。
  //   レンズ内の A⇄B（toggleLens）とは別＝そちらは無停止ゲート。activeLens は据え置き（A/B の選択はステージ跨ぎで保つ）。
  const changeStage = (next: StageFocus) => {
    if (next === focusStage) return;
    setFocusStage(next);
    tp.reloop(); // 停止中は no-op・再生中は新ステージの reduce でループし直す
  };
  // 焦点ステージのレンズ2択ラベル（トランスポートのボタン表示が focusStage で読み替わる＝seams A の配線）。
  const lensLabels = stageLabels(focusStage);

  // D5: ①ビート前景（薄）＝リズムレーン子（ドラムブロック）の表示のみ。内部再設計しない・タップで潜る導線は
  //   机に onOpenNeta が無い（D4 と同じ制約）＝今回は表示のみ（潜りは出さない）。①レンズ（パターン単体）は
  //   下のステージレールで効く。座標＝ロールと同 PPB・同 scroll 同期（ブロック相対 position−skelPosition）。
  const rhythmLane = LANES.find((l) => l.key === "rhythm");
  const beatChildren = rhythmLane ? sctx.laneChildren(secCtx, rhythmLane) : [];

  // --- ④出口（D4）の操作：吹く→試着（ベッド上・無停止）→置く（skelPosition）。 ---
  // 吹く▶＝焦点骨格から表面メロを吹く（gen_melody(skeletonNetaId)→候補トレイ）。焦点が無ければ何もしない。
  const blowFocus = () => { if (focusChild) gen.blowSkeleton(focusChild); };
  // 試着▶＝候補をベッドの上で鳴らす。auditionCandidate（候補ソロ）とは別＝現メロと一緒に比較するため。
  //   実音レンズへ寄せ candPreview を立て、この瞬間だけ tp.reloop＝**次ループから**反映（無停止＝D1.5 流儀・素直）。
  //   巡回のたびは reloop しない（ループ頭に飛ぶ煩さを避ける＝コード採用と同じ設計判断）。同候補の再タップで解除。
  const auditionOnBed = (c: Cand) => {
    const next = candPreview?.cid === c.cid ? null : c;
    setCandPreview(next);
    if (next && activeLens !== LENS_REAL) toggleLens(LENS_REAL);
    tp.reloop();
  };
  // 置く＝焦点骨格の位置(skelPosition)へ。gen.placeCandidate が新メロ neta＋realized_from を張り骨格 content 不変。
  //   内部で ctx.reload(=children 取り直し)＋onChanged(=分岐スタック再取得)＝置いた直後に N が増える。
  const placeAtSkeleton = async (c: Cand) => {
    await gen.placeCandidate(c, skelPosition);
    if (candPreview?.cid === c.cid) setCandPreview(null); // 置いた候補の試着を解除
    tp.reloop(); // ベッドに新メロが載る＝次ループから反映
  };
  // 試着解除（捨てる/閉じる時）＝candPreview を落とし次ループでベッドを元へ。
  const stopAudition = () => { if (candPreview) { setCandPreview(null); tp.reloop(); } };

  // --- 接点タップ→説明ポップ（指摘のみ）＋「この瞬間だけ聴く」ダイアッド。 ---
  // ポップは fixed 配置＝タップした badge の画面座標を起点に、モバイル幅で画面外に出ないよう clamp。
  const [contactPop, setContactPop] = useState<{ cp: MelCp; x: number; y: number; stale: boolean } | null>(null);
  const POP_W = 232; // ポップ幅（clamp 用・CSS と同値）
  const onContactTap = (e: React.MouseEvent, m: MelCp, stale: boolean) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8)); // 画面外clamp（右端はみ出し防止）
    const y = Math.min(r.bottom + 4, window.innerHeight - 110); // 下端はみ出し防止
    setContactPop({ cp: m, x, y, stale });
  };
  // バッジ/ポップの属性色クラス（parallel/cross/rest/diss を dissonant より前＝説明文と同じ優先順位）。
  const contactClass = (m: MelCp): string =>
    m.parallel ? "parallel" : m.cross ? "cross" : m.interval === null ? "rest" : m.dissonant ? "diss" : "";
  // 「この瞬間だけ聴く」＝当該接点の2音だけを 0.8拍相当で鳴らす（暫定既定・耳較正で見直し可＝handoff §5）。
  // 短すぎると不協和が聴き取れない（handoff の典型失敗）ので previewNote の holdSec で持続を伸ばす。
  const playContactDyad = (m: MelCp) => {
    const holdSec = 0.8 * (60 / tempo); // 拍→秒（tempo=♩/分）
    for (const n of contactDyadNotes(m)) void previewNote(n, { holdSec });
  };

  // --- ②コードチップ：タップ→substitute_chord 候補取得→試着（ローカル）→採用（updateNeta）。api 無改変で消費。 ---
  const CHORD_POP_W = 244; // ポップ幅（clamp 用・CSS と同値）
  const onChordTap = async (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - CHORD_POP_W - 8)); // 右端はみ出し防止
    const y = Math.min(r.bottom + 4, window.innerHeight - 200);
    const cur = earChordsRel[i]; // 在庫の当該コード（試着 override でなく素の相手）を代替する
    if (!cur) return;
    setChordPop({ chipIndex: i, x, y });
    setChordCands(null);
    setChordBusy(true);
    const next = earChordsRel[i + 1]; // セカンダリードミナント用（次コード）
    try {
      const subs = await api.music<{ root: number; quality: string; degree: number; kind: string; why: string }[]>("substitute_chord", {
        chord: { root: cur.root, quality: cur.quality },
        key: sectionKey,
        mode: sectionMode === "minor" ? "minor" : "major",
        ...(next ? { next: { root: next.root, quality: next.quality } } : {}),
      });
      setChordCands((subs ?? []).map((s) => ({ root: s.root, quality: s.quality })));
    } catch {
      setChordCands([]); // 取得失敗＝空（黙って消えない＝ポップに「候補なし」を出す）
    } finally {
      setChordBusy(false);
    }
  };
  // 試着＝ローカル state のみ（在庫不変・updateNeta は飛ばさない）。③（導出ベース・接点バッジ・ベッド）が即追従。
  const tryChord = (sub: ChordSub) => {
    if (!chordPop) return;
    setChordTrial({ chordIndex: chordPop.chipIndex, sub });
  };
  const revertTrial = () => setChordTrial(null); // 「元のコードに戻す」＝試着を外す（在庫は元々不変）
  const closeChordPop = () => { setChordPop(null); setChordCands(null); setChordTrial(null); }; // 外タップ＝試着破棄で閉じる
  // 採用＝出所コードネタへ書込（破壊上書きしない＝試着では書かず採用でのみ）。直前 content を undo 用に保持。
  const adoptChord = () => {
    if (!chordTrial) return;
    const chip = chips[chordTrial.chordIndex];
    if (!chip) return;
    const target = children.find((c) => c.node.neta.id === chip.netaId);
    const prevContent = target?.node.neta.content ?? null;
    const content = adoptedChordContent(prevContent, chip.netaChordIndex, chordTrial.sub, chip.shift);
    setChordUndo({ netaId: chip.netaId, prevContent });
    // D6：採用（＝在庫を書き換えた瞬間）にだけ、差し替えたコードのブロックローカル区間を記録＝接点 cp の start と
    //   同座標系（chip.entry.start は earChordsRel と同じブロック相対）。試着では記録しない（在庫不変の間は腐らない）。
    const range = { start: chip.entry.start, end: chip.entry.start + chip.entry.dur };
    setEditedChordRanges((prev) => [...prev, range]); // 重複は素直に許容（staleContacts は membership＝or で無害）
    // 同区間に載る acknowledged は解除＝再採用でその接点が再び変わった＝もう一度「要確認」に戻す（見落とし防止）。
    setAcknowledgedStale((prev) => new Set([...prev].filter((s) => !(s >= range.start - 1e-6 && s < range.end - 1e-6))));
    void api.updateNeta(chip.netaId, { content }).catch(() => {});
    // children を更新＝earChordsRel が採用後に。同 neta を複数配置していれば全箇所へ反映（共有ネタの正しい挙動）。
    setChildren((prev) => prev.map((c) => (c.node.neta.id === chip.netaId ? { ...c, node: { ...c.node, neta: { ...c.node.neta, content } } } : c)));
    setChordTrial(null);
    setChordPop(null);
    setChordCands(null);
    tp.reloop(); // 再生中なら次ループから音も追従（巡回では飛ばさず採用時のみ＝ループ頭に飛ぶ煩さを避ける）
  };
  // コード編集専用の1手戻し（skeleton の↶↷とは別ドメイン＝混乱を避ける）。直前採用を updateNeta で復元。
  const undoChord = () => {
    if (!chordUndo) return;
    const { netaId, prevContent } = chordUndo;
    void api.updateNeta(netaId, { content: prevContent }).catch(() => {});
    setChildren((prev) => prev.map((c) => (c.node.neta.id === netaId ? { ...c, node: { ...c.node, neta: { ...c.node.neta, content: prevContent } } } : c)));
    setChordUndo(null);
    tp.reloop();
  };

  const modeBtn = (m: "draw" | "select" | "erase", label: string, icon: "edit" | "eraser", svg?: React.ReactNode) => (
    <button type="button" aria-label={`mode-${m}`} title={label} className={rollMode === m ? "on" : ""} onClick={() => setRollMode(m)}>
      {svg ?? <Icon name={icon} size={18} />}
    </button>
  );

  return (
    <div className="skeleton-desk mainpane-editor" role="dialog" aria-label="skeleton-desk" data-kind="skeleton" style={{ ["--k" as string]: "var(--k-skeleton)" }}>
      {/* ヘッダ：セクション名/key/meter/tempo（表示のみ）＋閉じる。 */}
      <div className="desk-header editor-header" aria-label="desk-header">
        <button type="button" className="hd-back" aria-label="close-desk" title="閉じる（セクションへ戻る）" onClick={p.onClose}>
          ‹ 戻る
        </button>
        <span className="desk-title">骨格の机{sectionTitle ? `：${sectionTitle}` : ""}</span>
        <span className="desk-meta muted" aria-label="desk-meta">
          {keyLabel(sectionKey)} {sectionMode === "minor" ? "minor" : "major"} · {meter ?? "4/4"} · ♩{tempo}
        </span>
      </div>

      {loadErr && (
        <p className="fit-report" aria-label="desk-load-error">
          読み込みに失敗しました
        </p>
      )}

      {/* rollMode（描く/選ぶ/消す）＝KindEditorBody の骨格結線と同じ3ボタン。 */}
      <div className="roll-toolbar">
        <div className="proll-modes">
          {modeBtn(
            "draw",
            "描く（打点/移動）",
            "edit",
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
            </svg>,
          )}
          {modeBtn(
            "select",
            "選ぶ（選択して編集）",
            "edit",
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.5 3" />
            </svg>,
          )}
          {modeBtn("erase", "消す（点タップで削除）", "eraser")}
        </div>
      </div>

      {/* D5 ステージレール：聴きレンズの焦点（①ビート/②コード/③骨格/④表面）。選択でトランスポートのレンズ2択の
          ラベルと reduce が読み替わる（seams A）。切替＝reloop（再生継続・loop維持・位置はループ頭へ）。②③④の
          既存行（コードチップ/ロール/接点/出口）は隠さない＝レールは「レンズの意味を決める焦点」の薄い追加。 */}
      <div className="desk-stages" role="group" aria-label="desk-stages">
        {([
          ["beat", "①ビート"],
          ["chord", "②コード"],
          ["skeleton", "③骨格"],
          ["surface", "④表面"],
        ] as [StageFocus, string][]).map(([f, label]) => (
          <button
            key={f}
            type="button"
            className={"desk-stage" + (focusStage === f ? " on" : "")}
            aria-label={`stage-${f}`}
            aria-pressed={focusStage === f}
            title={`聴きレンズの焦点＝${label}`}
            onClick={() => changeStage(f)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 範囲ブレースのルーラー（D1.5）：ロールと同 PPB・同スクロール。両端つまみで再生ループ窓を絞る。 */}
      <div className="desk-ruler" aria-label="desk-ruler">
        <div className="desk-ruler-gutter" style={{ width: GUTTER }}>窓</div>
        <div className="desk-ruler-viewport">
          <div className="desk-ruler-zone" ref={rulerZoneRef} style={{ width: blockSpan * PPB }}>
            {/* 小節目盛り（0..bars）。 */}
            {Array.from({ length: bars + 1 }, (_, i) => (
              <span key={i} className="desk-ruler-tick" style={{ left: i * BPB * PPB }}>
                {i + 1}
              </span>
            ))}
            {/* ループ窓ハイライト＋両端ブレース。 */}
            <div className="desk-brace-region" aria-label="desk-brace-region" style={{ left: effRange.startBeat * PPB, width: (effRange.endBeat - effRange.startBeat) * PPB }} />
            <span className="desk-brace start" role="slider" aria-label="desk-brace-start" aria-valuenow={effRange.startBeat} title="ループ開始（小節境界スナップ）" style={{ left: effRange.startBeat * PPB }} onPointerDown={(e) => onBraceDown(e, "start")} />
            <span className="desk-brace end" role="slider" aria-label="desk-brace-end" aria-valuenow={effRange.endBeat} title="ループ終了（小節境界スナップ）" style={{ left: effRange.endBeat * PPB }} onPointerDown={(e) => onBraceDown(e, "end")} />
          </div>
        </div>
      </div>

      {/* ①ビート前景（D5・薄）：リズムレーン子（ドラムブロック）の表示のみ。座標＝ロールと同 PPB・同スクロール
          （ブロック相対 position−skelPosition）。※タップで既存ドラムエディタへ潜る導線は机に onOpenNeta が無い
          （D4 と同じ制約）＝今回は表示のみ。①レンズ「パターン単体」はステージレールで効く。 */}
      <div className="desk-beat" aria-label="desk-beat">
        <div className="desk-beat-gutter" style={{ width: GUTTER }}>ビート</div>
        <div className="desk-beat-viewport">
          <div className="desk-beat-zone" ref={beatZoneRef} style={{ width: blockSpan * PPB }}>
            {beatChildren.length === 0 && <span className="desk-beat-empty muted">（リズム未配置）</span>}
            {beatChildren.map((c, i) => {
              const left = (c.position - skelPosition) * PPB;
              const w = Math.max(8, sctx.childDur(secCtx, c) * PPB - 2);
              return (
                <span
                  key={i}
                  className="desk-beat-block"
                  aria-label={`beat-block-${i}`}
                  style={{ left, width: w }}
                  title={c.node.neta.title ?? c.node.neta.text ?? "ドラム"}
                >
                  {(c.node.neta.title ?? c.node.neta.text ?? "ドラム").slice(0, 10)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* ②コード前景（D3）：進行チップ列＋導出ベース線の常時表示。チップタップ→substitute_chord の試着→採用。
          座標＝ロールと同 PPB・同スクロール（effChords[i].start*PPB）。試着中はチップ名/導出ベースが差替後に追従＝
          「②はコードで対位の相手を書く段」を体感。※「他N箇所で使用」バッジ＋「複製して切り離す（copy_neta）」は
          配置(compose_edge)の他セクション使用数を返す read api が無く S6 の api 無改変鉄則に触れるため D3b（配置カウント
          api 検討後）へ後回し＝今回は出さない。 */}
      <div className="desk-chords" aria-label="desk-chords">
        <div className="desk-chords-gutter" style={{ width: GUTTER }}>
          <span>コード</span>
          {chordUndo && (
            <button type="button" className="desk-chord-undo" aria-label="chord-undo" title="直前のコード採用を元に戻す" onClick={undoChord}>
              ↩︎
            </button>
          )}
        </div>
        <div className="desk-chords-viewport">
          <div className="desk-chords-zone" ref={chordZoneRef} style={{ width: blockSpan * PPB }}>
            {/* 導出ベース線（常時表示・effChords＝試着に追従）。source で実線/点線。分数コード＝下声が即動く。 */}
            {effectiveBassSegments(bass, effChords, phrases, blockSpan).map((s, i) => (
              <span
                key={"eb" + i}
                className={"desk-bassline " + s.source}
                aria-label={`chord-bassline-${i}`}
                data-pitch={s.pitch}
                style={{ left: s.start * PPB, width: Math.max(6, (s.end - s.start) * PPB - 2) }}
                title={`導出ベース ${keyLabel(((s.pitch % 12) + 12) % 12)}`}
              >
                {keyLabel(((s.pitch % 12) + 12) % 12)}
              </span>
            ))}
            {/* コードチップ（試着中は差替後を表示）。 */}
            {chips.map((chip, i) => (
              <button
                key={i}
                type="button"
                className={"desk-chord-chip" + (chordTrial?.chordIndex === i ? " trial" : "") + (chordPop?.chipIndex === i ? " open" : "")}
                aria-label={`chord-chip-${i}`}
                title="タップ＝代替候補（試着→採用）"
                style={{ left: effChords[i]!.start * PPB }}
                onClick={(e) => void onChordTap(e, i)}
              >
                {chordName(effChords[i]!)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ②コードの代替候補ポップ（試着→採用）。外タップで試着破棄して閉じる。 */}
      {chordPop && (
        <>
          <div className="desk-contact-backdrop" aria-hidden="true" onClick={closeChordPop} />
          <div className="desk-chord-pop" role="dialog" aria-label="chord-pop" style={{ left: chordPop.x, top: chordPop.y, width: CHORD_POP_W }}>
            <div className="dcp-head">
              <span className="dcp-cur">{chordName(effChords[chordPop.chipIndex]!)}</span>
              <span className="muted">代替候補（試着→採用）</span>
            </div>
            {chordBusy && (
              <p className="dcp-msg muted" aria-label="chord-loading">
                候補を探しています…
              </p>
            )}
            {!chordBusy && chordCands && chordCands.length === 0 && (
              <p className="dcp-msg muted" aria-label="chord-none">
                代替候補なし
              </p>
            )}
            {!chordBusy && chordCands && chordCands.length > 0 && (
              <div className="dcp-cands" aria-label="chord-cands">
                {chordCands.map((sub, k) => {
                  const active = chordTrial?.chordIndex === chordPop.chipIndex && chordTrial.sub.root === sub.root && chordTrial.sub.quality === sub.quality;
                  return (
                    <button key={k} type="button" className={"dcp-cand" + (active ? " on" : "")} aria-label={`chord-cand-${k}`} onClick={() => tryChord(sub)}>
                      {chordName(sub)}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="dcp-actions">
              <button type="button" className="dcp-revert" aria-label="chord-revert" disabled={chordTrial?.chordIndex !== chordPop.chipIndex} onClick={revertTrial}>
                元のコード
              </button>
              <button type="button" className="dcp-adopt primary" aria-label="chord-adopt" disabled={chordTrial?.chordIndex !== chordPop.chipIndex} onClick={adoptChord}>
                この代替で書く
              </button>
            </div>
            <p className="dcp-hint muted">試着中は在庫を書き換えません。採用で初めてコードネタに反映（元に戻せます）。</p>
          </div>
        </>
      )}

      {/* ③前景：骨格ロール＋ツールバー＋叩き台トレイ（既存 SkeletonEditor をそのまま）。 */}
      <SkeletonEditor
        tones={tones}
        setTones={setTones}
        bass={bass}
        setBass={setBass}
        phrases={phrases}
        setPhrases={setPhrases}
        bars={bars}
        setBars={setBars}
        meter={meter}
        keyPc={sectionKey}
        keyMode={sectionMode === "minor" ? "minor" : "major"}
        chords={effChords}
        rollMode={rollMode}
        counterpoint={counterpoint}
        setCounterpoint={setCounterpoint}
        tempo={tempo}
        playheadRef={tp.lineRef}
        scrollerRef={tp.scrollerRef}
      />

      {/* 接点ストリップ（D2）：ロール直下・タップできる対位法要約行。バッジ label＝intervalBadge の label
          （m.interval.label＝再実装しない）。色＝属性（並行/交差/休符/不協和/協和）。scroll はロールと同期。 */}
      <div className="desk-contact" aria-label="desk-contact">
        <div className="desk-contact-gutter" style={{ width: GUTTER }}>
          <span>接点</span>
          {/* D6：②のコード差替で対位が変わった（＝腐りうる）接点数。0 なら出さない。試聴で確認すると減る（騒がない）。 */}
          {staleCount > 0 && (
            <span className="desk-stale-mark" aria-label="stale-count" title="②のコード変更で対位が変わった接点。タップして確認できます。">
              要確認×{staleCount}
            </span>
          )}
        </div>
        <div className="desk-contact-viewport">
          <div className="desk-contact-zone" ref={contactZoneRef} style={{ width: blockSpan * PPB }}>
            {cp.map((m, i) => (
              <button
                key={i}
                type="button"
                className={"desk-contact-badge " + contactClass(m) + (staleFlags[i] ? " stale" : "")}
                aria-label={`contact-${i}`}
                title={staleFlags[i] ? "②のコード変更で対位が変わった箇所＝タップして確認" : "タップ＝説明＋この瞬間だけ聴く"}
                style={{ left: m.start * PPB }}
                onClick={(e) => onContactTap(e, m, staleFlags[i] ?? false)}
              >
                {m.interval ? m.interval.label : "—"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 説明ポップ（指摘のみ・禁止しない）＋「この瞬間だけ聴く」＝当該接点の2音だけダイアッド。外タップで閉じる。 */}
      {contactPop && (
        <>
          <div className="desk-contact-backdrop" aria-hidden="true" onClick={() => setContactPop(null)} />
          <div className="desk-contact-pop" role="dialog" aria-label="contact-pop" style={{ left: contactPop.x, top: contactPop.y, width: POP_W }}>
            {/* D6：stale＝②のコード変更で対位が変わった箇所の一言を前置き（指摘のみ・自動修正しない）。 */}
            {contactPop.stale && <p className="dc-stale-note" aria-label="contact-stale-note">②のコード変更で対位が変わった箇所</p>}
            <p className="dc-text">{contactText(contactPop.cp)}</p>
            {/* 試聴＝D2 の playContactDyad をそのまま流用（差替後の現接点の2声）。stale はここで確認済み扱い＝以後騒がない。 */}
            <button
              type="button"
              className="dc-listen"
              aria-label="contact-listen"
              onClick={() => {
                playContactDyad(contactPop.cp);
                if (contactPop.stale) {
                  acknowledgeStale(contactPop.cp.start);
                  setContactPop((p) => (p ? { ...p, stale: false } : p)); // このポップ表示も即「確認済み」へ
                }
              }}
            >
              {contactPop.stale ? "♪ 変化した瞬間を聴く" : "♪ この瞬間だけ聴く"}
            </button>
          </div>
        </>
      )}

      {/* ④出口トレイ（D4）：レール＝書く[①②③] ＋ 出口[④]。焦点骨格を吹く→ベッド上で試着→骨格位置へ置く。
          吹くたび新メロ neta＋realized_from＝在庫は分岐（骨格 content 不変・旧メロ不滅）＝「→吹いたメロ N」。 */}
      <div className="desk-outlet" aria-label="desk-outlet">
        <div className="desk-outlet-head">
          <span className="desk-rail" aria-hidden="true">書く<b>①②③</b>＋出口<b>④</b></span>
          <button type="button" className="desk-blow primary" aria-label="desk-blow" title="この骨格からメロを吹く" disabled={gen.genBusy || !focusChild} onClick={blowFocus}>
            {gen.genBusy ? "吹いています…" : "吹く▶"}
          </button>
          {realizedN > 0 && (
            <button type="button" className="desk-stack-badge" aria-label="realized-stack" aria-expanded={stackOpen} title="この骨格から吹いたメロ（戻って吹き直しても消えない）" onClick={() => setStackOpen((v) => !v)}>
              →吹いたメロ {realizedN}
            </button>
          )}
        </div>
        {/* 分岐スタック一覧（開閉）。机には他ネタを開く導線が無いため一覧表示のみ（タップ遷移は D4 では出さない）。 */}
        {stackOpen && realizedN > 0 && (
          <div className="desk-stack-list" aria-label="realized-list">
            {realizedRels
              .filter((r) => r.type === "realized_from" && r.neta?.kind === "melody")
              .map((r, i) => (
                <span key={i} className="desk-stack-item">
                  {(r.neta?.title ?? r.neta?.text ?? "(無題)").slice(0, 16)}
                </span>
              ))}
          </div>
        )}
        {/* 候補トレイ：対位バッジ〔指摘のみ〕・試着▶（ベッド上・無停止）・＋置く（skelPosition）。 */}
        {gen.cands.length > 0 && (
          <div className="desk-cand-tray" aria-label="desk-candidate-tray">
            {gen.cands.map((c) => {
              const cn = notesForContent(c.kind, c.content);
              const vl = voiceLeadingBadge(c.meta);
              const previewing = candPreview?.cid === c.cid;
              return (
                <div key={c.cid} className={"desk-cand-card" + (previewing ? " previewing" : "")} aria-label="desk-candidate-card">
                  <span className="desk-cand-meta">
                    {cn.length}音
                    {vl && (
                      <span className={"cand-vl" + (vl.warn ? " warn" : " ok")} aria-label="voiceleading-badge" title={c.meta?.voiceLeadingSummary}>
                        {vl.text}
                      </span>
                    )}
                  </span>
                  <div className="desk-cand-actions">
                    <button type="button" className={"tb-tool" + (previewing ? " on" : "")} aria-label="audition-on-bed" aria-pressed={previewing} title="ベッドの上で試着（現メロと比較）" onClick={() => auditionOnBed(c)}>
                      {previewing ? "試着中■" : "試着▶"}
                    </button>
                    <button type="button" className="tb-tool primary" aria-label="place-at-skeleton" title="この骨格の位置に置く" onClick={() => void placeAtSkeleton(c)}>
                      ＋置く
                    </button>
                    <button type="button" className="tb-tool" aria-label="drop-candidate" title="捨てる" onClick={() => { if (previewing) stopAudition(); gen.removeCand(c.cid); }}>
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="desk-cand-foot">
              <button type="button" className="tb-tool" aria-label="more-candidates" disabled={gen.genBusy} onClick={() => gen.lastPartRef.current && void gen.genPart(gen.lastPartRef.current, { skeletonNetaId: gen.lastPartRef.current.skeletonNetaId })}>
                {gen.genBusy ? "…" : "🎲 もっと"}
              </button>
              <button type="button" className="tb-tool" aria-label="close-candidate" onClick={() => { stopAudition(); gen.closeCandidate(); }}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 固定下端トランスポート：▶ループ／レンズ2択［畳み｜実音］／位置。 */}
      <div className="desk-transport" aria-label="desk-transport">
        <button type="button" className="tb-tool" aria-label="desk-play" title="ループ再生/一時停止" onClick={tp.playPause}>
          {tp.playing ? "⏸" : "▶"}
        </button>
        <button type="button" className="tb-tool" aria-label="desk-rewind" title="頭出し" onClick={tp.rewind}>
          ⏮
        </button>
        <span className="tb-divider" aria-hidden="true" />
        {/* レンズ2択（A群=LENS_FOLD / B群=LENS_REAL）。aria-label は A/B ゲートで固定・表示ラベルは focusStage で
            読み替わる（③④畳み|実音・①パターン単体|ベッド・②和声だけ|編成）＝seams A の「同じ1つの操作」。 */}
        <span className="desk-lens seg" role="group" aria-label="desk-lens">
          <button type="button" className={activeLens === LENS_FOLD ? "on" : ""} aria-pressed={activeLens === LENS_FOLD} aria-label="lens-fold" title={`${lensLabels[0]}（焦点を畳む/絞る側）`} onClick={() => toggleLens(LENS_FOLD)}>
            {lensLabels[0]}
          </button>
          <button type="button" className={activeLens === LENS_REAL ? "on" : ""} aria-pressed={activeLens === LENS_REAL} aria-label="lens-real" title={`${lensLabels[1]}（フル/実音側）`} onClick={() => toggleLens(LENS_REAL)}>
            {lensLabels[1]}
          </button>
        </span>
        <span className="tb-divider" aria-hidden="true" />
        <span className="desk-time muted" aria-label="desk-time" ref={tp.timeRef as React.Ref<HTMLSpanElement>}>
          1:1
        </span>
        <span className="tb-spacer" style={{ flex: 1 }} />
        <button type="button" className="tb-tool" aria-label="desk-undo" title="元に戻す" disabled={!hist.canUndo} onClick={hist.undo}>
          ↶
        </button>
        <button type="button" className="tb-tool" aria-label="desk-redo" title="やり直す" disabled={!hist.canRedo} onClick={hist.redo}>
          ↷
        </button>
      </div>
    </div>
  );
}
