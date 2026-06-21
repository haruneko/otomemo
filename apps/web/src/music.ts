import { Midi } from "@tonejs/midi";
import { Chord as TonalChord, Note as TonalNote } from "tonal";

// 音楽的中身（docs/design.md #16）。pitch は C基準のMIDI番号、start/dur は拍。
export interface Note {
  pitch: number;
  start: number;
  dur: number;
  vel?: number;
  syllable?: string; // 歌詞の音節割当（design #16）。今はデータ枠のみ。
  drum?: boolean; // GMドラム＝打楽器シンセで鳴らす（melodic synthだと低すぎて聞こえない）
  program?: number; // #section音色: 合成再生で子(パート)ごとの GM音色を保つ（compositeNotesが付与）
}

const CHORD_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface MelodyContent {
  notes: Note[];
}

export function notesOf(content: unknown): Note[] {
  if (content && typeof content === "object" && Array.isArray((content as MelodyContent).notes)) {
    return (content as MelodyContent).notes;
  }
  return [];
}

// C基準保存（design #16）。再生/書き出し時に実調へ移調する（key=ピッチクラス 0=C..11=B）。
export function transpose(notes: Note[], semitones: number): Note[] {
  if (!semitones) return notes;
  return notes.map((n) => ({ ...n, pitch: n.pitch + semitones }));
}

// --- コード（chord / chord_progression）。C基準で記号保存し、再生時に音符へ展開＋移調 ---
export interface ChordEntry {
  root: number; // 0–11 ピッチクラス（C基準、design #16）
  quality: string; // ""(major) / "m" / "7" / "maj7" / "m7" / "dim" ...
  start: number; // 拍
  dur: number; // 拍
}

export function chordsOf(content: unknown): ChordEntry[] {
  const c = content as { chords?: unknown } | null;
  if (!c || !Array.isArray(c.chords)) return [];
  // 旧データ（root が "C".."B" 文字列）を 0–11 へ移行
  return (c.chords as { root: number | string; quality?: string; start: number; dur: number }[]).map(
    (ch) => ({
      root: typeof ch.root === "number" ? ch.root : Math.max(0, CHORD_NAMES.indexOf(ch.root)),
      quality: ch.quality ?? "",
      start: ch.start,
      dur: ch.dur,
    }),
  );
}

// コード記号（例 "Cm7"）→ midi 番号（octave 基準・昇順に積む）
export function chordToMidi(sym: string, octave = 4): number[] {
  const pcs = TonalChord.get(sym).notes;
  let oct = octave;
  let prev = -Infinity;
  const out: number[] = [];
  for (const pc of pcs) {
    let m = TonalNote.midi(`${pc}${oct}`);
    if (m == null) continue;
    if (m <= prev) {
      oct += 1;
      m = TonalNote.midi(`${pc}${oct}`);
      if (m == null) continue;
    }
    prev = m;
    out.push(m);
  }
  return out;
}

// コード列を、各コードの start/dur に重ねたノート列へ（再生/MIDIはメロと同じ経路）
export function chordsToNotes(chords: ChordEntry[]): Note[] {
  return chords.flatMap((c) =>
    chordToMidi((CHORD_NAMES[c.root] ?? "C") + c.quality).map((pitch) => ({
      pitch,
      start: c.start,
      dur: c.dur,
    })),
  );
}

// --- リズム（rhythm）。GMドラムのステップグリッド。1ステップ=16分音符（拍=step/4） ---
export interface RhythmLane {
  name: string;
  midi: number; // GMドラム番号（移調しない）
  hits: number[]; // ステップindex（0..steps-1）
  vel?: number; // #84 S4 レーン既定ベロシティ(0..127)。未指定は DRUM_VEL の GM 既定
}

// #84 S4 GMドラム別の既定ベロシティ。ハイハットは打数が多く煩いので控えめ＝音量バランス。
// lane.vel 未指定の既存リズムネタにもこれが効く（再生成不要で一括適正化）。
export const DRUM_VEL: Record<number, number> = {
  36: 115, // Kick
  38: 105, // Snare
  39: 100, // Clap
  42: 55, // HiHat（控えめ）
  44: 50, // Pedal HiHat
  45: 100, // Tom
  46: 70, // OpenHat
};
export const drumVel = (midi: number, vel?: number): number =>
  vel ?? DRUM_VEL[midi] ?? 100;
export interface RhythmContent {
  steps: number;
  lanes: RhythmLane[];
}

export const DRUMS: { name: string; midi: number }[] = [
  { name: "Kick", midi: 36 },
  { name: "Snare", midi: 38 },
  { name: "HiHat", midi: 42 },
  { name: "OpenHat", midi: 46 },
  { name: "Clap", midi: 39 },
  { name: "Tom", midi: 45 },
];

export function rhythmOf(content: unknown): RhythmContent {
  const r = (content as { rhythm?: RhythmContent } | null)?.rhythm;
  if (r && Array.isArray(r.lanes)) return r;
  return { steps: 16, lanes: DRUMS.map((d) => ({ ...d, hits: [] })) };
}

export function rhythmToNotes(r: RhythmContent): Note[] {
  return r.lanes.flatMap((l) =>
    l.hits.map((step) => ({
      pitch: l.midi,
      start: step / 4,
      dur: 0.25,
      drum: true,
      vel: drumVel(l.midi, l.vel), // #84 S4 レーン/GM既定ベロシティ
    })),
  );
}

// --- ベース kind の相対モード（#bass S2, design「ベース kind=bass・2モード」） ---
// 度数をコードに当てて再生時に解決する依存型コンテンツ。worker の bass.py と同じ契約を移植。
export type BassDegree = "R" | "3" | "5" | "7" | "8" | "approach";
export interface BassStep {
  step: number; // ステップindex（1step=16分=0.25拍）
  degree: BassDegree;
  dur: number; // step 数
}
export interface RelativeBassContent {
  mode: "relative";
  steps: number;
  pattern: BassStep[];
  preview_chords?: ChordEntry[]; // 単体プレビュー用の任意コード列（無ければ key の tonic）
  program?: number;
}

