# 局所調・転調検出プロト（F3）実測結果

作成日: 2026-07-15 ／ 種別: 純TS プロト実装（SDD+TDD）＋合成6系統＋DB実データ検証
正典仕様: [2026-07-15-local-key-detection-survey.md](2026-07-15-local-key-detection-survey.md)（推奨アルゴリズム §3・合格基準 §7）
実装: `apps/api/src/music/localKey.ts`（純関数・新規）／テスト `apps/api/test/localKey.test.ts`（6ケース緑）
既存改修: `apps/api/src/common-progressions.ts` に `tonicScores`（24枠スコア表）を **export 追加**。`resolveTonic` はそれを argmax するだけに切出し＝**挙動不変**（既存 common-progressions テスト19本緑で確認）。
結線: **なし**（reaper/facts契約/analyze.py へは未結線。プロトはモジュール＋テストで完結）。

---

## TL;DR（合格3点への判定材料）

survey §7 の合格3点に対する実測:

| 合格基準 | 判定 | 根拠 |
|---|---|---|
| (a) 既知転調曲で転調点が **±2小節** に乗る | **○** | 合成 (b)半音上げ/(c)短3度上げ/(f)部分転調すべて転調点が境界±2小節内。 |
| (b) 単一調曲で **過剰分割ゼロ** | **△（2/3）** | Corrs（D）・surface（Em）は 1セグメント。**DeepSea だけ 13分割（失敗）**。 |
| (c) 借用/相対調往復を **転調と誤認しない** | **○** | 合成 (d)相対調往復＝1セグメント、(e)セカンダリドミナント/♭VI借用＝1セグメント。 |

**結論**: 合成6系統は全緑。実データは **トニックが強く居座るポップ系（Corrs/surface）では合格**だが、
**和声色が濃い（modal mixture 多用の）曲＝DeepSea で過剰分割**。原因は本命アルゴリズムの emission が
「**窓内で最も強い"三和音"**」であって「**窓内で最も適合する"調"**」ではない点（後述§限界）。
プロトとしては「素直なポップには使える／和声リッチな曲には調テンプレート型 emission が要る」を実証した。

---

## アルゴリズム（実装したもの）

survey §3 の本命をそのまま実装:

1. **前処理**: `chords_timeline`（`[startSec, endSec, "A:min"]`）を `parseChordSymbol`（":"除去）で `{root,quality,start,end,dur}` にパース。`N`（N.C.）と解釈不能は除外。
2. **emission**: 各コード変化点 t を中心に窓 `[center±windowSec]` を切り、窓内コードを**重なり長を dur** として `tonicScores`（＝`resolveTonic` の継続長ヒートマップ＝24枠スコア）で採点。窓端の第1/末尾コードには既存の +0.6/+0.3 ボーナスが乗る＝**局所トニックバイアス**として機能（survey §6 の想定どおり）。スコアは合計1へ正規化して emission[t][k]（勝ち調シェア）。
3. **DP（Viterbi）**: `cost = Σ(-emission) + Σ(遷移罰)`。遷移罰＝同調0／別調 `switchCost`（近親調割引は既定オフ）。最小コスト経路を backtrace → 時刻ごとの調ラベル。
4. **最小滞在平滑化**: 総滞在長が `minDwellSec` 未満の run を、隣接 run の**長い方**のラベルへ吸収（安定まで反復）＝1〜2コード借用を転調に昇格させない砦。
5. **セグメント化**: 連続同一ラベルを束ね `{start,end,key,mode,confidence}`。confidence＝run 内 emission シェアの平均。

**確定パラメータ**（F3 チューニング済み・`DEFAULT_OPTS`）:

| パラメータ | 値 | 根拠（実測） |
|---|---|---|
| `windowSec`（窓半幅） | 6 | ±2小節相当（survey §3.4 中庸）。 |
| `switchCost`（切替罰） | 1.2 | 合成(d)相対調往復のフリップ抑止と(f)部分転調検出を両立する最小オーダー（下記感度表）。 |
| `minDwellSec`（最小滞在） | 8 | ≒2小節。合成(d)の残尾（~12s）吸収と(b)(c)(f)の60s転調維持を両立。 |
| `nearKeyDiscount` | 1.0（オフ） | survey §3.4「まず素の挙動を測る」。DeepSea の過剰分割に対しては割引はむしろ逆効果（近親切替を安くする）ため据置。 |

