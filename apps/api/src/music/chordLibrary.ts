// 伴奏パターン型辞書（chordLibrary・S2・2026-07-22）。正準＝
//   docs/research/2026-07-22-piano-comping-vocabulary.md（鍵盤13型＝LH/RH度数テキスト譜・テンポ帯・vel層）／
//   docs/research/2026-07-22-guitar-comping-vocabulary.md（ギターストラム15型＝D/U・ゴースト・アクセント）／
//   docs/research/2026-07-22-accompaniment-style-engines.md（パターン=データ/変換=純関数 の骨格）。
// 方針（bassLibrary.ts と同流儀）：型は**16分グリッド×vel層の純データ**として保持し、chord_pattern content
//   （mode/voicing/steps/hits）への組み立ては生成器(generate.ts genChordPattern)が行い、実音化は web
//   resolveChordPattern（進行に当てる二層設計）。本ファイルは「不変知識」＝生成器から分離。
// S3（2026-07-22）で配線完了（旧留保を解除・design「ピアノ左手(LH)内蔵＋ギター D/U（S3）」）：
//  - **左手(LH)** ＝ keyboard 型の `lh` を `compLhHitsForBar` で度数 hits 化し genChordPattern が `content.lh={mode:"custom",…}`
//    へ配線＝web resolveChordPattern が keyboard 解決時のみ実音化（裁定＝コード楽器ネタに内蔵）。ギター型は lh を出さない。
//  - **ギター D/U** ＝ `compHitsForBar` が `dir`(D/U) を hit へ透過＝web が dir で実音化（U=高→低・上位声・0.78×）。
//    plain `U` は dir-only（vel を焼かない）＝render の ×0.78 と二重掛けしない（parseCompRh 参照）。

// セクション役割（generate.ts SectionRole と同一・循環回避のためローカル定義＝bassLibrary と同じ流儀）。
type Role = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "interlude" | "outro";

export type CompMode = "strum" | "arp"; // ChordPatternMode と同一（strum=和音ブロック／arp=構成音巡回）。
export type CompStyle = "keyboard" | "guitar"; // ChordVoicing.style と同一（voiceToTop／voiceGuitar）。

// ── ベロシティ語彙（正典 piano §5-1 の3値＋guitar §3.5 の相場） ─────────────────
// web music.ts の CHORD_ACCENT=112 / CHORD_SOFT=64 と一致。CHORD_UP/CHORD_GHOST は guitar 由来の新値＝**要耳較正**。
// normal（100）は vel を**書かない**＝下流 resolveChordPattern の vel??100 と bit 安全（既存3値語彙と同契約）。
export const CHORD_ACCENT = 112; // 強打／アクセントダウン（backbeat・強拍・実コード）
export const CHORD_SOFT = 64; // 弱打（鍵盤コンピングの逃げ音）
export const CHORD_UP = 78; // ギターのアップ（ダウンの ~0.78×・guitar §3.5）＝**要耳較正**
export const CHORD_GHOST = 40; // ゴースト/チャック（実コードの ~0.4×・guitar §4）＝**要耳較正**

// 1グリッドセル（RH＝実音化する面）。attack=打鍵（vel 省略=100／dir/ghost はメタ）／hold=直前音の伸ばし（-）／rest=休符（.）。
export interface CompCell { kind: "attack" | "hold" | "rest"; vel?: number; dir?: "D" | "U"; ghost?: boolean }
// 左手セル（データのみ・今回配線しない）。deg=度数トークン（R/5/8 等）。
export interface CompLhCell { kind: "attack" | "hold" | "rest"; deg?: string }

export interface CompType {
  id: string;
  genre: string; // ballad/rock/citypop/dance/anison/gospel/jazz/folk/funk/reggae/pop/metal
  scenes: string; // 場面タグ（日本語・監査用 SSOT）
  grid: 16; // 4/4・1小節16分（型は全て4/4）
  tempoMin: number; tempoMax: number;
  mode: CompMode;
  style: CompStyle; // keyboard/guitar（voicing.style の既定＝guitar のみ content に載せる）
  strumMs?: number; // 弦順ロールの1弦あたり時差相場（guitar のみ・**要耳較正**）
  powerChord?: boolean; // 3度抜き R+5(+R')（GT-POWER16 等・歪み向け）
  openClose?: "open" | "close"; // voicing.openClose 既定（未指定=close）
  roles: Role[]; // 適用セクション（候補フィルタ）
  rh: CompCell[]; // RH 16セル（実音化する面）
  lh?: CompLhCell[]; // LH 16セル（データのみ・今回配線しない）
  rhPattern: string; // RHテキスト譜（監査用 SSOT）
  lhPattern?: string; // LHテキスト譜（監査用・将来用）
}

