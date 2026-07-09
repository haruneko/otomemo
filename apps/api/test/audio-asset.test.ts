import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { saveAudioAsset } from "../src/audio-asset";

// P2（2026-07-09 design#16）：音源を asset(重複排除)に保存し、job.params から base64 を strip する契約。
let core: Core;
let assetsDir: string;
beforeEach(() => {
  core = new Core(openDb(":memory:"));
  assetsDir = mkdtempSync(join(tmpdir(), "cm-assets-test-"));
  process.env.CM_ASSETS_DIR = assetsDir;
});
afterEach(() => {
  delete process.env.CM_ASSETS_DIR;
  rmSync(assetsDir, { recursive: true, force: true });
});

describe("saveAudioAsset（音源を asset 化・content-hash 重複排除）", () => {
  it("① 音源を data/assets へ書き出し audio asset を作る", () => {
    const bytes = Buffer.from("fake-audio-bytes-123");
    const id = saveAudioAsset(core, bytes, "MySong");
    const a = core.getAsset(id)!;
    expect(a.kind).toBe("audio");
    expect(a.name).toBe("MySong");
    expect(a.size).toBe(bytes.length);
    expect(existsSync(a.path)).toBe(true);
    expect(readFileSync(a.path)).toEqual(bytes); // 実体が一致
    expect((a.meta as { sha256?: string }).sha256).toBeTruthy();
  });

  it("② 同一バイトは重複を作らず既存 asset を再利用（重複排除）", () => {
    const bytes = Buffer.from("same-audio");
    const id1 = saveAudioAsset(core, bytes, "A");
    const id2 = saveAudioAsset(core, Buffer.from("same-audio"), "A-again");
    expect(id2).toBe(id1); // 同一 sha → 同一 asset
    expect(core.listAssets("audio").length).toBe(1);
  });

  it("③ 違うバイトは別 asset", () => {
    const id1 = saveAudioAsset(core, Buffer.from("audio-1"), "One");
    const id2 = saveAudioAsset(core, Buffer.from("audio-2"), "Two");
    expect(id2).not.toBe(id1);
    expect(core.listAssets("audio").length).toBe(2);
  });
});

describe("stripJobAudio（処理後に params から base64 を除去）", () => {
  it("④ audio_analyze 型：audio_b64 を除去し他の params は温存", () => {
    const j = core.enqueueJob({ intent: "audio_analyze", params: { audio_b64: "AAAA".repeat(500), filename: "x.mp3", meter: 6 } });
    core.stripJobAudio(j.id);
    const p = core.getJob(j.id)!.params as Record<string, unknown>;
    expect(p.audio_b64).toBeUndefined(); // 除去
    expect(p.filename).toBe("x.mp3"); // 温存
    expect(p.meter).toBe(6);
  });

  it("⑤ study 型：works[].audio_b64 を除去し title は温存", () => {
    const j = core.enqueueJob({ intent: "study", params: { topic: "T", works: [{ title: "S1", audio_b64: "BBBB".repeat(500) }, { title: "S2", audioUrl: "http://x" }] } });
    core.stripJobAudio(j.id);
    const p = core.getJob(j.id)!.params as { topic: string; works: Record<string, unknown>[] };
    expect(p.topic).toBe("T");
    expect(p.works[0]!.audio_b64).toBeUndefined();
    expect(p.works[0]!.title).toBe("S1");
    expect(p.works[1]!.audioUrl).toBe("http://x"); // URL 曲は無変更
  });

  it("⑥ base64 が無い params は無変更", () => {
    const j = core.enqueueJob({ intent: "consult", params: { text: "hi" } });
    core.stripJobAudio(j.id);
    expect(core.getJob(j.id)!.params).toEqual({ text: "hi" });
  });
});
