# research/ マスター索引

CLAUDE.md の規約「外部調査・理論研究・分析・実測の結果は `docs/research/` に `.md` で格納」の**全体目次**。
SDD構造への接続：設計の確定事項は `docs/design.md`（特に #12-M メロ生成）、ここはその**根拠＝研究/実測/サーベイ**。出典(URL)・実測値・設計含意を残す。他者コーパスからは**統計のみ抽出・リテラル非保存**（著作権）。

## ★到達点（メロディ探索 大ストーリーの確定結論・2026-06-28）
- **V2＝制御メロエンジンが本番**（`genMotifMelodyV2`・A2レシピ＝骨格＋モチーフ選別＋発展＋後処理＋輪郭駆動・4/4＋6/8）。中身＝[melody-recipe-validated](melody-recipe-validated.md)、計測＝[melody-corpus-findings](melody-corpus-findings.md)。
- **メロ補完(`complete_melody`)実装**＝部分→続き/4倍をユーザー素材から発展（決定的・著作権セーフ）。
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
- [skeleton-melody-musicology](skeleton-melody-musicology.md) ／ [skeleton-theory-detail](skeleton-theory-detail.md) ／ [skeleton-model-crossmap](skeleton-model-crossmap.md) — 骨格メロの音楽学・理論・cross-map

## 評価・AI調査（このストーリーの結論）
- [eval-models-learned](eval-models-learned.md) — 学習モデルでのメロ自然さ評価（FMD/MuPT perplexity・**perplexity研究クローズ**）
- [usable-ai-map](usable-ai-map.md) — 使えるAI候補マップ（5ライン＋セクション・制御性最重視）
- [2026-06-28-melody-ai-survey](2026-06-28-melody-ai-survey.md) — メロディ・ライン拡張AI調査
- [2026-06-28-chord-harmony-ai-survey](2026-06-28-chord-harmony-ai-survey.md) — コード/和声ライン拡張AI調査
- [2026-06-28-lyric-melody-ai-survey](2026-06-28-lyric-melody-ai-survey.md) — 歌詞ライン拡張AI調査（日本語モーラ/アクセント）

## 和声/コード
- [harmony-cadence-theory](harmony-cadence-theory.md) — 和声・終止・声部進行の理論リファレンス
- [2026-06-22-chord-progression-engine](2026-06-22-chord-progression-engine.md) — コード進行エンジン（DB＋ルール＋Claude選別）
- [2026-06-22-jp-chord-sources](2026-06-22-jp-chord-sources.md) — 日本の曲のコード進行を大量に仕入れる現実解
- [2026-06-22-key-degree-tech](2026-06-22-key-degree-tech.md) — コード進行→調→度数 変換の要素技術

## 生成手法・ルーティング・連想（基盤）
- [2026-06-21-generation-methods](2026-06-21-generation-methods.md) — Claude非依存の生成/分析/判定/類似度の技術サーベイ
- [2026-06-21-routing-scenarios](2026-06-21-routing-scenarios.md) — 頼み事の振り分けシナリオ・ベンチ
- [2026-06-22-association-usecases](2026-06-22-association-usecases.md) — 連想ユースケース群（どの仕組みで実現）
- [2026-06-22-association-spec-validation](2026-06-22-association-spec-validation.md) — 連想「8機構の地図」の末端検証

## 自己点検・整合・研究計画
- [self-check-log](self-check-log.md) — 自己チェック・ループ ログ（評価器で仮説→検証→FB）
- [consistency-review](consistency-review.md) — 整合監査（研究findings ↔ 設計#12-M ↔ 実装）
- [research-program](research-program.md) — 大計画（研究プログラム・発散リスト）
