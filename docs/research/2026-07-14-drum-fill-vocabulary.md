# ドラム・フィルイン / セクション遷移 型辞書 仕様（D1）

- 作成: 2026-07-14
- 種別: 研究・設計仕様（`docs/research/`）
- 目的: ドラム生成器が持たない「フィルイン／セクション遷移の語彙」を、生成器に載せられる**型辞書（データ仕様）**として確定する。
- 思想整合: 「機械は候補まで、仕上げは人間」。本辞書は**候補フィルを構造位置に応じて提示する**ためのもので、確定演奏を押し付けない。既定は控えめ、密度・攻め度はノブで開放する。
- 出力ノート規約（既定 GM）: kick=36 / snare=38 / hihat closed=42・open=46 / tom hi=48 or 50・tom mid=45 or 47・floor tom=41 or 43 / crash=49 / ride=51。本書のテキスト譜レーン `K/S/T1/T2/F/C/H/R` は各々 kick / snare / ハイタム / （T2=）ミッド〜ロータム / floor tom / crash / hihat / ride にマップする。

---

## 0. テキスト譜の読み方（16分グリッド）

- 1小節 = 16セル（4拍 × 4）。区切り `|` は拍頭。セル記号:
  - `x` = 通常打（既定ベロシティ）／`X` = アクセント（強打）／`o` = ゴースト（弱打）／`.` = 休符／`O`（H行）= オープンハイハット／`-` = そのレーンは当該フィルで不使用。
- レーン順（上から）: `C`(crash) `H`(hihat/ride) `T1` `T2` `F`(floor) `S`(snare) `K`(kick)。
- フィルは基本「小節の後方」に置き、**次小節1拍目のクラッシュ＋キックで着地**する（着地は次小節側なので、フィル本体の末尾に `→C+K` と注記）。
- ベロシティは 0–127 の目安を併記（`v40` 等）。クレッシェンドは開始→終了で表記（`v50→110`）。

---

## 1. フィルの配置理論（どこに・どれくらい・どの頻度で）

