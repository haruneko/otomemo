# 歌詞先行メロディ生成（歌詞→メロ）アプローチA：既存V2エンジン拡張路線 — 設計＋難易度測定

- 作成: 2026-07-15（Fable設計・コード変更なし＝読みと設計のみ）
- 位置づけ: design.md L623「② 歌詞↔メロ相互変換＝gen_melody に歌詞制約を追加」の設計具体化。並行して別路線（B=専用エンジン等）が検討されているうちの **A路線（genMotifMelodyV2 に歌詞制約を注入）** を担当。
- 前提正典:
  - 理論: [2026-07-14-jp-prosody-melody-rules.md](2026-07-14-jp-prosody-melody-rules.md)（M3＝Orpheus層分離: アクセント整合=硬い制約で遷移を刈る／和声・跳躍・音域=柔らかいコスト。R-01〜14歌詞→リズム型／A-01〜10整合）
  - 本日の成果: [2026-07-15-kariuta-lyrics-craft.md](2026-07-15-kariuta-lyrics-craft.md)（K規則・V0〜V6評価器）・[2026-07-15-kariuta-accent-feasibility.md](2026-07-15-kariuta-accent-feasibility.md)（pyopenjtalk実測＝モーラ20/20・spawn 0.13〜0.23秒）
  - 既存エンジン: design.md #12-M／#20・`apps/api/src/music/melodyCells.ts`（genMotifMelodyV2）・`packages/music-core/src/prosody.ts`（suggestLyricRhythm/analyzeLyricFit 実装済）
- 思想整合: 機械は候補まで・複数案ばらつき・既定bit一致・骨格/表面の層分離。

---

## TL;DR

**A路線の設計骨子＝「V2のコアはほぼ触らない。歌詞制約は既存の3つの注入口（rhythmParts / phrases / 候補ランク）＋新1パスで入れる」**。

棚卸しの最大の発見: V2には歌詞制約に必要な注入口が **既に全部ある**。
1. **モーラ数→音数**: `rhythmParts.custom`（design #20 S4-2）が「小節ごとに16分オンセットパターンを名指しで敷く」機構＝**歌詞のモーラ列をそのまま per-bar パターンに変換して placement で敷けば、mkMotif の抽選を構造的にバイパスして音数が厳密一致する**。V2改造ゼロ。
2. **句割り→呼吸**: `opts.phrases`（P0-b実装済）が可変長ブロック＋句末カデンツ着地＋breathe/flow/pickupの句境界を全部駆動する＝歌詞の行構造をここへ写すだけ。
3. **アクセント整合**: Orpheus流「硬い制約で遷移を刈る」は**V2の背骨（モチーフ反復）と真っ向衝突するため生成内では句頭だけに限定**し、①句頭repair（新後処理パス1本）②候補ランク（analyzeLyricFit実装済をレンズ化）③警告表示、の3段soft構成で裁く。
4. **1番/2番問題は諦める（正典化）**: 同メロ別歌詞の整合は業界実務も字脚（モーラ数）一致（K-11）までしか守らない。本ツールも音数一致のみ跨コーラス制約とし、アクセントは1コーラス目基準＋警告。

**難易度＝M（総合）**。内訳: 使える最小版（モーラ数一致＋句割り＋整合レポート付き候補）＝**S+**（Opus委譲2〜3日級・V2コア変更ゼロ）／アクセント句頭repairパス追加＝**M**（+1〜2日・V2内の10本超の後処理パスとの相互作用が地雷）／mv抽選内へのλソフトバイアス（Orpheus本式）＝**L**（保留推奨・モチーフ選別の品質フィルタと綱引き）。新規/変更 合計 ≈700〜900行（テスト込み）。既存V2を壊すリスクは**低**（全注入が「未指定=bit一致」の既存流儀・api800本超の回帰網あり）。耳較正依存度 ≈30%（機械で受け入れ判定できるのは音数一致・アクセント整合率・E-rule維持・bit一致＝7/10項目。「歌えるリズムか」「モチーフがまだ聞こえるか」は耳のみ）。

