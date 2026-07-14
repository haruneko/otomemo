// 調プラン（セクション間の転調設計）＝WP-C2 スライス1。
// 正典＝docs/research/2026-07-14-modulation-catalog.md（型12＋一時転調2・二大頻出=短3度上げ/半音上げ・戻り方5型）。
// 思想＝「機械は候補まで、仕上げは人間」＝ここは調プランを**候補として提示するだけ**（自動適用しない）。
// design #16「frame＝セクションごと key+mode 宣言」を、複数キーをまたぐ「調プラン」へ拡張するための純関数。
import { DIATONIC_CHORDS_MAJOR, DIATONIC_CHORDS_MINOR } from "./theory";
import type { SectionRole } from "./generate"; // 型のみ（実行時に生成器へは依存しない＝循環しない）

export type ModPrep = "direct" | "pivot" | "secondary_dominant"; // 準備手法（catalog §1.3）
export type ModEffect = "lift" | "shift" | "float"; // 効果（高揚/転換/浮遊）
export type ReturnPlan = "R-NONE" | "R-INTERLUDE" | "R-INSTANT" | "R-PIVOT-BACK" | "R-DOM-BACK"; // 戻り方（catalog §4）
export type ModRelation =
  | "parallel" | "relative" | "subdominant" | "dominant"
  | "minor3rd" | "mediant" | "half" | "whole" | "tritone" | "remote";

// 転調型カタログ（catalog §3・移動量は基準調から見た半音・0..11 で正規化して適用）。
export interface ModType {
  id: string; // M-MIN3-UP 等
  name: string; // 日本語名
  semitones: number; // 基準調 → 遷移先 の半音移動（mod 12）
  modeFlip: boolean; // 長短反転を伴うか（同主調/平行調）
  relation: ModRelation;
  prep: ModPrep; // 既定の準備手法
  effect: ModEffect;
  weight: number; // 頻度重み 1..5（短3度上げ/半音上げ＝5＝二大頻出）
  positions: SectionRole[]; // 典型的な着地セクション役割
}

export const MODULATION_CATALOG: ModType[] = [
  { id: "M-PARA", name: "同主調交替（明↔暗）", semitones: 0, modeFlip: true, relation: "parallel", prep: "pivot", effect: "shift", weight: 3, positions: ["chorus", "verse", "prechorus"] },
  { id: "M-REL-DN", name: "平行調へ（長→短）", semitones: 9, modeFlip: true, relation: "relative", prep: "pivot", effect: "float", weight: 3, positions: ["prechorus", "bridge"] },
  { id: "M-SUBD", name: "下属調へ", semitones: 5, modeFlip: false, relation: "subdominant", prep: "pivot", effect: "float", weight: 2, positions: ["prechorus", "bridge", "interlude"] },
  { id: "M-DOM", name: "属調へ", semitones: 7, modeFlip: false, relation: "dominant", prep: "secondary_dominant", effect: "lift", weight: 2, positions: ["prechorus", "chorus"] },
  { id: "M-WHOLE-UP", name: "全音上げ", semitones: 2, modeFlip: false, relation: "whole", prep: "direct", effect: "lift", weight: 3, positions: ["chorus"] },
  { id: "M-WHOLE-DN", name: "全音下げ", semitones: 10, modeFlip: false, relation: "whole", prep: "pivot", effect: "float", weight: 1, positions: ["interlude", "bridge"] },
  { id: "M-MIN3-UP", name: "短3度上げ（サビ転調の本命）", semitones: 3, modeFlip: false, relation: "minor3rd", prep: "direct", effect: "lift", weight: 5, positions: ["chorus"] },
  { id: "M-MED-UP", name: "メディアント（3度上げ）", semitones: 4, modeFlip: false, relation: "mediant", prep: "pivot", effect: "lift", weight: 2, positions: ["chorus"] },
  { id: "M-HALF-UP", name: "半音上げ（トラックドライバー）", semitones: 1, modeFlip: false, relation: "half", prep: "direct", effect: "lift", weight: 5, positions: ["chorus"] },
  { id: "M-HALF-DN", name: "半音下げ", semitones: 11, modeFlip: false, relation: "half", prep: "pivot", effect: "float", weight: 1, positions: ["interlude", "bridge"] },
  { id: "M-TRITONE", name: "三全音（最遠）", semitones: 6, modeFlip: false, relation: "tritone", prep: "direct", effect: "shift", weight: 1, positions: ["bridge", "interlude"] },
  { id: "M-REMOTE", name: "遠隔転調", semitones: 8, modeFlip: false, relation: "remote", prep: "pivot", effect: "shift", weight: 2, positions: ["bridge", "interlude"] },
];

