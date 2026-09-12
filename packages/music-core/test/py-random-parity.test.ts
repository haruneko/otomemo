// RNG spike（計画 v3 §5-2 M5「並行＝RNG spike」／M6c 判断①）＝CPython random.Random との完全一致。
// 参照値＝`tools/py-parity/cases-rng-spike/`（`tools/py-parity/run_dump_rng_spike.sh` が焼く・python_version 同梱）。
// seed 10本 × 各 10,000 ドロー。食い違いは「何ドロー目か」を出す（spike の成果として位置を残すため）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PyRandom } from "../src/humanizeFill";

const DIR = resolve(__dirname, "../../../tools/py-parity/cases-rng-spike");
const meta = JSON.parse(readFileSync(resolve(DIR, "meta.json"), "utf8"));
const load = (s: number) => JSON.parse(readFileSync(resolve(DIR, `seed-${s}.json`), "utf8"));

/** 先頭から比べて最初の不一致位置（-1＝全一致）。Object.is で -0/NaN も厳密に。 */
function firstMismatch(a: readonly unknown[], b: readonly unknown[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (!Object.is(a[i], b[i])) return i;
  return -1;
}
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const N: number = meta.n;
const K: number = meta.k;

describe(`PyRandom ≡ CPython ${String(meta.python_version).split(" ")[0]}（seed ${meta.seeds.length}本 × ${N} ドロー）`, () => {
  for (const seed of meta.seeds as number[]) {
    const ref = load(seed);
    const cases: Record<string, () => unknown[]> = {
      random: () => { const r = new PyRandom(seed); return range(N).map(() => r.random()); },
      choices_unweighted: () => { const r = new PyRandom(seed); const p = range(meta.pop_n); return range(N).map(() => r.choices(p)[0]); },
      choices_w_float: () => { const r = new PyRandom(seed); const w = meta.w_float; return range(N).map(() => r.choices(range(w.length), { weights: w })[0]); },
      choices_w_int: () => { const r = new PyRandom(seed); const w = meta.w_int; return range(N).map(() => r.choices(range(w.length), { weights: w })[0]); },
      choices_w_mixed: () => { const r = new PyRandom(seed); const w = meta.w_mixed; return range(N).map(() => r.choices(range(w.length), { weights: w })[0]); },
      choices_cum: () => { const r = new PyRandom(seed); const c = meta.cum; return range(N).map(() => r.choices(range(c.length), { cumWeights: c })[0]); },
      choices_k_weighted: () => { const r = new PyRandom(seed); const w = meta.w_float; return range(N / K).flatMap(() => r.choices(range(w.length), { weights: w, k: K })); },
      choices_k_unweighted: () => { const r = new PyRandom(seed); const p = range(meta.pop_n); return range(N / K).flatMap(() => r.choices(p, { k: K })); },
      state_at_37: () => { const r = new PyRandom(seed); for (let i = 0; i < 37; i++) r.random(); return r.getState(); },
      after_restore: () => {
        const r = new PyRandom(seed); for (let i = 0; i < 37; i++) r.random();
        const st = r.getState();
        const first = range(N).map(() => r.random());
        r.setState(st);
        const second = range(N).map(() => r.random());
        expect(firstMismatch(first, second)).toBe(-1);
        return second;
      },
    };
    for (const [name, run] of Object.entries(cases)) {
      it(`seed=${seed} ${name}`, () => {
        const got = run();
        expect(ref[name].length).toBe(name === "state_at_37" ? 625 : N);
        expect({ name, seed, firstMismatch: firstMismatch(got, ref[name]) }).toEqual({ name, seed, firstMismatch: -1 });
      });
    }
  }

  it("Python の state をそのまま setState できる（phrase_plan の getstate 駆動を TS 側で受けられる）", () => {
    const seed = meta.seeds[3];
    const ref = load(seed);
    const r = new PyRandom(999);
    r.setState(ref.state_at_37);
    expect(firstMismatch(range(N).map(() => r.random()), ref.after_restore)).toBe(-1);
  });

  it("陰性対照＝seed を1ずらすと先頭から食い違う（比較が空虚でない）", () => {
    const ref = load(meta.seeds[0]);
    const r = new PyRandom(meta.seeds[0] + 1);
    expect(firstMismatch(range(N).map(() => r.random()), ref.random)).toBe(0);
  });
});
