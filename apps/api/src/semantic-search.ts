// 意味検索(cm-search)＋キーワード(listNeta LIKE)の合流＝「探す」の共通実装。
// 経緯(2026-07-14)：HTTP /search だけが意味検索に繋がり、MCP search(=チャットの検索)は LIKE のみだった。
// ツール説明「意味/様式/名前/類似で引く」との乖離＝「ドラム音源」等の自然な言い方で機材インベントリ
// (kind:knowledge)に届かないバグの根治。両経路ともここへ委譲する。
// cm-search 不通時は 2s で切り上げキーワードだけで返す（WSL2 の閉ポート connect ブロック対策も従来どおり）。
import type { Core } from "./core";
import type { Neta } from "./types";

export const SEARCH_URL = process.env.CM_SEARCH_URL ?? "http://127.0.0.1:8788";
export const SEM_MIN_REL = Number(process.env.CM_SEM_MIN_REL ?? 0.07);

export type MergedHit = Neta & { matchType: "exact" | "semantic" | "both" };
export type MergedResult = { items: MergedHit[]; semanticOk: boolean };

export async function searchNetaMerged(
  core: Core,
  opts: {
    q: string;
    limit?: number;
    kind?: string;
    mood?: string;
    key?: number;
    meter?: string;
    tags?: string[];
    scope?: "project" | "library" | "all";
    offset?: number;
    /** 意味検索エンドポイント。null/"" でスキップ（テストの密閉性・明示無効化）。既定=SEARCH_URL */
    semanticUrl?: string | null;
  },
): Promise<MergedResult> {
  const limit = opts.limit ?? 20;
  // 検索は project＋library 横断が既定（取込コーパス/知識も名前で引ける）。明示 scope は尊重。
  const scope = opts.scope ?? "all";
  const keyword = core.listNeta({
    q: opts.q, kind: opts.kind, mood: opts.mood, key: opts.key, meter: opts.meter,
    tags: opts.tags, scope, limit, offset: opts.offset,
  });
  const kwIds = new Set(keyword.map((n) => n.id));

  const semIds = new Set<string>();
  const semantic: Neta[] = [];
  let semanticOk = false;
  const url = opts.semanticUrl === undefined ? SEARCH_URL : opts.semanticUrl;
  if (url) {
    try {
      const res = (await Promise.race([
        fetch(`${url}/search?q=${encodeURIComponent(opts.q)}&k=${limit}`, { signal: AbortSignal.timeout(2000) }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("cm-search timeout")), 2000)),
      ])) as Response;
      if (res.ok) {
        semanticOk = true;
        const hits = (await res.json()) as { neta_id: string; score: number; rel?: number }[];
        for (const h of hits) {
          if ((h.rel ?? 0) < SEM_MIN_REL) continue;
          const n = core.getNeta(h.neta_id);
          if (!n) continue;
          // キーワード側のフィルタ(kind/scope等)を意味hitにも適用＝結果の粒が揃う。
          if (opts.kind && n.kind !== opts.kind) continue;
          if (scope !== "all" && n.scope !== scope) continue;
          semantic.push(n);
          semIds.add(n.id);
        }
      }
    } catch {
      /* 不通＝keyword-only 劣化（semanticOk=false） */
    }
  }
  return {
    items: [
      ...keyword.map((n) => ({ ...n, matchType: (semIds.has(n.id) ? "both" : "exact") as MergedHit["matchType"] })),
      ...semantic.filter((n) => !kwIds.has(n.id)).map((n) => ({ ...n, matchType: "semantic" as const })),
    ],
    semanticOk,
  };
}