---

## 1. 前提資産の棚卸し（何が既にあるか）

| 資産 | 場所 | 状態 | A路線での役割 |
|---|---|---|---|
| モーラ分割＋特殊拍分類 | `packages/music-core/src/prosody.ts:46` `analyzeMoras` | 実装済 | 歌詞→スロット列の源。ー=tie/っ=rest/ん=onset の role 分類（`roleOf` :97） |
| 歌詞→リズム型候補 | `prosody.ts:108` `suggestLyricRhythm`（R-01〜12） | 実装済・MCP露出済（`mcp.ts:945`） | basic/subdivide/tail の3候補＝**字余り/字足らずの分岐ロジックをそのまま流用** |
| アクセント整合検査 | `prosody.ts:332` `analyzeLyricFit`（A-01〜05/07＋V1/V2 openness） | 実装済・MCP露出済（`mcp.ts:955`） | 候補ランクの軸＋警告。repair パスの判定器にも転用可（`accentContour` :163） |
| 実アクセント供給 | `apps/api/src/accent.ts:44` `extractAccents` / :76 `accentsFromSyllables`（pyopenjtalk spawn 0.13〜0.23s） | 実装済（W-K1） | 生成前に**呼び側で**核位置・句境界を取る（V2純関数は汚さない） |
| 歌詞流し込み | `apps/api/src/lyric.ts:37` `flowLyric` | 実装済（set_lyric） | 生成後の syllable 付与。A路線では role 対応の拡張が要る（§4.4） |
| per-bar リズム注入 | `apps/api/src/music/rhythmParts.ts:53` `RhythmPartsOpt`（custom+placement）→ `melodyCells.ts:990` `buildPartVariant` | 実装済（#20 S4-2） | **モーラ数→音数の本命注入口**。輪郭(mv)はモチーフから巡回借用＝動機同一性を保ったままonsetだけ歌詞駆動 |
| 句割り・可変長ブロック | `melodyCells.ts:908` varLen（`opts.phrases`）＋句末カデンツ着地パス :1242 | 実装済（P0-b） | 歌詞の行→句。breathe/flow/pickup が句境界に連動済 |
| 候補複数＋ランク | `generate.ts:621` `genMelodyCandidates`（n=8生成→多様top-k=3） | 実装済 | アクセント整合を**ランク軸**として足す口（attachMelodyLenses mcp.ts:728 と同型） |
| 歌唱出口 | `apps/api/src/sing.ts`（VOICEVOX・W-K3） | 実装済 | 耳較正ループの出口＝生成→set_lyric→sing で即聴ける |

**結論: A路線の実装は「接着剤」が主で、新規発明は (a)歌詞→小節配分＋per-barパターン化の計画関数 (b)アクセント句頭repairパス の2つだけ。**

---

## 2. パイプライン図

