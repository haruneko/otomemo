# メロディ生成モデル：サマリ＆インデックス

試聴ループ（生成→耳→仮説→計測→実装）＋音楽理論の裏打ちで作った有機メロ生成モデルの要約と、関連文書の入口。

## モデル一言
**度数+相対位置の記号で全層を表す再帰モデル**（テンポ/調 非依存・NN不要・数えるだけ）：
1. **骨格**（構造音＝コードトーン・2拍粒度・終止 open=5度/close=1度）
2. **モチーフ**＝(1小節8分リズムパターン＋contour)を一体で**反復**（sequence転写）
3. **contour**＝move のマルコフ P(m2\|m1)＝**gap-fill**（跳んだら逆向きstep）
4. **仕上**＝位置段階snap（強拍=コードトーン/弱拍=passing自由）／構造的音価（句中短・カデンツ長）

## 理論で裏打ちされた（cross-map 済）
| 我々の実測/実装 | 確立理論 |
|---|---|
| gap-fill（跳躍後 逆向き53%） | Narmour I-R **Reversal**／Fux **leap recovery** |
| 位置段階snap（強拍協和/弱拍passing） | Fux **2種対位法** |
| モチーフ反復（構造音も並行） | GTTM **parallelism**（TSRPR4/PRPR5） |
| open/close（close=1度/open=5度） | Schenker **Urlinie 2̂→1̂ / Interruption** |
| 強拍=コードトーン92% | Schenker 構造音=協和／GTTM TSRPR2 |
| アーチ・単一頂点 | Fux **単一クライマックス**／GTTM TSRPR3 |
＝経験モデルは**普遍法則を引いていた**（偶然でない）。

## ブラッシュアップ backlog（効き順・次の実装）
1. **骨格 v2＝Urlinie準拠**：アルペジオ跳躍→**順次の構造線**＋**単一クライマックス**＋句で **Kopfton→1̂ 下降**（背景=大局下降／中景=局所ジグザグ の2スケール）
2. **interruption**：句を 2̂(open半終止)→1̂(close完全終止)に2分割
3. **禁則跳躍除外＋Narmour閾値**：三全音/7度/8度超を排除・P4/P5でreversalバイアス（s31「禁則」の直し）
4. 強拍 suspension 許容（Fux4種=滑り込み）／5. 弱位置を passing/neighbor 型に／6. 変奏を句機能で位置駆動

## 実装状況
`melodyCells.ts`：scalePitchList/cellToNotes/parseCell/learnMelodyCells/sampleCell/realizeMelody/snapToChordTones/genSkeleton/genCells/learnBarRhythms/sampleBarRhythm/learnMoveTransitions/genContour/**genMotifMelody**。`corpusBias.ts` learnMotifModelFromLibrary。**genMelody に新経路配線済**（4/4+motifModel）・mcp gen_melody 接続済。api 363緑・tsc0。

## 関連文書（リファレンス）
**我々の調査/設計**
- [`melody-design-journey.md`](./melody-design-journey.md)：仮説28件＋計測＋結論（経験ログ）
- [`melody-corpus-findings.md`](./melody-corpus-findings.md)：数値（独立追試で再現）
- [`skeleton-melody-musicology.md`](./skeleton-melody-musicology.md)：骨格=音楽学概念の概観
- [`skeleton-theory-detail.md`](./skeleton-theory-detail.md)：理論の規則・語彙 網羅辞書
- [`skeleton-model-crossmap.md`](./skeleton-model-crossmap.md)：我々×理論 cross-map＋brush-up
- [`consistency-review.md`](./consistency-review.md)：研究↔実装 監査
- `design.md` #12-M S7/S8：正準モデル

**外部出典（理論）**
- Schenker/Urlinie：[Fundamental structure](https://en.wikipedia.org/wiki/Fundamental_structure)・[Glossary of Schenkerian analysis](https://en.wikipedia.org/wiki/Glossary_of_Schenkerian_analysis)・[Linear progression](https://en.wikipedia.org/wiki/Linear_progression)
- Narmour I-R：[Implication-Realization](https://en.wikipedia.org/wiki/Implication-Realization)・[Narmour公式](https://web.sas.upenn.edu/enarmour/the-implication-realization-model/)・[Royal review (MTO)](https://mtosmt.org/issues/mto.95.1.6/mto.95.1.6.royal.html)
- Fux 種対位法：[Open Music Theory](https://viva.pressbooks.pub/openmusictheory/chapter/first-species-counterpoint/)・[Global Music Theory](https://globalmusictheory.com/the-rules-of-counterpoint-cantus-firmus-through-5th-species/)
- GTTM：[Generative theory of tonal music](https://en.wikipedia.org/wiki/Generative_theory_of_tonal_music)・[ISMIR2008](https://archives.ismir.net/ismir2008/paper/000142.pdf)
- 骨格生成ML：[WuYun (arXiv 2301.04488)](https://arxiv.org/pdf/2301.04488)
- データ：POP909（CC-BY）
