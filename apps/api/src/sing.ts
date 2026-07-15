// W-K3 VOICEVOX 歌唱出口：歌詞(syllable)付きメロ → VOICEVOX 歌唱スコア → wav（role=render 資産）。
// 正典＝docs/research/2026-07-15-kariuta-voicevox-feasibility.md（L4・engine 0.25.2・query=sing(6000)/
// synth=frame_decode・RTF≈0.10＝1フレーズ≒1秒＝同期実行でよい）。
// (a) engine ヘルスチェック→未起動なら ~/voicevox-poc の run を detached spawn（ポート設定化・50121既定）
// (b) メロ→スコア変換（純関数 notesToScore・TDD）(c) query=歌声→synth=声色→wav。asset(kind=audio/role=render)保存。
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assetsDir } from "./audio-asset";
import type { Core } from "./core";
import type { Asset } from "./repo/asset-repo";

// ── 設定（env 差し替え口） ─────────────────────────────────────────────────
const VV_DIR = process.env.CM_VOICEVOX_DIR ?? "/home/shuraba_p/voicevox-poc/extracted/linux-cpu-x64";
const VV_PORT = Number(process.env.CM_VOICEVOX_PORT ?? 50121);
const VV_URL = process.env.CM_VOICEVOX_URL ?? `http://127.0.0.1:${VV_PORT}`;
const SING_SPEAKER = 6000; // 歌声モデル（波音リツ・query 用）＝L4 実測で歌声は 6000 の1体のみ
const DEFAULT_FRAME_DECODE = 3009; // 声色（synth 用）既定＝波音リツ frame_decode
const FPS = 93.75; // フレームレート = 24000 / 256（L4 実測）
const DEFAULT_MORA = "ラ"; // syllable 欠落時の既定モーラ（音程確認用）
// 歌唱バンド＝この歌声モデル(query=6000 波音リツ)が「要求ピッチどおりに歌える」実測レンジ。
// 2026-07-15 実測（feasibility doc §7）：key 52〜79 は誤差±0.5半音以内で正確。
// 51/50/49 は上へ大暴走(+16/+6/+23半音)、80 は再現するオクターブ落ち(-16〜-21)、82以上も破綻。
// ＝旧 [48,72] は下限が既に壊れ・上限が狭すぎた（62-73メロで73だけ折り返され輪郭破壊）。
const RANGE_LO = 52; // E3：正確に歌える実用下限（これ未満は破綻＝上へ暴走）
const RANGE_HI = 79; // G5：正確に歌える実用上限（80はエンジンのオクターブ落ちバグ）
const MAX_SECONDS = 60; // 60秒超ガード（jobにしない同期実行の暴走止め）

// ── (b) メロ→VOICEVOX スコア 変換（純関数・TDD） ──────────────────────────
export interface SingNote { pitch: number; start: number; dur: number; syllable?: string }
export interface ScoreNote { key: number | null; frame_length: number; lyric: string }
export interface Score { notes: ScoreNote[]; shift: number; clamped: number }

const framesOf = (beats: number, secPerBeat: number) => Math.max(1, Math.round(beats * secPerBeat * FPS));

/**
 * メロ全体を k×12 半音シフトして歌唱バンド[lo,hi]に最も収める最適 k を選ぶ（音ごと折りは輪郭破壊なので廃止）。
 * - 第一基準＝バンド外に出る音数が最小。
 * - 同数タイ＝シフト後の平均ピッチがバンド中央に近い方（極端な片寄りを避け中央寄せ）。
 * - 返り＝半音単位のシフト量（k×12）。全音を等しく動かすので隣接音程列＝輪郭は不変。
 */
