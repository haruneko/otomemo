/* sheet-c6.js — 範囲の編集画面（枚5と同じ画面・候補=事実で区分する案）。
 * v8差分: 候補カードが表記＋読みの2層表示になる（並べ方2案の論点は不変）。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var KU = "A-1A-k2";

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
  function writeBox(kuId) {
    var slots = C.slotIdxs(C.state(kuId)).length;
    var w = el("div", "c6-write");
    var h = el("div", "c6-write-h", "この空きに自分の言葉で書く（表記のまま打てる）");
    h.appendChild(el("span", "c6-write-n", "空き" + slots + "音"));
    w.appendChild(h);
    var box = el("div", "c6-write-in");
    box.appendChild(el("b", null, "｜"));
    box.appendChild(document.createTextNode("（ここにそのまま打てる）"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "c6",
    no: 6,
    title: "範囲の編集画面（枚5と同じ画面・候補=事実で区分する案）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c6-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:9px 0 3px}" +
      ".c6-write-h{display:flex;align-items:center;font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c6-write-n{margin-left:auto;color:var(--muted);font-size:10px;white-space:nowrap}" +
      ".c6-write-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:#5c6577}" +
      ".c6-write-in b{color:var(--fg);font-weight:400}",
    build: function (root) {
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU));
      t.appendChild(C.prCaption());
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU));
      t.appendChild(C.hlSource(KU));
      t.appendChild(writeBox(KU));

      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          t,
          C.candidateSheet(["A-1A-k2-lc1", "A-1A-k2-lc2", "A-1A-k2-lc3", "A-1A-k2-lc4"], "group"),
        ]
      ));

      root.appendChild(C.desc(
        "枚6（裁定待ち1の対抗案・候補=事実で区分）。候補カードは表記＋読みの2層表示になった（区分の論点は不変）。" +
        "区分の見出し・バッジは marks.js の機械生成。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
