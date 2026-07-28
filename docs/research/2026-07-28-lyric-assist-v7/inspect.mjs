// 一時: 部品の目視用に電話枠ごとにスクショ（自己点検専用）
import pkg from "/home/shuraba_p/projects/creative_manager/node_modules/playwright-core/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = pkg;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: "/home/shuraba_p/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome" });
const p = await (await b.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 })).newPage();
await p.goto("file://" + path.join(DIR, "skeleton.html"), { waitUntil: "load" });
await p.waitForTimeout(200);
const phones = await p.$$(".c-ph");
for (let i = 0; i < phones.length; i++) {
  await phones[i].scrollIntoViewIfNeeded();
  await phones[i].screenshot({ path: path.join(DIR, "shots", `inspect_ph${i + 1}.png`) });
}
console.log("撮影:", phones.length);
await b.close();
