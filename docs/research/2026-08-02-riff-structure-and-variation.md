# リフ/オスティナートの構造論と「手癖回避」のための controlled variation（外部調査）

調査日: 2026-08-02。外部Web調査＋理論整理。他者楽曲のリテラル採譜は含めない（型・統計・理論のみ）。

## 設計含意（5行）

1. リフ生成は「和声との関係の型」（移調型/固定型/ペダル型/微調整型）を明示パラメータに持つべき＝この型がリフの性格（ブルース感/緊張感/ドローン感）をほぼ決める。
2. 既定値は「反復単位1〜2小節・実音4〜7個・リズム輪郭が主役」＝良いリフの経験則は「単純さ×リズムの推進力」で、音数の多さは要件でない。
3. 手癖回避は無方向のランダムでなく controlled variation＝直交軸（ピッチ列/リズム/輪郭/和声関係）のうち1本だけ変換し他を保持する操作の組として実装する。
4. 候補集合は「元ネタとの類似度」×「特徴軸（音域・密度・シンコペ度）」でビン分けして各ビンの代表を提示（MAP-Elites 式）＝似すぎ〜離れすぎのグラデーションを一望させる。
5. 類似度メトリクス（Mongeau–Sankoff 系編集距離）はガードレール（似すぎ検知・手癖検知）に使い、良し悪しの裁定はオーナーに残す＝評価器を fitness にしない方針と整合。

---

## A. リフ/オスティナートの構造論

### A-1. 定義と分類

- オスティナート＝同一声部で執拗に反復される音型。ポピュラー音楽の「リフ」はほぼ同義で、ロック/ジャズでは即興の土台（vamp）としても機能する。
- 反復される素材の種類で3分類できる：**リズム型**（音高を持たない/従属的なパターン）・**メロディ型**（音高列が主役）・**和声型**（進行そのものの反復）。
- 厳密にはオスティナートは「完全反復」だが、実用上は「和声や調の変化に合わせた改変を含む反復」まで含めて呼ぶ＝リフの実態はこちら。
- ペダルポイント＝和声が動く中で持続する1音（語源はオルガンの足鍵盤）。ルートか5度が典型。リフと組み合わさって「静と動の対比」を作る。
  - 置く場所で3種：**バスペダル**（最低声部・伝統形）・**上声ペダル**（最上声で反復）・**内声ペダル**（中間声部の共通音）。

出典:
- https://hellomusictheory.com/learn/ostinato/
- https://www.musictheoryacademy.com/understanding-music/ostinato/
- https://www.numberanalytics.com/blog/ultimate-guide-ostinato-music-theory
- https://www.premierguitar.com/lessons/the-art-of-repetition-a-guide-to-pedal-points-and-ostinatos

### A-2. 長さと反復単位

- 実用上の主流は **1〜2小節の反復単位**（機械生成の文脈でも 2-bar loop が標準粒度として扱われる。例: MusicVAE の 2-bar モデル）。4小節型は「リフ」より「進行＋リフ」の複合になりやすい。
- 反復単位の内部構造は「前半＝提示・後半＝応答（または休符/空白）」の呼応形が多い＝空白がグルーヴの呼吸になる。
- 同じ音高列でも**拍子・リズムのグルーピングを変えるだけで別のリフになる**（3+3+2 等の非対称グルーピング、ヘミオラ）。＝「音高列」と「リズム格子への載せ方」は独立した設計軸。
- 反復回数の目安：リフは曲中の複数箇所（イントロ/バース/コーラス）に再登場して記憶を固定するが、単調化とのバランスが必要＝「配置の設計」もリフ設計の一部。

出典:
- https://magenta.tensorflow.org/music-vae （2-bar loop を基本粒度とする設計）
- https://www.premierguitar.com/lessons/the-art-of-repetition-a-guide-to-pedal-points-and-ostinatos （同一音高内容のリズム再グルーピング）
- https://www.riffhard.com/what-is-a-guitar-riff/ （曲中の複数箇所での再登場）

### A-3. 和声との関係＝4つの型

リフがコード進行とどう付き合うかで、少なくとも4型に整理できる。

| 型 | 動作 | 性格・典型文脈 |
|---|---|---|
| **移調型** | リフ全体をコードのルートに合わせて平行移動 | ブルース/ロックの基本（I-IV-V で丸ごと移調）。統一感が強く、進行がリフで聴こえる |
| **固定型** | 同一音型のままコードだけ変わる | コードトーン/テンションの関係が刻々変わり緊張が波打つ。ミニマル/ポストロック/映画音楽的 |
| **ペダル型** | リフ内に持続・反復する共通音（ルート/5度）を含み、他声部が動く | ドローン感・緊張の蓄積。バス/上声/内声の3配置 |
| **微調整型** | リフの骨格は保持し、衝突する音だけコードトーンへ差し替え | ポップスで最も実用的。「同じリフに聴こえるが濁らない」の折衷 |

