#!/usr/bin/env node
/* bake.mjs — v8 の全表示データを 1 つに焼く生成器。
 *
 * 実行: node bake.mjs   （このディレクトリで）
 *
 * v8 の要点（計画§1・§7）:
 * - 歌詞は2層。原本＝表記 `hyoki`（漢字仮名交じり。かなで書きたい句はかな＝それも表記）。
 *   読み（モーラ・高低・句切れ）は accent.py（pyopenjtalk）が feed = yomiSrc || hyoki から導く。
 *   `yomiSrc`＝読み取り用の表記（任意）。機械が読みを取り違える句にだけ人が添える。
 * - `spans`＝語（pyopenjtalk の形態素）単位の「表記の区間↔モーラ区間」対応。
 *   pyopenjtalk.run_frontend（frontend.py 経由）の {string, read, mora_size} から機械生成する。
 * - モーラ行のかなは read（カナ読み）をモーラ分割して得る（表層がカタカナ語なら
 *   カタカナのまま・それ以外はひらがな化）。accent.py のローマ字から逆変換しない。
 * - bake の検査3つ（違反した句は焼けずエラーで止まる）:
 *     (a) Σmora_size == accent.py の mora_total
 *     (b) 各形態素で read のモーラ分割数 == mora_size
 *     (c) 形態素の表層連結 == feed（正規化の罠＝計画§R-4。全角空白のみ・数字なしで満たす）
 * - `variants`＝変化後の状態を第一級で焼く（すべて実走。記憶で書かない）:
 *     候補を入れた直後 ／ 表記を直した直後 ／ 読み取り用の表記を添えた後 ／ 高低を手で直した後
 * - 実走の入出力は accent-log.json に残す（後続の検証が突き合わせる）。
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

/* ---------- モーラ分割（かな区切りのみ。高低は accent.py の出力だけを使う） ---------- */
const SMALL = "ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ";
function splitMora(s) {
  const out = [];
  for (const ch of s.replace(/[\s　]/g, "")) {
    if (SMALL.includes(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
/* カタカナ→ひらがな（ーはそのまま）。モーラ行のかなは read から作る（計画§1-2）。
 * 表層がカタカナ語（バス・シャツ等）の形態素は read をカタカナのまま使う
 * （表記との見た目の一貫のため。計画は「ひらがな化」とだけ言っており、これは工程0の
 *  小さな追加判断＝報告に明記）。 */
const KATA_RE = /^[ァ-ー]+$/;
function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const N = (x, w, y) => ({ x, w, y });
/* 句。hyoki=表記（原本・語区切りは全角空白）。yomiSrc=読み取り用の表記（任意）。
 * accent/spans は bake が feed = yomiSrc || hyoki の実走から埋める。 */
function ph(id, bars, hyoki, notes, extra) {
  return Object.assign({ kind: "phrase", id, bars, hyoki: hyoki || null, notes: notes || null }, extra || {});
}
function zone(id, bars, extra) {
  return Object.assign({ kind: "zone", id, bars }, extra || {});
}

/* ================================================================
 * 曲構造の原本。
 * - 小節番号は前奏を勘定に入れて 1 から通す（重なり・欠番なし）。
 * - notes: {x,w,y} … x=リズム位置・w=音の長さ（0..256 のグリッド）・y=相対音高（上が小さい）。
 * - hyoki: 表記（原本）。曲A・C・断片は漢字仮名交じりへ置き直し（v8・計画§1-1）。
 *   かな表記の句は C-A-k2 の1句だけ残す（枚9の材料。読み取りの誤りが実測で出る句）。
 * - モーラ→音符の対応は「モーラ i ↔ 音符 i」の恒等対応。
 *   モーラ数 < 音符数: 余り音符は空き。モーラ数 > 音符数: 余りモーラは音符なしのモーラ。
 * - noLyric: true = 意図して詞を付けない範囲。
 * - plan: 予定（メモ・小節数・音数・読みの高低 すべて任意）。
 * - notes に {ref:"句id"} で音符列を借りる（同じメロ・二重記述の禁止）。
 * - A-D-k1 の音符[6] は y=9（そろえ「て」）: 「え→て」で読みは下がるのにメロが平ら、という
 *   黄の案A/B の差が出る対（計画・差し戻し1）。読みの変化は accent.py 実走で確認済み。
 *   ダミーメロは著作データなので工程0が音符側を調整した（読みの側は一切手で書いていない）。
 * ================================================================ */
const songs = {
  A: {
    id: "A", title: "サンプル曲（サンプルEP）",
    sections: [
      { id: "A-intro", name: "前奏", bars: [1, 4], noSing: true, units: [] },
      { id: "A-1A", name: "1番Aメロ", bars: [5, 12], units: [
        ph("A-1A-k1", [5, 6], "朝起きて　窓を開ける",
          [N(0,14,8),N(16,14,12),N(32,14,13),N(48,14,9),N(64,30,13),N(144,14,9),N(160,14,13),N(176,14,14),N(192,14,14),N(208,20,10),N(232,22,11)]),
        ph("A-1A-k2", [7, 8], "水を飲んでから",
          [N(0,14,14),N(16,14,10),N(32,14,12),N(48,14,7),N(64,14,9),N(80,14,5),N(96,14,8),N(112,14,11),N(128,30,8),N(160,30,11),N(192,62,14)],
          { imi: "でかける前のようす。急がない感じ" }),
        ph("A-1A-k3", [9, 10], "鍵をかけて　外に出る",
          [N(0,14,13),N(16,14,9),N(32,14,11),N(48,14,12),N(64,30,8),N(96,34,11)],
          { band: [[0, 132]] }),
        ph("A-1A-k4", [11, 12], "バスを待って",
          [N(0,14,14),N(16,14,10),N(32,14,7),N(48,14,10),N(64,14,8),N(80,38,12)],
          { band: [[0, 120]], plan: { id: "A-1A-k4-p1", memo: "あと5音くらい" } }),
      ]},
      { id: "A-1B", name: "1番Bメロ", bars: [13, 20], units: [
        ph("A-1B-k1", [13, 14], "服をたたんで　棚に入れる",
          [N(0,14,16),N(16,14,12),N(32,14,9),N(48,14,11),N(64,14,7),N(80,14,5),N(96,14,8),N(112,14,6),N(128,14,10),N(144,14,13),N(160,30,11),N(192,30,9),N(224,30,12)]),
        ph("A-1B-k2", [15, 16], null,
          [N(0,30,13),N(32,30,9),N(64,30,11),N(96,30,6),N(128,30,8),N(160,30,5),N(192,30,9),N(224,30,12)]),
        zone("A-1B-z1", [17, 20]),
      ]},
      { id: "A-1S", name: "1番サビ", bars: [21, 28], units: [
        ph("A-1S-k1", [21, 22], "今日の予定を　紙に書く",
          [N(0,30,12),N(32,14,15),N(48,14,15),N(64,14,13),N(80,14,9),N(96,14,9),N(112,14,11),N(128,14,11),N(144,14,7),N(160,30,10),N(192,30,5),N(224,30,9)]),
        ph("A-1S-k2", [23, 24], "窓の外　道が見える", null),
        ph("A-1S-k3", [25, 26], null,
          [N(0,30,12),N(32,30,8),N(64,30,10),N(96,30,5),N(128,30,7),N(160,30,4),N(192,30,8),N(224,30,11)],
          { noLyric: true }),
        ph("A-1S-k4", [27, 28], null, null,
          { plan: { id: "A-1S-k4-p1", memo: "しめの一言", onsu: "8音くらい" } }),
      ]},
      { id: "A-2A", name: "2番Aメロ", bars: [29, 36], sameMelodyAs: "A-1A", units: [
        ph("A-2A-k1", [29, 30], "夜が来て　窓を閉める", { ref: "A-1A-k1" }, { sameAs: "A-1A-k1" }),
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
        ph("A-2S-k1", [45, 46], "電気を消して　部屋を出る", null),
        ph("A-2S-k2", [47, 48], "傘を持って", null,
          { plan: { id: "A-2S-k2-p1", memo: "あと6音くらい" } }),
        ph("A-2S-k3", [49, 52], "ドアを閉めて　鍵をかける", null),
      ]},
      { id: "A-C", name: "Cメロ", bars: [53, 60], units: [
        ph("A-C-k1", [53, 54], "テレビを消して　お茶を飲む", null),
        ph("A-C-k2", [55, 56], "雑誌を閉じて　目を閉じる", null,
          { imi: "ひと息ついて休む場面" }),
        ph("A-C-k3", [57, 60], "時計の針を　眺めてる", null),
      ]},
      { id: "A-D", name: "Dメロ", bars: [61, 72], units: [
        ph("A-D-k1", [61, 62], "靴をそろえて　玄関へ",
          [N(0,14,14),N(16,14,10),N(32,14,12),N(48,14,13),N(64,14,9),N(80,14,9),N(96,14,9),N(112,14,9),N(128,30,13),N(160,30,14),N(192,30,14),N(224,30,15)]),
        ph("A-D-k2", [63, 64], "ポストの手紙を　取りに行く",
          [N(0,14,10),N(16,14,14),N(32,14,14),N(48,14,15),N(64,14,14),N(80,14,10),N(96,14,10),N(112,14,9),N(128,14,13),N(144,14,9),N(160,30,12),N(192,30,14),N(224,30,10)]),
        ph("A-D-k3", [65, 66], null,
          [N(0,30,15),N(32,30,11),N(64,30,8),N(96,30,10),N(128,30,6),N(160,30,9),N(192,30,7),N(224,30,11)]),
        ph("A-D-k4", [67, 68], null,
          [N(0,30,12),N(32,30,8),N(64,14,10),N(80,14,5),N(96,30,7),N(128,30,4),N(160,14,8),N(176,30,11),N(208,46,13)]),
        ph("A-D-k5", [69, 70], "シャツのボタンを　留め直す", null),
        ph("A-D-k6", [71, 72], "メモをたたんで　ポケットへ", null),
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
      { id: "A-st1", hyoki: "夕方の道を歩く", place: "未定", w: 294,
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
        ph("C-A-k1", null, "雨の日は　傘をさして", null),
        /* かな表記のまま残す1句（計画§1-1・§6枚4・枚9の材料）。
         * 実測: 「にわへ」は に|わ|へ に誤分割され読みが 高高低 になる（正: 低高高）。
         * 基本状態は yomiSrc なし＝誤読が見えている状態。直した後は variants にある。 */
        ph("C-A-k2", null, "にわへ　みずをまく", null),
      ]},
      { id: "C-S", name: "サビ", bars: null, barsText: "当てなし", units: [
        ph("C-S-k1", null, "信号が　青に変わる", null),
        ph("C-S-k2", null, "踏切の　音が聞こえる", null),
      ]},
    ],
    stock: [],
  },
  D: {
    id: "D", title: "サンプル曲D（サンプルEP）",
    sections: [],
    stock: [
      { id: "D-st1", hyoki: "街の明かりが灯る頃", place: "未定", w: 294,
        notes: [N(0,24,14),N(26,24,10),N(52,14,13),N(68,24,14),N(94,24,10),N(120,14,10),N(136,24,9),N(162,24,13),N(188,14,9),N(204,24,12),N(230,24,9),N(256,28,13)] },
    ],
  },
};

/* 詞候補（宛先＝A-1A-k2 の空き3音）。表記＋読みの2層（読みは accent/spans を bake が焼く）。
   バッジは表示時に marks.js が機械生成する（焼かない）。 */
const lyrCands = [
  { id: "A-1A-k2-lc1", hyoki: "外へ", target: "A-1A-k2" },
  { id: "A-1A-k2-lc2", hyoki: "駅まで", target: "A-1A-k2" },
  { id: "A-1A-k2-lc3", hyoki: "街へ", target: "A-1A-k2" },
  { id: "A-1A-k2-lc4", hyoki: "庭へ", target: "A-1A-k2" },
];

/* variants ＝ 変化後の状態（第一級・計画§1-5・§7）。
 * accent/spans は bake が実走で焼く。notes は base の借用（メロは変わらない）。
 * - A-1A-k2-v1: 候補「外へ」を入れた直後（枚5の「直後」）。11モーラ=音符11＝空きが消える。
 * - A-1A-k1-v1: 表記を直した直後（枚8）。11→14モーラ＝字余り3・音符なしモーラ「あ・け・る」。
 * - C-A-k2-v1: 読み取り用の表記を添えた後（枚9・案1）。読みが 高高低→低高高 に直る。
 * - C-A-k2-v2: 読みの高低を手で直した後（枚9・案2）。機械の読みのまま、モーラ0と2を
 *   タップで反転（hand.flipped）。結果の hl が C-A-k2-v1 の機械の読みと一致することを
 *   bake が検査する（手で直した値がでたらめでない証拠）。
 */
const variantDefs = [
  { id: "A-1A-k2-v1", base: "A-1A-k2", label: "候補を入れた直後", cand: "A-1A-k2-lc1",
    hyoki: "水を飲んでから　外へ" },
  { id: "A-1A-k1-v1", base: "A-1A-k1", label: "表記を直した直後",
    hyoki: "朝早く起きて　窓を開ける" },
  { id: "C-A-k2-v1", base: "C-A-k2", label: "読み取り用の表記を添えた後",
    hyoki: "にわへ　みずをまく", yomiSrc: "庭へ　みずをまく" },
  { id: "C-A-k2-v2", base: "C-A-k2", label: "高低を手で直した後",
    hyoki: "にわへ　みずをまく", hand: { flipped: [0, 2] } },
];

/* 通しの面の操作の割当①〜⑤（計画§3-5の正準文字列。ここが唯一の置き場＝
   枠外注記・枚14はこの文字列をそのまま使うこと。検証が文字列照合する）。 */
const opsTableText = [
  "①詞テキストをタップ＝その場にカーソル・直接編集。",
  "②空きの枠（帯・マス表示のとき）／「詞の空きN音」チップ（畳んでいるとき）をタップ＝その場の小フォーム（打つ／候補を探す／編集画面で開く）。",
  "③音符矩形（メロの帯）をタップ＝その句を範囲の編集画面で開く（1手）。帯を畳んでいるときは行・見出しの長押しから。",
  "④長押し（どこでも）＝範囲選択開始→端をのばす→「開く」で範囲の編集画面。",
  "⑤戻る＝通しの面の同じスクロール位置・同じ表示切替・同じパーツ選択に戻る。",
].join("\n");

/* ================================================================
 * 実行系（accent.py / frontend.py）
 * ================================================================ */
function runAccent(texts) {
  const r = spawnSync(PY, ["accent.py"], {
    cwd: AUDIO_DIR, input: texts.join("\n"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error("accent.py 失敗: " + r.stderr);
  return JSON.parse(r.stdout);
}
function runFrontend(texts) {
  const r = spawnSync(PY, [path.join(DIR, "frontend.py")], {
    cwd: DIR, input: texts.join("\n"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error("frontend.py 失敗: " + r.stderr);
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

/* ---------- spans の生成＋検査3つ（計画§1-2。違反句は焼けない） ---------- */
function buildSpans(key, feed, morphs, moraTotal, problems) {
  /* (c) 表層連結 == feed */
  const joined = morphs.map((m) => m.string).join("");
  if (joined !== feed) {
    problems.push(`${key}: [検査c] 形態素の表層連結がfeedと不一致: 「${joined}」 vs 「${feed}」`);
    return null;
  }
  /* (a) Σmora_size == mora_total */
  const sum = morphs.reduce((s, m) => s + m.mora_size, 0);
  if (sum !== moraTotal) {
    problems.push(`${key}: [検査a] Σmora_size=${sum} が accent.py の mora_total=${moraTotal} と不一致`);
    return null;
  }
  /* (b) 各形態素で read の分割数 == mora_size。同時に spans を組む
     （mora_size=0 の形態素＝全角空白などは対応から飛ばす。表層連結には含む） */
  const spans = [];
  let m0 = 0, c0 = 0, ok = true;
  for (const m of morphs) {
    const c1 = c0 + m.string.length;
    if (m.mora_size > 0) {
      const readMoras = splitMora(m.read);
      if (readMoras.length !== m.mora_size) {
        problems.push(`${key}: [検査b] 形態素「${m.string}」read=${m.read} の分割数${readMoras.length} != mora_size=${m.mora_size}`);
        ok = false;
      } else {
        const keep = KATA_RE.test(m.string);
        spans.push({
          s: m.string, read: m.read,
          kana: readMoras.map((x) => (keep ? x : kataToHira(x))),
          m0, m1: m0 + m.mora_size, c0, c1,
        });
      }
      m0 += m.mora_size;
    }
    c0 = c1;
  }
  return ok ? spans : null;
}

/* ================================================================
 * メロ候補の機械生成（宛先句の焼き込みHLから作る。手で音を並べない）— v7踏襲
 * ================================================================ */
function genMelCandNotes(hl, ap, variant) {
  const n = hl.length;
  const xs = [], ws = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const last3 = i >= n - 3;
    const w = last3 ? 30 : 14;
    if (i > 0 && ap[i] !== ap[i - 1] && ap[i - 1] === 0 && x < 128) x = Math.max(x, 128);
    xs.push(x); ws.push(w);
    x += last3 ? 32 : 16;
  }
  const clamp = (y) => Math.max(2, Math.min(18, y));
  const ys = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { ys.push(hl[0] ? 9 : 14); continue; }
    if (ap[i] !== ap[i - 1]) { ys.push(clamp(hl[i] ? 9 : 13)); continue; }
    const d = hl[i] - hl[i - 1];
    if (d > 0) ys.push(clamp(ys[i - 1] - 4));
    else if (d < 0) ys.push(clamp(ys[i - 1] + 4));
    else ys.push(ys[i - 1]);
  }
  if (variant === 2) {
    for (let i = 1; i < n; i++) {
      if (ap[i] !== ap[i - 1]) continue;
      const d = hl[i] - hl[i - 1];
      if (d !== 0) {
        ys[i] = clamp(ys[i - 1] + (d > 0 ? 4 : -4));
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
function collectTargets() {
  const targets = []; // {key, feed, obj}
  for (const k of Object.keys(songs)) {
    const sg = songs[k];
    for (const sec of sg.sections) for (const u of sec.units) {
      if (u.kind === "phrase" && u.hyoki) targets.push({ key: u.id, feed: u.yomiSrc || u.hyoki, obj: u });
    }
    for (const st of sg.stock || []) targets.push({ key: st.id, feed: st.yomiSrc || st.hyoki, obj: st });
  }
  for (const c of lyrCands) targets.push({ key: c.id, feed: c.yomiSrc || c.hyoki, obj: c });
  for (const v of variantDefs) targets.push({ key: v.id, feed: v.yomiSrc || v.hyoki, obj: v });
  return targets;
}

const targets = collectTargets();
const feeds = targets.map((t) => t.feed);
const accOut = runAccent(feeds);
const frOut = runFrontend(feeds);
if (accOut.length !== targets.length) throw new Error(`accent.py の出力数が合わない: in=${targets.length} out=${accOut.length}`);
if (frOut.length !== targets.length) throw new Error(`frontend.py の出力数が合わない: in=${targets.length} out=${frOut.length}`);

const log = [];
const problems = [];
for (let i = 0; i < targets.length; i++) {
  const t = targets[i], a = accOut[i], f = frOut[i];
  if (a.error) { problems.push(`${t.key}: accent.py error: ${a.error}`); continue; }
  if (f.error) { problems.push(`${t.key}: frontend.py error: ${f.error}`); continue; }
  const spans = buildSpans(t.key, t.feed, f.morphs, a.mora_total, problems);
  if (!spans) continue;
  const moras = spans.flatMap((sp) => sp.kana);
  if (moras.length !== a.mora_total) {
    problems.push(`${t.key}: モーラかな数=${moras.length} が mora_total=${a.mora_total} と不一致`);
    continue;
  }
  const ap = apFromTrans(a.trans);
  t.obj.accent = {
    feed: t.feed,          // accent.py / run_frontend に渡した文字列そのまま（= yomiSrc || hyoki）
    moras,                 // モーラ行のかな（read のモーラ分割・カタカナ語以外はひらがな化）
    hl: a.hl,              // 0=低 / 1=高 … accent.py の出力そのまま
    ap,                    // モーラごとのアクセント句id … accent.py の trans から導出
    phrases: a.phrases,    // アクセント句ごとの {moras, kernel} … accent.py の出力そのまま
    tool: "apps/audio/accent.py (pyopenjtalk)",
  };
  t.obj.spans = spans;     // 語（形態素）単位の 表記区間↔モーラ区間 … run_frontend の出力から
  log.push({
    key: t.key, feed: t.feed,
    accent: { moras: a.moras, hl: a.hl, trans: a.trans, phrases: a.phrases, mora_total: a.mora_total },
    frontend: f.morphs,
  });
}
if (problems.length) {
  console.error("焼き込み失敗:\n" + problems.join("\n"));
  process.exit(1);
}

/* ---------- variants の仕上げ（notes 借用・hand 上書き・実測に対する検査） ---------- */
const phraseIndex = {};
for (const k of Object.keys(songs)) {
  for (const sec of songs[k].sections) for (const u of sec.units) phraseIndex[u.id] = u;
  for (const st of songs[k].stock || []) phraseIndex[st.id] = st;
}
const fail = (m) => { console.error("焼き込み検査失敗: " + m); process.exit(1); };

for (const v of variantDefs) {
  const base = phraseIndex[v.base];
  if (!base) fail(`${v.id}: base ${v.base} が無い`);
  v.kind = "variant";
  v.notes = { ref: v.base }; // メロは base のまま（変化したのは詞の側だけ）
  if (v.hand) {
    /* 高低の手上書き: 機械の読みのまま、flipped のモーラだけ反転した hl を持つ。 */
    const hl = v.accent.hl.slice();
    for (const idx of v.hand.flipped) {
      if (idx < 0 || idx >= hl.length) fail(`${v.id}: hand.flipped の添字 ${idx} が範囲外`);
      hl[idx] = hl[idx] ? 0 : 1;
    }
    v.hand.hl = hl;
    v.hand.source = "手で直した";
  }
}
{
  /* 枚8の実例（計画§R-5）: 11→14モーラ・字余り3・音符なしモーラ「あ・け・る」 */
  const v = variantDefs.find((x) => x.id === "A-1A-k1-v1");
  const baseNotes = phraseIndex["A-1A-k1"].notes;
  if (v.accent.moras.length !== 14) fail(`A-1A-k1-v1: 14モーラのはずが ${v.accent.moras.length}`);
  if (baseNotes.length !== 11) fail(`A-1A-k1: 音符11のはずが ${baseNotes.length}`);
  const over = v.accent.moras.slice(baseNotes.length).join("・");
  if (over !== "あ・け・る") fail(`A-1A-k1-v1: 音符なしモーラが「${over}」（期待: あ・け・る）`);
}
{
  /* 枚5の実例: 候補「外へ」を入れた直後＝11モーラで音符11がちょうど埋まる */
  const v = variantDefs.find((x) => x.id === "A-1A-k2-v1");
  if (v.accent.moras.length !== phraseIndex["A-1A-k2"].notes.length)
    fail(`A-1A-k2-v1: モーラ${v.accent.moras.length} != 音符${phraseIndex["A-1A-k2"].notes.length}`);
}
{
  /* 枚9の実例（実測固定）: かな「にわへ」=高高低（誤）／読み取り用の表記で 低高高（正）。
     辞書が変わって実測が動いたらここで止まる（黙って違う絵を焼かない）。 */
  const base = phraseIndex["C-A-k2"];
  if (base.accent.hl.slice(0, 3).join("") !== "110")
    fail(`C-A-k2: 「にわへ」の読みが 高高低 でない: ${base.accent.hl.slice(0, 3).join("")}`);
  const v1 = variantDefs.find((x) => x.id === "C-A-k2-v1");
  if (v1.accent.hl.slice(0, 3).join("") !== "011")
    fail(`C-A-k2-v1: 「庭へ」の読みが 低高高 でない: ${v1.accent.hl.slice(0, 3).join("")}`);
  const v2 = variantDefs.find((x) => x.id === "C-A-k2-v2");
  if (v2.hand.hl.join("") !== v1.accent.hl.join(""))
    fail(`C-A-k2-v2: 手で直した hl ${v2.hand.hl.join("")} が 読み取り用の表記の実測 ${v1.accent.hl.join("")} と一致しない`);
}

/* ---------- 黄の案A/B の差が出る実例句（差し戻し1）＝機械で確定して焼く ----------
 * 「読みが変わるのにメロが平ら」（案A: 黄／案B: 印なし）の対を持つ句を実データから探す。
 * A-D-k1 の「え→て」（そろえて・読み高→低・音符は同じ音高）がそれ。無ければ焼けない。 */
function abDiffPairs(u) {
  const ns = Array.isArray(u.notes) ? u.notes : null;
  if (!ns || !u.accent) return [];
  const ys = u.accent.moras.map((_, i) => (i < ns.length ? ns[i].y : null));
  const A = MARKS.computeMarks(u.accent.hl, u.accent.ap, ys, { flatPair: "イ", yellowUse: "A" });
  const B = MARKS.computeMarks(u.accent.hl, u.accent.ap, ys, { flatPair: "イ", yellowUse: "B" });
  const bset = new Set(B.map((m) => m.i + ":" + m.color));
  return A.filter((m) => !bset.has(m.i + ":" + m.color))
    .map((m) => ({ i: m.i, color: m.color, moras: u.accent.moras[m.i - 1] + "→" + u.accent.moras[m.i], why: m.why }));
}
const abExamples = [];
for (const id of Object.keys(phraseIndex)) {
  const pairs = abDiffPairs(phraseIndex[id]);
  if (pairs.length) abExamples.push({ id, pairs });
}
if (!abExamples.length) fail("黄の案A/Bの差が出る句がデータに1つも無い（差し戻し1が塞げない）");
if (!abExamples.some((e) => e.id === "A-D-k1")) fail("想定した A-D-k1 に案A/B差の対が無い（メロ調整がずれた）");

/* メロ候補（宛先=A-C-k2）を焼き込んだHLから生成 */
const melTarget = phraseIndex["A-C-k2"];
const melCands = [1, 2, 3].map((v) => ({
  id: `A-C-k2-mc${v}`,
  target: "A-C-k2",
  genNote: v === 1 ? "読みの高低に沿わせて生成" : v === 2 ? "読みが変化する最初の対を逆向きに倒して生成" : "読みに沿わせた列の末尾1音を落として生成",
  notes: genMelCandNotes(melTarget.accent.hl, melTarget.accent.ap, v),
}));

/* 参照の例（実在するidだけを指す） */
const refs = {
  isolationExample: "A-oosabi-p1",   // 孤立（前後とも何も無い）の対象の例
  lyrCandTarget: "A-1A-k2",          // 詞候補の宛先の例
  melCandTarget: "A-C-k2",           // メロ候補の宛先の例
  kanaPhrase: "C-A-k2",              // かな表記のまま残した句（枚9の材料）
  yellowABExample: abExamples[0],    // 黄の案A/B差の実例句（機械で確定・{id, pairs}）
  editExample: "A-1A-k1-v1",         // 枚8: 表記を直した直後
  insertExample: "A-1A-k2-v1",       // 枚5: 候補を入れた直後
  yomiSrcExample: "C-A-k2-v1",       // 枚9案1: 読み取り用の表記を添えた後
  handHlExample: "C-A-k2-v2",        // 枚9案2: 高低を手で直した後
};

/* ================================================================
 * 出力
 * ================================================================ */
const dataObj = {
  meta: {
    generatedBy: "bake.mjs",
    generatedAt: new Date().toISOString(),
    accentTool: "apps/audio/accent.py (pyopenjtalk)",
    spansTool: "frontend.py (pyopenjtalk.run_frontend)",
    accentLog: "accent-log.json",
    note: "このファイルは自動生成。手で編集せず bake.mjs を変えて再実行すること。",
  },
  opsTableText,
  songs,
  lyrCands,
  melCands,
  variants: variantDefs,
  refs,
};

const footer = `
/* ---- 索引と参照の検証（読み込み時に必ず走る。壊れた参照は即例外） ---- */
var P = {}, S = {}, PL = {}, CD = {}, VR = {};
function dup(id) { throw new Error("id重複: " + id); }
Object.keys(V8DATA.songs).forEach(function (k) {
  var sg = V8DATA.songs[k];
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
V8DATA.lyrCands.forEach(function (c) { if (CD[c.id]) dup(c.id); CD[c.id] = c; mustPhrase(c.target, c.id + ".target"); });
V8DATA.melCands.forEach(function (c) { if (CD[c.id]) dup(c.id); CD[c.id] = c; mustPhrase(c.target, c.id + ".target"); });
V8DATA.variants.forEach(function (v) {
  if (P[v.id] || VR[v.id]) dup(v.id); VR[v.id] = v;
  mustPhrase(v.base, v.id + ".base");
  v.bars = P[v.base].bars;         /* 位置は base のもの（変化したのは詞だけ） */
  v.section = P[v.base].section; v.song = P[v.base].song;
  if (v.cand && !CD[v.cand]) throw new Error(v.id + ".cand が存在しない候補を指す: " + v.cand);
});
if (!PL[V8DATA.refs.isolationExample]) throw new Error("refs.isolationExample が存在しない予定を指す: " + V8DATA.refs.isolationExample);
mustPhrase(V8DATA.refs.lyrCandTarget, "refs.lyrCandTarget");
mustPhrase(V8DATA.refs.melCandTarget, "refs.melCandTarget");
mustPhrase(V8DATA.refs.kanaPhrase, "refs.kanaPhrase");
mustPhrase(V8DATA.refs.yellowABExample.id, "refs.yellowABExample.id");
["editExample", "insertExample", "yomiSrcExample", "handHlExample"].forEach(function (k) {
  if (!VR[V8DATA.refs[k]]) throw new Error("refs." + k + " が存在しないvariantを指す: " + V8DATA.refs[k]);
});
V8DATA.phraseById = P;      // 句・stock（id → 実体）
V8DATA.sectionById = S;     // セクション
V8DATA.planById = PL;       // 予定
V8DATA.candById = CD;       // 詞候補・メロ候補
V8DATA.variantById = VR;    // 変化後の状態
V8DATA.stateById = {};      // 句 ∪ variant（描画部品はこちらで引く）
Object.keys(P).forEach(function (id) { V8DATA.stateById[id] = P[id]; });
Object.keys(VR).forEach(function (id) { V8DATA.stateById[id] = VR[id]; });
`;

const header = `/* data.js — v8 全表示データの単一定義（自動生成。手で編集しない＝ bake.mjs を変えて再実行）。
 *
 * 構造:
 *   V8DATA.songs.{A,B,C,D} … 曲。A=長い斑の主サンプル・B=メロだけ・C=詞だけ・D=断片だけ。
 *   song.sections[] … {id,name,bars:[始,終]|null,barsText?,kari?,noSing?,sameMelodyAs?,units[]}
 *   units[] … kind:"phrase"（句）| "zone"（まだ何も無い区間）。
 *   句 … {id,bars,hyoki|null,yomiSrc?,notes|{ref:句id}|null,band?,noLyric?,plan?,imi?,sameAs?,accent?,spans?}
 *     hyoki: 表記（原本・漢字仮名交じり。かなで書く句はかな＝それも表記）。
 *     yomiSrc: 読み取り用の表記（任意）。読み（accent/spans）は feed = yomiSrc || hyoki から機械導出。
 *     notes: {x,w,y}（x,w=0..256グリッド・y=相対音高で上が小さい）。モーラ i ↔ 音符 i の恒等対応。
 *   accent … {feed,moras,hl,ap,phrases,tool} = accent.py（pyopenjtalk）の焼き込み。
 *     moras: モーラ行のかな（run_frontend の read をモーラ分割・カタカナ語以外はひらがな化）。
 *     hl: 0=低/1=高。ap: モーラごとのアクセント句id。記憶で書いた高低は存在しない。
 *   spans … [{s,read,kana[],m0,m1,c0,c1}] = 語（形態素）単位の表記区間↔モーラ区間
 *     （run_frontend の {string,read,mora_size} から機械生成。c0/c1 は feed 内の文字位置）。
 *     yomiSrc がある句の spans は yomiSrc（=feed）に張る。表記の欄は光らせない（計画§1-2）。
 *   variants … 変化後の状態 [{id,base,label,cand?,hyoki,yomiSrc?,accent,spans,hand?}]。
 *     notes は {ref:base}（メロは不変）。hand={flipped[],hl[],source} は高低の手上書き。
 *   lyrCands / melCands … 候補。{id,target=句id,hyoki|notes,...}。バッジ・印は表示時に marks.js が機械生成。
 *   refs … 枚が参照する実在の例（かな表記の句・案A/B差の実例句・各variantの例）。
 *   opsTableText … 操作の割当①〜⑤（計画§3-5の正準文字列。枠外注記・枚14はこれをそのまま使う）。
 *   索引: phraseById / sectionById / planById / candById / variantById / stateById。
 */
`;

fs.writeFileSync(path.join(DIR, "data.js"),
  header +
  '(function (g) {\n"use strict";\nvar V8DATA = ' +
  JSON.stringify(dataObj, null, 1) +
  ";\n" + footer +
  '\ng.V8DATA = V8DATA;\nif (typeof module !== "undefined" && module.exports) module.exports = V8DATA;\n})(typeof window !== "undefined" ? window : globalThis);\n');

fs.writeFileSync(path.join(DIR, "accent-log.json"), JSON.stringify({
  command: `${PY} accent.py (cwd=${AUDIO_DIR}, stdin=1行1文) ＋ ${PY} frontend.py (cwd=${DIR})`,
  ranAt: new Date().toISOString(),
  note: "entries[].accent = accent.py の入出力・entries[].frontend = run_frontend の形態素列（spans の材料）",
  entries: log,
}, null, 1));

/* ---- 焼き上がりの確認レポート（データには焼かない） ---- */
const req2 = createRequire(import.meta.url);
delete req2.cache[path.join(DIR, "data.js")];
const D = req2(path.join(DIR, "data.js"));
console.log("data.js / accent-log.json 出力完了。accent.py + run_frontend 実行:", targets.length, "文");
console.log("\n--- 黄の案A/B差の実例句（機械確定） ---");
for (const e of abExamples) console.log(` ${e.id}:`, e.pairs.map((p) => `モーラ${p.i}(${p.moras})=${p.color}`).join(" "));
console.log("\n--- 既定（案イ+案B）の印の実態 ---");
for (const id of Object.keys(D.phraseById)) {
  const u = D.phraseById[id];
  if (!u.accent || !u.notes || u.notes.ref) continue;
  const notes = Array.isArray(u.notes) ? u.notes : null;
  if (!notes) continue;
  const ys = u.accent.moras.map((_, i) => (i < notes.length ? notes[i].y : null));
  const mk = MARKS.computeMarks(u.accent.hl, u.accent.ap, ys, MARKS.DEFAULT_OPTS);
  if (mk.length) console.log(` ${id}:`, mk.map((m) => `${u.accent.moras[m.i]}=${m.color}`).join(" "));
}
console.log("\n--- variants ---");
for (const v of D.variants) {
  const ns = D.phraseById[v.base].notes;
  const nNotes = Array.isArray(ns) ? ns.length : "(ref)";
  console.log(` ${v.id} [${v.label}] feed=${v.accent.feed} moras=${v.accent.moras.length} 音符=${nNotes}` +
    (v.hand ? ` hand.hl=${v.hand.hl.join("")}` : ` hl=${v.accent.hl.join("")}`));
}
console.log("\n--- spans の例（かな句・読み取り用の表記・漢字句） ---");
for (const id of ["C-A-k2", "C-A-k2-v1", "A-1S-k1"]) {
  const s = D.stateById[id];
  console.log(` ${id}:`, s.spans.map((sp) => `${sp.s}(${sp.kana.join("")})[${sp.m0},${sp.m1})`).join(" "));
}
