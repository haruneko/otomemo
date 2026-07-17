// #S10 アナリーゼ・ワークベンチ：音源解析(analysis ネタ)を「メロ・ピアノロール＋コード＋小節線」で見て、
// 小節頭アンカーを合わせ（自動が最善・ダメなら手動）、区間を切り出して弾けるコード進行ネタにする編集面。
// 検算＝合成メロ＋コード＋クリックを鳴らす（原曲録音は鳴らさない・派生ノート＝著30-4圏）。スマホ対応（button/onClick）。
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api, type Neta } from "../api";
import { playNotes, type PlaybackHandle } from "../audio";
import type { Note } from "../music";
import { PrepStatus } from "../usePrepPending";

type Seg = [number, number, string]; // [start_sec, end_sec, label]
interface Facts {
  beat_times: number[];
  melody_notes: [number, number, number][]; // [start,end,midi]
  melody_f0: [number, number | null][];
  chords_timeline: Seg[];
}
interface Anchor { t_sec: number; meter: number; bar_no: number }
interface Section { from_t: number; to_t: number; label: string } // #S12改3 crash由来の区間境界（秒）＝reaperが materialize
interface Content {
  meta: { bpm: number | null; meter: number; key: { key?: string; mode?: string } | null; vocal_range?: unknown; duration_sec?: number | null };
  raw: Facts;
  overlay: { anchors: Anchor[]; cuts: unknown[]; chord_edits: unknown[]; sections: Section[] };
  prose: string;
}

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC: Record<string, number> = { C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5, "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11 };
// BTC quality → {表示, 構成音(半音), otomemo quality}
const QUAL: Record<string, { disp: string; iv: number[]; q: string }> = {
  maj: { disp: "", iv: [0, 4, 7], q: "" }, "": { disp: "", iv: [0, 4, 7], q: "" },
  min: { disp: "m", iv: [0, 3, 7], q: "m" }, "7": { disp: "7", iv: [0, 4, 7, 10], q: "7" },
  min7: { disp: "m7", iv: [0, 3, 7, 10], q: "m7" }, maj7: { disp: "M7", iv: [0, 4, 7, 11], q: "maj7" },
  dim: { disp: "dim", iv: [0, 3, 6], q: "dim" }, aug: { disp: "aug", iv: [0, 4, 8], q: "aug" },
  sus4: { disp: "sus4", iv: [0, 5, 7], q: "sus4" }, sus2: { disp: "sus2", iv: [0, 2, 7], q: "sus2" },
  min6: { disp: "m6", iv: [0, 3, 7, 9], q: "m6" }, maj6: { disp: "6", iv: [0, 4, 7, 9], q: "6" },
  hdim7: { disp: "m7b5", iv: [0, 3, 6, 10], q: "m7b5" }, dim7: { disp: "dim7", iv: [0, 3, 6, 9], q: "dim" },
};
/** BTC ラベル "A:min" / "C" → {root, disp, iv, q}。N/X/不明は null。 */
function parseBtc(label: string): { root: number; disp: string; iv: number[]; q: string } | null {
  if (!label || label === "N" || label === "X") return null;
  const [r, quraw] = label.split(":");
  const root = PC[(r ?? "").toUpperCase()];
  if (root === undefined) return null;
  const info = QUAL[quraw ?? ""] ?? QUAL[""]!;
  return { root, ...info };
}

/** 秒 → 連続ビート位置（beat_times で線形補間）。範囲外は端で外挿。 */
function secToBeat(bt: number[], t: number): number {
  const n = bt.length;
  if (n === 0) return t; // ビート無し＝そのまま秒
  if (t <= bt[0]!) return (t - bt[0]!) / ((bt[1]! - bt[0]!) || 0.5);
  if (t >= bt[n - 1]!) return n - 1 + (t - bt[n - 1]!) / ((bt[n - 1]! - bt[n - 2]!) || 0.5);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bt[m]! <= t) lo = m; else hi = m; }
  return lo + (t - bt[lo]!) / ((bt[hi]! - bt[lo]!) || 0.5);
}

