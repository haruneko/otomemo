// 音符を割る候補UI＝プルダウンの組み合わせ（案A・design §31-5・オーナー裁定 2026-07-30c）。
// 監査（2026-07-30c）反映：本丸は割り方を図で見せること／プルダウンは候補集合の分解（ライブAPI不要・
// 開時1回を局所照合）／初期は全「割らない」＝機械は事前選択しない（頻度は事実なので「多い形を入れる」ボタン）／
// 位置が複数あるときは小図で見分け／到達不能・促音/語境界警告・非4/4縮退を引き継ぐ。
import { useMemo, useState } from "react";
import { assembleSplitNotes } from "@cm/music-core";
import type { Note } from "../music";
import type { SplitCandidatesResponse, SplitCandidateDTO } from "../api";
import {
  decomposeOptions, matchCandidate, selectionAdded, candidateToSelection, optionLabel,
} from "../lyricSplitCompose";
import { SplitRoll } from "./SplitRoll";

/** 音符ローカルの割り図（●=頭・○=足す・·=無）＝プルダウンの `<option>` 内でだけ使う小図（HTML の option に SVG は入らない）。 */
function localFig(startSlot: number, lenSlots: number, addedSlots: number[]): string {
  const cells: string[] = [];
  const add = new Set(addedSlots);
  for (let s = startSlot; s < startSlot + lenSlots; s++) cells.push(s === startSlot ? "●" : add.has(s) ? "○" : "·");
  return cells.join("");
}

