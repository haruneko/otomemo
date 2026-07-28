/* verify.mjs — v8 の機械検証。
 *
 * 実行: node verify.mjs
 *
 * 構成:
 * - v7から引き継いだ検証（アクセント照合・印の導出・小節連続・参照実在・出所照合・
 *   状態網羅・操作割当・レイアウト実測・隔離）＝番号 0〜9。
 * - 計画§8の追加9項目＝番号 8-1〜8-9。
 *   8-1 2層の導出照合（全句・全候補・全variantsで accent.py 再実行と一致）
 *   8-2 語↔モーラ対応の完全性（run_frontend 再実行と spans の照合＋bakeの検査3つの再実行）
 *   8-3 チップ・出所表示の機械算出（rowChips / sectionFactChips / hlSource の再計算照合）
 *   8-4 before/after の整合（variantの高低線・手上書きの輪・音符なしモーラが再計算と一致）
 *   8-5 パーツ宣言の照合（計画§3-4の独立転記 vs V8C.PARTSETS vs レンダ済みDOMの可視パーツ）
 *   8-6 印の暫定案の全枚統一（全枚イ+B・案の上書きと音数ドット案は案くらべ区画の中だけ）
 *   8-7 説明文の枠外化（電話枠内に凡例・割当表の文字列が無い。help の中だけ例外）
 *   8-8 縦揃え＝音符の時間データから計算した期待値と1px以内（帯の表示有無に依存しない）
 *       ※表記の行（.c-ly）は検査対象外＝文字と音符の1対1の揃えは成立しない（計画§1-3）。
 *         黙って落とすのではなくここに明記する。
 *   8-9 音の枠の数字の照合（音数・読み・印の個数が機械算出と一致）
 * - 枚がまだ無い項目は PEND（保留）として通す。データ項目と demo枚 で成立する項目は今も実測。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import pkg from "/home/shuraba_p/projects/creative_manager/node_modules/playwright-core/index.js";
const { chromium } = pkg;

const DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const D = require(path.join(DIR, "data.js"));
const AUDIO_DIR = "/home/shuraba_p/projects/creative_manager/apps/audio";
const PY = path.join(AUDIO_DIR, ".venv/bin/python");

const results = [];
function report(no, name, status, detail) {
  results.push({ no, name, status, detail: detail || "" });
  const mark = status === "PASS" ? "✅" : status === "PEND" ? "⏸" : "❌";
  console.log(`${mark} [${no}] ${name}: ${status}${detail ? " — " + detail : ""}`);
}

/* 全ての読み対象（句・stock・候補・variant）を列挙 */
function allAccentEntries() {
  const entries = [];
  for (const id of Object.keys(D.phraseById)) {
    const u = D.phraseById[id];
    if (u.accent) entries.push({ id, obj: u });
  }
  for (const c of D.lyrCands) if (c.accent) entries.push({ id: c.id, obj: c });
  for (const v of D.variants) entries.push({ id: v.id, obj: v });
  return entries;
}

/* ---------------- 検証1 = 8-1: 2層の導出照合（accent.py 再実行・全句・全候補・全variants） ---------------- */
{
  const entries = allAccentEntries();
  const r = spawnSync(PY, ["accent.py"], {
    cwd: AUDIO_DIR, input: entries.map((e) => e.obj.accent.feed).join("\n"),
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const bad = [];
  if (r.status !== 0) {
    bad.push("accent.py 実行失敗: " + r.stderr);
  } else {
    const out = JSON.parse(r.stdout);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i], o = out[i];
      if (!o || o.error) { bad.push(`${e.id}: accent.py error`); continue; }
      if (o.mora_total !== e.obj.accent.moras.length) bad.push(`${e.id}: モーラ数 ${e.obj.accent.moras.length} vs 実測 ${o.mora_total}`);
      if (JSON.stringify(o.hl) !== JSON.stringify(e.obj.accent.hl)) bad.push(`${e.id}: HL列が実測と不一致`);
      const ap = [];
      let cur = 0;
      for (const t of o.trans) { ap.push(cur); if (t === "|") cur++; }
      if (JSON.stringify(ap) !== JSON.stringify(e.obj.accent.ap)) bad.push(`${e.id}: アクセント句の切れ目が実測と不一致`);
      /* feed = yomiSrc || hyoki の規約 */
      const feed = e.obj.yomiSrc || e.obj.hyoki;
      if (feed && e.obj.accent.feed !== feed) bad.push(`${e.id}: feed が yomiSrc||hyoki と不一致`);
      /* 手上書きは「機械のhlの flipped だけ反転」以外の値を持てない */
      if (e.obj.hand) {
        const hl = e.obj.accent.hl.slice();
        for (const idx of e.obj.hand.flipped) hl[idx] = hl[idx] ? 0 : 1;
        if (JSON.stringify(hl) !== JSON.stringify(e.obj.hand.hl)) bad.push(`${e.id}: hand.hl が flipped の反転と不一致`);
      }
    }
  }
  report("8-1", "2層の導出照合（全句・全候補・全variantsを accent.py に再実行）",
    bad.length ? "FAIL" : "PASS",
    bad.length ? bad.join(" / ") : `${allAccentEntries().length}文一致（variants ${D.variants.length}件込み）`);
}

