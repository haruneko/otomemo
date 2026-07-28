/* sheet-c11.js — 範囲の編集画面（メロ側の空き・メロ候補・孤立）。
 * v8差分: メロ候補カードの「作り方」は genNote の正規経路（candidateCard が表示・手追記なし）。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var KU = D.refs.melCandTarget;   // A-C-k2（詞あり・メロ空き）
  var ZONE = "A-oosabi-z1";        // 孤立（前後も無い）

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
    var r = el("div", "c11-range");
    r.appendChild(el("span", "c11-rh", "◀ のばす"));
    r.appendChild(el("span", "c11-rc", center));
    r.appendChild(el("span", "c11-rh", "のばす ▶"));
    return r;
  }

  C.registerSheet({
    id: "c11",
    no: 11,
    title: "範囲の編集画面（メロ側の空き・メロ候補・孤立）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c11-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".c11-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".c11-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);white-space:nowrap;overflow:hidden}" +
      ".c11-cap{font-size:12px;color:var(--fg);font-weight:600;margin:0 2px 6px}" +
      ".c11-gap{height:22px}" +
      ".c11-sel{border-color:var(--accent)}" +
      ".c11-emptylbl{font-size:10px;color:var(--muted);margin:8px 2px 2px}" +
      ".c11-emptybox{border:1px dashed #454b56;border-radius:9px;padding:10px;color:#565d69;font-size:11px;text-align:center}",
    build: function (root) {
      /* ---- 上: メロ側が空きの句 ---- */
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU));   // まだメロがありません
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU));
      t.appendChild(C.hlSource(KU));
      t.appendChild(C.fieldPair(KU));

      var candSheet = C.candidateSheet(["A-C-k2-mc1", "A-C-k2-mc2", "A-C-k2-mc3"], "order");
      var firstCard = candSheet.querySelector(".c-cand");
      if (firstCard) firstCard.classList.add("c11-sel");

      root.appendChild(el("div", "c11-cap", "メロ側が空きの句を開いたとき"));
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          rangeBar("範囲: " + C.barsLabel(C.phrase(KU)) + "の句"),
          C.neighborRow("A-C-k1", "前の句"),
          t,
          C.neighborRow("A-C-k3", "次の句"),
          C.ops([{ t: "メロ候補を頼む", main: true }, "ピアノロールで置く", "配置を開く", "相談"]),
          candSheet,
          el("div", "c-ghostlbl", "選んでいる候補に枠が付く。置いたあとも「戻す」で取り消せる"),
          C.ops([{ t: "この並びで置く", main: true }, "ほかを頼む", "やめる"]),
        ]
      ));

      root.appendChild(el("div", "c11-gap"));

      /* ---- 下: 孤立（まだ何も無い場所をひとつだけ開いたとき・前後も無い） ---- */
      var zsec = C.section(C.phrase(ZONE).section);
      var t2 = el("div", "c-target");
      t2.appendChild(C.zoneRow(ZONE));
      t2.appendChild(C.fieldPair(ZONE));

      root.appendChild(el("div", "c11-cap", "まだ何も無い場所をひとつだけ開いたとき（前後も無い）"));
      root.appendChild(C.phone(
        { crumb: D.songs.A.title.replace(/（.*$/, "") + " › " + zsec.name + (zsec.kari ? "（仮）" : ""), playbar: false },
        [
          el("div", "c11-emptylbl", "前"),
          el("div", "c11-emptybox", "まだ何も無い"),
          t2,
          el("div", "c11-emptylbl", "あと"),
          el("div", "c11-emptybox", "まだ何も無い"),
          el("div", "c-ghostlbl", "前後が空であることが、そのまま表示される（特別な名札は付けない）"),
          C.ops(["予定を直す", "句を足す", { t: "候補を頼む", main: true }, "相談"]),
        ]
      ));

      root.appendChild(C.desc(
        "枚11（差し戻し3の解消）。メロ候補カードの「作り方」は candidateCard の正規経路（data-src=gennote）で" +
        "データの genNote を表示＝手追記は出所照合で落ちる。孤立=大サビ（仮）の予定（しずかめに・8音×2くらい）は" +
        "音の枠に「予定から写しています」で機械転記。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