```
歌詞テキスト（漢字混じり可・改行=句）
  │
  ├─(async・呼び側=mcp.ts/generate.ts手前)──────────────┐
  │  pyopenjtalk spawn（accent.ts extractAccents）        │ 失敗時は
  │  → 行ごと: モーラ列・アクセント句境界・核位置          │ prosody.ts内蔵
  │  → accentContour で UP/DOWN/FLAT 列（M3 §1.3）        │ ヒューリスティックへ
  │                                                        │ graceful fallback
  ▼
【WP-L0: planLyricMelody（新・純関数）】
  ① 行→句配分: 各行のモーラ数から整数小節の句割りを決める
     （8小節×4行→[2,2,2,2]・字余り行は subdivide 判定＝R-07）
     → phrases: {startBeat, beats, cadenceDegree}[]      … V2既存契約
  ② 句内→per-bar 16分パターン: モーラ role（onset/tie/rest）を
     グリッドへ配置（強拍=内容語頭 R-09/助詞は弱起 R-10/句末伸ばし R-11）
     → rhythmParts: {custom:[{id:"lyr-0",pattern}], placement:[{bar,partId}]}
     ※同モーラ数の行は同パターンを再利用（R-13＝リズム反復の回復・§5.4）
  ③ アクセント計画: 句ごとの Rel[]（UP/DOWN/FLAT）をonset位置に整列
     → accentPlan: {phraseStartBeat, rels: Rel[]}[]       … V2新opts（WP-L2）
  ▼
【V2: genMotifMelodyV2（melodyCells.ts:480）】
  骨格（従来どおり・歌詞は触らない＝層分離）
  → モチーフ生成/選別（従来）→ buildPartVariant が歌詞パターンでonset置換
  → renderで輪郭(mv)をモチーフから借用＝ピッチの動機同一性は保存
  → 後処理①〜⑤・句末カデンツ・expression・弱拍掃除（従来）
  → 【新】アクセント句頭repairパス（WP-L2・accentPlan指定時のみ）
  → drumLock/push/pickup/flow/restMask…（従来・pitch不変のtiming系）
  ▼
【生成後（呼び側）】
  flowLyricByPlan: 計画のモーラ⇔onset対応で syllable を各音符へ付与
  → analyzeLyricFit（accents=pyopenjtalk供給）で整合レポート
  → genMelodyCandidates のランク軸に accent score を追加（WP-L3）
  → 候補3案＋各案の fitレポート（赤/黄hits）を返す
  → （ユーザー）capture → sing_neta で耳確認
```

層の対応（M3 §7-6「Orpheus流の層分離」との整合）:
- **リズム＝入力として固定（Orpheusと同じ）**: 歌詞→リズム型を前段で確定し per-bar パターンで注入。
- **音楽性（和声・跳躍・音域）＝V2の既存コスト系がそのまま担う**（強拍CT・禁則・gap-fill・単一頂点）。
- **アクセント整合＝Orpheusの「硬い刈り込み」は採らない**（§5.1）。句頭repair＋ランク＋警告の3段soft。

---

## 3. 制約注入の設計（file:line込み）

### 3.1 モーラ数→音数（最重要・hard＝V0）

**注入口＝`rhythmParts.custom`＋`placement`**（`melodyCells.ts:971-1021`・`rhythmParts.ts:53`）。

- 計画関数が句内の各小節について16文字パターン（`x`=onset/`.`=無）を組む。モーラ role の写像:
  - normal/撥音ん → `x`（R-01/R-03＝1モーラ1音符・んは独立音符）
  - 長音ー → `.`（直前onsetのdurが次onsetまで伸びる＝**パーツ活性時はV2が「次onsetまでgapをdurで埋める」:1479-1486 ので tie が自動実現**＝R-02）
  - 促音っ → `.`（直前を詰める＝rest。articulationノブ併用で切れ味・R-04）
- **音数保証の構造**: `buildPartVariant`（:990）はパーツの onset をそのまま敷き、mkMotif の密度受入帯（:594-598）・選別 score（:639）を**バイパスする**＝「モーラ数≠音数」が原理的に起きない。`extractRhythmPart`（rhythmParts.ts:96）の逆方向と対で、16分グリッド量子化の座標系も既存と同一。
- **輪郭は壊れない**: パーツ経路の mv はブロック共有モチーフ Mi から巡回借用（:1002-1003）＝A/A'' の回帰・placeByLabel の同k再利用（preserve時）がそのまま生きる。
- 制約: パーツ経路は `!compound`（:974）＝**v1は4/4（barLen 3/4/6 の simple 系まで）。6/8は対象外**と明記する。

### 3.2 句割り→呼吸（phrases）

**注入口＝`opts.phrases`**（`generate.ts:539` → `melodyCells.ts:908` varLen・:1242 句末カデンツ着地・:1063 breathe・:1402 pickup・:1427 flow の句境界）。