/* ---------------- 検証 8-2: 語↔モーラ対応の完全性（run_frontend 再実行＋bakeの検査3つ） ---------------- */
const SMALL = "ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ";
function splitMora(s) {
  const out = [];
  for (const ch of s.replace(/[\s　]/g, "")) {
    if (SMALL.includes(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
const KATA_RE = /^[ァ-ー]+$/;
function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
{
  const entries = allAccentEntries();
  const r = spawnSync(PY, [path.join(DIR, "frontend.py")], {
    cwd: DIR, input: entries.map((e) => e.obj.accent.feed).join("\n"),
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const bad = [];
  if (r.status !== 0) {
    bad.push("frontend.py 実行失敗: " + r.stderr);
  } else {
    const out = JSON.parse(r.stdout);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i], o = out[i];
      const feed = e.obj.accent.feed;
      const spans = e.obj.spans;
      if (!spans) { bad.push(`${e.id}: spans が無い`); continue; }
      if (!o || o.error) { bad.push(`${e.id}: frontend.py error`); continue; }
      /* bake の検査(c): 表層連結 == feed */
      const joined = o.morphs.map((m) => m.string).join("");
      if (joined !== feed) bad.push(`${e.id}: [検査c] 表層連結がfeedと不一致`);
      /* bake の検査(a): Σmora_size == モーラ総数 */
      const sum = o.morphs.reduce((s, m) => s + m.mora_size, 0);
      if (sum !== e.obj.accent.moras.length) bad.push(`${e.id}: [検査a] Σmora_size=${sum} != ${e.obj.accent.moras.length}`);
      /* spans が形態素列（mora_size>0）を順序ごと過不足なく写す */
      const mm = o.morphs.filter((m) => m.mora_size > 0);
      if (mm.length !== spans.length) {
        bad.push(`${e.id}: spans数 ${spans.length} != 形態素数 ${mm.length}`);
      } else {
        let m0 = 0;
        for (let k = 0; k < mm.length; k++) {
          const sp = spans[k], m = mm[k];
          if (sp.s !== m.string) bad.push(`${e.id}: span${k} 表層「${sp.s}」!=「${m.string}」`);
          if (sp.read !== m.read) bad.push(`${e.id}: span${k} read「${sp.read}」!=「${m.read}」`);
          if (sp.m1 - sp.m0 !== m.mora_size) bad.push(`${e.id}: span${k} モーラ幅 ${sp.m1 - sp.m0} != ${m.mora_size}`);
          if (sp.m0 !== m0) bad.push(`${e.id}: span${k} がモーラ区間を連続に覆っていない（m0=${sp.m0} 期待${m0}）`);
          m0 = sp.m1;
          /* bake の検査(b): read の分割数 == mora_size ＋ かな導出の再現 */
          const readMoras = splitMora(m.read);
          if (readMoras.length !== m.mora_size) bad.push(`${e.id}: [検査b] span${k} read分割 ${readMoras.length} != ${m.mora_size}`);
          const keep = KATA_RE.test(m.string);
          const kana = readMoras.map((x) => (keep ? x : kataToHira(x)));
          if (JSON.stringify(kana) !== JSON.stringify(sp.kana)) bad.push(`${e.id}: span${k} かな導出が不一致`);
          /* 文字区間が feed を指す */
          if (feed.slice(sp.c0, sp.c1) !== sp.s) bad.push(`${e.id}: span${k} 文字区間 c0..c1 が表層と不一致`);
        }
        if (m0 !== e.obj.accent.moras.length) bad.push(`${e.id}: spans がモーラ列全体を覆っていない（${m0}/${e.obj.accent.moras.length}）`);
        /* モーラ行のかな＝spans の kana の連結 */
        const flat = spans.flatMap((sp) => sp.kana);
        if (JSON.stringify(flat) !== JSON.stringify(e.obj.accent.moras)) bad.push(`${e.id}: moras が spans の kana 連結と不一致`);
      }
    }
  }
  report("8-2", "語↔モーラ対応の完全性（run_frontend 再実行・検査3つ再実行・全句/候補/variants）",
    bad.length ? "FAIL" : "PASS",
    bad.length ? bad.slice(0, 8).join(" / ") : `${entries.length}文・spans完全`);
}

/* ---------------- 検証3: 小節の連続性（前奏込み1起点・重なりと欠番なし） ---------------- */
{
  const bad = [];
  for (const k of Object.keys(D.songs)) {
    const sg = D.songs[k];
    let expect = 1, sawNonNumeric = false;
    for (const sec of sg.sections) {
      if (!sec.bars) { sawNonNumeric = true; continue; }
      if (sawNonNumeric) bad.push(`${sec.id}: 小節番号つきセクションが番号なしの後に来ている`);
      if (sec.bars[0] !== expect) bad.push(`${sec.id}: ${sec.bars[0]}始まり（期待 ${expect}）`);
      if (sec.bars[1] < sec.bars[0]) bad.push(`${sec.id}: 範囲が逆`);
      expect = sec.bars[1] + 1;
      const units = (sec.units || []).filter((u) => u.bars);
      if (units.length) {
        let ue = sec.bars[0];
        for (const u of units) {
          if (u.bars[0] !== ue) bad.push(`${u.id}: ${u.bars[0]}始まり（期待 ${ue}）`);
          if (u.bars[1] < u.bars[0]) bad.push(`${u.id}: 範囲が逆`);
          ue = u.bars[1] + 1;
        }
        if (ue !== sec.bars[1] + 1) bad.push(`${sec.id}: 末尾が ${ue - 1} 小節で終わる（期待 ${sec.bars[1]}）`);
      }
      if ((sec.units || []).some((u) => !u.bars)) bad.push(`${sec.id}: 小節番号なしのユニットが番号つきセクションにある`);
    }
  }
  report(3, "小節の連続性（前奏を勘定に入れて1から通す）",
    bad.length ? "FAIL" : "PASS",
    bad.length ? bad.join(" / ") : Object.keys(D.songs).map((k) => {
      const secs = D.songs[k].sections.filter((s) => s.bars);
      return secs.length ? `${k}=1–${secs[secs.length - 1].bars[1]}` : `${k}=番号なし`;
    }).join(" "));
}

/* ---------------- 検証4a: 参照idの実在（データ側） ---------------- */
{
  /* data.js は読み込み時に参照検証で例外を投げる＝ここまで来ていれば実在は成立 */
  const nRefs = Object.keys(D.phraseById).filter((id) => D.phraseById[id].sameAs).length +
    D.lyrCands.length + D.melCands.length + D.variants.length + Object.keys(D.refs).length;
  report(4, "参照idの実在（データ側）", "PASS", `sameAs/target/base/refs 計${nRefs}件を読込時検証済み`);
}

/* ---------------- 検証6a: 句の状態の網羅（データから機械列挙） ---------------- */
function resolveNotes(u) {
  if (!u.notes) return null;
  if (Array.isArray(u.notes)) return u.notes;
  return resolveNotes(D.phraseById[u.notes.ref] || D.variantById[u.notes.ref]);
}
function lyricState(u) {
  const notes = resolveNotes(u);
  if (!u.hyoki) return "空き";
  const m = u.accent ? u.accent.moras.length : 0;
  if (notes && notes.length > m) return "一部";
  if (!notes && u.plan) return "一部";
  return "あり";
}
{
  const combos = {};
  for (const id of Object.keys(D.phraseById)) {
    const u = D.phraseById[id];
    if (u.kind !== "phrase") continue;
    const key = "詞" + lyricState(u) + "×メロ" + (resolveNotes(u) ? "あり" : "空き");
    (combos[key] = combos[key] || []).push(id);
  }
  const need = ["詞あり×メロあり", "詞あり×メロ空き", "詞一部×メロあり", "詞一部×メロ空き", "詞空き×メロあり", "詞空き×メロ空き"];
  const missing = need.filter((k) => !combos[k]);
  report(6, "句の状態の網羅（詞=あり/一部/空き × メロ=あり/空き がデータに全組ある）",
    missing.length ? "FAIL" : "PASS",
    missing.length ? "不足: " + missing.join(",") : need.map((k) => `${k}=${combos[k].length}`).join(" "));
}

/* ---------------- ブラウザ側 ---------------- */
const b = await chromium.launch({
  executablePath: "/home/shuraba_p/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome",
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } });
const p = await ctx.newPage();
const pageErrors = [];
p.on("pageerror", (e) => pageErrors.push(String(e)));
await p.goto("file://" + path.join(DIR, "skeleton.html"), { waitUntil: "load" });
await p.waitForTimeout(200);

if (pageErrors.length) {
  report(0, "ページ読み込み（登録時検査＝CSS接頭辞・案の宣言・パーツ宣言を含む）", "FAIL", pageErrors.join(" / "));
} else {
  const nSheets = await p.evaluate(() => document.querySelectorAll(".frame").length);
  report(0, "ページ読み込み（登録時検査＝CSS接頭辞・案の宣言・パーツ宣言を含む）", "PASS", `${nSheets}枚`);
}

/* 検証2: 印の導出照合（手置き検出＋規則関数の出力との一致） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    /* (a) 印を持つ全要素に data-mk が付いているか（手置き検出）。onsu-an は案くらべ区画専用 */
    document.querySelectorAll(".c-mk-r,.c-mk-y,.c-fd-r,.c-fd-y,.c-pr-i").forEach((e2) => {
      const mk = e2.getAttribute("data-mk");
      if (mk !== "rule" && mk !== "onsu-an") {
        bad.push("手置きの印: " + (e2.className || e2.tagName));
      }
    });
    /* (b) 枚ごとに、文字区画（.c-fr）・断片音符（.c-pr-n）の印の集合を
       宣言された案で再計算した集合と照合。高低線のカナ行（.c-cmp）は印を出さない＝除外 */
    document.querySelectorAll(".frame").forEach((f) => {
      const opts = JSON.parse(f.getAttribute("data-marks-opts"));
      const sheet = f.getAttribute("data-sheet");
      f.querySelectorAll("[data-phrase]").forEach((ph) => {
        const id = ph.getAttribute("data-phrase");
        const u = V8DATA.stateById[id];
        if (!u || !u.accent) return;
        if (ph.classList.contains("c-cmp")) return;
        const cells = [...ph.querySelectorAll(".c-fr .c-tc[data-nc], .c-pr-n[data-nr]")]
          .concat(ph.matches(".c-fr") ? [...ph.querySelectorAll(".c-tc[data-nc]")] : []);
        const frCells = cells.filter((c) => !c.closest(".c-cmp"));
        if (!frCells.length) return;
        const ovEl = ph.closest("[data-marks-opts]");
        const useOpts = ovEl && !ovEl.classList.contains("frame") ? JSON.parse(ovEl.getAttribute("data-marks-opts")) : opts;
        const expected = new Set(V8C.marksOf(u, useOpts).map((m) => m.i + ":" + m.color));
        const got = new Set();
        frCells.forEach((c) => {
          const key = (c.getAttribute("data-nc") || c.getAttribute("data-nr") || "").split(":")[1];
          if (c.classList.contains("c-mk-r")) got.add(key + ":r");
          if (c.classList.contains("c-mk-y")) got.add(key + ":y");
        });
        for (const g2 of got) if (!expected.has(g2)) bad.push(`枚${sheet} ${id}: 規則に無い印 ${g2}`);
        for (const e2 of expected) {
          const i = +e2.split(":")[0];
          const hasCell = frCells.some((c) =>
            ((c.getAttribute("data-nc") || c.getAttribute("data-nr") || "").split(":")[1]) === String(i));
          if (hasCell && !got.has(e2)) bad.push(`枚${sheet} ${id}: 規則の印が出ていない ${e2}`);
        }
      });
    });
    return bad;
  });
  report(2, "印の導出照合（手置きなし・宣言された案と一致）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証4b: 枚間の数値整合（事実の小札・チップ=データからの機械算出のみ） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll(".c-fact").forEach((e2) => {
      const inCand = e2.closest(".c-cand");
      if (inCand) { if (e2.getAttribute("data-src") == null) bad.push("出所なしバッジ: " + e2.textContent); }
      else if (e2.getAttribute("data-calc") == null) bad.push("機械算出でない小札: " + e2.textContent);
    });
    document.querySelectorAll(".c-chip").forEach((e2) => {
      if (e2.getAttribute("data-calc") == null) bad.push("機械算出でないチップ: " + e2.textContent);
    });
    return bad;
  });
  report("4b", "枚間の数値整合（小札・チップは全て data-calc/data-src 経由）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証5: 表示データの出所照合（DOMの歌詞・モーラ・語トークン・バッジ・genNote等がデータ由来と一致） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const C = V8C, M = V8MARKS, D2 = V8DATA;
    function expectFor(src) {
      const [kind, a, b2] = src.split(":");
      const u = D2.stateById[a] || D2.candById[a] || D2.planById[a] || D2.sectionById[a];
      switch (kind) {
        case "lyric": return [C.displayText(u)];
        case "mora": return [u.accent.moras[+b2]];
        case "lyricafter": return [u.accent.moras.slice(C.notesOf(u).length).join("")];
        case "imi": return [u.imi];
        case "span": return [u.spans[+b2].s];
        case "plan": {
          const pl = D2.planById[a];
          return [C.planChipText(pl), pl.memo, pl.onsu, pl.bars && pl.bars + "小節", pl.hl && "読み " + pl.hl].filter(Boolean);
        }
        case "cand": return [u.hyoki];
        case "candread": {
          const j = u.accent.moras.join("");
          return ["読み: " + j, j];
        }
        case "gennote": return ["作り方: " + u.genNote, u.genNote];
        case "same": {
          const ref = D2.sectionById[u.sameMelodyAs];
          return ["同じメロ: " + ref.name];
        }
        case "frame": {
          const fc = C.frameFieldContent(a);
          const out = [fc.lines.join(""), ...fc.lines];
          const ns = C.notesOf(u);
          if (ns && C.slotIdxs(u).length) {
            const ys = C.slotIdxs(u).map((i) => ns[i].y);
            out.push(String(C.slotIdxs(u).length), M.hlText(M.slotSuggestHL(ys)));
          } else if (!ns && u.accent) {
            out.push(String(u.accent.moras.length), M.hlText(C.effHl(u)));
          }
          return out;
        }
        case "badge": {
          const c = D2.candById[a];
          const tgt = D2.phraseById[c.target];
          const opts = JSON.parse(c._el.closest(".frame").getAttribute("data-marks-opts"));
          const badges = c.hyoki
            ? M.lyricCandBadges(c, C.slotIdxs(tgt).map((i) => C.notesOf(tgt)[i].y), opts)
            : M.melodyCandBadges(c.notes, tgt.accent, opts);
          return badges.map((x) => x.t);
        }
        case "dest": {
          const tgt = D2.phraseById[u.target];
          const sec = D2.sectionById[tgt.section];
          const sg = D2.songs[tgt.song];
          return ["宛先: " + sg.title.replace(/（.*$/, "") + " › " + sec.name + " › " + C.barsLabel(tgt).replace("小節", "小節の句")];
        }
        default: return null;
      }
    }
    document.querySelectorAll("[data-src]").forEach((e2) => {
      const src = e2.getAttribute("data-src");
      if (!src) return;
      const [kind, a] = src.split(":");
      if (kind === "badge") { const c = V8DATA.candById[a]; c._el = e2; }
      let exp;
      try { exp = expectFor(src); } catch (err) { bad.push(src + ": " + err.message); return; }
      if (!exp) { bad.push("不明な出所種別: " + src); return; }
      const norm = (s) => String(s).replace(/\s+/g, "");
      const t = norm(e2.textContent);
      if (!exp.some((x) => x != null && norm(x) === t)) {
        bad.push(`${src}: 表示「${e2.textContent.trim()}」がデータ由来と一致しない（期待 ${exp[0]}）`);
      }
    });
    /* 出所なしの歌詞・バッジ直書きの検出 */
    document.querySelectorAll(".c-ly > span:not([data-src]):not(.c-dslot):not(.c-placebtn):not(.c-stockpos):not(.c-inp):not(.c-pop)").forEach((e2) => {
      if (e2.textContent.trim() && !e2.querySelector("[data-src]") && !e2.closest(".c-pop")) bad.push("出所なしの歌詞テキスト: " + e2.textContent.slice(0, 12));
    });
    document.querySelectorAll(".c-cand-w:not([data-src]), .c-tc:not([data-src]), .c-ftok:not([data-src])").forEach((e2) => {
      if (e2.textContent.trim()) bad.push("出所なしの表示: " + e2.textContent.slice(0, 12));
    });
    return bad;
  });
  report(5, "表示データの出所照合（歌詞・モーラ・語トークン・バッジ・genNote等）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証 8-3: チップ・小札・出所表示の機械算出（再計算との突き合わせ） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const C = V8C;
    let n = 0;
    /* 行チップ: .c-chips の中身が rowChipDefs の再計算と一致 */
    document.querySelectorAll(".c-chips").forEach((box) => {
      const row = box.closest("[data-phrase]");
      if (!row) { bad.push("句に属さないチップ列"); return; }
      n++;
      const id = row.getAttribute("data-phrase");
      const u = V8DATA.stateById[id];
      const expect = C.rowChipDefs(u).map((c) => c.text);
      const got = [...box.querySelectorAll(".c-chip")].map((e2) => e2.textContent);
      if (JSON.stringify(expect) !== JSON.stringify(got)) {
        bad.push(`${id}: チップ ${JSON.stringify(got)} 期待 ${JSON.stringify(expect)}`);
      }
    });
    /* data-calc="chip:..." の id/kind とテキストの整合 */
    document.querySelectorAll('[data-calc^="chip:"]').forEach((e2) => {
      const parts = e2.getAttribute("data-calc").split(":");
      const id = parts[1], kindName = parts[2];
      const u = V8DATA.stateById[id];
      const def = C.rowChipDefs(u).find((c) => c.kind === kindName);
      if (!def) bad.push(`chip:${id}:${kindName} は再計算に存在しない`);
      else if (def.text !== e2.textContent) bad.push(`chip:${id}:${kindName} 表示「${e2.textContent}」期待「${def.text}」`);
    });
    /* セクション小札: sectionFactChips の再生成と一致 */
    document.querySelectorAll('[data-calc^="secfacts:"]').forEach((e2) => {
      const secId = e2.getAttribute("data-calc").split(":")[1];
      const expect = [...C.sectionFactChips(secId).children].map((x) => x.textContent);
      if (!expect.includes(e2.textContent)) bad.push(`secfacts:${secId}: 「${e2.textContent}」が再計算に無い`);
    });
    /* 読みの出所表示: hand の有無と一致 */
    document.querySelectorAll('[data-calc^="hlsrc:"]').forEach((e2) => {
      const id = e2.getAttribute("data-calc").split(":")[1];
      const u = V8DATA.stateById[id];
      const expectHand = !!u.hand;
      const saysHand = e2.textContent.includes("手で直した");
      if (expectHand !== saysHand) bad.push(`hlsrc:${id}: 出所表示が状態と不一致`);
    });
    return { n, bad };
  });
  if (r.bad.length) report("8-3", "チップ・小札・出所表示の機械算出（再計算照合）", "FAIL", r.bad.slice(0, 8).join(" / "));
  else if (!r.n) report("8-3", "チップ・小札・出所表示の機械算出（再計算照合）", "PEND", "チップを含む枚がまだ無い");
  else report("8-3", "チップ・小札・出所表示の機械算出（再計算照合）", "PASS", `チップ行${r.n}箇所ほか一致`);
}

