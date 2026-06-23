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

    // Open chat via floating button (bottom-right blue) or 💬
    log('STEP 5: open chat');
    // try the floating round button bottom-right
    const fab = page.locator('button').filter({ hasText: /^$/ }).last();
    // more robust: click bottom-right corner element with role button near 💬
    const opened = await page.getByText('💬').first().click().then(()=>true).catch(()=>false);
    if (!opened) {
      // the FAB might be an icon-only button; click last button
      await page.locator('button').last().click().catch(e=>log('fab:', e.message));
    }
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/05a_chat_open.png` });
    const chatText = await page.evaluate(()=>document.body.innerText.slice(0,1200));
    log('\n--- CHAT PANEL TEXT ---\n', chatText);
    const chatInputs = await page.evaluate(()=>
      [...document.querySelectorAll('input,textarea,button')].map(i=>({t:i.tagName,a:i.getAttribute('aria-label')||'',ph:i.placeholder||'',txt:(i.innerText||'').trim().slice(0,24)})).filter(o=>o.a||o.ph||o.txt).slice(-25)
    );
    log('CHAT CONTROLS (tail):', JSON.stringify(chatInputs));

    // Type a request into the chat box
    const ta = page.locator('textarea').last();
    await ta.fill('切ないコード進行をちょうだい').catch(e=>log('chat fill:', e.message));
    await page.screenshot({ path: `${OUT}/05b_chat_typed.png` });
    // submit (Enter)
    await ta.press('Enter').catch(e=>log('enter:', e.message));
    log('submitted chat request');

    // Capture progress over time
    for (let i = 0; i < 8; i++) {
      await sleep(2000);
      await page.screenshot({ path: `${OUT}/05c_chat_progress_${i}.png` });
      const prog = await page.evaluate(()=>{
        const t = document.body.innerText;
        // grab lines mentioning progress-ish keywords
        return t.split('\n').filter(l=>/仕上げ|経過|秒|\/|待たず|戻る|生成中|処理中|%|進捗/.test(l)).slice(0,12).join(' | ');
      });
      log(`progress t+${(i+1)*2}s:`, prog.slice(0,300));
      // check for a progress bar element
      const bar = await page.evaluate(()=>{
        const els=[...document.querySelectorAll('progress,[role=progressbar],.progress,[class*=progress],[class*=Progress]')];
        return els.map(e=>({tag:e.tagName, cls:e.className, val:e.getAttribute('aria-valuenow')||e.value||''})).slice(0,5);
      });
      if (bar.length) log('  progressbar els:', JSON.stringify(bar));
    }
    await page.screenshot({ path: `${OUT}/05d_chat_final.png` });
    const finalText = await page.evaluate(()=>document.body.innerText.slice(0,1500));
    log('\n--- CHAT FINAL TEXT ---\n', finalText);

  } catch (e) {
    log('FATAL:', e.message);
  } finally {
    await browser.close();
  }
})();
