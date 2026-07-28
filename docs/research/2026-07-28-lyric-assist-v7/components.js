/* v7 components.js — 共通部品（唯一の実装）。工程1はインスタンス化のみ可・再実装禁止。
 *
 * 前提: data.js（V7DATA）と marks.js（V7MARKS）を先に読み込むこと。
 *
 * 使い方（枚の登録）:
 *   V7C.registerSheet({
 *     id: "b1",              // 枚id ＝ CSSクラス接頭辞（この枚のCSSクラスは全て "b1-" で始めること）
 *     no: 1,                 // 表示順
 *     title: "歌詞全体画面・素の表示",
 *     wide: false,           // 幅広の枚（枚7・枚8相当）だけ true。電話枠の枚は false（352px検査対象）
 *     demo: false,           // true = 部品の自己点検用（配布スクショから除外）
 *     marksOpts: { flatPair: "ア", yellowUse: "B" },   // この枚が使う印の案の宣言（検証が突き合わせる）
 *     css: "...",            // この枚専用のCSS（クラス接頭辞を機械検査する）
 *     build(root) { ... }    // root に部品を組み立てる。部品は V7C.* だけを使う
 *   });
 *
 * 座標の規則（過去の振幅潰し事故の再発防止）:
 *   すべての座標は LAYOUT の定数からだけ計算する。SVGパスの手書き禁止。
 *   高低線の y は LAYOUT.HL_HI / LAYOUT.HL_LO の2値ちょうど（検証が実測する）。
 *   モーラ区画の x位置・幅は対応する音符矩形と同じ式から出す（縦揃え・検証が1px以内を実測）。
 *
 * 印の規則: 印を出すのは markCell()/markNote() 経由のみ（data-mk="rule" が付く）。
 *   印の色・位置は V7MARKS.computeMarks() の出力だけから決まる。手置き禁止。
 */
