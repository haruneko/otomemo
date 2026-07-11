# genMelody 経路の呼び出しグラフ全数確認（旧経路撤去 Task#11 の前提調査）

2026-07-11・HEAD=8055bdc・Explore サブエージェントによる grep 全数走査（親レビュー済）。
目的＝「MCP/HTTP は常に useV2:true ＝ motifModel(③)/旧経路(④) は本番不到達」疑いの検証。

## 結論：疑いは誤り。③④は本番到達可能＝単純撤去は不可

**③④に落ちる本番ケースが3つ実在する：**

1. **fit ツールの melody 新規生成**（mcp.ts:792）＝ genMelodyCandidates に **useV2 を渡していない**。
   corpus 投入済み・4/4・chords 有りなら③、それ以外は④。
2. **chords 無しの gen_melody**：gen_melody の chords は optional（mcp.ts:524）。V2ゲート
   （generate.ts:549 `useV2 && (bpb===4||compound) && chords>0 && bars>=1`）を外れ④へ。
   **chords 無しメロ生成の受け皿は現状④が唯一**。
3. **非4/4・非複合拍**（3/4・2/4・5/4・7/8等）：meter は zod 自由文字列＝入力検証で強制されない。
   V2 eligible は 4/4・2/2・8/8（bpb=4）と 6/8・9/8・12/8（compound）のみ。**3/4 のメロ生成は④**。

## 呼び出し元 全数（本番5箇所のみ）

| # | file:line | 関数 | useV2 | 主経路 |
|---|---|---|---|---|
| A | mcp.ts:558（complete_melody） | genMelody | true+partial | ①補完、ゲート外れで④ |
| B | mcp.ts:538（gen_melody） | genMelodyCandidates | true | ②V2、ゲート外れで④ |
| C | **mcp.ts:792（fit target=melody）** | genMelodyCandidates | **無し** | ③/④ ★ |
| D | http.ts:203（POST /gen） | genMelody | true | ②V2、ゲート外れで④ |
| E | http.ts:300（POST /gen/section GN-08） | genMelody | true | ②V2、ゲート外れで④ |

genMelodyCandidates（generate.ts:755）は opts 透過＝useV2 を注入しない（759,763,769,780）。
reaper/research-runner/study-runner/job-procs/core に genMelody 呼び出しは無い。

## ③④の構成部品と参照

- ③ genMotifMelody（melodyCells.ts:226・V2とは別関数）：本番参照は generate.ts:672 の1箇所。
- ④ ヘルパ（全て④ブロック内の1箇所からのみ）：buildMotifSteered(370)/placeMotif(391)/
  recoverLeaps(926)/decorateWeak(1010)/applyPhrasing(872)/applyExpression(953・V2は607で同ロジック内製)/
  planSkeletonTones(434・export＝generate-skeleton.test.ts 87行が専用)。
- 撤去規模＝generate.ts 本体~65行＋ヘルパ~250行＋melodyCells 1関数。

## ③④前提のテスト（撤去時に削除 or V2移植・概算430行相当）

- generate.test.ts 140-344 の6 describe（約200行・useV2無し＝④）
- generate-skeleton.test.ts 全87行（planSkeletonTones専用）
- corpus-bias.test.ts 61行（stepWeights経由＝④）
- generate-key.test.ts の一部（:61-62）・generate-invariants.test.ts:238（明示④）
- melody-cells.test.ts の genMotifMelody describe（:115-）＝③

## ③④排他の opts ノブ（撤去時に消せるのは2つだけ）

- **stepWeights**（generate.ts:682・④のみ。fit/gen_melody が learnStepWeightsFromLibrary 経由で渡す）
- **appoggiatura**（generate.ts:672・③のみ）
- motifModel/skelModel/repetition/rangeSteps は V2 でも参照＝消せない。

## 設計含意（撤去の前提＝要オーナー判断）

単純削除では **chordless / 3拍子系のメロ生成が壊れる**。撤去には受け皿の設計が先：
- 案a: V2 を chordless 対応（キーのダイアトニックを chordPcs 代用）＋ bpb=3 対応へ拡張してから④撤去
- 案b: chordless/非4/4 は「未対応」とエラー明示（作曲ツールとして3/4切り捨ては痛い＝非推奨）
- 案c: fit 経路(C)だけ先に useV2:true 化（即可能・低リスク）→④の実トラフィックを B/D/E のゲート外れのみに縮めて段階撤去
いずれも design #20「ノブ層別再編」と同時に詰める（Task#11 を J1〜J4 に再分割する際の J1 成果物＝本doc）。
