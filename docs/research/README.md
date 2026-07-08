# research/ マスター索引

CLAUDE.md の規約「外部調査・理論研究・分析・実測の結果は `docs/research/` に `.md` で格納」の**全体目次**。
SDD構造への接続：設計の確定事項は `docs/design.md`（特に #12-M メロ生成）、ここはその**根拠＝研究/実測/サーベイ**。出典(URL)・実測値・設計含意を残す。他者コーパスからは**統計のみ抽出・リテラル非保存**（著作権）。

## ★到達点（メロディ探索 大ストーリーの確定結論・2026-06-28）
- **V2＝制御メロエンジンが本番**（`genMotifMelodyV2`・A2レシピ＝骨格＋モチーフ選別＋発展＋後処理＋輪郭駆動・4/4＋6/8）。中身＝[melody-recipe-validated](melody-recipe-validated.md)、計測＝[melody-corpus-findings](melody-corpus-findings.md)。
- **メロ補完(`complete_melody`)実装**＝部分→続き/4倍をユーザー素材から発展（決定的・著作権セーフ）。
- **メロ「崩し」実装(2026-06-29)**＝`genFromEssence(strength/blendWith)`＝提示メロのノリを保ちピッチ/輪郭を強度に応じ崩す（著作権セーフ）。MCP `reshape deform`。コーパスは irish186/pop/game 投入済（質検証=耳が残）。[2026-06-29-melody-corpus-and-deform](2026-06-29-melody-corpus-and-deform.md)。
- **perplexity研究クローズ**＝公式形式で校正、V2は変なの出さない＝「検出ガード」として有効・常時フィルタ不要。[eval-models-learned](eval-models-learned.md)。
- **使えるAI候補マップ**＝外部メロAIは制御弱/中庸で現状不採用。[usable-ai-map](usable-ai-map.md)。
- ★**設計思想確定**＝機械は候補/選択肢まで・仕上げは人間。Suno等は画像生成的で別パラダイム・競合しない。

## メロディ生成（本丸：理論→設計→実装→検証）
- [melody-model-summary](melody-model-summary.md) — メロ生成モデルのサマリ＆メロ専用インデックス（まずここ）
- [melody-generation](melody-generation.md) — 研究仕様（フレーズ感/息継ぎ）＝design #12-M の full spec
- [melody-design-journey](melody-design-journey.md) — 設計ジャーニー（仮説一覧と対処）
- [melody-corpus-findings](melody-corpus-findings.md) — POP909 独立再現＝S8/有機メロの計測根拠
- [melody-recipe-validated](melody-recipe-validated.md) — 検証済 A2レシピ（V2の中身）
- [melody-heuristics](melody-heuristics.md) — ヒューリスティック一覧（学習 vs ハードコードの監査）
- [melody-figure-contour](melody-figure-contour.md) — 「音楽的な塊」＝輪郭図形の測り方
- [sixteenth-rhythm](sixteenth-rhythm.md) — 16分リズム（外部調査＋POP909実測）
- [motif-extraction](motif-extraction.md) ／ [motif-research](motif-research.md) — モチーフ抽出・生成・著作権
- [2026-06-29-melody-corpus-and-deform](2026-06-29-melody-corpus-and-deform.md) — メロコーパス情報源＋「崩す」(genFromEssence)＝提示メロ→同雰囲気の別メロ。ライセンス別源マップ(PDMX/POP909等)＋法的整理(TDM/30条の4/substantial similarity)＋強化案
- [2026-06-29-drum-sound-resolution](2026-06-29-drum-sound-resolution.md) — ドラム音解決の点検＝regexアドホック vs SF2権威マップ＋ピッチ異常(ride2+8/cowbell-7)の診断と修正(root= overridingRootKey ?? gmPitch)。次=権威マップ化＋キット選択(アコ/エレキ)
- [skeleton-melody-musicology](skeleton-melody-musicology.md) ／ [skeleton-theory-detail](skeleton-theory-detail.md) ／ [skeleton-model-crossmap](skeleton-model-crossmap.md) — 骨格メロの音楽学・理論・cross-map

