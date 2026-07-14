# ［耳/手］一括チェックリスト＝研究→実装バッチ（WP17＋派生）の実機確認（2026-07-14）

**前提**：実装は全21コミットがmain反映済・api再起動済（systemd 1本・旧tsx watch孤児は根絶）。フルスイート緑（music-core 100/api 1081/web 548・tsc 0）。**機械で確認できるものは全て確認済＝ここに残るのは耳と手だけ**。
**使い方**：1セッション=1座り。各項目に○/×とメモ。×は該当WPの研究doc（各行に記載）を参照してTask化。**全ノブ既定OFF＝何も触らなければ従来と同じ音**が大原則なので、×でも被害はONにした時だけ。

## セッションA：メロ骨格の新ノブ（骨格の机で）

| # | 操作 | 期待 | 根拠doc | ○/× |
|---|------|------|---------|------|
| A1 | 骨格生成で「色付け」を 素直→少し→濃い と切替→表面化→試聴 | 強拍に時々非和声音（すぐ隣へ解決）＝歌の「引っかかり」。濃いで違和感が出るなら×0.2レートが過剰 | skeleton-corpus-stats（実曲=強拍1/3が倚音） | |
| A2 | skelFormで cadence-swap / sentence を選び8小節生成 | cadence-swap=前半コピーだが句末だけ着地が変わる／sentence=短短長の畳み掛け感 | motif-transform-stats・skeleton-dictionary-metrics | |
| A3 | 「かたち」を 山/のぼり/くだり/たに で切替 | 弧が耳で判別できるか（受入実測: のぼり終音>始音率0.82・山頂点中央） | contour-template-dictionary | |
| A4 | A1〜A3を併用（色付け＋かたち＋skelForm） | 破綻しない（機械確認済）＋音楽的に共存して聴こえるか | — | |

## セッションB：メロ候補レンズ＋声種（いじる▾候補トレイ）

| # | 操作 | 期待 | 根拠doc | ○/× |
|---|------|------|---------|------|
| B1 | メロ候補を複数生成→並べ替え軸を フック度 に | 上位が実際に「口ずさみやすい」か（重みは研究初期値＝仮） | earworm-hook-features | |
| B2 | 並べ替え軸 歌いやすさ | 上位が歌いやすいか。ボカロprofile切替でC6系候補の順位が上がるか | singability-tessitura | |
| B3 | 並べ替え軸 期待理論 | 上位が「意外さと納得のバランス」か（平板と奇矯の中間） | expectation-theory-melody | |
| B4 | 声種セレクタ=ボカロでメロ生成 | 高域（C6圏）まで使うメロが出る・音域窓の追従 | vocaloid-grammar・M7 | |

## セッションC：伴奏（コード生成・MCP/HTTP経由=チャットからでも可）

| # | 操作 | 期待 | 根拠doc | ○/× |
|---|------|------|---------|------|
| C1 | gen_chords palette=mixolydian / dorian / aeolian | 土臭さ／浮遊／哀愁が出るか。aeolian終止（♭VI→♭VII→i）の疾走感 | mode-usage-stats | |
| C2 | variety を 0→0.5→1 | 進行の多様化（実測9→42進行）が「変」でなく「別の良さ」か | 2026-07-09監査C・C3実装 | |
| C3 | suggest_cliche を静的進行に | 内声の半音ラインが上品か（3rd不動は機械保証済） | cliche-pedal-lines | |
| C4 | genre=citypop | maj9/分数（IV/V）の浮遊感・警告(meta.warnings)の妥当性 | citypop-extended-voicings | |
| C5 | 張力レンズ（meta.tension）で進行候補を並べ替え | 「サビ頭で解決→中盤一山」上位が気持ちいいか | harmonic-tension-curve | |
| C6 | suggest_key_plan（チャット「サビで転調する調プラン出して」） | 提案の納得感・transition適用で境界の準備和音が自然に繋がるか | modulation-catalog | |

## セッションD：リズム隊（この進行に生成）

