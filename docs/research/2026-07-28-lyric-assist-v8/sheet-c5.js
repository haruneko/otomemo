/* sheet-c5.js — 範囲の編集画面（範囲=句・詞の空き・候補=合いそうな順の案）。
 * v8差分: 書き入れ欄=表記・「入れた直後」=variant（印・高低・母音が再計算された姿）・
 * 語↔モーラの光り1状態（feedRows の語トークン）・通しの面側の応答（態A宣言参照）。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var KU = "A-1A-k2";                 // 水を飲んでから（空き3音）
  var V1 = D.refs.insertExample;      // A-1A-k2-v1 = 候補を入れた直後
  var LC = "A-1A-k2-lc1";             // 外へ
  var GLOW = 2;                       // タップ中の語（飲ん）

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
    var r = el("div", "c5-range");
    r.appendChild(el("span", "c5-rh", "◀ のばす"));
    r.appendChild(el("span", "c5-rc", center));
    r.appendChild(el("span", "c5-rh", "のばす ▶"));
    return r;
  }
  function writeBox(kuId) {
    var slots = C.slotIdxs(C.state(kuId)).length;
    var w = el("div", "c5-write");
    var h = el("div", "c5-write-h", "この空きに自分の言葉で書く（表記のまま打てる）");
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
    no: 5,
    title: "範囲の編集画面（範囲=句・詞の空き・候補=合いそうな順の案）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c5-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".c5-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".c5-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);white-space:nowrap;overflow:hidden}" +
      ".c5-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:9px 0 3px}" +
      ".c5-write-h{display:flex;align-items:center;font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c5-write-n{margin-left:auto;color:var(--muted);font-size:10px;white-space:nowrap}" +
      ".c5-write-in{min-height:26px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:#5c6577}" +
      ".c5-write-in b{color:var(--fg);font-weight:400}" +
      ".c5-glownote{font-size:9.5px;color:#8a93a6;margin:2px 2px 0}" +
      ".c5-step{margin:8px 0 3px;font-size:10.5px;color:var(--muted)}" +
      ".c5-arrow{text-align:center;color:#565d69;font-size:12px;margin:2px 0}" +
      ".c5-vlab{font-size:10px;color:var(--fg);font-weight:600;margin:6px 2px 1px}" +
      ".c5-toast{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:#1d2026;border-radius:9px;padding:6px 9px;margin-top:6px;font-size:12px}" +
      ".c5-undo{margin-left:auto;color:#9db8f7;border:1px solid var(--accent);border-radius:7px;padding:1px 8px;font-size:11px;white-space:nowrap}" +
      ".c5-cap{font-size:12px;color:var(--fg);font-weight:600;margin:14px 2px 6px}",
    build: function (root) {
      var u = C.state(KU);

      /* ---- 開いた範囲（句）＝作業場。常に全部出す ---- */
      var t = el("div", "c-target");
      t.appendChild(C.prFragment(KU, { glowSpan: GLOW }));
      t.appendChild(C.prCaption());
      t.appendChild(C.hlLabel());
      t.appendChild(C.hlRow(KU, { glowSpan: GLOW }));
      t.appendChild(C.hlSource(KU));
      t.appendChild(C.feedRows(KU, { glowSpan: GLOW }));
      t.appendChild(el("div", "c5-glownote",
        "表記の語「" + u.spans[GLOW].s + "」をタップ中＝その語のモーラと音符が薄く光る"));
      t.appendChild(writeBox(KU));
      t.appendChild(C.fieldPair(KU));

      /* ---- 入れる → 直後 → 戻す（直後=焼き込みの再計算値） ---- */
      var seq = C.inset("候補を入れてみる → 戻す", [
        el("div", "c5-step", "① 候補の「入れる」を押す"),
        C.candidateCard(LC),
        C.ops([{ t: "この語を空きに入れる", main: true }, "やめる"]),
        el("div", "c5-arrow", "↓"),
        el("div", "c5-step", "② 入った直後。読みが引き直され、印・高低・母音も同時に変わる"),
        C.prFragment(V1),
        C.hlRow(V1),
        C.hlSource(V1),
        el("div", "c5-vlab", "母音の段"),
        C.vowelRow(V1, { width: C.LAYOUT.PR_INNER_W }),
        (function () {
          var toast = el("div", "c5-toast");
          toast.appendChild(document.createTextNode("「"));
          var w = el("span", null, C.cand(LC).hyoki);
          w.setAttribute("data-src", "cand:" + LC);
          toast.appendChild(w);
          toast.appendChild(document.createTextNode("」を空きに入れました"));
          toast.appendChild(el("span", "c5-undo", "戻す"));
          return toast;
        })(),
        C.fieldPair(V1),
        el("div", "c5-arrow", "↓"),
        el("div", "c5-step", "③ 「戻す」を押すと元の空きに戻る"),
        C.prFragment(KU),
      ]);

      root.appendChild(C.phone(
        { crumb: crumbOf(KU), playbar: false },
        [
          rangeBar("範囲: " + C.barsLabel(u) + "の句"),
          el("div", "c-ghostlbl", "範囲は語からセクション・曲全体までのばせる（端をつかんでのばす）"),
          C.neighborRow("A-1A-k1", "前の句"),
          t,
          C.neighborRow("A-1A-k3", "次の句"),
          C.ops([{ t: "候補を探す", main: true }, "歌詞ネタから引く", "相談", "メロを開く", "配置を開く", "この範囲は詞を付けない"]),
          C.candidateSheet(["A-1A-k2-lc1", "A-1A-k2-lc2", "A-1A-k2-lc3", "A-1A-k2-lc4"], "order"),
          seq,
        ]
      ));

      /* ---- 通しの面側の応答（態Aの宣言を参照・独自の宣言は書かない） ---- */
      root.appendChild(el("div", "c5-cap", "通しの面の同じ行の応答（入れる前）"));
      root.appendChild(C.phone(
        { title: D.songs.A.title, tab: "素", headBtn: "表示", playbar: false },
        [C.throughPane("A", function (pane) {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.phraseRow(KU));
        })]
      ));
      root.appendChild(el("div", "c5-cap", "同じ行（入れた直後）＝チップと印が引き直される"));
      root.appendChild(C.phone(
        { title: D.songs.A.title, tab: "素", headBtn: "表示", playbar: false },
        [C.throughPane("A", function (pane) {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.phraseRow(V1));
        })]
      ));

      root.appendChild(C.desc(
        "枚5（差し戻し2の解消＋§1-2の光り）。②の直後は variant（A-1A-k2-v1）＝accent.py 実走の焼き込みで、" +
        "印・高低・母音・音の枠が全て再計算値。語↔モーラの光り＝表記の語「飲ん」タップの1状態（glowSpan）。" +
        "書き入れ欄は表記のまま打てる欄に変更。通しの面側の応答は態A宣言参照（批判11対応）＝" +
        "入れる前「あと3音」チップ→直後はチップが消える。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
