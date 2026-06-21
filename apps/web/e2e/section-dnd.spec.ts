import { test, expect } from "@playwright/test";

// #52②c / #75: PCでネタ帳カードをセクションのレーンへドラッグ配置（dnd-kit）。
// dnd-kit は pointer 移動でドラッグ開始するので mouse を手動で動かす。
// DB状態に依存しないよう、テスト専用の section/melody を新規作成（updated DESC で一覧先頭に来る
// ＝ドラッグ元カードとドロップ先セルが両方ビューポート内に出る）して操作し、最後に削除する。
test("drag a melody card onto a melody lane places it (desktop)", async ({ page, request }) => {
  const stamp = Date.now();
  const secTitle = `dndsec-${stamp}`;
  const melTitle = `dndmel-${stamp}`;
  const sec = await (
    await request.post("/api/neta", { data: { kind: "section", title: secTitle } })
  ).json();
  const mel = await (
    await request.post("/api/neta", {
      data: { kind: "melody", title: melTitle, content: { notes: [{ pitch: 60, start: 0, dur: 1 }] } },
    })
  ).json();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 自分の section を開く（.mainpane は sticky なので開けば右に常時見える）
    await page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: secTitle })
      .first()
      .locator(".card-main")
      .click();
    await expect(page.getByLabel("timeline")).toBeVisible();

    // 自分の melody カードのドラッグハンドル
    const handle = page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: melTitle })
      .first()
      .locator(".drag-handle");
    await handle.scrollIntoViewIfNeeded();
    const cell = page.getByLabel("place-melody-3"); // bar3 → position 12 (4/4)
    const hb = await handle.boundingBox();
    const cb = await cell.boundingBox();
    if (!hb || !cb) throw new Error("no bounding boxes");

    await handle.hover();
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 12, hb.y + hb.height / 2 + 4); // >5px で起動
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 12 });
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); // settle
    await page.mouse.up();

    // pointerWithin でカーソル直下のセル＝bar3(position 12)に正確に配置される
    await expect(page.locator('[aria-label$="@12"]')).toHaveCount(1, { timeout: 4000 });
  } finally {
    await request.delete(`/api/neta/${sec.id}`);
    await request.delete(`/api/neta/${mel.id}`);
  }
});
