// モバイル(スマホ幅 390x844)で各エディタ＋トップ画面を撮影し、レスポンシブ崩れを点検する。
// scratch api(:8799, /tmp DB)前提。本番(:8787, data/cm.sqlite)は不可触。
// 各kindのネタを **API(POST /neta)** で作成 → カードを開いて NetaDialog(全画面オーバーレイ)を撮る。
import { chromium } from '/home/shuraba_p/projects/creative_manager/node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:8799/';
const OUT = '/home/shuraba_p/projects/creative_manager/_dogfood_ui/editors_mobile';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// API でネタを作る（content は各エディタが意味ある描画になる程度に詰める）
async function createNeta(body) {
  const res = await fetch(BASE + 'neta', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('create ' + body.title + ' -> ' + res.status + ' ' + await res.text());
  return res.json();
}

// メロ用ノート（Cメジャースケールで上がる）
const melodyNotes = [
  { pitch: 60, start: 0, dur: 1 }, { pitch: 62, start: 1, dur: 1 },
  { pitch: 64, start: 2, dur: 1 }, { pitch: 65, start: 3, dur: 1 },
  { pitch: 67, start: 4, dur: 1 }, { pitch: 69, start: 5, dur: 1 },
  { pitch: 71, start: 6, dur: 1 }, { pitch: 72, start: 7, dur: 1 },
];
const bassNotes = [
  { pitch: 36, start: 0, dur: 1 }, { pitch: 36, start: 1, dur: 1 },
  { pitch: 43, start: 2, dur: 1 }, { pitch: 41, start: 3, dur: 1 },
];
const chords = [
  { root: 0, quality: '', start: 0, dur: 4 },
  { root: 9, quality: 'm', start: 4, dur: 4 },
  { root: 5, quality: '', start: 8, dur: 4 },
  { root: 7, quality: '', start: 12, dur: 4 },
];
const rhythm = {
  steps: 16,
  lanes: [
    { name: 'Kick', midi: 36, hits: [0, 4, 8, 12] },
    { name: 'Snare', midi: 38, hits: [4, 12] },
    { name: 'HiHat', midi: 42, hits: [0, 2, 4, 6, 8, 10, 12, 14] },
    { name: 'OpenHat', midi: 46, hits: [] },
    { name: 'Clap', midi: 39, hits: [] },
    { name: 'Tom', midi: 45, hits: [] },
  ],
};
const relBass = {
  mode: 'relative', steps: 16,
  pattern: [
    { step: 0, degree: 'R', dur: 2 }, { step: 2, degree: '5', dur: 2 },
    { step: 4, degree: 'R', dur: 2 }, { step: 6, degree: '3', dur: 2 },
    { step: 8, degree: 'R', dur: 2 }, { step: 12, degree: '5', dur: 2 },
  ],
  preview_chords: chords,
};
const chordPat = {
  mode: 'strum',
  voicing: { tones: ['R', '3', '5'], openClose: 'close', octave: 0 },
  steps: 16,
  hits: [{ step: 0, dur: 4 }, { step: 4, dur: 4 }, { step: 8, dur: 4 }, { step: 12, dur: 4 }],
};

// title -> 出力ファイル名（拡張子なし）。bass は同じ kind=bass を絶対/相対の2モードで撮る。
const NETAS = [
  { title: 'UI-melody', kind: 'melody', content: { notes: melodyNotes }, key: 0, mode: 'major', tempo: 120, bars: 2 },
  { title: 'UI-chordprog', kind: 'chord_progression', content: { chords }, key: 0, mode: 'major', tempo: 120 },
  { title: 'UI-bass', kind: 'bass', content: { notes: bassNotes }, key: 0, mode: 'major', tempo: 120, bars: 1 },
  { title: 'UI-bass-rel', kind: 'bass', content: relBass, key: 0, mode: 'major', tempo: 120, bars: 1 },
  { title: 'UI-rhythm', kind: 'rhythm', content: { rhythm }, tempo: 120 },
  { title: 'UI-chordpattern', kind: 'chord_pattern', content: chordPat, key: 0, mode: 'major', tempo: 120 },
  { title: 'UI-lyric', kind: 'lyric', text: 'あの日見た空の青さを\nわたしはまだ覚えている', mood: '切ない' },
  { title: 'UI-text', kind: 'theme', text: 'テーマ：夏の終わりの郷愁。疾走感のあるバンドサウンドで。', mood: '疾走' },
  { title: 'UI-section', kind: 'section', key: 0, mode: 'major', tempo: 120, meter: '4/4', bars: 4 },
];

// 撮影対象（title -> file）。bass-rel は開いた後に「相対」トグルを押す。
const SHOTS = [
  ['UI-melody', 'melody', null],
  ['UI-chordprog', 'chord_progression', null],
  ['UI-bass', 'bass-absolute', null],
  ['UI-bass-rel', 'bass-relative', 'relative'],
  ['UI-rhythm', 'rhythm', null],
  ['UI-chordpattern', 'chord_pattern', null],
  ['UI-lyric', 'lyric', null],
  ['UI-text', 'text', null],
  ['UI-section', 'section', null],
];

async function openByTitle(page, title) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await sleep(800);
  await page.getByText(title, { exact: false }).first().click();
  await page.getByLabel('edit-neta').waitFor({ timeout: 8000 });
  await sleep(900); // エディタ本体（ピアノロール/レーン等）描画待ち
}

(async () => {
  // 1) ネタを API で作る
  log('=== seeding netas via API ===');
  for (const n of NETAS) {
    try { const r = await createNeta(n); log('seeded', n.title, '->', r.id); }
    catch (e) { log('SEED FAIL', n.title, e.message); }
  }

  // 2) モバイル文脈で撮影
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => log('PAGE EXC:', String(e).slice(0, 200)));

  const results = [];

  // トップ画面（ネタ帳レール／ヘッダ）
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await sleep(1200);
    await page.screenshot({ path: `${OUT}/top.png` });
    log('OK top'); results.push(['top', 'ok']);
  } catch (e) { log('FAIL top', e.message); results.push(['top', 'FAIL:' + e.message]); }

  for (const [title, fname, toggle] of SHOTS) {
    try {
      await openByTitle(page, title);
      if (toggle === 'relative') {
        await page.getByRole('button', { name: '相対', exact: true }).click().catch(e => log('toggle rel:', e.message));
        await sleep(700);
      }
      await page.screenshot({ path: `${OUT}/${fname}.png` });
      log('OK', fname); results.push([fname, 'ok']);
    } catch (e) {
      log('FAIL', fname, e.message); results.push([fname, 'FAIL:' + e.message]);
    }
  }

  log('=== SUMMARY ===');
  for (const [f, s] of results) log(f, '->', s);
  await browser.close();
})();
