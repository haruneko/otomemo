import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

let app: FastifyInstance;
let dir: string;
const BOUNDARY = "----cmtest";

function multipart(file: Buffer, filename = "gm.sf2", kind = "soundfont"): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n`),
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cm-asset-"));
  process.env.CM_ASSETS_DIR = dir;
  app = buildHttp(new Core(openDb(":memory:")));
  await app.ready();
});
afterEach(() => {
  delete process.env.CM_ASSETS_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("asset upload/serve (#77)", () => {
  it("uploads a file, lists, serves identical bytes, deletes", async () => {
    const bytes = Buffer.from("FAKE-SF2-CONTENT-1234");
    const up = await app.inject({
      method: "POST",
      url: "/asset",
      payload: multipart(bytes),
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(up.statusCode).toBe(200);
    const asset = up.json() as {
      id: string;
      kind: string;
      name: string;
      size: number;
      path: string;
    };
    expect(asset.kind).toBe("soundfont");
    expect(asset.name).toBe("gm.sf2");
    expect(asset.size).toBe(bytes.length);

    // 一覧（最新が全体採用 = created DESC 先頭）
    const list = await app.inject({ method: "GET", url: "/assets?kind=soundfont" });
    expect((list.json() as unknown[]).length).toBe(1);

    // 配信＝同一バイト列
    const got = await app.inject({ method: "GET", url: `/asset/${asset.id}` });
    expect(got.statusCode).toBe(200);
    expect(Buffer.from(got.rawPayload).equals(bytes)).toBe(true);

    // 削除＝行とファイルが消える
    const del = await app.inject({ method: "DELETE", url: `/asset/${asset.id}` });
    expect(del.json()).toEqual({ deleted: true });
    expect(existsSync(asset.path)).toBe(false);
    const after = await app.inject({ method: "GET", url: `/asset/${asset.id}` });
    expect(after.statusCode).toBe(404);
  });

  it("400 when no file part", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/asset",
      payload: Buffer.from(`--${BOUNDARY}--\r\n`),
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    });
    expect(r.statusCode).toBe(400);
  });
});
