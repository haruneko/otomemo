import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";

// U8/#54：同じネタをセクションの2箇所へ反復配置できる（compose_edge は position 込みで複数行）。
test("repeat placement: same neta placed at two positions (U8/#54)", async ({ page, request }) => {
  const s = stamp();
  const sec = await createNeta(request, {
    kind: "section",
    title: `${s}-RSEC`,
    key: 0,
    tempo: 120,
    meter: "4/4",
  });
  const mel = await createNeta(request, {
    kind: "melody",
    title: `${s}-RM`,
    content: { notes: [{ pitch: 60, start: 0, dur: 1 }] },
  });
  try {
    await openNeta(page, `${s}-RSEC`);
    const picker = page.getByRole("dialog", { name: "place-picker" });
    // melody レーンの 1小節目に配置
    await page.getByLabel("place-melody-0").click();
    await picker.getByText(`${s}-RM`).click();
    await page.locator(".section-editor .lane-block").first().waitFor({ timeout: 8000 });
    // 3小節目にもう一度同じネタを配置
    await page.getByLabel("place-melody-2").click();
    await picker.getByText(`${s}-RM`).click();
    await expect(page.locator(".section-editor .lane-block")).toHaveCount(2, { timeout: 8000 });
    // API でも同じ child が2箇所
    const comp = await (await request.get(`/api/neta/${sec.id}/composition`)).json();
    const mine = comp.children.filter((c: { node: { neta: { id: string } } }) => c.node.neta.id === mel.id);
    expect(mine.length).toBe(2);
  } finally {
    await deleteNeta(request, sec.id);
    await deleteNeta(request, mel.id);
  }
});
