/* v7 marks.js — 印の規則（唯一の定義）。
 *
 * 全ての枚はこのファイルの関数から印を導く。印の手置きは禁止
 * （components.js が印を出すときに data-mk="rule" を付ける。検証がこれを照合する）。
 *
 * 規則:
 * - 赤   = 同一アクセント句内の隣接モーラ対で、読みの高低の変化（高→低／低→高）と
 *          メロの上下が逆。
 * - 平らな対（高→高・低→低）でメロが大きく動く（|Δ相対音高| >= FLAT_MOVE_MIN）:
 *          案「ア」= 印なし ／ 案「イ」= 黄。opts.flatPair で切替。
 * - 黄の使い途: 案「A」=「読みが変化する箇所でメロが平ら」も黄 ／
 *          案「B」= 黄は音数系（字余り・足りない）に限定＝高低由来の黄は出さない。
 *          opts.yellowUse で切替。※案「イ」の黄は flatPair 側の切替に属する
 *          （「イ」を選べば yellowUse に関わらず出る。組合せの意味はコードが正）。
 *
 * 音高の向き: データの y は「上が小さい」（相対音高・v6踏襲）。
 *            メロが上がる = y が減る。
 * 読みの高低: accent.py（pyopenjtalk）の出力を焼いたもの以外を渡さないこと。
 */
