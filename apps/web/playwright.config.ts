import { defineConfig } from "@playwright/test";

// 実機近似チェック（docs/process/review-loop.md の受け入れ層2）。
// 走っている dev サーバ(:5173, /api→8787 プロキシ)を再利用する。
export default defineConfig({
  testDir: "./e2e",
  // chat-stream.spec は**専用config(playwright.chat.config.ts・フェイクclaude背後・`pnpm test:e2e:chat`)**でのみ回す。
  // 既定configは実claude/実MCP背後＝逐次ストリーミングが成立せず必ず赤になる（spec冒頭コメントの前提どおり）＝除外する。
  testIgnore: /chat-stream\.spec\.ts$/,
  fullyParallel: true,
  // 並列実行では単一 better-sqlite3(WAL)＋DL/再生の発火が稀に競合する（例：MIDI DL）。
  // 1回リトライで自己修復＝真の失敗だけ残す（flaky は flaky と表示される）。
  retries: 1,
  // 失敗時の手掛かりを残す（test-plan §2）：HTMLレポート＋trace/screenshot/video。
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
