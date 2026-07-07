import { chromium } from '/home/shuraba_p/projects/creative_manager/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8799/';
const OUT = '/home/shuraba_p/projects/creative_manager/_dogfood_ui/editors';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// title -> output filename (without .png)
const TARGETS = [
  ['UI-melody', 'melody'],
  ['UI-chordprog', 'chord_progression'],
  ['UI-bass-relative', 'bass-relative'],
  ['UI-bass-absolute', 'bass-absolute'],
  ['UI-rhythm', 'rhythm'],
  ['UI-chordpattern', 'chord_pattern'],
  ['UI-lyric', 'lyric'],
  ['UI-text', 'text'],
  ['UI-section', 'section'],
];

async function openByTitle(page, title) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await sleep(800);
  await page.getByText(title, { exact: false }).first().click();
  await page.getByLabel('edit-neta').waitFor({ timeout: 8000 });
  await sleep(900); // let editor body render (piano roll, lanes, etc.)
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGE EXC:', String(e).slice(0, 200)));

  const results = [];
  for (const [title, fname] of TARGETS) {
    try {
      await openByTitle(page, title);
      const path = `${OUT}/${fname}.png`;
      await page.screenshot({ path });
      log('OK', fname);
      results.push([fname, 'ok']);
    } catch (e) {
      log('FAIL', fname, e.message);
      results.push([fname, 'FAIL:' + e.message]);
    }
  }
  log('=== SUMMARY ===');
  for (const [f, s] of results) log(f, '->', s);
  await browser.close();
})();
