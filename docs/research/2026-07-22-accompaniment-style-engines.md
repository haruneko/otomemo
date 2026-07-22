# 研究レポート：「コード名列→楽器らしい伴奏」を自動化してきた先行スタイル・エンジンのアーキテクチャ

調査日: 2026-07-22 / 対象: Otomemo（出先で雑にコードをメモ→楽器を選ぶとそれっぽく鳴る、を目指す。伴奏生成は決定的・LLM非依存が鉄則）
種別: **外部調査（実装ではない・コード不変）**。一次資料は Web 引用＋現行コード読取。推測と事実を分離する。
関連: 現行実装 `apps/api/src/music/generate.ts: genChordPattern`（パターン生成）＋ `apps/web/src/music.ts: resolveChordPattern`（実音化）＝**既に二層設計の萌芽**。

> **結論（先出し・5行）**
> 1. Band-in-a-Box・アレンジャーキーボード（Yamaha SFF/Korg/Roland）・MMA・impro-visor は**全部同じ骨格**＝「**固定パターン断片（度数×リズム×velのテンプレ）＋コード適応の変換規則（純関数）**」の二層。何十年もこの型で、ML生成は本流でない。
> 2. コード適応の芯は Yamaha の **NTR（Note Transposition Rule）／NTT（Note Transposition Table）**＝「音の相対関係を保つ（melodic=Root Trans）」か「近い音域に留める（chordal=Root Fixed）」か＋パート別の変換表。ベース/コード/メロで規則を変える＝これが「楽器別の差」の持ち方。
> 3. パターンは**データで持つ**（BiaB=1小節セル＋マスク、Yamaha=source MIDI＋CASM、MMA=テキストDSL）。バリエーション/フィルは**重み付き選択＋小節種別（A/B）＋マスク条件（コードタイプ・小節位置）**で切替。
> 4. Otomemo の現行 `chord_pattern` は既にこの型（`voicing.tones=度数`＋`hits=リズムグリッド`をデータで持ち、`resolveChordPattern` が進行に当てて実音化・つんのめり=コード先取りも実装済）。**移植すべき最小の芯は「パターン=1–2小節の度数×リズムテンプレ（データ）＋コード適応=純関数（NTR/NTT相当）」で妥当**と裏取りできた。
> 5. 既知の失敗＝「機械的に聞こえる（単純ランダム化は逆効果・BiaB談）」「継ぎ目/フィルのトリガ」「コード変化タイミングとパターンのずれ」。既知解は**重み付き選択＋人間らしい（非ランダムな）ゆらぎ＋アンティシペーション処理**。既定OFF=bit一致の原則とは、これらを全部「ノブ（既定0）」に落とせば両立する。

---

## 0. なぜこの調査か（プロダクト文脈）

Otomemo は「コードを雑にメモ→楽器を選ぶとそれっぽい演奏で鳴る」。この「**スタイル×楽器→演奏パターン**」の抽象化は、アレンジャーキーボード（1980s〜）や Band-in-a-Box（1990〜）が何十年もやってきた。車輪の再発明と、先行者が踏んだ罠の回避が目的。現状実装は `chord_pattern`＝block(strum)/arp のみ。

---

## 1. Band-in-a-Box（PG Music）— StyleMaker の MIDI スタイル機構

RealTracks（実演オーディオ）以前の**MIDI スタイル時代の設計**が Otomemo に直接効く。

