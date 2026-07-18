import { useState } from "react";
import { Icon } from "./Icon";
import { NoriRow, humanizeSegOf } from "./NoriRow";
import { useMelodyGen, MELODY_PRESETS, GEN_PARTS, RHYTHM_PART_UI } from "../useMelodyGen";
import type { ChordArg } from "../useMelodyGen";
import type { Feel, Note } from "../music";

// 「いじる」ボトムシートの中身（design #19 ⑥・正準＝docs/research/2026-07-14-tinker-menu-redesign-fable.md）。
// ＝ハブ（パーツの棚・スクロール0）＋パーツ別引き出し。状態と送信ロジックは useMelodyGen(gen) が唯一持つ
// ＝当コンポは器（JSX/CSS）のみ＝生成 payload は bit 一致（0/""非送信は genPart に閉じたまま）。
//
// ★ハブ契約（不変条件・再発防止の本体）：ハブに足してよいのは【新パーツのタイル+1】のみ。
//   新ノブ/型は【そのパーツの引き出しの中】へ（前面はchip6±1・seg1行まで、超過は群アコーディオンへ沈める）。
//   横断設定は【旋法＋一式の2枠で打ち止め】（3つ目が要る日は「共通」引き出しを新設して沈める）。
//   ＝パーツが7→12に増えてもハブは無スクロールのまま壊れない。
export type TinkerSheetProps = {
  gen: ReturnType<typeof useMelodyGen>;
  isSong: boolean;
  sectionChords: () => ChordArg[];
  sectionBass: () => Note[];
  // #29 P1「共通」引き出し：セクション共有 feel（跳ね＋人間味）。feel＝sectionFeel() の実効値（子から拾った
  // feel も見える）→ NoriRow 操作で section content.feel へ昇格保存（両0＝キー削除）。onFeelChange は SectionEditor
  // の writeSelf 保存（楽観更新＋CoW ガード）。
  feel?: Feel | undefined;
  onFeelChange?: (f: Feel | undefined) => void;
  onClose: () => void;
  onExportMidi: () => void;
  onExportMidiSplit: () => void;
};

type View = "hub" | "common" | "melody" | "bass" | "drums" | "skeleton";

// GEN_PARTS を op で引ける形に（タイルtap＝おまかせ生成の実体呼び）。
const PART_BY_OP = Object.fromEntries(GEN_PARTS.map((p) => [p.op, p])) as Record<string, (typeof GEN_PARTS)[number]>;
// ハブのパーツタイル棚（横軸＝パーツ＝増える唯一の軸）。色はレーン色 --k-<kind> を流用＝ホーム作成タイルと同じ言語。
const TILES: { id: string; label: string; kind: string; op?: string; needsChords: boolean; drawer?: View }[] = [
  { id: "melody", label: "メロ", kind: "melody", op: "gen_melody", needsChords: true, drawer: "melody" },
  { id: "bass", label: "ベース", kind: "bass", op: "gen_bass", needsChords: true, drawer: "bass" },
  { id: "drums", label: "ドラム", kind: "rhythm", op: "gen_drums", needsChords: false, drawer: "drums" },
  { id: "chord", label: "コード", kind: "chord", op: "gen_chords", needsChords: false },
  { id: "skeleton", label: "骨格", kind: "skeleton", op: undefined, needsChords: false, drawer: "skeleton" },
  { id: "riff", label: "リフ", kind: "riff", op: "gen_riff", needsChords: true },
  { id: "orch", label: "管弦", kind: "section_inst", op: "gen_section_inst", needsChords: true },
];
// 横断設定「進行の色」＝旋法（frame.palette）。おまかせ=未送信=bit一致。耳語ラベル（param-clarity 流儀）。
const PALETTE_CHIPS: { v: "" | "ionian" | "mixolydian" | "aeolian" | "dorian"; label: string }[] = [
  { v: "", label: "おまかせ" },
  { v: "ionian", label: "明るめ" },
  { v: "mixolydian", label: "土っぽい" },
  { v: "aeolian", label: "哀愁" },
  { v: "dorian", label: "浮遊" },
];
const PRESET_LABEL = Object.fromEntries(MELODY_PRESETS.map((p) => [p.name, p.label]));
// タイル状態チップ用のジャンル語（型直指定コードは「型指定」でまとめる＝チップは軽く保つ）。
const DRUM_GENRE_LABEL: Record<string, string> = { jpop: "J-pop", rock: "ロック", dance: "EDM", ballad: "バラード", funk: "ファンク" };
const BASS_GENRE_LABEL: Record<string, string> = { rock: "ロック", ballad: "バラード", citypop: "シティポップ", funk: "ファンク", edm: "EDM", vocarock: "ボカロック" };

