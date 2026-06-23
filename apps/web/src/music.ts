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
  return { steps: 32, lanes: DRUMS.map((d) => ({ ...d, hits: [] })) }; // 既定2小節（最低2小節欲しい）

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
    // つんのめり(アンティシペーション)：裏拍始まりでダウンビートを跨いで伸びる音は、跨いだ先の
    // ダウンビートのコードで相対解決する（例 2拍裏から四分→3拍目表のコード基準）。4/4ロックの押し感。
    const nextBeat = Math.floor(start + 1e-9) + 1;
    const offBeat = Math.abs(start - Math.round(start)) > 1e-9;
    const refBeat = offBeat && nextBeat < start + dur - 1e-9 ? nextBeat : start;
    const ch = bassChordAt(refBeat, chords);
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
export { MUSIC_KINDS } from "./kinds"; // SSOT＝kinds.ts（後方互換で music からも再公開）

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
  node: { neta: { kind: string; content: unknown; key?: number | null }; children?: CompositeChild[] };
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
    // ネストした section/song は、その子を**自分の調で再帰合成**して位置オフセット（#15）。
    if (kind === "section" || kind === "song") {
      const subKey = ((c.node.neta.key ?? keyPc) % 12 + 12) % 12;
      return compositeNotes(c.node.children ?? [], subKey).map((n) => ({ ...n, start: n.start + c.position }));
    }
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

// 音源エンジンは audio.ts に分離（S5）。後方互換で再公開＝既存の "../music" import を壊さない。
export * from "./audio";
