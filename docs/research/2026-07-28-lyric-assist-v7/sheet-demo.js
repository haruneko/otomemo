/* sheet-demo.js — 工程0の部品自己点検（demo:true＝配布スクショから除外・検証には含む）。
 * 全共通部品を最低1回ずつインスタンス化し、検証(印の導出・縦揃え・高低線y・はみ出し)の
 * 実測対象を今の段階でも成立させる。工程1はこのファイルを手本にしてよいが編集はしない。 */
V7C.registerSheet({
  id: "z0",
  no: 99,
  title: "部品の自己点検（配布外）",
  wide: false,
  demo: true,
  marksOpts: { flatPair: "イ", yellowUse: "A" },  // 印が最も多く出る組で点検する
  css: "",
  build(root) {
    const C = V7C;
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "イントネーション", legend: C.legendText("into") },
      [
        // 通しの面の句の行（素・イントネーション・詞なし・空き枠・再生中強調）
        C.sectionHead("A-1A"),
        C.phraseRow("A-1A-k1", "plain", { now: true }),
        C.phraseRow("A-1A-k2", "into"),
        C.phraseRow("A-1A-k3", "into"),
        C.phraseRow("A-1A-k4", "plain"),
        C.sectionHead("A-1B"),
        C.phraseRow("A-1B-k1", "into"),
        C.phraseRow("A-1B-k2", "plain"),
        C.zoneRow("A-1B-z1"),
        C.sectionHead("A-1S"),
        C.phraseRow("A-1S-k2", "plain"),
        C.phraseRow("A-1S-k3", "plain"),
        C.phraseRow("A-1S-k4", "plain"),
        C.sectionHead("A-2A"),
        C.phraseRow("A-2A-k1", "into"),
        C.sectionHead("A-oosabi"),
        C.zoneRow("A-oosabi-z1"),
        C.addRow(["＋ セクションを足す", "＋ 予定を置く"]),
        C.stockHead(),
        C.stockRow("A-st1"),
        C.opsTableNote(),
      ]
    ));

    // 範囲の編集画面の部品（断片・高低線・意味/音の枠・前後・対応句・候補・フォーム）
    root.appendChild(C.phone(
      { crumb: "サンプル曲 › 1番Aメロ › 7–8小節", tab: null, playbar: false },
      [
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          t.appendChild(C.prFragment("A-1A-k2"));
          t.appendChild(C.prCaption());
          t.appendChild(C.hlLabel());
          t.appendChild(C.hlRow("A-1A-k2"));
          t.appendChild(C.fieldPair("A-1A-k2"));
          return t;
        })(),
        C.neighborRow("A-1A-k1", "前の句"),
        C.neighborRow("A-1A-k3", "次の句"),
        C.ops([{ t: "候補を探す", main: true }, "歌詞ネタから引く", "相談", "メロを開く"]),
        C.candidateSheet(["A-1A-k2-lc1", "A-1A-k2-lc2", "A-1A-k2-lc3", "A-1A-k2-lc4"], "order"),
        C.candidateSheet(["A-1A-k2-lc1", "A-1A-k2-lc2", "A-1A-k2-lc3", "A-1A-k2-lc4"], "group"),
        C.requestForm("A-1A-k2", ["word", "onsu", "hl", "imi"]),
        C.requestForm("A-1A-k2", []),
        C.inset("予定の記入（すべて任意）", [C.planForm("A-oosabi-p1"), C.planForm(null)]),
        C.inset("空きの枠のその場入力", [C.slotInput("A-1A-k2")]),
      ]
    ));

    // メロ側の空き（高低線のみ・等間隔）＋メロ候補＋対応句参照
    root.appendChild(C.phone(
      { crumb: "サンプル曲 › Cメロ › 55–56小節", tab: null, playbar: false },
      [
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          t.appendChild(C.prFragment("A-C-k2"));
          t.appendChild(C.hlLabel());
          t.appendChild(C.hlRow("A-C-k2"));
          t.appendChild(C.fieldPair("A-C-k2"));
          return t;
        })(),
        C.candidateSheet(["A-C-k2-mc1", "A-C-k2-mc2", "A-C-k2-mc3"], "order"),
        C.refRow("A-2A-k1"),
        C.sectionFactChips("A-1A"),
        C.sectionFactChips("A-1S"),
        C.sectionFactChips("A-C"),
      ]
    ));

    root.appendChild(C.desc("この枚は工程0の自己点検（demo）。配布スクショには入らない。"));
  },
});
