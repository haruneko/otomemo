// ABCコレクション → library の melody ネタ 取り込み（S6-b コーパス・実例）。
// 流れ：split(X:区切り) → parseAbcTune → normalizeToC(主音→C) → createNeta(scope=library, style タグ)。
// 著作権：IrishMAN 等 PD 旋律はこのまま。Falcom 等は別途エッセンスのみ保存に切替（§3-4）。
import type { Core } from "./core";
import type { NetaInput } from "./types";
import { parseAbcTune, tonicPcOf } from "./music/abc";
import { normalizeToC } from "./music/melodyEssence";

// JSON配列（IrishMAN等：各要素に "abc notation"）→ abc文字列の配列。
export function abcStringsFromJson(text: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((e) => (e as Record<string, unknown>)?.["abc notation"] ?? (e as Record<string, unknown>)?.["abc"] ?? "")
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

// 複数曲ABC（各曲が X: 行で始まる）を曲ブロックに分割。
export function splitAbcTunes(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const tunes: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (/^X:/.test(line.trim())) {
      if (cur.some((l) => l.trim())) tunes.push(cur.join("\n"));
      cur = [line];
    } else {
      cur.push(line);
    }
  }
  if (cur.some((l) => l.trim())) tunes.push(cur.join("\n"));
  return tunes;
}

// 1曲ABC → library 投入用 NetaInput（音が無ければ null）。Cへ正規化して content.notes に格納。
export function abcTuneToNeta(abc: string, style: string): NetaInput | null {
  const t = parseAbcTune(abc);
  if (!t.notes.length) return null;
  const notes = normalizeToC(t.notes, tonicPcOf(t.key));
  return {
    kind: "melody",
    title: t.title ?? null,
    content: { notes },
    meter: t.meter ?? null,
    scope: "library",
    tags: ["取込", style],
  };
}

// ABCコレクションを丸ごと library へ投入。返り＝作成件数。
export function ingestAbc(core: Core, text: string, style: string): { created: number } {
  let created = 0;
  for (const tune of splitAbcTunes(text)) {
    const input = abcTuneToNeta(tune, style);
    if (input) {
      core.createNeta(input);
      created++;
    }
  }
  return { created };
}
