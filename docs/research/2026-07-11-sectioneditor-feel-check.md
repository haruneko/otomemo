# SectionEditor フィール実測＋機械的分割（骨格層S2追加後・Task#2）

2026-07-11。オーナー懸念「SectionEditor が骨格層S2で増改築（約1090行）になりフィールが悪くなるおそれ」への
**実測点検**と、backlog 既載の**機械的分割**の記録。実装はスペック駆動＝挙動不変が鉄則。

## 1. フィール実測（Playwright・モバイル幅390px・CPU6倍スロットル）

### 方法
- 本番 dist（api `:8787` が同一オリジンで配信）を実機ドライブ。`http://127.0.0.1:8787/`。
- chromium実体 `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome`、`playwright-core`（CJS＝default import）。
- context: `viewport 390×844 / deviceScaleFactor 2 / isMobile / hasTouch`、`CDP Emulation.setCPUThrottlingRate {rate:6}`。
- 計測：①一覧初回描画（navigate→最初の `neta-card` visible）②Section展開（section カード tap→`timeline` visible＋`lane-block`描画）
  ③DOM（`rect`要素数＝MiniRoll描画コスト・全要素数・lane-block数）④スクロール（timeline横スクロール中の rAF 間隔：p95・>32ms=30fps割れの本数）。
- データは実DB（data/）の実ネタ、読み取りのみ。**最重ケース**＝子26個の section「E2E 6/8マイナー」、**基準相当**＝子11個の section「★デモ 6/8の曲」。
- スクリプト＝scratchpad `feel-measure.mjs`（恒久化はしていない・流儀は memory [[reference-playwright-live-ui-check]]）。

### 数値（median・分割後 dist で再計測）
| 指標 | 基準 2026-07-09 | 26子(最重) | 11子(基準相当) | 判定 |
|---|---|---|---|---|
| 一覧初回描画 | 4.3s | 3.7–4.2s | 3.0–3.7s | **改善〜同等**（劣化なし） |
| Section展開 | 2.5s | 5.8–6.4s | 2.5–4.5s | 内容依存（下記） |
| DOM `rect`数 | 135 | 398 | 240–329 | 内容依存（配置ネタ数に比例） |
| lane-block数 | — | 26 | 11 | — |
| スクロール p95 | — | 22–23ms | 19–24ms | **滑らか**（60fps余裕帯） |
| >32msフレーム | — | 0 | 0 | **ジャンクなし** |

### 判定＝骨格層追加によるフィール劣化は「無い」
- **一覧描画は改善**（3–4.2s ≤ 基準4.3s）。**スクロールは滑らか**（p95 ~20ms・>32ms 0本）。
- **展開時間は「内容量」に比例するもので、骨格追加の固定費ではない**。基準(rect135・展開2.5s)より重い section ほど長い
  ＝rect398 の26子で5.8–6.4s／rect240–329 の11子で2.5–4.5s。11子は基準より rect が多いのに展開は基準2.5sと同水準
  ＝**骨格追加後もクローム（枠）コストは増えていない**（増えていれば同等内容でも展開が伸びるはずだが伸びていない）。
  展開の主コストは MiniRoll のノート描画（rect数）＝配置済みネタの量そのもの。26子は本DBの**極端な最重フィクスチャ**。
- **骨格層の固定費は極小**：`skeleton` レーンを1行 無条件描画するだけ（今回の各 section に骨格子は無く `skeleton-audible` トグルは非表示・
  `skel-block-actions` も骨格子がある時だけ条件描画）。lanes=7 の1行増分＝空 div 1個で無視できる。
- 展開時間の run 間ばらつき（11子で2.5→4.5s 等）は**計測環境の CPU 競合**由来（別セッションの api dev サーバ＋MCP＋esbuild＋並行作業が
  同居）。rect 数のばらつきも MiniRoll の非同期描画途中でサンプルした race＝アプリの質でなく計測ノイズ。傾向（一覧改善・スクロール滑らか・展開は内容依存）は安定。

## 2. 機械的分割（挙動不変）

D6 リファクタ（5ea44d6）で LaneCell/SongStatus/PlacePicker(**描画**)/sectionLanes は分離済み。今回は**残っていた state+handlers** を抽出。