---

## 合成6系統の結果（すべて緑）

トニック（各ループ先頭）を 4s、他を 2s＝実音楽の dur 相場（既存 `resolveTonic` テストも Dm dur=40 で同趣旨）。1小節≒2コード≒~5s、転調許容 ±2小節=±10s。

| # | 系統 | 入力 | 期待 | 実測セグメント | 判定 |
|---|---|---|---|---|---|
| a | 単一調 | C major ループ×8（80s） | 1セグ | `C[0-80]` | ○ |
| b | 半音上げ | C×6 → Db×6（境界60s） | 2セグ・±2小節 | `C[0-58] C#[58-120]`（switch 58s） | ○ |
| c | 短3度上げ | C×6 → Eb×6（境界60s） | 2セグ・±2小節 | `C[0-58] D#[58-120]`（switch 58s） | ○ |
| d | 相対調往復 | C色ループ⇄Am色ループ×4 | 1セグ（転調でない） | `Am[0-80]` | ○ |
| e | 借用 | C major＋V/V(D7→G)＋♭VI(Ab)単発 | 1セグ | `C[0-86]` | ○ |
| f | 部分転調 | C×6 → **G major×6** → C×6 | 中央にGセグ | `C[0-56] G[56-110] C[110-180]` | ○ |

- (b)(c): 直接転調（ピボットなし）の鋭い境界を、window中心重み＋MIN_DWELL で境界後に安定検出。switch 58s は境界60s の -2s＝±2小節内。
- (d): 相対調（C↔Am、同一PC集合）は resolveTonic が「長く居座る三和音の root+長短」で長短を割り、切替罰＋最小滞在で1本に収束。**相対調を転調に誤昇格させない**（クロマ単独では原理的に不可能な芸当）。
- (e): D7→G の属方向よそ見（2コード）も ♭VI(Ab)（1コード）も、切替罰＋最小滞在で吸収。
- (f): 属調 G は近親調だが、6ループ（~60s）居座れば切替罰を払っても跨ぐ価値が出る＝部分転調として検出。※(e)の1〜2コード借用と(f)の長い部分転調の弁別＝まさに `switchCost`+`minDwellSec` の設計意図どおり。

---

## DB実データ検証（過剰分割の本番ゲート）

`data/cm.sqlite` の `neta` から `raw.chords_timeline`／`facts.chords_timeline` を持つ4件を全部通した（既定パラメータ）:

| 曲 | 既知の調 | セグメント数 | 検出 | 判定 |
|---|---|---|---|---|
| The Corrs - Forgiven, Not Forgotten | （DB global=D major） | **1** | `D`（conf 0.50） | ○ 過剰分割ゼロ |
| The Corrs - Forgiven（WB検証） | D major（DB key=2/major） | **1** | `D` | ○ |
| surface - それじゃあバイバイ | **Em**（study: surface-shiina-study） | **1** | `Em`（conf 0.36） | ○ 過剰分割ゼロ・study と一致 |
| DeepSea（6/8再解析） | **Dm**（study: vocaloid-folk・DB key=2/minor） | **13** | `G F G Dm D# F G D# G A# Dm D# G` | ✗ **過剰分割** |

- **過剰分割率**: 単一調4曲中 **3曲=0分割（合格）／1曲=過剰（DeepSea）**。study 記録（surface=Em、DeepSea=Dm）との突合では、surface は完全一致。DeepSea はグローバルには Dm だがセグメントが割れた。
- **DeepSea の内訳**（voiced 281s の三和音 dur 分布）: `Dm 14.5%`（首位・正しい）／`Eb 10.8%`／`G 9.7%`／`F 8.8%`／`Bb 7.6%`／`Gm 7.1%`／`Cm 5.8%`…と**長い半音階的テール**。グローバル `resolveTonic` は Dm を正しく首位に選ぶが、局所窓では Eb/G/Bb が一時的に最強三和音になる区間が実在するため割れる。
  - 割れた先（G/F/Eb/Bb）は**すべて Dm の調近傍**（F=相対長調、Bb=♭VI、Eb=♭II 的、G=Dorian の IV）＝**異国調へは飛んでいない**。誤分割は"調の近所"に留まる。

