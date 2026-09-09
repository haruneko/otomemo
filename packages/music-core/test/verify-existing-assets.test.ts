// M4＝新しい検証器を**既存資産**（drumLibrary の定型ビート32型・フィル型／chordLibrary）へ回した記録。
// 計画 §5-2 M4・§6-4 #10：**既存資産が赤になっても型は直さない**＝診断として記録し、直すかは耳（オーナー）。
// ここは「資産のゲート」ではない。落ちた件数を**固定して記録**し、黙って増減したら気づけるようにする。
//
// 注意（構造）：music-core は本来アプリに依存しない。この1本だけはテスト専用の**動的 import**で
// api の純データ辞書を読む（型に依存しない・実行時のみ・生成経路には触らない）。
import { describe, it, expect } from "vitest";
import { grooveLimbGate, coverageSummary, isVacuous, type GrooveLane } from "../src/index";

// リポジトリ根＝このファイルから3つ上（packages/music-core/test → 根）。絶対パスを焼かない。
const ROOT = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
type Mod = Record<string, unknown>;
const load = (p: string): Promise<Mod> => import(/* @vite-ignore */ p) as Promise<Mod>;

interface Lane { name: string; midi: number; hits: number[] }
interface Beat { id: string; grid: number; bars: number; lanes: Lane[] }
interface Fill { id: string; grid?: number; lanes: Lane[] }

describe("既存資産へ回す：drumLibrary の定型ビート（四肢ゲート）", () => {
  it("32型ぜんぶに四肢ゲートを当て、赤は診断として記録する（型は直さない）", async () => {
    const lib = await load(`${ROOT}/apps/api/src/music/drumLibrary.ts`);
    const beats = lib.BEAT_PATTERNS as Beat[];
    expect(beats.length).toBe(32); // 資産の数（変わったらこの記録も見直す）

    const verdicts = beats.map((b) => grooveLimbGate(b.lanes as GrooveLane[], `limbs.beat:${b.id}`));
    const failed = verdicts.filter((v) => !v.pass);
    const vacuous = verdicts.filter((v) => isVacuous(v.coverage));
    if (failed.length) console.error("【診断】四肢ゲートに落ちた定型ビート:\n" + failed.map((v) => `  ${v.id}: ${v.problems.join(" / ")}`).join("\n"));

    // ── 記録（2026-09-09 実測）＝**直さない。診断として固定する**（§6-4 #10・M4 Scope の明示指示）──
    // 落ちたのは 1型だけ：`w68-dr-clap-hemiola` の step 0 で Shaker＋Clap＋Dum＝手が3本。
    // これは「ドラマー1人＝2手2足」を前提にした源流のゲートに対する赤であって、**型の欠陥とは限らない**
    // （world68 の3型は打楽器アンサンブル＝複数奏者の想定。手が3本でも人が2人なら成立する）。
    // 直すかどうかはオーナーの耳と判断。ここは「黙って増減したら気づける」ように件数と id を固定する。
    expect(failed.map((v) => v.id)).toEqual(["limbs.beat:w68-dr-clap-hemiola"]);
    expect(failed[0]!.problems).toEqual(["step 0: 3 hand voices > 2 hands Shaker,Clap,Dum"]);
    // 空虚（同時打点が1つも無い＝四肢ゲートが何も証明していない）型も**記録**する。合格の見た目に騙されない。
    expect(vacuous.map((v) => v.id)).toEqual([
      "limbs.beat:beat8.offbeat_hh", "limbs.beat:w68-dr-shaker",
      "limbs.beat:w68-dr-dumtek-a", "limbs.beat:w68-dr-dumtek-b", "limbs.beat:w68-dr-jigskel",
    ]);
    // 被覆率＝同時打点のある時刻の割合。0 なら「合格」は空虚なので、下限を明示して守る（§6-4 #7）。
    const s = coverageSummary(verdicts, "coverage.beats");
    expect(s.value.checks).toBe(32);
    expect(s.value.meanFrac).toBeGreaterThan(0.3);
  });

  it("フィル型（15＋6/8）にも当てる＝ゴースト/タムの重なりが手に収まっているか", async () => {
    const lib = await load(`${ROOT}/apps/api/src/music/drumLibrary.ts`);
    const fills = [...(lib.FILL_TYPES as Fill[]), lib.FILL_6_8 as Fill];
    expect(fills.length).toBe(16);
    const verdicts = fills.map((f) => grooveLimbGate(f.lanes as GrooveLane[], `limbs.fill:${f.id}`));
    const failed = verdicts.filter((v) => !v.pass);
    if (failed.length) console.error("【診断】四肢ゲートに落ちたフィル型:\n" + failed.map((v) => `  ${v.id}: ${v.problems.join(" / ")}`).join("\n"));
    // 記録（2026-09-09 実測）：落ち 0 件。
    expect(failed.map((v) => v.id)).toEqual([]);
    // 空虚な合格の数も記録する（単発しか無いフィルは四肢ゲートが何も証明していない）。
    const vacuous = verdicts.filter((v) => isVacuous(v.coverage)).map((v) => v.id);
    console.info(`【診断】四肢ゲートが空振りしたフィル型（同時打点なし）＝${vacuous.length}件: ${vacuous.join(", ") || "なし"}`);
    expect(vacuous.length).toBeLessThanOrEqual(16);
  });
});

describe("既存資産へ回す：chordLibrary", () => {
  it("M4 の検証器は当たらない（絶対音高を持たない辞書だから）＝理由つきで記録する", async () => {
    const lib = await load(`${ROOT}/apps/api/src/music/chordLibrary.ts`);
    const types = lib.COMP_TYPES as { id: string; rh: unknown[] }[];
    expect(types.length).toBeGreaterThan(40);
    // chordLibrary の型は「セル（attack/hold/rest）＋度数」であって実音を持たない（実音化は web の
    // resolveChordPattern）。band_overlap（ピッチ集合）・四肢（打点の同時性）はどちらも実音か打点が要る。
    // avoid note のゲートは M6b・**生成器が積むボイシングのみ**が対象（QUALITY_INTERVALS["11"] のような
    // 既存資産を否定しないため＝計画 §5-2 M6b）。したがって M4 でこの辞書に当てる検証器は無い。
    const hasAbsolutePitch = types.some((t) => JSON.stringify(t).includes('"pitch"'));
    expect(hasAbsolutePitch).toBe(false);
  });
});
