// ギター（M5・5a/5b/5c/5f）＝phrase_maker ギター gen2 の「リフ文法 → コード追従 → 譜のキックへの chug ロック」の移植。
// 正典＝計画 docs/drafts/2026-09-09-phrasemaker-port-master-plan.md §5-2 M5・§4-5・§6-1。
//
// 源流（読むだけ）：
//   5c リフ文法3型   ＝`experiments/guitar/gen2/riff.py:26-106`（power_chug / pedal_answer / gallop）
//   5b コード表      ＝`experiments/guitar/gen2/chords/chordtheory.py:37-70 _QUALITY`・`:104-131 parse_chord`
//   5b コード追従    ＝`experiments/guitar/gen2/chords/chordfollow.py:59-192`（build_skeleton / assign_pitches）
//   5a chug ロック   ＝`experiments/ensemble/ensemble.py:2675-2740`（_GTR_GATE / _lock_guitar_chug_to_sheet）
//
// **ベースの chord_follow（`chordFollow.ts`）とは別設計**（計画 §4-5「類似度 0.06」）＝混ぜない。
//   共通化したのは**コードトーン**だけ（otomemo の `QUALITY_INTERVALS`＝既に層Bとバイト一致を確認済みの SSOT）。
//   **スケールはギター独自の表を持つ**（m7=ドリアン等で層Bと違う＝耳で調律された表を楽器間で共有しない＝負の知識12）。
//   ギター表に無いクオリティ（maj9/7#9/69…）だけ層B（`chordFollow.scaleOffsets`）へ落とし、**そう告げる**（5f）。
//
// **撤去済みのアプローチ分岐は持ち込まない**：源流 `chordfollow.py:151-159`（`o["approach"]` の半音導音）は
//   `f2c3241` で到達不能になったまま残置されている（`build_skeleton` が常に approach=False を立てる）。
//   機械的に翻訳すると TS で復活するので、**翻訳前に落とした**＝ここには approach の分岐も `approach_to` も無い。
//   （計画 §4-5・§5-2 M5「翻訳前に落とす」。ベースの半音接近はギターでは「聞かない動き」＝負の知識7）
//
// **決定的**＝RNG・hash・時刻を使わない（源流も同じ＝py-parity でデータ一致）。
// **相対形のまま**＝ここは「どの step にどの形で鳴らすか」と「進行に当てたら何の音か」を分けて持つ。
//   api は前半（オンセット列＝ChordHit へ additive に載せる）だけを返し、音高は web の実音化が同じ関数で出す。

import { QUALITY_INTERVALS, canonicalQuality, normRoot } from "./index";
import { scaleOffsets } from "./chordFollow";

// ───────────────────────────── 5c リフ文法（役割注記つき） ─────────────────────────────

export type GtrKind = "accent" | "note" | "ghost" | "dead";
/** ヒット単位のボイシング（`ChordHit.voice` の語彙）。源流 `riff.py:24-26` MONO/POWER/POWER8。 */
export type GtrVoice = "mono" | "power" | "power8";
export const GTR_VOICE_OFFSETS: Readonly<Record<GtrVoice, readonly number[]>> = {
  mono: [0], power: [0, 7], power8: [0, 7, 12],
};
export function gtrVoiceOf(offsets: readonly number[]): GtrVoice {
  if (offsets.includes(12) && offsets.includes(7)) return "power8";
  if (offsets.includes(7)) return "power";
  return "mono";
}

/** 文法の1セル＝源流の6つ組 `(step, kind, deg, anchor, role, voicing)`。 */
export interface GtrCell {
  readonly step: number;
  readonly kind: GtrKind;
  /** ルートからの半音（リフ語彙＝ペンタ＋b5＋b7＋オクターブ） */
  readonly deg: number;
  /** 不可侵の頭（強拍＝コードトーンへ着地する） */
  readonly anchor: boolean;
  /**
   * 役割注記。**コード追従が読む情報**＝落とすと知識が消える（M3-3c と同じ理由で注記ごと運ぶ）。
   *   head/chord  ＝強拍の錨（ルート追従）
   *   chug/pedal  ＝刻み・ペダル（ルート追従）
   *   dead        ＝ブリッジミュートの空打ち（ルート追従・ghost/dead は不可侵）
   *   pickup/answer ＝単音の答句（リード＝強拍ならコードトーン・弱拍ならスケール音へ解決）
   *   blue/climb  ＝ブルーノート・半音クライム（リード扱い）
   */
  readonly role: string;
  readonly voicing: GtrVoice;
}

