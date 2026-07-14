// エネルギープラン（曲全体の多次元アーク）の提案（WP-X1 スライス2）。純データ＋純関数。
// 正典＝docs/research/2026-07-14-energy-arc-arrangement.md（5次元・知覚エネルギー=前セクション比Δ・
//   プランテンプレ3種＝標準J-pop/バラード/4つ打ち・レイヤ写像表 §5.5・提案止まり §6）。
// 思想＝「機械は候補まで・仕上げは人間」＝ここはエネルギープランを**提案するだけ**（自動適用しない）。
// 役割語彙は formLibrary.ts と共有（落ちサビ/大サビを chorus と区別＝エネルギー設計が別扱いになる）。
import type { FormRole } from "./formLibrary";

// 5次元（doc §1）：密度/音域/レイヤ/ラウドネス/細分化。値は前セクション比 Δ（−2..+2・0=前と同等）。
export interface EnergyVector {
  density: number; // D1 音数密度
  register: number; // D2 音域
  layers: number; // D3 同時楽器数
  loudness: number; // D4 ラウドネス/ダイナミクス
  subdiv: number; // D5 リズム細分化
}

export type AbsLevel = "low" | "mid" | "high" | "peak"; // 絶対レベル目安（doc §5.1）

export interface SectionEnergy {
  role: FormRole;
  absLevel: AbsLevel; // 絶対レベル（low/mid/high/peak）
  level: number; // 1..5（absLevel の数値・doc テンプレの absLevel 列）
  delta: EnergyVector; // 前セクション比 Δ（先頭は全 0＝基準）
  layerAdd: string[]; // Δ.layers>0 で足す要素（doc §5.5 写像）
  layerDrop: string[]; // Δ.layers<0 で引く要素
  knobs: Record<string, number>; // 既存生成ノブへの推奨値（実在ノブ名のみ・§下 REAL_KNOBS）
}

export type EnergyTemplate = "jpop_standard" | "ballad" | "four_on_floor";

export interface EnergyPlan {
  template: EnergyTemplate;
  sections: SectionEnergy[];
}

// ── 既存生成ノブへの翻訳で用いる「実在ノブ名」のホワイトリスト（存在しないノブ名を出さない）。
// density/swing/runs/foreground は gen_melody(MCP/HTTP) の入力ノブ。registerShift は genMelody opts /
// HTTP 経路 / SECTION_PRESETS の実ノブ（MCP 面では frame.section.role/energy 経由で発火）。
// energy は frame.section.energy（density/registerShift プリセットを線形スケール）。
export const REAL_KNOBS = ["density", "registerShift", "energy", "runs", "swing", "foreground"] as const;
export type RealKnob = (typeof REAL_KNOBS)[number];

// ── 役割別・次元別の絶対レベル（1..5）。テンプレ3種（doc §5.2/§5.3/§5.4）。
// 前セクション比 Δ はこの絶対プロファイルの差分で導く（doc「知覚エネルギー=前セクション比Δ」）。
type DimLevels = { d: number; r: number; l: number; lo: number; sub: number };
const P = (d: number, r: number, l: number, lo: number, sub: number): DimLevels => ({ d, r, l, lo, sub });

// 標準 J-pop（doc §5.2）＝谷（落ちサビ）→山（ラスサビ）で Δ 最大化。ピークの正体は layers/density/subdiv。
const PROFILE_JPOP: Record<FormRole, DimLevels> = {
  intro:       P(1, 2, 1, 2, 1),
  verse:       P(2, 2, 2, 2, 2),
  verse_var:   P(2, 2, 2, 2, 2),
  prechorus:   P(3, 3, 3, 3, 3),
  chorus:      P(4, 4, 4, 4, 4),
  postchorus:  P(4, 4, 4, 3, 3),
  bridge:      P(3, 3, 3, 3, 3),
  interlude:   P(2, 2, 2, 2, 2),
  drop_chorus: P(1, 2, 1, 1, 1), // 伴奏大幅DROP（Vo＋最小）＝谷
  last_chorus: P(5, 5, 5, 4, 5), // 全部入り＝山（peak）
  outro:       P(1, 2, 1, 2, 1),
};

