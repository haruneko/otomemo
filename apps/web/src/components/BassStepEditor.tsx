import { useRef, useState, type Ref } from "react";
import { type BassStep, type BassDegree, type PlaybackHandle, isCompoundMeter, notesForContent, buildPlayback } from "../music";
import { previewNote } from "../audio";
import { startPlayback } from "../playback";
import { PatternPickerBar } from "./PatternPickerBar";
import { PatternImportDialog } from "./PatternImportDialog";
import { BarsControl } from "./BarsControl";
import { NoteValuePicker } from "./NoteValuePicker";

// このエディタが grid で編集する 6 レーンの度数（BassStep.degree はこれより広い＝修理#2 で 2/6/クロマチック/next を追加）。
// レーン外の度数（型生成された相対ベースの b7/6/#4 や next）は grid には現れないが pattern には**非破壊で保持**される
// （メロ/リズムの範囲外音と同じ流儀）。フルな度数編集 UI は次スライス（監査 §4 B'3「その他」レーン）。
type BassLaneDegree = "R" | "3" | "5" | "7" | "8" | "approach";

// プレビュー用：度数→実音高（C2=36 基準の代表音）。再生時は調/コードで解決するが、入力フィードバックは
// C基準で度数の高さを鳴らす（R=C2/3=E2/5=G2/7=B♭2/8=C3/approach=B1）。
const BASS_PREVIEW_PITCH: Record<BassLaneDegree, number> = {
  R: 36, "3": 40, "5": 43, "7": 46, "8": 48, approach: 35,
};

// #bass S2: 相対ベースの度数エディタ（半リズムパート）。
// **度数レーン**(行=R/3/5/7/8/approach)×**ステップ**(列)。各ステップはモノフォニック＝1度数だけ。
// セルをタップでそのレーン×ステップに置く（同ステップの他レーンは消える）。音長は長さツールで選ぶ。
// 度数はコード/調に当てて再生時に解決＝ここは「何度を・いつ・どれだけ」だけ編集（オクターブは自動）。
const BEAT_PX = 68; // 1拍=4step（16px cell+1px gap＝17px×4）＝プレイヘッドの px/beat。1小節=16step。Task1e：88→68。
// 上ほど高い度数（ピアノロールと同じ向き）：上から 8/7/5/3/R、approach は最下段。
const LANES: { d: BassLaneDegree; label: string }[] = [
  { d: "8", label: "8" },
  { d: "7", label: "7" },
  { d: "5", label: "5" },
  { d: "3", label: "3" },
  { d: "R", label: "R" },
  { d: "approach", label: "→" }, // approach=次の解決ルートへ半音で寄せる（歩く）
];
// 可視6レーンの度数集合（この外の度数＝「その他」レーンで扱う拡張語彙）。
const VISIBLE_DEGREES = new Set<string>(LANES.map((l) => l.d));
const isOtherDegree = (d: string) => !VISIBLE_DEGREES.has(d);
// 「その他」レーンのポップオーバーが提供する拡張度数（2/6/クロマチック）＝半音順に代表1綴りずつ
// （enharmonic の重複は避ける・可視レーンの R/3/5/7/8 と被る半音は出さない）。music.ts の BassDegree 部分集合。
const EXT_DEGREES: BassDegree[] = ["b2", "2", "b3", "4", "#4", "b6", "6", "b7", "#7"];
// 拡張度数のプレビュー音高（C2=36 基準・music.ts DEGREE_SEMI のミラー・入力フィードバック用）。
const EXT_PREVIEW_SEMI: Record<string, number> = {
  b2: 1, "2": 2, b3: 3, "4": 5, "#4": 6, b6: 8, "6": 9, b7: 10, "#7": 11,
};
// vel プリセット（ghost/弱/強＝ドラムのデテント語彙に揃える。v:0＝vel キー無し＝bit 一致）。
const VEL_PRESETS: { label: string; v: number }[] = [
  { label: "無", v: 0 },
  { label: "ゴースト", v: 40 },
  { label: "弱", v: 72 },
  { label: "強", v: 112 },
];
// 音長（step数・1step=16分）。16/8/4/2/1 を他エディタ(メロ/コード楽器)と揃える。
const LENGTHS = [
  { label: "16", v: 1 },
  { label: "8", v: 2 },
  { label: "4", v: 4 },
  { label: "2", v: 8 },
  { label: "1", v: 16 },
];