export interface GtrGrammar {
  readonly id: GuitarGrammarId;
  /** 日本語の説明（UI・MCP の選択肢に出す） */
  readonly label: string;
  /** 2小節（32 step）のオスティナート */
  readonly cells: readonly GtrCell[];
  /** 源流 `rock_guitar` の palm_gate（`ensemble.py:2755`）＝音価の締まり */
  readonly palmGate: number;
  readonly source: string;
}

const c = (step: number, kind: GtrKind, deg: number, anchor: boolean, role: string, voicing: GtrVoice): GtrCell =>
  ({ step, kind, deg, anchor, role, voicing });

// `riff.py:30-50 _POWER_CHUG`
const POWER_CHUG: GtrCell[] = [
  c(0, "accent", 0, true, "head", "power8"), c(2, "note", 0, false, "chug", "power"), c(3, "ghost", 0, false, "dead", "power"),
  c(4, "note", 0, false, "chug", "power"), c(6, "ghost", 0, false, "dead", "power"),
  c(8, "accent", 10, true, "chord", "power8"), c(10, "note", 10, false, "chug", "power"), c(11, "ghost", 10, false, "dead", "power"),
  c(12, "accent", 8, true, "chord", "power8"), c(14, "note", 8, false, "chug", "power"), c(15, "note", 7, false, "pickup", "mono"),
  c(16, "accent", 0, true, "head", "power8"), c(18, "note", 0, false, "chug", "power"), c(19, "ghost", 0, false, "dead", "power"),
  c(20, "note", 0, false, "chug", "power"), c(22, "ghost", 0, false, "dead", "power"),
  c(24, "accent", 0, true, "head", "power8"), c(26, "note", 10, false, "answer", "mono"), c(27, "ghost", 0, false, "dead", "power"),
  c(28, "note", 7, false, "answer", "mono"), c(30, "note", 3, false, "answer", "mono"),
];
// `riff.py:54-73 _PEDAL_ANSWER`
const PEDAL_ANSWER: GtrCell[] = [
  c(0, "accent", 0, true, "head", "mono"), c(2, "note", 0, false, "pedal", "mono"), c(3, "ghost", 0, false, "dead", "mono"),
  c(4, "note", 0, false, "pedal", "mono"), c(6, "note", 0, false, "pedal", "mono"),
  c(8, "accent", 0, true, "head", "mono"), c(10, "note", 0, false, "pedal", "mono"), c(12, "note", 0, false, "pedal", "mono"),
  c(14, "note", 7, false, "pickup", "mono"),
  c(16, "accent", 0, true, "head", "mono"), c(18, "note", 0, false, "pedal", "mono"), c(20, "note", 0, false, "pedal", "mono"),
  c(22, "note", 0, false, "pedal", "mono"),
  c(24, "accent", 0, true, "head", "mono"), c(26, "note", 12, false, "answer", "mono"), c(27, "ghost", 0, false, "dead", "mono"),
  c(28, "note", 10, false, "answer", "mono"), c(30, "note", 7, false, "answer", "mono"),
];
// `riff.py:76-93 _gallop()`＝生成関数だが出力は固定＝展開して置く（手続きは知識ではない・3c と同じ扱い）。
const GALLOP: GtrCell[] = (() => {
  const out: GtrCell[] = [];
  for (let beat = 0; beat < 8; beat++) {
    const base = beat * 4;
    const head = beat % 4 === 0;
    out.push(c(base, head ? "accent" : "note", 0, head, "head", "mono"));
    out.push(c(base + 2, "note", 0, false, "pedal", "mono"));
    out.push(c(base + 3, "note", 0, false, "pedal", "mono"));
  }
  const a = out.filter((o) => o.step !== 14 && o.step !== 15);
  a.push(c(14, "note", 7, false, "answer", "mono"), c(15, "note", 6, false, "blue", "mono"));
  const b = a.filter((o) => o.step !== 30 && o.step !== 31);
  b.push(c(30, "note", 10, false, "climb", "mono"), c(31, "note", 1, true, "climb", "mono"));
  return b.map((o, i) => [o, i] as const).sort((x, y) => (x[0].step - y[0].step) || (x[1] - y[1])).map(([o]) => o);
})();

