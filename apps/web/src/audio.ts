// 音源エンジン（SF2/Tone.js/smplr・副作用＋モジュール内可変状態）。純ドメイン(music.ts)から分離
// ＝アーキ是正 S5。再生/試聴/プレイヘッドはここ。music.ts(純関数)はテスト容易・jsdomでToneを読まない。
// Tone/smplr/soundfont2 は再生時のみ動的import（テストで読み込まない）。
import {
  type Note,
  type MixPart,
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
  applyFeel,
  type Feel,
  totalSec,
  loopRange,
  DRUMS,
} from "./music";

export interface PlaybackHandle {
  pause(): void;
  resume(): void;
  stop(): void;
  // #20 S6骨格の机: 再生を止めずにレンズ別ゲインバスを開閉（無停止A/B）。lens 印つき notes を渡した時のみ意味あり。
  // レンズ層を持たない再生（従来）では no-op。stop 後も no-op。
  setLensGain(lens: string, on: boolean): void;
  // #7-C ループを止めず頭に戻さず、最新ノートを**その場で組み直す**（reschedule-in-place）。
  // transport.stop()/start() を呼ばず transport.cancel(0)→再スケジュール＝走行中クロックを保つ＝位置が流れ続ける。
  // 現在位置より先のイベントはこの周から鳴り、過ぎたものは次周から。停止(stop)済みハンドルでは no-op。
  // 骨格エディタ専用の加算メソッド（NetaDialog/SectionEditor 等 従来 consumer は呼ばない＝不変）。
  reschedule(notes: Note[]): void;
  // #7-C ループ区間だけを走行中に更新（transport.loopStart/loopEnd＝stop/start 不要）。範囲ブレース確定用。
  setLoopRange(startBeat: number, endBeat: number): void;
  // ループ ON/OFF を**再生を止めずその場で**切替（頭出し・全サンプラ再準備を避ける）。
  // ON＝transport.loop=true＋loop点設定＋終端 scheduleOnce（自動停止）の解除。
  // OFF＝transport.loop=false＋現在位置から終端 stop を再スケジュール。
  // #25 弱起（leadBeats>0）がある場合は非ループ⇄ループでスケジュール自体が異なる（+Lシフト vs 終端巻き込み）
  // ため in-place 不可＝呼び出し側（useTransport）が従来の stop→begin にフォールバックする責務。防御的に no-op。
  setLooping(on: boolean): void;
  // #25 弱起（負start）の再生契約：非ループ時の lead L（拍・全イベントを +L シフトし transport 0 開始）。
  // usePlayhead へ渡し、リード区間（raw beat < L）は線を 0 位置で待機・position を弱起表示にする。ループ時は 0。
  leadBeats: number;
}

interface PlayOpts {
  loop?: { startBeat: number; endBeat: number };
  onEnd?: () => void;
  program?: number; // #55c SF2旋律の音色（GM program）。未指定は0（ピアノ）。
  feel?: Feel | null; // フィール層：再生境界で applyFeel（スイング/微小タイミング）。未指定＝ストレート＝従来一致。
  compound?: boolean; // 6/8等＝スイング対象外（feel.swing skip）。
  activeLens?: string; // #20 S6: notes にレンズ印がある時、初期に開くレンズ。未指定＝全レンズ開（従来は無関係）。
}

// 単一再生：グローバル Transport を奪い合うので、現在の音源を1組だけ保持し再利用/破棄。
type Kit = { poly: any; membrane: any; noise: any };
let currentKit: Kit | null = null;

// ── マスターバス（音割れ対策・耳FB 2026-07-09）──────────────────────────
// 従来は全音源が個別に destination 直結＝出口で単純合算し、同時発音が 0dBFS を超えるとハードクリップ
// （オーバードライブ的ひずみ）。全経路を1本のマスター(パート別ゲイン→全体ゲイン→リミッター→出口)へ
// 集約する。リミッターが天井を作り**何音重なっても割れない**。生Web Audioで組む＝Tone/smplr 双方が
// ネイティブノードとして繋げる（Toneは.connect(node)、smplrは destination オプション）。
export type { MixPart }; // music.ts の型を UI へ再輸出（MixerControl 等）
const MIX_PARTS: MixPart[] = ["melody", "counter", "chord", "bass", "drums"];
const VOL_KEY = "cm.mix"; // localStorage: { master:number, melody, counter, chord, bass, drums }
type MixState = { master: number } & Record<MixPart, number>;
// counter(対旋律)＝主メロを食わない＝既定はやや控えめ 0.75（WP-X3a・独立フェーダー）。
const DEFAULT_MIX: MixState = { master: 0.8, melody: 1, counter: 0.75, chord: 0.8, bass: 0.9, drums: 0.8 };

function loadMix(): MixState {
  try {
    const raw = globalThis.localStorage?.getItem(VOL_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<MixState>;
      const clamp = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 2 ? v : d);
      return {
        master: clamp(p.master, DEFAULT_MIX.master),
        melody: clamp(p.melody, DEFAULT_MIX.melody),
        counter: clamp(p.counter, DEFAULT_MIX.counter),
        chord: clamp(p.chord, DEFAULT_MIX.chord),
        bass: clamp(p.bass, DEFAULT_MIX.bass),
        drums: clamp(p.drums, DEFAULT_MIX.drums),
      };
    }
  } catch {
    /* localStorage 不可環境（テスト等）は既定 */
  }
  return { ...DEFAULT_MIX };
}
let mix: MixState = loadMix();

// マスターチェーンのノード（生成は再生開始時・lazy）。part ゲイン→ master ゲイン→ limiter→ destination。
let masterCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let partGains: Record<MixPart, GainNode> | null = null;
// #20 S6骨格の机: レンズ別ゲインバス。partLensGain[part][lens] → partGains[part]（直列の別ゲート）。
// setMixVolume は partGains を触り、レンズゲートは partLensGain を触る＝互いに上書きしない（実効音量は積）。
// partGains 再構築（AudioContext 変化）時に null リセット＝古い partGains を指す孤児ノードを残さない。
let partLensGain: Record<MixPart, Record<string, GainNode>> | null = null;

// notes 内に現れる distinct な lens 値（定義順・undefined 除外）。純関数＝[機械]テスト対象。
export function lensesOf(notes: Note[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of notes) {
    if (n.lens != null && !seen.has(n.lens)) {
      seen.add(n.lens);
      out.push(n.lens);
    }
  }
  return out;
}

// レンズゲートの目標ゲイン。activeLens 指定→それだけ1・他0／未指定→全1。純関数＝[機械]テスト対象。
export function lensGateTargets(lensesPresent: string[], activeLens?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lensesPresent) {
    out[l] = activeLens == null ? 1 : l === activeLens ? 1 : 0;
  }
  return out;
}

