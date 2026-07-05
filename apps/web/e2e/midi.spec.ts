import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";
import { statSync } from "node:fs";

// U18：MIDI 書き出しボタンで .mid ダウンロードが発火。
test("MIDI export downloads a .mid file (U18)", async ({ page, request }) => {
  const s = stamp();
  const mel = await createNeta(request, {
    kind: "melody",
    title: `${s}-mid`,
    content: { notes: [{ pitch: 60, start: 0, dur: 1 }] },
  });
  try {
    await openNeta(page, `${s}-mid`);
    await page.getByLabel("toggle-meta").click(); // MIDI書き出しボタンはメタ(折りたたみ)内＝展開
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      // 「MIDI取込」(rail・部分一致)と衝突しないよう exact＋エディタにスコープ。
      page.getByLabel("edit-neta").getByRole("button", { name: "MIDI", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.mid$/);
    const path = await download.path();
    expect(statSync(path).size).toBeGreaterThan(0);
  } finally {
    await deleteNeta(request, mel.id);
  }
});
