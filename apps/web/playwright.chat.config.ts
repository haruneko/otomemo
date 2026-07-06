import { defineConfig } from "@playwright/test";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// チャットの逐次表示(①)＆再アタッチ(②)を決定的に検証する専用 e2e。
// 実 claude はコスト重＋非決定的なので、フェイク claude（apps/api/testing/fake-claude.mjs＝
// stream-json で partial デルタを時間差に吐く）を CM_FAKE_CLAUDE で差して api を立てる。
// 動作中の実スタック(:5173/:8787)を邪魔しないよう、専用ポート(api :8799 / web :5273)で隔離する。
const REPO = resolve(__dirname, "../..");
const FAKE = resolve(__dirname, "../api/testing/fake-claude.mjs");
const DB = join(tmpdir(), "cm-chat-e2e.sqlite");
const API_PORT = 8799;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /chat-stream\.spec\.ts$/, // このconfigはチャット逐次/再アタッチ専用
  fullyParallel: false, // 単一 api/db（free chat は同一 "global" thread）＝直列で干渉を避ける
  workers: 1,
  retries: 1, // 時間依存の揺れは1回だけ自己修復（真の失敗のみ残す）
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      // フェイク claude 背後の api。毎回 DB を捨てて素の状態から（テスト独立）。
      command:
        `rm -f "${DB}" "${DB}-wal" "${DB}-shm"; ` +
        `CM_DB="${DB}" CM_FAKE_CLAUDE="${FAKE}" CM_FAKE_DELAY_MS=150 ` +
        `PORT=${API_PORT} CM_HOST=127.0.0.1 pnpm --filter @cm/api start`,
      cwd: REPO,
      url: `http://127.0.0.1:${API_PORT}/chat/e2ehealth/turn/status`, // {live:false} 200 を待つ
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // web dev を専用ポートで。proxy 先を CM_API_TARGET でフェイク api に差す。
      // ※ `pnpm run dev -- --port` は vite に `--` 込みで渡り無視される（5173で起動）ので exec で直叩き。
      command: `CM_API_TARGET=http://127.0.0.1:${API_PORT} pnpm --filter @cm/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: REPO,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