export function BassStepEditor({
  pattern,
  onChange,
  steps,
  onStepsChange,
  patternId,
  patternEdited,
  onApplyPattern,
  meter,
  keyPc,
  tempo,
  program,
  playheadRef,
  scrollerRef,
  activeProject,
}: {
  pattern: BassStep[];
  onChange: (p: BassStep[]) => void;
  steps: number;
  onStepsChange: (steps: number) => void;
  patternId?: string; // 適用した相対ビート型ID（帯「いま：<型>」）。手編集後は patternEdited で「（改）」（決定④）。
  patternEdited?: boolean; // 手編集済みの印（帯見出しに「（改）」）。
  onApplyPattern?: (c: { pattern: BassStep[]; steps: number; patternId?: string }) => void; // 帯の適用＝pattern/steps/patternId 置換＋（改）解除（親が snapshot 1操作で Undo）。
  meter?: string; // 拍子（compound=6/8系は帯非表示）。
  keyPc?: number; // 調（型試聴の度数→実音の tonic）。
  tempo?: number; // 型試聴の実音化テンポ。
  program?: number; // ベース音色（GM・試聴用・既定33）。
  playheadRef?: Ref<HTMLDivElement>;
  scrollerRef?: Ref<HTMLDivElement>;
  activeProject?: string; // Task1i：Source（プロジェクト軸）絞りを PatternImportDialog へ下ろす（純追加）。
}) {
  const ppPlay = useRef<PlaybackHandle | null>(null);
  // Task1g：ライブラリから読み込む＝pick ダイアログ（PatternImportDialog）。入口リンクのクリックで開き、
  // タップ＝onPick(neta)→既存 applyPattern(neta.content) へ配線（apply/試聴は現行のまま＝bit一致）。
  // 母集団は bass の **相対 content のみ**（絶対 notes ネタは番兵 contentFilter で捨てる）。
  const [importOpen, setImportOpen] = useState(false);
  // 試聴＝度数を調(key)の tonic に当てて実音化（既存試聴の流儀・notesForContent("bass")）。
  const auditionPattern = (content: unknown) => {
    ppPlay.current?.stop();
    const ns = notesForContent("bass", content, { key: keyPc ?? 0 });
    if (ns.length) void startPlayback(buildPlayback({ kind: "notes", notes: ns, tempo: tempo ?? 120, program: program ?? 33 }), { vocalMode: "peek" }).then((h) => { ppPlay.current = h; });
  };
  // 適用＝pattern/steps/patternId を親へ渡し置換＋（改）解除（親が snapshot 1操作で Undo に乗せる）。
  const applyPattern = (content: unknown) => {
    ppPlay.current?.stop();
    const c = content as { pattern: BassStep[]; steps?: number; patternId?: string };
    onApplyPattern?.({ pattern: c.pattern, steps: c.steps ?? steps, patternId: c.patternId });
  };
  const [len, setLen] = useState(2); // 既定 8分
  const [dotted, setDotted] = useState(false); // 付点：音長×1.5（6/8 の付点音価に対応）
  const bars = Math.max(1, Math.round(steps / 16));
  // 小節数を変える：縮小は**非破壊**（範囲外の音は描画しないだけで保持・melodyと同じ）。
  const setBars = (n: number) => onStepsChange(Math.max(1, Math.min(4, n)) * 16);

  const startAt = (lane: BassLaneDegree, step: number) =>
    pattern.find((p) => p.step === step && p.degree === lane);
  // このレーンで step を覆っている音（start < step < start+dur）＝サステイン表示用
  const sustainAt = (lane: BassLaneDegree, step: number) =>
    pattern.some((p) => p.degree === lane && p.step < step && step < p.step + (p.dur || 1));

  function toggle(lane: BassLaneDegree, step: number) {
    if (startAt(lane, step)) {
      // 同じ所をタップ＝消す
      onChange(pattern.filter((p) => !(p.step === step && p.degree === lane)));
      return;
    }
    // モノフォニック：同ステップ始まりの音を消してから置く
    const rest = pattern.filter((p) => p.step !== step);
    onChange([...rest, { step, degree: lane, dur: dotted ? len * 1.5 : len }].sort((a, b) => a.step - b.step));
    // 置いた度数を即鳴らす（C基準の代表音・ベース音色）。
    void previewNote({ pitch: BASS_PREVIEW_PITCH[lane], start: 0, dur: 0.4, program: 33 });
  }

  // ── 「その他」レーン（拡張語彙・S8） ──────────────────────────────
  // 可視6レーン外の度数（2/6/クロマチック）を持つ step を探す＝マーカー表示＆ポップオーバー初期値。
  const otherAt = (step: number) => pattern.find((p) => p.step === step && isOtherDegree(p.degree));
  // 開いているポップオーバー（step＋アンカー座標）。度数/next/vel はローカル下書き（「置く」で確定）。
  const [pop, setPop] = useState<{ step: number; x: number; y: number } | null>(null);
  const [popDeg, setPopDeg] = useState<BassDegree>("b7");
  const [popNext, setPopNext] = useState(false);
  const [popVel, setPopVel] = useState(0); // 0＝vel キー無し

  function openOther(step: number, el: HTMLElement) {
    const ex = otherAt(step); // 既存の拡張度数があれば下書きに反映（再編集）。
    setPopDeg(ex?.degree ?? "b7");
    setPopNext(!!ex?.next);
    setPopVel(ex?.vel ?? 0);
    const r = el.getBoundingClientRect();
    // ビューポート下端クランプ＋上フリップ（受け入れE2E所見 2026-07-22＝「その他」は最下段レーン＝
    // fixed が下へ 171px はみ出し「置く」が押せなかった）。ポップ実測高 ≈240px・下に収まらなければセル上辺へ反転。
    const POP_H = 248;
    const POP_W = 232;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.max(4, Math.min(r.left, vw - POP_W - 4));
    const y = r.bottom + 4 + POP_H <= vh ? r.bottom + 4 : Math.max(4, r.top - 4 - POP_H);
    setPop({ step, x, y });
  }
  const previewExt = (d: BassDegree) =>
    void previewNote({ pitch: 36 + (EXT_PREVIEW_SEMI[d] ?? 0), start: 0, dur: 0.4, program: 33 });
  // 「その他」配置＝同 step 排他（可視レーン音も隠れ度数も置換＝モノフォニック一貫）。
  function placeOther() {
    if (!pop) return;
    const rest = pattern.filter((p) => p.step !== pop.step);
    const s: BassStep = { step: pop.step, degree: popDeg, dur: dotted ? len * 1.5 : len };
    if (popNext) s.next = true;
    if (popVel > 0) s.vel = popVel;
    onChange([...rest, s].sort((a, b) => a.step - b.step));
    previewExt(popDeg);
    setPop(null);
  }
  // 「消す」＝その step の拡張度数だけ除去（可視レーン音・他 step は非破壊）。
  function clearOther() {
    if (!pop) return;
    onChange(pattern.filter((p) => !(p.step === pop.step && isOtherDegree(p.degree))));
    setPop(null);
  }

  return (
    <div className="bass-step">
      {/* 「パターンを選ぶ ▸」帯（S7）＝相対ビート型の入口。既定閉＝開くまで既存DOM/挙動不変。
          compound meter（6/8系）は型ライブラリが4/4前提＝帯非表示（gen_bass の style も6-8は絶対フォールバック）。
          nowLabel＝patternId（＋手編集後は「（改）」）。（改）表現は渡す文字列で行う＝PatternPickerBar は器のまま（決定④）。 */}
      {/* Task1g：設定行（小節行）右端の二次リンク「⤓ ライブラリから読み込む」＝クリックで pick ダイアログを開く。
          compound meter（6/8系）非表示・（改）表示は不変。 */}
      <div className="editor-setrow">
        <BarsControl bars={bars} max={4} onChange={setBars} />
        {!isCompoundMeter(meter) && (
          <PatternPickerBar
            nowLabel={patternId ? patternId + (patternEdited ? "（改）" : "") : undefined}
            onOpen={() => setImportOpen(true)}
          />
        )}
      </div>
      {/* Task1g pick ダイアログ＝ライブラリ全体（scope:"all"）から bass の相対 content を検索/ブラウズ。
          タップ＝onPick→applyPattern(content)（copy_neta 不使用）・▶＝auditionPattern(content)＝現行の実音経路。 */}
      {importOpen && (
        <PatternImportDialog
          kind="bass"
          fallbackName="おまかせ"
          contentFilter={(n) => (n.content as { mode?: string } | null)?.mode === "relative"}
          activeProject={activeProject}
          onPreview={(n) => auditionPattern(n.content)}
          onPick={(n) => { applyPattern(n.content); setImportOpen(false); }}
          onClose={() => { ppPlay.current?.stop(); setImportOpen(false); }}
        />
      )}
      <div className="bass-lens">
        <NoteValuePicker
          options={LENGTHS}
          value={len}
          dotted={dotted}
          onChange={setLen}
          onToggleDotted={() => setDotted((d) => !d)}
        />
      </div>
      <div className="bass-grid" role="grid" aria-label="bass-step" ref={scrollerRef}>
        <div
          className="proll-playhead"
          aria-hidden="true"
          ref={playheadRef}
          style={{ left: `calc(36px + var(--phb, 0) * ${BEAT_PX}px)` }}
        />
        {LANES.map((lane) => (
          <div className="bass-lane" role="row" key={lane.d}>
            <div className="bass-lane-label">{lane.label}</div>
            {Array.from({ length: steps }, (_, s) => {
              const on = !!startAt(lane.d, s);
              const sus = sustainAt(lane.d, s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`bass-${lane.d}-${s}`}
                  aria-pressed={on}
                  className={
                    "step-cell deg" +
                    (on ? " on" : sus ? " sustain" : "") +
                    (s % 4 === 0 ? " beat" : "")
                  }
                  onClick={() => toggle(lane.d, s)}
                >
                  {on ? lane.label : ""}
                </button>
              );
            })}
          </div>
        ))}
        {/* 「その他」レーン（S8・案1）＝可視6レーン外の度数（2/6/クロマチック）を持つ step にマーカー。
            セルタップでポップオーバー（度数 b2..#7・2・6／next／vel）。可視レーンは不変＝拡張語彙だけここへ隔離。 */}
        <div className="bass-lane bass-lane-other" role="row">
          <div className="bass-lane-label">他</div>
          {Array.from({ length: steps }, (_, s) => {
            const ex = otherAt(s);
            return (
              <button
                key={s}
                type="button"
                aria-label={`bass-other-${s}`}
                aria-pressed={!!ex}
                className={"step-cell deg ext" + (ex ? " on" : "") + (s % 4 === 0 ? " beat" : "")}
                onClick={(e) => openOther(s, e.currentTarget)}
              >
                {ex ? ex.degree : ""}
              </button>
            );
          })}
        </div>
      </div>
      {pop && (
        <>
          <div className="ext-pop-backdrop" aria-hidden="true" onClick={() => setPop(null)} />
          <div className="ext-pop" role="dialog" aria-label="ext-popover" style={{ left: pop.x, top: pop.y }}>
            <div className="ext-pop-degs">
              {EXT_DEGREES.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-label={`ext-deg-${d}`}
                  aria-pressed={popDeg === d}
                  className={"ext-deg-chip" + (popDeg === d ? " on" : "")}
                  onClick={() => {
                    setPopDeg(d);
                    previewExt(d);
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="ext-pop-row">
              <button
                type="button"
                aria-label="ext-next"
                aria-pressed={popNext}
                className={"ext-toggle" + (popNext ? " on" : "")}
                onClick={() => setPopNext((v) => !v)}
              >
                次を先取り
              </button>
            </div>
            <div className="ext-pop-row ext-vel-row">
              <span className="ext-vel-lab">強さ</span>
              {VEL_PRESETS.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  aria-label={`ext-vel-${p.v}`}
                  aria-pressed={popVel === p.v}
                  className={"ext-vel-chip" + (popVel === p.v ? " on" : "")}
                  onClick={() => setPopVel(p.v)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="ext-pop-foot">
              <button type="button" aria-label="ext-remove" className="ext-remove" onClick={clearOther}>
                消す
              </button>
              <button type="button" aria-label="ext-place" className="ext-place" onClick={placeOther}>
                置く
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