## 評価・AI調査（このストーリーの結論）
- [eval-models-learned](eval-models-learned.md) — 学習モデルでのメロ自然さ評価（FMD/MuPT perplexity・**perplexity研究クローズ**）
- [usable-ai-map](usable-ai-map.md) — 使えるAI候補マップ（5ライン＋セクション・制御性最重視）
- [2026-06-28-melody-ai-survey](2026-06-28-melody-ai-survey.md) — メロディ・ライン拡張AI調査
- [2026-06-28-chord-harmony-ai-survey](2026-06-28-chord-harmony-ai-survey.md) — コード/和声ライン拡張AI調査
- [2026-06-28-lyric-melody-ai-survey](2026-06-28-lyric-melody-ai-survey.md) — 歌詞ライン拡張AI調査（日本語モーラ/アクセント）
- [2026-07-01-singing-voice-synthesis](2026-07-01-singing-voice-synthesis.md) — メロ＋歌詞を歌わせる可能性調査。Tier0=SF2合唱パッチ(即・言葉なし)／本命=**VOICEVOX歌唱ローカルHTTP**(無料商用可・日本語・自宅完結)／高音質=NEUTRINO(MusicXML書出が橋・CPU低速)。既存 Note.syllable がスコアの素。母艦GPU無しでニューラルは遅い
- [2026-07-02-card-and-create-ui-patterns](2026-07-02-card-and-create-ui-patterns.md) — カード式管理＋多様な種別の起票UI定石(Notion/Linear/NN/g)。作成タイル＋チャット委譲は王道で詰めどころ少／**詰めしろはカード一覧側＝表示密度の切替(リスト/コンパクト)＋情報優先度(タイトル主役/id退避/アクション整理)**。面solidアイコンは認識速い

## オーディオ解析（アナリーゼ＝新しい柱）
- [audio-analysis-feasibility](audio-analysis-feasibility.md) — 流行曲(音源)を解析(BPM/調/構成/音域/楽器/コード/メロ特徴)の**CPU自己ホスト feasibility**。結論＝**Demucs分離1passが軸**・三和音/音域/調/BPM/構成は堅い・**7th拡張と混合音源の楽器同定と多声ボーカル採譜は弱い**(候補止まり)・**クラウド(Spotify API)は2024廃止で据えない**・日本**著30-4「情報解析」が有利**(音源は保存せず派生事実だけ残す)。設計含意＝継続調査と同じ「投げて→裏で→トレイ」骨格＋Claudeが数値を言語化

## 和声/コード
- [harmony-cadence-theory](harmony-cadence-theory.md) — 和声・終止・声部進行の理論リファレンス
- [2026-06-22-chord-progression-engine](2026-06-22-chord-progression-engine.md) — コード進行エンジン（DB＋ルール＋Claude選別）
- [2026-06-22-jp-chord-sources](2026-06-22-jp-chord-sources.md) — 日本の曲のコード進行を大量に仕入れる現実解
- [2026-06-22-key-degree-tech](2026-06-22-key-degree-tech.md) — コード進行→調→度数 変換の要素技術

## 横断研究(study)＝クロス曲の共通進行(#S11)
- [2026-07-06-hayashibara-loop-reproduction](2026-07-06-hayashibara-loop-reproduction.md) — **曲内ループ・レンズの再現テスト(n=2)**＝林原めぐみ5曲(公式Topic音源)。レンズは再現(各曲に固有ループ×5〜18)、但し**共有核は薄い**(Northern lightsのみ純Aeolian、infinity/KOIBUMIは本物のV、feel wellは単純メジャー)＝**歌手は複数作曲者で手癖がぼける**。SURFACE(単一作曲者)で立ち林原(複数)で正しく立たない＝**メソッドは判別力あり・手癖の単位は作曲者**。実装GOの根拠。設計含意=studyは作曲者で括る
- [2026-07-06-within-song-loop-lens](2026-07-06-within-song-loop-lens.md) — **レンズ転換の実測**＝「曲間頻度」は全曲の最小公倍数(♭VI–♭VII–i)だけ見せ各曲の色を平均で消す欠陥。**曲内反復ループ**でSURFACE4曲を見ると2曲は本当に♭VI–♭VII–i循環がフック、残り2曲は曲間レンズが消してた個性(本物のV／ジャジーmaj7ループ)が出た。手法の罠2つ(被覆=回数×長さは2連断片を贔屓／保存にdur落とすと調が出現数重みに劣化し誤検出)も記録。**設計提案=study主レンズをper-song core loopへ＋生コード列(dur込)保存**
- [2026-07-06-surface-shiina-study](2026-07-06-surface-shiina-study.md) — **同一バンド版**＝SURFACE(椎名慶治)5曲(それじゃあバイバイ/さぁ/ゴーイングmy上へ/その先にあるもの/君の声で)公式音源。手癖＝**♭VI–♭VII–i の3和音を回転・振動＋iv(下属マイナー)で湿り気**・ドミナント/導音なし。**ボカロ民族調と同じ Aeolian 核土台の上に個人署名(iv/振動形)が乗る**＝スタイル土台×個人手癖を対象選びで撃ち分けられると実証。同時に study 3修正(per-song調表示/common キャップ/renderFrameTonic モード対応レンダ)＋prose meta除去(cleanProse)を実データ検証
- [2026-07-06-vocaloid-folk-study](2026-07-06-vocaloid-folk-study.md) — #S11研究フレームの**初本番**＝民族調ボカロ5曲(千本桜/マトリョシカ/結ンデ〜/六兆年/威風堂々)をYouTube→Demucs→BTC→度数化→クロスn-gram。**別作家3人が `i–♭VI–♭VII` 循環で一致**＝スタイルの共通文法(V/導音回避のエオリアン・ケーデンス)。同時に**長短判定修正(resolveTonic=継続長ヒートマップ)を実データ検証**＝5曲全て正しく短調→度数が揃い一致が成立(調判定の質が集計の質に直結)。穴3つ=members per-song key未載/common無制限保存(1387)/renderExample窓依存フレーム

