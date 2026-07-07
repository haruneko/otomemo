import { test, expect } from "./fixtures";

// ①逐次表示 と ②再アタッチのレース の受け入れ。フェイク claude（partial デルタを時間差で吐く）背後で
// 検証する（playwright.chat.config.ts）。END_MARK＝返信の末尾錨＝「最後まで届いた」ことの決定的な証。
const END_MARK = "【返信おわり】";
const STREAMING = '.chat-msg.ai[aria-label="streaming"]';

async function openChat(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "chat", exact: true }).click();
  await expect(page.getByLabel("chat-input")).toBeVisible();
}

async function sendMessage(page: import("@playwright/test").Page, text: string) {
  await page.getByLabel("chat-input").fill(text);
  await page.getByRole("button", { name: "送信" }).click();
}

test.describe("chat streaming & reattach", () => {
  // ① 部分デルタで「タラタラ出る」：streaming 領域が空→途中→最終と成長する（スピナー→一括ドンではない）。
  test("① streams progressively (partial deltas grow, not one-shot)", async ({ page }) => {
    await openChat(page);
    await sendMessage(page, "コード進行、次どうしよう");

    const streaming = page.locator(STREAMING);
    // 部分テキストが乗ると初めて可視化される（busy && streamText）＝この時点で既に非空。
    await expect(streaming).toBeVisible({ timeout: 8000 });
    const early = ((await streaming.textContent()) ?? "").length;

    // 生成完了：streaming 領域は消え、確定 AI メッセージへ畳まれEND_MARKまで到達。
    await expect(streaming).toBeHidden({ timeout: 15000 });
    const finalMsg = page.locator(".chat-msg.ai").last();
    await expect(finalMsg).toContainText(END_MARK, { timeout: 5000 });
    const finalLen = ((await finalMsg.textContent()) ?? "").length;

    // 途中は非空（デルタが届いた）かつ最終より短い（尻切れでなく成長した）＝逐次表示の決定的証拠。
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(finalLen);

    // 実質のある返信（40字超・フェイク返信は57字）には「知見化」が出る（1行の相槌には出さない出し分け）。
    // ※ global スレッドは実行内で履歴が積まれ得るので、最後の返信内に絞って検証。
    await expect(finalMsg.getByRole("button", { name: "知見化" })).toBeVisible();
  });

  // ②-a 生成中に離脱→即復帰（走行中ターンへ再アタッチ）：締めの返信が消えず確定メッセージに残る。
  test("②-a leaving mid-generation and returning keeps the reply (live reattach)", async ({ page }) => {
    await openChat(page);
    await sendMessage(page, "生成の途中で閉じてすぐ戻る");

    // 走行中（streaming 可視）で閉じる＝Chat unmount。サーバのターンは走り続ける。
    await expect(page.locator(STREAMING)).toBeVisible({ timeout: 8000 });
    await page.getByLabel("close").click();
    await expect(page.getByLabel("chat-input")).toBeHidden();

    // すぐ開き直す＝走行中ターンに途中から再アタッチ→締めまで受け取り確定描画。
    await page.getByRole("button", { name: "chat", exact: true }).click();
    await expect(page.getByLabel("chat-input")).toBeVisible();
    await expect(page.locator(".chat-msg.ai").last()).toContainText(END_MARK, { timeout: 15000 });
  });

  // ②-b 離脱中に生成が完了→後で戻る：完了後に開いても返信が失われない（履歴＋not-live 取り直しの合わせ技）。
  test("②-b returning after generation completed still shows the reply", async ({ page }) => {
    await openChat(page);
    await sendMessage(page, "閉じている間に生成が終わるケース");

    await expect(page.locator(STREAMING)).toBeVisible({ timeout: 8000 });
    await page.getByLabel("close").click();
    await expect(page.getByLabel("chat-input")).toBeHidden();

    // ターンが完了しきる猶予（フェイクの総生成時間 > 2s）。この間にサーバは assistant を永続化する。
    await page.waitForTimeout(3000);

    await page.getByRole("button", { name: "chat", exact: true }).click();
    await expect(page.getByLabel("chat-input")).toBeVisible();
    const restored = page.locator(".chat-msg.ai").last();
    await expect(restored).toContainText(END_MARK, { timeout: 8000 });
    // 復元(reloadMsgs)された返信にも「知見化」が出る＝テキスト基準の出し分け（旧 saveable 方式では出なかった）。
    await expect(restored.getByRole("button", { name: "知見化" })).toBeVisible();
  });
});
