// py-parity（M3-3b）の読み手＝`tools/py-parity/cases-chord-follow/*.json` を TS の型へ落とすだけ。
// 3g の `pyParity.ts`（anchorLock 用）とは**別ファイル**＝中核（3g ハーネス）に手を入れない。
// 罠の共有：Python の `%` は負数で符号が違う（`normRoot` 相当を通す）・`round()` は銀行家丸め
// （このケースの参照値は全て整数 MIDI なので丸めは効かないが、読み手は 3g と同じ `pyRound` を通す）。
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pyRound } from "../src/drumFill";
import type { CfCell, CfSeg, CfWindow } from "../src/chordFollow";
import type { AnchorKind } from "../src/anchorLock";

export const CF_CASES_DIR = fileURLToPath(new URL("../../../tools/py-parity/cases-chord-follow/", import.meta.url));

export interface CfParityRow {
  step: number; pitch: number; kind: AnchorKind; anchor: boolean; role: string; roleBefore: string; strong: boolean;
}

export interface CfParityCase {
  id: string;
  grammar: string;
  progression: string;
  loop: boolean;
  totalSteps: number;
  window: CfWindow;
  cells: CfCell[][];
  segs: CfSeg[];
  /** 源流 `chord.scale_offsets()`＝層B のスケール（こちらの表と突き合わせる材料） */
  scaleOffsets: number[][];
  expected: CfParityRow[];
  approaches: number[];
  metrics: {
    strongTotal: number; strongHit: number; strongRate: number;
    nonInteg: number; passing: number; unplayable: number;
    boundaryTotal: number; boundaryOk: number;
  };
}

type RawRow = { step: number; pitch: number; kind: AnchorKind; anchor: boolean; role: string; role_before: string; strong: boolean };
type RawCase = {
  case: { id: string; grammar: string; progression: string; bars_per_chord: number; loop: boolean };
  input: {
    steps_per_bar: number; total_steps: number; reg_lo: number; reg_hi: number;
    low_limit: number; high_limit: number; loop: boolean;
    cells: { step: number; kind: AnchorKind; deg: number; anchor: boolean; role: string }[][];
    segs: { root_pc: number; quality: string; bass_pc: number | null; chord_tones: number[]; scale: number[]; start_step: number; length_steps: number }[];
  };
  expected: RawRow[];
  approaches: number[];
  metrics: {
    strong_total: number; strong_hit: number; strong_rate: number;
    non_integ: number; passing: number; unplayable: number;
    boundary_total: number; boundary_ok: number;
  };
};

export function loadCfCase(id: string): CfParityCase {
  const raw = JSON.parse(readFileSync(CF_CASES_DIR + id + ".json", "utf8")) as RawCase;
  const i = raw.input;
  return {
    id,
    grammar: raw.case.grammar,
    progression: raw.case.progression,
    loop: i.loop,
    totalSteps: i.total_steps,
    window: { lo: i.reg_lo, hi: i.reg_hi, lowLimit: i.low_limit, highLimit: i.high_limit },
    cells: i.cells.map((cell) => cell.map((c) => ({ step: c.step, kind: c.kind, deg: c.deg, anchor: c.anchor, role: c.role }))),
    segs: i.segs.map((s) => ({
      chord: { rootPc: s.root_pc, quality: s.quality, bassPc: s.bass_pc, tones: s.chord_tones },
      startStep: s.start_step, lengthSteps: s.length_steps,
    })),
    scaleOffsets: i.segs.map((s) => s.scale),
    expected: raw.expected.map((o) => ({
      step: o.step, pitch: pyRound(o.pitch), kind: o.kind, anchor: o.anchor, role: o.role,
      roleBefore: o.role_before, strong: o.strong,
    })),
    approaches: raw.approaches,
    metrics: {
      strongTotal: raw.metrics.strong_total, strongHit: raw.metrics.strong_hit, strongRate: raw.metrics.strong_rate,
      nonInteg: raw.metrics.non_integ, passing: raw.metrics.passing, unplayable: raw.metrics.unplayable,
      boundaryTotal: raw.metrics.boundary_total, boundaryOk: raw.metrics.boundary_ok,
    },
  };
}

export function listCfCaseIds(): string[] {
  return readdirSync(CF_CASES_DIR).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5)).sort();
}
