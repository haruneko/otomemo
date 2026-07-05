# 「音楽的な塊」＝輪郭図形：測り方拡張・考察・施策

ユーザー指摘「動き単体は良いが、メロ全体で“音楽的な塊(モチーフのまとまり)”を感じない」を、**実曲を8分に落として度数で並べ→測り方を3軸に拡張**して分析。最終更新 2026-06-28。

## 1. 構築＝測り方を3軸に拡張
実曲を(k,φ)整列→C/Amに移調正規化→8分グリッドのスケール度数に落とす（骨格も度数で並列表示）。
「図形の再来」を**3つの表現**で n-gram 最多反復として測る：
- **度数**（4音窓）＝厳密な音
- **音程**（3音程窓）＝移調不変
- **輪郭UDR**（3窓・Parsons：U上/D下/R維持）＝移調も変奏も不変＝最も緩い

## 2. 外部調査＝輪郭が知覚の基準
- **Parsons code**（U/D/R）＝移調・テンポ不変。query-by-humming で edit距離マッチ（[Parsons](https://grokipedia.com/page/Parsons_code)）。
- ★**認知**：「**輪郭は音程列と独立に記憶される＝人は同じ輪郭の旋律を(移調でも変奏でも)混同する**」（[Pitch Contour & Melodic Similarity](https://www.researchgate.net/publication/266206050_Contributions_of_Pitch_Contour_Tonality_Rhythm_and_Meter_to_Melodic_Similarity)）。
- ★**類似度**：「**輪郭データが生ピッチ・音程より良い結果**」（[Generalized N-gram Measures](https://www.researchgate.net/publication/251107024_Generalized_N-gram_Measures_for_Melodic_Similarity) / [Melodic Contour Similarity, folk](https://www.researchgate.net/publication/259730927_Melodic_Contour_Similarity_Using_Folk_Melodies)）。
- 表現候補：[Cosine Contours (ISMIR21)](https://archives.ismir.net/ismir2021/paper/000016.pdf)・[Motif-Centric Representation Learning](https://arxiv.org/pdf/2309.10597)・[Transposition-Invariant Interval Features](https://arxiv.org/pdf/1806.08236)。
- ＝**「塊」＝輪郭図形の再来**。測るなら輪郭が正準。

## 3. 考察＝実測で核心が出た
| 図形最多反復 | 度数4音 | 音程3 | 輪郭UDR3 |
|---|---|---|---|
| 実曲(60曲) | 1.8 | 2.5 | **3.1** |
| 旧生成 | 2 | 7※ | **2** |

- **実曲は輪郭が最多(3.1)**＝**形をsequenceで回す**（移調で度数は変わるが輪郭は保つ）。理論・認知・実測が一致。
- **旧生成は輪郭2(実曲以下)＋輪郭列が `RRRRRRRR…`**＝大半トニック連打（※音程7はその "0,0,0" 偽値）。
- ★**根本バグ特定**：旧生成は**強拍ごとに骨格(この種ではトニック)へ再スナップ→輪郭が毎拍トニックに潰れる**＝「骨格スナップが形を殺す」。度数グリッドで可視：実曲 `5621` が再来 vs 生成 `111`。

## 4. 施策＝輪郭駆動（contour-driven）
- **distinct な輪郭モチーフをコミット**（range 4-9半音・方向転換≥1・0-move抑制・跳ね過ぎ抑制）。
- **輪郭(moves)を辿る**：強拍は「骨格」でなく「**輪郭が指す音の最近コードトーン**」に置く＝形を保ったまま和声に乗る（CT維持）。
- **sequence で再来**：A A' B A'（A=モチーフを句ごと再アンカー、B=別モチーフで対比）＝輪郭が3回戻る。
- **結果**：輪郭UDR3反復 C=3(実曲3.1一致)/Am=5/G=7、跳躍4-14%(実曲域)。旧トニック潰れ解消。

## 5. 残・次
- Am/G は輪郭反復やや過剰(5-7)＝モチーフ内部の輪郭反復が要因＝モチーフ長/内部反復の制御。
- 試聴 `CT_C/Am/G`＝耳で「塊(形が戻る)」が出たか確認。OKなら production の八分を contour-driven へ。
- 測り方(3軸 n-gram)は今後の図形検証の正準指標に。
