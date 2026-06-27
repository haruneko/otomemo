// ABC記譜 → notes パーサ（S6-b コーパス取り込み・単旋律 Irish の実用サブセット）。
// 対応：ヘッダ M:/L:/K:/T:、音名(大小+,')、臨時 ^ ^^ _ __ =、長さ(数字・/分母)、休符 z/x、小節線 |（臨時リセット）。
// スキップ：和音[]、装飾{} "..." !...!、タイ -、連符・broken (>)<、繰返し記号（音は素直に列挙）。
// オクターブ写像：C(大)=MIDI60（c=72, C,=48, c'=84…）。start/dur は拍（四分=1）。
// 注：エッセンス（輪郭/音程/リズム指紋）は移調・オクターブ不変なので絶対オクターブ選択は無害。

export interface AbcTune {
  title?: string;
  meter?: string;
  unit?: string;
  key?: string;
  notes: { pitch: number; start: number; dur: number }[];
}

const BASE: Record<string, number> = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const MAJOR_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7, "G#": 8,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};
const MODE_OFFSET: Record<string, number> = { ion: 0, maj: 0, lyd: 1, mix: -1, dor: -2, min: -3, aeo: -3, phr: -4, loc: -5 };

// K:値 → 各音名(letter)の調号オフセット（+1=#, -1=b）。
function keySignature(k?: string): Record<string, number> {
  const acc: Record<string, number> = {};
  if (!k) return acc;
  const m = /^([A-Ga-g])([#b]?)\s*([A-Za-z]*)/.exec(k.trim());
  if (!m) return acc;
  const tonic = m[1]!.toUpperCase() + (m[2] ?? "");
  const modeRaw = (m[3] ?? "").toLowerCase();
  let mode = "ion";
  if (modeRaw === "" || modeRaw.startsWith("maj") || modeRaw.startsWith("ion")) mode = "ion";
  else if (modeRaw === "m" || modeRaw.startsWith("min") || modeRaw.startsWith("aeo")) mode = "aeo";
  else if (modeRaw.startsWith("mix")) mode = "mix";
  else if (modeRaw.startsWith("dor")) mode = "dor";
  else if (modeRaw.startsWith("phr")) mode = "phr";
  else if (modeRaw.startsWith("loc")) mode = "loc";
  else if (modeRaw.startsWith("lyd")) mode = "lyd";
  const fifths = (MAJOR_FIFTHS[tonic] ?? 0) + (MODE_OFFSET[mode] ?? 0);
  if (fifths > 0) for (let i = 0; i < fifths && i < 7; i++) acc[SHARP_ORDER[i]!] = 1;
  else if (fifths < 0) for (let i = 0; i < -fifths && i < 7; i++) acc[FLAT_ORDER[i]!] = -1;
  return acc;
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// K:値 → 主音のピッチクラス（normalizeToC 用）。"D"→2, "Ador"→9(A), "Bb"→10。
export function tonicPcOf(key?: string): number {
  if (!key) return 0;
  const m = /^([A-Ga-g])([#b]?)/.exec(key.trim());
  if (!m) return 0;
  let pc = LETTER_PC[m[1]!.toUpperCase()]!;
  if (m[2] === "#") pc += 1;
  else if (m[2] === "b") pc -= 1;
  return ((pc % 12) + 12) % 12;
}

// K:値 → major/minor（dorian/phrygian/aeolian/locrian は短調系、ionian/mixolydian/lydian は長調系）。
export function modeOf(key?: string): "major" | "minor" {
  const m = /^[A-Ga-g][#b]?\s*([A-Za-z]*)/.exec((key ?? "").trim());
  const mode = (m?.[1] ?? "").toLowerCase();
  if (mode.startsWith("maj") || mode.startsWith("mix") || mode.startsWith("ion") || mode.startsWith("lyd") || mode === "") return "major";
  return "minor"; // m / min / aeo / dor / phr / loc
}

// L:値 or 既定から「1単位＝何拍か」（四分=1拍）。例 1/8→0.5、1/4→1。
function unitBeats(unit?: string): number {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec((unit ?? "1/8").trim());
  if (!m) return 0.5;
  const num = Number(m[1]);
  const den = Number(m[2]);
  return den > 0 ? (num / den) * 4 : 0.5;
}

export function parseAbcTune(abc: string): AbcTune {
  const lines = abc.split(/\r?\n/);
  const head: Record<string, string> = {};
  const body: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/%.*$/, ""); // ABC コメント（% 以降）を除去
    const h = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (h && h[1]!.length === 1) head[h[1]!] = h[2]!.trim();
    else if (line.trim()) body.push(line);
  }
  const meter = head["M"] === "C" ? "4/4" : head["M"] === "C|" ? "2/2" : head["M"];
  const unit = head["L"];
  const key = head["K"];
  const ub = unitBeats(unit);
  const keyAcc = keySignature(key);

  const notes: { pitch: number; start: number; dur: number }[] = [];
  let t = 0;
  let measureAcc: Record<string, number> = {}; // 小節内の臨時（| でリセット）
  const s = body.join(" ");
  let i = 0;
  let pendingAcc: number | null = null; // 直前に読んだ臨時（次の音名に適用）

  const readLength = (): number => {
    let mult = 1;
    let numStr = "";
    while (i < s.length && /\d/.test(s[i]!)) numStr += s[i++]!;
    if (numStr) mult = Number(numStr);
    if (s[i] === "/") {
      i++;
      let den = "";
      while (i < s.length && /\d/.test(s[i]!)) den += s[i++]!;
      mult = mult / (den ? Number(den) : 2);
    }
    return mult;
  };

  while (i < s.length) {
    const c = s[i]!;
    if (c === "|") { measureAcc = {}; i++; pendingAcc = null; continue; }
    if (c === "^") { pendingAcc = (pendingAcc ?? 0) + 1; i++; continue; }
    if (c === "_") { pendingAcc = (pendingAcc ?? 0) - 1; i++; continue; }
    if (c === "=") { pendingAcc = 0; i++; continue; }
    if (c === '"') { i++; while (i < s.length && s[i] !== '"') i++; i++; continue; } // コード記号/注釈
    if (c === "!") { i++; while (i < s.length && s[i] !== "!") i++; i++; continue; } // 装飾
    if (c === "{") { while (i < s.length && s[i] !== "}") i++; i++; continue; } // 装飾音
    if (c === "[") { while (i < s.length && s[i] !== "]") i++; i++; continue; } // 和音/インラインフィールド＝単旋律ではスキップ
    if (c === "z" || c === "x") { i++; t += ub * readLength(); pendingAcc = null; continue; } // 休符＝時間だけ進む
    const isNote = /[A-Ga-g]/.test(c);
    if (isNote) {
      i++;
      const upper = c.toUpperCase();
      let pitch = BASE[upper]!;
      if (c >= "a" && c <= "g") pitch += 12; // 小文字＝1oct上
      while (i < s.length && (s[i] === "," || s[i] === "'")) { pitch += s[i] === "'" ? 12 : -12; i++; }
      // 臨時の解決：明示(pendingAcc) > 小節内持続(measureAcc) > 調号(keyAcc)。
      let acc: number;
      if (pendingAcc !== null) { acc = pendingAcc; measureAcc[upper] = pendingAcc; }
      else if (upper in measureAcc) acc = measureAcc[upper]!;
      else acc = keyAcc[upper] ?? 0;
      pitch += acc;
      const dur = ub * readLength();
      notes.push({ pitch, start: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
      t += dur;
      pendingAcc = null;
      continue;
    }
    i++; // その他（空白・> < ( ) - : 等）はスキップ
  }

  return { title: head["T"], meter, unit, key, notes };
}
