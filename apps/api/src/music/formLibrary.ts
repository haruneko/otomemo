// 構成型辞書＋構成候補の提案（WP-X1 スライス1）。純データ＋純関数。
// 正典＝docs/research/2026-07-14-song-form-statistics.md（構成型辞書 §5-A・提案アルゴリズム §5-B）。
// 思想＝「機械は候補まで・仕上げは人間」＝ここは構成候補を**提案するだけ**（自動適用しない）。
// 役割コード（doc §5-A）：I=intro, A=verse, A'=verse_var, B=prechorus(Bメロ),
//   C=chorus(サビ), PC=postchorus, Br=bridge(Cメロ), Inst=interlude(間奏),
//   DC=drop_chorus(落ちサビ), LC=last_chorus(大サビ), O=outro。
// energyPlan.ts と役割語彙を共有する（落ちサビ/大サビを chorus と区別＝エネルギー設計が別扱いになる）。

export type FormRole =
  | "intro" | "verse" | "verse_var" | "prechorus" | "chorus"
  | "postchorus" | "bridge" | "interlude" | "drop_chorus" | "last_chorus" | "outro";

// ジャンル/年代文脈（doc §5-B genre_context）。
export type FormContext =
  | "jpop" | "vocaloid" | "anime_tv" | "western_pop" | "ballad" | "game_loop" | "oldies";

export interface FormSection { role: FormRole; bars: number }

export interface FormType {
  id: string; // F01..F14
  name: string; // 日本語名
  context: FormContext; // 主たるジャンル/年代文脈
  sections: FormSection[]; // 役割列（既定小節）
  hasPrechorus: boolean; // Bメロ（prechorus）を含むか＝トグルの判定材料
  hasPostchorus: boolean; // ポストコーラスを含むか
  chorusFirst: boolean; // サビ頭（冒頭でサビ先出し）
}

const s = (role: FormRole, bars: number): FormSection => ({ role, bars });

