import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

// HTTP 契約：GET /sing/voices は {voices} を返す（listSingVoices をモックし engine 非依存に）。
// 純ロジック（frameDecodeVoices/listSingVoices のフォールバック）は sing-voices.test.ts で本物を検証。
const listSingVoices = vi.hoisted(() => vi.fn());
vi.mock("../src/sing", async (importActual) => ({
  ...(await importActual<typeof import("../src/sing")>()),
  listSingVoices,
}));

let app: FastifyInstance;
let core: Core;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cm-voices-ep-"));
  process.env.CM_ASSETS_DIR = dir;
  core = new Core(openDb(":memory:"));
  app = buildHttp(core);
  await app.ready();
  listSingVoices.mockReset();
});
afterEach(() => {
  delete process.env.CM_ASSETS_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /sing/voices（列挙 API）", () => {
  it("listSingVoices の結果を {voices} で返す", async () => {
    listSingVoices.mockResolvedValueOnce([{ id: 3009, character: "波音リツ", style: "ノーマル" }]);
    const r = await app.inject({ method: "GET", url: "/sing/voices" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ voices: [{ id: 3009, character: "波音リツ", style: "ノーマル" }] });
  });
});
