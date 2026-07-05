import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Core } from "./core";
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
  genFromEssence,
  genBass,
  genDrums,
  analyzeFit,
  fitToChords,
  detectKeyFromNotes,
  melodySimilarity,
  findSimilar,
  genNamedProgression,
} from "./music";
import { learnStepWeightsFromLibrary, learnMotifModelFromLibrary } from "./music/corpusBias";
import { splitMora, flowLyric, type LNote } from "./lyric";
import { meterInfo } from "./music/meter";
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

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  content: [{ type: "text" as const, text: msg }],
  isError: true,
});

/**
 * MCPツール層（docs/design.md #20）。TSの操作コアを AIクライアント（Claude Code/Desktop 等）に公開。
 * HTTP と同じ Core を叩く＝同一操作の別アダプタ。
 */
// 10 verbs / legacy 両方が使う共有スキーマ（モジュール級＝surface 分岐の外に置く）。
const oneChord = z.object({
  root: z.union([z.number(), z.string()]).describe("根音＝実音。数値はピッチクラス0-11(0=C…)、文字列は音名"),
  quality: z.string().optional().describe("コード品質（\"\"=メジャー, \"m\", \"7\" 等）"),
});
const frameSchema = z
  .object({
    key: z.number().int().min(0).max(11).optional().describe("主音のピッチクラス0-11（0=C,7=G…）。生成はこの調の実音で返る"),
    meter: z.string().optional().describe("拍子＝\"分子/分母\"文字列（例 \"4/4\",\"3/4\",\"6/8\"）"),
    tempo: z.number().optional().describe("テンポ＝BPM（密度の判断にも使う）"),
    bars: z.number().int().optional().describe("小節数（1コール=この小節数の“1つ”の構造。1-16にクランプ）"),
    mood: z.string().optional().describe("雰囲気＝自由文字列。「切ない/悲し/dark/sad」等は短調・疎、「明るい/速い/ダンス」等は密に効く"),
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

// #100/#101: surface="chat" は **10 verbs だけ**公開（旧39を隠す＝モデルが旧ツールを掴まない）。"full"(既定)は49（test/worker 互換）。
export function buildMcpServer(core: Core, opts: { surface?: "chat" | "full" } = {}): McpServer {
  const server = new McpServer({ name: "creative-manager", version: "0.0.0" });
  const legacy = opts.surface !== "chat";

  if (legacy) {
  server.registerTool(
    "create_neta",
    {
      title: "ネタを作成（捕獲）",
      description: "ネタ（歌詞/メロ/コード/ベース/リズム/テーマ/曲など）を作成する。",
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
        "コード進行が定番進行（丸の内/カノン/小室/王道/ツーファイブ/ブルース）のどれに近いかを近い順に返す。回転・移調に強い。調未指定なら推定。「これ何進行？」に。",
      inputSchema: { chords: chordsSchema, key: z.number().int().min(0).max(11).optional() },
    },
    async ({ chords, key }) => ok(identifyProgression(chords, key !== undefined ? { key } : {})),
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
      },
    },
    async ({ chords, key, mode }) => {
      const degs = toDegrees(chords, key);
      const cands = nextChordCandidates(degs, { mode });
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
      description: "曲(kind=song)の stage（段階）／next_action（次の一手）を更新する。",
      inputSchema: {
        id: z.string(),
        stage: z.string().nullable().optional(),
        next_action: z.string().nullable().optional(),
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
    { title: "コード進行を生成", description: "機能和声ルールで進行を生成（T始終・ダイアトニック・frame.key の実音で返る）。", inputSchema: { frame: frameSchema, seed: z.number().int().optional() } },
    async ({ frame, seed }) => ok(genChords(frame, seed)),
  );
  server.registerTool(
    "gen_melody",
    { title: "メロディを生成", description: "コードトーン拘束のメロを生成（拍頭=コードトーン）。chords を渡せば合わせる。style でコーパス(library)の歩幅統計にバイアス。repetition=動機反復の強さ(0-1)、rangeSteps=音域(音階ステップ・6度≈6)で利用時制約。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional(), seed: z.number().int().optional(), style: z.string().optional().describe("コーパスstyle(irish/game等)。投入済みなら歩幅をその統計へ寄せる"), repetition: z.number().min(0).max(1).optional().describe("動機反復の強さ 0=反復なし〜1=強反復(既定0.85=やや強め)"), rangeSteps: z.number().int().min(2).max(20).optional().describe("骨格の音域(音階ステップ)。6度差に抑えるなら6"), motifBars: z.number().int().min(1).max(4).optional().describe("モチーフ/フレーズ長(小節)。1=短く反復多め/2=既定/4=長く展開的") } },
    async ({ frame, chords, seed, style, repetition, rangeSteps, motifBars }) => ok(genMelody(frame, chords, seed, { useV2: true, stepWeights: learnStepWeightsFromLibrary(core, style) ?? undefined, motifModel: learnMotifModelFromLibrary(core, style) ?? undefined, repetition, rangeSteps, motifBars })),
  );
  server.registerTool(
    "complete_melody",
    { title: "メロディを補完", description: "部分メロ(先頭数小節)を種に、そのモチーフを発展させて frame.bars 全体まで埋める（補完=completion）。notes の小節は実音を保持し、残りを A'/B(反行)/A'' 発展で生成。決定的(seed)・著作権セーフ(ユーザー自作の発展)。", inputSchema: { notes: notesSchema.describe("部分メロ＝発展の種（先頭1-2小節想定）"), chords: chordsSchema, frame: frameSchema, seed: z.number().int().optional() } },
    async ({ notes, chords, frame, seed }) => ok(genMelody(frame, chords, seed, { useV2: true, partial: notes })),
  );
  server.registerTool(
    "gen_bass",
    { title: "ベースを生成", description: "強拍ルート/弱拍5度のベースライン（C2基準低域・コードに合う）。", inputSchema: { frame: frameSchema, chords: chordsSchema.optional() } },
    async ({ frame, chords }) => ok(genBass(frame, chords)),
  );
  server.registerTool(
    "gen_drums",
    { title: "ドラムを生成", description: "GMバックビート（1小節・16分グリッド hits=step index・4/4で16step/6-8で12step・seedで小変化）。content.rhythm.beatsPerStep で拍換算。", inputSchema: { frame: frameSchema, seed: z.number().int().optional() } },
    async ({ frame, seed }) => ok(genDrums(frame, seed)),
  );
  server.registerTool(
    "gen_named_progression",
    { title: "名前付き進行を生成", description: "丸の内/カノン/小室/王道/ツーファイブ/ブルース等を確定realize（別名・表記揺れ可・frame.key の実音で返る）。未知は空。", inputSchema: { name: z.string(), frame: frameSchema } },
    async ({ name, frame }) => ok(genNamedProgression(name, frame)),
  );

  // 当てはまり判定/補正/調推定/類似（cm-music-mcp の analysis を TS に集約＝S2 でcm-music廃止）。
  server.registerTool(
    "analyze_fit",
    { title: "メロのコード当てはまり", description: "メロが各コードにどれだけ合うか（コードトーン/スケール/外し）を判定。", inputSchema: { melody: notesSchema, chords: chordsSchema, key: z.number().int().min(0).max(11).optional() } },
    async ({ melody, chords, key }) => ok(analyzeFit(melody, chords, key)),
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

  } // ← if(legacy) ここまで＝full のみ旧39を登録。surface="chat" は以下の10 verbsだけ。

  // ── #101 目的ツール面（10 thin verbs）。chat面はこれだけ＝モデルが旧ツールを掴まない。既存エンジンへ dispatch、未実装は明示エラー(捏造禁止)。
  //    A 書込: capture/revise/assemble ｜ B 生成(候補・保存しない): generate/fit/reshape/convert/continue ｜ C 読取: search/analyze
  //    横断概念(range/feel/style)はB群の修飾引数で吸収(fat化させない)。role/structure(連結)は assemble/continue 側。
  server.registerTool(
    "capture",
    { title: "置く（捕獲）", description: "持ち込んだコード/メロ/歌詞等をそのまま登録（生成しない）。生成候補の確定もここ。", inputSchema: netaInputShape },
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
  // ② 歌詞↔メロ：read_neta でメロの音符/歌詞を読む・set_lyric で歌詞(かな)を音符へ流し込む。
  server.registerTool(
    "read_neta",
    { title: "ネタを読む", description: "ネタの中身(content 込み)を取得。メロの音符/歌詞/コードを読むのに使う（メロ→仮歌詞・歌詞の音数合わせに）。", inputSchema: { id: z.string() } },
    async ({ id }) => { const n = core.getNeta(id); return n ? ok(n) : err("not found"); },
  );
  server.registerTool(
    "set_lyric",
    { title: "歌詞をメロに載せる", description: "melody ネタに歌詞(かな)を1:1で流し込み各音符に syllable を付ける（モーラ>音符は最長音符を分割、余りはメリスマ\"ー\"）。歌詞→メロの仕上げ／メロ→仮歌詞の反映に。", inputSchema: { id: z.string(), lyrics: z.string() } },
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
  // ① 音源アナリーゼ：実在曲を**実際に落として本物のMIR解析**を裏で回す（yt-dlp→Demucs→BPM/コードから調/音域）。
  // チャットは音を聴けないので、曲名しか無ければ先に WebSearch で音声URLを見つけてから渡す＝「落としてきて分析」を実現。
  server.registerTool(
    "analyze_audio",
    {
      title: "音源を解析（YouTube等URL）",
      description: "実在曲の録音を実際にダウンロードして本物のMIR解析（音源分離+BPM+コードから調を導出+音域）を裏で回す。YouTube等の音声/動画URLを渡す。重い(数分)ので『投げてトレイ📥で受け取る』形。結果は知見(アナリーゼ)ネタになる。曲名しか無い時は先に WebSearch で公式音源等のURLを探してから渡すこと。推定でお茶を濁さず、URLが取れるならこれで実測する。",
      inputSchema: { url: z.string().describe("YouTube等の音声/動画URL"), title: z.string().optional().describe("曲名など表示用ラベル") },
    },
    async ({ url, title }) => {
      const job = core.enqueueJob({ intent: "audio_analyze", params: { url, filename: title } });
      return ok({ jobId: job.id, status: "queued", note: "解析を裏で開始しました。数分後にトレイ📥と知見ネタに届きます（待たずに戻ってOK）。" });
    },
  );
  server.registerTool(
    "generate",
    { title: "作る（枠/様式から・候補）", description: "既存に依存せず枠/様式からコード進行(or rhythm)候補を作る。melody/bass は基準が要る＝fit を使う。保存しない。", inputSchema: { kind: z.enum(["chord_progression", "rhythm"]), frame: frameSchema, name: z.string().optional().describe("名前付き進行(丸の内/カノン等)"), seed: z.number().int().optional(), role: z.string().optional(), structure: z.string().optional() } },
    async ({ kind, frame, name, seed, role, structure }) => {
      if (role || structure) return err("role/structure は未対応（③-7）。構造(連結等)は assemble/continue で組む。");
      if (name) return ok(genNamedProgression(name, frame));
      if (kind === "chord_progression") return ok(genChords(frame, seed));
      return ok(genDrums(frame, seed));
    },
  );
  server.registerTool(
    "fit",
    { title: "合わせる（基準に噛ませる・候補）", description: "必ず基準(chords/melody)を入力に取りそれに噛み合うものを作る/直す。コードに合うメロ・既存メロの補正・ハモ付け。候補は generate と同じ items 形({items:[{kind,content}]})で返る。保存しない。", inputSchema: { target: z.enum(["melody", "bass", "chords"]), frame: frameSchema, chords: chordsSchema.optional(), melody: notesSchema.optional(), key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional(), seed: z.number().int().optional(), style: z.string().optional().describe("コーパスstyle(irish/game等)。melody新規生成時に歩幅をその統計へ寄せる") } },
    async ({ target, frame, chords, melody, key, mode, seed, style }) => {
      if (target === "melody") {
        if (!chords) return err("fit melody は基準 chords が必須");
        if (melody) {
          const r = fitToChords(melody, chords, key); // 既存メロをコードへ追従(U10)
          // C③ 候補は generate と同じ items 形に統一（web/脳が返り型で分岐せずに済む）。補正スコアは meta へ。
          return ok({ items: [{ kind: "melody", content: { notes: r.notes }, label: "コードへ補正" }], meta: { before: r.before, after: r.after }, edges: [] });
        }
        return ok(genMelody(frame, chords, seed, { stepWeights: learnStepWeightsFromLibrary(core, style) ?? undefined, motifModel: learnMotifModelFromLibrary(core, style) ?? undefined })); // コードに合う新規メロ(U3・style でコーパス bias)
      }
      if (target === "bass") {
        if (!chords) return err("fit bass は基準 chords が必須");
        return ok(genBass(frame, chords));
      }
      if (!melody) return err("fit chords(ハモ付け) は基準 melody が必須");
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
    { title: "探す（在庫/コーパス・読取）", description: "ネタ帳(project)＋連想元コーパス(library)から意味/様式/名前/類似で引く。一覧も。捏造せず無ければ空。対照(contrast)は未対応(③-5)。", inputSchema: { q: z.string().optional(), kind: z.string().optional(), mood: z.string().optional(), key: z.number().int().optional(), meter: z.string().optional(), tags: z.array(z.string()).optional(), scope: scopeEnum.optional(), limit: z.number().int().optional(), offset: z.number().int().optional(), like: chordsSchema.optional(), likeKey: z.number().int().optional(), similarTo: notesSchema.optional(), candidates: z.array(z.object({ id: z.string().optional(), label: z.string().optional(), notes: notesSchema })).optional(), mode: z.enum(["similar", "contrast"]).optional(), top: z.number().int().optional() } },
    async ({ q, kind, mood, key, meter, tags, scope, limit, offset, like, likeKey, similarTo, candidates, mode, top }) => {
      if (mode === "contrast") return err("対照(contrast)検索は未対応（③-5）");
      if (similarTo) return ok(findSimilar(similarTo, candidates ?? [], top));
      if (like) return ok(findProgressions(core, { tags, like: { chords: like, key: likeKey }, limit }));
      return ok(core.listNeta({ q, kind, mood, key, meter, tags, scope, limit, offset }));
    },
  );
  server.registerTool(
    "analyze",
    { title: "判る（同定/説明/当てはまり）", description: "これ何進行?/なぜ?/調は?/合ってる?。全生成・修正の土台。", inputSchema: { question: z.enum(["fit", "identify", "key", "explain", "progression"]), chords: chordsSchema.optional(), notes: notesSchema.optional(), key: z.number().int().min(0).max(11).optional(), mode: z.enum(["major", "minor"]).optional() } },
    async ({ question, chords, notes, key, mode }) => {
      if (question === "fit") {
        if (!notes || !chords) return err("analyze fit は notes と chords");
        return ok(analyzeFit(notes, chords, key));
      }
      if (question === "key") {
        if (!notes) return err("analyze key は notes");
        return ok(detectKeyFromNotes(notes));
      }
      if (!chords) return err(`analyze ${question} は chords`);
      if (question === "identify") return ok(identifyProgression(chords, key !== undefined ? { key } : {}));
      if (question === "explain") return ok(explainProgression(chords, { key, mode }));
      return ok(analyzeProgression(chords, { key, mode }));
    },
  );

  return server;
}
