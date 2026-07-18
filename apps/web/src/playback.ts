// #27 再生経路の一本化・駆動層（唯一のチョークポイント）。正典＝docs/research/2026-07-18-playback-path-unification.md §2.3。
// PlaybackPlan（解決層 music.ts）を受け、vocalMode に応じ ensure/peek→playNotes する。ここ以外から playNotes を
// 直接呼ばない（S5 で敷居を敷く）。副作用＋module 内可変状態（wav キャッシュ・busy 通知・現行ハンドルレジストリ）。
import { api } from "./api";
// playNotes は音源エンジンの唯一の呼び出し口＝ここ（駆動層）からのみ import する（#27 S5・ESLint no-restricted-imports で封鎖）。
import { decodeVocal, playNotes } from "./audio";
import { type Note, type PlaybackHandle, type PlaybackPlan, type VocalJob, type VocalPlay } from "./music";

export type VocalMode = "ensure" | "peek" | "off";
// ensure＝未レンダをレンダしてから鳴らす（1〜3s待ち・busy 可視化）＝カード/エディタ/Chat保存済。
// peek  ＝レンダ済みだけ歌う・絶対に待たない＝高速試聴系（#24 非ブロック契約の仮歌版）。
// off   ＝歌わない（plan の muted はunmuteして楽器で鳴らす）＝歌う対象が無い面。

// ── wav キャッシュ（module スコープ・SF2 sfBufCache と同方式・フック跨ぎ共有）─────────────
// エディタで歌わせた wav がカード/FormStrip でも即時再利用される（旧＝useVocalRender のフック毎 ref＝別インスタンス）。
const wavCache = new Map<string, { buffer: AudioBuffer; leadRestSec: number }>();
const inFlight = new Map<string, Promise<{ shift: number; clamped: number }>>(); // 同 key の二重 api.sing を構造的に防ぐ。

// ── busy 通知（sfLoading と同型・useSyncExternalStore 相性）───────────────────
type VocalBusy = { busy: boolean; progress: { done: number; total: number } | null; msg: string | null };
let snapshot: VocalBusy = { busy: false, progress: null, msg: null };
const busyListeners = new Set<() => void>();
function update(next: Partial<VocalBusy>): void {
  snapshot = { ...snapshot, ...next };
  for (const cb of busyListeners) { try { cb(); } catch { /* 購読側の例外で音を止めない */ } }
}
export function subscribeVocalBusy(cb: () => void): () => void {
  busyListeners.add(cb);
  return () => { busyListeners.delete(cb); };
}
export function vocalBusyState(): VocalBusy { return snapshot; }
export function setVocalMsg(msg: string | null): void { update({ msg }); }

// job を VocalPlay へ（buffer がキャッシュにある前提）。leadRestBeats＝api 実測 leadRestSec を拍換算。
function toPlay(j: VocalJob): VocalPlay {
  const c = wavCache.get(j.key)!;
  const spb = 60 / (j.bpm > 0 ? j.bpm : 120);
  return { buffer: c.buffer, firstNoteBeat: j.firstNoteBeat, leadRestBeats: c.leadRestSec / spb };
}

// 1本レンダ（in-flight 共有＝同 key の同時 ensure が二重 fetch しない）。返り＝shift/clamped（msg 用）。
async function renderJob(j: VocalJob): Promise<{ shift: number; clamped: number }> {
  if (wavCache.has(j.key)) return { shift: 0, clamped: 0 };
  let p = inFlight.get(j.key);
  if (!p) {
    p = (async () => {
      const r = await api.sing(j.notes, j.bpm, j.speaker, j.ensemblePitches); // 同一入力は content-hash で合成スキップ
      const buf = await decodeVocal(await (await fetch(api.assetUrl(r.assetId))).arrayBuffer());
      wavCache.set(j.key, { buffer: buf, leadRestSec: r.leadRestSec });
      return { shift: r.shift, clamped: r.clamped };
    })();
    inFlight.set(j.key, p);
    void p.catch(() => {}).finally(() => inFlight.delete(j.key));
  }
  return p;
}