// レンズ別 sampler/kit のルックアップキー。**program も含める**＝同じ part に音色違いの楽器が複数あっても
// （例：コード楽器×2 が別 GM program）各音を自分の program の sampler へルーティングする（2026-07-13 修正：
// 従来は (lens,part) だけ＝1パート1音色前提で、2つ目のコード楽器が1つ目の音色で鳴っていた）。
export const melodicMapKey = (lens: string | undefined, part: MixPart, program: number): string =>
  `${lens ?? ""}:${part}:${program}`;
const drumMapKey = (lens: string | undefined, kit: number | undefined, pitch: number): number | string => {
  const dk = drumKey(kit ?? 0, pitch);
  return lens == null ? dk : `${lens}:${dk}`;
};

// 共有 AudioContext 上にマスターチェーンを一度だけ構築し、指定パートの入口ノードを返す。
export function ensureMaster(Tone: any, part: MixPart = "melody"): AudioNode {
  const ctx: AudioContext = Tone.getContext().rawContext;
  if (!masterGain || masterCtx !== ctx) {
    masterCtx = ctx;
    masterGain = ctx.createGain();
    masterGain.gain.value = mix.master;
    // リミッター＝DynamicsCompressor をブリックウォール設定（天井 -1dBFS）。何音重なっても超えさせない。
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    masterGain.connect(limiter);
    limiter.connect(ctx.destination);
    const pg = {} as Record<MixPart, GainNode>;
    for (const p of MIX_PARTS) {
      const g = ctx.createGain();
      g.gain.value = mix[p];
      g.connect(masterGain);
      pg[p] = g;
    }
    partGains = pg;
    partLensGain = null; // partGains 再構築＝古いレンズゲインは孤児（別ctx）＝破棄して作り直す
  }
  return partGains![part];
}

// #20 S6: (part, lens) のレンズゲインバスを1つ返す（lazy・partGains[part] へ接続・既定 gain=1）。
// setMixVolume と直列＝レンズゲートで鳴らす側だけ開く。partGains 未構築なら ensureMaster が先に建てる。
export function ensureLensGain(Tone: any, part: MixPart, lens: string): AudioNode {
  ensureMaster(Tone, part); // partGains + masterCtx を保証（同 ctx なら再構築しない）
  const ctx = masterCtx!;
  if (!partLensGain) {
    partLensGain = { melody: {}, counter: {}, chord: {}, bass: {}, drums: {} };
  }
  const byLens = partLensGain[part];
  let g = byLens[lens];
  if (!g) {
    g = ctx.createGain();
    g.gain.value = 1;
    g.connect(partGains![part]);
    byLens[lens] = g;
  }
  return g;
}

// 指定レンズの全 part のゲートを on?1:0 へ。クリック回避に短いランプ（setTargetAtTime）。
// 存在するレンズゲインだけ触る（sampler 未生成の part はノードが無い＝スキップ）。
function applyLensGate(lens: string, on: boolean): void {
  if (!partLensGain || !masterCtx) return;
  const target = on ? 1 : 0;
  const now = masterCtx.currentTime;
  for (const part of MIX_PARTS) {
    const g = partLensGain[part]?.[lens];
    if (g) g.gain.setTargetAtTime(target, now, 0.005);
  }
}

// レンズゲートの初期状態を即時反映（ランプ無し＝再生開始前）。lensGateTargets の目標を各レンズへ。
function initLensGates(lenses: string[], activeLens?: string): void {
  if (!partLensGain) return;
  const targets = lensGateTargets(lenses, activeLens);
  for (const [lens, t] of Object.entries(targets)) {
    for (const part of MIX_PARTS) {
      const g = partLensGain[part]?.[lens];
      if (g) g.gain.value = t;
    }
  }
}

export function getMix(): MixState {
  return { ...mix };
}
// 全体/パート音量を反映（再生中でも即時・冪等）。localStorage に保存。
export function setMixVolume(key: "master" | MixPart, v: number): void {
  const val = Math.max(0, Math.min(2, v));
  mix = { ...mix, [key]: val };
  try {
    globalThis.localStorage?.setItem(VOL_KEY, JSON.stringify(mix));
  } catch {
    /* 保存不可は無視（音は効く） */
  }
  if (key === "master") {
    if (masterGain) masterGain.gain.value = val;
  } else if (partGains) {
    partGains[key].gain.value = val;
  }
}

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

// ドラム音声マップのキー＝(キット, GM番号)。同じ番号でもキット違いで別サンプル。
export const drumKey = (kit: number, pitch: number): number => (kit << 8) | pitch;

// velocity(0..1) → MIDI velocity(0..127)。SF2 sampler(smplr)は 0..127 を要求。
// 再生ディスパッチ(playEvent)の変換を純関数へ切り出し＝挙動不変・テスト可能。
export const velToMidi = (vel: number): number => Math.round(vel * 127);

