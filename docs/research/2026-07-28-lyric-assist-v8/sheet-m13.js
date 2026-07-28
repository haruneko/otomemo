/* sheet-m13.js — 枚13: 既存画面への足し込み（担当D・ほぼ引き継ぎ）。
 * 左=曲画面（既存）: 右上に「歌詞」ボタン・各セクションカードに欠けの小札。
 *   小札は V8C.sectionFactChips（データからの機械算出・data-calc付き）。
 *   置かれたメロのブロックのチップは V8C.rowChips（同じく機械算出）。手書きの数値は無い。
 * 右=PianoRoll（既存）: 右上に「歌詞で見る」ボタン。印は V8C.prFragment 経由で
 *   marks.js の規則から導出（手置きなし）。音符に付く文字は割り付いたモーラ。
 * 歌詞の2層の反映: カードのブロックに出る歌詞は表記（漢字仮名交じり・displayText）。 */
V8C.registerSheet({
  id: "m13",
  no: 13,
  title: "既存画面への足し込み",
  wide: true,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: [
    ".m13-cols{display:flex;gap:24px;align-items:flex-start}",
    ".m13-panel{flex:0 0 auto}",
    ".m13-pcap{font-size:11px;color:#9aa0aa;margin:0 0 6px 2px;max-width:352px}",
    ".m13-card{display:flex;align-items:flex-start;gap:7px;background:#22252b;border:1px solid #33373f;border-left:3px solid #4a5160;border-radius:9px;padding:7px 9px;margin:0 0 6px}",
    ".m13-card-kari{border-style:dashed;border-left-style:dashed;background:#1c1f25}",
    ".m13-cmain{min-width:0}",
    ".m13-cname{font-weight:600;font-size:13px;white-space:nowrap}",
    ".m13-cbars{color:#9aa0aa;font-size:11px;margin-top:1px}",
    ".m13-block{display:flex;align-items:center;gap:6px;border:1px solid #2e4a5e;background:#182028;border-radius:9px;padding:6px 9px;margin:-2px 0 6px 14px;font-size:12px}",
    ".m13-bkind{font-size:10px;color:#7fc0e8;border:1px solid #2e4a5e;border-radius:6px;padding:0 5px;flex:none}",
    ".m13-bchips{margin-left:auto;margin-top:0}",
    ".m13-prosody{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:11px;color:#e6e8ec;margin:2px 2px 8px}",
    ".m13-prosody i{font-style:normal;font-size:10px;color:#9aa0aa}",
    ".m13-r{color:#e8533f}",
    ".m13-y{color:#e0a83c}",
    ".m13-note{font-size:10px;color:#6d7480;margin-top:6px;line-height:1.6}",
  ].join("\n"),
  build(root) {
    const C = V8C, D = V8DATA;
    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    /* ---- 左: 曲画面（セクションカード＋置かれたメロのブロック） ---- */
    function sectionCard(s) {
      const card = el("div", "m13-card" + (s.kari ? " m13-card-kari" : ""));
      const main = el("div", "m13-cmain");
      const nm = el("div", "m13-cname", s.name);
      if (s.kari) {
        nm.appendChild(document.createTextNode(" "));
        nm.appendChild(el("span", "c-karichip", "仮"));
      }
      main.appendChild(nm);
      let barsTxt = s.bars
        ? (s.bars[1] - s.bars[0] + 1) + "小節・" + s.bars[0] + "–" + s.bars[1]
        : (s.barsText || "");
      if (s.noSing) barsTxt += "（歌なし）";
      main.appendChild(el("div", "m13-cbars", barsTxt));
      card.appendChild(main);
      card.appendChild(C.sectionFactChips(s.id)); // 小札=データからの機械算出（data-calc付き）
      return card;
    }
    /* 置かれたメロのブロック（曲画面に既存の表示）。歌詞は表記・チップは機械算出 */
    function meloBlock(id) {
      const u = C.phrase(id);
      const row = el("div", "m13-block");
      row.setAttribute("data-phrase", id);
      row.appendChild(el("span", "m13-bkind", "メロ"));
      const t = el("span", null);
      t.appendChild(document.createTextNode("「"));
      const w = el("span", null, C.displayText(u));
      w.setAttribute("data-src", "lyric:" + id);
      t.appendChild(w);
      t.appendChild(document.createTextNode("」"));
      row.appendChild(t);
      const chips = C.rowChips(id);
      if (chips) {
        chips.classList.add("m13-bchips");
        row.appendChild(chips);
      }
      return row;
    }

    const leftKids = [];
    D.songs.A.sections.forEach(function (s) {
      leftKids.push(sectionCard(s));
      if (s.id === "A-1A") leftKids.push(meloBlock("A-1A-k2"));
    });
    leftKids.push(C.addRow(["＋ セクションを足す"]));

    const leftPanel = el("div", "m13-panel");
    leftPanel.appendChild(el("div", "m13-pcap",
      "曲画面（既存）に足すもの＝右上の「歌詞」ボタンと、各セクションの欠けの小札。数はいま置いてある詞とメロから数える"));
    leftPanel.appendChild(C.phone(
      { title: D.songs.A.title, headBtn: "歌詞" },
      leftKids
    ));

    /* ---- 右: PianoRoll（「歌詞で見る」を足す。印は規則関数から） ---- */
    const prId = "A-1B-k1";
    const u = C.phrase(prId);
    const sec = C.section(u.section);
    const prTitle = sec.name + " " + C.barsLabel(u);

    const prosody = el("div", "m13-prosody");
    prosody.appendChild(el("span", null, "☑ 韻律チェック"));
    prosody.appendChild(el("i", "m13-r", "赤=アクセント逆行"));
    prosody.appendChild(el("i", "m13-y", "黄=注意"));
    prosody.appendChild(el("i", null, "印なし=指摘なし"));

    const rightPanel = el("div", "m13-panel");
    rightPanel.appendChild(el("div", "m13-pcap",
      "PianoRoll（既存）に足すもの＝右上の「歌詞で見る」ボタン。赤黄の印と詞モードは既存の機能のまま"));
    rightPanel.appendChild(C.phone(
      { title: prTitle, headBtn: "歌詞で見る" },
      [
        prosody,
        C.prFragment(prId),
        el("div", "m13-note",
          "印はどの画面でも同じ規則から出ます＝同じ句なら歌詞の画面と同じ音符に同じ印が付く"),
        el("div", "m13-note",
          "音符に付く文字は音符に割り付いたモーラ（読み）。書かれたままの歌詞（表記）は歌詞の画面が持つ"),
      ]
    ));

    const cols = el("div", "m13-cols");
    cols.appendChild(leftPanel);
    cols.appendChild(rightPanel);
    root.appendChild(cols);

    root.appendChild(C.desc(
      "枚13（v7の枚11）=既存画面への足し込み（ほぼ引き継ぎ）。小札の数値は sectionFactChips・ブロックのチップは " +
      "rowChips のデータ算出＝手書き数値ゼロ（v7の数え漏れの再発防止）。PianoRollの印は prFragment 経由で " +
      "marks.js の規則から導出（手置きなし）。歌詞の2層の反映＝カードの歌詞が表記（漢字仮名交じり）になり、" +
      "音符側の文字はモーラのまま（注記1行で区別を明示）。案はイ+B。"
    ));
  },
});
