/* sheet-c5.js — 範囲の編集画面（同じ画面・候補=事実で区分する案）。
 * v6枚5の生存。並べ方の比較材料なので細身。自分の言葉の欄はここでも候補より上。 */
(function (g) {
  "use strict";
  var C = g.V7C, D = g.V7DATA;
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
  function writeBox() {
    var slots = C.slotIdxs(C.phrase(KU)).length;
    var w = el("div", "c5-write");
    var h = el("div", "c5-write-h", "この空きに自分の言葉で書く");
    h.appendChild(el("span", "c5-write-n", "空き" + slots + "音"));
    w.appendChild(h);
    var box = el("div", "c5-write-in");
    box.appendChild(el("b", null, "｜"));
    box.appendChild(document.createTextNode("（ここにそのまま打てる）"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "c5",
    no: 6,
    title: "範囲の編集画面（枚5と同じ画面・候補=事実で区分する案）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "ア", yellowUse: "B" },
    css: "" +
      ".c5-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:9px 0 3px}" +
      ".c5-write-h{display:flex;align-items:center;font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c5-write-n{margin-left:auto;color:var(--muted);font-size:10px}" +
      ".c5-write-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:#5c6577}" +
      ".c5-write-in b{color:var(--fg);font-weight:400}",
    build: function (root) {
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU));
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU));
      t.appendChild(writeBox());
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          t,
          C.candidateSheet(["A-1A-k2-lc1", "A-1A-k2-lc2", "A-1A-k2-lc3", "A-1A-k2-lc4"], "group"),
        ]
      ));
      root.appendChild(C.desc(
        "枚6（v6の枚5の生存・裁定7の比較材料・もう一方の案）。同じ句・同じ候補で並べ方だけ違う。" +
        "自分の言葉の欄はこの案でも候補より上（欠陥1の塞ぎは並べ方の裁定に依存しない）。" +
        "入れる→戻すの一連は順の案の枚に描いた（画面は同一なので両案共通）。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