const BASS_FLOOR = 28; // E1（エレキ4弦ベースの最低音）
const BASS_STEP_TO_BEAT = 0.25; // 1step=16分=0.25拍

// コード品質 → ルートからの半音インターバル（worker theory.QUALITY_INTERVALS と一致）。
const QUALITY_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
};
const DEGREE_CHORD_INDEX: Record<string, number> = { "3": 1, "5": 2, "7": 3 };

// ピッチクラス(0-11)を最低オクターブ帯 E1..D#2(28..39) の代表音 MIDI へ。
// band(pc)=28+((pc-4) mod 12)。E(4)→28（床）, C(0)→36, G(7)→31。
export function band(pc: number): number {
  return BASS_FLOOR + (((Math.round(pc) - 4) % 12) + 12) % 12;
}

export function isRelativeBass(content: unknown): content is RelativeBassContent {
  return (
    !!content &&
    typeof content === "object" &&
    (content as { mode?: unknown }).mode === "relative" &&
    Array.isArray((content as { pattern?: unknown }).pattern)
  );
}

function bassChordAt(t: number, chords: ChordEntry[]): ChordEntry | null {
  for (const c of chords) if (c.start <= t && t < c.start + c.dur) return c;
  return null;
}

// 度数→**ルートからの音程(半音・上向き)**。R=0, 8=12, 3/5/7=コードの音程(quality依存)。
// ＝度数はルートから上に積む（5度がルートより下にならない）。worker bass._degree_interval と同契約。
function degreeInterval(degree: string, quality: string): number {
  if (degree === "R") return 0;
  if (degree === "8") return 12;
  const idx = DEGREE_CHORD_INDEX[degree];
  if (idx === undefined) return 0; // 未知度数はルート扱い（安全）
  const ivals = QUALITY_INTERVALS[quality] ?? [0, 4, 7];
  if (idx < ivals.length) return ivals[idx]!;
  if (degree === "7") return 10; // トライアドに7度が無い → 短7度を既定
  return 0;
}

// approach 用：歩くベースが向かう「次の解決ルート」pc（次のコードチェンジ優先）。
function nextRootPc(entries: BassStep[], i: number, chords: ChordEntry[], key: number): number {
  const t = entries[i]!.step * BASS_STEP_TO_BEAT;
  const cur = bassChordAt(t, chords);
  const curRoot = cur ? ((cur.root % 12) + 12) % 12 : ((key % 12) + 12) % 12;
  for (const c of [...chords].sort((a, b) => a.start - b.start)) {
    const r = ((c.root % 12) + 12) % 12;
    if (c.start > t && r !== curRoot) return r;
  }
  if (i + 1 < entries.length) {
    const nc = bassChordAt(entries[i + 1]!.step * BASS_STEP_TO_BEAT, chords);
    if (nc) return ((nc.root % 12) + 12) % 12;
  }
  return curRoot;
}

// 相対ベースの pattern をコード(or key の tonic)に当てて実音高 notes へ解決（worker と同契約）。
// chords が空なら key の tonic を I コードとみなす（単体プレビュー）。床(28)未満は出さない。
export function resolveRelativeBass(
  pattern: BassStep[],
  chords: ChordEntry[] = [],
  key = 0,
): Note[] {
  if (!pattern?.length) return [];
  const k = ((key % 12) + 12) % 12;
  const entries = [...pattern].sort((a, b) => a.step - b.step);
  const notes: Note[] = [];
  let prevPitch: number | null = null;
  entries.forEach((e, i) => {
    const start = Math.round(e.step * BASS_STEP_TO_BEAT * 1000) / 1000;
    const dur = Math.round((e.dur ?? 1) * BASS_STEP_TO_BEAT * 1000) / 1000;
    const ch = bassChordAt(start, chords);
    const root = ch ? ((ch.root % 12) + 12) % 12 : k;
    const quality = ch ? ch.quality : "";
    const rootPitch = band(root); // ルート音を E1..D#2 帯へ（帯はルートの置き場）
    let pitch: number;
    if (e.degree === "approach") {
      const target = band(nextRootPc(entries, i, chords, k));
      const up = target + 1;
      const down = target - 1;
      const ref = prevPitch ?? target;
      pitch = Math.abs(up - ref) <= Math.abs(down - ref) ? up : down;
    } else {
      // 度数はルートから上に積む（5度=root+7 等。5度がルートより下にならない）
      pitch = rootPitch + degreeInterval(e.degree, quality);
    }
    while (pitch < BASS_FLOOR) pitch += 12; // 床(28)より下は出さない（approach 救済）
    notes.push({ pitch, start, dur });
    prevPitch = pitch;
  });
  return notes;
}

// neta の種類別に content をノート列へ（合成再生で使う共通変換）
// 単独再生・試聴できる音楽 kind（定数ドリフト防止のため1か所に集約）。
export const MUSIC_KINDS = ["melody", "bass", "chord", "chord_progression", "rhythm"];

// 相対bass の解決文脈。section ではコードレーンの chords、単体では neta の key/preview_chords。
export interface BassContext {
  key?: number;
  chords?: ChordEntry[];
}

