import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, stamp } from "./helpers";

// U4/U20：検索（キーワード一致／該当なし）と mood/kind フィルタ。cm-search 非依存。
test.describe("search & filters (U4/U20)", () => {
  test("keyword shows own card with 一致 badge; nonsense shows 該当なし", async ({
    page,
    request,
  }) => {
    const s = stamp();
    const neta = await createNeta(request, { kind: "lyric", title: `${s}-夜`, text: "歌詞" });
    try {
      await page.goto("/");
      await page.getByLabel("search").fill(s);
      // 自分のカードが見える（toHaveCount(1) には頼らない＝semantic混入耐性）
      await expect(page.getByText(`${s}-夜`, { exact: false }).first()).toBeVisible({
        timeout: 8000,
      });
      // 「一致」バッジ（matchType=exact または both＝キーワード一致）。ユニークstampなので自分だけ。
      await expect(page.locator(".match-badge").filter({ hasText: "一致" }).first()).toBeVisible();
      // stamp と無関係な語で検索 → 自分のカードはキーワード一致しないので消える（cm-search非依存の決定的検証）。
      await page.getByLabel("search").fill("qzxnonexistentword");
      await expect(page.getByText(`${s}-夜`, { exact: false })).toHaveCount(0, { timeout: 8000 });
    } finally {
      await deleteNeta(request, neta.id);
    }
  });

  test("kind-filter disables while searching; mood-filter narrows (U20)", async ({
    page,
    request,
  }) => {
    const s = stamp();
    const moodVal = `mood${s}`;
    const neta = await createNeta(request, {
      kind: "lyric",
      title: `${s}-m`,
      text: "x",
      mood: moodVal,
    });
    try {
      await page.goto("/");
      await page.getByLabel("toggle-filters").click(); // 種別/mood は既定折りたたみ→展開
      // 検索文字入力で kind-filter は無効化（検索中は種類フィルタ無効の連動）
      await page.getByLabel("search").fill("夜");
      await expect(page.getByLabel("kind-filter")).toBeDisabled();
      await page.getByLabel("search").fill("");
      await expect(page.getByLabel("kind-filter")).toBeEnabled();
      // mood-filter で自分のネタが残る
      await page.getByLabel("mood-filter").fill(moodVal);
      await expect(page.getByText(`${s}-m`, { exact: false }).first()).toBeVisible({
        timeout: 8000,
      });
    } finally {
      await deleteNeta(request, neta.id);
    }
  });
});