// 半音移動量(0..11)＋長短反転の有無 → 型を1つ引く（度数差から型IDを決める逆引き）。
function catalogByShift(semis: number, modeFlip: boolean): ModType {
  const s = ((semis % 12) + 12) % 12;
  // modeFlip を伴う 0(同主)/9(平行) は専用型を優先。それ以外は semitone 一致で引く。
  const exact = MODULATION_CATALOG.find((m) => m.semitones === s && m.modeFlip === modeFlip);
  if (exact) return exact;
  const any = MODULATION_CATALOG.find((m) => m.semitones === s);
  if (any) return any;
  // カタログ外の距離（理論上ありえないが防御）＝remote 扱い。
  return { ...MODULATION_CATALOG.find((m) => m.id === "M-REMOTE")!, semitones: s };
}

export interface PrepChord { root: number; quality: string } // 実音（境界セクション末尾へ差す準備和音）

// 指定調のダイアトニック三和音（実音 root＋quality）。
function diatonicTriads(key: number, mode: "major" | "minor"): PrepChord[] {
  const table = mode === "minor" ? DIATONIC_CHORDS_MINOR : DIATONIC_CHORDS_MAJOR;
  return table.map(([off, q]) => ({ root: (((off + key) % 12) + 12) % 12, quality: q }));
}

// ピボット（共通和音）＝旧調・新調の両方にダイアトニックな和音を1つ選ぶ（catalog §1.3-2）。
// 優先＝新調の予備ドミナント（IV/ii/vi/V）が旧調にも在るもの＝滑らかな橋。無ければ任意の共通和音、それも無ければ新調IV。
export function computePivotChord(fromKey: number, fromMode: "major" | "minor", toKey: number, toMode: "major" | "minor"): PrepChord {
  const fromPcs = new Set(diatonicTriads(fromKey, fromMode).map((c) => c.root));
  const to = diatonicTriads(toKey, toMode);
  for (const off of [5, 2, 9, 7]) { // IV, ii, vi, V of 新調
    const pc = (((off + toKey) % 12) + 12) % 12;
    if (fromPcs.has(pc)) { const c = to.find((x) => x.root === pc); if (c) return { root: c.root, quality: c.quality }; }
  }
  const common = to.find((c) => fromPcs.has(c.root));
  if (common) return { root: common.root, quality: common.quality };
  const iv = to.find((c) => c.root === (((toKey + 5) % 12) + 12) % 12);
  return iv ? { root: iv.root, quality: iv.quality } : { root: (((toKey) % 12) + 12) % 12, quality: toMode === "minor" ? "m" : "" };
}

// セカンダリドミナント＝転調先トニックの仮のV7（牽引・catalog §1.3-3）。
export function computeSecondaryDom(toKey: number): PrepChord {
  return { root: (((toKey + 7) % 12) + 12) % 12, quality: "7" };
}

// 準備手法から準備和音を実音で作る（direct は準備和音なし）。
function prepChordsFor(prep: ModPrep, fromKey: number, fromMode: "major" | "minor", toKey: number, toMode: "major" | "minor"): PrepChord[] | undefined {
  if (prep === "secondary_dominant") return [computeSecondaryDom(toKey)];
  if (prep === "pivot") return [computePivotChord(fromKey, fromMode, toKey, toMode)];
  return undefined; // direct＝無準備（境界でスパッと切替）
}

