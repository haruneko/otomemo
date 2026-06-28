# 16分リズム生成：外部調査＋POP909実測＋設計

目的＝**8分の次の層（16分）をどう生成するか**。骨格(2拍)→8分→**16分**の最終解像度層。耳不要のリサーチ。最終更新 2026-06-28。

## 0. 結論
- **16分は“走句(run)”で来る**＝孤立せず連続（POP909で16分onsetの66%が連続）。＝**16分は「8分の間を埋める短い走り」**。
- **16分の本質＝弱い細分＝シンコペ(ツッコミ/前借り)の温床**。「note を16分ぶん早める＝division-level syncopation」が groove を生む。
- **groove の微妙さ＝microtiming**＝**量子化グリッドとは別の post-step**（long-range correlated な揺れ。ランダムでない）。記号生成では後回しで可。
- **ピッチは move歩きが既に処理**＝16分は**主にリズムの精緻化**（16グリッド＋走句＋シンコペ）。新しいピッチ論理は不要。

## 1. 外部調査
- **16分＝最弱の細分**：拍を8分→16分と割るほど弱拍化＝**シンコペの第一候補**。**division-level syncopation**＝「1区分の音列を1細分ぶん早くずらす」＝16分前借り。pop のボーカルは**かなりオフビート**（拍頭の音すらオフに聞こえるほど）。[OpenMusicTheory](https://viva.pressbooks.pub/openmusictheory/chapter/rhythm-and-meter-in-pop-music/) / [Popgrammar](https://popgrammar.com/rhythm/) / [LibreTexts 8.1](https://human.libretexts.org/Bookshelves/Music/Open_Music_Theory_1e/08:_Pop/Rock_Music/8.01:_Rhythm_-_Syncopation_in_Pop/Rock_Music)
- **groove＝microtiming**：拍からの微小ズレが groove/swing を生む。**humanize＝タイミング揺らし**だが、市販の humanize は**無相関ランダム**＝弱い。聴き手は**long-range correlated（1/f的）な揺れ**を好む。[Microtiming/groove (Frontiers)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01232/full) / [PocketVAE: groove生成2段モデル](https://arxiv.org/pdf/2107.05009) / [SampleFocus: swing/humanize](https://blog.samplefocus.com/blog/swing-shuffle-and-humanization-how-to-program-grooves/)
- **メトリカル階層**：tatum(最速パルス)→tactus(拍)。**2拍パターン単位で生成**するとメトリカル構造を保てる（音符を1個ずつでなく）。[Temporal Structure Augmentation](https://arxiv.org/pdf/2004.10246) / [Controllable Deep Melody](https://arxiv.org/pdf/2109.00663)
- ＝WuYun の **decorative/prolongation notes をさらに細かい層で**＝16分は8分のさらなる diminution（[motif-research.md](motif-research.md) と接続）。

## 2. POP909 実測（120曲）
| 指標 | 実測 | 注 |
|---|---|---|
| 16分音価(dur<16分)率 | **~56%** | 16分は実曲の主成分（self-check-log の「real 44%」と整合＝gen 0%が最大の穴） |
| **16分onsetの連続(走句)率** | **66%** | ★**16分は連続して走る**＝孤立しない。最も信頼できる構造的所見 |
| 拍内位置(第1の16裏/第2の16裏) | 49/51% | ほぼ均等 |
| どの拍に多いか | 各25% | 拍に偏らず一様 |

- **交絡注意**：POP909メロは演奏タイミングのゆれを含むため、「16裏 onset率56%」の絶対値は8分層の「オフビート33%」と整合せず＝**量子化してからの再測が要る**（厳密シンコペ率）。**信頼できるのは「16分は多い＋走句で来る」**。

## 3. ＝我々の16分生成設計（actionable）
8分の次の層として、**リズムの精緻化**として足す（ピッチは move歩きが処理）：
1. **16グリッド化**：リズム語彙を8スロット/小節→**16スロット/小節**へ。**2拍パターン単位**で学習（メトリカル構造保持）。
2. **走句(run)を学習**：16分は連続で来る＝**「8分onsetの間を16分で割って走る」位置別確率**を学習（66%連続＝runを明示モデル化、孤立16分は稀）。
3. **division-level syncopation（ツッコミ/前借り）**：8分/4分の音を**16分ぶん早める**確率を位置別に学習＝pop の食い。骨格(WuYun)の「シンコペした長音」とも接続。
4. **ピッチ**：追加16分onsetも **move歩き**で歩く（既存）＝跳躍/順次/同音は実分布のまま。新規ピッチ論理 不要。
5. **microtiming（任意・後段）**：量子化グリッドの後に **long-range correlated な微小タイミング揺れ**を足す humanize step（ランダムでなく1/f的）。記号品質が固まってから。

## 4. 段取り
1. **量子化して16分を再測**（厳密な走句位置・シンコペ率・run長分布）＝交絡を除く。← まず分析
2. **16スロット・リズム語彙＋走句モデル**を学習（8分の learnBarRhythms を16分解像度へ）。
3. 生成＝8分グリッドの上に**走句で16分を挿入**＋ツッコミ前借り、ピッチは move歩き。
4. 評価＝16分音価率(~44-56%)・走句率(66%)・シンコペ率（量子化後の実測値）に合わせる。
5. （任意）microtiming humanize。

## 出典
[OpenMusicTheory pop rhythm](https://viva.pressbooks.pub/openmusictheory/chapter/rhythm-and-meter-in-pop-music/) / [LibreTexts pop syncopation](https://human.libretexts.org/Bookshelves/Music/Open_Music_Theory_1e/08:_Pop/Rock_Music/8.01:_Rhythm_-_Syncopation_in_Pop/Rock_Music) / [Popgrammar rhythm](https://popgrammar.com/rhythm/) / [Microtiming & groove (Frontiers)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01232/full) / [PocketVAE groove](https://arxiv.org/pdf/2107.05009) / [Swing/humanize](https://blog.samplefocus.com/blog/swing-shuffle-and-humanization-how-to-program-grooves/) / [Temporal Structure Augmentation](https://arxiv.org/pdf/2004.10246) / [Controllable Deep Melody](https://arxiv.org/pdf/2109.00663)
