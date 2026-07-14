// 感情語 → パラメータプリセット（WP-E1・2026-07-14）。純データ辞書＋純関数。
// 正典＝docs/research/2026-07-14-emotion-to-parameters.md（プリセット表17語 §5・入口=離散語/内部=V-A §1・
//   重要度序列 mode>tempo>register §1.3・混合感情=valence正負混合→層別逆符号＋2バリエーション §4・過信警告 §6）。
// 思想＝「機械は候補まで・仕上げは人間」＝ここは感情語を**実在ノブの推奨値へ翻訳して提案するだけ**（自動適用しない・過信警告を必ず添付）。
// energyPlan.ts / keyPlan.ts の流儀に揃える（純データ＋純関数＋実在ノブ名 allowlist＋「提案のみ」）。
// mode/palette は既存 SSOT を再利用（function.ts / theory.ts）＝enum の二重定義を避ける。
import type { Mode } from "./function";
import type { Palette } from "./theory";

// ── 実在ノブ名のホワイトリスト（存在しないノブ名を出さない・§スキーマ照合）。
// density/swing/expression/runs/foreground/flow/articulation = gen_melody(genMelody opts) の実ノブ。
// registerShift = genMelody opts / SECTION_PRESETS の実ノブ（MCP面では frame.section.role/energy 経由でも発火）。
// borrow/secondaryDom = gen_chords(genChords opts) の実ノブ。mode/palette/tempo は下の VariationCore に typed で持つ（0..1 でないため knobs 外）。
export const EMOTION_KNOBS = [
  "registerShift",
  "density",
  "swing",
  "expression",
  "articulation",
  "flow",
  "runs",
  "foreground",
  "borrow",
  "secondaryDom",
] as const;
export type EmotionKnob = (typeof EMOTION_KNOBS)[number];

// 混合感情の1バリエーション＝実在ノブへ落ちる具体プリセット。
export interface EmotionVariation {
  label: string; // "標準" or 混合語の "陽寄り"/"陰寄り"（§4：混合は必ず2案）
  mode: Mode; // 最重要ノブ（§1.3 mode>tempo>register）
  palette: Palette; // mode の下の色（旋法パレット・Lydian/Phrygian/Locrian は近似先を note に明記）
  tempoBpm: [number, number]; // BPM 目安レンジ（第2ノブ）
  knobs: Partial<Record<EmotionKnob, number>>; // 連続ノブの推奨値（keys ⊆ EMOTION_KNOBS）
  note?: string; // 現行ノブで表しきれない和声語彙（sus/#11/減和音等）の近似注記
}

export interface EmotionPreset {
  word: string; // 正準日本語語
  aliases: string[]; // 別表記・英語
  V: number; // valence −1..+1（混合は主寄りの近似スカラー・§4）
  A: number; // arousal 0..1
  mix: boolean; // 正負混合フラグ（true＝2バリエーション・§4）
  reason: string; // 一行根拠（§5表 なぜそうなるか列）
  variations: EmotionVariation[]; // mix=true→2案、それ以外→1案
}

// registerShift の目安（半音）：低=-4/中低=-2/中=0/中高=+2/高=+4（SECTION_PRESETS と同レンジ）。
const R_LOW = -4, R_MIDLOW = -2, R_MID = 0, R_MIDHI = 2, R_HI = 4;

