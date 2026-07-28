/* verify.mjs — v7 の機械検証（制作計画§7のスクリプト側9項目）。
 *
 * 実行: node verify.mjs
 * 枚がまだ無い項目は PEND（保留）として通す。データに対して今すぐ走る項目
 * （1 アクセント照合・3 小節の連続性・4 参照の実在・6a 状態の網羅）は常に実測する。
 * ブラウザ項目（2 印の導出・5 出所照合・7 操作割当・8 レイアウト実測・9 隔離）は
 * skeleton.html に登録された全枚（demo含む）を対象に実測する。
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

/* ---------------- 検証1: アクセント照合（accent.py を再実行して突き合わせ） ---------------- */
{
  const entries = [];
  for (const id of Object.keys(D.phraseById)) {
    const u = D.phraseById[id];
    if (u.accent) entries.push({ id, accent: u.accent });
  }
  for (const c of [...D.lyrCands]) if (c.accent) entries.push({ id: c.id, accent: c.accent });
  const r = spawnSync(PY, ["accent.py"], {
    cwd: AUDIO_DIR, input: entries.map((e) => e.accent.src).join("\n"),
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
      if (o.mora_total !== e.accent.moras.length) bad.push(`${e.id}: モーラ数 ${e.accent.moras.length} vs 実測 ${o.mora_total}`);
      if (JSON.stringify(o.hl) !== JSON.stringify(e.accent.hl)) bad.push(`${e.id}: HL列が実測と不一致`);
      const ap = [];
      let cur = 0;
      for (const t of o.trans) { ap.push(cur); if (t === "|") cur++; }
      if (JSON.stringify(ap) !== JSON.stringify(e.accent.ap)) bad.push(`${e.id}: アクセント句の切れ目が実測と不一致`);
    }
  }
  report(1, "アクセント照合（全歌詞・全候補語を accent.py に再実行）",
    bad.length ? "FAIL" : "PASS",
    bad.length ? bad.join(" / ") : `${entries.length}文一致`);
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
      /* セクション内のユニットは範囲を過不足なく敷き詰める */
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

/* ---------------- 検証4a: 参照idの実在（データ側。枚間の数値整合はDOM側=検証4bで） ---------------- */
{
  /* data.js は読み込み時に参照検証で例外を投げる＝ここまで来ていれば実在は成立 */
  const nRefs = Object.keys(D.phraseById).filter((id) => D.phraseById[id].sameAs).length +
    D.lyrCands.length + D.melCands.length + 3;
  report(4, "参照idの実在（データ側）", "PASS", `sameAs/target/refs 計${nRefs}件を読込時検証済み`);
}

/* ---------------- 検証6a: 句の状態の網羅（データから機械列挙） ---------------- */
function lyricState(u) {
  const notes = resolveNotes(u);
  if (!u.words) return "空き";
  const m = u.accent ? u.accent.moras.length : 0;
  if (notes && notes.length > m) return "一部";
  if (!notes && u.plan) return "一部";
  return "あり";
}
function resolveNotes(u) {
  if (!u.notes) return null;
  if (Array.isArray(u.notes)) return u.notes;
  return resolveNotes(D.phraseById[u.notes.ref]);
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

/* ---------------- ブラウザ側（2・4b・5・7・8・9） ---------------- */
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
  report(0, "ページ読み込み（登録時検査＝CSS接頭辞・案の宣言を含む）", "FAIL", pageErrors.join(" / "));
} else {
  const nSheets = await p.evaluate(() => document.querySelectorAll(".frame").length);
  report(0, "ページ読み込み（登録時検査＝CSS接頭辞・案の宣言を含む）", "PASS", `${nSheets}枚`);
}

/* 検証2: 印の導出照合（手置き検出＋規則関数の出力との一致） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    /* (a) 印を持つ全要素に data-mk="rule" が付いているか（手置き検出） */
    document.querySelectorAll(".c-mk-r,.c-mk-y,.c-fd-r,.c-fd-y,.c-pr-i").forEach((e2) => {
      if (e2.getAttribute("data-mk") !== "rule") {
        bad.push("手置きの印: " + (e2.className || e2.tagName));
      }
    });
    /* (b) 枚ごとに、文字区画・断片音符の印の集合を宣言された案で再計算した集合と照合 */
    document.querySelectorAll(".frame").forEach((f) => {
      const opts = JSON.parse(f.getAttribute("data-marks-opts"));
      const sheet = f.getAttribute("data-sheet");
      f.querySelectorAll("[data-phrase]").forEach((ph) => {
        const id = ph.getAttribute("data-phrase");
        const u = V7DATA.phraseById[id];
        if (!u || !u.accent) return;
        /* 印が出るべき場所＝実PianoRoll断片の音符（.c-pr-n）と、通しの面の
           時間揃え文字（.c-fr の .c-tc）。高低線のカナ行（.c-cmp）は印を出さない
           （印は断片側の音符に付ける、という既裁定の作法）＝照合から除外 */
        if (ph.classList.contains("c-cmp")) return;
        const cellRoot = ph.matches(".c-pr,.c-fr") ? ph : ph;
        const cells = cellRoot.querySelectorAll(".c-fr .c-tc[data-nc], .c-pr-n[data-nr]");
        if (!cells.length) return;
        /* 部品単位で案を上書きした場合（data-marks-opts が要素に付く）はそちらで照合 */
        const ovEl = ph.closest("[data-marks-opts]");
        const useOpts = ovEl && !ovEl.classList.contains("frame") ? JSON.parse(ovEl.getAttribute("data-marks-opts")) : opts;
        const expected = new Set(V7C.marksOf(u, useOpts).map((m) => m.i + ":" + m.color));
        const got = new Set();
        cells.forEach((c) => {
          const key = (c.getAttribute("data-nc") || c.getAttribute("data-nr") || "").split(":")[1];
          if (c.classList.contains("c-mk-r")) got.add(key + ":r");
          if (c.classList.contains("c-mk-y")) got.add(key + ":y");
        });
        for (const g2 of got) if (!expected.has(g2)) bad.push(`枚${sheet} ${id}: 規則に無い印 ${g2}`);
        for (const e2 of expected) {
          const i = +e2.split(":")[0];
          const hasCell = [...cells].some((c) => ((c.getAttribute("data-nc") || c.getAttribute("data-nr") || "").split(":")[1]) === String(i));
          if (hasCell && !got.has(e2)) bad.push(`枚${sheet} ${id}: 規則の印が出ていない ${e2}`);
        }
      });
    });
    return bad;
  });
  report(2, "印の導出照合（手置きなし・宣言された案と一致）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証4b: 枚間の数値整合（事実の小札=データからの機械算出のみ） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll(".c-fact").forEach((e2) => {
      const inCand = e2.closest(".c-cand");
      if (inCand) { if (e2.getAttribute("data-src") == null) bad.push("出所なしバッジ: " + e2.textContent); }
      else if (e2.getAttribute("data-calc") == null) bad.push("機械算出でない小札: " + e2.textContent);
    });
    return bad;
  });
  report("4b", "枚間の数値整合（小札は全て data-calc/data-src 経由）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証5: 表示データの出所照合（DOMの歌詞・バッジ文字列がデータ由来と一致） */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const C = V7C, M = V7MARKS, D2 = V7DATA;
    function expectFor(src) {
      const [kind, a, b2] = src.split(":");
      const u = D2.phraseById[a] || D2.candById[a] || D2.planById[a] || D2.sectionById[a];
      switch (kind) {
        case "lyric": return [C.displayText(u)];
        case "mora": return [u.accent.moras[+b2]];
        case "lyricafter": return [u.accent.moras.slice(C.notesOf(u).length).join("")];
        case "imi": return [u.imi];
        case "plan": {
          const pl = D2.planById[a];
          return [C.planChipText(pl), pl.memo, pl.onsu, pl.bars && pl.bars + "小節", pl.hl && "読み " + pl.hl].filter(Boolean);
        }
        case "cand": return [u.word];
        case "same": {
          const ref = D2.sectionById[u.sameMelodyAs];
          return ["同じメロ: " + ref.name];
        }
        case "frame": {
          const fc = C.frameFieldContent(a);
          const out = [fc.lines.join(""), ...fc.lines];
          /* 候補依頼フォームの音数・読みの高低の欄値も同じ導出（requestForm と同式） */
          const ns = C.notesOf(u);
          if (ns && C.slotIdxs(u).length) {
            const ys = C.slotIdxs(u).map((i) => ns[i].y);
            out.push(String(C.slotIdxs(u).length), M.hlText(M.slotSuggestHL(ys)));
          } else if (!ns && u.accent) {
            out.push(String(u.accent.moras.length), M.hlText(u.accent.hl));
          }
          return out;
        }
        case "badge": {
          const c = D2.candById[a];
          const tgt = D2.phraseById[c.target];
          const opts = JSON.parse(c._el.closest(".frame").getAttribute("data-marks-opts"));
          const badges = c.word
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
      if (kind === "badge") { const c = V7DATA.candById[a]; c._el = e2; }
      let exp;
      try { exp = expectFor(src); } catch (err) { bad.push(src + ": " + err.message); return; }
      if (!exp) { bad.push("不明な出所種別: " + src); return; }
      /* 比較は空白（改行・全角空白含む）を除去して行う（<br>や語間空白の差を吸収） */
      const norm = (s) => String(s).replace(/\s+/g, "");
      const t = norm(e2.textContent);
      if (!exp.some((x) => x != null && norm(x) === t)) {
        bad.push(`${src}: 表示「${e2.textContent.trim()}」がデータ由来と一致しない（期待 ${exp[0]}）`);
      }
    });
    /* 出所なしの歌詞・バッジ直書きの検出 */
    document.querySelectorAll(".c-ly > span:not([data-src]):not(.c-dslot):not(.c-placebtn):not(.c-stockpos):not(.c-inp):not(.c-pop)").forEach((e2) => {
      if (e2.textContent.trim() && !e2.querySelector("[data-src]") && !e2.closest(".c-pop") ) bad.push("出所なしの歌詞テキスト: " + e2.textContent.slice(0, 12));
    });
    document.querySelectorAll(".c-cand-w:not([data-src]), .c-tc:not([data-src])").forEach((e2) => {
      if (e2.textContent.trim()) bad.push("出所なしの表示: " + e2.textContent.slice(0, 12));
    });
    return bad;
  });
  report(5, "表示データの出所照合（歌詞・モーラ・バッジ・予定が全てデータ由来）", r.length ? "FAIL" : "PASS", r.slice(0, 8).join(" / "));
}

