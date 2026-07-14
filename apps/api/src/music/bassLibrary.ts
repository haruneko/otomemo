// ジャンル別ベースライン語彙＋フィル語彙の純データ辞書（WP-B1・2026-07-14）。
// 正準＝docs/research/2026-07-14-bass-genre-vocabulary.md（6ジャンル33型＝度数×16分グリッド譜／フィル型）／
//       docs/research/2026-07-14-stem-groove-measurements.md（kickLock/アプローチの実測較正）。
// 方針（drumLibrary.ts と同流儀）：型は**度数×16分グリッドの純データ**として保持し、実音（音域窓 33..48）への
//   写像・キック絡み・アプローチは生成器(generate.ts genBass)が realize する。本ファイルは「不変知識」＝生成器から分離。
// キック絡み（kickRel）はメタ＝スタイル経路は**型の格子を正準**として鳴らし kickLock とは二重適用しない（排他）。

// セクション役割（generate.ts SectionRole と同一・循環回避のためローカル定義＝drumLibrary と同じ流儀）。
type Role = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "interlude" | "outro";

// キック絡みラベル（正典 §0）。unison=キックと同相／interlock=隙間を埋める相補／counter=裏拍で逆相／
//   mixed=小節内で混在（例 RK-PEDAL＝unison＋末尾 counter）。スタイル経路では**メタ**（露出/将来のスナップ用）。
export type KickRel = "unison" | "interlock" | "counter" | "mixed";

// 度数トークン→ルートからの半音（正典 §0 度数表）。R は 0（realize 側で別扱いだが 0 も登録）。
// 半音アプローチ（#1/#4/#7 等）＝クロマチック経過音。b8 は使わないが対称のため 11。
export const DEGREE_SEMI: Record<string, number> = {
  R: 0, "8": 12, b2: 1, "#1": 1, "2": 2, b3: 3, "3": 4, "4": 5, "#4": 6, b5: 6,
  "5": 7, "#5": 8, b6: 8, "6": 9, "#6": 10, b7: 10, "7": 11, "#7": 11,
};

// 1グリッドセル。on=発音（deg・next=次コードルート基準の R>/8>）／tie=直前音の伸ばし（-）／
//   rest=休符（.）／ghost=ゴースト（x・bass は vel 未対応ゆえ realize では休符扱い＝正典 §8 スコープ外）。
export interface BassCell { kind: "on" | "tie" | "rest" | "ghost"; deg?: string; next?: boolean }

export interface BassType {
  id: string;
  genre: string; // rock/ballad/citypop/funk/edm/vocarock
  grid: 16; // 4/4・1小節16分（正典の型は全て4/4）
  tempoMin: number; tempoMax: number;
  kickRel: KickRel; // キック絡み（メタ）
  roles: Role[]; // 適用セクション（候補フィルタ）
  cells: BassCell[]; // pattern をパースした16セル
  pattern: string; // 正典のテキスト譜（監査用・SSOT）
}

// テキスト譜（"R . R . | ..."）→16セル。`|` は捨てる。プレフィックス `/` `\`（スライド）は剥がす。
// 末尾 `>`（R>/8>）＝next=true（次コードルート基準）。`x`=ghost・`-`=tie・`.`=rest。
export function parseBassPattern(pattern: string): BassCell[] {
  const toks = pattern.split(/\s+/).filter((t) => t && t !== "|");
  return toks.map((raw): BassCell => {
    let t = raw;
    if (t === ".") return { kind: "rest" };
    if (t === "-") return { kind: "tie" };
    if (t === "x") return { kind: "ghost" };
    if (t[0] === "/" || t[0] === "\\") t = t.slice(1); // スライド記号を剥がす
    let next = false;
    if (t.endsWith(">")) { next = true; t = t.slice(0, -1); }
    return { kind: "on", deg: t, next };
  });
}

