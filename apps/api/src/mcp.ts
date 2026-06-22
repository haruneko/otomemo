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
} from "./music";

// コード進行の共通 inputSchema（content.chords 形＝{root:0-11 or 音名, quality, start?, dur?}）。
const chordsSchema = z
  .array(
    z.object({
      root: z.union([z.number(), z.string()]),
      quality: z.string().optional(),
      start: z.number().optional(),
      dur: z.number().optional(),
    }),
  )
  .describe("コード進行（C基準・content.chords 形）");

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
export function buildMcpServer(core: Core): McpServer {
  const server = new McpServer({ name: "creative-manager", version: "0.0.0" });

  server.registerTool(
    "create_neta",
    {
      title: "ネタを作成（捕獲）",
      description: "ネタ（歌詞/メロ/コード/ベース/リズム/テーマ/曲など）を作成する。",
      inputSchema: {
        kind: z
          .string()
          .describe("melody/chord/chord_progression/bass/rhythm/lyric/theme/section/song/knowledge/other"),
        title: z.string().optional(),
        text: z.string().optional().describe("歌詞・自由文"),
        content: z.unknown().optional().describe("音楽的中身(JSON, Cキー基準)"),
        key: z.number().int().min(0).max(11).optional(),
        mode: z.string().optional(),
        tempo: z.number().optional(),
        meter: z.string().optional(),
        bars: z.number().int().optional(),
        mood: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async (args) => ok(core.createNeta(args)),
  );

  server.registerTool(
    "list_neta",
    {
      title: "ネタ検索（ファセット）",
      description: "kind/mood/key/meter/tags/q で絞り込み一覧。意味検索は後日。",
      inputSchema: {
        kind: z.string().optional(),
        mode: z.string().optional(),
        meter: z.string().optional(),
        mood: z.string().optional(),
        key: z.number().int().optional(),
        tags: z.array(z.string()).optional(),
        q: z.string().optional().describe("title/text 部分一致"),
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
      },
    },
    async (args) => ok(core.listNeta(args)),
  );

  server.registerTool(
    "facets",
    { title: "ファセット候補", description: "絞り込みに使える値の一覧", inputSchema: {} },
    async () => ok(core.facets()),
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

  const oneChord = z.object({ root: z.union([z.number(), z.string()]), quality: z.string().optional() });
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
            "gen_melody",
            "gen_chord",
            "gen_rhythm",
            "gen_variations",
            "gen_chords_rule",
            "gen_pair_rule",
            "fit_to_chords",
            "find_similar",
            "gen_lyric",
            "fetch",
            "transform",
            "brainstorm",
            "suggest",
            "mora_count",
            "research",
            "collect",
            "plan",
            "consult",
            "echo",
          ])
          .describe(
            "意図: gen_melody/gen_chord/gen_rhythm=単体生成, gen_variations=枠付きでN種類を一括(params: count/kinds/structure/frame), gen_chords_rule=ルールベース(機能和声)のコード進行・Claude非依存・決定的(params.frame), gen_pair_rule=ルールのみでコード進行+それに合うメロのペアをcount個・即時・当てはまり保証(params.frame/count/structure), gen_lyric=歌詞生成, fetch=参考から抽出(params.target), transform=移調/拍子替え(条件付き・決定的), brainstorm=壁打ち, suggest=改善案, mora_count=モーラ数, research=参考調査, collect=断片/アイデア収集, plan=おまかせ(小タスクへ分解), consult=相談(会話/案/生成/多段を自動判別), echo=疎通確認。既存に合わせる/修正/変換は params.condition={fit_to,by}",
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

  return server;
}
