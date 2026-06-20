import { defineConfig } from "@playwright/test";

// 実機近似チェック（docs/process/review-loop.md の受け入れ層2）。
// 走っている dev サーバ(:5173, /api→8787 プロキシ)を再利用する。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:5173" },
  reporter: [["list"]],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
