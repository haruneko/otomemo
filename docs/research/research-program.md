# 大計画（研究プログラム）— 発散リスト

作曲支援エンジンを「理論研究→実践研究(計測)→実装→評価」の循環で進化させる**候補トピックの全部出し**（中小含む・発散フェーズ）。次に収束して優先順位＝実行計画にする。
凡例：**[sub]**=サブエージェント委譲可 / **[no-ear]**=ユーザーの耳が不要で進む / **[done/partial]**=既着手。

---

## 0. これが軸：評価基盤（no-ear 進化の鍵）★最重要
ユーザー「耳が要らない所で進化を」＝**理論規則をスコア関数化した自動評価器**があれば、brush-up を耳なしで回せる。
- **E1 規則ベース採点** [no-ear]：生成メロ/コードを理論で減点。強拍コードトーン率・gap-fill遵守・禁則跳躍(三全音/連続)・声部進行(並行5/8度)・avoid-note・終止の有無/型・contour単一頂点・反復率。
- **E2 コーパス尤度** [no-ear][sub]：学習分布(リズム語彙/move遷移/終止頻度)に対する生成物の尤度＝「らしさ」スコア。
- **E3 多様性/崩壊検知** [no-ear]：生成の自己相似・モード崩壊（同じ物ばかり）検知。
- **E4 ゴールデン回帰** [no-ear]：代表入力→出力の固定スナップショット差分。
- **E5 A/B 自動比較**：旧/新パイプラインを多指標で並べる。
- → これが立つと、以後の brush-up は「指標が上がるか」で**耳なし反復**できる。

---

## 1. 理論研究（[sub] で深掘り委譲可）
メロ骨格/和声は済。残る盲点：
- **T1 楽式・フレーズ構造**：Caplin の formal functions（sentence/period/hybrid、presentation–continuation–cadential）。句の内部文法。
- **T2 動機展開技法**：fragmentation/augmentation/diminution/inversion/retrograde/sequence(real/tonal)/liquidation。＝モチーフを「どう発展させるか」の語彙（今は転写反復のみ）。
- **T3 ガラント・スキーマ**：Gjerdingen の Prinner/Romanesca/Fonte/Monte/Quiescenza 等＝「定型の旋律+低音セット」。J-POP/古典の手癖の正体。
- **T4 ハイパーメーター・句リズム**：4小節句の強弱・phrase rhythm・弱起と句頭の関係。
- **T5 転調・一時転調**：tonicization/modulation/pivot/共通音、転調の旋律的サイン。
- **T6 モード/旋法・ペンタ**：旋法和声、ペンタの語法（J-POP/民謡）、ブルーノート。
- **T7 ジャズ・リハーモナイズ**：代理・テンション・モーダルインターチェンジの体系（色付けの上位）。
- **T8 ベースライン構築**：根音以外（転回・経過・線的）＝低音の旋律性、メロとの対位。
- **T9 歌詞・韻律（日本語）**：モーラ⇄音価、アクセント核⇄旋律方向、字余り/メリスマ、母音とロングトーン。
- **T10 認知・期待**：Huron の期待（ITPRA）・緊張/解決・統計学習・サプライズと情動。
- **T11 編曲・テクスチャ**：副旋律・対旋律・コール&レスポンス・声部配置・音域。
- **T12 グルーヴ/微小タイミング**：スイング比・微妙な前後（push/laidback）・ジャンル別。
- **T13 終止の文化差・偽終止の構成的使用**（harmony研究の続き・実例厚め）。