// ── RHテキスト譜パーサ ─────────────────────────────────────────────────────
// トークン（1トークン=16分1セル）：
//   `.`=休符 / `-`=hold（直前音を伸ばす＝タイ）
//   `A`=打鍵normal（vel省略=100） / `>`=アクセント(112) / `o`=弱打(64)
//   `D`=ギターダウン(normal・dir D) / `d`=アクセントダウン(112・dir D) / `U`=ギターアップ(78・dir U)
//   `x`=ゴースト/チャック(40・短dur・ghost)
export function parseCompRh(pattern: string): CompCell[] {
  const toks = pattern.split(/\s+/).filter((t) => t && t !== "|");
  return toks.map((t): CompCell => {
    switch (t) {
      case ".": return { kind: "rest" };
      case "-": return { kind: "hold" };
      case "A": return { kind: "attack" };
      case ">": return { kind: "attack", vel: CHORD_ACCENT };
      case "o": return { kind: "attack", vel: CHORD_SOFT };
      case "D": return { kind: "attack", dir: "D" };
      case "d": return { kind: "attack", vel: CHORD_ACCENT, dir: "D" };
      // S3：plain U は dir のみ（vel を焼かない）。softness は web render の dir==="U"→×0.78 に一元化
      //   ＝dir 実音化と CHORD_UP の二重掛け(78×0.78)を避ける。CHORD_UP は render 既定 78 の相場基準として温存。
      case "U": return { kind: "attack", dir: "U" };
      case "x": return { kind: "attack", vel: CHORD_GHOST, ghost: true };
      default: throw new Error(`chordLibrary: 未知のRHトークン "${t}"`);
    }
  });
}

// LHテキスト譜パーサ（データのみ）：度数トークン（R/5/8/3 等）＝attack・`-`=hold・`.`=rest。
export function parseCompLh(pattern: string): CompLhCell[] {
  const toks = pattern.split(/\s+/).filter((t) => t && t !== "|");
  return toks.map((t): CompLhCell => {
    if (t === ".") return { kind: "rest" };
    if (t === "-") return { kind: "hold" };
    return { kind: "attack", deg: t };
  });
}

// RH セル列（16）→ chord_pattern hits（1小節分・base=小節先頭 step）。
//   dur = 1 + 直後の連続 hold 数（rest/attack/末尾で打ち切り＝小節内でクランプ）。ghost は常に dur1（短打）。
//   vel は cell.vel をそのまま（未指定=キーを生やさない＝下流 vel??100）。S3：dir(D/U) を hit へ透過
//   （ギター型が web render で D/U 実音化＝dir 無しセルは dir キーを生やさない＝keyboard 型は不変・bit一致）。
export function compHitsForBar(cells: CompCell[], base: number): { step: number; dur: number; vel?: number; dir?: "D" | "U" }[] {
  const hits: { step: number; dur: number; vel?: number; dir?: "D" | "U" }[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (c.kind !== "attack") continue;
    let dur = 1;
    if (!c.ghost) for (let j = i + 1; j < cells.length && cells[j]!.kind === "hold"; j++) dur++;
    const hit: { step: number; dur: number; vel?: number; dir?: "D" | "U" } = { step: base + i, dur };
    if (c.vel != null) hit.vel = c.vel;
    if (c.dir) hit.dir = c.dir;
    hits.push(hit);
  }
  return hits;
}