// ── 17語プリセット（doc §5 表を純データ化）。混合4語（切ない/エモい/懐かしい/情熱）は2バリエーション。
export const EMOTION_PRESETS: EmotionPreset[] = [
  {
    word: "明るい", aliases: ["happy", "ハッピー", "楽しげ", "陽気"], V: 0.8, A: 0.7, mix: false,
    reason: "長調＋速＋高音域＋歯切れ＝Juslin/G&Lの幸福プロファイル一式",
    variations: [{
      label: "標準", mode: "major", palette: "ionian", tempoBpm: [120, 140],
      knobs: { registerShift: R_MIDHI, density: 0.6, swing: 0.1, articulation: 0.5, expression: 0.2, secondaryDom: 0.1 },
    }],
  },
  {
    word: "悲しい", aliases: ["sad", "哀しい", "かなしい", "切ない寄り"], V: -0.7, A: 0.25, mix: false,
    reason: "短調＋遅＋低音量legato＝悲しみの手がかり束、音数減で沈む",
    variations: [{
      label: "標準", mode: "minor", palette: "aeolian", tempoBpm: [60, 80],
      knobs: { registerShift: R_MIDLOW, density: 0.3, swing: 0, flow: 0.6, articulation: 0, expression: 0.4, borrow: 0.2 },
    }],
  },
  {
    word: "切ない", aliases: ["bittersweet", "せつない", "ほろ苦い"], V: -0.3, A: 0.45, mix: true,
    reason: "陰の和声に微かな陽（借用長）を挿し、下降で沈める＝混合の代表（valence正負が分離共存）",
    variations: [
      {
        label: "陰寄り", mode: "minor", palette: "aeolian", tempoBpm: [78, 88],
        knobs: { registerShift: R_MID, density: 0.3, swing: 0.05, flow: 0.6, expression: 0.5, borrow: 0.3 },
        note: "半音下降・分数コード・IV→iv は borrow で近似（下降バス自体は現ノブ非対応）",
      },
      {
        label: "陽寄り", mode: "minor", palette: "dorian", tempoBpm: [88, 96],
        knobs: { registerShift: R_MID, density: 0.4, swing: 0.1, flow: 0.5, expression: 0.4, borrow: 0.5, secondaryDom: 0.3 },
        note: "dorian(♮6)＋二次ドミナントで陰の中に一滴の陽＝前へ進む切なさ",
      },
    ],
  },
  {
    word: "エモい", aliases: ["emo", "エモ", "エモーショナル"], V: 0, A: 0.55, mix: true,
    reason: "懐かしさ(陽)と哀愁(陰)を同居＝nostalgia型bittersweet（王道4536/小室・分数・add9）",
    variations: [
      {
        label: "陽寄り", mode: "major", palette: "ionian", tempoBpm: [90, 110],
        knobs: { registerShift: R_MID, density: 0.5, swing: 0.1, flow: 0.4, expression: 0.5, secondaryDom: 0.4, borrow: 0.2 },
        note: "王道進行(4536)＋二次ドミナントの温かい懐古（add9は現ノブ非対応）",
      },
      {
        label: "陰寄り", mode: "minor", palette: "aeolian", tempoBpm: [85, 100],
        knobs: { registerShift: R_MID, density: 0.5, swing: 0.05, flow: 0.5, expression: 0.5, borrow: 0.5 },
        note: "短調基調＋借用で哀愁側へ",
      },
    ],
  },
  {
    word: "疾走感", aliases: ["疾走", "駆け抜ける", "スピード感", "エモロック"], V: 0.3, A: 0.85, mix: false,
    reason: "速テンポでarousal最大化＋短調の切なさ、テンポがvalenceを持ち上げ矛盾を推進へ",
    variations: [{
      label: "標準", mode: "minor", palette: "aeolian", tempoBpm: [150, 180],
      knobs: { registerShift: R_MIDHI, density: 0.8, swing: 0, articulation: 0.4, runs: 0.6, expression: 0.2, secondaryDom: 0.2 },
      note: "小室進行(vi-IV-V-I的)・循環は loop/名前付き進行で（本表はノブ推奨のみ）",
    }],
  },
  {
    word: "浮遊感", aliases: ["浮遊", "ふわふわ", "宙吊り", "アンビエント"], V: 0, A: 0.35, mix: false,
    reason: "キー外/非解決で調性の重力を抜く＝快でも不快でもない宙吊り",
    variations: [{
      label: "標準", mode: "major", palette: "dorian", tempoBpm: [80, 100],
      knobs: { registerShift: R_MIDHI, density: 0.35, swing: 0.05, flow: 0.5, expression: 0.3, borrow: 0.3 },
      note: "Lydian/sus2/sus4/add9・非解決は現ノブで表しきれず dorian＋borrow で近似（sus/非解決は要手作業）",
    }],
  },
  {
    word: "儚い", aliases: ["透明感", "はかない", "エーテル", "透明"], V: -0.1, A: 0.25, mix: false,
    reason: "高音域＋薄texture＋弱velocityで質量を消す",
    variations: [{
      label: "標準", mode: "major", palette: "ionian", tempoBpm: [66, 84],
      knobs: { registerShift: R_HI, density: 0.25, swing: 0, flow: 0.5, articulation: 0, expression: 0.2 },
      note: "開離ボイシング・空虚5度・add9はボイシング領域＝ノブ外（音域と密度で近似）",
    }],
  },
  {
    word: "懐かしい", aliases: ["ノスタルジー", "nostalgia", "郷愁", "なつかしい"], V: 0.1, A: 0.4, mix: true,
    reason: "bittersweet中核、長調の温かさに翳りを一滴（IV/iv交替・♭VII・6th）",
    variations: [
      {
        label: "陽寄り", mode: "major", palette: "ionian", tempoBpm: [80, 96],
        knobs: { registerShift: R_MID, density: 0.5, swing: 0.1, flow: 0.4, expression: 0.4, borrow: 0.3 },
        note: "長調の温かさ主体に借用で翳りを一滴",
      },
      {
        label: "陰寄り", mode: "major", palette: "mixolydian", tempoBpm: [76, 90],
        knobs: { registerShift: R_MID, density: 0.5, swing: 0.1, flow: 0.4, expression: 0.4, borrow: 0.5 },
        note: "mixolydian(♭VII)で翳りを強め＝郷愁側",
      },
    ],
  },
  {
    word: "怒り", aliases: ["攻撃的", "anger", "アグレッシブ", "激しい"], V: -0.5, A: 0.9, mix: false,
    reason: "大音量・速・鋭attack・不協和＝Juslin怒り＋緊張",
    variations: [{
      label: "標準", mode: "minor", palette: "aeolian", tempoBpm: [140, 180],
      knobs: { registerShift: R_MIDLOW, density: 0.8, swing: 0, articulation: 0.7, runs: 0.5, expression: 0.3, borrow: 0.4 },
      note: "Phrygian(♭II)/不協和/パワーコードは aeolian＋borrow で近似（Phrygian パレット未実装）",
    }],
  },
  {
    word: "恐れ", aliases: ["不安", "fear", "こわい", "サスペンス"], V: -0.6, A: 0.6, mix: false,
    reason: "不協和＝緊張＋リズム不規則＝予測不能で不安",
    variations: [{
      label: "標準", mode: "minor", palette: "aeolian", tempoBpm: [70, 110],
      knobs: { registerShift: R_LOW, density: 0.5, swing: 0, articulation: 0.6, expression: 0.6, borrow: 0.5, secondaryDom: 0.3 },
      note: "Locrian/減和音/トライトーン/不定調は現ノブで近似止まり（rubato/変動テンポは手動・aeolian＋強borrowで暫定）",
    }],
  },
  {
    word: "荘厳", aliases: ["崇高", "majestic", "壮大", "厳か"], V: 0.4, A: 0.5, mix: false,
    reason: "広register＋規則リズム＋豊かな響き＝wonder/power(GEMS)",
    variations: [{
      label: "標準", mode: "major", palette: "mixolydian", tempoBpm: [60, 80],
      knobs: { registerShift: R_MID, density: 0.5, swing: 0, flow: 0.6, articulation: 0.2, expression: 0.3, borrow: 0.2 },
      note: "広い音域(低〜高)は単一 registerShift で表せず＝レイヤ/オクターブ重ねは手作業。♭VII/ペダルは mixolydian で近似",
    }],
  },
  {
    word: "穏やか", aliases: ["安らぎ", "calm", "おだやか", "癒し", "tranquil"], V: 0.5, A: 0.2, mix: false,
    reason: "遅＋低arousal＋規則リズム＝tranquility、不協和を避ける",
    variations: [{
      label: "標準", mode: "major", palette: "ionian", tempoBpm: [60, 76],
      knobs: { registerShift: R_MID, density: 0.35, swing: 0.05, flow: 0.6, expression: 0.3, borrow: 0.2 },
      note: "順次進行・sus解決・7thの柔らかさはボイシング/進行寄り＝ノブは density低＋flowで近似",
    }],
  },
  {
    word: "高揚", aliases: ["楽しい", "アッパー", "ダンス", "ノリノリ", "uplifting"], V: 0.7, A: 0.8, mix: false,
    reason: "速＋長＋swingで運動性、幸福cueに躍動を追加",
    variations: [{
      label: "標準", mode: "major", palette: "ionian", tempoBpm: [124, 138],
      knobs: { registerShift: R_MIDHI, density: 0.7, swing: 0.35, articulation: 0.5, runs: 0.4, expression: 0.3, secondaryDom: 0.2 },
    }],
  },
  {
    word: "クール", aliases: ["都会的", "cool", "シティ", "洗練", "アダルト"], V: 0.1, A: 0.5, mix: false,
    reason: "テンション豊かで解決を急がない＝洗練、valence中立で醒めた質感",
    variations: [{
      label: "標準", mode: "major", palette: "dorian", tempoBpm: [90, 115],
      knobs: { registerShift: R_MID, density: 0.5, swing: 0.25, flow: 0.4, expression: 0.4, borrow: 0.3, secondaryDom: 0.3 },
      note: "m7/M7/9th の洗練テンションはボイシング＝ノブ外（citypop genre や borrow/secondaryDom で近似）",
    }],
  },
  {
    word: "情熱", aliases: ["ドラマチック", "passionate", "熱い", "ドラマティック"], V: 0.2, A: 0.75, mix: true,
    reason: "覚醒高＋和声の起伏で振幅、緊張と解決を大きく取る（二次ドミナント・借用・転調）",
    variations: [
      {
        label: "陰寄り（貯め）", mode: "minor", palette: "aeolian", tempoBpm: [100, 120],
        knobs: { registerShift: R_MID, density: 0.6, swing: 0, flow: 0.4, expression: 0.6, borrow: 0.5, secondaryDom: 0.3 },
        note: "短調で緊張を貯める側。短→長の転調は suggest_key_plan/gen_chords transition で",
      },
      {
        label: "陽寄り（放出）", mode: "major", palette: "ionian", tempoBpm: [110, 130],
        knobs: { registerShift: R_MIDHI, density: 0.65, swing: 0, flow: 0.4, expression: 0.5, secondaryDom: 0.5, borrow: 0.3 },
        note: "長調へ解放する側＝ドラマの頂点。二次ドミナントで牽引",
      },
    ],
  },
  {
    word: "決意", aliases: ["前向き", "determined", "力強い", "ポジティブ", "アンセム"], V: 0.6, A: 0.65, mix: false,
    reason: "上行と明確な解決＝valence正・中高arousal、迷いの無い規則リズム",
    variations: [{
      label: "標準", mode: "major", palette: "mixolydian", tempoBpm: [110, 132],
      knobs: { registerShift: R_MID, density: 0.5, swing: 0.1, flow: 0.5, articulation: 0.3, expression: 0.3, secondaryDom: 0.2 },
      note: "IV-V-I/sus4→解決/上行は進行寄り＝mixolydian＋明確な解決で近似",
    }],
  },
  {
    word: "幻想的", aliases: ["dreamy", "ドリーミー", "夢幻", "ファンタジー"], V: 0.2, A: 0.35, mix: false,
    reason: "Lydianの#4で非日常の明るさ、非解決で夢の宙吊り",
    variations: [{
      label: "標準", mode: "major", palette: "dorian", tempoBpm: [80, 104],
      knobs: { registerShift: R_HI, density: 0.5, swing: 0.05, flow: 0.5, expression: 0.4, borrow: 0.3 },
      note: "Lydian(#11)/非機能進行/分数は現ノブで表しきれず dorian＋高音域で近似（#4 は要手作業）",
    }],
  },
];