/* 検証 8-4: before/after の整合（variantの高低線・手上書きの輪・音符なしモーラ） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const C = V8C, L = C.LAYOUT;
    document.querySelectorAll(".c-cmp[data-phrase]").forEach((w) => {
      const id = w.getAttribute("data-phrase");
      const u = V8DATA.stateById[id];
      if (!u || !u.accent) return;
      const hl = C.effHl(u);
      const ns = C.notesOf(u);
      const nCells = ns ? Math.min(u.accent.moras.length, ns.length) : u.accent.moras.length;
      const dots = w.querySelectorAll(".c-hl-dot");
      if (dots.length !== nCells) { bad.push(`${id}: 高低点 ${dots.length}個（期待 ${nCells}）`); return; }
      const expected = [];
      for (let i = 0; i < nCells; i++) expected.push(hl[i] ? L.HL_HI : L.HL_LO);
      const got = [...dots].map((d2) => +d2.getAttribute("cy"));
      if (JSON.stringify(got) !== JSON.stringify(expected)) bad.push(`${id}: 高低点の並びが effHl と不一致`);
      const rings = w.querySelectorAll(".c-hl-ring").length;
      const expectRings = u.hand ? u.hand.flipped.length : 0;
      if (rings !== expectRings) bad.push(`${id}: 手上書きの輪 ${rings}個（期待 ${expectRings}）`);
    });
    /* 音符なしのモーラ（字余り）の文字列 */
    document.querySelectorAll(".c-fr-after").forEach((e2) => {
      const id = e2.getAttribute("data-src").split(":")[1];
      const u = V8DATA.stateById[id];
      const expect = u.accent.moras.slice(C.notesOf(u).length).join("");
      if (e2.textContent !== expect) bad.push(`${id}: 音符なしモーラ「${e2.textContent}」期待「${expect}」`);
    });
    return bad;
  });
  report("8-4", "before/after の整合（高低線=effHl・手上書きの輪・音符なしモーラ）",
    r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証 8-5: パーツ宣言の照合（計画§3-4の独立転記 vs V8C.PARTSETS vs DOMの可視パーツ） */
{
  /* 計画§3-4 からの独立転記（components.js から写さないこと＝二重帳簿で照合する）:
     態A: セクション見出し・表記行・行チップ・「まだ何も無い区間」枠・行末印ドット・
          意味メモ・小節番号・再生バー・追加ボタン・断片区画。
          出さない: メロ帯・空マス列・モーラ行・母音の段・高低線・凡例・割当表。
     態B: 態A＋表示シート。態C: 態A＋メロ帯＋空マス列。付記: 態A＋ヘルプ。
     枚2: 態A＋モーラ行＋高低線＋切替の説明1行。枚3: 態A＋モーラ行＋母音の段＋切替の説明1行。 */
  const BASE = ["secHead", "hyoki", "chips", "zone", "dot", "imi", "barNo", "playbar", "addBtns", "stock"];
  const SPEC = {
    A: BASE,
    B: BASE.concat(["dispSheet"]),
    C: BASE.concat(["meloBand", "emptyCells"]),
    A_HELP: BASE.concat(["help"]),
    A_INTO: BASE.concat(["moraRow", "hlLine", "switchNote"]),
    A_ONIN: BASE.concat(["moraRow", "vowelRow", "switchNote"]),
  };
  const r = await p.evaluate((SPEC2) => {
    const bad = [];
    for (const k of Object.keys(SPEC2)) {
      const have = (V8C.PARTSETS[k] || {}).parts || [];
      if (JSON.stringify([...have].sort()) !== JSON.stringify([...SPEC2[k]].sort())) {
        bad.push(`PARTSETS.${k} が計画の転記と不一致`);
      }
    }
    for (const k of Object.keys(V8C.PARTSETS)) if (!SPEC2[k]) bad.push(`PARTSETS.${k} は計画に無い宣言`);
    /* 「見えている」の機械定義（計画§3-4）: 幅・高さ1px以上・祖先含め非表示でない */
    function visible(e2) {
      const r2 = e2.getBoundingClientRect();
      if (r2.width < 1 || r2.height < 1) return false;
      for (let n = e2; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
      }
      return true;
    }
    let nPanes = 0;
    document.querySelectorAll("[data-partset]").forEach((pane) => {
      nPanes++;
      const setName = pane.getAttribute("data-partset");
      const set = SPEC2[setName];
      if (!set) { bad.push("不明なパーツ宣言: " + setName); return; }
      pane.querySelectorAll("[data-part]").forEach((e2) => {
        const part = e2.getAttribute("data-part");
        if (visible(e2) && set.indexOf(part) < 0) bad.push(`pane(${setName}): 宣言外の可視パーツ ${part}`);
      });
      /* 宣言外パーツ種＝該当クラスの可視要素0個（クラス→パーツの対応でも検査） */
      const classOfPart = {
        meloBand: ".c-melo:not(.c-melo-none)", emptyCells: ".c-kb2", moraRow: ".c-fr .c-tc",
        hlLine: ".c-hl-line", vowelRow: ".c-vc", dispSheet: ".c-dispsheet", help: "[data-help]",
      };
      for (const partName of Object.keys(classOfPart)) {
        if (set.indexOf(partName) >= 0) continue;
        pane.querySelectorAll(classOfPart[partName]).forEach((e2) => {
          if (visible(e2)) bad.push(`pane(${setName}): 宣言外パーツ ${partName} のクラスが可視`);
        });
      }
    });
    /* pane を含む電話枠で、pane の外にある data-part は playbar だけ */
    document.querySelectorAll(".c-ph").forEach((ph) => {
      const pane = ph.querySelector("[data-partset]");
      if (!pane) return;
      ph.querySelectorAll("[data-part]").forEach((e2) => {
        if (!e2.closest("[data-partset]") && e2.getAttribute("data-part") !== "playbar") {
          bad.push("通しの面の電話枠で pane の外にパーツ: " + e2.getAttribute("data-part"));
        }
      });
    });
    return { nPanes, bad };
  }, SPEC);
  if (r.bad.length) report("8-5", "パーツ宣言の照合（計画§3-4の転記 vs PARTSETS vs DOMの可視パーツ）", "FAIL", r.bad.slice(0, 8).join(" / "));
  else if (!r.nPanes) report("8-5", "パーツ宣言の照合", "PEND", "throughPane を含む枚がまだ無い");
  else report("8-5", "パーツ宣言の照合（計画§3-4の転記 vs PARTSETS vs DOMの可視パーツ）", "PASS", `${r.nPanes}区画`);
}

/* 検証 8-6: 印の暫定案の全枚統一（全枚イ+B・上書きと音数ドット案は案くらべ区画の中だけ） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll(".frame").forEach((f) => {
      const opts = JSON.parse(f.getAttribute("data-marks-opts"));
      if (opts.flatPair !== "イ" || opts.yellowUse !== "B") {
        bad.push(`枚${f.getAttribute("data-sheet")}: 印の案が イ+B でない（${opts.flatPair}+${opts.yellowUse}）`);
      }
      if (!f.querySelector("[data-marksnote]")) bad.push(`枚${f.getAttribute("data-sheet")}: 印の案の枠外注記が無い`);
    });
    document.querySelectorAll("[data-marks-opts]").forEach((e2) => {
      if (e2.classList.contains("frame")) return;
      if (!e2.closest("[data-rule-compare]")) bad.push("案くらべ区画の外で印の案を上書き: " + (e2.getAttribute("data-phrase") || e2.className));
    });
    document.querySelectorAll('[data-onsu-an], [data-mk="onsu-an"]').forEach((e2) => {
      if (!e2.closest("[data-rule-compare]")) bad.push("案くらべ区画の外に音数ドット案");
    });
    return bad;
  });
  report("8-6", "印の暫定案の全枚統一（イ+B・例外は案くらべ区画のみ・枠外注記あり）",
    r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証7 + 8-7: 操作割当の正準一致と説明文の枠外化 */
{
  const r = await p.evaluate(() => {
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const want = norm(V8DATA.opsTableText);
    const bad = [];
    const els = document.querySelectorAll("[data-ops-table]");
    els.forEach((e2) => {
      if (norm(e2.textContent) !== want) bad.push("割当表の文面が opsTableText（計画の正準文字列）と不一致");
      if (e2.closest(".c-ph") && !e2.closest("[data-help]")) bad.push("割当表が電話枠の中にある（helpの外）");
    });
    /* 電話枠の中（helpの外）に凡例・割当の文字列が漏れていないか */
    const banned = ["①詞テキストをタップ", "④長押し（どこでも）", "凡例:"];
    document.querySelectorAll(".c-ph").forEach((ph) => {
      const clone = ph.cloneNode(true);
      clone.querySelectorAll("[data-help]").forEach((h) => h.remove());
      const t = clone.textContent;
      banned.forEach((w) => { if (t.includes(w)) bad.push(`電話枠内に説明文が残る: "${w}"`); });
    });
    return { n: els.length, bad };
  });
  if (r.bad.length) report("7/8-7", "操作割当の正準一致＋説明文の枠外化", "FAIL", r.bad.slice(0, 8).join(" / "));
  else if (!r.n) report("7/8-7", "操作割当の正準一致＋説明文の枠外化", "PEND", "割当表を含む枚がまだ無い（枠外注記・枚14で必須）");
  else report("7/8-7", "操作割当の正準一致＋説明文の枠外化", "PASS", `${r.n}箇所一致・枠内漏れなし`);
}

/* 検証8 + 8-8: レイアウト実測。縦揃えは「音符の時間データから計算した期待値」に対して
   行う＝帯の表示有無に依存しない（帯なしの枚も対象から外れない・計画§3-1）。
   ※表記の行（.c-ly）は検査対象外＝漢字1文字が複数モーラになる以上、文字と音符の
     1対1の揃えは成立しない（計画§1-3）。黙って落とすのではなくここに明記する。 */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const L = V8C.LAYOUT;
    /* (a) 実測どうしの縦揃え（メロ矩形 vs 下段区画・同じ句の同じ音符番号・1px以内） */
    document.querySelectorAll(".c-target, .c-ku, .c-kmain").forEach((scope) => {
      const nrs = {}, ncs = {};
      scope.querySelectorAll("[data-nr]").forEach((e2) => { if (e2.closest(".c-target,.c-ku,.c-kmain") === scope) nrs[e2.getAttribute("data-nr")] = e2; });
      scope.querySelectorAll("[data-nc]").forEach((e2) => { if (e2.closest(".c-target,.c-ku,.c-kmain") === scope) ncs[e2.getAttribute("data-nc")] = e2; });
      for (const k of Object.keys(ncs)) {
        if (!nrs[k]) continue;
        const a = nrs[k].getBoundingClientRect(), b2 = ncs[k].getBoundingClientRect();
        if (Math.abs(a.x - b2.x) > 1.01) bad.push(`縦揃えx ${k}: ${Math.abs(a.x - b2.x).toFixed(1)}px`);
        if (Math.abs(a.width - b2.width) > 1.01) bad.push(`縦揃え幅 ${k}: ${Math.abs(a.width - b2.width).toFixed(1)}px`);
      }
    });
    /* (a2)=8-8 データからの期待値照合: モーラ区画・空きマス・母音の段の left/width が
       音符の時間データ（x,w）× (data-w/data-vw) と1px以内 */
    document.querySelectorAll(".c-fr[data-phrase], .c-vrow[data-phrase], .c-cmp[data-phrase]").forEach((row) => {
      const id = row.getAttribute("data-phrase");
      const u = V8DATA.stateById[id];
      const ns = u && V8C.notesOf(u);
      if (!ns) return; /* 音符が無い＝時間の基準が無い行（等間隔置き）は期待値の定義外 */
      const vw = +row.getAttribute("data-vw"), w = +row.getAttribute("data-w");
      if (!vw || !w) { bad.push(`${id}: data-vw/data-w が無い`); return; }
      const f = w / vw;
      const padL = +row.getAttribute("data-padl") || 0;
      row.querySelectorAll("[data-nc]").forEach((cell) => {
        const i = +cell.getAttribute("data-nc").split(":")[1];
        if (!(i < ns.length)) return;
        const expL = padL + ns[i].x * f;
        const expW = ns[i].w * f;
        const gotL = parseFloat(cell.style.left);
        const gotW = parseFloat(cell.style.width);
        if (Math.abs(gotL - expL) > 1.01) bad.push(`${id}[${i}]: 期待左 ${expL.toFixed(1)} 実測 ${gotL}`);
        if (Math.abs(gotW - expW) > 1.01) bad.push(`${id}[${i}]: 期待幅 ${expW.toFixed(1)} 実測 ${gotW}`);
      });
      /* 高低線の点も同じ期待値（区画の中心）に一致 */
      if (row.classList.contains("c-cmp")) {
        const dots = row.querySelectorAll(".c-hl-dot");
        const nCells = Math.min(u.accent.moras.length, ns.length);
        if (dots.length === nCells) {
          for (let i = 0; i < nCells; i++) {
            const expX = padL + (ns[i].x + ns[i].w / 2) * f;
            const gotX = +dots[i].getAttribute("cx");
            if (Math.abs(gotX - expX) > 1.01) bad.push(`${id} 高低点${i}: 期待x ${expX.toFixed(1)} 実測 ${gotX}`);
          }
        }
      }
    });
    /* (b) 断片の音符が親からはみ出て切れていないか */
    document.querySelectorAll(".c-pr").forEach((pr) => {
      const R = pr.getBoundingClientRect();
      pr.querySelectorAll(".c-pr-n").forEach((n) => {
        const r2 = n.getBoundingClientRect();
        if (r2.right > R.right + 0.5) bad.push("断片の音符が右で切れる: " + (n.getAttribute("data-nr") || ""));
      });
    });
    /* (c) 文字のはみ出し */
    document.querySelectorAll(".c-ly,.c-fact,.c-op,.c-dslot,.c-chip,.c-cand-dest,.c-opstable,.c-field-fill,.c-samechip,.c-switchnote,.c-hlsrc").forEach((e2) => {
      if (e2.scrollWidth > e2.clientWidth + 2) bad.push("文字はみ出し: " + e2.className + "「" + e2.textContent.slice(0, 10) + "…」");
    });
    /* (d) 352px幅で横スクロールなし（wideでない枚のみ） */
    document.querySelectorAll(".frame:not(.wide)").forEach((f) => {
      if (f.scrollWidth > 354) bad.push(`枚${f.getAttribute("data-sheet")}: 横幅 ${f.scrollWidth}px`);
      f.querySelectorAll(".c-ph").forEach((ph) => {
        if (ph.scrollWidth > ph.clientWidth + 1) bad.push(`枚${f.getAttribute("data-sheet")}: 電話枠内で横あふれ`);
      });
    });
    /* (e) 高低線の y が2値ちょうど（振幅潰れの検知） */
    document.querySelectorAll(".c-hl-line").forEach((pl) => {
      (pl.getAttribute("points") || "").split(" ").forEach((pt) => {
        const y = +pt.split(",")[1];
        if (y !== L.HL_HI && y !== L.HL_LO) bad.push("高低線のyが2値でない: " + y);
      });
    });
    document.querySelectorAll(".c-hl-dot").forEach((d2) => {
      const y = +d2.getAttribute("cy");
      if (y !== L.HL_HI && y !== L.HL_LO) bad.push("高低点のyが2値でない: " + y);
    });
    return bad;
  });
  report("8/8-8", "レイアウト実測（縦揃え=時間データからの期待値1px・切れ・はみ出し・352px・高低線2値。表記行は対象外＝計画§1-3）",
    r.length ? "FAIL" : "PASS", r.slice(0, 10).join(" / "));
}

