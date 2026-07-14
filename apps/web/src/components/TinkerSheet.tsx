import { Icon } from "./Icon";
import { useMelodyGen, MELODY_PRESETS, GEN_PARTS, RHYTHM_PART_UI } from "../useMelodyGen";
import type { ChordArg } from "../useMelodyGen";
import type { Note } from "../music";

// 「いじる」ボトムシートの中身（design #19 ⑥・正準＝docs/research/2026-07-14-tinker-menu-redesign-fable.md）。
// Task「いじる再設計」T1＝SectionEditor の inline `.tools-menu` を機械抽出（挙動/DOM/aria 完全不変）。
// 状態と送信ロジックは useMelodyGen(gen) が唯一持つ＝当コンポは器（JSX/CSS）のみ＝生成 payload は bit 一致。
export type TinkerSheetProps = {
  gen: ReturnType<typeof useMelodyGen>;
  isSong: boolean;
  sectionChords: () => ChordArg[];
  sectionBass: () => Note[];
  onClose: () => void;
  onExportMidi: () => void;
  onExportMidiSplit: () => void;
};

export function TinkerSheet({ gen, isSong, sectionChords, sectionBass, onClose, onExportMidi, onExportMidiSplit }: TinkerSheetProps) {
  return (
    <div className="assign-menu to-right tools-menu" aria-label="tools-menu">
      {/* P3（2026-07-10・UX再設計）：モバイルは下から迫り上がるシート。掴み＋見出し＋閉じる（CSSで sheet 化）。 */}
      <div className="sheet-head">
        <span className="sheet-grab" aria-hidden="true" />
        <span className="sheet-title">いじる</span>
        <button type="button" className="sheet-close" aria-label="close-tools" onClick={onClose}>✕</button>
      </div>
      {/* 生成/ハモリはパートを作る道具＝section 専用。song(編成)は書き出しのみ（#5）。 */}
      {/* E2E[高]：候補生成中もプリセット/生成ボタンを出す＝別プリセットで作り直しがワンタップ（旧: 候補ありで生成UI丸ごと非表示＝多段操作）。候補は別パネル(トレイ)で並行表示。 */}
      {!isSong && (
        <>
          <div className="tools-sep">この進行に生成</div>
          {GEN_PARTS.filter((part) => !part.needsChords || sectionChords().length > 0).map((part) => (
            <button
              key={part.op}
              type="button"
              className="tool-item"
              aria-label={`gen-${part.op}`}
              disabled={gen.genBusy}
              onClick={() => { onClose(); void gen.genPart(part); }}
            >
              {gen.genBusy ? "生成中…" : part.label}
            </button>
          ))}
          {/* 旋法パレット（WP-C1・2026-07-14）：mode の下の「色」を1セレクタで。おまかせ=未送信=従来 bit 一致。
              コード生成では特徴和音（♭VII/IV長）、メロ/ベース/骨格生成では scalePcs 差替でトラック横断に追従。
              耳語ラベル（2026-07-10-melody-param-clarity 流儀）＝明るめ/土っぽい/哀愁/浮遊。 */}
          <label className="tool-item" onClick={(e) => e.stopPropagation()}>
            旋法
            <select aria-label="palette" value={gen.palette} onChange={(e) => gen.setPalette(e.target.value as "" | "ionian" | "mixolydian" | "aeolian" | "dorian")}>
              <option value="">おまかせ</option>
              <option value="ionian">明るめ(王道)</option>
              <option value="mixolydian">土っぽい(♭VII)</option>
              <option value="aeolian">哀愁(短調)</option>
              <option value="dorian">浮遊(♮6)</option>
            </select>
          </label>
          {/* ドラム定型ビート＋フィル（WP-D1・2026-07-14）：おまかせ=未送信=従来。style=ジャンル/型、fill=セクション末に挿入。 */}
          <label className="tool-item" aria-label="drum-style" onClick={(e) => e.stopPropagation()}>
            ビート型
            <select value={gen.drumStyle} onChange={(e) => gen.setDrumStyle(e.target.value)}>
              <option value="">おまかせ</option>
              <optgroup label="ジャンル">
                <option value="jpop">J-pop</option>
                <option value="rock">ロック</option>
                <option value="dance">ダンス/EDM</option>
                <option value="ballad">バラード</option>
                <option value="funk">ファンク/R&B</option>
              </optgroup>
              <optgroup label="型（直指定）">
                <option value="beat8.basic">8ビート基本</option>
                <option value="beat8.syncopated">8ビート食い込み</option>
                <option value="beat16.basic">16ビート</option>
                <option value="beat16.ghost">16ゴースト</option>
                <option value="four.rock">4つ打ちロック</option>
                <option value="four.house">4つ打ちハウス</option>
                <option value="halftime.basic">ハーフタイム</option>
                <option value="shuffle.basic">シャッフル</option>
                <option value="six8.ballad">6/8バラード</option>
              </optgroup>
            </select>
          </label>
          <label className="tool-item" aria-label="drum-fill" onClick={(e) => e.stopPropagation()}>
            フィル
            <select value={String(gen.drumFill)} onChange={(e) => { const v = e.target.value; gen.setDrumFill(v.startsWith("build.") ? v : Number(v)); }}>
              <option value="0">なし</option>
              <option value="0.3">弱（軽い節目）</option>
              <option value="0.6">中（遷移フィル）</option>
              <option value="0.9">強（大遷移）</option>
              {/* ビルドアップ・テンプレ（WP-X4）：密度倍加＋vel漸増＋末尾ギャップ＝サビ/ドロップ直前の溜め。要 bars≥テンプレ小節+1。 */}
              <optgroup label="ビルドアップ（溜め）">
                <option value="build.tight.4bar">溜め4小節（プリコーラス）</option>
                <option value="build.standard.8bar">溜め8小節（汎用）</option>
                <option value="build.big.16bar">溜め16小節（大サビ前）</option>
              </optgroup>
            </select>
          </label>
          {/* ベース語彙のジャンル型ライブラリ（WP-B1・2026-07-14）：おまかせ=未送信=従来。style=ジャンル/型、bassFill=セクション末に挿入。 */}
          <label className="tool-item" aria-label="bass-style" onClick={(e) => e.stopPropagation()}>
            ベース型
            <select value={gen.bassStyle} onChange={(e) => gen.setBassStyle(e.target.value)}>
              <option value="">おまかせ</option>
              <optgroup label="ジャンル">
                <option value="rock">ロック</option>
                <option value="ballad">バラード</option>
                <option value="citypop">シティポップ</option>
                <option value="funk">ファンク</option>
                <option value="edm">EDM</option>
                <option value="vocarock">ボカロック</option>
              </optgroup>
              <optgroup label="型（直指定）">
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
              </optgroup>
            </select>
          </label>
          <label className="tool-item" aria-label="bass-fill" onClick={(e) => e.stopPropagation()}>
            ベースフィル
            <select value={String(gen.bassFill)} onChange={(e) => gen.setBassFill(Number(e.target.value))}>
              <option value="0">なし</option>
              <option value="0.2">下降（落ち着かせ）</option>
              <option value="0.9">上昇（駆け上がり）</option>
            </select>
          </label>
          {/* 骨格を生成（design #20 S2）：構造線(2声骨格)を機械に叩き台で出す→骨格レーンへ。
              構造(skelForm・design #12-M 2026-07-13)＝2/4/8で使い回すフォーム型リテラル回帰を選んでから生成。 */}
          <label className="tool-item" aria-label="skel-form" onClick={(e) => e.stopPropagation()}>
            構造
            <select value={gen.skelForm} onChange={(e) => gen.setSkelForm(e.target.value as "" | "period" | "aaba" | "cadence-swap" | "sentence")}>
              <option value="">おまかせ</option>
              <option value="period">前半くり返し</option>
              <option value="aaba">AABA</option>
              <option value="cadence-swap">終止だけ変えて反復</option>
              <option value="sentence">提示→畳み掛け(sentence)</option>
            </select>
          </label>
          <button type="button" className="tool-item" aria-label="gen-skeleton" disabled={gen.genBusy} onClick={() => { onClose(); void gen.genSkeleton(); }}>
            {gen.genBusy ? "生成中…" : "骨格"}
          </button>
          {/* P4/P5（2026-07-10・UX再設計）：プリセット主役＋🎲サイコロ＋耳語ラベルの詳細（群でまとめる）。押す前に設定→生成。 */}
          {sectionChords().length > 0 && (
            <div className="gen-knobs" onClick={(e) => e.stopPropagation()}>
              <div className="preset-head">
                <div className="preset-row" aria-label="melody-presets">
                  {MELODY_PRESETS.map((p) => (
                    <button key={p.name} type="button" className={"chip" + (gen.preset === p.name ? " on" : "")} aria-label={`preset-${p.name}`} aria-pressed={gen.preset === p.name} onClick={() => gen.applyPreset(p.name, p.v)}>{p.label}</button>
                  ))}
                </div>
                <button type="button" className="dice-btn" aria-label="dice-roll" title="ノブをランダムに振る（ロックは固定）" onClick={gen.rollDice}><Icon name="dice" size={18} /></button>
              </div>
              <button
                type="button"
                className={"knob-details-toggle" + (gen.detailsOpen ? " on" : "")}
                aria-label="knob-details-toggle"
                aria-expanded={gen.detailsOpen}
                onClick={() => gen.setDetailsOpen((v) => !v)}
              >
                {gen.detailsOpen ? "▾ 細かく設定する" : "▸ 細かく設定する"}
              </button>
              {gen.detailsOpen && <>
                <div className="knob-group-h">リズムのノリ</div>
                {gen.sliderRow("density", "細かさ", gen.density, gen.setDensity, "スカスカ", "ぎっしり", "density")}
                {gen.sliderRow("swing", "跳ね", gen.swing, gen.setSwing, "まっすぐ", "はねる", "swing")}
                {gen.segRow("runs", "駆け上がり", "16分の走り", gen.runs, gen.setRuns, "runs")}
                {gen.segRow("push", "前ノリ", "拍を食う", gen.push, gen.setPush, "push")}
                <label className="knob-row">
                  <span className="knob-name">最小音符<small>速い曲は粗く</small></span>
                  <select aria-label="finest" value={gen.finest} onChange={(e) => { gen.setFinest(e.target.value as "" | "quarter" | "eighth"); gen.setPreset(""); }}>
                    <option value="">おまかせ(速さ連動)</option>
                    <option value="quarter">4分まで</option>
                    <option value="eighth">8分まで</option>
                  </select>
                </label>
                {/* リズムパーツ層 L1（design #20 S4-1）：プリセットを押した順に小節へローテで敷く。未選択=従来抽選 */}
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
                <div className="knob-group-h">歌い回し</div>
                {gen.segRow("expression", "タメ", "強拍のもたれ", gen.expression, gen.setExpression, "expression")}
                {gen.segRow("hook", "口ずさみ", "反復音フック", gen.hook, gen.setHook, "hook")}
                {gen.sliderRow("foreground", "冒険度", gen.foreground, gen.setForeground, "おなじみ", "冒険", "foreground")}
                {gen.sliderRow("articulation", "歯切れ", gen.articulation, gen.setArticulation, "なめらか", "くっきり", "articulation")}
                <div className="knob-group-h">フレーズの組み立て</div>
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
                {sectionBass().length > 0 && <>
                  <div className="knob-group-h">他パートとの絡み</div>
                  <div className="knob-seg" aria-label="counter">
                    <span className="knob-name">ベースをよける<small>並行5度8度を避ける</small></span>
                    <span className="seg-ctl">
                      {([["OFF", ""], ["弱", "weak"], ["中", "mid"], ["強", "strong"]] as [string, "" | "weak" | "mid" | "strong"][]).map(([lab, v]) => (
                        <button key={v || "off"} type="button" className={"seg-b" + (gen.counter === v ? " on" : "")} aria-label={`counter-${v || "off"}`} aria-pressed={gen.counter === v} onClick={() => { gen.setCounter(v); gen.setPreset(""); }}>{lab}</button>
                      ))}
                    </span>
                  </div>
                </>}
                <div className="knob-group-h">人間味・仕上げ</div>
                {/* WP-D2 humanize 較正：揺れは 1/f（人間寄り）・部位別に上限（K/S/HH タイト〜メロ自由）。OFF=機械通り／弱=既定の自然な揺れ／強=生っぽく(盛りすぎは自動で頭打ち) */}
                {gen.segRow("humanize", "人間味", "自然な揺れ(1/f)・盛り上限あり", gen.humanize, gen.setHumanize, "humanize")}
              </>}
            </div>
          )}
          {gen.melodyLaneNotes().length > 0 && (
            <>
              <div className="tools-sep">メロ加工</div>
              <button type="button" className="tool-item" aria-label="harmony-up" title="調内で平行3度上の第2声部" onClick={() => { onClose(); gen.makeHarmony(2); }}>上ハモ</button>
              <button type="button" className="tool-item" aria-label="harmony-down" title="調内で平行3度下の第2声部" onClick={() => { onClose(); gen.makeHarmony(-2); }}>下ハモ</button>
              {sectionChords().length > 0 && (
                <>
                  <button type="button" className="tool-item" aria-label="fit-to-chords" title="メロの各音を近いコードトーンへ寄せる" disabled={gen.genBusy} onClick={() => { onClose(); void gen.fitToChords(); }}>コードに合わせる</button>
                  <button type="button" className="tool-item" aria-label="analyze-fit" title="メロとコードの噛み合いを診断（読むだけ）" onClick={() => { onClose(); void gen.analyzeFit(); }}>噛み合い診断</button>
                </>
              )}
            </>
          )}
        </>
      )}
      <div className="tools-sep">書き出し</div>
      <button type="button" className="tool-item" aria-label="export-midi" onClick={onExportMidi}>MIDI</button>
      <button type="button" className="tool-item" aria-label="export-midi-split" title="メロ/コード/ベース/リズムを別トラックに" onClick={onExportMidiSplit}>MIDI（分割）</button>
    </div>
  );
}
