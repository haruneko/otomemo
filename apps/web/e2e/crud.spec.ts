import { test, expect, Page } from "@playwright/test";

// QAレビュー用：ネタ(neta)の基本CRUDを実ブラウザで通す。
// prod コードは変更しない。新規 spec のみ。スクショは test-results/ に保存。
// 既存 spec（responsive / section-*）とは独立に動く。

const SHOT = "test-results/crud";

// ネタ帳(notebook aside)が mobile で閉じていたら開く。
async function ensureRailOpen(page: Page) {
  const notebook = page.locator('aside.notebook[aria-label="notebook"]');
  const cls = (await notebook.getAttribute("class")) ?? "";
  if (cls.includes("closed")) {
    await page.getByLabel("toggle-rail").click();
    await expect(notebook).not.toHaveClass(/closed/);
  }
}

// テスト固有のユニークなマーカー。一覧から自分のネタを特定するため。
function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

test.describe("neta CRUD (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Create → Read → Update → Delete a lyric neta", async ({ page, request }) => {
    page.on("dialog", (d) => void d.accept()); // confirm を常に受理
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureRailOpen(page);

    const created = uniq("qa歌詞");
    const updated = uniq("qa歌詞改");

    // --- Create: 「＋歌詞」タイルで空の歌詞ネタ→エディタでタイトルを created に→保存
    //   （旧 Capture フォーム撤去後の作成導線＝タイル＋エディタ）。 ---
    await page.getByRole("button", { name: "＋歌詞", exact: true }).click();
    await expect(page.getByLabel("edit-neta")).toBeVisible();
    await page.getByLabel("title").fill(created);
    await page.getByLabel("text").fill("歌詞本文");
    // 自動保存化(26f465f)で明示「保存」ボタン撤去＝値確定→closeで自動保存フラッシュ＆一覧へ。
    await expect(page.getByLabel("title")).toHaveValue(created); // 入力確定を担保（フレーク耐性）
    await page.getByLabel("edit-neta").getByLabel("close", { exact: true }).click();
    await page.waitForTimeout(700); // デバウンス(600ms)＋PATCH反映待ち

    // --- Read: 一覧に出る（card body に created テキスト） ---
    const card = page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: created })
      .first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SHOT}-create-desktop.png`, fullPage: true });

    // --- Read via search: 検索窓で絞れる ---
    await page.getByLabel("search").fill(created);
    await page.waitForTimeout(600); // debounce/反映待ち
    await expect(
      page.locator('article[aria-label="neta-card"]').filter({ hasText: created }),
    ).toHaveCount(1);
    await page.screenshot({ path: `${SHOT}-search-desktop.png`, fullPage: true });
    await page.getByLabel("search").fill("");
    await page.waitForTimeout(400);

    // --- Update: カードを開く→本文/タイトル編集→保存→反映 ---
    await page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: created })
      .first()
      .locator(".card-main")
      .click();
    const editor = page.getByLabel("edit-neta");
    await expect(editor).toBeVisible();
    // lyric は本文(text)編集。タイトルも付ける。
    await page.getByLabel("title").fill(updated);
    await page.getByLabel("text").fill(`${created}\n本文を更新した`);
    // 自動保存化＝値確定→closeでフラッシュ（更新が永続し一覧へ反映）。
    await expect(page.getByLabel("title")).toHaveValue(updated);
    await editor.getByLabel("close", { exact: true }).click();
    await page.waitForTimeout(800);

    // タイトルを付けたのでカードラベルは title 優先 = updated
    await expect(
      page.locator('article[aria-label="neta-card"]').filter({ hasText: updated }).first(),
    ).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SHOT}-update-desktop.png`, fullPage: true });

    // --- Delete（#63 修正後：UI から消せる）---
    await page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: updated })
      .first()
      .locator(".card-main")
      .click();
    await expect(page.getByLabel("edit-neta")).toBeVisible();

    const delResp = page
      .waitForResponse(
        (r) => r.url().includes("/neta/") && r.request().method() === "DELETE",
        { timeout: 8000 },
      )
      .catch(() => null);
    // 削除は明示テキストボタン→ゴミ箱アイコン化(EditorHeader・自動保存化リファクタ)＝aria-labelで指す。
    await page.getByLabel("edit-neta").getByLabel("削除", { exact: true }).click();
    const resp = await delResp;

    await page.screenshot({ path: `${SHOT}-delete-desktop.png`, fullPage: true });

    // 200 で削除成功 → editor 閉じる・一覧から消える。
    expect(resp, "DELETE リクエストが飛んでいない").not.toBeNull();
    expect(resp!.status(), "UI削除が 200 で成功する（#63 修正）").toBe(200);
    await expect(page.getByLabel("edit-neta")).toHaveCount(0);
    await expect(
      page.locator('article[aria-label="neta-card"]').filter({ hasText: updated }),
    ).toHaveCount(0);
  });

  // #63 回帰固定：API は空ボディDELETEに content-type:application/json が付くと 400、
  // 無ければ 200。フロント http() は body 無し時に content-type を付けない契約。
  test("DELETE contract: no content-type on empty body (#63)", async ({ request }) => {
    const created = await request.post("/api/neta", {
      data: { kind: "lyric", text: "qa-delete-probe" },
    });
    expect(created.ok()).toBeTruthy();
    const id = (await created.json()).id as string;

    // 誤って content-type を付けると 400（Fastify の空JSONボディ拒否）＝フロントが付けない理由。
    const bad = await request.delete(`/api/neta/${id}`, {
      headers: { "content-type": "application/json" },
    });
    expect(bad.status()).toBe(400);

    // content-type 無し＝フロントの新挙動なら 200。
    const ok = await request.delete(`/api/neta/${id}`);
    expect(ok.status(), "content-type 無しの DELETE は成功").toBe(200);
  });

  test("create a melody and add notes in the piano roll, then save", async ({
    page,
    request,
  }) => {
    page.on("dialog", (d) => void d.accept());
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureRailOpen(page);

    const title = uniq("qaメロ");
    // 「＋メロ」タイル→エディタでタイトル設定→保存（保存でエディタは閉じ一覧へ）。
    await page.getByRole("button", { name: "＋メロ", exact: true }).click();
    await expect(page.getByLabel("edit-neta")).toBeVisible();
    await page.getByLabel("title").fill(title);
    // 自動保存化＝値確定→closeでフラッシュ＆一覧へ。
    await expect(page.getByLabel("title")).toHaveValue(title);
    await page.getByLabel("edit-neta").getByLabel("close", { exact: true }).click();
    await page.waitForTimeout(500);

    const card = page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: title })
      .first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.locator(".card-main").click();
    await expect(page.getByLabel("edit-neta")).toBeVisible();

    // メロはピアノロール表示。roll に切替（既定 roll のはず）。
    const roll = page.getByLabel("piano-roll");
    if ((await roll.count()) === 0) test.skip(true, "piano-roll not shown for melody");
    await expect(roll).toBeVisible();

    // セルをクリックしてノート追加（aria-label="cell-<pitch>-<step>"）。
    const firstCell = page.locator('[aria-label^="cell-"]').first();
    await firstCell.scrollIntoViewIfNeeded();
    await firstCell.click();
    await expect(page.locator('[aria-label^="note-"]').first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}-pianoroll-desktop.png`, fullPage: true });

    // 自動保存化＝ノート追加で dirty→closeでフラッシュ（永続）。
    await page.getByLabel("edit-neta").getByLabel("close", { exact: true }).click();
    await page.waitForTimeout(700);

    // 後片付け：API で掃除（content-type なし＝200）。
    const list = await (await request.get(`/api/neta?q=${encodeURIComponent(title)}`)).json();
    for (const n of list as Array<{ id: string; title?: string }>) {
      if (n.title === title) await request.delete(`/api/neta/${n.id}`);
    }
  });
});

test.describe("neta CRUD (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("create + read + delete on mobile (#63)", async ({ page, request }) => {
    page.on("dialog", (d) => void d.accept());
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await ensureRailOpen(page);

    const created = uniq("qaモバ");
    // 「＋歌詞」タイル→エディタでタイトル設定→保存（保存で全画面エディタが閉じ一覧へ）。
    await page.getByRole("button", { name: "＋歌詞", exact: true }).click();
    await expect(page.getByLabel("edit-neta")).toBeVisible();
    await page.getByLabel("title").fill(created);
    // 自動保存化＝値確定→closeで全画面エディタが閉じフラッシュ＆一覧へ。
    await expect(page.getByLabel("title")).toHaveValue(created);
    await page.getByLabel("edit-neta").getByLabel("close", { exact: true }).click();
    await page.waitForTimeout(500);

    const card = page
      .locator('article[aria-label="neta-card"]')
      .filter({ hasText: created })
      .first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SHOT}-create-mobile.png`, fullPage: true });

    // 横スクロール無いか（モバイル崩れ検出）
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, "mobile 一覧で横スクロール").toBeLessThanOrEqual(clientWidth + 1);

    // open → editor in main pane (mobile)
    await card.locator(".card-main").click();
    await expect(page.getByLabel("edit-neta")).toBeVisible();
    await page.screenshot({ path: `${SHOT}-editor-mobile.png`, fullPage: true });

    // delete（#63 修正後：モバイルでも消せる）
    const delResp = page
      .waitForResponse(
        (r) => r.url().includes("/neta/") && r.request().method() === "DELETE",
        { timeout: 8000 },
      )
      .catch(() => null);
    // 削除は明示テキストボタン→ゴミ箱アイコン化(EditorHeader・自動保存化リファクタ)＝aria-labelで指す。
    await page.getByLabel("edit-neta").getByLabel("削除", { exact: true }).click();
    const resp = await delResp;
    expect(resp?.status(), "モバイルでも UI 削除は 200").toBe(200);
    await expect(page.getByLabel("edit-neta")).toHaveCount(0);

    // 念のため API でも残骸掃除。
    const list = await (await request.get(`/api/neta?q=${encodeURIComponent(created)}`)).json();
    for (const n of list as Array<{ id: string; text?: string }>) {
      if ((n.text ?? "").includes(created)) await request.delete(`/api/neta/${n.id}`);
    }
  });

  test("chat bubble opens chat dialog (mobile)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator("button.chat-bubble").click();
    await expect(page.getByLabel("chat-input")).toBeVisible();
    await page.screenshot({ path: `${SHOT}-chat-mobile.png`, fullPage: true });
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, "mobile chat で横スクロール").toBeLessThanOrEqual(clientWidth + 1);
  });
});
