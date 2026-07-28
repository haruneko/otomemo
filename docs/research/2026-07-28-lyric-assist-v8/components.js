/* v8 components.js — 共通部品（唯一の実装）。工程1はインスタンス化のみ可・再実装禁止。
 *
 * 前提: data.js（V8DATA）と marks.js（V8MARKS）を先に読み込むこと。
 *
 * v7からの主な変更（計画§3・§7）:
 * 1. 歌詞は2層: 表記（hyoki・原本）とモーラ行。displayText は表記。モーラのかなは
 *    焼き込み accent.moras（run_frontend の read 由来）。
 * 2. パーツ宣言制: 通しの面は throughPane("A"|"B"|"C"|"A_HELP"|"A_INTO"|"A_ONIN", build)
 *    の中で組む。宣言された集合に無いパーツは DOM に出せない（build後に機械検査で例外）。
 *    宣言の正本は計画§3-4（PARTSETS はその書き写し。verify.mjs が独立の書き写しと照合）。
 * 3. 範囲の編集画面はパーツ選択の対象外（常に全部出す）＝throughPane の外で組む。
 * 4. 句と variant（変化後の状態）は同じ部品で描ける（stateById で引く）。
 * 5. 語↔モーラの光り（glowSpan）・読みの高低の手上書き表示（hand）・genNote の正規経路・
 *    音の枠の中身（両埋まり句も機械算出）を追加。
 *
 * 使い方（枚の登録）:
 *   V8C.registerSheet({
 *     id: "b1",              // 枚id ＝ CSSクラス接頭辞（この枚のCSSクラスは全て "b1-" で始めること）
 *     no: 1,                 // 表示順
 *     title: "…",
 *     wide: false,           // 幅広の枚だけ true。電話枠の枚は false（352px検査対象）
 *     demo: false,           // true = 部品の自己点検用（配布スクショから除外）
 *     marksOpts: { flatPair: "イ", yellowUse: "B" },   // 印の案の宣言。v8は全枚 イ+B（検証8-6）。
 *                                                      // 別案は compareBox（案くらべ区画）の中だけ。
 *     css: "...",
 *     build(root) { ... }
 *   });
 *
 * 座標の規則（過去の振幅潰し事故の再発防止）:
 *   すべての座標は LAYOUT の定数からだけ計算する。SVGパスの手書き禁止。
 *   高低線の y は LAYOUT.HL_HI / LAYOUT.HL_LO の2値ちょうど（検証が実測する）。
 *   モーラ区画の x位置・幅は「音符の時間データ」から計算する（帯が描かれているかに
 *   依存しない＝計画§3-1。検証8-8が data-vw/data-w から期待値を再計算して1px以内を実測）。
 *
 * 印の規則: 印を出すのは markCell()/markNote() 経由のみ（data-mk="rule"）。
 *   音数ドット案（onsuDotSample）は案くらべ区画（compareBox）専用＝data-mk="onsu-an"。
 */