- 歌詞の行（改行）＝句。行のモーラ数を予算に**整数小節**へ配分（varLen の制約: `bars: Math.max(1, Math.round(p.beats / barLen))` :910 ＝句は小節単位）。
- 配分ヒューリスティック（計画関数内・決定的）: セクション小節数を行数で均等割りを基本に、モーラ密度（モーラ数/小節）が受忍帯を超える行に+1小節（他行から-1）。密度帯の目安: **4/4で3〜8モーラ/小節=basic、9〜14=subdivide（16分寄り）、15超=警告して分割提案**（R-07。1小節16枠が物理上限＝16モーラ）。
- cadenceDegree: 最終行=1（主音）・中間行=既存 planSkeleton 流儀（5=半終止の開き）。将来は歌詞の句点/疑問符と連動（？行→A-07を逆手に開き終止）＝v1はやらない。

### 3.3 アクセント整合（3段soft＋句頭repair）

Orpheus本式（遷移の硬い刈り込み＝生成中にDOWN位置で上行遷移を候補から排除）は**採らない**。理由は§5.1。代わりに:

1. **段1・句頭repair（生成内・新パス＝WP-L2）**: `opts.accentPlan` 指定時のみ、各句の**先頭アクセント句（＝行頭の語）**の範囲に限り A-01（DOWN×旋律上昇＝語義誤解・赤）を修正する。挿入位置＝**弱拍掃除（:1322-1350）の直後・drumLock（:1358）の前**（pitchを触る最後のパス群の末尾・timing系の前）。実装は既存流儀に完全準拠:
   - 対象外＝`cadenceIdx`（句末着地）・`motifProtected`（U4動機反復音）・単一頂点keeper・i=0句頭アンカー。
   - 修正＝違反 note を「直前noteと同音 or 1〜2段下」へ `placeNear`/`placeNonForbidden`（:1091/:1105）で寄せる＝強拍ならCT内・禁則を作らない・E-rule不変量を既存ガードが保証。
   - 決定的（rng不使用）・`accentPlan` 未指定＝パス丸ごとスキップ＝**bit一致**。
2. **段2・候補ランク（生成後・WP-L3）**: `genMelodyCandidates`（generate.ts:621）の n=8 候補それぞれに flowLyricByPlan→`analyzeLyricFit`（accents=pyopenjtalk）を掛け、score を典型度 typ と並ぶランク軸に（`attachMelodyLenses` mcp.ts:728 と同型の添付＋並べ替え）。**λはここで効かせる**＝「アクセント整合の良い候補が上に来る」＝硬い制約でなく選好。
3. **段3・警告表示（既存）**: 採用後も analyze_lyric_fit の hits（赤/黄）をUI/チャットで提示＝ユーザーが握りつぶせる（M3思想）。

FLAT/UP系（A-02〜05）は段2・3のみ（repairしない）。**「DOWNの裏切りだけが語義誤解＝hard寄り、他はsoft」**というM3 §1.3の重み設計をそのまま機械分担に写した形。

### 3.4 frame/opts 契約案

`gen_melody`（mcp.ts:707）に追加する入力（frameでなく**opts側**＝生成ノブの仲間。frameは調/拍子等「世界の宣言」に保つ）:

```ts
lyrics?: {
  text: string;              // 歌詞。改行=句。漢字混じり可（pyopenjtalkが読む）
  kana?: string;             // 読み上書き（英字間投詞・固有名詞対策＝accent-feasibility §4-1）
  accents?: AccentEntry[];   // 核位置の明示上書き（常に自動より優先＝家訓）
  accentRepair?: number;     // 0..1 句頭repairの強さ（0=検査のみ・既定0.5）
  melisma?: number;          // 0..1 字足らず時の句末伸ばし許容（R-08/11。既定0.5）
}
```

内部（generate.ts genMelody opts → V2 opts）:

```ts
// generate.ts genMelody opts（呼び側が計画済みを渡す＝genMelodyは同期純関数のまま）
lyricsPlan?: {
  phrases: { startBeat: number; beats: number; cadenceDegree: number }[]; // 既存phrases契約と同形
  rhythmParts: RhythmPartsOpt;                                            // 既存契約と同形
  accentPlan?: { phraseStartBeat: number; rels: Rel[] }[];                // V2新opts（WP-L2）
  moraMap: { phrase: number; moras: Mora[] }[];                           // flowLyricByPlan用（生成後）
}
```

