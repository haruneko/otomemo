import { test as base, expect, type Page } from "@playwright/test";

// 共通fixture（docs/process/e2e-test-plan.md §2.2）。
// - 全テストで console / pageerror を収集し、teardown で testInfo.attach（失敗時も必ず残す）。
// - localStorage cm.debugAudio=1 を仕込み [CMAUDIO] 診断ログを常時収集。
// - logs() で収集ログにアクセス（assertion メッセージや音声経路の検証に使う）。

type Logs = {
  all: () => string[];
  audio: () => string[]; // [CMAUDIO] 行のみ
  errors: () => string[]; // console.error / pageerror
};

export const test = base.extend<{ logs: Logs }>({
  logs: async ({ page }, use, testInfo) => {
    const lines: string[] = [];
    const errors: string[] = [];
    const onConsole = (m: { type(): string; text(): string }) => {
      const line = `[${m.type()}] ${m.text()}`;
      lines.push(line);
      if (m.type() === "error") errors.push(line);
    };
    const onError = (e: Error) => {
      const line = `[pageerror] ${e.message}`;
      lines.push(line);
      errors.push(line);
    };
    page.on("console", onConsole);
    page.on("pageerror", onError);
    await page.addInitScript(() => localStorage.setItem("cm.debugAudio", "1"));

    const logs: Logs = {
      all: () => [...lines],
      audio: () => lines.filter((l) => l.includes("[CMAUDIO]")),
      errors: () => [...errors],
    };
    try {
      await use(logs);
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onError);
      if (lines.length) {
        await testInfo.attach("console.log", { body: lines.join("\n"), contentType: "text/plain" });
      }
      const audio = logs.audio();
      if (audio.length) {
        await testInfo.attach("cmaudio.log", { body: audio.join("\n"), contentType: "text/plain" });
      }
    }
  },
});

export { expect };
export type { Page };
