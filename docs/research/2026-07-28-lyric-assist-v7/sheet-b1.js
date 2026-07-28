/* sheet-b1.js — 枚1: 歌詞全体画面・素の表示（全長）。
 * 生存＋修正: 小節番号は前奏込み（データ由来）・意味メモ/予定メモを通しに表示（別フィールドのまま）・
 * 直接入力の注記＝opsTableNote（データの文字列そのまま）・「同じメロ」の事実表示（データ由来）・
 * 「＋ 断片を置く」の入口を「まだ並びに入れていないもの」に追加。 */
V7C.registerSheet({
  id: "b1",
  no: 1,
  title: "歌詞全体画面・素の表示（全長）",
  wide: false,
  marksOpts: { flatPair: "イ", yellowUse: "A" },
  css: "",
  build(root) {
    const C = V7C;
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", legend: C.legendText("plain") },
      [
        C.opsTableNote(),
        C.sectionHead("A-intro"),
        C.sectionHead("A-1A"),
        C.phraseRow("A-1A-k1", "plain"),
        C.phraseRow("A-1A-k2", "plain"),
        C.phraseRow("A-1A-k3", "plain"),
        C.phraseRow("A-1A-k4", "plain"),
        C.sectionHead("A-1B"),
        C.phraseRow("A-1B-k1", "plain"),
        C.phraseRow("A-1B-k2", "plain"),
        C.zoneRow("A-1B-z1"),
        C.sectionHead("A-1S"),
        C.phraseRow("A-1S-k1", "plain"),
        C.phraseRow("A-1S-k2", "plain"),
        C.phraseRow("A-1S-k3", "plain"),
        C.phraseRow("A-1S-k4", "plain"),
        C.sectionHead("A-2A"),
        C.phraseRow("A-2A-k1", "plain"),
        C.phraseRow("A-2A-k2", "plain"),
        C.phraseRow("A-2A-k3", "plain"),
        C.phraseRow("A-2A-k4", "plain"),
        C.sectionHead("A-2B"),
        C.phraseRow("A-2B-k1", "plain"),
        C.phraseRow("A-2B-k2", "plain"),
        C.zoneRow("A-2B-z1"),
        C.sectionHead("A-2S"),
        C.phraseRow("A-2S-k1", "plain"),
        C.phraseRow("A-2S-k2", "plain"),
        C.phraseRow("A-2S-k3", "plain"),
        C.sectionHead("A-C"),
        C.phraseRow("A-C-k1", "plain"),
        C.phraseRow("A-C-k2", "plain"),
        C.phraseRow("A-C-k3", "plain"),
        C.sectionHead("A-D"),
        C.phraseRow("A-D-k1", "plain"),
        C.phraseRow("A-D-k2", "plain"),
        C.phraseRow("A-D-k3", "plain"),
        C.phraseRow("A-D-k4", "plain"),
        C.phraseRow("A-D-k5", "plain"),
        C.phraseRow("A-D-k6", "plain"),
        C.sectionHead("A-kan2"),
        C.sectionHead("A-oosabi"),
        C.zoneRow("A-oosabi-z1"),
        C.sectionHead("A-outro"),
        C.zoneRow("A-outro-z1"),
        C.addRow(["＋ セクションを足す", "＋ 予定を置く"]),
        C.stockHead(),
        C.stockRow("A-st1"),
        C.addRow(["＋ 断片を置く"]),
      ]
    ));
    root.appendChild(C.inset("空きの枠をタップしたとき（その場の小フォーム）", [C.slotInput("A-1A-k2")]));
    root.appendChild(C.inset("「＋ 予定を置く」の記入（すべて任意）", [C.planForm("A-1S-k4-p1")]));
    root.appendChild(C.desc(
      "枚1＝通しの面の素の表示（生存・修正版）。小節番号は前奏込みでデータから通し（欠陥14）・" +
      "間奏2は歌なし（欠陥18）。意味メモ（みずをのんでから／ざっしをとじて の句の下）と予定メモ" +
      "（点線チップ）は別フィールドのまま通しの面に出す（欠陥13の半分）。2番A/Bメロの見出しに" +
      "「同じメロ: …」の事実表示（欠陥9の一部）。「＋ 断片を置く」の入口を追加（欠陥7）。" +
      "直接入力の注記は割当表の文字列そのまま（裁定1）。印は案イ+案Aの規則導出（欠陥19）。"
    ));
  },
});
