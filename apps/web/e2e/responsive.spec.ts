import { test, expect } from "@playwright/test";

// 実機近似：複数 viewport で「横スクロールが無い」ことを機械判定＋スクショ。
// jsdom/コードAcceptorでは見えない層（@media のソース順バグ等を捕まえる）。
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

for (const vp of viewports) {
  test(`no horizontal overflow on home (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `e2e/__screenshots__/home-${vp.name}.png`, fullPage: true });
    const { scrollWidth, clientWidth } = await noHorizontalOverflow(page);
    expect(
      scrollWidth,
      `横スクロール検出 (${vp.name}): scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
    ).toBeLessThanOrEqual(clientWidth + 1);
  });
}

test("tap a card opens the editor in the main pane and 戻る returns (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const card = page.locator('article[aria-label="neta-card"]').first();
  if ((await card.count()) === 0) test.skip(true, "no neta to open (API/seed empty)");

  await card.locator(".card-main").click();
  await expect(page.getByLabel("edit-neta")).toBeVisible();
  await page.screenshot({ path: "e2e/__screenshots__/editor-mobile.png", fullPage: true });

  const { scrollWidth, clientWidth } = await noHorizontalOverflow(page);
  expect(scrollWidth, "編集画面で横スクロール").toBeLessThanOrEqual(clientWidth + 1);

  await page.locator("button.back").click(); // ← 戻る（aria-labelはclose）
  await expect(page.getByLabel("edit-neta")).toHaveCount(0);
});

test("section editor shows the 3-lane timeline without overflow (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const sectionCard = page
    .locator('article[aria-label="neta-card"]')
    .filter({ has: page.locator('.kind:text-is("section")') })
    .first();
  if ((await sectionCard.count()) === 0) test.skip(true, "no section neta to open");
  await sectionCard.locator(".card-main").click();
  await expect(page.getByLabel("timeline")).toBeVisible();
  await page.screenshot({ path: "e2e/__screenshots__/section-mobile.png", fullPage: true });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "セクション編集で横スクロール").toBeLessThanOrEqual(clientWidth + 1);
});
