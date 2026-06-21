import { test, expect } from "./fixtures";
import { createNeta, deleteNeta, openNeta, stamp } from "./helpers";

// U9：section の key/tempo/meter をUIで変更→保存→API永続。
test("section save: key/tempo/meter roundtrip persists (U9)", async ({ page, request }) => {
  const s = stamp();
  const sec = await createNeta(request, {
    kind: "section",
    title: `${s}-sec`,
    key: 0,
    tempo: 120,
    meter: "4/4",
  });
  try {
    await openNeta(page, `${s}-sec`);
    const tempo = page.getByLabel("tempo");
    await tempo.fill("");
    await tempo.fill("96");
    await page.getByLabel("meter").selectOption("6/8");
    await page.getByLabel("key").selectOption("5");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByLabel("edit-neta")).toHaveCount(0, { timeout: 8000 }); // 保存で閉じる
    const after = await (await request.get(`/api/neta/${sec.id}`)).json();
    expect(after.tempo).toBe(96);
    expect(after.meter).toBe("6/8");
    expect(after.key).toBe(5);
  } finally {
    await deleteNeta(request, sec.id);
  }
});