export function chooseOctaveShift(pitches: number[], lo = RANGE_LO, hi = RANGE_HI): number {
  if (!pitches.length) return 0;
  const center = (lo + hi) / 2;
  let best = 0;
  let bestOut = Infinity;
  let bestDist = Infinity;
  for (let k = -5; k <= 5; k++) {
    const shift = k * 12;
    let out = 0;
    let sum = 0;
    for (const p of pitches) {
      const x = p + shift;
      if (x < lo || x > hi) out++;
      sum += x;
    }
    const dist = Math.abs(sum / pitches.length - center);
    if (out < bestOut || (out === bestOut && dist < bestDist)) {
      best = shift;
      bestOut = out;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * メロ notes（拍・曲頭絶対）＋bpm → VOICEVOX Score。
 * - 先頭・末尾に休符 note（無いと破綻し得る＝L4 §3）。
 * - start の非連続（gap>0）に休符 note を挿入。オーバーラップ（gap<0）は詰めて逐次配置。
 * - syllable 欠落は既定モーラ、メリスマ "ー" は lyric:"" で母音継続（key は保持）。
 * - 音域＝**全体オクターブシフト**でバンドに寄せ（輪郭保存）、なお外れる音だけ最終手段でクランプ。
 *   shift(半音)・clamped(クランプ発生数) を Score に返す＝黙って変えない（呼び出し側でログ）。
 */
export function notesToScore(notes: SingNote[], bpm: number, opts: { defaultMora?: string; range?: [number, number] } = {}): Score {
  const spb = 60 / (bpm > 0 ? bpm : 120);
  const mora = opts.defaultMora ?? DEFAULT_MORA;
  const [lo, hi] = opts.range ?? [RANGE_LO, RANGE_HI];
  const sorted = [...notes].filter((n) => n.dur > 0).sort((a, b) => a.start - b.start);
  const shift = chooseOctaveShift(sorted.map((n) => Math.round(n.pitch)), lo, hi); // 全体シフト量（輪郭保存）
  let clamped = 0;
  const out: ScoreNote[] = [{ key: null, frame_length: framesOf(0.25, spb), lyric: "" }]; // 先頭休符
  let cursor = sorted.length ? sorted[0]!.start : 0; // 直前音符の終端（拍）
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    const gap = n.start - cursor;
    if (gap > 0) out.push({ key: null, frame_length: framesOf(gap, spb), lyric: "" }); // 休符挿入
    const isMelisma = n.syllable === "ー" || n.syllable === "ｰ";
    let key = Math.round(n.pitch) + shift; // 全体シフト適用（輪郭不変）
    if (key < lo) { key = lo; clamped++; } // なお外れる音だけ最終手段でクランプ
    else if (key > hi) { key = hi; clamped++; }
    out.push({
      key,
      frame_length: framesOf(n.dur, spb),
      lyric: isMelisma ? "" : (n.syllable && n.syllable.trim() ? n.syllable : mora), // 空 lyric＝母音継続
    });
    cursor = Math.max(cursor, n.start) + n.dur; // オーバーラップは詰め（後音を後ろへ）
  }
  out.push({ key: null, frame_length: framesOf(0.25, spb), lyric: "" }); // 末尾休符
  return { notes: out, shift, clamped };
}

/**
 * ネタの BPM 解決（B1 修正）＝tempo は neta の**DB列**(n.tempo)が正準。content.tempo/bpm は後方互換フォールバック。
 * http の POST /neta/:id/sing と MCP verb sing_neta で共用（取り違え再発を防ぐ単一ソース）。
 */
export function resolveSingBpm(neta: { tempo?: number | null; content?: unknown }): number {
  const c = (neta.content ?? {}) as { tempo?: unknown; bpm?: unknown };
  if (typeof neta.tempo === "number" && neta.tempo > 0) return neta.tempo; // DB列が第一候補
  if (typeof c.tempo === "number" && c.tempo > 0) return c.tempo;
  if (typeof c.bpm === "number" && c.bpm > 0) return c.bpm;
  return 120;
}

/** スコアの総尺（秒）＝60秒ガード用。 */
export function scoreSeconds(score: Score): number {
  return score.notes.reduce((s, n) => s + n.frame_length, 0) / FPS;
}

// ── (a) engine ヘルスチェック＋detached spawn ─────────────────────────────
async function engineUp(timeoutMs = 1500): Promise<boolean> {
  try {
    const r = await fetch(`${VV_URL}/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch { return false; }
}

async function ensureEngine(): Promise<void> {
  if (await engineUp()) return;
  if (!existsSync(join(VV_DIR, "run"))) throw new Error(`VOICEVOX engine が見つかりません（${VV_DIR}/run）。CM_VOICEVOX_DIR を設定してください`);
  // detached＝新プロセスグループで常駐起動（api が落ちても残す＝再利用）。ログは捨てる。
  const proc = spawn(join(VV_DIR, "run"), ["--host", "127.0.0.1", "--port", String(VV_PORT)], {
    cwd: VV_DIR, detached: true, stdio: "ignore",
  });
  proc.unref();
  // 起動待ち（約1秒で /version 応答・最大15秒）。
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (await engineUp()) return;
  }
  throw new Error("VOICEVOX engine の起動待ちがタイムアウトしました");
}

// ── (c) query → synth ──────────────────────────────────────────────────────
async function post(path: string, body: unknown, timeoutMs: number): Promise<Response> {
  const r = await fetch(`${VV_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`VOICEVOX ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

/** スコア → wav バイト列（query=歌声6000 → synth=声色 frameDecodeId）。 */
export async function synthesize(score: Score, frameDecodeId = DEFAULT_FRAME_DECODE): Promise<Buffer> {
  await ensureEngine();
  const secs = scoreSeconds(score);
  if (secs > MAX_SECONDS) throw new Error(`歌唱が長すぎます（${secs.toFixed(1)}秒 > ${MAX_SECONDS}秒）＝短いフレーズにしてください`);
  // query：歌声モデル(6000)で f0/volume/phonemes を作る（初回はモデル遅延ロードで ~2s・以降 <0.1s）。
  const q = await (await post(`/sing_frame_audio_query?speaker=${SING_SPEAKER}`, score, 30_000)).json();
  // synth：声色(frame_decode id)で wav へ（RTF≈0.10・音長に線形）。
  const wav = await post(`/frame_synthesis?speaker=${frameDecodeId}`, q, Math.max(15_000, Math.round(secs * 3000)));
  return Buffer.from(await wav.arrayBuffer());
}

// ── wav asset 保存＋ネタ紐付け（role=render） ───────────────────────────────
function saveWavAsset(core: Core, bytes: Buffer, name: string): Asset {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const dir = assetsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}.wav`);
  writeFileSync(path, bytes);
  return core.addAsset({ kind: "audio", name, path, size: bytes.length, mime: "audio/wav", meta: { sha256: sha, source: "voicevox" } });
}

/** melody ネタを歌わせ、wav を asset(kind=audio) 化してネタに render 紐付け。asset を返す。 */
export async function singNeta(core: Core, netaId: string, notes: SingNote[], bpm: number, frameDecodeId?: number): Promise<Asset> {
  const score = notesToScore(notes, bpm);
  // 音域調整は黙って変えない：全体シフト/クランプが起きたらログに残す（オーナーが「なぜ音が違う」を追える）。
  if (score.shift !== 0 || score.clamped > 0) {
    console.log(`[sing] neta=${netaId} bpm=${bpm} octaveShift=${score.shift}半音 clampedNotes=${score.clamped}`);
  }
  const wav = await synthesize(score, frameDecodeId ?? DEFAULT_FRAME_DECODE);
  const n = core.getNeta(netaId);
  const asset = saveWavAsset(core, wav, `${n?.title ?? "仮歌"}（VOICEVOX）`);
  core.linkAsset(netaId, asset.id, "render");
  return asset;
}
