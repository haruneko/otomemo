# 「骨格メロディ」の音楽学的対応と動きの制約

我々の造語「骨格メロディ」＝**表面の旋律を構造的な少数の音に還元したもの**。これは音楽学に確立した概念群と一致する。本書はその対応と「動きの制約」を整理し、現 `genSkeleton` への含意を出す。Web調査(2026-06-27)＋我々の POP909 実測の突合。

## 1. 対応する確立概念（＝「骨格メロディ」の正体）

| 我々の語 | 音楽学の概念 | 中身 |
|---|---|---|
| 骨格メロディ | **Urlinie（基本旋律線）/ Ursatz（基本構造）** [Schenker] | 曲全体の最深層の旋律＝**Kopfton(頭音=3/5/8度)から1度への“順次”下降**。和声面の Bassbrechung(I-V-I) と対。 |
| 骨格音 | **Gerüsttöne（足場音／scaffold tones）/ structural tones** | 構造を支える骨組みの音。装飾(prolongation)を剥がした残り。 |
| 骨格化 | **時間幅還元 time-span reduction** [GTTM, Lerdahl&Jackendoff] | 各時間幅で**最重要音(head)を1つ選ぶ**階層木＝まさに骨格抽出。＋prolongational reduction(緊張/弛緩木)。 |
| （生成手法） | **skeleton-guided melody generation** [WuYun 2023 等] | 近年のML作曲も「先に骨格→肉付け」＝我々の3層と同型。＝方向性は学術的にも本流。 |

**結論**：骨格メロディ＝**Schenker の Urlinie/Gerüsttöne ＝ GTTM の time-span head**。我々の「2拍粒度の構造音」は middleground 相当。

## 2. 動きの制約（＝骨格“線”が従う法則）

3つの伝統が同じ事を別角度で言う。**我々の実測(gap-fill 等)はこれらと一致**＝偶然でなく普遍。

### A. Schenker：melodic fluency（旋律的流暢さ）
- **順次(conjunct)運動を優先**・連続跳躍を避ける・均整の取れた線。
- **Urlinie 自体は順次下降**（基本線に跳躍は無い）＝構造の最深層は「ドレミ…と1度へ降りる線」。

### B. Fux 種対位法（良い旋律線＝cantus firmus の規則）
- **大半が順次**・跳躍は時々。
- **跳躍の回復(leap recovery)＝大跳躍の直後は逆向きに step で埋める**（跳んだ範囲へ戻る）。＝**gap-fill**。
- **クライマックス(最高点)は1つだけ**・反復しない＝**単一頂点のアーチ**。明確な始/中/終。
- **禁則跳躍＝三全音・7度**（不協和跳躍は禁止）。跳躍は概ねオクターブ以内。

### C. Narmour 含意実現モデル（I-R・認知）
- **Process(P)**：小音程→**継続を期待**（同方向・近サイズ）。
- **Reversal(R)**：大音程→**反転を期待**（逆方向・小サイズ）＝post-skip reversal。
- ＝**小さく動けば続き、大きく跳べば戻る**。Meyer「gap-fill旋律」・Huron「post-skip reversal / 平均回帰」と同根。

## 3. 我々の実測との突合（◎一致）

| 我々の実測 | 対応する法則 |
|---|---|
| 跳躍の後 逆向き53%/ステップ59%（gap-fill）→ `genContour` のマルコフ | **Fux 跳躍回復・Narmour Reversal・Meyer gap-fill** にそのまま一致 |
| アーチ実在・頂点中央・末カデンツ下降 | **Fux 単一クライマックス**・Schenker の頂点 |
| 強拍=コードトーン92% | 構造音=三和音の音（Schenker：構造音は協和） |
| 終止 close=1度73%/open=5度 | Urlinie の**1度への解決** vs 未解決（5度=Kopfton/未到達） |
| 骨格は2拍粒度・留+ジグザグ | middleground の構造音間隔 |

## 4. 現 `genSkeleton` への含意（＝骨格の品質を上げる指針）

現状＝**各小節で2つのコードトーンを取りアルペジオ**（t1,t1,t2,t2）。これは music理論で言うと**foreground 的（和音の分散）で、構造“線(Urlinie)”になっていない**。だから「骨格メロが素朴／和声的に怪しい」。直す方向：

1. **骨格は“順次の構造線”にする（最重要）**：コードトーンを**跳んで繋ぐのでなく、Urlinie のように step で繋ぐ線**にする。各小節の構造音(コードトーン)を「目標」に置き、**間を順次で結ぶ**＝melodic fluency。今のアルペジオ跳躍を減らす。
2. **単一クライマックス（アーチ）を骨格に課す**：曲全体で**最高点を1つ**（前半〜中盤）、以後は下降して**1度へ向かう(close)**＝Urlinie の下降。今は小節内 ±3度で上下するだけ＝頂点が曖昧。
3. **方向性＝1度への解決(directed motion)**：close は**Kopfton(3/5/8度)から1度への順次下降の骨格**を敷く＝終止感が構造から出る。open はその途中(5度)で留める。
4. **禁則跳躍を骨格で禁止**：三全音・7度の骨格跳躍を避ける（コードトーン選択時に）。大跳躍は次で回復（gap-fill は contour 側に既にある）。
5. **跳躍予算**：1フレーズで大跳躍は1回程度（Fux：跳躍は時々）。

## 5. 次アクション（骨格 v2 の設計）
- `genSkeleton` を「**コードトーンを目標とする順次構造線＋単一頂点＋1度への下降**」に作り替え（Urlinie 準拠）。アルペジオ跳躍 → 順次連結。
- 頂点位置・下降カーブはコーパスで再確認（既測：アーチ中央・末下降）。
- contour 側の gap-fill（既実装）と二層で噛む：骨格=順次の大局線、contour=その上の局所装飾＋跳躍回復。

## 出典
- Schenker / Urlinie / Ursatz: [Fundamental structure (Wikipedia)](https://en.wikipedia.org/wiki/Fundamental_structure), [Glossary of Schenkerian analysis](https://en.wikipedia.org/wiki/Glossary_of_Schenkerian_analysis)
- Narmour I-R: [Implication-Realization (Wikipedia)](https://en.wikipedia.org/wiki/Implication-Realization), [Narmour, the I-R model](https://web.sas.upenn.edu/enarmour/the-implication-realization-model/)
- Fux 対位法: [First-Species Counterpoint (Open Music Theory)](https://viva.pressbooks.pub/openmusictheory/chapter/first-species-counterpoint/), [The rules of counterpoint (Global Music Theory)](https://globalmusictheory.com/the-rules-of-counterpoint-cantus-firmus-through-5th-species/)
- GTTM: [Generative theory of tonal music (Wikipedia)](https://en.wikipedia.org/wiki/Generative_theory_of_tonal_music)
- skeleton生成(ML): [WuYun: hierarchical skeleton-guided melody generation](https://arxiv.org/pdf/2301.04488)
