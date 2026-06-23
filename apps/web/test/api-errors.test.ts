import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError, NetworkError } from "../src/api";

// #4 fetch の失敗を文脈付きで投げ直す。ApiError(=サーバが応答した 4xx/5xx) と
// NetworkError(=不達) を区別したまま、生の TypeError/SyntaxError を表に出さない。

afterEach(() => vi.unstubAllGlobals());

describe("#4 api クライアントのエラー文脈化", () => {
  it("ネットワーク不達(fetch reject)は NetworkError にパスを載せて投げる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(api.listNeta({})).rejects.toBeInstanceOf(NetworkError);
    await expect(api.listNeta({})).rejects.toThrow(/\/neta/);
  });

  it("4xx/5xx は従来どおり ApiError（本文付き）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "not found", json: async () => ({}) })),
    );
    const err = await api.getNeta("x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it("2xx だが本文が非JSONなら ApiError（生 SyntaxError を出さない）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
        text: async () => "<html>",
      })),
    );
    const err = await api.listNeta({}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/JSON/i);
  });
});
