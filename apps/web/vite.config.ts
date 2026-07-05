/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 既定 localhost。api を Tailscale IP 等 loopback 以外にバインドしている時は
      // CM_API_TARGET で proxy 先を差せる（e2e を api 再バインド無しで通すため）。
      "/api": {
        target: process.env.CM_API_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.{test,spec}.{ts,tsx}"], // e2e(Playwright)は拾わない
  },
});
