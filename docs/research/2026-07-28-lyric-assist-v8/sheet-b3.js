/* sheet-b3.js — 枚3: 歌詞全体画面・表示切替（音韻）。担当B。
 * 描画状態は計画§3-4の指定どおり: 態A（帯なし）＋切替の層（A_ONIN＝モーラ行・母音の段・韻の下線・切替の説明1行）。
 */
V8C.registerSheet({
  id: "b3",
  no: 3,
  title: "歌詞全体画面・表示切替（音韻）",
  wide: false,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: [
    ".b3-note{font-size:10px;color:#9aa0aa;margin:8px 2px;line-height:1.6}",
    ".b3-rhyme{font-size:10.5px;color:#8fb8a8;border:1px solid #3d5a4f;border-radius:8px;padding:6px 8px;margin:10px 0;line-height:1.6}",
  ].join("\n"),
  build(root) {
    const C = V8C;

    function note(text, cls) {
      const d = document.createElement("div");
      d.className = cls || "b3-note";
      d.textContent = text;
      return d;
    }

    /* 韻とみた根拠の一文＝データから機械で組む（句のおわり2音のかなと母音。手書きの数値・かなを混ぜない） */
    const rhymeIds = ["A-1A-k1", "A-1A-k3", "A-1B-k1"];
    const tails = rhymeIds.map((id) => "…" + C.morasOf(C.state(id)).slice(-2).join(""));
    const vs = C.morasOf(C.state(rhymeIds[0])).slice(-2).map(C.vowelOf).join("-");

    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "音韻", headBtn: "表示" },
      [
        C.throughPane("A_ONIN", (pane) => {
          pane.appendChild(C.switchNote("onin"));
          pane.appendChild(C.sectionHead("A-intro"));
          pane.appendChild(C.sectionHead("A-1A"));
          pane.appendChild(C.phraseRow("A-1A-k1", { vowel: { rhymeLast: 2 } }));
          pane.appendChild(C.phraseRow("A-1A-k2"));
          pane.appendChild(C.phraseRow("A-1A-k3", { vowel: { rhymeLast: 2 } }));
          pane.appendChild(C.phraseRow("A-1A-k4"));
          pane.appendChild(C.sectionHead("A-1B"));
          pane.appendChild(C.phraseRow("A-1B-k1", { vowel: { rhymeLast: 2 } }));
          pane.appendChild(C.phraseRow("A-1B-k2"));
          pane.appendChild(C.zoneRow("A-1B-z1"));
          pane.appendChild(C.sectionHead("A-1S"));
          pane.appendChild(C.phraseRow("A-1S-k1"));
          pane.appendChild(note(
            "韻とみたもの — 句のおわり2音の母音が「" + vs + "」でそろう: " + tails.join(" ／ "),
            "b3-rhyme"));
          pane.appendChild(note("（この下も同じ形の並び＝表記の行＋モーラ行＋母音の段が続く）"));
        }),
      ]
    ));
    root.appendChild(C.legendNote("switch"));

    root.appendChild(C.desc(
      "枚3＝態A（帯なし）＋音韻切替の層（計画§3-4の指定・裁定待ち5＝行構成ごと仰ぎ直しの対象）。" +
      "母音の段は音符の時間データに揃えて置く。韻の下線は句のおわり2音（e-u）の3句＝A-1A-k1・A-1A-k3・A-1B-k1。" +
      "制限: A-1A-k3 はメロが途中（音符6個）のため、おわり2音「…でる」に時間の基準が無く、下線が絵に出ない" +
      "（母音の段は音符のあるモーラだけに出る）。韻とみた根拠の一文はデータから機械で組んでいる。"
    ));
  },
});
