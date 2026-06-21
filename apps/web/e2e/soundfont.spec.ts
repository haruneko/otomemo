import { test, expect } from "./fixtures";

// U15：設定UI で SoundFont を選択→「音源をテスト」→ ✓読込OK（N楽器）。
// アップロードは重く非決定なので既存assetの選択/テストのみ（uploadは api unit でカバー）。
test("soundfont settings: select + test shows 読込OK (U15)", async ({ page, request }) => {
  const list = await (await request.get("/api/assets?kind=soundfont")).json();
  test.skip(!Array.isArray(list) || list.length === 0, "SoundFont 未登録のためスキップ");

  await page.goto("/");
  await page.getByLabel("settings").click();
  const panel = page.locator('section[aria-label="soundfont-settings"]');
  await expect(panel).toBeVisible();
  // 一覧の先頭を選択（既に選択済みでも可）→ テスト
  await panel.getByLabel(`sf-select-${list[0].id}`).click();
  await panel.getByLabel("sf-test").click();
  await expect(panel.getByText(/読込OK（\d+楽器）/)).toBeVisible({ timeout: 60000 });
});
