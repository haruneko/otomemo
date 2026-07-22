import { useMemo, useRef, useState } from "react";
import { api, type Neta } from "./api";
import { Icon } from "./components/Icon";
import { fitReportText } from "./fitReport";
import { harmonyVoice } from "./harmony";
import {
  notesForContent,
  buildPlayback,
  skeletonPreviewNotes,
  isSkeleton,
  isRelativeBass,
  type Note,
  type PlaybackHandle,
} from "./music";
import { startPlayback } from "./playback";
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
  // WP-X3b/c：リフ(反復核)・管弦(ホーン/ストリングス)＝いずれもコード相手＝進行があるセクションでこの進行に生成。
  // counter(対旋律)は主メロ必須のため別UI（骨格ブロックの「対旋律を作る▶」）で露出済み＝ここには出さない。
  { label: "リフ", op: "gen_riff", needsChords: true },
  { label: "管弦", op: "gen_section_inst", needsChords: true },
  // コード進行そのものを生成（WP-C1・2026-07-14）＝旋法パレット(下の select)を試す入口。needsChords:false＝進行が無くても押せる。
  // ※ GEN_PARTS[0]=メロ/[1]=ベースは blowSkeleton から index 参照＝並びを崩さないため末尾に足す。
  { label: "コード", op: "gen_chords", needsChords: false },
  // コード楽器＝伴奏パターン（chord_pattern・スライスC「聴いて選ぶ」）。進行に解決する相対型＝needsChords:true。
  //   ジャンルchip→variety で別々の型を候補トレイへ（下 genPart の gen_chord_pattern 分岐）。末尾に足す（index 参照を崩さない）。
  { label: "コード楽器", op: "gen_chord_pattern", needsChords: true },
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
  { id: "backbeat", label: "裏打ち" },
];

export type ChordArg = { root?: number; quality?: string; start?: number; dur?: number };
export type DrumsPayload = { rhythm: { steps: number; bars: number; beatsPerStep: number; lanes: { name?: string; midi?: number; hits: number[]; vel?: number }[] } };
// 対位法レポート（design #20 S3d）：API が gen_melody/gen_bass 候補の meta に添付（読み取り専用・指摘のみ）。
export type VoiceLeadingReport = { score: number; parallelFifths: number; parallelOctaves: number; directFifths: number; directOctaves: number; voiceCrossings: number };
// 候補レンズ（design #12-M・WP-M3）：API が gen_melody 候補の meta に添付する3軸 headline スコア（全て高い=良い）。
export type MelodyLenses = { expectation: number; hook: number; singability: number };
export type CandMeta = { voiceLeading?: VoiceLeadingReport; voiceLeadingSummary?: string; lenses?: MelodyLenses };
export type Cand = { kind: string; content: unknown; cid: number; skeletonNetaId?: string; meta?: CandMeta; label?: string };

// コード楽器（chord_pattern）のジャンルchip（スライスC・モックCタブ）＝chordLibrary の genre と対応。
// おまかせ＝omakase 番兵（role/tempo 全体から）。値は genPart が body.pattern へ流す（型ID直指定は「細かく」select へ沈める）。
export const COMP_GENRE_CHIPS: { v: string; label: string }[] = [
  { v: "", label: "おまかせ" },
  { v: "ballad", label: "バラード" },
  { v: "rock", label: "ロック" },
  { v: "citypop", label: "シティポップ" },
  { v: "dance", label: "4つ打ち" },
  { v: "folk", label: "フォーク" },
];
// 型ID直指定（「細かく」select・前面に出さない）。chordLibrary の代表型（鍵盤/ギター）。
export const COMP_TYPE_IDS: { v: string; label: string }[] = [
  { v: "PB-WHOLE", label: "白玉(バラード)" },
  { v: "PB-ARP8", label: "8分アルペジオ" },
  { v: "CP-SYNC16", label: "裏食い(シティポップ)" },
  { v: "DN-OFFBEAT", label: "裏スタブ(4つ打ち)" },
  { v: "AN-VERSE", label: "8分刻み(アニソン)" },
  { v: "GT-FOLK8", label: "フォークストローク" },
  { v: "GT-DU8", label: "ダウンアップ8分" },
  { v: "GT-DOWN8", label: "オールダウン8分" },
  { v: "GT-FUNK16", label: "16カッティング" },
  { v: "GT-POWER16", label: "パワーコード刻み" },
];

