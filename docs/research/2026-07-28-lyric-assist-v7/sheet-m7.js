/* sheet-m7.js — 枚7: 既存画面への足し込み（担当D）。
 * 左=曲画面（セクションカードに欠けの小札・「歌詞」ボタンを足す）
 * 右=PianoRoll（「歌詞で見る」ボタンを足す。赤黄の印は既存機能・規則関数から導出）。
 * 小札の数値は全て V7C.sectionFactChips / V7C.slotIdxs のデータ算出。手書きの数値は無い。 */
V7C.registerSheet({
  id: "m7",
  no: 11,
  title: "既存画面への足し込み",
  wide: true,
  marksOpts: { flatPair: "ア", yellowUse: "B" },
  css: [
    ".m7-cols{display:flex;gap:24px;align-items:flex-start}",
    ".m7-panel{flex:0 0 auto}",
    ".m7-pcap{font-size:11px;color:#9aa0aa;margin:0 0 6px 2px;max-width:352px}",
    ".m7-card{display:flex;align-items:flex-start;gap:7px;background:#22252b;border:1px solid #33373f;border-left:3px solid #4a5160;border-radius:9px;padding:7px 9px;margin:0 0 6px}",
    ".m7-card-kari{border-style:dashed;border-left-style:dashed;background:#1c1f25}",
    ".m7-cmain{min-width:0}",
    ".m7-cname{font-weight:600;font-size:13px;white-space:nowrap}",
    ".m7-cbars{color:#9aa0aa;font-size:11px;margin-top:1px}",
    ".m7-block{display:flex;align-items:center;gap:6px;border:1px solid #2e4a5e;background:#182028;border-radius:9px;padding:6px 9px;margin:-2px 0 6px 14px;font-size:12px}",
    ".m7-bkind{font-size:10px;color:#7fc0e8;border:1px solid #2e4a5e;border-radius:6px;padding:0 5px;flex:none}",
    ".m7-chip{margin-left:auto;font-size:9.5px;color:#9aa0aa;border:1px solid #33373f;border-radius:7px;padding:0 5px;white-space:nowrap}",
    ".m7-prosody{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:11px;color:#e6e8ec;margin:2px 2px 8px}",
    ".m7-prosody i{font-style:normal;font-size:10px;color:#9aa0aa}",
    ".m7-r{color:#e8533f}",
    ".m7-y{color:#e0a83c}",
    ".m7-note{font-size:10px;color:#6d7480;margin-top:6px;line-height:1.6}",
  ].join("\n"),
  build(root) {
    const C = V7C, D = V7DATA;
    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    /* ---- 左: 曲画面（セクションカード＋置かれたメロのブロック） ---- */
    function sectionCard(s) {
      const card = el("div", "m7-card" + (s.kari ? " m7-card-kari" : ""));
      const main = el("div", "m7-cmain");
      const nm = el("div", "m7-cname", s.name);
      if (s.kari) {
        nm.appendChild(document.createTextNode(" "));
        nm.appendChild(el("span", "c-karichip", "仮"));
      }
      main.appendChild(nm);
      let barsTxt = s.bars
        ? (s.bars[1] - s.bars[0] + 1) + "小節・" + s.bars[0] + "–" + s.bars[1]
        : (s.barsText || "");
      if (s.noSing) barsTxt += "（歌なし）";
      main.appendChild(el("div", "m7-cbars", barsTxt));
      card.appendChild(main);
      card.appendChild(C.sectionFactChips(s.id)); // 小札=データからの機械算出（data-calc付き）
      return card;
    }
    /* 置かれたメロのブロック（曲画面に既存の表示）。空きの数はデータから算出 */
    function meloBlock(id) {
      const u = C.phrase(id);
      const row = el("div", "m7-block");
      row.setAttribute("data-phrase", id);
      row.appendChild(el("span", "m7-bkind", "メロ"));
      const t = el("span", null);
      t.appendChild(document.createTextNode("「"));
      const w = el("span", null, C.displayText(u));
      w.setAttribute("data-src", "lyric:" + id);
      t.appendChild(w);
      t.appendChild(document.createTextNode("」"));
      row.appendChild(t);
      row.appendChild(el("span", "m7-chip", "詞の空き " + C.slotIdxs(u).length + "音"));
      return row;
    }

    const leftKids = [];
    D.songs.A.sections.forEach(function (s) {
      leftKids.push(sectionCard(s));
      if (s.id === "A-1A") leftKids.push(meloBlock("A-1A-k2"));
    });
    leftKids.push(C.addRow(["＋ セクションを足す"]));

    const leftPanel = el("div", "m7-panel");
    leftPanel.appendChild(el("div", "m7-pcap",
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

    const prosody = el("div", "m7-prosody");
    prosody.appendChild(el("span", null, "☑ 韻律チェック"));
    prosody.appendChild(el("i", "m7-r", "赤=アクセント逆行"));
    prosody.appendChild(el("i", "m7-y", "黄=注意"));
    prosody.appendChild(el("i", null, "印なし=指摘なし"));

    const rightPanel = el("div", "m7-panel");
    rightPanel.appendChild(el("div", "m7-pcap",
      "PianoRoll（既存）に足すもの＝右上の「歌詞で見る」ボタン。赤黄の印と詞モードは既存の機能のまま"));
    rightPanel.appendChild(C.phone(
      { title: prTitle, headBtn: "歌詞で見る" },
      [
        prosody,
        C.prFragment(prId),
        el("div", "m7-note", "印はどの画面でも同じ規則から出ます＝同じ句なら歌詞の画面と同じ音符に同じ印が付く"),
      ]
    ));

    const cols = el("div", "m7-cols");
    cols.appendChild(leftPanel);
    cols.appendChild(rightPanel);
    root.appendChild(cols);

    root.appendChild(C.desc(
      "枚11（v6の枚7）=既存画面への足し込み（生存＋修正）。v6の欠陥15（1番サビカードのメロの空きの数え漏れ）は、" +
      "小札を sectionFactChips のデータ算出に替えて解消（1番サビ=詞なし1範囲＋メロの空き1句が機械で出る）。" +
      "v6の欠陥（枚7だけ別の音符に印が付く食い違い）は、印を prFragment 経由の規則関数導出に替えて解消。" +
      "小節番号は前奏込みの通し（1番Aメロ=5–12。欠陥14の修正がカードにも見える）。案はア/B（既定）。"
    ));
  },
});