const T = (
  id: string, genre: string, tempoMin: number, tempoMax: number, kickRel: KickRel, roles: Role[], pattern: string,
): BassType => {
  const cells = parseBassPattern(pattern);
  if (cells.length !== 16) throw new Error(`bassLibrary: ${id} は16セルでない（${cells.length}）`);
  return { id, genre, grid: 16, tempoMin, tempoMax, kickRel, roles, cells, pattern };
};

// ── ジャンル別ベースライン型辞書（正典 §1-6・33型） ───────────────────────
export const BASS_TYPES: BassType[] = [
  // §1 ロック（8分ルート弾き）
  T("RK-8ROOT", "rock", 120, 170, "unison", ["intro", "verse", "chorus", "outro"], "R . R . | R . R . | R . R . | R . R ."),
  T("RK-GALLOP", "rock", 150, 200, "interlock", ["chorus", "interlude"], "R . R R | R . R R | R . R R | R . R R"),
  T("RK-DRIVE5", "rock", 120, 160, "unison", ["verse", "prechorus"], "R . R . | R . R . | 5 . 5 . | 5 . 5 ."),
  T("RK-PEDAL", "rock", 130, 180, "mixed", ["prechorus", "bridge"], "R . R . | R . R . | R . R . | R . #1 R"),
  // §2 J-pop バラード（全音符＋アプローチ・5度跳び）
  T("BL-WHOLE", "ballad", 60, 90, "unison", ["intro", "verse"], "R - - - | - - - - | - - - - | - - - -"),
  T("BL-HALF5", "ballad", 60, 90, "unison", ["verse", "prechorus"], "R - - - | - - - - | 5 - - - | - - - -"),
  T("BL-APPROACH", "ballad", 60, 95, "counter", ["prechorus", "bridge"], "R - - - | - - - - | 5 - - - | - - #1 R>"),
  T("BL-SOUL3", "ballad", 65, 95, "unison", ["chorus"], "R - 3 - | - - - - | 5 - - - | - - - -"),
  T("BL-OCTLIFT", "ballad", 60, 90, "unison", ["chorus"], "R - - - | - - - - | R - - 8 | - - 5 R>"),
  // §3 シティポップ／ディスコ（オクターブ奏法・16分シンコペ）
  T("CP-OCT8", "citypop", 100, 125, "counter", ["intro", "verse"], "R . 8 . | R . 8 . | R . 8 . | R . 8 ."),
  T("CP-OCT16", "citypop", 105, 125, "interlock", ["chorus"], "R . 8 8 | R . 8 8 | R . 8 8 | R . 8 8"),
  T("CP-WALK", "citypop", 95, 120, "counter", ["verse"], "R . 8 . | 5 . R . | 6 . 8 . | 5 . #4 R>"),
  T("CP-SYNCOP", "citypop", 105, 125, "counter", ["prechorus", "bridge"], "R . . 8 | . R . 8 | . R . 8 | . R . 8"),
  T("CP-CHROMA", "citypop", 95, 120, "interlock", ["chorus"], "R . 8 . | R . 8 . | b7 . 6 . | b6 . 5 R>"),
  // §4 ファンク（1拍目重視＋16分ゴースト・スライド）
  T("FK-ONE", "funk", 90, 120, "interlock", ["verse"], "R . x x | . R x . | x . R x | . x R> ."),
  T("FK-OCTPOP", "funk", 95, 120, "interlock", ["verse", "chorus"], "R x 8 x | . R x 8 | x . R x | 8 . x R>"),
  T("FK-SLIDE", "funk", 90, 115, "interlock", ["chorus"], "/R . . x | . R x . | x . /8 . | . x . R>"),
  T("FK-16LOCK", "funk", 100, 120, "interlock", ["bridge", "interlude"], "R x x R | x x R x | x R x x | R x x ."),
  T("FK-SPACE", "funk", 85, 110, "unison", ["bridge"], "R . . . | . . x x | R . . . | . x x ."),
  // §5 EDM系（オフビート・ロー持続）
  T("ED-OFFBEAT", "edm", 120, 128, "counter", ["intro", "verse"], ". . R . | . . R . | . . R . | . . R ."),
  T("ED-OFF16", "edm", 122, 128, "counter", ["verse"], ". . R . | . R . R | . . R . | . R . R"),
  T("ED-SUSTAIN", "edm", 120, 140, "unison", ["chorus", "bridge"], "R - - - | - - - - | - - - - | - - - -"),
  T("ED-PULSE", "edm", 124, 130, "unison", ["chorus"], "R . R . | R . R . | R . R . | R . R ."),
  T("ED-ROOT5", "edm", 120, 126, "counter", ["chorus"], ". . R . | . . 5 . | . . R . | . . 8 ."),
  // §6 ボカロック（高速8分・ルート駆動）
  T("VR-8DRIVE", "vocarock", 160, 200, "unison", ["verse", "chorus"], "R . R . | R . R . | R . R . | R . R ."),
  T("VR-GALLOP", "vocarock", 170, 210, "interlock", ["chorus", "interlude"], "R . R R | R . R R | R . R R | R . R R"),
  T("VR-CHORDFAST", "vocarock", 160, 195, "unison", ["verse", "bridge"], "R . R . | 5 . 5 . | R . R . | 5 . 5 ."),
  T("VR-PUSH", "vocarock", 165, 200, "mixed", ["prechorus"], "R . R . | R . R . | R . R . | R R 5 8>"),
];