// 候補トレイの並べ替え軸（design #12-M「候補レンズ」）。既定 ""＝生成順＝挿入順＝bit一致（審判にしない＝弾かず並べ替えるだけ）。
export type LensAxis = "" | "expectation" | "hook" | "singability";
export const LENS_AXES: { id: LensAxis; label: string }[] = [
  { id: "", label: "生成順" },
  { id: "expectation", label: "自然な流れ" },
  { id: "hook", label: "フック度" },
  { id: "singability", label: "歌いやすさ" },
];
// カード用スコアバッジ（レンズ未選択なら null＝非表示）。値は 0..1 を % 表示。
export function lensBadge(meta: CandMeta | undefined, axis: LensAxis): { text: string; label: string } | null {
  if (!axis) return null;
  const v = meta?.lenses?.[axis];
  if (typeof v !== "number") return null;
  const label = LENS_AXES.find((a) => a.id === axis)?.label ?? axis;
  return { text: `${Math.round(v * 100)}`, label };
}

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

// 骨格チップの分岐スタック「→吹いたメロ N」（design #20 S6・D4）：getRelations(骨格id) の出力から
// realized_from（表面→骨格）で相手が melody のものを数える＝この骨格から吹いた表面メロの在庫数。
// 吹き直すたびに新メロ neta＋realized_from が増える＝N が増える（骨格 content 不変・旧メロ不滅）ことの根拠。
// ベース（gen_bass の realized_from）は「メロ」でないので数えない（バッジ文言が「→吹いたメロ」のため）。
export function realizedMelodyCount(relations: { type: string; neta: { kind: string } | null }[]): number {
  return relations.filter((r) => r.type === "realized_from" && r.neta?.kind === "melody").length;
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
  // compose 辺操作の CoW ガード実行子（S3-a）。共有 section への候補「置く」を守る。未指定＝従来どおり原本へ。
  runEdgeOp?: (op: (targetId: string) => Promise<void>) => Promise<boolean>;
};

// 🎲 が振る11ノブ（design #23）。rollDice が同期計算した「振った後の値」を genPart へ override 渡しし、setState の stale を排す。
export type MelodyKnobs = { density: number; swing: number; expression: number; runs: number; push: number; foreground: number; breathe: number; hook: number; articulation: number; flow: number; pickup: number };