export function notesForContent(kind: string, content: unknown, ctx?: BassContext): Note[] {
  if (kind === "bass" && isRelativeBass(content)) {
    // 相対モード：コードに当てて実音高へ解決。chords が無ければ preview_chords→key の tonic。
    const chords = ctx?.chords ?? content.preview_chords ?? [];
    return resolveRelativeBass(content.pattern, chords, ctx?.key ?? 0);
  }
  // bass 絶対モードは melody と同型(notes)。
  if (kind === "melody" || kind === "bass") return notesOf(content);
  if (kind === "chord" || kind === "chord_progression") return chordsToNotes(chordsOf(content));
  if (kind === "rhythm") return rhythmToNotes(rhythmOf(content));
  return [];
}

// 合成（section/song）：子を section の調へ移調（rhythm除く）＋位置オフセット。
// SectionEditor と ネタ帳カードの section再生(#73) で共有。
export interface CompositeChild {
  position: number;
  node: { neta: { kind: string; content: unknown } };
}
export function compositeNotes(children: CompositeChild[], keyPc: number): Note[] {
  // #bass S2: 相対bass の子は section のコードレーンに当てて解決する（コードが無ければ key）。
  // コードを section 位置・調へ展開（chord kind は C基準保存なので keyPc を足す）。
  const sectionChords: ChordEntry[] = children.flatMap((c) => {
    const k = c.node.neta.kind;
    if (k !== "chord" && k !== "chord_progression") return [];
    return chordsOf(c.node.neta.content).map((ch) => ({
      ...ch,
      root: ((ch.root + keyPc) % 12 + 12) % 12,
      start: ch.start + c.position,
    }));
  });
  return children.flatMap((c) => {
    const kind = c.node.neta.kind;
    const isRhythm = kind === "rhythm";
    // パートの音色（GM program）を各音に持たせ、合成再生で子ごとの音色を保つ。bass は既定フィンガーベース。
    const prog = isRhythm ? undefined : (programOf(c.node.neta.content) ?? (kind === "bass" ? 33 : 0));
    if (kind === "bass" && isRelativeBass(c.node.neta.content)) {
      // 相対bass：section の調・コードで解決済み実音高なので、ここでは移調しない（position だけ）。
      const chords = sectionChords.map((ch) => ({ ...ch, start: ch.start - c.position }));
      return notesForContent(kind, c.node.neta.content, { key: keyPc, chords }).map((n) => ({
        ...n,
        start: n.start + c.position,
        program: prog,
      }));
    }
    return notesForContent(kind, c.node.neta.content).map((n) => ({
      ...n,
      pitch: isRhythm ? n.pitch : n.pitch + keyPc,
      start: n.start + c.position,
      program: prog,
    }));
  });
}

function meterPair(meter?: string | null): [number, number] | null {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return n > 0 && d > 0 ? [n, d] : null;
}

// #47: GM音色。content.program(0-127) を MIDI トラックの楽器に反映＝書き出しが実音色に一致。
export const GM_INSTRUMENTS: { value: number; label: string }[] = [
  { value: 0, label: "ピアノ" },
  { value: 4, label: "エレピ" },
  { value: 24, label: "ナイロンギター" },
  { value: 26, label: "ジャズギター" },
  { value: 30, label: "ディストーションギター" },
  { value: 32, label: "アコースティックベース" },
  { value: 33, label: "フィンガーベース" },
  { value: 38, label: "シンセベース" },
  { value: 48, label: "ストリングス" },
  { value: 56, label: "トランペット" },
  { value: 65, label: "アルトサックス" },
  { value: 73, label: "フルート" },
  { value: 80, label: "シンセリード" },
  { value: 88, label: "シンセパッド" },
];

export function programOf(content: unknown): number | undefined {
  if (content && typeof content === "object" && "program" in content) {
    const p = (content as { program?: unknown }).program;
    if (typeof p === "number") return p;
  }
  return undefined;
}

export function notesToMidi(
  notes: Note[],
  bpm = 120,
  meter?: string | null,
  program?: number,
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ts = meterPair(meter); // #51: 拍子記号をMIDIヘッダへ（音価は秒絶対なので不変）
  if (ts) midi.header.timeSignatures.push({ ticks: 0, timeSignature: ts });
  const track = midi.addTrack();
  if (notes.some((n) => n.drum)) track.channel = 9; // GMドラム=ch10
  else if (program !== undefined) track.instrument.number = program;
  const spb = 60 / bpm;
  for (const n of notes) {
    track.addNote({
      midi: n.pitch,
      time: n.start * spb,
      duration: n.dur * spb,
      velocity: (n.vel ?? 100) / 127,
    });
  }
  return midi.toArray();
}

// #55 多トラック書出：レーン(メロ/コード/ベース/リズム)を別トラックに分けて1ファイルへ。
// DAW で開くとトラックが分かれる。drum トラックは ch10。
export interface MidiTrackSpec {
  notes: Note[];
  program?: number;
  drum?: boolean;
  name?: string;
}
export function tracksToMidi(tracks: MidiTrackSpec[], bpm = 120, meter?: string | null): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ts = meterPair(meter);
  if (ts) midi.header.timeSignatures.push({ ticks: 0, timeSignature: ts });
  const spb = 60 / bpm;
  for (const t of tracks) {
    if (!t.notes.length) continue;
    const track = midi.addTrack();
    if (t.name) track.name = t.name;
    if (t.drum) track.channel = 9;
    else if (t.program !== undefined) track.instrument.number = t.program;
    for (const n of t.notes) {
      track.addNote({ midi: n.pitch, time: n.start * spb, duration: n.dur * spb, velocity: (n.vel ?? 100) / 127 });
    }
  }
  return midi.toArray();
}