// ── フィル型辞書（正典 §7・セクション末の駆け上がり／下がり・5型） ─────────
export type FillDir = "up" | "down" | "chroma";
export interface BassFill { id: string; grid: 16; dir: FillDir; cells: BassCell[]; pattern: string }
const F = (id: string, dir: FillDir, pattern: string): BassFill => {
  const cells = parseBassPattern(pattern);
  if (cells.length !== 16) throw new Error(`bassLibrary fill: ${id} は16セルでない（${cells.length}）`);
  return { id, grid: 16, dir, cells, pattern };
};
export const BASS_FILLS: BassFill[] = [
  F("FL-WALKUP", "up", "R . . . | . . . . | 5 . 6 . | b7 . #7 R>"),
  F("FL-WALKDN", "down", "R . . . | . . . . | b7 . 6 . | 5 . #4 R>"),
  F("FL-RUNUP16", "up", "R . . . | . . . . | 5 6 b7 7 | 8 b7 5 R>"),
  F("FL-CHROMA", "chroma", "R . . . | . . . . | . . . . | b6 6 b7 R>"),
  F("FL-OCTDROP", "down", "8 . . . | . . . . | 8 . 5 . | 3 . 2 R>"),
];

export function bassTypeById(id: string): BassType | undefined { return BASS_TYPES.find((t) => t.id === id); }

