// 編集画面のメタ設定パネル（共通パーツ化 CP1・design「編集画面の共通パーツ化」）。
// 折りたたみトグル＋要約＋メタ本体（調/mode/拍子/tempo/音色/+4拍/継続調査/タグ/ムード）。
// ※MIDI書き出しは単体編集画面から撤去済（2026-07-04）＝Section の いじる▾ のみ。
// どの枠を出すかは flags で決める（kind 分岐を集約）。折りたたみ状態(localStorage)と要約はここに閉じる。
import { useState } from "react";
import { GM_INSTRUMENTS, beatsPerBar, PITCH_NAMES as KEY_NAMES } from "../music";
import { NumberField } from "./NumberField";
import { BarsControl } from "./BarsControl";

const METERS = ["4/4", "3/4", "6/8", "2/4", "5/4", "12/8"];

export interface MetaFlags {
  collapsible: boolean; // 折りたたみUIを出すか（音楽ネタ＋section/song）
  showKey: boolean;
  showMeta: boolean; // テンポ
  isChord: boolean;
  isContainer: boolean;
  isMelody: boolean;
  isBass: boolean;
  isChordPat: boolean;
  isMusic: boolean;
  isThemeable: boolean;
  hasChords: boolean; // 調を推定ボタン（コードあり）
}

export function MetaPanel(p: {
  flags: MetaFlags;
  keyPc: number;
  mode: string;
  meter: string;
  tempo: number;
  program: number;
  tags: string;
  mood: string;
  setKey: (v: number) => void;
  setMode: (v: string) => void;
  setMeter: (v: string) => void;
  setTempo: (v: number) => void;
  setProgram: (v: number) => void;
  setTags: (v: string) => void;
  setMood: (v: string) => void;
  onDetectKey: () => void;
  onExtendLen: () => void;
  onToggleSchedule: () => void;
  schedId: string | null;
  rollBars?: { len: number; setLen: (n: number) => void; pickup: number; setPickup: (n: number) => void; meter?: string } | null; // 小節/弱起（roll のみ・縦詰めで設定内へ・小節数は拍子基準）
}) {
  const f = p.flags;
  // 折りたたみ状態（localStorage 記憶・既定=畳む＝スマホの空間優先）。
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("cm-editor-meta-open") === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOpen((v) => {
      const n = !v;
      try {
        localStorage.setItem("cm-editor-meta-open", n ? "1" : "0");
      } catch {
        /* localStorage不可でも動く */
      }
      return n;
    });
  const summary = [
    f.showKey ? `${KEY_NAMES[p.keyPc]} ${p.mode === "major" ? "長調" : "短調"}` : null,
    f.isContainer ? p.meter : null,
    f.showMeta ? `♩${p.tempo}` : null,
    f.isMelody || f.isBass || f.isChordPat ? GM_INSTRUMENTS.find((g) => g.value === p.program)?.label : null,
    p.rollBars ? `${Math.max(1, Math.round(p.rollBars.len / beatsPerBar(p.rollBars.meter)))}小節` : null,
    p.rollBars && p.rollBars.pickup > 0 ? `弱起${p.rollBars.pickup}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {f.collapsible && (
        <button type="button" className="editor-meta-toggle" aria-label="toggle-meta" aria-expanded={open} onClick={toggle}>
          <span className="emt-caret">{open ? "▾ 設定" : "▸ 設定"}</span>
          {!open && summary && <span className="editor-meta-summary">{summary}</span>}
        </button>
      )}
      {(!f.collapsible || open) && (
        <>
          {/* 属性行：調→長短→拍子→テンポ→音色→アクション の統一順。非該当kindはその枠を出さないだけ。 */}
          <div className="editor-attrs">
            {f.showKey && (
              <label className="meta">
                調
                <select aria-label="key" value={p.keyPc} onChange={(e) => p.setKey(Number(e.target.value))}>
                  {KEY_NAMES.map((nm, i) => (
                    <option key={i} value={i}>
                      {nm}
                    </option>
                  ))}
                </select>
                <select aria-label="mode" value={p.mode} onChange={(e) => p.setMode(e.target.value)}>
                  <option value="major">長調</option>
                  <option value="minor">短調</option>
                </select>
              </label>
            )}
            {f.isChord && f.hasChords && (
              <button type="button" aria-label="detect-key" title="コードから調を推定して設定（クリックで候補=Cmaj/Am 等を順に切替）" onClick={p.onDetectKey}>
                調を推定
              </button>
            )}
            {(f.isMusic || f.isContainer) && (
              // 拍子はテンポ(showMeta)と同じく全ての拍グリッドkindで編集可＝単体のメロ/ベース等も
              // 6/8 等に切替できる（roll のグリッドと MIDI 拍子ヘッダに反映）。旧=container限定は非対称の見落とし。
              <label className="meta">
                拍子
                <select aria-label="meter" value={p.meter} onChange={(e) => p.setMeter(e.target.value)}>
                  {METERS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {f.showMeta && (
              <label className="meta">
                ♩
                <NumberField aria-label="tempo" min={20} max={300} value={p.tempo} onChange={p.setTempo} />
              </label>
            )}
            {(f.isMelody || f.isBass || f.isChordPat) && (
              <label className="meta">
                音色
                <select aria-label="program" value={p.program} onChange={(e) => p.setProgram(Number(e.target.value))}>
                  {GM_INSTRUMENTS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {f.isMelody && (
              <button type="button" onClick={p.onExtendLen}>
                ＋1小節
              </button>
            )}
            {/* 単体ネタの MIDI 書き出しは編集画面から撤去（薄く保つ・2026-07-04）。書き出しは Section
                本体（合成/分割）から。将来は「エクスポート機能でネタを選ぶ」導線も可。 */}
            {f.isThemeable && (
              <button type="button" className={p.schedId ? "primary" : ""} aria-label="continuous-research" title="このテーマを見てない間も継続して調べ、参考をトレイに溜める" onClick={p.onToggleSchedule}>
                {p.schedId ? "🔁 継続調査中" : "🔁 継続して調べる"}
              </button>
            )}
          </div>
          {/* 小節/弱起（roll のみ・縦詰めで設定内へ移動）。 */}
          {p.rollBars && (
            <div className="roll-controls">
              <BarsControl
                bars={Math.max(1, Math.round(p.rollBars.len / beatsPerBar(p.rollBars.meter)))}
                max={Math.max(4, Math.ceil(p.rollBars.len / beatsPerBar(p.rollBars.meter)))}
                onChange={(n) => p.rollBars!.setLen(n * beatsPerBar(p.rollBars!.meter))}
              />
              <div className="bars-control" title="弱起（拍0の前の空き）">
                <span className="muted">弱起</span>
                <button type="button" aria-label="pickup-dec" disabled={p.rollBars.pickup <= 0} onClick={() => p.rollBars!.setPickup(Math.max(0, p.rollBars!.pickup - 1))}>−</button>
                <span aria-label="pickup-count">{p.rollBars.pickup}</span>
                <button type="button" aria-label="pickup-inc" disabled={p.rollBars.pickup >= 4} onClick={() => p.rollBars!.setPickup(p.rollBars!.pickup + 1)}>＋</button>
              </div>
            </div>
          )}
          <div className="editor-meta-row">
            <input aria-label="tags" className="editor-tags" placeholder="タグ（スペース区切り）" value={p.tags} onChange={(e) => p.setTags(e.target.value)} />
            <input aria-label="mood" className="editor-tags" placeholder="ムード（任意・例：切ない/疾走）" value={p.mood} onChange={(e) => p.setMood(e.target.value)} />
          </div>
        </>
      )}
    </>
  );
}