// ── 語の正規化＆索引（別表記・英語・空白/記号ゆれを吸収）。
function normWord(w: string): string {
  return w.trim().toLowerCase().replace(/[\s_\-　]+/g, "");
}
const WORD_INDEX: Map<string, EmotionPreset> = (() => {
  const m = new Map<string, EmotionPreset>();
  for (const p of EMOTION_PRESETS) {
    m.set(normWord(p.word), p);
    for (const a of p.aliases) m.set(normWord(a), p);
  }
  return m;
})();

// ── 過信警告（doc §6 を一言＋要点箇条書きで必ず添付）。
export const EMOTION_WARNING =
  "感情→パラメータは母集団の傾向であって個人の正解ではない。文化・学習・個人差・歌詞/アレンジで容易に反転する。1ノブで決めず候補として扱い、複数バリエーション（seed違い/進行違い/長短）で耳に委ねること。";
export const EMOTION_DISCLAIMERS: string[] = [
  "文化・学習依存：長調=幸福/短調=悲哀は西洋伝統の学習に強く依存（非西洋・実験的文脈では崩れる）",
  "個人差が大きい：同一曲でも聴き手の性格・記憶・気分で反応が割れる",
  "手がかりは確率的・冗長：どの1パラメータも感情を決定しない（束で設計・Juslin）",
  "文脈が上書きする：歌詞・音色・アレンジで印象は反転しうる（構造値は前提であって最終でない）",
  "混合語（切ない/エモい/懐かしい/情熱）は陽寄り/陰寄り2案を必ず出し、人間に選ばせる",
];