// ジャンル×役割→候補型ID（正典 §1-6 の適用セクション準拠・優先順）。tempo で絞れないときの fallback 母集団。
const GENRE_TABLE: Record<string, Partial<Record<Role, string[]>>> = {
  rock: { intro: ["RK-8ROOT"], verse: ["RK-8ROOT", "RK-DRIVE5"], prechorus: ["RK-DRIVE5", "RK-PEDAL"], chorus: ["RK-8ROOT", "RK-GALLOP"], bridge: ["RK-PEDAL"], interlude: ["RK-GALLOP"], outro: ["RK-8ROOT"] },
  ballad: { intro: ["BL-WHOLE"], verse: ["BL-WHOLE", "BL-HALF5"], prechorus: ["BL-HALF5", "BL-APPROACH"], chorus: ["BL-SOUL3", "BL-OCTLIFT"], bridge: ["BL-APPROACH"], outro: ["BL-WHOLE"] },
  citypop: { intro: ["CP-OCT8"], verse: ["CP-OCT8", "CP-WALK"], prechorus: ["CP-SYNCOP"], chorus: ["CP-OCT16", "CP-CHROMA"], bridge: ["CP-SYNCOP"], interlude: ["CP-SYNCOP"], outro: ["CP-OCT8"] },
  funk: { intro: ["FK-SPACE"], verse: ["FK-ONE", "FK-OCTPOP"], prechorus: ["FK-ONE"], chorus: ["FK-OCTPOP", "FK-16LOCK"], bridge: ["FK-SPACE"], interlude: ["FK-16LOCK"], outro: ["FK-ONE"] },
  edm: { intro: ["ED-OFFBEAT"], verse: ["ED-OFFBEAT", "ED-OFF16"], prechorus: ["ED-PULSE"], chorus: ["ED-SUSTAIN", "ED-PULSE", "ED-ROOT5"], bridge: ["ED-SUSTAIN"], outro: ["ED-OFFBEAT"] },
  vocarock: { intro: ["VR-8DRIVE"], verse: ["VR-8DRIVE", "VR-CHORDFAST"], prechorus: ["VR-PUSH"], chorus: ["VR-8DRIVE", "VR-GALLOP"], bridge: ["VR-CHORDFAST"], interlude: ["VR-GALLOP"], outro: ["VR-8DRIVE"] },
};
// ジャンル名エイリアス（表記ゆれ→正準キー）。未知は null＝スタイル経路を発火させない（従来 bit 一致へ落ちる）。
const GENRE_ALIAS: Record<string, string> = {
  disco: "citypop", city_pop: "citypop", citypop: "citypop",
  house: "edm", techno: "edm", trance: "edm", dance: "edm", edm: "edm",
  vocaloid: "vocarock", jrock: "vocarock", "j-rock": "vocarock", punk: "rock", band: "rock", hardrock: "rock", metal: "rock",
  soul: "funk", rnb: "funk", "r&b": "funk", slow: "ballad", jballad: "ballad",
};

// ジャンル名＋役割/tempo→候補型を絞り seed で1つ選ぶ（決定的）。無ければ null（＝従来経路へフォールバック）。
// テンポ指定時は**域内の型のみ**適格（正典 §6-6「テンポ域が合う型のみ提示」）＝域外の型はジャンル指定で選ばれない。
//   域内が皆無なら null（域外を無理に選ばない）。テンポ未指定なら全候補から選ぶ。
export function pickBassType(genre: string, role: Role | undefined, tempo: number | undefined, seed: number): BassType | null {
  const g = GENRE_ALIAS[genre] ?? genre;
  const table = GENRE_TABLE[g];
  if (!table) return null;
  const ids = table[role ?? "verse"] ?? table.verse ?? [];
  const cands = ids.map(bassTypeById).filter((t): t is BassType => !!t);
  if (cands.length === 0) return null;
  let pool = cands;
  if (tempo != null) {
    const inRange = cands.filter((t) => tempo >= t.tempoMin && tempo <= t.tempoMax);
    if (inRange.length === 0) return null; // 域外の型は選ばない（ジャンル指定時）
    pool = inRange;
  }
  return pool[((seed % pool.length) + pool.length) % pool.length] ?? null;
}

// フィルを解決：型ID→固定／数値(0..1)→方向で選抜（<0.5=下降系・>=0.5=上昇系）。無ければ null。
export function resolveBassFill(fill: number | string, seed: number): BassFill | null {
  if (typeof fill === "string") return BASS_FILLS.find((f) => f.id === fill) ?? null;
  const v = Math.max(0, Math.min(1, fill));
  const dir: FillDir = v < 0.5 ? "down" : "up"; // 弱=落ち着かせる下降・強=盛り上げる上昇（正典 §7）
  const pool = BASS_FILLS.filter((f) => f.dir === dir);
  const use = pool.length ? pool : BASS_FILLS;
  return use[((seed % use.length) + use.length) % use.length] ?? null;
}
