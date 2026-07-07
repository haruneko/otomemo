import type { Dispatch, SetStateAction } from "react";
import type { Neta } from "../api";
import { KIND_LABEL, kindColor } from "../kinds";
import { isProjectTag, projectName } from "../project";
import { beatsPerBar, PITCH_NAMES } from "../music";
import { MiniRoll } from "./MiniRoll";
import { KindIcon } from "./KindIcon";
import { LANE_COLOR, type Lane } from "./sectionLanes";

// 配置ピッカー・ダイアログ（空セルタップ→ネタを選んで置く）。SectionEditor.tsx から機械分割
// （負債D6）＝挙動不変。絞り込み/相性(拍子・調)の純ロジックは keyPc/BPB から内包する。
export type PickerState = { lane: Lane; position: number; all: Neta[] };

export function PlacePicker({
  picker,
  neta,
  liveTitle,
  BPB,
  keyPc,
  pq,
  setPq,
  pickerSource,
  setPickerSource,
  pickerOtherMeter,
  setPickerOtherMeter,
  pickerRecs,
  placeAt,
  previewNeta,
  createInLane,
  onClose,
}: {
  picker: PickerState;
  neta: Neta;
  liveTitle: string;
  BPB: number;
  keyPc: number;
  pq: string;
  setPq: Dispatch<SetStateAction<string>>;
  pickerSource: string;
  setPickerSource: Dispatch<SetStateAction<string>>;
  pickerOtherMeter: boolean;
  setPickerOtherMeter: Dispatch<SetStateAction<boolean>>;
  pickerRecs: Neta[];
  placeAt: (child: Neta) => void;
  previewNeta: (n: Neta) => void;
  createInLane: () => void;
  onClose: () => void;
}) {
  // ネタの所属プロジェクト（prj: タグ由来）。母集団を器で絞る（A）に使う。
  const netaProjects = (n: Neta) => (n.tags ?? []).filter(isProjectTag).map(projectName);
  const inLane = (kind: string) => (picker.lane.kinds as readonly string[]).includes(kind);
  // ピッカーの相性（B）：拍子一致（bpb比較）。meter 未指定(null)は"不特定"＝中立で表示（断片を隠さない）。
  const sameMeter = (n: Neta) => n.meter == null || beatsPerBar(n.meter) === BPB;
  const fifthsPos = (pc: number) => (((pc * 7) % 12) + 12) % 12;
  const keyDist = (n: Neta) => {
    if (n.key == null) return 3; // keyless＝中立（一致と不一致の中間）
    const d = Math.abs(fifthsPos(n.key) - fifthsPos(keyPc));
    return Math.min(d, 12 - d);
  };
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="place-picker" onClick={(e) => e.stopPropagation()}>
        {/* ヘッダ＝どこに置くかのパンくず（Section ▸ パート ▸ 小節）。"に置く"は自明なので削り、
            位置だけ軽く。Section名は長ければ省略＝1行を保つ。 */}
        <header className="picker-head">
          <span className="picker-crumb">
            <span className="crumb-sec">{liveTitle || KIND_LABEL[neta.kind]}</span>
            <span className="crumb-sep" aria-hidden="true">▸</span>
            {/* 置く種別＝色付きアイコン＋パート名（アイコンだけだと分かりにくい・オーナー）。 */}
            <span className="crumb-kind" style={{ color: LANE_COLOR[picker.lane.key] ?? "var(--accent)" }}>
              <KindIcon kind={picker.lane.kinds[0]!} />
              <span className="crumb-kind-label">{picker.lane.label}</span>
            </span>
            <span className="crumb-sep" aria-hidden="true">▸</span>
            <span className="crumb-fix">{picker.position / BPB + 1}小節目</span>
          </span>
          <button aria-label="close" onClick={onClose}>
            ✕
          </button>
        </header>
        {/* 種別タブは撤去＝タップしたレーンに固定（別パートはそのレーンのセルをタップ）。
            今なにを置くかはヘッダの色付きアイコンで示す（オーナー）。 */}
        {/* 絞り込み＝検索を主役に、その下に元ネタ(器)＋拍子一致のみを1行で。ラベルは"絞り込み"文脈で
            自明なので付けない（オーナー）。生コーパスは出さない＝自作から選ぶ。 */}
        <div className="picker-search-row">
          <input
            aria-label="picker-search"
            className="editor-tags"
            placeholder="絞り込み…（曲名・アーティスト）"
            value={pq}
            onChange={(e) => setPq(e.target.value)}
          />
        </div>
        <div className="picker-filter-row">
          <select aria-label="picker-source" value={pickerSource} onChange={(e) => setPickerSource(e.target.value)}>
            <option value="">自作すべて</option>
            {[...new Set(picker.all.flatMap(netaProjects))].sort().map((pj) => (
              <option key={pj} value={pj}>{pj}</option>
            ))}
          </select>
          <button
            type="button"
            className={"picker-meter-btn" + (!pickerOtherMeter ? " on" : "")}
            aria-label="picker-other-meter"
            aria-pressed={!pickerOtherMeter}
            title={pickerOtherMeter ? "拍子一致のみに絞る" : "拍子違いも出す"}
            onClick={() => setPickerOtherMeter((v) => !v)}
          >
            拍子一致のみ
          </button>
        </div>
        {/* 探して無ければ作る：このレーンの kind で新規作成→配置→編集へ。 */}
        <button type="button" className="picker-create" aria-label="picker-create" onClick={() => void createInLane()}>
          ＋ {pq.trim() ? `「${pq.trim()}」を` : ""}新しい{picker.lane.label}を作る
        </button>
        {/* #20 おすすめ（コーパス）＝拍子/調に合う数件だけ横並び。生1781は出さず推薦経由で。
            tap＝placeAt が library→project にコピーして配置（元コーパスは汚さない）。 */}
        {pickerRecs.length > 0 && (
          <div className="picker-recs" aria-label="picker-recs">
            <span className="picker-recs-head muted">おすすめ（コーパス）</span>
            <div className="picker-recs-strip">
              {pickerRecs.map((n) => (
                <div key={n.id} className="picker-rec" data-kind={n.kind} style={{ ["--k" as string]: kindColor(n.kind) }}>
                  <button
                    type="button"
                    className="picker-rec-tap"
                    aria-label={`picker-rec-${n.id}`}
                    title={n.title ?? n.text ?? "(無題)"}
                    onClick={() => void placeAt(n)}
                  >
                    <MiniRoll neta={n} />
                    <span className="picker-rec-label">{n.title ?? n.text ?? "コーパス"}</span>
                  </button>
                  <button type="button" className="picker-play" aria-label={`preview-${n.id}`} title="試聴" onClick={() => void previewNeta(n)}>▶</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="picker-list">
          {(() => {
            const q = pq.toLowerCase();
            const list = picker.all
              .filter(
                (n) =>
                  inLane(n.kind) &&
                  n.id !== neta.id &&
                  n.scope !== "library" && // コーパスは直接出さない（推薦経由・Phase2）
                  (pickerSource === "" || netaProjects(n).includes(pickerSource)) && // A: 母集団を器で絞る
                  (pickerOtherMeter || sameMeter(n)) && // B: 拍子一致のみ（既定）
                  (n.title ?? n.text ?? "").toLowerCase().includes(q),
              )
              // B: 調が近い順→最近順（拍子は既に一致で絞れている）。
              .sort((a, b) => keyDist(a) - keyDist(b) || (b.created ?? "").localeCompare(a.created ?? ""));
            if (list.length === 0)
              return <p className="muted">置ける{picker.lane.label}のネタがありません（元/拍子の条件を緩めるか、＋新規作成）</p>;
            return list.map((n) => (
              <div key={n.id} className="picker-item" data-kind={n.kind} style={{ ["--k" as string]: kindColor(n.kind) }}>
                <button type="button" className="picker-item-tap" aria-label={`place-${n.id}`} onClick={() => void placeAt(n)}>
                  <div className="picker-item-roll">
                    <MiniRoll neta={n} />
                  </div>
                  <div className="picker-item-meta">
                    <strong>{n.title ?? n.text ?? "(無題)"}</strong>
                    <span className="muted">
                      {KIND_LABEL[n.kind] ?? n.kind}
                      {n.mood ? ` · ${n.mood}` : ""}
                      {n.key != null ? ` · ${PITCH_NAMES[n.key]}` : ""}
                    </span>
                  </div>
                </button>
                <button type="button" className="picker-play" aria-label={`preview-${n.id}`} title="試聴" onClick={() => void previewNeta(n)}>▶</button>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}