// スケール（px/拍）の下限ガード＝これ以上詰めると音符/チップが潰れて読めない（長い曲の全体フィット時に効く）。
export const MIN_PXB = 6;
const FALLBACK_PXB = 48; // 幅未測定(SSR/初回/テスト)のフォールバック＝旧固定値と一致（1拍=48px・PianoRoll 整合）。

// 全体フィットの px/拍＝コンテナ可視幅を総拍数で割る。幅0/拍0はフォールバック、下限は MIN_PXB でガード。
// 長い曲でストリップが3万px超になり初期に1コードしか見えない問題の是正（可変スケールの土台・純関数＝テスト対象）。
export function fitScale(totalBeat: number, containerWidth: number, minPxb = MIN_PXB): number {
  if (totalBeat <= 0 || containerWidth <= 0) return FALLBACK_PXB;
  return Math.max(minPxb, containerWidth / totalBeat);
}

// クリックX(コンテナ相対)→再生開始拍。可変スケール pxb で割り [0,totalBeat] にクランプ（シーク座標＝pxb 追従）。
export function seekBeatAt(clientX: number, rectLeft: number, pxb: number, totalBeat: number): number {
  if (pxb <= 0) return 0;
  return Math.max(0, Math.min(totalBeat, (clientX - rectLeft) / pxb));
}

// ズーム段（オーナー承認）：全体フィット基準の倍率。全体=1（画面幅に収める）、×2/×4 で拡大＝横スクロールで読む。
export const AWB_ZOOMS: { id: string; label: string; mult: number }[] = [
  { id: "fit", label: "全体", mult: 1 },
  { id: "x2", label: "×2", mult: 2 },
  { id: "x4", label: "×4", mult: 4 },
];

// BTC の細切れ（Am→Am7→Am の揺れ）を **連続同一ルートでマージ**し変な分割を解消。
// 代表 quality＝マージ区間で累積が最長のラベル。N/X は落とす。
function mergeChords(timeline: Seg[]): Seg[] {
  const runs: { s: number; e: number; root: number; quals: Record<string, number> }[] = [];
  for (const [s, e, lab] of timeline) {
    const p = parseBtc(lab); if (!p) continue;
    const prev = runs[runs.length - 1];
    if (prev && prev.root === p.root) { prev.e = e; prev.quals[lab] = (prev.quals[lab] ?? 0) + (e - s); }
    else runs.push({ s, e, root: p.root, quals: { [lab]: e - s } });
  }
  return runs.map((r) => [r.s, r.e, Object.entries(r.quals).sort((a, b) => b[1] - a[1])[0]![0]] as Seg);
}

// 秒→最寄ビート index（アンカーが格子上に無くても見失わない・B2）。
function nearestIdx(bt: number[], t: number): number {
  if (!bt.length) return 0;
  let best = 0, bd = Infinity;
  for (let i = 0; i < bt.length; i++) { const d = Math.abs(bt[i]! - t); if (d < bd) { bd = d; best = i; } else if (bt[i]! > t) break; }
  return best;
}

