// @cm/music-core — 日本語プロソディ×旋律の純関数（歌詞↔メロ支援 WP-M5 第1スライス）。
// 正典規則表＝docs/research/2026-07-14-jp-prosody-melody-rules.md（R-01〜14 歌詞→リズム型／A-01〜10 整合）。
// 思想：機械は候補まで・仕上げは人間＝hard規則も候補提示/soft警告に留め確定しない。
// 入力源は syllable（かな・モーラ片）とピッチ/オンセット列で完結（design #13b）。移調テンポ不変・純関数＝
// music-core の趣旨に合致（DB/MCP/Tone 非依存）。アクセントは内蔵簡易辞書＋平板ヒューリスティック（pyopenjtalk は
// 語境界×リズム軸=R-09/A-06 を本実装する将来スライスで接続）。

// ── §0 モーラ分割＋特殊拍分類 ───────────────────────────────────────────────
export type MoraKind = "normal" | "long" | "sokuon" | "hatsuon";
export interface Mora {
  kana: string; // モーラ片（拗音は結合済み＝「きゃ」）
  kind: MoraKind; // normal/長音ー/促音っ/撥音ん
  vowel: string | null; // a/i/u/e/o。ー は直前を継ぐ。っ/ん は null
}

// 拗音の小書き（直前と結合して1モーラ）。小母音ぁぃぅぇぉも外来音「ふぁ」等で結合＝#13 SMALL と同規約。
const SMALL = new Set("ァィゥェォャュョヮぁぃぅぇぉゃゅょゎ");
const LONG = new Set("ーｰ〜");
const SOKUON = new Set("っッ");
const HATSUON = new Set("んン");

// かな→母音（a/i/u/e/o）。カタカナは平仮名化(-0x60)してから引く。促音/撥音/長音は呼び側で除外。
const VOWEL_GROUPS: Record<string, string> = {};
{
  const groups: Record<string, string> = {
    a: "あかがさざただなはばぱまやらわぁゃゎ",
    i: "いきぎしじちぢにひびぴみりぃ",
    u: "うくぐすずつづぬふぶぷむゆるぅゅ",
    e: "えけげせぜてでねへべぺめれぇ",
    o: "おこごそぞとどのほぼぽもよろをぉょ",
  };
  for (const [v, chars] of Object.entries(groups)) for (const ch of chars) VOWEL_GROUPS[ch] = v;
}
function toHira(ch: string): string {
  const c = ch.codePointAt(0)!;
  // カタカナ域(U+30A1..U+30F6)→平仮名域
  return c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
}
function vowelOf(kana: string): string | null {
  // モーラ末尾文字の母音（拗音「きゃ」→ゃ→a）。
  const last = [...kana].pop() ?? "";
  return VOWEL_GROUPS[toHira(last)] ?? null;
}

/** かな列 → モーラ列（特殊拍分類つき）。長音ー/促音っ/撥音ん は各1モーラ（前にくっつけない＝#13 の最重要正しさ）。 */
export function analyzeMoras(kana: string): Mora[] {
  const out: Mora[] = [];
  const chars = [...kana];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (/\s/.test(ch)) continue;
    if (LONG.has(ch)) {
      out.push({ kana: ch, kind: "long", vowel: out.length ? out[out.length - 1]!.vowel : null });
      continue;
    }
    if (SOKUON.has(ch)) { out.push({ kana: ch, kind: "sokuon", vowel: null }); continue; }
    if (HATSUON.has(ch)) { out.push({ kana: ch, kind: "hatsuon", vowel: null }); continue; }
    // 拗音結合（次が小書き）
    const nxt = chars[i + 1] ?? "";
    if (nxt && SMALL.has(nxt)) {
      const k = ch + nxt;
      out.push({ kana: k, kind: "normal", vowel: vowelOf(k) });
      i++;
    } else {
      out.push({ kana: ch, kind: "normal", vowel: vowelOf(ch) });
    }
  }
  return out;
}

