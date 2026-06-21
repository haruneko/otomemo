import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Core } from "./core";

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
      description: "ネタ（歌詞/メロ/コード/リズム/テーマ/曲など）を作成する。",
      inputSchema: {
        kind: z
          .string()
          .describe("melody/chord/chord_progression/rhythm/lyric/theme/section/song/knowledge/other"),
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
