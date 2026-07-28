/* sheet-b1.js — 枚1: 歌詞全体画面（作り直し・3態＋ヘルプ姿）。担当B。
 * 態A（既定）／態B（表示シートを開いた姿）／態C（全部オン＝比較材料）／付記=ヘルプを開いた姿。
 * パーツ宣言は計画§3-4の正本（V8C.throughPane が強制）。凡例・割当表は電話枠の外。
 */
V8C.registerSheet({
  id: "b1",
  no: 1,
  title: "歌詞全体画面（既定／表示シート／全部オン＋ヘルプ姿）",
  wide: false,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: [
    ".b1-cap{font-size:12px;color:#c8cdd6;font-weight:600;margin:18px 2px 6px}",
    ".b1-cap-first{margin-top:0}",
  ].join("\n"),
  build(root) {
    const C = V8C;

    function cap(text, first) {
      const d = document.createElement("div");
      d.className = "b1-cap" + (first ? " b1-cap-first" : "");
      d.textContent = text;
      return d;
    }

    /* 曲Aの通し（全セクション・データの並び順のまま）。態A/態Cで同じ中身を出す＝長さの比較を成立させる */
    function fillSongA(pane, opts) {
      opts = opts || {};
      pane.appendChild(C.sectionHead("A-intro"));
      pane.appendChild(C.sectionHead("A-1A"));
      pane.appendChild(C.phraseRow("A-1A-k1", opts.now ? { now: true } : {}));
      pane.appendChild(C.phraseRow("A-1A-k2"));
      pane.appendChild(C.phraseRow("A-1A-k3"));
      pane.appendChild(C.phraseRow("A-1A-k4"));
      pane.appendChild(C.sectionHead("A-1B"));
      pane.appendChild(C.phraseRow("A-1B-k1"));
      pane.appendChild(C.phraseRow("A-1B-k2"));
      pane.appendChild(C.zoneRow("A-1B-z1"));
      pane.appendChild(C.sectionHead("A-1S"));
      pane.appendChild(C.phraseRow("A-1S-k1"));
      pane.appendChild(C.phraseRow("A-1S-k2"));
      pane.appendChild(C.phraseRow("A-1S-k3"));
      pane.appendChild(C.phraseRow("A-1S-k4"));
      pane.appendChild(C.sectionHead("A-2A"));
      pane.appendChild(C.phraseRow("A-2A-k1"));
      pane.appendChild(C.phraseRow("A-2A-k2"));
      pane.appendChild(C.phraseRow("A-2A-k3"));
      pane.appendChild(C.phraseRow("A-2A-k4"));
      pane.appendChild(C.sectionHead("A-2B"));
      pane.appendChild(C.phraseRow("A-2B-k1"));
      pane.appendChild(C.phraseRow("A-2B-k2"));
      pane.appendChild(C.zoneRow("A-2B-z1"));
      pane.appendChild(C.sectionHead("A-2S"));
      pane.appendChild(C.phraseRow("A-2S-k1"));
      pane.appendChild(C.phraseRow("A-2S-k2"));
      pane.appendChild(C.phraseRow("A-2S-k3"));
      pane.appendChild(C.sectionHead("A-C"));
      pane.appendChild(C.phraseRow("A-C-k1"));
      pane.appendChild(C.phraseRow("A-C-k2"));
      pane.appendChild(C.phraseRow("A-C-k3"));
      pane.appendChild(C.sectionHead("A-D"));
      pane.appendChild(C.phraseRow("A-D-k1"));
      pane.appendChild(C.phraseRow("A-D-k2"));
      pane.appendChild(C.phraseRow("A-D-k3"));
      pane.appendChild(C.phraseRow("A-D-k4"));
      pane.appendChild(C.phraseRow("A-D-k5"));
      pane.appendChild(C.phraseRow("A-D-k6"));
      pane.appendChild(C.sectionHead("A-kan2"));
      pane.appendChild(C.sectionHead("A-oosabi"));
      pane.appendChild(C.zoneRow("A-oosabi-z1"));
      pane.appendChild(C.sectionHead("A-outro"));
      pane.appendChild(C.zoneRow("A-outro-z1"));
      pane.appendChild(C.addRow(["＋ セクションを足す", "＋ 予定を置く", "＋ 断片を置く"]));
      pane.appendChild(C.stockHead());
      pane.appendChild(C.stockRow("A-st1"));
    }

    /* ---- 態A（既定）: 表記の行＋穴の事実チップ＋行末ドット。帯・空マスは畳む ---- */
    root.appendChild(cap("既定の表示（何も触っていないとき）", true));
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示" },
      [C.throughPane("A", (pane) => { fillSongA(pane, { now: true }); })]
    ));
    root.appendChild(C.legendNote("plain"));
    root.appendChild(C.opsTableNote());

    /* ---- 態B: 「表示」を開いた姿（6項目＋既定に戻す） ---- */
    root.appendChild(cap("「表示」を開いたところ（出すものを選ぶ）"));
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示", playbar: false },
      [
        C.throughPane("B", (pane) => {
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1"));
          pane.appendChild(C.phraseRow("A-1A-k2"));
          pane.appendChild(C.dispSheet());
        }),
      ]
    ));

    /* ---- 態C: 全部オン（メロ帯＋空きマスの列）＝今までのうるささの比較材料 ---- */
    root.appendChild(cap("全部オンにしたところ（メロ帯＋空きマスの列・比較用）"));
    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "素", headBtn: "表示" },
      [C.throughPane("C", (pane) => { fillSongA(pane); })]
    ));

    /* ---- 付記: ヘルプを開いた姿（凡例・割当表はこの中にだけ枠内に出る） ---- */
    root.appendChild(cap("ヘルプを開いたところ（凡例と操作の割当はここに畳む）"));
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

    root.appendChild(C.desc(
      "枚1＝通しの面の作り直し（3態＋ヘルプ姿・裁定待ち§10-1の材料）。" +
      "態A: 表記の行で読める・空マス列は「詞の空きN音」チップに畳む・「メロの空き」チップを既定で出す（裁定2）・" +
      "凡例と割当①〜⑤は電話枠の外の注記へ（v7で常設だった説明11行の撤去）。" +
      "態C: 態A＋メロ帯＋空マス列＝v7相当のうるささの比較材料（裁定8「メロの形＝常に矩形」との関係込みで判定してもらう）。" +
      "注意2件（工程0からの差し戻し）: (1) A-1S-k3 の「詞なし」チップは計画§3-4の行チップ列挙に無い＝追認待ち。" +
      "(2) A-1A-k3（9–10小節）はメロが途中までしか無い句だが、機械算出は一律「字余り5」となり「メロ未定」と区別が付かない＝計画へ差し戻し中。"
    ));
  },
});