export const GUITAR_GRAMMAR_IDS = ["power_chug", "pedal_answer", "gallop"] as const;
export type GuitarGrammarId = (typeof GUITAR_GRAMMAR_IDS)[number];

const SRC_RIFF = "phrase_maker experiments/guitar/gen2/riff.py";
export const GUITAR_GRAMMARS: Readonly<Record<GuitarGrammarId, GtrGrammar>> = {
  power_chug: { id: "power_chug", label: "パワーコードの刻み（i→bVII→bVI・ブリッジミュート＋単音の答え）", cells: POWER_CHUG, palmGate: 0.80, source: `${SRC_RIFF}:30-50` },
  pedal_answer: { id: "pedal_answer", label: "低音弦ペダル＋ペンタの答句", cells: PEDAL_ANSWER, palmGate: 0.85, source: `${SRC_RIFF}:54-73` },
  gallop: { id: "gallop", label: "ギャロップ（8分＋16分×2）＋ブルーノート＋半音クライム", cells: GALLOP, palmGate: 0.65, source: `${SRC_RIFF}:76-93` },
};
export function guitarGrammarById(id: string | null | undefined): GtrGrammar | null {
  return id != null && (GUITAR_GRAMMAR_IDS as readonly string[]).includes(id) ? GUITAR_GRAMMARS[id as GuitarGrammarId] : null;
}

// ───────────────────────────── 5b コード表（chordtheory） ─────────────────────────────

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NAT_MIN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10];
const WHOLE = [0, 2, 4, 6, 8, 10];
const MEL_MIN = [0, 2, 3, 5, 7, 9, 11];
const WH_DIM = [0, 2, 3, 5, 6, 8, 9, 11];
const HW_DIM = [0, 1, 3, 4, 6, 7, 9, 10];

/**
 * ギター表（`chordtheory.py:37-70`）＝**スケールと完全5度の有無だけ**。コードトーンは `QUALITY_INTERVALS` を正とする
 * （共通化・`tones` 列はその otomemo キー）。py-parity の `chordtheory.json`（32クオリティ×3ルート＋分数）で検算。
 */
interface GtrQualityRow { readonly tonesKey: string; readonly scale: readonly number[]; readonly p5: boolean }
const GTR_QUALITY: Readonly<Record<string, GtrQualityRow>> = {
  "": { tonesKey: "", scale: MAJOR, p5: true }, maj: { tonesKey: "", scale: MAJOR, p5: true }, M: { tonesKey: "", scale: MAJOR, p5: true },
  m: { tonesKey: "m", scale: NAT_MIN, p5: true }, min: { tonesKey: "m", scale: NAT_MIN, p5: true },
  dim: { tonesKey: "dim", scale: LOCRIAN, p5: false }, o: { tonesKey: "dim", scale: LOCRIAN, p5: false },
  aug: { tonesKey: "aug", scale: WHOLE, p5: false }, "+": { tonesKey: "aug", scale: WHOLE, p5: false },
  "7": { tonesKey: "7", scale: MIXO, p5: true },
  m7: { tonesKey: "m7", scale: DORIAN, p5: true }, min7: { tonesKey: "m7", scale: DORIAN, p5: true },
  maj7: { tonesKey: "maj7", scale: MAJOR, p5: true }, M7: { tonesKey: "maj7", scale: MAJOR, p5: true },
  mMaj7: { tonesKey: "mM7", scale: MEL_MIN, p5: true }, mM7: { tonesKey: "mM7", scale: MEL_MIN, p5: true },
  m7b5: { tonesKey: "m7b5", scale: LOCRIAN, p5: false },
  dim7: { tonesKey: "dim7", scale: WH_DIM, p5: false }, o7: { tonesKey: "dim7", scale: WH_DIM, p5: false },
  "6": { tonesKey: "6", scale: MAJOR, p5: true }, m6: { tonesKey: "m6", scale: DORIAN, p5: true },
  "9": { tonesKey: "9", scale: MIXO, p5: true }, m9: { tonesKey: "m9", scale: DORIAN, p5: true },
  "11": { tonesKey: "11", scale: MIXO, p5: true }, // ⚠ 長3度＋♮11 の衝突は源流どおり（本アーク外・backlog 済み）
  "13": { tonesKey: "13", scale: MIXO, p5: true },
  "7b9": { tonesKey: "7b9", scale: HW_DIM, p5: true },
  "7#5": { tonesKey: "aug7", scale: WHOLE, p5: false }, aug7: { tonesKey: "aug7", scale: WHOLE, p5: false },
  "7b5": { tonesKey: "7b5", scale: WHOLE, p5: false },
  sus2: { tonesKey: "sus2", scale: MAJOR, p5: true }, sus4: { tonesKey: "sus4", scale: MIXO, p5: true },
  add9: { tonesKey: "add9", scale: MAJOR, p5: true },
  "5": { tonesKey: "5", scale: NAT_MIN, p5: true }, power: { tonesKey: "5", scale: NAT_MIN, p5: true },
};
export const GTR_CHORDTHEORY_SOURCE = "phrase_maker experiments/guitar/gen2/chords/chordtheory.py:37-70 (_QUALITY) / :104-131 (parse_chord)";

