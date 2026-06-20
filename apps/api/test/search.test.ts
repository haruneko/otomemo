import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

let core: Core;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
});
afterEach(() => vi.unstubAllGlobals());

describe("semantic /search proxy", () => {
  it("proxies to the backend and hydrates neta in returned order", async () => {
    const a = core.createNeta({ kind: "lyric", text: "夜を駆ける" });
    const b = core.createNeta({ kind: "lyric", text: "経理メモ" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { neta_id: b.id, score: 0.9 },
          { neta_id: a.id, score: 0.8 },
        ],
      })),
    );
    const app = buildHttp(core);
    await app.ready();
    const r = await app.inject({ method: "GET", url: "/search?q=test" });
    const items = r.json() as { id: string; score: number }[];
    expect(items.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(items[0]!.score).toBe(0.9);
  });

  it("returns 503 when backend is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const app = buildHttp(core);
    await app.ready();
    const r = await app.inject({ method: "GET", url: "/search?q=x" });
    expect(r.statusCode).toBe(503);
  });
});
