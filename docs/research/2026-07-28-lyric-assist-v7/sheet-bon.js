/* sheet-bon.js — （新）枚: 歌詞全体画面・表示切替（音韻）。枚2と対。
 * 作法は枚2と同じ（文字の時間揃え＋文字への付け足しの印）。中身は母音・韻の対応:
 *  - 各音の下に小さく母音（a i u e o。ん・っ・ーはそのまま）＝機械導出（かな→母音の表）。
 *  - 句のおわり2音の母音が同じ句どうしを同じ色の下線で結ぶ（韻とみた根拠を絵に出す）。
 * 歌詞・モーラの文字列は全てデータ由来（部品が置いた文字に付け足すだけ。文字は書き換えない）。 */
V7C.registerSheet({
  id: "bon",
  no: 3,
  title: "歌詞全体画面・表示切替（音韻）",
  wide: false,
  marksOpts: { flatPair: "ア", yellowUse: "B" },
  css: [
    ".bon-vrow{position:relative;height:13px;margin-top:1px}",
    ".bon-vc{position:absolute;top:0;text-align:center;font-size:9px;color:#6d7480;font-family:ui-monospace,SFMono-Regular,monospace}",
    ".bon-rh0{color:#7fd6a8;border-bottom:2px solid #3d8f6b;font-weight:700}",
    ".bon-rha{color:#7fd6a8;border-bottom:2px solid #3d8f6b}",
    ".bon-sum{font-size:10.5px;color:#8fb8a8;border:1px solid #3d5a4f;border-radius:8px;padding:5px 8px;margin:12px 0 2px;line-height:1.6}",
    ".bon-note{font-size:10.5px;color:#9aa0aa;margin:10px 2px 2px;line-height:1.6}",
  ].join("\n"),
  build(root) {
    const C = V7C;

    /* かな→母音（機械導出の表。表示データではなく既存モーラ列への注記） */
    const VMAP = {
      a: "あかがさざただなはばぱまやらわゃアカガサザタダナハバパマヤラワャ",
      i: "いきぎしじちぢにひびぴみりイキギシジチヂニヒビピミリ",
      u: "うくぐすずつづぬふぶぷむゆるゅウクグスズツヅヌフブプムユルュ",
      e: "えけげせぜてでねへべぺめれエケゲセゼテデネヘベペメレ",
      o: "おこごそぞとどのほぼぽもよろをょオコゴソゾトドノホボポモヨロヲョ",
    };
    function vowelOf(mora) {
      const c = mora[mora.length - 1];
      if (c === "ん" || c === "ン") return "ん";
      if (c === "っ" || c === "ッ") return "っ";
      if (c === "ー") return "ー";
      for (const k in VMAP) if (VMAP[k].indexOf(c) >= 0) return k;
      return "?";
    }

    /* 韻のグループ分け（機械）: 句のおわり2音の母音が同じ句どうし（2句以上そろったものだけ） */
    const wordedIds = ["A-1A-k1", "A-1A-k2", "A-1A-k3", "A-1A-k4", "A-1B-k1", "A-1S-k1"];
    const tails = {};
    wordedIds.forEach((id) => {
      const u = C.phrase(id);
      if (!u.accent || u.accent.moras.length < 2) return;
      const key = u.accent.moras.slice(-2).map(vowelOf).join("-");
      (tails[key] = tails[key] || []).push(id);
    });
    const rhymeIds = {};
    let groupKey = null;
    for (const k in tails) {
      if (tails[k].length >= 2 && /^[aiueo]-[aiueo]$/.test(k)) {
        groupKey = k;
        tails[k].forEach((id) => { rhymeIds[id] = k; });
        break; /* この絵ではグループは1つ（増えたら色を足す） */
      }
    }

    /* 句の行に母音の段を足し、韻の該当音に下線を付ける */
    function decorated(unitId) {
      const row = C.phraseRow(unitId, "into");
      const u = C.phrase(unitId);
      if (!u.accent) return row;
      const m = u.accent.moras.length;
      const inRhyme = (i) => rhymeIds[unitId] && i >= m - 2;
      const fr = row.querySelector(".c-fr");
      if (fr) {
        const vr = document.createElement("div");
        vr.className = "bon-vrow";
        fr.querySelectorAll(".c-tc[data-nc]").forEach((tc) => {
          const idx = +tc.getAttribute("data-nc").split(":")[1];
          const s = document.createElement("span");
          s.className = "bon-vc" + (inRhyme(idx) ? " bon-rh0" : "");
          s.textContent = vowelOf(u.accent.moras[idx]);
          s.style.left = tc.style.left;
          s.style.width = tc.style.width;
          vr.appendChild(s);
        });
        row.querySelector(".c-kmain").appendChild(vr);
        /* メロ未定の続き（時間の基準が無い文字）に韻が落ちる句は、その文字側に下線を付ける */
        const after = fr.querySelector(".c-fr-after");
        if (after && rhymeIds[unitId]) {
          const text = after.textContent;
          const tail = u.accent.moras.slice(-2).join("");
          if (text.length > tail.length && text.slice(-tail.length) === tail) {
            after.textContent = "";
            after.appendChild(document.createTextNode(text.slice(0, -tail.length)));
            const sp = document.createElement("span");
            sp.className = "bon-rha";
            sp.textContent = tail;
            after.appendChild(sp);
          }
        }
      }
      return row;
    }

    const note = document.createElement("div");
    note.className = "bon-note";
    note.textContent = "（ここから下の並びは素の表示と同じ。母音の段と韻の下線だけが替わる）";

    /* 韻とみた根拠の要約（文字列は全てデータのモーラ列から機械で切り出す） */
    let sum = null;
    if (groupKey) {
      sum = document.createElement("div");
      sum.className = "bon-sum";
      const parts = tails[groupKey].map((id) => "…" + C.phrase(id).accent.moras.slice(-3).join(""));
      sum.textContent = "韻とみた根拠 — 句のおわり2音の母音が「" + groupKey + "」でそろう: " + parts.join(" ／ ");
    }

    root.appendChild(C.phone(
      {
        title: "サンプル曲（サンプルEP）",
        tab: "音韻",
        legend: "各音の下の小さい字＝読みの母音（a i u e o。ん・っ・ーはそのまま）。緑の下線＝句のおわり2音の母音が同じ句どうし（韻）。赤＝アクセント逆行（表示切替に共通）",
      },
      [
        C.sectionHead("A-intro"),
        C.sectionHead("A-1A"),
        decorated("A-1A-k1"),
        decorated("A-1A-k2"),
        decorated("A-1A-k3"),
        decorated("A-1A-k4"),
        C.sectionHead("A-1B"),
        decorated("A-1B-k1"),
        C.phraseRow("A-1B-k2", "into"),
        C.zoneRow("A-1B-z1"),
        C.sectionHead("A-1S"),
        decorated("A-1S-k1"),
        sum || document.createTextNode(""),
        note,
      ]
    ));

    root.appendChild(C.desc(
      "枚3（新設）＝音韻タブの選択状態＝欠陥5の1案（目視裁定に回す）。枚2と同じ作法＝文字の時間揃え＋" +
      "文字への付け足しの印。母音は かな→母音 の機械導出、韻の対応は「句のおわり2音の母音が同じ」" +
      "の機械規則で、根拠（母音の段と要約の札）が絵から読める。メロ未定の続きに韻が落ちる句" +
      "（かぎをかけて…でる）は文字側に下線。印の宣言は案ア+案B＝逆行の赤だけが共通で出る。"
    ));
  },
});
