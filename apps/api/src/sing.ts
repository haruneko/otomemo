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
export const FPS = 93.75; // フレームレート = 24000 / 256（L4 実測）
// #13c 句頭子音カウントイン（2026-07-16・正典＝docs/research/2026-07-16-vocal-consonant-countin.md §3.4）。
// 先頭休符のテンポ非依存な時間床（秒）。VOICEVOX は子音を母音頭の手前（先頭休符の後半）に置く（実測 §1）。
// 0.25拍だけだと速いテンポで子音がはみ出す（bpm140=107ms＜子音上限 sh≈128ms）ので、先頭休符を
// 「0.25拍 と この床 の大きい方」にする＝速いテンポでも子音ぶんの前余白を確保。**耳で聴いて増減する定数
// ＝owner が「もっと前余白／一小節前から」を望めばここを上げる（0.18〜0.25s が試聴を損なわない推奨域）**。
// web 側のカウントイン量は /sing 応答 leadRestSec 経由でこの床に自動追従（SSOT）。
export const SING_LEAD_REST_SEC = 0.18;
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
 * C. 単声正規化（monophonic 化）＝VOICEVOX ScoreNote は key 1本＝和音を歌わせるユースケースは無い。
 * 重複音を残すと notesToScore が直列に詰め wav が膨張し隣の子へはみ出す（Section 通し再生バグの主因）。
 * (a) 同拍（同 start）複数音 → 最上声（最高 pitch）1音だけ採用。
 * (b) 部分オーバーラップ（前音が次音 start を越える）→ 前音の dur を次音 start でクリップ（gap<0 を作らない）。
 * 入力が既に単声なら**そのまま返す＝出力不変（bit一致）**。sorted は start 昇順・dur>0 前提。
 */