// LH セル列（16）→ chord_pattern lh.hits（1小節分・base=小節先頭 step）。RH と同じ dur ルール。
//   deg=度数トークン（R/5/8/3…）。custom 左手として web resolveChordPattern が度数解決する（S3）。
export function compLhHitsForBar(cells: CompLhCell[], base: number): { step: number; dur: number; deg: string }[] {
  const hits: { step: number; dur: number; deg: string }[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (c.kind !== "attack") continue;
    let dur = 1;
    for (let j = i + 1; j < cells.length && cells[j]!.kind === "hold"; j++) dur++;
    hits.push({ step: base + i, dur, deg: c.deg ?? "R" });
  }
  return hits;
}

// 型ファクトリ。RH は必ず16セル。LH は任意（データのみ）。
const T = (t: {
  id: string; genre: string; scenes: string; tempoMin: number; tempoMax: number; mode: CompMode; style: CompStyle;
  roles: Role[]; rh: string; lh?: string; strumMs?: number; powerChord?: boolean; openClose?: "open" | "close";
}): CompType => {
  const rh = parseCompRh(t.rh);
  if (rh.length !== 16) throw new Error(`chordLibrary: ${t.id} のRHは16セルでない（${rh.length}）`);
  const lh = t.lh ? parseCompLh(t.lh) : undefined;
  if (lh && lh.length !== 16) throw new Error(`chordLibrary: ${t.id} のLHは16セルでない（${lh.length}）`);
  return {
    id: t.id, genre: t.genre, scenes: t.scenes, grid: 16, tempoMin: t.tempoMin, tempoMax: t.tempoMax,
    mode: t.mode, style: t.style, strumMs: t.strumMs, powerChord: t.powerChord, openClose: t.openClose,
    roles: t.roles, rh, lh, rhPattern: t.rh, lhPattern: t.lh,
  };
};