(function (g) {
  "use strict";
  var D = g.V8DATA, M = g.V8MARKS;
  if (!D || !M) throw new Error("data.js と marks.js を先に読み込むこと");

  /* ================= 描画定数（1か所に閉じる） ================= */
  var LAYOUT = {
    TIME_W: 256,        // 句の時間グリッド（データの x/w の単位・小さいメロ表示の既定幅）
    MELO_H: 24,         // 縮小ピアノロールの viewBox 高さ
    MELO_NOTE_H: 5,     // 縮小ピアノロールの音符矩形の高さ
    PR_INNER_W: 292,    // 実PianoRoll断片の内側の幅(px)
    PR_PAD_L: 1,        // 断片の内側の左オフセット(px)
    PR_BORDER: 1,       // 断片の枠線の太さ(px)＝断片の外に置く行が揃えで足すぶん
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

  /* ================= パーツ宣言（正本は計画§3-4。ここはその書き写し） =================
   * パーツ種（素の言葉で・比喩なし）:
   *   secHead    セクション見出し（仮チップ・「確定にする」・「同じメロ」チップ込み）
   *   hyoki      表記の行（読み物として読める歌詞テキスト）
   *   chips      行チップ（詞の空きN音・あとN音・字余りN・メロの空き・予定・音数）
   *   zone       「まだ何も無い区間」枠
   *   dot        行末の印ドット
   *   imi        意味メモ（薄字）
   *   barNo      小節番号（薄字・右寄せ）
   *   playbar    再生バー
   *   addBtns    「セクションを足す」「予定を置く」「断片を置く」
   *   stock      「まだ並びに入れていないもの」区画＋「並びに入れる」
   *   meloBand   メロの帯（音符矩形込み）
   *   emptyCells 空きマスの列
   *   moraRow    モーラ行（時間揃え）
   *   vowelRow   母音の段・韻の下線
   *   hlLine     読みの高低の線
   *   switchNote 切替の説明1行
   *   dispSheet  表示シート（6項目＋既定に戻す）
   *   help       ヘルプを開いた姿（凡例・割当表はこの中にだけ出てよい）
   */
  var BASE_A = ["secHead", "hyoki", "chips", "zone", "dot", "imi", "barNo", "playbar", "addBtns", "stock"];
  var PARTSETS = {
    A:      { label: "態A（既定）", parts: BASE_A.slice() },
    B:      { label: "態B（表示シートを開いた姿）", parts: BASE_A.concat(["dispSheet"]) },
    C:      { label: "態C（全部オン）", parts: BASE_A.concat(["meloBand", "emptyCells"]) },
    A_HELP: { label: "態A＋ヘルプを開いた姿", parts: BASE_A.concat(["help"]) },
    A_INTO: { label: "態A＋イントネーション切替の層", parts: BASE_A.concat(["moraRow", "hlLine", "switchNote"]) },
    A_ONIN: { label: "態A＋音韻切替の層", parts: BASE_A.concat(["moraRow", "vowelRow", "switchNote"]) },
  };
  /* 表示シートの6項目（計画§3-1）と態Aでの既定オン/オフ */
  var DISPLAY_ITEMS = [
    { label: "メロ帯", on: false },
    { label: "空きマスの列", on: false },
    { label: "小節番号", on: true },
    { label: "意味メモ", on: true },
    { label: "予定チップ", on: true },
    { label: "印ドット", on: true },
  ];
  /* 読み取り用の表記の欄に付ける一言（計画§1-2「画面にもその旨の一言を出す」） */
  var SPAN_NOTE = "語とモーラの対応の光りは読み取り用の表記の側に出ます（表記の欄は光りません）";

  var _paneStack = [];
  function activeSet() { return _paneStack.length ? _paneStack[_paneStack.length - 1] : null; }
  function wants(part) {
    var s = activeSet();
    return !s || s.parts.indexOf(part) >= 0;
  }
  function tag(e, part) { e.setAttribute("data-part", part); return e; }
  /** 通しの面の入れ物。setName の宣言に無いパーツは中に出せない（buildの後に機械検査）。
   *  範囲の編集画面はこれの外で組む（パーツ選択の対象外＝常に全部出す）。 */
  function throughPane(setName, build) {
    var set = PARTSETS[setName];
    if (!set) throw new Error("パーツ宣言が無い: " + setName + "（A/B/C/A_HELP/A_INTO/A_ONIN）");
    var pane = el("div", "c-pane");
    pane.setAttribute("data-partset", setName);
    _paneStack.push(set);
    try { build(pane); } finally { _paneStack.pop(); }
    /* 宣言外パーツの機械検査（DOMはそれ以外を出せない） */
    var bad = [];
    pane.querySelectorAll("[data-part]").forEach(function (e2) {
      var p = e2.getAttribute("data-part");
      if (set.parts.indexOf(p) < 0) bad.push(p);
    });
    if (bad.length) throw new Error("パーツ宣言違反（" + setName + " に無いパーツ）: " + bad.join(" "));
    return pane;
  }

  /* ================= 小さな道具 ================= */
  function el(tagName, cls, text) {
    var e = document.createElement(tagName);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tagName, attrs) {
    var e = document.createElementNS(SVGNS, tagName);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function px(v) { return Math.round(v * 10) / 10; }

  /* ================= データ読み出し（全て id 経由） ================= */
  function state(id) {
    var s = D.stateById[id];
    if (!s) throw new Error("句/variantがない: " + id);
    return s;
  }
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
    if (u.notes.ref) return notesOf(state(u.notes.ref));
    return null;
  }
  function morasOf(u) { return u.accent ? u.accent.moras : []; }
  /* 読みの高低（手で直していればその値。出所は hlSource で常に絵に出す） */
  function effHl(u) { return u.hand ? u.hand.hl : (u.accent ? u.accent.hl : []); }
  /* モーラ i ↔ 音符 i（恒等対応）。音符が無いモーラは null */
  function ysOf(u) {
    var ns = notesOf(u) || [];
    return morasOf(u).map(function (_, i) { return i < ns.length ? ns[i].y : null; });
  }
  /* 空きの枠＝歌詞モーラより後ろの音符（noLyric の句は空きではない） */
  function slotIdxs(u) {
    var ns = notesOf(u) || [];
    if (u.noLyric) return [];
    var m = u.hyoki ? morasOf(u).length : 0;
    var out = [];
    for (var i = m; i < ns.length; i++) out.push(i);
    return out;
  }
  function displayText(u) { return u.hyoki || ""; }
  function barsLabel(u) {
    if (!u.bars) return "";
    return u.bars[0] === u.bars[1] ? u.bars[0] + "小節" : u.bars[0] + "–" + u.bars[1] + "小節";
  }
  /* 印（唯一の導出経路）。opts 省略時は今組み立て中の枚の宣言を使う。
     読みの高低は effHl（手で直した値があればそれ）＝絵と印が食い違わない */
  function marksOf(u, opts) {
    if (!u.accent) return [];
    return M.computeMarks(effHl(u), u.accent.ap, ysOf(u), opts || currentOpts());
  }
  /* 宛先ラベル（候補カード用） */
  function destLabel(u) {
    var sec = section(u.section);
    var sg = D.songs[u.song];
    return "宛先: " + sg.title.replace(/（.*$/, "") + " › " + sec.name + " › " + barsLabel(u).replace("小節", "小節の句");
  }

  /* ================= 印の付与（この2つ以外から規則の印を出さない） ================= */
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
      /* 印の使用案の枠外注記（機械生成・検証8-6が照合） */
      var mn = el("div", "c-marksnote",
        "この枚の印の案: " + sh.marksOpts.flatPair + "＋" + sh.marksOpts.yellowUse +
        "（枠内に案くらべ区画があればそこだけ例外）");
      mn.setAttribute("data-marksnote", "1");
      fr.appendChild(mn);
      container.appendChild(fr);
    });
  }

  /* ================= 部品 ================= */

  /** 電話枠。opts: {title, crumb, tab:"素"|"音韻"|"イントネーション"|null, headBtn, playbar:true}
   *  v8: 凡例（legend）は電話枠の中に置けない＝枠外の legendNote() か help の中だけ（計画§3-2）。 */
  function phone(opts, children) {
    if (opts.legend) throw new Error("v8では電話枠の中に凡例を置かない（legendNote() を枠外に置くか helpPanel の中に）");
    var ph2 = el("div", "c-ph");
    var hd = el("div", "c-hd");
    hd.appendChild(el("span", "c-back", "← 戻る"));
    if (opts.crumb) {
      var cr = el("span", "c-crumb");
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
    return tag(pb, "playbar");
  }

  /** 凡例の既定文（枠外の注記・helpPanel の中で使う） */
  function legendText(kind) {
    if (kind === "plain") return "行の右端の●=印のある箇所あり（赤=アクセント逆行・黄=注意）。チップ=欠けの事実（詞の空きN音・あとN音・字余りN・メロの空き）。メロの帯・空きマスは「表示」で出せる";
    if (kind === "switch") return "行の右端の●=印のある箇所あり・文字の下線=その印の場所（赤=アクセント逆行・黄=注意・印なし=指摘なし。既存の韻律チェックと同じ作法）。チップ=欠けの事実（詞の空きN音・あとN音・字余りN・メロの空き）";
    if (kind === "into") return "切替（音韻・イントネーション）中は文字の下線でも同じ印が出る（赤=アクセント逆行・黄=注意・印なし=指摘なし。既存の韻律チェックと同じ作法）";
    return kind;
  }
  /** 枠外の凡例注記（電話枠の外に置く） */
  function legendNote(kind) {
    var d = el("div", "c-note", "凡例: " + legendText(kind || "plain"));
    d.setAttribute("data-legend-note", "1");
    return d;
  }

  /** 通しの面の操作の割当の注記（データの正準文字列をそのまま出す。書き換え禁止）。
   *  v8では電話枠の外（枠外注記）か helpPanel の中にだけ置く（計画§3-2・検証8-7）。 */
  function opsTableNote() {
    var d = el("div", "c-opstable");
    d.setAttribute("data-ops-table", "1");
    d.textContent = D.opsTableText;
    return d;
  }

  /** ヘルプを開いた姿（枚1付記用）。凡例・割当表はこの中にだけ電話枠内に出てよい。 */
  function helpPanel() {
    var d = el("div", "c-helppanel");
    d.setAttribute("data-help", "1");
    tag(d, "help");
    d.appendChild(el("h3", null, "ヘルプ"));
    d.appendChild(el("div", "c-help-legend", legendText("plain")));
    d.appendChild(el("div", "c-help-legend", legendText("into")));
    d.appendChild(opsTableNote());
    return d;
  }

  /** 切替の説明1行（枚2・3の層の一部） */
  function switchNote(kind) {
    if (!wants("switchNote")) throw new Error("switchNote はこのパーツ宣言に無い");
    var t = kind === "onin"
      ? "各音の下の小さい字=読みの母音・下線=句のおわり2音の母音が同じ句どうし（韻）"
      : "文字の下線=印（赤=読みの高低とメロの上下が逆・黄=注意）・線=読んだときの高低（上=高い/下=低いの2値）";
    return tag(el("div", "c-switchnote", t), "switchNote");
  }

  /** 表示シート（6項目＋既定に戻す）。onMap: 上書きしたい {ラベル:bool}（省略=態Aの既定） */
  function dispSheet(onMap) {
    if (!wants("dispSheet")) throw new Error("dispSheet はこのパーツ宣言に無い");
    var d = el("div", "c-dispsheet");
    tag(d, "dispSheet");
    d.appendChild(el("h3", null, "表示"));
    DISPLAY_ITEMS.forEach(function (it) {
      var on = onMap && Object.prototype.hasOwnProperty.call(onMap, it.label) ? onMap[it.label] : it.on;
      var row = el("div", "c-ds-row");
      row.appendChild(el("span", null, it.label));
      row.appendChild(el("span", "c-ds-sw" + (on ? " c-ds-on" : "")));
      d.appendChild(row);
    });
    d.appendChild(el("span", "c-ds-reset", "既定に戻す"));
    return d;
  }

  /** 縮小ピアノロール（メロの帯）。stateId の音符列（ref解決込み）を描く。
   *  opts: {width, vw, ghost} */
  function melo(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var ns = notesOf(u);
    if (!ns) return meloNone();
    var vw = opts.vw || u.w || LAYOUT.TIME_W;
    var w = opts.width || vw;
    var h = Math.round(LAYOUT.MELO_H * (w / vw));
    var wrap = el("div", "c-melo" + (opts.ghost ? " c-ghost" : ""));
    tag(wrap, "meloBand");
    wrap.style.height = h + "px";
    var svg = sv("svg", { width: w, height: h, viewBox: "0 0 " + vw + " " + LAYOUT.MELO_H });
    var bands = u.band || (u.base && phrase(u.base).band) || [[0, vw]];
    bands.forEach(function (b) {
      svg.appendChild(sv("rect", { class: "c-band", x: b[0], y: 3, width: b[1], height: 18, rx: 4 }));
    });
    ns.forEach(function (n, i) {
      var r = sv("rect", { class: "c-nt", x: n.x, y: n.y, width: n.w, height: LAYOUT.MELO_NOTE_H, rx: 1.5 });
      r.setAttribute("data-nr", stateId + ":" + i);
      svg.appendChild(r);
    });
    wrap.appendChild(svg);
    return wrap;
  }
  /** メロ未定のときの薄い余白（帯なし） */
  function meloNone() { return el("div", "c-melo c-melo-none"); }

  /** 表記の行（読み物として読める歌詞テキスト）。チップは rowChips が別に出す。 */
  function hyokiLine(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var ly = el("div", "c-ly" + (opts.dim ? " c-ly-dim" : ""));
    tag(ly, "hyoki");
    if (u.hyoki) {
      var sp = el("span", null, displayText(u));
      sp.setAttribute("data-src", "lyric:" + stateId);
      ly.appendChild(sp);
    }
    return ly;
  }

  /** 予定チップ（点線の小箱）。表示文字列は予定の欄から機械結合 */
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

  /** 行チップの機械算出（計画§1-4・§3-2。数はすべて機械算出＝検証8-3が再計算照合）。
   *  返り値: [{kind, text}]。予定チップは含まない（rowChips が planChip を併置する）。 */
  function rowChipDefs(u) {
    var ns = notesOf(u);
    var out = [];
    if (u.noLyric) {
      /* §3-4の行チップ列挙に「詞なし」は無いが、意図して詞を付けない事実が態Aで
         見えなくなるためチップで出す（計画への差し戻し候補として報告に明記） */
      out.push({ kind: "nolyric", text: "詞なし" });
      return out;
    }
    if (ns && !u.hyoki) out.push({ kind: "lyricgap", text: "詞の空き" + ns.length + "音" });
    if (ns && u.hyoki) {
      var d = ns.length - morasOf(u).length;
      if (d > 0) out.push({ kind: "rest", text: "あと" + d + "音" });
      if (d < 0) out.push({ kind: "overflow", text: "字余り" + (-d) });
    }
    if (!ns && u.hyoki) out.push({ kind: "melogap", text: "メロの空き" });
    return out;
  }
  function rowChips(stateId) {
    var u = state(stateId);
    var defs = rowChipDefs(u);
    if (!defs.length && !u.plan) return null;
    var w = el("div", "c-chips");
    tag(w, "chips");
    w.setAttribute("data-phrase", stateId);
    defs.forEach(function (c) {
      var e = el("span", "c-chip", c.text);
      e.setAttribute("data-calc", "chip:" + stateId + ":" + c.kind);
      w.appendChild(e);
    });
    if (u.plan) w.appendChild(planChip(u.plan));
    return w;
  }

  /** 時間揃えの下段（.c-fr）。mode:
   *   "slots"  … 空きの枠だけ（パーツ=emptyCells）
   *   "bar"    … 詞なしの横棒（範囲の編集画面用。通しの面の態では「詞なし」チップが担う）
   *   "kana"   … モーラ行＝文字を音符の時間位置に置く（パーツ=moraRow）。印は規則から。
   *  区画の x位置・幅は音符の時間データ（x,w）から計算する＝帯の表示と独立（計画§3-1）。
   *  opts: {width, vw, padL, marksOpts, glowSpan}
   *  実PianoRoll断片の直下に置くときは prMoraRow() を使う（スケールと左端を断片に合わせる）。 */
  function timeRow(stateId, mode, opts) {
    opts = opts || {};
    var u = state(stateId);
    var ns = notesOf(u) || [];
    var vw = opts.vw || u.w || LAYOUT.TIME_W;
    var w = opts.width || vw;
    var f = w / vw;
    var padL = opts.padL || 0;
    var fr = el("div", "c-fr");
    fr.setAttribute("data-phrase", stateId);
    fr.setAttribute("data-vw", String(vw));
    fr.setAttribute("data-w", String(w));
    fr.setAttribute("data-padl", String(padL));
    if (mode === "kana") tag(fr, "moraRow");
    if (mode === "slots") tag(fr, "emptyCells");
    if (mode === "bar") {
      ns.forEach(function (n, i) {
        var b = el("span", "c-bar2");
        b.style.left = px(padL + n.x * f) + "px";
        b.style.width = px(n.w * f) + "px";
        b.setAttribute("data-nc", stateId + ":" + i);
        fr.appendChild(b);
      });
      fr.appendChild(el("span", "c-frlab", "詞なし"));
      return fr;
    }
    var moras = morasOf(u);
    var mks = {};
    if (mode === "kana") marksOf(u, opts.marksOpts).forEach(function (mk) { mks[mk.i] = mk; });
    /* 案を部品単位で上書きした場合は宣言を要素に残す（案くらべ区画専用。検証8-6が
       compareBox の外での上書きを違反にする） */
    if (opts.marksOpts) fr.setAttribute("data-marks-opts", JSON.stringify(opts.marksOpts));
    var glow = null;
    if (opts.glowSpan != null && u.spans && u.spans[opts.glowSpan]) glow = u.spans[opts.glowSpan];
    ns.forEach(function (n, i) {
      if (i < moras.length && mode === "kana") {
        var tc = el("span", "c-tc", moras[i]);
        tc.style.left = px(padL + n.x * f) + "px";
        tc.style.width = px(n.w * f) + "px";
        tc.setAttribute("data-nc", stateId + ":" + i);
        tc.setAttribute("data-src", "mora:" + stateId + ":" + i);
        if (glow && i >= glow.m0 && i < glow.m1) { tc.classList.add("c-glow"); tc.setAttribute("data-glow", "1"); }
        if (mks[i]) markCell(tc, mks[i]);
        fr.appendChild(tc);
      } else if (i >= moras.length && !u.noLyric && (mode === "slots" || wants("emptyCells"))) {
        var kb = el("span", "c-kb2");
        kb.style.left = px(padL + n.x * f) + "px";
        kb.style.width = px(n.w * f) + "px";
        kb.setAttribute("data-nc", stateId + ":" + i);
        if (mode === "kana") tag(kb, "emptyCells");
        fr.appendChild(kb);
      }
    });
    /* 音符よりモーラが多い＝音符なしのモーラは末尾に灰色で置く（計画§1-4）。
       行の右端を越えるときは2段目へ折り返す（文字を隠さない・枠からはみ出さない） */
    if (mode === "kana" && moras.length > ns.length && ns.length) {
      var lastN = ns[ns.length - 1];
      var afterText = moras.slice(ns.length).join("");
      var after = el("span", "c-fr-after", afterText);
      after.setAttribute("data-src", "lyricafter:" + stateId);
      var afterLeft = padL + (lastN.x + lastN.w) * f + 10;
      var est = afterText.length * 13 + 4; // 文字幅の見積もり(px)
      if (afterLeft + est > padL + w) {
        after.style.left = px(padL) + "px";
        after.style.top = LAYOUT.FR_H + "px";
        fr.style.height = (LAYOUT.FR_H * 2) + "px";
        fr.setAttribute("data-wrap", "1");
      } else {
        after.style.left = px(afterLeft) + "px";
      }
      fr.appendChild(after);
    }
    return fr;
  }

  /** 実PianoRoll断片の直下に置くモーラ行（範囲の編集画面用）。
   *  スケールと左端を断片（prFragment）の音符矩形に合わせる＝縦揃えの検証対象。
   *  字余り（音符なしのモーラ）は末尾に灰色で出る（timeRow "kana" と同じ）。 */
  function prMoraRow(stateId, opts) {
    opts = opts || {};
    return timeRow(stateId, "kana", Object.assign({
      width: LAYOUT.PR_INNER_W, vw: LAYOUT.TIME_W, padL: LAYOUT.PR_PAD_L + LAYOUT.PR_BORDER,
    }, opts));
  }

  /** 母音の段（音韻切替の層・時間揃え）。かな→母音は機械の表から導く。
   *  opts: {width, vw, rhymeLast:N（おわりN音に韻の下線）} */
  var VMAP = {
    a: "あかがさざただなはばぱまやらわゃアカガサザタダナハバパマヤラワャ",
    i: "いきぎしじちぢにひびぴみりイキギシジチヂニヒビピミリ",
    u: "うくぐすずつづぬふぶぷむゆるゅウクグスズツヅヌフブプムユルュ",
    e: "えけげせぜてでねへべぺめれエケゲセゼテデネヘベペメレ",
    o: "おこごそぞとどのほぼぽもよろをょオコゴソゾトドノホボポモヨロヲョ",
  };
  function vowelOf(mora) {
    var c = mora[mora.length - 1];
    if (c === "ん" || c === "ン") return "ん";
    if (c === "っ" || c === "ッ") return "っ";
    if (c === "ー") return "ー";
    for (var k in VMAP) if (VMAP[k].indexOf(c) >= 0) return k;
    return "?";
  }
  function vowelRow(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var ns = notesOf(u) || [];
    if (!u.accent) throw new Error("vowelRow: accent が無い: " + stateId);
    var vw = opts.vw || u.w || LAYOUT.TIME_W;
    var w = opts.width || vw;
    var f = w / vw;
    var vr = el("div", "c-vrow");
    tag(vr, "vowelRow");
    vr.setAttribute("data-phrase", stateId);
    vr.setAttribute("data-vw", String(vw));
    vr.setAttribute("data-w", String(w));
    var moras = morasOf(u);
    var m = moras.length;
    moras.forEach(function (mo, i) {
      if (i >= ns.length) return; // 時間の基準が無いモーラは段に出さない
      var s = el("span", "c-vc" + (opts.rhymeLast && i >= m - opts.rhymeLast ? " c-vc-rh" : ""), vowelOf(mo));
      s.style.left = px(ns[i].x * f) + "px";
      s.style.width = px(ns[i].w * f) + "px";
      s.setAttribute("data-nc", stateId + ":" + i);
      vr.appendChild(s);
    });
    return vr;
  }

  /** 通しの面の句の一行（パーツ宣言制）。throughPane の中でだけ使える。
   *  出すものは宣言（activeSet）が決める＝枚ごとの判断をさせない。
   *  opts: {now:true(再生中の強調), vowel:{rhymeLast:N}} */
  function phraseRow(stateId, opts) {
    opts = opts || {};
    if (!activeSet()) throw new Error("phraseRow は throughPane(宣言名, ...) の中でだけ使う（計画§3-4）");
    var u = state(stateId);
    var ns = notesOf(u);
    var row = el("div", "c-ku" + (opts.now ? " c-ku-now" : ""));
    row.setAttribute("data-phrase", stateId);
    if (opts.now) row.appendChild(el("span", "c-nowmark", "▶"));
    var krow = el("div", "c-krow");
    var main = el("div", "c-kmain");
    /* モーラ行を出す切替では表記の行を薄く添える（行構成は裁定待ち5＝仰ぎ直しの対象） */
    var hasMora = wants("moraRow") && u.hyoki && ns && u.accent;
    if (wants("meloBand") && ns) main.appendChild(melo(stateId));
    if (wants("hyoki") && u.hyoki) main.appendChild(hyokiLine(stateId, { dim: hasMora }));
    if (hasMora) main.appendChild(timeRow(stateId, "kana"));
    if (wants("vowelRow") && u.hyoki && ns && u.accent) main.appendChild(vowelRow(stateId, opts.vowel));
    if (wants("hlLine") && u.hyoki && ns && u.accent) main.appendChild(hlLineRow(stateId));
    if (wants("emptyCells") && ns && !hasMora && slotIdxs(u).length) main.appendChild(timeRow(stateId, "slots"));
    if (wants("chips")) {
      var ch = rowChips(stateId);
      if (ch) main.appendChild(ch);
    }
    krow.appendChild(main);
    var side = el("div", "c-kside");
    if (wants("dot")) {
      var mks = marksOf(u);
      if (mks.some(function (m) { return m.color === "r"; })) {
        var fd = el("span", "c-fd c-fd-r"); fd.setAttribute("data-mk", "rule"); tag(fd, "dot"); side.appendChild(fd);
      } else if (mks.length) {
        var fd2 = el("span", "c-fd c-fd-y"); fd2.setAttribute("data-mk", "rule"); tag(fd2, "dot"); side.appendChild(fd2);
      }
    }
    if (wants("barNo") && u.bars) side.appendChild(tag(el("span", null, barsLabel(u)), "barNo"));
    krow.appendChild(side);
    row.appendChild(krow);
    if (wants("imi") && u.imi) {
      var im = el("div", "c-imi", u.imi);
      im.setAttribute("data-src", "imi:" + stateId);
      tag(im, "imi");
      row.appendChild(im);
    }
    return row;
  }

  /** セクション見出し（仮チップ・確定にする・同じメロチップはデータから機械で出す） */
  function sectionHead(secId) {
    var s = section(secId);
    var head = el("div", "c-sec" + (s.kari ? " c-sec-kari" : ""));
    tag(head, "secHead");
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
    tag(zn, "zone");
    zn.setAttribute("data-phrase", zoneId);
    zn.appendChild(el("span", null, "まだ何も無い区間"));
    if (z.plan) zn.appendChild(planChip(z.plan));
    if (z.bars) zn.appendChild(el("span", "c-zone-pos", barsLabel(z)));
    return zn;
  }

  /** まだ並びに入れていないもの（断片）の一行。帯はパーツ宣言に従う（態Aでは出ない） */
  function stockRow(stockId) {
    var st = phrase(stockId);
    var row = el("div", "c-ku c-stockku");
    tag(row, "stock");
    row.setAttribute("data-phrase", stockId);
    if (wants("meloBand")) row.appendChild(melo(stockId, { vw: st.w }));
    var ly = el("div", "c-ly");
    var sp = el("span", null, displayText(st));
    sp.setAttribute("data-src", "lyric:" + stockId);
    ly.appendChild(sp);
    ly.appendChild(el("span", "c-placebtn", "並びに入れる"));
    ly.appendChild(el("span", "c-stockpos", "場所: " + (st.place || "未定")));
    row.appendChild(ly);
    return row;
  }
  function stockHead() { return tag(el("div", "c-stockhd", "まだ並びに入れていないもの"), "stock"); }

  /** 追加操作の行（＋セクションを足す 等）。labels: 文字列配列 */
  function addRow(labels) {
    var r = el("div", "c-addrow");
    tag(r, "addBtns");
    labels.forEach(function (t) { r.appendChild(el("span", "c-addbtn", t)); });
    return r;
  }

  /* ---------------- 範囲の編集画面まわり（パーツ選択の対象外＝常に全部出す） ---------------- */

  /** 表記の欄（＋読み取り用の表記の欄）。範囲の編集画面用。
   *  - yomiSrc の無い句: 表記の欄がそのまま読み取りの元（feed）＝語のトークンに分かれ、
   *    glowSpan で語↔モーラの光りが出せる。
   *  - yomiSrc のある句: 対応の光りは読み取り用の表記の欄にだけ出る。表記の欄は光らない
   *    （別文字列の間の対応を取る経路は無い＝実測に基づく制限。計画§1-2。一言も出す）。
   *  opts: {glowSpan} */
  function feedRows(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var box = el("div", "c-feedbox");
    box.setAttribute("data-phrase", stateId);
    function tokenRow(labelText, spans) {
      var row = el("div", "c-feedrow");
      row.appendChild(el("label", null, labelText));
      var wrap = el("span", "c-feedtoks");
      spans.forEach(function (sp2, k) {
        var t = el("span", "c-ftok", sp2.s);
        t.setAttribute("data-src", "span:" + stateId + ":" + k);
        if (opts.glowSpan === k) { t.classList.add("c-glow"); t.setAttribute("data-glow", "1"); }
        wrap.appendChild(t);
      });
      row.appendChild(wrap);
      return row;
    }
    if (!u.yomiSrc) {
      box.appendChild(tokenRow("表記", u.spans || []));
    } else {
      var row1 = el("div", "c-feedrow");
      row1.appendChild(el("label", null, "表記"));
      var pl = el("span", null, u.hyoki);
      pl.setAttribute("data-src", "lyric:" + stateId);
      row1.appendChild(pl);
      box.appendChild(row1);
      box.appendChild(tokenRow("読み取り用の表記", u.spans || []));
      box.appendChild(el("div", "c-feednote", SPAN_NOTE));
    }
    return box;
  }

  /** 読みの出所の表示（機械の読み取り／手で直した）。読みの高低・句切れを出す絵に添える。 */
  function hlSource(stateId) {
    var u = state(stateId);
    var t = u.hand ? "出所: 手で直した（もとは機械の読み取り）" : "出所: 機械の読み取り（accent.py）";
    var d = el("div", "c-hlsrc", t);
    d.setAttribute("data-calc", "hlsrc:" + stateId);
    return d;
  }

  /** 実PianoRoll断片（読み取り専用）。音符・カナ・印を LAYOUT の式から描く。
   *  opts: {marksOpts, glowSpan} */
  function prFragment(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var ns = notesOf(u);
    if (!ns) {
      var e = el("div", "c-pr-empty", "まだメロがありません");
      e.setAttribute("data-phrase", stateId);
      return e;
    }
    var moras = morasOf(u);
    var box = el("div", "c-pr");
    box.setAttribute("data-phrase", stateId);
    if (opts.marksOpts) box.setAttribute("data-marks-opts", JSON.stringify(opts.marksOpts));
    var sx = LAYOUT.PR_INNER_W / LAYOUT.TIME_W;
    var ystep = (LAYOUT.PR_H - LAYOUT.PR_PAD_T - LAYOUT.PR_PAD_B - LAYOUT.PR_NOTE_H) / LAYOUT.PITCH_RANGE;
    var nbars = u.bars ? (u.bars[1] - u.bars[0] + 1) : 2;
    for (var b = 1; b < nbars; b++) {
      var bl = el("div", "c-pr-bl");
      bl.style.left = px(LAYOUT.PR_PAD_L + (LAYOUT.PR_INNER_W * b) / nbars) + "px";
      box.appendChild(bl);
    }
    var mks = {};
    marksOf(u, opts.marksOpts).forEach(function (mk) { mks[mk.i] = mk; });
    var glow = null;
    if (opts.glowSpan != null && u.spans && u.spans[opts.glowSpan]) glow = u.spans[opts.glowSpan];
    ns.forEach(function (n, i) {
      var left = LAYOUT.PR_PAD_L + n.x * sx;
      var top = LAYOUT.PR_PAD_T + n.y * ystep;
      var ne = el("div", "c-pr-n", i < moras.length ? moras[i] : "");
      if (i < moras.length) ne.setAttribute("data-src", "mora:" + stateId + ":" + i);
      ne.setAttribute("data-nr", stateId + ":" + i);
      ne.style.left = px(left) + "px";
      ne.style.top = px(top) + "px";
      ne.style.width = px(n.w * sx) + "px";
      if (glow && i >= glow.m0 && i < glow.m1) { ne.classList.add("c-glow"); ne.setAttribute("data-glow", "1"); }
      box.appendChild(ne);
      if (mks[i]) markNote(ne, box, mks[i], left + n.w * sx / 2 - 5, top);
    });
    return box;
  }
  function prCaption() {
    return el("div", "c-prcap", "実メロの断片（読み取り専用・赤/黄の印は音符側）。タップするとピアノロールが開きます");
  }

  /** 高低線（読んだときの高低・2値）＋カナ行。範囲の編集画面用。
   *  hand（高低を手で直した状態）は反転したモーラの点に輪が付く（出所は hlSource で出す）。
   *  opts: {glowSpan, marksOpts, kana:false(カナ行なし), width, vw, padL} */
  function hlRow(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var ns = notesOf(u);
    var moras = morasOf(u);
    var acc = u.accent;
    var hl = effHl(u);
    var flipped = {};
    if (u.hand) u.hand.flipped.forEach(function (i) { flipped[i] = true; });
    var padL = opts.padL != null ? opts.padL : LAYOUT.PR_PAD_L;
    var W = opts.width || LAYOUT.PR_INNER_W;
    var vw = opts.vw || LAYOUT.TIME_W;
    var withKana = opts.kana !== false;
    var wrap = el("div", "c-cmp");
    wrap.setAttribute("data-phrase", stateId);
    wrap.setAttribute("data-vw", String(vw));
    wrap.setAttribute("data-w", String(W));
    wrap.setAttribute("data-padl", String(padL));
    wrap.style.height = (LAYOUT.HL_GRAPH + 2 + (withKana ? LAYOUT.HL_KANA_H : 0)) + "px";
    var svg = sv("svg", { width: W + padL, height: LAYOUT.HL_GRAPH,
      viewBox: "0 0 " + (W + padL) + " " + LAYOUT.HL_GRAPH });
    svg.setAttribute("data-hl", stateId);
    wrap.appendChild(svg);
    var sx = W / vw;
    var glow = null;
    if (opts.glowSpan != null && u.spans && u.spans[opts.glowSpan]) glow = u.spans[opts.glowSpan];
    /* 各モーラの区画 [left,width] を音符（あれば）か等間隔（なければ）から決める */
    var cells = [];
    for (var i = 0; i < moras.length; i++) {
      if (ns && i < ns.length) {
        cells.push([padL + ns[i].x * sx, ns[i].w * sx]);
      } else if (!ns) {
        var cw = Math.floor(W / Math.max(1, moras.length));
        cells.push([padL + i * cw, cw - 2]);
      } else {
        cells.push(null); // 音符なしのモーラは高低線に出さない（時間の基準が無い）
      }
    }
    if (acc) {
      cells.forEach(function (c) {
        if (!c) return;
        var cx = c[0] + c[1] / 2;
        svg.appendChild(sv("line", { class: "c-hl-guide", x1: cx, y1: LAYOUT.HL_PHR_Y + 5, x2: cx, y2: LAYOUT.HL_GRAPH - 2 }));
      });
      var i0 = 0;
      while (i0 < moras.length) {
        var apv = acc.ap[i0];
        var iEnd = i0;
        while (iEnd + 1 < moras.length && acc.ap[iEnd + 1] === apv) iEnd++;
        var pts = [];
        for (var j = i0; j <= iEnd; j++) {
          if (!cells[j]) continue;
          var cx2 = cells[j][0] + cells[j][1] / 2;
          var cy = hl[j] ? LAYOUT.HL_HI : LAYOUT.HL_LO;
          pts.push([cx2, cy, j]);
        }
        if (pts.length) {
          svg.appendChild(sv("polyline", { class: "c-hl-line",
            points: pts.map(function (p) { return px(p[0]) + "," + p[1]; }).join(" ") }));
          pts.forEach(function (p) {
            svg.appendChild(sv("circle", { class: "c-hl-dot", cx: px(p[0]), cy: p[1], r: LAYOUT.HL_DOT }));
            if (flipped[p[2]]) {
              var ring = sv("circle", { class: "c-hl-ring", cx: px(p[0]), cy: p[1], r: LAYOUT.HL_DOT + 2.4 });
              ring.setAttribute("data-hand", "1");
              svg.appendChild(ring);
            }
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
    if (withKana) {
      var kanaTop = LAYOUT.HL_GRAPH + 2;
      cells.forEach(function (c, i2) {
        if (!c) return;
        var tc = el("span", "c-tc", moras[i2]);
        tc.style.left = px(c[0]) + "px";
        tc.style.width = px(c[1]) + "px";
        tc.style.top = kanaTop + "px";
        tc.setAttribute("data-nc", ns ? stateId + ":" + i2 : "");
        tc.setAttribute("data-src", "mora:" + stateId + ":" + i2);
        if (glow && i2 >= glow.m0 && i2 < glow.m1) { tc.classList.add("c-glow"); tc.setAttribute("data-glow", "1"); }
        wrap.appendChild(tc);
      });
      if (ns) {
        slotIdxs(u).forEach(function (i2) {
          var kb = el("span", "c-kb2");
          kb.style.left = px(padL + ns[i2].x * sx) + "px";
          kb.style.width = px(ns[i2].w * sx) + "px";
          kb.style.top = kanaTop + "px";
          kb.setAttribute("data-nc", stateId + ":" + i2);
          wrap.appendChild(kb);
        });
      }
    }
    return wrap;
  }
  /** 通しの面の高低線（イントネーション切替の層・パーツ=hlLine・カナ行なし＝モーラ行が担う） */
  function hlLineRow(stateId, opts) {
    opts = opts || {};
    var u = state(stateId);
    var vw = opts.vw || u.w || LAYOUT.TIME_W;
    var row = hlRow(stateId, { kana: false, padL: 0, width: opts.width || vw, vw: vw });
    tag(row, "hlLine");
    return row;
  }
  function hlLabel() {
    var d = el("div", "c-cmplabel");
    d.appendChild(document.createTextNode("読んだときの高低"));
    d.appendChild(el("span", "c-cmplsub", "上=高い／下=低いの2値（辞書）・上端のバー＝アクセント句の区切り"));
    return d;
  }

  /** 「音の枠」欄の機械生成文（機械が書くのはこの欄だけ・出所を明記）。
   *  両埋まりの句も空箱にしない＝音数・読みの高低・印の個数を機械算出（差し戻し4・検証8-9）。 */
  function frameFieldContent(stateId, opts) {
    var u = state(stateId);
    var ns = notesOf(u);
    var lines = [], auto = "";
    var slots = ns ? slotIdxs(u) : [];
    if (ns && u.hyoki && !slots.length) {
      var m = morasOf(u).length;
      var over = m - ns.length;
      lines.push(over > 0 ? m + "音・音符" + ns.length + "個（字余り" + over + "）" : m + "音");
      lines.push("読み: " + M.hlText(effHl(u)) + (u.hand ? "（手で直した）" : "（機械の読み取り）"));
      var mks = marksOf(u, opts);
      var r = mks.filter(function (x) { return x.color === "r"; }).length;
      var y = mks.length - r;
      lines.push("印: " + (mks.length ? [r ? "赤" + r : "", y ? "黄" + y : ""].filter(Boolean).join("・") : "なし"));
      auto = "音数・読み・印は自動で出しています";
    } else if (ns && slots.length) {
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
      lines.push("読み: " + M.hlText(effHl(u)) + (u.hand ? "（手で直した）" : "（機械の読み取り）"));
      auto = "詞から自動で出しています";
    } else if (u.plan) {
      lines.push(planChipText(u.plan));
      auto = "予定から写しています";
    }
    return { lines: lines, auto: auto };
  }

  /** 意味（人が書く）と音の枠（機械が書く）の二欄。imi が無ければ空欄で出す */
  function fieldPair(stateId) {
    var u = state(stateId);
    var row = el("div", "c-fieldrow");
    var f1 = el("div", "c-field");
    f1.appendChild(el("h4", null, "意味（言いたいこと）"));
    if (u.imi) {
      var fill = el("div", "c-field-fill", u.imi);
      fill.setAttribute("data-src", "imi:" + stateId);
      f1.appendChild(fill);
    } else {
      f1.appendChild(el("div", "c-field-empty", "（まだ書いていない）"));
    }
    f1.appendChild(el("div", "c-field-auto", "自分で書く欄（機械は書かない）"));
    row.appendChild(f1);
    var f2 = el("div", "c-field");
    f2.appendChild(el("h4", null, "音の枠"));
    var fc = frameFieldContent(stateId);
    var fill2 = el("div", "c-field-fill");
    fill2.setAttribute("data-src", "frame:" + stateId);
    fc.lines.forEach(function (t, i) {
      if (i) fill2.appendChild(document.createElement("br"));
      fill2.appendChild(document.createTextNode(t));
    });
    f2.appendChild(fill2);
    if (fc.auto) f2.appendChild(el("div", "c-field-auto", fc.auto));
    row.appendChild(f2);
    return row;
  }

  /** 前後の句の縮小表示（薄い一行・編集画面用） */
  function neighborRow(stateId, prefix) {
    var u = state(stateId);
    var out = document.createDocumentFragment();
    var extra = [];
    if (u.bars) extra.push(barsLabel(u));
    if (!notesOf(u) && u.kind === "phrase" && u.hyoki) extra.push("メロなし");
    if (notesOf(u) && !u.hyoki && !u.noLyric) extra.push("詞の空き");
    out.appendChild(el("div", "c-ghostlbl", prefix + "（" + extra.join("・") + "）"));
    var row = el("div", "c-ku c-ghost c-noline");
    row.setAttribute("data-phrase", stateId);
    row.appendChild(notesOf(u) ? melo(stateId) : meloNone());
    if (u.hyoki) {
      var ly = el("div", "c-ly c-ly-s");
      var sp = el("span", null, displayText(u));
      sp.setAttribute("data-src", "lyric:" + stateId);
      ly.appendChild(sp);
      row.appendChild(ly);
    } else if (notesOf(u) && !u.noLyric) {
      row.appendChild(timeRow(stateId, "slots"));
    }
    out.appendChild(row);
    return out;
  }

  /** 対応句の参照行（同じメロの1番側の句・読み取り専用）。 */
  function refRow(stateId) {
    var u = state(stateId);
    if (!u.sameAs) throw new Error(stateId + " に sameAs が無い（対応句参照は同じメロの句だけ）");
    var refU = phrase(u.sameAs);
    var refSec = section(refU.section);
    var out = document.createDocumentFragment();
    out.appendChild(el("div", "c-ghostlbl", "対応する句（同じメロ）: " + refSec.name + " " + barsLabel(refU) + "（読み取り専用）"));
    var row = el("div", "c-ku c-refrow c-noline");
    row.setAttribute("data-phrase", u.sameAs);
    row.appendChild(melo(u.sameAs));
    var ly = el("div", "c-ly c-ly-s");
    if (refU.hyoki) {
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

  /** 候補カード（詞候補・メロ候補共用）。詞候補は表記＋読みの2層（裁定待ち1の論点は不変）。
   *  メロ候補は作り方（genNote）を正規経路で表示（差し戻し3＝手追記の禁止）。 */
  function candidateCard(candId) {
    var c = cand(candId);
    var tgt = phrase(c.target);
    var card = el("div", "c-cand");
    card.setAttribute("data-cand", candId);
    var badges;
    if (c.hyoki) {
      var w = el("div", "c-cand-w", c.hyoki);
      w.setAttribute("data-src", "cand:" + candId);
      card.appendChild(w);
      var rd = el("div", "c-cand-read", "読み: " + c.accent.moras.join(""));
      rd.setAttribute("data-src", "candread:" + candId);
      card.appendChild(rd);
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
      var gn = el("div", "c-cand-gen", "作り方: " + c.genNote);
      gn.setAttribute("data-src", "gennote:" + candId);
      card.appendChild(gn);
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
    var groups = {};
    var order = [];
    candIds.forEach(function (id) {
      var c = cand(id);
      var tgt = phrase(c.target);
      var badges = c.hyoki
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

  /** 候補依頼フォーム（条件の付け外し）。conds: "word"|"onsu"|"hl"|"imi" の配列。 */
  function requestForm(stateId, conds) {
    var u = state(stateId);
    var box = el("div", "c-reqform");
    box.appendChild(el("h3", null, "候補を頼む"));
    var defs = {
      word: { label: "使いたい語（任意・表記で）", value: "" },
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
      defs.hl.value = M.hlText(effHl(u));
    }
    (conds || []).forEach(function (k) {
      var d = defs[k];
      if (!d) throw new Error("候補依頼フォームの条件キーが不明: " + k);
      var row = el("div", "c-formrow");
      var lb = el("label", null, d.label);
      row.appendChild(lb);
      var fin = el("span", "c-fin", d.value);
      if (k === "imi" && d.value) fin.setAttribute("data-src", "imi:" + stateId);
      if ((k === "hl" || k === "onsu") && d.value) fin.setAttribute("data-src", "frame:" + stateId);
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

  /** 予定の記入フォーム（メモ・小節数・音数・読みの高低。すべて任意）。 */
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

  /** 空きの枠のその場入力（通しの面・枠がそのまま入力欄になる小さな絵）。
   *  ＝割当②の小フォーム。帯・マス表示でも畳んだ（チップ）状態でも同じフォームが開く。 */
  function slotInput(stateId) {
    var u = state(stateId);
    var row = el("div", "c-ku c-noline");
    row.setAttribute("data-phrase", stateId);
    var ly = el("div", "c-ly");
    if (u.hyoki) {
      var sp = el("span", null, displayText(u));
      sp.setAttribute("data-src", "lyric:" + stateId);
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

  /* ---------------- 案くらべ（枚2「印の決まり」専用） ---------------- */

  /** 案くらべ区画。印の案の上書き（timeRow の marksOpts・onsuDotSample）はこの中でだけ許す。 */
  function compareBox(title, children) {
    var d = el("div", "c-cmpbox");
    d.setAttribute("data-rule-compare", "1");
    d.appendChild(el("h3", null, title));
    (children || []).forEach(function (c) { d.appendChild(c); });
    return d;
  }
  /** 音数ドット案の見本（案くらべ区画専用・既定経路には通さない＝data-mk="onsu-an"）。 */
  function onsuDotSample(stateId) {
    var u = state(stateId);
    var ns = notesOf(u) || [];
    var m = u.hyoki ? morasOf(u).length : 0;
    var d = M.onsuDot(m, ns.length);
    var row = el("div", "c-onsuan");
    row.setAttribute("data-onsu-an", "1");
    row.appendChild(el("span", null, "音数ドット案: "));
    if (d) {
      var fd = el("span", "c-fd c-fd-y");
      fd.setAttribute("data-mk", "onsu-an");
      row.appendChild(fd);
      row.appendChild(el("span", "c-onsuan-why", "（" + d.why + "）"));
    } else {
      row.appendChild(el("span", "c-onsuan-why", "（食い違いなし＝ドットなし）"));
    }
    return row;
  }

  /** 枚13用: セクションの事実の小札（数値は全てデータから機械算出）。
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
      if (!u.noLyric && ((ns && slotIdxs(u).length) || (u.hyoki && u.plan))) lyGap++;
      if (ns && (u.band || (u.hyoki && morasOf(u).length > ns.length))) meloPart++;
      if (!ns && u.hyoki) meloNone2++;
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

  g.V8C = {
    LAYOUT: LAYOUT,
    PARTSETS: PARTSETS,
    DISPLAY_ITEMS: DISPLAY_ITEMS,
    SPAN_NOTE: SPAN_NOTE,
    registerSheet: registerSheet,
    renderAll: renderAll,
    sheets: sheets,
    /* データ読み出し */
    state: state, phrase: phrase, section: section, cand: cand,
    notesOf: notesOf, morasOf: morasOf, effHl: effHl, ysOf: ysOf, slotIdxs: slotIdxs,
    displayText: displayText, barsLabel: barsLabel, marksOf: marksOf,
    planChipText: planChipText, rowChipDefs: rowChipDefs, frameFieldContent: frameFieldContent,
    vowelOf: vowelOf,
    /* 通しの面（パーツ宣言制） */
    throughPane: throughPane,
    phone: phone, playbar: playbar, legendText: legendText, legendNote: legendNote,
    melo: melo, meloNone: meloNone, hyokiLine: hyokiLine, planChip: planChip,
    rowChips: rowChips, timeRow: timeRow, prMoraRow: prMoraRow, vowelRow: vowelRow, hlLineRow: hlLineRow,
    phraseRow: phraseRow, sectionHead: sectionHead,
    zoneRow: zoneRow, stockRow: stockRow, stockHead: stockHead, addRow: addRow,
    switchNote: switchNote, dispSheet: dispSheet, helpPanel: helpPanel,
    /* 範囲の編集画面 */
    prFragment: prFragment, prCaption: prCaption, hlRow: hlRow, hlLabel: hlLabel,
    feedRows: feedRows, hlSource: hlSource,
    fieldPair: fieldPair, neighborRow: neighborRow, refRow: refRow, ops: ops,
    candidateCard: candidateCard, candidateSheet: candidateSheet,
    requestForm: requestForm, planForm: planForm, slotInput: slotInput,
    /* 案くらべ・注記ほか */
    compareBox: compareBox, onsuDotSample: onsuDotSample,
    opsTableNote: opsTableNote, sectionFactChips: sectionFactChips,
    desc: desc, inset: inset,
  };
})(typeof window !== "undefined" ? window : globalThis);