function monophonic(sorted: SingNote[]): SingNote[] {
  // (a) 同 start は最高 pitch のみ残す（sorted は start 昇順なので隣接比較で足りる）。
  const deduped: SingNote[] = [];
  for (const n of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && last.start === n.start) {
      if (n.pitch > last.pitch) deduped[deduped.length - 1] = n; // 最上声で置換
    } else {
      deduped.push(n);
    }
  }
  // (b) 前音の終端が次音 start を越えるならクリップ（同 start は (a) で除去済み＝次音 start は必ず前音 start より大）。
  const out: SingNote[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const n = deduped[i]!;
    const next = deduped[i + 1];
    const dur = next && n.start + n.dur > next.start ? next.start - n.start : n.dur;
    if (dur > 0) out.push(dur === n.dur ? n : { ...n, dur }); // 不変音はそのまま（参照温存＝bit一致意図を明示）
  }
  return out;
}

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
export function notesToScore(
  notes: SingNote[],
  bpm: number,
  opts: { defaultMora?: string; range?: [number, number]; forcedShift?: number } = {},
): Score {
  const spb = 60 / (bpm > 0 ? bpm : 120);
  const mora = opts.defaultMora ?? DEFAULT_MORA;
  const [lo, hi] = opts.range ?? [RANGE_LO, RANGE_HI];
  // C. 単声正規化＝重複音での wav 膨張を根治（単声入力はそのまま＝bit一致）。
  const sorted = monophonic([...notes].filter((n) => n.dur > 0).sort((a, b) => a.start - b.start));
  // A. forcedShift（ensemble 由来）指定時はそれを使う＝子ごと独立正規化のオクターブ割れを防ぐ。
  //    undefined＝現状の chooseOctaveShift（0 も有効値なので ?? で通す＝bit一致）。
  const shift = opts.forcedShift ?? chooseOctaveShift(sorted.map((n) => Math.round(n.pitch)), lo, hi);
  let clamped = 0;
  // #13c 先頭休符＝「0.25拍」と「時間床 SING_LEAD_REST_SEC」の大きい方（テンポ非依存の子音前余白）。末尾休符は据え置き。
  //     B. 先頭/末尾休符は**現行式のまま**＝グリッド原点は最初のノートの start（弱起/カウントインと非衝突・SSOT不変）。
  const leadRestFrames = Math.max(framesOf(0.25, spb), Math.round(SING_LEAD_REST_SEC * FPS));
  const out: ScoreNote[] = [{ key: null, frame_length: leadRestFrames, lyric: "" }]; // 先頭休符（床付き）
  // B. 絶対拍グリッド量子化：各音長を独立丸めせず、絶対拍カーソルの累積フレーム境界を各オンセット/オフセットで求め、
  //    frame_length = 今回境界 − 前回境界。誤差を各点 ±0.5フレーム(±5.3ms) に有界化＝句内ドリフト（進むほど遅延）の根治。
  const firstBeat = sorted.length ? sorted[0]!.start : 0; // グリッド原点＝最初のノートの start
  const boundary = (beat: number) => leadRestFrames + Math.round((beat - firstBeat) * spb * FPS);
  let prevFrame = leadRestFrames; // 直前に確定した絶対フレーム位置（先頭休符の終端＝boundary(firstBeat)）
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    const onsetFrame = boundary(n.start);
    const restLen = onsetFrame - prevFrame; // gap 休符ぶんの絶対フレーム差
    if (restLen > 0) out.push({ key: null, frame_length: restLen, lyric: "" }); // 境界差0の休符は挿入しない（frame_length=0不可）
    const offsetFrame = boundary(n.start + n.dur);
    const isMelisma = n.syllable === "ー" || n.syllable === "ｰ";
    let key = Math.round(n.pitch) + shift; // 全体シフト適用（輪郭不変）
    if (key < lo) { key = lo; clamped++; } // なお外れる音だけ最終手段でクランプ
    else if (key > hi) { key = hi; clamped++; }
    out.push({
      key,
      frame_length: Math.max(1, offsetFrame - onsetFrame), // 境界差0の音符は min 1フレーム（一回性ズレ・累積しない）
      lyric: isMelisma ? "" : (n.syllable && n.syllable.trim() ? n.syllable : mora), // 空 lyric＝母音継続
    });
    prevFrame = offsetFrame; // 絶対グリッド位置で継続（min 1 の膨らみは次音へ伝播しない＝有界化の要）
  }
  out.push({ key: null, frame_length: framesOf(0.25, spb), lyric: "" }); // 末尾休符（現行式のまま）
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
// extraMeta＝汎用歌唱（/sing）の入力ハッシュ等を meta に足す口（既定呼び出しは不変＝singNeta 挙動温存）。
function saveWavAsset(core: Core, bytes: Buffer, name: string, extraMeta?: Record<string, unknown>): Asset {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const dir = assetsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}.wav`);
  writeFileSync(path, bytes);
  return core.addAsset({ kind: "audio", name, path, size: bytes.length, mime: "audio/wav", meta: { sha256: sha, source: "voicevox", ...extraMeta } });
}

/**
 * ネタ非依存の汎用歌唱（http POST /sing）＝Section の仮歌用。notes(拍・曲頭絶対)＋bpm＋声色 → wav asset。
 * - ネタに **リンクしない**（section の一時的な仮歌・render 資産の氾濫を避ける）。kind=audio。
 * - **content-hash 重複排除**＝同じ score(=同じ notes/bpm)＋speaker は既存 audio 資産を再利用し VOICEVOX 合成を
 *   スキップ（自然キャッシュ＝テンポ/ノート/歌詞が変わらなければ再レンダしない）。実体ファイルが消えてたら作り直す。
 * - 合成コア（notesToScore/synthesize/60秒ガード）は /neta/:id/sing と完全共用＝二重実装しない。
 */
/** 汎用歌唱のキャッシュキー＝スコア(音域シフト適用後の実発音列)＋声色。notes/bpm/歌詞のどれが変わっても別キー＝別 wav（純関数・TDD）。 */
export function singHashOf(score: Score, speaker: number): string {
  return createHash("sha256").update(JSON.stringify({ notes: score.notes, speaker })).digest("hex");
}

/** 既存 audio 資産から同一 singHash かつ実体ファイルが残っているものを探す（無ければ null）＝合成スキップの自然キャッシュ。 */
export function findCachedSing(core: Core, singHash: string): Asset | null {
  for (const a of core.listAssets("audio")) {
    const m = (a.meta ?? {}) as { singHash?: string };
    if (m.singHash === singHash && existsSync(a.path)) return a;
  }
  return null;
}

export async function singGeneric(
  core: Core,
  notes: SingNote[],
  bpm: number,
  frameDecodeId?: number,
  forcedShift?: number, // A. ensemble（全歌う子の結合音高）由来のオクターブシフト。undefined＝この子単独で決定（bit一致）
): Promise<{ asset: Asset; shift: number; clamped: number; cached: boolean; leadRestSec: number }> {
  const score = notesToScore(notes, bpm, { forcedShift });
  // #13c SSOT：実測の先頭休符長（秒）＝再生側カウントイン量。web は leadRestSec/spb を VocalPlay.leadRestBeats に使う。
  const leadRestSec = score.notes[0]!.frame_length / FPS;
  const speaker = frameDecodeId ?? DEFAULT_FRAME_DECODE;
  const singHash = singHashOf(score, speaker);
  const hit = findCachedSing(core, singHash);
  if (hit) return { asset: hit, shift: score.shift, clamped: score.clamped, cached: true, leadRestSec }; // 合成せず再利用
  if (score.shift !== 0 || score.clamped > 0) {
    console.log(`[sing/generic] bpm=${bpm} octaveShift=${score.shift}半音 clampedNotes=${score.clamped}`);
  }
  const wav = await synthesize(score, speaker); // 60秒ガードは synthesize 内（共用）
  const asset = saveWavAsset(core, wav, "仮歌（Section・VOICEVOX）", { singHash });
  return { asset, shift: score.shift, clamped: score.clamped, cached: false, leadRestSec };
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
