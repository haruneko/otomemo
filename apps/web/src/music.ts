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

// メロ配置の調規則（design「メロ配置の調規則」）：別調のメロを section に置くときの移調半音。
// メロは単一調オブジェクト。section の調号(主音+旋法)へ**メロの旋法を保ったまま一意移調**する＝
// 短調メロ→section調号の相対短調・長調メロ→長調主音へ着地。
// **メロ content は実音(WYSIWYG)＝主音は melodyKeyPc**。よって移調量＝着地主音 − メロのkey。
// 例：F#m メロ(key=6) を Cmaj へ → 着地=A(9)、shift = 9−6 = +3（F#→A）。最寄りオクターブ(-5..6)で
// メロの音域を保つ。mode/key 未指定は従来の `pitch+keyPc` 相当に縮退（後退ゼロ）。
export function melodyPlacementShift(
  sectionKeyPc: number,
  sectionMode: string | null | undefined,
  melodyMode: string | null | undefined,
  melodyKeyPc = 0,
): number {
  const k = (((Math.round(sectionKeyPc) % 12) + 12) % 12);
  const sectionMajorTonic = (k + (sectionMode === "minor" ? 3 : 0)) % 12;
  const landing = (sectionMajorTonic + (melodyMode === "minor" ? 9 : 0)) % 12;
  const mk = (((Math.round(melodyKeyPc) % 12) + 12) % 12);
  const raw = (((landing - mk) % 12) + 12) % 12; // 0..11
  return raw > 6 ? raw - 12 : raw; // 最寄りオクターブ＝メロの音域を崩さない（-5..6）
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

// ドラム行の表示ラベル（日本語）。**データ名(英語キー)は content/aria/音声マッピングで保持**し、
// UI 表示だけ日本語化（section レーン名と言語を統一）。未知名はそのまま英語フォールバック。
export const DRUM_LABEL: Record<string, string> = {
  Kick: "キック",
  Snare: "スネア",
  HiHat: "ハイハット",
  OpenHat: "オープンHH",
  Clap: "クラップ",
  Tom: "タム",
  "Pedal HiHat": "ペダルHH",
};

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

// --- コード楽器パターン（chord_pattern・CP2）。進行に解決する相対型の和音版（コンピング/アルペジオ）---
export type ChordPatternMode = "strum" | "arp";
export type ChordTone = "R" | "3" | "5" | "7";
export interface ChordVoicing { tones: ChordTone[]; openClose: "open" | "close"; octave: number }
export interface ChordHit { step: number; dur: number } // dur=step数（1step=16分）＝各音の長さを指定
export interface ChordPatternContent {
  mode: ChordPatternMode;
  voicing: ChordVoicing;
  steps: number; // 1step=16分（リズム/相対ベースと同じグリッド）
  hits: ChordHit[]; // 発音する step とその長さ
  program?: number; // 自前の音色（ベースのように選べる）
}
const CHORD_BASE = 48; // C3 付近（voicing.octave=0 の基準）

// hits は {step,dur} が正。旧 number[] も受ける（既定 dur=4step=四分）＝後方互換。
function normHits(hits: unknown): ChordHit[] {
  return (Array.isArray(hits) ? hits : []).map((h) => (typeof h === "number" ? { step: h, dur: 4 } : (h as ChordHit)));
}

export function emptyChordPattern(): ChordPatternContent {
  return { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps: 32, hits: [0, 8, 16, 24].map((s) => ({ step: s, dur: 8 })) };
}

// コードを voicing で実音化：構成音(R/3/5/7)をルートから積み、open は1つおきに+12で広げる（スケッチ範囲）。
function voiceChord(root: number, quality: string, v: ChordVoicing): number[] {
  const r = (((Math.round(root) % 12) + 12) % 12);
  const base = CHORD_BASE + (v.octave ?? 0) * 12 + r;
  const tones = (v.tones?.length ? v.tones : ["R", "3", "5"]).map((t) => base + degreeInterval(t, quality));
  tones.sort((a, b) => a - b);
  return v.openClose === "open" ? tones.map((p, i) => (i % 2 === 1 ? p + 12 : p)) : tones;
}

// コード楽器パターンをコードに当てて実音 notes へ（strum=和音ブロック／arp=構成音を巡回）。相対型＝進行に解決。
export function resolveChordPattern(content: ChordPatternContent, chords: ChordEntry[] = [], key = 0): Note[] {
  const mode = content?.mode ?? "strum";
  const v = content?.voicing ?? { tones: ["R", "3", "5"], openClose: "close", octave: 0 };
  const hits = normHits(content?.hits).sort((a, b) => a.step - b.step);
  const out: Note[] = [];
  let arpIdx = 0;
  for (let h = 0; h < hits.length; h++) {
    const step = hits[h]!.step;
    const start = Math.round(step * BASS_STEP_TO_BEAT * 1000) / 1000;
    const dur = Math.round(Math.max(1, hits[h]!.dur) * BASS_STEP_TO_BEAT * 1000) / 1000; // 各音の指定長さ
    if (dur <= 0) continue;
    const ch = bassChordAt(start, chords);
    const root = ch ? ch.root : ((key % 12) + 12) % 12;
    const quality = ch ? ch.quality : "";
    const voiced = voiceChord(root, quality, v);
    if (mode === "arp") {
      out.push({ pitch: voiced[arpIdx % voiced.length]!, start, dur });
      arpIdx++;
    } else {
      for (const p of voiced) out.push({ pitch: p, start, dur });
    }
  }
  return out;
}

export function isChordPattern(content: unknown): content is ChordPatternContent {
  return !!content && typeof content === "object" && "hits" in content && "voicing" in content;
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
  // コード楽器パターン：進行(or preview)に当てて voicing で実音化（相対型）。
  if (kind === "chord_pattern" && isChordPattern(content)) {
    const chords = ctx?.chords ?? (content as ChordPatternContent & { preview_chords?: ChordEntry[] }).preview_chords ?? [];
    return resolveChordPattern(content, chords, ctx?.key ?? 0);
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
  node: {
    neta: { kind: string; content: unknown; key?: number | null; mode?: string | null };
    children?: CompositeChild[];
  };
}
// sectionMode＝配置先 section の旋法（メロ配置の調規則に使う）。未指定は major 既定＝従来挙動。
export function compositeNotes(
  children: CompositeChild[],
  keyPc: number,
  sectionMode?: string | null,
): Note[] {
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
      // ネストした section は**自分の調号(key+mode)**で再帰合成（メロ配置規則も内側の調で効く）。
      const subMode = c.node.neta.mode ?? (c.node.neta.key == null ? sectionMode : null);
      return compositeNotes(c.node.children ?? [], subKey, subMode).map((n) => ({ ...n, start: n.start + c.position }));
    }
    const isRhythm = kind === "rhythm";
    const isProg = kind === "chord" || kind === "chord_progression";
    // パートの音色（GM program）。コード進行は**抽象＝音色固定 GM49(strings)・選択不可**（伴奏は
    // chord_pattern が担う・CP1）。bass は既定フィンガーベース。他は content.program か既定0。
    const prog = isRhythm ? undefined : isProg ? 48 : (programOf(c.node.neta.content) ?? (kind === "bass" ? 33 : 0));
    if (kind === "bass" && isRelativeBass(c.node.neta.content)) {
      // 相対bass：section の調・コードで解決済み実音高なので、ここでは移調しない（position だけ）。
      const chords = sectionChords.map((ch) => ({ ...ch, start: ch.start - c.position }));
      return notesForContent(kind, c.node.neta.content, { key: keyPc, chords }).map((n) => ({
        ...n,
        start: n.start + c.position,
        program: prog,
      }));
    }
    if (kind === "chord_pattern" && isChordPattern(c.node.neta.content)) {
      // コード楽器パターン：section の調・コードで実音解決済み＝移調しない（position だけ）。自前音色。
      const chords = sectionChords.map((ch) => ({ ...ch, start: ch.start - c.position }));
      return notesForContent(kind, c.node.neta.content, { key: keyPc, chords }).map((n) => ({
        ...n,
        start: n.start + c.position,
        program: prog,
      }));
    }
    // メロは**旋法を保った相対移調**（短調メロ→section調号の相対短調等。design「メロ配置の調規則」）。
    // 他（コード等）は section 調へ素直移調。rhythm は移調しない。同旋法/mode不明は keyPc と一致＝後退ゼロ。
    const shift =
      kind === "melody"
        ? melodyPlacementShift(keyPc, sectionMode, c.node.neta.mode, c.node.neta.key ?? 0)
        : keyPc;
    return notesForContent(kind, c.node.neta.content).map((n) => ({
      ...n,
      pitch: isRhythm ? n.pitch : n.pitch + shift,
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

// Blob を名前付きでダウンロード。アンカーは DOM に挿入→click→除去（Firefox 互換）し、
// blob URL の revoke は **遅延**させる（click 直後の同期 revoke は一部ブラウザで DL を
// キャンセル/空ファイル化する）。両 download 関数の共通処理＝重複排除。
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // DL 開始を待ってから解放（リーク防止）
}

export function downloadMultitrackMidi(
  tracks: MidiTrackSpec[],
  filename = "section.mid",
  bpm = 120,
  meter?: string | null,
): void {
  const blob = new Blob([tracksToMidi(tracks, bpm, meter) as BlobPart], { type: "audio/midi" });
  triggerDownload(blob, filename);
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
  triggerDownload(blob, filename);
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