// ── 鍵盤／ピアノ13型（piano-comping-vocabulary §1） ─────────────────────────
// LH は data-only（今回配線しない）。RH の vel＝正典 §5-1 の設計（要所を >/o、既定は A=normal）。
const KEYBOARD_TYPES: CompType[] = [
  T({ id: "PB-WHOLE", genre: "ballad", scenes: "バラードAメロ/イントロ（白玉・ペダル）", tempoMin: 60, tempoMax: 85, mode: "strum", style: "keyboard", roles: ["intro", "verse"],
    rh: "A - - - | A - - - | A - - - | A - - -", lh: "R - - - | - - - - | - - - - | - - - -" }),
  T({ id: "PB-ARP8", genre: "ballad", scenes: "バラード全般（8分アルペジオ）", tempoMin: 60, tempoMax: 90, mode: "arp", style: "keyboard", roles: ["verse", "prechorus", "bridge"],
    rh: "A - A - | A - A - | A - A - | A - A -", lh: "R - - - | - - - - | 5 - - - | - - - -" }),
  T({ id: "PB-ARP16", genre: "ballad", scenes: "R&B/ソウルバラード（16分うねり）", tempoMin: 65, tempoMax: 95, mode: "arp", style: "keyboard", roles: ["chorus"],
    rh: "A A A A | A A A A | A A A A | A A A A", lh: "R - - - | 5 - - - | R - - - | 5 - - -" }),
  T({ id: "PR-8TH", genre: "rock", scenes: "ロックAメロ/サビ（8分刻み）", tempoMin: 90, tempoMax: 140, mode: "strum", style: "keyboard", roles: ["verse", "chorus", "interlude"],
    rh: "A . A . | A . A . | A . A . | A . A .", lh: "R . R . | R . R . | R . R . | R . R ." }),
  T({ id: "PR-SUS", genre: "rock", scenes: "ロックサビ（白玉＋打ち直し）", tempoMin: 90, tempoMax: 140, mode: "strum", style: "keyboard", roles: ["chorus", "bridge"],
    rh: "A - - - | - - - - | A - - - | - - - -", lh: "R - - - | - - - - | 5 - - - | - - - -" }),
  T({ id: "CP-SYNC16", genre: "citypop", scenes: "シティポップ・エレピ（裏食いシンコペ）", tempoMin: 85, tempoMax: 115, mode: "strum", style: "keyboard", roles: ["verse", "prechorus", "chorus"],
    rh: "A - . . | . . A - | . . A - | . . A .", lh: "R - - - | - - - - | - - 5 - | - - - -" }),
  T({ id: "CP-16CUT", genre: "citypop", scenes: "AOR/ファンク（16分カッティング的・staccato）", tempoMin: 90, tempoMax: 110, mode: "strum", style: "keyboard", openClose: "open", roles: ["verse", "chorus", "interlude"],
    rh: "A . A . | . A . A | . A . . | A . A .", lh: "R - - - | - - - - | 5 - - - | - - - -" }),
  T({ id: "DN-OFFBEAT", genre: "dance", scenes: "4つ打ち/EDM（裏スタブ・staccato）", tempoMin: 118, tempoMax: 130, mode: "strum", style: "keyboard", roles: ["verse", "chorus"],
    rh: ". . > . | . . > . | . . > . | . . > .", lh: "R . . . | R . . . | R . . . | R . . ." }),
  T({ id: "DN-ANTICIP", genre: "dance", scenes: "ハウスサビ（前借り連打）", tempoMin: 120, tempoMax: 128, mode: "strum", style: "keyboard", roles: ["chorus", "bridge"],
    rh: "A - - - | - - A - | A - - - | - - A -", lh: "R . . . | . . . . | 5 . . . | . . . ." }),
  T({ id: "AN-VERSE", genre: "anison", scenes: "アニソン/ボカロAメロ（8分刻み）", tempoMin: 130, tempoMax: 175, mode: "strum", style: "keyboard", roles: ["verse", "prechorus"],
    rh: "A . A . | A . A . | A . A . | A . A .", lh: "R . R . | R . R . | R . R . | R . R ." }),
  T({ id: "AN-CHORUS", genre: "anison", scenes: "アニソン/ボカロサビ（16分密アルペジオ）", tempoMin: 130, tempoMax: 180, mode: "arp", style: "keyboard", roles: ["chorus", "bridge"],
    rh: "A A A A | A A A A | A A A A | A A A A", lh: "R - - - | 5 - - - | R - - - | 5 - - -" }),
  T({ id: "GS-STRIDE", genre: "gospel", scenes: "ゴスペル/カントリー（boom-chuck・裏で和音）", tempoMin: 90, tempoMax: 130, mode: "strum", style: "keyboard", roles: ["verse", "chorus"],
    rh: ". . . . | > - - - | . . . . | > - - -", lh: "R - - - | - - - - | 5 - - - | - - - -" }),
  T({ id: "JZ-CHARL", genre: "jazz", scenes: "ジャズ・コンピング（チャールストン＝拍1＋2.5拍）", tempoMin: 80, tempoMax: 220, mode: "strum", style: "keyboard", roles: ["verse", "chorus", "bridge"],
    rh: "> . . . | . . A . | . . . . | . . . .", lh: "R - - - | - - - - | 5 - - - | - - - -" }),
];

