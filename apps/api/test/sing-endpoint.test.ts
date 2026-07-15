import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

// VOICEVOX 実合成を回さない＝singNeta をモックし、HTTP 契約（抽出/バリデーション/返り）だけ検証。
// mock 側は wav asset を実際に addAsset+linkAsset して、返す asset を本物同様に見せる。
const singNeta = vi.hoisted(() => vi.fn());
// singNeta だけ差し替え、resolveSingBpm 等の純ヘルパは本物を残す（B1 の bpm 解決を実地検証するため）。
vi.mock("../src/sing", async (importActual) => ({ ...(await importActual<typeof import("../src/sing")>()), singNeta }));

let app: FastifyInstance;
let core: Core;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cm-sing-"));
  process.env.CM_ASSETS_DIR = dir;
  core = new Core(openDb(":memory:"));
  app = buildHttp(core);
  await app.ready();
  singNeta.mockReset();
  // 既定の成功挙動：本物 addAsset で wav 資産を作り role=render で紐付ける（http と同じ契約）。
  singNeta.mockImplementation(async (c: Core, netaId: string) => {
    const path = join(dir, "x.wav");
    writeFileSync(path, Buffer.from("RIFF....WAVEfake")); // 配信できる実体
    const asset = c.addAsset({ kind: "audio", name: "仮歌（VOICEVOX）", path, size: 16, mime: "audio/wav" });
    c.linkAsset(netaId, asset.id, "render");
    return asset;
  });
});
afterEach(() => {
  delete process.env.CM_ASSETS_DIR;
  rmSync(dir, { recursive: true, force: true });
});

function makeMelody(notes: { pitch: number; start: number; dur: number; syllable?: string }[], tempo = 120) {
  return core.createNeta({ kind: "melody", title: "テスト", content: { notes, tempo } });
}

describe("POST /neta/:id/sing", () => {
  it("404 when neta not found", async () => {
    const r = await app.inject({ method: "POST", url: "/neta/nope/sing", payload: {} });
    expect(r.statusCode).toBe(404);
    expect(singNeta).not.toHaveBeenCalled();
  });

  it("400 when neta has no notes", async () => {
    const n = core.createNeta({ kind: "melody", title: "空", content: { notes: [] } });
    const r = await app.inject({ method: "POST", url: `/neta/${n.id}/sing`, payload: {} });
    expect(r.statusCode).toBe(400);
    expect(singNeta).not.toHaveBeenCalled();
  });

  it("400 when notes have no syllable (歌詞が無い)", async () => {
    const n = makeMelody([{ pitch: 60, start: 0, dur: 1 }]);
    const r = await app.inject({ method: "POST", url: `/neta/${n.id}/sing`, payload: {} });
    expect(r.statusCode).toBe(400);
    expect(singNeta).not.toHaveBeenCalled();
  });

  it("200 returns {assetId} when syllable present, and links render asset", async () => {
    const n = makeMelody([
      { pitch: 60, start: 0, dur: 1, syllable: "そ" },
      { pitch: 62, start: 1, dur: 1, syllable: "ら" },
    ]);
    const r = await app.inject({ method: "POST", url: `/neta/${n.id}/sing`, payload: {} });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { assetId: string; speaker: number };
    expect(body.assetId).toBeTruthy();
    expect(body.speaker).toBe(3009); // 既定声色
    // singNeta へ notes と bpm を渡している
    expect(singNeta).toHaveBeenCalledWith(core, n.id, expect.any(Array), 120, undefined);
    // 資産が実在＝配信できる
    const got = await app.inject({ method: "GET", url: `/asset/${body.assetId}` });
    expect(got.statusCode).toBe(200);
  });

  it("passes speaker through and uses neta tempo as bpm", async () => {
    const n = makeMelody([{ pitch: 60, start: 0, dur: 1, syllable: "な" }], 96);
    const r = await app.inject({ method: "POST", url: `/neta/${n.id}/sing`, payload: { speaker: 3010 } });
    expect(r.statusCode).toBe(200);
    expect((r.json() as { speaker: number }).speaker).toBe(3010);
    expect(singNeta).toHaveBeenCalledWith(core, n.id, expect.any(Array), 96, 3010);
  });

  it("B1: neta の tempo 列（DB列）を bpm の第一候補にする（content.tempo より優先）", async () => {
    // 検体＝「みなそこイントロ」型：tempo は DB列(92)、content には別値を置いて列が勝つことを確認。
    const n = core.createNeta({ kind: "melody", title: "みなそこ", tempo: 92, content: { notes: [{ pitch: 60, start: 0, dur: 1, syllable: "み" }], tempo: 120 } });
    const r = await app.inject({ method: "POST", url: `/neta/${n.id}/sing`, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(singNeta).toHaveBeenCalledWith(core, n.id, expect.any(Array), 92, undefined);
  });

  it("502 when synthesis fails (engine 未起動等)", async () => {
    singNeta.mockRejectedValueOnce(new Error("VOICEVOX engine が見つかりません"));
    const n = makeMelody([{ pitch: 60, start: 0, dur: 1, syllable: "あ" }]);
    const r = await app.inject({ method: "POST", url: `/neta/${n.id}/sing`, payload: {} });
    expect(r.statusCode).toBe(502);
    expect((r.json() as { error: string }).error).toContain("歌唱に失敗");
  });
});
