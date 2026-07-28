/* render.mjs — v8 の全枚を desc 非表示設定でスクショする（設計論を絵に出さない）。
 *
 * 実行: node render.mjs           … 配布用（demo枚は撮らない）→ shots/v8_<番号>_<枚id>.png
 *       node render.mjs --all     … demo枚も撮る（自己点検用）
 *
 * 非表示・除去するもの（配布スクショの必須条件）:
 *   - .desc（枠外の判定用説明）と .st（判定札）を display:none
 *   - 本文テキスト中の「（…裁定N…）」「R-N」「§N」「【…】」を除去
 *   - 撮影後に設計論の語が残っていないか検査し、残っていたら異常終了
 */
import pkg from "/home/shuraba_p/projects/creative_manager/node_modules/playwright-core/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = pkg;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "shots");
const ALL = process.argv.includes("--all");
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/home/shuraba_p/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
await p.goto("file://" + path.join(DIR, "skeleton.html"), { waitUntil: "load" });
if (errors.length) {
  console.error("ページ内エラー（撮影中止）:\n" + errors.join("\n"));
  await b.close();
  process.exit(1);
}

/* 設計論の非表示（配布スクショの必須条件） */
await p.addStyleTag({ content: ".desc,.st{display:none !important}" });
await p.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const kill = [/（[^（）]*(裁定|欠陥|R-\d+|§\d)[^（）]*）/g, /・?(裁定\d+|欠陥\d+|R-\d+|§\d+(\.\d+)?)/g, /【[^】]*】/g];
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach((n) => {
    let t = n.nodeValue;
    kill.forEach((r) => { t = t.replace(r, ""); });
    n.nodeValue = t;
  });
});
await p.waitForTimeout(200);

/* 設計論の語の漏れ検査（.desc/.st は非表示なので innerText に乗らない） */
const leaked = await p.evaluate(() => {
  const bad = [];
  document.querySelectorAll(".frame").forEach((f) => {
    const id = f.getAttribute("data-sheet");
    const t = f.innerText;
    ["裁定", "欠陥", "§", "R-1", "R-2", "v5", "v6", "v7", "却下", "廃止", "工程"].forEach((wd) => {
      if (t.includes(wd)) bad.push(`枚${id}: "${wd}"`);
    });
  });
  return bad;
});

const frames = await p.$$(".frame");
let shot = 0;
for (const f of frames) {
  const id = await f.getAttribute("data-sheet");
  const demo = await f.getAttribute("data-demo");
  if (demo && !ALL) continue;
  await f.scrollIntoViewIfNeeded();
  await f.screenshot({ path: path.join(OUT, `v8_${String(++shot).padStart(2, "0")}_${id}.png`) });
  console.log("撮影:", id);
}
console.log("計", shot, "枚 →", OUT);
if (leaked.length) {
  console.error("設計論の語が絵に残っている（配布不可）:", leaked);
  await b.close();
  process.exit(1);
}
console.log("設計論の語の漏れ: なし");
await b.close();
