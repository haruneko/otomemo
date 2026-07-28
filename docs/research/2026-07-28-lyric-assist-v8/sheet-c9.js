/* sheet-c9.js — 範囲の編集画面（かな書きの句と読み取りの誤り）。新設。
 * 句 = C-A-k2「にわへ　みずをまく」（詞だけの曲・メロなし）。両案を描く:
 *  案1 = 読み取り用の表記「庭へ　みずをまく」を添えて読みが直る before/after
 *  案2 = 読みの高低をタップで反転する手上書きの1状態（出所が「手で直した」に変わる）
 * 光りは読み取り用の表記の欄にだけ出る（表記の欄は光らない＝その旨の一言は feedRows が出す）。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var M = g.V8MARKS;
  var KU = D.refs.kanaPhrase;        // C-A-k2
  var V1 = D.refs.yomiSrcExample;    // C-A-k2-v1（読み取り用の表記を添えた後）
  var V2 = D.refs.handHlExample;     // C-A-k2-v2（高低を手で直した後）
  var uK = C.state(KU), u1 = C.state(V1), u2 = C.state(V2);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  C.registerSheet({
    id: "c9",
    no: 9,
    title: "範囲の編集画面（かな書きの句・読み取りの誤りの受け止め2案）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c9-plan{border:1px solid var(--line);border-radius:12px;background:#1a1d24;padding:8px 9px;margin-top:12px}" +
      ".c9-plan h3{margin:0 0 6px;font-size:12px;color:var(--fg)}" +
      ".c9-note{font-size:10px;color:#c9b27a;border:1px dashed #8a7a4d;border-radius:8px;padding:6px 8px;margin:7px 0 3px;line-height:1.6}" +
      ".c9-arrow{text-align:center;color:#565d69;font-size:12px;margin:4px 0}",
    build: function (root) {
      var sec = C.section(uK.section);
      var song = D.songs[uK.song];
      var pos = sec.units.findIndex(function (u) { return u.id === KU; }) + 1;
      var crumb = song.title.replace(/（.*$/, "") + " › " + sec.name + " › " + pos + "つ目の句";

      var wrongTokens = uK.spans.slice(0, 3).map(function (s) { return s.s; }).join("・");
      var wrongHl = M.hlText(uK.accent.hl.slice(0, 3));
      var rightHl = M.hlText(u1.accent.hl.slice(0, 3));

      /* ---- 今の状態（機械の読み取りのまま） ---- */
      var t0 = el("div", "c-target");
      t0.appendChild(C.prFragment(KU));   // まだメロがありません
      t0.appendChild(C.hlLabel());
      t0.appendChild(C.hlRow(KU));
      t0.appendChild(C.hlSource(KU));
      t0.appendChild(C.feedRows(KU));
      t0.appendChild(el("div", "c9-note",
        "機械の読み取りが違う: 語の割りが「" + wrongTokens + "」になり、頭の3音が「" + wrongHl +
        "」と読まれている。「庭に水をまく」のつもりの読みと合わない"));

      /* ---- 案1: 読み取り用の表記を添える ---- */
      var p1 = el("div", "c9-plan");
      p1.appendChild(el("h3", null, "案1: 読み取り用の表記を添える"));
      p1.appendChild(el("div", "c9-arrow", "↓ 読み取り用の表記に「" + u1.yomiSrc.replace(/　.*$/, "") + "」と書いた直後"));
      p1.appendChild(C.feedRows(V1, { glowSpan: 0 }));
      p1.appendChild(C.hlRow(V1, { glowSpan: 0 }));
      p1.appendChild(C.hlSource(V1));
      p1.appendChild(el("div", "c9-note",
        "頭の3音が「" + rightHl + "」に直り、アクセント句の切れ目も直る。光りは読み取り用の表記の語「" +
        u1.spans[0].s + "」とそのモーラに出ている"));

      /* ---- 案2: 読みの高低を手で上書き ---- */
      var p2 = el("div", "c9-plan");
      p2.appendChild(el("h3", null, "案2: 読みの高低をタップで反転（手で直す）"));
      p2.appendChild(el("div", "c9-arrow", "↓ モーラの点を" + u2.hand.flipped.length + "か所タップして反転した直後"));
      p2.appendChild(C.hlRow(V2));
      p2.appendChild(C.hlSource(V2));
      p2.appendChild(el("div", "c9-note",
        "輪の付いた点＝手で反転したモーラ。高低は直るが、アクセント句の切れ目（上端のバー）は機械の読みのまま。" +
        "出所の表示が「手で直した」に変わる"));

      root.appendChild(C.phone(
        { crumb: crumb, playbar: false },
        [
          el("div", "c-ghostlbl", "かなで書いた句（それも表記）。メロはまだ無い"),
          t0,
          p1,
          p2,
        ]
      ));

      root.appendChild(C.desc(
        "枚9（新設・§1-6＝裁定待ち§10-2の両案）。実測: 「にわへ」=高高低（誤・に|わへ に割れる）／" +
        "「庭へ」=低高高（正）。案1=v1（yomiSrc・spansはyomiSrcに張る・表記欄は光らない旨の一言はfeedRowsの共通文）。" +
        "案2=v2（hand.flipped=[0,2]・輪と出所表示）。案2で句切れが直らないのは焼き込みデータの事実" +
        "（apは機械の読みのまま）＝両案の差として絵に出した。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
