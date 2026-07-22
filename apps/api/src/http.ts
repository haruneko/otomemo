import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { createReadStream, createWriteStream, mkdirSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Core } from "./core";
import { netaInputSchema, netaPatchSchema, jobInputSchema, scopeEnum, scopeQueryEnum } from "./schemas";
import { singNeta, singGeneric, resolveSingBpm, chooseOctaveShift, listSingVoices } from "./sing"; // ♪歌う（W-K3 VOICEVOX 歌唱出口・MCP verb と共用）
import {
  genChords,
  genMelody,
  genSkeletonCandidates,
  genFromEssence,
  genChordPattern,
  genBass,
  genCounter,
  genRiff,
  genSectionInst,
  genDrums,
  genNamedProgression,
  analyzeFit,
  fitToChords,
  detectKeyFromNotes,
  detectKeyCandidatesFromNotes,
  detectKeyFromChords,
  melodySimilarity,
  findSimilar,
  similarityWarning,
  originalityReport,
  melodyEssence,
  normalizeToC,
  identifyProgression,
  analyzeProgression,
  explainProgression,
  harmonize,
  parseChordSymbol,
  substitutesOf,
  suggestClicheLines,
  suggestKeyPlan,
  suggestForm,
  suggestEnergyPlan,
  toDegrees,
  isMinorFrame,
  normalizeFrame,
  barsOf,
} from "./music";
import { checkLoop } from "./music/loopCheck"; // WP-X2 ゲームBGMループ境界チェック
import { analyzeVoiceLeading } from "./music/voiceLeading";
import { validateSkeletonContent, type SkeletonContent } from "./music/skeletonNeta"; // 骨格層の一級化（design #20 S2）
import { attachMelodyVoiceLeading, attachBassVoiceLeading } from "./music/voiceLeadingReport"; // 対位法レポートの生成側露出（design #20 S3d）
import { attachMelodyLenses } from "./music/melodyLensesReport"; // 候補レンズの生成側露出（design #12-M・WP-M3）
import { attachSyncScore } from "./music/syncopationReport"; // シンコペ「ノリメーター」の生成側露出（WP-D2）
import { attachStructureWarnings } from "./music/structureValidator"; // 生成後の構造バリデータ＝dur<=0/重複onset/範囲外を警告のみ添付（2026-07-15）
import { attachHarmonicTension } from "./music/harmonicTensionReport"; // 和声張力カーブレンズの生成側露出（WP-C4）
import { meterInfo } from "./music/meter";
import { resolveVoiceProfile } from "@cm/music-core"; // 声種プロファイル解決（WP-M4・レンズへ渡す）
import { sanitizeRhythmParts, extractRhythmPart } from "./music/rhythmParts"; // リズムパーツ層 L1/L2＋採取（design #20 S4-1/S4-2）
import { normRoot } from "./music/theory";
import { assetsDir } from "./audio-asset";
import { findProgressions } from "./progression-search";
import { getChatSession, stopChatSession } from "./chat-session";
import { beginTurn, pushTurnEvent, endTurn, attachTurn, isTurnLive, DONE } from "./chat-live";
import { killJobProc } from "./job-procs";
import { rankRecommendations } from "./music/recommend";

// 一覧(GET /neta)は巨大content を落として初回ロードを軽くする。study(共通進行1000超)や analysis(生MIR配列)は
// 1件で数百KB＝89件で~2MB がモバイル初期表示に丸ごと乗って重かった。閾値超は content:null にし、開いた時に
// GET /neta/:id で全文を取り直す（web の openTop/drillNeta が content==null なら再取得）。music の小content
// (一覧のMiniRoll/試聴で使う)は閾値以下なので残る。閾値は最大級のmelody/進行(数KB)より十分上に置く。
const LIST_CONTENT_MAX_BYTES = 32768;
function stripHeavyListContent<T extends { content: unknown }>(items: T[]): T[] {
  return items.map((n) => {
    if (n.content == null) return n;
    const size = Buffer.byteLength(JSON.stringify(n.content), "utf8");
    return size > LIST_CONTENT_MAX_BYTES ? { ...n, content: null } : n;
  });
}


// neta/job 入力スキーマは SSOT(schemas.ts)から import（http/mcp/型で共有・三重定義を排す）。