// バラード（doc §5.3）＝density より register/layers で山を作る。落ちサビは Pf/Vo のみまで落とす。
const PROFILE_BALLAD: Record<FormRole, DimLevels> = {
  intro:       P(1, 1, 1, 1, 1),
  verse:       P(1, 2, 1, 1, 1),
  verse_var:   P(1, 2, 1, 1, 1),
  prechorus:   P(2, 3, 2, 2, 1),
  chorus:      P(3, 4, 4, 3, 2),
  postchorus:  P(3, 4, 3, 2, 2),
  bridge:      P(2, 3, 3, 2, 2),
  interlude:   P(2, 3, 2, 2, 1),
  drop_chorus: P(1, 2, 1, 1, 1),
  last_chorus: P(4, 5, 5, 4, 3),
  outro:       P(1, 2, 1, 1, 1),
};

// 4つ打ち系（doc §5.4）＝build→drop。build(prechorus)は layers/loudness を一旦絞り subdiv を上げる。
const PROFILE_4OTF: Record<FormRole, DimLevels> = {
  intro:       P(2, 2, 2, 2, 2),
  verse:       P(2, 2, 2, 2, 2),
  verse_var:   P(2, 2, 2, 2, 2),
  prechorus:   P(3, 3, 2, 2, 5), // build＝layers/loudness を絞り riser/roll で subdiv 最大
  chorus:      P(5, 4, 5, 5, 4), // drop
  postchorus:  P(4, 4, 4, 4, 3),
  bridge:      P(2, 2, 2, 2, 2), // breakdown＝谷
  interlude:   P(2, 2, 2, 2, 2),
  drop_chorus: P(1, 2, 1, 1, 1),
  last_chorus: P(5, 4, 5, 5, 4), // 最終 drop
  outro:       P(2, 2, 2, 2, 2),
};

const PROFILES: Record<EnergyTemplate, Record<FormRole, DimLevels>> = {
  jpop_standard: PROFILE_JPOP,
  ballad: PROFILE_BALLAD,
  four_on_floor: PROFILE_4OTF,
};

// ── 役割文字列の正規化（doc §5-A 役割コード＋日本語表記を吸収）。落ちサビ/大サビを chorus と区別する。
const ROLE_MAP: Record<string, FormRole> = {
  i: "intro", intro: "intro", イントロ: "intro", 前奏: "intro",
  a: "verse", v: "verse", verse: "verse", amelo: "verse", aメロ: "verse",
  "a'": "verse_var", versevar: "verse_var", verse_var: "verse_var", "a'melo": "verse_var", aダッシュ: "verse_var",
  b: "prechorus", prechorus: "prechorus", prec: "prechorus", precho: "prechorus", bmelo: "prechorus", bメロ: "prechorus", build: "prechorus",
  c: "chorus", chorus: "chorus", sabi: "chorus", hook: "chorus", サビ: "chorus", drop: "chorus",
  pc: "postchorus", postchorus: "postchorus", postcho: "postchorus", ポストコーラス: "postchorus",
  br: "bridge", bridge: "bridge", cmelo: "bridge", cメロ: "bridge", ブリッジ: "bridge", breakdown: "bridge",
  inst: "interlude", interlude: "interlude", solo: "interlude", 間奏: "interlude",
  dc: "drop_chorus", dropchorus: "drop_chorus", drop_chorus: "drop_chorus", 落ちサビ: "drop_chorus", おちサビ: "drop_chorus",
  lc: "last_chorus", lastchorus: "last_chorus", last_chorus: "last_chorus", 大サビ: "last_chorus", ラスサビ: "last_chorus", 最後のサビ: "last_chorus",
  o: "outro", outro: "outro", ending: "outro", アウトロ: "outro", 後奏: "outro",
};
function normEnergyRole(role: unknown): FormRole {
  if (typeof role !== "string") return "verse";
  const raw = role.trim().toLowerCase();
  if (ROLE_MAP[raw]) return ROLE_MAP[raw];
  const k = raw.replace(/[\s_\-]+/g, "");
  return ROLE_MAP[k] ?? "verse";
}

const clampD = (x: number) => Math.max(-2, Math.min(2, x)); // Δ を −2..+2 へ
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round2 = (x: number) => Math.round(x * 100) / 100;
const LEVEL_LABEL: AbsLevel[] = ["low", "low", "mid", "high", "peak"]; // 1..5 → ラベル（index=level-1）

