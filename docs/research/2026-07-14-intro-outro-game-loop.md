# イントロ/アウトロ類型 ＋ ゲームBGMシームレスループ設計

- 作成: 2026-07-14
- 種別: research（設計含意つき仕様化）
- 目的: 本ツールに欠けている「ループ曲（ゲームBGM）の構造・境界設計」の知識を仕様化し、セクション列＋MIDI書き出しモデルへ落とす。
- 対象読者: 本人（J-pop/ボカロ/**ゲーム音楽**）＋実装エージェント。
- 思想整合: 「機械は候補まで、仕上げは人間」。本docは**テンプレ表＋チェックリスト＋データ表現案**を提供し、最終の継ぎ目調整は人間の耳に委ねる。

---

## 0. TL;DR（結論先出し）

- **ゲームBGMは「イントロ→ループ本体」（intro-then-loop）が最頻**。イントロは1回だけ、ループ本体が延々と回る。全体ループ・AB交互はその変種。
- **ループ本体の快適尺は「30〜50秒/16小節」を核に、実運用は概ね 1分未満〜2:30**。文脈で伸縮（フィールド長め・戦闘は短く手数多め・街は中庸）。
- **継ぎ目を消す条件は4層＝和声・旋律（声部連結）・リズム/フィル・テール（余韻の重なり）**。「ループ頭＝トニックで終止」は義務ではなく、**ドミナントや借用和音で終わって頭に解決する循環設計**が“回り続ける感”を作る定石。
- **技術は「ループポイントはサンプル精度」「テールはループ末尾より後ろに書き出して頭へ重ねる」**が肝。RPGツクール系は `LOOPSTART`/`LOOPLENGTH`（サンプル値）、Wwise/FMODは entry/exit cue と transition timeline で余韻を跨がせる。
- **データ表現案**: セクション列に `loopStart`/`loopEnd` マーカー＋`sectionRole`（intro/loopBody/outro/transition）＋`tailBars`（テール尺）＋`boundaryCadence`（境界和声の意図）を持たせる。イントロ/アウトロは `playOnce` フラグでループ外に置く。

---

## 1. イントロの類型

### 1.1 型の一覧

| 型 | 説明 | 典型尺 | ジャンル傾向 |
|---|---|---|---|
| リフ先行型 | 短い反復フィギュア（ギター/シンセ/ベースリフ）を提示。曲の“顔”。 | 4〜8小節 | ロック/ゲーム戦闘/アクション |
| サビ頭サンプル型（曲頭サビ） | 本編のフック（サビの一節）を単独で先出しし、後に本編で回収。 | 2〜8小節 | J-pop/ボカロ/現代ヒット（掴み前倒し） |
| アトモス型（テクスチャ/コールドオープン） | リバーブ深いパッド・環境音・トーンクラスタが漂い、拍が曖昧なまま没入を作る。 | 4〜16小節（可変・自由尺可） | 映画音楽/RPGフィールド/タイトル/アンビエント |
| カウント/ピックアップ型 | ドラムのカウントイン、または弱起（アウフタクト）で本編へ雪崩れ込む。 | 1〜4小節（半端尺あり） | ジャズ/バンド/EDMのビルド |
| ビルドアップ型 | フィルタ開き・ライザー・スネアロールで緊張を溜めてドロップへ。 | 8〜16小節 | EDM/ダンス系 |

### 1.2 長さの分布とジャンル差

- **標準は 4〜8小節**。複雑な曲や叙事的構成では 16小節（例: "Stairway to Heaven" の16小節イントロ）。（出典: allaboutsongwriting / makingmusic）
- **現代ストリーミング圧**: 「30秒ルール（30秒未満は印税が出ない）」と「7秒ルール」で、ヒット曲はボーカルインを前倒し。旧来のロング・アトモス開幕は短縮傾向。→ **本ツールの J-pop/ボカロ生成は“掴み前倒し”を選べると良い**。（出典: allaboutsongwriting）
- **ゲームBGM特有**: ゲームは「イントロは初回だけ、以後ループ本体」。**イントロ長は“ゲーム的間”を許容**（フィールド/タイトルは長め、戦闘は即入り）。JRPG分析では「イントロを持つのは一部の曲だけ（10曲中4曲）」＝**多くのループ曲はイントロ無しでいきなり本体**という実態もある。（出典: drumchant JRPG Song Forms）

### 1.3 設計含意

- 生成側は **`introType` を候補として複数出す**（リフ/曲頭サビ/アトモス/ピックアップ）。単一に決めない（サンプルはバリエーション原則）。
- ゲームBGMモードでは **「イントロ無し（本体直入り）」も第一級の選択肢**として提示する。

---

## 2. アウトロの類型

| 型 | 説明 | 使いどころ | ループ曲での可否 |
|---|---|---|---|
| フェードアウト | 短い区間（多くはサビ）を反復しフェーダーで減衰。名残・余韻。 | ノスタルジックpop/ラジオ向け。DJが被せられる。 | ループ曲では**不要**（ループは終わらせない）。ただし「ゲーム内で状況が変わったらフェードして次曲へ」の遷移手段になる。 |
| タグ反復型 | 最重要フレーズ（タグ）を2〜3回反復して刷り込む。 | サビ後の締め。J-pop常套。 | ループの“擬似アウトロ”として使える。 |
| サビ再現型（リプライズ） | 主題を最後にもう一度提示して回収。 | 叙事的/劇伴。 | 全体ループの最終セクションとして機能。 |
| 楽器ソロ/デコンストラクション | ソロで締める、または楽器が一つずつ抜けて減っていく。 | ジャズ/バンド/アンビエント。 | 抜き差し＝縦のインタラクティブと親和。 |
| カットエンド（コールドエンド） | 全楽器が同期して最終音を切り、無音へ。強い解決感・リプレイ欲を残す。 | エネルギーのピークで終わる曲。 | **非ループ曲の締め**。イベント確定/勝利ジングルに。 |
| リタルダンド | BPMを落としながら減衰、多くはコールドエンドへ着地。 | ドラマチックな幕引き。 | エンディング/ボス撃破後など。 |
| ブックエンド | イントロを終盤で呼び戻し、対称に閉じる。 | 構成美。 | 全体ループの頭↔尾を繋ぐ設計と好相性。 |

（出典: eathealthy365 / wisseloord / guitarwiz / Wikipedia: Conclusion(music)）

### 設計含意
- **ループ曲は原則アウトロを持たない**。アウトロは「非ループ（1回再生）曲＝ジングル/イベント/エンディング」用、または「遷移でフェードして次へ渡す」用。
- 本ツールは **`outroType` を“非ループ曲のとき”に提示**し、ループ曲では抑制する（分岐で出し分け）。

---

## 3. ループBGMの構造

### 3.1 3つの基本形

1. **intro-then-loop（イントロ→ループ本体）**: 最頻。イントロは1回、本体（melody）が反復。作曲実務では**イントロ track と melody track を分離**し、イントロは1回・melodyを回す。（出典: makeuseof / tobyellis）
2. **全体ループ**: 曲全体（頭〜尾）がそのまま循環。イントロ相当を持たず、末尾→頭が直接繋がる。短いフィールド曲・アンビエントに多い。
3. **AB交互（複数セクション・resequencing）**: A→B→A→B… や状況で分岐。横のインタラクティブ（後述5章）の入口。

### 3.2 ループ本体の典型尺（飽きの観点）

- JRPG実測（10曲分析）: **主題は概ね 30〜50秒／16小節**。**約半数がループ長1分未満、残り半数が1:30〜2:30**。（出典: drumchant）
- 形式内訳: 約半数が**三部（AAB系）**。Kikuta は「Aに変化を付けないAAB」も。4等分ループ（例 "Anxious Hearts"）、2セクションだが句構造を複雑化（例 "Sending A Dream…"）など。**10曲中8曲がオスティナート常駐**＝ループ中の和声安定を担保。（出典: drumchant）
- 飽き対策の作曲技法（Winnifred Phillips 5技法）: **Perpetual Development（原型からの連続変形）／Compositional Dynamics（運動感）／Succession of Variations（主題の変奏連鎖）／Repeating Figures（単一構造要素での構築）／Slow Textures（緩叙なクラスタの明滅）**。反復の“飽き”を、変奏・運動・テクスチャで殺す。（出典: makeuseof, W. Phillips "A Composer's Guide to Game Music"）

### 3.3 文脈別の慣習（日本のゲーム音楽の伝統）

- **すぎやまこういち（ドラクエ）**: RPG BGMの“8曲テンプレ”を確立＝**タイトル/城/街/フィールド（序曲）/ダンジョン/戦闘/ボス/エピローグ**。この「eight melodies」型が以後のRPGの標準に。フィールド曲は序曲的に堂々、ループ前提でも一曲の完結感を持たせるクラシカル志向。（出典: mtosmt Faxanadu論文の系譜言及）
- **植松伸夫（FF）**: 戦闘曲は**世代が進むほど長尺化**（FF6/7/8で顕著に増）。'Tifa's Theme' はループ回帰を **II→I** で処理（旋律はV音に強く寄る＝解決予期を作る）。（出典: videogamemusicnerd / drumchant）
- **文脈別ざっくり慣習**:
  - **フィールド/街**: 長め（1〜2分ループ）・和声豊か・オスティナート土台・叙情。滞在時間が長いので飽き対策を厚く。
  - **戦闘**: 短め・手数多い・推進力（速い和声リズム/ドライブ）。回転が速いので**継ぎ目の“食いつき”が命**（末尾フィル→頭で加速感）。
  - **ダンジョン/街の一部**: アンビエント寄り・2セクション・テクスチャ主体・拍を曖昧に。

### 3.4 設計含意
- ループ本体の**推奨尺プリセット**を文脈で持つ: field=`16〜32bar`, battle=`8〜16bar`, town=`16bar`, ambient=`任意（自由尺）`。
- 本ツールはセクション列なので、**「どのセクション範囲がループ本体か」を明示するマーカー**が必須（6章のデータ案）。

---

## 4. ループ境界の音楽的制約（継ぎ目を聞かせない条件）

「継ぎ目が聞こえる」原因は**和声・旋律・リズム・テール（余韻）**の4層いずれかの不連続。各層の制約:

### 4.1 和声（Harmony）
- **ループ頭＝トニック終止は義務ではない**。むしろ“回り続ける感”を作るには **末尾で完全な終止（PAC）を避ける**のが定石。
- **循環設計**: 末尾を**ドミナント（V）や借用和音で開いて宙づり**にし、ループ頭のトニックへ解決させる＝末尾と頭が和声的に噛み合い、切れ目が消える。
  - 例: 'Tifa's Theme' は **II→I** で頭に戻す（旋律はV音に寄せて解決欲を作る）。'Fond Memories' は **bVII→VI7→トニック** の色付き経路で戻す。（出典: drumchant）
- **オスティナート/ペダル**で境界をまたいで低音・音型を継続させると、和声が変わっても“地”が切れない（JRPG 10曲中8曲）。
- **転調のある曲**: 転調したまま末尾に達すると頭（原調）と衝突する。対策=**(a) ループ本体は転調を含めず、転調は非ループのブリッジ/イントロ側に置く**、**(b) ループ末尾に“戻り転調（原調へのピボット）”を1〜2小節仕込む**、**(c) 転調後の調で完結する別ループにresequenceする（横遷移）**。

### 4.2 旋律の声部連結（Voice-leading）
- **ループ末尾音 → ループ頭音の音程を意図的に設計**する。跳躍が大きすぎると継ぎ目が立つ。基本は**近接（同度/2度/3度）か、和声的に自然な導音→主音**。
- 末尾を**アウフタクト（弱起）で頭へ雪崩れ込ませる**と、旋律的推進が切れ目を隠す（=ピックアップ型の応用）。
- 末尾で旋律を**休符にして頭の入りを立てる**手も（旋律の谷で継ぐ）。ただしリズム層（下記）が継続していること。

### 4.3 リズム（Rhythm/Fill）
- **末尾フィルで橋渡し**: ドラム/パーカスの短いフィルが末尾→頭の“助走”になり、拍の連続感で継ぎ目を消す（戦闘曲で特に有効）。
- **拍・小節線を揃える**: セクションの入りは「四角く・拍頭」が基本（JRPG実測でほぼ全曲がそう）。ループ長は**小節の整数倍**にする（半端拍で終わらせない）。（出典: drumchant）
- **一定のグルーヴ/シャッフルを跨がせる**: フィール層（スイング等）が境界で途切れないこと（本ツールは applyFeel を非破壊層に持つ＝境界でも一貫適用できる）。

### 4.4 テール（余韻の重なり）
- **リバーブ/ディレイの尾は境界で切れると“プツッ”と聞こえる**。対策=**ループ末尾より後ろまで余韻を鳴らして録り、その尾をループ頭に重ねる**（クロスフェード/テール貼り付け）。
- DAW実務: 末尾数秒（余韻含む）を別トラックに複製し**頭へ移動して重ねる**。中間ファイルではなく“テールを別に書き出して頭に足す”のが要点。（出典: makeuseof）
- ミドルウェアなら音声本体は素の尺で、**テールは entry/exit cue（Wwise）/transition timeline（FMOD）**にオフロードできる（4章技術面参照）。

---

## 5. 技術面（サンプル精度ループ・テール・MIDI・エンジン慣習）

### 5.1 サンプル精度ループ
- ループポイントは**サンプル単位**で合わせる。数サンプルのズレでクリック/ギャップが出る。
- **WAV推奨**。MP3は**先頭にエンコーダ由来の無音パディングが入る**ため境界にギャップが出やすい。OGG/Opus/WAVを使う。（出典: 各forum, oreilly Game Audio）

### 5.2 テール重なり（tail overlap）
- **手法A（焼き込み）**: ループ末尾の余韻をループ頭に貼って音声ファイルに焼く（DAWで完結）。
- **手法B（ミドルウェア）**: FMOD の Loop Region に **Transition Timeline** を足すと、post-exit（余韻）を再生しつつループできる（素の start/end だけだと余韻を失い“真にシームレス”にならない）。（出典: synchrnzr FMOD 201）
- **Wwise 2023.1.17+**: テールを音声に焼かず、**尾付きで書き出してWwiseに entry/exit cue を処理させられる**。（出典: itch.io game audio thread）

### 5.3 MIDIレベルの設計（本ツールに直結）
- **境界をまたぐノート**: ループ末尾を跨ぐ持続ノート（ロングトーン/ペダル）は、**(a) ループ頭でも同じノートを鳴らし直す**か、**(b) 末尾でリリースして頭で入り直す**かを明示。跨ぎっぱなしはMIDIループでは表現できない（ノートオフが迷子になる）。
- **CC/ピッチベンドの状態**: 境界でCC（サステインペダル、モジュレーション、ボリューム）が中途半端だと頭で音が濁る。**ループ頭でCCをリセット/再設定**する“頭出し初期化小節”の概念を持つ。
- **テンポ/拍子**: ループ本体内は原則一定拍子。リタルダンドはループ内に置かない（戻れなくなる）。
- **書き出し**: ループ本体を「小節整数倍・拍頭開始・拍頭終了」で切り、`loopStart`/`loopEnd` を**サンプル値に変換**してタグ化（下記）。

### 5.4 エンジン/ミドルウェアのループタグ慣習
- **RPGツクール系（MV/MZ, Pixel Game Maker）**: OGG Vorbis のメタデータ `LOOPSTART` / `LOOPLENGTH`（**サンプル単位**）。Audacityでメタデータ付与（3.x系はサンプル値バグで2.4.2推奨）。`LOOPLENGTH` 以降の余分な音声は切る。自動化ツール `crosslooper`（相互相関でタグ自動設定）、`MIDIRenderer`（MIDI→RMMV互換ループOGG）。（出典: GitHub crosslooper / MIDIRenderer / rpgmakerweb forum）
- **Wwise**: ループ属性＋entry/exit cue。テールをcueで跨がせる。
- **FMOD**: Logic Track の Loop Region＋Transition Timeline で pre-entry/post-exit（余韻）を保持。
- **共通**: 「音声本体＋ループポイント（サンプル）＋テール処理」の3点セット。本ツールはMIDI/セクション正準なので、**書き出し時にこの3点を生成**できると強い。

---

## 6. 発展: インタラクティブ（基礎のみ）

- **縦（vertical layering / remixing）**: 同じループ上でステム（弦・ドラム・リード等）をON/OFFして強度・情緒を変える（Red Dead, Pokémon SwSh）。→ 本ツールは**トラック=レイヤー**なので、`layerGroup` と `intensity` タグで表現可能。
- **横（horizontal resequencing）**: ループ可能なセクションを用意し、状況で滑らかに切替（探索⇄戦闘⇄勝利）。→ セクション間 `transition`（切替は拍/小節グリッド同期・フィルで橋渡し）。
- **ハイブリッド**: 横のグループ内で縦の抜き差し（実務の定番）。（出典: thegameaudioco / gamedeveloper GDC2021 / kitvarney）
- 本docでは**深追いしない**。データ案（7章）に将来拡張の口だけ開けておく。

---

## 7. 仕様化

### 7.1 イントロ/アウトロ型テンプレ表（生成候補プリセット）

| 区分 | 型 | 尺プリセット | 開始位相 | 主用途 | ループ曲での扱い |
|---|---|---|---|---|---|
| Intro | riff | 4/8 bar | 拍頭 | ロック/戦闘/アクション | playOnce（ループ外・先頭1回） |
| Intro | chorusHeadSample | 2/4/8 bar | 拍頭 | J-pop/ボカロ掴み | playOnce |
| Intro | atmos | 4/8/16 bar（自由尺可） | 拍曖昧可 | タイトル/フィールド/アンビエント | playOnce or 省略 |
| Intro | pickup（弱起/カウント） | 1/2/4 bar | アウフタクト | バンド/ジャズ/EDM | playOnce（またはループ末尾と一体化） |
| Intro | buildup | 8/16 bar | 拍頭 | EDM/ダンス | playOnce |
| Intro | none | 0 | — | 短いフィールド/戦闘 | 本体直入り |
| Outro | fadeOut | 4/8 bar 反復 | 拍頭 | 非ループ/遷移 | ループ曲は不可（遷移用途のみ） |
| Outro | tagRepeat | 2〜3反復 | 拍頭 | J-pop締め | 擬似アウトロ可 |
| Outro | reprise | 8/16 bar | 拍頭 | 劇伴/叙事 | 全体ループ最終部 |
| Outro | soloOut / deconstruct | 可変 | 拍頭 | ジャズ/アンビエント | 縦の抜き差しと親和 |
| Outro | coldEnd | 1音 | 拍頭 | イベント/勝利ジングル | 非ループ専用 |
| Outro | ritardando→coldEnd | 2/4 bar | 拍頭 | エンディング/撃破 | 非ループ専用 |
| Outro | bookend | =Intro尺 | 拍頭 | 構成美 | 頭↔尾を繋ぐ全体ループ |

### 7.2 ループ境界チェックリスト（和声/旋律/リズム/テール）

**A. 和声**
- [ ] ループ長は小節の整数倍か（半端拍で終わっていないか）。
- [ ] 末尾で完全終止（PAC）を“意図せず”作っていないか（回り続けたいなら開いておく）。
- [ ] 末尾→頭の和声接続を選んだか（V→I循環／II→I／bVII→VI7→I 等の色付き経路／継続オスティナート）。
- [ ] 転調がある場合、ループ本体は原調で閉じるか、末尾に戻り転調を仕込んだか（転調はイントロ/ブリッジ/別ループへ隔離）。
- [ ] 低音ペダル/オスティナートが境界を跨いで継続しているか。

**B. 旋律（声部連結）**
- [ ] 末尾音→頭音の音程を確認したか（過大跳躍で継ぎ目が立たないか／近接 or 導音→主音）。
- [ ] 弱起で頭へ雪崩れ込む、または末尾休符で頭を立てる、のどちらかを選んだか。
- [ ] 頭の入りが毎回同じ表情になって“反復疲れ”しないか（変奏/装飾の余地）。

**C. リズム/フィル**
- [ ] 末尾フィルで頭への助走を作ったか（特に戦闘）。
- [ ] セクション入りが拍頭に揃っているか。
- [ ] グルーヴ/フィール（スイング等）が境界で途切れないか。

**D. テール（余韻）**
- [ ] リバーブ/ディレイ尾が境界で切れて“プツッ”としないか。
- [ ] テールをループ末尾より後ろまで鳴らし、頭に重ねたか（焼き込み or cue/transition）。
- [ ] MIDIで境界を跨ぐ持続ノートを、頭で鳴らし直す/末尾でリリース、のどちらかに決めたか。
- [ ] ループ頭でCC（サステイン/モジュ/ボリューム）を初期化/再設定したか。

**E. 技術**
- [ ] ループポイントをサンプル単位で合わせたか。
- [ ] 書き出しは WAV/OGG か（MP3の先頭パディングを避けたか）。
- [ ] エンジン向けタグ（LOOPSTART/LOOPLENGTH 等）をサンプル値で生成したか。

### 7.3 データ表現案（セクション列でループ曲を表現する）

本ツールは「曲＝セクション列＋MIDI書き出し」。ループ曲を無理なく載せるための最小拡張案。

**(1) セクション役割 `sectionRole`**
```
sectionRole: "intro" | "loopBody" | "outro" | "transition" | "bridge"
playOnce: boolean          // intro/outro は true（ループの外）
```

**(2) 曲レベルのループマーカー**
```
loop: {
  loopStart: { section: "<id>", bar: 0 },   // ループ頭（本体先頭）
  loopEnd:   { section: "<id>", bar: 16 },  // ループ末尾（=次でloopStartへ）
  mode: "introThenLoop" | "wholeLoop" | "sequence",
  tailBars: 1.0,            // 頭へ重ねる余韻の尺（テール処理用）
  boundaryCadence: "open-V" | "II-I" | "bVII-VI7-I" | "ostinato" | "PAC",
  boundaryMelodyInterval: 2 // 末尾音→頭音の目標音程(半音/度)。継ぎ目検査に使う
}
```

**(3) 書き出し時の派生（MIDI/音声）**
- `loopStart`/`loopEnd` の小節を**サンプル値に変換**し、OGGなら `LOOPSTART`/`LOOPLENGTH` メタへ。
- `tailBars` 分を `loopEnd` より後ろにレンダリングし、頭へ重ねた版と重ねない版の両方を出せると親切（人間が耳で選ぶ）。
- 境界を跨ぐ持続ノートは書き出し前に**末尾でノートオフ or 頭で再発音**へ正規化。

**(4) 横/縦インタラクティブ（将来拡張の口だけ）**
```
layerGroup: "<id>"          // 縦: 同時ON/OFFするステム群
intensity: 0..1             // 縦: レイヤー強度タグ
transitions: [{ from, to, sync: "bar"|"beat", fill: "<id>" }]  // 横: セクション遷移
```

### 7.4 生成フローへの含意（実装エージェント向け）
- ゲームBGMモードでは **`introType` と「イントロ無し」を候補で出す／`outroType` はループ曲では抑制**。
- ループ本体尺は文脈プリセット（field/battle/town/ambient）から**複数seedで振って提示**（バリエーション原則）。
- 生成後に **7.2チェックリストを自動セルフチェック**（和声の末尾開き具合、末尾→頭音程、ループ長の整数倍、テール未設定）で警告を出す＝“候補の質ゲート”。最終判断は人間の耳。

---

## 8. 出典（URL）

- Winnifred Phillips 5技法／intro+loop分離／テール貼付: MakeUseOf「Video Game Music: How to Create a Seamless Loop」 https://www.makeuseof.com/how-to-create-music-loop-video-games/
- ループ音楽の作曲/応用（イントロ track と melody track の分離）: Toby Ellis「Application & Composition of ‘Looped’ Linear Music in Video Games」 https://tobyellismusic.wordpress.com/2018/10/04/application-composition-of-looped-linear-music-in-video-games-music-sound-studies-reflection-article-2/
- JRPG曲形式（AAB/4等分/ループ尺30-50秒・16小節・1分未満〜2:30、Tifa II→I、Fond Memories bVII→VI7→I、オスティナート8/10、拍頭入り）: Drum Chant「JRPG Song Forms」 https://drumchant.wordpress.com/2021/02/14/jrpg-song-forms/
- FF戦闘曲の長尺化: Video Game Music Nerd「The evolution of Final Fantasy battle music」 http://videogamemusicnerd.blogspot.com/2013/02/analysis-evolution-of-final-fantasy.html
- すぎやま「8曲テンプレ（eight melodies）」の系譜: Music Theory Online「8-Bit Affordances: Jun Chikuma’s Faxanadu」 https://mtosmt.org/issues/mto.23.29.3/mto.23.29.3.cook.html
- イントロ標準4-8小節/16小節例/30秒・7秒ルール: All About Songwriting「Songwriting 101 – Intros And Outros」 https://allaboutsongwriting.com/songwriting-101-intros-and-outros/
- 曲構造の一般: Making Music「Song Structure - a quick guide」 https://making-music.com/quick-guides/song-structure/ ／ Wikipedia「Song structure」 https://en.wikipedia.org/wiki/Song_structure
- アウトロ型（fade/cold/ritardando/tag/reprise/deconstruction/bookend）: eathealthy365「Creative Song Endings」 https://eathealthy365.com/creative-song-endings-from-fade-outs-to-final-flourishes/ ／ Wisseloord「What makes a good song outro」 https://wisseloord.org/academy/what-makes-a-good-song-outro-or-ending ／ Wikipedia「Conclusion (music)」 https://en.wikipedia.org/wiki/Conclusion_(music)
- FMOD Loop Region＋Transition Timeline（post-exit余韻保持）: synchrnzr「FMOD 201 - Lesson 1」 https://synchrnzr.com/learn/fmod/201/lesson1
- Wwise 2023.1.17+ entry/exit cue でテール処理、MP3先頭パディング: itch.io game audio discussion https://itch.io/post/13102216
- RPGツクール LOOPSTART/LOOPLENGTH（サンプル・Audacity・切り詰め）: RPG Maker Forums「Make looping BGM - Part 1 (OGG Vorbis)」 https://forums.rpgmakerweb.com/threads/make-looping-bgm-part-1-ogg-vorbis.10987/
- ループタグ自動設定: GitHub「crosslooper」 https://github.com/Splendide-Imaginarius/crosslooper ／ MIDI→RMMV互換ループOGG「MIDIRenderer」 https://github.com/getraid-gg/MIDIRenderer
- 縦/横インタラクティブ: The Game Audio Co.「Vertical Layering vs. Horizontal Resequencing」 https://www.thegameaudioco.com/making-your-game-s-music-more-dynamic-vertical-layering-vs-horizontal-resequencing ／ Game Developer「Pure vertical layering (GDC 2021)」 https://www.gamedeveloper.com/game-platforms/pure-vertical-layering-for-game-music-composers-from-spyder-to-sackboy-gdc-2021-
