import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";
import { statSync } from "node:fs";

// U18：MIDI 書き出しで .mid ダウンロードが発火。
// 単体編集からのMIDI書き出しは撤去済(2026-07-04・MetaPanel.tsx:148)＝現行UXは
// Section の「いじる▾」ツールシート内(export-midi / export-midi-split)。よって
// section＋メロ子で composite を作り、いじる▾→書き出しで検証する。
test("MIDI export downloads a .mid file via section tools (U18)", async ({ page, request }) => {
  const s = stamp();
  const sec = await createNeta(request, {
    kind: "section",
    title: `${s}-mid`,
    key: 0,
    tempo: 120,
    meter: "4/4",
  });
  // composite に音を持たせるためメロ子を1つ配置（section-play と同流儀）。
  const mel = await createNeta(request, {
    kind: "melody",
    title: `${s}-child`,
    content: { notes: [{ pitch: 60, start: 0, dur: 1 }] },
  });
  await request.post("/api/compose", { data: { parent: sec.id, child: mel.id, position: 0, ord: 0 } });
  try {
    await openNeta(page, `${s}-mid`);
    // いじる▾ ツールシートを開く（生成/ハモリ/書き出しを集約）。
    await page.getByLabel("edit-neta").getByLabel("tools").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByLabel("edit-neta").getByLabel("export-midi", { exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.mid$/);
    const path = await download.path();
    expect(statSync(path).size).toBeGreaterThan(0);

    // 分割書き出し(export-midi-split)も検証：クリックでシートが閉じるので開き直す。
    await page.getByLabel("edit-neta").getByLabel("tools").click();
    const [split] = await Promise.all([
      page.waitForEvent("download"),
      page.getByLabel("edit-neta").getByLabel("export-midi-split", { exact: true }).click(),
    ]);
    expect(split.suggestedFilename()).toMatch(/\.mid$/);
    expect(statSync(await split.path()).size).toBeGreaterThan(0);
  } finally {
    await deleteNeta(request, sec.id);
    await deleteNeta(request, mel.id);
  }
});
