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
        intent: z.string().describe("実現済みの意図：mora_count / echo（順次追加）"),
        target_neta_id: z.string().optional(),
        instruction: z.string().optional(),
        params: z.unknown().optional(),
        priority: z.number().int().optional(),
      },
    },
    async (args) => ok(core.enqueueJob(args)),
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
