# 我々のメロモデル × 音楽理論：cross-map と brush-up

我々が試聴ループで経験的に立てたモデル（[`melody-design-journey.md`](./melody-design-journey.md)・実装 `melodyCells.ts`）を、確立理論（[`skeleton-theory-detail.md`](./skeleton-theory-detail.md)）と**1対1で突合**。各層ごとに：
- **✓ 裏打ち**＝理論が我々を支持（既実装で正しい）
- **＋ brush-up**＝理論が持つ細部で我々を磨く（未実装＝採用候補・実装先を明記）
- **？ divergence**＝データと理論が割れる／要再測定

略号：Sch=Schenker, Nar=Narmour I-R, Fux=種対位法, GTTM=time-span/prolongation。

---

## 層1：骨格 `genSkeleton`（最重要・brush-up 多）

| 我々の現状 | 理論対応 | 判定 |
|---|---|---|
| 構造音＝コードトーン | Sch: Urlinie は三和音音／GTTM TSRPR2 協和×トニック近接 | ✓ |
| 強拍に構造音 | GTTM TSRPR1 metrical position | ✓ |
| **各小節で2コードトーンをアルペジオ(t1,t1,t2,t2)＝跳んで繋ぐ** | Sch: Urlinie は**順次下降**・跳躍は無い。Arpeggiation は前景装飾で**上声骨格には多用注意** | **＋** 跳躍連結→**順次の構造線**へ（最大の修正） |
| 頂点が曖昧（小節内±3度で上下） | Fux 単一クライマックス／GTTM TSRPR3 registral extreme | **＋** 曲(句)で**最高音1つ**・以後 1̂ へ下降 |
| 開始ピッチ=声部進行で適当 | Sch: Kopfton=3̂/5̂/8̂ の3択、3線既定 | **＋** Kopfton を明示選択＋(任意)Anstieg で頭音へ上行導入 |
| 終止 open=5度/close=1度（実測73%） | Sch: Urlinie の **2̂(V)→1̂(I)** 着地／Interruption | ✓＋ 名前が付いた。**＋** 2̂経由を明示（今は1度直行） |
| period 分割なし | Sch **Interruption(Unterbrechung)**＝前半2̂で半終止(open)→後半1̂で完全終止(close)／GTTM PRPR6 | **＋** 4/8小節句を問い(2̂)→答え(1̂)に2分割＝我々の open/close を**句構造に格上げ** |

**？ divergence**：実測「骨格は向き反転68%・2拍dwell・ジグザグ」 vs Urlinie「純順次下降」。**両立する**＝Urlinie は最深層(背景)、我々の2拍骨格は **middleground**（より活発）。解決＝**句スパンの大局は順次下降＋単一頂点(背景)、その上に局所ジグザグ(中景)を許す**。＝2スケールに分ける。

---

## 層2：動き `genContour`（✓裏打ち厚い・閾値と禁則を追加）

| 我々の現状 | 理論対応 | 判定 |
|---|---|---|
| gap-fill＝跳躍後 逆向きstep（マルコフ・実測53%/59%） | **Nar R(Reversal)／Fux leap recovery／Meyer gap-fill** | ✓ 完全一致（普遍法則を引いてた） |
| P(m2\|m1) を素のヒストグラムで学習 | **Nar 閾値：小≦P4→継続(Process)/大≧P5→反転(Reversal)・三全音=境界** | **＋** 閾値を明示バイアス（学習に加え P4/P5 で reversal を強制寄せ） |
| 跳躍サイズ無制限（±7半音clamp のみ） | **Fux 禁則：三全音・短7/長7・8度超／同方向跳躍2連続禁止／同方向 run ≤4音** | **＋** 禁則跳躍を**除外**（s31「禁則に触れる」の直因）・連続跳躍制限 |
| 動きは1種類(generic move) | Nar 全アーキタイプ P/D/IP/VP/IR/ID | ？ 余地：D=反復(モチーフ)・VP=助走 等を意図的に使い分け（後回し可） |

---

## 層3：モチーフ反復（✓GTTM parallelism そのもの）

| 我々の現状 | 理論対応 | 判定 |
|---|---|---|
| リズム＋contour を2小節motifで反復(転写=sequence) | **GTTM TSRPR4/PRPR5 parallelism**＝並行時間幅は head も並行に | ✓ 反復句は**構造音も並行**にせよ＝我々の転写は理論的に正しい |
| 反復は固定(motifBeats周期) | 旧 `planSkeleton` の句機能(consequent=模続/句末=拡大) | **＋** 変奏を**位置駆動**に（A-A→consequentは sequence・句末は拡大/断片化）＝旧資産と接続 |

---

## 層4：協和スナップ `snapToChordTones`（✓位置段階が species と一致）

| 我々の現状 | 理論対応 | 判定 |
|---|---|---|
| 強拍=コードトーンに縛る／弱拍・ウラは自由(passing) | **Fux 2種**：強拍=協和必須・弱拍=passing可／GTTM TSRPR2 | ✓ 位置段階は species 2種そのもの |
| 強拍は常に協和へ矯正 | **Fux 4種 suspension**：強拍に**不協和(掛留)を許し下行stepで解決** | **＋** 稀に強拍掛留を許容→**下行解決**＝「滑り込み」表情。今は一律矯正で suspension を潰してる |
| 長音=縛る | 構造音=協和(GTTM) | ✓ |

---

## 層5：装飾語彙（＋新層・weak音を“ちゃんとした figuration”に）

現 contour の弱位置音は generic Markov。理論は弱位置音を**具体的 figuration**として定義：
- **passing**（構造音間を順次通過）/ **complete neighbor**（戻る刺繍）/ **incomplete neighbor**（片側=滑り込み）/ **suspension**（強拍掛留→下行）/ **cambiata**（跳躍を挟む定型）。
- **＋ brush-up**：弱位置音を「直近の構造音に対する passing/neighbor」として**型に当てて**生成すると、和声的に筋が通る（s31「取らない音」＝型に乗ってない音）。Sch diminution＝構造音を figuration で時間的に割る、の実装。

---

## 優先 brush-up backlog（効き順）

1. **骨格 v2＝Urlinie準拠**（層1）：アルペジオ跳躍→**順次の構造線**／**単一クライマックス**／句スパンで **Kopfton→1̂ 下降**。＝ユーザー「骨格品質↑」の本丸。[Sch/Fux/GTTM]
2. **interruption で句を open/close 2分割**（層1）：前半2̂(半終止)→後半1̂(完全終止)。我々の open/close を句構造へ格上げ。[Sch]
3. **禁則跳躍の除外＋Narmour閾値**（層2）：三全音/7度/8度超を contour から排除・P4/P5 で reversal バイアス。＝s31「禁則」直し。[Fux/Nar]
4. **強拍 suspension の許容**（層4）：稀に強拍非和声→下行解決＝表情。[Fux 4種]
5. **弱位置を figuration 型に**（層5）：passing/neighbor として生成。[Sch/Fux]
6. **変奏を句機能で位置駆動**（層3）：consequent=sequence/句末=拡大。旧 planSkeleton と接続。[GTTM]

---

## 結論
我々の経験モデルは**理論で広く裏打ちされた**（gap-fill＝Narmour、位置段階snap＝Fux2種、モチーフ反復＝GTTM parallelism、open/close＝Urlinie 2̂→1̂）。＝偶然でなく普遍を引いていた。**最大の伸びしろは骨格＝Urlinie準拠の順次構造線＋単一頂点＋interruption**。次の実装＝この骨格 v2。
