// 案A＝音符を割る候補提示版の API 口（design #31 §31-5）。
// music-core の純関数 splitCandidates に **コーパス（RHYTHM16_DATA）を注入**し、UI 向けに上位だけ整形して返す。
// コーパスは api だけが持つ（music-core は素の純関数）＝ここが唯一の注入点。実在性の裏取りは 4/4・16分のときだけ。

import { splitCandidates, analyzeMoras, type Note, type Mora } from "@cm/music-core";
import { RHYTHM16_DATA } from "./motifModelData";

const TOP_N = 8; // 各軸で見せる上限（研究：数百出るが画面は上位だけ）
const CORPUS = (pat: string): number | undefined => RHYTHM16_DATA[pat];

export interface SplitRequest {
  notes: Note[];
  reading: string[]; // モーラのかな列（web の effectiveReading そのまま）
  range: { start: number; beats: number };
  meter: { beatsPerBar: number; gridPerBeat: number; tempo?: number };
  words?: number[]; // モーラ index → 語 id（C-8・任意）
}

interface CandidateDTO {
  notesAfter: Note[];
  splitCount: number;
  addedOnsets: number;
  corpusKnown: boolean | null;
  corpusFreq: number;
  cv: number;
  phraseEndRatio: number;
  syncPerBar: number;
  specialBeatHit: boolean;
  wordBoundaryHit: boolean;
}

export interface SplitResponse {
  backedByCorpus: boolean;
  truncated: boolean;
  candidates: CandidateDTO[]; // 見せる分（2軸の上位を統合・重複なし）
  byFacts: number[]; // candidates への index（事実基準の並び）
  byPreference: number[]; // 同（好ましさ基準の並び）
}

/** リクエストを検証し、splitCandidates にコーパスを注入して UI 向けに整形して返す。不正入力は Error を投げる。 */
export function splitCandidatesForApi(body: SplitRequest): SplitResponse {
  const { notes, reading, range, meter } = body;
  if (!Array.isArray(notes) || notes.some((n) => typeof n?.start !== "number" || typeof n?.dur !== "number"))
    throw new Error("notes({start,dur,...}[]) が必要");
  if (!Array.isArray(reading) || reading.some((s) => typeof s !== "string"))
    throw new Error("reading(string[]) が必要");
  if (!range || typeof range.start !== "number" || typeof range.beats !== "number")
    throw new Error("range({start,beats}) が必要");
  if (!meter || typeof meter.beatsPerBar !== "number" || typeof meter.gridPerBeat !== "number")
    throw new Error("meter({beatsPerBar,gridPerBeat}) が必要");

  // かな列 → モーラ（kind つき）。web の effectiveReading と同じ analyzeMoras で往復一致する。
  const moras: Mora[] = analyzeMoras(reading.join(""));

  const r = splitCandidates(notes, moras, range, meter, {
    corpus: CORPUS,
    words: body.words,
    limit: 200,
  });

  // 2軸の上位を統合（重複なし・見せる分だけ notesAfter を運ぶ）。
  const pick = new Set<number>();
  for (const i of r.byFacts.slice(0, TOP_N)) pick.add(i);
  for (const i of r.byPreference.slice(0, TOP_N)) pick.add(i);
  const chosen = [...pick];
  const remap = new Map(chosen.map((orig, idx) => [orig, idx]));
  const candidates: CandidateDTO[] = chosen.map((orig) => {
    const c = r.candidates[orig]!;
    return {
      notesAfter: c.notesAfter as Note[],
      splitCount: c.splitCount,
      addedOnsets: c.addedOnsets,
      corpusKnown: c.corpusKnown,
      corpusFreq: c.corpusFreq,
      cv: c.cv,
      phraseEndRatio: c.phraseEndRatio,
      syncPerBar: c.syncPerBar,
      specialBeatHit: c.specialBeatHit,
      wordBoundaryHit: c.wordBoundaryHit,
    };
  });
  const byFacts = r.byFacts.filter((i) => remap.has(i)).map((i) => remap.get(i)!);
  const byPreference = r.byPreference.filter((i) => remap.has(i)).map((i) => remap.get(i)!);

  return { backedByCorpus: r.backedByCorpus, truncated: r.truncated, candidates, byFacts, byPreference };
}
