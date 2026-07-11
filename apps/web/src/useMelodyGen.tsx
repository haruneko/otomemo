import { useRef, useState } from "react";
import { api, type Neta } from "./api";
import { fitReportText } from "./fitReport";
import { harmonyVoice } from "./harmony";
import {
  notesForContent,
  playNotes,
  skeletonPreviewNotes,
  isSkeleton,
  type Note,
  type PlaybackHandle,
} from "./music";
import { spanOverlaps, type Lane, type Child } from "./components/sectionLanes";

// SectionEditor の「生成/ハモリ道具」（いじる▾）＝メロ生成ノブ・候補トレイ・ハモリ/fit をまとめた
// カスタムフック（Task#2 機械分割＝挙動不変）。SectionEditor が section 文脈(ctx)を渡し、当フックは
// 状態＋ハンドラ＋ノブの描画ヘルパ(segRow/sliderRow)を返す。JSX は SectionEditor 側に残す＝DOM/CSS不変。

// メロ生成プリセット＝13ノブを"当たり"の組に畳む主動線。値は param-clarity doc §5.1（0/未指定=非送信=bit一致）。
type PresetV = { density?: number; swing?: number; runs?: number; expression?: number; push?: number; hook?: number; articulation?: number; foreground?: number; breathe?: number; phrasing?: "" | "symmetric" | "asymmetric" | "period" | "sentence"; form?: "" | "sentence"; flow?: number; pickup?: number };
export const MELODY_PRESETS: { name: string; label: string; v: PresetV }[] = [
  { name: "plain", label: "おまかせ", v: { density: 0.5 } }, // density は常時送信＝未タッチ既定(0.5)に合わせる＝「おまかせ」=従来生成（監査F1）
  { name: "soft", label: "しっとり", v: { density: 0.3, expression: 0.5, foreground: 0.2, breathe: 0.4 } },
  { name: "bounce", label: "跳ねる", v: { density: 0.5, swing: 0.6, runs: 0.2, expression: 0.2, push: 0.3 } },
  { name: "run", label: "走る", v: { density: 0.8, swing: 0.1, runs: 0.7, expression: 0.2, push: 0.3 } },
  { name: "sparkle", label: "きらきら", v: { density: 0.7, swing: 0.2, runs: 0.5, expression: 0.4, foreground: 0.5 } },
  { name: "song", label: "歌もの", v: { density: 0.45, swing: 0.15, runs: 0.1, expression: 0.3, hook: 0.5, articulation: 0.4, phrasing: "symmetric", flow: 0.5, pickup: 0.5 } },
  { name: "hook", label: "口ずさめる", v: { density: 0.4, swing: 0.1, expression: 0.2, hook: 0.8, articulation: 0.6, foreground: 0.1, flow: 0.4, pickup: 0.5 } },
  { name: "sustain", label: "伸びやか", v: { density: 0.4, expression: 0.3, flow: 0.75, pickup: 0.5, foreground: 0.15 } }, // 塊を長く連結＝サビ向き（2026-07-11 句フレージング）
];

// 生成パーツ（この進行に◯）。メロ/ベースはコードが要る、ドラムは frame だけ。
export const GEN_PARTS = [
  { label: "メロ", op: "gen_melody", needsChords: true },
  { label: "ベース", op: "gen_bass", needsChords: true },
  { label: "ドラム", op: "gen_drums", needsChords: false },
] as const;

// リズムパーツ層 L1（design #20 S4-1）：プリセット id/label を web に複写（パターン本体は api 唯一持ち＝ids のみ参照）。
// 押した順に rotate へ積み小節に敷く（ドラムパターン感覚）。未選択＝未送信＝bit一致。api rhythmParts.ts と id 一致必須。
export const RHYTHM_PART_UI: { id: string; label: string }[] = [
  { id: "whole", label: "白玉" },
  { id: "half2", label: "二分×2" },
  { id: "dotted", label: "付点タメ" },
  { id: "quarters", label: "四分刻み" },
  { id: "eighths", label: "8分刻み" },
  { id: "driveHold", label: "刻み→タメ" },
  { id: "sixteenths", label: "駆け16分" },
  { id: "syncope", label: "シンコペ" },
  { id: "offhead", label: "頭抜き" },
  { id: "backbeat", label: "アフター" },
];

