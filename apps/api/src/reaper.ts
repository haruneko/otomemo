// 受け取り（reap）：非同期で進んだ生成結果(job)をネタ化する**消費者**。
// design「アーキ是正 決定3」＝消費者ロジックを Core(永続/生産)から物理分離し、producer/consumer 境界を可視化。
// Core の公開操作(createNeta/placeChild/link)＋db を使う。原子性は createNeta 内＋ジョブ単位トランザクション。
import type { Core } from "./core";
import type { Neta, NetaInput } from "./types";
import { chordsFromTimeline, pcFromKeyName } from "./audio-chords";
import { autoDownbeatOffset } from "./audio-grid";
import { extractDrumPattern, extractSectionPatterns, meterString, type DrumOnset } from "./audio-drums";

// チャット発のジョブは params.chat_thread を持つ。その場合、生成結果を**サーバ側で**そのスレッドの
// チャットメッセージとして記録する＝クライアントが待ち中に離脱/リロードしても結果が必ずチャットに残る
// （整合性をクライアントに依存しない・fb-3）。data はクライアントの Msg 形（neta カード描画）。
function chatThreadOf(paramsJson: string | null): string | null {
  try {
    const t = (JSON.parse(paramsJson ?? "{}") as { chat_thread?: unknown }).chat_thread;
    return typeof t === "string" && t ? t : null;
  } catch {
    return null;
  }
}
function postChatResult(core: Core, paramsJson: string | null, neta: Neta): void {
  const thread = chatThreadOf(paramsJson);
  if (!thread) return;
  core.addChatMessage({
    thread,
    role: "ai",
    kind: "content",
    text: `「${neta.title ?? neta.kind}」ができました`,
    data: { neta },
  });
}

export function hasMusic(content: unknown): boolean {
  const c = content as {
    notes?: unknown[];
    chords?: unknown[];
    pattern?: unknown[]; // 相対bass(mode:"relative")は notes/chords を持たず度数 pattern を持つ
    rhythm?: { lanes?: { hits?: unknown[] }[] };
  } | null;
  if (!c) return false;
  if (Array.isArray(c.notes)) return c.notes.length > 0;
  if (Array.isArray(c.chords)) return c.chords.length > 0;
  if (Array.isArray(c.pattern)) return c.pattern.length > 0; // 相対bass を reap で落とさない
  if (c.rhythm?.lanes) return c.rhythm.lanes.some((l) => (l.hits?.length ?? 0) > 0);
  return false;
}

// #85 S1 枠（frame）抽出：ジョブ params の `frame` を生成ネタに付ける値へ（断片のヒント key/meter/tempo/bars/mood）。
type FrameVals = Partial<Pick<NetaInput, "key" | "meter" | "tempo" | "bars" | "mood">>;
const KEY_NAME_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function keyToPc(k: unknown): number | undefined {
  if (typeof k === "number" && k >= 0 && k <= 11) return k;
  if (typeof k === "string" && k) {
    let pc = KEY_NAME_PC[k[0]!.toUpperCase()];
    if (pc === undefined) return undefined;
    for (const ch of k.slice(1)) {
      if (ch === "#" || ch === "♯") pc += 1;
      else if (ch === "b" || ch === "♭") pc -= 1;
    }
    return ((pc % 12) + 12) % 12;
  }
  return undefined;
}
export function frameVals(frame: unknown): FrameVals {
  if (!frame || typeof frame !== "object") return {};
  const f = frame as Record<string, unknown>;
  const out: FrameVals = {};
  const k = keyToPc(f.key);
  if (k !== undefined) out.key = k;
  const meter = f.meter ?? f.time_signature; // time_signature 別名も許容
  if (typeof meter === "string" && meter) out.meter = meter;
  if (typeof f.tempo === "number" && f.tempo > 0) out.tempo = f.tempo;
  if (typeof f.bars === "number" && f.bars > 0) out.bars = Math.round(f.bars);
  if (typeof f.mood === "string" && f.mood) out.mood = f.mood;
  return out;
}
function frameOf(paramsJson: string | null): FrameVals {
  try {
    return frameVals((JSON.parse(paramsJson ?? "{}") as { frame?: unknown }).frame);
  } catch {
    return {};
  }
}

