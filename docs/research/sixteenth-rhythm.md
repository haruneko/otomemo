# 16分リズム生成：外部調査＋POP909実測＋設計

目的＝**8分の次の層（16分）をどう生成するか**。骨格(2拍)→8分→**16分**の最終解像度層。耳不要のリサーチ。最終更新 2026-06-28。

## 0. 結論
- **16分は“走句(run)”で来る**＝孤立せず連続（POP909で16分onsetの66%が連続）。＝**16分は「8分の間を埋める短い走り」**。
- **16分の本質＝弱い細分＝シンコペ(ツッコミ/前借り)の温床**。「note を16分ぶん早める＝division-level syncopation」が groove を生む。
- **groove の微妙さ＝microtiming**＝**量子化グリッドとは別の post-step**（long-range correlated な揺れ。ランダムでない）。記号生成では後回しで可。
- **ピッチは move歩きが既に処理**＝16分は**主にリズムの精緻化**（16グリッド＋走句＋シンコペ）。新しいピッチ論理は不要。

## 1. 外部調査
- **16分＝最弱の細分**：拍を8分→16分と割るほど弱拍化＝**シンコペの第一候補**。**division-level syncopation**＝「1区分の音列を1細分ぶん早くずらす」＝16分前借り。pop のボーカルは**かなりオフビート**（拍頭の音すらオフに聞こえるほど）。[OpenMusicTheory](https://viva.pressbooks.pub/openmusictheory/chapter/rhythm-and-meter-in-pop-music/) / [Popgrammar](https://popgrammar.com/rhythm/) / [LibreTexts 8.1](https://human.libretexts.org/Bookshelves/Music/Open_Music_Theory_1e/08:_Pop/Rock_Music/8.01:_Rhythm_-_Syncopation_in_Pop/Rock_Music)
- **groove＝microtiming（深掘り）**：拍からの微小ズレ(数〜数十ms)が groove/swing を生む。★**実証：聴き手は long-range correlated(LRC/1/f的) な揺れを、無相関ランダムより有意に好む**＝市販 humanize(無相関乱数)は弱い（[Hennig: Nature & Perception of Fluctuations in Human Musical Rhythms](https://pmc.ncbi.nlm.nih.gov/articles/PMC3202537/)）。**jazz/rockのLRCは2過程**＝短時間(<8拍)=単発拍の microtiming／長時間=緩いテンポdrift（[Correlated microtiming deviations, PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0186361)）。
  - **1/f論争(注)**：1/fが真のLRCか議論あり＝**リズム階層由来の短距離自己相関でも1/f的に見える**（[Origins of 1/f from short-range autocorrelations](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6502337/)）。＝実装は「階層構造＋程よい相関」で足り、厳密1/fは必須でない。
- **groove生成＝2段モデル**：構造層(onset/dur/pitch)と**表現層(microtiming＋velocity)を分離**して学習・制御（[PocketVAE](https://arxiv.org/pdf/2107.05009)）＝我々も「記号グリッド」と「humanize層」を分けるのが正。
- **メトリカル階層＋16分の符号化（深掘り）**：tatum(最速)→tactus(拍)。**2拍パターン単位で生成**でメトリカル構造保持。表現は**1拍=12分割**にすると**16分も3連符も正確に量子化**できる（[FIGARO fine-grained control](https://www.researchgate.net/publication/358142515_FIGARO_Generating_Symbolic_Music_with_Fine-Grained_Artistic_Control) / [Temporal Structure Augmentation](https://arxiv.org/pdf/2004.10246) / [Controllable Deep Melody](https://arxiv.org/pdf/2109.00663)）。位置token(小節+拍内細分)で符号化。
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
1. **16グリッド化**：リズム語彙を8スロット/小節→**16スロット/小節**へ。**2拍パターン単位**で学習（メトリカル構造保持）。将来3連符も扱うなら**1拍=12分割**(16分+3連を両立)が定石。
2. **走句(run)を学習**：16分は連続で来る＝**「8分onsetの間を16分で割って走る」位置別確率**を学習（66%連続＝runを明示モデル化、孤立16分は稀）。
3. **division-level syncopation（ツッコミ/前借り）**：8分/4分の音を**16分ぶん早める**確率を位置別に学習＝pop の食い。骨格(WuYun)の「シンコペした長音」とも接続。
4. **ピッチ**：追加16分onsetも **move歩き**で歩く（既存）＝跳躍/順次/同音は実分布のまま。新規ピッチ論理 不要。
5. **microtiming（任意・後段＝2段モデルの表現層）**：量子化グリッドの後に **correlated な微小タイミング揺れ＋velocity**を足す humanize step（**無相関ランダムでなく**＝LRC/階層相関）。短時間=拍内ゆれ＋長時間=緩テンポdrift の2成分。記号品質が固まってから（[PocketVAE](https://arxiv.org/pdf/2107.05009) の構造層/表現層分離）。

## 4. 段取り
1. **量子化して16分を再測**（厳密な走句位置・シンコペ率・run長分布）＝交絡を除く。← まず分析
2. **16スロット・リズム語彙＋走句モデル**を学習（8分の learnBarRhythms を16分解像度へ）。
3. 生成＝8分グリッドの上に**走句で16分を挿入**＋ツッコミ前借り、ピッチは move歩き。
4. 評価＝16分音価率(~44-56%)・走句率(66%)・シンコペ率（量子化後の実測値）に合わせる。
5. （任意）microtiming humanize。

## 出典
**理論/シンコペ**：[OpenMusicTheory pop rhythm](https://viva.pressbooks.pub/openmusictheory/chapter/rhythm-and-meter-in-pop-music/) / [LibreTexts pop syncopation](https://human.libretexts.org/Bookshelves/Music/Open_Music_Theory_1e/08:_Pop/Rock_Music/8.01:_Rhythm_-_Syncopation_in_Pop/Rock_Music) / [Popgrammar rhythm](https://popgrammar.com/rhythm/)
**microtiming/groove（深掘り）**：[Hennig: Fluctuations in Human Musical Rhythms](https://pmc.ncbi.nlm.nih.gov/articles/PMC3202537/)（LRC>無相関を実証）/ [Correlated microtiming, PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0186361)（jazz/rock 2過程）/ [Origins of 1/f from short-range](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6502337/)（1/f論争）/ [PocketVAE groove 2段](https://arxiv.org/pdf/2107.05009) / [Swing/humanize](https://blog.samplefocus.com/blog/swing-shuffle-and-humanization-how-to-program-grooves/)
**生成/符号化（深掘り）**：[FIGARO fine-grained control](https://www.researchgate.net/publication/358142515_FIGARO_Generating_Symbolic_Music_with_Fine-Grained_Artistic_Control)（1拍12分割で16分+3連）/ [Temporal Structure Augmentation](https://arxiv.org/pdf/2004.10246) / [Controllable Deep Melody](https://arxiv.org/pdf/2109.00663)