- 移調型に「してはいけない」規則はなく、移調・反転・逆行・リズム差し替えは全て許容される＝型の選択は文体の選択。
- 固定型・ペダル型の緊張は「静（反復）と動（和声）の対比」から来る＝対比が無いと単なる停滞になる。

出典:
- https://www.quora.com/What-is-the-difference-between-an-ostinato-and-a-riff-in-music （移調の可否・ブルースでの常用）
- https://www.premierguitar.com/lessons/the-art-of-repetition-a-guide-to-pedal-points-and-ostinatos （ペダル型の分類と対比原理）
- https://www.numberanalytics.com/blog/ultimate-guide-ostinato-music-theory （和声変化に合わせた改変を含む反復）

### A-4. 楽器イディオム

- **ギター**: 低音弦＋パワーコード、開放弦をペダルにしたフレット音との交互（開放弦ペダルはギター固有の得），ミュートによるリズム分節。音色（歪み）がリフの知覚を大きく左右する＝同じ音列でも歪みで別物。
- **ベース**: リフ＝ベースラインを兼ねることが多い。要件は「明確な旋律輪郭」＋「和声進行を単独で暗示できること」＋「トニックの明確な確立から始まること」。ルート・5度・経過音が骨格。
- **シンセ**: アルペジエータ/ステップシーケンサがオスティナート製造機＝押さえた和音を機械的に分散・反復。16分格子＋ゲート/アクセント/フィルタの時間変化で、音高列を変えずに表情を変えるのがイディオム（アシッド系の常套）。
- **オルガン**: ペダルポイントの語源＝足鍵盤の持続低音。持続音（サステイン無限）を活かしたドローン/ペダルと、パーカッシブな刻みの両極が使える。ベースライン担当楽器としても伝統がある。

出典:
- https://www.premierguitar.com/lessons/the-art-of-repetition-a-guide-to-pedal-points-and-ostinatos （開放弦・ペダル）
- https://www.opussciencecollective.com/post/bottoms-up-composing-bass-lines （ベースラインの要件）
- https://www.attackmagazine.com/technique/passing-notes/ostinatos-and-acid-house-riffs/ （シンセ/シーケンサのオスティナート技法）
- https://study.com/learn/lesson/ostinato-music-history-examples.html （ステップシーケンサ/アルペジエータ）

### A-5. 「良いリフ」の特徴（理論＋実証）

経験則（実務家の整理）:
- **少数の音で成立する単純さ×記憶性**＝一聴で口ずさめる。数音のリフが世界的フックになる例が繰り返し挙がる＝技巧は必須でない。
- **リズムの推進力**＝リフの同一性の半分はリズムにある。シンコペでも直進でもよいが「それ自体のリズムの顔」を持つ。
- **反復による定着**＝曲中の複数箇所に再登場。ただし単調化との均衡。
- **音色の寄与**＝生成対象外だが、評価時は音色込みで聴く前提を忘れない。

実証（earworm＝無意識反復想起の研究、Jakubowski らのチャート曲比較）:
- 耳に残る曲は **大域的な旋律輪郭がありふれている**（アーチ型等の典型輪郭）一方、**転回点間の勾配（跳躍の付き方）は平均より珍しい**＝「輪郭は定石・細部に個性」という非対称。
- **テンポは速め ▶ 耳に残りやすい**傾向。
- ただし単一の「キャッチー公式」は特定できず、複数の式が必要と結論＝生成側は単一スコア最適化でなく多様な型の提示が正解、という含意。

出典:
- https://www.fender.com/articles/songs/guitar-riffs
- https://unison.audio/what-is-a-riff-in-music/
- https://www.riffhard.com/what-is-a-guitar-riff/
- https://www.schoolofcomposition.com/hooks-and-riffs-in-music/ （フックとリフの区別）
- https://www.semanticscholar.org/paper/Dissecting-an-earworm:-Melodic-features-and-song-Jakubowski-Finkel/efd321a0c7661d66777389120af13e573d844121
- https://journals.sagepub.com/doi/10.1177/20592043231165661 （複数公式が必要という限界の指摘）

---

## B. 手癖回避＝controlled variation（似て非なるパターンの作り方）

### B-1. モチーフ変換の古典分類（操作のカタログ）

モチーフを保ちながら別物にする変換は古典理論でほぼ網羅されている：