export interface EmotionSuggestion {
  word: string; // 解決された正準語
  matched: "word" | "va"; // 語一致 / V-A 近傍
  V: number;
  A: number;
  mix: boolean;
  reason: string;
  variations: EmotionVariation[];
  warning: string; // 過信警告（一言）
  disclaimers: string[]; // 過信警告（要点）
}

/** 感情語 or V-A 座標 → 実在ノブの推奨値プリセット（**提案のみ**・過信警告付き）。
 *  word 指定＝辞書引き（別表記/英語を吸収）。無ければ V-A 近傍へフォールバック。
 *  word 無し＝V-A 最近傍。混合語は variations が2案（§4）。該当皆無なら null。 */
export function suggestEmotionParams(
  query: { word?: string; V?: number; A?: number },
): EmotionSuggestion | null {
  let preset: EmotionPreset | undefined;
  let matched: "word" | "va" = "word";

  if (query.word && query.word.trim()) {
    preset = WORD_INDEX.get(normWord(query.word));
  }
  // 語が引けない or 未指定で V-A があれば最近傍へ（arousal は 0..1、valence −1..+1 の等方距離）。
  if (!preset && typeof query.V === "number" && typeof query.A === "number") {
    matched = "va";
    let best = Infinity;
    for (const p of EMOTION_PRESETS) {
      const d = (p.V - query.V) ** 2 + (p.A - query.A) ** 2;
      if (d < best) { best = d; preset = p; }
    }
  }
  if (!preset) return null;

  return {
    word: preset.word,
    matched,
    V: preset.V,
    A: preset.A,
    mix: preset.mix,
    reason: preset.reason,
    variations: preset.variations,
    warning: EMOTION_WARNING,
    disclaimers: EMOTION_DISCLAIMERS,
  };
}