// 音源アナリーゼの params.url は http/https の妥当なURLのみ許す（不正URLで yt-dlp を無駄に起動して
// 失敗させない＝入口で 400）。空/非文字列/他プロトコル(file: 等)は不正扱い。
export function isValidHttpUrl(u: unknown): boolean {
  if (typeof u !== "string" || !u.trim()) return false;
  try {
    const parsed = new URL(u.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// 意味検索のPython窓口（docs/design.md #16）。localhost のみ、外に露出しない。
import { SEARCH_URL, searchNetaMerged } from "./semantic-search"; // 共通化(2026-07-14)
// #65 意味hitの spread較正ゲート閾値。実機コーパス実測で 0.07（無意味top rel≈0.061 を弾き
// 実クエリtop≈0.112 を残す）。コーパス成長で最適点が動く前提で env 外出し＋回帰スイープ。

/** 低次元データAPI（docs/design.md #15/#16）。PWAの主窓口。 */
export function buildHttp(core: Core): FastifyInstance {
  // 音源アナリーゼの audio_b64（数MB〜）を受けるため body 上限を上げる（既定1MB＝ファイル取込が413で死ぬバグ）。
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });

  // #36 公開制御：CM_TOKEN を設定したときだけ x-cm-token 必須（未設定=LAN内開放のまま）。
  // 未発表素材を外から覗かれないための任意ゲート。
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health" || req.url.startsWith("/health?")) return; // 監視はトークン不要
    const required = process.env.CM_TOKEN;
    if (!required) return;
    if (req.headers["x-cm-token"] !== required) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  // API データ(JSON)はブラウザにキャッシュさせない＝配置/合成の変更後にスマホが古いツリーを
  // 出し続ける事故を防ぐ（getComposition 等の GET は cache-control 無しだとモバイルで残る）。
  // ※ハッシュ付き静的アセット(JS/CSS)は JSON でないので対象外＝従来通りキャッシュ可。
  app.addHook("onSend", async (_req, reply, payload) => {
    const ct = reply.getHeader("content-type");
    if (typeof ct === "string" && ct.includes("application/json")) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  // 運用ヘルス（systemd/監視用・トークン不要）。queued滞留・失敗数・依存ポート(cm-search)疎通。
  app.get("/health", async () => {
    const s = core.healthStats();
    const reach = async (url: string): Promise<boolean> => {
      try {
        const ctrl = AbortSignal.timeout(1500);
        await fetch(url, { signal: ctrl });
        return true;
      } catch {
        return false;
      }
    };
    const search = await reach(`${SEARCH_URL}/`);
    return {
      ok: true,
      jobs: s,
      deps: { "cm-search": search },
    };
  });

  // #77 ファイルアップロード（SoundFont等）。上限256MB。
  app.register(multipart, { limits: { fileSize: 256 * 1024 * 1024 } });

  app.post("/neta", async (req, reply) => {
    const p = netaInputSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.createNeta(p.data);
  });

  app.get("/neta", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return stripHeavyListContent(core.listNeta({
      kind: q.kind,
      mode: q.mode,
      meter: q.meter,
      mood: q.mood,
      key: q.key !== undefined ? Number(q.key) : undefined,
      tags: q.tags ? q.tags.split(",").filter(Boolean) : undefined,
      q: q.q,
      scope: scopeQueryEnum.optional().catch(undefined).parse(q.scope), // 無効値は素通しせず undefined(既定project)へ
      orderProject: q.orderProject, // 手動並べ替え(neta_order)の適用対象。未指定=既定 updated 順。

      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }));
  });

  // #20 ピッカーおすすめ＝コーパス(library)から拍子/調で関連数件だけ返す（生1781を選ばせない）。
  // kind 単位（melody / chord_progression）。frame の meter/key で rank。
  app.get("/neta/recommend", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    if (!q.kind) return [];
    const pool = core.listNeta({ scope: "library", kind: q.kind, limit: 5000 });
    return rankRecommendations(pool, {
      meter: q.meter,
      key: q.key !== undefined ? Number(q.key) : undefined,
      top: q.top ? Number(q.top) : 6,
    });
  });

  // 手動並べ替えの保存（被せ表 neta_order・design LV-A）。project='' は「プロジェクト未指定」バケツ。
  app.post("/neta/reorder", async (req, reply) => {
    const b = (req.body ?? {}) as { project?: unknown; ids?: unknown };
    if (typeof b.project !== "string" || !Array.isArray(b.ids) || b.ids.some((x) => typeof x !== "string"))
      return reply.code(400).send({ error: "project(string) と ids(string[]) が必要" });
    core.reorderNeta(b.project, b.ids as string[]);
    return { ok: true };
  });

  app.get("/facets", async () => core.facets());

  // 音楽ドメイン（生成/分析）の内部HTTP窓口。worker(Python)の dispatch がここを叩いて TS の決定的記号
  // エンジンに委譲（音楽ドメインTS一本化＝アーキ是正 S2。Python に生成/分析を二重実装しない）。
  app.post("/music/:op", async (req, reply) => {
    const { op } = req.params as { op: string };
    const b = (req.body ?? {}) as Record<string, any>;
    // 入力正規化：melody/chords は「生配列」でも「{notes}/{chords}」でも受ける（生成物をそのまま検証に
    // 回せるように・dogfood P1）。不正は空配列＝関数は落ちない。さらに try/catch で 500 でなく 400 に。
    const asNotes = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.notes) ? x.notes : []);
    // chord は {root,quality} でも **"Cm7" 等の文字列**でも受ける（root 0-11 手入力の辛さ解消・dogfood P3）。
    const asChords = (x: any): any[] => {
      const arr = Array.isArray(x) ? x : Array.isArray(x?.chords) ? x.chords : [];
      return arr.map((c: any, i: number) => {
        if (typeof c !== "string") return c;
        const p = parseChordSymbol(c);
        return p ? { root: p.root, quality: p.quality, start: i, dur: 1 } : null;
      }).filter(Boolean);
    };
    try {
      switch (op) {
        case "gen_chords": { const num = (x: unknown) => (typeof x === "number" ? x : undefined); const cad = ["half", "deceptive", "plagal", "aeolian", "pac", "iac"].includes(b.cadence) ? b.cadence : undefined; const pal = ["ionian", "mixolydian", "aeolian", "dorian"].includes(b.palette) ? b.palette : undefined; const gen = b.genre === "citypop" ? "citypop" as const : undefined; const tr = b.transition && (b.transition.prep === "pivot" || b.transition.prep === "secondary_dominant") && typeof b.transition.toKey === "number" ? { prep: b.transition.prep as "pivot" | "secondary_dominant", toKey: b.transition.toKey as number, toMode: b.transition.toMode === "minor" ? "minor" as const : "major" as const } : undefined; const hrPreset = ["cadenceAccel", "drive", "sustain"].includes(b.harmonicRhythm?.preset) ? b.harmonicRhythm.preset as "cadenceAccel" | "drive" | "sustain" : undefined; const hrPattern = Array.isArray(b.harmonicRhythm?.pattern) && b.harmonicRhythm.pattern.every((x: unknown) => typeof x === "number") ? b.harmonicRhythm.pattern as number[] : undefined; const hr = (hrPreset || hrPattern) ? { ...(hrPreset ? { preset: hrPreset } : {}), ...(hrPattern ? { pattern: hrPattern } : {}) } : undefined; const res = genChords(b.frame, b.seed, cad, { borrow: num(b.borrow), secondaryDom: num(b.secondaryDom), loop: b.loop === true, palette: pal, variety: num(b.variety), genre: gen, transition: tr, harmonicRhythm: hr }); attachHarmonicTension(res, { key: typeof b.frame?.key === "number" ? b.frame.key : undefined, mode: isMinorFrame(normalizeFrame(b.frame)) ? "minor" : "major", sectionRole: (b.frame as { section?: { role?: string } } | undefined)?.section?.role }); return res; }
        case "suggest_key_plan": { const md = b.mode === "minor" ? "minor" as const : "major" as const; const cnt = typeof b.count === "number" ? { count: b.count } : {}; return { plans: suggestKeyPlan(Array.isArray(b.roles) ? b.roles : [], typeof b.key === "number" ? b.key : 0, md, cnt) }; }
        case "check_loop": { const lp = b.loop ?? {}; return checkLoop({ loop: { startBar: Number(lp.startBar) || 0, endBar: Number(lp.endBar) || 0, tailBars: typeof lp.tailBars === "number" ? lp.tailBars : undefined }, meter: typeof b.meter === "string" ? b.meter : undefined, key: typeof b.key === "number" ? b.key : undefined, mode: b.mode === "minor" ? "minor" as const : b.mode === "major" ? "major" as const : undefined, chords: asChords(b.chords), melody: asNotes(b.melody) }); }
        case "suggest_form": { const genres = ["jpop", "vocaloid", "anime_tv", "western_pop", "ballad", "game_loop", "oldies"]; const lts = ["full", "standard", "short", "tv_size", "custom"]; const hps = ["on", "off", "auto"]; return { candidates: suggestForm({ genre: genres.includes(b.genre) ? b.genre : undefined, lengthTarget: lts.includes(b.lengthTarget) ? b.lengthTarget : undefined, targetSeconds: typeof b.targetSeconds === "number" ? b.targetSeconds : undefined, hasPrechorus: hps.includes(b.hasPrechorus) ? b.hasPrechorus : undefined, chorusFirst: b.chorusFirst === true ? true : undefined, postChorus: b.postChorus === true ? true : undefined, bridge: b.bridge === false ? false : undefined, bpm: typeof b.bpm === "number" ? b.bpm : undefined, meter: typeof b.meter === "string" ? b.meter : undefined, count: typeof b.count === "number" ? b.count : undefined }) }; }
        case "suggest_energy_plan": { const tmpls = ["jpop_standard", "ballad", "four_on_floor"]; const t = tmpls.includes(b.template) ? { template: b.template } : {}; return suggestEnergyPlan(Array.isArray(b.roles) ? b.roles : [], t); }
        case "gen_melody": {
          // 2026-07-08：HTTP経路もV2（旧: 旧経路＝V2未経由で品質floor不在）。density/swing/style ノブを透過。
          const num = (x: unknown) => (typeof x === "number" ? x : undefined);
          const bassN = asNotes(b.bass); // 対位バイアス＝ベーストラックのnotes（design「gen_melody×ベース結線」）
          // 骨格注入（design #20 S2）：skeletonNetaId 指定時はその neta の content を SkeletonContent として読み検証し注入（MCP 経路と同契約）。
          let skeleton: SkeletonContent | undefined;
          if (typeof b.skeletonNetaId === "string") {
            const sn = core.getNeta(b.skeletonNetaId);
            if (!sn) return reply.code(400).send({ error: `skeleton neta ${b.skeletonNetaId} not found` });
            if (sn.kind !== "skeleton") return reply.code(400).send({ error: `neta ${b.skeletonNetaId} is kind=${sn.kind}, not skeleton` });
            const errs = validateSkeletonContent(sn.content, { beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar });
            if (errs.length) return reply.code(400).send({ error: `invalid skeleton content: ${errs.join("; ")}` });
            skeleton = sn.content as SkeletonContent;
          }
          const res = genMelody(b.frame, asChords(b.chords), b.seed, {
            useV2: true, density: num(b.density), swing: num(b.swing), expression: num(b.expression), runs: num(b.runs), push: num(b.push), foreground: num(b.foreground), breathe: num(b.breathe), humanize: num(b.humanize), form: b.form === "sentence" ? "sentence" : undefined, registerShift: num(b.registerShift), // registerShift 明示（セクション役割文脈は frame.section から自動・明示ノブが勝つ）
            repetition: num(b.repetition), rangeSteps: num(b.rangeSteps), motifBars: num(b.motifBars),
            phrasing: (["symmetric", "asymmetric", "period", "sentence"] as const).includes(b.phrasing as never) ? (b.phrasing as "symmetric" | "asymmetric" | "period" | "sentence") : undefined,
            bass: bassN.length ? bassN : undefined, counter: num(b.counter),
            drums: b.drums, drumLock: num(b.drumLock), backbeat: num(b.backbeat), converse: num(b.converse), // ドラム結線（design「gen_melody×ドラム結線」・不正/係数0は genMelody 側で従来と bit 一致）
            hook: num(b.hook), articulation: num(b.articulation), inflect: num(b.inflect), motifMode: b.motifMode === "preserve" ? "preserve" : undefined, // 反復音モチーフ（design「動機保存レンダ」・既定/不正は従来 bit 一致）
            finest: b.finest === "quarter" ? "quarter" : b.finest === "eighth" ? "eighth" : undefined, // 最小音符（高BPMの16分潰れ対策・未指定=テンポ連動）
            flow: num(b.flow), pickup: num(b.pickup), arc: b.arc === "arch" ? "arch" : undefined, // 句フレージング（連結/長音・弱起・山なり弧・2026-07-11・未指定=従来 bit 一致・role で自動発火）
            skeleton, // 骨格から吹き直す（design #20・未指定=従来 bit 一致）
            rhythmParts: sanitizeRhythmParts(b.rhythmParts, { bars: typeof b.frame?.bars === "number" ? b.frame.bars : undefined }), // リズムパーツ層 L1/L2（design #20 S4-1/S4-2・placement>rotate>L0・custom・未指定/不正=bit一致）
            rhythmicContrast: num(b.rhythmicContrast), // 音価の長短対比＝付点long-short注入（2026-07-21・未指定/0=bit一致・句末はflow領分）
            cadenceSoprano: b.cadenceSoprano === "third" ? "third" : b.cadenceSoprano === "fifth" ? "fifth" : b.cadenceSoprano === "tonic" ? "tonic" : undefined, // 終止ソプラノ再ターゲット（PAC/IAC結線・2026-07-22・未指定=従来主音着地=bit一致）。vlWeight は候補リランク専用ゆえ genMelody 直呼びの本経路では非適用（mcp gen_melody が候補経路）
          });
          // 対位法レポートの添付（design #20 S3d・読み取り専用＝候補ノートは不変）。lower＝bass 明示/骨格明示ベース+コード導出/コード root 代用の順。
          attachMelodyVoiceLeading(res, { bass: bassN.length ? bassN : undefined, skeleton, chords: asChords(b.chords), beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar });
          // 候補レンズの添付（design #12-M・WP-M3・読み取り専用＝候補ノートは不変）。web 候補トレイの並べ替え軸。
          attachMelodyLenses(res, { key: typeof b.frame?.key === "number" ? b.frame.key : undefined, beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar, sectionRole: (b.frame as { section?: { role?: string } } | undefined)?.section?.role, profile: resolveVoiceProfile((b.frame as { voice_profile?: unknown } | undefined)?.voice_profile as string | undefined) });
          // シンコペ「ノリメーター」の添付（WP-D2・読み取り専用）。並べ替え軸＝役割別ターゲット帯への適合。
          attachSyncScore(res, { beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar, role: (b.frame as { section?: { role?: string } } | undefined)?.section?.role, tempo: typeof b.frame?.tempo === "number" ? b.frame.tempo : undefined });
          // 生成後の構造バリデータ（2026-07-15）＝dur<=0/重複onset/範囲外を検出し警告のみ meta.structureWarnings へ（弾かず・直さず）。
          attachStructureWarnings(res, { bars: barsOf(normalizeFrame(b.frame)), bpb: meterInfo(b.frame?.meter).beatsPerBar, pitchRange: [0, 127] });
          // capture 後に link(メロ, 骨格, "realized_from") を張れるよう id をエコー（design #20・MCP 経路と同じ）。
          if (skeleton) (res as typeof res & { skeletonNetaId?: string }).skeletonNetaId = b.skeletonNetaId as string;
          return res;
        }
        case "gen_from_essence": return genFromEssence(asNotes(b.ref ?? b.melody), b.frame, asChords(b.chords), b.seed, {
          strength: typeof b.strength === "number" ? b.strength : undefined,
          blendWith: Array.isArray(b.blendWith ?? b.refs) ? (b.blendWith ?? b.refs).map(asNotes) : undefined,
        });
        case "melody_essence": return melodyEssence(asNotes(b.notes ?? b.melody));
        case "normalize_to_c": return { notes: normalizeToC(asNotes(b.notes ?? b.melody), b.key) };
        // リズムパーツ採取（design #20 S4-2・パーツ出所b）：既存メロの notes から指定小節の16分オンセット("x/."16文字)を抽出。rhythmParts.custom へ渡して再利用。
        case "extract_rhythm_part": return { pattern: extractRhythmPart(asNotes(b.notes ?? b.melody), typeof b.bar === "number" ? b.bar : 0, { beatsPerBar: typeof b.beatsPerBar === "number" ? b.beatsPerBar : meterInfo(b.frame?.meter).beatsPerBar }) };
        case "gen_bass": { // drums＋ノブ透過（design「gen_bass×ドラム結線」。drums 無し/係数0＝従来 bit 一致）
          const num = (x: unknown) => (typeof x === "number" ? x : undefined);
          // 骨格注入（design #20 S3c）：skeletonNetaId 指定時はその neta の content を SkeletonContent として読み検証し注入（gen_melody と同契約・明示ベースだけ上書き）。
          let skeleton: SkeletonContent | undefined;
          if (typeof b.skeletonNetaId === "string") {
            const sn = core.getNeta(b.skeletonNetaId);
            if (!sn) return reply.code(400).send({ error: `skeleton neta ${b.skeletonNetaId} not found` });
            if (sn.kind !== "skeleton") return reply.code(400).send({ error: `neta ${b.skeletonNetaId} is kind=${sn.kind}, not skeleton` });
            const errs = validateSkeletonContent(sn.content, { beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar });
            if (errs.length) return reply.code(400).send({ error: `invalid skeleton content: ${errs.join("; ")}` });
            skeleton = sn.content as SkeletonContent;
          }
          // WP-B1：style(型ID/ジャンル名)／fill(0..1 or 型ID) 透過。未指定=従来 bit 一致。
          const style = typeof b.style === "string" ? b.style : undefined;
          const fill = typeof b.fill === "number" || typeof b.fill === "string" ? b.fill : undefined;
          const res = genBass(b.frame, asChords(b.chords), b.seed, b.drums, { kickLock: num(b.kickLock), snareGap: num(b.snareGap), approach: num(b.approach), skeleton, style, fill, slashBass: b.slashBass === true });
          // 対位法レポートの添付（design #20 S3d）：ベース候補=下声、骨格 tones=上声。骨格無し＝相手が無い＝スキップ。
          attachBassVoiceLeading(res, { skeleton, beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar });
          attachSyncScore(res, { beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar, role: (b.frame as { section?: { role?: string } } | undefined)?.section?.role, tempo: typeof b.frame?.tempo === "number" ? b.frame.tempo : undefined }); // シンコペ ノリメーター（WP-D2）
          attachStructureWarnings(res, { bars: barsOf(normalizeFrame(b.frame)), bpb: meterInfo(b.frame?.meter).beatsPerBar, pitchRange: [0, 127] }); // 生成後の構造バリデータ（2026-07-15・警告のみ）
          if (skeleton) (res as typeof res & { skeletonNetaId?: string }).skeletonNetaId = b.skeletonNetaId as string; // capture 後 link(ベース→骨格,"realized_from") 用にエコー
          return res;
        }
        case "gen_skeleton": // 骨格候補（design #20 S2・構造線→ブレークポイント列）。phrasing=句割り・form=構造の使い回し。
          return genSkeletonCandidates(b.frame, asChords(b.chords), b.seed, {
            phrasing: (["symmetric", "asymmetric", "period", "sentence"] as const).includes(b.phrasing as never) ? (b.phrasing as "symmetric" | "asymmetric" | "period" | "sentence") : undefined,
            form: (["period", "aaba", "cadence-swap", "sentence"] as const).includes(b.form as never) ? (b.form as "period" | "aaba" | "cadence-swap" | "sentence") : undefined,
            skelColor: typeof b.skelColor === "number" ? b.skelColor : undefined, // 骨格の色付け（WP-M1・脱平面化）
            contour: (["arch", "asc", "desc", "valley"] as const).includes(b.contour as never) ? (b.contour as "arch" | "asc" | "desc" | "valley") : undefined, // 輪郭の型（WP-M1b）
          });
        case "gen_counter": { // WP-X3a 対旋律＝主メロ(melody)必須・音域分離/相補リズム/コードトーン軸/反行（研究doc 2026-07-14-countermelody）
          const mel = asNotes(b.melody ?? b.notes);
          if (!mel.length) return reply.code(400).send({ error: "gen_counter は主メロ(melody)が必須です" });
          const num = (x: unknown) => (typeof x === "number" ? x : undefined);
          const res = genCounter(b.frame, mel, asChords(b.chords), b.seed, { density: num(b.density) });
          attachStructureWarnings(res, { bars: barsOf(normalizeFrame(b.frame)), bpb: meterInfo(b.frame?.meter).beatsPerBar, pitchRange: [0, 127] }); // 生成後の構造バリデータ（2026-07-15・警告のみ）
          return res;
        }
        case "gen_riff": // WP-X3b リフ＝コード相手・2部構造(核motif+終止改変)・和声3類型(indep/follow・自動判定)・ループ適性（研究doc 2026-07-14-riff-ostinato）
          return genRiff(b.frame, asChords(b.chords), b.seed, { harmony: b.harmony === "indep" || b.harmony === "follow" ? b.harmony : undefined });
        case "gen_section_inst": // WP-X3c 管弦(ホーン/ストリングス)＝コード相手・1ネタ多声(進行追従ボイシング)・role=pad|stab（研究doc 2026-07-14-horn-string-arranging）
          return genSectionInst(b.frame, asChords(b.chords), b.seed, { role: b.role === "stab" ? "stab" : b.role === "pad" ? "pad" : undefined });
        case "gen_drums": { // WP-D1：style(型ID/ジャンル)＋fill(0..1/型ID)＝定型ビート＋フィル。未指定=従来 bit 一致。
          const dstyle = typeof b.style === "string" ? b.style : undefined;
          const dfill = typeof b.fill === "number" || typeof b.fill === "string" ? b.fill : undefined;
          const res = genDrums(b.frame, b.seed, dstyle != null || dfill != null ? { style: dstyle, fill: dfill } : undefined);
          attachSyncScore(res, { beatsPerBar: meterInfo(b.frame?.meter).beatsPerBar, role: (b.frame as { section?: { role?: string } } | undefined)?.section?.role, tempo: typeof b.frame?.tempo === "number" ? b.frame.tempo : undefined }); // シンコペ ノリメーター（WP-D2）
          return res;
        }
        case "gen_chord_pattern": { // pattern(型ID/ジャンル・S2)＋ギター奏法(style/strumMs)＝voicing 既定値として載せる＝実音化は web。未指定=従来 bit 一致
          const cpPattern = typeof b.pattern === "string" ? b.pattern : undefined;
          const cpStyle = b.style === "guitar" || b.style === "keyboard" ? b.style : undefined;
          const cpStrumMs = typeof b.strumMs === "number" ? b.strumMs : undefined;
          const cpVariety = typeof b.variety === "number" ? b.variety : undefined; // スライスC：候補を複数返す（既定1=単数=bit一致）
          return genChordPattern(b.frame, b.seed, cpPattern != null || cpStyle != null || cpStrumMs != null || cpVariety != null ? { pattern: cpPattern, style: cpStyle, strumMs: cpStrumMs, variety: cpVariety } : undefined);
        }
        case "gen_named_progression": return genNamedProgression(b.name, b.frame);
        case "analyze_fit": return analyzeFit(asNotes(b.melody), asChords(b.chords), b.key);
        case "analyze_voiceleading": { // #8：メロ×低音の声部進行レンズ（bass明示 or chordsのルートを低域で代用）
          const mel = asNotes(b.melody ?? b.notes);
          const low = Array.isArray(b.bass) && b.bass.length ? asNotes(b.bass) : asChords(b.chords).map((c: { root?: number | string; start?: number; dur?: number }) => ({ pitch: 36 + normRoot(c.root ?? 0), start: c.start ?? 0, dur: c.dur ?? 1 }));
          return analyzeVoiceLeading(mel, low);
        }
        case "fit_to_chords": return fitToChords(asNotes(b.melody), asChords(b.chords), b.key);
        case "detect_key": return detectKeyFromNotes(asNotes(b.notes ?? b.melody));
        case "detect_key_candidates": return { candidates: detectKeyCandidatesFromNotes(asNotes(b.notes ?? b.melody), b.top ?? 4) };
        // #9 コードから調(key+mode)候補を上位N。section/コード進行の調を「宣言」する補助。
        case "detect_key_chords": return { candidates: detectKeyFromChords(asChords(b.chords), b.top ?? 3) };
        case "melody_similarity": return { similarity: melodySimilarity(asNotes(b.a), asNotes(b.b)) };
        case "find_similar": return findSimilar(asNotes(b.target), b.candidates, b.top);
        // WP-M8：2旋律の三色トリアージ（除外ゲート＋AND 条件・法的助言ではない）。
        case "similarity_warning": return similarityWarning(asNotes(b.a), asNotes(b.b), b.layer ? { layer: b.layer } : {});
        // WP-M8：独自性チェック（cryptomnesia）＝新作 × 自作既出コーパス走査 or 明示 candidates。警告のみ。
        case "check_originality": {
          const opts = b.layer ? { layer: b.layer } : {};
          if (b.against) return { ...similarityWarning(asNotes(b.notes), asNotes(b.against), opts), against: true };
          const corpus = Array.isArray(b.candidates)
            ? b.candidates
            : core.listNeta({ kind: "melody", scope: b.scope ?? "project", limit: 500 })
                .filter((n) => n.id !== b.excludeId)
                .map((n) => ({ id: n.id, label: n.title ?? undefined, notes: (n.content as { notes?: { pitch: number; start?: number; dur?: number }[] } | null)?.notes ?? [] }));
          return originalityReport(asNotes(b.notes), corpus, opts);
        }
        // 連想エンジン（MCP と同じ機能を HTTP からも・web UI/programmatic 用）。
        case "identify_progression": return identifyProgression(asChords(b.chords), b.key !== undefined ? { key: b.key } : {});
        case "analyze_progression": return analyzeProgression(asChords(b.chords), { key: b.key, mode: b.mode });
        case "explain_progression": return explainProgression(asChords(b.chords), { key: b.key, mode: b.mode });
        case "harmonize": return harmonize(asNotes(b.melody), b.key ?? 0, { mode: b.mode, barBeats: b.barBeats });
        case "substitute_chord": { // #20 S6 D3：既存 substitutesOf を HTTP へ露出（MCP mcp.ts と同計算＝理論SSOTを web②が消費）。純関数委譲・加算のみ。
          const chord = asChords([b.chord])[0];
          if (!chord) return reply.code(400).send({ error: "chord required" });
          const key = typeof b.key === "number" ? b.key : 0;
          const deg = toDegrees([chord], key)[0]!;
          const nextArr = b.next != null ? asChords([b.next]) : [];
          const nextDeg = nextArr.length ? toDegrees(nextArr, key)[0] : undefined;
          const subs = substitutesOf(deg, { mode: b.mode, next: nextDeg });
          return subs.map((s) => ({ ...s, root: (s.degree + key) % 12 })); // 度数→実音ルート0-11を添える（mcp と同じ）
        }
        case "suggest_cliche": { // WP-C3スライス2：ラインクリシェ/ペダル候補を HTTP へ露出（MCP と同計算）。
          const cs = asChords(Array.isArray(b.chords) ? b.chords : []).map((c: { root?: number | string; quality?: string; start?: number; dur?: number }) => ({ root: normRoot(c.root ?? 0), quality: c.quality ?? "", start: c.start ?? 0, dur: c.dur ?? 1 }));
          const md = b.mode === "minor" ? "minor" as const : b.mode === "major" ? "major" as const : undefined;
          return suggestClicheLines(cs, { key: typeof b.key === "number" ? b.key : undefined, mode: md, role: typeof b.role === "string" ? b.role : undefined, melody: Array.isArray(b.melody) ? b.melody : undefined, max: typeof b.max === "number" ? b.max : undefined });
        }
        case "find_progressions": return findProgressions(core, { tags: b.tags, like: b.like, limit: b.limit });
        default: return reply.code(404).send({ error: `unknown music op: ${op}` });
      }
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message }); // 不正入力は 500 でなく 400
    }
  });

  // gen→compose ワンショット（dogfood P4）：コードを土台に各パートを生成→ネタ化→section に合成、を1コール。
  // 「叩き台を一発で組む」。決定的(seed)。返り＝section ネタ＋合成木。全部 project・tags:["生成"]。
  app.post("/gen/section", async (req) => {
    const b = (req.body ?? {}) as { frame?: any; parts?: string[]; seed?: number; title?: string; tags?: string[]; bass?: { kickLock?: number; snareGap?: number; approach?: number; style?: string; fill?: number | string }; melody?: { counter?: number; drumLock?: number; backbeat?: number; converse?: number }; drums?: { style?: string; fill?: number | string } };
    const frame = b.frame ?? {};
    const key = typeof frame.key === "number" ? frame.key : 0;
    // part 名は素直な別名も受ける（chords→chord_progression, drums→rhythm 等）。指定の揺れで落とさない。
    const alias: Record<string, string> = { chords: "chord_progression", chord: "chord_progression", drums: "rhythm", drum: "rhythm", comp: "chord_pattern", chords_inst: "chord_pattern" };
    const want = new Set((b.parts ?? ["chord_progression", "chord_pattern", "melody", "bass", "rhythm"]).map((p) => alias[p] ?? p));
    const tags = ["生成", ...(b.tags ?? [])]; // 呼び出し側 tags も尊重（dogfood 等を付けられる）
    const chords = (genChords(frame, b.seed).items[0]!.content as { chords: any[] }).chords;
    const section = core.createNeta({ kind: "section", title: b.title ?? "生成セクション", key, tempo: frame.tempo, meter: frame.meter, tags });
    let ord = 0;
    const place = (kind: string, content: unknown, label?: string) => {
      const n = core.createNeta({ kind, title: label ?? kind, content, key, tempo: frame.tempo, scope: "project", tags });
      core.placeChild(section.id, n.id, 0, ord++);
    };
    // 依存順＝rhythm→bass→melody（design「gen_bass×ドラム結線」＋「gen_melody×ベース結線」＋「gen_melody×ドラム結線」）：
    // ドラムをベースとメロへ・生成済みベースをメロへ渡す。配置(ord)は従来の 進行→楽器→メロ→ベース→リズム のまま。
    // ドラム定型ビート＋フィル（WP-D1）：body.drums:{style,fill}＝未指定は従来 bit 一致。bass/melody へ渡す依存順は不変。
    const dOpts = b.drums && (b.drums.style != null || b.drums.fill != null) ? { style: b.drums.style, fill: b.drums.fill } : undefined;
    const drums = want.has("rhythm") ? genDrums(frame, b.seed, dOpts).items[0]!.content : undefined;
    const bassContent = want.has("bass") ? (genBass(frame, chords, b.seed, drums as Parameters<typeof genBass>[3], b.bass).items[0]!.content as { notes: { pitch: number; start: number; dur: number }[] }) : undefined;
    if (want.has("chord_progression")) place("chord_progression", { chords }, "コード");
    if (want.has("chord_pattern")) place("chord_pattern", genChordPattern(frame, b.seed).items[0]!.content, "コード楽器");
    if (want.has("melody")) place("melody", genMelody(frame, chords, b.seed, { useV2: true, bass: bassContent?.notes, counter: b.melody?.counter, drums: drums as Parameters<typeof genBass>[3], drumLock: b.melody?.drumLock, backbeat: b.melody?.backbeat, converse: b.melody?.converse }).items[0]!.content, "メロ"); // V2化(2026-07-09)＋対位＋ドラム（melody.* 未指定=0=従来 bit 一致）
    if (want.has("bass")) place("bass", bassContent, "ベース");
    if (want.has("rhythm")) place("rhythm", drums, "ドラム");
    return { section: core.getNeta(section.id), composition: core.getComposition(section.id) };
  });

  // メロ連想 retrieval（S4c）：notes か neta id を渡すと、scope(既定 library) の近いメロを返す。
  // 「このメロ前のとかぶってない？」＝重複検出・連想の入口。
  app.post("/melody/neighbors", async (req, reply) => {
    const b = (req.body ?? {}) as { notes?: any; id?: string; scope?: "project" | "library" | "all"; top?: number };
    const coerce = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.notes) ? x.notes : []);
    let notes = coerce(b.notes);
    if (notes.length === 0 && b.id) {
      const n = core.getNeta(b.id);
      notes = coerce((n?.content as { notes?: any } | null)?.notes);
    }
    if (notes.length === 0) return reply.code(400).send({ error: "notes or id required" });
    return { neighbors: core.similarMelodies(notes, b.scope ?? "library", b.top ?? 5, b.id) };
  });

  app.get("/neta/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = core.getNeta(id);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.patch("/neta/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = netaPatchSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.updateNeta(id, p.data);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  app.delete("/neta/:id", async (req) => {
    const { id } = req.params as { id: string };
    return { deleted: core.deleteNeta(id) };
  });

  // ライブラリ→プロジェクトにコピー（複製汎用にも）。元は不変・新規 project ネタを返す。
  app.post("/neta/:id/copy", async (req, reply) => {
    const { id } = req.params as { id: string };
    const n = core.copyNeta(id);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  // 浅い分家（vary＝変奏の一級化・design「分家モデル」S2）。子は参照共有（deep copy しない）＋variant_of。
  // 「別物にする＝copy」（上の /copy）と「同じものとして育てる＝分家」の使い分けはここで別れる。
  app.post("/neta/:id/vary", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ title: z.string().optional(), scope: scopeEnum.optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.varyNeta(id, p.data);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  // 共有検出（分家の安全弁）：このネタが何箇所で配置されているか（copy-on-write プロンプト/共有バッジ用）。
  app.get("/neta/:id/placements", async (req) => {
    const { id } = req.params as { id: string };
    return core.placementsOf(id);
  });

  // scope 切替（自作を連想元へ＝library に移す等）。
  app.post("/neta/:id/scope", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ scope: scopeEnum }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.setScope(id, p.data.scope);
    if (!n) return reply.code(404).send({ error: "not found" });
    return n;
  });

  // 器への出し入れ（P3）＝prj: タグを addTag/removeTag（他タグ非破壊。updateNeta(tags)は全置換で危険）。
  app.post("/neta/:id/project", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ project: z.string().min(1), member: z.boolean().default(true) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    if (!core.getNeta(id)) return reply.code(404).send({ error: "not found" });
    const tag = `prj:${p.data.project}`;
    if (p.data.member) core.addTag(id, tag);
    else core.removeTag(id, tag);
    return core.getNeta(id);
  });

  app.get("/neta/:id/composition", async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = core.getComposition(id);
    if (!t) return reply.code(404).send({ error: "not found" });
    return t;
  });

  app.get("/neta/:id/relations", async (req) => {
    const { id } = req.params as { id: string };
    const out = core.getRelations(id).map((r) => ({ type: r.type, neta: core.getNeta(r.to) }));
    // realized_from の逆向き（骨格→表面化済みメロ）も見せる＝骨格側から辿れる（design #20 見える化）。
    // 骨格netaは realized_from の outgoing を持たない（メロ→骨格向きに張るため）ので重複しない。
    const back = core.getBacklinks(id, "realized_from").map((r) => ({ type: r.type, neta: core.getNeta(r.from) }));
    return [...out, ...back];
  });

  app.post("/compose", async (req, reply) => {
    const p = z
      .object({
        parent: z.string(),
        child: z.string(),
        position: z.number().default(0),
        ord: z.number().int().default(0),
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    try {
      core.placeChild(p.data.parent, p.data.child, p.data.position, p.data.ord);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message }); // 循環/自己配置
    }
    return { ok: true };
  });

  app.post("/compose/remove", async (req, reply) => {
    const p = z
      .object({ parent: z.string(), child: z.string(), position: z.number().optional() })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.removeChild(p.data.parent, p.data.child, p.data.position);
    return { ok: true };
  });

  app.post("/relation", async (req, reply) => {
    const p = z
      .object({ from: z.string(), to: z.string(), type: z.string().default("related") })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.link(p.data.from, p.data.to, p.data.type);
    return { ok: true };
  });

  app.post("/relation/remove", async (req, reply) => {
    const p = z
      .object({ from: z.string(), to: z.string(), type: z.string().default("related") })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.unlink(p.data.from, p.data.to, p.data.type);
    return { ok: true };
  });

  // --- ジョブ（投げて→受け取る）---
  app.post("/job", async (req, reply) => {
    const p = jobInputSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    // 音源アナリーゼで url を渡すなら http(s) の妥当なURLに限る（不正URLでyt-dlpを無駄起動しない）。
    // url 未指定（audio_b64 でのアップロード解析）は従来どおり通す。
    if (p.data.intent === "audio_analyze") {
      const url = (p.data.params as { url?: unknown } | null | undefined)?.url;
      if (url != null && !isValidHttpUrl(url)) {
        return reply.code(400).send({ error: "音源URLは http(s):// で始まる正しいURLを指定してください" });
      }
    }
    return core.enqueueJob(p.data);
  });

  app.get("/jobs", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return core.listJobs({ status: q.status, target: q.target });
  });

  app.get("/job/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const j = core.getJob(id);
    if (!j) return reply.code(404).send({ error: "not found" });
    return j;
  });

  // #100④-S6 ジョブ削除：消費者のいない/廃止インテントの死にジョブをトレイから消せる（滞留の自浄）。
  // ★実行中(research/audio)なら**実プロセスも殺す**（abort→spawn がプロセスグループごと SIGKILL）＝
  //   停止時に裏処理を走り切らせない（ユーザー要望）。killed=実プロセスを止めたか。
  app.delete("/job/:id", async (req) => {
    const { id } = req.params as { id: string };
    const killed = killJobProc(id);
    return { deleted: core.deleteJob(id), killed };
  });

  // Chat がディスパッチ後もそのチャットで完了を待てるよう、ジョブ＋子ジョブの決着を返す。
  app.get("/job/:id/outcome", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!core.getJob(id)) return reply.code(404).send({ error: "not found" }); // 無効idで settled:true を返さない
    return core.jobOutcome(id);
  });

  // #45: ジョブが人に質問して待つ
  app.post("/job/:id/ask", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ question: z.string() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const j = core.askQuestion(id, p.data.question);
    if (!j) return reply.code(404).send({ error: "not found" });
    return j;
  });

  // #45/#85 S3: 待機中ジョブへの回答（継続ジョブを積む）。文字列 or 構造化(フォーム)回答。
  app.post("/job/:id/answer", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ answer: z.union([z.string(), z.record(z.unknown())]) })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const cont = core.answerJob(id, p.data.answer);
    if (!cont) return reply.code(404).send({ error: "not found" });
    return cont;
  });

  // #65 ハイブリッド検索：キーワード一致(LIKE) ∪ 意味(spread較正ゲート)。
  // exact 優先で並べ matchType を付与。両系統0件なら []（＝フロントで「該当なし」）。
  // 意味(Python)不通でもキーワードは返す（堅牢）。スコア数値は返さない（人に無意味）。
  app.get("/search", async (req) => {
    const { q, k } = req.query as { q?: string; k?: string };
    if (!q) return [];
    const limit = k ? Number(k) : 20;
    // 意味(cm-search)＋キーワードの合流＝semantic-search.ts へ委譲（MCP search と共通化・2026-07-14）。
    // 挙動不変：scope"all"横断・2s切り上げ・rel閾値・matchType/semanticOk。
    return await searchNetaMerged(core, { q, limit });
  });

  // --- asset（#77 ファイル資産。SoundFont を全体で1個読む等）---
  app.post("/asset", async (req, reply) => {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "no file" });
    const kind = (part.fields.kind as { value?: string } | undefined)?.value ?? "soundfont";
    const id = randomUUID();
    const dir = assetsDir();
    mkdirSync(dir, { recursive: true });
    const ext = part.filename?.match(/\.[A-Za-z0-9]+$/)?.[0] ?? "";
    const path = join(dir, `${id}${ext}`);
    await pipeline(part.file, createWriteStream(path));
    if (part.file.truncated) {
      rmSync(path, { force: true });
      return reply.code(413).send({ error: "file too large" });
    }
    const size = statSync(path).size;
    return core.addAsset({ kind, name: part.filename ?? null, path, size, mime: part.mimetype });
  });

  app.get("/assets", async (req) => {
    const q = req.query as { kind?: string };
    return core.listAssets(q.kind);
  });

  app.get("/asset/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const a = core.getAsset(id);
    if (!a) return reply.code(404).send({ error: "not found" });
    reply.header("content-type", a.mime ?? "application/octet-stream");
    if (a.size != null) reply.header("content-length", String(a.size));
    // #84 S0: asset は id 不変（内容も不変）→ ブラウザに長期キャッシュさせ 32MB の再fetchを排除。
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.send(createReadStream(a.path));
  });

  app.delete("/asset/:id", async (req) => {
    const { id } = req.params as { id: string };
    const a = core.getAsset(id);
    if (a) rmSync(a.path, { force: true });
    return { deleted: core.deleteAsset(id) };
  });

  // --- song overlay（#83 段階／次の一手）＋ neta_asset（資産紐付け role）---
  app.get("/neta/:id/song", async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = core.getSong(id);
    return s ?? reply.code(404).send({ error: "no song" });
  });
  app.patch("/neta/:id/song", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({
        stage: z.string().nullish(),
        next_action: z.string().nullish(),
        loop: z.object({ startBar: z.number(), endBar: z.number(), tailBars: z.number().optional() }).nullish(), // WP-X2
      })
      .parse(req.body);
    const s = core.updateSong(id, p);
    return s ?? reply.code(404).send({ error: "neta not found" });
  });
  app.get("/neta/:id/assets", async (req) => {
    const { id } = req.params as { id: string };
    return core.getNetaAssets(id);
  });
  app.post("/neta/:id/assets", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z
      .object({ asset_id: z.string(), role: z.enum(["source", "attachment", "render"]).default("attachment") })
      .parse(req.body);
    return core.linkAsset(id, p.asset_id, p.role)
      ? { ok: true }
      : reply.code(404).send({ error: "neta or asset not found" });
  });
  app.delete("/neta/:id/assets/:assetId", async (req) => {
    const { id, assetId } = req.params as { id: string; assetId: string };
    const role = (req.query as { role?: string }).role;
    return { unlinked: core.unlinkAsset(id, assetId, role) };
  });

  // ♪歌う（W-K3）：歌詞(syllable)付きメロネタ → VOICEVOX 歌唱 → wav asset（role=render）。
  // MCP verb sing_neta と同じ singNeta を共用（重複実装しない）。返り＝{assetId}。engine は sing.ts が自動 spawn。
  app.post("/neta/:id/sing", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ speaker: z.number().int().optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const n = core.getNeta(id);
    if (!n) return reply.code(404).send({ error: "not found" });
    const content = (n.content ?? {}) as { notes?: unknown };
    const notes = Array.isArray(content.notes)
      ? (content.notes as { pitch: number; start: number; dur: number; syllable?: string }[])
      : [];
    if (!notes.length) return reply.code(400).send({ error: "このネタに notes がありません（melody を指定して）" });
    if (!notes.some((x) => x.syllable)) return reply.code(400).send({ error: "各音符に歌詞(syllable)がありません。先に歌詞を載せて。" });
    const bpm = resolveSingBpm(n); // B1: tempo は neta のDB列(n.tempo)が正準（content.tempo/bpm はフォールバック）
    try {
      const asset = await singNeta(core, id, notes, bpm, p.data.speaker);
      return { assetId: asset.id, name: asset.name, bytes: asset.size, speaker: p.data.speaker ?? 3009 };
    } catch (e) {
      // engine 未起動/合成失敗は 502（上流依存の失敗）＝web はトーストで拾う。
      return reply.code(502).send({ error: `歌唱に失敗：${e instanceof Error ? e.message : String(e)}` });
    }
  });

  // ♪汎用歌唱（Section 仮歌）：ネタ非依存で notes+bpm+歌詞 → VOICEVOX 歌唱 wav asset（kind=audio・リンクしない）。
  // Section のメロレーンを絶対拍で連結した notes を歌わせて伴奏と同期再生する用途。合成コアは /neta/:id/sing と共用
  // （sing.ts singGeneric）。content-hash 重複排除＝同一入力は既存 asset を再利用（合成スキップ＝自然キャッシュ）。
  app.post("/sing", async (req, reply) => {
    const p = z
      .object({
        notes: z
          .array(z.object({ pitch: z.number(), start: z.number(), dur: z.number(), syllable: z.string().optional() }))
          .min(1, "notes が空です"),
        bpm: z.number().positive().optional(),
        speaker: z.number().int().optional(),
        // A. 全歌う子の結合音高。渡ればサーバ側で chooseOctaveShift(ensemble) を forcedShift に使う＝
        //    子ごと独立ジョブでもオクターブ割れしない（境界で輪郭が跳ばない）。未指定＝この子単独で決定（bit一致）。
        ensemblePitches: z.array(z.number()).optional(),
      })
      .safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    const { notes, bpm, speaker, ensemblePitches } = p.data;
    if (!notes.some((n) => n.syllable && n.syllable.trim())) {
      return reply.code(400).send({ error: "各音符に歌詞(syllable)がありません。先に歌詞を載せて。" });
    }
    // ensemble が来たら結合レンジで唯一のオクターブシフトを決めて forcedShift として全子共通に使う。
    const forcedShift = ensemblePitches && ensemblePitches.length ? chooseOctaveShift(ensemblePitches) : undefined;
    try {
      const { asset, shift, clamped, leadRestSec } = await singGeneric(core, notes, bpm ?? 120, speaker, forcedShift);
      // #13c leadRestSec＝実測の先頭休符長（秒）。web はこれ/spb を仮歌カウントイン量に使う（SSOT・二重定数解消）。
      return { assetId: asset.id, shift, clamped, speaker: speaker ?? 3009, leadRestSec };
    } catch (e) {
      // engine 未起動/合成失敗/60秒超は 502（上流依存の失敗）＝web はトーストで拾う。
      return reply.code(502).send({ error: `歌唱に失敗：${e instanceof Error ? e.message : String(e)}` });
    }
  });

  // ♪歌わせる声の一覧（2026-07-17）：engine の /singers を frame_decode で絞って返す（起きている時だけ）。
  // engine 未起動は curated フォールバック。**列挙のために engine を spawn しない**（listSingVoices が保証）。
  // web は起動時に一度取得してメモ＝ドロップダウンの選択肢に使う。
  app.get("/sing/voices", async () => {
    return { voices: await listSingVoices() };
  });

  // プロジェクト＝一曲(or組曲)の器：配下ネタに紐づくファイルを器単位で集約（S2）。
  app.get("/projects/:project/files", async (req) => {
    const { project } = req.params as { project: string };
    return core.listProjectFiles(project);
  });

  // プロジェクト名一覧（prj:タグ ∪ project行＝空の器も含む）。picker のソース。
  app.get("/projects", async () => core.listProjectNames());
  // ピッカーのチップ用件数（P1）＝すべて/未仕分け/器別。/projects/:name と衝突しない別パス。
  app.get("/project-counts", async () => core.projectCounts());

  // プロジェクト配下のジョブ（投げて受け取る）をワークスペースに可視化。
  app.get("/projects/:project/jobs", async (req) => {
    const { project } = req.params as { project: string };
    return core.listProjectJobs(project);
  });

  // プロジェクト実体（器の説明＋AIへの指示）。未設定でも name だけ返す（画面は常に開ける）。
  app.get("/projects/:name", async (req) => {
    const { name } = req.params as { name: string };
    return core.getProject(name) ?? { name, description: null, instructions: null, created: null, updated: null };
  });
  const projectMeta = z.object({ description: z.string().nullish(), instructions: z.string().nullish() });
  app.post("/projects/:name", async (req, reply) => {
    const { name } = req.params as { name: string };
    const p = projectMeta.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.setProject(name, p.data);
  });
  // 器の削除（所属タグを外す＝ネタは残す・未仕分けへ／説明・指示 overlay を消す）。
  app.delete("/projects/:name", async (req) => {
    const { name } = req.params as { name: string };
    return core.deleteProject(name);
  });

  // --- schedule（#80 proactive: 継続研究/収集を見てない間に進める）---
  app.post("/schedule", async (req, reply) => {
    const p = z
      .object({
        neta_id: z.string().nullish(),
        intent: z.enum(["research", "collect"]).default("research"),
        params: z.unknown().optional(),
        every_sec: z.number().int().min(60).default(21600), // 既定6h、最短1分
      })
      .safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.addSchedule(p.data);
  });

  app.get("/schedules", async (req) => {
    const q = req.query as { neta_id?: string };
    return core.listSchedules(q.neta_id);
  });

  app.patch("/schedule/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return { ok: core.setScheduleEnabled(id, p.data.enabled) };
  });

  app.delete("/schedule/:id", async (req) => {
    const { id } = req.params as { id: string };
    return { deleted: core.deleteSchedule(id) };
  });

  // --- chat（#70 Chat履歴の永続化。thread=対象neta id or 'global'）---
  const chatMessageInput = z.object({
    role: z.string().min(1),
    kind: z.string().nullish(),
    text: z.string().nullish(),
    data: z.unknown().optional(),
  });

  app.get("/chat/threads", async (req) => {
    const { project } = (req.query ?? {}) as { project?: string };
    return core.listChatThreads(project && project.length ? project : null);
  });

  // 会話セッションを器（プロジェクト）に束ねる／タイトル付与（upsert・部分更新）。
  const chatThreadMeta = z.object({
    project: z.string().nullish(),
    title: z.string().nullish(),
  });
  app.post("/chat/:thread/meta", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    const p = chatThreadMeta.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    core.setChatThread({ thread, ...p.data });
    return { ok: true };
  });

  app.get("/chat/:thread/messages", async (req) => {
    const { thread } = req.params as { thread: string };
    return core.listChatMessages(thread);
  });

  app.post("/chat/:thread/message", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    const p = chatMessageInput.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: p.error.flatten() });
    return core.addChatMessage({ thread, ...p.data });
  });

  app.delete("/chat/:thread/messages", async (req) => {
    const { thread } = req.params as { thread: string };
    core.clearChatThread(thread);
    return { cleared: true };
  });

  // セッションごと削除（履歴＋器への所属）。/messages は履歴だけ消す（別物）。
  app.delete("/chat/:thread", async (req) => {
    const { thread } = req.params as { thread: string };
    core.deleteChatThread(thread);
    return { deleted: true };
  });

  // #100 薄いラッパー：スレッド毎の長命 claude セッションに1ターン送り、stream-json を SSE で中継。
  // 脳は Claude（記憶・多ターン・10 verbs のツール選択）。api は spawn と中継だけ。
  //
  // ★ストリーム切れ対策（2026-07-05）：ターンは chat-live レジストリにバッファ＋ファンアウトし、
  //   claude プロセスは**このHTTPソケットが切れても走り続ける**。完了時にサーバ側で assistant 返信を
  //   chat_message に永続化する＝チャットを閉じても締めの返信が消えない。走行中に開き直したら
  //   `GET /chat/:thread/turn/live` で途中から購読し直せる（下）。
  const SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  } as const;

  // tool_result の content（[{type:"text", text:"<JSON>"}] or 文字列）から payload(object) を取り出す。
  function parseToolResultPayload(content: unknown): Record<string, unknown> | null {
    let text: string | undefined;
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      const t = content.find((b) => (b as { type?: string })?.type === "text") as { text?: string } | undefined;
      text = typeof t?.text === "string" ? t.text : undefined;
    }
    if (text === undefined) return null;
    try {
      const v = JSON.parse(text);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  // 走行中ターンへ購読し、SSE ソケットへ書き出す（DONE 番兵→`event: done`＋close）。socket 死は握る。
  function pipeLiveToSocket(thread: string, raw: import("node:http").ServerResponse): (() => void) | null {
    return attachTurn(thread, (e) => {
      try {
        if (e === DONE) {
          raw.write("event: done\ndata: {}\n\n");
          raw.end();
        } else {
          raw.write(`data: ${JSON.stringify(e)}\n\n`);
        }
      } catch { /* ソケットが既に閉じている＝無視（ターンはサーバ側で継続） */ }
    });
  }

  app.post("/chat/:thread/turn", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    const text = String((req.body as { text?: unknown } | null)?.text ?? "");
    const dbPath = resolve(process.env.CM_DB ?? "./data/cm.sqlite");
    const repo = dirname(dirname(dbPath)); // <repo>/data/cm.sqlite → <repo>（pnpm workspace ルート）
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, SSE_HEADERS);
    // このターンをレジストリに登録し、まず自分自身のソケットを購読者として繋ぐ（再アタッチと同一経路）。
    beginTurn(thread);
    const detach = pipeLiveToSocket(thread, raw);
    raw.on("close", () => detach?.()); // ブラウザが閉じたら購読解除（ターン自体は継続）
    let finalText = ""; // result イベントの最終テキスト
    let lastText = ""; // フォールバック：最後の assistant テキストブロック
    // ★書込(capture/revise/assemble)で作られた/更新されたネタの参照を集める＝assistant メッセージに
    //   永続化し、開き直しても「ネタへのカード/リンク」が消えないようにする（S5 でカードは非永続だった）。
    const WRITE_VERBS = new Set(["capture", "revise", "assemble"].map((v) => `mcp__creative-manager__${v}`));
    const toolNames = new Map<string, string>(); // tool_use id → verb 名（tool_result と突合）
    const writtenNetas: { id: string; kind?: string; title?: string }[] = [];
    try {
      // 器（プロジェクト）の指示文を会話に効かせる：thread→project→instructions を system prompt に追記。
      const proj = core.getChatThreadProject(thread);
      const instructions = proj ? (core.getProject(proj)?.instructions ?? "") : "";
      // ③ 対象ネタの文脈：thread が neta id なら「今どのネタの話か」を Claude に伝える＝song_state 等が使える。
      const target = core.getNeta(thread);
      const targetNote = target
        ? `[Current neta] You are working on neta id="${target.id}" (kind=${target.kind}${target.title ? `, title="${target.title}"` : ""}). When the user refers to "this song / this melody / 次どうする / 詰まった", operate on this id (e.g. song_state, analyze, weave).`
        : "";
      // ④ 機材相談：専用グローバルスレッド。器に紐づかない全曲共通の知識として答え/貯める。
      const gearNote = thread === "gear"
        ? `[Gear consultation / 機材] This is a GLOBAL, cross-project conversation about gear, plugins and sound design (the user's DAW is ABILITY). Answer practically. When the user wants to keep a durable tip, save it with capture(kind:"knowledge", tags:["機材"], text:...) — do NOT attach any project tag (機材 knowledge is shared across ALL songs). To recall past tips, search prior 機材 knowledge.`
        : "";
      const suffix = [instructions, targetNote, gearNote].filter(Boolean).join("\n\n");
      const sess = getChatSession(thread, dbPath, repo, suffix);
      // イベントを蓄積しつつバッファへ流す（購読者＝このソケット＋あとから来る再アタッチ全部に届く）。
      await sess.say(text, (e) => {
        const ev = e as {
          type?: string; result?: string;
          message?: { content?: Array<{ type?: string; text?: string; name?: string; id?: string; tool_use_id?: string; content?: unknown }> };
        };
        if (ev.type === "assistant") {
          for (const b of ev.message?.content ?? []) {
            if (b.type === "text" && b.text) lastText = b.text;
            else if (b.type === "tool_use" && b.id && b.name) toolNames.set(b.id, b.name); // 書込突合用
          }
        } else if (ev.type === "user") {
          // tool_result：書込 verb のものだけ、返ってきたネタ(id/kind/title)を控える。
          for (const b of ev.message?.content ?? []) {
            if (b.type === "tool_result" && b.tool_use_id && WRITE_VERBS.has(toolNames.get(b.tool_use_id) ?? "")) {
              const p = parseToolResultPayload(b.content);
              if (p && typeof p.id === "string") {
                writtenNetas.push({ id: p.id, kind: typeof p.kind === "string" ? p.kind : undefined, title: typeof p.title === "string" ? p.title : undefined });
              }
            }
          }
        } else if (ev.type === "result" && typeof ev.result === "string") {
          finalText = ev.result;
        }
        pushTurnEvent(thread, e as Record<string, unknown>);
      });
    } catch (err) {
      pushTurnEvent(thread, { type: "error", error: String(err) });
    } finally {
      // ★ソケットが切れていてもここまで来る（say は claude の result で解決）。締めの返信＋作られたネタ参照を履歴に残す。
      const outText = (finalText || lastText).trim();
      // 同一ネタの重複（同ターンで capture→revise 等）は最後の1件に畳む。
      const netas = [...new Map(writtenNetas.map((n) => [n.id, n])).values()];
      if (outText || netas.length) {
        try {
          core.addChatMessage({
            thread, role: "assistant", kind: "chat",
            text: outText || null,
            data: netas.length ? { netas } : undefined, // 開き直しでネタカードを復元する材料
          });
        } catch { /* 保存失敗は握る（従来どおりメモリだけでも動く） */ }
      }
      endTurn(thread); // DONE を全購読者へ（このソケットはここで end される）
    }
  });

  // ★再アタッチ：開き直した時に**走行中ターンを途中から**購読する。走行中でなければ即 done（no-op）。
  app.get("/chat/:thread/turn/live", async (req, reply) => {
    const { thread } = req.params as { thread: string };
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, SSE_HEADERS);
    const detach = pipeLiveToSocket(thread, raw);
    if (!detach) { raw.write("event: done\ndata: {}\n\n"); raw.end(); return; } // 走行中ターン無し
    raw.on("close", () => detach());
  });

  // 走行中ターンの有無だけ軽く返す（UI が「考え中…」表示や再アタッチ要否を判断する用）。
  app.get("/chat/:thread/turn/status", async (req) => {
    const { thread } = req.params as { thread: string };
    return { live: isTurnLive(thread) };
  });

  // ★停止：走行中の claude ターンを落とす（session_id は残る＝次発言で resume）。say が proc の exit で
  // 解決し、/turn の finally が**それまでの部分テキストを永続化**して endTurn＝購読者に DONE が届く。
  app.post("/chat/:thread/turn/stop", async (req) => {
    const { thread } = req.params as { thread: string };
    return { stopped: stopChatSession(thread) };
  });

  return app;
}
