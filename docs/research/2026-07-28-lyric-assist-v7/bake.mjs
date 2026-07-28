#!/usr/bin/env node
/* bake.mjs — v7 の全表示データを 1 つに焼く生成器。
 *
 * 実行: node bake.mjs   （このディレクトリで）
 * - ここに書いた曲構造（唯一の原本）に、全ダミー歌詞・全候補語を
 *   apps/audio/accent.py（pyopenjtalk）へ通した結果（HL列・アクセント句）を焼き込み、
 *   data.js を出力する。アクセントを記憶で書かない＝正誤はこれを再実行して確かめる。
 * - 入出力の記録を accent-log.json に残す（後続の検証が突き合わせる）。
 * - メロ候補の音符列も、焼き込んだ HL から機械生成する（手で音を並べない）。
 *
 * data.js を直接編集しないこと。表示データを増減するときは必ずこのファイルを
 * 変えて再実行する（工程1の各エージェントは自作せず工程0担当へ依頼）。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = "/home/shuraba_p/projects/creative_manager/apps/audio";
const PY = path.join(AUDIO_DIR, ".venv/bin/python");
const require = createRequire(import.meta.url);
const MARKS = require(path.join(DIR, "marks.js"));

/* ---------- モーラ分割（かな表記の区切りのみ。高低は accent.py の出力だけを使う） ---------- */
const SMALL = "ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ";
function splitMora(s) {
  const out = [];
  for (const ch of s.replace(/[\s　]/g, "")) {
    if (SMALL.includes(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

const N = (x, w, y) => ({ x, w, y });
/* feed = accent.py に渡す表記（漢字）。表示は words（かな）のまま。
 * かな直入力だと pyopenjtalk の形態素解釈が乱れる語があるため（例:「あさおきて」が
 * あ|さ|おきて に割れる・「あめ」が飴になる・「にわへ」が に|わへ に割れる）、
 * 意図した語のアクセントを取るのに漢字表記で読ませる。両者のモーラ数一致は必ず検証する。 */
function ph(id, bars, words, notes, extra) {
  return Object.assign({ kind: "phrase", id, bars, words, notes: notes || null }, extra || {});
}
function zone(id, bars, extra) {
  return Object.assign({ kind: "zone", id, bars }, extra || {});
}

/* ================================================================
 * 曲構造の原本。
 * - 小節番号は前奏を勘定に入れて 1 から通す（重なり・欠番なし）。
 * - notes: {x,w,y} … x=リズム位置・w=音の長さ（0..256 のグリッド）・y=相対音高（上が小さい）。
 * - words: 表示語の区切り。通し表示は words を「　」で結んで作る（別書き禁止）。
 * - モーラ→音符の対応は「モーラ i ↔ 音符 i」の恒等対応（明示上書きは noteOf で可・現状不使用）。
 *   歌詞のモーラ数より音符が多ければ余りは自動的に「空きの枠」、少なければ余りのモーラは
 *   メロ未定の文字（band とともに使う）。
 * - noLyric: true = 意図して詞を付けない範囲（横棒表示）。
 * - plan: 予定（メモ・小節数・音数・読みの高低 すべて任意）。id を持つ。
 * - melody に {ref:"句id"} を書くと音符列をその句から借りる（同じメロ・二重記述の禁止）。
 * ================================================================ */
const songs = {
  A: {
    id: "A", title: "サンプル曲（サンプルEP）",
    sections: [
      { id: "A-intro", name: "前奏", bars: [1, 4], noSing: true, units: [] },
      { id: "A-1A", name: "1番Aメロ", bars: [5, 12], units: [
        ph("A-1A-k1", [5, 6], ["あさおきて", "まどをあける"],
          [N(0,14,8),N(16,14,12),N(32,14,13),N(48,14,9),N(64,30,13),N(144,14,9),N(160,14,13),N(176,14,14),N(192,14,14),N(208,20,10),N(232,22,11)],
          { feed: "朝起きて　窓を開ける" }),
        ph("A-1A-k2", [7, 8], ["みずをのんでから"],
          [N(0,14,14),N(16,14,10),N(32,14,12),N(48,14,7),N(64,14,9),N(80,14,5),N(96,14,8),N(112,14,11),N(128,30,8),N(160,30,11),N(192,62,14)],
          { feed: "水を飲んでから", imi: "でかける前のようす。急がない感じ" }),
        ph("A-1A-k3", [9, 10], ["かぎをかけて", "そとにでる"],
          [N(0,14,13),N(16,14,9),N(32,14,11),N(48,14,12),N(64,30,8),N(96,34,11)],
          { feed: "鍵をかけて　外に出る", band: [[0, 132]] }),
        ph("A-1A-k4", [11, 12], ["バスをまって"],
          [N(0,14,14),N(16,14,10),N(32,14,7),N(48,14,10),N(64,14,8),N(80,38,12)],
          { feed: "バスを待って", band: [[0, 120]], plan: { id: "A-1A-k4-p1", memo: "あと5音くらい" } }),
      ]},
      { id: "A-1B", name: "1番Bメロ", bars: [13, 20], units: [
        ph("A-1B-k1", [13, 14], ["ふくをたたんで", "たなにいれる"],
          [N(0,14,16),N(16,14,12),N(32,14,9),N(48,14,11),N(64,14,7),N(80,14,5),N(96,14,8),N(112,14,6),N(128,14,10),N(144,14,13),N(160,30,11),N(192,30,9),N(224,30,12)],
          { feed: "服をたたんで　棚に入れる" }),
        ph("A-1B-k2", [15, 16], null,
          [N(0,30,13),N(32,30,9),N(64,30,11),N(96,30,6),N(128,30,8),N(160,30,5),N(192,30,9),N(224,30,12)]),
        zone("A-1B-z1", [17, 20]),
      ]},
      { id: "A-1S", name: "1番サビ", bars: [21, 28], units: [
        ph("A-1S-k1", [21, 22], ["きょうのよていを", "かみにかく"],
          [N(0,30,12),N(32,14,15),N(48,14,15),N(64,14,13),N(80,14,9),N(96,14,9),N(112,14,11),N(128,14,11),N(144,14,7),N(160,30,10),N(192,30,5),N(224,30,9)],
          { feed: "今日の予定を　紙に書く" }),
        ph("A-1S-k2", [23, 24], ["まどのそと", "みちがみえる"], null, { feed: "窓の外　道が見える" }),
        ph("A-1S-k3", [25, 26], null,
          [N(0,30,12),N(32,30,8),N(64,30,10),N(96,30,5),N(128,30,7),N(160,30,4),N(192,30,8),N(224,30,11)],
          { noLyric: true }),
        ph("A-1S-k4", [27, 28], null, null,
          { plan: { id: "A-1S-k4-p1", memo: "しめの一言", onsu: "8音くらい" } }),
      ]},
      { id: "A-2A", name: "2番Aメロ", bars: [29, 36], sameMelodyAs: "A-1A", units: [
        ph("A-2A-k1", [29, 30], ["よるがきて", "まどをしめる"], { ref: "A-1A-k1" }, { feed: "夜が来て　窓を閉める", sameAs: "A-1A-k1" }),
        ph("A-2A-k2", [31, 32], null, { ref: "A-1A-k2" }, { sameAs: "A-1A-k2" }),
        ph("A-2A-k3", [33, 34], null, { ref: "A-1A-k3" }, { sameAs: "A-1A-k3" }),
        ph("A-2A-k4", [35, 36], null, { ref: "A-1A-k4" }, { sameAs: "A-1A-k4" }),
      ]},
      { id: "A-2B", name: "2番Bメロ", bars: [37, 44], sameMelodyAs: "A-1B", units: [
        ph("A-2B-k1", [37, 38], null, { ref: "A-1B-k1" }, { sameAs: "A-1B-k1" }),
        ph("A-2B-k2", [39, 40], null, { ref: "A-1B-k2" }, { sameAs: "A-1B-k2" }),
        zone("A-2B-z1", [41, 44]),
      ]},
      { id: "A-2S", name: "2番サビ", bars: [45, 52], units: [
        ph("A-2S-k1", [45, 46], ["でんきをけして", "へやをでる"], null, { feed: "電気を消して　部屋を出る" }),
        ph("A-2S-k2", [47, 48], ["かさをもって"], null,
          { feed: "傘を持って", plan: { id: "A-2S-k2-p1", memo: "あと6音くらい" } }),
        ph("A-2S-k3", [49, 52], ["ドアをしめて", "かぎをかける"], null, { feed: "ドアを閉めて　鍵をかける" }),
      ]},
      { id: "A-C", name: "Cメロ", bars: [53, 60], units: [
        ph("A-C-k1", [53, 54], ["テレビをけして", "おちゃをのむ"], null, { feed: "テレビを消して　お茶を飲む" }),
        ph("A-C-k2", [55, 56], ["ざっしをとじて", "めをとじる"], null,
          { feed: "雑誌を閉じて　目を閉じる", imi: "ひと息ついて休む場面" }),
        ph("A-C-k3", [57, 60], ["とけいのはりを", "ながめてる"], null, { feed: "時計の針を　眺めてる" }),
      ]},
      { id: "A-D", name: "Dメロ", bars: [61, 72], units: [
        ph("A-D-k1", [61, 62], ["くつをそろえて", "げんかんへ"],
          [N(0,14,14),N(16,14,10),N(32,14,12),N(48,14,13),N(64,14,9),N(80,14,9),N(96,14,12),N(112,14,9),N(128,30,13),N(160,30,14),N(192,30,14),N(224,30,15)],
          { feed: "靴をそろえて　玄関へ" }),
        ph("A-D-k2", [63, 64], ["ポストのてがみを", "とりにいく"],
          [N(0,14,10),N(16,14,14),N(32,14,14),N(48,14,15),N(64,14,14),N(80,14,10),N(96,14,10),N(112,14,9),N(128,14,13),N(144,14,9),N(160,30,12),N(192,30,14),N(224,30,10)],
          { feed: "ポストの手紙を　取りに行く" }),
        ph("A-D-k3", [65, 66], null,
          [N(0,30,15),N(32,30,11),N(64,30,8),N(96,30,10),N(128,30,6),N(160,30,9),N(192,30,7),N(224,30,11)]),
        ph("A-D-k4", [67, 68], null,
          [N(0,30,12),N(32,30,8),N(64,14,10),N(80,14,5),N(96,30,7),N(128,30,4),N(160,14,8),N(176,30,11),N(208,46,13)]),
        ph("A-D-k5", [69, 70], ["シャツのボタンを", "とめなおす"], null, { feed: "シャツのボタンを　留め直す" }),
        ph("A-D-k6", [71, 72], ["メモをたたんで", "ポケットへ"], null, { feed: "メモをたたんで　ポケットへ" }),
      ]},
      { id: "A-kan2", name: "間奏2", bars: [73, 76], noSing: true, units: [] },
      { id: "A-oosabi", name: "大サビ", kari: true, barsText: "8小節くらい", units: [
        zone("A-oosabi-z1", null, { plan: { id: "A-oosabi-p1", memo: "しずかめに", onsu: "8音×2くらい" } }),
      ]},
      { id: "A-outro", name: "アウトロ", kari: true, barsText: "小節数未定", units: [
        zone("A-outro-z1", null),
      ]},
    ],
    stock: [
      { id: "A-st1", words: ["ゆうがたのみちをあるく"], feed: "夕方の道を歩く", place: "未定", w: 294,
        notes: [N(0,26,14),N(28,26,10),N(56,14,10),N(72,14,9),N(88,26,10),N(116,26,13),N(144,14,9),N(160,26,9),N(188,26,14),N(216,26,10),N(244,40,12)] },
    ],
  },
  B: {
    id: "B", title: "サンプル曲B（サンプルEP）",
    sections: [
      { id: "B-A", name: "Aメロ", bars: [1, 8], units: [
        ph("B-A-k1", [1, 4], null,
          [N(0,30,15),N(32,30,11),N(64,14,8),N(80,14,10),N(96,30,6),N(128,30,9),N(160,14,7),N(176,30,11),N(208,46,14)]),
        ph("B-A-k2", [5, 8], null,
          [N(0,30,14),N(32,30,10),N(64,30,12),N(96,30,7),N(128,30,9),N(160,30,6),N(192,30,10),N(224,30,13)]),
      ]},
      { id: "B-S", name: "サビ", bars: [9, 16], units: [
        ph("B-S-k1", [9, 16], null,
          [N(0,30,16),N(32,30,11),N(64,30,7),N(96,30,9),N(128,30,5),N(160,30,8),N(192,30,6),N(224,30,10)]),
      ]},
    ],
    stock: [],
  },
  C: {
    id: "C", title: "サンプル曲C（サンプルEP）",
    sections: [
      { id: "C-A", name: "Aメロ", bars: null, barsText: "当てなし", units: [
        ph("C-A-k1", null, ["あめのひは", "かさをさして"], null, { feed: "雨の日は　傘をさして" }),
        ph("C-A-k2", null, ["えきまでの", "みちをあるく"], null, { feed: "駅までの　道を歩く" }),
      ]},
      { id: "C-S", name: "サビ", bars: null, barsText: "当てなし", units: [
        ph("C-S-k1", null, ["しんごうが", "あおにかわる"], null, { feed: "信号が　青に変わる" }),
        ph("C-S-k2", null, ["ふみきりの", "おとがきこえる"], null, { feed: "踏切の　音が聞こえる" }),
      ]},
    ],
    stock: [],
  },
  D: {
    id: "D", title: "サンプル曲D（サンプルEP）",
    sections: [],
    stock: [
      { id: "D-st1", words: ["まちのあかりがともるころ"], feed: "街の明かりが灯る頃", place: "未定", w: 294,
        notes: [N(0,24,14),N(26,24,10),N(52,14,13),N(68,24,14),N(94,24,10),N(120,14,10),N(136,24,9),N(162,24,13),N(188,14,9),N(204,24,12),N(230,24,9),N(256,28,13)] },
    ],
  },
};

/* 詞候補（宛先＝A-1A-k2 の空き3音）。バッジは表示時に marks.js が機械生成する（焼かない）。 */
const lyrCands = [
  { id: "A-1A-k2-lc1", word: "そとへ", feed: "外へ", target: "A-1A-k2" },
  { id: "A-1A-k2-lc2", word: "えきまで", feed: "駅まで", target: "A-1A-k2" },
  { id: "A-1A-k2-lc3", word: "まちへ", feed: "街へ", target: "A-1A-k2" },
  { id: "A-1A-k2-lc4", word: "にわへ", feed: "庭へ", target: "A-1A-k2" },
];

/* 通しの面の操作の割当（制作計画§3と同一の文面。枚1の注記と遷移図はこの文字列を
   そのまま使うこと＝検証が文字列照合する）。 */
const opsTableText = [
  "①詞テキストをタップ＝その場にカーソル・直接編集。",
  "②空きの枠をタップ＝その場の小フォーム（打つ／候補を探す／編集画面で開く）。",
  "③音符矩形（メロの帯）をタップ＝その句を範囲の編集画面で開く（1手）。",
  "④長押し（どこでも）＝範囲選択開始→端をのばす→「開く」で範囲の編集画面。",
  "⑤戻る＝通しの面の同じスクロール位置・同じ表示切替に戻る。",
].join("\n");

/* ================================================================
 * accent.py 実行
 * ================================================================ */
function collectAccentTargets() {
  const targets = []; // {key, text=accent.pyへ渡す表記, kana=表示かな, obj}
  for (const k of Object.keys(songs)) {
    const sg = songs[k];
    for (const sec of sg.sections) for (const u of sec.units) {
      if (u.kind === "phrase" && u.words) {
        targets.push({ key: u.id, text: u.feed || u.words.join("　"), kana: u.words.join("　"), obj: u });
      }
    }
    for (const st of sg.stock || []) {
      targets.push({ key: st.id, text: st.feed || st.words.join("　"), kana: st.words.join("　"), obj: st });
    }
  }
  for (const c of lyrCands) targets.push({ key: c.id, text: c.feed || c.word, kana: c.word, obj: c });
  return targets;
}

function runAccent(texts) {
  const r = spawnSync(PY, ["accent.py"], {
    cwd: AUDIO_DIR, input: texts.join("\n"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error("accent.py 失敗: " + r.stderr);
  }
  return JSON.parse(r.stdout);
}

/* accent.py の trans（"|"=句末）からモーラごとのアクセント句idを導く */
function apFromTrans(trans) {
  const ap = [];
  let cur = 0;
  for (let i = 0; i < trans.length; i++) {
    ap.push(cur);
    if (trans[i] === "|") cur++;
  }
  return ap;
}

/* ================================================================
 * メロ候補の機械生成（宛先句の焼き込みHLから作る。手で音を並べない）
 * variant 1: 読みに沿う（逆行0を狙う）
 * variant 2: variant1 の「読みが変化する最初の対」を逆向きに倒す（逆行の実例）
 * variant 3: variant1 の末尾1音を落とす（音が足りない実例）
 * ================================================================ */
function genMelCandNotes(hl, ap, variant) {
  const n = hl.length;
  // リズム: 前半 step16/w14、後半（2語目相当）step16→30。12モーラ前提だが一般化しておく。
  const xs = [], ws = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const last3 = i >= n - 3;
    const w = last3 ? 30 : 14;
    // 語間の切れ目（アクセント句の切れ目）で1拍あける
    if (i > 0 && ap[i] !== ap[i - 1] && ap[i - 1] === 0 && x < 128) x = Math.max(x, 128);
    xs.push(x); ws.push(w);
    x += last3 ? 32 : 16;
  }
  const clamp = (y) => Math.max(2, Math.min(18, y));
  const ys = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { ys.push(hl[0] ? 9 : 14); continue; }
    if (ap[i] !== ap[i - 1]) { ys.push(clamp(hl[i] ? 9 : 13)); continue; } // 句切れ＝中庸へ戻す
    const d = hl[i] - hl[i - 1];
    if (d > 0) ys.push(clamp(ys[i - 1] - 4));
    else if (d < 0) ys.push(clamp(ys[i - 1] + 4));
    else ys.push(ys[i - 1]); // 平らな対はメロも平ら（大きく動かさない）
  }
  if (variant === 2) {
    // 読みが変化する最初の同一句内の対を、逆向きに倒す
    for (let i = 1; i < n; i++) {
      if (ap[i] !== ap[i - 1]) continue;
      const d = hl[i] - hl[i - 1];
      if (d !== 0) {
        ys[i] = clamp(ys[i - 1] + (d > 0 ? 4 : -4)); // 読みと逆へ
        // 以降は倒した位置から読みに沿って引き直す
        for (let j = i + 1; j < n; j++) {
          if (ap[j] !== ap[j - 1]) { ys[j] = clamp(hl[j] ? 9 : 13); continue; }
          const dj = hl[j] - hl[j - 1];
          ys[j] = dj > 0 ? clamp(ys[j - 1] - 4) : dj < 0 ? clamp(ys[j - 1] + 4) : ys[j - 1];
        }
        break;
      }
    }
  }
  let notes = xs.map((xx, i) => N(xx, ws[i], ys[i]));
  if (variant === 3) notes = notes.slice(0, n - 1);
  return notes;
}

/* ================================================================
 * 実行
 * ================================================================ */
const targets = collectAccentTargets();
const texts = targets.map((t) => t.text);
const results = runAccent(texts);
if (results.length !== targets.length) {
  throw new Error(`accent.py の出力数が合わない: in=${targets.length} out=${results.length}`);
}

const log = [];
const problems = [];
for (let i = 0; i < targets.length; i++) {
  const t = targets[i], r = results[i];
  if (r.error) { problems.push(`${t.key}: accent.py error: ${r.error}`); continue; }
  const kana = splitMora(t.kana);
  if (kana.length !== r.mora_total) {
    problems.push(`${t.key}: モーラ数不一致 表示かな分割=${kana.length} accent.py=${r.mora_total} (feed=${t.text})`);
  }
  const ap = apFromTrans(r.trans);
  t.obj.accent = {
    src: t.text,           // accent.py に渡した文字列そのまま（漢字表記=読み取り用）
    moras: kana,           // 表示かなのモーラ列（分割はこちら・数は accent.py と一致検証済み）
    hl: r.hl,              // 0=低 / 1=高 … accent.py の出力そのまま
    ap: ap,                // モーラごとのアクセント句id … accent.py の trans から導出
    phrases: r.phrases,    // アクセント句ごとの {moras, kernel} … accent.py の出力そのまま
    tool: "apps/audio/accent.py (pyopenjtalk)",
  };
  log.push({ key: t.key, input: t.text, output: { moras: r.moras, hl: r.hl, trans: r.trans, phrases: r.phrases, mora_total: r.mora_total } });
}
if (problems.length) {
  console.error("焼き込み失敗:\n" + problems.join("\n"));
  process.exit(1);
}

/* メロ候補（宛先=A-C-k2）を焼き込んだHLから生成 */
const melTarget = songs.A.sections.find((s) => s.id === "A-C").units.find((u) => u.id === "A-C-k2");
const melCands = [1, 2, 3].map((v) => ({
  id: `A-C-k2-mc${v}`,
  target: "A-C-k2",
  genNote: v === 1 ? "読みの高低に沿わせて生成" : v === 2 ? "読みが変化する最初の対を逆向きに倒して生成" : "読みに沿わせた列の末尾1音を落として生成",
  notes: genMelCandNotes(melTarget.accent.hl, melTarget.accent.ap, v),
}));

/* 参照の例（実在するidだけを指す。枚6の孤立の例＝大サビ（仮）の予定） */
const refs = {
  isolationExample: "A-oosabi-p1",  // 孤立（前後とも何も無い）の対象の例
  lyrCandTarget: "A-1A-k2",         // 詞候補の宛先の例
  melCandTarget: "A-C-k2",          // メロ候補の宛先の例
};

/* ================================================================
 * 出力
 * ================================================================ */
const dataObj = {
  meta: {
    generatedBy: "bake.mjs",
    generatedAt: new Date().toISOString(),
    accentTool: "apps/audio/accent.py (pyopenjtalk)",
    accentLog: "accent-log.json",
    note: "このファイルは自動生成。手で編集せず bake.mjs を変えて再実行すること。",
  },
  opsTableText,
  songs,
  lyrCands,
  melCands,
  refs,
};

const footer = `
/* ---- 索引と参照の検証（読み込み時に必ず走る。壊れた参照は即例外） ---- */
var P = {}, S = {}, PL = {}, CD = {};
function dup(id) { throw new Error("id重複: " + id); }
Object.keys(V7DATA.songs).forEach(function (k) {
  var sg = V7DATA.songs[k];
  (sg.sections || []).forEach(function (sec) {
    if (S[sec.id]) dup(sec.id); S[sec.id] = sec; sec.song = k;
    (sec.units || []).forEach(function (u) {
      if (P[u.id]) dup(u.id); P[u.id] = u; u.section = sec.id; u.song = k;
      if (u.plan) { if (PL[u.plan.id]) dup(u.plan.id); PL[u.plan.id] = u.plan; u.plan.owner = u.id; }
    });
  });
  (sg.stock || []).forEach(function (st) {
    if (P[st.id]) dup(st.id); P[st.id] = st; st.song = k; st.kind = "stock";
  });
});
function mustPhrase(id, where) { if (!P[id]) throw new Error(where + " が存在しない句を指す: " + id); }
function mustSection(id, where) { if (!S[id]) throw new Error(where + " が存在しないセクションを指す: " + id); }
Object.keys(S).forEach(function (id) { if (S[id].sameMelodyAs) mustSection(S[id].sameMelodyAs, id + ".sameMelodyAs"); });
Object.keys(P).forEach(function (id) {
  var u = P[id];
  if (u.sameAs) mustPhrase(u.sameAs, id + ".sameAs");
  if (u.notes && !Array.isArray(u.notes) && u.notes.ref) mustPhrase(u.notes.ref, id + ".notes.ref");
});
V7DATA.lyrCands.forEach(function (c) { if (CD[c.id]) dup(c.id); CD[c.id] = c; mustPhrase(c.target, c.id + ".target"); });
V7DATA.melCands.forEach(function (c) { if (CD[c.id]) dup(c.id); CD[c.id] = c; mustPhrase(c.target, c.id + ".target"); });
if (!PL[V7DATA.refs.isolationExample]) throw new Error("refs.isolationExample が存在しない予定を指す: " + V7DATA.refs.isolationExample);
mustPhrase(V7DATA.refs.lyrCandTarget, "refs.lyrCandTarget");
mustPhrase(V7DATA.refs.melCandTarget, "refs.melCandTarget");
V7DATA.phraseById = P;      // 句・stock（id → 実体）
V7DATA.sectionById = S;     // セクション
V7DATA.planById = PL;       // 予定
V7DATA.candById = CD;       // 詞候補・メロ候補
`;

const header = `/* data.js — v7 全表示データの単一定義（自動生成。手で編集しない＝ bake.mjs を変えて再実行）。
 *
 * 構造:
 *   V7DATA.songs.{A,B,C,D} … 曲。A=長い斑の主サンプル・B=メロだけ・C=詞だけ・D=断片だけ。
 *   song.sections[] … {id,name,bars:[始,終]|null,barsText?,kari?,noSing?,sameMelodyAs?,units[]}
 *     小節番号は前奏を勘定に入れて 1 から通す。仮セクションは bars を持たず barsText。
 *   units[] … kind:"phrase"（句）| "zone"（まだ何も無い区間）。
 *   句 … {id,bars,words|null,notes|{ref:句id}|null,band?,noLyric?,plan?,imi?,sameAs?,accent?}
 *     words: 表示語の区切り（通し表示は「　」結合で導出）。notes: {x,w,y}（x,w=0..256グリッド・
 *     y=相対音高で上が小さい）。モーラ i ↔ 音符 i の恒等対応。モーラ数<音符数の余りが空きの枠、
 *     モーラ数>音符数の余りがメロ未定の文字。{ref:} は同じメロの借用（二重記述禁止）。
 *   accent … {src,moras,hl,ap,phrases,tool} = accent.py（pyopenjtalk）の焼き込み。
 *     hl: 0=低/1=高。ap: モーラごとのアクセント句id。記憶で書いた高低は存在しない。
 *   lyrCands / melCands … 候補。{id,target=句id,...}。バッジ・印は表示時に marks.js が機械生成。
 *   refs … 枚が参照する実在の例（孤立の対象など）。
 *   opsTableText … 通しの面の操作の割当（枚1注記と遷移図はこの文字列をそのまま使う）。
 *   索引: phraseById / sectionById / planById / candById（読み込み時に参照検証つきで構築）。
 */
`;

fs.writeFileSync(path.join(DIR, "data.js"),
  header +
  '(function (g) {\n"use strict";\nvar V7DATA = ' +
  JSON.stringify(dataObj, null, 1) +
  ";\n" + footer +
  '\ng.V7DATA = V7DATA;\nif (typeof module !== "undefined" && module.exports) module.exports = V7DATA;\n})(typeof window !== "undefined" ? window : globalThis);\n');

fs.writeFileSync(path.join(DIR, "accent-log.json"), JSON.stringify({
  command: `${PY} accent.py  (cwd=${AUDIO_DIR}, stdin=1行1文)`,
  ranAt: new Date().toISOString(),
  entries: log,
}, null, 1));

/* ---- 焼き上がりの確認レポート（印の付き方の実態を出す。データには焼かない） ---- */
const req2 = createRequire(import.meta.url);
delete req2.cache[path.join(DIR, "data.js")];
const D = req2(path.join(DIR, "data.js"));
console.log("data.js / accent-log.json 出力完了。accent.py 実行:", targets.length, "文");
console.log("\n--- 印の実態（案ごとの件数。全て marks.js から導出） ---");
for (const id of Object.keys(D.phraseById)) {
  const u = D.phraseById[id];
  if (!u.accent || !u.notes || u.notes.ref) continue;
  const notes = Array.isArray(u.notes) ? u.notes : null;
  if (!notes) continue;
  const ys = u.accent.moras.map((_, i) => (i < notes.length ? notes[i].y : null));
  for (const fp of ["ア", "イ"]) for (const yu of ["A", "B"]) {
    const mk = MARKS.computeMarks(u.accent.hl, u.accent.ap, ys, { flatPair: fp, yellowUse: yu });
    if (mk.length && fp === "ア" && yu === "B") {
      console.log(` ${id} [ア,B]:`, mk.map((m) => `${u.accent.moras[m.i]}=${m.color}`).join(" "));
    }
    if (mk.length && fp === "イ" && yu === "A") {
      console.log(` ${id} [イ,A]:`, mk.map((m) => `${u.accent.moras[m.i]}=${m.color}`).join(" "));
    }
  }
}
console.log("\n--- 候補バッジの実態 ---");
{
  const tgt = D.phraseById[D.refs.lyrCandTarget];
  const slotYs = tgt.notes.slice(tgt.accent.moras.length).map((n) => n.y);
  for (const c of D.lyrCands) {
    console.log(` ${c.id} ${c.word}:`, MARKS.lyricCandBadges(c, slotYs, MARKS.DEFAULT_OPTS).map((b) => b.t).join(" / "));
  }
  const mt = D.phraseById[D.refs.melCandTarget];
  for (const c of D.melCands) {
    console.log(` ${c.id}:`, MARKS.melodyCandBadges(c.notes, mt.accent, MARKS.DEFAULT_OPTS).map((b) => b.t).join(" / "));
  }
}