// ── §2 歌詞→リズム型候補（R-01〜12） ──────────────────────────────────────
export type SlotRole = "onset" | "tie" | "rest";
export interface RhythmSlot {
  syllable: string; // このスロットのモーラ片
  start: number; // 拍（この候補の内部座標・ピッチは持たない）
  dur: number; // 拍
  role: SlotRole; // onset=実音 / tie=長音ー（直前へ延長・新アタック無）/ rest=促音っ（詰め）
}
export interface RhythmCandidate {
  id: "basic" | "subdivide" | "tail";
  label: string;
  note: string;
  slots: RhythmSlot[];
}
export interface LyricRhythmResult {
  moras: Mora[];
  moraCount: number;
  candidates: RhythmCandidate[];
  pickup?: { word: string; note: string }; // 弱起（R-10）
}

// 句頭に来たら弱起へ寄せる軽い付属語（感動詞/接続詞）。長い順で貪欲マッチ。
const PICKUP_WORDS = ["そして", "だから", "けれど", "それで", "でも", "ねえ", "もう", "ああ", "さあ", "ねぇ"];

const UNIT = 1; // basic の1モーラ=1拍（内部座標。実尺は下流でグリッドへ写す）

function roleOf(m: Mora): SlotRole {
  if (m.kind === "long") return "tie";
  if (m.kind === "sokuon") return "rest";
  return "onset"; // normal / hatsuon
}

function basicSlots(moras: Mora[], unit: number): RhythmSlot[] {
  return moras.map((m, i) => ({ syllable: m.kana, start: i * unit, dur: unit, role: roleOf(m) }));
}

/** 歌詞(かな)→リズム型候補。ピッチは持たない（=生成本体ではない）。grid1マス=1モーラ。 */
export function suggestLyricRhythm(kana: string, opts: { unit?: number } = {}): LyricRhythmResult {
  const moras = analyzeMoras(kana);
  const unit = opts.unit ?? UNIT;
  const candidates: RhythmCandidate[] = [];

  // basic（R-01/03/05/06、特殊拍 role で ー=tie / っ=rest）
  candidates.push({
    id: "basic",
    label: "基本（1モーラ=1音符）",
    note: "1モーラ1音符の等分。長音ーは直前へ延長、促音っは詰め（実音を立てない）。",
    slots: basicSlots(moras, unit),
  });

  // subdivide（R-07 字余り＝16分等へ細分・早口/シンコペ耐性）
  const sub = basicSlots(moras, unit / 2);
  candidates.push({
    id: "subdivide",
    label: "細分（字余り・早口）",
    note: "単位を半分（16分寄り）に詰める。字余り（モーラ>枠）や早口・シンコペ向け。",
    slots: sub,
  });

  // tail（R-08/11/12 字足らず＝句末母音を伸ばす／メリスマ。最後の onset を延長）
  const tail = basicSlots(moras, unit);
  let lastOnset = -1;
  for (let i = tail.length - 1; i >= 0; i--) if (tail[i]!.role === "onset") { lastOnset = i; break; }
  if (lastOnset >= 0) {
    tail[lastOnset] = { ...tail[lastOnset]!, dur: tail[lastOnset]!.dur * 2 };
    for (let i = lastOnset + 1; i < tail.length; i++) tail[i] = { ...tail[i]!, start: tail[i]!.start + unit };
  }
  candidates.push({
    id: "tail",
    label: "句末伸ばし（字足らず・メリスマ）",
    note: "句末モーラの母音を伸ばす（長音化/メリスマ）。字足らず（モーラ<枠）やブレス点の余韻に。",
    slots: tail,
  });

  // pickup（R-10）：句頭が助詞/接続詞/感動詞なら弱起（前小節弱拍）へ寄せる提案
  let pickup: LyricRhythmResult["pickup"];
  for (const w of PICKUP_WORDS) {
    if (kana.startsWith(w)) {
      pickup = { word: w, note: `「${w}」は弱起（前小節の弱拍＝アウフタクト）へ寄せ、次の内容語頭を強拍に置くと自然（R-10）。` };
      break;
    }
  }

  return { moras, moraCount: moras.length, candidates, ...(pickup ? { pickup } : {}) };
}