/** 源流 `chordtheory.Chord`（絶対 pc 集合で持つ）。 */
export interface GtrChord {
  readonly rootPc: number;
  readonly quality: string;
  readonly tonePcs: ReadonlySet<number>;
  readonly scalePcs: ReadonlySet<number>;
  /** 低い根音（ペダル）＋7 がコードトーンか＝POWER の5度を鳴らしてよいか */
  readonly perfectFifth: boolean;
  readonly bassPc: number;
  readonly pedalPc: number;
  /** ギター表に無く層Bのスケールで代用した（5f の通知材料） */
  readonly fallback: "layerB" | "unknown" | null;
}

const n12 = (x: number): number => ((Math.trunc(x) % 12) + 12) % 12;

/** otomemo のコード（root/quality/bass）→ ギターのコード。源流 `parse_chord` の分数規則をそのまま持つ。 */
export function gtrChordOf(root: number | string, quality: string | null | undefined, bass?: number | null): GtrChord {
  const rootPc = normRoot(root);
  const q = quality ?? "";
  const row = GTR_QUALITY[q] ?? GTR_QUALITY[canonicalQuality(q)];
  let tones: readonly number[];
  let scale: readonly number[];
  let p5: boolean;
  let fallback: GtrChord["fallback"] = null;
  if (row) {
    tones = row.tonesKey === "5" ? [0, 7] : QUALITY_INTERVALS[row.tonesKey]!;
    scale = row.scale; p5 = row.p5;
  } else {
    // ギター表に無い＝層B（ベース chord_follow の教科書スケール）で代用（5f で告げる）。
    const known = QUALITY_INTERVALS[canonicalQuality(q)];
    tones = known ?? [0, 4, 7];
    scale = [...scaleOffsets(canonicalQuality(q), tones)];
    p5 = tones.some((t) => n12(t) === 7);
    fallback = known ? "layerB" : "unknown";
  }
  const tonePcs = new Set<number>(tones.map((i) => n12(rootPc + i)));
  const scalePcs = new Set<number>(scale.map((i) => n12(rootPc + i)));
  for (const t of tonePcs) scalePcs.add(t);
  let bassPc = rootPc, pedalPc = rootPc, perfectFifth = p5;
  if (bass != null) {
    bassPc = n12(bass); pedalPc = bassPc;
    tonePcs.add(bassPc); scalePcs.add(bassPc);
    perfectFifth = tonePcs.has(n12(bassPc + 7));
  }
  return { rootPc, quality: q, tonePcs, scalePcs, perfectFifth, bassPc, pedalPc, fallback };
}

// ───────────────────────────── 5b コード追従（chordfollow） ─────────────────────────────

/** ギターの低域窓（源流 `theory.py:28 REG_LO, REG_HI`）＝低 E（6弦開放 40）〜リード上限 76。 */
export const GTR_REG_LO = 40;
export const GTR_REG_HI = 76;
const E_PC = 4;
const ROOT_ROLES = new Set(["head", "pedal", "chug", "chord", "dead"]);
/** 源流 `ensemble.py:2675 _GTR_GATE`（= `chordfollow.py:89` の写し）＝kind ごとの音価の締まり。 */
export const GTR_GATE: Readonly<Record<GtrKind, number>> = { accent: 0.92, note: 0.85, ghost: 0.42, dead: 0.35 };
/** 源流 `rock_guitar` の velmap（`ensemble.py:2800`）。 */
export const GTR_VEL: Readonly<Record<GtrKind, number>> = { accent: 104, note: 88, ghost: 46, dead: 38 };

