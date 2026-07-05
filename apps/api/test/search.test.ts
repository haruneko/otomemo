import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});
afterEach(() => vi.unstubAllGlobals());

// #65 ハイブリッド検索（キーワードLIKE ∪ 意味[spread較正ゲート]）
describe("hybrid /search", () => {
  it("gates weak semantic hits by rel and labels matchType", async () => {
    const a = core.createNeta({ kind: "lyric", text: "夜を駆ける" });
    const b = core.createNeta({ kind: "lyric", text: "経理メモ" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { neta_id: a.id, score: 0.85, rel: 0.12 }, // 強い→残る
          { neta_id: b.id, score: 0.81, rel: 0.01 }, // 弱い→ゲートで落ちる
        ],
      })),
    );
    const app = buildHttp(core);
    await app.ready();
    const r = await app.inject({ method: "GET", url: "/search?q=ない単語zzz" }); // キーワード一致なし
    const body = r.json() as { items: { id: string; matchType: string; score?: number }[]; semanticOk: boolean };
    expect(body.items.map((n) => n.id)).toEqual([a.id]); // bはrel不足で除外
    expect(body.items[0]!.matchType).toBe("semantic");
    expect(body.items[0]!.score).toBeUndefined(); // スコア数値は返さない
    expect(body.semanticOk).toBe(true); // cm-search 応答あり＝意味検索は生きている
  });

  it("keyword (LIKE) hits come first as exact; both when also semantic", async () => {
    const a = core.createNeta({ kind: "lyric", text: "夜の街" }); // 「夜」一致
    const b = core.createNeta({ kind: "lyric", text: "別の歌詞" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { neta_id: a.id, score: 0.9, rel: 0.2 }, // 一致かつ意味 → both
          { neta_id: b.id, score: 0.88, rel: 0.18 }, // 意味のみ → semantic
        ],
      })),
    );
    const app = buildHttp(core);
    await app.ready();
    const r = await app.inject({ method: "GET", url: "/search?q=夜" });
    const body = r.json() as { items: { id: string; matchType: string }[]; semanticOk: boolean };
    expect(body.items[0]).toMatchObject({ id: a.id, matchType: "both" }); // exact優先
    expect(body.items.find((n) => n.id === b.id)?.matchType).toBe("semantic");
    expect(body.semanticOk).toBe(true);
  });

  it("cm-search 不通でも keyword で返し semanticOk=false（劣化を告知できる）", async () => {
    const a = core.createNeta({ kind: "lyric", text: "夜明け前" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const app = buildHttp(core);
    await app.ready();
    const r = await app.inject({ method: "GET", url: "/search?q=夜明け" });
    const body = r.json() as { items: { id: string; matchType: string }[]; semanticOk: boolean };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: a.id, matchType: "exact" });
    expect(body.semanticOk).toBe(false); // 不通＝劣化フラグ＝UIで「キーワードのみ」を告知
  });

  it("returns [] (該当なし) when neither keyword nor gated-semantic match", async () => {
    core.createNeta({ kind: "lyric", text: "全然関係ない" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ neta_id: "missing", score: 0.81, rel: 0.01 }], // 弱い→ゲート
      })),
    );
    const app = buildHttp(core);
    await app.ready();
    const r = await app.inject({ method: "GET", url: "/search?q=存在しないxyzqqq" });
    expect(r.json()).toEqual({ items: [], semanticOk: true }); // 応答あり・ゲートで全落ち＝空
  });
});