### 1.1 構造位置（どこに入るか）
出典が一致して挙げる位置（[MusicRadar](https://www.musicradar.com/tuition/tech/learn-how-drum-fills-work-in-5-easy-steps-639154) / [The Pro Audio Files](https://theproaudiofiles.com/phrasing/) / [Rhythm Notes](https://rhythmnotes.net/drum-fills/)）:

1. **セクション遷移の直前小節**（例: Verse→Chorus の最後の1小節）＝最重要。フィルの第一義は「次セクションのセットアップ」。
2. **句（フレーズ）境界**＝4小節・8小節句の末尾。8小節句なら「4小節目に小フィル、8小節目に大フィル」で**進行感（mile marker）**を作る（Pro Audio Files「bar8は控えめ、bar16は明確に」）。
3. **セクション内の中間点**（Verse/Chorus の折返し4小節目）に軽い turnaround フィル。
4. **2小節・1小節の短い呼吸点**＝拍頭の軽い置き（多用注意）。

原則（複数出典で強調）: **"where/why/how" が "what" より重要**。位置がすべて。ランダムに置くと「巡航中に穴に落ちる」感覚になる（Pro Audio Files）。

### 1.2 長さの分布
| 長さ | 16分セル数 | 典型用途 |
|---|---|---|
| 半拍（1/8） | 2 | 句内の軽い崩し・スネアのつっかえ |
| 1拍 | 4 | 4/8小節句の turnaround（最頻・低リスク） |
| 半小節（2拍） | 8 | セクション遷移の標準フィル |
| 1小節 | 16 | 大セクション遷移（Verse→Chorus、Chorus→間奏） |
| 2小節 | 32 | 曲頭・大サビ前・ブレイク明けなど「特別な場所」限定 |

### 1.3 頻度の目安（何小節に1回）
- 一般則: **8小節または16小節に1回**が自然（MusicRadar / Grokipedia [Fill](https://grokipedia.com/page/Fill_(music))）。中間点の軽いフィルを足すなら 4 小節に 1 回まで。
- ジャンル別ヒューリスティック（下の §5 と整合）:
  - **バラード/J-pop Aメロ**: 8–16小節に1回、控えめ。
  - **ロック/バンド系**: 4–8小節に1回。サビ前は必ず。
  - **ファンク**: 句内に細かいゴースト＋短フィル多発（2–4小節に1回相当）だが「大フィル」は節目のみ。
  - **EDM/ダンス**: 小節単位のフィルはほぼ無し。**8/16小節周期のビルドアップ**に置換（§5）。
- 生成器の既定値: **16小節周期に1回の「大」＋8小節目に「小」**。それ以上は energy ノブで開放。

---

## 2. フィルの内部構造の型

出典: [Drumeo 7 beginner fills](https://www.drumeo.com/beat/beginner-drum-fills/) / [DRUM! ghost notes](https://drummagazine.com/lesson-ghost-note-style-and-placement/) / [DRUM! groove-to-fill](https://drummagazine.com/perfecting-your-groove-to-fill-transitions/) / [Free Drum Lessons](https://freedrumlessons.com/free-series/rock-fills/lesson-3.php)。

### 2.1 型カテゴリ
1. **タム下降（descending）**: スネア→ハイタム→ミッド→フロアと音程を下げて回す。もっとも「終止感・落ち着き」。サビ前より「盛り上がりの解決」向き。
2. **タム上昇（ascending）**: フロア→ミッド→ハイ→（or スネア）と上げる。**緊張を上げてサビへ**放り込む向き（次小節クラッシュへ自然に繋がる）。
3. **スネア連打（snare roll / 16th machine-gun）**: スネアの16分（または32分）連打。ロック・ビルドアップの主力。
4. **シンコペ型（syncopated / linear）**: K・S・T をリニア（同時打なし）に食う配置で「引っかかる」フィル。ファンク/フュージョン。
5. **休符型（空けるフィル / negative-space）**: あえて叩かず、キック1発＋空白＋クラッシュ。ハーフタイム前やダイナミクスを落とす遷移で有効。「叩かない」も語彙。
6. **クラッシュ・セットアップ型**: フィル末尾で「クラッシュを呼ぶ布石」＝直前のキック/スネアで踏み込み、次小節頭 `C+K` に叩き込む。ほぼ全フィルの**着地共通仕様**。

### 2.2 開始位置（どの拍から崩し始めるか）
- **1拍フィル**: 4拍目（セル13）から。
- **半小節フィル**: 3拍目（セル9）から。
- **1小節フィル**: 1拍目から（ただし頭に1発グルーヴを残し2拍目から崩すと自然）。
- 「崩し始め」は**8分裏や16分裏から入る**と食い（アンティシペーション）が出て前のめりになる。

### 2.3 終止（着地）共通仕様
- 次小節1拍目に **crash(49) + kick(36) を同時**、直後にグルーヴ復帰。これが「解決」の合図。
- 静かな遷移では crash を **ride/HH open** or **crash無し**に差し替え（§3）。

---

## 3. セクション遷移の演出（フィル以外の手段）

出典: [Serato arrangement](https://the-drop.serato.com/how-to/song-arrangement-tips-for-beat-makers/) / [Point Blank song structure](https://www.pointblankmusicschool.com/blog/understanding-song-structure-from-intro-to-outro/) / [Avid arranging](https://www.avid.com/resource-center/arranging-music-guide) / [The Pro Audio Files](https://theproaudiofiles.com/phrasing/)。

| 手段 | 効果 | 実装（生成器への含意） |
|---|---|---|
| **クラッシュのみ** | 最小の遷移マーク。フィル無しで次頭に crash+kick | fill を空にして着地音のみ生成 |
| **ハーフタイム化** | スネアを2・4拍→3拍のみへ。体感テンポ半分＝ドラマ | 次セクションの拍配置を half-time パターンに切替 |
| **ダブルタイム化** | 逆に密度2倍。サビ/落ちサビ後の再加速 | HH/ride を16分へ、backbeat維持 |
| **ブレイク（全休止）** | 1〜数拍すべて止める。ボーカル/キメを立てる | 遷移小節末の一定範囲を無音化＋次頭 crash |
| **ビルドアップ（密度漸増）** | スネアロール/キック密度を漸増し放出 | §5 EDM 型。クレッシェンド velocity 必須 |
| **ハイハット開閉変化** | closed→open で開放感、open→closed で締め | 遷移前後で 42↔46 を切替 |
| **ライド⇄ハイハット** | Verse=HH、Chorus=ride/crash-bell で音色対比 | セクション役割に cymbal レーンを結線 |
| **キック密度/フロア追加** | Chorus で kick を8分・floor tom を足し重心UP | セクション energy に応じ下半身を厚く |

### 3.1 セクション役割ペアごとの定番
| 遷移ペア | エネルギー方向 | 定番演出 |
|---|---|---|
| Intro→Verse | ↑ 軽 | 小フィル or crash のみ。HH開けて開始 |
| Verse→Pre-Chorus | ↑ | 1拍〜半小節のタム上昇、スネアゴースト増 |
| Pre-Chorus→Chorus | ↑↑ | **1小節のビルド/上昇フィル or スネアロール→次頭 crash+kick**、ride/openへ |
| Verse→Chorus（Pre無し） | ↑↑ | 半小節〜1小節フィル、クレッシェンド |
| Chorus→Verse2 | ↓ | 下降タムフィル or ブレイク。HH閉じ密度を落とす |
| Chorus→間奏/Solo | → or ↑ | 派手な1小節フィル＋crash、間奏頭でキメ |
| 間奏→落ちサビ(Bridge) | ↓↓ | ハーフタイム化 or ブレイク、フィルは休符型 |
| 落ちサビ→大サビ | ↑↑↑ | 2小節ビルド（ロール＋密度漸増＋riser的クレッシェンド） |
| Last Chorus→Outro | ↓ | 下降フィルで解決、または連続crashで開放しフェード |

---

## 4. ダイナミクス（ベロシティ・ゴースト）

出典: [DRUM! ghost note lesson](https://drummagazine.com/lesson-ghost-note-style-and-placement/) / [Drum Beats Online ghost notes](https://drumbeatsonline.com/blog/ghost-notes-on-drums-what-they-are-and-how-to-play-them) / [MusicRadar ghost notes](https://www.musicradar.com/tuition/tech/how-to-add-groove-and-pace-to-a-beat-using-ghost-notes-625526)。

- **クレッシェンドカーブ**: ビルド系フィル/ロールは開始弱→終了強で線形〜指数上昇（例 `v45→115`）。EDM ロールは特に「非常に弱く始めて放出直前で最大」。
- **ゴーストノート**: スネアの弱打（目安 **v15–35**）。主打の間に置き「うねり・推進力」。フィルにも軽いゴーストを混ぜると人間味。ほぼスネア専用、まれにキック/タムに極弱。
- **アクセント設計**: フィル内は「拍頭 or 手数の変わり目」をアクセント（v100+）、間を通常/ゴーストに。着地の crash+kick は最大級（v115–127）。
- ヒューマナイズ: ベースライン v から ±ゆらぎでベタ打ちを回避（本ツールの feel 層と協調。フィルは feel 層の前＝骨格で音配置、velocity カーブはフィル型が持ち、微小 timing は feel 層で）。

---

## 5. ジャンル差

| ジャンル | フィル観 | 具体 |
|---|---|---|
| **J-pop/ボカロ** | 曲展開の記号として明確に。Aメロ控えめ→サビ前で必ず1小節フィル | タム下降/上昇＋crash 着地。落ちサビはハーフタイム/ブレイク。密度はサビで最大 |
| **ロック** | フィル多め・手数見せ場。4–8小節ごと | スネア16分連打、タム回し、クラッシュ多用。Bonham的「頭を食う」トリプレット |
| **ファンク** | 句内ゴースト＋短いリニア/シンコペを多発。大フィルは節目のみ | ゴースト密、16分の食い、スネアのバズ。空白も活用 |
| **EDM/ダンス** | **小節フィルは基本無し**。8/16小節周期のビルドアップ＋FX主体 | スネアロール（8分→16分→32分と倍化＋ピッチ上昇）、riser/uplifter、ドロップ直前の1拍ブレイク。生ドラムのタム回しはほぼ使わない（[Attack Mag](https://www.attackmagazine.com/technique/tutorials/10-snare-rolls-for-the-drop/) / [MusicRadar snare roll](https://www.musicradar.com/how-to/how-to-create-the-ultimate-snare-roll-build-up) / [EDMProd](https://www.edmprod.com/ultimate-guide-build-ups/)） |

**設計含意**: ジャンルは「フィル型の**選択確率**」と「フィル頻度既定」を切り替えるパラメータにする。EDM は fill エンジンを別モード（build/riser 生成）に分岐。

---

## 6. フィル型辞書 仕様（データ構造）

### 6.1 スキーマ（1型 = 1レコード）
```
FillType {
  id:            string        // 例 "fill.tom.desc.half"
  name:          string
  category:      "tomDesc"|"tomAsc"|"snareRoll"|"synco"|"rest"|"crashSetup"|"buildup"
  lengthCells:   2|4|8|16|32   // 16分セル数（半拍/1拍/半小節/1小節/2小節）
  startCell:     number        // 小節内の開始セル（着地は次小節cell0）
  grid: {                      // レーン→[ {cell, vel} ...]（velは0–127、カーブはcell順で表現）
    K:[], S:[], T1:[], T2:[], F:[], C:[], H:[], R:[]
  }
  landing:       "crashKick"|"crashOnly"|"rideKick"|"silent"  // 次小節頭の着地
  context: {                   // 適用文脈
    transitions: string[]      // 例 ["preChorus->chorus","verse->chorus"]
    energyDir:   "up"|"flat"|"down"
    genres:      string[]      // ["jpop","rock",...]（省略=汎用）
  }
  defaultFreqBars: number      // 何小節周期の候補か（8/16 等）
  intensity:     1..5          // 攻め度（ノブ既定の並べ替えキー）
}
```

### 6.2 適用ロジック（生成器への結線）
1. 遷移ペア（例 `preChorus->chorus`）と energy 方向を frame から得る。
2. `context.transitions` と `energyDir`・`genres` でフィルタ → 候補集合。
3. `intensity` 昇順で並べ、energy ノブ位置で選ぶ（既定 = 中央付近の控えめ）。
4. `lengthCells`/`startCell` で当該小節後方に配置、`grid` を GM ノートへ展開、velocity カーブ適用。
5. `landing` を次小節 cell0 に生成（crash+kick 等）。
6. feel 層（既存 applyFeel）で微小 timing/スイングを後段適用。フィル型自体は**クオンタイズ済みの音配置＋velocity**のみ持つ（責務分離＝メモリ「フィール層リファクタ」と整合）。

---

## 7. 代表フィル辞書（16分グリッド・テキスト譜）

> 表記: 各小節16セル、`|`=拍頭。着地は次小節側なので末尾に `→ C+K`（crash+kick）と注記。`X`アクセント/`x`通常/`o`ゴースト/`O`オープンHH/`.`休符/`-`不使用。velはカーブ注記。

### F01 `fill.snare.1beat`（1拍・スネア16分／turnaround・低リスク）
文脈: 4/8小節句の折返し, energy=flat/up, 全ジャンル汎用。freq=4–8。intensity=1。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
H  x . x . | x . x . | x . x . | . . . .    -
S  . . . . | . . . . | . . . . | x x x x    .   v70→95
K  x . . . | . . x . | x . . . | . . . .    X   →C+K
```

### F02 `fill.tom.desc.1beat`（1拍・タム下降／解決寄り）
文脈: chorus->verse, verse内折返し, energy=flat/down。freq=8。intensity=2。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
T1 . . . . | . . . . | . . . . | x x . .    -   v90
T2 . . . . | . . . . | . . . . | . . x .    -   v90
F  . . . . | . . . . | . . . . | . . . x    -   v95
S  . . . . | . . . . | . . . . | . . . .    .
K  x . . . | . . x . | x . . . | . . . .    X   →C+K
```

### F03 `fill.tom.asc.half`（半小節・タム上昇／サビへ放り込む）
文脈: verse->chorus, preChorus->chorus, energy=up。freq=8–16。intensity=3。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
F  . . . . | . . . . | x x . . | . . . .    -   v85
T2 . . . . | . . . . | . . x x | . . . .    -   v95
T1 . . . . | . . . . | . . . . | x x . .    -   v105
S  o . o . | o . o . | . . . . | . . X X    o=v25 / v110→120
K  x . . . | . . x . | . . . . | . . . .    X   →C+K
```

### F04 `fill.snareRoll.half`（半小節・スネア16分連打／ロック・ビルド）
文脈: preChorus->chorus, verse->chorus, energy=up, rock/jpop。freq=8–16。intensity=3。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
S  . . . . | . . . . | x x x x | x x x x    v55→118 (crescendo)
K  x . . . | . . x . | . . . . | . . . .    X   →C+K
```

### F05 `fill.tom.desc.1bar`（1小節・タム総下降／大遷移の解決）
文脈: chorus->interlude, chorus->verse2, energy=flat/down。freq=16。intensity=4。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
S  X x x x | . . . . | . . . . | . . . .    v100→80
T1 . . . . | x x x x | . . . . | . . . .    v95
T2 . . . . | . . . . | x x x x | . . . .    v95
F  . . . . | . . . . | . . . . | x x X X    v100→115
K  . . . . | . . . . | . . . . | . . . .    →C+K
```

### F06 `fill.tom.asc.1bar`（1小節・総上昇／大サビ手前の加速）
文脈: bridge->lastChorus, preChorus->chorus, energy=up。freq=16。intensity=4。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
F  X x x x | . . . . | . . . . | . . . .    v80→90
T2 . . . . | x x x x | . . . . | . . . .    v95
T1 . . . . | . . . . | x x x x | . . . .    v105
S  . . . . | . . . . | . . . . | x x X X    v110→122 (crescendo)
K  x . . . | . . . . | . . . . | . . . .    →C+K
```

### F07 `fill.synco.half`（半小節・シンコペ/リニア／ファンク）
文脈: funk 句境界, energy=flat, funk/fusion。freq=4–8。intensity=3。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
S  . o . x | . o . . | x . o x | . X o .    o=v25 x=v80 X=v105
T2 . . . . | . . . . | . . . . | x . . x    v90
K  x . . x | . . x . | . x . . | x . . .    X   →C+K
```
（リニア＝同一セルに複数レーンを重ねない「引っかかる」配置。ゴーストで推進力）

### F08 `fill.rest.setup`（休符型・空けるフィル／静かな遷移）
文脈: interlude->bridge(落ちサビ), chorus->quietVerse, energy=down。freq=16。intensity=1。着地=silent/crashのみ。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    x(弱) or 無
S  x . . . | . . . . | . . . . | . . . .    v90
K  x . . . | . . . . | . . . . | . . x .    v100  →(HHのみ/静)
```
（“叩かない”を語彙化。次セクションのダイナミクスを落とす合図。着地はcrash無しも可）

### F09 `fill.crashSetup.1beat`（クラッシュのみ遷移・最小）
文脈: intro->verse, section->section（軽）, energy=up/flat, 全ジャンル。freq=8。intensity=1。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X  (次頭crash)
H  x . x . | x . x . | x . x . | x . x .    -
S  . . . . | x . . . | . . . . | x . . .    v95
K  x . . . | . . x . | x . . . | . . x .    X  →C+K
```
（フィル本体ほぼ無し＝グルーヴ維持のまま crash 着地だけで節目を作る最小手段）

### F10 `build.snareRoll.2bar`（2小節・EDMビルドアップ／ドロップ手前）
文脈: build->drop, bridge->lastChorus(EDM/dance), energy=up↑↑。freq=8/16周期。intensity=5。着地=crashKick + ドロップ。
```
小節A   1 . . . |2 . . . |3 . . . |4 . . .
S  x . . . | x . . . | x . x . | x . x .        v40→70 (8分→点8分)
小節B   1 . . . |2 . . . |3 . . . |4 . . .    →ドロップ頭
S  x.x.x.x. | x.x.x.x. | xxxxxxxx | xxxxxxxx     16分→32分, v70→124
K  . . . . | . . . . | . . . . | . . . .        （ドロップ頭で C+K 復帰）
```
（生ドラムのタム回しでなく**倍化していくスネアロール＋クレッシェンド**。実装上は riser/uplifter FX とレイヤ想定。ピッチ上昇はサンプラー側／本ツールでは velocity カーブと密度倍化で近似）

### F11 `fill.snare.tom.16th.1bar`（1小節・スネア→タム混成／ロック定番）
文脈: verse->chorus, chorus->solo, energy=up, rock/jpop。freq=8–16。intensity=4。
```
        1 . . . |2 . . . |3 . . . |4 . . .    次小節
C  . . . . | . . . . | . . . . | . . . .    X
S  x x x x | x x . . | . . . . | x x . .    v80→100
T1 . . . . | . . x x | . . . . | . . . .    v100
T2 . . . . | . . . . | x x . . | . . . .    v100
F  . . . . | . . . . | . . x x | . . x x    v105→118
K  x . . . | . . . . | . . . . | . . . .    →C+K
```

### F12 `fill.halfTime.flip`（ハーフタイム化・遷移演出／落ちサビ）
文脈: interlude->bridge, chorus->breakdown, energy=down。フィルでなく拍配置の切替。
```
遷移小節(通常backbeat) 1 . . . |2 . . . |3 . . . |4 . . .
S  . . . . | x . . . | . . . . | x . . o        通常
↓ 次セクションから half-time:
S  . . . . | . . . . | X . . . | . . . .        3拍のみ(体感半分)
K  X . . . | . . x . | . . . . | . . x .        重心を落とす
H  x . x . | x . x . | x . x . | x . x .        HHは刻み維持 or ride
```
（型というより「次セクションの拍テンプレ切替」フラグ。遷移小節は F08 休符型やブレイクと併用）

---

## 8. 設計含意（生成器への落とし込み）

1. **フィルは骨格層のイベント**として生成し、velocity カーブは型が保持、微小 timing/スイングは既存 feel 層に委譲（責務分離＝メモリ「フィール層リファクタ」「フィール層」と整合）。
2. **frame から遷移ペア＋energy方向を受け取り**、`context` でフィルタ→`intensity`順に候補提示。「機械は候補まで」＝既定は控えめ（intensity 1–2）、energy ノブで攻め度を開放。
3. **既定頻度**は「16小節に大1・8小節に小1」。ジャンルで確率と頻度を切替。EDM は fill を build/riser モードへ分岐（生タム回しを抑制）。
4. **着地共通仕様**（次小節頭 crash+kick）を最優先で必ず生成。静かな遷移のみ `crashOnly`/`silent` に差し替え。
5. **6/8対応**: 本書の16分譜は4/4基準。6/8では1小節=12セル（付点4拍×2 or 8分×6）にグリッドを張り替え、タム回しは3連（トリプレット）分割で再サンプリングする（例: 半小節フィル=後半3拍分）。生成器の拍子スイッチと同じ分岐で処理。
6. **サンプルはバリエーションで**（メモリ「サンプルはバリエーション」）: 同一文脈でも複数 seed／複数型を出し、単一解を押し付けない。

---

## 9. 出典

### 教則・ドラマー分析（演奏実務）
- MusicRadar「Learn how drum fills work in 5 easy steps」 https://www.musicradar.com/tuition/tech/learn-how-drum-fills-work-in-5-easy-steps-639154
- The Pro Audio Files「8 Bars and a Fill: How to Program Better Drum Loops」 https://theproaudiofiles.com/phrasing/
- Rhythm Notes「How to Play the Best Drum Fills」 https://rhythmnotes.net/drum-fills/
- Drumeo Beat「7 Beginner Drum Fills (For Any Style)」 https://www.drumeo.com/beat/beginner-drum-fills/
- DRUM! Magazine「Perfecting Your Groove-To-Fill Transitions」 https://drummagazine.com/perfecting-your-groove-to-fill-transitions/
- DRUM! Magazine「Ghost Notes Style and Placement」 https://drummagazine.com/lesson-ghost-note-style-and-placement/
- Free Drum Lessons「Rock Fills Lesson 3 / Assorted Fills」 https://freedrumlessons.com/free-series/rock-fills/lesson-3.php
- Drum Beats Online「Ghost Notes on Drums」 https://drumbeatsonline.com/blog/ghost-notes-on-drums-what-they-are-and-how-to-play-them
- MusicRadar「Add groove and pace using ghost notes」 https://www.musicradar.com/tuition/tech/how-to-add-groove-and-pace-to-a-beat-using-ghost-notes-625526
- Grokipedia「Fill (music)」 https://grokipedia.com/page/Fill_(music)

### 編曲・セクション遷移
- Serato The Drop「Song Arrangement Tips for Beat Makers」 https://the-drop.serato.com/how-to/song-arrangement-tips-for-beat-makers/
- Point Blank「Understanding Song Structure: From Intro to Outro」 https://www.pointblankmusicschool.com/blog/understanding-song-structure-from-intro-to-outro/
- Avid「Arranging Music: Guide to Building Song Structure」 https://www.avid.com/resource-center/arranging-music-guide

### EDM ビルドアップ/スネアロール（生ドラムとの差）
- Attack Magazine「10 Snare Rolls For The Drop」 https://www.attackmagazine.com/technique/tutorials/10-snare-rolls-for-the-drop/
- MusicRadar「How to create the ultimate snare roll build-up」 https://www.musicradar.com/how-to/how-to-create-the-ultimate-snare-roll-build-up
- EDMProd「The Ultimate Guide to Build-Ups」 https://www.edmprod.com/ultimate-guide-build-ups/

### 学術研究（fill 検出・生成）
- Chandna et al.「Drum Fills Detection and Generation」Springer/CMMR 2021（RNNで前小節条件付きフィル生成＋客観指標＋ユーザ実験） https://link.springer.com/chapter/10.1007/978-3-030-70210-6_6 / https://www.researchgate.net/publication/349941407_Drum_Fills_Detection_and_Generation
- 「Generating Coherent Drum Accompaniment With Fills And Improvisations」arXiv:2209.00291（Transformer seq2seq、novelty関数でimprov位置予測、BERT型in-filling） https://arxiv.org/abs/2209.00291 / https://arxiv.org/pdf/2209.00291
- 「MaskBeat: Loopable Drum Beat Generation」arXiv:2507.03395 https://arxiv.org/pdf/2507.03395
- 「DARC: Drum Accompaniment Generation with Fine-Grained Rhythm Control」arXiv:2601.02357 https://arxiv.org/pdf/2601.02357
- Magenta Groove（約400のドラムグルーヴMIDI、GPT系finetuneの基盤データ）参照 arXiv:2301.01162 https://arxiv.org/pdf/2301.01162

> ライセンス注意: 市販MIDIグルーヴ集（EZdrummer/BFD/Splice等）の**リテラルなフィルは取り込まない**。本辞書は公開理論・統計・自作の抽象パターンのみで構成（プロジェクト方針＝他者コーパスからは統計のみ）。

---

## 10. 残タスク（次に繋ぐ）
- [ ] 本 doc を `docs/research/README.md` の索引に1行追加（本タスクは閲覧禁止制約のため未実施＝要フォロー）。
- [ ] 型辞書のデータ化（§6.1スキーマ→ TS/JSON）とテスト先行（型ID・length・grid→GMノート展開・着地生成の契約）。
- [ ] frame の遷移ペア＋energy 方向を fill セレクタへ結線（§6.2）。EDM build モード分岐。
- [ ] 6/8グリッド張替えの実装（§8-5）。
- [ ] 耳較正: 代表フィル F01–F12 を実音で試聴し velocity カーブ/着地の自然さを確認（メモリ「品質変更後は耳確認必須」）。