/* 検証7: 操作割当の一致（data-ops-table の文面 = データの opsTableText） */
{
  const r = await p.evaluate(() => {
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const want = norm(V7DATA.opsTableText);
    const bad = [];
    const els = document.querySelectorAll("[data-ops-table]");
    els.forEach((e2) => { if (norm(e2.textContent) !== want) bad.push("割当表の文面が opsTableText と不一致"); });
    return { n: els.length, bad };
  });
  if (r.bad.length) report(7, "操作割当の一致", "FAIL", r.bad.join(" / "));
  else if (!r.n) report(7, "操作割当の一致", "PEND", "割当表を含む枚がまだ無い（枚1・枚8で必須）");
  else report(7, "操作割当の一致", "PASS", `${r.n}箇所一致`);
}

/* 検証8: レイアウト実測 */
{
  const r = await p.evaluate(() => {
    const bad = [];
    const L = V7C.LAYOUT;
    /* (a) モーラ区画と音符矩形の縦揃え（同じ句の同じ音符番号どうし・1px以内） */
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
    /* (b) 断片の音符が親からはみ出て切れていないか */
    document.querySelectorAll(".c-pr").forEach((pr) => {
      const R = pr.getBoundingClientRect();
      pr.querySelectorAll(".c-pr-n").forEach((n) => {
        const r2 = n.getBoundingClientRect();
        if (r2.right > R.right + 0.5) bad.push("断片の音符が右で切れる: " + (n.getAttribute("data-nr") || ""));
      });
    });
    /* (c) 文字のはみ出し */
    document.querySelectorAll(".c-ly,.c-fact,.c-op,.c-dslot,.c-legend,.c-cand-dest,.c-opstable,.c-field-fill,.c-samechip").forEach((e2) => {
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
  report(8, "レイアウト実測（縦揃え1px・切れ・はみ出し・352px・高低線2値）", r.length ? "FAIL" : "PASS", r.slice(0, 10).join(" / "));
}

/* 検証9: 隔離（desc/st 非表示状態で設計論の語が絵に残らない） */
{
  await p.addStyleTag({ content: ".desc,.st{display:none !important}" });
  const r = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll(".frame").forEach((f) => {
      const t = f.innerText;
      ["裁定", "欠陥", "§", "v4", "v5", "v6", "R-1", "却下", "廃止", "工程"].forEach((wd) => {
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
    document.querySelectorAll(".frame:not([data-demo])" ).forEach((f) => {
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