(function (g) {
  "use strict";

  // 「平らな対で大きく動く」の閾値（相対音高yの差・データ単位）。1か所に閉じる。
  var FLAT_MOVE_MIN = 3;

  var DEFAULT_OPTS = { flatPair: "ア", yellowUse: "B" };

  /**
   * 印の導出。
   * @param hl   0/1 の配列（0=低, 1=高）… accent.py の焼き込み値
   * @param ap   アクセント句id の配列（同値=同一アクセント句）… accent.py の焼き込み値
   * @param ys   モーラに対応する音符の相対音高 y の配列（音符が無いモーラは null）
   * @param opts {flatPair:"ア"|"イ", yellowUse:"A"|"B"}
   * @returns [{i, color:"r"|"y", why}] … i はモーラ番号（対の後ろ側に付ける）
   */
  function computeMarks(hl, ap, ys, opts) {
    opts = opts || DEFAULT_OPTS;
    var flatPair = opts.flatPair || "ア";
    var yellowUse = opts.yellowUse || "B";
    var out = [];
    var n = Math.min(hl.length, ap.length, ys.length);
    for (var i = 0; i + 1 < n; i++) {
      if (ap[i] !== ap[i + 1]) continue;                 // アクセント句をまたぐ対は見ない
      if (ys[i] == null || ys[i + 1] == null) continue;  // 音符が無い対は見ない
      var r = hl[i + 1] - hl[i];       // 読み: +1=上がる / -1=下がる / 0=平ら
      var m = ys[i] - ys[i + 1];       // メロ: +=上がる / -=下がる / 0=平ら
      if ((r > 0 && m < 0) || (r < 0 && m > 0)) {
        out.push({ i: i + 1, color: "r",
          why: "逆行（読みは" + (r > 0 ? "上がる" : "下がる") + "・メロは" + (m > 0 ? "上がる" : "下がる") + "）" });
      } else if (r === 0 && Math.abs(m) >= FLAT_MOVE_MIN && flatPair === "イ") {
        out.push({ i: i + 1, color: "y", why: "平らな対でメロが大きく動く" });
      } else if (r !== 0 && m === 0 && yellowUse === "A") {
        out.push({ i: i + 1, color: "y", why: "読みが変わるがメロは平ら" });
      }
    }
    return out;
  }

  /** HL列 → 「高低低」表記。バッジの高低表記はこれだけを使う。 */
  function hlText(hl) {
    var s = "";
    for (var i = 0; i < hl.length; i++) s += hl[i] ? "高" : "低";
    return s;
  }

  /** 空き音符列に「合う読みの高低」を機械提案（音の枠欄用）。中央より高い音=高。 */
  function slotSuggestHL(ys) {
    if (!ys.length) return [];
    var mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
    var mid = (mn + mx) / 2;
    return ys.map(function (y) { return y < mid ? 1 : 0; }); // yが小さい=高い
  }

  /** 空き音符列の動きの説明文（音の枠欄の自動注記用）。 */
  function slotTrendText(ys) {
    if (ys.length < 2) return "動きは小さい";
    var d = ys[ys.length - 1] - ys[0];
    if (d >= FLAT_MOVE_MIN) return "下がっていく";
    if (d <= -FLAT_MOVE_MIN) return "上がっていく";
    return "大きくは動かない";
  }

  /**
   * 詞候補のバッジ（全て機械生成。手書き文字列の混入禁止）。
   * @param cand   {word, accent:{moras,hl,ap}}
   * @param slotYs 宛先の空き音符の y 列
   * @returns [{t:表示文字列, tone:""|"y"|"r", marks?}]
   */
  function lyricCandBadges(cand, slotYs, opts) {
    var m = cand.accent.moras.length, s = slotYs.length;
    var badges = [];
    if (m === s) badges.push({ t: "音数ぴったり", tone: "" });
    else if (m > s) badges.push({ t: "字余り " + (m - s), tone: "y" });
    else badges.push({ t: "足りない " + (s - m), tone: "y" });
    var k = Math.min(m, s);
    var marks = computeMarks(cand.accent.hl.slice(0, k), cand.accent.ap.slice(0, k), slotYs.slice(0, k), opts);
    var reds = marks.filter(function (x) { return x.color === "r"; });
    var hs = hlText(cand.accent.hl);
    if (reds.length) badges.push({ t: "逆行 " + reds.length + "（" + hs + "）", tone: "r", marks: marks });
    else if (m === s) badges.push({ t: "読みの高低が合う（" + hs + "）", tone: "", marks: marks });
    else badges.push({ t: "読みの高低は合う（" + hs + "）", tone: "", marks: marks });
    return badges;
  }

  /**
   * メロ候補のバッジ（全て機械生成）。
   * @param candNotes 候補の音符列 [{x,w,y}]
   * @param accent    宛先の句の焼き込みアクセント {moras,hl,ap}
   */
  function melodyCandBadges(candNotes, accent, opts) {
    var m = accent.moras.length, s = candNotes.length;
    var badges = [];
    if (s === m) badges.push({ t: "音数ぴったり", tone: "" });
    else if (s < m) badges.push({ t: "音が足りない " + (m - s), tone: "y" });
    else badges.push({ t: "音が多い " + (s - m), tone: "y" });
    var k = Math.min(m, s);
    var ys = candNotes.slice(0, k).map(function (n) { return n.y; });
    var marks = computeMarks(accent.hl.slice(0, k), accent.ap.slice(0, k), ys, opts);
    var reds = marks.filter(function (x) { return x.color === "r"; });
    if (reds.length) badges.push({ t: "逆行 " + reds.length, tone: "r", marks: marks });
    else badges.push({ t: "読みの高低に沿う", tone: "", marks: marks });
    return badges;
  }

  g.V7MARKS = {
    FLAT_MOVE_MIN: FLAT_MOVE_MIN,
    DEFAULT_OPTS: DEFAULT_OPTS,
    OPTS: { flatPair: ["ア", "イ"], yellowUse: ["A", "B"] },
    computeMarks: computeMarks,
    hlText: hlText,
    slotSuggestHL: slotSuggestHL,
    slotTrendText: slotTrendText,
    lyricCandBadges: lyricCandBadges,
    melodyCandBadges: melodyCandBadges
  };
  if (typeof module !== "undefined" && module.exports) module.exports = g.V7MARKS;
})(typeof window !== "undefined" ? window : globalThis);