**純関数境界の裁定**: pyopenjtalk spawn は async＝V2/genMelody は同期純関数（`makeRng`のみ・seed決定的）が鉄則なので、**アクセント抽出と計画組み立ては mcp.ts のツールハンドラ（async）で行い、V2へは計画済みデータだけ渡す**。`analyze_lyric_fit` の既存パターン（mcp.ts:955〜987・自動spawn＋fallback＋accentSource返却）をそのまま踏襲。spawn失敗時は prosody.ts 内蔵ヒューリスティック（buildContour :289）で継続＝生成は止まらない。

### 3.5 既存ノブとの関係

| ノブ | 歌詞指定時の扱い | 理由 |
|---|---|---|
| density/runs/finest | **無効化（警告付き無視）** | onset数は歌詞が権威＝パーツ経路がバイパスするので実際にも効かない（mkMotif内でしか効かない :968） |
| phrasing | lyrics.text の行構造が勝つ（明示指定は矛盾警告） | 句割りの権威は歌詞 |
| breathe/flow/pickup | **併用可・推奨**（句境界は歌詞由来のphrasesに連動済） | 呼吸系は歌詞と同じ句を見る |
| motifMode:preserve+hook | 併用可 | 輪郭借用＝動機同一性はパーツ経路でも保存（:1002） |
| expression/skelColor/contour/skelForm | 併用可（骨格・表情は歌詞と直交＝層分離） | 骨格は構造線・歌詞は表面リズム |
| swing/humanize | 併用可（feel層＝pitch/onset不変） | 無干渉 |
| converse（ドラム密度相補） | 無効化 | onset増減が音数一致を壊す（partsActive時は既にスキップ :1052） |

---

## 4. 最難関の裁き方（直視）

### 4.1 モチーフ反復（A A'）× アクセント整合の綱引き → **反復が勝つ。アクセントは「句頭hard・他はランク」**

V2の背骨＝リズムと輪郭の反復（M9実測「リズムが同一性の担い手」・placeByLabel の同k回帰）。一方、歌詞は句ごとにアクセントが違う＝全モーラでアクセント整合を硬く課すと**句ごとに別の輪郭が要求され、反復＝フックが死ぬ**。Orpheusはモチーフ反復機構を持たない（毎音DP）から硬い刈り込みが成立するのであって、V2に同じ手を移植すると存在意義（動機の同一性）を壊す。

裁定（設計判断・耳較正で調整前提）:
- **語義誤解（A-01赤）だけを、句頭の語に限って生成内repair**。根拠＝(a)語頭は語彙アクセスの最重要部位（頭高/平板の判別は語頭2モーラでつく）(b)句頭はブロック頭＝モチーフのアンカー位置で、±1段の修正なら反復の同一性への打撃が最小（renderPreserve の k選択と同レベルの摂動）(c)実曲もアクセント整合を全音では守らない（M3 §5.2 西村2025＝適合度は分布であって100%でない）。
- 句中・句末の違反はランク（段2）と警告（段3）へ落とす。**「反復に勝てるのは終止と語義だけ」**を正準の優先順位とする: カデンツ着地 > A-01句頭 > 動機反復 > その他アクセント > 表情。
- λの実効: 段2のランクは n=8 候補からの選好＝seed違いで輪郭が変わるため、**「反復を保ったままアクセントに合う輪郭を持つ個体を選ぶ」**＝進化選択であって個体改変ではない。これがA路線の「λソフト制約」の実体（mv抽選内バイアス＝WP-L4 は保留・§6）。

### 4.2 1番/2番（同メロ別歌詞） → **諦めを正典化する**

