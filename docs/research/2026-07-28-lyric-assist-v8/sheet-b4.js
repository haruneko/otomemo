/* sheet-b4.js — 枚4: 初期状態3態＋「並びに入れる」の行き先。担当B。
 * 曲B=メロだけ／曲C=詞だけ（表記で出る・かな表記の句「にわへ　みずをまく」を残す）／曲D=白紙（断片だけ）。
 * どの態も通しの面は態A（既定）の宣言で描く。
 */
V8C.registerSheet({
  id: "b4",
  no: 4,
  title: "初期状態3態＋「並びに入れる」の行き先",
  wide: false,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: [
    ".b4-cap{font-size:12px;color:#c8cdd6;font-weight:600;margin:18px 2px 6px}",
    ".b4-cap-first{margin-top:0}",
    ".b4-nosec{border:1px dashed #565d69;border-radius:9px;padding:12px 10px;margin:6px 0;color:#9aa0aa;font-size:11.5px}",
    ".b4-dlg{border:1px solid #3a6df0;border-radius:12px;background:#181c25;padding:9px 10px;margin-top:12px}",
    ".b4-dlgtitle{font-size:12px;font-weight:600;margin-bottom:4px}",
    ".b4-dlgnote{font-size:10px;color:#9aa0aa;margin-bottom:8px}",
    ".b4-opt{border:1px solid #33373f;border-radius:9px;padding:7px 8px;margin:6px 0;font-size:12px}",
    ".b4-opt-off{color:#565d69}",
    ".b4-opt-on{border-color:#3a6df0}",
    ".b4-optsub{font-size:9.5px;color:#6d7480;margin-top:4px;line-height:1.5}",
    ".b4-formrow{display:flex;align-items:center;gap:7px;margin:6px 0;font-size:11px;color:#9aa0aa}",
    ".b4-fin{flex:1;border:1px solid #33373f;background:#15181d;border-radius:6px;min-height:20px}",
  ].join("\n"),
  build(root) {
    const C = V8C;

    function cap(text, first) {
      const d = document.createElement("div");
      d.className = "b4-cap" + (first ? " b4-cap-first" : "");
      d.textContent = text;
      return d;
    }
    function div(cls, text) {
      const d = document.createElement("div");
      d.className = cls;
      if (text != null) d.textContent = text;
      return d;
    }

    /* ---- 態1: メロだけがある曲（曲B）＝行は「詞の空きN音」チップに畳まれる ---- */
    root.appendChild(cap("メロだけがある曲", true));
    root.appendChild(C.phone(
      { title: "サンプル曲B（サンプルEP）", tab: "素", headBtn: "表示" },
      [
        C.throughPane("A", (pane) => {
          pane.appendChild(C.sectionHead("B-A"));
          pane.appendChild(C.phraseRow("B-A-k1"));
          pane.appendChild(C.phraseRow("B-A-k2"));
          pane.appendChild(C.sectionHead("B-S"));
          pane.appendChild(C.phraseRow("B-S-k1"));
        }),
      ]
    ));

    /* ---- 態2: 詞だけがある曲（曲C）＝表記で読める。かな表記の句もそのまま表記 ---- */
    root.appendChild(cap("詞だけがある曲"));
    root.appendChild(C.phone(
      { title: "サンプル曲C（サンプルEP）", tab: "素", headBtn: "表示" },
      [
        C.throughPane("A", (pane) => {
          pane.appendChild(C.sectionHead("C-A"));
          pane.appendChild(C.phraseRow("C-A-k1"));
          pane.appendChild(C.phraseRow("C-A-k2"));
          pane.appendChild(C.sectionHead("C-S"));
          pane.appendChild(C.phraseRow("C-S-k1"));
          pane.appendChild(C.phraseRow("C-S-k2"));
        }),
      ]
    ));

    /* ---- 態3: 白紙の曲（曲D・セクション0・断片だけ） ---- */
    root.appendChild(cap("白紙の曲（セクション0・断片だけ）"));
    root.appendChild(C.phone(
      { title: "サンプル曲D（サンプルEP）", tab: "素", headBtn: "表示" },
      [
        C.throughPane("A", (pane) => {
          pane.appendChild(div("b4-nosec", "セクションはまだありません"));
          pane.appendChild(C.addRow(["＋ セクションを足す", "＋ 予定を置く"]));
          pane.appendChild(C.stockHead());
          pane.appendChild(C.stockRow("D-st1"));
          pane.appendChild(C.addRow(["＋ 断片を置く"]));
        }),
      ]
    ));

    /* ---- 「並びに入れる」を押したとき（白紙の曲）＝置き先の確認。合図なしに実体は作られない ---- */
    root.appendChild(cap("白紙の曲で「並びに入れる」を押したとき"));
    root.appendChild(C.phone(
      { title: "サンプル曲D（サンプルEP）", tab: "素", headBtn: "表示", playbar: false },
      [
        C.throughPane("A", (pane) => {
          pane.appendChild(C.stockHead());
          pane.appendChild(C.stockRow("D-st1"));
          const dlg = div("b4-dlg");
          dlg.appendChild(div("b4-dlgtitle", "どこに置くか（置き先の確認）"));
          dlg.appendChild(div("b4-dlgnote", "置き先を選ぶまで、曲側には何も作られません。"));
          const off = div("b4-opt b4-opt-off", "既にあるセクションに置く");
          off.appendChild(div("b4-optsub", "この曲にはまだセクションがありません（ある曲では、ここに置き先の一覧が並ぶ）"));
          dlg.appendChild(off);
          const on = div("b4-opt b4-opt-on", "新しくセクションを作って置く");
          const r1 = div("b4-formrow", "名前");
          r1.appendChild(div("b4-fin"));
          on.appendChild(r1);
          const r2 = div("b4-formrow", "小節数（任意）");
          r2.appendChild(div("b4-fin"));
          on.appendChild(r2);
          on.appendChild(div("b4-optsub", "作られるのは「作って置く」を押したときだけ"));
          dlg.appendChild(on);
          dlg.appendChild(C.ops([{ t: "作って置く", main: true }, "やめる"]));
          pane.appendChild(dlg);
        }),
      ]
    ));

    root.appendChild(C.desc(
      "枚4＝初期状態3態（メロだけ／詞だけ／白紙）＋白紙の曲での「並びに入れる」の行き先（v6欠陥11の塞ぎの引き継ぎ）。" +
      "v8差分: 曲Cの詞が表記（漢字仮名交じり）で出る。C-A-k2「にわへ　みずをまく」はかな表記の句＝それも表記として" +
      "そのまま出る（読み取りの誤りの受け止めは枚9＝担当Cが描く伏線）。曲Bの行は空マス列でなく「詞の空きN音」チップ。" +
      "置き先の確認は裁定5（実体を明確に作る合図なければ作られたくない）のとおり明示の操作で作る。"
    ));
  },
});
