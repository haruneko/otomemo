import { Midi } from "@tonejs/midi";
import { Chord as TonalChord, Note as TonalNote } from "tonal";
// 不変の音楽知識（音名・コード品質→インターバル）は @cm/music-core が SSOT（負債D3・design 決定2b）。
// PITCH_NAMES は re-export して既存の web import 面（useNetaEditor 等）を不変に保つ。
import { PITCH_NAMES, QUALITY_INTERVALS, applyFeel, type Feel, type Note as CoreNote } from "@cm/music-core";
export { PITCH_NAMES, applyFeel };
export type { Feel };

// フィール層（design.md「フィール層分離」）：スイング/微小タイミングは再生・書き出し境界で **applyFeel**
// を通す非破壊タイムマップ。SSOTのnotesは常にストレート。6/8等 compound はスイング対象外＝meter から判定。
export function isCompoundMeter(meter?: string | null): boolean {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return false;
  const n = Number(m[1]), d = Number(m[2]);
  return d === 8 && n % 3 === 0 && n >= 6; // 6/8・9/8・12/8＝複合拍子
}
// notes に feel を適用（meter から compound を導出）。feel 無しは恒等＝ストレートのまま。
export function feelNotes(notes: Note[], feel: Feel | null | undefined, meter?: string | null): Note[] {
  return feel ? applyFeel(notes, feel, { compound: isCompoundMeter(meter) }) : notes;
}
// content から feel を読む（トラック＝melody等の content.feel／セクション＝section content.feel）。無ければ undefined。
export function feelOf(content: unknown): Feel | undefined {
  if (content && typeof content === "object") {
    const f = (content as { feel?: Feel }).feel;
    if (f && typeof f === "object") return f;
  }
  return undefined;
}

// 音楽的中身（docs/design.md #16）。pitch は C基準のMIDI番号、start/dur は拍。
export interface Note extends CoreNote {
  // pitch / start / dur / vel? / syllable? は CoreNote（@cm/music-core・SSOT・負債#10）から継承。
  // 以下は web 固有の再生/ミキサー用拡張（api には持ち込まない）。
  drum?: boolean; // GMドラム＝打楽器シンセで鳴らす（melodic synthだと低すぎて聞こえない）
  program?: number; // #section音色: 合成再生で子(パート)ごとの GM音色を保つ（compositeNotesが付与）
  kit?: number; // ドラムキット(GM bank128 preset番号 0=Standard)。アコ/エレキ選択＝drumノートに付与。
  part?: MixPart; // ミキサーのパート（合成再生で compositeNotes が付与）。パート別ゲインへ振り分ける。
  lens?: string; // #20 S6骨格の机: レンズ印（例 "fold"/"real"）。両レンズを同時スケジュールし
  // レンズ別ゲインバスで鳴らす側だけ開く（無停止A/B）。未指定＝従来経路（partGains 直結）＝bit一致。
}

// ミキサーのパート＝メロ/コード/ベース/ドラム（音量バランスと音割れ対策のパート別ゲイン・耳FB 2026-07-09）。
export type MixPart = "melody" | "counter" | "chord" | "bass" | "drums";

