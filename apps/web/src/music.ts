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
}
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
    l.hits.map((step) => ({ pitch: l.midi, start: step / 4, dur: 0.25, drum: true })),
  );
}

// neta の種類別に content をノート列へ（合成再生で使う共通変換）
// 単独再生・試聴できる音楽 kind（定数ドリフト防止のため1か所に集約）。
export const MUSIC_KINDS = ["melody", "chord", "chord_progression", "rhythm"];

export function notesForContent(kind: string, content: unknown): Note[] {
  if (kind === "melody") return notesOf(content);
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
  return children.flatMap((c) => {
    const isRhythm = c.node.neta.kind === "rhythm";
    return notesForContent(c.node.neta.kind, c.node.neta.content).map((n) => ({
      ...n,
      pitch: isRhythm ? n.pitch : n.pitch + keyPc,
      start: n.start + c.position,
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
    return { time, durSec: n.dur * spb, voice: "poly", pitch: n.pitch, vel };
  });
}

/** 全体の尺（秒）＝最後の発音の終わりまで。終端 scheduleOnce 用。 */
export function totalSec(notes: Note[], bpm = 120): number {
  const spb = 60 / bpm;
  let end = 0;
  for (const n of notes) end = Math.max(end, (n.start + (n.drum ? 0 : n.dur)) * spb);
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
}

// 単一再生：グローバル Transport を奪い合うので、現在の音源を1組だけ保持し再利用/破棄。
type Kit = { poly: any; membrane: any; noise: any };
let currentKit: Kit | null = null;

// 1音の発音ディスパッチ（テスト可能に切り出し）。
// ドラム: SF2にマッチ楽器があればそれ、無ければ簡易キット(membrane/noise)。
// 旋律: SF2があればそれ、無ければ poly シンセ。SF2 は absolute time(秒)・velocity 0..127。
export function playEvent(
  ev: ScheduledNote,
  time: number,
  sf: any,
  kit: Kit,
  Tone: any,
  drumKits?: Map<number, any>,
): void {
  if (ev.voice === "membrane" || ev.voice === "noise") {
    const ds = drumKits?.get(ev.pitch);
    if (ds) {
      ds.start({ note: ev.pitch, time, duration: ev.durSec, velocity: Math.round(ev.vel * 127) });
    } else if (ev.voice === "membrane") {
      kit.membrane.triggerAttackRelease(Tone.Frequency(ev.pitch, "midi").toFrequency(), ev.durSec, time, ev.vel);
    } else {
      kit.noise.triggerAttackRelease(ev.durSec, time, ev.vel);
    }
  } else if (sf) {
    sf.start({ note: ev.pitch, time, duration: ev.durSec, velocity: Math.round(ev.vel * 127) });
  } else {
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
// パース済みSF2を url で共有（旋律＋各ドラムsamplerが再パースしないように）。
let sfParsed: any = null;
let sfParsedUrl: string | null = null;
// #55b ドラムは GM 統合キットが無いため、GM番号→楽器名で個別samplerをロードしキャッシュ。
const sfDrumCache = new Map<string, any>(); // 楽器名 → drum sampler
let sfCtx: any = null; // 共有 AudioContext（Tone.rawContext）

function resetSfCaches(): void {
  sfSampler = null;
  sfLoadedUrl = null;
  sfLastError = null;
  sfInstrumentCount = 0;
  sfInstrumentNames = [];
  sfParsed = null;
  sfParsedUrl = null;
  sfDrumCache.clear();
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

async function ensureSoundFont(Tone: any): Promise<any | null> {
  const url = activeSfUrl;
  if (!url) return null;
  if (sfLoadedUrl === url && sfSampler) return sfSampler;
  if (sfLoading) return null; // ロード中の再生は今回フォールバック（次回から鳴る）
  sfLoading = true;
  try {
    const sampler = await makeSampler(url, Tone);
    await sampler.ready;
    const names: string[] = sampler.instrumentNames ?? [];
    sfInstrumentCount = names.length;
    sfInstrumentNames = names;
    // 旋律楽器を優先（ドラム/percussion以外）。無ければ先頭。
    const melodic = names.find((n) => !/drum|perc|kit/i.test(n)) ?? names[0];
    if (melodic) await sampler.loadInstrument(melodic);
    sfSampler = sampler;
    sfLoadedUrl = url;
    sfLastError = null;
    return sampler;
  } catch (e) {
    sfLastError = e instanceof Error ? e.message || String(e) : String(e);
    // 失敗理由はブラウザコンソールにも出す（診断用）。再生は簡易シンセにフォールバック。
    console.error("[SoundFont] load failed:", e);
    sfSampler = null;
    sfLoadedUrl = null;
    return null;
  } finally {
    sfLoading = false;
  }
}

// #55b GM打楽器番号 → SF2楽器名（GeneralUser GS等GM SF2向けベストエフォート）。
export function drumNameFor(pitch: number, names: string[]): string | null {
  let res: RegExp[];
  if (pitch <= 36) res = [/kick|bass drum/i];
  else if (pitch === 37) res = [/side ?stick|rim/i, /snare/i];
  else if (pitch === 38 || pitch === 40) res = [/snare/i];
  else if (pitch === 39) res = [/clap|hand/i, /snare/i];
  else if ([41, 43, 45, 47, 48, 50].includes(pitch)) res = [/tom/i];
  else if (pitch === 42 || pitch === 44) res = [/closed.*hat|hi-?hat|hat/i];
  else if (pitch === 46) res = [/open.*hat|hi-?hat|hat/i];
  else if ([49, 52, 55, 57].includes(pitch)) res = [/crash|splash|china|cymbal/i];
  else if ([51, 53, 59].includes(pitch)) res = [/ride/i, /cymbal/i];
  else res = [/perc/i, /drum/i];
  for (const re of res) {
    const hit = names.find((n) => re.test(n));
    if (hit) return hit;
  }
  return null;
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

// 再生に出てくるドラム音(pitch)それぞれに対応する drum sampler を用意（pitch→sampler）。
async function prepareDrumKits(notes: Note[], Tone: any): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  if (!sfInstrumentNames.length) return map;
  const pitches = [...new Set(notes.filter((n) => n.drum).map((n) => n.pitch))];
  for (const p of pitches) {
    const name = drumNameFor(p, sfInstrumentNames);
    if (!name) continue;
    const s = await loadDrumSampler(name, Tone);
    if (s) map.set(p, s);
  }
  return map;
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
  const sf = await ensureSoundFont(Tone);
  const drumKits = sf ? await prepareDrumKits(notes, Tone) : new Map<number, any>();

  const kit: Kit = {
    poly: new Tone.PolySynth(Tone.Synth).toDestination(),
    membrane: new Tone.MembraneSynth().toDestination(),
    noise: new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).toDestination(),
  };
  currentKit = kit;

  transport.bpm.value = bpm;
  for (const ev of scheduleTimes(notes, bpm)) {
    transport.schedule((time: number) => playEvent(ev, time, sf, kit, Tone, drumKits), ev.time);
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
        for (const ds of drumKits.values()) ds.stop?.();
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
