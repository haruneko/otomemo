/* sheet-cwide.js — 範囲の編集画面（広い範囲）。新設。
 * 上=セクションまるごと（8小節）を1画面で。句ごとの縮小表記＋開いている句だけ実表記。
 * 下=全部選択（曲全体）。並びは歌詞全体画面と同じになり、開いている1句だけ実表記で膨らむ
 * ＝「歌詞全体を見るときは全部選択かな？」への絵の答え（切り替えではなく地続き）。 */
(function (g) {
  "use strict";
  var C = g.V7C, D = g.V7DATA;
  var FOCUS1 = "A-1B-k2";  // セクション範囲で開いている句（詞の空き）
  var FOCUS2 = "A-1A-k2";  // 全部選択で開いている句（語尾の空き）

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function rangeBar(center, leftT, rightT) {
    var r = el("div", "cwide-range");
    r.appendChild(el("span", "cwide-rh", leftT));
    r.appendChild(el("span", "cwide-rc", center));
    r.appendChild(el("span", "cwide-rh", rightT));
    return r;
  }
  function writeBox(kuId) {
    var slots = C.slotIdxs(C.phrase(kuId)).length;
    var w = el("div", "cwide-write");
    var h = el("div", "cwide-write-h", "この空きに自分の言葉で書く");
    h.appendChild(el("span", "cwide-write-n", "空き" + slots + "音"));
    w.appendChild(h);
    var box = el("div", "cwide-write-in");
    box.appendChild(el("b", null, "｜"));
    box.appendChild(document.createTextNode("（ここにそのまま打てる）"));
    w.appendChild(box);
    return w;
  }

  C.registerSheet({
    id: "cwide",
    no: 8,
    title: "範囲の編集画面（広い範囲：セクション全体 → 全部選択）",
    wide: false,
    demo: false,
    marksOpts: { flatPair: "ア", yellowUse: "B" },
    css: "" +
      ".cwide-range{display:flex;align-items:center;gap:7px;margin:0 0 6px}" +
      ".cwide-rh{font-size:10px;color:var(--muted);border:1px dashed #565d69;border-radius:7px;padding:2px 7px;white-space:nowrap}" +
      ".cwide-rc{flex:1;text-align:center;font-size:11px;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:2px 4px;background:var(--card);line-height:1.4}" +
      ".cwide-cap{font-size:12px;color:var(--fg);font-weight:600;margin:0 2px 6px}" +
      ".cwide-gap{height:22px}" +
      ".cwide-write{border:1px solid var(--accent);border-radius:10px;background:#151d2e;padding:7px 9px;margin:8px 0 3px}" +
      ".cwide-write-h{display:flex;align-items:center;font-size:11px;color:#9db8f7;margin-bottom:5px}" +
      ".cwide-write-n{margin-left:auto;color:var(--muted);font-size:10px}" +
      ".cwide-write-in{min-height:24px;border:1px solid #2c3a57;border-radius:7px;background:#10151f;padding:4px 8px;font-size:14px;color:#5c6577}" +
      ".cwide-write-in b{color:var(--fg);font-weight:400}",
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
      root.appendChild(el("div", "cwide-cap", "セクションをまるごと開いたとき（範囲=" + secBars + "）"));
      root.appendChild(C.phone(
        { crumb: songName + " › " + sec1.name + " › " + secBars + "（セクション全体）", playbar: false },
        [
          rangeBar("範囲: " + sec1.name + "ぜんぶ（" + secBars + "）", "◀ のばす", "のばす ▶"),
          el("div", "c-ghostlbl", "範囲の中は句ごとの縮小表記。タップした句だけ実表記で開く"),
          C.phraseRow("A-1B-k1", "plain"),
          el("div", "c-ghostlbl", "開いている句（実表記）"),
          focus1,
          C.zoneRow("A-1B-z1"),
        ]
      ));

      root.appendChild(el("div", "cwide-gap"));

      /* ---- 下: 全部選択（曲全体）。並びは歌詞全体画面と同じ ---- */
      var maxBar = 0, kariCount = 0;
      song.sections.forEach(function (s) {
        if (s.bars && s.bars[1] > maxBar) maxBar = s.bars[1];
        if (s.kari) kariCount++;
      });
      var body = [
        rangeBar("範囲: 全体（1–" + maxBar + "小節と仮セクション" + kariCount + "つ）", "◀ これで端", "これで端 ▶"),
      ];
      song.sections.forEach(function (sec) {
        body.push(C.sectionHead(sec.id));
        (sec.units || []).forEach(function (u) {
          if (u.id === FOCUS2) {
            body.push(el("div", "c-ghostlbl", "開いている句（実表記）"));
            var t = el("div", "c-target");
            t.appendChild(C.prFragment(FOCUS2));
            t.appendChild(writeBox(FOCUS2));
            t.appendChild(C.ops([{ t: "候補を探す", main: true }, "閉じる"]));
            body.push(t);
          } else if (u.kind === "zone") {
            body.push(C.zoneRow(u.id));
          } else {
            body.push(C.phraseRow(u.id, "plain"));
          }
        });
      });
      body.push(C.stockHead());
      (song.stock || []).forEach(function (st) { body.push(C.stockRow(st.id)); });

      root.appendChild(el("div", "cwide-cap", "全部選択（範囲=曲全体）のとき"));
      root.appendChild(C.phone(
        {
          crumb: songName + " › 全体（全部選択）",
          tab: "素",
          legend: "範囲が全体のとき＝並びも表示切替も歌詞全体画面と同じ。開いている句だけ実表記で膨らむ。閉じればそのまま歌詞全体画面",
          playbar: true,
        },
        body
      ));

      root.appendChild(C.desc(
        "枚8（新設・欠陥12）＋「歌詞全体を見るときは全部選択かな？」への絵の答え。" +
        "答え=地続き（範囲に上限を置かない）。範囲を広げても画面は組み変わらず、句ごとの縮小表記の並びに" +
        "「開いている1句の実表記」が浮くだけ。全部選択では並び・表示切替・再生バーが歌詞全体画面と一致し、" +
        "候補・意味欄・断片は範囲全体ではなく開いている1句に付く＝曲全体でも成立が崩れない。" +
        "つまり場2は『通しの面＋開いた1句』であり、どこかで別画面に切り替わる境目は無い、という1案。" +
        "上の絵は8小節の空きセクションを1画面で扱う（裁定9の適用=選択中の句だけ実PianoRoll断片）。" +
        "覆すならここだとオーナーが予告済みの箇所。"
      ));
    },
  });
})(typeof window !== "undefined" ? window : globalThis);