- 整合は**1コーラス目（生成時に渡した歌詞）基準**。2番は set_lyric＋analyze_lyric_fit の警告のみ＝「2番で赤が出る」のは実曲でも普通（プロは字脚だけ揃えて歌唱でごまかす）。
- 跨コーラスで機械が守るのは **K-11（字脚一致）のみ**: 2番歌詞の行別モーラ数が1番と不一致なら set_lyric 時に差分警告（既存 flowLyric の分割/メリスマで吸収はするが警告を出す）。将来「2番も入力して両方でランク」は候補選好の重み合算で自然に拡張可＝契約は `lyrics.text` を配列にする余地だけコメントで残す。

### 4.3 メリスマ/字余りの置き所

- **字余り（モーラ>枠）**: 計画段階で吸収（§3.2の密度帯→subdivide＝16分細分 R-07）。小節内15モーラ超だけ「この行は長すぎる」を返して**生成前に**ユーザーへ差し戻す（repairループの入口・K系プレイブックと接続）。
- **字足らず（モーラ<枠）**: 句末伸ばし（R-08/11）＝パーツ経路の「gapをdurで埋める」（:1479）が自動でロングトーン化。`melisma` ノブ>0で句末母音に追加onset（同音 or ±1段＝R-12のメリスマ候補）を計画段階でパターンに足す。**メリスマの音高移動はV2に任せる**（mv借用＝動機文脈内）＝A-08「メリスマ内は原則警告しない」と整合。
- 置き所の優先: 長音・撥音位置は伸縮しろ（M3 §2.2「特殊拍のある枠は字余り耐性が高い」）＝計画関数が subdivide 時にまず特殊拍をタイ吸収してから16分化する。

### 4.4 歌詞駆動でリズム反復が消える問題（隠れた最難関）

素のV2はリズム自体がモチーフ＝反復で groove が出る。歌詞駆動 per-bar パターンは行ごとに違うリズムになり、**音数は合うが「リズムの歌としてのまとまり」が消える**リスクがある。これが品質面の本丸（アクセントより効く）。対策:
- **同モーラ数の行はパターンを再利用**（R-13）: 計画関数が `patternByMoraKey`（行のモーラrole列→パターン）をキャッシュ＝対句・リフレイン（K-22）が自然に同リズムになる。**字脚の揃った歌詞ほど反復が回復する**＝「音数を揃えると良いメロが出る」というツール→ユーザーへの正しい誘導が生まれる（設計思想「足場」に合致）。
- 近似モーラ数（±1）の行は基準行パターンの局所変形（特殊拍位置で±1 onset）で寄せる＝リズム変奏の主通貨（M9 §3「音数±1-2のゆるい変奏」）と同型。
- それでも輪郭（mv）は全行で共有モチーフから借用＝ピッチ面の同一性は常に残る。

### 4.5 flowLyric の role 対応（小さいが契約上の穴）

既存 `flowLyric`（lyric.ts:37）は全モーラを音符に1:1で流す＝生成側が「っ=rest・ー=tie」でonsetを立てない設計と**数え方がズレる**。生成経路専用に `flowLyricByPlan(notes, plan)` を足し、計画のモーラ⇔onset対応表で syllable を付与（ーは直前音符のdur内＝syllable連結「か+ー」表記 or 既存メリスマ"ー"表記に合わせる＝実装時にset_lyric/sing.ts の notesToScore と表記統一。sing.ts はメリスマ ー→lyric"" 対応済）。既存 flowLyric は set_lyric（手動流し込み）用にそのまま残す＝二経路だが用途が別（手動=音符が先・生成=計画が先）。

---

## 5. スライス分割と見積もり（Opus委譲前提）

