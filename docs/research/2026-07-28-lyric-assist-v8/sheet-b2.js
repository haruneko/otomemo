/* sheet-b2.js — 枚2: イントネーション切替＋印の決まり。担当B。
 * 描画状態は計画§3-4の指定どおり: 態A（帯なし）＋切替の層（A_INTO＝モーラ行・高低線・切替の説明1行）。
 * 印は全枚 イ+B。別案の描画は案くらべ区画（compareBox）の中だけ（電話枠の外に置く）。
 */
V8C.registerSheet({
  id: "b2",
  no: 2,
  title: "歌詞全体画面・表示切替（イントネーション）＋印の決まり",
  wide: false,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: [
    ".b2-note{font-size:10px;color:#9aa0aa;margin:8px 2px;line-height:1.6}",
    ".b2-cap{font-size:11px;color:#c8cdd6;font-weight:600;margin:10px 0 4px;line-height:1.5}",
    ".b2-sub{font-size:10.5px;color:#9aa0aa;margin:7px 0 2px}",
    ".b2-an{margin:2px 0 8px}",
  ].join("\n"),
  build(root) {
    const C = V8C;

    function note(text, cls) {
      const d = document.createElement("div");
      d.className = cls || "b2-note";
      d.textContent = text;
      return d;
    }
    /* 案の見本1つ＝メロの帯＋モーラ行（時間揃え・印は指定案）。座標はどちらも部品が音符データから計算する */
    function anSample(stateId, marksOpts) {
      const d = document.createElement("div");
      d.className = "b2-an";
      d.appendChild(C.melo(stateId));
      d.appendChild(C.timeRow(stateId, "kana", { marksOpts: marksOpts }));
      return d;
    }

    /* ---- 通しの面: 態A＋イントネーション切替の層（帯なし・モーラ行=時間揃え・高低線） ---- */
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "イントネーション", headBtn: "表示" },
      [
        C.throughPane("A_INTO", (pane) => {
          pane.appendChild(C.switchNote("into"));
          pane.appendChild(C.sectionHead("A-intro"));
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.phraseRow("A-1A-k2"));
          pane.appendChild(C.phraseRow("A-1A-k3"));
          pane.appendChild(C.phraseRow("A-1A-k4"));
          pane.appendChild(C.sectionHead("A-1B"));
          pane.appendChild(C.phraseRow("A-1B-k1"));
          pane.appendChild(C.phraseRow("A-1B-k2"));
          pane.appendChild(C.zoneRow("A-1B-z1"));
          pane.appendChild(C.sectionHead("A-1S"));
          pane.appendChild(C.phraseRow("A-1S-k1"));
          pane.appendChild(note("（この下も同じ形の並び＝表記の行＋モーラ行＋高低の線が続く。あいだのセクションは省略）"));
          pane.appendChild(C.sectionHead("A-D"));
          pane.appendChild(C.phraseRow("A-D-k1"));
        }),
      ]
    ));
    root.appendChild(C.legendNote("switch"));

    /* ---- 案くらべ区画（電話枠の外）。印の案の上書き・音数ドット案はこの中でだけ許される ---- */
    const k2Text = C.displayText(C.state("A-1A-k2"));
    const dk1Text = C.displayText(C.state("A-D-k1"));
    const bk1Text = C.displayText(C.state("A-1B-k1"));
    root.appendChild(C.compareBox("印の決まり・案くらべ（同じ句を案ごとに）", [
      note("赤＝となり合う2音で、読みの高低の変化とメロの上下が逆（どの案でも付く） — 句: " + bk1Text, "b2-cap"),
      anSample("A-1B-k1"),
      note("読みが平らな2音のあいだでメロが大きく動くとき — 句: " + k2Text, "b2-cap"),
      note("案ア＝印なし（印なし＝指摘なし）", "b2-sub"),
      anSample("A-1A-k2", { flatPair: "ア", yellowUse: "B" }),
      note("案イ＝黄で注意を残す", "b2-sub"),
      anSample("A-1A-k2", { flatPair: "イ", yellowUse: "B" }),
      note("読みが変わる2音なのにメロが平らなとき — 句: " + dk1Text, "b2-cap"),
      note("案A＝そこにも黄を付ける", "b2-sub"),
      anSample("A-D-k1", { flatPair: "イ", yellowUse: "A" }),
      note("案B＝付けない（黄は音数の注意に限る）", "b2-sub"),
      anSample("A-D-k1", { flatPair: "イ", yellowUse: "B" }),
      note("音数の食い違いを行末ドットにも出す案（今はチップだけに出している）", "b2-cap"),
      C.onsuDotSample("A-1A-k2"),
      C.onsuDotSample("A-1A-k3"),
      C.onsuDotSample("A-1A-k1"),
    ]));

    root.appendChild(C.desc(
      "枚2＝態A（帯なし）＋イントネーション切替の層（計画§3-4の指定）。モーラ区画は音符の時間データから計算して置く" +
      "（帯が無くても縦位置は同じ＝裁定11の§3-1解釈）。印の既定は全枚 イ+B（差し戻し5の暫定統一）。" +
      "案くらべ: (a)平ら区間の案ア/イ＝A-1A-k2で差が出る（イ:黄3・ア:なし） (b)黄の案A/B＝A-D-k1で差が出る" +
      "（差し戻し1の実例・refs.yellowABExample） (c)音数ドット化の案＝裁定待ち2への追加分。" +
      "A-1A-k3 のモーラ行の末尾灰色＝音符なしのモーラ（メロが途中の句でも機械は詰めない）。"
    ));
  },
});