export function reapResults(core: Core): number {
  const kindOf: Record<string, string> = {
    gen_melody: "melody",
    gen_chord: "chord_progression",
    gen_rhythm: "rhythm",
  };
  // #67 生成ネタの表示名：指示文があればそれ、無ければ種類の日本語ラベル（生kindを出さない）。
  const labelOf: Record<string, string> = {
    gen_melody: "メロ案",
    gen_chord: "コード案",
    gen_rhythm: "リズム案",
  };
  const genTitle = (intent: string, instruction: string | null): string => {
    const first = (instruction ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
    return first ? first.slice(0, 24) : (labelOf[intent] ?? "案");
  };
  const staleBefore = new Date(Date.now() - 120_000).toISOString();
  const rows = core.db
    .prepare(
      `SELECT j.id, j.intent, j.instruction, j.params, j.result_summary AS result
         FROM job j
         WHERE j.status='done' AND j.intent IN ('gen_melody','gen_chord','gen_rhythm')
           AND (j.parent_job_id IS NOT NULL OR j.updated < ?)
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
    )
    .all(staleBefore) as {
    id: string;
    intent: string;
    instruction: string | null;
    params: string | null;
    result: string | null;
  }[];
  let n = 0;
  for (const r of rows) {
    let content: unknown;
    try {
      content = (JSON.parse(r.result ?? "{}") as { content?: unknown }).content;
    } catch {
      continue;
    }
    if (!hasMusic(content)) continue;
    const made = core.createNeta({
      kind: kindOf[r.intent]!,
      title: genTitle(r.intent, r.instruction),
      content,
      from_job: r.id,
      ...frameOf(r.params), // #85 S1 枠を生成ネタへ（断片のヒントとして key/meter/tempo/bars）
    });
    postChatResult(core, r.params, made); // チャット発のジョブなら結果を**サーバ側で**そのスレッドに投稿
    n += 1;
  }

  // #9/#82 参考曲・収集エージェント：research/collect の結果（references 非空）を reference
  // ネタとして回収。gen_* と同じガード（parent有り＝plan子は即時／単独は120s未受領で回収）。
  const refRows = core.db
    .prepare(
      `SELECT j.id, j.result_summary AS result
         FROM job j
         WHERE j.status='done' AND j.intent IN ('research','collect')
           AND (j.parent_job_id IS NOT NULL OR j.updated < ?)
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
    )
    .all(staleBefore) as { id: string; result: string | null }[];
  for (const r of refRows) {
    let parsed: { summary?: string; references?: unknown[] };
    try {
      parsed = JSON.parse(r.result ?? "{}") as { summary?: string; references?: unknown[] };
    } catch {
      continue;
    }
    if (!Array.isArray(parsed.references) || parsed.references.length === 0) continue;
    core.createNeta({
      kind: "reference",
      title: "参考曲",
      text: parsed.summary ?? "",
      content: { summary: parsed.summary ?? "", references: parsed.references },
      from_job: r.id,
    });
    n += 1;
  }

  // ① アナリーゼ：done audio_analyze の {facts, prose, title} を知見ネタ化（tags=アナリーゼ）。web は待つので即回収。
  const audioRows = core.db
    .prepare(
      `SELECT j.id, j.result_summary AS result FROM job j
         WHERE j.status='done' AND j.intent='audio_analyze'
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
    )
    .all() as { id: string; result: string | null }[];
  for (const r of audioRows) {
    let parsed: { facts?: unknown; prose?: string; title?: string };
    try {
      parsed = JSON.parse(r.result ?? "{}") as { facts?: unknown; prose?: string; title?: string };
    } catch {
      parsed = {};
    }
    if (!parsed.prose && !parsed.facts) {
      core.db.prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, NULL, 0, 'empty')`).run(r.id);
      continue;
    }
    // #S10 アナリーゼ・ワークベンチ：生データ＋メタ＋overlay を持つ **analysis ネタ**を主出力にする。
    // 開くとワークベンチ（メロピアノロール＋コード＋小節線）。仕上げ(アンカー/切出)は人間。
    const facts = (parsed.facts ?? {}) as {
      bpm?: number; meter?: number; key?: { key?: string; mode?: string }; vocal_range?: unknown; duration_sec?: number;
      beat_times?: number[]; melody_notes?: unknown; melody_f0?: unknown; chords_timeline?: unknown; chords?: unknown;
      drum_onsets?: unknown; bass_notes?: unknown;
    };
    const timeline = (facts.chords_timeline ?? facts.chords) as [number, number, string][] | undefined;
    const beatTimes = Array.isArray(facts.beat_times) ? facts.beat_times : [];
    const segs = Array.isArray(timeline) ? timeline.filter((c) => c[2] !== "N" && c[2] !== "X") : [];
    const changes = segs.map((c) => c[0]);
    const weights = segs.map((c) => c[1] - c[0]); // コード継続長で重み付け＝長く鳴る和音の頭を小節頭と見なしやすく
    // #S12改 拍子/ダウンビートの土台：ユーザー指定(>0)は常に優先（forceMeter でその拍子に折り畳む）。
    // 未指定(0=auto)はドラムの窓分割×正準型照合（スネア=バックビート/キック=頭が downbeat を決める）。
    // 低信頼ならコード変化ヒューリスティックへフォールバック。
    const drumOnsets = (Array.isArray(facts.drum_onsets) ? facts.drum_onsets : []) as DrumOnset[];
    const userMeter = typeof facts.meter === "number" && facts.meter > 0 ? facts.meter : 0;
    const ext = drumOnsets.length && beatTimes.length
      ? extractDrumPattern(beatTimes, drumOnsets, userMeter ? { forceMeter: userMeter } : {})
      : null;
    let meter = userMeter || 4;
    const chordOffset = autoDownbeatOffset(beatTimes, changes, meter, weights); // 既定＝コード由来
    let anchorSec = beatTimes[chordOffset] ?? 0;
    let meterSource: "user" | "drums" | "chords" = userMeter ? "user" : "chords";
    let meterConf = userMeter ? 1 : 0;
    if (!userMeter && ext && ext.confidence >= 0.3) {
      meter = ext.meter;
      meterSource = "drums";
      meterConf = ext.confidence;
      if (ext.downbeat != null) anchorSec = ext.downbeat;
    }
    // #S12改3 区間分解＝crashで区間を切り区間ごとに畳む→区間ごとの綺麗なドラムパターン（全曲1グリッドはドリフトで破綻）。
    // meter確定（ユーザー指定 or ドラム高信頼）の時だけ。ドラム無/低信頼なら空＝区間ネタ無し（グレースフル）。
    const secs = drumOnsets.length && beatTimes.length && (userMeter || (ext != null && ext.confidence >= 0.3))
      ? extractSectionPatterns(beatTimes, drumOnsets) : [];
    const mmss = (t: number) => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }; // 秒を先に丸め＝「4:60」防止
    core.createNeta({
      kind: "analysis",
      title: `アナリーゼ: ${parsed.title ?? "音源"}`,
      text: parsed.prose ?? "",
      content: {
        meta: { bpm: facts.bpm ?? null, meter, key: facts.key ?? null, vocal_range: facts.vocal_range ?? null, duration_sec: facts.duration_sec ?? null,
          // #S12改 拍子の出所と信頼度＋シャッフル検出（sub=3）＋照合した正準型
          meter_detected: { meter, confidence: Math.round(meterConf * 100) / 100, source: meterSource,
            ...(ext ? { sub: ext.sub, template: ext.template } : {}) } },
        raw: { beat_times: beatTimes, melody_notes: facts.melody_notes ?? [], melody_f0: facts.melody_f0 ?? [], chords_timeline: timeline ?? [], drum_onsets: drumOnsets },
        overlay: { anchors: [{ t_sec: anchorSec, meter, bar_no: 1 }], cuts: [], chord_edits: [],
          // #S12改3 crash由来の区間境界を構造ラベルの種に（Aメロ/サビ名は人間が付け替え＝機械は境界だけ）。
          sections: secs.map((s) => ({ from_t: s.startSec, to_t: s.endSec, label: `区間 ${mmss(s.startSec)}–${mmss(s.endSec)}（${s.bars}小節）` })) },
        prose: parsed.prose ?? "",
      },
      tempo: typeof facts.bpm === "number" ? Math.round(facts.bpm) : null,
      key: pcFromKeyName(facts.key?.key),
      mode: facts.key?.mode ?? null,
      tags: ["アナリーゼ"],
      from_job: r.id,
    });
    n += 1;
    // #S12改3 ドラムを**区間ごと**に弾き直せる rhythm 候補ネタへ（1小節ループ横展でなく、実区間の実グルーヴ）。
    // 各区間は crash境界で切り区間内で畳む＝ドリフト無・区間平均でノイズ消。区間の高信頼分だけネタ化（グレースフル）。
    // sub=3（シャッフル）は 16分格子へスイング写像済＝既存 rhythm 契約(1step=16分)のまま。タグで明示。
    const bpmR = typeof facts.bpm === "number" ? Math.round(facts.bpm) : null;
    const multi = secs.length > 1;
    for (const s of secs) {
      const p = s.pattern;
      if (!(userMeter || p.confidence >= 0.3) || !p.rhythm.lanes.length) continue;
      core.createNeta({
        kind: "rhythm",
        // 区間名（Aメロ/サビ）は今は時刻＝人間が付け替え。単一区間なら括弧内は「候補」だけ。
        title: `アナリーゼ: ${parsed.title ?? "音源"} のドラム（${multi ? `${mmss(s.startSec)}–${mmss(s.endSec)}・` : ""}候補）`,
        content: { rhythm: p.rhythm },
        tempo: bpmR,
        meter: meterString(p.meter),
        tags: ["アナリーゼ", "候補", ...(p.sub === 3 ? ["シャッフル"] : [])],
        from_job: r.id,
      });
      n += 1;
    }
    // #S12改3 ベースも**区間ごとに絶対音ネタ**へ（design是正2026-07-08＝相対度数でなく絶対音・区間＝bass↔vocal 抽出機構を共有）。
    // stem→pyin→bass_notes(秒) を、ドラムと同じ区間境界で拍へ写して {kind:"bass",{notes}}（genBass絶対モードと同形）。
    // 区間頭を beat0 に（秒→拍は bpm 基準）。ドラム高信頼区間に揃えて出す（v1・ベースはコード精度底上げが本命でネタはおまけ）。
    const bassNotes = (Array.isArray(facts.bass_notes) ? facts.bass_notes : []) as [number, number, number][];
    if (bassNotes.length && bpmR) {
      const secPerBeat = 60 / bpmR;
      for (const s of secs) {
        if (!(userMeter || s.pattern.confidence >= 0.3)) continue; // ドラム区間に相乗り（ノイズ区間で氾濫させない）
        const notes: { pitch: number; start: number; dur: number }[] = [];
        for (const [st, en, midi] of bassNotes) {
          if (en <= s.startSec || st >= s.endSec) continue; // 区間外
          const start = Math.max(0, st - s.startSec) / secPerBeat;
          const dur = (Math.min(en, s.endSec) - Math.max(st, s.startSec)) / secPerBeat;
          if (dur <= 1e-3) continue;
          notes.push({ pitch: Math.round(midi), start: Math.round(start * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
        }
        if (!notes.length) continue;
        core.createNeta({
          kind: "bass",
          title: `アナリーゼ: ${parsed.title ?? "音源"} のベース（${multi ? `${mmss(s.startSec)}–${mmss(s.endSec)}・` : ""}候補）`,
          content: { notes },
          tempo: bpmR,
          meter: meterString(s.pattern.meter),
          tags: ["アナリーゼ", "候補"],
          from_job: r.id,
        });
        n += 1;
      }
    }
    // 学習の出口（usecases-chat ①）：検出コードを**弾き直せる chord_progression 候補ネタ**にも落とす（即使える冒頭抜粋）。
    const chords = chordsFromTimeline(timeline, typeof facts.bpm === "number" ? facts.bpm : 120);
    if (chords.length >= 2) {
      core.createNeta({
        kind: "chord_progression",
        title: `アナリーゼ: ${parsed.title ?? "音源"} のコード（候補・冒頭抜粋）`,
        content: { chords },
        key: pcFromKeyName(facts.key?.key),
        mode: facts.key?.mode ?? null,
        tempo: typeof facts.bpm === "number" ? Math.round(facts.bpm) : null,
        tags: ["アナリーゼ", "候補"],
        from_job: r.id,
      });
      n += 1;
    }
  }

  // #S11 study（研究）：done の {topic,members,common,stats,prose,title} を study ネタ化。
  // 共通進行（common[].example）は songCount>=2 のもの上位を chord_progression ネタとして出口に。
  // 即回収（web は待つ）＝stale ガードなし。
  const studyRows = core.db
    .prepare(
      `SELECT j.id, j.result_summary AS result FROM job j
         WHERE j.status='done' AND j.intent='study'
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
    )
    .all() as { id: string; result: string | null }[];
  for (const r of studyRows) {
    type Slot = { root: number; quality: string; start: number; dur: number };
    let parsed: {
      topic?: string; artist?: string; members?: unknown;
      songs?: { title?: string; coreLoops?: { example: Slot[]; length: number; count: number }[] }[];
      common?: { degrees: string[]; example: Slot[]; songCount: number; songs: string[] }[];
      stats?: unknown; prose?: string; title?: string
    };
    try {
      parsed = JSON.parse(r.result ?? "{}") as typeof parsed;
    } catch {
      parsed = {};
    }
    if (!parsed.prose && !Array.isArray(parsed.common)) {
      core.db.prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, NULL, 0, 'empty')`).run(r.id);
      continue;
    }
    // 研究ネタは研究プロジェクト(prj:研究)へ自動所属＋研究タグ＋アーティストタグ＝探しやすく（ユーザー要望）。
    const artist = typeof parsed.artist === "string" && parsed.artist.trim() ? parsed.artist.trim() : null;
    const studyTags = ["研究", "prj:研究", ...(artist ? [artist] : [])];
    // study ネタ（主出力）。songs=各曲のコア・ループ＋生chords(主役・#S11改)、common=補助。
    const studyNeta = core.createNeta({
      kind: "study",
      title: parsed.title ?? `研究: ${parsed.topic ?? ""}`,
      text: parsed.prose ?? "",
      content: {
        topic: parsed.topic ?? "",
        artist: artist ?? "",
        members: parsed.members ?? [],
        songs: parsed.songs ?? [],
        common: parsed.common ?? [],
        stats: parsed.stats ?? {},
        prose: parsed.prose ?? "",
      },
      tags: studyTags,
      from_job: r.id,
    });
    n += 1;
    // 出口の弾ける chord_progression ネタ＝各曲の「コア・ループ」（主レンズ由来＝美味しいフック）。研究プロジェクトへ。
    // 旧＝common(補助・汎用の繋ぎ)由来だったのを主レンズに揃える（#S11改）。1曲につき最頻ループ1本。
    const songs = Array.isArray(parsed.songs) ? parsed.songs : [];
    for (const s of songs) {
      const loop = Array.isArray(s?.coreLoops) ? s.coreLoops[0] : null; // count 降順の先頭＝一番回るループ
      if (!loop || !Array.isArray(loop.example) || loop.example.length < 2) continue;
      core.createNeta({
        kind: "chord_progression",
        title: `研究: ${s.title ?? ""} のコア・ループ（${loop.length}和音×${loop.count}回）`,
        content: { chords: loop.example },
        tags: ["研究", "ループ", "prj:研究", ...(artist ? [artist] : [])],
        from_job: r.id,
      });
      n += 1;
    }
    postChatResult(core, null, studyNeta); // chat 発ジョブ対応（study は現状グローバル）
  }

  // #81 MIDI取り込み：done の import_midi の result.tracks を melody/rhythm ネタに分割materialize。
  // web は自分でネタ化しない（投げて受け取る）ので stale ガード無しで即回収。
  const midiRows = core.db
    .prepare(
      `SELECT j.id, j.result_summary AS result FROM job j
         WHERE j.status='done' AND j.intent='import_midi'
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
    )
    .all() as { id: string; result: string | null }[];
  for (const r of midiRows) {
    let tracks: { kind?: string; title?: string; content?: unknown }[] = [];
    try {
      tracks = (JSON.parse(r.result ?? "{}") as { tracks?: typeof tracks }).tracks ?? [];
    } catch {
      tracks = [];
    }
    let made = false;
    for (const t of tracks) {
      if (!t || !t.kind || !hasMusic(t.content)) continue;
      core.createNeta({
        kind: t.kind,
        title: t.title ?? "取り込み",
        content: t.content,
        from_job: r.id,
      });
      made = true;
      n += 1;
    }
    // 何も作れなくても再reapしないよう空マーカーを記録（二重処理防止）。
    if (!made) {
      core.db
        .prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, NULL, 0, 'empty')`)
        .run(r.id);
    }
  }

  // #85 S2a 構造化生成（gen_variations）：done の {items, edges} を一括 materialize。
  // items を配列順にネタ化し idx→neta_id を作る。container(section/song)は hasMusic 対象外で
  // null化しない。edges は両端が非null の時だけ compose_edge/relation_edge を張る（指摘2）。
  const containerKind = new Set(["section", "song"]);
  const structRows = core.db
    .prepare(
      `SELECT j.id, j.params, j.result_summary AS result FROM job j
         WHERE j.status='done'
           AND ( j.intent IN ('gen_variations','gen_chords_rule','gen_pair_rule','fit_to_chords','fetch','transform','gen_lyric')
                 OR (j.intent='consult' AND json_extract(j.result_summary,'$.type')='items') )
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
    )
    .all() as { id: string; params: string | null; result: string | null }[];
  for (const r of structRows) {
    type Item = { kind?: string; content?: unknown; text?: string; label?: string; frame?: unknown };
    type Edge = { type?: string; from?: number; to?: number; position?: number };
    let items: Item[] = [];
    let edges: Edge[] = [];
    try {
      const p = JSON.parse(r.result ?? "{}") as { items?: Item[]; edges?: Edge[] };
      items = Array.isArray(p.items) ? p.items : [];
      edges = Array.isArray(p.edges) ? p.edges : [];
    } catch {
      items = [];
      edges = [];
    }
    const jobFrame = frameOf(r.params);
    // ジョブ単位トランザクション：items を作りながら idMap を組む途中で失敗しても、この job の
    // ネタ生成・辺・マーカーを丸ごとロールバック（壊れた idMap で edge が刺さる/部分生成を断つ）。
    // try で1 job の失敗が reap 全体(=他job)を止めないように（poison job 隔離）。次tickで再試行。
    let localMade = 0;
    try {
      core.db.transaction(() => {
        localMade = 0;
        const idMap: (string | null)[] = [];
        for (const it of items) {
          const kind = it?.kind;
          const isContainer = kind != null && containerKind.has(kind);
          const hasText = typeof it?.text === "string" && it.text.trim() !== "";
          // container(中身は edges)／音楽 content ／テキスト(歌詞等) のいずれかが在れば materialize。
          if (!kind || (!isContainer && !hasMusic(it.content) && !hasText)) {
            idMap.push(null); // index を保持して詰めない（edge の参照を壊さない）
            continue;
          }
          const neta = core.createNeta({
            kind,
            title: it.label ?? "案",
            content: it.content ?? null,
            text: it.text ?? null,
            from_job: r.id,
            ...jobFrame,
            ...frameVals(it.frame), // item 個別 frame が上書き
          });
          idMap.push(neta.id);
          postChatResult(core, r.params, neta); // チャット発なら結果をそのスレッドへ（サーバ著者）
          localMade += 1;
        }
        for (const e of edges) {
          const from = typeof e?.from === "number" ? idMap[e.from] : null;
          const to = typeof e?.to === "number" ? idMap[e.to] : null;
          if (!from || !to) continue;
          if (e.type === "compose") {
            try {
              core.placeChild(from, to, e.position ?? 0, e.position ?? 0);
            } catch {
              /* 循環等は無視（reap を止めない） */
            }
          } else core.link(from, to, "related");
        }
        if (localMade === 0) {
          core.db
            .prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, NULL, 0, 'empty')`)
            .run(r.id);
        }
      })();
      n += localMade;
    } catch {
      /* この job はロールバック済。job_result 未挿入なので次tickで再試行（部分状態を残さない）。 */
    }
  }
  return n;
}