## 生成手法・ルーティング・連想（基盤）
- [2026-06-21-generation-methods](2026-06-21-generation-methods.md) — Claude非依存の生成/分析/判定/類似度の技術サーベイ
- [2026-06-21-routing-scenarios](2026-06-21-routing-scenarios.md) — 頼み事の振り分けシナリオ・ベンチ
- [2026-06-22-association-usecases](2026-06-22-association-usecases.md) — 連想ユースケース群（どの仕組みで実現）
- [2026-06-22-association-spec-validation](2026-06-22-association-spec-validation.md) — 連想「8機構の地図」の末端検証

## 自己点検・整合・研究計画
- [self-check-log](self-check-log.md) — 自己チェック・ループ ログ（評価器で仮説→検証→FB）
- [consistency-review](consistency-review.md) — 整合監査（研究findings ↔ 設計#12-M ↔ 実装）
- [research-program](research-program.md) — 大計画（研究プログラム・発散リスト）
- [2026-07-07-next-dev-plan](2026-07-07-next-dev-plan.md) — **次期開発計画**＝機能ギャップ監査(docs×実コード突合・25項目 file:line 実証)＋方向づけ(キーストーン=自作mp3の資産化)の統合。芯＝「生成器を増やすより足場を組む」(可視化/評価FB/書きやすさ/自分らしさの燃料)。段階=P0足場即効(スケール音ハイライト/非対称フレーズ/評価器接続)→P1自己進化ループ常設→P2自作コーパス→P3メロ層操作。最痛点=**評価器E-rule/E-corpusが完成済だが未接続**
- [2026-07-07-debt-audit-and-handoff](2026-07-07-debt-audit-and-handoff.md) — **負債監査＋Opus向けハンドオフ**＝docs×実コード両面監査の統合1枚。負債D1〜D9優先度付き(audio.ts/reaper.ts無テスト・音楽定数の api↔web 二重実装・Lint不在・docs乖離5件・死にコード/死にユニット)＋不足機能グループA〜E＋ロードマップ現在地(P0完/P1本体済・残=P0-b非対称/P2自作mp3)＋作業パックの切り出し方。入口はこの doc → 各正典。**追記(2026-07-07)：負債 D1〜D9 全消化済（片付け/テスト補強/music-core集約/Lint/巨大コンポ分割/systemd自動起動）**
- [2026-07-08-melody-chord-audit](2026-07-08-melody-chord-audit.md) — **メロ×コード総点検＝監査4本の所見と修正記録**。理論破綻9クラスタ（短調V7分裂/終止の和声盲/V2骨格インデックス/後処理相互破壊/コーパス化け"min7"→メジャー等）を特定→**全てTDDで修正済**（コミット10本・api625緑・960本スイープ=禁則0/多頂点0/終止違反0/導音衝突0）。正準方針3つ（短調V7維持メロ追従/終止コード追従/品質込み終止判定）はdesign#12-Mへ。残=進行コーパスの質(2コード断片/長短分裂)＋H低優先
- [2026-07-08-drum-transcription-journey](2026-07-08-drum-transcription-journey.md) — **ドラム抽出 続き＝全曲書き起こし→区間分解の試行錯誤記録**。ゴール是正(1小節ループでなく全曲を音楽的区間に分解しネタ化)。試み1=連続グリッドで全曲per-bar書き起こし→**ドリフト(周期誤差累積)＋perceptionノイズむき出しで破綻**。crash検出をperceptionに追加(高域の長い減衰・セクション頭マーカー・半小節裏表を割る)。試み2(採用)=**crashで区間を切り区間ごとにextractDrumPattern**＝区間内は1グルーヴで畳みが本物・ドリフト回避。LostMemory実データで6区間・区間ごとに綺麗なバックビート(スネア2,4)が出た。学び=全曲1グリッドはドリフト破綻・区間分解は理想かつ質の解。**続き(2026-07-08着地)**＝Crashレーン(midi49)を区間ネタに載せる／**reaper配線済**(audio_analyze→区間ごとrhythmネタ＋analysis.overlay.sections)／**AnalysisWorkbenchに区間境界を破線描画**／通しスモーク(実mp3→demucs→ネタ列挙)確認。**6/8検証**＝orion=4/4(不適)／JAM=6/8感は跳ね(sub3)で4/4吸収=成功／Hunter's Chance=真6/8を meter=6/six-d で正しく検出だが conf0.137<0.3ゲート手前＝**拍子検出は正しく残差はゲート/語彙のみ**(罠回避で保留)
- [2026-07-08-drum-pattern-extraction](2026-07-08-drum-pattern-extraction.md) — **ドラムパターン抽出＝窓分割×正準型照合（#S12改・実装済）**。v1の3欠陥を実測（排他分類がhihat潰す/全曲剛体グリッドは実録音で位相崩壊/16分決め打ちがシャッフル全滅）→perception=多帯域独立検出＋優勢ゲート、interpretation=局所グリッド窓×型照合(スネア=バックビートがdownbeatを決める)＋sub∈{16分,3連}検出。実3曲: LostMemory 4/4 conf0.41(スネア2,4クリーン)/SURFACE 4/4シャッフル検出 conf0.33/DeepSea(6+5) conf0.09=正しく低信頼。**6拍子検証は2026-07-08 journey で解消**(Hunter's Chance=meter6/six-dを正しく検出・ゲート手前／JAM=跳ねsub3で吸収)＝[2026-07-08-drum-transcription-journey](2026-07-08-drum-transcription-journey.md)。残=confidence較正・6/8のゲート/語彙(やるなら)
- [2026-07-07-drums-bass-extraction-plan](2026-07-07-drums-bass-extraction-plan.md) — **ドラム/ベース抽出 実装計画**（Fable起草・実コード突合）。芯=分離は既に4stem出てるのに vocalsしか使ってない→drums/bass は追加コストゼロで拾える。キック/スネアから拍/ダウンビート/拍子の土台を固める(今はmeter未検出・downbeatはコード変化のみ)。モデルは全部差し替え可能な部品・計測で決める(分離器/ADT/ベースピッチの候補比較表＋ライセンス)。Python=perception/TS純関数=interpretation。手1=ドラム→グリッド+rhythmネタ(2.5-3.5日)、手2=ベース→相対度数bassネタ。受け皿(rhythm/相対bassスキーマ)・計測前例(midi_truth/compare)は既存。要design.md先行(facts契約追加/meter=0auto/reaper materialize)
- [2026-07-07-mid-term-improvement-plan](2026-07-07-mid-term-improvement-plan.md) — **中期改善計画**（Fable計画エージェント起草・実コード突合）。負債完済後の前進計画。芯＝効く方向はA分析/抽出(正解が実在し計測が機能)とB自分らしさ(本人ラベルが物差し)の2つ。最初の3手＝手1 allin1で構成の穴を一撃＋正解セット／手2 捨ててるdemucs bass/drums stem資産化・メロをbasic-pitch比較／手3 自作mp3→個人プロファイル開通(P2薄い縦スライス)＋OK/NGラベルの器。オーナー判断待ち6点(アーク順/自作mp3選定/ラベルの貯め方/耳検証タイミング等)。やらないこと=理論スコア最適化(死に筋)・GPL/AGPL採用・完成トラック生成
- [2026-07-07-audio-to-neta-extraction-map](2026-07-07-audio-to-neta-extraction-map.md) — **音源→ネタ化 抽出マップ**（実コード読解＋外部ツール調査）。ネタ種別ごとに「今 取ってる/捨ててる×候補ミドルウェア/AI(出典・ライセンス付き)」を一覧化。現状=夢の4〜5割(上澄みは取れるが**構成/多パート化/木への組み立てが穴**)。芯=聴き取り層は音モデル天井(LLM無関係)・**LLMが効くのは生fact→ネタの木への組み立て層のみ**。最大ROI=allin1で構成を足す＋捨ててるdemucs bass/drums stemを拾う。ライセンス地雷=Chordino/essentia(GPL/AGPL)回避、コアは demucs/BTC/librosa で商用OK

## E2E・受け入れテスト
- [chat-e2e-2026-07-05](chat-e2e-2026-07-05.md) — チャット機能の初回通しE2E（既存会話履歴の発掘＋新経路のライブ実行）。**BUG#1(高・修正済)＝chat面14 verbとallowlistの不一致で③次の一手/②歌詞↔メロが自動拒否で黙って死亡**／BUG#2(中)＝曲名アナリーゼの期待ズレ(チャットにMIR無し・二次情報を"解析済"に見せる)／BUG#3/4(低)＝孤児スレッド・role不整合。合格＝作曲/Web検索/song_state/歌詞流し込み/停止/切断永続化。感想＝相棒として想像以上・落とし穴は「登録したのに許可してない」型でE2Eの価値が出た