// ── §1 アクセント整合（A-01〜10） ─────────────────────────────────────────
export type Rel = "UP" | "DOWN" | "FLAT"; // 朗読ピッチの隣接モーラ関係
export type Dir = "+" | "0" | "-"; // 旋律の隣接音符関係

/** アクセント核 → 隣接モーラ対の朗読関係列（長さ moraCount-1）。東京式：
 *  平板(kernel0)=第1低→以降高、頭高(kernel1)=高→低、中高(kernelK)=核まで上がって核直後で下がる。 */
export function accentContour(moraCount: number, kernel: number): Rel[] {
  if (moraCount < 2) return [];
  // 各モーラの高低（H/L）を決めてから隣接差を取る。
  const hl: ("H" | "L")[] = [];
  for (let i = 1; i <= moraCount; i++) {
    // 1-based i。平板(kernel0)：i=1 L, i>=2 H。頭高(kernel1)：i=1 H, i>=2 L。
    // 中高(kernelK>=2)：i=1 L, 2<=i<=K H, i>K L。
    let h: boolean;
    if (kernel === 0) h = i >= 2;
    else if (kernel === 1) h = i === 1;
    else h = i >= 2 && i <= kernel;
    hl.push(h ? "H" : "L");
  }
  const out: Rel[] = [];
  for (let i = 0; i + 1 < hl.length; i++) {
    const a = hl[i]!, b = hl[i + 1]!;
    out.push(a === b ? "FLAT" : a === "L" ? "UP" : "DOWN");
  }
  return out;
}

// 内蔵簡易アクセント辞書（kana→核位置。0=平板/1=頭高/n=中高）。同形異音は代表値＝呼び側 accents で上書き可。
const ACCENT_DICT: Record<string, number> = {
  はし: 1, // 箸(頭高)を代表値に（橋=平板は accents で上書き）
  そら: 1, // 空(頭高)
  やま: 0, // 山(平板)
  はな: 0, // 花(平板)
  きみ: 0, // 君(平板)
  こころ: 0, // 心(平板)
  ひかり: 0, // 光(平板)
  なみだ: 0, // 涙(平板)
  ゆめ: 2, // 夢(尾高)＝2モーラ尾高は末尾核
};

export interface AccentEntry { kana: string; kernel: number }
export interface FitHit { noteIdx: number; ruleId: string; severity: "red" | "yellow" | "info"; note: string }
// openness＝仮歌詞の母音設計メトリクス（L1 §4・V1/V2）。既存 FitReport への **追加のみ**（互換維持）。
export interface OpennessReport {
  v1: number | null; // V1 頂点開口度＝セクション最高音に乗るモーラの母音開口度（a=1.0…u=0.2・っ/ん=0）。null=母音不明
  v2pitch: number | null; // V2 開口度×音高の順位相関（-1..1・正＝高い音ほど開いた母音）。points<2 は null
  v2dur: number | null; // V2 開口度×音価の順位相関（正＝長い音ほど開いた母音）
  apexIdx: number; // 最高音の note index（-1=不明）
}
export interface FitReport { score: number; hits: FitHit[]; contour: Rel[]; melodyDir: Dir[]; openness: OpennessReport }
export interface FitNote { pitch: number; syllable?: string; start?: number; dur?: number }

// ── §4 母音開口度メトリクス（L1 §2.1/§4・V1 頂点開口度／V2 開口度×音高・音価相関） ──────────
// 開口度ランク（L1 §2.1 設計値）：あ段最大→う段最小。ん/っ=0（口が閉じる）、ー は直前を継ぐ。
const OPENNESS: Record<string, number> = { a: 1.0, o: 0.8, e: 0.6, i: 0.35, u: 0.2 };