/** 源流 `theory.root_low`＝pc を 40..51 へ（E/A ルートは開放弦に落ちる）。 */
export function gtrRootLow(pc: number): number {
  return GTR_REG_LO + n12(pc - E_PC);
}

/** 骨（リズムと役割）の1オンセット。**音高を持たない**＝相対形。 */
export interface GtrOnset {
  step: number;
  kind: GtrKind;
  anchor: boolean;
  role: string;
  deg: number;
  voicing: GtrVoice;
  strong: boolean;
  /** 音価（step 数・丸めなし）。源流の秒＝max(0.05, durSteps × step 秒) */
  durSteps: number;
}

/**
 * 源流 `build_skeleton`（`chordfollow.py:59-104`）＝文法を総 step 数へタイル張り。
 * `totalSteps` は**呼び手が決める**（源流はコード数から小節へ切り上げ・otomemo はセクション長）。
 * コード区間の添字は持たない（音高は `assignGuitarPitches` が step からコードを引く）。
 */
export function buildGuitarSkeleton(grammar: GtrGrammar, totalSteps: number): GtrOnset[] {
  const pat = grammar.cells.map((x, i) => [x, i] as const).sort((a, b) => (a[0].step - b[0].step) || (a[1] - b[1])).map(([x]) => x);
  const grammarSteps = 32;
  const nTiles = Math.ceil(totalSteps / grammarSteps);
  const rows: { g: number; cell: GtrCell }[] = [];
  for (let t = 0; t < nTiles; t++) {
    for (const cell of pat) {
      const g = t * grammarSteps + cell.step;
      if (g >= totalSteps) continue;
      rows.push({ g, cell });
    }
  }
  // 源流 `rows.sort(key=gstep)`＝タイル順に積んでいるので既に昇順（安定）。
  return rows.map((r, i) => {
    const nxt = i + 1 < rows.length ? rows[i + 1]!.g : totalSteps;
    const gap = nxt - r.g;
    return {
      step: r.g, kind: r.cell.kind, anchor: r.cell.anchor, role: r.cell.role, deg: r.cell.deg, voicing: r.cell.voicing,
      strong: r.cell.anchor || r.cell.kind === "accent" || r.g % 4 === 0,
      durSteps: gap * GTR_GATE[r.cell.kind] * grammar.palmGate,
    };
  });
}

// ───────────────────────────── 5a 譜のキックへの chug ロック ─────────────────────────────

export interface GtrLockOpts {
  totalSteps: number;
  /** 1小節内のキック step（16分・0..15）。空なら源流の fallback [0,4,8,12] */
  kick: readonly number[];
  /** アクセント step。otomemo のドラム content は kick/snare のみ＝常に空（M3 の決定2を引き継ぐ） */
  accents?: readonly number[];
  palmGate: number;
}

export interface GtrLockReport {
  /** 錨を置くべきキック step（総数） */
  kickSteps: number;
  /** (a) 既に POWER 形＝昇格のみ */
  promoted: number;
  /** (b) MONO/リード＝ロックが勝って POWER8 へ上書き（ヒット単位のボイシング切替） */
  overwritten: number;
  /** (c) 休符 step＝POWER8 の chug を新規挿入 */
  inserted: number;
}

/**
 * 源流 `_lock_guitar_chug_to_sheet`（`ensemble.py:2678-2740`）。**入力は破壊しない**。
 * 3分岐＝(a) 既存 POWER 形は昇格のみ (b) 既存 MONO はロックが勝ち POWER8 へ（**ヒット単位のボイシング切替**）
 * (c) 休符 step は POWER8 を挿入。そのあと**アクセント権限を譜の accents に一本化**（ghost/dead は不可侵）→ step 順へ
 * 並べ直し → 全オンセットの音価を `_GTR_GATE` で計算し直す。
 */