| WP | 内容 | 新規/変更規模 | 期間感 | V2コア変更 |
|---|---|---|---|---|
| **WP-L0** | `planLyricMelody`（新・純関数）: 行→句配分・per-barパターン・accentPlan・moraMap。TDD（モーラ⇔onset数の恒等 property・特殊拍role・字余り分岐・パターン再利用） | 新規 ~250行＋テスト~200行（置き場: `apps/api/src/music/lyricsPlan.ts`。prosody.ts の analyzeMoras/suggestLyricRhythm を消費） | **半日〜1日級** | なし |
| **WP-L1** | 配線＝使える最小版: mcp.ts `lyrics` param（async accent抽出＋fallback）→ generate.ts `lyricsPlan` 透過 → 既存 phrases/rhythmParts へ写像 → `flowLyricByPlan` → 候補ごと analyzeLyricFit 添付 | 変更 mcp.ts ~60行・generate.ts ~50行・lyric.ts ~50行＋テスト~150行 | **1日級** | なし（既存opts消費のみ） |
| **WP-L2** | アクセント句頭repairパス（V2内・accentPlan未指定=bit一致） | melodyCells.ts +~120行＋テスト~150行（bit一致回帰・repair後のE-rule/CT/カデンツ不変量） | **1〜2日級**（後処理10本超との相互作用が地雷＝既存の cadenceIdx/motifProtected/単一頂点ガードを正しく踏む必要。表情パス実装と同難度） | あり（1パス追加） |
| **WP-L3** | ランク軸＋UI: genMelodyCandidates に accent score 軸（attachMelodyLenses 流儀）・SectionEditor/デスクに歌詞入力欄＋赤黄ハイライト | api ~80行・web ~150行 | **1日級** | なし |
| **WP-L4** | （保留）mv抽選内λバイアス＝mkMotif/varyTail の move サンプルに accent方向の重み | — | L級（3日超） | **保留推奨**: genBest の選別scoreとの綱引き・run方向保持との衝突・bit一致の維持が難しい。L2＋ランクで耳が不満な場合のみ着手 |

- **合計（L0〜L3）**: 新規/変更 ≈700〜900行（テスト込み）。Opus委譲で **正味4〜5日級**、並行可能なのは L0∥L3(UI骨格) 程度＝実質1週間弱。
- **使える最小版までの距離＝L0+L1のみ（2〜3日級）**: この時点で「歌詞を渡すと音数が厳密一致し句で呼吸するメロ候補3案＋各案のアクセント整合レポート」が出る。アクセントは検査＆ランクのみだが、**モーラ数一致（V0）が仮歌詞パイプの存在意義の8割**（kariuta-lyrics-craft §1.3「ここがズレたら道具として無価値」）なので、最小版の実用価値は高い。

### 依存とテスト戦略

- 依存: pyopenjtalk（導入済・W-K1）・VOICEVOX（耳出口・W-K3導入済）＝**新規外部依存ゼロ**。
- bit一致鉄則: lyrics/lyricsPlan/accentPlan 未指定で全既存テスト緑（既存13ノブと同じゲート流儀）。地雷（メモリ既知）: dist焼き忘れ・実機反映は要 api 再起動。
- property: 「任意のかな歌詞×任意seedで、生成notesのonset数（restMask/dedupe後）＝計画のonset role数」を fast-check 級で固定するのが本線の1本。

---

## 6. 受け入れ基準案

### 機械で測れる（CI/自己チェック）

| 指標 | 基準 | 測り方 |
|---|---|---|
| V0 モーラ⇔音数一致 | **100%（hard）** | plan onset数 = notes数（property テスト） |
| 句頭A-01（赤）残存 | repair後 **0件/句頭語**（repair不能時=警告残しは許容・件数記録） | analyzeLyricFit hits を句頭範囲でフィルタ |
| アクセント整合score | 採用候補が n=8 中央値より **+0.1以上**（λ実効の確認） | analyzeLyricFit.score の候補間比較 |
| E-ruleガード | 禁則跳躍0・強拍CT率が素V2同帯・単一頂点維持 | 既存 evalMelody/後処理⑤検証の流用 |
| bit一致 | lyrics未指定＝既存出力と厳密一致 | 既存回帰スイート |
| ばらつき | 候補3案が melodySimilarity < CAND_SIM_MAX（既存基準） | genMelodyCandidates 既存機構 |
| 決定性 | 同歌詞×同seed×同accents＝同出力 | seed固定テスト |

### 耳の的（オーナー手番・sing_neta で）

