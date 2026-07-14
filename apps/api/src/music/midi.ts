// SMF(MIDI) → notes パーサ＋メロ線抽出（S6-b コーパス・ゲーム音楽/Falcom 用）。
// format 0/1 対応。note on/off を絶対tick→拍に。ch10(0始まり9)=ドラムは除外。
// メロ抽出＝skyline（各オンセットで最高音）＝多声アレンジから単旋律の輪郭を取る実用ヒューリスティック。

export interface MidiNote { pitch: number; start: number; dur: number; channel: number; track: number }
export interface ParsedMidi { division: number; notes: MidiNote[]; trackNames: string[]; timeSigs: { tick: number; meter: string }[]; programs: Record<number, number>; tempos: { tick: number; usPerQ: number }[] }

function readVarLen(b: Uint8Array, p: number): [number, number] {
  let value = 0;
  let pos = p;
  for (let i = 0; i < 4; i++) {
    const c = b[pos++]!;
    value = (value << 7) | (c & 0x7f);
    if (!(c & 0x80)) break;
  }
  return [value, pos];
}

const str4 = (b: Uint8Array, p: number) => String.fromCharCode(b[p]!, b[p + 1]!, b[p + 2]!, b[p + 3]!);
const u16 = (b: Uint8Array, p: number) => (b[p]! << 8) | b[p + 1]!;
const u32 = (b: Uint8Array, p: number) => ((b[p]! << 24) | (b[p + 1]! << 16) | (b[p + 2]! << 8) | b[p + 3]!) >>> 0;