// マイ設定（P4 の回収・design #19 ⑥）＝いま回してるノブ群を localStorage に {name,label,v} で保存＝MELODY_PRESETS と同型。
// これは UI ローカルの当たり保存＝生成 payload には影響しない（applyPreset で通常ノブへ流すだけ＝bit一致）。
type MyPreset = { name: string; label: string; v: Parameters<ReturnType<typeof useMelodyGen>["applyPreset"]>[1] };
const MY_PRESETS_KEY = "cm_melody_my_presets";
const loadMyPresets = (): MyPreset[] => { try { return JSON.parse(localStorage.getItem(MY_PRESETS_KEY) || "[]"); } catch { return []; } };

export function TinkerSheet({ gen, isSong, sectionChords, sectionBass, feel, onFeelChange, onClose, onExportMidi, onExportMidiSplit }: TinkerSheetProps) {
  const [view, setView] = useState<View>("hub");
  // 引き出し内の群アコーディオン開閉（メロ引き出し＝一度に15本を縦に並べない）。
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (id: string) => setOpenGroups((g) => ({ ...g, [id]: !g[id] }));
  const [myPresets, setMyPresets] = useState<MyPreset[]>(loadMyPresets);
  // いま画面に出ているノブ値を PresetV へ畳む（保存・再適用の種）。
  const currentPresetV = (): MyPreset["v"] => ({
    density: gen.density, swing: gen.swing, runs: gen.runs, expression: gen.expression, push: gen.push,
    hook: gen.hook, articulation: gen.articulation, foreground: gen.foreground, breathe: gen.breathe,
    flow: gen.flow, pickup: gen.pickup, phrasing: gen.phrasing, form: gen.form,
  });
  const saveMyPreset = () => {
    const v = currentPresetV();
    const name = `my_${Date.now()}`;
    const next = [...myPresets, { name, label: `マイ${myPresets.length + 1}`, v }];
    setMyPresets(next);
    try { localStorage.setItem(MY_PRESETS_KEY, JSON.stringify(next)); } catch { /* localStorage 不可でも保存無しで続行 */ }
    gen.applyPreset(name, v); // 保存＝選択中に（ハイライト）
  };

  const hasChords = sectionChords().length > 0;
  const hasBass = sectionBass().length > 0;
  // song はパートタイル自体を出さない（!isSong ガード）＝判定も評価しない（二重防御・実体の防御は
  // melodyLaneNotes 側の song-safe 化＝監査FAIL#7）。
  const hasMelody = !isSong && gen.melodyLaneNotes().length > 0;

  // タイルtap＝そのパーツをおまかせ生成（現行2タップ主動線を死守）→シートを閉じ候補トレイへ。
  const tapGen = (tile: (typeof TILES)[number]) => {
    onClose();
    if (tile.op) { const part = PART_BY_OP[tile.op]; if (part) void gen.genPart(part); }
    else void gen.genSkeleton(); // 骨格は genSkeleton（op を持たない）
  };
  // 引き出し下端の「このパーツを生成」＝設定を適用して生成→閉じる（往復スクロール根絶）。
  const drawerGen = (op?: string) => {
    onClose();
    if (op) { const part = PART_BY_OP[op]; if (part) void gen.genPart(part); }
    else void gen.genSkeleton();
  };

  // タイル下端の状態チップ＝設定サマリ＝引き出しの扉（設定の可視化と扉を1つのUIで兼ねる）。
  const chipInfo = (id: string): { text: string; set: boolean } => {
    if (id === "melody") return { text: gen.preset ? PRESET_LABEL[gen.preset] ?? "設定" : "おまかせ", set: !!gen.preset };
    if (id === "drums") {
      const fillSet = typeof gen.drumFill === "number" ? gen.drumFill > 0 : !!gen.drumFill;
      const set = !!gen.drumStyle || fillSet;
      const g = DRUM_GENRE_LABEL[gen.drumStyle] ?? (gen.drumStyle ? "型指定" : "");
      return { text: set ? [g, fillSet ? "フィル" : ""].filter(Boolean).join("・") || "設定あり" : "おまかせ", set };
    }
    if (id === "bass") {
      const set = !!gen.bassStyle || gen.bassFill > 0;
      const g = BASS_GENRE_LABEL[gen.bassStyle] ?? (gen.bassStyle ? "型指定" : "");
      return { text: set ? [g, gen.bassFill > 0 ? "フィル" : ""].filter(Boolean).join("・") || "設定あり" : "おまかせ", set };
    }
    if (id === "skeleton") return { text: gen.skelForm || "おまかせ", set: !!gen.skelForm };
    return { text: "おまかせ", set: false };
  };

  // 「共通」引き出しのサマリ（ハブ chip の文言）＝進行の色＋ノリ（跳ね/人間味）。未設定は「おまかせ」。
  const HUM_SEG_LABEL = ["", "弱", "中", "強"];
  const commonSet = (): boolean => !!gen.palette || (feel?.swing ?? 0) > 0 || (feel?.humanize ?? 0) > 0;
  const commonSummary = (): string => {
    const pal = PALETTE_CHIPS.find((p) => p.v === gen.palette)?.label ?? "おまかせ";
    const parts = [pal];
    const sw = feel?.swing ?? 0;
    if (sw > 0) parts.push(`跳ね${Math.round(sw * 10) / 10}`);
    const hum = feel?.humanize ?? 0;
    if (hum > 0) parts.push(`人間味${HUM_SEG_LABEL[humanizeSegOf(hum)]}`);
    return "共通：" + parts.join("・");
  };

  // 群アコーディオンの見出し（▸/▾＋サブ）。前面はchip6±1・seg1行まで、それを超えるノブはここに沈める。
  const gacc = (id: string, label: string, hint: string) => (
    <button type="button" className={"tk-gacc" + (openGroups[id] ? " on" : "")} aria-label={`group-${id}`} aria-expanded={!!openGroups[id]} onClick={() => toggleGroup(id)}>
      {openGroups[id] ? "▾" : "▸"} {label}<small>{hint}</small>
    </button>
  );

  // 引き出しヘッダ（←棚へ／パーツ名／おまかせに戻す／✕）。
  const drawerHead = (name: string, reset: () => void) => (
    <div className="tk-drawer-head">
      <button type="button" className="tk-back" aria-label="drawer-back" onClick={() => setView("hub")}>← 棚へ</button>
      <span className="sheet-title">{name}</span>
      <button type="button" className="tk-reset" aria-label="drawer-reset" onClick={reset}>おまかせに戻す</button>
      <button type="button" className="sheet-close" aria-label="close-tools" onClick={onClose}>✕</button>
    </div>
  );

  // ---- ハブ（棚）＝スクロール0契約 ----
  const hub = (
    <>
      <div className="sheet-head">
        <span className="sheet-grab" aria-hidden="true" />
        <span className="sheet-title">いじる</span>
        <button type="button" className="sheet-close" aria-label="close-tools" onClick={onClose}>✕</button>
      </div>
      {!isSong && (
        <>
          {/* 横断設定＝「共通」引き出しへ沈める（ハブ契約：3つ目の横断設定＝ノリ の発動日）。ハブにはサマリ chip 1行だけ
              残す＝行数純増ゼロ。進行の色（旋法）＋ノリ（跳ね/人間味）は commonDrawer に集約。 */}
          <button type="button" className={"tk-common-chip" + (commonSet() ? " set" : "")} aria-label="drawer-common" onClick={() => setView("common")}>{commonSummary()} ▾</button>
          {/* ☆おまかせで一式（ヒーロー・§4）＝ドラム→ベース→メロを順に候補へ（コード無ければ先頭にコード）。
              置くのは1件ずつ人間＝「機械は候補まで」。既存 genPart の直列呼び＝新APIゼロ。 */}
          <button type="button" className="tk-hero" aria-label="gen-set" disabled={gen.genBusy} onClick={() => { onClose(); void gen.genSet(); }}>
            <b>☆ おまかせで一式</b>
            <small>{hasChords ? "ドラム→ベース→メロを順に候補へ" : "コード＋ドラムを候補へ（コードを置いてから残りを一式）"}・置くのは1件ずつ人間</small>
          </button>
          {/* パーツタイル棚（3列）＝tap上=生成／下チップ=引き出し。増えても【タイル+1】で終わる（ハブ契約）。 */}
          <div className="tk-hublab">パーツ＝タップで生成／下のチップで設定（引き出し）</div>
          <div className="tk-tiles" aria-label="part-tiles">
            {TILES.filter((t) => !t.needsChords || hasChords || (t.id === "melody" && hasMelody)).map((t) => {
              const ci = t.drawer ? chipInfo(t.id) : null;
              const genDisabled = gen.genBusy || (t.needsChords && !hasChords);
              return (
                <div className="tk-tile" key={t.id} data-kind={t.kind}>
                  <button type="button" className="tk-tile-gen" aria-label={t.op ? `gen-${t.op}` : "gen-skeleton"} disabled={genDisabled} title={t.needsChords && !hasChords ? "コードが要る（先に進行を置く）" : `${t.label}をおまかせ生成`} onClick={() => tapGen(t)}>
                    <span className="tk-tile-bar" style={{ background: `var(--k-${t.kind}, var(--accent))` }} aria-hidden="true" />
                    <b>{t.label}</b>
                    <small>{gen.genBusy ? "生成中…" : "タップで生成"}</small>
                  </button>
                  {ci && (
                    <button type="button" className={"tk-tile-chip" + (ci.set ? " set" : "")} aria-label={`drawer-${t.id}`} onClick={() => setView(t.drawer!)}>{ci.text} ▾</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* 書き出し＝ハブ下端の固定行（スクロール0で到達）。song(編成)はここだけ残る。 */}
      <div className="tk-hublab">書き出し</div>
      <div className="tk-export">
        <button type="button" className="tool-item" aria-label="export-midi" onClick={onExportMidi}>MIDI</button>
        <button type="button" className="tool-item" aria-label="export-midi-split" title="メロ/コード/ベース/リズムを別トラックに" onClick={onExportMidiSplit}>MIDI（分割）</button>
      </div>
    </>
  );

  // ---- メロ引き出し（前面4ノブ＋群アコーディオン5つ＋メロを直す）----
  const melodyDrawer = (
    <>
      {drawerHead("メロ", () => gen.applyPreset("plain", { density: 0.5 }))}
      <div className="tk-drawer-body">
        <div className="tk-hublab">プリセット（当たりの組を1タップ）</div>
        <div className="preset-head">
          <div className="preset-row" aria-label="melody-presets">
            {MELODY_PRESETS.map((p) => (
              <button key={p.name} type="button" className={"chip" + (gen.preset === p.name ? " on" : "")} aria-label={`preset-${p.name}`} aria-pressed={gen.preset === p.name} onClick={() => gen.applyPreset(p.name, p.v)}>{p.label}</button>
            ))}
            {myPresets.map((p) => (
              <button key={p.name} type="button" className={"chip" + (gen.preset === p.name ? " on" : "")} aria-label={`preset-${p.name}`} aria-pressed={gen.preset === p.name} onClick={() => gen.applyPreset(p.name, p.v)}>★{p.label}</button>
            ))}
            <button type="button" className="chip tk-chip-add" aria-label="preset-save" title="いまのノブ設定をマイ設定として保存（localStorage）" onClick={saveMyPreset}>＋保存</button>
          </div>
          <button type="button" className="dice-btn" aria-label="dice-roll" disabled={gen.genBusy || !hasChords} title={!hasChords ? "コードが要る（先に進行を置く）" : "振って別案を生成（ロックは固定）"} onClick={gen.rollDice}><Icon name="dice" size={18} /></button>
        </div>
        {/* 前面4ノブ（param-clarity §4.1 の回収）＝よく回す4本を常時露出。残りは下の群に沈む。 */}
        <div className="tk-hublab">よく回す4本（それ以外は下の群に沈む）</div>
        {gen.sliderRow("density", "細かさ", gen.density, gen.setDensity, "スカスカ", "ぎっしり", "density")}
        {gen.sliderRow("swing", "跳ね", gen.swing, gen.setSwing, "まっすぐ", "はねる", "swing")}
        {gen.segRow("runs", "駆け上がり", "16分の走り", gen.runs, gen.setRuns, "runs")}
        {gen.segRow("expression", "タメ", "強拍のもたれ", gen.expression, gen.setExpression, "expression")}
        {gacc("nori", "リズムのノリ（残り）", "前ノリ・最小音符・リズムパーツ・声種")}
        {openGroups.nori && <>
          {gen.segRow("push", "前ノリ", "拍を食う", gen.push, gen.setPush, "push")}
          <label className="knob-row">
            <span className="knob-name">最小音符<small>速い曲は粗く</small></span>
            <select aria-label="finest" value={gen.finest} onChange={(e) => { gen.setFinest(e.target.value as "" | "quarter" | "eighth"); gen.setPreset(""); }}>
              <option value="">おまかせ(速さ連動)</option>
              <option value="quarter">4分まで</option>
              <option value="eighth">8分まで</option>
            </select>
          </label>
          <div className="knob-seg" aria-label="rhythmParts">
            <span className="knob-name">リズムパーツ<small>小節に順に敷く(白玉=長音)</small></span>
            <span className="seg-ctl seg-wrap">
              {RHYTHM_PART_UI.map((rp) => {
                const idx = gen.rhythmParts.indexOf(rp.id);
                return (
                  <button key={rp.id} type="button" className={"seg-b" + (idx >= 0 ? " on" : "")} aria-label={`rpart-${rp.id}`} aria-pressed={idx >= 0} title={idx >= 0 ? `${idx + 1}番目に敷く` : "小節に敷く"} onClick={() => gen.toggleRhythmPart(rp.id)}>{rp.label}{idx >= 0 ? <sup>{idx + 1}</sup> : null}</button>
                );
              })}
            </span>
          </div>
          <label className="knob-row" aria-label="voice">
            <span className="knob-name">声種<small>音域と歌いやすさの基準</small></span>
            <select value={gen.voice} onChange={(e) => { gen.setVoice(e.target.value as "" | "female_pop" | "male_pop" | "mix" | "vocaloid"); gen.setPreset(""); }}>
              <option value="">おまかせ(女性平均)</option>
              <option value="female_pop">女性ポップ</option>
              <option value="male_pop">男性ポップ</option>
              <option value="mix">ミックス</option>
              <option value="vocaloid">ボカロ(C6開放)</option>
            </select>
          </label>
        </>}
        {gacc("utai", "歌い回し", "口ずさみ・冒険度・歯切れ")}
        {openGroups.utai && <>
          {gen.segRow("hook", "口ずさみ", "反復音フック", gen.hook, gen.setHook, "hook")}
          {gen.sliderRow("foreground", "冒険度", gen.foreground, gen.setForeground, "おなじみ", "冒険", "foreground")}
          {gen.sliderRow("articulation", "歯切れ", gen.articulation, gen.setArticulation, "なめらか", "くっきり", "articulation")}
        </>}
        {gacc("phrase", "フレーズの組み立て", "句割り・展開・息継ぎ・つなぎ・歌い出し")}
        {openGroups.phrase && <>
          <label className="knob-row" aria-label="phrasing">
            <span className="knob-name">句割り</span>
            <select value={gen.phrasing} onChange={(e) => { gen.setPhrasing(e.target.value as "" | "symmetric" | "asymmetric" | "period" | "sentence"); gen.setPreset(""); }}>
              <option value="">おまかせ</option>
              <option value="symmetric">対称(問→答)</option>
              <option value="asymmetric">非対称(3+3+2)</option>
              <option value="period">4小節句[4,4]</option>
              <option value="sentence">短短長[2,2,4]</option>
            </select>
          </label>
          <label className="knob-row" aria-label="form">
            <span className="knob-name">展開</span>
            <select value={gen.form} onChange={(e) => { gen.setForm(e.target.value as "" | "sentence"); gen.setPreset(""); }}>
              <option value="">おまかせ</option>
              <option value="sentence">起承転結(文)</option>
            </select>
          </label>
          {gen.segRow("breathe", "息継ぎ", "句アタマの間", gen.breathe, gen.setBreathe, "breathe")}
          {gen.sliderRow("flow", "つなぎ", gen.flow, gen.setFlow, "ぶつ切れ", "長く連結", "flow")}
          {gen.sliderRow("pickup", "歌い出し", gen.pickup, gen.setPickup, "拍アタマ", "弱起(食い込み)", "pickup")}
        </>}
        {hasBass && <>
          {gacc("karami", "他パートとの絡み", "ベースをよける（ベース在時のみ）")}
          {openGroups.karami && (
            <div className="knob-seg" aria-label="counter">
              <span className="knob-name">ベースをよける<small>並行5度8度を避ける</small></span>
              <span className="seg-ctl">
                {([["OFF", ""], ["弱", "weak"], ["中", "mid"], ["強", "strong"]] as [string, "" | "weak" | "mid" | "strong"][]).map(([lab, v]) => (
                  <button key={v || "off"} type="button" className={"seg-b" + (gen.counter === v ? " on" : "")} aria-label={`counter-${v || "off"}`} aria-pressed={gen.counter === v} onClick={() => { gen.setCounter(v); gen.setPreset(""); }}>{lab}</button>
                ))}
              </span>
            </div>
          )}
        </>}
        {gacc("shiage", "人間味・仕上げ", "人間味")}
        {openGroups.shiage && gen.segRow("humanize", "人間味", "自然な揺れ(1/f)・盛り上限あり", gen.humanize, gen.setHumanize, "humanize")}
        {/* メロを直す（置いたメロが相手）＝メロ在時のみ末尾に。 */}
        {hasMelody && (
          <>
            <div className="tools-sep">メロを直す（置いたメロが相手）</div>
            <button type="button" className="tool-item" aria-label="harmony-up" title="調内で平行3度上の第2声部" onClick={() => { onClose(); gen.makeHarmony(2); }}>上ハモ</button>
            <button type="button" className="tool-item" aria-label="harmony-down" title="調内で平行3度下の第2声部" onClick={() => { onClose(); gen.makeHarmony(-2); }}>下ハモ</button>
            {hasChords && <>
              <button type="button" className="tool-item" aria-label="fit-to-chords" title="メロの各音を近いコードトーンへ寄せる" disabled={gen.genBusy} onClick={() => { onClose(); void gen.fitToChords(); }}>コードに合わせる</button>
              <button type="button" className="tool-item" aria-label="analyze-fit" title="メロとコードの噛み合いを診断（読むだけ）" onClick={() => { onClose(); void gen.analyzeFit(); }}>噛み合い診断</button>
            </>}
          </>
        )}
      </div>
      <div className="tk-drawer-foot">
        <button type="button" className="tool-item primary tk-gen" aria-label="gen-gen_melody" disabled={gen.genBusy || !hasChords} title={!hasChords ? "コードが要る" : "メロを生成"} onClick={() => drawerGen("gen_melody")}>メロを生成（{gen.preset ? PRESET_LABEL[gen.preset] : "おまかせ"}）</button>
      </div>
    </>
  );

  // ---- ドラム引き出し（型chip化・design §2.4）＝ジャンルchip前面／フィルseg／型直指定は「細かく」に沈める。
  // 42択セレクタ地獄→耳で選ぶジャンル語を前面・型IDは沈める。値は既存 state（drumStyle/drumFill）＝送信不変。
  const drumsDrawer = (
    <>
      {drawerHead("ドラム", () => { gen.setDrumStyle(""); gen.setDrumFill(0); })}
      <div className="tk-drawer-body">
        <div className="tk-hublab">ビートのジャンル</div>
        <div className="tk-palette" aria-label="drum-genre">
          {([["", "おまかせ"], ["jpop", "J-pop"], ["rock", "ロック"], ["dance", "EDM"], ["ballad", "バラード"], ["funk", "ファンク"]] as [string, string][]).map(([v, lab]) => (
            <button key={v || "omakase"} type="button" className={"chip" + (gen.drumStyle === v ? " on" : "")} aria-label={`drum-genre-${v || "omakase"}`} aria-pressed={gen.drumStyle === v} onClick={() => gen.setDrumStyle(v)}>{lab}</button>
          ))}
        </div>
        <div className="tk-hublab">フィル（セクション末の節目）</div>
        <div className="knob-seg" aria-label="drum-fill">
          <span className="knob-name">強さ</span>
          <span className="seg-ctl">
            {([["なし", 0], ["弱", 0.3], ["中", 0.6], ["強", 0.9]] as [string, number][]).map(([lab, v]) => (
              <button key={v} type="button" className={"seg-b" + (gen.drumFill === v ? " on" : "")} aria-label={`drum-fill-${v}`} aria-pressed={gen.drumFill === v} onClick={() => gen.setDrumFill(v)}>{lab}</button>
            ))}
          </span>
        </div>
        {gacc("drumfine", "細かく（型直指定・ビルドアップ）", "9型＋溜め3種")}
        {openGroups.drumfine && <>
          <label className="knob-row" aria-label="drum-style">
            <span className="knob-name">型直指定</span>
            <select value={gen.drumStyle.startsWith("beat") || gen.drumStyle.startsWith("four") || gen.drumStyle.startsWith("half") || gen.drumStyle.startsWith("shuffle") || gen.drumStyle.startsWith("six") ? gen.drumStyle : ""} onChange={(e) => gen.setDrumStyle(e.target.value)}>
              <option value="">—（ジャンルにまかせる）</option>
              <option value="beat8.basic">8ビート基本</option>
              <option value="beat8.syncopated">8ビート食い込み</option>
              <option value="beat16.basic">16ビート</option>
              <option value="beat16.ghost">16ゴースト</option>
              <option value="four.rock">4つ打ちロック</option>
              <option value="four.house">4つ打ちハウス</option>
              <option value="halftime.basic">ハーフタイム</option>
              <option value="shuffle.basic">シャッフル</option>
              <option value="six8.ballad">6/8バラード</option>
            </select>
          </label>
          <label className="knob-row" aria-label="drum-buildup">
            <span className="knob-name">ビルドアップ<small>サビ/ドロップ前の溜め</small></span>
            <select value={typeof gen.drumFill === "string" ? gen.drumFill : ""} onChange={(e) => gen.setDrumFill(e.target.value || 0)}>
              <option value="">なし</option>
              <option value="build.tight.4bar">溜め4小節（プリコーラス）</option>
              <option value="build.standard.8bar">溜め8小節（汎用）</option>
              <option value="build.big.16bar">溜め16小節（大サビ前）</option>
            </select>
          </label>
        </>}
      </div>
      <div className="tk-drawer-foot">
        <button type="button" className="tool-item primary tk-gen" aria-label="gen-gen_drums" disabled={gen.genBusy} onClick={() => drawerGen("gen_drums")}>ドラムを生成</button>
      </div>
    </>
  );

  // ---- ベース引き出し（型chip化・design §2.4）----
  const BASS_TYPES = ["RK-8ROOT", "RK-GALLOP", "BL-WHOLE", "BL-APPROACH", "CP-OCT8", "CP-WALK", "FK-ONE", "ED-OFFBEAT", "ED-SUSTAIN", "VR-8DRIVE"];
  const bassDrawer = (
    <>
      {drawerHead("ベース", () => { gen.setBassStyle(""); gen.setBassFill(0); })}
      <div className="tk-drawer-body">
        <div className="tk-hublab">ベースのジャンル</div>
        <div className="tk-palette" aria-label="bass-genre">
          {([["", "おまかせ"], ["rock", "ロック"], ["ballad", "バラード"], ["citypop", "シティポップ"], ["funk", "ファンク"], ["edm", "EDM"], ["vocarock", "ボカロック"]] as [string, string][]).map(([v, lab]) => (
            <button key={v || "omakase"} type="button" className={"chip" + (gen.bassStyle === v ? " on" : "")} aria-label={`bass-genre-${v || "omakase"}`} aria-pressed={gen.bassStyle === v} onClick={() => gen.setBassStyle(v)}>{lab}</button>
          ))}
        </div>
        <div className="tk-hublab">フィル（セクション末）</div>
        <div className="knob-seg" aria-label="bass-fill">
          <span className="knob-name">向き</span>
          <span className="seg-ctl">
            {([["なし", 0], ["下降", 0.2], ["上昇", 0.9]] as [string, number][]).map(([lab, v]) => (
              <button key={v} type="button" className={"seg-b" + (gen.bassFill === v ? " on" : "")} aria-label={`bass-fill-${v}`} aria-pressed={gen.bassFill === v} onClick={() => gen.setBassFill(v)}>{lab}</button>
            ))}
          </span>
        </div>
        {gacc("bassfine", "細かく（型直指定）", "10型")}
        {openGroups.bassfine && (
          <label className="knob-row" aria-label="bass-style">
            <span className="knob-name">型直指定</span>
            <select value={BASS_TYPES.includes(gen.bassStyle) ? gen.bassStyle : ""} onChange={(e) => gen.setBassStyle(e.target.value)}>
              <option value="">—（ジャンルにまかせる）</option>
              <option value="RK-8ROOT">8分ルート弾き</option>
              <option value="RK-GALLOP">ギャロップ</option>
              <option value="BL-WHOLE">全音符バラード</option>
              <option value="BL-APPROACH">アプローチ橋渡し</option>
              <option value="CP-OCT8">オクターブ奏法</option>
              <option value="CP-WALK">歩くシティポップ</option>
              <option value="FK-ONE">ファンク the one</option>
              <option value="ED-OFFBEAT">オフビート</option>
              <option value="ED-SUSTAIN">ロー持続</option>
              <option value="VR-8DRIVE">高速8分ドライブ</option>
            </select>
          </label>
        )}
      </div>
      <div className="tk-drawer-foot">
        <button type="button" className="tool-item primary tk-gen" aria-label="gen-gen_bass" disabled={gen.genBusy || !hasChords} title={!hasChords ? "コードが要る" : "ベースを生成"} onClick={() => drawerGen("gen_bass")}>ベースを生成</button>
      </div>
    </>
  );

  // ---- 骨格引き出し（構造＝フォームの使い回し）----
  const skeletonDrawer = (
    <>
      {drawerHead("骨格", () => gen.setSkelForm(""))}
      <div className="tk-drawer-body">
        <label className="tool-item" aria-label="skel-form">
          構造
          <select value={gen.skelForm} onChange={(e) => gen.setSkelForm(e.target.value as "" | "period" | "aaba" | "cadence-swap" | "sentence")}>
            <option value="">おまかせ</option>
            <option value="period">前半くり返し</option>
            <option value="aaba">AABA</option>
            <option value="cadence-swap">終止だけ変えて反復</option>
            <option value="sentence">提示→畳み掛け(sentence)</option>
          </select>
        </label>
        <p className="tk-drawnote">置いた骨格のブロックをタップ＝骨格の机（動線は現行のまま）。ここは生成の設定だけ。</p>
      </div>
      <div className="tk-drawer-foot">
        <button type="button" className="tool-item primary tk-gen" aria-label="gen-skeleton" disabled={gen.genBusy} onClick={() => drawerGen(undefined)}>骨格を生成</button>
      </div>
    </>
  );

  // ---- 共通引き出し（横断設定＝進行の色＋ノリ）＝ハブ契約の「3つ目は共通引き出しへ沈める」の実体 ----
  const commonDrawer = (
    <>
      {drawerHead("共通", () => { gen.setPalette(""); onFeelChange?.(undefined); })}
      <div className="tk-drawer-body">
        {/* 進行の色（旋法）＝frame.palette として全生成へ流れる（コード以外も追従）。おまかせ=未送信=bit一致。 */}
        <div className="tk-hublab">進行の色（全パーツの生成に効く）</div>
        <div className="tk-palette" aria-label="palette">
          {PALETTE_CHIPS.map((p) => (
            <button key={p.v || "omakase"} type="button" className={"chip" + (gen.palette === p.v ? " on" : "")} aria-label={`palette-${p.v || "omakase"}`} aria-pressed={gen.palette === p.v} onClick={() => gen.setPalette(p.v)}>{p.label}</button>
          ))}
        </div>
        {/* ノリ＝セクション共有 feel（跳ね＋人間味）。全トラック同一ワープ＝アンサンブル一貫（design「フィール層分離」）。 */}
        <div className="tk-hublab">ノリ（跳ね・人間味＝全パーツ同じ揺れ）</div>
        <NoriRow feel={feel} onChange={(f) => onFeelChange?.(f)} />
        <p className="tk-drawnote">ノリは置いたパーツ全部（ドラム/コード/ベース/メロ）に同じ跳ね・人間味を掛けます。反映は次の再生から。</p>
      </div>
    </>
  );

  const body =
    view === "common" ? commonDrawer
    : view === "melody" ? melodyDrawer
    : view === "drums" ? drumsDrawer
    : view === "bass" ? bassDrawer
    : view === "skeleton" ? skeletonDrawer
    : hub;

  return (
    <div className={"assign-menu to-right tools-menu tk-sheet" + (view === "hub" ? " tk-hub" : " tk-drawer")} aria-label="tools-menu">
      {body}
    </div>
  );
}
