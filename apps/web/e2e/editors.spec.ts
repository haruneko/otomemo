import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";

// U6/U7：chord・rhythm 編集の永続。
test.describe("editors persist (U6/U7)", () => {
  test("chord: add row, set root/quality, save → API persists", async ({ page, request }) => {
    const s = stamp();
    const ch = await createNeta(request, {
      kind: "chord_progression",
      title: `${s}-ch`,
      content: { chords: [] },
    });
    try {
      await openNeta(page, `${s}-ch`);
      // 「＋コード」は作成タイルとエディタ内の追加ボタンで同名＝エディタにスコープして曖昧回避。
      await page.getByLabel("edit-neta").getByRole("button", { name: "＋コード" }).click();
      await page.getByLabel("root-0").selectOption("9"); // A
      await page.getByLabel("triad-0").selectOption("m"); // minor（quality選択→decomposed 三和音に変更済）
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByLabel("edit-neta")).toHaveCount(0, { timeout: 8000 });
      const after = await (await request.get(`/api/neta/${ch.id}`)).json();
      expect(after.content.chords.length).toBe(1);
      expect(after.content.chords[0]).toMatchObject({ root: 9, quality: "m" });
    } finally {
      await deleteNeta(request, ch.id);
    }
  });

  test("melody: add notes in piano roll, save → API persists (U5)", async ({ page, request }) => {
    const s = stamp();
    const mel = await createNeta(request, {
      kind: "melody",
      title: `${s}-mel`,
      content: { notes: [] },
    });
    try {
      await openNeta(page, `${s}-mel`);
      const roll = page.getByLabel("piano-roll");
      await roll.waitFor();
      await roll.click({ position: { x: 40, y: 80 } });
      await roll.click({ position: { x: 100, y: 120 } });
      await expect(page.locator('[aria-label^="note-"]').first()).toBeVisible();
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByLabel("edit-neta")).toHaveCount(0, { timeout: 8000 });
      const after = await (await request.get(`/api/neta/${mel.id}`)).json();
      expect(after.content.notes.length).toBeGreaterThan(0);
    } finally {
      await deleteNeta(request, mel.id);
    }
  });

  test("rhythm: toggle a step hit, save → API persists", async ({ page, request }) => {
    const s = stamp();
    const rh = await createNeta(request, {
      kind: "rhythm",
      title: `${s}-rh`,
      content: { rhythm: { steps: 16, lanes: [{ name: "Kick", midi: 36, hits: [] }] } },
    });
    try {
      await openNeta(page, `${s}-rh`);
      await page.getByLabel("hit-Kick-0").click();
      await page.getByLabel("hit-Kick-4").click();
      await page.getByRole("button", { name: "保存" }).click();
      await expect(page.getByLabel("edit-neta")).toHaveCount(0, { timeout: 8000 });
      const after = await (await request.get(`/api/neta/${rh.id}`)).json();
      expect(after.content.rhythm.lanes[0].hits).toEqual([0, 4]);
    } finally {
      await deleteNeta(request, rh.id);
    }
  });
});