(function (g) {
  "use strict";
  var D = g.V7DATA, M = g.V7MARKS;
  if (!D || !M) throw new Error("data.js と marks.js を先に読み込むこと");

  /* ================= 描画定数（1か所に閉じる） ================= */
  var LAYOUT = {
    TIME_W: 256,        // 句の時間グリッド（データの x/w の単位・小さいメロ表示の既定幅）
    MELO_H: 24,         // 縮小ピアノロールの viewBox 高さ
    MELO_NOTE_H: 5,     // 縮小ピアノロールの音符矩形の高さ
    PR_INNER_W: 292,    // 実PianoRoll断片の内側の幅(px)
    PR_PAD_L: 1,        // 断片の枠線ぶんの左オフセット(px)
    PR_H: 104,          // 断片の高さ(px)
    PR_PAD_T: 6, PR_PAD_B: 6,
    PR_NOTE_H: 12,      // 断片の音符の高さ(px)
    PITCH_RANGE: 24,    // 相対音高 y の値域（0=一番上）
    HL_GRAPH: 40,       // 高低線のグラフ高さ(px)
    HL_HI: 12, HL_LO: 32,  // 高い/低いの y（段差20px。この2値以外に点を置かない）
    HL_PHR_Y: 3,        // アクセント句バーの y
    HL_DOT: 2.6,        // 高低線の点の半径
    HL_KANA_H: 20,      // 高低線の下のカナ行の高さ(px)
    FR_H: 20,           // 時間揃え文字の行の高さ(px)
  };
  var SVGNS = "http://www.w3.org/2000/svg";

  /* ================= 小さな道具 ================= */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function px(v) { return Math.round(v * 10) / 10; }

  /* ================= データ読み出し（全て id 経由） ================= */
  function phrase(id) {
    var u = D.phraseById[id];
    if (!u) throw new Error("句がない: " + id);
    return u;
  }
  function section(id) {
    var s = D.sectionById[id];
    if (!s) throw new Error("セクションがない: " + id);
    return s;
  }
  function cand(id) {
    var c = D.candById[id];
    if (!c) throw new Error("候補がない: " + id);
    return c;
  }
  /* 音符列の解決（{ref:} は借用元へ。座標データを二重に書かない） */
  function notesOf(u) {
    if (!u.notes) return null;
    if (Array.isArray(u.notes)) return u.notes;
    if (u.notes.ref) return notesOf(phrase(u.notes.ref));
    return null;
  }
  function morasOf(u) { return u.accent ? u.accent.moras : []; }
  /* モーラ i ↔ 音符 i（恒等対応）。音符が無いモーラは null */
  function ysOf(u) {
    var ns = notesOf(u) || [];
    return morasOf(u).map(function (_, i) { return i < ns.length ? ns[i].y : null; });
  }
  /* 空きの枠＝歌詞モーラより後ろの音符（noLyric の句は空きではない） */
  function slotIdxs(u) {
    var ns = notesOf(u) || [];
    if (u.noLyric) return [];
    var m = morasOf(u).length;
    var out = [];
    for (var i = m; i < ns.length; i++) out.push(i);
    return out;
  }
  function displayText(u) { return (u.words || []).join("　"); }
  function barsLabel(u) {
    if (!u.bars) return "";
    return u.bars[0] === u.bars[1] ? u.bars[0] + "小節" : u.bars[0] + "–" + u.bars[1] + "小節";
  }
  /* 印（唯一の導出経路）。opts 省略時は今組み立て中の枚の宣言を使う */
  function marksOf(u, opts) {
    if (!u.accent) return [];
    return M.computeMarks(u.accent.hl, u.accent.ap, ysOf(u), opts || currentOpts());
  }
  /* 宛先ラベル（候補カード用） */
  function destLabel(u) {
    var sec = section(u.section);
    var sg = D.songs[u.song];
    return "宛先: " + sg.title.replace(/（.*$/, "") + " › " + sec.name + " › " + barsLabel(u).replace("小節", "小節の句");
  }

  /* ================= 印の付与（この2つ以外から印を出さない） ================= */
  function markCell(cell, mk) {
    cell.classList.add(mk.color === "r" ? "c-mk-r" : "c-mk-y");
    cell.setAttribute("data-mk", "rule");
    cell.setAttribute("data-mk-why", mk.why);
  }
  function markNote(noteEl, container, mk, leftPx, topPx) {
    noteEl.classList.add(mk.color === "r" ? "c-mk-r" : "c-mk-y");
    noteEl.setAttribute("data-mk", "rule");
    noteEl.setAttribute("data-mk-why", mk.why);
    var dot = el("i", "c-pr-i" + (mk.color === "r" ? " c-pr-i-r" : ""), "i");
    dot.setAttribute("data-mk", "rule");
    dot.style.left = px(leftPx) + "px";
    dot.style.top = px(Math.max(0, topPx - 13)) + "px";
    container.appendChild(dot);
  }

  /* ================= 枚の登録と描画 ================= */
  var sheets = [];
  var _current = null;
  function currentOpts() {
    return (_current && _current.marksOpts) || M.DEFAULT_OPTS;
  }
  var CLASS_RE = /\.(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g;
  function registerSheet(sh) {
    if (!sh || !sh.id || !/^[a-z][a-z0-9]*$/.test(sh.id)) throw new Error("枚idは英小文字+数字: " + (sh && sh.id));
    if (sheets.some(function (s) { return s.id === sh.id; })) throw new Error("枚id重複: " + sh.id);
    if (typeof sh.build !== "function") throw new Error("build が無い: " + sh.id);
    if (!sh.marksOpts || M.OPTS.flatPair.indexOf(sh.marksOpts.flatPair) < 0 ||
        M.OPTS.yellowUse.indexOf(sh.marksOpts.yellowUse) < 0) {
      throw new Error("枚 " + sh.id + ": marksOpts（flatPair:ア|イ, yellowUse:A|B）の宣言が必要");
    }
    if (sh.css) {
      var m2, bad = [];
      CLASS_RE.lastIndex = 0;
      while ((m2 = CLASS_RE.exec(sh.css))) {
        if (m2[1].indexOf(sh.id + "-") !== 0) bad.push("." + m2[1]);
      }
      if (bad.length) throw new Error("枚 " + sh.id + " のCSSに接頭辞違反のクラス: " + bad.join(" ") +
        "（この枚のクラスは全て " + sh.id + "- で始める。共通部品の見た目を変えたいときは工程0へ依頼）");
    }
    sheets.push(sh);
  }
  function renderAll(container) {
    sheets.sort(function (a, b) { return (a.no || 99) - (b.no || 99); });
    sheets.forEach(function (sh) {
      var fr = el("div", "frame" + (sh.wide ? " wide" : ""));
      fr.setAttribute("data-sheet", sh.id);
      if (sh.demo) fr.setAttribute("data-demo", "1");
      fr.setAttribute("data-marks-opts", JSON.stringify(sh.marksOpts));
      var h = el("h2", "c-fcap");
      var no = el("span", "c-fcap-no", String(sh.no != null ? sh.no : "?"));
      h.appendChild(no);
      h.appendChild(document.createTextNode(sh.title || sh.id));
      fr.appendChild(h);
      if (sh.css) {
        var st = document.createElement("style");
        st.textContent = sh.css;
        fr.appendChild(st);
      }
      var body = el("div");
      fr.appendChild(body);
      _current = sh;
      try { sh.build(body); } finally { _current = null; }
      container.appendChild(fr);
    });
  }

  /* ================= 部品 ================= */
  var alignSeq = 0;

  /** 電話枠。opts: {title, crumb(パンくず文字列), tab:"素"|"音韻"|"イントネーション"|null,
   *  legend: 文字列|null, playbar:true} 子要素は children 配列。 */
  function phone(opts, children) {
    var ph2 = el("div", "c-ph");
    var hd = el("div", "c-hd");
    hd.appendChild(el("span", "c-back", "← 戻る"));
    if (opts.crumb) {
      var cr = el("span", "c-crumb");
      cr.innerHTML = "";
      cr.textContent = opts.crumb;
      hd.appendChild(cr);
    } else {
      hd.appendChild(el("span", "c-ttl", opts.title || ""));
    }
    if (opts.headBtn) hd.appendChild(el("span", "c-hbtn", opts.headBtn));
    ph2.appendChild(hd);
    if (opts.tab !== undefined && opts.tab !== null) {
      var seg = el("div", "c-seg");
      ["素", "音韻", "イントネーション"].forEach(function (t) {
        seg.appendChild(el("span", t === opts.tab ? "c-seg-on" : "", t));
      });
      ph2.appendChild(seg);
    }
    if (opts.legend) ph2.appendChild(el("div", "c-legend", opts.legend));
    (children || []).forEach(function (c) { ph2.appendChild(c); });
    if (opts.playbar !== false) ph2.appendChild(playbar());
    return ph2;
  }

  /** 再生バー */
  function playbar() {
    var pb = el("div", "c-playbar");
    pb.appendChild(el("span", "c-pb", "|◀"));
    pb.appendChild(el("span", "c-pb c-pb-play", "▶"));
    pb.appendChild(el("span", "c-pb", "⟳"));
    pb.appendChild(el("span", "c-pb c-pb-sp", "1:1"));
    pb.appendChild(el("span", "c-pb", "◀)))"));
    return pb;
  }

  /** 凡例（既定文）。kind: "plain"（通しの面・素）| "into"（イントネーション）| 文字列そのまま */
  function legendText(kind) {
    if (kind === "plain") return "上段=メロの縮小表示（矩形の横幅=音の長さ・縦=相対の音高。タップで編集画面）。行の右端の●=印のある箇所あり（赤=アクセント逆行・黄=注意）。印なし=指摘なし";
    if (kind === "into") return "赤=アクセント逆行・黄=注意・印なし=指摘なし（印は文字への下線。既存の韻律チェックと同じ作法）";
    return kind;
  }

  /** 縮小ピアノロール（メロの矩形）。unitId の音符列（ref解決込み）を描く。
   *  opts: {width(px・既定=TIME_W), vw(データ幅・既定=TIME_W か stock の w), ghost} */
  function melo(unitId, opts) {
    opts = opts || {};
    var u = phrase(unitId);
    var ns = notesOf(u);
    if (!ns) return meloNone();
    var vw = opts.vw || u.w || LAYOUT.TIME_W;
    var w = opts.width || vw;
    var h = Math.round(LAYOUT.MELO_H * (w / vw));
    var wrap = el("div", "c-melo" + (opts.ghost ? " c-ghost" : ""));
    wrap.style.height = h + "px";
    var svg = sv("svg", { width: w, height: h, viewBox: "0 0 " + vw + " " + LAYOUT.MELO_H });
    var bands = u.band || [[0, vw]];
    bands.forEach(function (b) {
      svg.appendChild(sv("rect", { class: "c-band", x: b[0], y: 3, width: b[1], height: 18, rx: 4 }));
    });
    ns.forEach(function (n, i) {
      var r = sv("rect", { class: "c-nt", x: n.x, y: n.y, width: n.w, height: LAYOUT.MELO_NOTE_H, rx: 1.5 });
      r.setAttribute("data-nr", unitId + ":" + i);
      svg.appendChild(r);
    });
    wrap.appendChild(svg);
    return wrap;
  }
  /** メロ未定のときの薄い余白（帯なし） */
  function meloNone() { return el("div", "c-melo c-melo-none"); }

  /** 素の表示の歌詞行（通しの面）。plan があれば予定チップ、noLyric なら横棒。 */
  function lyricLine(unitId) {
    var u = phrase(unitId);
    var ly = el("div", "c-ly");
    if (u.words) {
      var sp = el("span", null, displayText(u));
      sp.setAttribute("data-src", "lyric:" + unitId);
      ly.appendChild(sp);
    }
    if (u.plan) ly.appendChild(planChip(u.plan));
    return ly;
  }

  /** 予定チップ（点線の小箱）。表示文字列は予定の欄（メモ・音数・小節数・読みの高低）から機械結合 */
  function planChipText(plan) {
    var parts = [];
    if (plan.memo) parts.push(plan.memo);
    if (plan.onsu) parts.push(plan.onsu);
    if (plan.bars) parts.push(plan.bars + "小節");
    if (plan.hl) parts.push("読み " + plan.hl);
    return parts.join("・");
  }
  function planChip(plan) {
    var c = el("span", "c-dslot", planChipText(plan));
    c.setAttribute("data-src", "plan:" + plan.id);
    return c;
  }

  /** 時間揃えの下段（.c-fr）。mode:
   *   "slots"  … 空きの枠だけ（詞が無い音符の位置に枠。全空きにも語尾空きにも使う）
   *   "bar"    … 詞なしの横棒（noLyric）
   *   "kana"   … 文字を音符の時間位置に置く（イントネーション表示）。印は規則から。
   *  幅は melo と同じ w/vw 比で置く（縦揃え）。 */
  function timeRow(unitId, mode, opts) {
    opts = opts || {};
    var u = phrase(unitId);
    var ns = notesOf(u) || [];
    var vw = opts.vw || u.w || LAYOUT.TIME_W;
    var w = opts.width || vw;
    var f = w / vw;
    var fr = el("div", "c-fr");
    fr.setAttribute("data-phrase", unitId);
    if (mode === "bar") {
      ns.forEach(function (n, i) {
        var b = el("span", "c-bar2");
        b.style.left = px(n.x * f) + "px";
        b.style.width = px(n.w * f) + "px";
        b.setAttribute("data-nc", unitId + ":" + i);
        fr.appendChild(b);
      });
      var lab = el("span", "c-frlab", "詞なし");
      fr.appendChild(lab);
      return fr;
    }
    var moras = morasOf(u);
    var mks = {};
    if (mode === "kana") marksOf(u, opts.marksOpts).forEach(function (mk) { mks[mk.i] = mk; });
    /* 案を部品単位で上書きした場合は宣言を要素に残す（検証2が枚の宣言の代わりに照合する。
       印の規則表のように1枚の中で複数の案を並べる枚のための正規の道） */
    if (opts.marksOpts) fr.setAttribute("data-marks-opts", JSON.stringify(opts.marksOpts));
    ns.forEach(function (n, i) {
      if (i < moras.length && mode === "kana") {
        var tc = el("span", "c-tc", moras[i]);
        tc.style.left = px(n.x * f) + "px";
        tc.style.width = px(n.w * f) + "px";
        tc.setAttribute("data-nc", unitId + ":" + i);
        tc.setAttribute("data-src", "mora:" + unitId + ":" + i);
        if (mks[i]) markCell(tc, mks[i]);
        fr.appendChild(tc);
      } else if (i >= moras.length && !u.noLyric) {
        var kb = el("span", "c-kb2");
        kb.style.left = px(n.x * f) + "px";
        kb.style.width = px(n.w * f) + "px";
        kb.setAttribute("data-nc", unitId + ":" + i);
        fr.appendChild(kb);
      }
    });
    /* 音符よりモーラが多い（メロ未定の続き）は文字のまま後ろに置く */
    if (mode === "kana" && moras.length > ns.length && ns.length) {
      var lastN = ns[ns.length - 1];
      var after = el("span", "c-fr-after", moras.slice(ns.length).join(""));
      after.setAttribute("data-src", "lyricafter:" + unitId);
      after.style.left = px((lastN.x + lastN.w) * f + 10) + "px";
      fr.appendChild(after);
    }
    return fr;
  }

  /** 通しの面の句の一行（メロ小表示＋下段＋右の小節ラベル・印の要約ドット）。
   *  view: "plain" | "into"。opts: {now:true(再生中の強調)} */
  function phraseRow(unitId, view, opts) {
    opts = opts || {};
    var u = phrase(unitId);
    var ns = notesOf(u);
    var row = el("div", "c-ku" + (opts.now ? " c-ku-now" : ""));
    row.setAttribute("data-phrase", unitId);
    var scope = "s" + (++alignSeq);
    row.setAttribute("data-align-scope", scope);
    if (opts.now) row.appendChild(el("span", "c-nowmark", "▶"));
    var krow = el("div", "c-krow");
    var main = el("div", "c-kmain");
    main.appendChild(ns ? melo(unitId) : meloNone());
    if (view === "into" && u.words && ns) {
      main.appendChild(timeRow(unitId, "kana"));
    } else if (u.noLyric) {
      main.appendChild(timeRow(unitId, "bar"));
    } else if (u.words) {
      main.appendChild(lyricLine(unitId));
      if (ns && slotIdxs(u).length) main.appendChild(timeRow(unitId, "slots"));
    } else if (ns) {
      if (u.plan) main.appendChild(lyricLine(unitId));
      main.appendChild(timeRow(unitId, "slots"));
    } else {
      main.appendChild(lyricLine(unitId)); // 予定チップだけの行（詞もメロも無い句）
    }
    krow.appendChild(main);
    var side = el("div", "c-kside");
    var mks = marksOf(u);
    if (mks.some(function (m) { return m.color === "r"; })) {
      var fd = el("span", "c-fd c-fd-r"); fd.setAttribute("data-mk", "rule"); side.appendChild(fd);
    } else if (mks.length) {
      var fd2 = el("span", "c-fd c-fd-y"); fd2.setAttribute("data-mk", "rule"); side.appendChild(fd2);
    }
    if (u.bars) side.appendChild(el("span", null, barsLabel(u)));
    krow.appendChild(side);
    row.appendChild(krow);
    if (u.imi) {
      var im = el("div", "c-imi", u.imi);
      im.setAttribute("data-src", "imi:" + unitId);
      row.appendChild(im);
    }
    return row;
  }

  /** セクション見出し。opts: {} … データから 仮・小節数・同じメロ表示を機械で出す */
  function sectionHead(secId) {
    var s = section(secId);
    var head = el("div", "c-sec" + (s.kari ? " c-sec-kari" : ""));
    head.setAttribute("data-section", secId);
    head.appendChild(el("span", "c-grip", "⋮⋮"));
    head.appendChild(el("span", "c-sname", s.name));
    if (s.kari) head.appendChild(el("span", "c-karichip", "仮"));
    var lenTxt = s.barsText || (s.bars ? (s.bars[1] - s.bars[0] + 1) + "小節" : "");
    if (s.noSing) lenTxt += "（歌なし）";
    head.appendChild(el("span", "c-sbars", lenTxt));
    if (s.sameMelodyAs) {
      var ref = section(s.sameMelodyAs);
      var chip = el("span", "c-samechip", "同じメロ: " + ref.name);
      chip.setAttribute("data-src", "same:" + secId);
      head.appendChild(chip);
    }
    if (s.kari) head.appendChild(el("span", "c-secbtn", "確定にする"));
    return head;
  }

  /** まだ何も無い区間（点線）。予定があれば予定チップを併記。 */
  function zoneRow(zoneId) {
    var z = phrase(zoneId);
    var zn = el("div", "c-zone");
    zn.setAttribute("data-phrase", zoneId);
    zn.appendChild(el("span", null, "まだ何も無い区間"));
    if (z.plan) zn.appendChild(planChip(z.plan));
    if (z.bars) zn.appendChild(el("span", "c-zone-pos", barsLabel(z)));
    return zn;
  }

  /** まだ並びに入れていないもの（断片）の一行 */
  function stockRow(stockId) {
    var st = phrase(stockId);
    var row = el("div", "c-ku c-stockku");
    row.setAttribute("data-phrase", stockId);
    row.appendChild(melo(stockId, { vw: st.w }));
    var ly = el("div", "c-ly");
    var sp = el("span", null, displayText(st));
    sp.setAttribute("data-src", "lyric:" + stockId);
    ly.appendChild(sp);
    ly.appendChild(el("span", "c-placebtn", "並びに入れる"));
    ly.appendChild(el("span", "c-stockpos", "場所: " + (st.place || "未定")));
    row.appendChild(ly);
    return row;
  }
  function stockHead() { return el("div", "c-stockhd", "まだ並びに入れていないもの"); }

  /** 追加操作の行（＋セクションを足す 等）。labels: 文字列配列 */
  function addRow(labels) {
    var r = el("div", "c-addrow");
    labels.forEach(function (t) { r.appendChild(el("span", "c-addbtn", t)); });
    return r;
  }

  /* ---------------- 範囲の編集画面まわり ---------------- */

  /** 実PianoRoll断片（読み取り専用）。音符・カナ・印を LAYOUT の式から描く。
   *  メロが無い句は「まだメロがありません」の空表示。 */
  function prFragment(unitId, opts) {
    opts = opts || {};
    var u = phrase(unitId);
    var ns = notesOf(u);
    if (!ns) {
      var e = el("div", "c-pr-empty", "まだメロがありません");
      e.setAttribute("data-phrase", unitId);
      return e;
    }
    var moras = morasOf(u);
    var box = el("div", "c-pr");
    box.setAttribute("data-phrase", unitId);
    if (opts.marksOpts) box.setAttribute("data-marks-opts", JSON.stringify(opts.marksOpts));
    var sx = LAYOUT.PR_INNER_W / LAYOUT.TIME_W;
    var ystep = (LAYOUT.PR_H - LAYOUT.PR_PAD_T - LAYOUT.PR_PAD_B - LAYOUT.PR_NOTE_H) / LAYOUT.PITCH_RANGE;
    /* 小節の区切り線（句の小節数で等分） */
    var nbars = u.bars ? (u.bars[1] - u.bars[0] + 1) : 2;
    for (var b = 1; b < nbars; b++) {
      var bl = el("div", "c-pr-bl");
      bl.style.left = px(LAYOUT.PR_PAD_L + (LAYOUT.PR_INNER_W * b) / nbars) + "px";
      box.appendChild(bl);
    }
    var mks = {};
    marksOf(u, opts.marksOpts).forEach(function (mk) { mks[mk.i] = mk; });
    ns.forEach(function (n, i) {
      var left = LAYOUT.PR_PAD_L + n.x * sx;
      var top = LAYOUT.PR_PAD_T + n.y * ystep;
      var ne = el("div", "c-pr-n", i < moras.length ? moras[i] : "");
      if (i < moras.length) ne.setAttribute("data-src", "mora:" + unitId + ":" + i);
      ne.setAttribute("data-nr", unitId + ":" + i);
      ne.style.left = px(left) + "px";
      ne.style.top = px(top) + "px";
      ne.style.width = px(n.w * sx) + "px";
      box.appendChild(ne);
      if (mks[i]) markNote(ne, box, mks[i], left + n.w * sx / 2 - 5, top);
    });
    return box;
  }
  function prCaption() {
    return el("div", "c-prcap", "実メロの断片（読み取り専用・赤/黄の印は音符側）。タップするとピアノロールが開きます");
  }

  /** 高低線（読んだときの高低・2値）＋カナ行。
   *  メロがある句: 区画のx位置・幅は真上の実PianoRoll断片の音符矩形と同じ式（縦揃え）。
   *  メロが無い句: 文字の並びに沿って等間隔。
   *  詞が無い音符の位置は空きの枠だけ（読みが未知であることを埋めない）。 */
  function hlRow(unitId, opts) {
    opts = opts || {};
    var u = phrase(unitId);
    var ns = notesOf(u);
    var moras = morasOf(u);
    var acc = u.accent;
    var W = LAYOUT.PR_INNER_W;
    var wrap = el("div", "c-cmp");
    wrap.setAttribute("data-phrase", unitId);
    wrap.style.height = (LAYOUT.HL_GRAPH + 2 + LAYOUT.HL_KANA_H) + "px";
    var svg = sv("svg", { width: W + LAYOUT.PR_PAD_L, height: LAYOUT.HL_GRAPH,
      viewBox: "0 0 " + (W + LAYOUT.PR_PAD_L) + " " + LAYOUT.HL_GRAPH });
    svg.setAttribute("data-hl", unitId);
    wrap.appendChild(svg);
    var sx = W / LAYOUT.TIME_W;
    /* 各モーラの区画 [left,width] を音符（あれば）か等間隔（なければ）から決める */
    var cells = [];
    for (var i = 0; i < moras.length; i++) {
      if (ns && i < ns.length) {
        cells.push([LAYOUT.PR_PAD_L + ns[i].x * sx, ns[i].w * sx]);
      } else if (!ns) {
        var cw = Math.floor(W / Math.max(1, moras.length));
        cells.push([LAYOUT.PR_PAD_L + i * cw, cw - 2]);
      } else {
        cells.push(null); // メロ未定の続きのモーラは高低線に出さない（時間の基準が無い）
      }
    }
    if (acc) {
      /* モーラごとの破線の縦ガイド */
      cells.forEach(function (c) {
        if (!c) return;
        var cx = c[0] + c[1] / 2;
        svg.appendChild(sv("line", { class: "c-hl-guide", x1: cx, y1: LAYOUT.HL_PHR_Y + 5, x2: cx, y2: LAYOUT.HL_GRAPH - 2 }));
      });
      /* アクセント句ごとに折れ線・点・上端のバー */
      var i0 = 0;
      while (i0 < moras.length) {
        var apv = acc.ap[i0];
        var iEnd = i0;
        while (iEnd + 1 < moras.length && acc.ap[iEnd + 1] === apv) iEnd++;
        var pts = [];
        for (var j = i0; j <= iEnd; j++) {
          if (!cells[j]) continue;
          var cx2 = cells[j][0] + cells[j][1] / 2;
          var cy = acc.hl[j] ? LAYOUT.HL_HI : LAYOUT.HL_LO;
          pts.push([cx2, cy]);
        }
        if (pts.length) {
          svg.appendChild(sv("polyline", { class: "c-hl-line",
            points: pts.map(function (p) { return px(p[0]) + "," + p[1]; }).join(" ") }));
          pts.forEach(function (p) {
            svg.appendChild(sv("circle", { class: "c-hl-dot", cx: px(p[0]), cy: p[1], r: LAYOUT.HL_DOT }));
          });
          var xa = cells[i0] ? cells[i0][0] + 2 : pts[0][0];
          var cEnd = cells[iEnd] || cells[i0];
          var xb = cEnd ? cEnd[0] + cEnd[1] - 2 : pts[pts.length - 1][0];
          svg.appendChild(sv("line", { class: "c-hl-phr", x1: px(xa), y1: LAYOUT.HL_PHR_Y, x2: px(xb), y2: LAYOUT.HL_PHR_Y }));
          svg.appendChild(sv("circle", { class: "c-hl-phrknob", cx: px((xa + xb) / 2), cy: LAYOUT.HL_PHR_Y, r: 2.4 }));
        }
        i0 = iEnd + 1;
      }
    }
    /* カナ行（高低線の下）＋空きの枠 */
    var kanaTop = LAYOUT.HL_GRAPH + 2;
    cells.forEach(function (c, i) {
      if (!c) return;
      var tc = el("span", "c-tc", moras[i]);
      tc.style.left = px(c[0]) + "px";
      tc.style.width = px(c[1]) + "px";
      tc.style.top = kanaTop + "px";
      tc.setAttribute("data-nc", ns ? unitId + ":" + i : "");
      tc.setAttribute("data-src", "mora:" + unitId + ":" + i);
      wrap.appendChild(tc);
    });
    if (ns) {
      slotIdxs(u).forEach(function (i) {
        var kb = el("span", "c-kb2");
        kb.style.left = px(LAYOUT.PR_PAD_L + ns[i].x * sx) + "px";
        kb.style.width = px(ns[i].w * sx) + "px";
        kb.style.top = kanaTop + "px";
        kb.setAttribute("data-nc", unitId + ":" + i);
        wrap.appendChild(kb);
      });
    }
    return wrap;
  }
  function hlLabel() {
    var d = el("div", "c-cmplabel");
    d.appendChild(document.createTextNode("読んだときの高低"));
    d.appendChild(el("span", "c-cmplsub", "上=高い／下=低いの2値（辞書）・上端のバー＝アクセント句の区切り"));
    return d;
  }

  /** 「音の枠」欄の機械生成文（機械が書くのはこの欄だけ・出所を明記） */
  function frameFieldContent(unitId) {
    var u = phrase(unitId);
    var ns = notesOf(u);
    var lines = [], auto = "";
    var slots = ns ? slotIdxs(u) : [];
    if (ns && slots.length) {
      var slotNs = slots.map(function (i) { return ns[i]; });
      var nbars = u.bars ? (u.bars[1] - u.bars[0] + 1) : 1;
      var barW = LAYOUT.TIME_W / nbars;
      var barNo = u.bars ? (u.bars[0] + Math.floor(slotNs[0].x / barW)) : null;
      lines.push(slots.length + "音" + (barNo ? "・" + barNo + "小節目" : ""));
      var ys = slotNs.map(function (n) { return n.y; });
      lines.push("合う読みの高低: " + M.hlText(M.slotSuggestHL(ys)));
      auto = "空きの" + slots.length + "音がメロで" + M.slotTrendText(ys) + "ので、読みの当ては自動で出しています";
    } else if (!ns && u.accent) {
      lines.push(u.accent.moras.length + "音");
      lines.push("アクセント: " + M.hlText(u.accent.hl));
      auto = "詞から自動で出しています";
    } else if (u.plan) {
      lines.push(planChipText(u.plan));
      auto = "予定から写しています";
    }
    return { lines: lines, auto: auto };
  }

  /** 意味（人が書く）と音の枠（機械が書く）の二欄。imi が無ければ空欄で出す */
  function fieldPair(unitId) {
    var u = phrase(unitId);
    var row = el("div", "c-fieldrow");
    var f1 = el("div", "c-field");
    f1.appendChild(el("h4", null, "意味（言いたいこと）"));
    if (u.imi) {
      var fill = el("div", "c-field-fill", u.imi);
      fill.setAttribute("data-src", "imi:" + unitId);
      f1.appendChild(fill);
    } else {
      f1.appendChild(el("div", "c-field-empty", "（まだ書いていない）"));
    }
    f1.appendChild(el("div", "c-field-auto", "自分で書く欄（機械は書かない）"));
    row.appendChild(f1);
    var f2 = el("div", "c-field");
    f2.appendChild(el("h4", null, "音の枠"));
    var fc = frameFieldContent(unitId);
    var fill2 = el("div", "c-field-fill");
    fill2.setAttribute("data-src", "frame:" + unitId);
    fc.lines.forEach(function (t, i) {
      if (i) fill2.appendChild(document.createElement("br"));
      fill2.appendChild(document.createTextNode(t));
    });
    f2.appendChild(fill2);
    if (fc.auto) f2.appendChild(el("div", "c-field-auto", fc.auto));
    row.appendChild(f2);
    return row;
  }

  /** 前後の句の縮小表示（薄い一行）。label 例: "前の句（5–6小節）" は機械生成 */
  function neighborRow(unitId, prefix) {
    var u = phrase(unitId);
    var out = document.createDocumentFragment();
    var extra = [];
    if (u.bars) extra.push(barsLabel(u));
    if (!notesOf(u) && u.kind === "phrase" && u.words) extra.push("メロなし");
    if (notesOf(u) && !u.words && !u.noLyric) extra.push("詞の空き");
    out.appendChild(el("div", "c-ghostlbl", prefix + "（" + extra.join("・") + "）"));
    var row = el("div", "c-ku c-ghost c-noline");
    row.setAttribute("data-phrase", unitId);
    row.appendChild(notesOf(u) ? melo(unitId) : meloNone());
    if (u.words) {
      var ly = el("div", "c-ly c-ly-s");
      var sp = el("span", null, displayText(u));
      sp.setAttribute("data-src", "lyric:" + unitId);
      ly.appendChild(sp);
      row.appendChild(ly);
    } else if (notesOf(u) && !u.noLyric) {
      row.appendChild(timeRow(unitId, "slots"));
    }
    out.appendChild(row);
    return out;
  }

  /** 対応句の参照行（同じメロの1番側の句・読み取り専用）。 */
  function refRow(unitId) {
    var u = phrase(unitId);
    if (!u.sameAs) throw new Error(unitId + " に sameAs が無い（対応句参照は同じメロの句だけ）");
    var refU = phrase(u.sameAs);
    var refSec = section(refU.section);
    var out = document.createDocumentFragment();
    out.appendChild(el("div", "c-ghostlbl", "対応する句（同じメロ）: " + refSec.name + " " + barsLabel(refU) + "（読み取り専用）"));
    var row = el("div", "c-ku c-refrow c-noline");
    row.setAttribute("data-phrase", u.sameAs);
    row.appendChild(melo(u.sameAs));
    var ly = el("div", "c-ly c-ly-s");
    if (refU.words) {
      var sp = el("span", null, displayText(refU));
      sp.setAttribute("data-src", "lyric:" + u.sameAs);
      ly.appendChild(sp);
    }
    row.appendChild(ly);
    out.appendChild(row);
    return out;
  }

  /** 操作ボタン列。labels: [{t, main:true}] or 文字列 */
  function ops(labels) {
    var r = el("div", "c-ops");
    labels.forEach(function (x) {
      var t = typeof x === "string" ? x : x.t;
      var s = el("span", "c-op" + (x && x.main ? " c-op-main" : ""), t);
      r.appendChild(s);
    });
    return r;
  }

  /* ---------------- 候補 ---------------- */

  /** 候補カード（詞候補・メロ候補共用）。バッジは marks.js から機械生成。 */
  function candidateCard(candId) {
    var c = cand(candId);
    var tgt = phrase(c.target);
    var card = el("div", "c-cand");
    card.setAttribute("data-cand", candId);
    var badges;
    if (c.word) {
      var w = el("div", "c-cand-w", c.word);
      w.setAttribute("data-src", "cand:" + candId);
      card.appendChild(w);
      var slotYs = slotIdxs(tgt).map(function (i) { return notesOf(tgt)[i].y; });
      badges = M.lyricCandBadges(c, slotYs, currentOpts());
    } else {
      var mini = el("div", "c-cand-mel");
      var vw = LAYOUT.TIME_W;
      var svg = sv("svg", { width: 220, height: 20, viewBox: "0 0 " + vw + " " + LAYOUT.MELO_H });
      c.notes.forEach(function (n) {
        svg.appendChild(sv("rect", { class: "c-nt", x: n.x, y: n.y, width: n.w, height: LAYOUT.MELO_NOTE_H, rx: 1.5 }));
      });
      mini.appendChild(svg);
      card.appendChild(mini);
      badges = M.melodyCandBadges(c.notes, tgt.accent, currentOpts());
    }
    var facts = el("div", "c-cand-facts");
    badges.forEach(function (b) {
      var f = el("span", "c-fact" + (b.tone ? " c-fact-" + b.tone : ""), b.t);
      f.setAttribute("data-src", "badge:" + candId);
      facts.appendChild(f);
    });
    card.appendChild(facts);
    var dest = el("div", "c-cand-dest", destLabel(tgt));
    dest.setAttribute("data-src", "dest:" + candId);
    card.appendChild(dest);
    return card;
  }

  /** 候補シート。mode: "order"（合いそうな順・点数なし） | "group"（事実で区分） */
  function candidateSheet(candIds, mode) {
    var sh = el("div", "c-sheet");
    var h = el("h3", null, "候補");
    h.appendChild(el("span", "c-sheet-mode",
      mode === "group" ? "事実で区分（区分の中の並びに意味は持たせない）" : "合いそうなものから順に（点数は出さない）"));
    sh.appendChild(h);
    if (mode !== "group") {
      candIds.forEach(function (id) { sh.appendChild(candidateCard(id)); });
      return sh;
    }
    /* 事実で区分＝バッジから機械で見出しを立てる */
    var groups = {};
    var order = [];
    candIds.forEach(function (id) {
      var c = cand(id);
      var tgt = phrase(c.target);
      var badges = c.word
        ? M.lyricCandBadges(c, slotIdxs(tgt).map(function (i) { return notesOf(tgt)[i].y; }), currentOpts())
        : M.melodyCandBadges(c.notes, tgt.accent, currentOpts());
      var key;
      if (badges.some(function (b) { return b.tone === "r"; })) key = "読みの高低が逆";
      else if (badges.some(function (b) { return b.tone === "y"; })) key = badges.filter(function (b) { return b.tone === "y"; })[0].t.replace(/ \d+$/, function (m2) { return m2; });
      else key = "音数ぴったり・読みの高低も合う";
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(id);
    });
    order.forEach(function (k) {
      sh.appendChild(el("div", "c-cgroup", k));
      groups[k].forEach(function (id) { sh.appendChild(candidateCard(id)); });
    });
    return sh;
  }

  /** 候補依頼フォーム（条件の付け外し）。conds: 使う条件のキー配列。
   *  キー: "word"(使いたい語)・"onsu"(音数)・"hl"(読みの高低)・"imi"(意味) 。
   *  values はデータ参照で埋める（例: 句の意味・音の枠から）。空配列＝条件なしで頼む。 */
  function requestForm(unitId, conds) {
    var u = phrase(unitId);
    var box = el("div", "c-reqform");
    box.appendChild(el("h3", null, "候補を頼む"));
    var defs = {
      word: { label: "使いたい語（任意）", value: "" },
      onsu: { label: "音数（任意）", value: "" },
      hl: { label: "読みの高低（任意）", value: "" },
      imi: { label: "意味（任意）", value: u.imi || "" },
    };
    var ns = notesOf(u);
    if (ns && slotIdxs(u).length) {
      var ys = slotIdxs(u).map(function (i) { return ns[i].y; });
      defs.onsu.value = String(slotIdxs(u).length);
      defs.hl.value = M.hlText(M.slotSuggestHL(ys));
    } else if (!ns && u.accent) {
      defs.onsu.value = String(u.accent.moras.length);
      defs.hl.value = M.hlText(u.accent.hl);
    }
    (conds || []).forEach(function (k) {
      var d = defs[k];
      if (!d) throw new Error("候補依頼フォームの条件キーが不明: " + k);
      var row = el("div", "c-formrow");
      var lb = el("label", null, d.label);
      row.appendChild(lb);
      var fin = el("span", "c-fin", d.value);
      if (k === "imi" && d.value) fin.setAttribute("data-src", "imi:" + unitId);
      if ((k === "hl" || k === "onsu") && d.value) fin.setAttribute("data-src", "frame:" + unitId);
      row.appendChild(fin);
      row.appendChild(el("span", "c-cond-x", "×"));
      box.appendChild(row);
    });
    if (!conds || !conds.length) box.appendChild(el("div", "c-req-empty", "条件なしで頼む（自由に出してもらう）"));
    var foot = el("div", "c-pop");
    foot.appendChild(el("span", "c-pop-p1", "頼む"));
    foot.appendChild(el("span", null, "条件を足す"));
    foot.appendChild(el("span", null, "やめる"));
    box.appendChild(foot);
    return box;
  }

  /** 予定の記入フォーム（メモ・小節数・音数・読みの高低。すべて任意）。
   *  planId を渡せばその予定の値を欄に写す。null なら空フォーム。 */
  function planForm(planId) {
    var plan = planId ? D.planById[planId] : null;
    if (planId && !plan) throw new Error("予定がない: " + planId);
    var box = el("div", "c-planform");
    var rows = [
      ["メモ（任意）", plan && plan.memo, false],
      ["小節数（任意）", plan && plan.bars, true],
      ["音数（任意）", plan && plan.onsu, true],
      ["読みの高低（任意）", plan && plan.hl, true],
    ];
    rows.forEach(function (r) {
      var row = el("div", "c-formrow");
      row.appendChild(el("label", null, r[0]));
      var fin = el("span", "c-fin" + (r[2] ? " c-fin-s" : ""), r[1] || "");
      if (r[1] && plan) fin.setAttribute("data-src", "plan:" + plan.id);
      row.appendChild(fin);
      box.appendChild(row);
    });
    var foot = el("div", "c-pop");
    foot.appendChild(el("span", "c-pop-p1", "置く"));
    foot.appendChild(el("span", null, "やめる"));
    box.appendChild(foot);
    return box;
  }

  /** 空きの枠のその場入力（通しの面・枠がそのまま入力欄になる小さな絵） */
  function slotInput(unitId) {
    var u = phrase(unitId);
    var row = el("div", "c-ku c-noline");
    row.setAttribute("data-phrase", unitId);
    var ly = el("div", "c-ly");
    if (u.words) {
      var sp = el("span", null, displayText(u));
      sp.setAttribute("data-src", "lyric:" + unitId);
      ly.appendChild(sp);
    }
    var slots = slotIdxs(u);
    var inp = el("span", "c-inp");
    inp.appendChild(document.createTextNode(slots.length + "音"));
    inp.appendChild(el("i", null, "｜"));
    ly.appendChild(inp);
    var pop = el("span", "c-pop");
    pop.appendChild(el("span", "c-pop-p1", "候補を探す"));
    pop.appendChild(el("span", null, "編集画面で開く"));
    ly.appendChild(pop);
    row.appendChild(ly);
    return row;
  }

  /** 通しの面の操作の割当の注記（データの文字列をそのまま出す。書き換え禁止） */
  function opsTableNote() {
    var d = el("div", "c-opstable");
    d.setAttribute("data-ops-table", "1");
    d.textContent = D.opsTableText;
    return d;
  }

  /** 枚7用: セクションの事実の小札（数値は全てデータから機械算出）。
   *  数え方の定義（この関数が正）:
   *   詞の空き   = 空きの枠のある句＋詞があるのに予定（続きの当て）が付いている句
   *   詞なし     = 意図して詞を付けない句（noLyric）
   *   メロ未定   = 帯が句の一部にしか無い句（band指定）＋モーラ数より音符が少ない句
   *   メロの空き = 詞があるのに音符列が無い句
   *   まだ何も無い = zone の数 */
  function sectionFactChips(secId) {
    var s = section(secId);
    var facts = [];
    var lyGap = 0, meloNone2 = 0, meloPart = 0, noLy = 0, zones = 0;
    (s.units || []).forEach(function (u) {
      if (u.kind === "zone") { zones++; return; }
      var ns = notesOf(u);
      if (!u.noLyric && ((ns && slotIdxs(u).length) || (u.words && u.plan))) lyGap++;
      if (ns && (u.band || (u.words && morasOf(u).length > ns.length))) meloPart++;
      if (!ns && u.words) meloNone2++;
      if (u.noLyric) noLy++;
    });
    if (lyGap) facts.push("詞の空き " + lyGap + "か所");
    if (noLy) facts.push("詞なし " + noLy + "範囲");
    if (meloPart) facts.push("メロ未定 " + meloPart + "範囲");
    if (meloNone2) facts.push("メロの空き " + meloNone2 + "句");
    if (zones) facts.push("まだ何も無い " + zones + "区間");
    var wrap = el("div", "c-cfacts");
    facts.forEach(function (t) {
      var f = el("span", "c-fact", t);
      f.setAttribute("data-calc", "secfacts:" + secId);
      wrap.appendChild(f);
    });
    return wrap;
  }

  /** 判定用の説明（枠外・配布スクショでは非表示になる）。設計論はここにだけ書いてよい */
  function desc(text) {
    var d = el("div", "desc");
    d.textContent = text;
    return d;
  }
  /** 枚の中の補助パネル（インセット） */
  function inset(title, children) {
    var d = el("div", "c-inset");
    d.appendChild(el("h3", null, title));
    (children || []).forEach(function (c) { d.appendChild(c); });
    return d;
  }

  g.V7C = {
    LAYOUT: LAYOUT,
    registerSheet: registerSheet,
    renderAll: renderAll,
    sheets: sheets,
    /* データ読み出し */
    phrase: phrase, section: section, cand: cand,
    notesOf: notesOf, morasOf: morasOf, ysOf: ysOf, slotIdxs: slotIdxs,
    displayText: displayText, barsLabel: barsLabel, marksOf: marksOf,
    planChipText: planChipText, frameFieldContent: frameFieldContent,
    /* 部品 */
    phone: phone, playbar: playbar, legendText: legendText,
    melo: melo, meloNone: meloNone, lyricLine: lyricLine, planChip: planChip,
    timeRow: timeRow, phraseRow: phraseRow, sectionHead: sectionHead,
    zoneRow: zoneRow, stockRow: stockRow, stockHead: stockHead, addRow: addRow,
    prFragment: prFragment, prCaption: prCaption, hlRow: hlRow, hlLabel: hlLabel,
    fieldPair: fieldPair, neighborRow: neighborRow, refRow: refRow, ops: ops,
    candidateCard: candidateCard, candidateSheet: candidateSheet,
    requestForm: requestForm, planForm: planForm, slotInput: slotInput,
    opsTableNote: opsTableNote, sectionFactChips: sectionFactChips,
    desc: desc, inset: inset,
  };
})(typeof window !== "undefined" ? window : globalThis);