export function AnalysisWorkbench({ neta, onChanged, onClose }: { neta: Neta; onChanged?: () => void; onClose: () => void }) {
  const c = (neta.content ?? {}) as Content; // 一覧は content を落とすので開く時に全文取得済み。念のため null 安全に。
  const bpm = c.meta?.bpm ?? 120;
  const meter = c.meta?.meter && c.meta.meter > 0 ? c.meta.meter : 4;
  const bt = c.raw?.beat_times ?? [];
  const [anchorT, setAnchorT] = useState<number>(c.overlay?.anchors?.[0]?.t_sec ?? bt[0] ?? 0);
  const [showProse, setShowProse] = useState(false);
  const [fromBar, setFromBar] = useState(1);
  const [toBar, setToBar] = useState(4);
  const [msg, setMsg] = useState("");
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  // F1 再生ローディング（設計2026-07-17・#11）：発音までの準備窓＝再押下 no-op＋busy 表示（<PrepStatus/> がグローバル文言）。
  const [starting, setStarting] = useState(false);
  const phRef = useRef<HTMLDivElement>(null); // 再生プレイヘッド（ref直書きで毎フレーム再描画しない）
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const rollRef = useRef<HTMLDivElement>(null); // 横スクロールの可視コンテナ＝全体フィットの基準幅
  const [seekBeat, setSeekBeat] = useState(0); // 再生開始位置（ロールをタップで指定）
  const [quantize, setQuantize] = useState(true); // コードを拍にそろえる（既定ON）
  const [zoomId, setZoomId] = useState("fit"); // ズーム段（全体/×2/×4）＝初期は全体フィット
  const [containerW, setContainerW] = useState(0); // 可視コンテナ幅（ResizeObserver で追従・未測定=0=フォールバック）

  // ★画面を閉じたら（unmount）再生を必ず止める（編集画面と同じ＝閉じたら鳴り止む）。
  useEffect(() => () => { handleRef.current?.stop(); if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // 可視コンテナ幅を測る＝全体フィットの分母。ResizeObserver で回転/リサイズに追従（無い環境はガード）。
  useEffect(() => {
    const el = rollRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const anchorBeat = useMemo(() => secToBeat(bt, anchorT), [bt, anchorT]);
  // アンカー基準のビート位置（小節頭=0,meter,2*meter…）
  const b = (t: number) => secToBeat(bt, t) - anchorBeat;

  const mel = c.raw?.melody_notes ?? [];
  const chords = useMemo(() => mergeChords(c.raw?.chords_timeline ?? []), [c.raw?.chords_timeline]); // 変な分割をマージ
  const dur = c.meta?.duration_sec ?? (bt[bt.length - 1] ?? 30);
  const totalBeat = Math.max(4, Math.ceil(b(dur)));
  const totalBars = Math.ceil(totalBeat / meter);

  // 可変スケール（px/拍）＝全体フィット×ズーム倍率。初期(fit,×1)は曲全体が可視幅に収まる（下限 MIN_PXB ガード）。
  // 全ての座標計算（ストリップ幅/グリッド/コード/メロ/シーク/プレイヘッド）はこの pxb を参照＝スケールが一元追従。
  const zoomMult = AWB_ZOOMS.find((z) => z.id === zoomId)?.mult ?? 1;
  const pxb = fitScale(totalBeat, containerW) * zoomMult;
  // プレイヘッドは rAF ループ（tick）が閉包で pxb を読む＝ズーム中も追従するよう ref に最新値を載せる。
  const pxbRef = useRef(pxb);
  pxbRef.current = pxb;

  // ★コードを拍グリッドにクオンタイズ（最小=四分音符=1拍）。実測の揺れ/BTC細切れを拍にそろえて綺麗に見せる。
  // 逐次で単調・非重なりに整える（前のコード終端より前には始まらない）。既定ON。生位置は quantize=off で。
  const chordBeats = useMemo(() => {
    const out: { sb: number; eb: number; root: number; disp: string; iv: number[]; q: string }[] = [];
    let cursor = -Infinity;
    for (const [s, e, lab] of chords) {
      const p = parseBtc(lab); if (!p) continue;
      let sb = b(s), eb = b(e);
      if (quantize) {
        sb = Math.round(sb); eb = Math.round(eb);
        if (sb < cursor) sb = cursor;      // 直前と重ならない
        if (eb <= sb) eb = sb + 1;          // 最小1拍
      }
      cursor = eb;
      out.push({ sb, eb, root: p.root, disp: p.disp, iv: p.iv, q: p.q });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chords, anchorBeat, quantize]);

  // メロの音域（描画用）：pyin のオクターブ誤検出=外れ値が音域を膨らませ空白帯を作る。
  // バックエンドが出す **vocal_range（f0 の 5〜95%tile＝頑健）** を優先し、無ければ音符の 10〜90%tile。
  const vr = (c.meta?.vocal_range ?? {}) as { note_low?: string; note_high?: string };
  const nameToMidi = (nm?: string): number | null => {
    const m = (nm ?? "").match(/^([A-G])([#♯b♭]?)(-?\d+)$/);
    if (!m) return null;
    const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]!]!;
    const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
    return 12 * (parseInt(m[3]!, 10) + 1) + pc + acc;
  };
  const midis = mel.map((mm) => mm[2]).sort((a, b) => a - b);
  const pct = (q: number) => (midis.length ? midis[Math.min(midis.length - 1, Math.max(0, Math.floor(q * midis.length)))]! : 66);
  const vrLo = nameToMidi(vr.note_low), vrHi = nameToMidi(vr.note_high);
  const loMidi = (vrLo ?? (midis.length ? pct(0.1) : 60)) - 1;
  const hiMidi = Math.max(loMidi + 6, (vrHi ?? (midis.length ? pct(0.9) : 72)) + 1);
  const rows = hiMidi - loMidi + 1;
  const ROWH = 9;
  const clampMidi = (m: number) => Math.min(hiMidi, Math.max(loMidi, m));

  // --- 再生：メロ＋コード＋クリックを1本の Note[] に。seek(開始拍)以降だけを -seek シフトして鳴らす ---
  function buildNotes(from: number): Note[] {
    const out: Note[] = [];
    for (const [s, e, midi] of mel) {
      const st = b(s) - from; const d = Math.max(0.1, b(e) - b(s));
      if (st + d > 0) out.push({ pitch: midi, start: Math.max(0, st), dur: d, program: 73 }); // 73=flute
    }
    for (const cb of chordBeats) {
      const st = cb.sb - from; const d = Math.max(0.2, cb.eb - cb.sb);
      if (st + d <= 0) continue;
      for (const iv of cb.iv) out.push({ pitch: 48 + cb.root + iv, start: Math.max(0, st), dur: d, program: 0 }); // 0=piano
    }
    for (let beat = Math.ceil(from); beat <= totalBeat; beat++) { // クリック（小節頭=強・他拍=弱）
      const down = beat % meter === 0;
      out.push({ pitch: down ? 37 : 42, start: beat - from, dur: 0.1, drum: true, vel: down ? 110 : 60 });
    }
    return out;
  }
  // 再生プレイヘッド：constant bpm 前提で performance.now から拍位置を割り、ref直書きで動かす（seek起点）。
  function stopPh() { if (rafRef.current) cancelAnimationFrame(rafRef.current); if (phRef.current) phRef.current.style.display = "none"; }
  function tick(from: number) {
    const beat = from + ((performance.now() - startRef.current) / 1000) * (bpm / 60);
    if (phRef.current) { phRef.current.style.left = `${beat * pxbRef.current}px`; phRef.current.style.display = beat <= totalBeat ? "block" : "none"; }
    if (beat < totalBeat + 0.5) rafRef.current = requestAnimationFrame(() => tick(from));
  }
  async function togglePlay() {
    if (starting) return; // 準備中の再押下は no-op
    if (playing) { handleRef.current?.stop(); stopPh(); setPlaying(false); return; }
    setStarting(true);
    setPlaying(true);
    startRef.current = performance.now();
    tick(seekBeat);
    try {
      handleRef.current = await playNotes(buildNotes(seekBeat), bpm, { onEnd: () => { stopPh(); setPlaying(false); } });
    } finally {
      setStarting(false);
    }
  }
  // ロールをタップ＝そこを再生開始位置(seek)に。再生中なら止めて位置だけ更新。
  function onSeek(e: ReactMouseEvent) {
    const rect = stripRef.current?.getBoundingClientRect(); if (!rect) return;
    const beat = seekBeatAt(e.clientX, rect.left, pxb, totalBeat);
    setSeekBeat(beat);
    if (playing) { handleRef.current?.stop(); stopPh(); setPlaying(false); }
  }

  function nudgeAnchor(dir: 1 | -1) {
    // アンカーを1ビート隣へ（位相をずらす＝小節頭合わせ）。最寄index基準で見失わない（B2）。
    const ni = Math.min(bt.length - 1, Math.max(0, nearestIdx(bt, anchorT) + dir));
    const nt = bt[ni] ?? anchorT;
    setAnchorT(nt);
    // 保存はデバウンス（連打で都度PUTしない・B3）。
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api.updateNeta(neta.id, { content: { ...c, overlay: { ...c.overlay, anchors: [{ t_sec: nt, meter, bar_no: 1 }] } } }).catch(() => {});
    }, 250);
  }

  // --- 切り出し：bar範囲[from,to]のコード（拍そろえ済み chordBeats）を chord_progression ネタへ ---
  async function cut() {
    const fb = (fromBar - 1) * meter, tb = toBar * meter; // beat 範囲
    const picked: { root: number; quality: string; start: number; dur: number }[] = [];
    for (const cb of chordBeats) {
      if (cb.sb >= tb || cb.eb <= fb) continue;
      const start = Math.max(0, Math.round(cb.sb - fb));
      const d = Math.max(1, Math.round(cb.eb - cb.sb));
      const last = picked[picked.length - 1];
      if (last && last.root === cb.root && last.quality === cb.q) last.dur += d;
      else picked.push({ root: cb.root, quality: cb.q, start, dur: d });
    }
    if (picked.length < 1) { setMsg("その範囲にコードがありません"); return; }
    await api.createNeta({
      kind: "chord_progression",
      title: `${neta.title ?? "アナリーゼ"} ${fromBar}-${toBar}小節`,
      content: { chords: picked },
      key: neta.key ?? undefined,
      mode: neta.mode ?? undefined,
      tempo: Math.round(bpm),
      tags: ["アナリーゼ", "切出"],
    });
    setMsg(`${fromBar}-${toBar}小節を切り出しました（${picked.length}コード）`);
    onChanged?.();
  }

  const keyLabel = c.meta?.key ? `${c.meta.key.key ?? ""}${c.meta.key.mode === "minor" ? "m" : ""}` : "?";

  return (
    <div className="mainpane-editor analysis-wb" style={{ ["--k" as string]: "var(--k-analysis)" }}>
      <div className="editor-bar">
        <button className="bs-btn" onClick={onClose}>← 戻る</button>
        <strong className="awb-title">{neta.title ?? "アナリーゼ"}</strong>
        <span className="spacer" />
        <span className="meta">♩{Math.round(bpm)} · {keyLabel} · {meter}/{meter === 6 ? 8 : 4}</span>
      </div>

      <div className="awb-tools">
        <button className="tp-btn" aria-label="play" aria-busy={starting || undefined} onClick={() => void togglePlay()}>{starting ? <><span className="tp-spin prep-spin" aria-hidden="true" /> 準備中</> : playing ? "■ 停止" : "▶ 再生"}</button>
        <PrepStatus />
        <span className="awb-anchor">小節頭:
          <button className="tp-btn awb-nudge" aria-label="anchor-prev" onClick={() => nudgeAnchor(-1)}>◀拍</button>
          <button className="tp-btn awb-nudge" aria-label="anchor-next" onClick={() => nudgeAnchor(1)}>拍▶</button>
        </span>
        <button className={"bs-btn" + (quantize ? " on" : "")} aria-label="toggle-quantize" title="コードを拍にそろえる（最小=四分音符）" onClick={() => setQuantize((v) => !v)}>拍そろえ</button>
        <span className="awb-zoom" role="group" aria-label="zoom">
          {AWB_ZOOMS.map((z) => (
            <button key={z.id} type="button" className={"bs-btn" + (zoomId === z.id ? " on" : "")} aria-label={`zoom-${z.id}`} aria-pressed={zoomId === z.id} onClick={() => setZoomId(z.id)}>{z.label}</button>
          ))}
        </span>
        <button className="bs-btn" aria-label="toggle-prose" onClick={() => setShowProse((v) => !v)}>所見{showProse ? "▲" : "▼"}</button>
      </div>
      {showProse && <div className="awb-prose chat-md">{c.prose || "（所見なし）"}</div>}

      {/* ロール：横スクロール。上=コード、下=メロピアノロール、縦線=小節/拍 */}
      <div ref={rollRef} className="awb-roll">
        <div ref={stripRef} className="awb-strip" onClick={onSeek} style={{ width: `${totalBeat * pxb}px`, height: `${44 + rows * ROWH + 10}px` }}>
          {/* 小節線・拍線 */}
          {Array.from({ length: totalBeat + 1 }, (_v, i) => (
            <div key={"g" + i} className={"awb-grid" + (i % meter === 0 ? " bar" : "")} style={{ left: `${i * pxb}px` }}>
              {i % meter === 0 && <span className="awb-barno">{i / meter + 1}</span>}
            </div>
          ))}
          {/* #S12改3 区間境界（crash由来）：破線の縦線＋ラベル。名付け(Aメロ/サビ)は人間・機械は境界だけ。 */}
          {(c.overlay?.sections ?? []).map((s, i) => {
            if (b(s.to_t) * pxb <= 0) return null; // 完全にアンカー手前＝描かない
            const left = Math.max(0, b(s.from_t) * pxb);
            return (
              <div key={"sec" + i} className="awb-section" style={{ left: `${left}px` }}>
                <span className="awb-section-label" title={s.label}>{s.label}</span>
              </div>
            );
          })}
          {/* コードレーン（拍そろえ済み chordBeats・左端 straddle は可視幅だけ＝重なり回避） */}
          <div className="awb-chords">
            {chordBeats.map((cb, i) => {
              const xs = cb.sb * pxb, xe = cb.eb * pxb;
              if (xe <= 0) return null; // 完全にアンカー手前＝描かない
              const left = Math.max(0, xs); const w = Math.max(14, xe - left);
              return <div key={"c" + i} className="awb-chip" style={{ left: `${left}px`, width: `${w}px` }}>{ROOTS[cb.root]}{cb.disp}</div>;
            })}
          </div>
          {/* メロ・ピアノロール（外れ値はクランプ／straddle は可視幅） */}
          <div className="awb-mel" style={{ height: `${rows * ROWH}px` }}>
            {mel.map(([s, e, midi], i) => {
              const xs = b(s) * pxb, xe = b(e) * pxb;
              if (xe <= 0) return null;
              const left = Math.max(0, xs); const w = Math.max(3, xe - left);
              return <div key={"m" + i} className="awb-note" style={{ left: `${left}px`, width: `${w}px`, top: `${(hiMidi - clampMidi(midi)) * ROWH}px`, height: `${ROWH - 1}px` }} />;
            })}
          </div>
          <div className="awb-seek" style={{ left: `${seekBeat * pxb}px` }} title="再生開始位置" />
          <div ref={phRef} className="awb-playhead" style={{ display: "none" }} />
        </div>
      </div>

      {/* 切り出し */}
      <div className="awb-cut">
        <label>切り出し <input type="number" min={1} max={totalBars} value={fromBar} aria-label="cut-from" onChange={(e) => setFromBar(Math.max(1, +e.target.value || 1))} />–
          <input type="number" min={1} max={totalBars} value={toBar} aria-label="cut-to" onChange={(e) => setToBar(Math.max(1, +e.target.value || 1))} />小節</label>
        <button className="tb-tool primary" aria-label="cut" onClick={() => void cut()}>✂ コードを切り出す</button>
      </div>
      {msg && <div className="awb-msg" onClick={() => setMsg("")}>{msg}</div>}
    </div>
  );
}