### パラメータ感度（DeepSea で振った）

過剰分割を消せるか探ったが、既定近辺では消えなかった:

| 振り | 挙動（DeepSea セグメント数） |
|---|---|
| `switchCost` 0.8→1.0→1.2→1.5 | 16→13→13→12（**ほぼ効かない**＝分割は切替罰でなく dur 支配で起きている） |
| `windowSec` 6→10→14→20 | 13→8→9→7（広窓で緩和するが1本化せず） |
| `minDwellSec` 8→16→24 | 13→8→**4**（強めれば減るが MD24≒5〜6小節＝**本物の短い転調も潰す**副作用） |

→ **合成6系統は既定（SC1.2/MD8/W6）で全緑**を優先し、DeepSea は緩和しきれないため**限界として記録**（下記）。SC を上げても消えないのが決定的＝これは切替罰で直る問題ではない。

---

## 限界の正直な記録

1. **emission が「最強"三和音"」であって「最適"調"」でない**（本命アルゴリズムの構造的限界）。
   `resolveTonic` は「最も長く鳴る三和音の root+長短＝トニック」。単一のトニックが強く居座る曲（Corrs/surface＝ポップの王道）では窓内でもトニックが最強のため安定。だが **DeepSea のように調内の複数和音（Eb/G/Bb…）が長く鳴り回る曲**では、局所窓ごとに最強三和音が入れ替わり、**同一調内なのに別調セグメントへ割れる**。切替罰では直らない（分割は罰でなく emission の局所首位交代で起きる）。
   → **根治には調テンプレート相関 emission**（窓内 PC 集合が各調スケールにどれだけ適合するか＝Krumhansl/Temperley プロファイル、または「調の使える和音集合」への適合度）が要る。これは resolveTonic の再利用では届かない＝survey §2.3 Tonal Parsimony の "tonal vocabulary" 項に相当する別実装。
2. **BTC コード認識の質と未分離**。DeepSea は 6/8・テンポ推定 123 で N.C. 区間も多く、コード列自体にノイズがある可能性（survey §7 も「正解コード条件と BTC 出力条件を分けて評価」を要求）。今回は BTC 出力そのままで評価＝コード誤りの寄与は切り分けていない。
3. **小節同期していない**。テンポ/拍が取れれば bar 量子化で精度が上がる（正則化論文は bar 単位で最良）。今回は秒窓で代用。
4. **転調点の定量精度は合成のみ**。実データは既知転調曲（サビ+1/+3 の J-pop）を DB に持っておらず、境界 F1 は合成でしか測れていない。実転調曲の収集が次の評価に要る。

---

## 結線する場合の設計メモ（GO 後の別タスク用）

- **facts 契約**: `facts.chords_timeline` と同階層に `facts.key_segments: {start,end,key,mode,confidence}[]` を置く（グローバル `key`/`mode` は残しつつ局所を追加＝非破壊）。`apps/api/src/audio-chords.ts` が chords_timeline を扱う純関数群の隣に `detectKeySegments` 呼び出しを足す形。
- **reaper**: 現状グローバル単一調を書いている箇所（`apps/api/src/reaper.ts` の chords_timeline 取り回し付近）で、`detectKeySegments(timeline)` を呼び `key_segments` を facts へ格納。プロトは純関数なので import して渡すだけ。
- **移行の前提**: 上記「限界1」を踏まえ、**まずはグローバル調が高信頼な曲に限定**するか、**調テンプレート emission を実装してから**が安全。素の resolveTonic 窓化のままでは DeepSea 型で誤分割が facts に載る。
- **TDD 継続**: 結線時は「正解コード条件」「BTC 出力条件」の2条件テストと、実転調 J-pop の境界 F1 測定を追加。

---

## 変更ファイル

- `apps/api/src/music/localKey.ts`（新規・純関数プロト本体）
- `apps/api/test/localKey.test.ts`（新規・合成6系統テスト＝6緑）
- `apps/api/src/common-progressions.ts`（`tonicScores` を export 追加＝`resolveTonic` の中核切出し・挙動不変）

（このプロトは既存パイプラインに未結線。git commit はしていない。README.md 索引への追記は本タスク範囲外。）
