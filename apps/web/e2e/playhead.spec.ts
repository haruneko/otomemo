import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";

// U17：再生中にプレイヘッド --ph が 0→増加（section editor の .playhead は fit-to-width ratio）。
test("playhead --ph advances during playback, freezes on stop (U17)", async ({ page, request }) => {
  const s = stamp();
  const sec = await createNeta(request, {
    kind: "section",
    title: `${s}-SEC`,
    key: 0,
    tempo: 120,
    meter: "4/4",
  });
  const mel = await createNeta(request, {
    kind: "melody",
    title: `${s}-CH`, // section タイトルの部分文字列にならない名前にする
    content: { notes: [{ pitch: 60, start: 0, dur: 8 }] },
  });
  await request.post("/api/compose", { data: { parent: sec.id, child: mel.id, position: 0, ord: 0 } });
  try {
    await openNeta(page, `${s}-SEC`);
    // 子の配置がレーンにロードされてから再生（空だと合成0で鳴らない）
    await page.locator(".section-editor .lane-block").first().waitFor({ timeout: 8000 });
    const ph = page.locator(".section-editor .playhead");
    const read = () =>
      ph.evaluate((el: HTMLElement) => Number(el.style.getPropertyValue("--ph") || "0"));
    await page.getByLabel("play-pause").click();
    // 再生開始（--ph>0）まで待つ（初回はSF2ロードで数秒遅れることがある）
    await expect.poll(read, { timeout: 10000 }).toBeGreaterThan(0);
    const a = await read();
    await page.waitForTimeout(500);
    expect(await read()).toBeGreaterThan(a); // 単調増加
    // 停止で更新が止まる
    await page.getByLabel("rewind").click();
    await page.waitForTimeout(300);
    const c = await read();
    await page.waitForTimeout(400);
    expect(await read()).toBe(c);
  } finally {
    await deleteNeta(request, sec.id);
    await deleteNeta(request, mel.id);
  }
});