### パターンの表現形式
- パターンは**常に1小節単位**で入力し、長い（2小節等の）パターンは **BAR MASK** で連結する（[PG Music Manual ch.13](https://www.pgmusic.com/manuals/bbm2020full/chapter13.htm)）。
- ドラムは専用画面で 16分グリッドのセルに **velocity（音量）数値**を打ち込む（0=無音）。「セルの数値＝そのセルが鳴るたびの velocity」（[StyleMaker Tutorial II](https://www.pgmusic.com/tutorial_stylemaker2.htm)）。
- 行の種別で **A パターン／B パターン／フィル／エンディング**を分けて保持。

### コード適応（変換規則）
- ベース/ピアノ/ギター等の**旋律・和声パターンは「どのコードでも動くように」**記録し、演奏時のコードへ適応させる。**Chord Type（コードタイプ）マスク**で「このリフは m7 のときだけ」等、**特定コード種にだけ使うパターン**を作れる（[StyleMaker Tutorial II](https://www.pgmusic.com/tutorial_stylemaker2.htm)）。＝コード種ごとにパターンプールを分岐。

### バリエーション/フィルの切替機構（マスク＋重み）
- **Weight（重み）**＝「他のパターンと比べて何%の確率で選ばれるか」。高い重み(9)は条件が合えばほぼ必ず、中(5)は揺らぎを持たせる（[Tutorial II](https://www.pgmusic.com/tutorial_stylemaker2.htm)）。
- **マスク（Masking）＝「いつそのパターンを鳴らすか」の条件群**：
  - Substyle マスク（A=Verse系/B=Chorus・Bridge系）
  - Bar マスク（「2小節中の1小節目」等の小節位置）
  - Post-fill マスク（フィル直後にだけ鳴らすアクセント）
  - Chord Type マスク（前述）
  - Beat/Interval マスク（拍位置・音程条件）
- フィルは自身が「A用か B用か」を持ち、フィル後の小節に post-fill パターンを差し込める。

### 楽器別の差の持ち方
- 楽器ごとに独立のパターンプール＋マスクを持つ。ドラムはセル/velocity、ベース/コード楽器はコード適応付きリフ。

### 失敗回避の知見
- 「**単純ランダム化はほとんど効果がない。人間はランダムにタイミングや音量を変えない**」——BiaB は素朴なランダムではなく、より構造的な humanize（フィール/テンポ/スイング量の変換、velocity を ±1 程度で微揺らし）を採る（[Manual ch.10](https://www.pgmusic.com/manuals/bbw2024full/chapter10.htm)）。**これは Otomemo の「機械的に聞こえない」設計の核心的教訓**。

---

## 2. アレンジャーキーボード（Yamaha SFF / Korg / Roland）— 二層設計の純血種

ここが**最も参考になる**。「固定 MIDI 断片＋コード適応変換」の二層が最も明快に分離されている。

### パターンの表現形式（source pattern）
- スタイルファイル＝**SMF（MIDI 実データ）＋ CASM（スタイル・パラメータ）**の2部構成（[jososoft: Style CASM](http://www.jososoft.dk/yamaha/articles/style2_2.htm)）。
- 各パートのフレーズ（source pattern）は**特定の「ソースコード」上で録音**される。既定は **CM7（Source Root=C・Source Chord=Maj7）**。＝「C の Maj7 で鳴る 1〜数小節の MIDI 断片」をテンプレとして持つ（[PSR-SX900 RM](https://data.yamaha.com/files/download/other_assets/7/1279207/psrsx900_en_rm_b0.pdf)）。
- 録音時の作法：Chord/Pad チャンネルは**コードトーンのみ（C,E,G,B）**、旋律系は C Ionian（ただし避ける音＝9th の D 等）で書く。＝「素材はコードトーン中心の断片」という縛りで適応を綺麗にする。

### コード適応（変換規則）＝ NTR / NTT
演奏時、ユーザーが弾いたコードに合わせて source pattern を変換する。パート別・セクション別に設定：

**NTR（Note Transposition Rule）＝どう動かすか**
- **ROOT TRANS**：音同士の**音程関係を保って**移調。例：C の C3-E3-G3 は F では F3-A3-C4。＝**旋律的パート（メロ・ベース）向け**。
- **ROOT FIXED**：**近い音域に留める**。例：C3-E3-G3 は F では C3-F3-A3。＝**和声的パート（コンピング）向け**（音が飛び跳ねない）。
- **GUITAR**（SFF2）：ギター特化（ALL-PURPOSE / STROKE / ARPEGGIO の表）＝ストロークやアルペジオの弦配置を再現。

**NTT（Note Transposition Table）＝どの変換表を使うか**
- BYPASS（無変換）/ MELODY / CHORD / BASS / MELODIC MINOR / HARMONIC MINOR 等。
- MELODY＝フレーズ用、CHORD＝ピアノ/ギターのコンピング用、BASS＝ベースライン用。＝**同じ「コード適応」でもパート＝楽器の役割ごとに remap 規則を切り替える**（[PSR-8000 Owner's Manual p.71](https://www.manualslib.com/manual/196909/Yamaha-Portatone-Psr-8000.html?page=71)、[前掲検索での NTR/NTT 説明]）。

**補助パラメータ**
- Note Limit（Low/High）＝適応後に鳴る音域をクランプ（音が上/下に暴れない）。
- Source Root / Source Chord＝素材が何のコードで録られたかの宣言（差分計算の基準）。
- Retrigger Rule（RTR）＝コードが変わった瞬間、既に鳴っている音を「止める/そのまま/ピッチシフト/再発音」どうするか＝**継ぎ目処理**。

### バリエーション/フィルの切替機構
- セクション＝**Intro / Main A・B・C・D / Fill / Ending**（[jjazzlab: Extended Yamaha styles](https://jjazzlab.gitbook.io/user-guide/rhythm-engines/yamjjazz-rhythm-engine/extended-yamaha-styles)）。Main A→B の切替や Fill はユーザー操作（ボタン）or 自動でトリガ。各セクションが独立の source pattern 群を持つ。

### 楽器別の差の持ち方
- パート（=MIDIチャンネル）ごとに source pattern ＋ NTR/NTT ＋ Note Limit を独立設定。**「楽器ごとに変換規則を変える」がスタイルの中核**。

---

## 3. Logic Session Player / Ableton — 近年の MIDI ツールのパラメータUI

パターン記述形式より**ユーザーに見せる軸の切り方**が参考になる。

### Logic Pro 11 Session Players（Bass Player / Keyboard Player）
- 中身は**普通の MIDI シーケンス**（region を Piano Roll で開いて編集できる）。決定的生成＋人手編集の両立（[Sound on Sound: Session Players](https://www.soundonsound.com/techniques/logic-pro-session-players)、[Apple Support](https://support.apple.com/en-bh/guide/logicpro/lgcp74b34026/mac)）。
- パラメータは旧 Drummer の XY パッドを **2軸スライダ**へ：
  - **Complexity（複雑さ）**＝どれだけ音数が多い/busy か。Bass では低いとほぼルート弾き、上げると音が増える。
  - **Intensity（強さ）**＝どれだけ強く弾くか（velocity 帯）。
- Bass：奏法（upright/picked/fingered）選択、**Fill Amount / Complexity** でフィル頻度と複雑さ、ドラムに「follow（追従）」させられる。
- Keyboard：**左手/右手の ON/OFF**、鍵盤上の**手の配置（低域/高域レンジ）**、Complexity/Intensity、リズムを別トラック（通常 Drummer）に追従。

**含意**：Otomemo のノブは「複雑さ（音数/密度）」「強さ（velocity帯）」「フィル量」「ドラム追従」の少数軸に集約するのが枯れた設計。左手/右手・レンジ配置も「楽器らしさ」を安く出す軸。

### Chord adaptation の考え方は共通（コードトラックに追従）で、パターンの表現は非公開だが「MIDI region 化していつでも手編集」＝**生成物は確定 MIDI、規則は隠す**というプロダクト設計は Otomemo（候補まで機械・仕上げは人間）と一致。

---

## 4. オープンソース — パターン記述形式（テキスト DSL）

### MMA（Musical MIDI Accompaniment）
純テキスト DSL でパターンを定義。**「拍位置×長さ×velocity（×度数）」の並び**が語彙（[Mellowood: Patterns ref](https://www.mellowood.ca/mma/online-docs/html/ref/node4.html)、[Tracks and Channels](https://mellowood.ca/mma/online-docs/html/ref/node3.html)）。

- **Chord パターン**：`Chord Define <名前> <位置> <長さ> <vol1> <vol2> ...; ...`
  - 例：`Chord Define Straight4 1 4 100 ; 2 4 90 ; 3 4 100 ; 4 4 90`
  - 位置＝拍（1,2,2.5,…）、長さ＝音価（4=四分,8=八分,16,…、`4+8`で連結）、vol＝各コード構成音の velocity（0=その音を消す、声部別に列挙可、足りなければ最後の値を反復）。
- **Bass パターン**：`Bass Define <名前> <位置> <長さ> <度数> <vol>; ...`
  - 例：`Bass Define Broken8 1 8 1 90 ; 2 8 5 80 ; 3 8 3 90 ; 4 8 1+ 80`
  - 度数＝コード/スケールの度数（1=ルート,3=3rd,5=5th…、`1+`で1オクターブ上/`-`で下）。＝**コード適応は「度数で書く」ことで自動化**（実音は演奏時のコードから引く）。
- **Arpeggio / Walk / Scale** トラックも同型（位置×長さ×vol）で、どのコード音を鳴らすかはトラック種別のロジックが決める。
- **Groove**＝複数トラックのパターン＋音色＋音量等を束ねた名前付きプリセット（マクロ）。1行 `Groove Rhumba` でスタイル総体を切替（[MMA Grooves essay](https://www.mellowood.ca/music/essays/mma/mma-groove.html)）。＝**「スタイル＝Groove」「バリエーション＝別 Groove へ切替」**という単純明快な機構。

### impro-visor（Harvey Mudd, Bob Keller）
- accompaniment を **Bass / Chord / Drums の3バンド**のスプレッドシートで持ち、各列＝1つの style pattern（[Style Editor Tutorial PDF](https://www.cs.hmc.edu/~keller/jazz/improvisor/StyleEditorTutorial.pdf)、[Impro-Visor](https://www.cs.hmc.edu/~keller/jazz/improvisor/)）。
- **リズム記法**＝旋律記法と同系のテキスト。例：スイングのライドは `x4 x8 x8 x4 x8 x8`（x4=四分ヒット,x8=八分ヒット）。スラッシュ＋`NC`（no-chord）でヒット/ブレイクを表現。
- **スイング**は数値パラメータ（例 .67 ＝ 拍を .67+.33 に分割）で自動レンダ。
- Bass は**音カテゴリ・コーディング（文法的記法）**で確率的にベースラインを生成。
- **コードボイシング**は「事前設計 voicing ＋（無ければ）アルゴリズム生成」で、**音域に収まり前 voicing から voice-leading する**ものを選ぶ（[Tutorial](https://www.cs.hmc.edu/~keller/jazz/improvisor/ImproVisorTutorial4.htm)）。＝voicing 選択に voice-leading を効かせるのは Otomemo の将来拡張候補。

---

## 5. 横並び比較表（4観点）

| システム | パターンの表現形式 | コード適応（変換規則） | バリエーション/フィルの切替 | 楽器別の差の持ち方 |
|---|---|---|---|---|
| **Band-in-a-Box (MIDIスタイル)** | 1小節セル（16分グリッド）＋velocity。長パターンはBAR MASKで連結。データ（.STY） | パターンをコード非依存に記録＋**Chord Type マスク**でコード種別プールに分岐。演奏時に当該コードへ適応 | **重み（%）＋マスク**（Substyle A/B・Bar位置・Post-fill・Beat/Interval）。フィルはA/B属性を持つ | 楽器ごとに独立パターンプール＋マスク。ドラムはセル/vel、ベース/コードは適応付きリフ |
| **Yamaha SFF / アレンジャー** | **source pattern＝ソースコード(CM7)上のMIDI断片**（SMF）＋CASMパラメータ。データ | **NTR**（Root Trans=音程保持/Root Fixed=音域保持/Guitar）×**NTT**（Melody/Chord/Bass/…表）＝二層の純変換。Note Limitでクランプ、RTRで継ぎ目処理 | **セクション**（Intro/Main A–D/Fill/Ending）を持ち、ボタン/自動でトリガ。各セクション独立パターン | **パート(MIDI ch)別に source pattern＋NTR/NTT＋Note Limit** を独立設定。これが中核 |
| **Logic Session Player** | 生成物は**確定MIDI region**（手編集可）。内部パターンは非公開 | コードトラックに追従（規則は隠蔽） | **Complexity/Intensity 2軸＋Fill Amount**、ドラムへfollow。奏法プリセット | 楽器ごとにプレイヤー（Bass/Keyboard）＋固有軸（左右手・レンジ・奏法） |
| **MMA (OSS)** | **テキストDSL**：`位置 長さ vol`（Chord）/ `位置 長さ 度数 vol`（Bass）。度数で書きコード適応を自動化 | **度数記法＝実音は演奏時コードから解決**（Chord/Bass/Arpeggio/Walk/Scaleのトラック種別ロジック） | **Groove**（トラック束の名前付きプリセット）を1行で切替＝スタイル/バリエーション | トラック種別（Drum/Chord/Bass/Arpeggio/Walk/…）＋トラックごとのパターン |
| **impro-visor (OSS)** | Bass/Chord/Drumの3バンド×列＝patternのスプレッドシート。リズムは `x4 x8` 記法、スイングは数値 | Chord＝**事前voicing＋アルゴ生成**（音域内＆voice-leading選択）。Bassは音カテゴリで確率生成 | style（列集合）切替。NC/スラッシュでヒット/ブレイク | バンド（Bass/Chord/Drum）ごとに記法・生成ロジックを分ける |

**共通の骨格**：どれも「**（1）度数 or コードトーン中心で書かれた固定リズム・パターン**」＋「**（2）演奏コードへ当てる適応変換**」＋「**（3）小節種別/重み/条件マスクで切替**」＋「**（4）楽器＝役割ごとにパターンと変換規則を分ける**」の4点セット。ML生成ではなく**データ＋純変換規則**が本流。

---

## 6. 既知の失敗パターンと既知解（§5の観点別に）

1. **機械的に聞こえる**：素朴なランダム化は逆効果（「人間はランダムにタイミング/音量を変えない」BiaB）。既知解＝**構造的な humanize**（微小 velocity 揺らぎ±数%・小さなタイミングずれ・重み付きの選択で毎小節を微妙に変える）。単純repeatが最悪。
2. **パターン切替の継ぎ目**：セクション/フィルの境目、鳴っている音の後処理。既知解＝Yamaha **RTR（Retrigger Rule）**＝コード変化時に既発音を「止める/保持/ピッチシフト/再発音」から選ぶ。フィルは境目を埋めるための機構そのもの。
3. **コード変化タイミングとパターンのずれ**：裏拍で弾き出しダウンビートを跨ぐ音が、跨いだ先のコードで解決すべき問題（アンティシペーション/つんのめり）。既知解＝**「音の終わる方の拍でコードを決める」**＝シンコペ分コードを先取り。**Otomemo は `resolveChordPattern` で既に実装済**（下記）。
4. **適応で音が暴れる**：移調で音域が飛ぶ。既知解＝Root Fixed（音域保持）＋ Note Limit クランプ。
5. **どのコード音を残すか**：source をコードトーン中心で書く縛り＋NTT で remap。テンション（9th の D 等）は素材から除外し暴発を防ぐ。

---

## 7. 設計含意 — Otomemo に移植する最小の芯

### 7.1 現行コードは既にこの型（裏取り）
`apps/api/src/music/generate.ts: genChordPattern` は content にパターンだけを持つ：
```
{ mode: "arp"|"strum",
  voicing: { tones: ["R","3","5"], openClose: "close", octave: 0 },  // ←度数 = NTT相当
  steps, hits: [{ step, dur, (vel) }] }                                // ←リズムグリッド
```
実音化は `apps/web/src/music.ts: resolveChordPattern`（純関数）が**進行に当てて**行う：`voiceChord(root,quality,voicing)` で度数→実音、arp方向/オクターブ、分数コード（オンベース）、**アンティシペーション＝コード先取り**（§6-3）を処理。

→ **これは Yamaha の「source pattern（度数テンプレ）＋ NTR/NTT（resolveChordPattern）」の二層とほぼ同型**。つまり移植する骨格は既に正しい。証拠：`resolveChordPattern` の refBeat 計算（跨ぐ音は nextBeat のコードで解決）＝つんのめりの既知解が入っている。

### 7.2 最小の芯（妥当と確認）
> **パターン ＝ 1–2小節の「度数（or コードトーン参照）×リズム×vel」テンプレ（データ）**
> **＋ コード適応 ＝ 度数→実音の純関数（NTR/NTT 相当・進行と楽器役割を引数に取る）**
この骨格で妥当。BiaB/Yamaha/MMA/impro-visor 全部この形。Otomemo は既にこの形なので、拡張は「テンプレを増やす」「変換規則の表現力を上げる」の2方向。

### 7.3 データで持つ / コードで持つ の判断材料
- **データで持つべき**＝スタイルの中身：パターン（hits＝拍位置×長さ×vel）、voicing の度数構成、楽器×スタイルの対応、フィル素材。理由＝増やすのに再ビルド不要・非エンジニアでも足せる・先行者は全員データ（.STY/SFF/DSL）で持つ。→ 将来は**パターンを JSON/DSL のライブラリ化**（MMA の `位置 長さ 度数 vol` 語彙がそのまま使える）。
- **コードで持つべき**＝変換規則（純関数）：度数→実音、voice-leading、Root Trans/Fixed 相当の音域制御、Note Limit クランプ、アンティシペーション、分数コード。理由＝正しさが1つに定まり全パターン共通・テストで固定できる（＝TDD 対象）。現状 `resolveChordPattern` が該当。
- **楽器別の差**＝Yamaha の「パート別 NTR/NTT」に倣い、**役割（bass/chord-comp/arp/pad/stab）ごとに (a) パターンプール (b) 変換モード**を分ける。現行 `gen_section_inst` の pad/stab 分岐がその萌芽。

### 7.4 バリエーション/ノブの切り方
- Logic 流の**少数軸**が枯れている：`複雑さ（音数/密度）`・`強さ（velocity帯）`・`フィル量`・`ドラム追従`。現行 `densityBias`（mood/tempo→sparse/busy）はこの「複雑さ」軸の原型。
- 切替機構は MMA の **Groove（束の切替）** が最小。BiaB の重み付き選択＋マスクは表現力は高いが複雑＝**段階導入**（まず Groove 相当、後で重み/マスク）。

### 7.5 「既定OFF=bit一致」原則との整合
- humanize（velocity 揺らぎ・微タイミング）・フィル・追加バリエーションは**すべてノブ（既定0/OFF）**に落とせば、既定出力は現行と bit 一致を保てる（既存 `rhythmicContrast` 等と同じ作法）。
- **重要な罠回避**：humanize は「単純ランダム」を既定で入れない（BiaB 教訓＝逆効果）。入れるとしても決定的 seed 由来の**構造的**揺らぎに限る（LLM非依存・再現性維持）。
- RTR（継ぎ目処理）や NTT の表切替を足す場合も、**既定＝現行の挙動**を選ぶ enum 値を用意して bit 一致を守る。

---

## 出典（URL）
- Band-in-a-Box Manual ch.13（スタイル/パターン/マスク）: https://www.pgmusic.com/manuals/bbm2020full/chapter13.htm
- Band-in-a-Box StyleMaker Tutorial II（重み・Chord Typeマスク・velocityセル）: https://www.pgmusic.com/tutorial_stylemaker2.htm
- Band-in-a-Box StyleMaker Tutorial I: https://www.pgmusic.com/tutorial_stylemaker1.htm
- Band-in-a-Box Manual ch.10（humanize＝単純ランダム化は逆効果）: https://www.pgmusic.com/manuals/bbw2024full/chapter10.htm
- Band in a Box Wiki: Styles: https://bandinabox.fandom.com/wiki/Styles
- jososoft: Yamaha Style CASM Section Format: http://www.jososoft.dk/yamaha/articles/style2_2.htm （及び casm_1/casm_2）
- Yamaha PSR-SX900/SX700 Reference Manual（NTR/NTT/CASM/source chord）: https://data.yamaha.com/files/download/other_assets/7/1279207/psrsx900_en_rm_b0.pdf
- Yamaha PSR-8000 Owner's Manual p.71（Source Root/Chord・NTR/NTT）: https://www.manualslib.com/manual/196909/Yamaha-Portatone-Psr-8000.html?page=71
- Peter Wierzba / M. Bedesem: Style Files – Introduction and Details: https://wierzba.hier-im-netz.de/stylefiles_v101.pdf
- JJazzLab: Extended Yamaha styles（CASM/SINT/source phrases・セクション）: https://jjazzlab.gitbook.io/user-guide/rhythm-engines/yamjjazz-rhythm-engine/extended-yamaha-styles
- Logic Pro Session Players（Sound on Sound）: https://www.soundonsound.com/techniques/logic-pro-session-players
- Apple Support: Edit a Session Player performance: https://support.apple.com/en-bh/guide/logicpro/lgcp74b34026/mac
- MMA Patterns Reference: https://www.mellowood.ca/mma/online-docs/html/ref/node4.html
- MMA Tracks and Channels: https://mellowood.ca/mma/online-docs/html/ref/node3.html
- MMA Grooves essay: https://www.mellowood.ca/music/essays/mma/mma-groove.html
- Impro-Visor Style Editor Tutorial（PDF）: https://www.cs.hmc.edu/~keller/jazz/improvisor/StyleEditorTutorial.pdf
- Impro-Visor Tutorial 4（voicing/リズム記法）: https://www.cs.hmc.edu/~keller/jazz/improvisor/ImproVisorTutorial4.htm
- Impro-Visor project: https://www.cs.hmc.edu/~keller/jazz/improvisor/
