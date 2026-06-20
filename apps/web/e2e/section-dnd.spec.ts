import { test, expect } from "@playwright/test";

// #52②c: PCでネタ帳カードをセクションのレーンへドラッグ配置（dnd-kit）。
// dnd-kit は pointer 移動でドラッグ開始するので、mouse を手動で動かす。
test("drag a melody card onto a melody lane places it (desktop)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const sectionCard = page
    .locator('article[aria-label="neta-card"]')
    .filter({ has: page.locator('.kind:text-is("section")') })
    .first();
  if ((await sectionCard.count()) === 0) test.skip(true, "no section neta");
  await sectionCard.locator(".card-main").click();
  await expect(page.getByLabel("timeline")).toBeVisible();

  // clean slate: remove any existing blocks
  for (let i = 0; i < 12; i++) {
    const existing = page.locator('[aria-label^="block-"]');
    if ((await existing.count()) === 0) break;
    await existing.first().click();
    await page.waitForTimeout(150);
  }

  const melodyCard = page
    .locator('article[aria-label="neta-card"]')
    .filter({ has: page.locator('.kind:text-is("melody")') })
    .first();
  if ((await melodyCard.count()) === 0) test.skip(true, "no melody card to drag");

  const handle = melodyCard.locator(".drag-handle");
  await handle.scrollIntoViewIfNeeded();
  const cell = page.getByLabel("place-melody-3"); // bar3 → position 12 (4/4)
  await cell.scrollIntoViewIfNeeded();
  const hb = await handle.boundingBox();
  const cb = await cell.boundingBox();
  if (!hb || !cb) test.skip(true, "no bounding boxes");

  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(hb!.x + hb!.width / 2 + 12, hb!.y + hb!.height / 2 + 4); // >5px で起動
  await page.mouse.move(cb!.x + cb!.width / 2, cb!.y + cb!.height / 2, { steps: 12 });
  await page.mouse.move(cb!.x + cb!.width / 2, cb!.y + cb!.height / 2); // settle
  await page.mouse.up();

  // pointerWithin でカーソル直下のセル＝bar3(position 12)に正確に配置される
  await expect(page.locator('[aria-label$="@12"]')).toHaveCount(1, { timeout: 4000 });
});
