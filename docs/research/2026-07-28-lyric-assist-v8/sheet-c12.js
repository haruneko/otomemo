/* sheet-c12.js — 候補を頼むとき（条件の付け外し）。
 * v8差分: 「使いたい語」は表記で書く欄になった（requestForm のラベルが担う）。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var KU = "A-1A-k2";      // 空き3音の句（音数・読みの高低が機械で埋まる）
  var BLANK = "A-1S-k4";   // 詞もメロもまだ無い場所（予定だけ）

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function crumbOf(id) {
    var u = C.phrase(id), sec = C.section(u.section);
    return D.songs[u.song].title.replace(/（.*$/, "") + " › " + sec.name + " › " + C.barsLabel(u);
  }

  C.registerSheet({
    id: "c12",
    no: 12,
    title: "範囲の編集画面（候補を頼むとき＝条件の付け外し）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c12-note{font-size:10.5px;color:var(--muted);margin:0 2px 8px;line-height:1.6}" +
      ".c12-cap{font-size:12px;color:var(--fg);font-weight:600;margin:12px 2px 0}",
    build: function (root) {
      var bsec = C.section(C.phrase(BLANK).section);
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          el("div", "c12-note", "条件は右の×で1つずつ外せる。全部外して頼むこともできる（同じフォームの4つの姿）"),
          el("div", "c12-cap", "条件をぜんぶ付けて頼む"),
          C.requestForm(KU, ["word", "onsu", "hl", "imi"]),
          el("div", "c12-cap", "意味だけで頼む"),
          C.requestForm(KU, ["imi"]),
          el("div", "c12-cap", "音数だけで頼む"),
          C.requestForm(KU, ["onsu"]),
          el("div", "c12-cap", "条件なしで頼む"),
          C.requestForm(KU, []),
          el("div", "c12-cap", "詞もメロもまだ無い場所（" + bsec.name + " › " + C.barsLabel(C.phrase(BLANK)) + "）で頼む＝条件は自分で書ける"),
          C.requestForm(BLANK, ["word", "onsu", "hl"]),
        ]
      ));

      root.appendChild(C.desc(
        "枚12（裁定待ち4=発散の形は不変）。「使いたい語」は表記で書く欄（ラベルに明記・requestFormの共通文言）。" +
        "音数・読みの高低の既定値は空きの音符から機械算出（data-src=frame）、意味は意味欄からの転記（data-src=imi）。" +
        "詞もメロも無い場所では全条件が空欄＝自分で書ける。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
