/* sheet-c8.js — 範囲の編集画面（表記を直した直後）。新設。
 * 実例=5–6小節「朝起きて　窓を開ける」(11音・空きゼロ) →「朝早く起きて　窓を開ける」
 * = 11→14モーラ・字余り3・音符なしモーラ3個・読みの高低も変わる（すべて焼き込みの実測値）。
 * 割付（モーラi↔音符i の恒等対応）が頭からずれる限界もそのまま出す。戻す操作つき。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var BASE = "A-1A-k1";
  var V = D.refs.editExample;   // A-1A-k1-v1 = 表記を直した直後
  var uB = C.state(BASE), uV = C.state(V);
  var GB = uB.spans.findIndex(function (s) { return s.s === "窓"; });   // 直す前の「窓」
  var GV = uV.spans.findIndex(function (s) { return s.s === "窓"; });   // 直した後の「窓」

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
  function editBox(stateId) {
    var w = el("div", "c8-edit");
    w.appendChild(el("div", "c8-edit-h", "そのまま書き換えられる（表記）"));
    var box = el("div", "c8-edit-in");
    var sp = el("span", null, C.displayText(C.state(stateId)));
    sp.setAttribute("data-src", "lyric:" + stateId);
    box.appendChild(sp);
    box.appendChild(el("b", null, "｜"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "c8",
    no: 8,
    title: "範囲の編集画面（表記を直した直後＝字余りと割付のずれ）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c8-edit{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:6px 0 6px}" +
      ".c8-edit-h{font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c8-edit-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:var(--fg)}" +
      ".c8-edit-in b{font-weight:400}" +
      ".c8-step{margin:8px 0 3px;font-size:10.5px;color:var(--muted)}" +
      ".c8-arrow{text-align:center;color:#565d69;font-size:12px;margin:2px 0}" +
      ".c8-note{font-size:10px;color:#c9b27a;border:1px dashed #8a7a4d;border-radius:8px;padding:6px 8px;margin:7px 0 3px;line-height:1.6}" +
      ".c8-toast{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:#1d2026;border-radius:9px;padding:6px 9px;margin-top:6px;font-size:12px}" +
      ".c8-undo{margin-left:auto;color:#9db8f7;border:1px solid var(--accent);border-radius:7px;padding:1px 8px;font-size:11px;white-space:nowrap}" +
      ".c8-cap{font-size:12px;color:var(--fg);font-weight:600;margin:14px 2px 6px}",
    build: function (root) {
      var mB = uB.accent.moras.length;
      var nN = C.notesOf(uB).length;
      var mV = uV.accent.moras.length;
      var tail = uV.accent.moras.slice(C.notesOf(uV).length).join("・");
      var addedWord = uV.spans[1].s;   // 早く

      /* ---- ① 直す前 ---- */
      var t1 = el("div", "c-target");
      t1.appendChild(editBox(BASE));
      t1.appendChild(C.prFragment(BASE, { glowSpan: GB }));
      t1.appendChild(C.prCaption());
      t1.appendChild(C.hlLabel());
      t1.appendChild(C.hlRow(BASE, { glowSpan: GB }));
      t1.appendChild(C.hlSource(BASE));

      /* ---- ② 直した直後 ---- */
      var t2 = el("div", "c-target");
      t2.appendChild(editBox(V));
      t2.appendChild(C.prFragment(V, { glowSpan: GV }));
      t2.appendChild(C.prMoraRow(V, { glowSpan: GV }));
      t2.appendChild(C.rowChips(V));
      t2.appendChild(C.hlRow(V, { glowSpan: GV }));
      t2.appendChild(C.hlSource(V));
      t2.appendChild(C.fieldPair(V));

      /* 割付のずれの限界（数値は全てデータから計算） */
      var note = el("div", "c8-note",
        "割付は句の頭からの順のまま。途中に「" + addedWord + "」を足したので、" +
        "「" + uV.spans[GV].s + "」は" + (uB.spans[GB].m0 + 1) + "つ目→" + (uV.spans[GV].m0 + 1) +
        "つ目の音符へずれ、末尾の「" + tail + "」（" + (mV - nN) + "音）には音符が無い。" +
        "モーラと音符の対応を手でずらす操作はまだ無い");

      var toast = el("div", "c8-toast");
      toast.appendChild(document.createTextNode("表記を直しました（読みを引き直しました）"));
      toast.appendChild(el("span", "c8-undo", "戻す"));

      /* ---- ③ 戻したあと ---- */
      var t3 = el("div", "c-target");
      t3.appendChild(editBox(BASE));
      t3.appendChild(C.prFragment(BASE));

      root.appendChild(C.phone(
        { crumb: crumbOf(BASE), playbar: false },
        [
          el("div", "c8-step", "① 直す前（" + mB + "音・音符" + nN + "個・空きなし）。「" + uB.spans[GB].s + "」の語が光っている"),
          t1,
          el("div", "c8-arrow", "↓"),
          el("div", "c8-step", "② 表記に「" + addedWord + "」を足した直後（" + mV + "音）。読み・印・高低・チップが引き直される"),
          t2,
          note,
          toast,
          el("div", "c8-arrow", "↓"),
          el("div", "c8-step", "③ 「戻す」を押すと元の表記に戻る"),
          t3,
        ]
      ));

      /* ---- 通しの面側の応答（態Aの宣言を参照） ---- */
      root.appendChild(el("div", "c8-cap", "通しの面の同じ行の応答（直す前）"));
      root.appendChild(C.phone(
        { title: D.songs.A.title, tab: "素", headBtn: "表示", playbar: false },
        [C.throughPane("A", function (pane) {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow(BASE));
          pane.appendChild(C.phraseRow("A-1A-k2"));
        })]
      ));
      root.appendChild(el("div", "c8-cap", "同じ行（直した直後）＝字余りのチップが出る"));
      root.appendChild(C.phone(
        { title: D.songs.A.title, tab: "素", headBtn: "表示", playbar: false },
        [C.throughPane("A", function (pane) {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow(V));
          pane.appendChild(C.phraseRow("A-1A-k2"));
        })]
      ));

      root.appendChild(C.desc(
        "枚8（新設・§R-5の実例）。直後=variant（A-1A-k1-v1）＝11→14モーラ・字余り3・音符なしモーラ（あ・け・る）は" +
        "モーラ行の末尾に灰色（折返し）＋「字余り3」チップ＋音の枠「14音・音符11個（字余り3）」（全て機械算出）。" +
        "恒等対応の限界＝「窓」の光りが6つ目→9つ目の音符へ移るのを隠さず出し、枠内の注記にも明記" +
        "（割付を手でずらす操作を入れるかは裁定待ち・§10-3）。通しの面側は態A宣言参照。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