export function lockGuitarChugToSheet(body: readonly GtrOnset[], opts: GtrLockOpts): { onsets: GtrOnset[]; report: GtrLockReport } {
  const total = opts.totalSteps;
  const nBars = Math.floor(total / 16);
  const kickSorted = [...new Set(opts.kick)].sort((a, b) => a - b);
  const K = kickSorted.length > 0 ? kickSorted : [0, 4, 8, 12];
  const onsets: GtrOnset[] = body.map((o) => ({ ...o }));
  const byStep = new Map<number, GtrOnset>();
  for (const o of onsets) byStep.set(o.step, o); // 源流 dict＝後勝ち・ループ前に1回（挿入は見えない）
  const rep: GtrLockReport = { kickSteps: 0, promoted: 0, overwritten: 0, inserted: 0 };
  for (let bar = 0; bar < nBars; bar++) {
    for (const k of K) {
      const g = bar * 16 + k;
      if (g >= total) continue;
      rep.kickSteps++;
      const o = byStep.get(g);
      if (o) {
        if (o.voicing === "power" || o.voicing === "power8") {
          o.role = "chug"; o.anchor = true; // (a)
          rep.promoted++;
        } else {
          o.voicing = "power8"; o.deg = 0; o.role = "chug"; o.anchor = true; o.strong = true; // (b)
          rep.overwritten++;
        }
      } else {
        onsets.push({ step: g, kind: "note", anchor: true, role: "chug", deg: 0, voicing: "power8", strong: true, durSteps: 0 }); // (c)
        rep.inserted++;
      }
    }
  }
  const acc = new Set(opts.accents ?? []);
  for (const o of onsets) {
    if (o.kind === "ghost" || o.kind === "dead") continue;
    o.kind = acc.has(o.step % 16) ? "accent" : "note";
  }
  const sorted = onsets.map((o, i) => [o, i] as const).sort((a, b) => (a[0].step - b[0].step) || (a[1] - b[1])).map(([o]) => o);
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]!;
    const nxt = i + 1 < sorted.length ? sorted[i + 1]!.step : total;
    o.durSteps = (nxt - o.step) * GTR_GATE[o.kind] * opts.palmGate;
  }
  return { onsets: sorted, report: rep };
}

// ───────────────────────────── 5b 音高（assign_pitches・アプローチ分岐は落とした） ─────────────────────────────

function isWeakLead(o: GtrOnset): boolean {
  return !o.strong && !ROOT_ROLES.has(o.role) && o.voicing === "mono" && o.kind === "note";
}

/** 源流 `_snap`＝[lo,hi] で pc 集合に入る最寄り（同点は低い方）。 */
function snap(target: number, pcs: ReadonlySet<number>, lo = GTR_REG_LO, hi = GTR_REG_HI): number {
  let best: number | null = null, bestd = Infinity;
  for (let p = lo; p <= hi; p++) {
    if (pcs.has(n12(p))) { const d = Math.abs(p - target); if (d < bestd) { best = p; bestd = d; } }
  }
  return best ?? Math.max(lo, Math.min(hi, target));
}

/** 源流 `_snap_near`＝anchor±span の中で target に最寄りのスケール音（無ければ null）。 */
function snapNear(target: number, anchor: number, pcs: ReadonlySet<number>, span = 2): number | null {
  let best: number | null = null, bestd = Infinity;
  for (let p = Math.max(GTR_REG_LO, anchor - span); p <= Math.min(GTR_REG_HI, anchor + span); p++) {
    if (pcs.has(n12(p))) { const d = Math.abs(p - target); if (d < bestd) { best = p; bestd = d; } }
  }
  return best;
}

/** 源流 `_root_in_register`。 */
function rootInRegister(ch: GtrChord, near: number): number {
  const low = gtrRootLow(ch.pedalPc);
  if (near <= GTR_REG_LO + 14) return low;
  let p = low;
  while (p + 12 <= Math.min(GTR_REG_HI, near + 6)) p += 12;
  return p;
}

export interface GtrPitched {
  /** 低い根音（ボイシングの基準） */
  pitches: number[];
  /** 実際に鳴らす半音オフセット（dim/aug では POWER の5度を落とす） */
  voicings: number[][];
}