// genChords へ渡す遷移準備（境界セクション末尾を準備和音化するための最小契約）。
export interface TransitionPrep {
  prep: "pivot" | "secondary_dominant";
  toKey: number; // 転調先の主音pc（0..11）
  toMode?: "major" | "minor"; // 省略時 major
}

export interface PlannedSection { role: SectionRole; key: number; mode: "major" | "minor" }
export interface PlannedTransition {
  from: number; // 遷移元セクション index
  to: number; // 遷移先セクション index
  typeId: string;
  name: string;
  semitones: number;
  prep: ModPrep;
  prepChords?: PrepChord[];
  effect: ModEffect;
  returnPlan?: ReturnPlan;
}
export interface KeyPlan {
  id: string; // 戦略ID
  label: string;
  sections: PlannedSection[];
  transitions: PlannedTransition[];
  score: number; // 使用した遷移の頻度重み合計（並べ替え軸・大きいほど二大頻出寄り）
}

const ROLE_ALIASES = new Set<SectionRole>(["intro", "verse", "prechorus", "chorus", "bridge", "interlude", "outro"]);
function normRole(role: unknown): SectionRole {
  if (typeof role !== "string") return "verse";
  const k = role.toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, SectionRole> = {
    a: "verse", amelo: "verse", verse: "verse", aメロ: "verse",
    b: "prechorus", bmelo: "prechorus", prechorus: "prechorus", bメロ: "prechorus",
    chorus: "chorus", sabi: "chorus", hook: "chorus", サビ: "chorus", 大サビ: "chorus", 落ちサビ: "chorus",
    intro: "intro", イントロ: "intro", 前奏: "intro",
    bridge: "bridge", cmelo: "bridge", cメロ: "bridge", ブリッジ: "bridge",
    interlude: "interlude", solo: "interlude", 間奏: "interlude",
    outro: "outro", ending: "outro", アウトロ: "outro", 後奏: "outro",
  };
  const r = map[k] ?? (k as SectionRole);
  return ROLE_ALIASES.has(r) ? r : "verse";
}

const mod12 = (x: number) => ((x % 12) + 12) % 12;

// 戦略＝各セクションの「基準調からの半音シフト」と「長短反転」を index で返す。
type Shifter = (roles: SectionRole[], lastChorusIdx: number) => { shift: number; flip: boolean }[];

function buildPlan(id: string, label: string, roles: SectionRole[], baseKey: number, baseMode: "major" | "minor", shifter: Shifter): KeyPlan {
  const lastChorusIdx = roles.lastIndexOf("chorus");
  const per = shifter(roles, lastChorusIdx);
  const sections: PlannedSection[] = roles.map((role, i) => ({
    role,
    key: mod12(baseKey + per[i]!.shift),
    mode: per[i]!.flip ? (baseMode === "major" ? "minor" : "major") : baseMode,
  }));
  const transitions: PlannedTransition[] = [];
  const n = roles.length;
  for (let i = 1; i < n; i++) {
    const prev = sections[i - 1]!, cur = sections[i]!;
    const semis = mod12(cur.key - prev.key);
    const flip = prev.mode !== cur.mode;
    if (semis === 0 && !flip) continue; // 調が変わらない境界は遷移なし
    const type = catalogByShift(semis, flip);
    const prep = type.prep;
    const prepChords = prepChordsFor(prep, prev.key, prev.mode, cur.key, cur.mode);
    // 戻り計画（catalog §4）：基準へ戻る境界＝R-INSTANT／その元がbridge/interlude＝R-INTERLUDE。
    // 曲末セクションへ上げて終わる＝上げっぱなし R-NONE（トラックドライバー）。
    let returnPlan: ReturnPlan | undefined;
    const curShift = per[i]!.shift, prevShift = per[i - 1]!.shift;
    if (curShift === 0 && prevShift !== 0) returnPlan = (prev.role === "bridge" || prev.role === "interlude") ? "R-INTERLUDE" : "R-INSTANT";
    else if (curShift !== 0 && i === n - 1) returnPlan = "R-NONE";
    transitions.push({ from: i - 1, to: i, typeId: type.id, name: type.name, semitones: semis, prep, ...(prepChords ? { prepChords } : {}), effect: type.effect, ...(returnPlan ? { returnPlan } : {}) });
  }
  const score = transitions.reduce((a, t) => a + catalogByShift(t.semitones, sections[t.from]!.mode !== sections[t.to]!.mode).weight, 0);
  return { id, label, sections, transitions, score };
}

