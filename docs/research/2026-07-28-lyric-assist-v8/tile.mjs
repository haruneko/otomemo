/* tile.mjs — 工程2の目視用。render.mjs と同じ非表示設定で各枚をタイル分割撮影する。 */
import pkg from "/home/shuraba_p/projects/creative_manager/node_modules/playwright-core/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = pkg;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "shots", "tiles");
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/home/shuraba_p/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("file://" + path.join(DIR, "skeleton.html"), { waitUntil: "load" });
await p.addStyleTag({ content: ".desc,.st{display:none !important}" });
await p.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const kill = [/（[^（）]*(裁定|欠陥|R-\d+|§\d)[^（）]*）/g, /・?(裁定\d+|欠陥\d+|R-\d+|§\d+(\.\d+)?)/g, /【[^】]*】/g];
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach((n) => { let t = n.nodeValue; kill.forEach((r) => { t = t.replace(r, ""); }); n.nodeValue = t; });
});
await p.waitForTimeout(200);

const TILE = 1100; // CSS px（撮影は2倍密度）
const docH = await p.evaluate(() => document.documentElement.scrollHeight);
const docW = await p.evaluate(() => document.documentElement.scrollWidth);
const frames = await p.$$(".frame");
let no = 0;
for (const f of frames) {
  const id = await f.getAttribute("data-sheet");
  const demo = await f.getAttribute("data-demo");
  if (demo) continue;
  no++;
  const box = await f.boundingBox();
  const n = Math.ceil(box.height / TILE);
  for (let i = 0; i < n; i++) {
    const top = box.y + i * TILE;
    const bottom = Math.min(box.y + box.height + 4, top + TILE + 40, docH);
    const w = Math.min(box.width, docW - box.x);
    if (bottom - top < 2) continue;
    await p.screenshot({
      path: path.join(OUT, `v8_${String(no).padStart(2, "0")}_${id}_p${i + 1}of${n}.png`),
      fullPage: true,
      clip: { x: box.x, y: top, width: w, height: bottom - top },
    });
  }
  console.log(id, n, "tiles");
}
await b.close();
