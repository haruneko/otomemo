// 音符を割る候補UI＝プルダウンの組み合わせ（案A・design §31-5・オーナー裁定 2026-07-30c）。
// 監査（2026-07-30c）反映：本丸は割り方を図で見せること／プルダウンは候補集合の分解（ライブAPI不要・
// 開時1回を局所照合）／初期は全「割らない」＝機械は事前選択しない（頻度は事実なので「多い形を入れる」ボタン）／
// 位置が複数あるときは小図で見分け／到達不能・促音/語境界警告・非4/4縮退を引き継ぐ。
import { useMemo, useState } from "react";
import type { Note } from "../music";
import type { SplitCandidatesResponse, SplitCandidateDTO } from "../api";
import {
  onsetFigure, decomposeOptions, matchCandidate, selectionAdded, candidateToSelection, optionLabel,
  type Cell,
} from "../lyricSplitCompose";

const CELL_CHAR: Record<Cell, string> = { orig: "●", added: "○", none: "·" };

/** 音符ローカルの割り図（●=頭・○=足す・·=無）＝プルダウンの位置違いを見分ける小図。 */
function localFig(startSlot: number, lenSlots: number, addedSlots: number[]): string {
  const cells: string[] = [];
  const add = new Set(addedSlots);
  for (let s = startSlot; s < startSlot + lenSlots; s++) cells.push(s === startSlot ? "●" : add.has(s) ? "○" : "·");
  return cells.join("");
}

export function LyricSplitComposer({
  origNotes, range, meter, data, onApply,
}: {
  origNotes: Note[];
  range: { start: number; beats: number };
  meter: { beatsPerBar: number; gridPerBeat: number };
  data: SplitCandidatesResponse;
  onApply: (notesAfter: Note[]) => void;
}) {
  const gpb = meter.gridPerBeat;
  const bpb = meter.beatsPerBar;
  const inRangeIdx = useMemo(() => {
    const end = range.start + range.beats;
    return origNotes.map((n, i) => ({ n, i })).filter(({ n }) => n.start >= range.start && n.start < end)
      .sort((a, b) => a.n.start - b.n.start || a.i - b.i).map(({ i }) => i);
  }, [origNotes, range.start, range.beats]);
  const origStarts = useMemo(() => inRangeIdx.map((i) => origNotes[i]!.start), [inRangeIdx, origNotes]);
  const options = useMemo(() => decomposeOptions(data.candidates, inRangeIdx), [data.candidates, inRangeIdx]);
  const k = data.candidates[0]?.addedOnsets ?? 0; // 余りモーラ数（全候補で同じ）

  // 選択＝音符index→option.key。初期は全「割らない」（機械は事前選択しない＝監査5）。
  const [sel, setSel] = useState<Map<number, string>>(() => new Map(inRangeIdx.map((i) => [i, ""])));

  const added = selectionAdded(options, sel);
  const matched = added === k ? matchCandidate(data.candidates, inRangeIdx, sel) : null;
  const remaining = k - added;

  const setOne = (idx: number, key: string) => setSel((prev) => new Map(prev).set(idx, key));
  const loadSelection = (cand: SplitCandidateDTO) => setSel(candidateToSelection(cand, inRangeIdx));

  // 割れる音符（選択肢が2つ以上）だけプルダウンを出す＝スマホ幅で音符数ぶん並べない（監査2）。
  const splittable = inRangeIdx.filter((idx) => (options.get(idx)?.length ?? 0) > 1);
  const noteBeat = (idx: number) => (Math.floor(origNotes[idx]!.start) % bpb) + 1; // 小節内の拍番号（1..bpb）

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
        <button type="button" className="split-seed" aria-label="split-seed-common"
          onClick={() => loadSelection(data.candidates[data.byPreference[0]!]!)}>
          実曲でいちばん多い形を入れる（{topFreq}回）
        </button>
      )}

      {/* 音符ごとのプルダウン（割れる音符だけ）。位置違いは option の小図で見分ける。 */}
      <div className="split-dropdowns">
        {splittable.map((idx) => {
          const opts = options.get(idx)!;
          const startSlot = Math.round(origNotes[idx]!.start * gpb);
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

      {/* 組んだ形の図＋残り＋適用。 */}
      <div className="split-preview">
        <span className="split-fig" aria-label="split-figure">
          {(matched ? onsetFigure(matched.notesAfter, origStarts, range, gpb, bpb)
            : []).map((c, i) => <span key={i} className={`fig-${c}`}>{CELL_CHAR[c]}</span>)}
        </span>
        <span className="muted" aria-label="split-remaining">
          {remaining > 0 ? `残り：あと${remaining}` : remaining < 0 ? `割りすぎ：${-remaining}多い` : matched ? "ちょうど" : "この形は候補にありません"}
        </span>
        <button type="button" aria-label="split-apply" disabled={!matched} onClick={() => matched && onApply(matched.notesAfter)}>
          この形にする
        </button>
      </div>
      {matched?.specialBeatHit && <span className="muted split-warn">促音（っ）が拍の頭に来ています</span>}
      {matched?.wordBoundaryHit && <span className="muted split-warn">語の途中で割れています</span>}
      {!data.backedByCorpus && <span className="muted split-note">この拍子は実曲統計の裏がまだ＝拍の重みからの提案です</span>}

      {/* 候補リスト（2軸・上位）＝図つきで一望。タップでプルダウンに読み込む（ゼロから組まない）。 */}
      <SplitList data={data} origStarts={origStarts} range={range} gpb={gpb} bpb={bpb} onPick={loadSelection} />
      {data.truncated && <span className="muted split-note">ほかにも割り方があります（上位だけ表示）</span>}
    </div>
  );
}

function SplitList({
  data, origStarts, range, gpb, bpb, onPick,
}: {
  data: SplitCandidatesResponse; origStarts: number[]; range: { start: number; beats: number };
  gpb: number; bpb: number; onPick: (c: SplitCandidateDTO) => void;
}) {
  const [axis, setAxis] = useState<"facts" | "preference">("facts");
  const order = (axis === "facts" ? data.byFacts : data.byPreference).slice(0, 8);
  return (
    <div className="split-candidates">
      <div className="split-axis" role="tablist" aria-label="split-order">
        <button type="button" role="tab" aria-selected={axis === "facts"} className={axis === "facts" ? "on" : ""} onClick={() => setAxis("facts")}>割り方が少ない順</button>
        <button type="button" role="tab" aria-selected={axis === "preference"} className={axis === "preference" ? "on" : ""} onClick={() => setAxis("preference")}>実曲に多い順</button>
      </div>
      <ul className="split-list">
        {order.map((ci) => {
          const c = data.candidates[ci]!;
          const cells = onsetFigure(c.notesAfter, origStarts, range, gpb, bpb);
          return (
            <li key={ci}>
              <button type="button" aria-label={`split-pick-${ci}`} onClick={() => onPick(c)}>
                <span className="split-fig">{cells.map((cl, i) => <span key={i} className={`fig-${cl}`}>{CELL_CHAR[cl]}</span>)}</span>
                <span className="split-meta muted">
                  {data.backedByCorpus ? (c.corpusKnown ? `実曲に${c.corpusFreq}回` : "実曲では珍しい") : "拍の重みから"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
