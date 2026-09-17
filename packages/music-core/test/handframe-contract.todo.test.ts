import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPLICIT_ROOT_REF, explicitNotePitch, mergePedalWindows, pitchToExplicitNote, QUALITY_INTERVALS, resolveSustainPedal } from "../src/index";

// ピアノ伴奏（phrase_maker 試作 #1）取り込み S0＝契約と基準音の固定。
// 正典＝docs/drafts/2026-09-16-handframe-evolution-design.md §3・§4・§5 S0／docs/design.md「サステインペダル（CC64）の持ち方」。
// 進捗の定義は耳（試作 #1 と同じ良さか）。ここの一致は「耳で合格した音を運べた証明」＝診断。
//
// 基準音（fixtures/handframe・生成＝gen_reference.py・phrase_maker e186970 を読むだけ）：
//   F-A reference_half_mid.json          2拍でコードが替わる進行・打鍵の揺れなし（humanize=False）
//   F-C reference_bar_rounded_mid.json   同じ進行を1小節に丸めた 4/4 版（§3 (b)(d) 用）
//   F-B（耳の基準・揺れあり）＝ scratchpad listen7/71_2beat_half_mid.mp3（work/h1_half_mid.mid）＝fixture にしない。
// F-A/F-C の音は listen7 work/*.mid と音高・16分格子位置・音数・ペダル数が一致（揺れを外しただけ）を 2026-09-17 に確認。
// 実装が無い契約は it.todo（スイートを赤にしない既存の作法）。基準音の読み込みだけは今から緑で固定する。

type RefNote = { pitch: number; start: number; end: number; vel: number; hand: string; cell: number };
type Ref = { tempo: number; cellBeats: number; chordsPerCell: string[]; notes: RefNote[]; pedal: { down: number; up: number }[] };
const here = dirname(fileURLToPath(import.meta.url));
const load = (f: string): Ref => JSON.parse(readFileSync(join(here, "fixtures/handframe", f), "utf8"));

describe("S0 基準音 fixture（phrase_maker 無しで読める）", () => {
  for (const [f, cellBeats, nNotes, nPedal] of [
    ["reference_half_mid.json", 2, 243, 32],
    ["reference_bar_rounded_mid.json", 4, 235, 16],
  ] as const) {
    it(`${f}: 音数・ペダル数・時間の整合`, () => {
      const r = load(f);
      expect(r.tempo).toBe(96);
      expect(r.cellBeats).toBe(cellBeats);
      expect(r.notes.length).toBe(nNotes);
      expect(r.pedal.length).toBe(nPedal);
      const cellSec = (cellBeats * 60) / r.tempo;
      for (const n of r.notes) {
        expect(Number.isInteger(n.pitch) && Number.isInteger(n.vel)).toBe(true);
        expect(n.end).toBeGreaterThan(n.start);
        // 揺れなし＝打点は16分格子上
        const q = n.start / (15 / r.tempo);
        expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-9);
        // コードが替わる境界をまたぐ音が無い（§3 (e)）。事実＝試作 #1 は同じコードが続く区間へは伸ばす
        // （F-A で 48 音＝右手は +0.605 秒・左手は次の区間の終わりまで）。境界で切るのは次のコードが違うときだけ。
        const k = Math.ceil(n.end / cellSec - 1e-9) - 1; // 音の終わりが属する区間
        for (let c = n.cell + 1; c <= k; c++) expect(r.chordsPerCell[c]).toBe(r.chordsPerCell[n.cell]);
      }
      // ペダル＝1区間に1回・重ならない・区間の中で離す
      r.pedal.forEach((p, i) => {
        expect(p.down).toBeCloseTo(i * cellSec, 9);
        expect(p.up).toBeGreaterThan(p.down);
        expect(p.up).toBeLessThan((i + 1) * cellSec);
      });
    });
  }
});