## 2. 実践研究（コーパス計測 [no-ear][sub]）
拡張コーパス（Nottingham/MelodyHub/PDMX/Essen）で再計測＝**理論を実データで検証＋スタイル差**：
- **M1 既知計測のスタイル横断再現**：骨格/contour/gap-fill/強拍CT/アーチ が irish/folk/pop/classical で保つか・どう違うか。
- **M2 コード進行統計**（Nottingham/POP909 のコード）：遷移確率・終止頻度・機能パターン(T-PD-D-T)・和声リズム・循環/王道の出現。
- **M3 メロ⇄和声**：avoid-note の実使用・非和声音の型別頻度・コード変化拍と構造音の同期。
- **M4 終止の実測**：PAC/IAC/HC/plagal/deceptive の頻度と位置（コーパス別）。
- **M5 楽式/反復**：句長分布・sentence/period 頻度・セクション反復の周期（前に4/4で測った多スケール反復の一般化）。
- **M6 スタイル指紋**：何が irish/pop/folk を統計的に分けるか（style-steer の素）。
- **M7 動機展開の実測**：sequence/inversion/fragmentation がどれだけ使われるか。
- **M8 拍子別リズム語彙**：3/4・9/8・2/4 の拍セル/小節パターン（Nottingham で可）。
- **M9 ガラント・スキーマの検出**：T3 の定型がコーパスにどれだけ出るか。
- **M10 歌詞-旋律対応**（要・歌詞付きデータ DALI 等）：モーラと音価/方向の相関。

## 3. 実装（TDD・構造/正しさは[no-ear]／微細な質は耳要）
- **I1 メロ brush-up**（backlog ①〜⑦）：interruption明示・装飾の型化・suspension・Narmour閾値・head選定/parallelism・句機能変奏・16分細分。
- **I2 和声 brush-up**（backlog ①〜⑩）：終止タイプ選択器・偽終止・声部進行減点・avoid-note・二次ドミナント・サブドミナントマイナー 等。
- **I3 コーパス取込**：abc.ts に**和音記号抽出**[no-ear]→Nottingham のメロ+コード対／MusicXML parser(PDMX)／kern/EsAC(Essen)。style/meter タグ付き corpus 化。
- **I4 拍子拡張**：3/4・9/8（6/8 と同じ meter パラメタ型・中景流用）[no-ear 構造]。
- **I5 メロ⇄和声 ジョイント生成**：今はコード所与→メロ。コードとメロを**共生成**（or harmonize 強化）。
- **I6 ベースライン生成**：voice-leading 準拠（I2 の声部進行と統合）。
- **I7 楽式/フォーム生成**：verse/chorus・sentence/period を**句構造として**敷く（I1 interruption の上位）。
- **I8 動機展開エンジン**：T2 の技法（sequence/inversion/fragmentation）で反復を発展（今は転写のみ）。
- **I9 genMelody 完全統合**：phrasing/pickup/expression を新パイプラインへ（旧資産の移植）。
- **I10 歌詞/音数 統合**：syllable DP（既存）＋ T9 の韻律を旋律生成に。
- **I11 スタイル分離**：style ごとにリズム語彙/move/終止分布を分け、steer 可能に。

## 4. コーパス（研究素材）
- **C1 Nottingham**（取得済・1034曲・3/4,6/8,9/8,4/4・コード付）→ 投入＋和音抽出。
- **C2 MelodyHub**（ABC・PD・harmonization 含む・取得中）→ 多伝統で M1/M6 を厚く。
- **C3 PDMX**（CC-0・25万・MusicXML・取得検討中）→ pop/classical スケール。要 MusicXML parser。
- **C4 Essen/ESAC**（多拍子 folk・コード無）→ 旋律/リズムの多様性、M1/M8。
- **C5 歌詞付き**（DALI 等・要ライセンス確認）→ T9/M10。
- 横断：**統一コーパスストア**（style/meter/コード有無のタグ・出典/ライセンス管理）。

## 5. メタ/横断
- **X1 評価駆動の反復ループ**：0章の評価器を CI 的に回し、各 brush-up を指標で採点。
- **X2 スペック整合**：design.md #12-M をモデル進化に追従（SDD）。
- **X3 デモ生成基盤**：MIDI 書き出しを scratch から正式関数へ（試聴の足場・今は使い捨て）。
- **X4 ライセンス台帳**：各コーパスの可否（学習のみ/再配布NG 等）を1枚に。

---

## 次（収束）
この発散から、**①評価基盤(E)を最初に立てる→②no-ear で効く実装(I3和音抽出/I4拍子/I1-I2の規則系)を指標駆動で→③[sub]で理論(T)・計測(M)を並列に大量investigate** という三層の実行計画に畳む。まずユーザーが「入れる/落とす/優先」を選ぶ。
