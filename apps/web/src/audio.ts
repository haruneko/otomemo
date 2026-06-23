// 音源エンジン（SF2/Tone.js/smplr・副作用＋モジュール内可変状態）。純ドメイン(music.ts)から分離
// ＝アーキ是正 S5。再生/試聴/プレイヘッドはここ。music.ts(純関数)はテスト容易・jsdomでToneを読まない。
// Tone/smplr/soundfont2 は再生時のみ動的import（テストで読み込まない）。
import {
  type Note,
  type ChordEntry,
  type RhythmContent,
  type CompositeChild,
  type BassContext,
  type ScheduledNote,
  notesForContent,
  compositeNotes,
  chordsOf,
  rhythmToNotes,
  programOf,
  scheduleTimes,
  totalSec,
  loopRange,
  DRUMS,
} from "./music";

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
    } catch (e) {
      dbg("disposeKit: node dispose failed (already disposed?)", e); // 無音にしない（診断ログ）
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
