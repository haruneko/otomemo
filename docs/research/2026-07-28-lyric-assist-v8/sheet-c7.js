/* sheet-c7.js — 範囲の編集画面（詞もメロも埋まった句・2番の例）。
 * v8差分: 書き換え欄=表記・音の枠に中身（音数/読み/印を機械算出）・1番の対応句の参照行。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var KU = "A-2A-k1";   // 夜が来て　窓を閉める（1番と同じメロ・両埋まり）

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
    var r = el("div", "c7-range");
    r.appendChild(el("span", "c7-rh", "◀ のばす"));
    r.appendChild(el("span", "c7-rc", center));
    r.appendChild(el("span", "c7-rh", "のばす ▶"));
    return r;
  }
  /* 書き換え欄（表記のまま書き換えられる。中身はデータの表記＝出所つき） */
  function editBox(kuId) {
    var w = el("div", "c7-edit");
    w.appendChild(el("div", "c7-edit-h", "そのまま書き換えられる（表記）"));
    var box = el("div", "c7-edit-in");
    var sp = el("span", null, C.displayText(C.state(kuId)));
    sp.setAttribute("data-src", "lyric:" + kuId);
    box.appendChild(sp);
    box.appendChild(el("b", null, "｜"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "c7",
    no: 7,
    title: "範囲の編集画面（詞もメロも埋まった句・2番の例）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c7-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".c7-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".c7-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);white-space:nowrap;overflow:hidden}" +
      ".c7-edit{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:9px 0 3px}" +
      ".c7-edit-h{font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c7-edit-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:var(--fg)}" +
      ".c7-edit-in b{font-weight:400}",
    build: function (root) {
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU));
      t.appendChild(C.prCaption());
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU));
      t.appendChild(C.hlSource(KU));
      t.appendChild(editBox(KU));
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
        "枚7（差し戻し4の解消）。両埋まりの句でも音の枠が空箱でない＝音数・読みの高低・印の個数を" +
        "frameFieldContent が機械算出（検証8-9の対象）。書き換え欄は表記。1番の対応句（同じメロ）の参照行は" +
        "refRow（sameAs から機械で引く・読み取り専用）＝欠陥9への継続対応。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