// ── ギターストラム13型（guitar-comping-vocabulary §2）。D/U→vel・ghost はチャック ────────────
// strumMs＝弦順ロール相場（バラード遅=25／中=14／速・カッティング=8。全て**要耳較正**・guitar §3.5）。
// LH は不要（低音弦＝root は voiceGuitar が土台に持つ）。
const GUITAR_TYPES: CompType[] = [
  T({ id: "GT-DOWN4", genre: "rock", scenes: "4つ打ちダウン（硬派・安定）", tempoMin: 60, tempoMax: 120, mode: "strum", style: "guitar", strumMs: 22, roles: ["intro", "verse", "chorus"],
    rh: "D - - - | D - - - | D - - - | D - - -" }),
  T({ id: "GT-DOWN8", genre: "rock", scenes: "8分オールダウン（パンク/ハードロックの推進）", tempoMin: 100, tempoMax: 180, mode: "strum", style: "guitar", strumMs: 12, roles: ["verse", "chorus", "interlude"],
    rh: "D - D - | D - D - | D - D - | D - D -" }),
  T({ id: "GT-DU8", genre: "folk", scenes: "8分ダウンアップ（ポップ/フォークの基本）", tempoMin: 80, tempoMax: 140, mode: "strum", style: "guitar", strumMs: 14, roles: ["verse", "chorus"],
    rh: "D - U - | D - U - | D - U - | D - U -" }),
  T({ id: "GT-FOLK8", genre: "folk", scenes: "フォーク定番（D-DU-UDU・万能）", tempoMin: 80, tempoMax: 140, mode: "strum", style: "guitar", strumMs: 14, roles: ["verse", "prechorus", "chorus"],
    rh: "D - . - | D - U - | . - U - | D - U -" }),
  T({ id: "GT-BALLAD", genre: "folk", scenes: "弾き語りバラード（2拍目頭抜き・エモい）", tempoMin: 60, tempoMax: 100, mode: "strum", style: "guitar", strumMs: 26, roles: ["intro", "verse", "bridge"],
    rh: "D - - - | - - U - | . - U - | D - U -" }),
  T({ id: "GT-DOWN16", genre: "rock", scenes: "16分オールダウン（重い推進）", tempoMin: 70, tempoMax: 110, mode: "strum", style: "guitar", strumMs: 8, roles: ["verse", "chorus"],
    rh: "D D D D | D D D D | D D D D | D D D D" }),
  T({ id: "GT-DU16", genre: "pop", scenes: "16分ダウン＋アップ補完（速い曲の16分維持）", tempoMin: 100, tempoMax: 160, mode: "strum", style: "guitar", strumMs: 8, roles: ["verse", "chorus"],
    rh: "D U D U | D U D U | D U D U | D U D U" }),
  T({ id: "GT-POP16", genre: "pop", scenes: "16ポップ（16分混合・ネオソウル寄り）", tempoMin: 90, tempoMax: 130, mode: "strum", style: "guitar", strumMs: 10, roles: ["verse", "chorus"],
    rh: "D . D U | . U . U | D . D U | . U . U" }),
  T({ id: "GT-FUNK16", genre: "funk", scenes: "16ファンク・カッティング（チキンスクラッチ）", tempoMin: 90, tempoMax: 130, mode: "strum", style: "guitar", strumMs: 8, roles: ["verse", "interlude"],
    rh: "d x x x | d x x x | d x x x | d x x x" }),
  T({ id: "GT-FUNKSYNC", genre: "funk", scenes: "ファンク・シンコペ（Nile Rodgers 型16分チャンク）", tempoMin: 100, tempoMax: 130, mode: "strum", style: "guitar", strumMs: 8, roles: ["chorus", "bridge"],
    rh: "x x D U | x d x x | x D x U | d x x x" }),
  T({ id: "GT-SKANK", genre: "reggae", scenes: "レゲエ/スカ・スキャンク（裏拍チョップ）", tempoMin: 80, tempoMax: 160, mode: "strum", style: "guitar", strumMs: 8, roles: ["verse", "chorus"],
    rh: ". . d . | . . d . | . . d . | . . d ." }),
  T({ id: "GT-POWER16", genre: "metal", scenes: "パワーコード刻み（16分ダウン＋ブリッジミュート）", tempoMin: 120, tempoMax: 200, mode: "strum", style: "guitar", strumMs: 8, powerChord: true, roles: ["verse", "chorus", "interlude"],
    rh: "D D D D | D D D D | D D D D | D D D D" }),
  T({ id: "GT-BACKBEAT", genre: "rock", scenes: "8ビート・バックビート強調（2/4拍アクセント）", tempoMin: 90, tempoMax: 140, mode: "strum", style: "guitar", strumMs: 12, roles: ["verse", "chorus"],
    rh: "D - U - | d - U - | D - U - | d - U -" }),
];

export const COMP_TYPES: CompType[] = [...KEYBOARD_TYPES, ...GUITAR_TYPES];

export function compTypeById(id: string): CompType | undefined { return COMP_TYPES.find((t) => t.id === id); }