export type ChordArg = { root?: number; quality?: string; start?: number; dur?: number };
export type DrumsPayload = { rhythm: { steps: number; bars: number; beatsPerStep: number; lanes: { name?: string; midi?: number; hits: number[]; vel?: number }[] } };
// 対位法レポート（design #20 S3d）：API が gen_melody/gen_bass 候補の meta に添付（読み取り専用・指摘のみ）。
export type VoiceLeadingReport = { score: number; parallelFifths: number; parallelOctaves: number; directFifths: number; directOctaves: number; voiceCrossings: number };
export type CandMeta = { voiceLeading?: VoiceLeadingReport; voiceLeadingSummary?: string };
export type Cand = { kind: string; content: unknown; cid: number; skeletonNetaId?: string; meta?: CandMeta };

// 候補カードの対位法バッジ（design #20 S3d）：違反があれば ⚠＋種別×件数を簡潔に、無ければ「対位OK」。
// 「機械は指摘まで・禁止しない」＝score が低くても置ける（バッジは注意喚起のみ）。meta 無し＝null＝非表示。
export function voiceLeadingBadge(meta?: CandMeta): { text: string; warn: boolean } | null {
  const vl = meta?.voiceLeading;
  if (!vl) return null;
  const bits: string[] = [];
  if (vl.parallelFifths) bits.push(`並5×${vl.parallelFifths}`);
  if (vl.parallelOctaves) bits.push(`並8×${vl.parallelOctaves}`);
  if (vl.directFifths) bits.push(`直5×${vl.directFifths}`);
  if (vl.directOctaves) bits.push(`直8×${vl.directOctaves}`);
  if (vl.voiceCrossings) bits.push(`交差×${vl.voiceCrossings}`);
  return bits.length ? { text: `⚠${bits.join(" ")}`, warn: true } : { text: "対位OK", warn: false };
}

// section から渡される文脈（当フックは section 形状を知らずに済むよう関数で受ける）。
export type MelodyGenCtx = {
  neta: Neta;
  keyPc: number;
  tempo: number;
  liveMeter?: string;
  liveTitle: string;
  BARS: number;
  BPB: number;
  lanes: readonly Lane[];
  laneChildren: (lane: Lane) => Child[];
  laneOf: (kind: string) => Lane | undefined;
  sectionChords: () => ChordArg[];
  sectionBass: () => Note[];
  sectionDrums: () => DrumsPayload | null;
  contentDur: (kind: string, content: unknown) => number;
  childDur: (c: Child) => number;
  progForKind: (kind: string) => number | undefined;
  reload: () => Promise<void>;
  onChanged?: () => void;
};