/* 検証 8-9: 音の枠の数字の照合（音数・読み・印の個数が機械算出と一致・直書きゼロ） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const C = V8C;
    let n = 0;
    document.querySelectorAll('[data-src^="frame:"]').forEach((e2) => {
      n++;
      const id = e2.getAttribute("data-src").split(":")[1];
      const fc = C.frameFieldContent(id);
      const norm = (s) => String(s).replace(/\s+/g, "");
      if (norm(e2.textContent) !== norm(fc.lines.join(""))) {
        /* 候補依頼フォームの欄値（音数・高低の単独値）は許す */
        const u = V8DATA.stateById[id];
        const ns = C.notesOf(u);
        const alt = [];
        if (ns && C.slotIdxs(u).length) {
          const ys = C.slotIdxs(u).map((i) => ns[i].y);
          alt.push(String(C.slotIdxs(u).length), V8MARKS.hlText(V8MARKS.slotSuggestHL(ys)));
        } else if (!ns && u.accent) {
          alt.push(String(u.accent.moras.length), V8MARKS.hlText(C.effHl(u)));
        }
        if (!alt.some((x) => norm(x) === norm(e2.textContent))) {
          bad.push(`frame:${id}: 「${e2.textContent.trim().slice(0, 24)}」が機械算出と不一致`);
        }
      }
    });
    return { n, bad };
  });
  if (r.bad.length) report("8-9", "音の枠の数字の照合（音数・読み・印の個数=機械算出）", "FAIL", r.bad.slice(0, 8).join(" / "));
  else if (!r.n) report("8-9", "音の枠の数字の照合（音数・読み・印の個数=機械算出）", "PEND", "音の枠を含む枚がまだ無い");
  else report("8-9", "音の枠の数字の照合（音数・読み・印の個数=機械算出）", "PASS", `${r.n}箇所一致`);
}

