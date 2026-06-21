import { defineConfig } from "@playwright/test";

// 実機近似チェック（docs/process/review-loop.md の受け入れ層2）。
// 走っている dev サーバ(:5173, /api→8787 プロキシ)を再利用する。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
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
