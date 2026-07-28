/* sheet-c10.js — 範囲の編集画面（広い範囲：セクション全体 → 全部選択）。
 * v8差分: 縮小表記が表記（漢字仮名交じり）になる。全部選択の通しの面部分は
 * 態A（枚1の既定）の宣言を参照して再レンダ＝独自の宣言は書かない。 */
(function (g) {
  "use strict";
  var C = g.V8C, D = g.V8DATA;
  var FOCUS1 = "A-1B-k2";   // セクション範囲で開いている句（詞の空き8音）
  var FOCUS2 = "A-1A-k2";   // 全部選択で開いている句

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function rangeBar(center, leftT, rightT) {
    var r = el("div", "c10-range");
    r.appendChild(el("span", "c10-rh", leftT));
    r.appendChild(el("span", "c10-rc", center));
    r.appendChild(el("span", "c10-rh", rightT));
    return r;
  }
  function writeBox(kuId) {
    var slots = C.slotIdxs(C.state(kuId)).length;
    var w = el("div", "c10-write");
    var h = el("div", "c10-write-h", "この空きに自分の言葉で書く（表記のまま打てる）");
    h.appendChild(el("span", "c10-write-n", "空き" + slots + "音"));
    w.appendChild(h);
    var box = el("div", "c10-write-in");
    box.appendChild(el("b", null, "｜"));
    box.appendChild(document.createTextNode("（ここにそのまま打てる）"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "c10",
    no: 10,
    title: "範囲の編集画面（広い範囲：セクション全体 → 全部選択）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "イ", yellowUse: "B" },
    css: "" +
      ".c10-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".c10-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".c10-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);line-height:1.4}" +
      ".c10-cap{font-size:12px;color:var(--fg);font-weight:600;margin:0 2px 6px}" +
      ".c10-gap{height:22px}" +
      ".c10-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:8px 0 3px}" +
      ".c10-write-h{display:flex;align-items:center;font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".c10-write-n{margin-left:auto;color:var(--muted);font-size:10px;white-space:nowrap}" +
      ".c10-write-in{min-height:24px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:#5c6577}" +
      ".c10-write-in b{color:var(--fg);font-weight:400}",
    build: function (root) {
      var song = D.songs.A;
      var songName = song.title.replace(/（.*$/, "");

      /* ---- 上: セクションまるごと（1番Bメロ 8小節） ---- */
      var sec1 = C.section(C.phrase(FOCUS1).section);
      var secBars = sec1.bars[0] + "–" + sec1.bars[1] + "小節";
      var focus1 = el("div", "c-target");
      focus1.appendChild(C.prFragment(FOCUS1));
      focus1.appendChild(writeBox(FOCUS1));
      focus1.appendChild(C.fieldPair(FOCUS1));
      focus1.appendChild(C.ops([{ t: "候補を探す", main: true }, "この範囲は詞を付けない", "閉じる"]));

      root.appendChild(el("div", "c10-cap", "セクションをまるごと開いたとき（範囲=" + secBars + "）"));
      root.appendChild(C.phone(
        { crumb: songName + " › " + sec1.name + " › " + secBars + "（セクション全体）", playbar: false },
        [
          rangeBar("範囲: " + sec1.name + "ぜんぶ（" + secBars + "）", "◀ のばす", "のばす ▶"),
          el("div", "c-ghostlbl", "範囲の中は句ごとの表記の行。タップした句だけ開く"),
          C.neighborRow("A-1B-k1", "範囲の中の句"),
          el("div", "c-ghostlbl", "開いている句（詞の空き）"),
          focus1,
          C.zoneRow("A-1B-z1"),
        ]
      ));

      root.appendChild(el("div", "c10-gap"));

      /* ---- 下: 全部選択（曲全体）＝通しの面部分は態Aの宣言で再レンダ ---- */
      var maxBar = 0, kariCount = 0;
      song.sections.forEach(function (s) {
        if (s.bars && s.bars[1] > maxBar) maxBar = s.bars[1];
        if (s.kari) kariCount++;
      });

      root.appendChild(el("div", "c10-cap", "全部選択（範囲=曲全体）のとき"));
      root.appendChild(C.phone(
        { crumb: songName + " › 全体（全部選択）", tab: "素", headBtn: "表示", playbar: true },
        [
          rangeBar("範囲: 全体（1–" + maxBar + "小節と仮セクション" + kariCount + "つ）", "◀ これで端", "これで端 ▶"),
          el("div", "c-ghostlbl", "並びは通しの面と同じ。開いている句だけ実表記の作業場で膨らむ。閉じればそのまま通しの面"),
          C.throughPane("A", function (pane) {
            song.sections.forEach(function (sec) {
              pane.appendChild(C.sectionHead(sec.id));
              (sec.units || []).forEach(function (u) {
                if (u.id === FOCUS2) {
                  pane.appendChild(el("div", "c-ghostlbl", "開いている句"));
                  var t = el("div", "c-target");
                  t.appendChild(C.prFragment(FOCUS2));
                  t.appendChild(writeBox(FOCUS2));
                  t.appendChild(C.ops([{ t: "候補を探す", main: true }, "閉じる"]));
                  pane.appendChild(t);
                } else if (u.kind === "zone") {
                  pane.appendChild(C.zoneRow(u.id));
                } else {
                  pane.appendChild(C.phraseRow(u.id));
                }
              });
            });
            pane.appendChild(C.addRow(["＋ セクションを足す", "＋ 予定を置く", "＋ 断片を置く"]));
            pane.appendChild(C.stockHead());
            (song.stock || []).forEach(function (st) { pane.appendChild(C.stockRow(st.id)); });
          }),
        ]
      ));

      root.appendChild(C.desc(
        "枚10（裁定待ち9・10）。上=セクション全体を1画面で（開いている句だけ実PianoRoll断片）。" +
        "下=全部選択＝通しの面部分を態A宣言（枚1の既定）参照で再レンダ（批判11対応・独自の宣言なし）。" +
        "縮小表記は表記（漢字仮名交じり）になった。パーツ選択の導入で全部選択と通しの面の見た目の距離が" +
        "縮んだ＝「地続き」の問いは同じまま出す（オーナーがひっくり返すならここと予告済み）。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
