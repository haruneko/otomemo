/* sheet-cmel.js — 範囲の編集画面（メロ側の空き）＋メロ候補シート＋孤立。
 * v6枚6の生存＋追加: 「メロ候補を頼む」の先（候補の一覧と選んで置く操作）。
 * 孤立の例はデータ参照（refs.isolationExample）＝実在の予定を指す。 */
(function (g) {
  "use strict";
  var C = g.V7C, D = g.V7DATA;
  var KU = D.refs.melCandTarget; // "A-C-k2"（詞あり・メロなし）
  var MC = ["A-C-k2-mc1", "A-C-k2-mc2", "A-C-k2-mc3"];

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
    var r = el("div", "cmel-range");
    r.appendChild(el("span", "cmel-rh", "◀ のばす"));
    r.appendChild(el("span", "cmel-rc", center));
    r.appendChild(el("span", "cmel-rh", "のばす ▶"));
    return r;
  }
  function isoRow(lab, inner) {
    var row = el("div", "cmel-isorow");
    row.appendChild(el("span", "cmel-isolab", lab));
    var body = el("div", "cmel-isobody");
    body.appendChild(inner);
    row.appendChild(body);
    return row;
  }

  C.registerSheet({
    id: "cmel",
    no: 9,
    title: "範囲の編集画面（メロ側の空き・メロ候補・孤立）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "ア", yellowUse: "B" },
    css: "" +
      ".cmel-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".cmel-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".cmel-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);white-space:nowrap;overflow:hidden}" +
      ".cmel-cap{font-size:12px;color:var(--fg);font-weight:600;margin:0 2px 6px}" +
      ".cmel-gap{height:22px}" +
      ".cmel-pick{outline:2px solid var(--accent);outline-offset:-1px}" +
      ".cmel-note{font-size:9.5px;color:#6d7480;margin-top:3px}" +
      ".cmel-isorow{display:flex;gap:7px;align-items:stretch;margin:6px 0}" +
      ".cmel-isolab{flex:none;width:30px;font-size:10px;color:var(--muted);display:flex;align-items:center}" +
      ".cmel-isobody{flex:1;min-width:0}" +
      ".cmel-none{border:1px dashed #3c414a;border-radius:9px;padding:10px 10px;color:#565d69;font-size:11px}",
    build: function (root) {
      /* ---- 上: メロ側の空きの句＋メロ候補シート ---- */
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU)); // メロなし＝「まだメロがありません」
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU));      // 詞から読みの高低は見える（等間隔）
      t.appendChild(C.fieldPair(KU));

      var sheet = C.candidateSheet(MC, "order");
      var cards = sheet.querySelectorAll(".c-cand");
      MC.forEach(function (id, i) {
        if (C.cand(id).genNote) cards[i].appendChild(el("div", "cmel-note", C.cand(id).genNote));
      });
      cards[0].classList.add("cmel-pick");

      root.appendChild(el("div", "cmel-cap", "メロ側が空きの句を開いたとき"));
      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          rangeBar("範囲: " + C.barsLabel(C.phrase(KU)) + "の句"),
          C.neighborRow("A-C-k1", "前の句"),
          t,
          C.neighborRow("A-C-k3", "次の句"),
          C.ops([{ t: "メロ候補を頼む", main: true }, "ピアノロールで置く", "配置を開く", "相談"]),
          sheet,
          el("div", "c-ghostlbl", "選んでいる候補に枠が付く。置いたあとも「戻す」で取り消せる"),
          C.ops([{ t: "この並びで置く", main: true }, "ほかを頼む", "やめる"]),
        ]
      ));

      root.appendChild(el("div", "cmel-gap"));

      /* ---- 下: 孤立（前後とも何も無い場所を開いたとき）。指し先はデータ参照 ---- */
      var iso = D.planById[D.refs.isolationExample]; // 実在の予定
      var zoneId = iso.owner;                        // その予定が付いた区間
      var zsec = C.section(C.phrase(zoneId).section);
      var t2 = el("div", "c-target");
      t2.appendChild(C.zoneRow(zoneId));
      t2.appendChild(C.fieldPair(zoneId));
      root.appendChild(el("div", "cmel-cap", "まだ何も無い場所をひとつだけ開いたとき（前後も無い）"));
      root.appendChild(C.phone(
        { crumb: D.songs[C.phrase(zoneId).song].title.replace(/（.*$/, "") + " › " + zsec.name + (zsec.kari ? "（仮）" : ""), playbar: false },
        [
          isoRow("前", el("div", "cmel-none", "まだ何も無い")),
          isoRow("対象", t2),
          isoRow("あと", el("div", "cmel-none", "まだ何も無い")),
          el("div", "c-ghostlbl", "前後が空であることが、そのまま表示になる（特別な名札は付けない）"),
          C.ops(["予定を直す", "句を足す", { t: "候補を頼む", main: true }, "相談"]),
        ]
      ));

      root.appendChild(C.desc(
        "枚9（v6の枚6の生存＋修正）。欠陥4=「メロ候補を頼む」の先＝候補シート（矩形表記＋機械バッジ。" +
        "沿う/逆行は事実表示であり保証ではない＝二段DP不採用の既決に沿う）。選んで置く→戻すも明示。" +
        "欠陥16=孤立例の指し先を refs.isolationExample（大サビ（仮）の実在の予定）に修正。" +
        "genNote（各候補の作り方の説明）はデータにあるが candidateCard が表示しないため手で追記＝正規経路を工程0へ依頼。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
