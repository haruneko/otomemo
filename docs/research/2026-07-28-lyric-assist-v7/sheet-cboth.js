/* sheet-cboth.js — 範囲の編集画面（詞もメロも埋まった句・2番の例）。新設。
 * 書き換え（その場で打てる）・消す（空きに戻す）・1番の対応句（同じメロ）の参照行。 */
(function (g) {
  "use strict";
  var C = g.V7C, D = g.V7DATA;
  var KU = "A-2A-k1"; // 2番Aメロの頭の句（sameAs = 1番Aメロの頭）

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
  function rangeBar(center) {
    var r = el("div", "cboth-range");
    r.appendChild(el("span", "cboth-rh", "◀ のばす"));
    r.appendChild(el("span", "cboth-rc", center));
    r.appendChild(el("span", "cboth-rh", "のばす ▶"));
    return r;
  }
  /* 書き換え欄＝今の詞が入った状態でそのまま打てる */
  function rewriteBox() {
    var w = el("div", "cboth-write");
    w.appendChild(el("div", "cboth-write-h", "そのまま書き換えられる"));
    var box = el("div", "cboth-write-in");
    var sp = el("span", null, C.displayText(C.phrase(KU)));
    sp.setAttribute("data-src", "lyric:" + KU);
    box.appendChild(sp);
    box.appendChild(el("b", null, "｜"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "cboth",
    no: 7,
    title: "範囲の編集画面（詞もメロも埋まった句・2番の例）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "ア", yellowUse: "B" },
    css: "" +
      ".cboth-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".cboth-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".cboth-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);white-space:nowrap;overflow:hidden}" +
      ".cboth-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:9px 0 3px}" +
      ".cboth-write-h{font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".cboth-write-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:var(--fg)}" +
      ".cboth-write-in b{color:#9db8f7;font-weight:400}",
    build: function (root) {
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU));
      t.appendChild(C.prCaption());
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU));
      t.appendChild(rewriteBox());
      t.appendChild(C.fieldPair(KU));
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          rangeBar("範囲: " + C.barsLabel(C.phrase(KU)) + "の句"),
          t,
          C.refRow(KU),
          C.neighborRow("A-2A-k2", "次の句"),
          C.ops(["消す（空きに戻す）", { t: "候補を探す", main: true }, "歌詞ネタから引く", "メロを開く", "相談"]),
          el("div", "c-ghostlbl", "消しても「戻す」で取り消せる（メロは残る）"),
        ]
      ));
      root.appendChild(C.desc(
        "枚7（新設・欠陥2）。両方埋まった句を開いた絵＝2番の句の例。書き換え欄はその場で打てる形" +
        "（下書き/確定のラベル無し・裁定2）。欠陥9=1番の対応句（同じメロ）を参照行で表示（refRow・読み取り専用）。" +
        "次の句（2番の詞の空き）を並置し、消した後の見え方は隣の空き句の姿と同じであることが読み取れる。" +
        "「消した直後」を同一句で描くには詞を外した表示データが要る（工程0依頼）。印は規則関数（ア/B）＝この句は印なし＝よく嵌っている例。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
