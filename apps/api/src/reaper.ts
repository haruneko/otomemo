// 受け取り（reap）：非同期で進んだ生成結果(job)をネタ化する**消費者**。
// design「アーキ是正 決定3」＝消費者ロジックを Core(永続/生産)から物理分離し、producer/consumer 境界を可視化。
// Core の公開操作(createNeta/placeChild/link)＋db を使う。原子性は createNeta 内＋ジョブ単位トランザクション。
import type { Core } from "./core";
import type { NetaInput } from "./types";

function hasMusic(content: unknown): boolean {
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
function keyToPc(k: unknown): number | undefined {
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
function frameVals(frame: unknown): FrameVals {
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
    core.createNeta({
      kind: kindOf[r.intent]!,
      title: genTitle(r.intent, r.instruction),
      content,
      from_job: r.id,
      ...frameOf(r.params), // #85 S1 枠を生成ネタへ（断片のヒントとして key/meter/tempo/bars）
    });
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
