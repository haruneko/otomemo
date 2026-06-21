import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";

// U16：停止UI（カード ▶⇄⏹ トグル）と Space 再生（入力中は横取りしない）。
test.describe("transport stop & Space (U16)", () => {
  test("card play button toggles ▶ ⇄ ⏹", async ({ page, request }) => {
    const s = stamp();
    const mel = await createNeta(request, {
      kind: "melody",
      title: `${s}-card`,
      content: { notes: [{ pitch: 60, start: 0, dur: 2 }] },
    });
    try {
      await page.goto("/");
      const btn = page.getByLabel(`play-${mel.id}`);
      await expect(btn).toHaveText("▶");
      await btn.click();
      await expect(btn).toHaveText("⏹"); // 再生中＝停止ボタン
      await btn.click();
      await expect(btn).toHaveText("▶"); // 停止で戻る
    } finally {
      await deleteNeta(request, mel.id);
    }
  });

  test("Space starts playback; Space inside an input does not", async ({ page, request }) => {
    const s = stamp();
    const mel = await createNeta(request, {
      kind: "melody",
      title: `${s}-space`,
      content: { notes: [{ pitch: 60, start: 0, dur: 2 }] },
    });
    try {
      await openNeta(page, `${s}-space`);
      const pp = page.getByLabel("play-pause");
      // 入力欄フォーカス中の Space は再生を横取りしない
      await page.getByLabel("title").focus();
      await page.keyboard.press("Space");
      await expect(pp).toHaveAttribute("aria-pressed", "false");
      // 操作要素外で Space → 再生開始
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.keyboard.press("Space");
      await expect(pp).toHaveAttribute("aria-pressed", "true", { timeout: 8000 });
    } finally {
      await deleteNeta(request, mel.id);
    }
  });
});
