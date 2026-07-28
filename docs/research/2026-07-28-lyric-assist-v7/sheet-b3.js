/* sheet-b3.js — 枚3: 初期状態3態（短い曲3つ）＋白紙の曲で「並びに入れる」を押したときの行き先。
 * 白紙の曲（セクション0）では暗黙にセクションを作らず、「どこに置くか／新しくセクションを作る」の
 * 明示確認を挟む（作る合図があるまで何も作られない）。 */
V7C.registerSheet({
  id: "b3",
  no: 4,
  title: "初期状態3態＋「並びに入れる」の行き先",
  wide: false,
  marksOpts: { flatPair: "ア", yellowUse: "B" },
  css: [
    ".b3-cap{font-size:11px;font-weight:600;color:#c9cdd6;margin:16px 2px 6px}",
    ".b3-cap:first-child{margin-top:0}",
    ".b3-empty{border:1px dashed #565d69;border-radius:9px;padding:12px 10px;margin:6px 0;color:#9aa0aa;font-size:11.5px}",
    ".b3-dnote{font-size:10.5px;color:#9aa0aa;margin:2px 0 8px;line-height:1.6}",
    ".b3-choice{border:1px solid #33373f;border-radius:10px;background:#1b1e24;padding:7px 9px;margin:6px 0}",
    ".b3-choice-on{border-color:#3a6df0;background:#181c25}",
    ".b3-ct{font-size:12px;color:#e6e8ec}",
    ".b3-choice-off .b3-ct{color:#6d7480}",
    ".b3-cs{font-size:10px;color:#6d7480;margin-top:2px}",
    ".b3-frow{display:flex;align-items:center;gap:7px;margin:7px 0 0;font-size:12px}",
    ".b3-frow label{color:#9aa0aa;font-size:11px;width:92px;flex:none}",
    ".b3-fin{border:1px solid #33373f;background:#15181d;border-radius:6px;padding:2px 7px;color:#565d69;font-size:11.5px;flex:1;min-height:20px}",
  ].join("\n"),
  build(root) {
    const C = V7C;
    function cap(text) {
      const d = document.createElement("div");
      d.className = "b3-cap";
      d.textContent = text;
      return d;
    }
    function div(cls, text) {
      const d = document.createElement("div");
      d.className = cls;
      if (text != null) d.textContent = text;
      return d;
    }

    /* --- 態1: メロだけがある曲 --- */
    root.appendChild(cap("メロだけがある曲"));
    root.appendChild(C.phone(
      { title: "サンプル曲B（サンプルEP）", tab: "素" },
      [
        C.sectionHead("B-A"),
        C.phraseRow("B-A-k1", "plain"),
        C.phraseRow("B-A-k2", "plain"),
        C.sectionHead("B-S"),
        C.phraseRow("B-S-k1", "plain"),
      ]
    ));

    /* --- 態2: 詞だけがある曲 --- */
    root.appendChild(cap("詞だけがある曲"));
    root.appendChild(C.phone(
      { title: "サンプル曲C（サンプルEP）", tab: "素" },
      [
        C.sectionHead("C-A"),
        C.phraseRow("C-A-k1", "plain"),
        C.phraseRow("C-A-k2", "plain"),
        C.sectionHead("C-S"),
        C.phraseRow("C-S-k1", "plain"),
        C.phraseRow("C-S-k2", "plain"),
      ]
    ));

    /* --- 態3: 白紙の曲（断片だけ） --- */
    root.appendChild(cap("白紙の曲（セクション0・断片だけ）"));
    root.appendChild(C.phone(
      { title: "サンプル曲D（サンプルEP）", tab: "素" },
      [
        div("b3-empty", "セクションはまだありません"),
        C.addRow(["＋ セクションを足す", "＋ 予定を置く"]),
        C.stockHead(),
        C.stockRow("D-st1"),
        C.addRow(["＋ 断片を置く"]),
      ]
    ));

    /* --- 白紙の曲で「並びに入れる」を押したときの行き先 --- */
    root.appendChild(cap("白紙の曲で「並びに入れる」を押したとき"));
    const dlgChildren = [
      div("b3-dnote", "置き先を選ぶまで、曲側には何も作られません。"),
      (() => {
        const c = div("b3-choice b3-choice-off");
        c.appendChild(div("b3-ct", "既にあるセクションに置く"));
        c.appendChild(div("b3-cs", "この曲にはまだセクションがありません（ある曲では、ここに置き先の一覧が並ぶ）"));
        return c;
      })(),
      (() => {
        const c = div("b3-choice b3-choice-on");
        c.appendChild(div("b3-ct", "新しくセクションを作って置く"));
        const r1 = div("b3-frow");
        const l1 = document.createElement("label");
        l1.textContent = "名前";
        r1.appendChild(l1);
        r1.appendChild(div("b3-fin", ""));
        c.appendChild(r1);
        const r2 = div("b3-frow");
        const l2 = document.createElement("label");
        l2.textContent = "小節数（任意）";
        r2.appendChild(l2);
        r2.appendChild(div("b3-fin", ""));
        c.appendChild(r2);
        c.appendChild(div("b3-cs", "作られるのは「作って置く」を押したときだけ"));
        return c;
      })(),
      C.ops([{ t: "作って置く", main: true }, "やめる"]),
    ];
    root.appendChild(C.phone(
      { title: "サンプル曲D（サンプルEP）", tab: "素", playbar: false },
      [
        C.stockHead(),
        C.stockRow("D-st1"),
        C.inset("どこに置くか（置き先の確認）", dlgChildren),
      ]
    ));

    root.appendChild(C.desc(
      "枚4（v6の枚3）＝初期状態3態（生存）＋追加: 白紙の曲（セクション0）で「並びに入れる」を押したときの" +
      "行き先の絵（欠陥11）。暗黙にセクションを作らず（裁定4・5）、「どこに置くか／新しくセクションを" +
      "作る」の明示確認を挟む。既存セクションがある曲では上の選択肢に置き先一覧が並ぶ想定。"
    ));
  },
});
