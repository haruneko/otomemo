/* sheet-c4.js — 範囲の編集画面（範囲=句・詞の空き・候補=合いそうな順の案）。
 * v6枚4の生存＋追加: 自分の言葉を書く欄（候補より上・句の直下）・
 * 候補を入れる→入った直後→戻すの一連・範囲バー（範囲=句はその一例）。 */
(function (g) {
  "use strict";
  var C = g.V7C, D = g.V7DATA;
  var KU = "A-1A-k2";
  var LC = "A-1A-k2-lc1";

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
    var r = el("div", "c4-range");
    r.appendChild(el("span", "c4-rh", "◀ のばす"));
    r.appendChild(el("span", "c4-rc", center));
    r.appendChild(el("span", "c4-rh", "のばす ▶"));
    return r;
  }
  function writeBox() {
    var slots = C.slotIdxs(C.phrase(KU)).length;
    var w = el("div", "c4-write");
    var h = el("div", "c4-write-h", "この空きに自分の言葉で書く");
    h.appendChild(el("span", "c4-write-n", "空き" + slots + "音"));
    w.appendChild(h);
    var box = el("div", "c4-write-in");
    box.appendChild(el("b", null, "｜"));
    box.appendChild(document.createTextNode("（ここにそのまま打てる）"));
    w.appendChild(box);
    return w;
  }
  function targetBlock() {
    var t = el("div", "c-target");
    t.appendChild(C.prFragment(KU));
    t.appendChild(C.prCaption());
    t.appendChild(C.hlLabel());
    t.appendChild(C.hlRow(KU));
    t.appendChild(writeBox());
    t.appendChild(C.fieldPair(KU));
    return t;
  }
  /* ② 入った直後（素の表示。句のテキスト＋入れた語） */
  function mergedRow() {
    var row = el("div", "c-ku c-noline");
    row.setAttribute("data-phrase", KU);
    row.appendChild(C.melo(KU));
    var ly = el("div", "c-ly");
    var sp = el("span", null, C.displayText(C.phrase(KU)));
    sp.setAttribute("data-src", "lyric:" + KU);
    ly.appendChild(sp);
    ly.appendChild(document.createTextNode("　"));
    var w = el("span", "c4-in", C.cand(LC).word);
    w.setAttribute("data-src", "cand:" + LC);
    ly.appendChild(w);
    row.appendChild(ly);
    return row;
  }
  function toast() {
    var t = el("div", "c4-toast");
    t.appendChild(document.createTextNode("「"));
    var w = el("span", null, C.cand(LC).word);
    w.setAttribute("data-src", "cand:" + LC);
    t.appendChild(w);
    t.appendChild(document.createTextNode("」を空きに入れました"));
    t.appendChild(el("span", "c4-undo", "戻す"));
    return t;
  }
  /* ③ 戻したあと（元の空きの枠に戻る） */
  function revertRow() {
    var row = el("div", "c-ku c-noline");
    row.setAttribute("data-phrase", KU);
    row.appendChild(C.melo(KU));
    row.appendChild(C.lyricLine(KU));
    row.appendChild(C.timeRow(KU, "slots"));
    return row;
  }

  C.registerSheet({
    id: "c4",
    no: 5,
    title: "範囲の編集画面（範囲=句・詞の空き・候補=合いそうな順の案）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "ア", yellowUse: "B" },
    css: "" +
      ".c4-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".c4-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".c4-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);white-space:nowrap;overflow:hidden}" +
      ".c4-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:9px 0 3px}" +
      ".c4-write-h{display:flex;align-items:center;font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c4-write-n{margin-left:auto;color:var(--muted);font-size:10px}" +
      ".c4-write-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:#5c6577}" +
      ".c4-write-in b{color:var(--fg);font-weight:400}" +
      ".c4-step{margin:8px 0 3px;font-size:10.5px;color:var(--muted)}" +
      ".c4-arrow{text-align:center;color:#565d69;font-size:12px;margin:2px 0}" +
      ".c4-in{background:rgba(58,109,240,.25);border-radius:4px;padding:0 3px}" +
      ".c4-toast{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:#1d2026;border-radius:9px;padding:6px 9px;margin-top:6px;font-size:12px}" +
      ".c4-undo{margin-left:auto;color:#9db8f7;border:1px solid var(--accent);border-radius:7px;padding:1px 8px;font-size:11px;white-space:nowrap}",
    build: function (root) {
      var seq = C.inset("候補を入れてみる → 戻す", [
        el("div", "c4-step", "① 候補の「入れる」を押す"),
        C.candidateCard(LC),
        C.ops([{ t: "この語を空きに入れる", main: true }, "やめる"]),
        el("div", "c4-arrow", "↓"),
        el("div", "c4-step", "② 入った直後。そのまま歌って確かめられる"),
        mergedRow(),
        toast(),
        el("div", "c4-arrow", "↓"),
        el("div", "c4-step", "③ 「戻す」を押すと元の空きに戻る"),
        revertRow(),
      ]);
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          rangeBar("範囲: " + C.barsLabel(C.phrase(KU)) + "の句"),
          el("div", "c-ghostlbl", "範囲は語からセクション・曲全体までのばせる（端をつかんでのばす）"),
          C.neighborRow("A-1A-k1", "前の句"),
          targetBlock(),
          C.neighborRow("A-1A-k3", "次の句"),
          C.ops([{ t: "候補を探す", main: true }, "歌詞ネタから引く", "相談", "メロを開く", "配置を開く", "この範囲は詞を付けない"]),
          C.candidateSheet(["A-1A-k2-lc1", "A-1A-k2-lc2", "A-1A-k2-lc3", "A-1A-k2-lc4"], "order"),
          seq,
        ]
      ));
      root.appendChild(C.desc(
        "枚5（v6の枚4の生存＋修正）。欠陥1=自分の言葉を書く欄（候補より上・空きの句の直下に常設）。" +
        "欠陥3・8=入れる→入った直後→戻すの一連（下書き/確定の状態ラベルは作らない＝裁定2）。" +
        "欠陥12への布石=上端の範囲バーで「範囲=句」はレンジの一点だと示す。" +
        "②の絵は素の表示（テキスト結合）でしか描けない＝合成後のaccent焼き込みが無いため（工程0依頼）。" +
        "印は規則関数（ア/B）由来＝この句では印なし（v6の「で」の赤はこの案では出ない＝印の規則表の裁定対象）。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