describe("S4 契約：明示の音の写しと解決（music-core・api/web 共有）", () => {
  // 全体の往復（写し→web resolveChordPattern→絶対音）は apps/web/test/handframe-roundtrip.test.ts。
  const QUALS = Object.keys(QUALITY_INTERVALS);
  it("全ての質×12のルート×C0〜C8：絶対音→明示の音→絶対音 が恒等", () => {
    for (const q of QUALS) for (let root = 0; root < 12; root++) for (let p = 12; p <= 108; p++) {
      const n = pitchToExplicitNote(p, root, q);
      expect(Number.isInteger(n.oct)).toBe(true);
      expect(explicitNotePitch(n, root, q)).toBe(p);
    }
  });
  it("調を基準にしたルートの位置：調を変えると全ての音が同じ半音だけ動く", () => {
    for (const q of QUALS) for (let root = 0; root < 12; root++) for (let k = 0; k < 12; k++) for (const p of [40, 55, 67, 80]) {
      const n = pitchToExplicitNote(p, root, q, 0);
      expect(explicitNotePitch(n, (root + k) % 12, q, k)).toBe(p + k);
      expect(explicitNotePitch(pitchToExplicitNote(p, root, q, k), root, q, k)).toBe(p);
    }
  });
  it("pitch = 48 + ルートの pc + 度数の半音 + 12×oct（調＝C）", () => {
    expect(EXPLICIT_ROOT_REF).toBe(48);
    expect(explicitNotePitch({ deg: "R", oct: 0 }, "F", "maj7")).toBe(53);
    expect(explicitNotePitch({ deg: "7", oct: 1 }, "F", "maj7")).toBe(53 + 11 + 12);
    expect(explicitNotePitch({ deg: "3", oct: -1 }, 9, "m7")).toBe(57 + 3 - 12);
  });
  it("R/3/5/7 は質依存・それ以外はルートからの固定半音", () => {
    expect(pitchToExplicitNote(64, 0, "").deg).toBe("3");
    expect(pitchToExplicitNote(63, 0, "m").deg).toBe("3");
    expect(pitchToExplicitNote(64, 0, "m").deg).toBe("M3");
    expect(pitchToExplicitNote(70, 0, "7").deg).toBe("7");
    expect(pitchToExplicitNote(70, 0, "").deg).toBe("b7"); // 三和音に 7 は書かない
    expect(pitchToExplicitNote(62, 0, "add9").deg).toBe("2"); // add9 の4番目は 7度ではない
    expect(pitchToExplicitNote(66, 0, "").deg).toBe("#4");
    // 同じトークンが進行に付いてくる：C の 3 → Cm では短3度
    expect(explicitNotePitch({ deg: "3", oct: 0 }, 0, "m")).toBe(51);
    for (const t of ["2", "b3", "4", "#4", "b5", "#5", "6", "b7", "#7", "b2", "#1", "b6", "#6", "M3", "P5"]) {
      expect(explicitNotePitch({ deg: t, oct: 0 }, 0, "")).toBe(explicitNotePitch({ deg: t, oct: 0 }, 0, "m7b5"));
    }
  });
  it("未知の度数トークン＝例外（黙って根音にしない）・oct は整数", () => {
    expect(() => explicitNotePitch({ deg: "9", oct: 0 }, 0, "")).toThrow(/unknown degree/);
    expect(() => explicitNotePitch({ deg: "R", oct: 0.5 }, 0, "")).toThrow();
  });
  // web の経路（voiceToTop を通らない・lh.hits[].oct は左手帯を掛けない）は web 側テストで確認。
});

describe("S5：再生直前の解決（resolveSustainPedal）", () => {
  // S4 で緑化＝apps/web/test/handframe-roundtrip.test.ts：生成器の pedal（秒）→ content.pedal（拍）→ 秒で一致／写し・JSON 保存・調の変更で落ちない。
  // S5 で緑化＝下の「再生直前の解決」。MIDI 書き出しの CC64 は apps/web/test/midi-export.test.ts（@tonejs/midi は web 側）。
  // §3 (d)「F-C と F-A で出力が違う」は S3 で緑化＝test/handframe-band.test.ts へ移した。
  // S5 で緑化＝apps/web/test/midi-export.test.ts・sustain-pedal.test.ts（印の無い音＝同じ配列・同じバイト列）。
  // 明示の音の無い和音パターン＝従来と一致：S4 で web の既存テスト（voicing-ab 金型・music.test）が無変更で緑＋handframe-roundtrip の「無い打点は従来どおり」。
  const W = [{ start: 0, dur: 3.9 }, { start: 4, dur: 3.9 }];
  it("踏んでいる間に離鍵した音はペダルを離す時刻まで鳴る", () => {
    const out = resolveSustainPedal([{ pitch: 60, start: 0, dur: 0.5 }], W);
    expect(out[0]!.dur).toBeCloseTo(3.9, 12);
  });
  it("同じ音高の踏み直しで前の音は止まる（違う高さは止めない）", () => {
    const out = resolveSustainPedal([{ pitch: 60, start: 0, dur: 0.5 }, { pitch: 60, start: 2, dur: 0.5 }, { pitch: 64, start: 1, dur: 0.5 }], W);
    expect(out.map((n) => n.dur)).toEqual([2, expect.closeTo(1.9, 12), expect.closeTo(2.9, 12)]);
  });
  it("窓の外・窓の頭ちょうどの離鍵・窓を越えて押さえている音は延ばさない（同じ参照）", () => {
    const ns = [{ pitch: 60, start: 3, dur: 0.95 }, { pitch: 62, start: 3.5, dur: 0.5 }, { pitch: 64, start: 1, dur: 3 }];
    const out = resolveSustainPedal(ns, W);
    out.forEach((n, i) => expect(n).toBe(ns[i]));
  });
  it("窓が無ければ何もしない", () => {
    const ns = [{ pitch: 60, start: 0, dur: 0.5 }];
    expect(resolveSustainPedal(ns, undefined)).toEqual(ns);
  });
  it("mergePedalWindows＝重なる窓を合わせる", () => {
    expect(mergePedalWindows([{ start: 4, dur: 2 }, { start: 0, dur: 1 }, { start: 5, dur: 2 }])).toEqual([{ start: 0, dur: 1 }, { start: 4, dur: 3 }]);
  });
});