// ジャンル×役割→候補型ID（正典 §1 の適用セクション準拠・優先順）。tempo で絞れないときの fallback 母集団。
const GENRE_TABLE: Record<string, Partial<Record<Role, string[]>>> = {
  // E2E所見(2026-07-22)修正：ballad にギター弾き語り(GT-BALLAD)・rock にギターロック型(genre:"rock" なのに表から
  //   漏れていた GT-DOWN4/8/16・GT-BACKBEAT)を補充＝「聴いて選ぶ」の語彙を鍵盤/ギター混成に。
  ballad: { intro: ["PB-WHOLE", "GT-BALLAD"], verse: ["PB-WHOLE", "PB-ARP8", "GT-BALLAD"], prechorus: ["PB-ARP8"], chorus: ["PB-ARP16", "PB-WHOLE"], bridge: ["PB-ARP8", "GT-BALLAD"], outro: ["PB-WHOLE"] },
  rock: { intro: ["PR-8TH", "GT-DOWN4"], verse: ["PR-8TH", "GT-BACKBEAT", "GT-DOWN8"], prechorus: ["PR-8TH"], chorus: ["PR-SUS", "PR-8TH", "GT-DOWN8", "GT-BACKBEAT"], bridge: ["PR-SUS"], interlude: ["PR-8TH", "GT-DOWN16"], outro: ["PR-8TH"] },
  citypop: { intro: ["CP-SYNC16"], verse: ["CP-SYNC16", "CP-16CUT"], prechorus: ["CP-SYNC16"], chorus: ["CP-16CUT", "CP-SYNC16"], bridge: ["CP-SYNC16"], interlude: ["CP-16CUT"], outro: ["CP-SYNC16"] },
  dance: { intro: ["DN-OFFBEAT"], verse: ["DN-OFFBEAT"], prechorus: ["DN-ANTICIP"], chorus: ["DN-ANTICIP", "DN-OFFBEAT"], bridge: ["DN-OFFBEAT"], outro: ["DN-OFFBEAT"] },
  anison: { intro: ["AN-VERSE"], verse: ["AN-VERSE"], prechorus: ["AN-VERSE"], chorus: ["AN-CHORUS", "AN-VERSE"], bridge: ["AN-CHORUS"], interlude: ["AN-VERSE"], outro: ["AN-VERSE"] },
  gospel: { verse: ["GS-STRIDE"], chorus: ["GS-STRIDE"], bridge: ["GS-STRIDE"] },
  jazz: { verse: ["JZ-CHARL"], chorus: ["JZ-CHARL"], bridge: ["JZ-CHARL"] },
  folk: { intro: ["GT-BALLAD"], verse: ["GT-FOLK8", "GT-DU8"], prechorus: ["GT-DU8"], chorus: ["GT-FOLK8", "GT-DOWN8"], bridge: ["GT-BALLAD"], outro: ["GT-BALLAD"] },
  funk: { verse: ["GT-FUNK16"], chorus: ["GT-FUNKSYNC", "GT-FUNK16"], bridge: ["GT-FUNKSYNC"], interlude: ["GT-FUNK16"] },
  reggae: { verse: ["GT-SKANK"], chorus: ["GT-SKANK"], bridge: ["GT-SKANK"] },
  pop: { verse: ["GT-DU16", "GT-POP16"], prechorus: ["GT-POP16"], chorus: ["GT-POP16", "GT-DU16"], bridge: ["GT-POP16"] },
  metal: { verse: ["GT-POWER16", "GT-DOWN16"], chorus: ["GT-POWER16"], bridge: ["GT-POWER16"], interlude: ["GT-DOWN16"] },
};
// ジャンル名エイリアス（表記ゆれ→正準キー）。未知は null＝パターン経路を発火させない（従来 bit 一致へ落ちる）。
const GENRE_ALIAS: Record<string, string> = {
  slow: "ballad", jballad: "ballad", piano: "ballad",
  band: "rock", hardrock: "rock", jrock: "rock",
  city_pop: "citypop", citypop: "citypop", aor: "citypop",
  edm: "dance", house: "dance", techno: "dance", trance: "dance",
  anime: "anison", vocaloid: "anison", vocarock: "anison",
  soul: "gospel", rnb: "gospel",
  swing: "jazz", bossa: "jazz",
  acoustic: "folk", singersongwriter: "folk", country: "folk",
  disco: "funk",
  ska: "reggae",
  punk: "metal", metalcore: "metal",
};

