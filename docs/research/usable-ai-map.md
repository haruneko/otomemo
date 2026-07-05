# 使えるAI候補マップ（ライン別＋セクション）＝制御性最重視の横断統合

5体のサブエージェント調査(2026-06-28)を統合。評価軸＝**①公開/ライセンス ②可動性(CPU/TS統合) ③★制御性(調/コード/骨格/構造で条件づけ＝本プロダクトの核) ④統合容易性**。
個別詳細＝[melody](2026-06-28-melody-ai-survey.md)・[chord-harmony](2026-06-28-chord-harmony-ai-survey.md)・[lyric](2026-06-28-lyric-melody-ai-survey.md)（ベース+ドラム/セクションは本mapに収録）。

## 大原則（調査で一貫した結論）
1. **制御が効くもの＝条件づけ/inpainting型だけが使える**。prompt/属性のみの大型LM(MuseCoco/MIDI-GPT/AMT)は制御弱＋丸暗記/ライセンスリスクで主役不可。
2. **著作権線＝統計のみ＋PD/MIT＋自作ネタ**。学習コーパスの権利はモデルMITでも浄化されない。**CA2(PD学習)が最クリーン／AccoMontage(POP909実フレーズ流用)はリテラルリスク／AMTは丸暗記明言**。
3. **統合の楽さ**＝TSネイティブ(GrooVAE)＞Python sidecar(CA2/SketchNet/VOICEVOX)＞GPU必須(Whole-Song/AccoMontage-3/GETMusic)。

## ライン別 本命（制御性順）
| ライン | 本命 | ライセンス/可動 | 制御性 | 統合アイデア |
|---|---|---|---|---|
| **メロ** | **Music SketchNet** | CC0・PyTorch小・CPU可? | ★contour潜在+rhythm潜在を分離＝**V2の骨格/表面と1:1** | 骨格線=contour条件・表面=rhythm条件で埋めさせる＝V2表面の対抗器 |
| **メロ(汎用補完)** | **Composer's Assistant 2** | MIT・PD学習・CPUローカルサーバ | ★track-measure固定→補完・密度/跳躍/リズム制御 | コード別トラック固定→メロ小節を補完/候補 |
| **和声** | **AutoHarmonizer**(軽)/**AccoMontage2**(高機能) | MIT・CPU可 | ★メロ→コード・style4種/構造/密度 | メロ確定→和声付け・再和声で候補 |
| **ベース** | （完成モデル乏しい）**設計知見**を吸収 | arXiv2511.08755 | ★「bass-first・コード条件・コードトーン主体」 | 現行ルールベース gen_bass の品質改善指針 |
| **ドラム** | **GrooVAE / Drumify**(Magenta) | ★Apache2.0・**Node/TF.jsでTS同言語** | groove度/テンポ・score(叩く太鼓)は我々が完全指定 | 我々の決定的ドラム図形→**ノリ(microtiming+velocity)だけ後付け**=humanize後段 |
| **歌詞** | **空白**＝自前+**VOICEVOX/pyopenjtalk** | VOICEVOX(HTTP/TS相性◎)・OpenJTalk(MIT) | ★モーラ数/アクセントを**実測** | mora_countをLLM自己申告→実測に置換＋generate-check-repairループ |

## セクション/構造・編曲（あなた重視「セクションにおけるやつ」）
- **★Composer's Assistant 2（総合本命）**: MIT・PD学習・CPUローカル。**マルチトラック track-measure infilling**＝「ユーザーが骨格/メロを固定→AIが伴奏/他トラックを小節ごと補完」の**理想形をそのまま実現**。リズム/密度で section の盛り上がりも制御。
- **AccoMontage-3（リードシート→フルバンド編曲）**: MIT・GPU推奨。メロ+コード+section構造→多トラック・曲全体の管弦コヒーレンス。**プロトタイプ第一候補**だが重い。
- **MeloForm（楽式の足場）**: MIT・商用OK・CPU可（ルール半分）。**verse/chorus/bridge等の楽式が第一級入力**＝section→song assemble層に最安全。
- **Whole-Song-Gen**（4階層カスケード・概念最適）＝ただし**inpainting未リリース＋GPU**＝外部生成器止まり。第2層(簡約リードシート)が我々の骨格層に対応。
- 手法だけ借りる：PopMNet/MELONS(bar間の反復/発展グラフ)・WuYun(骨格→装飾infill・重み非配布)・Yin-Yang(motif発展)。

## ★横断の結論＝「使える一手」
- **核＝Composer's Assistant 2**：MIT・PD学習・CPUローカルサーバ・**部分固定→補完**＝メロ/コード/骨格 5ライン横断で「ユーザー固定→AI補完」が成立。MCPからローカルNNサーバを叩く構成。制御性・著作権・可動の全要件を唯一満たす。
- **ドラムは GrooVAE**：唯一**TS同言語(Node/TF.js)**＋Apache2.0＝「制御は我々・人間味はモデル」が最小コスト。
- **歌詞は VOICEVOX/OpenJTalk**：モデル不在＝実測ツール＋LLM＋check-repair で自前。
- メロ補助=SketchNet(CC0/層一致)、和声=AutoHarmonizer(軽)。
- **不採用**：AccoMontage系(リテラル流用)・AMT(丸暗記)・MIDI-GPT(NC)・大型属性LM(制御弱+GPU)。

## ★優先度（ユーザー方針 2026-06-28）＝メロ最優先・打ち込みは後
ユーザーの**苦手は比較的メロディ寄り**＝**AI支援はメロが最優先**（苦手こそ機械の助けが効く）。**打ち込み(ドラム/ベース)はメロより優先度低**（humanizeは欲しいが後回し可）。→ 着手は今でなく研究資料として温存。

## 推奨PoC順（上記優先度反映）
1. **メロ補助（最優先）**：**SketchNet**(contour+rhythm=V2層一致/CC0) or **CA2** で「ユーザーの骨格/断片→メロ候補・変奏・補完」＝苦手なメロ作りをAIが助ける。V2(制御)＋AI(候補出し)の併用。
2. **CA2 ローカルサーバPoC**：メロ/コード固定→補完（メロ補助にも編曲にも効く本命・要Python sidecar設計）。
3. （後回し＝打ち込み低優先）**GrooVAE → gen_drums humanize**（TSネイティブ・軽いが優先度低）。**VOICEVOX → 歌詞モーラ実測**も同列で後。
4. ベースは arXiv2511.08755 の設計知見を gen_bass に吸収（モデル導入でなく）。
