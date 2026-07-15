import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { notesToScore, singHashOf, findCachedSing } from "../src/sing";

// POST /sing（ネタ非依存の汎用歌唱・Section 仮歌）。VOICEVOX 実合成を回さない＝singGeneric をモックし、
// HTTP 契約（バリデーション/返り/リンクしない）を検証。純ヘルパ singHashOf/findCachedSing は本物を別途ユニット検証。
const singGeneric = vi.hoisted(() => vi.fn());
vi.mock("../src/sing", async (importActual) => ({
  ...(await importActual<typeof import("../src/sing")>()),
  singGeneric,
}));

let app: FastifyInstance;
let core: Core;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "cm-sing-gen-"));
  process.env.CM_ASSETS_DIR = dir;
  core = new Core(openDb(":memory:"));
  app = buildHttp(core);
  await app.ready();
  singGeneric.mockReset();
  // 既定の成功挙動：本物 addAsset で wav 資産を作る（**リンクしない**＝汎用歌唱の契約）。
  singGeneric.mockImplementation(async (c: Core) => {
    const path = join(dir, `${Math.random().toString(36).slice(2)}.wav`);
    writeFileSync(path, Buffer.from("RIFF....WAVEfake"));
    const asset = c.addAsset({ kind: "audio", name: "仮歌（Section・VOICEVOX）", path, size: 16, mime: "audio/wav" });
    return { asset, shift: 0, clamped: 0, cached: false };
  });
});
afterEach(() => {
  delete process.env.CM_ASSETS_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const body = (notes: unknown, bpm = 120, speaker?: number) => ({ notes, bpm, ...(speaker != null ? { speaker } : {}) });

describe("POST /sing（汎用歌唱・Section 仮歌）", () => {
  it("400 when notes is empty", async () => {
    const r = await app.inject({ method: "POST", url: "/sing", payload: body([]) });
    expect(r.statusCode).toBe(400);
    expect(singGeneric).not.toHaveBeenCalled();
  });

  it("400 when no syllable present", async () => {
    const r = await app.inject({ method: "POST", url: "/sing", payload: body([{ pitch: 60, start: 0, dur: 1 }]) });
    expect(r.statusCode).toBe(400);
    expect(singGeneric).not.toHaveBeenCalled();
  });

  it("200 returns {assetId, shift, clamped, speaker}, passes notes/bpm/speaker, and asset is NOT linked", async () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1, syllable: "そ" },
      { pitch: 62, start: 1, dur: 1, syllable: "ら" },
    ];
    const r = await app.inject({ method: "POST", url: "/sing", payload: body(notes, 96, 3010) });
    expect(r.statusCode).toBe(200);
    const j = r.json() as { assetId: string; shift: number; clamped: number; speaker: number };
    expect(j.assetId).toBeTruthy();
    expect(j.speaker).toBe(3010);
    // singGeneric に notes・bpm・speaker を渡している
    expect(singGeneric).toHaveBeenCalledWith(core, expect.any(Array), 96, 3010);
    // 資産は audio kind で配信でき、どのネタにも render リンクされていない（汎用＝紐付けない）。
    const asset = core.getAsset(j.assetId)!;
    expect(asset.kind).toBe("audio");
    const got = await app.inject({ method: "GET", url: `/asset/${j.assetId}` });
    expect(got.statusCode).toBe(200);
  });

  it("bpm 省略時は 120 を渡す", async () => {
    const r = await app.inject({ method: "POST", url: "/sing", payload: { notes: [{ pitch: 60, start: 0, dur: 1, syllable: "な" }] } });
    expect(r.statusCode).toBe(200);
    expect(singGeneric).toHaveBeenCalledWith(core, expect.any(Array), 120, undefined);
  });

  it("502 when synthesis fails (engine 未起動/60秒超 等)", async () => {
    singGeneric.mockRejectedValueOnce(new Error("VOICEVOX engine が見つかりません"));
    const r = await app.inject({ method: "POST", url: "/sing", payload: body([{ pitch: 60, start: 0, dur: 1, syllable: "え" }]) });
    expect(r.statusCode).toBe(502);
    expect((r.json() as { error: string }).error).toContain("歌唱に失敗");
  });
});

// 汎用歌唱の content-hash キャッシュ（合成スキップ）の純ロジック＝singHashOf/findCachedSing を本物で検証。
describe("汎用歌唱キャッシュ（singHashOf / findCachedSing）", () => {
  let core: Core;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cm-sing-cache-"));
    core = new Core(openDb(":memory:"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const score = (notes: { pitch: number; start: number; dur: number; syllable?: string }[], bpm = 120) => notesToScore(notes, bpm);

  it("singHashOf は決定的＝同じスコア＋声色で同一・声色違いで別", () => {
    const s = score([{ pitch: 60, start: 0, dur: 1, syllable: "そ" }]);
    expect(singHashOf(s, 3009)).toBe(singHashOf(s, 3009));
    expect(singHashOf(s, 3009)).not.toBe(singHashOf(s, 3010));
  });

  it("歌詞/音高が変わればハッシュも変わる（別 wav 扱い）", () => {
    const a = singHashOf(score([{ pitch: 60, start: 0, dur: 1, syllable: "あ" }]), 3009);
    const b = singHashOf(score([{ pitch: 60, start: 0, dur: 1, syllable: "い" }]), 3009); // 歌詞違い
    const c = singHashOf(score([{ pitch: 62, start: 0, dur: 1, syllable: "あ" }]), 3009); // 音高違い
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("findCachedSing は同一 singHash かつ実体ファイル在りの audio 資産を返す（無ければ null）", () => {
    const s = score([{ pitch: 60, start: 0, dur: 1, syllable: "そ" }]);
    const h = singHashOf(s, 3009);
    expect(findCachedSing(core, h)).toBeNull(); // まだ無い
    const path = join(dir, "cached.wav");
    writeFileSync(path, Buffer.from("RIFF"));
    const asset = core.addAsset({ kind: "audio", name: "仮歌", path, size: 4, mime: "audio/wav", meta: { singHash: h } });
    expect(findCachedSing(core, h)?.id).toBe(asset.id); // ヒット
    expect(findCachedSing(core, "other")).toBeNull(); // 別ハッシュは非ヒット
    rmSync(path); // 実体を消すと（他 URL 掃除等）ヒットしない＝作り直し
    expect(findCachedSing(core, h)).toBeNull();
  });
});