/* 検証9: 隔離（desc/st 非表示状態で設計論の語が絵に残らない） */
{
  await p.addStyleTag({ content: ".desc,.st{display:none !important}" });
  const r = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll(".frame").forEach((f) => {
      const t = f.innerText;
      ["裁定", "欠陥", "§", "v5", "v6", "v7", "R-1", "却下", "廃止", "工程"].forEach((wd) => {
        if (t.includes(wd)) bad.push(`枚${f.getAttribute("data-sheet")}: "${wd}"`);
      });
    });
    return bad;
  });
  report(9, "隔離（設計論の語が配布スクショに残らない）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証6b: 枚ごとの状態網羅（本枚が揃ってから意味を持つ） */
{
  const r = await p.evaluate(() => {
    const shown = new Set();
    document.querySelectorAll(".frame:not([data-demo])").forEach((f) => {
      f.querySelectorAll("[data-phrase]").forEach((e2) => shown.add(e2.getAttribute("data-phrase")));
    });
    return [...shown];
  });
  if (!r.length) report("6b", "状態の組が少なくとも1枚に登場（本枚）", "PEND", "本枚がまだ無い（工程2で判定）");
  else {
    const combos = new Set();
    for (const id of r) {
      const u = D.phraseById[id];
      if (!u || u.kind !== "phrase") continue;
      combos.add("詞" + lyricState(u) + "×メロ" + (resolveNotes(u) ? "あり" : "空き"));
    }
    const need = ["詞あり×メロあり", "詞あり×メロ空き", "詞一部×メロあり", "詞一部×メロ空き", "詞空き×メロあり", "詞空き×メロ空き"];
    const missing = need.filter((k) => !combos.has(k));
    report("6b", "状態の組が少なくとも1枚に登場（本枚）", missing.length ? "FAIL" : "PASS", missing.join(","));
  }
}

await b.close();
const fails = results.filter((r) => r.status === "FAIL");
console.log("\n結果: PASS", results.filter((r) => r.status === "PASS").length,
  "/ PEND", results.filter((r) => r.status === "PEND").length,
  "/ FAIL", fails.length);
process.exit(fails.length ? 1 : 0);
