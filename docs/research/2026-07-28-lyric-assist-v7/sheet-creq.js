/* sheet-creq.js — 候補を頼むときの条件の付け外し（発散側の絵）。新設。
 * 条件をぜんぶ付ける／意味だけ／音数だけ／条件なし、の同じフォームの4態＋
 * 詞もメロもまだ無い場所で条件（読みの高低・使いたい語）を自分で置ける形。 */
(function (g) {
  "use strict";
  var C = g.V7C, D = g.V7DATA;
  var KU = D.refs.lyrCandTarget; // "A-1A-k2"（詞の空き3音）

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
    id: "creq",
    no: 10,
    title: "候補を頼むとき（条件の付け外し）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "ア", yellowUse: "B" },
    css: "",
    build: function (root) {
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          el("div", "c-ghostlbl", "条件は右の×で1つずつ外せる。全部外して頼むこともできる（同じフォームの4つの姿）"),
          C.inset("条件をぜんぶ付けて頼む", [C.requestForm(KU, ["word", "onsu", "hl", "imi"])]),
          C.inset("意味だけで頼む", [C.requestForm(KU, ["imi"])]),
          C.inset("音数だけで頼む", [C.requestForm(KU, ["onsu"])]),
          C.inset("条件なしで頼む", [C.requestForm(KU, [])]),
          C.inset("詞もメロもまだ無い場所（" + crumbOf("A-1S-k4").replace(/^[^›]*› /, "") + "）で頼む＝条件は自分で書ける",
            [C.requestForm("A-1S-k4", ["word", "onsu", "hl"])]),
        ]
      ));
      root.appendChild(C.desc(
        "枚10（新設・欠陥6・10）。発散の裁定材料＝条件を減らした候補依頼と既存の相談で「双方あるのが良い」の" +
        "発散側と呼べるかを仰ぐ。音数・読みの高低の初期値は音の枠から機械で写り、×で外せる。" +
        "「使いたい語（任意）」＝『通り過ぎる』型パズルの入口・「読みの高低（任意）」＝メロ未定でも" +
        "アクセントを条件に置ける欄（すべて任意＝裁定6の形式）。最下段はメロも詞も無い句（予定だけ）での姿。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
