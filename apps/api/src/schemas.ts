// 契約の単一情報源（SSOT・docs/design「アーキ是正 決定2」）。
// 同じ zod を http(z.object で safeParse)・mcp(ZodRawShape を inputSchema)・型(z.infer)の3用途で共有し、
// 「scope を3箇所に手書き」して乖離する事故を構造的に潰す。core 型(NetaInput/ListQuery)はここから導出。
import { z } from "zod";

export const scopeEnum = z.enum(["project", "library"]); // project=作業ネタ(既定)/library=連想元コーパス
export const scopeQueryEnum = z.enum(["project", "library", "all"]); // 一覧の絞り（all=両方）

// --- ネタ入力（create/patch）。MCP 用に describe を載せる（http では無害）。 ---
export const netaInputShape = {
  kind: z
    .string()
    .min(1)
    .describe("melody/chord/chord_progression/bass/rhythm/lyric/theme/section/song/knowledge/other"),
  title: z.string().nullish(),
  content: z.unknown().optional().describe("音楽的中身＝JSONオブジェクトをそのまま渡す（例 {chords:[...]} / {notes:[...]}）。文字列化したJSONは渡さない。pitch/rootは実音。"),
  text: z.string().nullish().describe("歌詞・自由文"),
  key: z.number().int().min(0).max(11).nullish(),
  mode: z.string().nullish(),
  tempo: z.number().nullish(),
  meter: z.string().nullish(),
  bars: z.number().int().nullish(),
  mood: z.string().nullish(),
  scope: scopeEnum.optional().describe("既定project。連想元コーパスは library"),
  tags: z.array(z.string()).optional(),
  from_job: z.string().nullish().describe("このネタの出所ジョブ。指定で job_result 記録＋対象へ relation"),
} as const;
export const netaInputSchema = z.object(netaInputShape);
export const netaPatchSchema = netaInputSchema.partial();

// --- 一覧クエリ。HTTP のクエリ文字列は coerce（数値）し、tags は呼び出し側で配列化して渡す。 ---
export const listQueryShape = {
  kind: z.string().optional(),
  mode: z.string().optional(),
  meter: z.string().optional(),
  mood: z.string().optional(),
  key: z.coerce.number().int().optional(),
  scope: scopeQueryEnum.optional().describe("既定project。library=取込/連想元コーパス、all=両方"),
  tags: z.array(z.string()).optional(),
  q: z.string().optional().describe("title/text 部分一致"),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
} as const;
export const listQuerySchema = z.object(listQueryShape);

// --- ジョブ入力。 ---
export const jobInputShape = {
  intent: z.string().min(1),
  target_neta_id: z.string().nullish(),
  instruction: z.string().nullish(),
  params: z.unknown().optional(),
  level: z.string().optional(),
  priority: z.number().int().optional(),
  notify_level: z.string().nullish(),
} as const;
export const jobInputSchema = z.object(jobInputShape);

export type NetaInput = z.infer<typeof netaInputSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type Scope = z.infer<typeof scopeEnum>;