1. **歌えるか**: 歌詞駆動リズムで16分詰め込み行が「早口として成立」しているか／促音の詰めが不自然でないか（機械はモーラ密度帯でしか守れない）。
2. **モチーフがまだ聞こえるか**: 字脚の揃った歌詞（対句）でリズム反復が回復するか・輪郭借用だけで「同じ歌」に聞こえるか（§4.4の検証＝A路線の質の本丸）。
3. **句頭repairの副作用**: A-01修正で動機の頭が「潰れた」感じにならないか（accentRepair 0/0.5/1 の聴き比べ→既定値昇格は別コミット＝expressionノブの前例踏襲）。
4. 素V2（歌詞なし）との質差: 歌詞制約で全体の質がどれだけ落ちるか＝落ち幅が大きければ B路線（専用エンジン）の相対価値が上がる＝**路線比較の判定材料としてここを最初に聴く**。

---

## 7. リスクと限界（正直な記録）

1. **質の天井はリズム配分にある（アクセントではない）**: mkMotif の選別（score :639＝歌える塊を選ぶフィルタ）をバイパスする以上、リズムの音楽性は計画関数のヒューリスティック（強拍=内容語・特殊拍吸収・パターン再利用）が全部背負う。ここが素朴だと「音数は合うが歌として乗らない」が出る。§4.4の再利用設計＋耳較正で詰める前提だが、**行ごとにモーラ数がバラバラな歌詞では原理的に反復が痩せる**＝限界として明記（ツールは字脚を揃える方向へ誘導するのが正しい応答）。
2. **アクセント整合の実効はランク頼み**: 句頭repair以外は「n=8からの選好」＝母集団に良い個体がいなければ改善しない。整合率をもっと上げたければ WP-L4（抽選内バイアス）か B路線（DP生成）が要る＝**A路線の整合率の天井は中程度**と割り切る。西村2025の知見（実曲も分布）からこの天井で実用十分と見るが、耳で外れたら路線再考。
3. **後処理がonsetを動かす箇所との整合**: dedupe（:1561）・restMask（:1541）・breathe の drop（:1072）は音数を減らし得る。歌詞指定時は breathe の drop を句頭パターン側（計画で行頭に休符スロット）へ振り替え、restMask 併用（骨格休符×歌詞）は「骨格が勝つ＝欠けたモーラを警告」と裁定。実装時の要注意リスト筆頭。
4. **pyopenjtalk の穴**: 英字間投詞のスペルアウト崩壊・断片歌詞での読み誤り（feasibility §4）。`kana`/`accents` 上書き口で人間が確定＝仕様として案内文に明記。孤立単語投入は禁物＝**行単位で投入**（同 §4-3）。
5. **6/8・compound 未対応（v1）**: パーツ経路が `!compound` 限定。6/8 の歌モノ需要が出たら buildPartVariant の12枠対応が別スライス（M級）。
6. **1番/2番は守らない**（§4.2）＝仕様であって欠陥ではない、をUI文言でも明示しないと「壊れてる」と誤解される。
7. **flowLyric 二経路化**の表記ゆれ（ー/メリスマ）: sing.ts notesToScore・set_lyric・web 表示の3か所と表記契約を揃える確認が WP-L1 の隠れ工数。

---

## 8. 結論（難易度判定）

- **総合難易度: M**。根拠＝(a)注入口3/4が既存機構の再利用で新規発明が2点に収まる (b)全注入が既存の「未指定=bit一致」流儀に乗り回帰網が効く (c)ただし WP-L2 の後処理相互作用と、リズム配分の質（耳較正必須）が中量級の不確実性。
- 使える最小版（音数一致＋句割り＋整合レポート）＝**S+・Opus 2〜3日級・V2コア無変更**。
- アクセントを生成に効かせる完成形（句頭repair＋ランク）＝**M・累計4〜5日級**。
- Orpheus本式の全面DP化はA路線ではやらない（＝それはB路線の領分）。A路線の価値＝**V2の既得資産（骨格・動機反復・13ノブ・feel層・ドラム/ベース結線）を歌詞付きでそのまま使えること**。
