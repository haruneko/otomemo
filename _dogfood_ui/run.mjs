import { chromium } from '/home/shuraba_p/projects/creative_manager/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/index.mjs';

const BASE = 'http://100.109.159.48:8787/';
const OUT = '/home/shuraba_p/projects/creative_manager/_dogfood_ui';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function dumpText(page, label) {
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  console.log(`\n===== TEXT [${label}] =====\n${txt}\n===== END =====`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0,200)); });
  page.on('pageerror', e => console.log('PAGE EXC:', String(e).slice(0,200)));

  try {
    console.log('STEP 1: open top');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('goto warn:', e.message));
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/01_top.png`, fullPage: false });
    await dumpText(page, 'top');

    // Log key structural hints
    const buttons = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role=button], a')].map(b => (b.innerText||b.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0, 60)
    );
    console.log('\nCLICKABLES:', JSON.stringify(buttons, null, 0));

    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input, textarea, select')].map(i => ({ tag: i.tagName, type: i.type||'', ph: i.placeholder||'', name: i.name||'', aria: i.getAttribute('aria-label')||'' })).slice(0,40)
    );
    console.log('\nINPUTS:', JSON.stringify(inputs, null, 0));

  } catch (e) {
    console.log('FATAL:', e.message);
  } finally {
    await browser.close();
  }
})();
