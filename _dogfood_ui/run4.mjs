import { chromium } from '/home/shuraba_p/projects/creative_manager/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/index.mjs';

const BASE = 'http://100.109.159.48:8787/';
const OUT = '/home/shuraba_p/projects/creative_manager/_dogfood_ui';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function openChat(page){
  // chat FAB is bottom-right; open if not open
  const isOpen = await page.locator('input[aria-label=chat-input]').count();
  if (!isOpen) {
    await page.getByText('💬').first().click().catch(async()=>{ await page.locator('button').last().click().catch(()=>{}); });
    await sleep(800);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGE EXC:', String(e).slice(0,160)));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
    await sleep(1200);
    await openChat(page);
    // start a fresh session for clean view
    await page.locator('button[aria-label=new-session]').click().catch(e=>log('newsess:',e.message));
    await sleep(500);
    const input = page.locator('input[aria-label=chat-input]');
    await input.fill('切ないコード進行をちょうだい');
    await page.screenshot({ path: `${OUT}/05b_chat_typed.png` });
    await page.getByText('送信', {exact:true}).first().click().catch(e=>log('send:',e.message));
    log('submitted');

    for (let i=0;i<10;i++){
      await sleep(2000);
      await page.screenshot({ path: `${OUT}/05c_progress_${i}.png` });
      const panel = await page.evaluate(()=>{
        // grab text of the chat panel (the dialog containing chat-input)
        const inp=document.querySelector('input[aria-label=chat-input]');
        let p=inp; for(let k=0;k<8&&p;k++){ p=p.parentElement; if(p&&p.innerText&&p.innerText.length>120) break; }
        return p?p.innerText.replace(/\n+/g,' | ').slice(0,500):'(no panel)';
      });
      log(`t+${(i+1)*2}s:`, panel);
    }
    await page.screenshot({ path: `${OUT}/05d_chat_final.png` });

    // open the tray to see results
    log('--- open tray ---');
    await page.locator('button[aria-label=close]').click().catch(()=>{});
    await sleep(400);
    await page.locator('button[aria-label=tray]').click().catch(e=>log('tray:',e.message));
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/06_tray.png` });
    const trayText = await page.evaluate(()=>document.body.innerText.slice(0,1000));
    log('TRAY TEXT:', trayText);

    // mobile viewport
    log('--- mobile ---');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE, { waitUntil:'networkidle', timeout:30000 }).catch(()=>{});
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/07_mobile_top.png`, fullPage:false });
    await openChat(page);
    await sleep(600);
    await page.screenshot({ path: `${OUT}/08_mobile_chat.png`, fullPage:false });

  } catch (e) {
    log('FATAL:', e.message);
  } finally {
    await browser.close();
  }
})();