| # | 操作 | 期待 | 根拠doc | ○/× |
|---|------|------|---------|------|
| D1 | ドラム「ビート型」でジャンル切替（16ビート/4つ打ち/シャッフル等） | 型が立っているか・テンポとの相性 | drum-pattern-genre-library | |
| D2 | 「フィル」ON（F型いくつか） | 遷移小節のフィル→次小節頭crash+kick着地の気持ちよさ。※web再生はvelカーブ近似（MIDI書き出しは完全） | drum-fill-vocabulary | |
| D3 | フィル=溜め4/8/16小節（ビルド） | ロール加速→無音ギャップ→ドロップの緊張-解放 | buildup-drop-mechanics | |
| D4 | ベース「型」でジャンル切替（シティポップ/ファンク等）＋ベースフィル | 型の質・キックとの絡み（unison/interlock/counter）・低域窓33..48が痩せ/濁りなし（synth C2基準） | bass-genre-vocabulary・stem-groove-measurements | |
| D5 | humanize（人間味）を中〜強 | 1/f化で「酔っぱらい」でなく「人間」に聴こえるか・40ms警告の発火妥当性 | humanize-perception-defaults | |
| D6 | kickLockプリセット 弱0.6/強0.8 | ベース×キックの噛み具合（実測動作点） | stem-groove-measurements | |

## セッションE：新レーン3種＋ループ

| # | 操作 | 期待 | 根拠doc | ○/× |
|---|------|------|---------|------|
| E1 | 骨格の机→「対旋律を作る▶」→counterレーン配置→試聴 | 主メロの間（休符）で動き、動く時は引く。独立フェーダーで音量調整可 | countermelody-obbligato | |
| E2 | 「この進行に生成」→リフ | 2小節核の反復が「回って気持ちいい」か・メロとの棲み分け | riff-ostinato-design | |
| E3 | 「この進行に生成」→管弦（pad/stab） | pad=持続の支え／stab=裏16分の切れ。ボイシングの濁りなし | horn-string-arranging | |
| E4 | 曲にloop設定→check_loop→MIDI書き出し | 指摘の妥当性（開いた境界=OK）・DAWでLOOPSTARTマーカー確認・実ループの継ぎ目 | intro-outro-game-loop | |

## セッションF：チャット系（耳より手＝会話の使用感）

| # | 操作 | 期待 | ○/× |
|---|------|------|------|
| F1 | 「この歌詞に合うリズム出して」（suggest_lyric_rhythm） | モーラ割付・弱起が歌える形か | |
| F2 | 「このメロにこの歌詞乗る？」（analyze_lyric_fit） | アクセント警告の精度（誤爆/見逃し・辞書は簡易版） | |
| F3 | 「切ない感じにしたい」（suggest_emotion_params） | ノブ翻訳の納得感・2バリエーションの使い分け | |
| F4 | 「この曲構成どう？」（suggest_form / suggest_energy_plan） | 構成候補と抜き差し提案が実用的か | |
| F5 | 「これ自分の過去作と被ってない？」（check_originality） | 手癖レポートの面白さ／過剰警告がないか | |

## 総合（一番大事な1本）

**G1: 「一曲書く」E2E**（docs/research/2026-07-13-e2e-write-a-song-acceptance.md の運用で）を新ノブ込みで1周＝進行(palette/variety)→骨格(色付け/かたち/skelForm)→表面(レンズで候補選び)→ベース/ドラム(型/フィル)→対旋律→合成試聴→MIDI書き出し。**「今日の実装前より一曲の質と速度が上がったか」**が最終問。

## 既知の注意

- 再構築コーパス（今朝の根治）も本チェックが初の本格耳確認＝メロ生成全般の質変化に注意
- 重み・レート・帯は全て研究docの初期値＝**仮**。×が出たら値の較正から（コード修正でなく）
- velCurveのweb再生反映・調プラン適用UI・ボカロ用プリセットボタン等は派生backlog（計画doc参照）
