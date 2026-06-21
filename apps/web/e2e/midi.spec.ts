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
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "MIDI" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.mid$/);
    const path = await download.path();
    expect(statSync(path).size).toBeGreaterThan(0);
  } finally {
    await deleteNeta(request, mel.id);
  }
});
