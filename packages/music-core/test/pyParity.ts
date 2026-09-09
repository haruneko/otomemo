// py-parity の比較ヘルパ（M3-3g・計画 §6-3 の末尾／§11-2）。
//
// 何をするか：`tools/py-parity/cases/*.json`（Python dump が焼いた参照値）を読み、
// (step, pitch, kind, anchor, role) の列だけを比較用の素の形へ落とす。
// **Python 側と同じ入力から同じ列が出ること**を deepEqual で固定するための、ただの読み手。
//
// 罠の共有（ドラム移植で既習）：Python の `%` は負数で符号が違い、`round()` は銀行家丸め。
// このケースでは pc の正規化に `normRoot`、丸めに `pyRound` を通す（下の `normRootPc`/`pyRoundLocal` で
// 本体と同じ関数を使う＝検算側が独自実装を持たない）。
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pyRound } from "../src/drumFill";
import type { AnchorKind, AnchorOnset, AnchorSeg } from "../src/anchorLock";

/** リポジトリの `tools/py-parity/cases/`（このファイルからの相対）。 */
export const CASES_DIR = fileURLToPath(new URL("../../../tools/py-parity/cases/", import.meta.url));

export interface ParityCaseSpec {
  id: string;
  grammar: string;
  progression: string;
  bars_per_chord: number;
  kick: number[];
  accents: number[];
  rest_on_syncopated_kick: boolean;
}

export interface ParityRow { step: number; pitch: number; kind: AnchorKind; anchor: boolean; role: string }

export interface ParityCase {
  id: string;
  spec: ParityCaseSpec;
  stepsPerBar: number;
  nBars: number;
  lo: number;
  hi: number;
  kick: number[];
  accents: number[];
  restOnSyncopatedKick: boolean;
  segs: AnchorSeg[];
  body: AnchorOnset[];
  expected: ParityRow[];
}

type RawRow = { step: number; pitch: number; kind: AnchorKind; anchor: boolean; role: string };
type RawCase = {
  case: ParityCaseSpec;
  input: {
    steps_per_bar: number; n_bars: number; total_steps: number; reg_lo: number; reg_hi: number;
    kick: number[]; accents: number[]; rest_on_syncopated_kick: boolean;
    segs: { root_pc: number; quality: string; start_step: number; length_steps: number }[];
    onsets: RawRow[];
  };
  expected: RawRow[];
};

/** pc を 0..11 へ（Python の負数 `%` と揃える＝`music-core/src/index.ts:108 normRoot` と同じ式）。 */
const normPc = (pc: number): number => ((Math.trunc(pc) % 12) + 12) % 12;

/** 比較列＝計画 §11-2 が指名した5項目だけ（deg/strong は移植の内部表現なので比較しない）。 */
export const rows = (onsets: readonly AnchorOnset[]): ParityRow[] =>
  onsets.map((o) => ({ step: o.step, pitch: pyRound(o.pitch), kind: o.kind, anchor: o.anchor, role: o.role }));

export function loadCase(id: string): ParityCase {
  const raw = JSON.parse(readFileSync(CASES_DIR + id + ".json", "utf8")) as RawCase;
  const i = raw.input;
  return {
    id,
    spec: raw.case,
    stepsPerBar: i.steps_per_bar,
    nBars: i.n_bars,
    lo: i.reg_lo,
    hi: i.reg_hi,
    kick: i.kick,
    accents: i.accents,
    restOnSyncopatedKick: i.rest_on_syncopated_kick,
    segs: i.segs.map((s) => ({ rootPc: normPc(s.root_pc), startStep: s.start_step, lengthSteps: s.length_steps })),
    body: i.onsets.map((o) => ({ step: o.step, pitch: pyRound(o.pitch), kind: o.kind, anchor: o.anchor, role: o.role })),
    expected: raw.expected.map((o) => ({ step: o.step, pitch: pyRound(o.pitch), kind: o.kind, anchor: o.anchor, role: o.role })),
  };
}

export function listCaseIds(): string[] {
  return readdirSync(CASES_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5)).sort();
}
