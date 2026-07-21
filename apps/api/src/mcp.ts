import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Core } from "./core";
import type { Neta } from "./types";
import { loadChordTransitions, hasChordTransitions, loadSkeletonPriors, skeletonDegPrior } from "./music/corpusStats"; // (D)コード遷移＋(WP-M1)骨格degHist prior＝生成を実J-POP手癖へ寄せる（既定OFF）
import {
  identifyProgression,
  analyzeProgression,
  explainProgression,
  substitutesOf,
  emotionShift,
  toDegrees,
  harmonize,
  nextChordCandidates,
  genChords,
  genMelody,
  genMelodyCandidates,
  genLyricMelodyCandidates,
  genSkeletonCandidates,
  genFromEssence,
  genBass,
  genCounter,
  genRiff,
  genSectionInst,
  genDrums,
  analyzeFit,
  fitToChords,
  detectKeyFromNotes,
  melodySimilarity,
  findSimilar,
  similarityWarning,
  originalityReport,
  genNamedProgression,
  suggestClicheLines,
  suggestKeyPlan,
  suggestForm,
  suggestEnergyPlan,
  suggestEmotionParams,
  isMinorFrame,
  normalizeFrame,
  barsOf,
} from "./music";
import { checkLoop } from "./music/loopCheck"; // WP-X2 ゲームBGMループ境界チェック
import { searchNetaMerged } from "./semantic-search"; // 意味+キーワード合流（HTTP /searchと共通・2026-07-14）
import { learnMotifModelFromLibrary } from "./music/corpusBias";
import { evalMelody } from "./music/evalMelody"; // P0-c：メロの規則ベース評価（項目別critique＋変なメロ検出）を analyze に露出
import { analyzeVoiceLeading } from "./music/voiceLeading"; // #8：メロ×低音の声部進行レンズ（並行/隠伏5度8度・声部交差）
import { normRoot } from "./music/theory";
import { validateSkeletonContent, type SkeletonContent } from "./music/skeletonNeta"; // 骨格層の一級化（design #20）
import { attachMelodyVoiceLeading, attachBassVoiceLeading } from "./music/voiceLeadingReport"; // 対位法レポートの生成側露出（design #20 S3d）
import { attachMelodyLenses } from "./music/melodyLensesReport"; // 候補レンズの生成側露出（design #12-M・WP-M3）
import { attachSyncScore } from "./music/syncopationReport"; // シンコペ「ノリメーター」の生成側露出（WP-D2）
import { attachStructureWarnings } from "./music/structureValidator"; // 生成後の構造バリデータ＝dur<=0/重複onset/範囲外を警告のみ添付（2026-07-15）
import { attachHarmonicTension } from "./music/harmonicTensionReport"; // 和声張力カーブレンズの生成側露出（WP-C4）
import { splitMora, flowLyric, type LNote } from "./lyric";
import { planLyricMelody } from "./music/lyricsPlan"; // 歌詞先行メロ計画（#13d WP-L0）
import { accentsFromSyllables } from "./accent"; // W-K1 アクセント自動注入（pyopenjtalk・accents 未指定時に spawn 注入）
import { singNeta, resolveSingBpm } from "./sing"; // W-K3 VOICEVOX 歌唱出口（メロ→wav）
import { suggestLyricRhythm, analyzeLyricFit } from "@cm/music-core"; // ② 歌詞↔メロ プロソディ（design #13b・WP-M5）
import { resolveVoiceProfile } from "@cm/music-core"; // 声種プロファイル解決（WP-M4・レンズへ渡す）
import { analyzeProgressionFromUfret, extractSongTitle, fetchedToLibraryInput } from "./ingest-ufret";
import { meterInfo } from "./music/meter";
import { sanitizeRhythmParts, extractRhythmPart } from "./music/rhythmParts"; // リズムパーツ層 L1/L2＋採取（design #20 S4-1/S4-2）
import { findProgressions } from "./progression-search";
import { netaInputShape, listQueryShape, scopeEnum } from "./schemas";

// コード進行の共通 inputSchema（content.chords 形）。実音で扱う（脳に度数↔実音の変換をさせない）。
const chordsSchema = z
  .array(
    z.object({
      root: z.union([z.number(), z.string()]).describe("根音＝実音。数値はピッチクラス0-11(0=C,1=C#…)、文字列は音名(\"C\",\"F#\",\"Bb\")"),
      quality: z.string().optional().describe("コード品質（\"\"=メジャー, \"m\", \"7\", \"dim\" 等）"),
      start: z.number().optional().describe("開始位置。単位＝拍(beat)。0=曲頭、4/4なら0,4,8…"),
      dur: z.number().optional().describe("長さ。単位＝拍(beat)。1小節=拍子の拍数"),
    }),
  )
  .describe("コード進行（content.chords 形・各 root はその曲の実音ピッチクラス）");

// WP-X2 ループ本体の範囲（小節・0起点）。update_song / check_loop で共用。
const loopShape = z.object({
  startBar: z.number().describe("ループ本体の先頭小節（0起点）"),
  endBar: z.number().describe("ループ本体の末尾小節（この小節末で startBar へ戻る）"),
  tailBars: z.number().optional().describe("頭へ重ねる余韻の尺（小節・テール処理ヒント）"),
});

// (c) ok() の膨張抑制（A2・design #6c）：JSON.stringify(data,null,2) は数千点の数値配列を要素ごとに
// 改行＋インデントし raw を ×2.6〜3.3 に膨らませる（chat の token 爆発の増幅器・research 2026-07-15-chat-analysis-e2e §1）。
// → **数値(または null)だけの配列はインライン**（改行なし）で直列化し、それ以外は従来どおり 2space pretty（可読性維持）。
// 出力は valid JSON のまま＝JSON.parse 互換（既存テストは parse して読むので不変）。
export function serializeCompact(value: unknown, indent = ""): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    // 数値/null だけの配列＝インライン（melody_f0 の [t,hz|null] ペア等はこれで1行に畳まれる）。
    if (value.every((v) => v === null || typeof v === "number")) {
      return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    }
    const inner = indent + "  ";
    return `[\n${value.map((v) => inner + serializeCompact(v, inner)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";
  const inner = indent + "  ";
  const body = entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${serializeCompact(v, inner)}`).join(",\n");
  return `{\n${body}\n${indent}}`;
}
const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: serializeCompact(data) }],
});
const err = (msg: string) => ({
  content: [{ type: "text" as const, text: msg }],
  isError: true,
});

// ── A2: MCP面の facts 射影（design #6a/#6b）。chat面の read_neta/search が analysis ネタの巨大 raw を
//    丸ごと返し token 上限(~25K)を4〜5倍超過する件の是正。full面（ワークベンチ/既存クライアント）は不変＝
//    射影は surface="chat" でのみ効かせる（既定 bit一致の原則）。

/** raw の巨大時系列フィールドをチャット推論向けの小さな統計要約に置換（フル配列は read_neta({fields}) で）。 */
export function summarizeRawField(key: string, val: unknown): unknown {
  if (!Array.isArray(val)) return val;
  const n = val.length;
  const base = { _summary: true as const, count: n };
  if (n === 0) return base;
  const nums = (xs: unknown[]) => xs.filter((x): x is number => typeof x === "number");
  const range = (xs: number[]) => (xs.length ? [Math.min(...xs), Math.max(...xs)] : null);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  switch (key) {
    case "melody_f0": {
      // [[t_sec, hz|null], …]
      const rows = val as [number, number | null][];
      const ts = nums(rows.map((r) => r?.[0]));
      const hz = nums(rows.map((r) => r?.[1]));
      return { ...base, time_range: range(ts)?.map(r2), voiced_count: hz.length,
        voiced_ratio: r2(hz.length / n), hz_range: range(hz)?.map(r2) };
    }
    case "melody_notes":
    case "bass_notes": {
      // [[start_sec, end_sec, midi], …]
      const rows = val as [number, number, number][];
      const starts = nums(rows.map((r) => r?.[0]));
      const ends = nums(rows.map((r) => r?.[1]));
      const midis = nums(rows.map((r) => r?.[2]));
      return { ...base, time_range: starts.length ? [r2(Math.min(...starts)), r2(Math.max(...ends))] : null,
        pitch_range: range(midis) };
    }
    case "beat_times": {
      const ts = nums(val as number[]);
      const iv: number[] = [];
      for (let i = 1; i < ts.length; i++) iv.push(ts[i]! - ts[i - 1]!);
      const med = iv.length ? [...iv].sort((a, b) => a - b)[Math.floor(iv.length / 2)]! : null;
      return { ...base, time_range: range(ts)?.map(r2), median_interval_sec: med != null ? r2(med) : null,
        implied_bpm: med ? Math.round(60 / med) : null };
    }
    case "drum_onsets": {
      // [[t_sec, kind, strength], …]
      const rows = val as [number, string, number][];
      const kinds: Record<string, number> = {};
      for (const r of rows) { const k = String(r?.[1] ?? "?"); kinds[k] = (kinds[k] ?? 0) + 1; }
      return { ...base, time_range: range(nums(rows.map((r) => r?.[0])))?.map(r2), kinds };
    }
    default:
      return base;
  }
}

const RAW_TIMESERIES = ["melody_f0", "melody_notes", "beat_times", "drum_onsets", "bass_notes"];

/** (a) analysis ネタを chat 向けに射影：meta/overlay/prose/digest/chords_timeline は素通し、
 *  raw の巨大時系列は統計要約（fields[] で指定したフィールドだけフル素通し＝ワークベンチ用途温存）。 */
export function projectAnalysisForChat(neta: Neta, fields?: string[]): Neta {
  const c = neta.content as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || Array.isArray(c)) return neta;
  const raw = (c.raw ?? null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return neta;
  const keep = new Set(fields ?? []);
  const projRaw: Record<string, unknown> = {};
  // chords_timeline は軽量かつチャット推論に有用＝常に素通し。
  if ("chords_timeline" in raw) projRaw.chords_timeline = raw.chords_timeline;
  for (const key of RAW_TIMESERIES) {
    if (!(key in raw)) continue;
    projRaw[key] = keep.has(key) ? raw[key] : summarizeRawField(key, raw[key]);
  }
  // raw のその他フィールド（将来追加）は素通し（未知は落とさない）。
  for (const [k, v] of Object.entries(raw)) {
    if (k === "chords_timeline" || RAW_TIMESERIES.includes(k)) continue;
    projRaw[k] = v;
  }
  return { ...neta, content: { ...c, raw: projRaw } };
}

/** (b) search のヒットを要約射影：id/kind/title/tags/key/meter＋冒頭プレビュー。フルは read_neta へ誘導。 */
export function summarizeNetaForSearch(neta: Neta): Record<string, unknown> {
  const c = neta.content as Record<string, unknown> | null;
  let preview: string | null = null;
  if (typeof neta.text === "string" && neta.text.trim()) preview = neta.text.slice(0, 200);
  else if (c && typeof c === "object" && typeof c.prose === "string") preview = (c.prose as string).slice(0, 200);
  else if (c && typeof c === "object") {
    const notes = Array.isArray(c.notes) ? c.notes.length : null;
    const chords = Array.isArray(c.chords) ? c.chords.length : null;
    if (notes != null) preview = `melody: ${notes} notes`;
    else if (chords != null) preview = `chords: ${chords} 和音`;
  }
  const mt = (neta as { matchType?: string }).matchType;
  return {
    id: neta.id, kind: neta.kind, title: neta.title, tags: neta.tags,
    key: neta.key, mode: neta.mode, meter: neta.meter, mood: neta.mood, tempo: neta.tempo,
    scope: neta.scope, updated: neta.updated,
    ...(mt ? { matchType: mt } : {}),
    preview,
    _hint: "要約射影。全文/facts は read_neta(id) で（analysis は fields:[...] でフル配列）",
  };
}

/**
 * MCPツール層（docs/design.md #20）。TSの操作コアを AIクライアント（Claude Code/Desktop 等）に公開。
 * HTTP と同じ Core を叩く＝同一操作の別アダプタ。
 */
// 共通 verbs / legacy 両方が使う共有スキーマ（モジュール級＝surface 分岐の外に置く）。
const oneChord = z.object({
  root: z.union([z.number(), z.string()]).describe("根音＝実音。数値はピッチクラス0-11(0=C…)、文字列は音名"),
  quality: z.string().optional().describe("コード品質（\"\"=メジャー, \"m\", \"7\" 等）"),
});
const frameSchema = z
  .object({
    key: z.number().int().min(0).max(11).optional().describe("主音のピッチクラス0-11（0=C,7=G…）。生成はこの調の実音で返る"),
    meter: z.string().optional().describe("拍子＝\"分子/分母\"文字列（例 \"4/4\",\"3/4\",\"6/8\"）"),
    tempo: z.number().optional().describe("テンポ＝BPM（密度の判断にも使う）"),
    bars: z.number().int().optional().describe("小節数（1コール=この小節数の“1つ”の構造。1-64にクランプ＝安全弁。超過は meta.warnings で明示）"),
    mood: z.string().optional().describe("雰囲気＝自由文字列。「切ない/悲し/dark/sad」等は短調・疎、「明るい/速い/ダンス」等は密に効く"),
    mode: z.enum(["major", "minor"]).optional().describe("長短の明示（moodの推定より優先。セクション文脈の生成はこれを渡す）"),
    section: z
      .object({
        role: z.enum(["intro", "verse", "prechorus", "chorus", "bridge", "interlude", "outro"]).optional().describe("セクション役割。これを書くだけで役割別プリセット（サビ=高音域+高密度、Aメロ=控えめ 等）が自動で効く。明示ノブ（density等）があればそちらが勝つ。mood(雰囲気)とは直交する構造上の位置"),
        prevRole: z.enum(["intro", "verse", "prechorus", "chorus", "bridge", "interlude", "outro"]).optional().describe("直前セクションの役割（接続の判断材料）"),
        nextRole: z.enum(["intro", "verse", "prechorus", "chorus", "bridge", "interlude", "outro"]).optional().describe("直後セクションの役割（末尾の開き/締めの判断材料）"),
        seedMotif: z.array(z.object({ pitch: z.number(), start: z.number().optional(), dur: z.number().optional() })).optional().describe("前セクションの代表モチーフ（実音ノート列）。渡すと先頭ブロックがこの動機を種に再展開＝verse↔chorus のモチーフ共有"),
        prevEndPitch: z.number().optional().describe("前セクション最終音のMIDI番号（骨格開始音の近傍＝接続を滑らかに）"),
        energy: z.number().min(0).max(1).optional().describe("0..1。明示時のみ density/registerShift のプリセットを線形スケール（0.5=既定値）。曲全体アークの自動適用はしない"),
      })
      .optional()
      .describe("セクション役割文脈（2026-07-10）。role を書くだけで役割別プリセットが効く。未指定＝従来動作"),
    voice_profile: z
      .union([
        z.string().describe("プリセット名：female_pop/male_pop/mix/vocaloid（女性/男性/ミックス/ボカロ・別表記可）"),
        z.object({
          base: z.string().optional().describe("土台プリセット名（省略時=女性平均に部分上書き）"),
          low: z.number().optional(), tessLow: z.number().optional(), tessHigh: z.number().optional(),
          chestTop: z.number().optional(), falsettoTop: z.number().optional(),
          passaggioLow: z.number().optional(), passaggioHigh: z.number().optional(),
          vocaloid: z.boolean().optional().describe("ボカロ緩和（跳躍/密度/母音/パッサッジョの難度ペナ無効＋C6開放）"),
          name: z.string().optional(),
        }).describe("カスタム声種＝base プリセット＋部分上書き（MIDI番号・60=C4）"),
      ])
      .optional()
      .describe("声種プロファイル（WP-M4）。歌唱難度レンズの評価基準＋生成の音域窓を声種の tessitura へ追従させる。vocaloid=ボカロモード（C6まで開放・人声制約の難度ペナ無効）。未指定＝女性平均相当・従来動作(bit一致)"),
    palette: z.enum(["ionian", "mixolydian", "aeolian", "dorian"]).optional().describe("旋法パレット（WP-C1）。mode の下の色＝ionian(明るい王道)/mixolydian(♭VII・ロック土臭)/aeolian(切ない民族)/dorian(♮6・IV長・浮遊おしゃれ)。mode(長短)とは直交＝scalePcs 差替でメロ/ベースが旋法に追従。未指定＝mode から ionian(major)/aeolian(minor)＝従来 bit 一致"),
  })
  .optional();
