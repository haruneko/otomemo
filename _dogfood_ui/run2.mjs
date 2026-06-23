import { chromium } from '/home/shuraba_p/projects/creative_manager/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/index.mjs';

const BASE = 'http://100.109.159.48:8787/';
const OUT = '/home/shuraba_p/projects/creative_manager/_dogfood_ui';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGE EXC:', String(e).slice(0,160)));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
    await sleep(1200);

    // STEP 2: capture a neta
    log('STEP 2: capture');
    await page.locator('select[aria-label=kind]').selectOption({ label: 'theme' }).catch(e=>log('kind sel:', e.message));
    await page.locator('textarea[aria-label=body]').fill('夏の終わり、夕方の海辺。切なくて少し前向きなテーマ。').catch(e=>log('body:', e.message));
    await page.locator('input[aria-label=tags]').fill('dogfood2 切ない').catch(e=>log('tags:', e.message));
    await page.screenshot({ path: `${OUT}/02a_capture_filled.png` });
    await page.getByText('放り込む', { exact: true }).first().click().catch(e=>log('throw click:', e.message));
    await sleep(1800);
    await page.screenshot({ path: `${OUT}/02b_capture_after.png` });
    const hasNew = await page.getByText('夏の終わり', { exact: false }).count().catch(()=>0);
    log('captured neta visible in list?', hasNew);

    // STEP 3: tab switch to library
    log('STEP 3: library tab');
    await page.getByText('ライブラリ（連想元）', { exact: false }).first().click().catch(e=>log('lib tab:', e.message));
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/03a_library.png` });
    const libCount = await page.locator('text=複製').count().catch(()=>0);
    log('library list rows (複製 count):', libCount);
    // try "プロジェクトにコピー" / "複製"
    const copyBtns = await page.evaluate(() =>
      [...document.querySelectorAll('button,a')].map(b=>(b.innerText||'').trim()).filter(t=>/コピー|複製|プロジェクト/.test(t)).slice(0,10)
    );
    log('copy-like buttons in library:', JSON.stringify(copyBtns));
    // back to project
    await page.getByText('プロジェクト', { exact: true }).first().click().catch(e=>log('proj tab:', e.message));
    await sleep(800);

    // STEP 4: open an editor - click a melody neta card
    log('STEP 4: open editor');
    // click the card text region for a melody
    await page.getByText('メロ', { exact: false }).first().click().catch(e=>log('open melody:', e.message));
    await sleep(2000);
    await page.screenshot({ path: `${OUT}/04a_editor.png`, fullPage: false });
    const editorText = await page.evaluate(()=>document.body.innerText.slice(0,1500));
    log('\n--- EDITOR TEXT ---\n', editorText);
    const editorInputs = await page.evaluate(()=>
      [...document.querySelectorAll('input,select,button')].map(i=>({t:i.tagName,a:i.getAttribute('aria-label')||'',ph:i.placeholder||'',txt:(i.innerText||'').trim().slice(0,20)})).filter(o=>o.a||o.ph||o.txt).slice(0,40)
    );
    log('EDITOR CONTROLS:', JSON.stringify(editorInputs));

  } catch (e) {
    log('FATAL:', e.message);
  } finally {
    await browser.close();
  }
})();
