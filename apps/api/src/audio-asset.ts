// 音源を asset(data/assets/) に保存する共有ヘルパ（P2・2026-07-09・design#16）。
// study/audio_analyze が受けた base64 音源を「content-hash で重複排除した asset」として永続化し、
// job.params には base64 を残さない（DB 肥大の恒久防止）。設計思想「音源は捨て派生事実だけ残す」の是正版
// ＝音源も整理された asset として残す（自作mp3コーパスの入口）。
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Core } from "./core";

// asset 実体の置き場（http のアップロードと同一規約）。CM_ASSETS_DIR / CM_DB からの相対 / 既定 data/assets。
export function assetsDir(): string {
  return (
    process.env.CM_ASSETS_DIR ??
    (process.env.CM_DB ? join(dirname(process.env.CM_DB), "assets") : join("data", "assets"))
  );
}

// 音源バイト列を asset 化して asset_id を返す。同一 content-hash の audio asset が既にあれば再利用（重複を作らない）。
export function saveAudioAsset(core: Core, bytes: Buffer, name: string): string {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const existing = core.listAssets("audio").find((a) => (a.meta as { sha256?: string } | null)?.sha256 === sha);
  if (existing) return existing.id;
  const dir = assetsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}.mp3`); // ファイル名は一意ならよい（asset.id は addAsset が採番）
  writeFileSync(path, bytes);
  const asset = core.addAsset({ kind: "audio", name, path, size: bytes.length, mime: "audio/mpeg", meta: { sha256: sha, source: "upload" } });
  return asset.id;
}
