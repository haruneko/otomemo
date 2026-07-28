/* sheet-demo.js — 工程0の部品自己点検（demo:true＝配布スクショから除外・検証には含む）。
 * v8の全共通部品を最低1回ずつインスタンス化し、検証（印の導出・縦揃え・高低線y・はみ出し・
 * パーツ宣言・チップ機械算出・before/after・出所・音の枠の数字）の実測対象を
 * 枚が揃う前の今の段階でも成立させる。工程1はこのファイルを手本にしてよいが編集はしない。
 *
 * 手本の要点:
 * - 通しの面は必ず V8C.throughPane("A"|"B"|"C"|"A_HELP"|"A_INTO"|"A_ONIN", build) の中で組む。
 *   宣言に無いパーツは出せない（出そうとすると登録時に例外で止まる）。
 * - 範囲の編集画面は throughPane の外で組む（常に全部出す）。
 * - 変化後の状態（variant）は句と同じ部品に variant の id を渡すだけ。
 * - 印の案は全枚 イ+B。別案・音数ドット案は compareBox（案くらべ区画）の中でだけ。
 * - 凡例・割当表は電話枠の外（legendNote / opsTableNote）か helpPanel の中。
 */
V8C.registerSheet({
  id: "z0",
  no: 99,
  title: "部品の自己点検（配布外）",
  wide: false,
  demo: true,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: "",
  build(root) {
    const C = V8C;
    const D = V8DATA;

    /* ---- 通しの面・態A（既定）: 表記＋チップ＋ドット。帯・マスは出ない ---- */
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示" },
      [
        C.throughPane("A", (pane) => {
          pane.appendChild(C.sectionHead("A-intro"));
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1", { now: true }));
          pane.appendChild(C.phraseRow("A-1A-k2"));   // あと3音＋意味メモ
          pane.appendChild(C.phraseRow("A-1A-k3"));   // 字余り（メロが途中）
          pane.appendChild(C.phraseRow("A-1A-k4"));   // 予定チップ
          pane.appendChild(C.sectionHead("A-1B"));
          pane.appendChild(C.phraseRow("A-1B-k1"));
          pane.appendChild(C.phraseRow("A-1B-k2"));   // 詞の空き8音（チップ化）
          pane.appendChild(C.zoneRow("A-1B-z1"));
          pane.appendChild(C.sectionHead("A-1S"));
          pane.appendChild(C.phraseRow("A-1S-k1"));
          pane.appendChild(C.phraseRow("A-1S-k2"));   // メロの空き
          pane.appendChild(C.phraseRow("A-1S-k3"));   // 詞なし
          pane.appendChild(C.phraseRow("A-1S-k4"));   // 予定だけの句
          pane.appendChild(C.sectionHead("A-2A"));
          pane.appendChild(C.phraseRow("A-2A-k1"));
          pane.appendChild(C.sectionHead("A-oosabi"));
          pane.appendChild(C.zoneRow("A-oosabi-z1"));
          pane.appendChild(C.addRow(["＋ セクションを足す", "＋ 予定を置く", "＋ 断片を置く"]));
          pane.appendChild(C.stockHead());
          pane.appendChild(C.stockRow("A-st1"));      // 態Aでは帯なし
        }),
      ]
    ));
    root.appendChild(C.legendNote("plain"));
    root.appendChild(C.opsTableNote());

    /* ---- 態B（表示シートを開いた姿）と態C（全部オン） ---- */
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示", playbar: false },
      [
        C.throughPane("B", (pane) => {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.dispSheet());
        }),
      ]
    ));
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示", playbar: false },
      [
        C.throughPane("C", (pane) => {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.phraseRow("A-1A-k2"));   // 帯＋空きマスの列
          pane.appendChild(C.stockRow("A-st1"));      // 態Cでは断片にも帯
        }),
      ]
    ));

    /* ---- 態A＋イントネーション切替（モーラ行=時間揃え・高低線・帯なし）＋案くらべ ---- */
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "イントネーション", headBtn: "表示", playbar: false },
      [
        C.throughPane("A_INTO", (pane) => {
          pane.appendChild(C.switchNote("into"));
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.phraseRow("A-1A-k2"));
          pane.appendChild(C.sectionHead("A-D"));
          pane.appendChild(C.phraseRow("A-D-k1"));    // 黄の案A/B差の実例句（既定=イ+Bでは印なし）
          /* 案くらべ区画: 印の案の上書きはこの中でだけ許される */
          pane.appendChild(C.compareBox("印の決まり・案くらべ（同じ句を案ごとに）", [
            C.timeRow("A-D-k1", "kana", { marksOpts: { flatPair: "イ", yellowUse: "A" } }),
            C.timeRow("A-D-k1", "kana", { marksOpts: { flatPair: "イ", yellowUse: "B" } }),
            C.onsuDotSample("A-1A-k2"),
            C.onsuDotSample("A-1A-k1"),
          ]));
        }),
      ]
    ));

    /* ---- 態A＋音韻切替（母音の段・韻の下線） ---- */
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "音韻", headBtn: "表示", playbar: false },
      [
        C.throughPane("A_ONIN", (pane) => {
          pane.appendChild(C.switchNote("onin"));
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1", { vowel: { rhymeLast: 2 } }));
          pane.appendChild(C.phraseRow("A-1A-k2"));
        }),
      ]
    ));

    /* ---- 態A＋ヘルプを開いた姿（凡例・割当表はこの中にだけ枠内に出てよい） ---- */
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示", playbar: false },
      [
        C.throughPane("A_HELP", (pane) => {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.helpPanel());
        }),
      ]
    ));

    /* ---- 範囲の編集画面（パーツ選択の対象外＝常に全部出す） ---- */
    root.appendChild(C.phone(
      { crumb: "サンプル曲 › 1番Aメロ › 7–8小節", tab: null, playbar: false },
      [
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          t.appendChild(C.prFragment("A-1A-k2", { glowSpan: 2 }));      // 語「飲ん」の光り
          t.appendChild(C.prCaption());
          t.appendChild(C.hlLabel());
          t.appendChild(C.hlRow("A-1A-k2", { glowSpan: 2 }));
          t.appendChild(C.hlSource("A-1A-k2"));
          t.appendChild(C.feedRows("A-1A-k2", { glowSpan: 2 }));        // 表記の欄（語のトークン）
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

    /* ---- 変化後の状態（variants）＝「直後に応える」絵の材料 ---- */
    root.appendChild(C.phone(
      { crumb: "サンプル曲 › 変化後の状態（自己点検）", tab: null, playbar: false },
      [
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          /* 候補を入れた直後（空き3音が埋まり印・高低が再計算される） */
          t.appendChild(C.prFragment(D.refs.insertExample));
          t.appendChild(C.hlRow(D.refs.insertExample));
          t.appendChild(C.hlSource(D.refs.insertExample));
          t.appendChild(C.fieldPair(D.refs.insertExample));   // 両埋まり＝音数・読み・印の機械算出
          return t;
        })(),
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          /* 表記を直した直後（11→14モーラ・字余り3・音符なしモーラ） */
          t.appendChild(C.prFragment(D.refs.editExample));
          t.appendChild(C.prMoraRow(D.refs.editExample));
          t.appendChild(C.rowChips(D.refs.editExample));      // 字余り3 チップ
          t.appendChild(C.fieldPair(D.refs.editExample));
          return t;
        })(),
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          /* かな表記の句: 誤読のまま（基本状態）→ 読み取り用の表記を添えた後 → 高低を手で直した後 */
          t.appendChild(C.hlLabel());
          t.appendChild(C.hlRow("C-A-k2"));
          t.appendChild(C.hlSource("C-A-k2"));
          t.appendChild(C.feedRows("C-A-k2", { glowSpan: 0 }));
          t.appendChild(C.hlRow(D.refs.yomiSrcExample, { glowSpan: 0 }));
          t.appendChild(C.hlSource(D.refs.yomiSrcExample));
          t.appendChild(C.feedRows(D.refs.yomiSrcExample, { glowSpan: 0 }));
          t.appendChild(C.hlRow(D.refs.handHlExample));
          t.appendChild(C.hlSource(D.refs.handHlExample));
          return t;
        })(),
      ]
    ));

    /* ---- メロ候補（genNote の正規経路）・対応句・セクションの小札 ---- */
    root.appendChild(C.phone(
      { crumb: "サンプル曲 › Cメロ › 55–56小節", tab: null, playbar: false },
      [
        (() => {
          const t = document.createElement("div");
          t.className = "c-target";
          t.appendChild(C.prFragment("A-C-k2"));
          t.appendChild(C.hlLabel());
          t.appendChild(C.hlRow("A-C-k2"));
          t.appendChild(C.hlSource("A-C-k2"));
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