// 未キャッシュ job をレンダしてから、レンダ済み全 job の VocalPlay[] を返す（再生押下時）。busy/progress を可視化。
export async function ensureVocal(jobs: VocalJob[]): Promise<VocalPlay[]> {
  const missing = jobs.filter((j) => j.notes.length > 0 && !wavCache.has(j.key));
  if (missing.length) {
    update({ busy: true, msg: null, progress: { done: 0, total: missing.length } }); // 分母＝missing のみ
    const notes: string[] = [];
    try {
      for (let i = 0; i < missing.length; i++) {
        const r = await renderJob(missing[i]!); // 直列＝進捗の意味が保たれる
        update({ progress: { done: i + 1, total: missing.length } });
        if (r.shift) notes.push(`音域を${r.shift > 0 ? "+" : ""}${r.shift}半音移調`);
        if (r.clamped) notes.push(`${r.clamped}音を歌唱帯へクランプ`);
      }
      update({ msg: notes.length ? Array.from(new Set(notes)).join("／") : null });
    } catch (e) {
      update({ msg: `仮歌の生成に失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      update({ busy: false, progress: null });
    }
  }
  return jobs.filter((j) => wavCache.has(j.key)).map(toPlay);
}

// レンダ済みだけを同期で返す（未レンダは含めない）。null＝1本もレンダ済みでない（＝従来一致・楽器で鳴る）。
export function peekVocal(jobs: VocalJob[]): VocalPlay[] | null {
  const ready = jobs.filter((j) => wavCache.has(j.key));
  return ready.length ? ready.map(toPlay) : null;
}

// ── 現行ハンドルレジストリ（stale-stop 根治・§2.3-3）───────────────────────────
// module 変数 current に世代トークンを持ち、返す Handle をラップ＝stop() は自分が現行の時だけ実 stop、
// 代替わり済みなら no-op。§1 の「Aの⏹がBを殺す」バグをクラスごと潰す。
let currentGen = 0;
let currentStop: (() => void) | null = null;

// vocalMode:"off"＝歌う印(muted+sungBy)を解除して楽器で鳴らす（歌なし面）。sungBy が無い notes は同一参照で素通し。
function unmuteSung(notes: Note[]): Note[] {
  if (!notes.some((n) => n.sungBy)) return notes;
  return notes.map((n) => (n.sungBy ? { ...n, muted: false } : n));
}

export interface StartOpts {
  vocalMode?: VocalMode; // 既定 "ensure"
  loop?: { startBeat: number; endBeat: number };
  onEnd?: () => void;
  activeLens?: string;
}

// 唯一の再生開始。null＝二重発火（ensure 進行中の再 start）で no-op ＝始めなかった（呼び出し側は playing に倒さない）。
export async function startPlayback(plan: PlaybackPlan, opts?: StartOpts): Promise<PlaybackHandle | null> {
  const vocalMode = opts?.vocalMode ?? "ensure";
  if (vocalMode === "ensure" && snapshot.busy) return null; // 二重発火ガード（§2.3-4）：ensure 進行中の再 start は no-op
  let vocal: VocalPlay[] | null = null;
  if (vocalMode === "ensure") vocal = await ensureVocal(plan.vocalJobs);
  else if (vocalMode === "peek") vocal = peekVocal(plan.vocalJobs); // 絶対に待たない
  const notes = vocalMode === "off" ? unmuteSung(plan.notes) : plan.notes;
  const gen = ++currentGen; // 代替わり＝以前のハンドルの stop を stale 化
  const h = await playNotes(notes, plan.bpm, {
    program: plan.program,
    feel: plan.feel,
    compound: plan.compound,
    vocal,
    loop: opts?.loop,
    activeLens: opts?.activeLens,
    onEnd: opts?.onEnd,
  });
  currentStop = h.stop;
  // stop だけ世代ガードでラップ（他メソッドは自分の再生に対してのみ呼ばれる＝素通し）。
  return { ...h, stop: () => { if (gen === currentGen) h.stop(); } };
}

// 現行再生の停止（所有サイト不問）。
export function stopPlayback(): void {
  currentStop?.();
}

// テスト専用リセット（module 可変状態）。実行時は未使用。
export function __resetPlaybackForTest(): void {
  wavCache.clear();
  inFlight.clear();
  snapshot = { busy: false, progress: null, msg: null };
  currentGen = 0;
  currentStop = null;
}