// 構成型辞書（doc §5-A 表・F01..F14＝14型）。合計小節はセクション和で算出（totalBars）。
export const FORM_LIBRARY: FormType[] = [
  { id: "F01", name: "J-pop 黄金フル", context: "jpop", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",8), s("verse",8), s("verse_var",8), s("prechorus",8), s("chorus",16), s("interlude",8), s("verse",8), s("prechorus",8), s("chorus",16), s("bridge",8), s("drop_chorus",8), s("last_chorus",16), s("outro",8)] },
  { id: "F02", name: "J-pop 標準（A'省略）", context: "jpop", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",8), s("verse",8), s("prechorus",8), s("chorus",16), s("interlude",8), s("verse",8), s("prechorus",8), s("chorus",16), s("bridge",8), s("drop_chorus",8), s("last_chorus",16), s("outro",4)] },
  { id: "F03", name: "J-pop 短尺（B省略・間奏最小）", context: "jpop", hasPrechorus: false, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",4), s("verse",8), s("chorus",16), s("interlude",4), s("verse",8), s("chorus",16), s("bridge",8), s("last_chorus",16), s("outro",4)] },
  { id: "F04", name: "サビ頭", context: "jpop", hasPrechorus: true, hasPostchorus: false, chorusFirst: true,
    sections: [s("intro",2), s("chorus",8), s("verse",8), s("prechorus",8), s("chorus",16), s("interlude",4), s("verse",8), s("prechorus",8), s("chorus",16), s("drop_chorus",8), s("last_chorus",16), s("outro",4)] },
  { id: "F05", name: "ボカロ超短尺（イントロ無）", context: "vocaloid", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("verse",8), s("prechorus",8), s("chorus",16), s("verse",8), s("prechorus",8), s("chorus",16), s("bridge",8), s("last_chorus",16), s("outro",2)] },
  { id: "F06", name: "アニソン TVサイズ", context: "anime_tv", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",4), s("verse",8), s("prechorus",8), s("chorus",16), s("outro",2)] },
  { id: "F07", name: "洋楽 VC 標準（Bメロ無）", context: "western_pop", hasPrechorus: false, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",4), s("verse",8), s("chorus",8), s("verse",8), s("chorus",8), s("bridge",8), s("chorus",8), s("outro",4)] },
  { id: "F08", name: "洋楽 VPC（プリ有）", context: "western_pop", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",4), s("verse",8), s("prechorus",8), s("chorus",8), s("verse",8), s("prechorus",8), s("chorus",8), s("bridge",8), s("chorus",8), s("outro",4)] },
  { id: "F09", name: "洋楽 VC+ポストコーラス", context: "western_pop", hasPrechorus: true, hasPostchorus: true, chorusFirst: false,
    sections: [s("intro",2), s("verse",8), s("prechorus",8), s("chorus",8), s("postchorus",8), s("verse",8), s("prechorus",8), s("chorus",8), s("postchorus",8), s("bridge",8), s("chorus",8), s("postchorus",8), s("outro",2)] },
  { id: "F10", name: "AABA（オールドスタイル）", context: "oldies", hasPrechorus: false, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",4), s("verse",8), s("verse",8), s("bridge",8), s("verse",8), s("outro",4)] },
  { id: "F11", name: "AAA strophic", context: "oldies", hasPrechorus: false, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",4), s("verse",16), s("verse",16), s("verse",16), s("outro",4)] },
  { id: "F12", name: "ゲームループ（詳細は別doc・参照のみ）", context: "game_loop", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",8), s("verse",8), s("prechorus",8)] },
  { id: "F13", name: "落ちサビ強調型", context: "ballad", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",8), s("verse",8), s("prechorus",8), s("chorus",16), s("interlude",8), s("verse",8), s("prechorus",8), s("chorus",16), s("bridge",8), s("drop_chorus",16), s("last_chorus",16), s("outro",8)] },
  { id: "F14", name: "ダブルサビ（サビ2連）", context: "jpop", hasPrechorus: true, hasPostchorus: false, chorusFirst: false,
    sections: [s("intro",8), s("verse",8), s("prechorus",8), s("chorus",16), s("chorus",16), s("interlude",8), s("verse",8), s("prechorus",8), s("chorus",16), s("chorus",16), s("bridge",8), s("last_chorus",16), s("outro",8)] },
];

export const totalBars = (sections: FormSection[]): number => sections.reduce((a, x) => a + x.bars, 0);

// 拍/テンポ → 秒数（doc §5-B 概算：BPM120・4/4 で 1小節=2秒）。
function beatsPerBarOf(meter?: string): number {
  if (!meter) return 4;
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(meter.trim());
  if (!m) return 4;
  const num = Number(m[1]);
  return num > 0 && num <= 12 ? num : 4;
}
export function formSeconds(sections: FormSection[], opts?: { bpm?: number; meter?: string }): number {
  const bpm = opts?.bpm && opts.bpm > 0 ? opts.bpm : 120;
  const bpb = beatsPerBarOf(opts?.meter);
  return totalBars(sections) * bpb * (60 / bpm);
}

// 尺プリセット → 目標秒数（doc §0/§4・§5-B length_target）。custom は秒指定。
export type LengthTarget = "full" | "standard" | "short" | "tv_size" | "custom";
const TARGET_SECONDS: Record<Exclude<LengthTarget, "custom">, number> = {
  full: 270, standard: 210, short: 165, tv_size: 89,
};

// ジャンル文脈 → 候補型ID（doc §5-B 手順1・辞書引き）。
const CONTEXT_CANDIDATES: Record<FormContext, string[]> = {
  jpop: ["F02", "F01", "F04", "F13", "F14"],
  vocaloid: ["F05", "F03", "F02"],
  anime_tv: ["F06", "F02"],
  western_pop: ["F08", "F07", "F09"],
  ballad: ["F13", "F01"],
  game_loop: ["F12"],
  oldies: ["F10", "F11"],
};

// 尺超過時の削除優先順位（doc §5-B 手順2・短尺化の実証パターン 3-C に一致＝Inst>O>I>A'>B）。
const DELETE_PRIORITY: FormRole[] = ["interlude", "outro", "intro", "verse_var", "prechorus"];

export interface SuggestFormOpts {
  genre?: FormContext;
  lengthTarget?: LengthTarget;
  targetSeconds?: number; // custom 時の秒数
  hasPrechorus?: "on" | "off" | "auto"; // Bメロ トグル（doc §5-A 設計含意＝二値）
  chorusFirst?: boolean; // サビ頭
  postChorus?: boolean; // ポストコーラス
  bridge?: boolean; // 後半ドラマ（Cメロ/bridge）の有無。false で bridge を落とす
  bpm?: number;
  meter?: string;
  count?: number; // 返す候補数（既定4・doc §5-B 手順6＝3〜5案）
}

export interface FormCandidate {
  id: string;
  name: string;
  context: FormContext;
  sections: FormSection[];
  totalBars: number;
  seconds: number; // 概算尺（bpm/meter で算出）
  hasPrechorus: boolean;
  hasPostchorus: boolean;
  chorusFirst: boolean;
  withinTarget: boolean; // 目標尺の許容帯（±10%）に収まるか
  notes: string[]; // 変形の説明（削除/トグル反映など・提案の透明性）
}

function targetSecondsOf(opts: SuggestFormOpts): number | undefined {
  const lt = opts.lengthTarget;
  if (lt === "custom") return opts.targetSeconds && opts.targetSeconds > 0 ? opts.targetSeconds : undefined;
  if (lt && lt in TARGET_SECONDS) return TARGET_SECONDS[lt as Exclude<LengthTarget, "custom">];
  if (opts.targetSeconds && opts.targetSeconds > 0) return opts.targetSeconds;
  return undefined;
}

// 尺超過を削除優先順位で切り詰める（doc §5-B 手順2）。目標＋10%以内へ収まるまで1セクションずつ落とす。
// コア（verse/chorus/last_chorus/drop_chorus）は守り、DELETE_PRIORITY の役割のみ落とす。
function trimToTarget(sections: FormSection[], targetSec: number, bpm: number, meter: string, notes: string[]): FormSection[] {
  let cur = sections.slice();
  const cap = targetSec * 1.1;
  for (const role of DELETE_PRIORITY) {
    while (formSeconds(cur, { bpm, meter }) > cap) {
      const idx = cur.map((x, i) => (x.role === role ? i : -1)).filter((i) => i >= 0).pop();
      if (idx === undefined) break;
      cur = cur.slice(0, idx).concat(cur.slice(idx + 1));
      notes.push(`尺超過のため ${role} を1つ削除（Inst>O>I>A'>B の優先順）`);
    }
    if (formSeconds(cur, { bpm, meter }) <= cap) break;
  }
  return cur;
}

// Bメロ（prechorus）トグルを反映（doc §5-A 設計含意＝二値パラメータ）。
function applyPrechorusToggle(sections: FormSection[], toggle: "on" | "off" | "auto", ctx: FormContext, notes: string[]): FormSection[] {
  if (toggle === "off") {
    const had = sections.some((x) => x.role === "prechorus");
    if (had) notes.push("Bメロ（prechorus）を省略（has_prechorus=off）");
    return sections.filter((x) => x.role !== "prechorus");
  }
  // "on"/"auto"：辞書型が既に prechorus を持っていればそのまま。持たない型に無理に足さない
  // （型の識別性を壊さない＝提案は辞書型の変形に留める）。
  return sections;
}

/** 条件（ジャンル/目標尺/Bメロ有無/ポストコーラス/サビ頭/bridge）→ 構成候補 N個。
 *  **提案のみ＝自動適用しない**（doc §5-B）。返りは役割列＋小節数＋概算尺。 */
export function suggestForm(opts: SuggestFormOpts = {}): FormCandidate[] {
  const bpm = opts.bpm && opts.bpm > 0 ? opts.bpm : 120;
  const meter = opts.meter ?? "4/4";
  const count = Math.max(1, Math.min(8, opts.count ?? 4));
  const targetSec = targetSecondsOf(opts);
  const preToggle = opts.hasPrechorus ?? "auto";

  // 候補型の母集団：ジャンル指定があれば辞書引き、無ければ全型。
  const ids = opts.genre ? (CONTEXT_CANDIDATES[opts.genre] ?? []) : FORM_LIBRARY.map((f) => f.id);
  let pool = ids.map((id) => FORM_LIBRARY.find((f) => f.id === id)!).filter(Boolean);
  if (pool.length === 0) pool = FORM_LIBRARY.slice();

  // フラグでの絞り込み：サビ頭/ポストコーラス指定は、その特性を持つ型を優先（無ければ全型から補う）。
  if (opts.chorusFirst === true) {
    const cf = pool.filter((f) => f.chorusFirst);
    pool = cf.length ? cf : FORM_LIBRARY.filter((f) => f.chorusFirst);
  }
  if (opts.postChorus === true) {
    const pc = pool.filter((f) => f.hasPostchorus);
    pool = pc.length ? pc : FORM_LIBRARY.filter((f) => f.hasPostchorus);
  }

  const cands: FormCandidate[] = [];
  for (const f of pool) {
    const notes: string[] = [];
    let sections = f.sections.slice();

    // bridge=false で後半ドラマ（bridge）を落とす。
    if (opts.bridge === false && sections.some((x) => x.role === "bridge")) {
      sections = sections.filter((x) => x.role !== "bridge");
      notes.push("bridge（Cメロ/後半ドラマ）を省略（bridge=false）");
    }

    // Bメロ トグル反映。
    sections = applyPrechorusToggle(sections, preToggle, f.context, notes);

    // 目標尺があれば超過を削除優先順位で切り詰める。
    if (targetSec !== undefined) sections = trimToTarget(sections, targetSec, bpm, meter, notes);

    const seconds = formSeconds(sections, { bpm, meter });
    // 尺内＝目標＋10% を超えない（下回るのは可＝短い分には制約を満たす）。
    const withinTarget = targetSec === undefined ? true : seconds <= targetSec * 1.1 + 1e-6;

    cands.push({
      id: f.id, name: f.name, context: f.context,
      sections, totalBars: totalBars(sections), seconds,
      hasPrechorus: sections.some((x) => x.role === "prechorus"),
      hasPostchorus: sections.some((x) => x.role === "postchorus"),
      chorusFirst: f.chorusFirst,
      withinTarget, notes,
    });
  }

  // 目標尺があれば「尺内に収まる案だけ」を返す（切り詰めても収まらない型は落とす＝制約を満たす候補のみ提案）。
  // 目標との差が小さい順（尺目標に近い方が上位）。収まる案が皆無なら最も短い1案を返す（提案ゼロを避ける）。
  if (targetSec !== undefined) {
    const within = cands.filter((c) => c.withinTarget).sort((a, b) => Math.abs(a.seconds - targetSec) - Math.abs(b.seconds - targetSec));
    if (within.length > 0) return within.slice(0, count);
    return cands.sort((a, b) => a.seconds - b.seconds).slice(0, 1);
  }
  return cands.slice(0, count);
}
