import { test, expect } from "@playwright/test";

// 実ブラウザで「配置→ブロックをタップで外す」を再現。jsdom/コードレビューでは出ない層。
test("place a child on a lane then remove it by tapping the block", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const sectionCard = page
    .locator('article[aria-label="neta-card"]')
    .filter({ has: page.locator('.kind:text-is("section")') })
    .first();
  if ((await sectionCard.count()) === 0) test.skip(true, "no section neta");
  await sectionCard.locator(".card-main").click();
  await expect(page.getByLabel("timeline")).toBeVisible();

  // clean slate: remove any pre-existing blocks
  for (let i = 0; i < 10; i++) {
    const existing = page.locator('[aria-label^="block-"]');
    if ((await existing.count()) === 0) break;
    await existing.first().click();
    await page.waitForTimeout(200);
  }

  // place a melody at bar 0
  await page.getByLabel("place-melody-0").click();
  await expect(page.getByRole("dialog", { name: "place-picker" })).toBeVisible();
  const cand = page.locator('[aria-label="place-picker"] .bs-option').first();
  if ((await cand.count()) === 0) test.skip(true, "no melody candidate to place");
  await cand.click();

  const block = page.locator('[aria-label^="block-"]');
  await expect(block.first()).toBeVisible();
  const before = await block.count();
  expect(before).toBeGreaterThan(0);

  // tap the block to remove it
  await block.first().click();
  await page.waitForTimeout(600);
  const after = await page.locator('[aria-label^="block-"]').count();
  expect(after, `block was not removed (before=${before}, after=${after})`).toBe(before - 1);
});
