// 生成後の構造バリデータ（2026-07-15・統計監査の是正）。純関数＝音源不要・副作用なし。
// 動機：E-rule 評価器は「音楽の良し悪し」を測るが、dur<=0／重複オンセット等の**構造欠陥**は素通しする。
// 生成物が破綻していないか（=そもそも再生・MIDI化できる形か）を機械的に検査する最後の砦。
// 思想＝「機械は候補まで・仕上げは人間」「ブロックしない」（design §6）に合わせ、**弾かず・直さず・警告のみ**。
// 検査＝(1)dur>0 (2)同時刻・同pitchの重複（単声の幽霊/ユニゾン潰れ） (3)小節範囲内(start) (4)音域。

export type VNote = { pitch: number; start?: number; dur?: number };

export type ViolationKind =
  | "dur_nonpositive" // dur が正でない（0/負/未指定）＝render で潰れる幽霊音
  | "duplicate" // 同時刻・同pitch の重複（単声なのに同じ音が二重発音）
  | "out_of_bar_range" // start が [minStart, bars*bpb) の外
  | "pitch_out_of_range"; // pitch が pitchRange の外

export interface Violation {
  kind: ViolationKind;
  index: number; // 違反ノートの notes 内 index（duplicate は「後着」の index）
  detail: string; // 人間可読の一行（ログ/meta へそのまま載せる）
}

export interface ValidateOpts {
  bars: number; // 小節数
  bpb: number; // 1小節の拍数（beats per bar）
  pitchRange?: [number, number]; // [lo, hi]（両端含む）。未指定＝音域検査しない
  minStart?: number; // 許容する最小 start（既定 0＝負を許さない。弱起で負を許すなら負値を渡す）
  eps?: number; // 数値許容誤差（既定 1e-6）
}

export interface ValidateResult {
  ok: boolean;
  violations: Violation[];
}

/**
 * ノート列の構造検査（純関数・非破壊）。破綻を「見つける」だけ＝修復も除外もしない。
 * @returns ok=違反ゼロ / violations=見つかった全違反（種別・index・一行説明）
 */
export function validateNotes(notes: readonly VNote[], opts: ValidateOpts): ValidateResult {
  const eps = opts.eps ?? 1e-6;
  const minStart = opts.minStart ?? 0;
  const total = Math.max(0, opts.bars) * Math.max(0, opts.bpb); // 曲の総拍長（この直前まで onset を許す）
  const violations: Violation[] = [];
  const seen = new Map<string, number>(); // "roundedStart|pitch" → 先着 index（重複検出用）

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const start = typeof n.start === "number" ? n.start : 0;
    const dur = n.dur;

    // (1) dur>0：未指定/0/負は幽霊音（render の gap ベース dur が 0 に潰れる真因の下流症状）。
    if (!(typeof dur === "number" && dur > eps)) {
      violations.push({ kind: "dur_nonpositive", index: i, detail: `note[${i}] dur=${dur ?? "なし"} が正でない（start=${round3(start)} pitch=${n.pitch}）` });
    }

    // (3) 小節範囲内：start ∈ [minStart, total)。total ちょうど以降は始まる余地なし。
    if (start < minStart - eps || (total > 0 && start > total - eps)) {
      violations.push({ kind: "out_of_bar_range", index: i, detail: `note[${i}] start=${round3(start)} が範囲[${round3(minStart)}, ${round3(total)}) 外（pitch=${n.pitch}）` });
    }

    // (4) 音域：pitchRange 指定時のみ。両端含む。
    if (opts.pitchRange) {
      const [lo, hi] = opts.pitchRange;
      if (n.pitch < lo || n.pitch > hi) {
        violations.push({ kind: "pitch_out_of_range", index: i, detail: `note[${i}] pitch=${n.pitch} が音域[${lo}, ${hi}] 外（start=${round3(start)}）` });
      }
    }

    // (2) 同時刻・同pitch の重複：単声で同じ瞬間に同じ音＝ユニゾン潰れ/幽霊。後着を違反に。
    const key = `${Math.round(start * 1000)}|${n.pitch}`; // 0.001拍まで同一視して同時刻判定
    const prev = seen.get(key);
    if (prev !== undefined) {
      violations.push({ kind: "duplicate", index: i, detail: `note[${i}] は note[${prev}] と同時刻・同pitch の重複（start=${round3(start)} pitch=${n.pitch}）` });
    } else {
      seen.set(key, i);
    }
  }

  return { ok: violations.length === 0, violations };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ── 生成結果への添付（糊）──────────────────────────────────────────
// gen_melody / gen_bass / gen_counter の出力（GenResult）へ、構造違反があれば **警告のみ** を添付する。
// 弾かない・直さない＝候補ノートは一切不変（bit一致鉄則）。違反ゼロなら meta へ触れず＝完全 no-op。
// attachSyncScore / attachMelodyLenses と同格の「読み取り専用レポート糊」。

type AttachItem = { kind: string; content: unknown; label?: string; meta?: Record<string, unknown> };
type AttachResult = { items: AttachItem[]; meta?: { warnings?: string[]; structureWarnings?: string[] } & Record<string, unknown> };

export interface AttachStructureOpts {
  bars: number;
  bpb: number;
  pitchRange?: [number, number];
  minStart?: number;
  kinds?: string[]; // 検査対象の item.kind（既定 melody/bass/counter）
}

/**
 * GenResult の各 item（notes を持つ層）を検査し、違反があれば
 *  (a) 自動修復はしない
 *  (b) res.meta.structureWarnings に一行ずつ積む ＋ サーバログ(console.warn)に出す
 * 生成は止めない（=警告のみ）。違反ゼロなら meta を触らない＝従来 bit 一致。
 */
export function attachStructureWarnings(res: AttachResult, opts: AttachStructureOpts): void {
  const kinds = opts.kinds ?? ["melody", "bass", "counter"];
  const msgs: string[] = [];
  for (const it of res.items) {
    if (!kinds.includes(it.kind)) continue;
    const notes = (it.content as { notes?: VNote[] } | null)?.notes;
    if (!Array.isArray(notes)) continue;
    const r = validateNotes(notes, { bars: opts.bars, bpb: opts.bpb, pitchRange: opts.pitchRange, minStart: opts.minStart });
    if (!r.ok) for (const v of r.violations) msgs.push(`[${it.kind}${it.label ? " " + it.label : ""}] ${v.detail}`);
  }
  if (msgs.length) {
    res.meta = { ...(res.meta ?? {}), structureWarnings: [...(res.meta?.structureWarnings ?? []), ...msgs] };
    console.warn(`structureValidator: 構造警告 ${msgs.length} 件（生成は継続）`, msgs);
  }
}
