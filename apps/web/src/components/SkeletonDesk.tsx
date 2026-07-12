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
import { previewNote } from "../audio";
import { Icon } from "./Icon";
import { SkeletonEditor } from "./SkeletonEditor";
import { useTransport } from "../useTransport";
import { useEditHistory } from "../history";
import * as sctx from "../sectionContext";
import { lanesForKind, type Child } from "./sectionLanes";
import { deskLoadContent, deskSaveContent, deskLensNotes, contactText, contactDyadNotes } from "../deskContent";
import { analyzeCounterpoint, effectiveBassAt, type MelCp } from "../skeletonEdit";
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

  // D1.5: 再生座標は **骨格ブロックローカル**。scaleBeats＝blockSpan＝ロール幅（=bars*BPB）＝ SkeletonEditor が
  // 骨格を beat 0 起点で描く幅と一致＝プレイヘッド（--phb）がロールと揃う。ベッドは deskLensNotes 内で窓切り出し。
  const blockSpan = bars * BPB;

  // --- 接点ストリップ（D2）：各メロ点の対位法要約。SkeletonEditor のロール（cp バッジ）と同じ計算＝
  //   analyzeCounterpoint(tones, 実効ベース)。ブロックローカル座標（earChordsRel も相対）＝ロールと一致。
  //   ※ intervalBadge のテーブルを崇拝＝バッジ label は m.interval.label をそのまま出す（再実装しない）。
  const cp: MelCp[] = analyzeCounterpoint(tones, (b) => effectiveBassAt(b, bass, earChordsRel, phrases, blockSpan));

  // 範囲ブレース（D1.5）。既定＝ブロック全体 [0, blockSpan]。bars 伸縮でクランプ（窓が blockSpan を超えない）。
  const [range, setRange] = useState<{ startBeat: number; endBeat: number } | null>(null);
  const clampStart = Math.max(0, Math.min(range?.startBeat ?? 0, blockSpan - BPB));
  const clampEnd = Math.max(clampStart + BPB, Math.min(range?.endBeat ?? blockSpan, blockSpan));
  const effRange = { startBeat: clampStart, endBeat: clampEnd };

  // --- ベッド＋レンズの再生 Note 列（純合成は deskContent へ委譲）。 ---
  const getNotes = useCallback((): Note[] => {
    if (!loaded) return [];
    const stateReal: SkeletonContent = { bars, tones, ...(bass.length ? { bass } : {}), ...(phrases.length ? { phrases } : {}) };
    return deskLensNotes({
      stateReal,
      earChordsRel,
      composite: compositeNotes(children, sectionKey, sectionMode), // 骨格は無音（従来どおり）
      skelPosition, // ベッド窓の起点（skelEar 自体は beat 0 起点のまま＝ロール一致）
      bars, // 骨格ブロックの小節数（クリック尺／ベッド窓幅）
      bpb: BPB,
    });
    // earChordsRel/children 等は毎レンダ再計算＝useTransport が cfg ref で最新を読む（stale なし）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, bars, tones, bass, phrases, children, BPB, sectionKey, sectionMode, skelPosition]);

  const tp = useTransport(getNotes, tempo, { scaleBeats: blockSpan, bpb: BPB, activeLens, range: effRange });

  // --- 範囲ブレースのルーラー：ロール（tp.scrollerRef）と横スクロールを同期＝ずれない。 ---
  // 骨格ゾーン（ticks/braces）だけを translate＝ロール content と同じ量だけ左へ流れる（beat 位置が一致）。
  // 「窓」ラベルの gutter は translate 外＝ロールの sticky keycol と同じく左端に据え置き。
  const rulerZoneRef = useRef<HTMLDivElement>(null); // transform も beatFromClientX も同一要素（beat0=rect.left）
  const contactZoneRef = useRef<HTMLDivElement>(null); // 接点ストリップ（ルーラーと同じ scroll 同期＝ロール一致）
  useEffect(() => {
    const sc = (tp.scrollerRef as React.RefObject<HTMLDivElement>).current;
    const zone = rulerZoneRef.current;
    if (!sc || !zone) return;
    const sync = () => {
      const tx = `translateX(${-sc.scrollLeft}px)`;
      zone.style.transform = tx;
      if (contactZoneRef.current) contactZoneRef.current.style.transform = tx; // 接点行もロールと同じだけ流す
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

  // --- 接点タップ→説明ポップ（指摘のみ）＋「この瞬間だけ聴く」ダイアッド。 ---
  // ポップは fixed 配置＝タップした badge の画面座標を起点に、モバイル幅で画面外に出ないよう clamp。
  const [contactPop, setContactPop] = useState<{ cp: MelCp; x: number; y: number } | null>(null);
  const POP_W = 232; // ポップ幅（clamp 用・CSS と同値）
  const onContactTap = (e: React.MouseEvent, m: MelCp) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8)); // 画面外clamp（右端はみ出し防止）
    const y = Math.min(r.bottom + 4, window.innerHeight - 110); // 下端はみ出し防止
    setContactPop({ cp: m, x, y });
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

      {/* 接点ストリップ（D2）：ロール直下・タップできる対位法要約行。バッジ label＝intervalBadge の label
          （m.interval.label＝再実装しない）。色＝属性（並行/交差/休符/不協和/協和）。scroll はロールと同期。 */}
      <div className="desk-contact" aria-label="desk-contact">
        <div className="desk-contact-gutter" style={{ width: GUTTER }}>接点</div>
        <div className="desk-contact-viewport">
          <div className="desk-contact-zone" ref={contactZoneRef} style={{ width: blockSpan * PPB }}>
            {cp.map((m, i) => (
              <button
                key={i}
                type="button"
                className={"desk-contact-badge " + contactClass(m)}
                aria-label={`contact-${i}`}
                title="タップ＝説明＋この瞬間だけ聴く"
                style={{ left: m.start * PPB }}
                onClick={(e) => onContactTap(e, m)}
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
            <p className="dc-text">{contactText(contactPop.cp)}</p>
            <button type="button" className="dc-listen" aria-label="contact-listen" onClick={() => playContactDyad(contactPop.cp)}>
              ♪ この瞬間だけ聴く
            </button>
          </div>
        </>
      )}

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