// MIDIノート番号→音名（MIDI 60=C4）。負値も安全（(m%12+12)%12）。PITCH_NAMES は @cm/music-core。
export const pitchName = (midi: number) => `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

// ピアノロール共通（PianoRoll/SkeletonEditor で重複していた低リスク純関数を集約・SSOT）。
export const pc = (p: number) => (((p % 12) + 12) % 12); // ピッチクラス 0-11（負値も安全）
export const isBlack = (p: number) => PITCH_NAMES[pc(p)]!.includes("#"); // 黒鍵か（#を含む音名）
// 調内音ハイライト＝メジャー/自然的マイナーの音度集合（主音からの半音間隔）。P0-a。
export const SCALE_IVS: Record<string, number[]> = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
// 調内音のピッチクラス集合（root=主音pc・mode）。root 未指定/非数は null（描画側でハイライト無し）。
export function scalePcSet(root?: number, mode?: string): Set<number> | null {
  if (root == null || !Number.isFinite(root)) return null;
  const ivs = SCALE_IVS[mode === "minor" ? "minor" : "major"]!;
  return new Set(ivs.map((i) => pc(root + i)));
}

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

// 着地主音pc：content の旋法を保って section の調号へ相対マップ（design「メロ配置の調規則」）。
// 短調content→section調号の相対短調へ・長調content→長調主音へ。**Cmaj と Am など同じ調号は同じ着地**
// （label 不変）。これでメロ/コード/ベースが同じ着地に揃う＝短調 section でも食い違わない。
function placementLanding(
  sectionKeyPc: number,
  sectionMode: string | null | undefined,
  contentMode: string | null | undefined,
): number {
  const k = (((Math.round(sectionKeyPc) % 12) + 12) % 12);
  const sectionMajorTonic = (k + (sectionMode === "minor" ? 3 : 0)) % 12; // section調号の長調主音
  return (sectionMajorTonic + (contentMode === "minor" ? 9 : 0)) % 12;
}

// メロ配置の移調半音：実音(WYSIWYG・主音=key)を着地主音へ。最寄りオクターブ(-5..6)で音域維持。
// 例：F#m メロ(key=6) を Cmaj/Am へ → 着地=A(9)、shift = 9−6 = +3（F#→A）。
export function melodyPlacementShift(
  sectionKeyPc: number,
  sectionMode: string | null | undefined,
  melodyMode: string | null | undefined,
  melodyKeyPc = 0,
): number {
  const landing = placementLanding(sectionKeyPc, sectionMode, melodyMode);
  const mk = (((Math.round(melodyKeyPc) % 12) + 12) % 12);
  const raw = (((landing - mk) % 12) + 12) % 12;
  return raw > 6 ? raw - 12 : raw; // 最寄りオクターブ＝メロの音域を崩さない
}

// コード/ベース絶対の移調半音：**メロと同じ着地ロジック**（mode-relative + key-aware）。レジスタは
// 上方向(0..11)＝C基準content(key=0/mode major)では従来の +keyPc と一致＝後退ゼロ。旋法は和音 quality /
// 音そのものが保持。**自分の mode/key を宣言していること**が前提（短調contentは mode=minor を要す）。
export function harmonyPlacementShift(
  sectionKeyPc: number,
  sectionMode: string | null | undefined,
  contentMode: string | null | undefined,
  contentKeyPc = 0,
): number {
  const landing = placementLanding(sectionKeyPc, sectionMode, contentMode);
  return (((landing - Math.round(contentKeyPc)) % 12) + 12) % 12; // 0..11
}

// --- コード（chord / chord_progression）。C基準で記号保存し、再生時に音符へ展開＋移調 ---
export interface ChordEntry {
  root: number; // 0–11 ピッチクラス（C基準、design #16）
  quality: string; // ""(major) / "m" / "7" / "maj7" / "m7" / "dim" ...
  start: number; // 拍
  dur: number; // 拍
  bass?: number; // 分数コードのオンベース pc（0–11・省略=root）。「C/E」={root:0,quality:"",bass:4}（design 決定B）
}

export function chordsOf(content: unknown): ChordEntry[] {
  const c = content as { chords?: unknown } | null;
  if (!c || !Array.isArray(c.chords)) return [];
  // 旧データ（root が "C".."B" 文字列）を 0–11 へ移行
  return (c.chords as { root: number | string; quality?: string; start: number; dur: number; bass?: number }[]).map(
    (ch) => ({
      root: typeof ch.root === "number" ? ch.root : Math.max(0, PITCH_NAMES.indexOf(ch.root)),
      quality: ch.quality ?? "",
      start: ch.start,
      dur: ch.dur,
      ...(ch.bass != null ? { bass: ((Math.round(ch.bass) % 12) + 12) % 12 } : {}),
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

const CHORD_PREVIEW_BASE = 60; // C4 付近（進行プレビューの中立な積み）
// コード列を、各コードの start/dur に重ねたノート列へ（再生/MIDIはメロと同じ経路）。
// **QUALITY_INTERVALS(SSOT) から積む**＝テンション(9/13/add9 等)も pc 正しく鳴る（旧 Tonal依存を排し
// 我々の語彙と一致）。tones は昇順になるようオクターブで開く＝C9=C E G B♭ D'（クラスタにせず和音色が分かる）。
export function chordsToNotes(chords: ChordEntry[]): Note[] {
  return chords.flatMap((c) => {
    const ivals = QUALITY_INTERVALS[c.quality] ?? [0, 4, 7];
    const r = (((Math.round(c.root) % 12) + 12) % 12);
    let prev = -1;
    const out = ivals.map((iv) => {
      let v = iv;
      while (v <= prev) v += 12; // 昇順に開く（テンションをオクターブ上へ）
      prev = v;
      return { pitch: CHORD_PREVIEW_BASE + r + v, start: c.start, dur: c.dur };
    });
    // 分数コード（決定B）：オンベース pc を一番下（C3帯）に追加＝最低音が bass に。
    if (c.bass != null) {
      const bpc = ((Math.round(c.bass) % 12) + 12) % 12;
      out.unshift({ pitch: CHORD_PREVIEW_BASE - 12 + bpc, start: c.start, dur: c.dur });
    }
    return out;
  });
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
  kit?: number; // ドラムキット(GM bank128 preset 0=Standard)。アコ/エレキ選択。未指定=Standard。
}

// 選べるドラムキット（SF2 bank128 のプリセット）。アコ/エレキでグループ。
export const DRUM_KITS: { program: number; label: string; group: "acoustic" | "electric" }[] = [
  { program: 0, label: "Standard", group: "acoustic" },
  { program: 8, label: "Room", group: "acoustic" },
  { program: 16, label: "Power", group: "acoustic" },
  { program: 32, label: "Jazz", group: "acoustic" },
  { program: 40, label: "Brush", group: "acoustic" },
  { program: 24, label: "Electronic", group: "electric" },
  { program: 25, label: "808/909", group: "electric" },
  { program: 26, label: "Dance", group: "electric" },
];

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
      kit: r.kit, // 選択キット（未指定=Standard）。再生/書出でこの番号のキットを使う。
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

// コード品質 → ルートからの半音インターバルは @cm/music-core の QUALITY_INTERVALS が SSOT（負債D3）。
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
    const chRootPc = ch ? ((ch.root % 12) + 12) % 12 : k;
    // 分数コード（決定B）：オンベースがあれば R（ルート）はその低音を弾く。3/5/7 はコードのルート基準。
    const bassPc = ch && ch.bass != null ? ((ch.bass % 12) + 12) % 12 : chRootPc;
    const quality = ch ? ch.quality : "";
    let pitch: number;
    if (e.degree === "approach") {
      const target = band(nextRootPc(entries, i, chords, k));
      const up = target + 1;
      const down = target - 1;
      const ref = prevPitch ?? target;
      pitch = Math.abs(up - ref) <= Math.abs(down - ref) ? up : down;
    } else {
      // 度数はルートから上に積む（5度=root+7 等）。R のみオンベース基準。
      const refPc = e.degree === "R" ? bassPc : chRootPc;
      pitch = band(refPc) + degreeInterval(e.degree, quality);
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
// 響きモデル（2026-07-04 作り替え）：構成音の手選択(tones)は撤去＝鳴る音はコードの質から自動。
// - top: トップ声部の「狙い音」（絶対MIDIピッチ）。各コードでこの音に最寄りのコードトーンを最高声部に。
// - powerChord: 3rd 等を落として R+5 だけ（唯一の"間引き"＝手選択の代わり）。
// - openClose: 広がり（close=密／open=1つおきに+12で広げる）。octave: 高さ微調整。
// - arpDir: アルペジオの向き（up/down/updown）。音域は top+openClose で決まる＝別指定しない。
// tones は後方互換のため残す（top 未指定の旧パターンは従来どおり tones で鳴る）。
export interface ChordVoicing {
  tones: ChordTone[];
  openClose: "open" | "close";
  octave: number;
  top?: number;
  powerChord?: boolean;
  arpDir?: "up" | "down" | "updown";
  arpOctaves?: number; // arp の駆け上がり幅（1〜4oct）。voiced を下方へ積み増した拡張プールを巡回＝ハープのグリッサンド。既定1＝従来の voiced 巡回（bit一致）。
  arpReset?: number; // arp の駆け上がり区切り（拍）。この拍数ごとに pool 頭（低音）から登り直す＝「1.5拍ごとに下から駆け上がる」。既定/0＝区切りなし（連続巡回・bit一致）。
}
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
  // top を持たせて新モデル（構成音自動＋トップ狙い）で動く。tones は後方互換で残置。
  return { mode: "strum", voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, powerChord: false, arpDir: "up" }, steps: 32, hits: [0, 8, 16, 24].map((s) => ({ step: s, dur: 8 })) };
}

// コードを voicing で実音化（決定C・伴奏レジスタ）：構成音(R/3/5/7)を**アンカーの最寄りオクターブ**に
// 置いたルートから積む＝コードが動いてもレジスタが跳ねない（旧 base=CHORD_BASE+octave*12+root_pc は
// ルートのpcぶん上下した）。anchor=「大体の高さ」。open は1つおきに+12で広げる（スケッチ範囲）。
// トップ狙い音（絶対）ベースのボイシング＝各コードで top に最寄りのコードトーンを最高声部にし、
// 残りをその下へ密に積む（多少雑でOK＝厳密な最適配置は DAW 案件）。open は1つおきに+12で広げる。
function voiceToTop(root: number, quality: string, powerChord: boolean, top: number, open: boolean): number[] {
  const r = (((Math.round(root) % 12) + 12) % 12);
  // 鳴る音はコードの質から自動（QUALITY_INTERVALS＝全コードトーン）。パワーコードは R+5 のみ。
  const ivals = powerChord ? [0, 7] : (QUALITY_INTERVALS[quality] ?? [0, 4, 7]);
  const pcs = ivals.map((iv) => (((r + iv) % 12) + 12) % 12);
  const nearest = (pc: number) => Math.round((top - pc) / 12) * 12 + pc; // pc を top 最寄りのオクターブへ
  // トップ＝top に一番近い実現ピッチを与える構成音（同距離は先勝ち＝細かい優先は DAW 案件）。
  let topPc = pcs[0]!, topPitch = nearest(pcs[0]!);
  for (const pc of pcs) {
    const p = nearest(pc);
    if (Math.abs(p - top) < Math.abs(topPitch - top)) { topPitch = p; topPc = pc; }
  }
  const rest = [...pcs];
  rest.splice(rest.indexOf(topPc), 1); // トップに使った1音だけ除く
  const voices = [topPitch];
  let lowest = topPitch;
  for (const pc of rest) {
    let cand = Math.floor(lowest / 12) * 12 + pc;
    while (cand >= lowest) cand -= 12; // 現在の最低音の直下へ（密に積む）
    voices.push(cand);
    lowest = cand;
  }
  voices.sort((a, b) => a - b);
  return open ? voices.map((p, i) => (i % 2 === 1 ? p + 12 : p)) : voices;
}

function voiceChord(root: number, quality: string, v: ChordVoicing): number[] {
  if (v.top != null) return voiceToTop(root, quality, v.powerChord === true, v.top, v.openClose === "open");
  const r = (((Math.round(root) % 12) + 12) % 12);
  const anchor = CHORD_BASE + (v.octave ?? 0) * 12;
  let d = (((r - anchor) % 12) + 12) % 12; // root を anchor の最寄りオクターブへ（anchor±6半音帯）
  if (d > 6) d -= 12;
  const base = anchor + d;
  const tones = (v.tones?.length ? v.tones : ["R", "3", "5"]).map((t) => base + degreeInterval(t, quality));
  tones.sort((a, b) => a - b);
  return v.openClose === "open" ? tones.map((p, i) => (i % 2 === 1 ? p + 12 : p)) : tones;
}

// arp の駆け上がりプール＝voiced（1oct分の voicing）を **下方へ** arpOctaves ぶん積み増し昇順化。
// 下へ伸ばす＝天井（トップ声部＝絶対の磁石）を動かさず低音側から駆け上がる（design 2026-07-13）。
// 既定/1oct＝voiced そのもの（arpStep のインデックスも音数も不変＝bit一致）。上限4oct。
function arpPool(voiced: number[], octaves?: number): number[] {
  const n = Math.max(1, Math.min(4, Math.round(octaves ?? 1)));
  if (n <= 1) return voiced;
  const pool: number[] = [];
  for (let o = 0; o < n; o++) for (const p of voiced) pool.push(p - 12 * o);
  return pool.sort((a, b) => a - b);
}

// アルペジオ i 番目が voiced（昇順・n音）のどのインデックスか。up=昇順／down=降順／updown=ピンポン。
function arpStep(i: number, n: number, dir?: "up" | "down" | "updown"): number {
  if (n <= 1) return 0;
  if (dir === "down") return (n - 1) - (i % n);
  if (dir === "updown") {
    const period = 2 * (n - 1); // 0..n-1..1 の三角波
    const t = ((i % period) + period) % period;
    return t < n ? t : period - t;
  }
  return i % n; // up（既定）
}

// コード楽器パターンをコードに当てて実音 notes へ（strum=和音ブロック／arp=構成音を巡回）。相対型＝進行に解決。
export function resolveChordPattern(content: ChordPatternContent, chords: ChordEntry[] = [], key = 0): Note[] {
  const mode = content?.mode ?? "strum";
  const v = content?.voicing ?? { tones: ["R", "3", "5"], openClose: "close", octave: 0 };
  const hits = normHits(content?.hits).sort((a, b) => a.step - b.step);
  const out: Note[] = [];
  let arpIdx = 0, arpGrp = -1; // arpGrp＝arpReset の区切り番号（変わったら arpIdx を頭へ戻す）
  for (let h = 0; h < hits.length; h++) {
    const step = hits[h]!.step;
    const start = Math.round(step * BASS_STEP_TO_BEAT * 1000) / 1000;
    const dur = Math.round(Math.max(1, hits[h]!.dur) * BASS_STEP_TO_BEAT * 1000) / 1000; // 各音の指定長さ
    if (dur <= 0) continue;
    // つんのめり(アンティシペーション)：裏拍始まりでダウンビートを跨いで伸びる音は、跨いだ先のダウンビートの
    // コードで解決する＝「音の終わる方の拍でコードを決める」＝シンコペ分だけコードが先取り（bass 側と同ロジック・
    // 2026-07-10 オーナーFB：コード楽器にだけ抜けていた）。ジャストの音は従来どおり start のコード。
    const nextBeat = Math.floor(start + 1e-9) + 1;
    const offBeat = Math.abs(start - Math.round(start)) > 1e-9;
    const refBeat = offBeat && nextBeat < start + dur - 1e-9 ? nextBeat : start;
    const ch = bassChordAt(refBeat, chords);
    const root = ch ? ch.root : ((key % 12) + 12) % 12;
    const quality = ch ? ch.quality : "";
    const voiced = voiceChord(root, quality, v);
    if (mode === "arp") {
      // 向き（up=昇順／down=降順／updown=ピンポン）で拡張プール（voiced を下方へ arpOctaves 積み増し）を辿る。
      // 既定1oct＝プール＝voiced＝従来どおり（bit一致）。arpOctaves≥2 で複数オクターブを駆け上がる＝ハープ。
      const pool = arpPool(voiced, v.arpOctaves);
      // arpReset＝この拍数ごとに pool 頭から登り直す（区切り番号が変わったら arpIdx を 0 へ）。既定/0＝連続巡回（bit一致）。
      if (v.arpReset && v.arpReset > 0) { const grp = Math.floor((start + 1e-9) / v.arpReset); if (grp !== arpGrp) { arpIdx = 0; arpGrp = grp; } }
      out.push({ pitch: pool[arpStep(arpIdx, pool.length, v.arpDir)]!, start, dur });
      arpIdx++;
    } else {
      for (const p of voiced) out.push({ pitch: p, start, dur });
      // 分数コード（決定B）：strum はオンベースを voicing の下に1音足す＝最低音が bass に。
      if (ch && ch.bass != null) {
        const bpc = ((ch.bass % 12) + 12) % 12;
        const lowest = Math.min(...voiced);
        let bp = Math.floor(lowest / 12) * 12 + bpc;
        while (bp >= lowest) bp -= 12; // 確実にコードより下へ
        out.push({ pitch: bp, start, dur });
      }
    }
  }
  return out;
}

// コード楽器 grid のセルタップ→hits の更新（純関数・契約テスト用）。
// 頭(onset)＝消す／伸び(sustain)の"上"＝そのノートの終わりを s に詰める（長さ調整）／空き＝新規配置。
// ※末尾の直後(step+dur)は"空き"扱い＝新規配置できる（隣接した音 x--x を打てるように・伸ばしと衝突させない）。
export function applyCellTap(hits: ChordHit[], s: number, placeLen: number): { hits: ChordHit[]; placed: boolean } {
  if (hits.some((h) => h.step === s)) return { hits: hits.filter((h) => h.step !== s), placed: false };
  const owner = hits.find((h) => h.step < s && s < h.step + h.dur); // 伸びの"上"だけ（末尾直後は含めない）
  if (owner) return { hits: hits.map((h) => (h === owner ? { ...h, dur: s - h.step + 1 } : h)), placed: false };
  return { hits: [...hits, { step: s, dur: placeLen }].sort((a, b) => a.step - b.step), placed: true };
}

// 入力時プレビュー用＝現在の voicing で C を鳴らした実音（ドミソ）。単音でなく和音で確認できる。
export function voicingPreviewPitches(v: ChordVoicing): number[] {
  return voiceChord(0, "", v); // C メジャーを現在の voicing で（top/close-open/powerChord 反映）
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

// 骨格（design #20）：ブレークポイント列 content。dur を持たず各音は次の点/句末/曲末まで支配。
export interface SkeletonBreakpoint { start: number; pitch: number | null }
export interface SkeletonContent { bars: number; tones: SkeletonBreakpoint[]; bass?: SkeletonBreakpoint[]; phrases?: { endBeat: number; cadence?: string }[] }
export function isSkeleton(content: unknown): content is SkeletonContent {
  return !!content && typeof content === "object" && Array.isArray((content as SkeletonContent).tones) && typeof (content as SkeletonContent).bars === "number";
}
// 単体プレビュー：支配区間を白玉として鳴らす（各tone は start から次のブレークポイント/句末/曲末まで・pitch:null は無音）。
// meter を持たない content 前提で bpb=4 既定（4/4）。
export function skeletonPreviewNotes(content: SkeletonContent, beatsPerBarN = 4): Note[] {
  const total = content.bars * beatsPerBarN;
  const tones = [...content.tones].sort((a, b) => a.start - b.start);
  const bounds = (content.phrases ?? []).map((p) => p.endBeat).filter((b) => b > 0 && b < total - 1e-9);
  const out: Note[] = [];
  for (let i = 0; i < tones.length; i++) {
    const start = tones[i]!.start;
    if (start >= total - 1e-9) break;
    let end = i + 1 < tones.length ? tones[i + 1]!.start : total;
    for (const pb of bounds) if (pb > start + 1e-9 && pb < end - 1e-9) end = pb; // 句をまたがない
    if (end <= start + 1e-9 || tones[i]!.pitch == null) continue; // 骨格休符は無音
    out.push({ pitch: tones[i]!.pitch!, start, dur: end - start });
  }
  return out;
}

export function notesForContent(kind: string, content: unknown, ctx?: BassContext): Note[] {
  // 骨格＝単体プレビューは支配区間の白玉（design #20）。合成では compositeNotes 側で無音扱い。
  // 音色は骨格の慣習＝Strings（48・SKEL_MEL_PROGRAM と一致）＝骨格エディタ/机と同じ音で鳴らす（プレビューが
  // ピアノで不統一だった耳FB 2026-07-12 の是正）。program は再生のみ効き描画(MiniRoll)は不変。
  if (kind === "skeleton" && isSkeleton(content)) return skeletonPreviewNotes(content).map((n) => ({ ...n, program: 48, part: "melody" as const }));
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
  // bass 絶対モードは melody と同型(notes)。counter(対旋律・WP-X3a)・riff(反復核・WP-X3b) も単音ライン＝notes 同型。
  if (kind === "melody" || kind === "bass" || kind === "counter" || kind === "riff") return notesOf(content);
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
  // コードを section 位置・調へ展開。**コード進行の自分の調(key)から section 調へ key-aware 移調**
  // （key=0 のC基準content では従来の +keyPc と一致）。相対bass/chord_pattern もこの実調コードに当たる。
  const sectionChords: ChordEntry[] = children.flatMap((c) => {
    const k = c.node.neta.kind;
    if (k !== "chord" && k !== "chord_progression") return [];
    const shift = harmonyPlacementShift(keyPc, sectionMode, c.node.neta.mode, c.node.neta.key ?? 0);
    return chordsOf(c.node.neta.content).map((ch) => ({
      ...ch,
      root: ((ch.root + shift) % 12 + 12) % 12,
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
    // ①（2026-07-03）コード進行トラックは**無音の骨格**＝自分は発音しない（伴奏は chord_pattern が
    // 担う・CP1）。和声の解決文脈は上の sectionChords から既に供給済み＝役目は保持。
    // 骨格ネタ(skeleton・design #20)も同様に合成では無音（構造線＝表面化して初めて鳴る・単体編集時のみ白玉プレビュー）。
    if (kind === "chord" || kind === "chord_progression" || kind === "skeleton") return [];
    const isRhythm = kind === "rhythm";
    // ミキサーのパート＝kind から決定（コード楽器/riff→chord・rhythm→drums・bass→bass・counter→counter・他→melody）。
    const part: MixPart = kind === "bass" ? "bass" : kind === "rhythm" ? "drums" : kind === "chord_pattern" || kind === "riff" ? "chord" : kind === "counter" ? "counter" : "melody";
    // パートの音色（GM program）。bass=フィンガーベース・counter=ストリングス。他は content.program か既定0（riff は content.program）。
    const prog = isRhythm ? undefined : (programOf(c.node.neta.content) ?? (kind === "bass" ? 33 : kind === "counter" ? 48 : 0));
    if (kind === "bass" && isRelativeBass(c.node.neta.content)) {
      // 相対bass：section の調・コードで解決済み実音高なので、ここでは移調しない（position だけ）。
      const chords = sectionChords.map((ch) => ({ ...ch, start: ch.start - c.position }));
      return notesForContent(kind, c.node.neta.content, { key: keyPc, chords }).map((n) => ({
        ...n,
        start: n.start + c.position,
        program: prog,
        part,
      }));
    }
    if (kind === "chord_pattern" && isChordPattern(c.node.neta.content)) {
      // コード楽器パターン：section の調・コードで実音解決済み＝移調しない（position だけ）。自前音色。
      const chords = sectionChords.map((ch) => ({ ...ch, start: ch.start - c.position }));
      return notesForContent(kind, c.node.neta.content, { key: keyPc, chords }).map((n) => ({
        ...n,
        start: n.start + c.position,
        program: prog,
        part,
      }));
    }
    // メロは**旋法を保った相対移調**（短調メロ→section調号の相対短調等）。コード/ベース絶対は
    // **自分の調から section 調へ key-aware 半音移調**（F#m進行を二重移調しない）。rhythm は移調しない。
    // いずれも C基準content(key=0/mode未指定)では従来挙動に一致＝後退ゼロ。
    const shift =
      kind === "melody" || kind === "counter" || kind === "riff" // counter/riff もメロと同型の単音ライン＝旋法保持の相対移調
        ? melodyPlacementShift(keyPc, sectionMode, c.node.neta.mode, c.node.neta.key ?? 0)
        : harmonyPlacementShift(keyPc, sectionMode, c.node.neta.mode, c.node.neta.key ?? 0);
    return notesForContent(kind, c.node.neta.content).map((n) => ({
      ...n,
      pitch: isRhythm ? n.pitch : n.pitch + shift,
      start: n.start + c.position,
      program: prog,
      part,
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

// 1小節の拍数（四分=1.0 基準）。4/4→4、6/8→3、3/4→3。未指定/不正は4（SSOT・SectionEditor等と一致）。
export function beatsPerBar(meter?: string | null): number {
  const p = meterPair(meter);
  return p ? (p[0] * 4) / p[1] : 4;
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

// GM 128 音色の全リスト（家族＝GM標準の16グループ×8）。簡易リスト(GM_INSTRUMENTS)の「他に全部選べる」用（GSバンクは非対象）。
// value=GM プログラム番号(0-127)。再生の音色は SF2 が持つ範囲＝General MIDI サウンドフォント前提（未収録音は簡易シンセ代替になりうる）。
export const GM_ALL_FAMILIES: { family: string; names: string[] }[] = [
  { family: "ピアノ", names: ["アコースティックピアノ", "ブライトピアノ", "エレクトリックグランド", "ホンキートンク", "エレピ1", "エレピ2", "ハープシコード", "クラビ"] },
  { family: "クロマチック打", names: ["チェレスタ", "グロッケン", "オルゴール", "ビブラフォン", "マリンバ", "シロフォン", "チューブラーベル", "ダルシマー"] },
  { family: "オルガン", names: ["ドローバーオルガン", "パーカッシブオルガン", "ロックオルガン", "チャーチオルガン", "リードオルガン", "アコーディオン", "ハーモニカ", "タンゴアコーディオン"] },
  { family: "ギター", names: ["ナイロンギター", "スチールギター", "ジャズギター", "クリーンギター", "ミュートギター", "オーバードライブギター", "ディストーションギター", "ギターハーモニクス"] },
  { family: "ベース", names: ["アコースティックベース", "フィンガーベース", "ピックベース", "フレットレスベース", "スラップベース1", "スラップベース2", "シンセベース1", "シンセベース2"] },
  { family: "ストリングス", names: ["バイオリン", "ビオラ", "チェロ", "コントラバス", "トレモロ弦", "ピチカート弦", "ハープ", "ティンパニ"] },
  { family: "アンサンブル", names: ["ストリングス1", "ストリングス2", "シンセストリングス1", "シンセストリングス2", "合唱アー", "声オー", "シンセボイス", "オーケストラヒット"] },
  { family: "ブラス", names: ["トランペット", "トロンボーン", "チューバ", "ミュートトランペット", "フレンチホルン", "ブラスセクション", "シンセブラス1", "シンセブラス2"] },
  { family: "リード(木管)", names: ["ソプラノサックス", "アルトサックス", "テナーサックス", "バリトンサックス", "オーボエ", "イングリッシュホルン", "ファゴット", "クラリネット"] },
  { family: "パイプ", names: ["ピッコロ", "フルート", "リコーダー", "パンフルート", "ボトルブロウ", "尺八", "ホイッスル", "オカリナ"] },
  { family: "シンセリード", names: ["矩形波リード", "鋸波リード", "カリオペ", "チフ", "チャラング", "ボイスリード", "5度リード", "ベース+リード"] },
  { family: "シンセパッド", names: ["ニューエイジパッド", "ウォームパッド", "ポリシンセパッド", "クワイアパッド", "ボウドパッド", "メタリックパッド", "ヘイローパッド", "スイープパッド"] },
  { family: "シンセ効果", names: ["レイン", "サウンドトラック", "クリスタル", "アトモスフィア", "ブライトネス", "ゴブリン", "エコー", "SF"] },
  { family: "エスニック", names: ["シタール", "バンジョー", "三味線", "琴", "カリンバ", "バグパイプ", "フィドル", "シャナイ"] },
  { family: "パーカッシブ", names: ["ティンクルベル", "アゴゴ", "スチールドラム", "ウッドブロック", "太鼓", "メロディックタム", "シンセドラム", "リバースシンバル"] },
  { family: "効果音", names: ["ギターフレットノイズ", "ブレスノイズ", "海岸", "小鳥", "電話", "ヘリコプター", "拍手", "銃声"] },
];
// value→ラベル逆引き（簡易/全GM 双方をカバー）。要約表示や候補で使う。
export const GM_ALL: { value: number; label: string }[] = GM_ALL_FAMILIES.flatMap((f, fi) => f.names.map((label, i) => ({ value: fi * 8 + i, label })));
export function gmLabel(program: number): string {
  return GM_INSTRUMENTS.find((g) => g.value === program)?.label ?? GM_ALL.find((g) => g.value === program)?.label ?? `GM ${program}`;
}

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
  feel?: Feel | null,
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ts = meterPair(meter); // #51: 拍子記号をMIDIヘッダへ（音価は秒絶対なので不変）
  if (ts) midi.header.timeSignatures.push({ ticks: 0, timeSignature: ts });
  const spb = 60 / bpm;
  const addNotes = (track: ReturnType<Midi["addTrack"]>, ns: Note[]) => {
    for (const n of ns) {
      track.addNote({ midi: n.pitch, time: n.start * spb, duration: n.dur * spb, velocity: (n.vel ?? 100) / 127 });
    }
  };
  // 書き出し境界＝feel を適用（跳ねて聞こえる performance MIDI／feel 無しはストレートのまま＝従来一致）。
  const feltAll = feelNotes(notes, feel, meter);
  // ドラムとピッチ楽器は GM 上ch分けが必須（ch10=ドラム）。混在時は別トラックに分離＝1トラックに
  // 全部押し込んで ch9 固定にすると、ピッチ楽器が DAW でドラム音源で鳴る破綻を防ぐ（監査 SG-04）。
  const drums = feltAll.filter((n) => n.drum);
  const pitched = feltAll.filter((n) => !n.drum);
  if (pitched.length || drums.length === 0) {
    const track = midi.addTrack(); // 純ドラムでない限りピッチ用トラック（空 notes でも従来通り1トラック出す）
    if (program !== undefined) track.instrument.number = program;
    addNotes(track, pitched);
  }
  if (drums.length) {
    const dtrack = midi.addTrack();
    dtrack.channel = 9; // GMドラム=ch10
    const kit = drums.find((n) => n.drum)?.kit; // キット＝ch10のprogram change（ABILITYでも同じキットで鳴る）
    if (kit) dtrack.instrument.number = kit;
    addNotes(dtrack, drums);
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
  kit?: number; // ドラムトラックのキット（ch10 program）。
}
// レーン(トラック)の GM program を composite notes から採る＝各ノートに付与済みの program（compositeNotes 由来）の
// 最初の非nullを使う。1レーン=1楽器（コード楽器×2は別レーン）なので均一。program 無し＝undefined（track.program 未設定＝従来）。
export const trackProgramOf = (notes: Note[]): number | undefined => notes.find((n) => n.program != null)?.program;
export function tracksToMidi(tracks: MidiTrackSpec[], bpm = 120, meter?: string | null, feel?: Feel | null): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ts = meterPair(meter);
  if (ts) midi.header.timeSignatures.push({ ticks: 0, timeSignature: ts });
  const spb = 60 / bpm;
  for (const t of tracks) {
    if (!t.notes.length) continue;
    const track = midi.addTrack();
    if (t.name) track.name = t.name;
    if (t.drum) {
      track.channel = 9;
      const kit = t.kit ?? t.notes.find((n) => n.drum)?.kit;
      if (kit) track.instrument.number = kit;
    } else if (t.program !== undefined) track.instrument.number = t.program;
    for (const n of feelNotes(t.notes, feel, meter)) { // 各トラックに同一 feel＝アンサンブルで揃って跳ねる
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
  feel?: Feel | null,
): void {
  const blob = new Blob([tracksToMidi(tracks, bpm, meter, feel) as BlobPart], { type: "audio/midi" });
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
  feel?: Feel | null,
): void {
  const blob = new Blob([notesToMidi(notes, bpm, meter, program, feel) as BlobPart], {
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
  kit?: number; // ドラムキット(GM bank128 preset)。drum 音の解決でこのキットのサンプルを使う。
  part?: MixPart; // ミキサーのパート（合成再生で付与）。パート別ゲインへ振り分ける。
  lens?: string; // #20 S6骨格の机: レンズ印。playEvent が (lens,part) でレンズ別 sampler/kit を選ぶ。未指定＝従来。
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
      return { time, durSec: voice === "membrane" ? MEMBRANE_DUR : NOISE_DUR, voice, pitch: n.pitch, vel, kit: n.kit, part: n.part ?? "drums", lens: n.lens };
    }
    return { time, durSec: n.dur * spb, voice: "poly", pitch: n.pitch, vel, program: n.program, part: n.part, lens: n.lens };
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
