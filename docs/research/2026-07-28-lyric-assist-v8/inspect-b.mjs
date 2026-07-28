/* inspect-b.mjs — 担当Bの目視用: 枚ごとの電話枠・区画を個別に撮る（配布物ではない） */
import pkg from "/home/shuraba_p/projects/creative_manager/node_modules/playwright-core/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = pkg;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "shots", "inspect");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/home/shuraba_p/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
});
const p = await (await b.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 })).newPage();
await p.goto("file://" + path.join(DIR, "skeleton.html"), { waitUntil: "load" });
await p.waitForTimeout(200);
for (const sheet of ["b1", "b2", "b3", "b4"]) {
  const boxes = await p.evaluate((sh) => {
    const out = [];
    document.querySelectorAll(`.frame[data-sheet="${sh}"] .c-ph, .frame[data-sheet="${sh}"] .c-cmpbox`).forEach((e) => {
      const r = e.getBoundingClientRect();
      out.push({ x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height });
    });
    return out;
  }, sheet);
  let i = 0;
  for (const box of boxes) {
    const H = 1900;
    for (let k = 0; k * H < box.h; k++) {
      await p.screenshot({
        path: path.join(OUT, `${sheet}_${i}` + (box.h > H ? `_${k}` : "") + ".png"),
        clip: { x: box.x, y: box.y + k * H, width: box.w, height: Math.min(H, box.h - k * H) },
        fullPage: true,
      });
    }
    i++;
  }
  console.log(sheet, boxes.length, "区画", boxes.map((b2) => Math.round(b2.h)).join(","));
}
await b.close();
