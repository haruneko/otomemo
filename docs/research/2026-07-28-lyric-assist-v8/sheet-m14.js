/* sheet-m14.js — 枚14: ページ遷移図（担当D・引き直し）。
 * v8で反映するもの＝
 * (1) 「表示」シート（パーツ選択）の存在＝通しの面の中の重ね・効くのは通しの面だけ。
 * (2) 凡例・操作の割当が実UIの常設から外れヘルプに畳まれたこと（ヘルプも通しの面の重ね）。
 * (3) 表記を直した直後・かな書きの読み取り直しは範囲の編集画面の中の変化＝遷移の矢印は増やさない。
 * (4) 操作の割当は V8C.opsTableNote()（data.js の正準文字列・枚1の枠外と文字列一致の照合対象）。
 * 文面の項目列挙（表示シートの6項目）は V8C.DISPLAY_ITEMS から機械生成＝自作しない。 */
V8C.registerSheet({
  id: "m14",
  no: 14,
  title: "ページ遷移図",
  wide: true,
  marksOpts: { flatPair: "イ", yellowUse: "B" },
  css: [
    ".m14-wrap{background:#16181c;border:1px solid #3c414a;border-radius:14px;padding:14px 16px 12px}",
    ".m14-lab{font-size:11px;color:#6d7480;margin:14px 0 6px}",
    ".m14-lab:first-child{margin-top:0}",
    ".m14-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}",
    ".m14-row+.m14-row{margin-top:8px}",
    ".m14-box{border:1px solid #454b56;background:#22252b;border-radius:9px;padding:6px 10px;font-size:12px;max-width:330px}",
    ".m14-box-main{border-color:#3a6df0;background:#181c25}",
    ".m14-box-main .m14-bt{font-weight:600;font-size:13px}",
    ".m14-box-dash{border-style:dashed;border-color:#8a7a4d;color:#c9b27a}",
    ".m14-box-dash .m14-bt{white-space:normal;line-height:1.5}",
    ".m14-box-over{border-style:dashed;border-color:#59606c;background:#1c1f25}",
    ".m14-box-w216{max-width:216px}",
    ".m14-box-w216 .m14-bt{white-space:normal}",
    ".m14-bt{white-space:nowrap}",
    ".m14-sub{font-size:10px;color:#9aa0aa;margin-top:3px;line-height:1.55;white-space:normal}",
    ".m14-arr{color:#9aa0aa;font-size:14px;flex:none}",
    ".m14-arrlab{font-size:9.5px;color:#9aa0aa;border:1px dashed #454b56;border-radius:8px;padding:4px 8px;line-height:1.55;max-width:214px}",
    ".m14-down{color:#9aa0aa;font-size:12px;margin:10px 0}",
    ".m14-note{font-size:10.5px;color:#6d7480;margin-top:6px;line-height:1.6}",
  ].join("\n"),
  build(root) {
    const C = V8C;
    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function box(main, sub, cls) {
      const b = el("div", "m14-box" + (cls ? " " + cls : ""));
      b.appendChild(el("div", "m14-bt", main));
      if (sub) b.appendChild(el("div", "m14-sub", sub));
      return b;
    }
    function arr(t) { return el("span", "m14-arr", t || "→"); }
    function arrlab(t) { return el("span", "m14-arrlab", t); }
    function row(items) {
      const r = el("div", "m14-row");
      items.forEach(function (x) { r.appendChild(x); });
      return r;
    }

    const w = el("div", "m14-wrap");

    /* ---- 入口 ---- */
    w.appendChild(el("div", "m14-lab", "入口"));
    w.appendChild(row([
      box("ホーム「歌詞」タイル → 曲を選ぶ"),
      box("曲画面「歌詞」ボタン"),
      box("プロジェクトタブ"),
      box("PianoRoll「歌詞で見る」"),
    ]));
    w.appendChild(row([
      box("メロネタ単体「歌詞で見る」"),
      arr(),
      box("確認: どの曲に入れるか選ぶ／新しく作る", null, "m14-box-dash"),
    ]));
    w.appendChild(el("div", "m14-down", "↓ どの入口からも1手"));

    /* ---- 2つの場と、範囲の開き方 ---- */
    w.appendChild(row([
      box("歌詞全体画面（通しの面）",
        "既定の表示＝表記の歌詞＋穴の事実チップ＋印ドット（メロ帯・空きマスは畳む）。" +
        "表示切替: 素・音韻・イントネーション。詞テキストはこの面でその場入力（下の割当①②）",
        "m14-box-main m14-box-w216"),
      arr("⇄"),
      arrlab("開く単位＝語・句・複数句・パート・セクション・区間の任意範囲。" +
        "音符矩形をタップ＝1手（割当③・帯を畳んでいるときは行・見出しの長押しから）・" +
        "長押しで範囲を選ぶ（割当④）。戻ると同じスクロール位置・同じ表示切替・同じパーツ選択（割当⑤）"),
      arr("⇄"),
      box("範囲の編集画面",
        "最上位に自分の言葉を書き入れる欄。候補を探す→入れる／戻す。同じ範囲を開き直しても同じ画面。" +
        "パーツ選択の対象外＝常に全部出す",
        "m14-box-main m14-box-w216"),
    ]));
    w.appendChild(el("div", "m14-note",
      "仮セクションは「確定にする」の明示操作ではじめて曲画面に実体化。暗黙には作らない"));

    /* ---- 通しの面の中の重ね（画面は変わらない＝遷移の矢印は増えない） ---- */
    w.appendChild(el("div", "m14-lab", "通しの面の中の重ね（画面は変わらない＝遷移の矢印は増えない）"));
    w.appendChild(row([
      box("「表示」シート（パーツ選択）",
        "ヘッダの「表示」から開く重ね。出すものを選ぶ: " +
        C.DISPLAY_ITEMS.map(function (it) { return it.label; }).join("・") +
        "＋「既定に戻す」。効くのは通しの面だけ（範囲の編集画面は常に全部出す）。選択は表示切替をまたいで記憶",
        "m14-box-over m14-box-w216"),
      box("ヘルプ",
        "凡例と操作の割当①〜⑤はここに畳まれている＝画面に常設しない。開いた姿も通しの面の重ね",
        "m14-box-over m14-box-w216"),
    ]));

    /* ---- 範囲の編集画面の中の変化（画面は変わらない＝遷移の矢印は増えない） ---- */
    w.appendChild(el("div", "m14-lab", "範囲の編集画面の中の変化（画面は変わらない＝遷移の矢印は増えない）"));
    w.appendChild(row([
      box("表記を直した直後",
        "同じ画面のまま、読み（モーラ・高低）・印・音数のチップが再計算されて変わる。戻すも同じ画面",
        "m14-box-over m14-box-w216"),
      box("かな書きの句の読み取り直し",
        "読み取り用の表記を添える／読みの高低を手で直す。読みの出所（機械／手）の表示が変わるだけで画面は移らない",
        "m14-box-over m14-box-w216"),
    ]));

    /* ---- 断片を並びに入れる（白紙の曲でも同じ道） ---- */
    w.appendChild(el("div", "m14-lab", "断片を並びに入れる（セクションが1つも無い白紙の曲でも同じ道）"));
    w.appendChild(row([
      box("「並びに入れる」",
        "通しの面の「まだ並びに入れていないもの」の断片から", "m14-box-w216"),
      arr(),
      box("確認: 置き場所を選ぶ／新しくセクションを作る", null, "m14-box-dash m14-box-w216"),
      arr(),
      box("通しの面（置いた場所へ戻る）"),
    ]));
    w.appendChild(el("div", "m14-note",
      "白紙の曲では「新しくセクションを作る」だけが出る。確認を通らずにセクションが作られることはない"));

    /* ---- 文字を打てる場所（入力の橋） ---- */
    w.appendChild(el("div", "m14-lab", "文字を打てる場所"));
    w.appendChild(row([
      box("通しの面",
        "詞テキストをタップ＝その場にカーソル（割当①）。空きの枠（帯・マス表示のとき）／" +
        "「詞の空きN音」チップ（畳んでいるとき）をタップ＝小フォームで打つ（割当②）"),
      box("範囲の編集画面",
        "書き入れる欄（候補より上）。候補を入れたあとも同じ欄で書き換え・戻すができる。" +
        "読み取り用の表記もこの画面の欄に書く"),
    ]));

    /* ---- 編集画面からの橋 ---- */
    w.appendChild(el("div", "m14-lab", "範囲の編集画面からの橋（行って戻れる）"));
    w.appendChild(row([
      box("範囲の編集画面", null, "m14-box-main"),
      arr(),
      box("PianoRoll（メロを開く・断片タップ）"),
      box("配置画面（配置を開く）"),
      box("歌詞ネタ（引用⇄曲へ渡す）"),
      box("チャット（相談）"),
      box("トレイ"),
    ]));

    /* ---- 通しの面の操作の割当（正準文字列・枚1の枠外と文字列一致で照合される） ---- */
    w.appendChild(el("div", "m14-lab", "通しの面の操作の割当"));
    w.appendChild(C.opsTableNote());

    root.appendChild(w);

    root.appendChild(C.desc(
      "枚14（v7の枚12）=ページ遷移図（引き直し）。v7からの差分＝(1)「表示」シート（パーツ選択）とヘルプを" +
      "「通しの面の中の重ね」の行として追加（遷移の矢印は増やさない）(2)凡例・割当表の常設をやめヘルプに畳んだ旨を明記" +
      "(3)新枚2枚（表記を直した直後・かな書きの読み取り直し）は範囲の編集画面の中の変化の行＝矢印は増やしていない" +
      "(4)割当③⑤の文面変化（帯を畳んでいるときの開き方・パーツ選択の保存）を矢印の札に反映" +
      "(5)割当表は opsTableNote（データの正準文字列・検証が文字列一致を照合）。表示シートの6項目は DISPLAY_ITEMS から機械生成。"
    ));
  },
});
