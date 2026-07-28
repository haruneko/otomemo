/* sheet-m8.js — 枚8: ページ遷移図（担当D・引き直し）。
 * 反映するもの＝範囲の開き方（語〜区間の任意範囲）・白紙の曲で「並びに入れる」を押したときの
 * 行き先（明示確認を挟む）・入力系の橋（通しの面の直接入力と編集画面の書き入れる欄）・
 * 操作の割当（V7C.opsTableNote()＝枚1と同一文の機械照合対象）。 */
V7C.registerSheet({
  id: "m8",
  no: 12,
  title: "ページ遷移図",
  wide: true,
  marksOpts: { flatPair: "ア", yellowUse: "B" },
  css: [
    ".m8-wrap{background:#16181c;border:1px solid #3c414a;border-radius:14px;padding:14px 16px 12px}",
    ".m8-lab{font-size:11px;color:#6d7480;margin:14px 0 6px}",
    ".m8-lab:first-child{margin-top:0}",
    ".m8-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}",
    ".m8-row+.m8-row{margin-top:8px}",
    ".m8-box{border:1px solid #454b56;background:#22252b;border-radius:9px;padding:6px 10px;font-size:12px;max-width:330px}",
    ".m8-box-main{border-color:#3a6df0;background:#181c25}",
    ".m8-box-main .m8-bt{font-weight:600;font-size:13px}",
    ".m8-box-dash{border-style:dashed;border-color:#8a7a4d;color:#c9b27a}",
    ".m8-box-dash .m8-bt{white-space:normal;line-height:1.5}",
    ".m8-box-w216{max-width:216px}",
    ".m8-box-w216 .m8-bt{white-space:normal}",
    ".m8-bt{white-space:nowrap}",
    ".m8-sub{font-size:10px;color:#9aa0aa;margin-top:3px;line-height:1.55;white-space:normal}",
    ".m8-arr{color:#9aa0aa;font-size:14px;flex:none}",
    ".m8-arrlab{font-size:9.5px;color:#9aa0aa;border:1px dashed #454b56;border-radius:8px;padding:4px 8px;line-height:1.55;max-width:214px}",
    ".m8-down{color:#9aa0aa;font-size:12px;margin:10px 0}",
    ".m8-note{font-size:10.5px;color:#6d7480;margin-top:6px;line-height:1.6}",
  ].join("\n"),
  build(root) {
    const C = V7C;
    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function box(main, sub, cls) {
      const b = el("div", "m8-box" + (cls ? " " + cls : ""));
      b.appendChild(el("div", "m8-bt", main));
      if (sub) b.appendChild(el("div", "m8-sub", sub));
      return b;
    }
    function arr(t) { return el("span", "m8-arr", t || "→"); }
    function arrlab(t) { return el("span", "m8-arrlab", t); }
    function row(items) {
      const r = el("div", "m8-row");
      items.forEach(function (x) { r.appendChild(x); });
      return r;
    }

    const w = el("div", "m8-wrap");

    /* ---- 入口 ---- */
    w.appendChild(el("div", "m8-lab", "入口"));
    w.appendChild(row([
      box("ホーム「歌詞」タイル → 曲を選ぶ"),
      box("曲画面「歌詞」ボタン"),
      box("プロジェクトタブ"),
      box("PianoRoll「歌詞で見る」"),
    ]));
    w.appendChild(row([
      box("メロネタ単体「歌詞で見る」"),
      arr(),
      box("確認: どの曲に入れるか選ぶ／新しく作る", null, "m8-box-dash"),
    ]));
    w.appendChild(el("div", "m8-down", "↓ どの入口からも1手"));

    /* ---- 2つの場と、範囲の開き方 ---- */
    w.appendChild(row([
      box("歌詞全体画面（通しの面）",
        "表示切替: 素・音韻・イントネーション。詞テキストはこの面でその場入力（下の割当①②）",
        "m8-box-main m8-box-w216"),
      arr("⇄"),
      arrlab("開く単位＝語・句・複数句・パート・セクション・区間の任意範囲。" +
        "タップ=1手（割当③）・長押しで範囲を選ぶ（割当④）。戻ると同じ位置（割当⑤）"),
      arr("⇄"),
      box("範囲の編集画面",
        "最上位に自分の言葉を書き入れる欄。候補を探す→入れる／戻す。同じ範囲を開き直しても同じ画面",
        "m8-box-main m8-box-w216"),
    ]));
    w.appendChild(el("div", "m8-note",
      "仮セクションは「確定にする」の明示操作ではじめて曲画面に実体化。暗黙には作らない"));

    /* ---- 断片を並びに入れる（白紙の曲でも同じ道） ---- */
    w.appendChild(el("div", "m8-lab", "断片を並びに入れる（セクションが1つも無い白紙の曲でも同じ道）"));
    w.appendChild(row([
      box("「並びに入れる」",
        "通しの面の「まだ並びに入れていないもの」の断片から", "m8-box-w216"),
      arr(),
      box("確認: 置き場所を選ぶ／新しくセクションを作る", null, "m8-box-dash m8-box-w216"),
      arr(),
      box("通しの面（置いた場所へ戻る）"),
    ]));
    w.appendChild(el("div", "m8-note",
      "白紙の曲では「新しくセクションを作る」だけが出る。確認を通らずにセクションが作られることはない"));

    /* ---- 文字を打てる場所（入力の橋） ---- */
    w.appendChild(el("div", "m8-lab", "文字を打てる場所"));
    w.appendChild(row([
      box("通しの面", "詞テキストをタップ＝その場にカーソル（割当①）。空きの枠をタップ＝小フォームで打つ（割当②）"),
      box("範囲の編集画面", "書き入れる欄（候補より上）。候補を入れたあとも同じ欄で書き換え・戻すができる"),
    ]));

    /* ---- 編集画面からの橋 ---- */
    w.appendChild(el("div", "m8-lab", "範囲の編集画面からの橋（行って戻れる）"));
    w.appendChild(row([
      box("範囲の編集画面", null, "m8-box-main"),
      arr(),
      box("PianoRoll（メロを開く・断片タップ）"),
      box("配置画面（配置を開く）"),
      box("歌詞ネタ（引用⇄曲へ渡す）"),
      box("チャット（相談）"),
      box("トレイ"),
    ]));

    /* ---- 通しの面の操作の割当（枚1と同一文・機械照合される） ---- */
    w.appendChild(el("div", "m8-lab", "通しの面の操作の割当"));
    w.appendChild(C.opsTableNote());

    root.appendChild(w);

    root.appendChild(C.desc(
      "枚12（v6の枚8）=ページ遷移図（生存＋引き直し）。v6からの差分＝(1)編集画面の開く単位を句固定から任意範囲へ" +
      "（欠陥12・矢印の札に明記）(2)白紙の曲からの「並びに入れる」の行き先の矢印を追加（欠陥11・裁定4/5の" +
      "明示確認を挟む）(3)入力系の橋を「文字を打てる場所」の行として明示（欠陥1の遷移図側）" +
      "(4)操作の割当は opsTableNote（枚1と文字列一致を検証7が照合）。"
    ));
  },
});