/** SMF を全 note に展開（start/dur は拍＝四分音符=1）。 */
export function parseMidi(buf: Uint8Array): ParsedMidi {
  if (str4(buf, 0) !== "MThd") throw new Error("not a MIDI file");
  const ntrks = u16(buf, 10);
  let division = u16(buf, 12);
  if (division & 0x8000) division = 96; // SMPTE は非対応＝適当な既定
  const notes: MidiNote[] = [];
  const trackNames: string[] = [];
  const timeSigs: { tick: number; meter: string }[] = [];
  const tempos: { tick: number; usPerQ: number }[] = []; // set-tempo(0xFF 0x51) 列＝tick→秒 変換の素
  const programs: Record<number, number> = {}; // channel → GM program（最初の音色）
  let p = 14;
  for (let tr = 0; tr < ntrks && p < buf.length; tr++) {
    if (str4(buf, p) !== "MTrk") break;
    const len = u32(buf, p + 4);
    let pos = p + 8;
    const end = pos + len;
    let tick = 0;
    let status = 0;
    const active = new Map<number, { pitch: number; startTick: number; channel: number }>();
    while (pos < end) {
      const [dt, np] = readVarLen(buf, pos);
      pos = np;
      tick += dt;
      let b0 = buf[pos]!;
      if (b0 & 0x80) { status = b0; pos++; } else b0 = status; // running status
      const type = status & 0xf0;
      const ch = status & 0x0f;
      if (status === 0xff) { // meta
        const metaType = buf[pos++]!;
        const [mlen, mp] = readVarLen(buf, pos);
        if (metaType === 0x03) { // track name
          let s = "";
          for (let k = 0; k < mlen; k++) s += String.fromCharCode(buf[mp + k]!);
          trackNames[tr] = s.trim();
        } else if (metaType === 0x58 && mlen >= 2) { // time signature: num, den=2^pow
          timeSigs.push({ tick, meter: `${buf[mp]!}/${2 ** buf[mp + 1]!}` });
        } else if (metaType === 0x51 && mlen === 3) { // set tempo: μs/四分音符
          tempos.push({ tick, usPerQ: (buf[mp]! << 16) | (buf[mp + 1]! << 8) | buf[mp + 2]! });
        }
        pos = mp + mlen;
      } else if (status === 0xf0 || status === 0xf7) { // sysex
        const [slen, sp] = readVarLen(buf, pos);
        pos = sp + slen;
      } else if (type === 0x90 || type === 0x80) { // note on/off
        const pitch = buf[pos++]!;
        const vel = buf[pos++]!;
        const key = (ch << 8) | pitch;
        if (type === 0x90 && vel > 0) {
          active.set(key, { pitch, startTick: tick, channel: ch });
        } else {
          const a = active.get(key);
          if (a) {
            notes.push({
              pitch,
              start: a.startTick / division,
              dur: Math.max(1e-3, (tick - a.startTick) / division),
              channel: ch,
              track: tr,
            });
            active.delete(key);
          }
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) { pos += 2; } // 2バイトデータ
      else if (type === 0xc0) { if (programs[ch] === undefined) programs[ch] = buf[pos]!; pos += 1; } // program change（音色）
      else if (type === 0xd0) { pos += 1; } // channel pressure
      else pos++; // 不明＝1バイト進めて復帰
    }
    p = end;
  }
  notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  tempos.sort((a, b) => a.tick - b.tick);
  return { division, notes, trackNames, timeSigs, programs, tempos };
}

// tick → 秒 の変換器（テンポマップを区分線形に積分）。テンポ変化前提の POP909 で
// 「注釈 beat（秒）」と「MIDI拍（tick/division）」を突き合わせるのに使う（コーパス位相アンカーの核）。
// テンポ無し＝120BPM(500000μs/四分)既定。tick0 より前にイベントが無ければ先頭テンポを 0 まで外挿。
export function makeTickToSeconds(parsed: { division: number; tempos: { tick: number; usPerQ: number }[] }): (tick: number) => number {
  const div = parsed.division || 480;
  const evs = parsed.tempos.length ? [...parsed.tempos].sort((a, b) => a.tick - b.tick) : [{ tick: 0, usPerQ: 500000 }];
  if (evs[0]!.tick !== 0) evs.unshift({ tick: 0, usPerQ: evs[0]!.usPerQ });
  // 各テンポ区間の開始 tick における累積秒。
  const cum: { tick: number; sec: number; usPerQ: number }[] = [];
  let sec = 0;
  for (let i = 0; i < evs.length; i++) {
    if (i > 0) sec += ((evs[i]!.tick - evs[i - 1]!.tick) / div) * (evs[i - 1]!.usPerQ / 1e6);
    cum.push({ tick: evs[i]!.tick, sec, usPerQ: evs[i]!.usPerQ });
  }
  return (tick: number): number => {
    let k = 0;
    for (let i = 0; i < cum.length; i++) { if (cum[i]!.tick <= tick) k = i; else break; }
    return cum[k]!.sec + ((tick - cum[k]!.tick) / div) * (cum[k]!.usPerQ / 1e6);
  };
}

// チャンネルの最大同時発音数（和音/パッド検出用）。
function maxPolyphony(ns: MidiNote[]): number {
  const ev: [number, number][] = [];
  for (const n of ns) { ev.push([n.start, 1], [n.start + n.dur, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let mx = 0;
  for (const [, d] of ev) { cur += d; mx = Math.max(mx, cur); }
  return mx;
}

/** MIDI の拍子を1つに確定。拍子変更（異なる time sig が複数）は null＝その曲はスキップ対象。無指定は 4/4。 */
export function meterOf(parsed: ParsedMidi): string | null {
  const distinct = [...new Set(parsed.timeSigs.map((t) => t.meter))];
  if (distinct.length === 0) return "4/4"; // time sig 無し＝4/4 とみなす
  if (distinct.length > 1) return null; // 拍子変更＝切り分け不能ゆえ捨てる
  return distinct[0]!;
}

/** 名前付きトラック（POP909 の "MELODY" 等）の note だけ抽出。大小無視・部分一致。 */
export function notesOfTrackNamed(parsed: ParsedMidi, name: string): MidiNote[] {
  const want = name.toLowerCase();
  const idxs = new Set<number>();
  parsed.trackNames.forEach((n, i) => { if (n && n.toLowerCase().includes(want)) idxs.add(i); });
  return parsed.notes.filter((n) => idxs.has(n.track));
}

/** リードchを推定してメロ抽出（多声アレンジ向け）：単音性が高く・中高音域・活動量のあるchを選び、
 * そのch内を skyline で単旋律化。skyline 全ch横断より「別楽器へ飛ぶ」ノイズが減る。 */
export function leadChannelMelody(notes: MidiNote[], programs: Record<number, number> = {}): { pitch: number; start: number; dur: number }[] {
  const byCh = new Map<number, MidiNote[]>();
  for (const n of notes) {
    if (n.channel === 9 || n.pitch < 36 || n.pitch > 96) continue; // ch10=ドラム除外
    (byCh.get(n.channel) ?? byCh.set(n.channel, []).get(n.channel)!).push(n);
  }
  let bestCh = -1;
  let bestScore = -Infinity;
  for (const [ch, ns] of byCh) {
    if (ns.length < 8) continue;
    const prog = programs[ch] ?? -1; // GM program で楽器フィルタ
    if (prog >= 32 && prog <= 39) continue; // ベース(32-39)を除外
    if (prog >= 120) continue; // 効果音(120-127)を除外
    if (maxPolyphony(ns) > 2) continue; // 単音〜2音まで（和音/パッドを除外。アルペジオ=単音は通す）
    const start0 = Math.min(...ns.map((n) => n.start));
    const span = Math.max(...ns.map((n) => n.start + n.dur)) - start0;
    const conc = span > 0 ? ns.reduce((s, n) => s + n.dur, 0) / span : 9; // ≈1=持続単音/大=和音/≈0=スタッカート伴奏
    const avgPitch = ns.reduce((s, n) => s + n.pitch, 0) / ns.length;
    if (avgPitch < 58 || avgPitch > 84) continue; // 歌えない音域（ベース/極端高音）は本線でない
    const distinctPcs = new Set(ns.map((n) => n.pitch % 12)).size;
    const range = Math.max(...ns.map((n) => n.pitch)) - Math.min(...ns.map((n) => n.pitch));
    if (distinctPcs < 4 || range < 4) continue; // 音が動かない＝ペダル/オスティナート/効果音＝メロでない
    // 楽器でメロらしさを評価：Lead(80-87)最強・Brass/Reed/Pipe(56-79)/弦(40-55)はメロ寄り・Pad(88-95)は背景で減点。
    const progBonus = prog >= 80 && prog <= 87 ? 2 : prog >= 56 && prog <= 79 ? 1.5 : prog >= 40 && prog <= 55 ? 0.5 : prog >= 88 && prog <= 95 ? -1.5 : 0;
    // 本線＝**メロ楽器・持続単音(conc≈1)・歌える音域・早く始まる**を優先。活動量(音数)は過剰評価しない。
    const score =
      progBonus -
      Math.abs(conc - 1) * 1.5 - // 持続単音性
      Math.abs(avgPitch - 72) / 6 + // 歌える音域
      Math.min(ns.length, 100) / 150 - // 活動量は控えめ
      start0 / 250; // 早く始まる本線を優先
    if (score > bestScore) { bestScore = score; bestCh = ch; }
  }
  if (bestCh < 0) return skylineMelody(notes);
  return skylineMelody(byCh.get(bestCh)!); // 選んだch内の偶発的重なりは skyline で潰す
}

/** skyline メロ抽出：ch10(9)除外、各オンセット(grid量子化)で最高音を採り単旋律化。 */
export function skylineMelody(notes: MidiNote[], grid = 0.25): { pitch: number; start: number; dur: number }[] {
  const mel = notes.filter((n) => n.channel !== 9 && n.pitch >= 36 && n.pitch <= 96);
  const byOnset = new Map<number, MidiNote>();
  for (const n of mel) {
    const g = Math.round(n.start / grid) * grid;
    const cur = byOnset.get(g);
    if (!cur || n.pitch > cur.pitch) byOnset.set(g, n); // 同オンセットは最高音
  }
  return [...byOnset.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([g, n]) => ({ pitch: n.pitch, start: Math.round(g * 1000) / 1000, dur: Math.round(n.dur * 1000) / 1000 }));
}
