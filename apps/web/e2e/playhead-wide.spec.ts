import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, stamp } from "./helpers";

// バグ（オーナー実機 2026-07-14）：32小節セクション（BARS>10 で lane-track に min-width が付き横スクロール）で
// プレイヘッド（.playhead）の x 写像が blocks/ruler とズレる。原因＝playhead の `left: calc(44px + --ph*(100%-44px))`
// が `.lanes`(スクロール枠の可視幅)基準なのに、blocks/ruler は `.lane-track`(min-width で content 幅)基準。
// ≤10小節では両者一致（幅が同じ）＝従来テストは通る。>10小節でだけ乖離する回帰を固定する。
//
// 検証：位置64拍(= bar17 の頭 = 尺128拍の 50%)に子を置き、--ph=0.5 を注入。プレイヘッドの画面x が
// その子ブロックの左端x と一致する（数px以内）はず。現状は乖離（playhead が可視幅の 50% どまり）。
test("playhead aligns with block position in a wide (>10 bar) section (U-wide)", async ({ page, request }) => {
  const s = stamp();
  const sec = await createNeta(request, {
    kind: "section",
    title: `${s}-SEC`,
    key: 0,
    tempo: 120,
    meter: "4/4",
    bars: 32, // >10 小節＝lane-track に min-width（横スクロール）＝バグ発生条件
  });
  const mel = await createNeta(request, {
    kind: "melody",
    title: `${s}-CH`,
    content: { notes: [{ pitch: 60, start: 0, dur: 4 }] },
  });
  // 2ユニット目を beat 64（bar17・尺の 50%）へ配置＝実機の再現条件（0/64拍に16小節ユニット×2 の後半）。
  await request.post("/api/compose", { data: { parent: sec.id, child: mel.id, position: 64, ord: 0 } });
  try {
    await page.goto("/");
    await page.getByText(`${s}-SEC`, { exact: false }).first().click();
    await page.getByLabel("edit-neta").waitFor({ timeout: 8000 });
    const block = page.locator(`.section-editor .lane-block[aria-label="block-${mel.id}@64"]`);
    await block.waitFor({ timeout: 8000 });
    const ph = page.locator(".section-editor .playhead");

    // 再生を回さず --ph を注入（SF2 ロード非依存で幾何だけを測る）。beat64/128 = 0.5。
    await ph.evaluate((el: HTMLElement) => {
      el.style.display = "block";
      el.style.setProperty("--ph", "0.5");
    });

    const phLeft = await ph.evaluate((el: HTMLElement) => el.getBoundingClientRect().left);
    const blockLeft = await block.evaluate((el: HTMLElement) => el.getBoundingClientRect().left);
    // プレイヘッドは「その拍の位置」＝position64 のブロック左端に一致すべき（線幅ぶん数px許容）。
    expect(Math.abs(phLeft - blockLeft)).toBeLessThan(8);
  } finally {
    await deleteNeta(request, sec.id);
    await deleteNeta(request, mel.id);
  }
});
