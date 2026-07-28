/* sheet-b2.js — 枚2: 歌詞全体画面・表示切替（イントネーション）＋印の決まり（案くらべ）。
 * 印は全て marks.js の規則関数から導出（手置きなし）。上の電話枠は枚の宣言（案イ+案A）、
 * 下の「印の決まり」は部品単位の opts.marksOpts 上書きで案ごとの差を同じ句で並べる。 */
V7C.registerSheet({
  id: "b2",
  no: 2,
  title: "歌詞全体画面・表示切替（イントネーション）＋印の決まり",
  wide: false,
  marksOpts: { flatPair: "イ", yellowUse: "A" },
  css: [
    ".b2-note{font-size:10.5px;color:#9aa0aa;margin:10px 2px 2px;line-height:1.6}",
    ".b2-rl{font-size:11px;font-weight:600;color:#e6e8ec;margin:12px 0 2px;border-top:1px solid #33373f;padding-top:9px}",
    ".b2-rltxt{font-size:10.5px;color:#9aa0aa;line-height:1.65;margin:4px 0 2px}",
    ".b2-ex{margin:7px 0 2px}",
    ".b2-exl{font-size:10.5px;color:#c9cdd6;margin:6px 0 2px}",
  ].join("\n"),
  build(root) {
    const C = V7C;

    /* 予定チップを時間揃え行の下に足す（イントネーション表示でも予定が消えないように） */
    function withPlan(unitId) {
      const row = C.phraseRow(unitId, "into");
      const u = C.phrase(unitId);
      if (u.plan) row.querySelector(".c-kmain").appendChild(C.planChip(u.plan));
      return row;
    }

    const note = document.createElement("div");
    note.className = "b2-note";
    note.textContent = "（ここから下の並びは素の表示と同じ。印と文字の時間揃えだけが替わる。この画面の印は 案イ・案A で出している）";

    root.appendChild(C.phone(
      { title: "サンプル曲（サンプルEP）", tab: "イントネーション", legend: C.legendText("into") },
      [
        C.sectionHead("A-intro"),
        C.sectionHead("A-1A"),
        C.phraseRow("A-1A-k1", "into"),
        C.phraseRow("A-1A-k2", "into"),
        C.phraseRow("A-1A-k3", "into"),
        withPlan("A-1A-k4"),
        C.sectionHead("A-1B"),
        C.phraseRow("A-1B-k1", "into"),
        C.phraseRow("A-1B-k2", "into"),
        C.zoneRow("A-1B-z1"),
        C.sectionHead("A-1S"),
        C.phraseRow("A-1S-k1", "into"),
        note,
      ]
    ));

    /* ---- 印の決まり（案くらべ）: 同じ句を案ごとに並べる ---- */
    function rl(text) {
      const d = document.createElement("div");
      d.className = "b2-rl";
      d.textContent = text;
      return d;
    }
    function rltxt(text) {
      const d = document.createElement("div");
      d.className = "b2-rltxt";
      d.textContent = text;
      return d;
    }
    function ex(label, unitId, marksOpts) {
      const d = document.createElement("div");
      d.className = "b2-ex";
      const l = document.createElement("div");
      l.className = "b2-exl";
      l.textContent = label;
      d.appendChild(l);
      d.appendChild(C.melo(unitId));
      d.appendChild(C.timeRow(unitId, "kana", { marksOpts: marksOpts }));
      return d;
    }

    root.appendChild(C.inset("印の決まり（どの印も、ここに書いた決まりからだけ出る）", [
      rl("赤＝となり合う2音で、読みの高低の変化とメロの上下が逆（どの案でも付く）"),
      ex("例: " + C.displayText(C.phrase("A-1B-k1")), "A-1B-k1", { flatPair: "ア", yellowUse: "B" }),
      rl("読みが平らな2音のあいだでメロが大きく動くとき"),
      ex("案ア＝印なし（印なし＝指摘なし）: " + C.displayText(C.phrase("A-1A-k2")), "A-1A-k2", { flatPair: "ア", yellowUse: "B" }),
      ex("案イ＝黄で注意を残す: 同じ句", "A-1A-k2", { flatPair: "イ", yellowUse: "B" }),
      rl("黄のつかい途"),
      rltxt("案A＝「読みが変わるのにメロが平ら」な2音にも黄を付ける ／ 案B＝その黄は出さない" +
        "（音数の注意はどちらの案でも候補の札に出る）。※この曲の今のメロには" +
        "「読みが変わるのにメロが平ら」な2音が無いため、案Aと案Bの差はこの絵では出ない"),
    ]));

    root.appendChild(C.desc(
      "枚2＝イントネーション切替（生存）。印は全て規則関数から導出（欠陥19・手置きなし）。" +
      "下の「印の決まり」が印の規則表＝裁定材料: 平ら区間の扱い（案ア/案イ。v6で赤だった" +
      "「のんでから」の「で」はここに落ちる）と黄の使い途（案A/案B）。案A/Bの差が出る実例は" +
      "データに無い＝工程0へ追加依頼済み。上の電話枠は案イ+案Aで表示。"
    ));
  },
});