// ジャンル名＋役割/tempo→候補型を絞り seed で1つ選ぶ（決定的）。無ければ null（＝従来経路へフォールバック）。
// テンポ指定時は**域内の型のみ**適格（bassLibrary pickBassType と同流儀）＝域外の型はジャンル指定で選ばれない。
//   域内が皆無なら null（域外を無理に選ばない）。テンポ未指定なら全候補から選ぶ。
export function pickCompType(genre: string, role: Role | undefined, tempo: number | undefined, seed: number): CompType | null {
  const g = GENRE_ALIAS[genre] ?? genre;
  const table = GENRE_TABLE[g];
  if (!table) return null;
  const ids = table[role ?? "verse"] ?? table.verse ?? [];
  const cands = ids.map(compTypeById).filter((t): t is CompType => !!t);
  if (cands.length === 0) return null;
  let pool = cands;
  if (tempo != null) {
    const inRange = cands.filter((t) => tempo >= t.tempoMin && tempo <= t.tempoMax);
    if (inRange.length === 0) return null; // 域外の型は選ばない（ジャンル指定時）
    pool = inRange;
  }
  return pool[((seed % pool.length) + pool.length) % pool.length] ?? null;
}

// スライスC「聴いて選ぶ」＝候補を複数（別々の型＝distinct id）返す（genChordPattern variety 用）。
//   ジャンル名＝GENRE_TABLE[genre] の**全役割の型IDを union**（role 指定時はその役割を先頭に優先）＝ジャンルの
//     全語彙から候補を出す（単一 role の 1〜2 型では「候補を出す」に足りない）。
//   おまかせ（omakase/any/all）＝全 COMP_TYPES を role 適用可否＋tempo で絞る（role/tempo 全体から）。
//   tempo 域で絞り（域内皆無＝空＝従来経路へ fallback）、seed 起点の回転で最大 n 件（決定的）。
export function pickCompTypes(genre: string, role: Role | undefined, tempo: number | undefined, seed: number, n: number): CompType[] {
  const N = Math.max(1, Math.floor(n));
  const g = GENRE_ALIAS[genre] ?? genre;
  let cands: CompType[];
  if (g === "omakase" || g === "any" || g === "all") {
    cands = COMP_TYPES.filter((t) => !role || t.roles.includes(role));
    if (cands.length === 0) cands = COMP_TYPES.slice(); // role 該当皆無＝全型（絞り過ぎ回避）
  } else {
    const table = GENRE_TABLE[g];
    if (!table) return [];
    const roleIds = table[role ?? "verse"] ?? table.verse ?? [];
    const allIds = Object.values(table).flat(); // ジャンルの全語彙（全役割）
    const orderedIds = [...roleIds, ...allIds]; // role の型を先頭に優先
    cands = orderedIds.map(compTypeById).filter((t): t is CompType => !!t);
    if (cands.length === 0) return [];
  }
  // tempo 域で絞る。**域内皆無＝空にしない**＝ジャンル語彙をテンポ距離の近い順で提示（安定ソート・同距離は元優先順）。
  //   理由（E2E所見 2026-07-22）：section 既定 tempo120 で ballad(max95)/citypop(max115) が全滅→従来経路の汎用1件に
  //   落ち「聴いて選ぶ」が成立しなかった。トレイの目的は候補提示＝空トレイより域外提示（型は敷けば鳴る・要耳較正）。
  //   ※単数経路 pickCompType（style ノブ）は従来どおり厳格（域外 null）＝挙動不変。
  if (tempo != null) {
    const inRange = cands.filter((t) => tempo >= t.tempoMin && tempo <= t.tempoMax);
    if (inRange.length > 0) cands = inRange;
    else {
      const dist = (t: CompType) => (tempo < t.tempoMin ? t.tempoMin - tempo : tempo - t.tempoMax);
      cands = cands.map((t, i) => ({ t, i })).sort((a, b) => dist(a.t) - dist(b.t) || a.i - b.i).map((x) => x.t);
    }
  }
  // distinct（id）＝重複型を出さない。順序は上の優先を保つ。
  const uniq: CompType[] = [];
  const seen = new Set<string>();
  for (const t of cands) if (!seen.has(t.id)) { seen.add(t.id); uniq.push(t); }
  // seed 起点の回転で最大 N 件（決定的）。
  const start = ((seed % uniq.length) + uniq.length) % uniq.length;
  const out: CompType[] = [];
  for (let i = 0; i < uniq.length && out.length < N; i++) out.push(uniq[(start + i) % uniq.length]!);
  return out;
}
