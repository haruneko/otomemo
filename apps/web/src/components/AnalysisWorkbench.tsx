// #S10 アナリーゼ・ワークベンチ：音源解析(analysis ネタ)を「メロ・ピアノロール＋コード＋小節線」で見て、
// 小節頭アンカーを合わせ（自動が最善・ダメなら手動）、区間を切り出して弾けるコード進行ネタにする編集面。
// 検算＝合成メロ＋コード＋クリックを鳴らす（原曲録音は鳴らさない・派生ノート＝著30-4圏）。スマホ対応（button/onClick）。
import { useMemo, useRef, useState } from "react";
import { api, type Neta } from "../api";
import { playNotes, type PlaybackHandle } from "../audio";
import type { Note } from "../music";

type Seg = [number, number, string]; // [start_sec, end_sec, label]
interface Facts {
  beat_times: number[];
  melody_notes: [number, number, number][]; // [start,end,midi]
  melody_f0: [number, number | null][];
  chords_timeline: Seg[];
}
interface Anchor { t_sec: number; meter: number; bar_no: number }
interface Content {
  meta: { bpm: number | null; meter: number; key: { key?: string; mode?: string } | null; vocal_range?: unknown; duration_sec?: number | null };
  raw: Facts;
  overlay: { anchors: Anchor[]; cuts: unknown[]; chord_edits: unknown[]; sections: unknown[] };
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

const PXB = 48; // 1拍のpx（PianoRoll の 1拍=48px に合わせる＝密度整合）

// 秒→最寄ビート index（アンカーが格子上に無くても見失わない・B2）。
function nearestIdx(bt: number[], t: number): number {
  if (!bt.length) return 0;
  let best = 0, bd = Infinity;
  for (let i = 0; i < bt.length; i++) { const d = Math.abs(bt[i]! - t); if (d < bd) { bd = d; best = i; } else if (bt[i]! > t) break; }
  return best;
}

export function AnalysisWorkbench({ neta, onChanged, onClose }: { neta: Neta; onChanged?: () => void; onClose: () => void }) {
  const c = neta.content as Content;
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
  const phRef = useRef<HTMLDivElement>(null); // 再生プレイヘッド（ref直書きで毎フレーム再描画しない）
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anchorBeat = useMemo(() => secToBeat(bt, anchorT), [bt, anchorT]);
  // アンカー基準のビート位置（小節頭=0,meter,2*meter…）
  const b = (t: number) => secToBeat(bt, t) - anchorBeat;

  const mel = c.raw?.melody_notes ?? [];
  const chords = c.raw?.chords_timeline ?? [];
  const dur = c.meta?.duration_sec ?? (bt[bt.length - 1] ?? 30);
  const totalBeat = Math.max(4, Math.ceil(b(dur)));
  const totalBars = Math.ceil(totalBeat / meter);

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

  // --- 再生：メロ＋コード＋クリックを1本の Note[] にして鳴らす（beat座標・constant bpm＝内部整合で検算）---
  function buildNotes(): Note[] {
    const out: Note[] = [];
    for (const [s, e, midi] of mel) {
      const st = b(s); const d = Math.max(0.1, b(e) - st);
      if (st >= -1) out.push({ pitch: midi, start: Math.max(0, st), dur: d, program: 73 }); // 73=flute
    }
    for (const [s, e, lab] of chords) {
      const p = parseBtc(lab); if (!p) continue;
      const st = b(s); const d = Math.max(0.2, b(e) - st);
      if (st < -1) continue;
      for (const iv of p.iv) out.push({ pitch: 48 + p.root + iv, start: Math.max(0, st), dur: d, program: 0 }); // 0=piano
    }
    for (let beat = 0; beat <= totalBeat; beat++) { // クリック（小節頭=強・他拍=弱）
      const down = beat % meter === 0;
      out.push({ pitch: down ? 37 : 42, start: beat, dur: 0.1, drum: true, vel: down ? 110 : 60 });
    }
    return out;
  }
  // 再生プレイヘッド：constant bpm 前提で performance.now から拍位置を割り、ref直書きで動かす（G1）。
  function stopPh() { if (rafRef.current) cancelAnimationFrame(rafRef.current); if (phRef.current) phRef.current.style.display = "none"; }
  function tick() {
    const beat = ((performance.now() - startRef.current) / 1000) * (bpm / 60);
    if (phRef.current) { phRef.current.style.left = `${beat * PXB}px`; phRef.current.style.display = beat <= totalBeat ? "block" : "none"; }
    if (beat < totalBeat + 0.5) rafRef.current = requestAnimationFrame(tick);
  }
  async function togglePlay() {
    if (playing) { handleRef.current?.stop(); stopPh(); setPlaying(false); return; }
    setPlaying(true);
    startRef.current = performance.now();
    tick();
    handleRef.current = await playNotes(buildNotes(), bpm, { onEnd: () => { stopPh(); setPlaying(false); } });
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

  // --- 切り出し：bar範囲[from,to]のコードを chord_progression ネタへ（弾ける・実キー）---
  async function cut() {
    const fb = (fromBar - 1) * meter, tb = toBar * meter; // beat 範囲
    const picked: { root: number; quality: string; start: number; dur: number }[] = [];
    for (const [s, e, lab] of chords) {
      const p = parseBtc(lab); if (!p) continue;
      const st = b(s); if (st >= tb || b(e) <= fb) continue;
      const start = Math.max(0, Math.round(st - fb));
      const d = Math.max(1, Math.round(b(e) - st));
      const last = picked[picked.length - 1];
      if (last && last.root === p.root && last.quality === p.q) last.dur += d;
      else picked.push({ root: p.root, quality: p.q, start, dur: d });
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
        <button className="tp-btn" aria-label="play" onClick={() => void togglePlay()}>{playing ? "■ 停止" : "▶ 再生"}</button>
        <span className="awb-anchor">小節頭:
          <button className="tp-btn awb-nudge" aria-label="anchor-prev" onClick={() => nudgeAnchor(-1)}>◀拍</button>
          <button className="tp-btn awb-nudge" aria-label="anchor-next" onClick={() => nudgeAnchor(1)}>拍▶</button>
        </span>
        <button className="bs-btn" aria-label="toggle-prose" onClick={() => setShowProse((v) => !v)}>所見{showProse ? "▲" : "▼"}</button>
      </div>
      {showProse && <div className="awb-prose chat-md">{c.prose || "（所見なし）"}</div>}

      {/* ロール：横スクロール。上=コード、下=メロピアノロール、縦線=小節/拍 */}
      <div className="awb-roll">
        <div className="awb-strip" style={{ width: `${totalBeat * PXB}px`, height: `${44 + rows * ROWH + 10}px` }}>
          {/* 小節線・拍線 */}
          {Array.from({ length: totalBeat + 1 }, (_v, i) => (
            <div key={"g" + i} className={"awb-grid" + (i % meter === 0 ? " bar" : "")} style={{ left: `${i * PXB}px` }}>
              {i % meter === 0 && <span className="awb-barno">{i / meter + 1}</span>}
            </div>
          ))}
          {/* コードレーン（左端 straddle は可視幅だけ＝重なり回避 B1） */}
          <div className="awb-chords">
            {chords.map(([s, e, lab], i) => {
              const p = parseBtc(lab); if (!p) return null;
              const xs = b(s) * PXB, xe = b(e) * PXB;
              if (xe <= 0) return null; // 完全にアンカー手前＝描かない
              const left = Math.max(0, xs); const w = Math.max(14, xe - left);
              return <div key={"c" + i} className="awb-chip" style={{ left: `${left}px`, width: `${w}px` }}>{ROOTS[p.root]}{p.disp}</div>;
            })}
          </div>
          {/* メロ・ピアノロール（外れ値はクランプ／straddle は可視幅） */}
          <div className="awb-mel" style={{ height: `${rows * ROWH}px` }}>
            {mel.map(([s, e, midi], i) => {
              const xs = b(s) * PXB, xe = b(e) * PXB;
              if (xe <= 0) return null;
              const left = Math.max(0, xs); const w = Math.max(3, xe - left);
              return <div key={"m" + i} className="awb-note" style={{ left: `${left}px`, width: `${w}px`, top: `${(hiMidi - clampMidi(midi)) * ROWH}px`, height: `${ROWH - 1}px` }} />;
            })}
          </div>
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