export function useMelodyGen(ctx: MelodyGenCtx) {
  const { neta, keyPc, tempo, liveMeter, liveTitle, BARS, BPB, lanes } = ctx;
  // P2（2026-07-10・UX再設計）：候補を単数→配列(トレイ)＝複数を並べて比較・keep。cid=React key＋keep追跡。
  const [cands, setCands] = useState<Cand[]>([]);
  // 候補レンズの並べ替え軸（design #12-M・WP-M3）。既定 ""＝生成順（挿入順＝bit一致）。
  const [lensAxis, setLensAxis] = useState<LensAxis>("");
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
  const [skelForm, setSkelForm] = useState<"" | "period" | "aaba" | "cadence-swap" | "sentence">(""); // 骨格のフォーム型回帰（gen_skeleton専用）空=従来/period=[4+4]/aaba=Aの回帰/cadence-swap・sentence=M9実測文法（design #12-M・WP-M2）
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
  // 声種プロファイル（WP-M4・design #16）：""=おまかせ(女性平均相当・従来bit一致)。vocaloid=ボカロモード(C6開放・難度ペナ無効)。
  const [voice, setVoice] = useState<"" | "female_pop" | "male_pop" | "mix" | "vocaloid">("");
  // 旋法パレット（WP-C1・2026-07-14）：mode の下の「色」。""=おまかせ(未送信＝従来 bit 一致)。frame.palette として
  // gen_chords(特徴和音♭VII/IV長)＋gen_melody/gen_bass/gen_skeleton(scalePcs 差替)へ流す＝旋法がトラック横断で追従。
  // ionian/aeolian は各 mode の既定スケール＝明示しても素の長/短（cadence:aeolian とは独立＝mode-usage-stats §4-1）。
  const [palette, setPalette] = useState<"" | "ionian" | "mixolydian" | "aeolian" | "dorian">("");
  // リズムパーツ層 L1（design #20 S4-1）：選択した partId 群（押した順＝rotate）。空＝未送信＝従来抽選(bit一致)。
  const [rhythmParts, setRhythmParts] = useState<string[]>([]);
  const toggleRhythmPart = (id: string) => { setRhythmParts((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); setPreset(""); };
  // ドラム定型ビート＋フィル（WP-D1・2026-07-14）：""=おまかせ(未送信＝従来 bit 一致)。style=型ID/ジャンル。
  // drumFill=0..1(0=OFF=未送信) or ビルドアップ型ID(build.*・WP-X4)＝密度倍加/vel漸増/末尾ギャップの遷移テンプレ。
  const [drumStyle, setDrumStyle] = useState<string>("");
  const [drumFill, setDrumFill] = useState<number | string>(0);
  // ベース語彙のジャンル型ライブラリ（WP-B1・2026-07-14）：""=おまかせ(未送信＝従来 bit 一致)。style=型ID/ジャンル、bassFill=0..1(0=OFF=未送信)。
  const [bassStyle, setBassStyle] = useState<string>("");
  const [bassFill, setBassFill] = useState<number>(0);
  // コード楽器（chord_pattern）の伴奏パターン型ライブラリ（スライスC「聴いて選ぶ」）：""=おまかせ(omakase＝role/tempo 全体から)。
  // ジャンル名(ballad/rock/citypop/dance/folk) or 型ID直指定。genPart(gen_chord_pattern) が variety と共に body.pattern へ流す。
  const [compStyle, setCompStyle] = useState<string>("");
  // ベース×ドラムノブ（奏法UIスライスD・design「gen_bass×ドラム結線」／slashBass）：UI未露出だった4ノブを「細かく（ドラム絡み）」群へ。
  // 全て 0/false＝未送信＝従来 bit 一致。kickLock/snareGap/approach はドラム在時のみ効く（API 挙動＝hint 文言で伝える）。
  const [bassKickLock, setBassKickLock] = useState<number>(0); // キックに噛む -1..1（負=逆相・キック裏8分）。0=OFF。
  const [bassSnareGap, setBassSnareGap] = useState<number>(0); // 2・4で抜く 0..1（スネア頭で音価を切る）。0=OFF。
  const [bassApproach, setBassApproach] = useState<number>(0); // 接近音 0..1（チェンジ直前を半音/全音接近）。0=OFF。
  const [bassSlash, setBassSlash] = useState<boolean>(false); // 分数の低音（chord.bass をアンカーに伝播）。false=OFF。
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
        {lock && <button type="button" className={"seg-lock" + (lockedKnobs.has(lock) ? " on" : "")} aria-label={`lock-${lock}`} aria-pressed={lockedKnobs.has(lock)} title="この値を固定してサイコロ" onClick={() => toggleLock(lock)}>{<Icon name={lockedKnobs.has(lock) ? "lock" : "unlock"} size={14} />}</button>}
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
      {lock && <button type="button" className={"seg-lock" + (lockedKnobs.has(lock) ? " on" : "")} aria-label={`lock-${lock}`} aria-pressed={lockedKnobs.has(lock)} title="この値を固定してサイコロ" onClick={(e) => { e.preventDefault(); toggleLock(lock); }}>{<Icon name={lockedKnobs.has(lock) ? "lock" : "unlock"} size={14} />}</button>}
    </label>
  );
  // 🎲（design #23）：ロックしていないノブを現在値±0.3で振り（当たりの周辺探索・0.1刻み・[0,1]）、
  // 振ってから即・再生成する＝押すたび「別の性格のメロ候補」がトレイに出る。ロックは乱択から守る（制御は生きる）。
  const rollDice = () => {
    // 乱択1回分。ロックは不変。乱択結果が現在値と同一なら最小刻み0.1を強制的に動かす（clamp端は内側へ）＝「必ず動く」。
    const j = (cur: number, key: string) => {
      if (lockedKnobs.has(key)) return cur;
      let n = Math.max(0, Math.min(1, Math.round((cur + (Math.random() * 0.6 - 0.3)) * 10) / 10));
      if (n === cur) n = cur >= 1 ? 0.9 : cur <= 0 ? 0.1 : Math.round((cur + (Math.random() < 0.5 ? -0.1 : 0.1)) * 10) / 10;
      return n;
    };
    // 現在値から新値を同期計算＝state と body の両方に同じ「振った後の値」を使う（setState 直後の stale を回避）。
    const rolled = {
      density: j(density, "density"), swing: j(swing, "swing"), runs: j(runs, "runs"), expression: j(expression, "expression"),
      push: j(push, "push"), hook: j(hook, "hook"), articulation: j(articulation, "articulation"), foreground: j(foreground, "foreground"),
      breathe: j(breathe, "breathe"), flow: j(flow, "flow"), pickup: j(pickup, "pickup"),
    };
    setDensity(rolled.density); setSwing(rolled.swing); setRuns(rolled.runs); setExpression(rolled.expression);
    setPush(rolled.push); setHook(rolled.hook); setArticulation(rolled.articulation); setForeground(rolled.foreground); setBreathe(rolled.breathe);
    setFlow(rolled.flow); setPickup(rolled.pickup);
    setPreset("");
    // 振った直後の値で gen_melody を走らせる（knobs override で stale を確実に排す）。
    void genPart(GEN_PARTS[0], { knobs: rolled });
  };
  const candPlay = useRef<PlaybackHandle | null>(null);
  // 直近の生成呼び出し（「🎲 もっと」で同条件再生成）。骨格から吹いた時は skeletonNetaId も保持し再現する。
  const lastPartRef = useRef<{ op: string; needsChords: boolean; label: string; skeletonNetaId?: string } | null>(null);
  // lastPartRef の有無を派生 state で公開（ref は再レンダしない）＝「もっと」ボタンの disabled 判定に使う（design #23）。
  const [hasLastPart, setHasLastPart] = useState(false);
  const setLastPart = (p: { op: string; needsChords: boolean; label: string; skeletonNetaId?: string } | null) => { lastPartRef.current = p; setHasLastPart(!!p); };

  const secModeOf = (): "major" | "minor" => ((neta.mode ?? "").toLowerCase().includes("min") ? "minor" : "major");

  async function genPart(part: { op: string; needsChords: boolean; label: string }, opts?: { skeletonNetaId?: string; append?: boolean; knobs?: MelodyKnobs }) {
    if (genBusy) return;
    setLastPart({ ...part, skeletonNetaId: opts?.skeletonNetaId });
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
      if (voice) frame.voice_profile = voice; // 声種プロファイル（WP-M4）：""=未送信＝従来 bit 一致。指定時のみ音域窓＋歌唱難度レンズが追従。
      if (palette) frame.palette = palette; // 旋法パレット（WP-C1）：""=未送信＝従来 bit 一致。gen_chords/melody/bass が frame.palette で追従。
      const body: Record<string, unknown> = {
        frame,
        chords,
        seed: Math.floor(Math.random() * 1e6), // 押すたび別案
      };
      if (part.op === "gen_melody") {
        // 🎲 からの生成は振った後の値（opts.knobs）を使う＝setState 直後の stale を排す（design #23）。無指定＝現在 state（bit一致）。
        const k = opts?.knobs;
        const kDensity = k?.density ?? density, kSwing = k?.swing ?? swing, kExpression = k?.expression ?? expression, kRuns = k?.runs ?? runs, kPush = k?.push ?? push;
        const kForeground = k?.foreground ?? foreground, kBreathe = k?.breathe ?? breathe, kHook = k?.hook ?? hook, kArticulation = k?.articulation ?? articulation, kFlow = k?.flow ?? flow, kPickup = k?.pickup ?? pickup;
        body.density = kDensity; body.swing = kSwing; body.expression = kExpression; body.runs = kRuns; body.push = kPush; body.foreground = kForeground; body.breathe = kBreathe; body.humanize = humanize; if (phrasing) body.phrasing = phrasing; if (form) body.form = form;
        // 骨格から吹く（design #20 S2）：骨格neta を注入＝構造線を共有し表面(リズム/装飾)だけ変える。
        if (opts?.skeletonNetaId) body.skeletonNetaId = opts.skeletonNetaId;
        // 対位バイアス（design「gen_melody×ベース結線」）：UI の「対位」を ON にした時だけ bass を渡し counter を送る。
        const bass = ctx.sectionBass();
        const counterVal = counter === "weak" ? 0.2 : counter === "mid" ? 0.4 : counter === "strong" ? 0.7 : 0;
        if (counterVal > 0 && bass.length) { body.bass = bass; body.counter = counterVal; }
        // 反復音モチーフ（design「動機保存レンダ」）：hook>0 で motifMode:preserve＋hook を送る。
        if (kHook > 0) { body.hook = kHook; body.motifMode = "preserve"; }
        if (kArticulation > 0) body.articulation = kArticulation;
        if (finest) body.finest = finest; // 最小音符（""=おまかせ＝未送信＝テンポ連動）
        // 句フレージング（2026-07-11）：flow=連結/長音・pickup=弱起。0＝未送信＝従来 bit一致。
        if (kFlow > 0) body.flow = kFlow;
        if (kPickup > 0) body.pickup = kPickup;
        // リズムパーツ層 L1（design #20 S4-1）：選択があれば rotate として送る＝小節にパーツを敷く。空＝未送信＝bit一致。
        if (rhythmParts.length) body.rhythmParts = { rotate: rhythmParts };
        // ドラム結線（design「gen_melody×ドラム結線」）：リズムレーンがあれば step 列を渡し backbeat=0.3。
        const drums = ctx.sectionDrums();
        if (drums) { body.drums = drums; body.backbeat = 0.3; }
      }
      // ドラム定型ビート＋フィル（WP-D1）：style/fill を送る。""/0＝未送信＝従来 bit 一致。
      if (part.op === "gen_drums") {
        if (drumStyle) body.style = drumStyle;
        // 数値=強度(0=OFF)／文字列=ビルドアップ型ID(build.*)。0/""=未送信＝従来 bit 一致。
        if (typeof drumFill === "number" ? drumFill > 0 : !!drumFill) body.fill = drumFill;
      }
      // ベース表面化（design #20 S3c）：骨格の明示ベース区間を gen_bass が差し替える（明示無し=root導出=従来）。
      if (part.op === "gen_bass" && opts?.skeletonNetaId) body.skeletonNetaId = opts.skeletonNetaId;
      // ベース定型型＋フィル（WP-B1）：style/fill を送る。""/0＝未送信＝従来 bit 一致。骨格表面化時は型を送らない（骨格が構造を担う）。
      if (part.op === "gen_bass" && !opts?.skeletonNetaId) {
        if (bassStyle) body.style = bassStyle;
        if (bassFill > 0) body.fill = bassFill;
        // ベース×ドラムノブ（スライスD）：0/false＝未送信＝bit一致。kickLock/snareGap/approach はドラム入力が要る＝
        // ドラム在時のみ drums を渡す（melody と同流儀・全係数0で drums 付きでも従来 bit 一致＝design 鉄則）。
        const bassDrums = ctx.sectionDrums();
        if (bassDrums && (bassKickLock !== 0 || bassSnareGap > 0 || bassApproach > 0)) body.drums = bassDrums;
        if (bassKickLock !== 0) body.kickLock = bassKickLock;
        if (bassSnareGap > 0) body.snareGap = bassSnareGap;
        if (bassApproach > 0) body.approach = bassApproach;
        if (bassSlash) body.slashBass = true;
      }
      // コード楽器＝伴奏パターン（chord_pattern・スライスC）：ジャンルchip(compStyle) を pattern へ、variety で別々の型を複数取る。
      //   ""＝おまかせ＝omakase 番兵（role/tempo 全体から）。型ID直指定は api 側で単数固定（compTypeById が真＝variety 無視）。
      if (part.op === "gen_chord_pattern") {
        body.pattern = compStyle || "omakase";
        body.variety = 4;
      }
      const r = await api.music<{ items: { kind: string; content: unknown; label?: string; meta?: CandMeta }[] }>(part.op, body);
      // コード楽器は複数候補を全件トレイへ積む（先頭＝kind差替 or append／以降＝append）。他パーツは従来どおり先頭1件。
      if (part.op === "gen_chord_pattern") {
        (r.items ?? []).forEach((it, i) => pushCand({ kind: it.kind, content: it.content, label: it.label, meta: it.meta }, (opts?.append ?? false) || i > 0));
      } else {
        const item = r.items?.[0];
        // 候補に骨格コンテキストを持たせる＝置く時に realized_from を張る相手が候補ごとに確定（ref の撒き漏れを排す）。
        // meta＝対位法レポート（design #20 S3d・指摘のみ）を候補へ運ぶ＝カードにバッジ表示。
        if (item) pushCand({ kind: item.kind, content: item.content, label: item.label, skeletonNetaId: opts?.skeletonNetaId, meta: item.meta }, opts?.append);
      }
    } finally {
      setGenBusy(false);
    }
  }
  // おまかせで一式（design #19 ⑥ §4）＝ドラム→ベース→メロ（コード無ければ先頭にコード）を順に候補へ積む。
  // 各パーツは現在の引き出し設定を使う（一式にも型/プリセット/旋法が効く）。新APIゼロ＝既存 genPart の直列呼びのみ。
  // append=true で候補を kind 別に保持（別kindでも置換せず積む）＝候補トレイはグループ見出しで並ぶ。置くかは全部人間。
  async function genSet() {
    if (genBusy) return;
    const chords = ctx.sectionChords();
    const by = (op: string) => GEN_PARTS.find((p) => p.op === op)!;
    // コードがあればドラム→ベース→メロ（track-wiring の依存順）。無ければ先頭にコード候補＋ドラム（コード相手が要る2本は次回に回す）。
    const seq = chords.length ? [by("gen_drums"), by("gen_bass"), by("gen_melody")] : [by("gen_chords"), by("gen_drums")];
    for (const part of seq) await genPart(part, { append: true });
  }
  // 骨格を生成（design #20 S2・いじる▾）：gen_skeleton→候補トレイ→＋置くで骨格レーンへ。破壊上書きしない。
  async function genSkeleton() {
    if (genBusy) return;
    setLastPart(null);
    setGenBusy(true);
    try {
      const r = await api.music<{ items: { kind: string; content: unknown }[] }>("gen_skeleton", {
        frame: { key: keyPc, meter: liveMeter, tempo, bars: BARS, mode: secModeOf(), ...(voice ? { voice_profile: voice } : {}), ...(palette ? { palette } : {}) }, // 声種（WP-M4）＝骨格の音域窓も追従／旋法（WP-C1）＝骨格の scalePcs も追従
        chords: ctx.sectionChords(),
        seed: Math.floor(Math.random() * 1e6),
        ...(skelForm ? { form: skelForm } : {}), // 構造の使い回し（period/aaba）＝空=従来
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
  // 骨格ブロック[対旋律を作る▶]（WP-X3a）：メロレーンの主メロを相手に gen_counter→counter候補トレイ→
  // ＋置くで counterレーンへ新 counter＋realized_from(骨格)。**主メロ必須**（間まに絡む第2声＝相手が要る）。
  async function blowSkeletonCounter(child: Child) {
    if (genBusy) return;
    const mel = melodyLaneNotes();
    if (!mel.length) { setFitReport("対旋律には主メロが要る（先にメロを作る/置く）"); return; }
    setLastPart(null);
    setGenBusy(true);
    try {
      const r = await api.music<{ items: { kind: string; content: unknown; meta?: CandMeta }[] }>("gen_counter", {
        frame: { key: keyPc, meter: liveMeter, tempo, bars: BARS, mode: secModeOf() },
        melody: mel,
        chords: ctx.sectionChords(),
        seed: Math.floor(Math.random() * 1e6), // 押すたび別案
      });
      const item = r.items?.[0];
      if (item) pushCand({ kind: item.kind, content: item.content, skeletonNetaId: child.node.neta.id, meta: item.meta });
    } finally {
      setGenBusy(false);
    }
  }
  // 骨格からコードを推定（design #20 S2・harmonize）：骨格の白玉→harmonize→chord_progression 候補→＋置くでコードレーンへ。
  async function estimateChords(child: Child) {
    if (genBusy) return;
    const content = child.node.neta.content;
    if (!isSkeleton(content)) return;
    const notes = skeletonPreviewNotes(content, BPB);
    if (!notes.length) return;
    setLastPart(null);
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
  // song-safe（監査FAIL#7）：lanesForKind("song") に melody レーンは無い＝`!` 断定は undefined.kinds で
  // React root ごと白画面クラッシュだった。無ければ空＝呼び出し元（ハモリ/fit/TinkerSheet の判定）は自然に畳まれる。
  function melodyLaneNotes(): Note[] {
    const ml = lanes.find((l) => l.key === "melody");
    if (!ml) return [];
    const c = ctx.laneChildren(ml)[0];
    return c ? notesForContent("melody", c.node.neta.content) : [];
  }
  const isMinor = (neta.mode ?? "").toLowerCase().includes("min");
  // ハモリ（上/下＝並行第2声部・調内平行3度・決定的）。候補→メロレーンに置く（原メロと重なって鳴る）。
  function makeHarmony(degSteps: number) {
    const mel = melodyLaneNotes();
    if (!mel.length) return;
    setLastPart(null); // 決定的＝別案なし
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
      setLastPart(null);
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
  // append=true（おまかせで一式・T5）＝別kindでも置換せず積む＝候補トレイを kind 別グループで保持。
  const pushCand = (c: { kind: string; content: unknown; skeletonNetaId?: string; meta?: CandMeta; label?: string }, append = false) =>
    setCands((prev) => { if (!append && prev.length && prev[0]!.kind !== c.kind) { setKeptCids(new Set()); return [{ ...c, cid: candId.current++ }]; } return [...prev, { ...c, cid: candId.current++ }]; });
  const setSingleCand = (c: { kind: string; content: unknown }) => { setKeptCids(new Set()); setCands([{ ...c, cid: candId.current++ }]); }; // 別種入替＝keep掃除（監査F4）
  const toggleKeep = (cid: number) => setKeptCids((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const removeCand = (cid: number) => { setCands((prev) => prev.filter((c) => c.cid !== cid)); setKeptCids((prev) => { const n = new Set(prev); n.delete(cid); return n; }); };
  async function auditionCandidate(c: Cand) {
    candPlay.current?.stop();
    // #27：解決層＋駆動層（peek＝待たない）。候補は sing 設定を持たない＝実質ドライ（jobs=[]）。音色は progForKind。
    const program = ctx.progForKind(c.kind);
    // コード楽器/管弦（chord_pattern/section_inst・スライスC）＝進行に解決する相対型＝セクションの進行/テンポ/音色で実音化。
    //   ctx 無し（従来）は空進行＝無音だった。resolveChordPattern の既存経路を通す（buildPlayback の tempo/program 結線を流用）。
    //   相対 bass（修理#3 決定⑥ R1）も同じ相対型＝セクション進行で試聴（帯 S7 で相対ネタが生まれ始める先回り）。絶対 bass は false のまま＝bit一致。
    const isRel = c.kind === "chord_pattern" || c.kind === "section_inst" || isRelativeBass(c.content);
    const chords = isRel ? ctx.sectionChords().map((ch) => ({ root: ch.root ?? 0, quality: ch.quality ?? "", start: ch.start ?? 0, dur: ch.dur ?? ctx.BPB })) : undefined;
    const ns = notesForContent(c.kind, c.content, isRel ? { key: keyPc, chords, tempo, program } : undefined);
    if (ns.length) candPlay.current = await startPlayback(buildPlayback({ kind: "notes", notes: ns, tempo, program }), { vocalMode: "peek" });
  }
  // position＝置くセクション内位置（拍）。既定 0＝従来（SectionEditor の呼び出しは引数無し＝bit一致）。
  // 骨格の机（D4）は焦点骨格の skelPosition を渡し、骨格が居る位置へ表面メロを置く（＝正しい配置）。
  async function placeCandidate(c: Cand, position = 0) {
    candPlay.current?.stop();
    const lane = ctx.laneOf(c.kind);
    // 巻き込み削除の確認（オーナー仕様 2026-07-15）：同レーンで尺が重なる既存配置を **無確認で消さない**。
    // 重なりがあれば confirm で「上書き（既存を外す）/ 置かない」を選ばせる。判定は createNeta より前＝
    // 「置かない」を選んだら何も作らない・何も外さない（副作用ゼロ）。position=0 固定呼びで別小節を巻き添えにする事故を防ぐ。
    const dur = ctx.contentDur(c.kind, c.content);
    const overlapping = lane
      ? ctx.laneChildren(lane).filter((ch) => spanOverlaps(position, dur, ch.position, ctx.childDur(ch)))
      : [];
    if (overlapping.length) {
      const names = overlapping.map((ch) => ch.node.neta.title || lane?.label || c.kind);
      const ok = window.confirm(`重なる既存配置 ${overlapping.length}件（${names.join("、")}）を外して置きますか？`);
      if (!ok) return; // 「置かない」＝何も変えない（createNeta もしない）
    }
    // 作成→置換→配置を1操作に＝CoW「やめる」で孤児ネタ/中途半端な外しを作らない。ガード時は分家 targetId へ（原本無傷）。
    const op = async (targetId: string) => {
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
      // 再生成メロ＝置換：尺が重なる既存子（confirm 済み）を外す＝二重化を防ぐ。重なり無し＝空ループ＝従来通り即配置。
      for (const ch of overlapping) await api.removeChild(targetId, ch.node.neta.id, ch.position);
      await api.placeChild(targetId, created.id, position, lane?.row ?? 0);
      // 骨格から吹いたメロ/ベース＝realized_from(表面→骨格) を張る（design #20 S2/S3c）。候補が自分の骨格idを持つ。
      if (c.skeletonNetaId && (c.kind === "melody" || c.kind === "bass" || c.kind === "counter")) await api.link(created.id, c.skeletonNetaId, "realized_from").catch(() => {});
    };
    if (ctx.runEdgeOp) {
      const ok = await ctx.runEdgeOp(op);
      if (!ok) return; // やめる＝何も作らない・外さない・置かない
    } else {
      await op(neta.id);
    }
    removeCand(c.cid); // 置いた候補はトレイから外す（他候補・keepは残す）
    await ctx.reload();
    ctx.onChanged?.();
  }
  function closeCandidate() {
    candPlay.current?.stop();
    setCands([]);
    setKeptCids(new Set());
  }
  // 候補トレイの表示順（design #12-M・WP-M3）：レンズ未選択＝生成順（挿入順＝bit一致）。選択時は
  // その軸の headline スコア降順（安定・レンズ値なし=末尾で挿入順維持）。**候補は弾かない**＝並べ替えのみ。
  const displayCands = useMemo(() => {
    if (!lensAxis) return cands;
    return cands
      .map((c, i) => ({ c, i, s: c.meta?.lenses?.[lensAxis] }))
      .sort((a, b) => {
        if (a.s == null && b.s == null) return a.i - b.i;
        if (a.s == null) return 1;
        if (b.s == null) return -1;
        return b.s - a.s || a.i - b.i;
      })
      .map((x) => x.c);
  }, [cands, lensAxis]);

  return {
    // 候補トレイ状態
    cands, displayCands, lensAxis, setLensAxis, keptCids, genBusy,
    // ノブ状態＋setter（JSX が select/segRow/sliderRow で直に使う）
    density, setDensity, swing, setSwing, expression, setExpression, runs, setRuns, push, setPush,
    foreground, setForeground, breathe, setBreathe, humanize, setHumanize, hook, setHook,
    articulation, setArticulation, flow, setFlow, pickup, setPickup,
    phrasing, setPhrasing, form, setForm, skelForm, setSkelForm, counter, setCounter, finest, setFinest, voice, setVoice, palette, setPalette,
    rhythmParts, toggleRhythmPart, // リズムパーツ層 L1（design #20 S4-1）
    drumStyle, setDrumStyle, drumFill, setDrumFill, // ドラム定型ビート＋フィル（WP-D1）
    bassStyle, setBassStyle, bassFill, setBassFill, // ベース定型型＋フィル（WP-B1）
    compStyle, setCompStyle, // コード楽器 伴奏パターン型（スライスC「聴いて選ぶ」）
    bassKickLock, setBassKickLock, bassSnareGap, setBassSnareGap, bassApproach, setBassApproach, bassSlash, setBassSlash, // ベース×ドラム「細かく」群（スライスD）
    detailsOpen, setDetailsOpen, preset, setPreset,
    // プリセット/サイコロ/描画ヘルパ
    applyPreset, rollDice, segRow, sliderRow,
    // ハンドラ
    genPart, genSet, genSkeleton, blowSkeleton, blowSkeletonBass, blowSkeletonCounter, estimateChords,
    melodyLaneNotes, makeHarmony, fitToChords, analyzeFit, fitReport, setFitReport,
    auditionCandidate, placeCandidate, closeCandidate, toggleKeep, removeCand,
    lastPartRef, hasLastPart, // hasLastPart＝「もっと」disabled 判定用の派生 state（design #23）
  };
}