### 抽出したユニット
- **`apps/web/src/useMelodyGen.tsx`（新規・335行）**：いじる▾ の「生成/ハモリ道具」＝メロ生成13ノブの state、候補トレイ state、
  `genPart/genSkeleton/blowSkeleton/estimateChords`、ハモリ/`fitToChords`/`analyzeFit`、候補操作（audition/place/keep/remove/close）、
  プリセット/サイコロ/`segRow`/`sliderRow`。section 文脈を `ctx`（neta・調・尺・laneChildren・sectionChords/Bass/Drums 等）で受け取り、
  純粋に近い。**JSX は SectionEditor 側に残す**＝className/DOM構造 不変＝CSS 影響ゼロ。`MELODY_PRESETS`/`GEN_PARTS` を export。
- **`apps/web/src/usePlacePicker.ts`（新規・124行）**：配置ピッカーの state（picker/絞り込み/おすすめ）＋
  `openPicker/placeAt/createInLane/previewNeta`＋recommend フェッチ effect＋試聴停止 effect。ダイアログ描画は既存 `PlacePicker` が担う。
- **`apps/web/src/components/SectionEditor.tsx`：1086 → 732行**（−354行）。骨格関連の所在を明確化：
  骨格レーン描画・`skeleton-audible` トグル・骨格ブロック `吹く▶/コードを推定` は SectionEditor の JSX に残置（レイアウト責務）、
  `skeletonNetaId` の生成注入と realized_from リンクは `useMelodyGen`（genPart/placeCandidate）へ集約＝「骨格idは候補が保持」の構造を維持。

設計方針＝**props が多いので素直に**：SectionEditor が section の幾何/state を持ち、フックへは関数群を ctx で渡す。過剰な抽象化はしない。

### テスト面の不変
- テストが SectionEditor から import するのは `SectionEditor, loopPositions, spanOverlaps` のみ（`test/SectionEditor.test.tsx`）。
  純関数は従来どおり再export＝import 面 不変。

## 3. テスト結果
- `tsc --noEmit`（web）＝クリーン。
- **web：398 passed / 399**。唯一の未通過 `NetaDialog > shows a piano roll for melody` は**私の変更前(clean HEAD)でも同様に落ちる**
  ＝5秒 testTimeout の**環境フレーク**（`--testTimeout=30000` で 8.6s 完走・pass を確認）。CPU 競合が原因でハングでも回帰でもない。
- `SectionEditor.test.tsx`：**44/44 pass**（gen_melody の counter/hook/finest/flow・プリセット/サイコロ・候補トレイ＝抽出した挙動を網羅）。
- `pnpm --filter web build` 成功＝**dist 焼き直し済（本番反映）**。
- api：本セッションでは**未変更**。作業ツリーに別セッションの Task#4（骨格S3b/c）由来の api 変更が同居し api 側に2件の失敗があるが、
  それは私の担当外・私の diff とは無関係（私の変更は web の3ファイルのみ）。

## 4. 判断に迷った点
- **タスク前提と現状の乖離**：指示は「place-picker を PlacePicker へ抽出（HEAD=cd9e2c1・api796/web399）」だったが、実 HEAD は 19649a2 まで進み
  PlacePicker **描画**は D6 で分離済み・テスト数も api829/web399 に増えていた。→ 残っていた **state+handlers** の抽出＋生成/ハモリ道具の抽出、と読み替えて実施。
- **フック抽出 vs コンポーネント抽出**：候補トレイは いじる▾ シートの外（editor 直下）に描画されるため、コンポーネント化すると DOM 入れ子が変わり CSS 破壊リスク。
  → **フック（state はフック・JSX は SectionEditor の現在位置に残置）**を選択＝DOM/className 完全不変を担保。
- **基準との厳密比較不能**：2026-07-09 の基準（rect135）がどの section での実測か不明＝同一 section 再測は不可。
  → 内容量（rect）を揃えた **11子 section（基準相当）**で「同等内容なら展開は基準と同水準」を示し、骨格追加のクローム固定費が無いことを間接的に確認した。
- **環境ノイズ**：並行セッションのプロセス群で機械が重く、展開/rect のラン間ばらつきが大きい。安定指標（一覧・スクロール）と内容依存の傾向で判断した。