- **移調 (transposition)**・**ゼクエンツ (sequence)**＝音列を別の音高段へ平行移動（調内/実移調）
- **反行 (inversion)**＝音程の上下を反転
- **逆行 (retrograde)**・**逆行反行 (retrograde inversion)**＝時間順を反転（±反行）
- **拡大 (augmentation)**・**縮小 (diminution)**＝音価を伸縮
- **断片化 (fragmentation)**＝モチーフの一部だけ取り出して使う
- **リズム保持×ピッチ差し替え / ピッチ保持×リズム差し替え**＝同一性の錨を片軸に置く
- **装飾/簡約**＝経過音・刺繍音の追加や除去

重要なのは「各変換は**何を保存し何を壊すか**が異なる」こと。手癖回避の文脈では、**手癖の同一性がどの軸に宿っているか**（音程列か・リズム型か・輪郭か）を特定し、その軸だけを壊す変換を選ぶのが合理的。

出典:
- https://fiveable.me/key-terms/ap-music-theory/motivic-transformation
- https://www.vaia.com/en-us/explanations/music/music-theory/motive-development/
- https://www.singanewsong.org/byu/theory/grad_review/Motivic%20Transformations.pdf
- https://en.wikipedia.org/wiki/Retrograde_inversion

### B-2. Developing variation＝「一貫性と多様性」の同時達成原理

- Schoenberg の developing variation＝「基本モチーフの変奏によって次々とモチーフ形を生み出す」技法。反復が構造の一貫性を、変奏が単調の回避を担う＝**style-preserving variation の理論的原型**。
- 「基本単位の特徴の変奏が、流暢さ・対比・多様性・論理・統一を一方で、性格・気分・表情を他方で生む」＝変奏は装飾でなく生成原理。
- 手癖回避への読み替え：手癖パターンを「基本モチーフ」と見なし、そこから developing variation の距離を段階的に伸ばした族を作れば、「自分の文体のままで同一でない」候補が得られる。

出典:
- https://en.wikipedia.org/wiki/Developing_variation
- https://mtosmt.org/issues/mto.15.21.4/mto.15.21.4.salley.html
- https://anam.com.au/anam-blog/schoenberg-on-brahms

### B-3. 計算的手法＝類似を制御しながら変える

- **類似度バイアス付きサンプリング**: Mongeau–Sankoff 系の旋律類似度をグラフィカルモデルの制約に組み込み、「テーマに似た」リードシート変奏を生成。類似の強度が連続パラメータで調整可能＝「似せ具合のツマミ」の直接の先行例。
  - https://arxiv.org/pdf/1703.00760 （Sampling Variations of Lead Sheets）
- **潜在空間操作**: MusicVAE＝旋律を潜在ベクトルに埋め込み、(a) 2旋律間の補間で「中間の性格」を合成、(b) 属性ベクトルの加減算で狙った特徴だけを増減（副作用が少ない）。style-preserving variation の実装として最も直接的。
  - https://magenta.tensorflow.org/music-vae
  - https://arxiv.org/pdf/1803.05428 （階層潜在モデル本体）
  - https://arxiv.org/pdf/1912.05537 （Transformer autoencoder による大域スタイルと旋律の分離制御）
- **簡約→再生成**: 旋律を骨格（reduction）に還元してから表面を作り直す＝骨格保持・表面差し替えの controlled variation。簡約が正確なほど変奏の一貫性が上がるという報告。
  - https://arxiv.org/pdf/2508.01571 （最短経路による自動旋律簡約・下流の変奏生成を想定）
- **構造モデリングの総説**: モチーフ・フレーズ階層をどう生成系に入れるかのサーベイ（反復・変奏構造の扱いを概観）。
  - https://arxiv.org/pdf/2403.07995
- **数理的変奏**: KAM 理論に基づく変奏ピッチ集合の生成という変わり種もある（発想の参照用）。
  - https://arxiv.org/pdf/2401.07779

### B-4. 類似度×新規性のバランス評価

- 変奏生成の中心課題は「**元曲が知覚できる程度に似せつつ、新規性を確保する**」バランスそのものだと明示されている（進化計算での定式化：旋律類似度と多様性を別々の進化因子にする）。
  - https://computationalcreativity.net/iccc20/papers/142-iccc20.pdf
- 新規性の定量化は未解決に近い＝人手作品との距離最大化などの提案はあるが決定打なし。サーベイでも評価が最大の難所とされる。
  - https://dl.acm.org/doi/10.1145/3597493
  - https://arxiv.org/pdf/2011.06801
- earworm 研究の「単一公式は無い」という結論（A-5）と合わせると：**類似度は下限/上限ガードレール（同一すぎ＝手癖・盗用検知／遠すぎ＝文体喪失検知）として使い、その帯域内の良し悪しは人間が裁く**のが現実解。

### B-5. 多様な候補集合を出す手法（quality-diversity）