/**
 * 源流 `assign_pitches`（`chordfollow.py:144-192`）。**`o["approach"]` の分岐は持たない**（撤去済みを復活させない）。
 * pass1＝強拍・ルート追従・POWER 形／pass2＝弱拍リードを近い確定音へ段階的に解決（前方優先・循環で隣を探す）。
 */
export function assignGuitarPitches(onsets: readonly GtrOnset[], chordAt: (step: number) => GtrChord): GtrPitched {
  const n = onsets.length;
  const pitches: (number | null)[] = new Array(n).fill(null);
  const voics: number[][] = new Array(n).fill(null).map(() => [0]);
  for (let i = 0; i < n; i++) {
    const o = onsets[i]!;
    if (isWeakLead(o)) continue;
    const ch = chordAt(o.step);
    const target = gtrRootLow(ch.rootPc) + o.deg;
    let voic = [...GTR_VOICE_OFFSETS[o.voicing]];
    let p: number;
    if (o.voicing !== "mono") {
      p = gtrRootLow(ch.pedalPc); // POWER 形は常に低い錨でルート追従（形がフレットに収まる）
      if (!ch.perfectFifth) { voic = voic.filter((v) => v !== 7); if (voic.length === 0) voic = [0]; }
    } else if (ROOT_ROLES.has(o.role)) {
      p = rootInRegister(ch, target);
    } else {
      p = snap(target, ch.tonePcs);
    }
    pitches[i] = p; voics[i] = voic;
  }
  for (let i = 0; i < n; i++) {
    const o = onsets[i]!;
    if (!isWeakLead(o)) continue;
    const ch = chordAt(o.step);
    const target = gtrRootLow(ch.rootPc) + o.deg;
    let nf: number | null = null, pf: number | null = null;
    for (let j = 1; j < n; j++) { const v = pitches[(i + j) % n]; if (v != null) { nf = v; break; } }
    for (let j = 1; j < n; j++) { const v = pitches[(((i - j) % n) + n) % n]; if (v != null) { pf = v; break; } }
    let p: number | null = null;
    if (nf != null) p = snapNear(target, nf, ch.scalePcs);
    if (p == null && pf != null) p = snapNear(target, pf, ch.scalePcs);
    if (p == null) p = snap(target, ch.scalePcs);
    pitches[i] = p; voics[i] = [0];
  }
  return { pitches: pitches.map((p) => p ?? GTR_REG_LO), voicings: voics };
}

// ───────────────────────────── ChordHit への載せ方（相対形のまま） ─────────────────────────────

/** `ChordHit.riff`（additive）＝コード追従が読む注記。 */
export interface GtrHitRiff { kind: GtrKind; deg: number; role: string; anchor: boolean; strong: boolean }
export interface GtrHit { step: number; dur: number; vel: number; voice: GtrVoice; riff: GtrHitRiff }

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** `velOverride`＝kind ごとの vel の差し替え（2026-09-15 裁定「つまみで選ぶ」＝ghost の強さ）。未指定＝源流の velmap。 */
export function gtrOnsetsToHits(onsets: readonly GtrOnset[], velOverride?: Partial<Record<GtrKind, number>>): GtrHit[] {
  return onsets.map((o) => ({
    step: o.step, dur: r3(o.durSteps), vel: velOverride?.[o.kind] ?? GTR_VEL[o.kind], voice: o.voicing,
    riff: { kind: o.kind, deg: o.deg, role: o.role, anchor: o.anchor, strong: o.strong },
  }));
}

/** ChordHit（web/api の content）→ 骨。riff 注記の無い hit は拾わない（手で足した hit は MONO のリードとして扱う）。 */
export function gtrHitsToOnsets(hits: readonly { step: number; dur: number; voice?: GtrVoice; riff?: Partial<GtrHitRiff> }[]): GtrOnset[] {
  return [...hits].sort((a, b) => a.step - b.step).map((h) => {
    const r = h.riff ?? {};
    const kind = (r.kind ?? "note") as GtrKind;
    return {
      step: h.step, kind, anchor: r.anchor === true, role: r.role ?? "answer", deg: typeof r.deg === "number" ? r.deg : 0,
      voicing: h.voice ?? "mono", strong: r.strong ?? (r.anchor === true || kind === "accent" || h.step % 4 === 0), durSteps: h.dur,
    };
  });
}