// 1音の発音ディスパッチ（テスト可能に切り出し）。
// ドラム: SF2にマッチ楽器があればそれ、無ければ簡易キット(membrane/noise)。
// 旋律: SF2があればそれ、無ければ poly シンセ。SF2 は absolute time(秒)・velocity 0..127。
export function playEvent(
  ev: ScheduledNote,
  time: number,
  sf: any,
  kit: Kit,
  Tone: any,
  drumKits?: Map<number | string, DrumVoice>,
  melodicByPart?: Map<string, any>, // #section音色/ミキサー: (lens,)パート毎の旋律 sampler（無ければ sf）
  defaultProg = 0,
): void {
  if (ev.voice === "membrane" || ev.voice === "noise") {
    // #20 S6: レンズ印つきは (lens,kit,pitch) キー、無しは従来 drumKey（数値）で選ぶ。
    const ds = drumKits?.get(drumMapKey(ev.lens, ev.kit, ev.pitch));
    if (ds) {
      dbg("note pitch", ev.pitch, "via sf2-drum @", ds.note, "detune", ds.detune);
      // 打楽器はワンショット＝loop を明示OFF。SF2のキック等は loop点を持ち、loop有のまま
      // duration を渡すと「1発が複数回」、duration無だと鳴り続ける。loop:false で1回だけ。
      // detune(cents)で smplr の originalPitch 基準を overridingRootKey 基準へ補正(#84 S2)。
      ds.sampler.start({
        note: ds.note,
        time,
        velocity: velToMidi(ev.vel),
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
    // #section音色/ミキサー: この音の (lens,)パートに対応する旋律 sampler（無ければ既定 sf=melody）
    const inst = melodicByPart?.get(melodicMapKey(ev.lens, ev.part ?? "melody", ev.program ?? defaultProg)) ?? sf;
    dbg("note pitch", ev.pitch, "via sf2-melodic part", ev.part ?? "melody", "lens", ev.lens);
    inst.start({ note: ev.pitch, time, duration: ev.durSec, velocity: velToMidi(ev.vel) });
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
let sfLoadPromise: Promise<any | null> | null = null; // 進行中ロードを共有（先読み×再生の二重DL防止）
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
// #55e/kit: bank128/preset別の権威 GM ドラムマップ（GM番号→楽器名）。キット選択でpreset別にキャッシュ。
const sfKitMaps = new Map<number, Map<number, string>>();

function resetSfCaches(): void {
  sfSampler = null;
  sfLoadedUrl = null;
  sfLastError = null;
  sfInstrumentCount = 0;
  sfInstrumentNames = [];
  sfCurrentInstrument = null;
  sfKitMaps.clear();
  sfParsed = null;
  sfParsedUrl = null;
  sfLoadPromise = null; // SF2 変更で進行中ロードの共有も破棄（旧URLの結果を新URLに使い回さない）
  sfDrumCache.clear();
  sfMelodicCache.clear(); // #section音色: program毎の旋律samplerもSF2変更で破棄
  sfBufCache.clear(); // SF2 fetch 在庫も破棄（URL変更で古いバイトを使い回さない）
  prewarmDone = false; // SF2が変わったら先読みもやり直し
}

// SF2 プリセットの bank/preset/name は header 直下か直属かパーサ差がある。両対応の安全アクセサ。
// 引数は soundfont2 のプリセット様オブジェクト（最小ローカル型で any を撤去）。
type PresetLike = {
  header?: { bank?: number; preset?: number; name?: string };
  bank?: number;
  preset?: number;
  name?: string;
};
export const presetBank = (p: PresetLike): number => p?.header?.bank ?? p?.bank ?? 0;
export const presetNum = (p: PresetLike): number => p?.header?.preset ?? p?.preset ?? 0;
export const presetName = (p: PresetLike): string | undefined => p?.header?.name ?? p?.name;

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
const sfMelodicCache = new Map<string, any>(); // `${part}:${program}` → 旋律 sampler（パート別ゲイン接続）
// 旋律 sampler を**パート別**に用意（ミキサーのパート別ゲインに繋ぐため・耳FB 2026-07-09）。
// 各パートは1 program（compositeNotes が melody/chord/bass で別 program を付与）。同じ program でも
// パートが違えば別インスタンス＝別ゲイン。melody かつ既定 program は sfSampler(melody gain 接続済)を再利用。
async function prepareMelodicSamplers(
  notes: Note[],
  Tone: any,
  defaultProg: number,
  sf: any,
): Promise<Map<string, any>> {
  // キー＝melodicMapKey(lens,part)。lens 無しは part 文字列（従来）＝レガシー Map と同構造・同ルーティング。
  const map = new Map<string, any>();
  if (!sf || !activeSfUrl) return map;
  // (part,lens)→program（最初に見た音の program で確定）。part 無し(単体再生)は "melody" 扱い。
  type Combo = { part: MixPart; lens: string | undefined; prog: number };
  const combos = new Map<string, Combo>();
  for (const n of notes) {
    if (n.drum) continue;
    const part = n.part ?? "melody";
    const prog = n.program ?? defaultProg;
    const key = melodicMapKey(n.lens, part, prog); // program 込み＝同 part の音色違い（コード楽器×2 等）を別 sampler に分ける
    if (!combos.has(key)) combos.set(key, { part, lens: n.lens, prog });
  }
  for (const [key, { part, lens, prog }] of combos) {
    // 従来経路：lens 無し・既定 melody は sfSampler（既に melody gain 接続済）を再利用。
    // lens 付きは sf を使い回さず、必ず partLensGain 経由の専用インスタンスにする（でないとゲートが効かない）。
    if (lens == null && part === "melody" && prog === defaultProg) {
      map.set(key, sf);
      continue;
    }
    // キャッシュキーに lens を含める＝同 part/prog でもレンズ違いは別インスタンス（別ゲイン）。
    const cacheKey = `${lens ?? ""}:${part}:${prog}`;
    let s = sfMelodicCache.get(cacheKey);
    if (!s) {
      try {
        s = await makeSampler(activeSfUrl, Tone, part, lens); // このパート(・レンズ)のゲインへ接続
        await s.ready;
        const want = melodicInstrumentName(prog);
        if (want) await s.loadInstrument(want);
        sfMelodicCache.set(cacheKey, s);
      } catch (e) {
        dbg("melodic sampler load failed part/lens/prog", part, lens, prog, e);
        continue; // 失敗パートは既定sf(melody)にフォールバック
      }
    }
    map.set(key, s);
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
export function resolveSF2Ctor(mod: any): any {
  return mod?.SoundFont2 ?? mod?.default?.SoundFont2 ?? mod?.default ?? mod;
}

// SF2 本体の「一度だけDL」共有（耳FB 2026-07-09・実測で判明した致命傷の修正）。
// smplr 1.0.0 の Soundfont2 loader は storage を無視して **global `fetch(url)` を直叩き**する。旋律＋
// ドラム十数本の sampler を prewarm/再生で同時生成すると、同じ 31MB SF2 を**十数回同時DL**（実測 12回
// =370MB・キャッシュ由来0）し音出しが激遅に。しかも 31MB は大きすぎてブラウザHTTPキャッシュに乗らず
// 逐次でも再DL（実測）。対策＝**global fetch を SF2 URL だけ横取り**し、1回DLした ArrayBuffer を全 sampler
// で共有（他URLは素通し）。ネット転送は1本分に収束。parse も createSoundfont で url 単位1回。
const sfBufCache = new Map<string, Promise<ArrayBuffer>>();
let origFetch: typeof fetch | null = null;
function ensureFetchDedup(): void {
  if (origFetch) return;
  origFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: any, init?: any): Promise<any> => {
    const url = typeof input === "string" ? input : (input && input.url) || undefined;
    const shared = url ? sfBufCache.get(url) : undefined;
    // SF2本体URLだけ横取り＝共有バッファを返す（smplrは res.arrayBuffer() だけ使う）。他は素通し。
    if (shared) return shared.then((buf) => ({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(buf) }));
    return origFetch!(input, init);
  }) as typeof fetch;
}
// ── SF2 の IndexedDB 永続化（セッション跨ぎの cold 解消・design#24 backlog）────────────────
// SF2(32MB)は大きすぎてブラウザHTTPキャッシュに乗らず**毎セッション再DL**（遅回線で ~13s）。#24 の有界
// 待ちで再生ハングは避けたが初回ロード自体は毎回発生する。→ decode 前の生 ArrayBuffer を IndexedDB に
// キャッシュ（key=SF2 URL, value=ArrayBuffer）。ヒット→ネットワーク省略、ミス→fetch 後に保存。
// **保存失敗は握りつぶして fetch 結果を使う**（機能劣化させない）。掃除は「現在 URL 以外を削除」の簡易。
// IndexedDB が無い環境（jsdom 等）は get→null/put→no-op で**素通し**＝従来どおり fetch する。
const IDB_DB = "cm-sf2";
const IDB_STORE = "buffers";
function openSf2Db(): Promise<IDBDatabase | null> {
  const idb = (globalThis as any).indexedDB as IDBFactory | undefined;
  if (!idb) return Promise.resolve(null); // jsdom 等＝無ければ素通し
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(IDB_DB, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function idbGetSf2(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openSf2Db();
    if (!db) return null;
    return await new Promise<ArrayBuffer | null>((resolve) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(url);
      req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null; // 読取失敗は「ミス」扱い＝fetch へフォールバック
  }
}
async function idbPutSf2(url: string, buf: ArrayBuffer): Promise<void> {
  try {
    const db = await openSf2Db();
    if (!db) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put(buf, url);
      // 掃除：今 DL した url 以外は削除（古い SF2 の 32MB を溜めない）。
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        for (const k of keysReq.result as IDBValidKey[]) if (k !== url) store.delete(k);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // 保存失敗は握りつぶす（fetch 結果はそのまま使う）
      tx.onabort = () => resolve();
    });
  } catch {
    /* 保存不可は無視（音は fetch 結果で鳴る） */
  }
}
// テスト差し替え可能なシーム（IDB 不在環境や fake store を注入）。実行時は本体のまま。
let idbGetImpl: (url: string) => Promise<ArrayBuffer | null> = idbGetSf2;
let idbPutImpl: (url: string, buf: ArrayBuffer) => Promise<void> = idbPutSf2;

// SF2 バイト列を取得：まず IndexedDB（ヒット→ネット省略）、ミス→origFetch で1回だけ DL し保存。
async function loadSf2Bytes(url: string): Promise<ArrayBuffer> {
  const cached = await idbGetImpl(url);
  if (cached) return cached; // ヒット＝ネットワーク省略（cold 解消）
  const buf = await origFetch!(url).then((r) => r.arrayBuffer()); // 実DLは origFetch で1回だけ
  void idbPutImpl(url, buf); // 保存は待たない・失敗は握りつぶす（機能劣化させない）
  return buf;
}

// SF2 本体の in-flight 共有 + IndexedDB 経由の取得。テスト専用に export（primeSf2 は元々 internal）。
export function primeSf2(url: string): Promise<ArrayBuffer> {
  ensureFetchDedup();
  let p = sfBufCache.get(url);
  if (!p) {
    p = loadSf2Bytes(url);
    sfBufCache.set(url, p);
  }
  return p;
}

// SF2 を1個生成。本体DLは primeSf2 で url 単位1回、parse は createSoundfont で url 単位1回。
// lens 指定時は partLensGain[part][lens] を destination にする（レンズゲート経由）。未指定＝従来（partGains 直結）。
async function makeSampler(url: string, Tone: any, part: MixPart = "melody", lens?: string): Promise<any> {
  primeSf2(url); // ★ SF2 URL を横取り登録＝smplr 内の fetch(url) は共有バッファを受け取り再DLしない
  const [smplr, sf2mod] = await Promise.all([import("smplr"), import("soundfont2")]);
  const Soundfont2 = (smplr as any).Soundfont2;
  const SoundFont2 = resolveSF2Ctor(sf2mod);
  sfCtx = Tone.getContext().rawContext;
  return Soundfont2(sfCtx, {
    url,
    destination: lens != null ? ensureLensGain(Tone, part, lens) : ensureMaster(Tone, part), // 出口直結でなくマスターバス経由（音割れ対策・パート別ゲイン）
    createSoundfont: (data: Uint8Array) => {
      if (sfParsedUrl === url && sfParsed) return sfParsed;
      sfParsed = new SoundFont2(data);
      sfParsedUrl = url;
      return sfParsed;
    },
  });
}

// #24 冷スタート有界待ちの上限(ms)。SF2(32MB)先読みと▶のレース対策＝進行中ロードを最大この時間だけ
// 待ち、間に合わなければ簡易シンセへ即フォールバック（裏ロードは継続＝次回SF2）。押下→発音の上限を固定し
// 「一定しない」を根絶する。根拠＝design#24／実測 温済み再開30ms↔冷13,000ms（遅回線で無限待ちが破綻）。
const COLD_START_WAIT_MS = 400;

// #24 テスト専用シーム：ensureSoundFont が使う makeSampler を遅延フェイクへ差し替える注入口。
// 本番実行時は makeSampler 本体のまま（この変数は触れられない）。ドラム/音色別 sampler の makeSampler
// 直呼びはここを経由しない＝#24 の有界待ちロジックだけをユニットで検証するための最小シーム。
let makeSamplerImpl: (url: string, Tone: any, part?: MixPart, lens?: string) => Promise<any> = makeSampler;

// ── SF2 ロード中フラグの購読口（design#24 backlog「読込中表示」）─────────────────────────
// SF2 ロード進行中に▶を押すと #24 の有界待ちで簡易シンセにフォールバックするが、ユーザーには読込中で
// あることが分からない。TransportBar が購読して「音源読込中…」を出す（鳴らせなくはしない＝#24 どおり）。
// ロードは ensureSoundFont の in-flight（先読み prewarm 含む）で true、完了/失敗で false。
let sfLoading = false;
const sfLoadingListeners = new Set<(loading: boolean) => void>();
function setSfLoading(v: boolean): void {
  if (sfLoading === v) return;
  sfLoading = v;
  for (const cb of sfLoadingListeners) {
    try {
      cb(v);
    } catch {
      /* 購読側の例外で音を止めない */
    }
  }
}
export function isSfLoading(): boolean {
  return sfLoading;
}
// 変更通知を購読（現在値は isSfLoading で取る）。返り値は解除関数。useSyncExternalStore と相性が良い。
export function subscribeSfLoading(cb: (loading: boolean) => void): () => void {
  sfLoadingListeners.add(cb);
  return () => {
    sfLoadingListeners.delete(cb);
  };
}

// waitIfCold=false: 誰もロードしてない冷スタートでは今回フォールバック（裏でロードは進む＝次回から鳴る）。
// 進行中ロード(alreadyLoading)があっても**#24 で有界待ち**＝≤COLD_START_WAIT_MS だけ待ち、間に合えば
// 先読みと同じ SF2 を共有して鳴らし(#84)、間に合わなければ null=簡易シンセへ即フォールバック（裏ロード継続）。
// waitIfCold=true（先読み prewarmSoundFont 等の明示）は従来通り無限待ち＝挙動不変。
export async function ensureSoundFont(Tone: any, program = 0, waitIfCold = true): Promise<any | null> {
  const url = activeSfUrl;
  if (!url) return null;
  if (!(sfLoadedUrl === url && sfSampler)) {
    const alreadyLoading = !!sfLoadPromise;
    if (!sfLoadPromise) {
      // 進行中ロードを1本に集約＝先読みと再生が同時に来ても makeSampler は1回だけ。
      setSfLoading(true); // 読込中表示 ON（TransportBar が購読）
      sfLoadPromise = (async () => {
        try {
          const sampler = await makeSamplerImpl(url, Tone);
          await sampler.ready;
          sfInstrumentNames = sampler.instrumentNames ?? [];
          sfInstrumentCount = sfInstrumentNames.length;
          sfCurrentInstrument = null;
          sfSampler = sampler;
          sfLoadedUrl = url;
          sfLastError = null;
          return sampler;
        } catch (e) {
          sfLastError = e instanceof Error ? e.message || String(e) : String(e);
          console.error("[SoundFont] load failed:", e);
          sfSampler = null;
          sfLoadedUrl = null;
          return null;
        } finally {
          sfLoadPromise = null;
          setSfLoading(false); // 読込完了/失敗＝表示 OFF
        }
      })();
    }
    if (!waitIfCold) {
      // 冷スタート＝進行中ロードも無い＝今回は待たず即フォールバック（裏で新規ロードが進む）。
      if (!alreadyLoading) return null;
      // #24 進行中ロード有り＝有界待ち：≤COLD_START_WAIT_MS だけ待つ（Promise.race）。負けても
      // ロード自体は中断しない（sfLoadPromise はそのまま完走＝次回 SF2）。timeout 印は専用 Symbol。
      const TIMED_OUT = Symbol("sf-cold-wait-timeout");
      const raced = await Promise.race([
        sfLoadPromise,
        new Promise<typeof TIMED_OUT>((res) => setTimeout(() => res(TIMED_OUT), COLD_START_WAIT_MS)),
      ]);
      // 間に合わない or ロード失敗(null)＝今回は簡易シンセへフォールバック。間に合えば下の従来経路へ。
      if (raced === TIMED_OUT || !raced) return null;
    } else {
      // waitIfCold=true（先読み等）は従来通り完了まで無限待ち＝挙動不変。
      if (!(await sfLoadPromise)) return null;
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

// #24 テスト専用フック：SF ロードを遅延フェイクへ差し替え＋モジュール状態リセット。実行時は未使用
// （本番コードは呼ばない）。有界待ち契約を実 SF2 抜きでユニット検証するための最小注入口。
export function __setSfTestHooks(hooks: {
  makeSampler?: ((url: string, Tone: any, part?: MixPart, lens?: string) => Promise<any>) | null;
  // IndexedDB 永続化（#24 backlog）の get/put を fake store へ差し替える注入口（null=本体へ戻す）。
  idb?: {
    get: (url: string) => Promise<ArrayBuffer | null>;
    put: (url: string, buf: ArrayBuffer) => Promise<void>;
  } | null;
  reset?: boolean;
}): void {
  if (hooks.reset) resetSfCaches();
  if ("makeSampler" in hooks) makeSamplerImpl = hooks.makeSampler ?? makeSampler;
  if ("idb" in hooks) {
    idbGetImpl = hooks.idb?.get ?? idbGetSf2;
    idbPutImpl = hooks.idb?.put ?? idbPutSf2;
  }
}

// #55e 権威 GM ドラムマップ：SF2 の bank128/preset0("Standard"キット)のゾーンから
// GM番号→楽器名 を引く。プリセットzoneに明示keyRangeがあればそれ(kick36→Standard Kick3等)、
// 無ければそのzone楽器の内部ゾーンがその番号を含むか(Hi-Hats=42/46, Toms=41-50 等)。
function krOfZone(z: any): { lo: number; hi: number } | undefined {
  return z?.keyRange ?? z?.generators?.["43"]?.range;
}
// bank128/preset の権威マップ（GM番号→楽器名）をキャッシュ。キット選択はこの preset を変えるだけ。
function kitMap(preset: number): Map<number, string> {
  let m = sfKitMaps.get(preset);
  if (!m) {
    m = buildGmDrumMap(preset);
    sfKitMaps.set(preset, m);
  }
  return m;
}
function buildGmDrumMap(preset = 0): Map<number, string> {
  const map = new Map<number, string>();
  const presets: any[] = sfParsed?.presets ?? [];
  const std = presets.find((p) => presetBank(p) === 128 && presetNum(p) === preset);
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
export function drumNameFor(pitch: number, names: string[], kitPreset = 0): string | null {
  // 非Standardキット（アコ/エレキ選択）＝**権威マップを全ノートで使う**（808 Kick 等キット固有名）。
  // 権威に無ければ下の Standard 経路へフォールバック（後退ゼロ）。
  if (kitPreset !== 0 && sfParsed) {
    const nm = kitMap(kitPreset).get(pitch);
    if (nm && names.includes(nm)) return nm;
  }
  // Standard(0)：kick/snare はヒューリスティック（#55f 好評の音）優先、他は権威(preset0)マップ。
  const kickOrSnare = pitch <= 36 || pitch === 38 || pitch === 40;
  if (!kickOrSnare && sfParsed) {
    const fromKit = kitMap(0).get(pitch);
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
    const coarse = zoneGen(kz, 51) ?? 0;
    const fine = zoneGen(kz, 52) ?? 0;
    // #84 是正（異常ピッチ修正）：root は **overridingRootKey があれば必ずそれ（音程意図＝トム/tune込み）、
    // 無ければ叩いた鍵 gmPitch（＝自然音高）**。従来の `?? op(originalPitch)` が、rootKey 無しのゾーンで
    // (GM番号 − originalPitch) ぶん勝手にピッチを飛ばしていた（ride2=+8 等の異常）。
    // 実効ピッチ eff = (gmPitch − root) + tune ＝ rootKey ありは spec 準拠、無しは 0（自然）。
    const root = zoneGen(kz, 58) ?? gmPitch;
    return {
      note: gmPitch,
      detune: drumDetune(op, root, coarse, fine),
      stopId: exclusiveOf(kz),
    };
  }
  const z0 = zones.find((z) => z?.sample) ?? zones[0];
  const op = z0?.sample?.header?.originalPitch ?? 60;
  return { note: op, detune: 0, stopId: exclusiveOf(z0) };
}

// ドラム1種をロード（楽器名キャッシュ）。失敗時 null＝その音は簡易キットにフォールバック。
// lens 指定時は drums のレンズゲイン経由・キャッシュキーに lens を含める（レンズ違い＝別インスタンス）。
async function loadDrumSampler(name: string, Tone: any, lens?: string): Promise<any | null> {
  if (!activeSfUrl) return null;
  const cacheKey = `${lens ?? ""}:${name}`;
  if (sfDrumCache.has(cacheKey)) return sfDrumCache.get(cacheKey);
  try {
    const s = await makeSampler(activeSfUrl, Tone, "drums", lens); // ドラムは drums パート(・レンズ)ゲインへ
    await s.ready;
    await s.loadInstrument(name);
    sfDrumCache.set(cacheKey, s);
    return s;
  } catch (e) {
    console.error("[SoundFont] drum load failed:", name, e);
    return null;
  }
}

export type DrumVoice = { sampler: any; note: number; detune: number; stopId?: string };

// 再生に出てくるドラム音(pitch)→ {sampler, 鳴らすnote}。ドラムは原音高で鳴らすと自然。
// トムだけ音程差が要るので root を中心に GM番号で上下させる。
async function prepareDrumKits(notes: Note[], Tone: any): Promise<Map<number | string, DrumVoice>> {
  // キー＝drumMapKey(lens,kit,pitch)。lens 無しは drumKey 数値（従来）＝レガシー Map と同型・同ルーティング。
  const map = new Map<number | string, DrumVoice>();
  if (!sfInstrumentNames.length) return map;
  // (キット, GM番号[, レンズ]) の組ごとにサンプラを用意（アコ/エレキ混在もOK＝section内で別kit可）。
  const seen = new Map<string, { lens: string | undefined; kit: number; pitch: number }>();
  for (const n of notes) {
    if (!n.drum) continue;
    const sig = `${n.lens ?? ""}|${drumKey(n.kit ?? 0, n.pitch)}`;
    if (!seen.has(sig)) seen.set(sig, { lens: n.lens, kit: n.kit ?? 0, pitch: n.pitch });
  }
  // #84 S0: ドラムサンプラのロードを並列化（直列awaitで初回再生が1〜2.5s重い問題を緩和）。
  const loaded = await Promise.all(
    [...seen.values()].map(async ({ lens, kit, pitch }) => {
      const name = drumNameFor(pitch, sfInstrumentNames, kit);
      if (!name) return null;
      const s = await loadDrumSampler(name, Tone, lens);
      if (!s) return null;
      const v = drumVoiceFor(name, pitch); // #84 S2/S3: note＋ピッチ補正detune＋choke stopId
      return { key: drumMapKey(lens, kit, pitch), name, sampler: s, note: v.note, detune: v.detune, stopId: v.stopId };
    }),
  );
  for (const r of loaded) {
    if (!r) continue;
    map.set(r.key, { sampler: r.sampler, note: r.note, detune: r.detune, stopId: r.stopId });
    dbg("drum", r.key, "->", r.name, "@note", r.note, "detune", r.detune, "stopId", r.stopId);
  }
  return map;
}

// #84 先読み：旋律＋標準ドラムを裏でロードしてキャッシュを温める。初回再生で 885ms 待たされる問題を解消。
// **ユーザー操作は不要**＝SF2 の fetch/parse/decode は suspended な AudioContext でできる（Tone.start＝resume は
// 実際に音を出す瞬間=再生クリックだけで要る）。よって画面ロード直後（URL確定後）に呼べる。冪等。
let prewarmDone = false;
const COMMON_DRUMS = [36, 38, 42, 46, 41, 45, 48, 49, 51, 39, 37]; // kick/snare/hh/tom/crash/ride/clap/rim
export async function prewarmSoundFont(): Promise<void> {
  if (prewarmDone || !activeSfUrl) return;
  prewarmDone = true;
  try {
    const Tone = await import("tone");
    // Tone.start() は呼ばない＝gesture 不要。samples は suspended ctx に decode され、
    // 再生クリック時の Tone.start() で即鳴る（その時にはもう温まっている）。
    await ensureSoundFont(Tone, 0); // 旋律(ピアノ)サンプラ
    await prepareDrumKits(
      COMMON_DRUMS.map((p) => ({ pitch: p, start: 0, dur: 0.25, drum: true })),
      Tone,
    );
    dbg("prewarm done");
  } catch (e) {
    dbg("prewarm failed (retry next gesture)", e); // 握り潰さず可視化（#84 是正）
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

// 単発プレビュー用フォールバック（SF2 未ロード時）。生成→発音→少し後に dispose（ノード蓄積を防ぐ）。
function previewFallbackMelodic(Tone: any, pitch: number, vel: number, now: number, holdSec?: number): void {
  const dur = holdSec ?? 0.4; // 未指定＝従来 0.4s（bit 一致）。ダイアッド試聴は holdSec で伸ばす。
  const s = new Tone.Synth().connect(ensureMaster(Tone, "melody"));
  s.triggerAttackRelease(Tone.Frequency(pitch, "midi").toNote(), dur, now, vel);
  setTimeout(() => { try { s.dispose(); } catch { /* already disposed */ } }, Math.round(dur * 1000) + 300);
}
function previewFallbackDrum(Tone: any, pitch: number, vel: number, now: number): void {
  if (pitch <= 41) {
    const m = new Tone.MembraneSynth().connect(ensureMaster(Tone, "drums"));
    m.triggerAttackRelease(Tone.Frequency(pitch, "midi").toFrequency(), 0.15, now, vel);
    setTimeout(() => { try { m.dispose(); } catch { /* */ } }, 500);
  } else {
    const n = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(ensureMaster(Tone, "drums"));
    n.triggerAttackRelease(0.05, now, vel);
    setTimeout(() => { try { n.dispose(); } catch { /* */ } }, 400);
  }
}

// 音符を置いた時にその音を即鳴らす（エディタの入力フィードバック）。Transport を使わず Tone.now() で
// 発音＝再生中でも止めない・低遅延。SF2 があればそれ（drum はキット・melodic は program）、無ければ簡易シンセ。
// 失敗は無音で握り潰す（音が出なくても入力は止めない）。
// opts.holdSec（#20 S6 D2）：melodic の持続を上書き（未指定＝従来 0.45s＝既存呼び出し bit 一致）。ダイアッド
//   試聴（接点の2音）は 0.45s では短すぎて不協和が聴き取れない＝呼び出し側で 0.8拍相当の秒を渡す。drum は据え置き。
export async function previewNote(note: Note, opts?: { holdSec?: number }): Promise<void> {
  try {
    const Tone = await import("tone");
    await Tone.start();
    const now = Tone.now();
    const vel127 = Math.round(note.vel ?? 100);
    const holdSec = opts?.holdSec;
    // 入力FBは常に素のバスで鳴らす＝レンズ印は無視（閉じたレンズゲイン経由で無音化しない）。
    note = note.lens != null ? { ...note, lens: undefined } : note;
    const sf = await ensureSoundFont(Tone, note.program ?? 0, false);
    if (note.drum) {
      if (sf) {
        const kits = await prepareDrumKits([note], Tone);
        const ds = kits.get(drumKey(note.kit ?? 0, note.pitch));
        if (ds) {
          ds.sampler.start({ note: ds.note, time: now, velocity: vel127, loop: false, detune: ds.detune });
          return;
        }
      }
      previewFallbackDrum(Tone, note.pitch, vel127 / 127, now);
      return;
    }
    if (sf) {
      const byPart = await prepareMelodicSamplers([note], Tone, note.program ?? 0, sf);
      const inst = byPart.get(note.part ?? "melody") ?? sf;
      inst.start({ note: note.pitch, time: now, duration: holdSec ?? 0.45, velocity: vel127 });
      return;
    }
    previewFallbackMelodic(Tone, note.pitch, vel127 / 127, now, holdSec);
  } catch {
    /* preview 失敗は無音（入力は止めない） */
  }
}

// #25 弱起（負start）の再生契約：スケジュールの時刻変換を純関数へ切り出す（Tone非依存＝テスト可能）。
// lead L = max(0, −min(start))。弱起が無ければ L=0 で入力 notes を**同一参照でそのまま**返す（全経路 bit 一致）。
//  - 非ループ（loop=false）：全ノートを +L 拍シフト（transport 0 開始＝音響上「−L から始まる」と等価）。
//    先頭が弱起ぶんマイナスから鳴り、下拍以降は +L 拍後ろへ。返す leadBeats は視覚(usePlayhead)・終端(onEnd)へ。
//  - ループ（loop=true）：0拍開始・start<0 のノートだけ loopEnd(=loopEndBeat) + start へ置く（＝ループ終端で
//    「次周の頭への弱起」として鳴る）。他ノートは無シフト＝同一参照。leadBeats は常に 0（頭からループ）。
// 却下案（ウェーブC）：再生入口で負start を t=0 へ丸める（頭拍に潰れる）＝本契約で置き換え。書き出し側の
//   小節プリロール＋clampNegativeStarts 保険は別契約でそのまま（#25-4）。
export function pickupSchedule(
  notes: Note[],
  opts: { loop: boolean; loopEndBeat?: number | null },
): { notes: Note[]; leadBeats: number } {
  let minStart = Infinity;
  for (const n of notes) if (n.start < minStart) minStart = n.start;
  const hasPickup = minStart < 0; // notes 空 or 全 start>=0 なら false
  const leadBeats = hasPickup ? -minStart : 0;
  if (opts.loop) {
    // ループ：弱起は loopEnd + start（範囲窓 [s,e) でも e+start）。他は無シフト＝同一参照。
    if (!hasPickup) return { notes, leadBeats: 0 };
    const e = opts.loopEndBeat ?? 0;
    return {
      notes: notes.map((n) => (n.start < 0 ? { ...n, start: e + n.start } : n)),
      leadBeats: 0,
    };
  }
  // 非ループ：弱起が無ければ入力そのまま（bit 一致）、有れば全ノートを +L シフト。
  if (leadBeats === 0) return { notes, leadBeats: 0 };
  return { notes: notes.map((n) => ({ ...n, start: n.start + leadBeats })), leadBeats };
}

// Tone.js は再生時のみ動的import（jsdom/テストで読み込まない）。
// #57①: Tone.Transport ベース。戻り値 Handle で pause/resume/stop（②でUI配線）。
// 既存呼び出し元は `void playNotes(notes, tempo)` のままでも従来通り鳴る（後方互換）。
export async function playNotes(
  notes: Note[],
  bpm = 120,
  opts: PlayOpts = {},
): Promise<PlaybackHandle> {
  // フィール層：再生境界で feel を適用（スイング/微小タイミング）。SSOTのnotesはストレート・ここで跳ねさせる。
  // 未指定＝恒等＝従来一致。start/dur のみ変わるので samplers（pitch/program/part 依存）には無影響。
  // tempo を渡す＝humanize が ms 絶対時間＋部位別リミット＋ヨレ警告で効く（WP-D2・研究 humanize-perception-defaults）。
  if (opts.feel) notes = applyFeel(notes, opts.feel, { compound: opts.compound, tempo: bpm });
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
  // 冷スタートはブロックせずフォールバック（次回warm）。ただし先読み等のロードが進行中なら待って SF2 で鳴らす。
  const sf = await ensureSoundFont(Tone, defaultProg, false);
  // #7-C reschedule で差し替えるため let（新パート/プログラム/lens/drum が出たら prepare を追加で呼んで更新）。
  let drumKits = sf ? await prepareDrumKits(notes, Tone) : new Map<number | string, DrumVoice>();
  // #section音色: パート毎(program毎)の旋律 sampler を用意（合成再生で音色を保つ）
  let melodicByPart = sf ? await prepareMelodicSamplers(notes, Tone, defaultProg, sf) : new Map<string, any>();
  // #7-C 開くべきレンズ＝最後に指定された activeLens（setLensGain/reschedule で表示とずれないよう保持）。
  let currentActiveLens = opts.activeLens;
  // フィール層の設定を保持（reschedule でも最新ノートへ同じ跳ねを適用＝初回一括経路と一致）。
  const feel = opts.feel ?? null;
  const compound = opts.compound;
  // #20 S6骨格の机: notes にレンズ印があれば両レンズを同時スケジュール済み。上の sampler 生成で
  // partLensGain が構築されているので、初期ゲート（activeLens だけ開く・未指定は全開）を反映する。
  const lenses = lensesOf(notes);
  if (lenses.length) initLensGates(lenses, opts.activeLens);
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
    poly: new Tone.PolySynth(Tone.Synth).connect(ensureMaster(Tone, "melody")),
    membrane: new Tone.MembraneSynth().connect(ensureMaster(Tone, "drums")),
    noise: new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(ensureMaster(Tone, "drums")),
  };
  currentKit = kit;

  transport.bpm.value = bpm;
  // #25 弱起（負start）の再生契約：loop の有無で時刻変換が変わる（pickupSchedule）。isLoop は const、
  // loopEndBeat は setLoopRange（走行中窓変更）で更新＝次の reschedule が新窓終端へ弱起を再配置する（let）。
  const isLoop = !!opts.loop;
  let loopEndBeat: number | null = opts.loop ? opts.loop.endBeat : null;
  // setLooping（in-place ループ切替）用の窓（拍）。setLoopRange で走行中更新。既定＝[0, 全尺拍]。
  const spb = 60 / bpm;
  const totalBeats = notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
  let loopStartBeat = opts.loop ? opts.loop.startBeat : 0;
  // 非ループ時の lead L（拍）＝先頭の弱起ぶん。全イベントを +L シフトして 0 開始する分の視覚/終端補正に使う。
  // 初回 notes から算出（ループ時は常に 0）。reschedule でノートが変わっても onEnd/視覚は初回で固定＝#7-C は
  // 主にループ経路（骨格エディタ）で lead=0。
  const leadBeats = pickupSchedule(notes, { loop: isLoop, loopEndBeat }).leadBeats;
  // #7-C 発音イベントの一括スケジュール（初回 begin・reschedule 双方で再利用）。sf/kit は const、
  // drumKits/melodicByPart は let＝reschedule で差し替えた最新 Map を各 playEvent が参照する。
  const scheduleFrom = (finalNotes: Note[]): void => {
    // #25 弱起（負start）を再生でも鳴らす。却下案（t=0 丸め）を撤去し pickupSchedule で置き換え：
    //   非ループ＝全ノート +L シフト（transport 0 開始）／ループ＝弱起を loopEnd+start へ巻き込む。
    const { notes: scheduled } = pickupSchedule(finalNotes, { loop: isLoop, loopEndBeat });
    for (const ev of scheduleTimes(scheduled, bpm)) {
      transport.schedule(
        (time: number) => playEvent(ev, time, sf, kit, Tone, drumKits, melodicByPart, defaultProg),
        ev.time,
      );
    }
  };
  scheduleFrom(notes); // 初回＝従来と bit 一致（notes は上で feel 適用済み）。

  let stopped = false;
  // #7-C その場組み直し本体（async＝新サンプラの追加ロードがあるが cache 済は即時＝走行中クロックはほぼ進まない）。
  // stop/start を呼ばない＝頭に戻らない・音が途切れない。transport.loop/loopStart/loopEnd は保持（別途 setLoopRange で更新）。
  const doReschedule = async (rawNotes: Note[]): Promise<void> => {
    if (stopped) return; // 破棄済みハンドル（kit dispose 済）では鳴らさない
    const finalNotes = feel ? applyFeel(rawNotes, feel, { compound, tempo: bpm }) : rawNotes;
    transport.cancel(0); // 予約済みを全消し（部分 cancel はループ再火と二重化するので不可）
    if (sf) {
      // 新パート/プログラム/lens/drum が出ても map を最新へ（cache 済は即時＝再DL/再parseゼロ＝SF2 dedup 維持）。
      drumKits = await prepareDrumKits(finalNotes, Tone);
      melodicByPart = await prepareMelodicSamplers(finalNotes, Tone, defaultProg, sf);
    }
    if (stopped) return; // await 中に stop された場合は鳴らさない
    const lenses = lensesOf(finalNotes);
    if (lenses.length) initLensGates(lenses, currentActiveLens); // レンズ層があればゲート再初期化（開くレンズは保持中の activeLens）
    scheduleFrom(finalNotes); // 現在位置より先はこの周から・過ぎたものは次周から鳴る
  };
  // 非ループ時の終端 自動停止イベント。setLooping で ON にする時は解除、OFF に戻す時は再スケジュール。
  // id を保持し transport.clear(id) で個別解除（cancel(0) は全消し＝発音イベントも消すので使えない）。
  let endEventId: number | null = null;
  const endStopSec = () => totalSec(notes, bpm) + leadBeats * spb; // +L 追従（lead 無し＝従来一致）
  const scheduleEndStop = (): void => {
    endEventId = transport.scheduleOnce(() => {
      opts.onEnd?.();
      handle.stop();
    }, endStopSec());
  };
  const clearEndStop = (): void => {
    if (endEventId != null) {
      transport.clear(endEventId);
      endEventId = null;
    }
  };
  const handle: PlaybackHandle = {
    pause: () => {
      if (!stopped) transport.pause();
    },
    resume: () => {
      if (!stopped) transport.start();
    },
    // #20 S6: 再生を止めずにレンズゲートを開閉（短ランプでクリック回避）。stop 後・レンズ層無しは no-op。
    // #7-C: 開いたレンズ（on=true）を activeLens として保持＝以後の reschedule が正しいレンズで初期ゲートを張る。
    setLensGain: (lens: string, on: boolean) => {
      if (stopped) return;
      applyLensGate(lens, on);
      if (on) currentActiveLens = lens;
    },
    // #7-C ループを止めず頭に戻さず、最新ノートをその場で組み直す（cancel(0)→再スケジュール・fire-and-forget）。
    reschedule: (rawNotes: Note[]) => {
      void doReschedule(rawNotes);
    },
    // #7-C ループ窓だけを走行中に更新（stop/start 不要）。beat→秒（loopRange と同じ spb 換算）。
    // #25 loopEndBeat も更新＝次の reschedule で弱起を新窓終端（e+start）へ再配置（reschedule 経由で自然に効く）。
    setLoopRange: (startBeat: number, endBeat: number) => {
      if (stopped) return;
      transport.loopStart = startBeat * spb;
      transport.loopEnd = endBeat * spb;
      loopStartBeat = startBeat;
      loopEndBeat = endBeat;
    },
    // ループ ON/OFF を再生を止めずその場で切替（頭出し・全サンプラ再準備を避ける＝toggleLoop の in-place 化）。
    setLooping: (on: boolean) => {
      if (stopped) return;
      // #25 弱起（leadBeats>0）は非ループ⇄ループでスケジュールが根本的に異なる（+Lシフト vs 終端巻き込み）。
      // in-place では割れる＝useTransport が leadBeats>0 で従来の stop→begin に回す。ここは防御的に no-op。
      if (leadBeats > 0) return;
      if (on) {
        clearEndStop(); // 終端 自動停止を解除（ループは止めない）
        transport.loop = true;
        transport.loopStart = loopStartBeat * spb;
        transport.loopEnd = (loopEndBeat ?? totalBeats) * spb;
      } else {
        transport.loop = false;
        scheduleEndStop(); // 現在位置から終端 stop を再スケジュール（+L 追従）
      }
    },
    // #25 非ループ時の lead L（拍）。useTransport が usePlayhead へ渡す（リード区間の 0 待機・弱起表示）。
    leadBeats,
    stop: () => {
      if (stopped) return; // 冪等
      stopped = true;
      transport.stop();
      transport.cancel(0);
      transport.loop = false;
      disposeKit();
      try {
        sf?.stop(); // SF2 の鳴っている音も止める（尾を切る。サンプラ自体は再利用のため破棄しない）
        for (const s of melodicByPart.values()) s?.stop?.(); // #section音色: 各パートsamplerも止める
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
    // 非ループ時のみ終端で自動停止。#25 弱起ぶん全イベントを +L シフトしたので終端も +L 追従（lead 無し＝従来一致）。
    scheduleEndStop();
  }

  transport.start();
  return handle;
}