const notesSchema = z
  .array(
    z.object({
      pitch: z.number().describe("MIDIノート番号0-127（60=中央C）。ピッチクラス0-11ではない"),
      start: z.number().optional().describe("開始位置。単位＝拍(beat)。0=曲頭"),
      dur: z.number().optional().describe("長さ。単位＝拍(beat)。0.5=八分音符"),
    }),
  )
  .describe("ノート列（pitch=MIDI番号・start/dur=拍）");

// #100/#101: surface="chat" は **共通 verbs だけ**公開（legacy を隠す＝モデルが旧ツールを掴まない）。"full"(既定)＝共通+legacy（test互換）。本数は増える＝2026-07-15現在 chat26/legacy45/full71。
export function buildMcpServer(core: Core, opts: { surface?: "chat" | "full" } = {}): McpServer {
  const server = new McpServer({ name: "creative-manager", version: "0.0.0" });
  const legacy = opts.surface !== "chat";
  const isChat = opts.surface === "chat"; // A2: 射影は chat面のみ（full面＝ワークベンチ/既存クライアントは bit一致で不変）

  if (legacy) {
  server.registerTool(
    "create_neta",
    {
      title: "ネタを作成（捕獲）",
      description: "「この歌詞を置いておいて」「このメロを保存して」のように、手持ちの素材を仕舞っておきたいとき使う。歌詞は kind:\"lyric\" にして text へ歌詞本文を書く（メロは kind:\"melody\"、コードは kind:\"chord\" など）。ネタ（歌詞/メロ/コード/ベース/リズム/テーマ/曲など）を新規作成する。",
      inputSchema: netaInputShape, // SSOT(schemas.ts)＝http/型と共有
    },
    async (args) => ok(core.createNeta(args)),
  );

  server.registerTool(
    "list_neta",
    {
      title: "ネタ検索（ファセット）",
      description: "kind/mood/key/meter/tags/q で絞り込み一覧。scope 既定 project（ユーザー作業ネタ）。library=連想元コーパス、all=両方。意味検索は後日。",
      inputSchema: listQueryShape, // SSOT(schemas.ts)
    },
    async (args) => ok(core.listNeta(args)),
  );

  server.registerTool(
    "facets",
    { title: "ファセット候補", description: "絞り込みに使える値の一覧", inputSchema: {} },
    async () => ok(core.facets()),
  );

  // library→project コピー（複製汎用にも）。元は不変・子孫も deep copy。新規 project ネタを返す。
  server.registerTool(
    "copy_neta",
    {
      title: "ネタを複製（library→project）",
      description: "id のネタを複製。library の連想元を project にコピーして使う／任意ネタの複製に。section は子も deep copy。元は不変。",
      inputSchema: { id: z.string(), scope: scopeEnum.optional().describe("既定project") },
    },
    async ({ id, scope }) => {
      const n = core.copyNeta(id, scope ?? "project");
      return n ? ok(n) : err("not found");
    },
  );

  // 浅い分家（vary＝変奏の一級化・design「分家モデル」S2・kind 非依存）。子は参照共有＋variant_of の系譜。
  server.registerTool(
    "vary",
    {
      title: "分家（浅い変奏）",
      description:
        "id のネタを浅く分家＝**子ネタは参照共有**（compose_edge を同 position/ord で複製・deep copy しない）＋新→元へ variant_of。container（section/song）＝frame(key/mode/bars)/role/title を分家側で自由に変える起点／リーフ（melody 等）＝content コピー＋系譜。copy_neta（別物にする＝deep copy）との違いは『同じものとして育てる（系譜が残る）』こと。転調ラスサビ/落ちサビ/2番Aメロの土台。title 既定＝「元title′」。",
      inputSchema: { id: z.string(), title: z.string().optional(), scope: scopeEnum.optional().describe("既定=元と同じ") },
    },
    async ({ id, title, scope }) => {
      const n = core.varyNeta(id, { title, scope });
      return n ? ok(n) : err("not found");
    },
  );

  // 共有検出（分家の安全弁）：このネタが何箇所で配置されているか＝copy-on-write プロンプト/共有バッジの土台。
  server.registerTool(
    "get_placements",
    {
      title: "配置箇所（共有検出）",
      description:
        "id のネタが compose_edge で何箇所に配置されているかを逆引き。返り＝{parents:[{parentId,positions}], placementCount}。placementCount>=2 で『共有』（親2以上 or 同親2配置以上）＝分家の安全弁の判定に使う。",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => ok(core.placementsOf(id)),
  );

  // scope 切替（自作を連想元へ＝library に移す等）。
  server.registerTool(
    "set_scope",
    {
      title: "ネタの scope を切替",
      description: "ネタを project↔library に移す。自作の進行/曲を library に移す＝連想の素材にする。",
      inputSchema: { id: z.string(), scope: scopeEnum },
    },
    async ({ id, scope }) => {
      const n = core.setScope(id, scope);
      return n ? ok(n) : err("not found");
    },
  );

  server.registerTool(
    "get_neta",
    { title: "ネタ取得", description: "id でネタを取得", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const n = core.getNeta(id);
      return n ? ok(n) : err("not found");
    },
  );

  // 連想エンジン（read-only・#20 ドメインTSをMCP公開）。agentic Chat が「これ何進行？/なぜ」に答える。
  server.registerTool(
    "identify_progression",
    {
      title: "進行の名前あて",
      description:
        "コード進行が定番進行（丸の内/カノン/小室/王道/アクシス/エオリアン/ツーファイブ/ブルース）のどれに近いかを近い順に返す。回転・移調に強い。調未指定なら推定。「これ何進行？」に。",
      inputSchema: { chords: chordsSchema, key: z.number().int().min(0).max(11).optional() },
    },
    async ({ chords, key }) => {
      const res = identifyProgression(chords, key !== undefined ? { key } : {});
      // I2(2026-07-08)：類似度floor無しで常に「何かに当たる」誤断定を可視化＝確度低は明示（無関係2コードでも0.667が出る）。
      const top = res[0]?.similarity ?? 0;
      const payload: { results: typeof res; note?: string } = { results: res };
      if (top < 0.8) payload.note = `確度低（最上位でも類似度${top}）＝どの定番進行にも十分近くない。参考程度に`;
      return ok(payload);
    },
  );

  server.registerTool(
    "analyze_progression",
    {
      title: "進行の機能解析",
      description:
        "コード進行を 度数・ローマ数字・機能(T/S/D)・終止(カデンツ) で解析。「なぜそう聞こえる/構造」を語る材料。調未指定なら推定。",
      inputSchema: {
        chords: chordsSchema,
        key: z.number().int().min(0).max(11).optional(),
        mode: z.enum(["major", "minor"]).optional(),
      },
    },
    async ({ chords, key, mode }) => ok(analyzeProgression(chords, { key, mode })),
  );

  server.registerTool(
    "explain_progression",
    {
      title: "進行の説明・命名",
      description:
        "コード進行の『事実』（調・名前あて・度数/機能(T/S/D)・終止）を束ねて返す。Claudeはこれを読んで『なぜ切ない/構造』を言葉にする。理論を知らなくても分かる。",
      inputSchema: { chords: chordsSchema, key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional() },
    },
    async ({ chords, key, mode }) => ok(explainProgression(chords, { key, mode })),
  );

  // oneChord/frameSchema/notesSchema はモジュール級へ移動（surface 分岐の外）。
  server.registerTool(
    "substitute_chord",
    {
      title: "コードの代替候補",
      description:
        "進行中の1コードの代替候補（機能代理/相対/裏コード/同主調借用、next 指定でセカンダリードミナント）を返す。「3つ目の代替は？/ベタすぎる→ひねって」に。",
      inputSchema: {
        chord: oneChord,
        key: z.number().int().min(0).max(11),
        mode: z.enum(["major", "minor"]).optional(),
        next: oneChord.optional().describe("次のコード（セカンダリードミナント用）"),
      },
    },
    async ({ chord, key, mode, next }) => {
      const deg = toDegrees([chord], key)[0]!;
      const nextDeg = next ? toDegrees([next], key)[0] : undefined;
      const subs = substitutesOf(deg, { mode, next: nextDeg });
      // 度数→実音ルート(0-11)も添える（Chatが実コードで提示できるよう）。
      return ok(subs.map((s) => ({ ...s, root: (s.degree + key) % 12 })));
    },
  );

  server.registerTool(
    "emotion_shift",
    {
      title: "コードの感情シフト",
      description: "1コードを『もっと切なく(darker)/明るく(brighter)』に。ルートは変えず品質だけ。",
      inputSchema: { chord: oneChord, dir: z.enum(["darker", "brighter"]) },
    },
    async ({ chord, dir }) => {
      const deg = toDegrees([chord], 0)[0]!; // 感情シフトはルート不変＝key不要（degree=root として渡す）
      return ok(emotionShift(deg, dir).map((s) => ({ ...s, root: s.degree })));
    },
  );

  server.registerTool(
    "harmonize",
    {
      title: "メロにコードを当てる（ハモ付け）",
      description:
        "メロディ(notes)に合うコード候補を小節ごとに上位で返す。「このメロに合うコードを何案か」に。候補から選ぶのは人/Claude（質はDB蓄積で向上）。",
      inputSchema: {
        melody: z
          .array(z.object({ pitch: z.number(), start: z.number().optional(), dur: z.number().optional() }))
          .describe("メロディのノート列（pitch=MIDIノート番号0-127, 60=中央C）"),
        key: z.number().int().min(0).max(11),
        mode: z.enum(["major", "minor"]).optional(),
        barBeats: z.number().optional().describe("1小節の拍数（既定4）"),
      },
    },
    async ({ melody, key, mode, barBeats }) => ok(harmonize(melody, key, { mode, barBeats })),
  );

  server.registerTool(
    "next_chord",
    {
      title: "次のコード候補（継続）",
      description:
        "進行(chords)の最後から、機能(T/S/D)的に次に来やすいコード候補を実コードで返す。「次は？/サビへ緊張を作る」に。候補から選ぶのは人/Claude。",
      inputSchema: {
        chords: chordsSchema,
        key: z.number().int().min(0).max(11),
        mode: z.enum(["major", "minor"]).optional(),
        corpus: z.boolean().optional().describe("実J-POPコーパスの遷移統計で候補を並べ替える（既定OFF＝機能文法順）。頻度は弾かず並べるだけ＝正当性は機能文法が担保。"),
      },
    },
    async ({ chords, key, mode, corpus }) => {
      const degs = toDegrees(chords, key);
      const transitions = corpus && hasChordTransitions(core.db) ? loadChordTransitions(core.db, "pop", mode ?? "major") : undefined;
      const cands = nextChordCandidates(degs, { mode, transitions });
      return ok(cands.map((c) => ({ ...c, root: (c.degree + key) % 12 })));
    },
  );

  server.registerTool(
    "find_progressions",
    {
      title: "進行を連想で引く",
      description:
        "蓄積した進行コーパス(ネタ)から、タグ(切ない/明るい/サビ向き/アーティスト名 等)や似た進行で引く。「切ない進行/〇〇っぽいの ある？」に。該当が弱ければ弱いまま返す(捏造しない)。",
      inputSchema: {
        tags: z.array(z.string()).optional().describe("基本タグ語彙（明暗/強度/ジャンル/セクション/アーティスト/人気度）"),
        like: chordsSchema.optional().describe("この進行に似たものを探す"),
        likeKey: z.number().int().min(0).max(11).optional(),
        limit: z.number().int().optional(),
      },
    },
    async ({ tags, like, likeKey, limit }) =>
      ok(findProgressions(core, { tags, like: like ? { chords: like, key: likeKey } : undefined, limit })),
  );

  server.registerTool(
    "update_neta",
    {
      title: "ネタ更新",
      description: "フィールド/タグを更新",
      inputSchema: {
        id: z.string(),
        title: z.string().nullable().optional(),
        text: z.string().nullable().optional(),
        content: z.unknown().optional(),
        mood: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ id, ...patch }) => {
      const n = core.updateNeta(id, patch);
      return n ? ok(n) : err("not found");
    },
  );

  server.registerTool(
    "delete_neta",
    { title: "ネタ削除", description: "id で削除", inputSchema: { id: z.string() } },
    async ({ id }) => ok({ deleted: core.deleteNeta(id) }),
  );

  server.registerTool(
    "place_child",
    {
      title: "合成（子を配置）",
      description: "親ネタのタイムラインに子ネタを置く（compose_edge）。子は使い回し可。",
      inputSchema: {
        parent: z.string(),
        child: z.string(),
        position: z.number().default(0),
        ord: z.number().int().default(0),
      },
    },
    async ({ parent, child, position, ord }) => {
      core.placeChild(parent, child, position, ord);
      return ok({ ok: true });
    },
  );

  server.registerTool(
    "remove_child",
    {
      title: "配置を外す",
      description: "親から子ネタの配置を外す。position 指定で1インスタンス、省略で全インスタンス。",
      inputSchema: { parent: z.string(), child: z.string(), position: z.number().optional() },
    },
    async ({ parent, child, position }) => {
      core.removeChild(parent, child, position);
      return ok({ ok: true });
    },
  );

  server.registerTool(
    "get_composition",
    { title: "合成ツリー取得", description: "id の合成ツリーを再帰取得", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const t = core.getComposition(id);
      return t ? ok(t) : err("not found");
    },
  );

  server.registerTool(
    "link",
    {
      title: "関連を張る",
      description: "ネタ間に関連辺（related など）",
      inputSchema: { from: z.string(), to: z.string(), type: z.string().default("related") },
    },
    async ({ from, to, type }) => {
      core.link(from, to, type);
      return ok({ ok: true });
    },
  );

  server.registerTool(
    "unlink",
    {
      title: "関連を外す",
      description: "ネタ間の関連辺（related など）を外す",
      inputSchema: { from: z.string(), to: z.string(), type: z.string().default("related") },
    },
    async ({ from, to, type }) => {
      core.unlink(from, to, type);
      return ok({ ok: true });
    },
  );

  server.registerTool(
    "get_relations",
    { title: "関連取得", description: "id から張られた関連一覧", inputSchema: { id: z.string() } },
    async ({ id }) => ok(core.getRelations(id)),
  );

  server.registerTool(
    "create_job",
    {
      title: "ジョブを投げる",
      description: "対象＋意図で非同期ジョブを積む（ワーカーが処理、結果は get_job で受け取る）。",
      inputSchema: {
        // ワーカーが実際に処理できる intent のみを enum で強制（無効intentで死にジョブを作らない）
        intent: z
          .enum([
            "gen_chords_rule",
            "gen_pair_rule",
            "fit_to_chords",
            "find_similar",
            "transform",
            "mora_count",
            "import_midi",
            "research",
            "collect",
            "echo",
          ])
          .describe(
            "意図（すべて決定的 or api処理・Claude非依存）: gen_chords_rule=ルールベース(機能和声)のコード進行(params.frame), gen_pair_rule=ルールのみでコード進行+それに合うメロのペアをcount個・当てはまり保証(params.frame/count/structure), fit_to_chords=外し音をコードに合わせて補正, find_similar=近い過去メロを記号類似で探す, transform=移調/拍子替え(条件付き・決定的), mora_count=モーラ数, import_midi=MIDIをトラック分割して取り込み(params.midi_b64), research=参考調査(api), collect=断片/アイデア収集(api), echo=疎通確認。既存に合わせる/修正/変換は params.condition={fit_to,by}",
          ),
        target_neta_id: z.string().optional(),
        instruction: z.string().optional(),
        params: z.unknown().optional(),
        priority: z.number().int().optional(),
      },
    },
    async (args) => ok(core.enqueueJob(args)),
  );

  server.registerTool(
    "update_song",
    {
      title: "曲の段階を更新",
      description: "曲(kind=song)の stage（段階）／next_action（次の一手）／loop（ゲームBGMのループ本体範囲）を更新する。",
      inputSchema: {
        id: z.string(),
        stage: z.string().nullable().optional(),
        next_action: z.string().nullable().optional(),
        loop: loopShape.nullable().optional().describe("WP-X2 ループ本体範囲{startBar,endBar,tailBars?}。null で解除・未指定で据え置き"),
      },
    },
    async ({ id, ...patch }) => {
      const s = core.updateSong(id, patch);
      return s ? ok(s) : err("neta not found");
    },
  );

  server.registerTool(
    "link_asset",
    {
      title: "資産をネタに紐付け",
      description: "asset（mp3/midi/render等）をネタに role（source=分解元/attachment=添付/render=音源）で紐付け。",
      inputSchema: {
        neta_id: z.string(),
        asset_id: z.string(),
        role: z.enum(["source", "attachment", "render"]).default("attachment"),
      },
    },
    async ({ neta_id, asset_id, role }) =>
      core.linkAsset(neta_id, asset_id, role) ? ok({ ok: true }) : err("neta or asset not found"),
  );

  server.registerTool(
    "get_neta_assets",
    {
      title: "ネタの資産一覧",
      description: "ネタに紐付いた資産（role 付き）を返す。",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => ok(core.getNetaAssets(id)),
  );

  server.registerTool(
    "get_job_results",
    {
      title: "ジョブ結果のネタ",
      description: "ジョブが生んだネタ(job_result)の一覧を返す。",
      inputSchema: { job_id: z.string() },
    },
    async ({ job_id }) => ok(core.getJobResults(job_id)),
  );

  server.registerTool(
    "get_job",
    { title: "ジョブ取得", description: "id で状態・結果を取得", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const j = core.getJob(id);
      return j ? ok(j) : err("not found");
    },
  );

  server.registerTool(
    "list_jobs",
    {
      title: "ジョブ一覧",
      description: "status/target で絞り込み",
      inputSchema: { status: z.string().optional(), target: z.string().optional() },
    },
    async (args) => ok(core.listJobs(args)),
  );

  // 生成（ルールベース・決定的記号エンジン・TS一本化＝cm-music の gen_* を置換）。frame=key/meter/bars/mood。
  server.registerTool(
    "gen_chords",
    { title: "コード進行を生成", description: "機能和声ルールで進行を生成（T始終・ダイアトニック・frame.key の実音で返る）。cadence=終止型(full=完全/half=半終止=V止め/deceptive=偽終止=V→vi/plagal=変終止=IV→I/aeolian=エオリアン終止=♭VI→♭VII→i)。borrow=サブドミナントマイナー(切なさ)、secondaryDom=二次ドミナント(おしゃれ/接着)、palette=旋法パレット(mixolydian等)。", inputSchema: { frame: frameSchema, seed: z.number().int().optional(), cadence: z.enum(["full", "half", "deceptive", "plagal", "aeolian"]).optional().describe("終止型。half=Aメロ末の開き/deceptive=続く感(偽終止)/plagal=アーメン終止/aeolian=エオリアン終止(♭VI→♭VII→i・短調の実測第1位／長調は♭VI→♭VII→I)。未指定=完全終止(従来)"), borrow: z.number().min(0).max(1).optional().describe("借用和音の確率。長調のIVを iv(サブドミナントマイナー=切なさ)へ。未指定=なし"), secondaryDom: z.number().min(0).max(1).optional().describe("二次ドミナントの確率。非トニック和音の直前を V/x(dom7)へ＝おしゃれ/接着(丸サのIII7等)。未指定=なし"), loop: z.boolean().optional().describe("循環進行(閉じずに回す)。短調=エオリアン i-♭VI-♭VII／長調=アクシス I-V-vi-IV。未指定=なし"), palette: z.enum(["ionian", "mixolydian", "aeolian", "dorian"]).optional().describe("旋法パレット(WP-C1)。mixolydian=♭VII(ロック・土臭)/dorian=IV長(浮遊・おしゃれ)/aeolian=切ない民族(短調既定)/ionian=明るい王道(長調既定)。frame.palette でも可。未指定=mode から既定＝bit一致"), variety: z.number().min(0).max(1).optional().describe("多様性(WP-C3)。中間和音を確率で代替候補(機能代理/相対/裏コード/同主調借用/二次ドミナント)へ差替＝進行の収束を緩める(ベタ回避)。未指定=なし(従来のダイアトニック進行)"), genre: z.enum(["citypop"]).optional().describe("ジャンルプリセット(WP-C3)。citypop=機能別テンション付与(Maj9/m9/13/maj7#11)＋IV/V等の分数化。meta.warnings にやり過ぎ警告を併記(ブロックしない)。未指定=素の三和音/7th"), transition: z.object({ prep: z.enum(["pivot", "secondary_dominant"]), toKey: z.number().int().min(0).max(11), toMode: z.enum(["major", "minor"]).optional() }).optional().describe("転調準備(WP-C2)。境界セクション末尾を次調への準備和音へ差替＝pivot(共通和音で滑らか)/secondary_dominant(次調のV7で牽引)。toKey=転調先の主音pc。調プラン(suggest_key_plan)適用時に境界へ差す。未指定=なし(従来の終止・bit一致)。無準備(direct)は渡さない") } },
    async ({ frame, seed, cadence, borrow, secondaryDom, loop, palette, variety, genre, transition }) => {
      const res = genChords(frame, seed, cadence, { borrow, secondaryDom, loop, palette, variety, genre, transition });
      // WP-C4：張力カーブレンズを meta.tension へ添付（content 不変＝bit一致・審判でなく設計レンズ）。
      attachHarmonicTension(res, { key: typeof frame?.key === "number" ? frame.key : undefined, mode: isMinorFrame(normalizeFrame(frame)) ? "minor" : "major", sectionRole: (frame as { section?: { role?: string } } | undefined)?.section?.role });
      return ok(res);
    },
  );
  // gen_bass / gen_melody のドラム入力（gen_drums の content と同形）＝design「gen_bass×ドラム結線」「gen_melody×ドラム結線」2026-07-10。
  const drumsSchema = z
    .object({
      rhythm: z.object({
        steps: z.number().int().describe("1小節のステップ数（16分グリッド。4/4=16, 6/8=12）"),
        bars: z.number().int().optional(),
        beatsPerStep: z.number().describe("1ステップ=何拍か（step→拍の換算。4/4なら0.25）"),
        lanes: z.array(z.object({ name: z.string().optional(), midi: z.number().int().optional(), hits: z.array(z.number().int()), vel: z.number().optional() })).describe("Kick=midi36/Snare=midi38 のレーンを読む"),
      }),
    })
    .optional()
    .describe("gen_drums の content をそのまま渡す（同じ composition のドラムに噛ませる）。無ければ従来生成");
  // リズムパーツ層 L1/L2（design #20 S4-1/S4-2）：名前付きプリセット（whole/half2/dotted/quarters/eighths/driveHold/sixteenths/syncope/offhead/backbeat）を小節にローテ or 明示で敷く。
  const rhythmPartsSchema = z
    .object({
      rotate: z.array(z.string()).optional().describe("L1＝partId 配列を出力小節にローテ適用（bar i → rotate[i%len]）。疎パーツ(whole/half2/dotted)=白玉/長音になる"),
      placement: z.array(z.object({ bar: z.number().int(), partId: z.string() })).optional().describe("L2＝小節ごとの明示指定（bar 0始まり→partId）。**同一barはplacementがrotateに優先（placement>rotate>従来抽選）**。「2小節目だけ白玉に」等。未知id/範囲外barは無視"),
      custom: z.array(z.object({ id: z.string(), pattern: z.string().regex(/^[x.]{16}$/) })).optional().describe("インラインパーツ＝任意idの16文字'x/.'パターン。rotate/placement からこのidを引ける（extract_rhythm_part の採取結果や手置きをプリセット外から渡す）。不正patternは無視"),
    })
    .optional()
    .describe("リズムパーツ＝1小節の16分オンセットパターンをセクションに敷く（ドラムパターン感覚）。骨格はそのまま表面リズムだけ差し替え。未指定=従来抽選(bit一致)");
  server.registerTool(
    "gen_melody",
    { title: "メロディを生成", description: "「この歌詞に合うメロを作って」「詞に合わせて音数ぴったりのメロを組んで」のように歌詞からメロを起こしたいときは、lyrics に歌詞（改行=句）を渡す＝モーラ数→音数が厳密一致し句で呼吸するメロ候補が出る（歌詞先行モード・下の lyrics 参照）。歌詞なしなら通常のメロ生成＝コードトーン拘束のメロを生成（拍頭=コードトーン）。chords を渡せば合わせる。style でコーパス(library)の歩幅統計にバイアス。repetition=動機反復の強さ(0-1)、rangeSteps=音域(音階ステップ・6度≈6)で利用時制約。density=細かさ(0=疎〜1=細かい)、swing=跳ね(0=ストレート〜1=シャッフル)、expression=表情(0=素直〜1=強拍に倚音/掛留)、phrasing=句割り(symmetric/asymmetric)、runs=走句(0〜1)、push=前借り/食い(0〜1)、foreground=前景の自由度(0〜1)、breathe=句頭の遅延入場(0〜1)。bass＋counter=対位バイアス(ベーストラックに対して反行/斜行を優先・並行完全協和とb9衝突を避ける)。drums(gen_drums の content)＋3ノブでドラムに噛む：backbeat=スネア/キック実在位置の音を立てる(velのみ)、drumLock=キックが食う拍頭を16分前借り、converse=密度の相補(ドラム密小節でメロ疎/疎小節で動く)。全て既定0=従来。6/8はドラム3ノブ対象外。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional(), seed: z.number().int().optional(), style: z.string().optional().describe("コーパスstyle(irish/game等)。投入済みなら歩幅をその統計へ寄せる"), repetition: z.number().min(0).max(1).optional().describe("動機反復の強さ 0=反復なし〜1=強反復(既定0.85=やや強め)"), rangeSteps: z.number().int().min(2).max(20).optional().describe("骨格の音域(音階ステップ)。6度差に抑えるなら6"), motifBars: z.number().int().min(1).max(4).optional().describe("モチーフ/フレーズ長(小節)。1=短く反復多め/2=既定/4=長く展開的"), density: z.number().min(0).max(1).optional().describe("細かさ 0=疎(白玉寄り)〜1=細かい(16分多め)。未指定=コーパス分布"), swing: z.number().min(0).max(1).optional().describe("跳ね 0=ストレート〜1=シャッフル(8分裏が3連2/3へ)"), expression: z.number().min(0).max(1).optional().describe("表情 0=素直(強拍ほぼコード音)〜1=もたれ(強拍に倚音/掛留＝歌い回し)。未指定=素直"), phrasing: z.enum(["symmetric", "asymmetric", "period", "sentence"]).optional().describe("句割り。symmetric=2小節句(問い→答え)/asymmetric=不等分割(3+3+2)/period=4小節句[4,4](終止が半分・長い塊・サビ向き)/sentence=短短長[2,2,4](Caplin・畳み掛け→長い解放)。未指定=句末着地なし(従来)"), runs: z.number().min(0).max(1).optional().describe("走句 0=なし〜1=16分の連続(走り)が出やすい。未指定=従来"), push: z.number().min(0).max(1).optional().describe("前借り(食い) 0=なし〜1=毎小節1,2,3拍を16分前へ(ツッコミ)。未指定=なし"), foreground: z.number().min(0).max(1).optional().describe("前景の自由度 0=モチーフ反復中心〜1=自由材料(同音/跳躍)多め＝ダルダル解消。未指定=従来"), breathe: z.number().min(0).max(1).optional().describe("句頭の遅延入場(息継ぎ) 0=なし〜1=各句頭を最大1.5拍空けて入る。phrasing 併用が本領。未指定=なし"), humanize: z.number().min(0).max(1).optional().describe("人間味(グルーヴ) 0=機械的〜1=強弱(velocity)＋微小タイミング揺れ。未指定=なし(vel無し)"), form: z.enum(["sentence"]).optional().describe("形式。sentence=提示→移高反復→継続(断片化で加速)→カデンツ＝起承転結。未指定=従来AABA"), bass: notesSchema.optional().describe("ベーストラックの notes＝対位バイアスの相手（同じ composition のベースを渡す）。counter と併せて有効"), counter: z.number().min(0).max(1).optional().describe("対位係数 0=無効(従来)〜1=強。0.2-0.4目安＝強拍で対ベース反行/斜行を優先・並行5度8度(持続)とb9衝突を避ける。bass 必須"), drums: drumsSchema, backbeat: z.number().min(0).max(1).optional().describe("バックビート・アクセント 0=なし〜1=スネア実在位置+12/キック+6 の velocity（onset/pitch不変・0.3目安）。drums 必須"), drumLock: z.number().min(0).max(1).optional().describe("キック食い 0=なし〜1=キックが16分前に食う拍頭の音をその位置へ前借り（≤2/小節・pushと排他合成）。drums 必須"), converse: z.number().min(0).max(1).optional().describe("密度の相補 0=なし〜1=ドラム密な小節でメロを疎に/疎な小節で動かす（句単位・弱バイアス）。drums 必須"), hook: z.number().min(0).max(1).optional().describe("反復音フック 0=なし〜1=同音の繰り返し(ラーラ/ソッソッ)を動機の骨として保持（句頭/句末アンカー）。motifMode:preserve と併用が本領。未指定=なし"), articulation: z.number().min(0).max(1).optional().describe("アーティキュレーション 0=レガート〜1=反復音連打にmicropause(隙間)＋連打頭アクセント＝連打が1本に潰れず聞こえる。未指定=なし"), inflect: z.number().min(0).max(1).optional().describe("適応変奏 0=なし〜1=動機末尾1音を±1段で和声に馴染ませる(preserve時のフォールバック)。未指定=なし"), motifMode: z.enum(["preserve"]).optional().describe("動機保存レンダ preserve=動機を度数図形として置き和声適応は移高で行う＝反復音/輪郭の同一性を保つ(反復音フック向け・hook併用)。未指定=従来レンダ"), finest: z.enum(["quarter", "eighth"]).optional().describe("最小音符(上限) quarter=4分/eighth=8分より細かい音を出さない。高BPMで16分が速すぎ潰れるのを防ぐ。未指定=テンポ連動(≥150で自動8分)＝おまかせ"), flow: z.number().min(0).max(1).optional().describe("塊の連結/長音 0=なし(ぶつ切れ)〜1=穴(息継ぎ)を白玉で埋め句末/最終音を伸ばす＝繋がった長い塊。onset不変・0.5-0.7目安。未指定=なし。role=chorus等で自動"), pickup: z.number().min(0).max(1).optional().describe("弱起(アウフタクト) 0=なし〜1=句頭の音を前の息継ぎへ最大0.75拍出しダウンビートへタイ。実メロに多い歌い出し。未指定=なし。role で自動"), arc: z.enum(["arch"]).optional().describe("構造線の弧 arch=山なり(句頭主音→中間で頂点→句末主音・登って落ちるサビ型)。未指定=従来の Kopfton→主音 下降"), skeletonNetaId: z.string().optional().describe("骨格ネタ(kind=skeleton)のid。指定するとその骨格(構造線)を注入して表面化＝骨格から吹き直す(design #20)。候補は骨格を共有し表面(リズム/装飾)だけ変わる。返りに skeletonNetaId が入る＝capture 後 link(メロ→骨格,\"realized_from\") で紐付け"), rhythmParts: rhythmPartsSchema, lyrics: z.string().optional().describe("歌詞先行モード(design #13d)＝この歌詞に合うメロ候補を出す。改行=行(句)。かな推奨(漢字はpyopenjtalkが読む)。各候補は**モーラ数→音数が厳密一致**し句で呼吸する＝返りの meta.lyricFit にアクセント整合score/句頭A-01赤の件数(語義誤解リスク・ゼロ強制はしない)。content.notes は syllable 済み。長音ー=直前へ延長/促音っ=詰め(音符を立てない)。6/8系は未対応。未指定=従来生成"), corpus: z.boolean().optional().describe("実J-POPコーパス(骨格degHist)へ構造音の度数分布を弱バイアス（既定OFF=bit一致）。頻度は弾かず寄せるだけ＝正当性はE-ruleが担保。"), corpusStrength: z.number().min(0).max(8).optional().describe("degHistバイアスの強さ（既定1・大きいほど手癖寄り）。corpus:true時のみ有効") } },
    async ({ frame, chords, seed, style, repetition, rangeSteps, motifBars, density, swing, expression, phrasing, runs, push, foreground, breathe, humanize, form, bass, counter, drums, backbeat, drumLock, converse, hook, articulation, inflect, motifMode, finest, flow, pickup, arc, skeletonNetaId, rhythmParts, lyrics, corpus, corpusStrength }) => {
      const corpusModel = learnMotifModelFromLibrary(core, style); // P1：らしさ順ランクの軸（＝生成bias と同じ学習モデル）
      // 骨格注入（design #20）：skeletonNetaId 指定時はその neta の content を SkeletonContent として読み検証し注入。
      let skeleton: SkeletonContent | undefined;
      if (skeletonNetaId) {
        const sn = core.getNeta(skeletonNetaId);
        if (!sn) return err(`skeleton neta ${skeletonNetaId} not found`);
        if (sn.kind !== "skeleton") return err(`neta ${skeletonNetaId} is kind=${sn.kind}, not skeleton`);
        const bpb = meterInfo(frame?.meter).beatsPerBar;
        const errs = validateSkeletonContent(sn.content, { beatsPerBar: bpb });
        if (errs.length) return err(`invalid skeleton content: ${errs.join("; ")}`);
        skeleton = sn.content as SkeletonContent;
      }
      // リズムパーツ層 L1/L2（design #20 S4-1/S4-2）：placement/custom を含めサニタイズ（範囲外bar/未知id/不正pattern無視・http と同経路）。未指定/効果ゼロ=undefined=bit一致。
      const rp = sanitizeRhythmParts(rhythmParts, { bars: typeof frame?.bars === "number" ? frame.bars : undefined });
      // 歌詞先行モード（design #13d・WP-L1）：歌詞→lyricsPlan（phrases＋rhythmParts）を V2 へ注入し、
      // best-of-N＋analyzeLyricFit で再ランクした候補を返す。accents は pyopenjtalk で1回だけ spawn（失敗=内蔵ヒューリスティック）。
      // 6/8系（compound）は buildPartVariant 対象外＝音数保証できないため注入せず通常生成に落として警告（v1 未対応）。
      const mi = meterInfo(frame?.meter);
      if (lyrics && lyrics.trim()) {
        if (mi.grouping === "compound") {
          const res0 = genMelodyCandidates(frame, chords, seed, { useV2: true, motifModel: corpusModel ?? undefined, corpusModel });
          (res0 as typeof res0 & { note?: string }).note = "6/8系（複合拍）は歌詞先行メロ未対応（v1）＝音数保証なしの通常生成で返した";
          return ok(res0);
        }
        const barLen = mi.beatsPerBar; // V2 は非 compound では barLen=beatsPerBar（4/4→4・3/4→3・6/4→6）
        const barsN = barsOf(normalizeFrame(frame));
        const plan = planLyricMelody(lyrics.split(/\r?\n/), { bars: barsN, beatsPerBar: barLen });
        let accents: { kana: string; kernel: number }[] | undefined;
        let accentSource: "pyopenjtalk" | "heuristic" = "heuristic";
        if (plan.syllables.length) {
          try { const auto = await accentsFromSyllables(plan.syllables); if (auto) { accents = auto; accentSource = "pyopenjtalk"; } } catch { /* 内蔵ヒューリスティックへ fallback */ }
        }
        const resL = genLyricMelodyCandidates(frame, chords, { useV2: true, motifModel: corpusModel ?? undefined, corpusModel, repetition, rangeSteps, motifBars, density, swing, expression, runs, push, foreground, breathe, humanize, form, bass, counter, drums, backbeat, drumLock, converse, hook, articulation, inflect, motifMode, finest, flow, pickup, arc, skeleton, plan, accents });
        attachMelodyVoiceLeading(resL, { bass, skeleton, chords, beatsPerBar: barLen });
        attachStructureWarnings(resL, { bars: barsN, bpb: barLen, pitchRange: [0, 127] });
        (resL as typeof resL & { accentSource?: string; lyricPlan?: unknown }).accentSource = accentSource;
        (resL as typeof resL & { accentSource?: string; lyricPlan?: unknown }).lyricPlan = { syllableCount: plan.syllables.length, lines: plan.lines, warnings: plan.warnings };
        return ok(resL);
      }
      // (WP-M1) corpus:true で骨格 degHist prior を注入（未投入=空Map=bit一致・既定OFF）。
      const minorF = isMinorFrame(normalizeFrame(frame));
      const degPrior = corpus ? skeletonDegPrior(loadSkeletonPriors(core.db, "pop", minorF ? "minor" : "major"), "degHist", minorF) : undefined;
      const res = genMelodyCandidates(frame, chords, seed, { useV2: true, motifModel: corpusModel ?? undefined, repetition, rangeSteps, motifBars, corpusModel, density, swing, expression, phrasing, runs, push, foreground, breathe, humanize, form, bass, counter, drums, backbeat, drumLock, converse, hook, articulation, inflect, motifMode, finest, flow, pickup, arc, skeleton, rhythmParts: rp, degPrior, degPriorStrength: corpusStrength });
      // 対位法レポートの添付（design #20 S3d・読み取り専用＝候補ノートは不変）。lower＝bass 明示/骨格明示ベース+コード導出/コード root 代用の順。
      attachMelodyVoiceLeading(res, { bass, skeleton, chords, beatsPerBar: meterInfo(frame?.meter).beatsPerBar });
      // 候補レンズの添付（design #12-M・WP-M3・読み取り専用＝候補ノートは不変）。並べ替え軸＝expectation/hook/singability。
      attachMelodyLenses(res, { key: typeof frame?.key === "number" ? frame.key : undefined, beatsPerBar: meterInfo(frame?.meter).beatsPerBar, sectionRole: (frame as { section?: { role?: string } } | undefined)?.section?.role, profile: resolveVoiceProfile((frame as { voice_profile?: unknown } | undefined)?.voice_profile as string | undefined) });
      // シンコペ「ノリメーター」の添付（WP-D2・読み取り専用＝候補ノート不変）。並べ替え軸＝セクション役割別ターゲット帯への適合。
      attachSyncScore(res, { beatsPerBar: meterInfo(frame?.meter).beatsPerBar, role: (frame as { section?: { role?: string } } | undefined)?.section?.role, tempo: typeof frame?.tempo === "number" ? frame.tempo : undefined });
      // 生成後の構造バリデータ（2026-07-15）＝dur<=0/重複onset/範囲外を検出し警告のみ meta.structureWarnings へ（弾かず・直さず）。
      attachStructureWarnings(res, { bars: barsOf(normalizeFrame(frame)), bpb: meterInfo(frame?.meter).beatsPerBar, pitchRange: [0, 127] });
      // F1(2026-07-08)：style指定なのにコーパス未投入＝黙って既定劣化していたのを可視化（Claudeがユーザーに伝えられる）。
      if (style && !corpusModel) (res as typeof res & { note?: string }).note = `style「${style}」のコーパスが library に無いため既定モデルで生成（らしさ順ランクも既定＝生成順）`;
      // 骨格→メロの紐付けは capture 後（gen_melody は候補返しでまだ neta 化しない＝この時点で id が無い）。
      // 呼び出し側が capture 後に link(メロid, skeletonNetaId, "realized_from") を張れるよう id を返す（design #20）。
      if (skeletonNetaId) (res as typeof res & { skeletonNetaId?: string }).skeletonNetaId = skeletonNetaId;
      return ok(res);
    },
  );
  server.registerTool(
    "extract_rhythm_part",
    { title: "リズムパーツを採取", description: "既存メロの notes から指定小節の16分オンセットパターン('x/.'16文字)を採取する(design #20 S4-2・パーツ出所b)。返り pattern を gen_melody の rhythmParts.custom=[{id,pattern}] に渡し、rotate/placement からその id を引いて別セクションへリズムだけ再利用できる（骨格はそのまま表面リズムだけ移植）。", inputSchema: { notes: notesSchema, bar: z.number().int().min(0).describe("採取する小節（0始まり）"), beatsPerBar: z.number().int().min(1).max(12).optional().describe("1小節の拍数（既定4）。3=3/4は先頭12枠のみ"), frame: frameSchema.optional().describe("beatsPerBar 未指定時はここの meter から拍数を導く") } },
    async ({ notes, bar, beatsPerBar, frame }) => ok({ pattern: extractRhythmPart(notes, bar, { beatsPerBar: beatsPerBar ?? meterInfo(frame?.meter).beatsPerBar }) }),
  );
  server.registerTool(
    "gen_skeleton",
    { title: "骨格を生成", description: "メロの構造線（骨格＝Urlinie近似のブレークポイント列）を機械が候補出しする(design #20)。frame(key/mode/meter/bars)＋コード進行を受け、コード追従の骨格音を句割り付きで複数案返す。返りは kind=\"skeleton\" の content={bars,tones:[{start,pitch}],phrases:[{endBeat,cadence}]}＝dur を持たない支配区間方式（各音は次の点/句末まで支配）。この骨格を capture して gen_melody(skeletonNetaId) で表面化する。「機械は候補まで・仕上げは人間」。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional(), seed: z.number().int().optional().describe("指定=1案を決定的に。未指定=複数案"), phrasing: z.enum(["symmetric", "asymmetric", "period", "sentence"]).optional().describe("句割り。symmetric=2小節句/asymmetric=3+3+2/period=[4,4]/sentence=[2,2,4]。未指定=対称"), form: z.enum(["period", "aaba", "cadence-swap", "sentence"]).optional().describe("フォーム型回帰＝構造を2/4/8で使い回す。period=後半4小節が前半の反復([4+4]楽節・カデンツだけ差替)/aaba=Aを1・2・4句目へ回帰(Bだけ対比)＝度数リテラル複写(耳に「同じフレーズが返る」)。cadence-swap=2小節言って2小節後に終止だけ変えて言い直す(前句のリズム保存/音高は現コードへ再フィット・M9実測 2-4小節帯)/sentence=提示→反復→頭断片の畳み掛け(fragmentation+加速・Caplin)。cadence-swap/sentence は M9実測文法＝近距離ほど変え遠距離ほど戻す・リズムが同一性を担う。未指定=従来(輪郭反復のみ・さまよい気味)"), skelColor: z.number().min(0).max(1).optional().describe("骨格の色付け(脱平面化) 0=素直(強拍ほぼ和声内)〜1=強拍に倚音(コーパス駆動の非和声音・必ず次で段進行解決)。実曲の骨格は強拍の1/3が非和声音＝主音平面を割る。0.3-0.5目安で強拍コードトーン率が実曲帯(60-70%)へ。未指定=0=従来"), contour: z.enum(["arch", "asc", "desc", "valley"]).optional().describe("輪郭の型(かたち・WP-M1b)＝骨格の構造線を型の包絡へソフト制約で寄せる。arch=山(登って落ちる・サビ型)/asc=右肩上がり(緊張蓄積・プリコーラス型)/desc=右肩下がり(下降終止・句末/アウトロ型)/valley=谷(下って戻る・ブリッジ型)。中間スロットだけ効き、終止/句末は終止規則が優先(アンカー尊重)。skelForm 複写スロットは保護。未指定=従来(bit一致)") } },
    async ({ frame, chords, seed, phrasing, form, skelColor, contour }) => ok(genSkeletonCandidates(frame, chords, seed, { phrasing, form, skelColor, contour })),
  );
  server.registerTool(
    "complete_melody",
    { title: "メロディを補完", description: "部分メロ(先頭数小節)を種に、そのモチーフを発展させて frame.bars 全体まで埋める（補完=completion）。notes の小節は実音を保持し、残りを A'/B(反行)/A'' 発展で生成。決定的(seed)・著作権セーフ(ユーザー自作の発展)。", inputSchema: { notes: notesSchema.describe("部分メロ＝発展の種（先頭1-2小節想定）"), chords: chordsSchema, frame: frameSchema, seed: z.number().int().optional() } },
    async ({ notes, chords, frame, seed }) => {
      const res = genMelody(frame, chords, seed, { useV2: true, partial: notes });
      // G3(2026-07-08)：V2補完の対応外(4/4・6/8以外 or chords無し)では partial が黙って捨てられ
      // 新規生成になっていた＝補完のつもりが別メロ。可視化してClaudeがユーザーに伝えられるように。
      const mi = meterInfo(frame?.meter);
      if ((notes?.length ?? 0) > 0 && !((mi.beatsPerBar === 4 || mi.grouping === "compound") && (chords?.length ?? 0) > 0))
        (res as typeof res & { note?: string }).note = "この条件(拍子/コード無し)ではV2補完が未対応のため、部分メロを引き継がず新規生成になっています。4/4か6/8で chords を渡すと補完されます";
      return ok(res);
    },
  );
  server.registerTool(
    "gen_bass",
    { title: "ベースを生成", description: "強拍ルート/弱拍5度のベースライン（C2基準低域・コードに合う）。drums(gen_drums の content)を渡すとドラムに噛む：kickLock=キック骨格の採用率(負=逆相・キック裏8分)、snareGap=スネア(2,4拍)頭で音価を切りbackbeatを抜く、approach=コードチェンジ直前を半音/全音接近→次ルート着地。全て既定0=従来。6/8はkickLock/approach対象外。**style**=ベース定型型ID(RK-8ROOT/BL-WHOLE/CP-OCT8/FK-ONE/ED-OFFBEAT/VR-8DRIVE 等)またはジャンル名(rock/ballad/citypop/funk/edm/vocarock＝frame.section.role＋tempo域で候補型を絞り選択)＝度数×16分グリッドの型を実音化。型格子を正準に鳴らしkickLockとは二重適用しない(排他)。**fill**=0..1(小さい=下降で落ち着かせる/大きい=上昇で盛り上げる)またはフィル型ID(FL-WALKUP等)＝末尾1つ手前の小節に駆け上がり/下がりを挿入。style/fill未指定=従来bit一致。6/8はstyle/fill対象外。skeletonNetaId=骨格ネタのベース明示区間で表面化＝書いた区間(クリシェ/ペダル)だけベース音を上書き・省略区間はコード導出のまま(design #20)。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional(), seed: z.number().int().optional(), drums: drumsSchema, kickLock: z.number().min(-1).max(1).optional().describe("キック骨格 -1..1。正=キックstepにオンセットを乗せる率(小節頭は常に弾く)、負=逆相(キックに無い8分裏へ)。0=従来fig経路"), snareGap: z.number().min(0).max(1).optional().describe("スネア頭で音価を切る強さ 0..1（onset不変・最小dur16分）＝2・4に穴を空けてスネアを抜く"), approach: z.number().min(0).max(1).optional().describe("コードチェンジ直前の接近音化率 0..1（弱拍・短音のみ＝半音上下/全音下→次ルート着地）"), style: z.string().optional().describe("ベース定型型ID or ジャンル名(rock/ballad/citypop/funk/edm/vocarock)。度数×16分グリッドの型を実音化＝型格子が正準(kickLockと排他)。未指定=従来"), fill: z.union([z.number().min(0).max(1), z.string()]).optional().describe("フィル 0..1(小=下降/大=上昇) or 型ID(FL-WALKUP等)。末尾1つ手前の小節に駆け上がり/下がりを挿入。未指定=なし(従来)"), skeletonNetaId: z.string().optional().describe("骨格ネタ(kind=skeleton)のid。骨格の明示ベース区間(bass)だけをベース音として上書き＝表面化(design #20)。骨格休符(pitch:null)区間はベースも鳴らさない。明示ゼロ/未指定=従来コード導出とbit一致。返りに skeletonNetaId が入る＝capture 後 link(ベース→骨格,\"realized_from\")") } },
    async ({ frame, chords, seed, drums, kickLock, snareGap, approach, style, fill, skeletonNetaId }) => {
      // 骨格注入（design #20 S3c）：skeletonNetaId 指定時はその neta の content を SkeletonContent として読み検証し注入（gen_melody と同契約）。
      let skeleton: SkeletonContent | undefined;
      if (skeletonNetaId) {
        const sn = core.getNeta(skeletonNetaId);
        if (!sn) return err(`skeleton neta ${skeletonNetaId} not found`);
        if (sn.kind !== "skeleton") return err(`neta ${skeletonNetaId} is kind=${sn.kind}, not skeleton`);
        const errs = validateSkeletonContent(sn.content, { beatsPerBar: meterInfo(frame?.meter).beatsPerBar });
        if (errs.length) return err(`invalid skeleton content: ${errs.join("; ")}`);
        skeleton = sn.content as SkeletonContent;
      }
      const res = genBass(frame, chords, seed, drums, { kickLock, snareGap, approach, skeleton, style, fill });
      // 対位法レポートの添付（design #20 S3d）：ベース候補=下声、骨格 tones=上声。骨格無し＝相手が無い＝スキップ。
      attachBassVoiceLeading(res, { skeleton, beatsPerBar: meterInfo(frame?.meter).beatsPerBar });
      // シンコペ「ノリメーター」の添付（WP-D2）：ベース層のシンコペ密度＝目標帯（中が主役）への適合。
      attachSyncScore(res, { beatsPerBar: meterInfo(frame?.meter).beatsPerBar, role: (frame as { section?: { role?: string } } | undefined)?.section?.role, tempo: typeof frame?.tempo === "number" ? frame.tempo : undefined });
      attachStructureWarnings(res, { bars: barsOf(normalizeFrame(frame)), bpb: meterInfo(frame?.meter).beatsPerBar, pitchRange: [0, 127] }); // 生成後の構造バリデータ（2026-07-15・警告のみ）
      // capture 後に link(ベース, 骨格, "realized_from") を張れるよう id をエコー（design #20・gen_melody と同じ）。
      if (skeletonNetaId) (res as typeof res & { skeletonNetaId?: string }).skeletonNetaId = skeletonNetaId;
      return ok(res);
    },
  );
  server.registerTool(
    "gen_counter",
    { title: "対旋律を生成", description: "主メロ(melody)の「間ま」に入る従属の第2声＝対旋律/オブリガートを候補生成する（WP-X3a）。**主メロ必須**＝主メロのイベント列(休符/伸ばし/busy)に依存。ガードレール：主メロと同時発音の2度(半音/全音)を作らない・音域は主メロの下3〜10度に分離・主メロが細かい拍(1拍2onset以上)では引っ込み rest/sustain 拍で動く相補リズム・拍頭はコードトーン軸・反行優先。density=出し入れ(0=疎〜1=密・未指定は frame.section.role 既定 or 0.5)。返り kind=\"counter\" の content={notes,program:48(Strings)}。「機械は候補まで・仕上げは人間」。", inputSchema: { frame: frameSchema, melody: notesSchema.describe("主メロ＝対旋律を絡める相手（必須）"), chords: chordsSchema.optional(), seed: z.number().int().optional(), density: z.number().min(0).max(1).optional().describe("出し入れ 0=疎(たまに)〜1=密(毎拍候補)。未指定は role 既定(サビ0.75/Aメロ0.35 等)or 0.5") } },
    async ({ frame, melody, chords, seed, density }) => {
      if (!melody?.length) return err("gen_counter は主メロ(melody)が必須です");
      const res = genCounter(frame, melody, chords, seed, { density });
      attachStructureWarnings(res, { bars: barsOf(normalizeFrame(frame)), bpb: meterInfo(frame?.meter).beatsPerBar, pitchRange: [0, 127] }); // 生成後の構造バリデータ（2026-07-15・警告のみ）
      return ok(res);
    },
  );
  server.registerTool(
    "gen_riff",
    { title: "リフを生成", description: "歌でない反復核＝リフ/オスティナート（ギター/シンセ/ピアノ/ゲームBGMの刻み）を候補生成する（WP-X3b）。2部構造が基底＝核 motif(1小節・3〜6音・コードトーン軸)＋反復/終止改変。和声関係は3類型を自動判定：コード列のルートがペダル候補(I/V)と半音以内で近接なら indep(維持＝tonic ペダルで全小節同一音列)、そうでなければ follow(追従＝各コードのコードトーンへ度数写像)。ループ適性＝最終小節の末尾16分を空ける(継ぎ目)。返り kind=\"riff\" の content={notes,program}。「機械は候補まで・仕上げは人間」。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional(), seed: z.number().int().optional(), harmony: z.enum(["indep", "follow"]).optional().describe("和声依存度。indep=維持(ペダル・コード変化に不動)/follow=追従(各コードのコードトーンへ写像)。未指定=コード進行から自動判定") } },
    async ({ frame, chords, seed, harmony }) => ok(genRiff(frame, chords, seed, { harmony })),
  );
  server.registerTool(
    "gen_section_inst",
    { title: "管弦(ホーン/ストリングス)を生成", description: "セクション楽器＝ホーン隊/ストリングスの伴奏帯を候補生成する（WP-X3c・伴奏先行）。**1ネタ多声**（進行追従の多声ボイシング＝chord_pattern の親戚）。role=pad(持続和音で床を張る＝コード変わり目にアタックし伸ばす・既定 Strings48)/stab(裏を短く突く和音ヒット＝リズム楽器化・既定 Brass61)。ボイシングは close(密集)＝top 狙い音で最上声を決め下へ密に積む。GM音色は content.program。返り kind=\"section_inst\" の content(ChordPatternContent 形＝strum/voicing/hits＋program/role)。web 側で resolveChordPattern が実音化。旋律的セクションライン(counter の厚いやつ)はスコープ外(後続)。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional(), seed: z.number().int().optional(), role: z.enum(["pad", "stab"]).optional().describe("役割。pad=持続和音で床(ストリングス本命)/stab=裏の短い和音ヒット(ホーン本命)。未指定=pad") } },
    async ({ frame, chords, seed, role }) => ok(genSectionInst(frame, chords, seed, { role })),
  );
  server.registerTool(
    "gen_drums",
    { title: "ドラムを生成", description: "GMバックビート（16分グリッド hits=step index・4/4で16step/6-8で12step・seedで小変化）。content.rhythm.beatsPerStep で拍換算。**style**=定型ビート型ID(beat8.syncopated/four.rock/beat16.ghost/six8.ballad 等)またはジャンル名(jpop/rock/dance/ballad/funk＝frame.section.role＋tempo域で候補型を絞り選択)。**fill**=0..1(小さい=軽い節目/大きい=大遷移フィル)またはフィル型ID(fill.tom.asc.half 等)＝frame.bars本の末尾遷移小節へフィル挿入＋着地(次小節頭crash+kick)・他小節不変。**ビルドアップ型**(build.tight.4bar=J-popプリコーラス/build.standard.8bar=汎用/build.big.16bar=大サビ前)＝密度倍加(4→8→16分)＋vel単調漸増＋末尾無音ギャップ＋ビルド区間キック抜き→着地でドロップ復帰（要 frame.bars≥テンプレ小節+1）。型はstraight格子でスイング/timingはfeel層へ委譲。style/fill 未指定=従来 bit 一致。6/8は6/8対応型のみ(ビルド型は4/4)。", inputSchema: { frame: frameSchema, seed: z.number().int().optional(), style: z.string().optional().describe("定型ビート型ID or ジャンル名(jpop/rock/dance/ballad/funk)。未指定=従来"), fill: z.union([z.number().min(0).max(1), z.string()]).optional().describe("フィル 0..1(強さ) or 型ID(fill.*/build.* ビルドアップ)。指定でセクション末小節にフィル＋着地。未指定=なし(従来)") } },
    async ({ frame, seed, style, fill }) => {
      const res = genDrums(frame, seed, style != null || fill != null ? { style, fill } : undefined);
      // シンコペ「ノリメーター」（WP-D2）：ドラム層のシンコペ密度＝ハット≈0/バックビート据えの床の上でどれだけ食うか。
      attachSyncScore(res, { beatsPerBar: meterInfo(frame?.meter).beatsPerBar, role: (frame as { section?: { role?: string } } | undefined)?.section?.role, tempo: typeof frame?.tempo === "number" ? frame.tempo : undefined });
      return ok(res);
    },
  );
  server.registerTool(
    "gen_named_progression",
    { title: "名前付き進行を生成", description: "丸の内/カノン/小室/王道/ツーファイブ/ブルース等を確定realize（別名・表記揺れ可・frame.key の実音で返る）。未知は空。", inputSchema: { name: z.string(), frame: frameSchema } },
    async ({ name, frame }) => ok(genNamedProgression(name, frame)),
  );

  // 当てはまり判定/補正/調推定/類似（cm-music-mcp の analysis を TS に集約＝S2 でcm-music廃止）。
  server.registerTool(
    "analyze_fit",
    { title: "メロのコード当てはまり", description: "メロが各コードにどれだけ合うか（コードトーン/スケール/外し）を判定。", inputSchema: { melody: notesSchema, chords: chordsSchema, key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional().describe("長短の明示（未指定はkey/旋律から推定）") } },
    async ({ melody, chords, key, mode }) => ok(analyzeFit(melody, chords, key, mode)),
  );
  server.registerTool(
    "fit_to_chords",
    { title: "外し音をコードトーンへ補正", description: "正当でない外し音を最寄りコードトーンへスナップ（経過/刺繍/掛留は残す）。", inputSchema: { melody: notesSchema, chords: chordsSchema, key: z.number().int().min(0).max(11).optional() } },
    async ({ melody, chords, key }) => ok(fitToChords(melody, chords, key)),
  );
  server.registerTool(
    "detect_key",
    { title: "メロから調推定", description: "ノート列から調(0-11)とmode(major/minor)を推定（Krumhansl相関）。", inputSchema: { notes: notesSchema } },
    async ({ notes }) => ok(detectKeyFromNotes(notes)),
  );
  server.registerTool(
    "melody_similarity",
    { title: "メロ類似度", description: "2メロの類似度0..1（音程列・移調不変）。", inputSchema: { a: notesSchema, b: notesSchema } },
    async ({ a, b }) => ok(melodySimilarity(a, b)),
  );
  server.registerTool(
    "find_similar",
    { title: "近いメロを探す", description: "target に近い順に候補メロを返す。", inputSchema: { target: notesSchema, candidates: z.array(z.object({ id: z.string().optional(), label: z.string().optional(), notes: notesSchema })), top: z.number().int().optional() } },
    async ({ target, candidates, top }) => ok(findSimilar(target, candidates, top)),
  );

  } // ← if(legacy) ここまで＝full のみ legacy を登録。surface="chat" は以下の共通 verbs だけ。

  // ── #101 目的ツール面（10 thin verbs）。chat面はこれだけ＝モデルが旧ツールを掴まない。既存エンジンへ dispatch、未実装は明示エラー(捏造禁止)。
  //    A 書込: capture/revise/assemble ｜ B 生成(候補・保存しない): generate/weave/reshape/convert/continue ｜ C 読取: search/analyze
  //    横断概念(range/feel/style)はB群の修飾引数で吸収(fat化させない)。role/structure(連結)は assemble/continue 側。
  server.registerTool(
    "capture",
    { title: "置く（捕獲）", description: "「この歌詞を置いておいて」「この進行そのまま登録して」のように、持ち込んだ素材や気に入った生成候補をそのまま確定・保存したいとき使う。歌詞は kind:\"lyric\"＋text に歌詞本文。生成はしない（持ち込みの登録と生成候補の確定の両方がここ）。持ち込んだコード/メロ/歌詞等をそのまま登録する。", inputSchema: netaInputShape },
    async (args) => ok(core.createNeta(args)),
  );
  server.registerTool(
    "revise",
    { title: "直す（上書き/削除）", description: "既存ネタの確定的な書換え・破棄。候補の採用差替もここ。", inputSchema: { id: z.string(), content: z.unknown().optional(), text: z.string().nullable().optional(), title: z.string().nullable().optional(), tags: z.array(z.string()).optional(), mood: z.string().nullable().optional(), del: z.boolean().optional().describe("true で削除") } },
    async ({ id, del, ...patch }) => {
      if (del) return ok({ deleted: core.deleteNeta(id) });
      const n = core.updateNeta(id, patch);
      return n ? ok(n) : err("not found");
    },
  );
  server.registerTool(
    "assemble",
    { title: "組み立てる（配置）", description: "ネタを入れ子に配置/外す（section→song）。", inputSchema: { parent: z.string(), child: z.string(), position: z.number().optional(), ord: z.number().int().optional(), remove: z.boolean().optional() } },
    async ({ parent, child, position, ord, remove }) => {
      if (remove) { core.removeChild(parent, child, position); return ok({ removed: true }); }
      core.placeChild(parent, child, position ?? 0, ord ?? 0);
      return ok({ placed: true });
    },
  );
  // ③ 次の一手ナビ：曲の現状を読む(song_state)／合意した次の一手を残す(plan_next)。「次どうする？」の土台。
  server.registerTool(
    "song_state",
    { title: "曲の状態を見る", description: "曲/セクションの現状＝子の構成・埋まってる/空きレーン・段階(stage)/次の一手(next_action)を返す。「次どうする？/詰まった」の判断に使う。", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const tree = core.getComposition(id);
      if (!tree) return err("not found");
      return ok({ composition: tree, song: core.getSong(id) });
    },
  );
  server.registerTool(
    "plan_next",
    { title: "次の一手を記録", description: "曲(song)の stage（段階）と next_action（次にやること）を更新して残す。ユーザーと合意した次の一手をここに書く。", inputSchema: { id: z.string(), stage: z.string().nullable().optional(), next_action: z.string().nullable().optional() } },
    async ({ id, stage, next_action }) => {
      const s = core.updateSong(id, { stage, next_action });
      return s ? ok(s) : err("not found");
    },
  );
  // WP-X2 ゲームBGMループ境界チェック：ループ本体の進行＋メロ＋loop範囲→継ぎ目の所見(指摘のみ・自動修正しない)。
  server.registerTool(
    "check_loop",
    {
      title: "ループ境界を点検",
      description:
        "ゲームBGMのループ本体が“回り続ける”か点検＝末尾終止の開き具合・末尾→頭の音程・境界を跨ぐ持続ノート・テール未設定を所見で返す（指摘のみ。修正はしない）。",
      inputSchema: {
        loop: loopShape,
        meter: z.string().optional().describe("拍子＝\"分子/分母\"（例 \"4/4\",\"6/8\"）。既定 4/4"),
        key: z.number().int().min(0).max(11).optional().describe("主音のピッチクラス0-11。未指定は進行から推定"),
        mode: z.enum(["major", "minor"]).optional(),
        chords: chordsSchema.optional().describe("ループ本体の進行（時間順・末尾＝ループ末尾の和音）"),
        melody: notesSchema.optional().describe("ループ本体のメロ（拍・曲頭からの絶対位置）"),
      },
    },
    async ({ loop, meter, key, mode, chords, melody }) =>
      ok(checkLoop({ loop, meter, key, mode, chords, melody })),
  );
  // ② 歌詞↔メロ：read_neta でメロの音符/歌詞を読む・set_lyric で歌詞(かな)を音符へ流し込む。
  server.registerTool(
    "read_neta",
    { title: "ネタを読む", description: "「前に置いた歌詞を見せて」「このメロの音符や歌詞を読んで」のように、ネタの中身を読みたいとき使う。歌詞ネタ（kind=lyric・text 本文）もメロの音符/歌詞/コードも読める（メロ→仮歌詞・歌詞の音数合わせにも）。ネタの中身(content 込み)を取得する。analysis ネタは既定で raw の巨大時系列(melody_f0/melody_notes/beat_times/drum_onsets/bass_notes)を統計要約にして返す＝token節約。フル配列は fields:['melody_f0',…] で。", inputSchema: { id: z.string(), fields: z.array(z.string()).optional().describe("analysis ネタで raw をフル素通しにするフィールド名（例 ['melody_f0']）。既定は要約。") } },
    async ({ id, fields }) => {
      const n = core.getNeta(id);
      if (!n) return err("not found");
      // (a) chat面 × analysis ネタは既定で射影（100K〜126K tokens → ~5K）。full面/他kindは不変。
      if (isChat && n.kind === "analysis") return ok(projectAnalysisForChat(n, fields));
      return ok(n);
    },
  );
  server.registerTool(
    "set_lyric",
    { title: "歌詞をメロに載せる", description: "「このメロに歌詞を載せて」「仮の言葉でいいから乗せてみて」のように、既にネタになっているメロへ歌詞を当てたいとき使う（プレースホルダの仮歌詞でも可）。melody ネタの id が要る＝まだネタ化していないメロには使えない（先に capture でネタ化）。歌詞(かな)を各音符へ1:1で流し込み syllable を付ける（モーラ>音符は最長音符を分割、余りはメリスマ\"ー\"）。歌詞→メロの仕上げ／メロ→仮歌詞の反映に。", inputSchema: { id: z.string(), lyrics: z.string() } },
    async ({ id, lyrics }) => {
      const n = core.getNeta(id);
      if (!n) return err("not found");
      const content = (n.content ?? {}) as { notes?: unknown };
      const notes = Array.isArray(content.notes) ? (content.notes as LNote[]) : [];
      if (!notes.length) return err("このネタに notes がありません（melody を指定して）");
      const flowed = flowLyric(notes, splitMora(lyrics));
      const upd = core.updateNeta(id, { content: { ...content, notes: flowed } });
      return upd ? ok(upd) : err("not found");
    },
  );
  // ② 歌詞↔メロ プロソディ（design #13b・規則表 R-01〜/A-01〜）＝分析と提案（生成本体はしない・候補まで）。
  server.registerTool(
    "suggest_lyric_rhythm",
    {
      title: "歌詞→リズム型候補",
      description:
        "「この歌詞、どんなリズムで歌えばノる？」「メロを作る前に歌詞の譜割り（音の詰め方）を先に見たい」のように、歌詞のリズム型を先に確かめたいとき使う。歌詞(かな)をモーラに分けて『リズム型』候補を複数出す（ピッチは付けない＝割付の型のみ）。候補=基本(1モーラ1音符)/細分(字余り・早口)/句末伸ばし(字足らず・メリスマ)。特殊拍を正しく扱う＝長音ーは直前へ延長(tie)・促音っは詰め(rest)・撥音んは独立音符・拗音きゃは1モーラ。句頭が助詞/接続詞/感動詞なら弱起(pickup)を提案。漢字は先に読み(かな)へ。",
      inputSchema: { lyrics: z.string().describe("歌詞（かな。漢字は読みへ直してから渡す）"), unit: z.number().optional().describe("1モーラの基準拍（既定1）") },
    },
    async ({ lyrics, unit }) => ok(suggestLyricRhythm(lyrics, unit !== undefined ? { unit } : {})),
  );
  server.registerTool(
    "analyze_lyric_fit",
    {
      title: "メロ×歌詞のアクセント整合レポート",
      description:
        "「この歌詞、歌わせたら変に聞こえない？」「言葉のイントネーションとメロがぶつかってない？」のように、歌詞をメロに乗せたとき歌いやすいか・不自然でないかを調べたいとき使う。日本語アクセント(下がり目/上がり目)と旋律の上下がぶつかる箇所を検出してレポートする（DOWN×上昇=赤で語義誤解リスク／黄=寄せたい）。確定はしない＝候補提示＝ユーザーが握りつぶせる。各音符に歌詞(syllable)が要る＝先に set_lyric したメロの id を渡すか、notes(pitch+syllable)を直接渡す。accents で語ごとのアクセント核を上書き可(0=平板/1=頭高/n=中高)。",
      inputSchema: {
        id: z.string().optional().describe("歌詞付きメロ(melody)ネタのid（content.notes に syllable 必須）。notes を直接渡すなら不要"),
        notes: z.array(z.object({ pitch: z.number(), syllable: z.string().optional(), start: z.number().optional(), dur: z.number().optional() })).optional().describe("直接渡すメロ（pitch=MIDI番号＋syllable=モーラ片）"),
        accents: z.array(z.object({ kana: z.string(), kernel: z.number().int() })).optional().describe("語ごとのアクセント核（kana=語・kernel 0=平板/1=頭高/n=中高）。未指定は内蔵簡易辞書＋平板ヒューリスティック"),
        meter: z.string().optional().describe("拍子（例 4/4）。語境界×リズム軸は将来対応"),
      },
    },
    async ({ id, notes, accents, meter }) => {
      let mnotes = notes as Parameters<typeof analyzeLyricFit>[0] | undefined;
      if (!mnotes?.length && id) {
        const n = core.getNeta(id);
        if (!n) return err("not found");
        const content = (n.content ?? {}) as { notes?: unknown };
        mnotes = Array.isArray(content.notes) ? (content.notes as Parameters<typeof analyzeLyricFit>[0]) : [];
      }
      if (!mnotes?.length) return err("メロが必要です（歌詞付きmelodyの id か、notes を渡して）");
      if (!mnotes.some((x) => x.syllable)) return err("各音符に歌詞(syllable)がありません。先に set_lyric で歌詞を載せて。");
      // W-K1：accents 明示は常に優先（家訓）。未指定なら pyopenjtalk(accent.py) で自動注入を試み、
      // 失敗（未導入/モーラ数不一致/spawn失敗）時は従来の内蔵ヒューリスティックへ graceful fallback。
      let useAccents: { kana: string; kernel: number }[] | undefined = accents;
      let accentSource: "explicit" | "pyopenjtalk" | "heuristic" = accents ? "explicit" : "heuristic";
      if (!accents) {
        try {
          const auto = await accentsFromSyllables(mnotes.map((x) => x.syllable ?? ""));
          if (auto) { useAccents = auto; accentSource = "pyopenjtalk"; }
        } catch { /* fallback＝内蔵ヒューリスティック */ }
      }
      return ok({ ...analyzeLyricFit(mnotes, { ...(useAccents ? { accents: useAccents } : {}), ...(meter ? { meter } : {}) }), accentSource });
    },
  );
  // W-K3 ②歌わせる：歌詞付きメロ(melody)ネタ → VOICEVOX 歌唱 → wav asset（role=render でネタに紐付け）。
  server.registerTool(
    "sing_neta",
    {
      title: "メロを歌わせる（VOICEVOX）",
      description:
        "「この歌詞を歌わせて」「試しに歌ってみて」のように、歌詞を載せたメロを実際の歌声で聴きたいとき使う。歌詞(syllable)付きの melody ネタを VOICEVOX 歌唱エンジンで実際に歌わせ、wav を生成してネタに render 資産として紐付ける（asset id を返す）。先に set_lyric でモーラを載せておくこと。1フレーズ≒1秒で同期実行（少し待つ）。speaker で声色(frame_decode id)を選べる（既定=波音リツ3009）。音域外はクランプ・休符/タイは自動。歌い回しの良否は耳で（機械は足場・仕上げは人間）。",
      inputSchema: {
        netaId: z.string().describe("歌詞付きメロ(melody)ネタのid（content.notes に syllable 必須）"),
        speaker: z.number().int().optional().describe("声色＝frame_decode スタイルid（既定 3009＝波音リツ）。query は歌声モデル(6000)固定"),
      },
    },
    async ({ netaId, speaker }) => {
      const n = core.getNeta(netaId);
      if (!n) return err("not found");
      const content = (n.content ?? {}) as { notes?: unknown };
      const notes = Array.isArray(content.notes) ? (content.notes as { pitch: number; start: number; dur: number; syllable?: string }[]) : [];
      if (!notes.length) return err("このネタに notes がありません（melody を指定して）");
      if (!notes.some((x) => x.syllable)) return err("各音符に歌詞(syllable)がありません。先に set_lyric で歌詞を載せて。");
      const bpm = resolveSingBpm(n); // B1: tempo は neta のDB列(n.tempo)が正準（content.tempo/bpm はフォールバック）
      try {
        const asset = await singNeta(core, netaId, notes, bpm, speaker);
        return ok({ assetId: asset.id, name: asset.name, bytes: asset.size, speaker: speaker ?? 3009, note: "歌唱wavを生成しネタにrender資産として紐付けました。試聴で歌い回しを確認（機械は足場）。" });
      } catch (e) {
        return err(`歌唱に失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );
  // ① 音源アナリーゼ：実在曲を**実際に落として本物のMIR解析**を裏で回す（yt-dlp→Demucs→BPM/コードから調/音域）。
  // チャットは音を聴けないので、曲名しか無ければ先に WebSearch で音声URLを見つけてから渡す＝「落としてきて分析」を実現。
  server.registerTool(
    "analyze_audio",
    {
      title: "音源を解析（YouTube等URL）",
      description: "実在曲の録音を実際にダウンロードして本物のMIR解析（音源分離+BPM+コードから調を導出+音域）を裏で回す。YouTube等の音声/動画URLを渡す。重い(数分)ので『投げてトレイ📥で受け取る』形。結果は知見(アナリーゼ)ネタになる。曲名しか無い時は先に WebSearch で公式音源等のURLを探してから渡すこと。推定でお茶を濁さず、URLが取れるならこれで実測する。",
      inputSchema: { url: z.string().describe("YouTube等の音声/動画URL"), title: z.string().optional().describe("曲名など表示用ラベル"), meter: z.number().int().optional().describe("拍子=1小節の拍数。4/4=4, 6/8=6, 3/4=3。自動検出しない＝ユーザーに聞いて渡す（未指定=4）"), bpm: z.number().optional().describe("BPMが分かれば渡す＝拍検出が固定され綺麗になる（任意・未指定なら自動検出）") },
    },
    async ({ url, title, meter, bpm }) => {
      const job = core.enqueueJob({ intent: "audio_analyze", params: { url, filename: title, meter, bpm } });
      return ok({ jobId: job.id, status: "queued", note: "解析を裏で開始しました。数分後にトレイ📥と知見ネタに届きます（待たずに戻ってOK）。" });
    },
  );
  // ① サイト取得（優先）：コード譜サイト(U-FRET)から**人手採譜のコード進行**を取ってきて弾けるネタにする。
  // 音源MIR(~85%)より人の採譜が正確＝コード/構成を知りたい時はこちらを優先（YouTube落としは音の実測が要る時だけ）。
  server.registerTool(
    "fetch_chords",
    {
      title: "コード譜サイトから取得（U-FRET）",
      description: "コード譜サイト(U-FRET)のURLから**人手採譜のコード進行**を取ってきて、実キーのまま弾ける chord_progression ネタにする（主要ループを抽出）。音源解析(analyze_audio)より正確＝コード/進行を知りたい時はまずこれ。曲名しか無ければ WebSearch で『曲名 アーティスト U-FRET』のURLを見つけて渡す。対応はU-FRET（他サイトは非対応→その時は analyze_audio）。",
      inputSchema: { url: z.string().describe("U-FRET のコード譜ページURL"), title: z.string().optional().describe("曲名(表示用)") },
    },
    async ({ url, title }) => {
      let html: string;
      try {
        const res = await fetch(url, {
          headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
        });
        if (!res.ok) return err(`取得失敗(HTTP ${res.status})`);
        html = await res.text();
      } catch (e) {
        return err(`取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
      const prog = analyzeProgressionFromUfret(html);
      if (!prog) return err("このURLからコード譜を取れませんでした（対応=U-FRET）。別URLか、音源解析(analyze_audio)を使って。");
      const songTitle = title || extractSongTitle(html) || "取得コード";
      const neta = core.createNeta({
        kind: "chord_progression",
        title: `${songTitle} のコード（サイト取得）`,
        content: { chords: prog.chords, source: { url } },
        key: prog.key,
        mode: prog.mode,
        meter: "4/4",
        tags: ["アナリーゼ", "取得"],
      });
      // L13(2026-07-08)：ingestと同一規約(C正規化/library/取込)で連想コーパスにも複製＝find_progressionsから見える。
      core.createNeta(fetchedToLibraryInput(prog, songTitle, url));
      return ok(neta);
    },
  );
  // #S11 横断研究（コードレンズ）：複数曲を音源解析して共通コード進行を抽出→study ネタ＋出口ネタ。
  // Sonnet が WebSearch で works+URL を揃えて渡す→裏で走り→トレイ📥で受け取る。
  server.registerTool(
    "start_study",
    {
      title: "横断研究を開始（複数曲の共通コード進行）",
      description: "作家/ジャンルを横断して共通コード進行の手癖を抜く。works に曲名と音源URL を渡せば裏で解析＋集計→study ネタ＋弾ける chord_progression ネタがトレイ📥に届く。URL は WebSearch で見つけてから渡す（YouTube等）。重い(数分)ので『投げてトレイで受け取る』形。lenses 省略でコードレンズ（v1のみ）。",
      inputSchema: {
        topic: z.string().describe("研究テーマ（例: 「畑亜貴の手癖」「J-POP王道バラード」）"),
        artist: z.string().optional().describe("研究対象のアーティスト/作曲者名＝アーティストタグに付く（例 SURFACE / 林原めぐみ）。手癖は作曲者単位が本筋。同一作曲者なら渡す。クロス作家/ジャンルなら省略可"),
        works: z.array(
          z.object({
            title: z.string().describe("曲名/作品名"),
            audioUrl: z.string().optional().describe("音源URL（YouTube等）。ない場合はコード列なしで集計"),
          }),
        ).describe("研究対象の曲一覧（2〜10曲推奨）"),
        lenses: z.array(z.string()).optional().describe("分析レンズ（省略=コードのみ。v1は'chords'のみ対応）"),
      },
    },
    async ({ topic, artist, works, lenses }) => {
      const job = core.enqueueJob({ intent: "study", params: { topic, artist, works, lenses } });
      return ok({ jobId: job.id, status: "queued", note: `「${topic}」の研究を裏で開始しました。数分後にトレイ📥と study ネタに届きます（待たずに戻ってOK）。` });
    },
  );
  // WP-C3スライス2：ラインクリシェ／ペダルを差す候補（静的区間を検出→10型辞書→複数候補・3rd不動・メロ衝突は降格）。
  server.registerTool(
    "suggest_cliche",
    {
      title: "ラインを差す（クリシェ/ペダル）",
      description:
        "静的なコード進行(同一和音が続く区間)に、内声/ベースの半音線(ラインクリシェ)や保続音(ペダルポイント)を差す候補を返す。「Aメロが動かなくて退屈→内声を動かして」「サビ前で溜めたい」に。3rd不動・1セクション1本・メロ衝突は要耳確認で降格(ブロックしない)。候補まで＝実ボイシング/採否は人。",
      inputSchema: {
        chords: chordsSchema,
        key: z.number().int().min(0).max(11).optional().describe("主音pc。省略時は先頭コードのルート"),
        mode: z.enum(["major", "minor"]).optional(),
        role: z.string().optional().describe("セクション役割(intro/verse/prechorus等)。推奨文脈と外れる型は降格(除外はしない)"),
        melody: notesSchema.optional().describe("メロ(実音ノート)。動く半音線と半音衝突する候補を降格する衝突検査に使う"),
        max: z.number().int().min(1).max(8).optional().describe("返す候補数の上限(既定4)"),
      },
    },
    async ({ chords, key, mode, role, melody, max }) => {
      const cs = (chords ?? []).map((c) => ({ root: normRoot(c.root), quality: c.quality ?? "", start: c.start ?? 0, dur: c.dur ?? 1 }));
      return ok(suggestClicheLines(cs, { key, mode, role, melody, max }));
    },
  );
  // WP-C2：調プラン（セクション間の転調設計）を候補として提示（自動適用しない＝機械は候補まで）。
  server.registerTool(
    "suggest_key_plan",
    {
      title: "調プランを提案（転調）",
      description:
        "セクション役割の並び（intro/verse/prechorus/chorus/bridge/interlude/outro＝Aメロ/Bメロ/サビ等）と基準 key/mode から、曲全体の『調プラン』候補を複数出す。各案＝各セクションの key+mode＋境界の転調メタ(型ID・準備和音・戻り方)。二大頻出＝サビ短3度上げ/最終サビ半音上げ(トラックドライバー)を重み上位に。**必ず『転調しない案』を先頭に含む**。提案のみ＝自動適用しない（各セクションへ key を落とし込み、境界の gen_chords に transition を渡すのは人/上位の判断）。一時転調(借用和音)は対象外＝frameは動かさない。",
      inputSchema: {
        roles: z.array(z.string()).describe("セクション役割の並び（例 [\"intro\",\"verse\",\"prechorus\",\"chorus\",\"verse\",\"prechorus\",\"chorus\",\"bridge\",\"chorus\"]）。Aメロ→verse/Bメロ→prechorus/サビ→chorus 等の別表記も吸収"),
        key: z.number().int().min(0).max(11).optional().describe("基準調の主音pc（0=C..11=B）。未指定=0(C)"),
        mode: z.enum(["major", "minor"]).optional().describe("基準調の長短。未指定=major"),
        count: z.number().int().min(1).max(8).optional().describe("返す候補数（既定4・先頭は必ず転調しない案）"),
      },
    },
    async ({ roles, key, mode, count }) => ok({ plans: suggestKeyPlan(roles ?? [], key ?? 0, mode ?? "major", count !== undefined ? { count } : {}) }),
  );
  // WP-X1：構成テンプレ（構成型辞書 F01..F14）から構成候補を提案（自動適用しない＝機械は候補まで）。
  server.registerTool(
    "suggest_form",
    {
      title: "構成を提案（構成型テンプレ）",
      description:
        "ジャンル/目標尺/Bメロ有無/ポストコーラス/サビ頭/bridge の条件から、曲の『構成候補』を複数出す。各案＝役割列（intro/verse/verse_var(A')/prechorus(Bメロ)/chorus(サビ)/postchorus/bridge(Cメロ)/interlude(間奏)/drop_chorus(落ちサビ)/last_chorus(大サビ)/outro）＋各セクション小節数＋概算尺。構成型辞書 F01..F14（J-pop黄金/標準/短尺/サビ頭/ボカロ超短尺/アニソンTVサイズ89秒/洋楽VC/VPC/ポストコーラス/AABA/落ちサビ強調/ダブルサビ）。**尺目標があれば削除優先順位 Inst>O>I>A'>B で切り詰め、収まる案だけ返す**。Bメロは二値トグル（on/off/auto）。**提案のみ＝自動適用しない**（役割列を song の place_child や gen_* の frame.section へ落とすのは人/上位の判断）。",
      inputSchema: {
        genre: z.enum(["jpop", "vocaloid", "anime_tv", "western_pop", "ballad", "game_loop", "oldies"]).optional().describe("ジャンル/年代文脈。候補型を辞書引き。未指定=全型から"),
        lengthTarget: z.enum(["full", "standard", "short", "tv_size", "custom"]).optional().describe("尺プリセット。full≈4:30/standard≈3:30/short≈2:45/tv_size=89秒(アニソン)/custom=targetSeconds指定。未指定=尺制約なし"),
        targetSeconds: z.number().min(10).max(600).optional().describe("custom 時の目標秒数"),
        hasPrechorus: z.enum(["on", "off", "auto"]).optional().describe("Bメロ(prechorus)トグル。off=全候補からBメロを省略/on/auto=辞書型のまま。未指定=auto"),
        chorusFirst: z.boolean().optional().describe("サビ頭(冒頭でサビ先出し)の型を優先"),
        postChorus: z.boolean().optional().describe("ポストコーラス(サビ後の追い)を持つ型を優先"),
        bridge: z.boolean().optional().describe("後半ドラマ(Cメロ/bridge)の有無。false で bridge を省略"),
        bpm: z.number().min(40).max(300).optional().describe("概算尺の算出テンポ。未指定=120"),
        meter: z.string().optional().describe("拍子(例 4/4・6/8)。概算尺の1小節拍数。未指定=4/4"),
        count: z.number().int().min(1).max(8).optional().describe("返す候補数(既定4・doc §5-B＝3〜5案)"),
      },
    },
    async (a) => ok({ candidates: suggestForm({ genre: a.genre, lengthTarget: a.lengthTarget, targetSeconds: a.targetSeconds, hasPrechorus: a.hasPrechorus, chorusFirst: a.chorusFirst, postChorus: a.postChorus, bridge: a.bridge, bpm: a.bpm, meter: a.meter, count: a.count }) }),
  );
  // WP-X1：役割列 → エネルギープラン（多次元アークΔ＋レイヤ写像＋既存ノブ推奨値）を提案（自動適用しない）。
  server.registerTool(
    "suggest_energy_plan",
    {
      title: "エネルギープランを提案（多次元アーク）",
      description:
        "役割列（落ちサビ/大サビ含む）から、各セクションの『エネルギープラン』を出す。5次元(密度/音域/レイヤ/ラウドネス/細分化)の**前セクション比Δ**（−2..+2）＋絶対レベル(low/mid/high/peak)＋レイヤ追加/削除の具体操作＋**既存生成ノブへの推奨値**(density/registerShift/energy/runs＝frame.section や gen_melody へ渡せる実在ノブ)。谷→山(落ちサビ→ラスサビ)でΔ最大化。テンプレ3種＝jpop_standard/ballad/four_on_floor。**提案のみ＝自動適用しない**（曲の情動設計＝機械が決め切らず人が崩す・doc §6）。知覚エネルギーは絶対値でなくΔで決まる＝ピークの正体は音量でなくlayers/density/subdiv。",
      inputSchema: {
        roles: z.array(z.string()).describe("役割列（例 [\"intro\",\"verse\",\"prechorus\",\"chorus\",\"verse\",\"prechorus\",\"chorus\",\"bridge\",\"drop_chorus\",\"last_chorus\",\"outro\"]）。落ちサビ→drop_chorus/大サビ→last_chorus/サビ→chorus/Aメロ→verse/Bメロ→prechorus 等の別表記も吸収"),
        template: z.enum(["jpop_standard", "ballad", "four_on_floor"]).optional().describe("エネルギーテンプレ。jpop_standard=標準J-pop(落ちサビ谷→ラスサビ山)/ballad=register/layersで山/four_on_floor=build→drop。未指定=jpop_standard"),
      },
    },
    async ({ roles, template }) => ok(suggestEnergyPlan(roles ?? [], template !== undefined ? { template } : {})),
  );
  // WP-E1：感情語 or V-A座標 → 実在ノブの推奨値プリセット（提案のみ・過信警告付き）。emotion_shift（単体コードの品質シフト）とは別物＝生成ノブ翻訳。
  server.registerTool(
    "suggest_emotion_params",
    {
      title: "感情語→生成パラメータを提案",
      description:
        "「切ない感じで/疾走感/エモい」等の感情語（or V-A座標）を、生成エンジンの**実在ノブの推奨値**へ翻訳して提案する。返り＝V-A座標＋mix(正負混合)フラグ＋一行根拠＋variations（各案＝mode/palette/tempoBpm＋knobs{registerShift/density/swing/expression/articulation/flow/runs/borrow/secondaryDom}＝frame や gen_melody/gen_chords へ渡せる実在ノブのみ）＋**過信警告**（文化/個人差依存）。切ない/エモい/懐かしい/情熱は正負混合＝**陽寄り/陰寄り2案**を返す。17語プリセット（明るい/悲しい/切ない/エモい/疾走感/浮遊感/儚い/懐かしい/怒り/恐れ/荘厳/穏やか/高揚/クール/情熱/決意/幻想的・別表記/英語も吸収）。**提案のみ＝自動適用しない**（1ノブで決めず候補として耳に委ねる・doc §6）。1コードの品質を切なく/明るくは emotion_shift。",
      inputSchema: {
        word: z.string().optional().describe("感情語（例 切ない/疾走感/エモい/happy/dreamy）。別表記・英語も吸収。引けなければ V-A 近傍へフォールバック"),
        V: z.number().min(-1).max(1).optional().describe("valence −1..+1（快‐不快）。word 未指定/不一致時に最近傍プリセットを引く"),
        A: z.number().min(0).max(1).optional().describe("arousal 0..1（覚醒‐鎮静）。V と併せて最近傍を引く"),
      },
    },
    async ({ word, V, A }) => {
      const r = suggestEmotionParams({ word, V, A });
      return r ? ok(r) : err("感情語が辞書に無く V-A 座標も未指定＝提案不可（word か V+A を渡す）");
    },
  );
  server.registerTool(
    "generate",
    { title: "作る（枠/様式から・候補）", description: "既存に依存せず枠/様式からコード進行(or rhythm)候補を作る。melody/bass は基準が要る＝weave を使う。保存しない。", inputSchema: { kind: z.enum(["chord_progression", "rhythm"]), frame: frameSchema, name: z.string().optional().describe("名前付き進行(丸の内/カノン等)"), seed: z.number().int().optional(), role: z.string().optional(), structure: z.string().optional(), corpus: z.boolean().optional().describe("中間のつなぎを実J-POPコーパスの手癖へ寄せる（既定OFF＝bit一致・境界/終止は構造層のまま）"), temperature: z.number().optional().describe("意外性ダイヤル（低=王道/最頻・高=攻め/裾の正当候補も顔を出す・既定1）。corpus:true時のみ有効") } },
    async ({ kind, frame, name, seed, role, structure, corpus, temperature }) => {
      if (role || structure) return err("role/structure は未対応（③-7）。構造(連結等)は assemble/continue で組む。");
      if (name) return ok(genNamedProgression(name, frame));
      if (kind === "chord_progression") {
        const transitions = corpus && hasChordTransitions(core.db) ? loadChordTransitions(core.db, "pop", isMinorFrame(normalizeFrame(frame)) ? "minor" : "major") : undefined;
        return ok(genChords(frame, seed, undefined, transitions ? { transitions, temperature } : undefined));
      }
      return ok(genDrums(frame, seed));
    },
  );
  server.registerTool(
    "weave",
    { title: "絡める（基準＝コード/メロに噛み合うパートを作る・候補）", description: "コードやメロという「基準」に噛み合う音（メロ/ベース/ハモ/対旋律）を作る・直したいとき使う。※歌詞は扱わない＝「メロに歌詞を合わせたい／詞に合うメロを作りたい」なら gen_melody の lyrics（歌詞→音数ぴったりのメロ）・suggest_lyric_rhythm（歌詞の譜割りを先に見る）・analyze_lyric_fit（乗せた後の歌いやすさ点検）へ。必ず基準(chords/melody)を入力に取りそれに噛み合うものを作る/直す。コードに合うメロ・既存メロの補正・ハモ付け・対旋律(counter=主メロの間まに絡む第2声)。候補は generate と同じ items 形({items:[{kind,content}]})で返る。保存しない。", inputSchema: { target: z.enum(["melody", "bass", "chords", "counter"]), frame: frameSchema, chords: chordsSchema.optional(), melody: notesSchema.optional(), key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional(), seed: z.number().int().optional(), style: z.string().optional().describe("コーパスstyle(irish/game等)。melody新規生成時に歩幅をその統計へ寄せる") } },
    async ({ target, frame, chords, melody, key, mode, seed, style }) => {
      if (target === "counter") { // WP-X3a 対旋律＝主メロ(melody)必須。主メロの間まに絡む第2声（音域分離/相補/2度回避/反行）。
        if (!melody?.length) return err("weave counter は基準 melody(主メロ) が必須");
        return ok(genCounter(frame, melody, chords, seed));
      }
      if (target === "melody") {
        if (!chords) return err("weave melody は基準 chords が必須");
        if (melody) {
          const r = fitToChords(melody, chords, key); // 既存メロをコードへ追従(U10)
          // C③ 候補は generate と同じ items 形に統一（web/脳が返り型で分岐せずに済む）。補正スコアは meta へ。
          return ok({ items: [{ kind: "melody", content: { notes: r.notes }, label: "コードへ補正" }], meta: { before: r.before, after: r.after }, edges: [] });
        }
        // P1 自己進化ループ：1本に潰さず「多め生成→らしさ(E-corpus)順→多様な top-k」で候補を返す。
        // corpusModel＝ライブラリ学習(自分/コーパスらしさ)。seed 明示時は決定的な単一（従来どおり）。
        const corpusModel = learnMotifModelFromLibrary(core, style);
        // J2c(2026-07-11)：useV2:true＝gen_melody と同じ本線へ（従来この経路だけ useV2 無し＝旧経路③④に落ちていた。
        // weave のメロ候補の質を V2 に揃える意図的変更。4/4|複合拍+chords はV2・ゲート外れは従来どおりフォールバック）。
        return ok(genMelodyCandidates(frame, chords, seed, { useV2: true, motifModel: corpusModel ?? undefined, corpusModel })); // コードに合う新規メロ候補(U3・style でコーパス bias)
      }
      if (target === "bass") {
        if (!chords) return err("weave bass は基準 chords が必須");
        return ok(genBass(frame, chords));
      }
      if (!melody) return err("weave chords(ハモ付け) は基準 melody が必須");
      // C③ ハモ付けも items 形に統一：各小節の最有力を1進行に、代替候補は meta.bars に残す。
      const bpb = meterInfo(frame?.meter).beatsPerBar;
      const bars = harmonize(melody, key ?? 0, { mode });
      const chordsOut = bars.map((b) => ({ root: b.candidates[0]?.root ?? 0, quality: b.candidates[0]?.quality ?? "", start: b.start, dur: bpb }));
      return ok({ items: [{ kind: "chord_progression", content: { chords: chordsOut }, label: "ハモ付け" }], meta: { bars }, edges: [] });
    },
  );
  server.registerTool(
    "reshape",
    {
      title: "寄せる/崩す（感じで変形・候補）",
      description:
        "既存を「ある感じ」へ変形。emotion=コードを darker/brighter。**deform=メロを崩す**＝提示メロのリズム指紋＋輪郭(身振り)を継ぎ、ピッチ列はコードに沿って作り直す＝「似た雰囲気の別メロ」(著作権セーフ)。strength 0..1(0=寄せる/1=面影だけ)・blendWith で複数メロの身振りを混ぜる。保存しない(候補)。範囲指定や進行レベル feel は未対応(③-3)。",
      inputSchema: {
        mode: z.enum(["emotion", "deform"]),
        chord: oneChord.optional(),
        dir: z.enum(["darker", "brighter"]).optional(),
        range: z.unknown().optional(),
        feel: z.string().optional(),
        // deform 用
        melody: notesSchema.optional(),
        chords: chordsSchema.optional(),
        strength: z.number().min(0).max(1).optional(),
        blendWith: z.array(notesSchema).optional(),
        seed: z.number().int().optional(),
        frame: z.unknown().optional(),
      },
    },
    async ({ mode, chord, dir, range, feel, melody, chords, strength, blendWith, seed, frame }) => {
      if (mode === "emotion") {
        if (range || feel) return err("range/feel拡張(オープン等・進行レベル・部分)は未対応（③-3）");
        if (!chord || !dir) return err("reshape emotion は chord と dir(darker|brighter)");
        const deg = toDegrees([chord], 0)[0]!; // ルート不変＝key不要（degree=root）
        return ok(emotionShift(deg, dir).map((s) => ({ ...s, root: s.degree })));
      }
      if (mode === "deform") {
        if (!melody?.length) return err("reshape deform は melody(崩す元メロ) が要る");
        // メロを崩す＝essence(リズム指紋+輪郭)を継ぎ、ピッチ列はコードに沿って再生成（似て非なる・著作権セーフ）。
        return ok(
          genFromEssence(melody, (frame ?? null) as Parameters<typeof genFromEssence>[1], chords, seed, { strength, blendWith }),
        );
      }
      return err("reshape: 未対応の mode");
    },
  );
  server.registerTool(
    "convert",
    { title: "変換する（移調/拍子・確定）", description: "AI判断不要の確定変換（移調/6-8化）。", inputSchema: { mode: z.enum(["transpose", "meter"]), semitones: z.number().int().optional(), meter: z.string().optional(), content: z.unknown().optional() } },
    async () => err("確定変換(convert)は未実装（③-4）"),
  );
  server.registerTool(
    "continue",
    { title: "続ける（継続・候補）", description: "既存進行の次のコード候補。複数小節/役割への継続は未対応(③-6)。保存しない。", inputSchema: { chords: chordsSchema, key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional(), top: z.number().int().optional(), bars: z.number().int().optional() } },
    async ({ chords, key, mode, top, bars }) => {
      if (bars) return err("複数小節/役割への継続は未対応（③-6）。単一の次コード候補のみ。");
      const k = key ?? 0;
      const cands = nextChordCandidates(toDegrees(chords, k), { mode, top });
      // 実音で返す（degree↔実音の変換は脳にさせない）：next_chord と対称に root を添える。
      return ok(cands.map((c) => ({ ...c, root: (c.degree + k) % 12 })));
    },
  );
  server.registerTool(
    "search",
    { title: "探す（在庫/コーパス・読取）", description: "「前に書いた歌詞を出して」「あのコード進行どこだっけ」のように、在庫（ネタ帳）や連想元コーパスから探したいとき使う。歌詞だけ絞るなら kind:\"lyric\"（メロは kind:\"melody\" 等）。ネタ帳(project)＋連想元コーパス(library)から意味/様式/名前/類似で引く。一覧も。捏造せず無ければ空。対照(contrast)は未対応(③-5)。", inputSchema: { q: z.string().optional(), kind: z.string().optional(), mood: z.string().optional(), key: z.number().int().optional(), meter: z.string().optional(), tags: z.array(z.string()).optional(), scope: scopeEnum.optional(), limit: z.number().int().optional(), offset: z.number().int().optional(), like: chordsSchema.optional(), likeKey: z.number().int().optional(), similarTo: notesSchema.optional(), candidates: z.array(z.object({ id: z.string().optional(), label: z.string().optional(), notes: notesSchema })).optional(), mode: z.enum(["similar", "contrast"]).optional(), top: z.number().int().optional() } },
    async ({ q, kind, mood, key, meter, tags, scope, limit, offset, like, likeKey, similarTo, candidates, mode, top }) => {
      if (mode === "contrast") return err("対照(contrast)検索は未対応（③-5）");
      if (similarTo) return ok(findSimilar(similarTo, candidates ?? [], top));
      if (like) return ok(findProgressions(core, { tags, like: { chords: like, key: likeKey }, limit }));
      // qあり＝検索は意味(cm-search)＋キーワードの合流・scope既定"all"（ツール説明「意味/様式/名前で
      // project＋libraryから引く」との乖離是正＝機材インベントリ(kind:knowledge,library)へ「ドラム音源」等の
      // 自然な言い方で届かなかったバグの根治・2026-07-14）。VITEST時は意味検索スキップ＝テスト密閉。
      // qなし＝素の一覧は従来project既定＝ネタ帳一覧にlibraryコーパス(メロ句1000超)が混ざる事故を防ぐ。
      // (b) chat面は content 丸ごとをやめ要約射影＝analysis 1件混入でも token 上限を割らない。full面は不変。
      const proj = (items: Neta[]) => (isChat ? items.map(summarizeNetaForSearch) : items);
      if (q) {
        const merged = await searchNetaMerged(core, {
          q, kind, mood, key, meter, tags, scope, limit, offset,
          semanticUrl: process.env.VITEST ? null : undefined,
        });
        return ok(proj(merged.items));
      }
      return ok(proj(core.listNeta({ kind, mood, key, meter, tags, scope, limit, offset })));
    },
  );
  server.registerTool(
    "analyze",
    { title: "判る（同定/説明/当てはまり/メロ品質/声部進行）", description: "これ何進行?/なぜ?/調は?/合ってる?/このメロ変じゃない?/メロと低音の声部進行は綺麗?。全生成・修正の土台。", inputSchema: { question: z.enum(["fit", "identify", "key", "explain", "progression", "melody", "voiceleading"]), chords: chordsSchema.optional(), notes: notesSchema.optional(), bass: notesSchema.optional().describe("低音（ベース）。voiceleading で notes(メロ) と対で使う。無ければ chords のルートを低域で代用"), key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional(), meter: z.string().optional().describe("拍子（例 4/4・6/8）。melody 評価の強拍判定に使う") } },
    async ({ question, chords, notes, bass, key, mode, meter }) => {
      if (question === "voiceleading") {
        // #8(2026-07-09)：メロ×低音の対位法違反(並行/隠伏5度8度・声部交差)を数える分析レンズ（生成非介入）。
        if (!notes) return err("analyze voiceleading は notes(メロ)");
        const mel = notes.map((n, i) => ({ pitch: n.pitch, start: n.start ?? i, dur: n.dur ?? 1 }));
        // bass 明示が最良。無ければ chords のルートを C2 域(36-47)で代用（各コード区間の頭に置く）。
        const low = bass?.length
          ? bass.map((n, i) => ({ pitch: n.pitch, start: n.start ?? i, dur: n.dur ?? 1 }))
          : (chords ?? []).map((c) => { const pc = normRoot(c.root ?? 0); return { pitch: 36 + pc, start: c.start ?? 0, dur: c.dur ?? 1 }; });
        if (!low.length) return err("analyze voiceleading は bass か chords が必要");
        return ok(analyzeVoiceLeading(mel, low));
      }
      if (question === "fit") {
        if (!notes || !chords) return err("analyze fit は notes と chords");
        return ok(analyzeFit(notes, chords, key));
      }
      if (question === "key") {
        if (!notes) return err("analyze key は notes");
        return ok(detectKeyFromNotes(notes));
      }
      if (question === "melody") {
        // P0-c：規則ベースのメロ評価＝{score, metrics(項目別), critique(弱い規則の言語化)}。
        // 総合scoreは"変なメロ検出ガード"の目安であって、良し悪しの断は人間（哲学：機械は足場まで）。
        if (!notes) return err("analyze melody は notes");
        // notesSchema は start/dur 任意。評価器は必須なので既定補完（禁則跳躍/順次/頂点/終止は pitch のみ・
        // 強拍コードトーン/息継ぎだけ start/dur を使う＝省略時は控えめに既定）。
        const mnotes = notes.map((n, i) => ({ pitch: n.pitch, start: n.start ?? i, dur: n.dur ?? 1 }));
        return ok(evalMelody(mnotes, { chords, key, meter }));
      }
      if (!chords) return err(`analyze ${question} は chords`);
      if (question === "identify") return ok(identifyProgression(chords, key !== undefined ? { key } : {}));
      if (question === "explain") return ok(explainProgression(chords, { key, mode }));
      return ok(analyzeProgression(chords, { key, mode }));
    },
  );
  // WP-M8 独自性チェック（cryptomnesia）＝新作メロ × 自作既出コーパス（project の melody 全走査）→ 焼き直し注記。
  // 警告のみ・ブロックしない（研究doc §4）。除外ゲート（ありふれ音型/コーパス頻度）＋AND 条件で乱発を防ぐ。
  // 2旋律直接の三色トリアージも同verbで（candidates 明示 or against 指定時）。既存 melody_similarity は不変（別verb）。
  server.registerTool(
    "check_originality",
    {
      title: "独自性チェック（焼き直し警告・法的助言ではない）",
      description:
        "新作メロを自作既出コーパス（project の melody 全走査）と照合し、無意識の焼き直し(cryptomnesia)を緑/黄/赤で注記。警告のみでブロックしない。ありふれた音型(スケール/分散和音/定番)は除外。**これは法的助言ではありません**。against(2旋律直接) or candidates 明示も可。骨格の手癖は layer:'skeleton'。",
      inputSchema: {
        notes: notesSchema,
        against: notesSchema.optional().describe("2旋律を直接トリアージ（指定時はコーパス走査せず notes×against）"),
        candidates: z.array(z.object({ id: z.string().optional(), label: z.string().optional(), notes: notesSchema })).optional().describe("照合先を明示（未指定は project の melody を自動走査）"),
        scope: scopeEnum.optional().describe("自動走査の範囲（既定 project）"),
        excludeId: z.string().optional().describe("自分自身のネタIDを除外"),
        layer: z.enum(["skeleton", "surface"]).optional().describe("層ラベル（自己模倣は骨格に出やすい）"),
      },
    },
    async ({ notes, against, candidates, scope, excludeId, layer }) => {
      const opts = layer ? { layer } : {};
      if (against) return ok({ ...similarityWarning(notes, against, opts), against: true });
      const corpus = candidates ?? core
        .listNeta({ kind: "melody", scope: scope ?? "project", limit: 500 })
        .filter((n) => n.id !== excludeId)
        .map((n) => ({ id: n.id, label: n.title ?? undefined, notes: (n.content as { notes?: { pitch: number; start?: number; dur?: number }[] } | null)?.notes ?? [] }));
      return ok(originalityReport(notes, corpus, opts));
    },
  );

  return server;
}