export function LyricSplitComposer({
  origNotes, moras, range, meter, data, onApply,
}: {
  origNotes: Note[];
  moras: string[]; // 句のかな列（範囲内音符へ1対1で写す＝適用時の組み立てに要る）
  range: { start: number; beats: number };
  meter: { beatsPerBar: number; gridPerBeat: number };
  data: SplitCandidatesResponse;
  onApply: (notesAfter: Note[]) => void;
}) {
  const gpb = meter.gridPerBeat;
  const bpb = meter.beatsPerBar;
  // slot の原点＝句頭が属する小節の頭（コアと同じ基準＝弱起でも図と位置がズレない・監査 Bug3）。
  const originBeat = Math.floor((range.start + 1e-6) / bpb) * bpb;
  const inRangeIdx = useMemo(() => {
    const end = range.start + range.beats;
    return origNotes.map((n, i) => ({ n, i })).filter(({ n }) => n.start >= range.start && n.start < end)
      .sort((a, b) => a.n.start - b.n.start || a.i - b.i).map(({ i }) => i);
  }, [origNotes, range.start, range.beats]);
  const origStarts = useMemo(() => inRangeIdx.map((i) => origNotes[i]!.start), [inRangeIdx, origNotes]);
  const origInRange = useMemo(() => inRangeIdx.map((i) => origNotes[i]!), [inRangeIdx, origNotes]);
  // ピッチの正規化は句で1回＝全候補で輪郭を揃える（動くのは足した頭の位置だけ・設計統合）。
  const [lo, hi] = useMemo(() => {
    const ps = origInRange.map((n) => n.pitch).filter(Number.isFinite);
    return ps.length ? [Math.min(...ps), Math.max(...ps)] : [0, 1];
  }, [origInRange]);
  const options = useMemo(() => decomposeOptions(data.candidates, inRangeIdx), [data.candidates, inRangeIdx]);
  const k = data.candidates[0]?.addedOnsets ?? 0; // 余りモーラ数（全候補で同じ）

  // 選択＝音符index→option.key。初期は全「割らない」（機械は事前選択しない＝監査5）。
  const [sel, setSel] = useState<Map<number, string>>(() => new Map(inRangeIdx.map((i) => [i, ""])));
  // 拍ごとのプルダウンは従＝既定で畳む（主動線は上の候補リスト・初見レビュー 2026-07-30）。
  const [dropsOpen, setDropsOpen] = useState(false);

  const added = selectionAdded(options, sel);
  const matched = added === k ? matchCandidate(data.candidates, inRangeIdx, sel) : null; // 事実表示用（頻度など）
  const remaining = k - added;

  // 選んだ割り方（splits）＝プルダウンの各 option の slots を集める。
  const selectedSplits = useMemo(() => {
    const out: { noteIndex: number; slot: number }[] = [];
    for (const idx of inRangeIdx) {
      const opt = (options.get(idx) ?? []).find((o) => o.key === (sel.get(idx) ?? ""));
      for (const slot of opt?.slots ?? []) out.push({ noteIndex: idx, slot });
    }
    return out;
  }, [options, sel, inRangeIdx]);

  // 適用は「合計が余りに一致」していれば可＝返却候補の上限で切れても組み立てで適用できる（監査 Bug1）。
  const applicable = added === k && remaining === 0;
  const doApply = () => onApply(assembleSplitNotes(origNotes, moras, range, meter, selectedSplits) as Note[]);
  // 組んだ形の図＝matched があればその notesAfter、組み上がっていれば組み立てて作る。まだ何も選んでいない
  // ときは「割らない形（元のメロ）」を出す＝空箱でなく現状が見える（事実表示・事前選択ではない・設計統合）。
  const previewNotes = matched ? matched.notesAfter
    : applicable ? assembleSplitNotes(origNotes, moras, range, meter, selectedSplits)
    : origInRange;

  const setOne = (idx: number, key: string) => setSel((prev) => new Map(prev).set(idx, key));
  const loadSelection = (cand: SplitCandidateDTO) => setSel(candidateToSelection(cand, inRangeIdx));

  // 割れる音符（選択肢が2つ以上）だけプルダウンを出す＝スマホ幅で音符数ぶん並べない（監査2）。
  const splittable = inRangeIdx.filter((idx) => (options.get(idx)?.length ?? 0) > 1);
  const noteBeat = (idx: number) => ((Math.floor(origNotes[idx]!.start) % bpb) + bpb) % bpb + 1; // 小節内の拍番号（弱起の負剰余対策・監査 Bug3）

  if (data.candidates.length === 0) {
    return (
      <div className="split-composer" aria-label="lyric-split">
        <span className="muted">割って収まる形が見つかりませんでした（言い回しを変えるか、音符を足してください）。</span>
      </div>
    );
  }

  const topFreq = data.backedByCorpus && data.byPreference.length
    ? data.candidates[data.byPreference[0]!]!.corpusFreq : 0;

  return (
    <div className="split-composer" aria-label="lyric-split">
      {/* 機械の事前選択はしない＝頻度は事実なのでボタンで（「おすすめ」等の判断語は使わない・監査5）。 */}
      {topFreq > 0 && (
        // 回数は下のリスト側だけに出す＝上下の「◯回」二重を解消（Fable監査・オーナー折衷＝ボタンは残す）。
        <button type="button" className="split-seed" aria-label="split-seed-common"
          onClick={() => loadSelection(data.candidates[data.byPreference[0]!]!)}>
          既存曲でいちばん多い形を入れる
        </button>
      )}

      {/* 組んだ形の図（メロ概形）＝上に置く。残り／適用は最下部へ（選ぶ→決める・初見レビュー 2026-07-30）。 */}
      <div className="split-preview" aria-label="split-figure">
        <SplitRoll notesAfter={previewNotes} origStarts={origStarts} range={range} meter={meter} lo={lo} hi={hi} variant="preview" />
      </div>
      {matched?.specialBeatHit && <span className="muted split-warn">促音（っ）が拍の頭に来ています</span>}
      {matched?.wordBoundaryHit && <span className="muted split-warn">語の途中で割れています</span>}
      {!data.backedByCorpus && <span className="muted split-note">この拍子は既存曲の集計がないため、拍の強弱からの候補です</span>}

      {/* 候補リスト（2軸・上位）＝主動線。タップでプルダウンに読み込む（ゼロから組まない）。 */}
      <SplitList data={data} origStarts={origStarts} range={range} meter={meter} lo={lo} hi={hi} onPick={loadSelection} />
      {data.truncated && <span className="muted split-note">ほかにも割り方があります（上位だけ表示）</span>}

      {/* 音符ごとのプルダウン（割れる音符だけ）＝従＝既定で畳む。位置違いは option の小図で見分ける。 */}
      {splittable.length > 0 && (
        <div className="split-dropdowns-fold">
          <button
            type="button"
            className="split-fold-toggle"
            aria-expanded={dropsOpen}
            onClick={() => setDropsOpen((o) => !o)}
          >
            {dropsOpen ? "▾" : "▸"} 拍ごとに細かく変える
          </button>
          {dropsOpen && (
            <div className="split-dropdowns">
              {splittable.map((idx) => {
                const opts = options.get(idx)!;
                const startSlot = Math.round((origNotes[idx]!.start - originBeat) * gpb); // 原点相対（監査 Bug3）
                const lenSlots = Math.max(1, Math.round(origNotes[idx]!.dur * gpb));
                const dupCount = new Map<number, number>();
                for (const o of opts) dupCount.set(o.added, (dupCount.get(o.added) ?? 0) + 1);
                return (
                  <label key={idx} className="split-drop">
                    <span className="muted">{noteBeat(idx)}拍目</span>
                    <select aria-label={`split-note-${idx}`} value={sel.get(idx) ?? ""} onChange={(e) => setOne(idx, e.target.value)}>
                      {opts.map((o) => (
                        <option key={o.key} value={o.key}>
                          {optionLabel(o)}{o.added > 0 && (dupCount.get(o.added) ?? 0) > 1 ? `（${localFig(startSlot, lenSlots, o.slots)}）` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 確定＋残り＝最下部（候補リストと拍プルダウンより下）。適用は過不足なしなら常に可（Bug1）。 */}
      <div className="split-confirm">
        <span className="muted" aria-label="split-remaining">
          {remaining > 0 ? `残り：あと${remaining}` : remaining < 0 ? `割りすぎ：${-remaining}多い` : "過不足なし"}
        </span>
        <button type="button" aria-label="split-apply" disabled={!applicable} onClick={doApply}>
          この形で音符を割る
        </button>
      </div>
    </div>
  );
}

function SplitList({
  data, origStarts, range, meter, lo, hi, onPick,
}: {
  data: SplitCandidatesResponse; origStarts: number[]; range: { start: number; beats: number };
  meter: { beatsPerBar: number; gridPerBeat: number }; lo: number; hi: number; onPick: (c: SplitCandidateDTO) => void;
}) {
  const [axis, setAxis] = useState<"facts" | "preference">("facts");
  const order = (axis === "facts" ? data.byFacts : data.byPreference).slice(0, 8);
  return (
    <div className="split-candidates">
      <div className="split-axis" role="tablist" aria-label="split-order">
        <button type="button" role="tab" aria-selected={axis === "facts"} className={axis === "facts" ? "on" : ""} onClick={() => setAxis("facts")}>割り方が少ない順</button>
        <button type="button" role="tab" aria-selected={axis === "preference"} className={axis === "preference" ? "on" : ""} onClick={() => setAxis("preference")}>既存曲に多い順</button>
      </div>
      <ul className="split-list">
        {order.map((ci) => {
          const c = data.candidates[ci]!;
          return (
            <li key={ci}>
              <button type="button" aria-label={`split-pick-${ci}`} onClick={() => onPick(c)}>
                <SplitRoll notesAfter={c.notesAfter} origStarts={origStarts} range={range} meter={meter} lo={lo} hi={hi} variant="row" />
                <span className="split-meta muted">
                  {data.backedByCorpus ? (c.corpusKnown ? `既存曲に${c.corpusFreq}回` : "既存曲では珍しい") : "拍の重みから"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