export function useMelodyGen(ctx: MelodyGenCtx) {
  const { neta, keyPc, tempo, liveMeter, liveTitle, BARS, BPB, lanes } = ctx;
  // P2（2026-07-10・UX再設計）：候補を単数→配列(トレイ)＝複数を並べて比較・keep。cid=React key＋keep追跡。
  const [cands, setCands] = useState<Cand[]>([]);
  const [keptCids, setKeptCids] = useState<Set<number>>(new Set());
  const candId = useRef(0);
  const [genBusy, setGenBusy] = useState(false);
  const [density, setDensity] = useState(0.5); // メロの細かさ 0=疎〜1=細かい（耳FB 2026-07-08）
  const [swing, setSwing] = useState(0); // メロの跳ね 0=ストレート〜1=シャッフル
  const [expression, setExpression] = useState(0); // メロの表情 0=素直〜1=もたれ(強拍に倚音/掛留)（Step1 2026-07-09）
  const [phrasing, setPhrasing] = useState<"" | "symmetric" | "asymmetric" | "period" | "sentence">(""); // 句割り 空=従来/対称(問い→答え)/非対称(3+3+2の呼吸)（Step2/P0-b 2026-07-09）
  const [runs, setRuns] = useState(0); // メロの走句 0=なし〜1=16分連続が出やすい（Step4 2026-07-09）
  const [push, setPush] = useState(0); // メロの前借り(食い) 0=なし〜1=1,2,3拍を16分前へ（Step4 2026-07-09）
  const [foreground, setForeground] = useState(0); // 前景の自由度 0=反復中心〜1=自由材料(同音/跳躍)多め（Step5 2026-07-09）
  const [breathe, setBreathe] = useState(0); // 句頭の遅延入場(息継ぎ) 0=なし〜1=各句頭を空けて入る（#9 2026-07-09）
  const [humanize, setHumanize] = useState(0); // 人間味(グルーヴ) 0=機械的〜1=強弱＋微小タイミング揺れ（監査E 2026-07-09）
  const [form, setForm] = useState<"" | "sentence">(""); // 形式 空=従来AABA/文=sentence(提示→反復→継続断片化→カデンツ=起承転結)（D本丸 2026-07-09）
  // 対位（メロがベースを見て並行5度8度/b9を避ける）＝固定0.3自動送信を廃し UI で選択（2026-07-10・menu整理）。
  const [counter, setCounter] = useState<"" | "weak" | "mid" | "strong">("");
  // 反復音モチーフ（Phase2案B・2026-07-10）：hook>0 で motifMode:preserve＋hook を送る（hookはpreserve下でのみ本領）。
  const [hook, setHook] = useState(0);
  const [articulation, setArticulation] = useState(0);
  // 句フレージング（2026-07-11）：flow=塊の連結/長音、pickup=弱起。両方 0＝未送信＝従来 bit一致。
  const [flow, setFlow] = useState(0);
  const [pickup, setPickup] = useState(0);
  // 最小音符（2026-07-10）：これより細かい音を出さない上限。""=おまかせ(テンポ連動)。
  const [finest, setFinest] = useState<"" | "quarter" | "eighth">("");
  // リズムパーツ層 L1（design #20 S4-1）：選択した partId 群（押した順＝rotate）。空＝未送信＝従来抽選(bit一致)。
  const [rhythmParts, setRhythmParts] = useState<string[]>([]);
  const toggleRhythmPart = (id: string) => { setRhythmParts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); setPreset(""); };
  const [detailsOpen, setDetailsOpen] = useState(false); // メロノブの詳細段（progressive disclosure）
  // P4：プリセット主役。選択中プリセット名（ハイライト用・手でノブを動かしたら "" へ）。
  const [preset, setPreset] = useState<string>("");
  // P5：サイコロ＝プリセットを中心にノブをランダムに振る。ロックしたノブは固定して振る＝ばらつき×制御。
  const [lockedKnobs, setLockedKnobs] = useState<Set<string>>(new Set());
  const toggleLock = (k: string) => setLockedKnobs((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const applyPreset = (name: string, v: PresetV) => {
    setDensity(v.density ?? 0); setSwing(v.swing ?? 0); setRuns(v.runs ?? 0); setExpression(v.expression ?? 0); setPush(v.push ?? 0);
    setHook(v.hook ?? 0); setArticulation(v.articulation ?? 0); setForeground(v.foreground ?? 0); setBreathe(v.breathe ?? 0);
    setFlow(v.flow ?? 0); setPickup(v.pickup ?? 0);
    setPhrasing(v.phrasing ?? ""); setForm(v.form ?? ""); setPreset(name);
  };
  // OFF/弱/中/強 の4段＝値をバケット表示（プリセットの連続値も正しい段に光る）＋タップで代表値へスナップ。
  const bucket = (v: number) => (v < 0.15 ? 0 : v < 0.45 ? 1 : v < 0.75 ? 2 : 3);
  const SEG4: [string, number][] = [["OFF", 0], ["弱", 0.3], ["中", 0.6], ["強", 0.9]];
  const SEG_LV = ["off", "weak", "mid", "strong"];
  // OFF/弱/中/強 のセグメント行（数値ノブ）。lock=🎲サイコロで固定するノブ（P5）。
  const segRow = (aria: string, label: string, sub: string, val: number, set: (n: number) => void, lock?: string) => (
    <div className="knob-seg" role="group" aria-label={aria}>
      <span className="knob-name">{label}<small>{sub}</small></span>
      <span className="seg-ctl">
        {SEG4.map(([lab, v], i) => (
          <button key={lab} type="button" className={"seg-b" + (bucket(val) === i ? " on" : "")} aria-label={`${aria}-${SEG_LV[i]}`} aria-pressed={bucket(val) === i} onClick={() => { set(v); setPreset(""); }}>{lab}</button>
        ))}
        {lock && <button type="button" className={"seg-lock" + (lockedKnobs.has(lock) ? " on" : "")} aria-label={`lock-${lock}`} aria-pressed={lockedKnobs.has(lock)} title="この値を固定してサイコロ" onClick={() => toggleLock(lock)}>{lockedKnobs.has(lock) ? "🔒" : "🔓"}</button>}
      </span>
    </div>
  );
  // 両端スライダー行（連続量）。耳語の両端ラベル。aria は input に付与（getByLabelText で拾える）。lock=🔒でサイコロから守る（F3）。
  const sliderRow = (aria: string, label: string, val: number, set: (n: number) => void, lo: string, hi: string, lock?: string) => (
    <label className="knob-row">
      <span className="knob-name">{label}</span>
      <span className="knob-end">{lo}</span>
      <input aria-label={aria} type="range" min={0} max={1} step={0.1} value={val} onChange={(e) => { set(Number(e.target.value)); setPreset(""); }} />
      <span className="knob-end">{hi}</span>
      {lock && <button type="button" className={"seg-lock" + (lockedKnobs.has(lock) ? " on" : "")} aria-label={`lock-${lock}`} aria-pressed={lockedKnobs.has(lock)} title="この値を固定してサイコロ" onClick={(e) => { e.preventDefault(); toggleLock(lock); }}>{lockedKnobs.has(lock) ? "🔒" : "🔓"}</button>}
    </label>
  );
  // 🎲：ロックしていないノブを現在値±0.3でランダムに振る（当たりの周辺探索）。0.1刻み・[0,1]。
  const rollDice = () => {
    const j = (cur: number, key: string) => (lockedKnobs.has(key) ? cur : Math.max(0, Math.min(1, Math.round((cur + (Math.random() * 0.6 - 0.3)) * 10) / 10)));
    setDensity((d) => j(d, "density")); setSwing((s) => j(s, "swing")); setRuns((r) => j(r, "runs")); setExpression((e) => j(e, "expression"));
    setPush((p) => j(p, "push")); setHook((h) => j(h, "hook")); setArticulation((a) => j(a, "articulation")); setForeground((f) => j(f, "foreground")); setBreathe((b) => j(b, "breathe"));
    setFlow((f) => j(f, "flow")); setPickup((p) => j(p, "pickup"));
    setPreset("");
  };
  const candPlay = useRef<PlaybackHandle | null>(null);
  // 直近の生成呼び出し（「🎲 もっと」で同条件再生成）。骨格から吹いた時は skeletonNetaId も保持し再現する。
  const lastPartRef = useRef<{ op: string; needsChords: boolean; label: string; skeletonNetaId?: string } | null>(null);

  const secModeOf = (): "major" | "minor" => ((neta.mode ?? "").toLowerCase().includes("min") ? "minor" : "major");

  async function genPart(part: { op: string; needsChords: boolean; label: string }, opts?: { skeletonNetaId?: string }) {
    if (genBusy) return;
    lastPartRef.current = { ...part, skeletonNetaId: opts?.skeletonNetaId };
    const chords = ctx.sectionChords();
    // 骨格から吹く時は骨格が構造を担うのでコード無しでも可（skeletonNetaId 注入）。
    if (part.needsChords && !chords.length && !opts?.skeletonNetaId) return;
    setGenBusy(true);
    try {
      // 2026-07-08 耳FB：section の mode を宣言（短調でメジャー生成＝濁りの主因）。メロは density/swing ノブも渡す。
      const secMode = secModeOf();
      // セクション役割（2026-07-10・design#12-M）：Section ネタ tags の `role:` を frame.section.role へ（無ければ渡さない＝従来）。
      const roleTag = (neta.tags ?? []).find((t) => t.startsWith("role:"))?.slice(5);
      const frame: Record<string, unknown> = { key: keyPc, meter: liveMeter, tempo, bars: BARS, mode: secMode };
      if (roleTag) frame.section = { role: roleTag };
      const body: Record<string, unknown> = {
        frame,
        chords,
        seed: Math.floor(Math.random() * 1e6), // 押すたび別案
      };
      if (part.op === "gen_melody") {
        body.density = density; body.swing = swing; body.expression = expression; body.runs = runs; body.push = push; body.foreground = foreground; body.breathe = breathe; body.humanize = humanize; if (phrasing) body.phrasing = phrasing; if (form) body.form = form;
        // 骨格から吹く（design #20 S2）：骨格neta を注入＝構造線を共有し表面(リズム/装飾)だけ変える。
        if (opts?.skeletonNetaId) body.skeletonNetaId = opts.skeletonNetaId;
        // 対位バイアス（design「gen_melody×ベース結線」）：UI の「対位」を ON にした時だけ bass を渡し counter を送る。
        const bass = ctx.sectionBass();
        const counterVal = counter === "weak" ? 0.2 : counter === "mid" ? 0.4 : counter === "strong" ? 0.7 : 0;
        if (counterVal > 0 && bass.length) { body.bass = bass; body.counter = counterVal; }
        // 反復音モチーフ（design「動機保存レンダ」）：hook>0 で motifMode:preserve＋hook を送る。
        if (hook > 0) { body.hook = hook; body.motifMode = "preserve"; }
        if (articulation > 0) body.articulation = articulation;
        if (finest) body.finest = finest; // 最小音符（""=おまかせ＝未送信＝テンポ連動）
        // 句フレージング（2026-07-11）：flow=連結/長音・pickup=弱起。0＝未送信＝従来 bit一致。
        if (flow > 0) body.flow = flow;
        if (pickup > 0) body.pickup = pickup;
        // リズムパーツ層 L1（design #20 S4-1）：選択があれば rotate として送る＝小節にパーツを敷く。空＝未送信＝bit一致。
        if (rhythmParts.length) body.rhythmParts = { rotate: rhythmParts };
        // ドラム結線（design「gen_melody×ドラム結線」）：リズムレーンがあれば step 列を渡し backbeat=0.3。
        const drums = ctx.sectionDrums();
        if (drums) { body.drums = drums; body.backbeat = 0.3; }
      }
      // ベース表面化（design #20 S3c）：骨格の明示ベース区間を gen_bass が差し替える（明示無し=root導出=従来）。
      if (part.op === "gen_bass" && opts?.skeletonNetaId) body.skeletonNetaId = opts.skeletonNetaId;
      const r = await api.music<{ items: { kind: string; content: unknown; meta?: CandMeta }[] }>(part.op, body);
      const item = r.items?.[0];
      // 候補に骨格コンテキストを持たせる＝置く時に realized_from を張る相手が候補ごとに確定（ref の撒き漏れを排す）。
      // meta＝対位法レポート（design #20 S3d・指摘のみ）を候補へ運ぶ＝カードにバッジ表示。
      if (item) pushCand({ kind: item.kind, content: item.content, skeletonNetaId: opts?.skeletonNetaId, meta: item.meta });
    } finally {
      setGenBusy(false);
    }
  }
  // 骨格を生成（design #20 S2・いじる▾）：gen_skeleton→候補トレイ→＋置くで骨格レーンへ。破壊上書きしない。
  async function genSkeleton() {
    if (genBusy) return;
    lastPartRef.current = null;
    setGenBusy(true);
    try {
      const r = await api.music<{ items: { kind: string; content: unknown }[] }>("gen_skeleton", {
        frame: { key: keyPc, meter: liveMeter, tempo, bars: BARS, mode: secModeOf() },
        chords: ctx.sectionChords(),
        seed: Math.floor(Math.random() * 1e6),
      });
      const item = r.items?.[0];
      if (item) pushCand({ kind: item.kind, content: item.content });
    } finally {
      setGenBusy(false);
    }
  }
  // 骨格ブロック[吹く▶]（design #20 S2）：gen_melody(skeletonNetaId)→メロ候補トレイ→＋置くで新メロ＋realized_from。
  function blowSkeleton(child: Child) {
    void genPart(GEN_PARTS[0], { skeletonNetaId: child.node.neta.id });
  }
  // 骨格ブロック[ベース▶]（design #20 S3c）：gen_bass(skeletonNetaId)→ベース候補トレイ→＋置くで新ベース＋realized_from。
  function blowSkeletonBass(child: Child) {
    void genPart(GEN_PARTS[1], { skeletonNetaId: child.node.neta.id });
  }
  // 骨格からコードを推定（design #20 S2・harmonize）：骨格の白玉→harmonize→chord_progression 候補→＋置くでコードレーンへ。
  async function estimateChords(child: Child) {
    if (genBusy) return;
    const content = child.node.neta.content;
    if (!isSkeleton(content)) return;
    const notes = skeletonPreviewNotes(content, BPB);
    if (!notes.length) return;
    lastPartRef.current = null;
    setGenBusy(true);
    try {
      const bars = await api.music<{ bar: number; start: number; candidates: { root: number; quality: string; score: number }[] }[]>(
        "harmonize",
        { melody: notes, key: keyPc, mode: secModeOf(), barBeats: BPB },
      );
      const chords = (bars ?? [])
        .filter((bar) => bar.candidates?.length)
        .map((bar) => ({ root: bar.candidates[0]!.root, quality: bar.candidates[0]!.quality, start: bar.start, dur: BPB }));
      if (chords.length) setSingleCand({ kind: "chord_progression", content: { chords } });
    } finally {
      setGenBusy(false);
    }
  }
  // メロレーンの（最初の）メロ notes＝ハモリ/fit の入力。
  function melodyLaneNotes(): Note[] {
    const ml = lanes.find((l) => l.key === "melody")!;
    const c = ctx.laneChildren(ml)[0];
    return c ? notesForContent("melody", c.node.neta.content) : [];
  }
  const isMinor = (neta.mode ?? "").toLowerCase().includes("min");
  // ハモリ（上/下＝並行第2声部・調内平行3度・決定的）。候補→メロレーンに置く（原メロと重なって鳴る）。
  function makeHarmony(degSteps: number) {
    const mel = melodyLaneNotes();
    if (!mel.length) return;
    lastPartRef.current = null; // 決定的＝別案なし
    setSingleCand({ kind: "melody", content: { notes: harmonyVoice(mel, keyPc, isMinor, degSteps) } });
  }
  // コードに合わせる（fit_to_chords）：メロの各音を近いコードトーンへ寄せた候補。
  async function fitToChords() {
    const mel = melodyLaneNotes();
    const chords = ctx.sectionChords();
    if (!mel.length || !chords.length || genBusy) return;
    setGenBusy(true);
    try {
      const r = await api.music<{ notes: Note[] }>("fit_to_chords", { melody: mel, chords, key: keyPc });
      lastPartRef.current = null;
      if (r.notes?.length) setSingleCand({ kind: "melody", content: { notes: r.notes } });
    } finally {
      setGenBusy(false);
    }
  }
  // 噛み合い診断（analyze_fit・読むだけ）：メロ×コードの当てはまりを一言で。
  const [fitReport, setFitReport] = useState<string | null>(null);
  async function analyzeFit() {
    const mel = melodyLaneNotes();
    const chords = ctx.sectionChords();
    if (!mel.length || !chords.length) return;
    const r = await api.music<{ score: number; inChordRate: number; issues?: { msg: string }[] }>(
      "analyze_fit",
      { melody: mel, chords, key: keyPc },
    );
    setFitReport(fitReportText(r));
  }
  // 候補を追加（生成/別案は同種を積む・別種は入れ替え）／単発（ハモリ・崩し）は1件で置換。
  const pushCand = (c: { kind: string; content: unknown; skeletonNetaId?: string; meta?: CandMeta }) =>
    setCands((prev) => { if (prev.length && prev[0]!.kind !== c.kind) { setKeptCids(new Set()); return [{ ...c, cid: candId.current++ }]; } return [...prev, { ...c, cid: candId.current++ }]; });
  const setSingleCand = (c: { kind: string; content: unknown }) => { setKeptCids(new Set()); setCands([{ ...c, cid: candId.current++ }]); }; // 別種入替＝keep掃除（監査F4）
  const toggleKeep = (cid: number) => setKeptCids((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const removeCand = (cid: number) => { setCands((prev) => prev.filter((c) => c.cid !== cid)); setKeptCids((prev) => { const n = new Set(prev); n.delete(cid); return n; }); };
  async function auditionCandidate(c: Cand) {
    candPlay.current?.stop();
    const ns = notesForContent(c.kind, c.content);
    if (ns.length) candPlay.current = await playNotes(ns, tempo, { program: ctx.progForKind(c.kind) });
  }
  async function placeCandidate(c: Cand) {
    candPlay.current?.stop();
    const lane = ctx.laneOf(c.kind);
    const created = await api.createNeta({
      kind: c.kind,
      title: `${liveTitle || "曲"} ${lane?.label ?? c.kind}`,
      content: c.content,
      key: keyPc,
      // 2026-07-08 耳FB：mode を宣言（placementLanding の前提）。旧: 未宣言でmajor既定→短調メロが配置で+3移調＝濁りの主因。
      mode: secModeOf(),
      tempo,
      meter: liveMeter,
      tags: neta.tags,
    });
    // 再生成メロ＝置換：同レーンで新メロ(位置0)と尺が重なる既存子を先に外す＝二重化を防ぐ。
    if (lane) {
      const dur = ctx.contentDur(c.kind, c.content);
      for (const ch of ctx.laneChildren(lane)) {
        if (spanOverlaps(0, dur, ch.position, ctx.childDur(ch))) await api.removeChild(neta.id, ch.node.neta.id, ch.position);
      }
    }
    await api.placeChild(neta.id, created.id, 0, lane?.row ?? 0);
    // 骨格から吹いたメロ/ベース＝realized_from(表面→骨格) を張る（design #20 S2/S3c）。候補が自分の骨格idを持つ。
    if (c.skeletonNetaId && (c.kind === "melody" || c.kind === "bass")) await api.link(created.id, c.skeletonNetaId, "realized_from").catch(() => {});
    removeCand(c.cid); // 置いた候補はトレイから外す（他候補・keepは残す）
    await ctx.reload();
    ctx.onChanged?.();
  }
  function closeCandidate() {
    candPlay.current?.stop();
    setCands([]);
    setKeptCids(new Set());
  }

  return {
    // 候補トレイ状態
    cands, keptCids, genBusy,
    // ノブ状態＋setter（JSX が select/segRow/sliderRow で直に使う）
    density, setDensity, swing, setSwing, expression, setExpression, runs, setRuns, push, setPush,
    foreground, setForeground, breathe, setBreathe, humanize, setHumanize, hook, setHook,
    articulation, setArticulation, flow, setFlow, pickup, setPickup,
    phrasing, setPhrasing, form, setForm, counter, setCounter, finest, setFinest,
    rhythmParts, toggleRhythmPart, // リズムパーツ層 L1（design #20 S4-1）
    detailsOpen, setDetailsOpen, preset, setPreset,
    // プリセット/サイコロ/描画ヘルパ
    applyPreset, rollDice, segRow, sliderRow,
    // ハンドラ
    genPart, genSkeleton, blowSkeleton, blowSkeletonBass, estimateChords,
    melodyLaneNotes, makeHarmony, fitToChords, analyzeFit, fitReport, setFitReport,
    auditionCandidate, placeCandidate, closeCandidate, toggleKeep, removeCand,
    lastPartRef,
  };
}