// Δ.layers → 具体トラック操作（doc §5.5 レイヤ写像表・優先順）。
function layerMapping(dLayers: number): { add: string[]; drop: string[] } {
  if (dLayers >= 2) return { add: ["ダブリング/ハモ", "リードGt/シンセ", "パッド厚み", "パーカス追加"], drop: [] };
  if (dLayers === 1) return { add: ["カウンターメロ/オブリ", "hat/刻み追加", "ベース動き増"], drop: [] };
  if (dLayers === -1) return { add: [], drop: ["刻み/オブリを間引く", "パッド薄く"] };
  if (dLayers <= -2) return { add: [], drop: ["ドラム/ベース抜き（Vo＋和音楽器のみ）"] };
  return { add: [], drop: [] };
}

// 絶対プロファイル → 既存生成ノブの推奨値（実在ノブ名のみ）。SECTION_PRESETS と整合する目安値。
function toKnobs(p: DimLevels, level: number): Record<string, number> {
  const knobs: Record<string, number> = {};
  // 密度：d=1→0.35 … 5→0.75（SECTION_PRESETS verse0.45/chorus0.65 と整合）。
  knobs.density = round2(clamp01(0.25 + p.d * 0.1));
  // 音域：r=2→0, 3→+2, 4→+4, 5→+6, 1→−2（半音・SECTION_PRESETS と整合）。
  knobs.registerShift = (p.r - 2) * 2;
  // frame.section.energy：絶対レベルを 0..1 へ（level3≈0.5 が既定＝プリセット等倍）。
  knobs.energy = round2(clamp01(level * 0.2));
  // 細分化→走句：sub>=3 でのみ起こす（sub2以下は0＝従来）。
  knobs.runs = round2(clamp01(Math.max(0, p.sub - 2) * 0.15));
  return knobs;
}

/** 役割列（落ちサビ/大サビ含む）→ 各セクションの Δ（前セクション比・5次元）＋レイヤ写像＋既存ノブ推奨値。
 *  **提案のみ＝自動適用しない**（doc §6）。template 未指定＝jpop_standard。
 *  末尾の chorus が last_chorus 相当でなくても、明示 last_chorus が無く chorus が2つ以上あれば
 *  最後の chorus をピークとして扱う（doc §2.1「最終サビピーク」）。 */
export function suggestEnergyPlan(
  roles: (FormRole | string)[],
  opts?: { template?: EnergyTemplate },
): EnergyPlan {
  const template = opts?.template ?? "jpop_standard";
  const profile = PROFILES[template];
  const rs = (Array.isArray(roles) ? roles : []).map(normEnergyRole);

  // 最終サビピーク：明示 last_chorus が無く chorus が2つ以上なら、最後の chorus を last_chorus として扱う。
  const hasLast = rs.includes("last_chorus");
  const chorusIdxs = rs.map((r, i) => (r === "chorus" ? i : -1)).filter((i) => i >= 0);
  const promoteIdx = !hasLast && chorusIdxs.length >= 2 ? chorusIdxs[chorusIdxs.length - 1]! : -1;
  const effRoles = rs.map((r, i) => (i === promoteIdx ? ("last_chorus" as FormRole) : r));

  const sections: SectionEnergy[] = [];
  let prev: DimLevels | undefined;
  effRoles.forEach((role, i) => {
    const p = profile[role];
    const level = Math.round((p.d + p.r + p.l + p.lo + p.sub) / 5);
    const delta: EnergyVector = prev
      ? { density: clampD(p.d - prev.d), register: clampD(p.r - prev.r), layers: clampD(p.l - prev.l), loudness: clampD(p.lo - prev.lo), subdiv: clampD(p.sub - prev.sub) }
      : { density: 0, register: 0, layers: 0, loudness: 0, subdiv: 0 };
    const lm = layerMapping(delta.layers);
    // 表示役割は正規化後（promote 済み）を返す＝落ちサビ/大サビの区別を保持。
    sections.push({
      role: effRoles[i]!,
      absLevel: LEVEL_LABEL[Math.max(0, Math.min(4, level - 1))]!,
      level,
      delta,
      layerAdd: lm.add,
      layerDrop: lm.drop,
      knobs: toKnobs(p, level),
    });
    prev = p;
  });
  return { template, sections };
}