- **MAP-Elites**: 特徴空間をグリッドに離散化し、各セルに「その特徴を持つ最良個体」を保存する quality-diversity アルゴリズム。「全員が高品質かつ互いに異なる」候補アーカイブが得られる＝単一最適解でなく**性格違いの品揃え**を出す枠組み。
  - https://www.emergentmind.com/topics/map-elites-algorithm
  - https://arxiv.org/pdf/2007.05352 （Multi-Emitter MAP-Elites＝探索効率の改良）
- 音・音楽への適用：音響オブジェクト探索での品質/多様性軸の定義研究、教師なしで特徴軸を学習する VQ-Elites、クリエイティブ領域のマルチモーダル版など。
  - https://arxiv.org/pdf/2512.02783
  - https://arxiv.org/html/2504.08057v1
  - https://arxiv.org/html/2403.07182
- **Human-in-the-loop**: 候補提示→人間の好み→ベイズ最適化で次候補、という対話型生成も先行例あり＝「候補まで機械・仕上げは人間」の思想と合う。
  - https://arxiv.org/pdf/2010.03190

### B-6. 手癖回避への運用整理（本調査からの型）

1. **手癖の指紋を取る**: 自作コーパスから頻出 n-gram（音程列・リズム列）を抽出し「手癖辞書」を持つ。生成候補がこの辞書に近すぎたら警告（類似度メトリクスの下限ガードレール）。
2. **軸を1本だけ壊す**: リズム保持×ピッチ変換／ピッチ保持×リズム変換／輪郭保持×細部差し替え、を明示メニューにする（B-1 の分類が操作カタログ）。
3. **距離の階段で提示**: 元パターンから変換1回・2回・3回…の族を作り、類似度でソートして「近い→遠い」の階段で見せる（B-2 の developing variation の機械化）。
4. **品揃えはビンで保証**: 特徴軸（音域・音密度・シンコペ度・和声関係型）でビン分けし各ビン代表を出す＝MAP-Elites 式。同じビンから複数出さない。
5. **裁定は人間**: 帯域内の候補の優劣を機械が決めない＝評価器はふるい（ガードレール）まで。

---

## 出典一覧（URL）

- https://hellomusictheory.com/learn/ostinato/
- https://www.musictheoryacademy.com/understanding-music/ostinato/
- https://www.numberanalytics.com/blog/ultimate-guide-ostinato-music-theory
- https://www.premierguitar.com/lessons/the-art-of-repetition-a-guide-to-pedal-points-and-ostinatos
- https://www.opussciencecollective.com/post/bottoms-up-composing-bass-lines
- https://www.attackmagazine.com/technique/passing-notes/ostinatos-and-acid-house-riffs/
- https://study.com/learn/lesson/ostinato-music-history-examples.html
- https://www.quora.com/What-is-the-difference-between-an-ostinato-and-a-riff-in-music
- https://www.fender.com/articles/songs/guitar-riffs
- https://unison.audio/what-is-a-riff-in-music/
- https://www.riffhard.com/what-is-a-guitar-riff/
- https://www.schoolofcomposition.com/hooks-and-riffs-in-music/
- https://www.semanticscholar.org/paper/Dissecting-an-earworm:-Melodic-features-and-song-Jakubowski-Finkel/efd321a0c7661d66777389120af13e573d844121
- https://journals.sagepub.com/doi/10.1177/20592043231165661
- https://fiveable.me/key-terms/ap-music-theory/motivic-transformation
- https://www.vaia.com/en-us/explanations/music/music-theory/motive-development/
- https://www.singanewsong.org/byu/theory/grad_review/Motivic%20Transformations.pdf
- https://en.wikipedia.org/wiki/Retrograde_inversion
- https://en.wikipedia.org/wiki/Developing_variation
- https://mtosmt.org/issues/mto.15.21.4/mto.15.21.4.salley.html
- https://anam.com.au/anam-blog/schoenberg-on-brahms
- https://arxiv.org/pdf/1703.00760
- https://magenta.tensorflow.org/music-vae
- https://arxiv.org/pdf/1803.05428
- https://arxiv.org/pdf/1912.05537
- https://arxiv.org/pdf/2508.01571
- https://arxiv.org/pdf/2403.07995
- https://arxiv.org/pdf/2401.07779
- https://computationalcreativity.net/iccc20/papers/142-iccc20.pdf
- https://dl.acm.org/doi/10.1145/3597493
- https://arxiv.org/pdf/2011.06801
- https://www.emergentmind.com/topics/map-elites-algorithm
- https://arxiv.org/pdf/2007.05352
- https://arxiv.org/pdf/2512.02783
- https://arxiv.org/html/2504.08057v1
- https://arxiv.org/html/2403.07182
- https://arxiv.org/pdf/2010.03190