export function downloadMultitrackMidi(
  tracks: MidiTrackSpec[],
  filename = "section.mid",
  bpm = 120,
  meter?: string | null,
): void {
  const blob = new Blob([tracksToMidi(tracks, bpm, meter) as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function midiToNotes(buf: ArrayBuffer | Uint8Array): { notes: Note[]; bpm: number } {
  const midi = new Midi(buf as ArrayBuffer);
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const spb = 60 / bpm;
  const all = midi.tracks.flatMap((t) => t.notes);
  const minTime = all.length ? Math.min(...all.map((n) => n.time)) : 0;
  const notes: Note[] = all
    .map((n) => ({
      pitch: n.midi,
      start: (n.time - minTime) / spb,
      dur: n.duration / spb,
      vel: Math.round(n.velocity * 127),
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  return { notes, bpm };
}

export function downloadMidi(
  notes: Note[],
  filename = "sketch.mid",
  bpm = 120,
  meter?: string | null,
  program?: number,
): void {
  const blob = new Blob([notesToMidi(notes, bpm, meter, program) as BlobPart], {
    type: "audio/midi",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 再生スケジュールの純関数（Tone非依存・テスト可能, #57/#58 ①）---
// ドラムは pitch<=41=膜シンセ(固定長0.15)/他=ノイズ(0.05)、メロ/コードはPolySynth。
export type Voice = "membrane" | "noise" | "poly";

export interface ScheduledNote {
  time: number; // Transport 上の発音時刻（秒, beat=四分=1.0基準）
  durSec: number; // 発音長（秒）。膜=0.15 / ノイズ=0.05 / poly=n.dur*spb
  voice: Voice;
  pitch: number;
  vel: number; // 0..1
  program?: number; // #section音色: per-note の GM音色（合成再生でパート毎に切替）
}

const MEMBRANE_DUR = 0.15;
const NOISE_DUR = 0.05;

/** notes を Transport 上の発音イベント列へ（純粋・現キット定数を踏襲）。 */
export function scheduleTimes(notes: Note[], bpm = 120): ScheduledNote[] {
  const spb = 60 / bpm;
  return notes.map((n) => {
    const time = n.start * spb;
    const vel = (n.vel ?? 100) / 127;
    if (n.drum) {
      const voice: Voice = n.pitch <= 41 ? "membrane" : "noise";
      return { time, durSec: voice === "membrane" ? MEMBRANE_DUR : NOISE_DUR, voice, pitch: n.pitch, vel };
    }
    return { time, durSec: n.dur * spb, voice: "poly", pitch: n.pitch, vel, program: n.program };
  });
}

/** 全体の尺（秒）＝最後の発音の終わりまで。終端 scheduleOnce 用。 */
export function totalSec(notes: Note[], bpm = 120): number {
  const spb = 60 / bpm;
  let end = 0;
  for (const n of notes) {
    // ドラムは長さ0だが音は鳴る。ショット再生でこの終端=stopなので、最後の打の開始ちょうどだと
    // 発火前に止まり最後の音(例:最後の16分)が消える。発音長(膜/ノイズ・scheduleTimesと同値)を尾に足す。
    const tail = n.drum ? (n.pitch <= 41 ? MEMBRANE_DUR : NOISE_DUR) : n.dur * spb;
    end = Math.max(end, n.start * spb + tail);
  }
  return end;
}

/** ループ区間（秒）。未指定は 0〜全尺。 */
export function loopRange(
  notes: Note[],
  bpm: number,
  loop?: { startBeat: number; endBeat: number },
): { start: number; end: number } {
  const spb = 60 / bpm;
  if (loop) return { start: loop.startBeat * spb, end: loop.endBeat * spb };
  return { start: 0, end: totalSec(notes, bpm) };
}

/** 拍位置を「小節:拍」表記へ（#59 トランスポート時間表示）。bpb=1小節の拍数。 */
export function barBeat(beat: number, bpb: number): string {
  if (bpb <= 0) return "1:1";
  const b = Math.max(0, beat);
  const bar = Math.floor(b / bpb) + 1;
  const inBar = Math.floor(b % bpb) + 1;
  return `${bar}:${inBar}`;
}

export interface PlaybackHandle {
  pause(): void;
  resume(): void;
  stop(): void;
}

interface PlayOpts {
  loop?: { startBeat: number; endBeat: number };
  onEnd?: () => void;
  program?: number; // #55c SF2旋律の音色（GM program）。未指定は0（ピアノ）。
}

// 単一再生：グローバル Transport を奪い合うので、現在の音源を1組だけ保持し再利用/破棄。
type Kit = { poly: any; membrane: any; noise: any };
let currentKit: Kit | null = null;

// 再生の診断ログ。localStorage 'cm.debugAudio'='1' か window.__cmAudioDebug で有効（既定OFF）。
function audioDbgOn(): boolean {
  try {
    return (
      (globalThis as any).__cmAudioDebug === true ||
      globalThis.localStorage?.getItem("cm.debugAudio") === "1"
    );
  } catch {
    return false;
  }
}
function dbg(...args: unknown[]): void {
  if (audioDbgOn()) console.log("[CMAUDIO]", ...args);
}

// 1音の発音ディスパッチ（テスト可能に切り出し）。
// ドラム: SF2にマッチ楽器があればそれ、無ければ簡易キット(membrane/noise)。
// 旋律: SF2があればそれ、無ければ poly シンセ。SF2 は absolute time(秒)・velocity 0..127。
export function playEvent(
  ev: ScheduledNote,
  time: number,
  sf: any,
  kit: Kit,
  Tone: any,
  drumKits?: Map<number, DrumVoice>,
  melodicByProg?: Map<number, any>, // #section音色: program毎の旋律 sampler（無ければ sf）
  defaultProg = 0,
): void {
  if (ev.voice === "membrane" || ev.voice === "noise") {
    const ds = drumKits?.get(ev.pitch);
    if (ds) {
      dbg("note pitch", ev.pitch, "via sf2-drum @", ds.note, "detune", ds.detune);
      // 打楽器はワンショット＝loop を明示OFF。SF2のキック等は loop点を持ち、loop有のまま
      // duration を渡すと「1発が複数回」、duration無だと鳴り続ける。loop:false で1回だけ。
      // detune(cents)で smplr の originalPitch 基準を overridingRootKey 基準へ補正(#84 S2)。
      ds.sampler.start({
        note: ds.note,
        time,
        velocity: Math.round(ev.vel * 127),
        loop: false,
        detune: ds.detune,
        ...(ds.stopId ? { stopId: ds.stopId } : {}), // #84 S3: 同 exclusiveClass を相互チョーク
      });
    } else if (ev.voice === "membrane") {
      dbg("note pitch", ev.pitch, "via kit.membrane");
      kit.membrane.triggerAttackRelease(Tone.Frequency(ev.pitch, "midi").toFrequency(), ev.durSec, time, ev.vel);
    } else {
      dbg("note pitch", ev.pitch, "via kit.noise");
      kit.noise.triggerAttackRelease(ev.durSec, time, ev.vel);
    }
  } else if (sf) {
    // #section音色: この音の program に対応する旋律 sampler（無ければ既定 sf）
    const inst = melodicByProg?.get(ev.program ?? defaultProg) ?? sf;
    dbg("note pitch", ev.pitch, "via sf2-melodic prog", ev.program ?? defaultProg);
    inst.start({ note: ev.pitch, time, duration: ev.durSec, velocity: Math.round(ev.vel * 127) });
  } else {
    // SF2 未ロード時の純シンセ・フォールバック（後退ゼロ＝必ず鳴る）。診断ログを出して
    // 「フォールバックでも送る音高は入力と一致」を SF2 非依存に検証可能にする（#103）。
    dbg("note pitch", ev.pitch, "via poly-fallback");
    kit.poly.triggerAttackRelease(Tone.Frequency(ev.pitch, "midi").toNote(), ev.durSec, time, ev.vel);
  }
}

function disposeKit() {
  if (!currentKit) return;
  for (const v of [currentKit.poly, currentKit.membrane, currentKit.noise]) {
    try {
      v.dispose();
    } catch {
      /* already disposed */
    }
  }
  currentKit = null;
}

// #55a/#55b SF2実再生（smplr）。選択中SoundFontのURLを外から設定。null/失敗時は簡易シンセに
// フォールバック（後退ゼロ）。Tone と AudioContext を共有して Transport.seconds と同期。
let activeSfUrl: string | null = null;
let sfSampler: any = null; // 旋律用（1楽器ロード済み）
let sfLoadedUrl: string | null = null;
let sfLoading = false;
let sfLastError: string | null = null; // #55a 診断用：直近のロード失敗理由
let sfInstrumentCount = 0;
let sfInstrumentNames: string[] = []; // #55b ドラム楽器名の探索に使う
let sfCurrentInstrument: string | null = null; // #55c 旋律samplerに現在ロード済みの楽器名
// パース済みSF2を url で共有（旋律＋各ドラムsamplerが再パースしないように）。
let sfParsed: any = null;
let sfParsedUrl: string | null = null;
// #55b ドラムは GM 統合キットが無いため、GM番号→楽器名で個別samplerをロードしキャッシュ。
const sfDrumCache = new Map<string, any>(); // 楽器名 → drum sampler
let sfCtx: any = null; // 共有 AudioContext（Tone.rawContext）
let sfGmDrumMap: Map<number, string> | null = null; // #55e bank128/preset0 の権威 GM ドラムマップ

function resetSfCaches(): void {
  sfSampler = null;
  sfLoadedUrl = null;
  sfLastError = null;
  sfInstrumentCount = 0;
  sfInstrumentNames = [];
  sfCurrentInstrument = null;
  sfGmDrumMap = null;
  sfParsed = null;
  sfParsedUrl = null;
  sfDrumCache.clear();
  sfMelodicCache.clear(); // #section音色: program毎の旋律samplerもSF2変更で破棄
  prewarmDone = false; // SF2が変わったら先読みもやり直し
}

const presetBank = (p: any): number => p?.header?.bank ?? p?.bank ?? 0;
const presetNum = (p: any): number => p?.header?.preset ?? p?.preset ?? 0;
const presetName = (p: any): string | undefined => p?.header?.name ?? p?.name;

// #55c GM program(0-127) → SF2 旋律楽器名。bank0/preset=program のプリセットが参照する
// instrument 名を返す（instrumentNames に在るもの）。無ければ null。
function gmInstrumentName(program: number): string | null {
  const presets: any[] = sfParsed?.presets ?? [];
  const p = presets.find((x) => presetBank(x) === 0 && presetNum(x) === program);
  if (!p) return null;
  // プリセット名が instrument 名と一致すればそれ（GeneralUser GS等は概ね一致）。
  const pn = presetName(p);
  if (pn && sfInstrumentNames.includes(pn)) return pn;
  // でなければ zone が参照する instrument 名（最初の非グローバル）。
  for (const z of p.zones ?? []) {
    const inm = z?.instrument?.header?.name;
    if (inm && sfInstrumentNames.includes(inm)) return inm;
  }
  return null;
}

// program → 旋律楽器名。program楽器が無ければ非ドラムの先頭へフォールバック。
function melodicInstrumentName(program: number): string | undefined {
  return (
    gmInstrumentName(program) ??
    sfInstrumentNames.find((n) => !/drum|perc|kit|standard|room|power|jazz|brush|orch/i.test(n)) ??
    sfInstrumentNames[0]
  );
}
// 既定の旋律 sampler(sfSampler)に program 相当の楽器をロード（切替時のみ・global guard）。
async function setMelodicInstrument(sampler: any, program: number): Promise<void> {
  const want = melodicInstrumentName(program);
  if (want && want !== sfCurrentInstrument) {
    await sampler.loadInstrument(want);
    sfCurrentInstrument = want;
    dbg("melodic instrument <-", want, "(program", program, ")");
  }
}

// #section音色: 合成再生で**パート毎(program毎)の旋律 sampler** を用意。
// 既定 program は sfSampler を再利用、他は program 専用 sampler を作りキャッシュ（ドラムcacheと同方式）。
const sfMelodicCache = new Map<number, any>(); // program → 旋律 sampler
async function prepareMelodicSamplers(
  notes: Note[],
  Tone: any,
  defaultProg: number,
  sf: any,
): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  if (!sf || !activeSfUrl) return map;
  const progs = new Set<number>();
  for (const n of notes) if (!n.drum) progs.add(n.program ?? defaultProg);
  for (const prog of progs) {
    if (prog === defaultProg) {
      map.set(prog, sf); // 既定は ensureSoundFont 済みの sfSampler
      continue;
    }
    let s = sfMelodicCache.get(prog);
    if (!s) {
      try {
        s = await makeSampler(activeSfUrl, Tone);
        await s.ready;
        const want = melodicInstrumentName(prog);
        if (want) await s.loadInstrument(want);
        sfMelodicCache.set(prog, s);
      } catch (e) {
        dbg("melodic sampler load failed program", prog, e);
        continue; // 失敗した program は既定sfにフォールバック
      }
    }
    map.set(prog, s);
  }
  return map;
}

export function setActiveSoundFont(url: string | null): void {
  if (url !== activeSfUrl) {
    activeSfUrl = url;
    resetSfCaches();
  }
}

// soundfont2 のUMD/ESM差を吸収（named/default どちらでも SoundFont2 クラスを取り出す）。
function resolveSF2Ctor(mod: any): any {
  return mod?.SoundFont2 ?? mod?.default?.SoundFont2 ?? mod?.default ?? mod;
}

// SF2 を1個生成。createSoundfont は url 単位でパース結果をキャッシュ＝再パースしない。
async function makeSampler(url: string, Tone: any): Promise<any> {
  const [smplr, sf2mod] = await Promise.all([import("smplr"), import("soundfont2")]);
  const Soundfont2 = (smplr as any).Soundfont2;
  const SoundFont2 = resolveSF2Ctor(sf2mod);
  sfCtx = Tone.getContext().rawContext;
  return Soundfont2(sfCtx, {
    url,
    createSoundfont: (data: Uint8Array) => {
      if (sfParsedUrl === url && sfParsed) return sfParsed;
      sfParsed = new SoundFont2(data);
      sfParsedUrl = url;
      return sfParsed;
    },
  });
}

async function ensureSoundFont(Tone: any, program = 0): Promise<any | null> {
  const url = activeSfUrl;
  if (!url) return null;
  // 未ロードならロード（ロード中は今回フォールバック＝次回から鳴る）。
  if (!(sfLoadedUrl === url && sfSampler)) {
    if (sfLoading) return null;
    sfLoading = true;
    try {
      const sampler = await makeSampler(url, Tone);
      await sampler.ready;
      sfInstrumentNames = sampler.instrumentNames ?? [];
      sfInstrumentCount = sfInstrumentNames.length;
      sfCurrentInstrument = null;
      sfSampler = sampler;
      sfLoadedUrl = url;
      sfLastError = null;
    } catch (e) {
      sfLastError = e instanceof Error ? e.message || String(e) : String(e);
      console.error("[SoundFont] load failed:", e);
      sfSampler = null;
      sfLoadedUrl = null;
      return null;
    } finally {
      sfLoading = false;
    }
  }
  // ネタの音色(program)に合わせて旋律楽器を切替（毎回・差分のみ実ロード）。
  if (sfSampler) {
    try {
      await setMelodicInstrument(sfSampler, program);
    } catch (e) {
      console.error("[SoundFont] instrument switch failed:", e);
    }
  }
  return sfSampler;
}

// #55e 権威 GM ドラムマップ：SF2 の bank128/preset0("Standard"キット)のゾーンから
// GM番号→楽器名 を引く。プリセットzoneに明示keyRangeがあればそれ(kick36→Standard Kick3等)、
// 無ければそのzone楽器の内部ゾーンがその番号を含むか(Hi-Hats=42/46, Toms=41-50 等)。
function krOfZone(z: any): { lo: number; hi: number } | undefined {
  return z?.keyRange ?? z?.generators?.["43"]?.range;
}
function buildGmDrumMap(): Map<number, string> {
  const map = new Map<number, string>();
  const presets: any[] = sfParsed?.presets ?? [];
  const std = presets.find((p) => presetBank(p) === 128 && presetNum(p) === 0);
  if (!std) return map;
  const instCovers = (inst: any, k: number) =>
    (inst?.zones ?? []).some((iz: any) => {
      const r = krOfZone(iz);
      return r && k >= r.lo && k <= r.hi;
    });
  for (let k = 27; k <= 87; k++) {
    for (const z of std.zones ?? []) {
      const inm = z.instrument?.header?.name;
      if (!inm) continue;
      const pkr = krOfZone(z);
      if (pkr ? k >= pkr.lo && k <= pkr.hi : instCovers(z.instrument, k)) {
        map.set(k, inm);
        break;
      }
    }
  }
  return map;
}

// GM打楽器番号 → SF2楽器名。
// #55f バスドラ(35/36)・スネア(38/40)は**ヒューリスティック優先**（前バージョンの音色が好評。
//   権威マップだと Standard Kick 3@38 になり評価が下がったため、Standard Kick 1@root を維持）。
// それ以外(hihat/tom/crash/ride/perc 等)は **権威マップ(Standardキット)優先**。
export function drumNameFor(pitch: number, names: string[]): string | null {
  const kickOrSnare = pitch <= 36 || pitch === 38 || pitch === 40;
  if (!kickOrSnare && sfParsed) {
    if (!sfGmDrumMap) sfGmDrumMap = buildGmDrumMap();
    const fromKit = sfGmDrumMap.get(pitch);
    if (fromKit && names.includes(fromKit)) return fromKit;
  }
  let res: RegExp[];
  if (pitch <= 36) res = [/standard kick/i, /\bkick\b/i, /bass drum/i];
  else if (pitch === 37) res = [/rim ?shot/i, /side ?stick/i, /snare/i];
  else if (pitch === 40) res = [/standard snare 2/i, /electric snare/i, /snare/i];
  else if (pitch === 38) res = [/standard snare 1/i, /standard snare/i, /snare/i];
  else if (pitch === 39) res = [/hand ?clap/i, /clap/i, /snare/i];
  else if ([41, 43, 45, 47, 48, 50].includes(pitch)) res = [/standard tom/i, /\btom/i];
  else if (pitch === 42 || pitch === 44) res = [/hi-?hat/i];
  else if (pitch === 46) res = [/open.*hi-?hat/i, /hi-?hat/i];
  else if (pitch === 49 || pitch === 57) res = [/crash cymbal/i, /^crash/i, /splash/i];
  else if (pitch === 55) res = [/splash/i, /crash cymbal/i];
  else if (pitch === 52) res = [/china|reverse/i, /crash cymbal/i];
  else if (pitch === 53) res = [/ride bell/i, /ride/i];
  else if (pitch === 51 || pitch === 59) res = [/ride cymbal/i, /ride/i];
  else if (pitch === 56) res = [/cow ?bell/i];
  else if (pitch === 54) res = [/tambourine/i];
  else res = [/perc/i, /drum/i];
  for (const re of res) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return null;
}

// #84 S2 ピッチ補正の純計算。smplr は region.pitch=originalPitch で鳴らす（overridingRootKey
// を無視）→ keyRangeゾーンのドラム(hihat/tom)を GM note で叩くと (note-originalPitch) ぶんズレる。
// 実効ピッチをキット意図(=root基準＋tune)に合わせる detune(cents)を返す:
//   effective = (note - originalPitch)*100 + detune  を (note - root)*100 + tune にしたい
//   → detune = (originalPitch - root)*100 + tune
export function drumDetune(
  originalPitch: number,
  root: number,
  coarseTune = 0,
  fineTune = 0,
): number {
  return (originalPitch - root) * 100 + coarseTune * 100 + fineTune;
}

function zoneGen(zone: any, id: number): number | undefined {
  const g = zone?.generators?.[String(id)];
  return g && typeof g.value === "number" ? g.value : undefined;
}

// ドラムGM番号 → {鳴らすnote, detune, stopId}。
// keyRangeゾーン(hihat閉42/開46, tom各キー 等)＝GM noteで叩き detune でキット意図ピッチへ補正。
// keyRange無し(kick/snare＝単一/velocity層)＝原音高で自然に（現挙動維持）。
// stopId: exclusiveClass(57) があれば同群を相互チョーク（オープンHHをクローズHHが止める #84 S3）。
function drumVoiceFor(
  name: string,
  gmPitch: number,
): { note: number; detune: number; stopId?: string } {
  const insts: any[] = sfParsed?.instruments ?? [];
  const inst = insts.find((i) => (i.header?.name ?? i.name) === name);
  const zones: any[] = inst?.zones ?? [];
  const kz = zones.find((z) => z?.keyRange && gmPitch >= z.keyRange.lo && gmPitch <= z.keyRange.hi);
  const exclusiveOf = (z: any): string | undefined => {
    const ec = zoneGen(z, 57);
    return ec ? `excl-${ec}` : undefined; // 同 exclusiveClass は同 stopId＝新打が前を止める
  };
  if (kz) {
    const op = kz.sample?.header?.originalPitch ?? 60;
    const root = zoneGen(kz, 58) ?? op; // overridingRootKey
    return {
      note: gmPitch,
      detune: drumDetune(op, root, zoneGen(kz, 51) ?? 0, zoneGen(kz, 52) ?? 0),
      stopId: exclusiveOf(kz),
    };
  }
  const z0 = zones.find((z) => z?.sample) ?? zones[0];
  const op = z0?.sample?.header?.originalPitch ?? 60;
  return { note: op, detune: 0, stopId: exclusiveOf(z0) };
}

// ドラム1種をロード（楽器名キャッシュ）。失敗時 null＝その音は簡易キットにフォールバック。
async function loadDrumSampler(name: string, Tone: any): Promise<any | null> {
  if (!activeSfUrl) return null;
  if (sfDrumCache.has(name)) return sfDrumCache.get(name);
  try {
    const s = await makeSampler(activeSfUrl, Tone);
    await s.ready;
    await s.loadInstrument(name);
    sfDrumCache.set(name, s);
    return s;
  } catch (e) {
    console.error("[SoundFont] drum load failed:", name, e);
    return null;
  }
}

export type DrumVoice = { sampler: any; note: number; detune: number; stopId?: string };

// 再生に出てくるドラム音(pitch)→ {sampler, 鳴らすnote}。ドラムは原音高で鳴らすと自然。
// トムだけ音程差が要るので root を中心に GM番号で上下させる。
async function prepareDrumKits(notes: Note[], Tone: any): Promise<Map<number, DrumVoice>> {
  const map = new Map<number, DrumVoice>();
  if (!sfInstrumentNames.length) return map;
  const pitches = [...new Set(notes.filter((n) => n.drum).map((n) => n.pitch))];
  // #84 S0: ドラムサンプラのロードを並列化（直列awaitで初回再生が1〜2.5s重い問題を緩和）。
  const loaded = await Promise.all(
    pitches.map(async (p) => {
      const name = drumNameFor(p, sfInstrumentNames);
      if (!name) return null;
      const s = await loadDrumSampler(name, Tone);
      if (!s) return null;
      const v = drumVoiceFor(name, p); // #84 S2/S3: note＋ピッチ補正detune＋choke stopId
      return { p, name, sampler: s, note: v.note, detune: v.detune, stopId: v.stopId };
    }),
  );
  for (const r of loaded) {
    if (!r) continue;
    map.set(r.p, { sampler: r.sampler, note: r.note, detune: r.detune, stopId: r.stopId });
    dbg("drum", r.p, "->", r.name, "@note", r.note, "detune", r.detune, "stopId", r.stopId);
  }
  return map;
}

// #84 先読み：再生クリックより前（最初のユーザー操作時）に旋律＋標準ドラムを裏でロードして
// キャッシュを温める。初回再生で 885ms 待たされる問題を解消（warm は ~1ms）。
// AudioContext は呼び出し元のジェスチャ内で Tone.start 済みである必要がある。冪等。
let prewarmDone = false;
const COMMON_DRUMS = [36, 38, 42, 46, 41, 45, 48, 49, 51, 39, 37]; // kick/snare/hh/tom/crash/ride/clap/rim
export async function prewarmSoundFont(): Promise<void> {
  if (prewarmDone || !activeSfUrl) return;
  prewarmDone = true;
  try {
    const Tone = await import("tone");
    await Tone.start();
    await ensureSoundFont(Tone, 0); // 旋律(ピアノ)サンプラ
    await prepareDrumKits(
      COMMON_DRUMS.map((p) => ({ pitch: p, start: 0, dur: 0.25, drum: true })),
      Tone,
    );
    dbg("prewarm done");
  } catch {
    prewarmDone = false; // 失敗時は次の機会に再試行
  }
}

// 設定画面からの読込テスト（成功すればキャッシュも温まる）。ユーザー操作内で呼ぶこと（Tone.start）。
export async function probeSoundFont(): Promise<{
  ok: boolean;
  instruments: number;
  error: string | null;
}> {
  if (!activeSfUrl) return { ok: false, instruments: 0, error: "未選択" };
  const Tone = await import("tone");
  await Tone.start();
  const sf = await ensureSoundFont(Tone);
  return { ok: !!sf, instruments: sfInstrumentCount, error: sfLastError };
}

// Tone.js は再生時のみ動的import（jsdom/テストで読み込まない）。
// #57①: Tone.Transport ベース。戻り値 Handle で pause/resume/stop（②でUI配線）。
// 既存呼び出し元は `void playNotes(notes, tempo)` のままでも従来通り鳴る（後方互換）。
export async function playNotes(
  notes: Note[],
  bpm = 120,
  opts: PlayOpts = {},
): Promise<PlaybackHandle> {
  const Tone = await import("tone");
  await Tone.start();
  const transport = Tone.getTransport();

  // 前回再生を破棄＝単一再生（二重再生バグ解消）。未発火スケジュールも消える。
  transport.stop();
  transport.cancel(0);
  disposeKit();

  // SF2 が選択・ロード済みなら旋律はそれで鳴らす。ドラムは SF2 にマッチ楽器があればそれ、
  // 無ければ簡易キット。SF2 無しは全部キット（後退ゼロ）。
  const defaultProg = opts.program ?? 0;
  const sf = await ensureSoundFont(Tone, defaultProg);
  const drumKits = sf ? await prepareDrumKits(notes, Tone) : new Map<number, DrumVoice>();
  // #section音色: パート毎(program毎)の旋律 sampler を用意（合成再生で音色を保つ）
  const melodicByProg = sf ? await prepareMelodicSamplers(notes, Tone, defaultProg, sf) : new Map<number, any>();
  dbg(
    "playNotes engine=",
    sf ? "sf2" : "fallback-synth",
    "activeSfUrl=",
    activeSfUrl ? "set" : "null",
    "sfLastError=",
    sfLastError,
    "notes=",
    notes.length,
    "drumKits=",
    [...drumKits.keys()].join(","),
  );

  const kit: Kit = {
    poly: new Tone.PolySynth(Tone.Synth).toDestination(),
    membrane: new Tone.MembraneSynth().toDestination(),
    noise: new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).toDestination(),
  };
  currentKit = kit;

  transport.bpm.value = bpm;
  for (const ev of scheduleTimes(notes, bpm)) {
    transport.schedule(
      (time: number) => playEvent(ev, time, sf, kit, Tone, drumKits, melodicByProg, defaultProg),
      ev.time,
    );
  }

  let stopped = false;
  const handle: PlaybackHandle = {
    pause: () => {
      if (!stopped) transport.pause();
    },
    resume: () => {
      if (!stopped) transport.start();
    },
    stop: () => {
      if (stopped) return; // 冪等
      stopped = true;
      transport.stop();
      transport.cancel(0);
      transport.loop = false;
      disposeKit();
      try {
        sf?.stop(); // SF2 の鳴っている音も止める（尾を切る。サンプラ自体は再利用のため破棄しない）
        for (const s of melodicByProg.values()) s?.stop?.(); // #section音色: 各パートsamplerも止める
        for (const ds of drumKits.values()) ds.sampler?.stop?.();
      } catch {
        /* noop */
      }
    },
  };

  const range = loopRange(notes, bpm, opts.loop);
  if (opts.loop) {
    transport.loop = true;
    transport.loopStart = range.start;
    transport.loopEnd = range.end;
  } else {
    transport.loop = false;
    // 非ループ時のみ終端で自動停止。
    transport.scheduleOnce(() => {
      opts.onEnd?.();
      handle.stop();
    }, totalSec(notes, bpm));
  }

  transport.start();
  return handle;
}
