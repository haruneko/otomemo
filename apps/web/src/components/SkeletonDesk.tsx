// 骨格の机（design #20 S6・スライス D1c＝器＋入口配線）。
// 骨格を **セクションの伴奏ベッドをループさせながら** 編集し、畳み/実音レンズを **止めずに** A/B する全画面。
// api は無改変（getComposition/updateNeta を消費するだけ）。SkeletonEditor（③前景）をそのまま子に吊るす。
// ①②④は後続スライス（D5/D3/D4）＝今回は③前景＋共有ループ＋レンズ2択のみ（handoff §3 D1）。
//
// 座標系（handoff §2.3・二重移調を避ける・deskContent.ts で固定）：
//   state は **セクション実調（配置移調 shift 済＝ビュー）**。読込＝+shift（deskLoadContent）／保存＝−shift（deskSaveContent）。
//   鳴らす（deskLensNotes）は state が既に実調なので skeletonEarNotes を shift:0 で呼ぶ。
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "./Icon";
import { SkeletonEditor } from "./SkeletonEditor";
import { useTransport } from "../useTransport";
import { useEditHistory } from "../history";
import * as sctx from "../sectionContext";
import { lanesForKind, type Child } from "./sectionLanes";
import { deskLoadContent, deskSaveContent, deskLensNotes } from "../deskContent";
import { LENS_FOLD, LENS_REAL } from "../deskLens";
import {
  beatsPerBar,
  compositeNotes,
  melodyPlacementShift,
  isSkeleton,
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

// pc（0–11）→ 音名（オクターブ無し）。ヘッダ表示用。
const keyLabel = (pc: number): string => pitchName(60 + ((pc % 12) + 12) % 12).replace(/-?\d+$/, "");

export function SkeletonDesk(p: SkeletonDeskProps) {
  const { sectionId, sectionKey, sectionMode, meter, tempo, skelNetaId, skelPosition, skelOrd } = p;
  const BPB = beatsPerBar(meter);
  const LANES = lanesForKind("section");

  // --- state（すべて実調ビュー） ---
  const [children, setChildren] = useState<Child[]>([]);
  const [sectionTitle, setSectionTitle] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [tones, setTones] = useState<SkeletonBreakpoint[]>([]);
  const [bass, setBass] = useState<SkeletonBreakpoint[]>([]);
  const [phrases, setPhrases] = useState<{ endBeat: number; cadence?: string }[]>([]);
  const [bars, setBars] = useState(4);
  const [rollMode, setRollMode] = useState<"draw" | "select" | "erase">("draw");
  const [counterpoint, setCounterpoint] = useState(true); // SkeletonEditor 内トグル（候補試聴/凡例用）
  const [activeLens, setActiveLens] = useState<string>(LENS_FOLD); // 既定＝畳み（音程が読める）

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

  // --- ベッド文脈（実調・セクション位置）。earChords を骨格ブロック相対へ（SectionEditor.skelEar と同座標系）。 ---
  const secCtx: sctx.SectionCtx = { children, LANES, keyPc: sectionKey, mode: sectionMode, BPB };
  const earChordsRel: ChordEntry[] = sctx.earChords(secCtx).map((ch) => ({ ...ch, start: ch.start - skelPosition }));
  const sectionEndBeats = children.length ? Math.max(0, ...children.map((c) => c.position + sctx.childDur(secCtx, c))) : bars * BPB;
  const sectionBars = Math.max(1, Math.ceil(sectionEndBeats / BPB - 1e-6));
  const TOTAL = sectionBars * BPB; // ループ尺＝セクション全体（範囲ブレースは D1.5）

  // --- ベッド＋レンズの再生 Note 列（純合成は deskContent へ委譲）。 ---
  const getNotes = useCallback((): Note[] => {
    if (!loaded) return [];
    const stateReal: SkeletonContent = { bars, tones, ...(bass.length ? { bass } : {}), ...(phrases.length ? { phrases } : {}) };
    return deskLensNotes({
      stateReal,
      earChordsRel,
      composite: compositeNotes(children, sectionKey, sectionMode), // 骨格は無音（従来どおり）
      skelPosition,
      bars: sectionBars,
      bpb: BPB,
    });
    // earChordsRel/children 等は毎レンダ再計算＝useTransport が cfg ref で最新を読む（stale なし）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, bars, tones, bass, phrases, children, sectionBars, BPB, sectionKey, sectionMode, skelPosition]);

  const tp = useTransport(getNotes, tempo, { scaleBeats: TOTAL, bpb: BPB, activeLens });

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
        chords={earChordsRel}
        rollMode={rollMode}
        counterpoint={counterpoint}
        setCounterpoint={setCounterpoint}
        tempo={tempo}
        playheadRef={tp.lineRef}
        scrollerRef={tp.scrollerRef}
      />

      {/* 固定下端トランスポート：▶ループ／レンズ2択［畳み｜実音］／位置。 */}
      <div className="desk-transport" aria-label="desk-transport">
        <button type="button" className="tb-tool" aria-label="desk-play" title="ループ再生/一時停止" onClick={tp.playPause}>
          {tp.playing ? "⏸" : "▶"}
        </button>
        <button type="button" className="tb-tool" aria-label="desk-rewind" title="頭出し" onClick={tp.rewind}>
          ⏮
        </button>
        <span className="tb-divider" aria-hidden="true" />
        <span className="desk-lens seg" role="group" aria-label="desk-lens">
          <button type="button" className={activeLens === LENS_FOLD ? "on" : ""} aria-pressed={activeLens === LENS_FOLD} aria-label="lens-fold" title="畳み（2声＋クリックで音程を読む）" onClick={() => toggleLens(LENS_FOLD)}>
            畳み
          </button>
          <button type="button" className={activeLens === LENS_REAL ? "on" : ""} aria-pressed={activeLens === LENS_REAL} aria-label="lens-real" title="実音（編成の座り）" onClick={() => toggleLens(LENS_REAL)}>
            実音
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