// 戦略集（catalog §5.2）。役割→遷移テンプレ。二大頻出（短3度/半音）を含める＝重みで上位に。
function strategies(roles: SectionRole[], baseKey: number, baseMode: "major" | "minor"): KeyPlan[] {
  const flat: Shifter = (rs) => rs.map(() => ({ shift: 0, flip: false }));
  const out: KeyPlan[] = [];
  // 転調しない案（洋楽トレンド＆選択肢のため必ず含む・catalog §5.2-4）。
  out.push(buildPlan("no-mod", "転調しない", roles, baseKey, baseMode, flat));
  // サビ短3度上げ（J-pop本命・M-MIN3-UP）。
  out.push(buildPlan("min3-chorus", "サビを短3度上げ", roles, baseKey, baseMode, (rs) => rs.map((r) => ({ shift: r === "chorus" ? 3 : 0, flip: false }))));
  // 最終大サビ半音上げ（トラックドライバー・M-HALF-UP・上げっぱなし）。最後のサビだけ +1。
  out.push(buildPlan("half-final", "最終サビを半音上げ", roles, baseKey, baseMode, (rs, lc) => rs.map((r, i) => ({ shift: i === lc && lc >= 0 ? 1 : 0, flip: false }))));
  // サビ全音上げ（M-WHOLE-UP）。
  out.push(buildPlan("whole-chorus", "サビを全音上げ", roles, baseKey, baseMode, (rs) => rs.map((r) => ({ shift: r === "chorus" ? 2 : 0, flip: false }))));
  // ブリッジ遠隔＋サビ短3度（間奏で飛ぶ・M-REMOTE＋戻り／サビM-MIN3-UP）。
  out.push(buildPlan("bridge-remote", "ブリッジ遠隔＋サビ短3度上げ", roles, baseKey, baseMode, (rs) => rs.map((r) => ({ shift: r === "bridge" ? 8 : r === "chorus" ? 3 : 0, flip: false }))));
  // サビ同主調交替（明↔暗・M-PARA）。
  out.push(buildPlan("para-chorus", "サビで同主調交替（明暗反転）", roles, baseKey, baseMode, (rs) => rs.map((r) => ({ shift: 0, flip: r === "chorus" }))));
  return out;
}

/** 役割列＋基準 key/mode → 調プラン候補 N個（catalog準拠・提案のみ＝自動適用しない）。
 *  常に「転調しない案」を先頭に含み、転調案は score（頻度重み）降順で採る。転調しない案と同一のプランは重複除去。 */
export function suggestKeyPlan(
  roles: (SectionRole | string)[],
  baseKey = 0,
  baseMode: "major" | "minor" = "major",
  opts?: { count?: number },
): KeyPlan[] {
  const rs = (Array.isArray(roles) ? roles : []).map(normRole);
  const key = mod12(Math.trunc(baseKey || 0));
  const mode = baseMode === "minor" ? "minor" : "major";
  const count = Math.max(1, Math.min(8, opts?.count ?? 4));
  if (rs.length === 0) return [];
  const all = strategies(rs, key, mode);
  const noMod = all[0]!; // 転調しない案
  const sig = (p: KeyPlan) => p.sections.map((s) => `${s.key}:${s.mode}`).join(",");
  const noModSig = sig(noMod);
  // 転調案＝実際に転調が生じたもののみ（役割にサビ/ブリッジが無ければ no-mod と一致＝除外）。
  const seen = new Set([noModSig]);
  const mods = all.slice(1).filter((p) => { const s = sig(p); if (seen.has(s)) return false; seen.add(s); return true; })
    .sort((a, b) => b.score - a.score);
  return [noMod, ...mods].slice(0, count);
}