/** 音符列（syllable 付き）→ 各音符の母音開口度（null=母音不明）。ー は直前の開口度を継ぐ・っ/ん=0。 */
export function opennessSeq(syllables: string[]): (number | null)[] {
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (const s of syllables) {
    const m = analyzeMoras(s)[0];
    let o: number | null;
    if (!m) o = null;
    else if (m.kind === "long") o = prev; // ー＝直前を継ぐ
    else if (m.kind === "sokuon" || m.kind === "hatsuon") o = 0; // っ/ん＝口が閉じる
    else o = m.vowel ? OPENNESS[m.vowel] ?? null : null;
    prev = o;
    out.push(o);
  }
  return out;
}

// スピアマン順位相関（同値は平均順位）。points<2 or 片方が定数なら null。
function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const rank = (a: number[]): number[] => {
    const idx = a.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(a.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      const avg = (i + j) / 2 + 1; // 1始まりの平均順位
      for (let k = i; k <= j; k++) r[idx[k]![1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i]! - mx, b = ry[i]! - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null; // 定数列＝相関定義不能
  return num / Math.sqrt(dx * dy);
}

/** V1/V2＝仮歌詞の母音設計メトリクス（頂点開口度・開口度×音高/音価相関）。純関数・音源不要。 */
export function opennessReport(notes: FitNote[]): OpennessReport {
  const open = opennessSeq(notes.map((n) => n.syllable ?? ""));
  // V1：最高音の note に乗るモーラの開口度（同点は最初）。
  let apexIdx = -1, apexPitch = -Infinity;
  for (let i = 0; i < notes.length; i++) if (notes[i]!.pitch > apexPitch) { apexPitch = notes[i]!.pitch; apexIdx = i; }
  const v1 = apexIdx >= 0 ? open[apexIdx] ?? null : null;
  // V2：母音が判る音符だけで（開口度, 音高）と（開口度, 音価）の順位相関。
  const oP: number[] = [], p: number[] = [], oD: number[] = [], d: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    if (open[i] === null || open[i] === undefined) continue;
    oP.push(open[i]!); p.push(notes[i]!.pitch);
    const du = notes[i]!.dur;
    if (typeof du === "number") { oD.push(open[i]!); d.push(du); }
  }
  return { v1, v2pitch: spearman(oP, p), v2dur: spearman(oD, d), apexIdx };
}

// A-table の重み（§6.2）。score = 1 - Σweight / (最大重み × 対数)。
const A_WEIGHT: Record<string, { w: number; sev: FitHit["severity"] }> = {
  "A-01": { w: 3, sev: "red" }, // DOWN×+（語義誤解・最重）
  "A-02": { w: 1.5, sev: "yellow" }, // DOWN×0（下がり切らない）
  "A-03": { w: 1.5, sev: "yellow" }, // UP×-（上がるべき所で下降）
  "A-04": { w: 0.3, sev: "info" }, // UP×0（軽微）
  "A-05": { w: 1, sev: "yellow" }, // FLAT×大跳躍（平板の逸脱）
  "A-07": { w: 0.3, sev: "info" }, // 句末上げ（疑問/不安定含意）
};

// モーラ列（かな）と語アクセントから全体の朗読関係列を組む。語境界の関係は FLAT（新アクセント句は低リセット＝
// 誤検出を避け保守的に）。accents 明示が最良、無指定は内蔵辞書を貪欲マッチ、未知連続は平板(kernel0)。
function buildContour(syllables: string[], accents?: AccentEntry[]): Rel[] {
  const n = syllables.length;
  if (n < 2) return [];
  // 語分割：accents があればそれを順に消費、無ければ辞書で貪欲マッチ、残りは平板1モーラ語扱い。
  const words: { moras: number; kernel: number }[] = [];
  if (accents && accents.length) {
    for (const a of accents) words.push({ moras: analyzeMoras(a.kana).length, kernel: a.kernel });
  } else {
    let i = 0;
    const keys = Object.keys(ACCENT_DICT).sort((x, y) => y.length - x.length);
    while (i < n) {
      let matched = false;
      for (const k of keys) {
        const km = [...k];
        if (km.length <= n - i && km.every((c, j) => c === syllables[i + j])) {
          words.push({ moras: km.length, kernel: ACCENT_DICT[k]! });
          i += km.length;
          matched = true;
          break;
        }
      }
      if (!matched) { words.push({ moras: 1, kernel: 0 }); i++; }
    }
  }
  // 各語の内部 contour を並べ、語境界は FLAT で埋める（合計 n-1 個）。
  const rel: Rel[] = [];
  let consumed = 0;
  for (let wi = 0; wi < words.length && consumed < n; wi++) {
    const w = words[wi]!;
    const m = Math.min(w.moras, n - consumed);
    const inner = accentContour(m, w.kernel); // 長さ m-1
    rel.push(...inner);
    consumed += m;
    if (consumed < n) rel.push("FLAT"); // 語境界
  }
  return rel.slice(0, n - 1);
}

function dirOf(a: number, b: number): Dir {
  return b > a ? "+" : b < a ? "-" : "0";
}

/** 既存メロ×歌詞のアクセント整合レポート（A-01〜05/07）。hits は UI が赤/黄でハイライト＝ユーザー握りつぶし可。 */
export function analyzeLyricFit(
  notes: FitNote[],
  opts: { accents?: AccentEntry[]; meter?: string } = {},
): FitReport {
  const syllables = notes.map((n) => n.syllable ?? "");
  const contour = buildContour(syllables, opts.accents);
  const melodyDir: Dir[] = [];
  for (let i = 0; i + 1 < notes.length; i++) melodyDir.push(dirOf(notes[i]!.pitch, notes[i + 1]!.pitch));

  const hits: FitHit[] = [];
  let totalW = 0;
  const pairs = Math.max(1, notes.length - 1);

  for (let i = 0; i < contour.length && i < melodyDir.length; i++) {
    const rel = contour[i]!, dir = melodyDir[i]!;
    let ruleId: string | null = null;
    if (rel === "DOWN" && dir === "+") ruleId = "A-01";
    else if (rel === "DOWN" && dir === "0") ruleId = "A-02";
    else if (rel === "UP" && dir === "-") ruleId = "A-03";
    else if (rel === "UP" && dir === "0") ruleId = "A-04";
    else if (rel === "FLAT" && dir !== "0" && Math.abs(notes[i + 1]!.pitch - notes[i]!.pitch) >= 5) ruleId = "A-05";
    if (ruleId) {
      const meta = A_WEIGHT[ruleId]!;
      totalW += meta.w;
      hits.push({ noteIdx: i + 1, ruleId, severity: meta.sev, note: ruleNote(ruleId) });
    }
  }
  // A-07 句末が上昇で終止（疑問/不安定含意）。意図なら無視可＝info。
  if (melodyDir.length && melodyDir[melodyDir.length - 1] === "+") {
    hits.push({ noteIdx: notes.length - 1, ruleId: "A-07", severity: "info", note: ruleNote("A-07") });
    totalW += A_WEIGHT["A-07"]!.w;
  }

  const score = Math.max(0, Math.min(1, 1 - totalW / (3 * pairs)));
  return { score, hits, contour, melodyDir, openness: opennessReport(notes) };
}

function ruleNote(id: string): string {
  switch (id) {
    case "A-01": return "アクセント核の下がり目を旋律が上昇で裏切る＝語義誤解リスク（箸/橋型）。下降か同音へ。";
    case "A-02": return "下がり目を旋律が平坦化＝下がり切らない。下降で締めると自然。";
    case "A-03": return "上がり目を旋律が下降で裏切る。上昇か同音へ寄せると自然。";
    case "A-04": return "上がり目を旋律が同音（軽微）。";
    case "A-05": return "平板部で不要な大跳躍。平板語は起伏を抑えると自然。";
    case "A-07": return "句末が上げっぱなし＝疑問/不安定な含意。意図でなければ保持〜下降で締める。";
    default: return "";
  }
}
