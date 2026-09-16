import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

describe("S0 契約：往復一致（実装＝S4 で緑化）", () => {
  // 生成器の絶対音 → 和音パターンの明示音 {deg, oct, vel}（music-core の逆写像）→ web resolveChordPattern の実音化 → 絶対音、が恒等。
  //   骨子：F-A の各打点を chordsPerCell のコードで写し、解決した pitch/start/dur/vel が F-A と deepStrictEqual（同じ進行・同じ調）。
  it.todo("F-A の全音：絶対音→明示音→実音化→絶対音 が恒等（pitch/start/dur/vel）");
  it.todo("明示音の解決 pitch = rootRef(chordRoot)=48+pc ＋ degreeInterval(deg, quality) ＋ 12×oct（api/web 同一関数）");
  it.todo("R/3/5/7 は質依存・それ以外はルートからの固定半音トークン（2/b3/4/#4/b5/#5/6/b7/#7/b2/#1/b6/#6）");
  it.todo("未知の度数トークン＝例外（黙って根音にしない）／左手 deg に 7 を足す");
  it.todo("lh.hits[].oct 指定時は左手帯と低音域ガードを適用しない（指定の高さのまま）");
  it.todo("明示音のある打点は voiceToTop を通らない（明示音の無い打点だけ従来どおり）");
});

describe("S0 契約：サステインペダル（CC64）の保持（実装＝S3〜S5 で緑化）", () => {
  it.todo("生成器の pedal（秒）→ content.pedal {start,dur}（拍）→ 再び秒で F-A の pedal と一致");
  it.todo("content.pedal は移調・写し・保存の往復で落ちない（additive・未知フィールド保持）");
  it.todo("MIDI 書き出し：pedal ありはノートのトラックに CC64 の 127/0 を down/up で書き、ノートの長さは延ばさない");
  it.todo("再生直前の解決：踏んでいる間に離鍵した音はペダルを離す時刻まで鳴る／同じ音高の踏み直しで前の音は止まる");
  it.todo("F-C（1小節に丸めた版）と F-A（2拍替わり）で出力が違う＝丸めていない反証（§3 (d)）");
});

describe("S0 契約：既存 content の bit 一致（実装の各段で緑を維持）", () => {
  it.todo("pedal 未指定の content＝キーを生やさない＝再生スケジュール・MIDI 書き出しのバイト列が従来と一致");
  it.todo("明示音の無い和音パターン＝resolveChordPattern の出力が従来と deepStrictEqual");
});
