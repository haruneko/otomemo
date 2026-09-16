# リフの繰り返しにおけるリズムの変奏 — 要るか・入れるならどう入れるか（研究）

調査日: 2026-09-16。依頼＝変奏の層の設計（`../drafts/2026-09-15-riff-variation-layer-design.md` §12・オーナー原文「リズムのずらしとか含めて必要なら研究してほしい」）。**コードは変えていません**。外部調査（出典 URL 付き）＋ otomemo 内の既存の仕組みとの重なり＋源流 phrase_maker の一次資料（読むだけ）＋文法表と7ドラム型の打点を突き合わせた机上の実測から成ります。他者の楽曲のリテラルなリズム・フレーズは持ち込んでいません（手法の説明と統計だけ）。

## 0. 結論（15行）

1. **リズムの変奏は「要る／要らない」を一律には言えません。条件付きです。** 音高と間（断片化・単音化・ゴースト）だけの変奏で出るのは「輪郭が変わる・空白ができる・薄くなる」種類の動きです。**「前へ進む感じ（推進力）」「キックと別の模様を作るノリ」「長短の対比」は、打点そのものを動かさないと出ません**（§4）。オーナーの苦情が前者（輪郭・空白）で足りるなら不要、後者（推進力・模様）を求めるなら要ります。判定は試聴帳（§8）で耳が下します。
2. **ノリ（もたり・前ノリ・スイング・揺れ）は本研究の対象外**＝演奏レイヤー（feel 層）の管轄で、変奏の層には入れません（確定裁定・`design.md:2095-2102,2159`）。本研究の「リズムの変奏」は**16分格子の整数 step 上で打点を動かす・足す・減らす作曲上の操作**だけを指します（§1）。
3. 外部の手法の整理（§2）：ロック／ポップスの伴奏で定番なのは **前倒し（アンティシペーション）が圧倒的**で、ロックのシンコペーションはほぼ「強拍の直前に鳴らす」形です（Tan・Lustig・Temperley 2019）。ほかに 後ろずらし（次の頭への食い）・分割（8分→16分2つ）・結合（タイ）・休符への置き換え・3-3-2 の再グルーピング・句末の密度上げ・応答側だけ変える呼応、があります。
4. **入れるなら候補の順は**（衝突しにくい順・§7-1）：**R3 分割（空いている奇数 step にピッチ付き16分を足す）＞ R1 答句の16分前倒し ＞ R2 最後の答句を次の頭へ食わせる（step 31）＞ R4 結合（タイ）＞ R5 3-3-2 ＞ R6 8分単位のずらし（非推奨）**。
5. **衝突しにくい条件＝「偶数 step → 奇数 step」の移動・追加に限ること。** 7ドラム型（真因調査の63条件と同じ）のキックは `samba.simplified` 等を除き**全部偶数 step**にあり、奇数 step にキックがあるのは `beat16.ghost` の step 11 だけでした（§5-1 表）。8分単位（偶数→偶数）のずらしはキック・頭（step 24）・和音追従の強拍に当たります。**保護 step（キック）の判定は入力のドラムから毎回計算する**（表の相場を決め打ちしない）。
6. **錨の約束（変わり目のキックは必ずルート）とは構造上ぶつかりません**：奇数 step にはキックが無いので錨の (a)(b) の対象にならず、(c) 挿入は元の打点を消したときだけ起きる＝**元の打点がキック step なら動かさない**（保護集合に入っている）。和音追従は「強拍＝コードトーン」なので、前倒しで弱拍へ移った音は**むしろ丸められにくくなる**（ギターの中の可聴差が小さい問題の緩和になる可能性・§5-2）。
7. **置き場は最後の反復単位の答句だけ**（Biamonte 2014「メトリック不協和は句・セクションの区切りに働く」／実務家「1セクションに押しは1か所」）。**中には入れない・多めか、試聴用の第4候補**（§7-3）。
8. **源流 phrase_maker にリズムのずらしを耳で採否した記録はありません**＝残課題「変位(ずらし)の自動生成」のまま未着手（`HANDOFF-NEXT.md:25`）。源流の「盛り盛りはわざとらしい」は**フィール層（揺れ）**への判定で、作曲上のずらしの判定ではありません（§3-2）。ただし「打点を振っても“バリエーション止まり”で質は動かなかった」というピアノの耳記録はあり（§3-2）、期待値を上げすぎない根拠になります。
9. **試聴で聴き比べるもの**（§8）：同じ3条件・4小節で「多め（音高と間）」と「多め＋R1」「多め＋R3」「多め＋R2」を**伏せた名で**並べ、①同じリフに聴こえるか ②動いた感じが増えたか ③わざとらしいか ④キックと喧嘩していないか、をベース＋ドラムのみ／バンド込みの両方で。加えて**ベースとギターの両方に同じ前倒し**を掛けたものと**片方だけ**を並べる（Sioros 2022「模様は楽器を跨いで作られる」）。
10. **推し**（材料としての私の見立て・物差しはオーナー）：まず R3（打点を動かさず足す）と R1（16分前倒し）の2本だけを試聴帳に載せる。R2・R4・R5 は耳が「まだ足りない」と言ったときの次の弾。8分ずらし（R6）は載せない。

## 1. 用語の切り分け — 作曲上のリズム変奏と、ノリ

| | 何を変えるか | どこに書くか | otomemo の管轄 | 本研究 |
|---|---|---|---|---|
| **作曲上のリズム変奏** | 16分格子上の**打点の位置・数・長さ**（整数 step） | スコア（notes／hits） | データ層＝`push`／`drumLock`（メロの前借り）・`pickup`・`flow` などと同じ棚（`design.md:2099`「compositional（譜面に書ける）はデータ層」） | **対象** |
| **ノリ（feel）** | 打点の**格子からの微小なずれ**（swing の系統的ワープ・humanize の相関揺れ・部位別オフセット） | `content.feel`（宣言）→ 再生／MIDI 書き出しの境界で `applyFeelEnsemble` が一度だけ適用 | feel 層（`design.md:2095-2102`・B1 裁定 `:2159`「スコアはストレートのまま・二重掛け禁止」） | **対象外**（変奏の層には入れない） |

区別の一文テスト：**「譜面に書けるか」**。「8分裏に置く」「16分前に食う」「タイでつなぐ」は譜面に書けるので作曲。「少し遅らせて弾く」「跳ねさせる」は書けないので演奏。外部の用語でも、シンコペーション（拍の中のどこにアクセントを置くか）とスイング（すべての裏拍の一律なずれ）は別物と整理されています（[Ethan Hein 2024](https://www.ethanhein.com/wp/2024/what-is-syncopation/)）。

設計上の含意：変奏の層（`packages/music-core/src/riffVariation.ts`）は `RiffCell.step` を**整数**でしか持たないので、構造上ノリを書けません。この性質を不変条件として明記しておけば（出力の step はすべて整数 0..31）、後からリズムのレバーを足しても feel 層と二重にならないことが機械で担保できます。

## 2. リズムの変奏とは何か — 手法の整理（外部出典）

繰り返しの中でリズムを変える定番の手法を、「何を保存し何を壊すか」（`2026-08-02-riff-structure-and-variation.md` B-1 の見方）で並べます。otomemo の格子（1小節16 step・2小節＝1反復単位32 step）での定義を添えます。

| # | 手法 | 一般的な説明 | 保存するもの／壊すもの | otomemo 格子での定義 | 出典 |
|---|---|---|---|---|---|
| R1 | **前倒し（アンティシペーション）** | 次の強拍に来るはずの音を、その直前の弱い細分で先に鳴らす。ロック／ポップスのシンコペーションの主形。「音の列の最初の音価を半分に切り、残りをその分だけ早める」 | 音高列・音の数を保存／打点の位相を壊す | 対象セルの `step` を −1（16分）または −2（8分）。前の音は詰まる（音価＝打点間隔×ゲートなので自動） | [Open Music Theory「Rhythm and Meter in Pop Music」](https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/07:_Popular_Music/7.01:_Rhythm_and_Meter_in_Pop_Music)（division-level syncopation の定義）／[Tan・Lustig・Temperley 2019 *Anticipatory Syncopation in Rock: A Corpus Study*](https://online.ucpress.edu/mp/article-abstract/36/4/353/62973/Anticipatory-Syncopation-in-Rock-A-Corpus-Study)（ロックのシンコペは「強拍の直前にアクセント音」という特定の形をとる。二次資料 [Song Cage](https://songcage.com/blog/syncopation/) によれば80曲で8分レベルのシンコペの約77%が1・3拍の直前） |
| R2 | **後ろずらし・次の頭への食い** | フレーズの最後の音を遅らせて次の小節頭の直前に置く（＝次の頭に対する前倒し）。「同じリックを前の小節の4拍目の裏から始める」等 | 音高列を保存／句末の着地位置を壊す | 最後の答句 `step 30 → 31`（次の反復単位の頭 32 に16分で食う） | [Guitar World「Rhythmic Displacement」](https://www.guitarworld.com/lessons/jazz-guitar-corner-how-expand-your-jazz-chops-rhythmic-displacement)／[Premier Guitar「How to Steal from Yourself」](https://premierguitar.com/articles/21295-rhythm-rules-how-to-steal-from-yourself)（「フレーズのリズム構造を変えずに小節内での位置だけずらす。アクセントの位置が動き、線の性格と緊張が変わる」） |
| R3 | **分割（8分→16分2つ）** | 1音を同じ音高または隣の音で2つに割る。句末・フィル前の密度上げ | 打点の位置を保存／密度を壊す | 答句の直前または直後の**空いている奇数 step** に `kind:"note"` の16分を足す（ゴースト → ピッチ付きへの昇格を含む） | [Cooper Piano「Call-and-Response Rhythm Basics」](https://cooperpiano.com/call-and-response-rhythm-basics/)（応答側の「4分1つ→8分2つ」の小さな変奏）／自作研究 `sixteenth-rhythm.md` §0（16分は「8分の間を埋める短い走り」で来る・孤立しない） |
| R4 | **結合（タイ）・休符への置き換え** | 2音を1音に伸ばす／音を休符にする。「休符は音と同じだけグルーヴを形づくる」 | 位置を保存／密度・長短を壊す | 隣接する答句2セルを1セルに（後ろを削除）／セル削除 | [TalkingBass「How To Build A Funky Bass Line」](https://www.talkingbass.net/how-to-build-a-funky-bass-line/)／[Kalman「Bass Timing」](https://lessons.talkalmanmusic.com/blog/the-importance-of-timing-and-rhythm-in-bass-playing/)（「リズムは音だけでなく沈黙でもある」）。※設計の**断片化**は既にこの一種 |
| R5 | **3-3-2（トレシージョ）の再グルーピング** | 2拍を「付点8分＋付点8分＋8分」に割る。ポップスでは三連符より多い | 打点数を保存／拍の割り方（グルーピング）を壊す＝Krebs の grouping dissonance | 小節後半 step 8/11/14（頭は固定・答句2音を 11・14 へ） | Open Music Theory 同上（「トレシージョは多くのポップ／ロックで“本物の”三連符より一般的」）／[Biamonte 2014 *Formal Functions of Metric Dissonance in Rock Music*](https://mtosmt.org/issues/mto.14.20.2/mto.14.20.2.biamonte.html)（displacement と grouping の二分）／[Jajoria・Mäder・McDermott 2024 SMC「Prevalence of Tresillo Rhythm in Contemporary Popular Music」](https://smcnetwork.org/smc2024/papers/SMC2024_paper_id219.pdf)（Billboard Top20 1999–2019・444曲で採用傾向を追跡） |
| R6 | **8分単位のずらし（移置）** | リフ全体を8分ぶん前後に置き直す。「バースは表・コーラスで8分ずらすと勢いが出る」 | 音高列・リズム型を保存／格子との位相を壊す（Krebs の displacement dissonance） | 対象セル群の `step` を ±2 | [Guitar Club「Understanding Rhythmic Displacement」](https://www.guitarclub.io/blog/understanding-rhythmic-displacement)／[Guitar Wiz](https://guitarwiz.app/articles/rhythmic-displacement-guitar/)／Biamonte 2014 [2.1]「グルーピングは同じで、最初の単位の位置が前後に移る」 |
| R7 | **呼応の応答側だけ変える** | 同じ問いに、毎回少し違う答え。「バンドは同じ問い（リフ）を繰り返し、答えだけ毎回変わる」 | 提示（問い）を保存／応答を壊す | 設計の「答句だけ動かす」そのもの。R1〜R5 の当て先を答句に限る根拠 | [Wikipedia「Call and response (music)」](https://en.wikipedia.org/wiki/Call_and_response_(music))／[Bradley Sowash](https://bradleysowash.com/blog/call-and-response)／自作研究 `2026-07-14-riff-ostinato-design.md` :15（Easley 2015＝リフは「提示ジェスチャ＋対照／終止ジェスチャ」の2部構造） |

**手法の一般的な性格（出典から読めること）**
- **量より配置**：シンコペを除くとグルーヴは下がるが、**ランダムに足しても上がらず、量が増えると下がる**。原曲のシンコペは楽器を跨いで一つの模様（counter-meter）を作り、ハイハットとバックビートは据え置かれる（Sioros ら 2022・自作研究 `2026-07-14-syncopation-sweet-spot.md` §3）。
- **快は逆U**：中程度でピーク、山は低め寄り（Witek 2014／Stupacher 2022・同 §1–2）。
- **1か所に絞る**：「拍子は、シンコペしていない何かが保たなければならない。さもなくば新しいテンポを書いたことになる」「1セクションで押す場所を1つ選び、残りはそのままにする」（[Song Cage](https://songcage.com/blog/syncopation/)）。
- **形式上の位置**：ロックのメトリック不協和は**句やセクションの区切り**で働く（Biamonte 2014 [7.1]）。同じフレーズを繰り返しながら休符を1拍ずつずらすと反復ごとに緊張が積み、「やっと新しいものへ移ったという安堵」が生まれる＝**やり過ぎに注意**（Guitar Club 同上）。
- **リズムは同一性の担い手**：POP909 のメロディでは「リズム保存×音高差し替え」が「音高保存×リズム変形」の約10倍（8.4% 対 0.9%・自作研究 `2026-07-14-motif-transform-stats.md` :56）。メロディの統計なので伴奏リフへの外挿は慎重に読むべきですが、「リフの同一性の半分はリズム」（`2026-08-02-riff-structure-and-variation.md` A-5）と向きは一致します。

## 3. 既存の仕組みとの重なり（重複させないための確認）

### 3-1. otomemo 内

| 既存 | 何をするか | 変奏の層との関係 |
|---|---|---|
| メロの `push`／`anticipate`（`apps/api/src/music/melodyCells.ts:417-431`・`design.md:1942`） | 指定拍の音を16分前へ。**タイで跨ぐ（終端不変）・前の音より前へは出さない・前の音を詰める**。毎小節同じ拍を同じ量で食う＝反復と噛んでグルーヴになる、という注記 | **作曲上の前倒しの社内前例**。保護規則（終端不変・前音を越えない）はそのまま R1 に移せます。ただし対象はメロで、リフ（ベース・ギター）には無い |
| メロの `drumLock`（`melodyCells.ts:1434-1440`・`design.md:383`） | 「その拍頭の16分前に**実キック**が食っている」拍だけ前借り。**上限＝前借り ≤2/小節**（ユニゾン化ガード） | 「キックのある位置へ**寄せる**」発想。変奏の層は逆に「キックの位置は**触らない**」（保護集合）。両方とも“実キックを読む”点は同じ |
| ベースの `kickLock`／`snareGap`／`approach`（`design.md:297`） | キック共有率・スネア直前で音価を切る・変わり目直前の接近音 | いずれも**打点を動かさない**（音価・音高だけ）。錨経路とは排他 |
| 錨 (k)〜(k-6)（`design.md:2166-2200`） | 変わり目のキック＝必ずルート・滞在中のキック＝構成音も可・案B＝拍頭でない無音キックは休む | R1〜R5 は**キック step を保護**すれば構造上ぶつからない（§5-2） |
| feel 層（`design.md:2095-2102,2159`・`2026-07-11-swing-feel-layer-audit.md`） | swing／humanize を再生・MIDI 境界で一度だけ | **ノリはここ**。変奏の層は整数 step のみ（§1） |
| シンコペ密度スコア `lhlSyncScore`／`noriTargetBand`（`packages/music-core/src/syncopation.ts:66,127`・`design.md:2061`） | LHL 度数化・層別（drums/bass/melody）の「素直／跳ねる／攻める」帯。**審判にせずレンズ** | リズムのレバーを足したときの**診断値**（反復単位ごとの syncPerBar）に流用できます。ゲートにはしない |
| メロの `rhythmicContrast`（`design.md:1976-1982`） | 付点セルの注入＝長短の対比 | 「一律の音価は機械的」という耳判定の裏取り（`2026-07-21-melody-note-value-and-harmonic-rhythm.md`）。R4（結合）の根拠に流用できるが、仕組みはメロ専用 |
| ドラム型辞書（`apps/api/src/music/drumLibrary.ts:43-104`） | 1小節（`bars:1`）を各小節に敷く | **ドラム側は小節ごとに変わらない**＝保護集合は毎小節同じ（後述 §5-1）。源流のドラムは小節ごとにキックの variant を交替させていた（§3-2）＝リズムの動きをドラムに持たせる別の置き場があることは注記しておきます（範囲外） |

結論：**リフ（ベース・ギター）の打点を作曲上動かす仕組みは otomemo にありません**。メロの `anticipate` が最も近い前例で、保護規則を移植できます。

### 3-2. 源流 phrase_maker（読むだけ）

- **リズムのずらしを耳で採否した記録は無い**。`docs/HANDOFF-NEXT.md:25` に残課題「ベースの 4/4 リフ強化（現状は grammar+lock で半分生存）、fill×riff、**変位(ずらし)の自動生成**(ユーザー確認済みb案の種)」とあるだけで、LISTEN／ACCEPTANCE／CRITIQUE のどれにもずらしの試聴は無い（`grep -rn "変位\|ずら\|displace"` で確認）。「b案」の一次資料は見つかりませんでした（フィルの B案＝GMD 統計注入とは別物のはずですが特定できず）。
- **「盛り盛りはわざとらしい」はフィール層への判定**：`docs/CONCEPT.md` §2②「一様乱数の盛り盛りは『わざと臭い』と耳で却下済み＝less is more」、memory `phrase-maker-concept.md:36`「『人間ライン＋フィール層』は崩しがわざと臭すぎ」。いずれも**揺れ（humanize）**の話で、作曲上の打点変更の判定ではありません。
- **打点を振っても“バリエーション止まり”**：memory `feel-diagnosis.md:11,19`「品質が変わらない（打点/声部をいじってもバリエーション止まり）」「却下＝打点/声部のさらなる変種（ユーザーが実証したバリエーション止まり）」。ピアノ・コンピングでの記録ですが、**打点の変種は“違う”を作っても“良い”を作らない**という耳の証言として、本研究の期待値の上限になります。
- **源流の変奏は音高と断片化だけ**：ソロ生成器 `experiments/solo/solo.py:250-256,339-356` は「同じリズム細胞（cell）を提示→変奏で再利用、変奏は1段上から始める（移高）、応答は同じ cell を**切り詰めて**3拍目に着地」＝リズム細胞は動かさない。発散つまみ `bass_rock_riff/diverge.py:1-13` も「リズム骨格と頭の錨を固定し、非錨の note の**音高だけ**を変える」。設計の「音高と間だけで始める」は源流の流儀と一致しています。
- **ドラム側は小節ごとにキックを変えていた**：`experiments/drums/gen2/src/patterns.py:119-125` の `KICKS[...]["full"][variant % 2]`（例 straight8＝`[0,8,10]` と `[0,6,8,11]` を小節で交替）・`GHOST_STEPS` も同様。otomemo のドラムは1小節固定なので、この「リズムの動き」は移植されていません。
- 源流のドラムの「push」（`ensemble.py:1279-1284 spec_push_mode`）はキックのシンコペ位置を譜から拾う仕組みで、リフの打点変更ではありません。

## 4. 音高と間だけで、どこまで届き、どこから届かないか

設計の「音高と間」＝ゼクエンツ・断片化・拡大・装飾（`riffVariation.ts:94-179` の4レバー）。これで出る動きと出ない動きを分けます。

| 求める動きの種類 | 音高と間で出るか | 理由 |
|---|---|---|
| 輪郭が変わる（同じ形が別の高さで答える） | **出る**（ゼクエンツ・拡大） | 音高の差し替え |
| 空白・息（間） | **出る**（断片化＝休符化） | 打点を減らす。LHL の意味では「音の後に休符が来て、より強い位置が空く」ので**これ自体が既にシンコペーション**（`syncopation.ts:63-66`「休符/タイ同一視」）＝「間」はリズムの変奏の一種です |
| 薄くなる／濃くなる（密度） | **半分出る**（断片化で薄く・拡大で答句が増える） | 拡大は「役割の書き換え」なので打点数は増えない。**濃くする（分割）は出ない** |
| **前へ進む感じ（推進力・押し）** | **出ない** | 強拍の直前に鳴らす＝打点の位相を変える操作が必要（R1）。ギターの前例「8分前へ出すと勢いが出る／全部を前へ出すと逆に勢いが失せる」（[Guitar World 8分シンコペ](https://www.guitarworld.com/lessons/accelerate-your-rhythmic-understanding-with-this-lesson-on-eighth-note-syncopations)の要旨） |
| **キックと別の模様（counter-meter）** | **出ない** | 打点がキック集合の部分集合・同じ格子上にあるうちは模様が生まれない（Sioros 2022） |
| **長短の対比** | **出ない** | 音価は打点間隔×ゲートで決まるので、打点を結合・分割しないと一律のまま（真因 §3-4「同じ和音×34%ゲート×8回」） |
| ペダル（bar 1）の固さ | **出ない**（設計の範囲外） | 頭・ペダル・刻みは同一性の錨として触らない設計。ここが耳の「固い」の本体なら音高でもリズムでも届かず、案4（規則生成）の領分 |

ギター固有の事情：和音追従が音高差を丸めるので、中（ゼクエンツ）の可聴差は小さい見込み（設計 §4-2）。**R1 で前倒しされた音は強拍から弱拍へ移るので「隣の確定音の ±2 のスケール音」規則に変わり、コードトーンへの丸めを受けなくなる**（`guitarRiff.ts:390-426` の強拍規則）＝音高の変奏が生き残りやすくなる副作用があります。これは利点にも（差が出る）、欠点にも（強拍のコードトーン保証が1音減る）読めます。

## 5. リスク

### 5-1. キックとの噛み合わせ — 3文法の答句と7ドラム型の打点を突き合わせる

答句の位置（反復単位32 step・bar2 は 16..31）と、7ドラム型（真因調査の63条件と同じ）のキック step（小節内 0..15・`drumLibrary.ts:44-101`）：

| 文法 | 答句（`anchor:false`・role ∈ pickup/answer/blue/climb）の step | 小節内 |
|---|---|---|
| bass `pedal_answer`（`bassLibrary.ts:254-261`） | pickup 14／answer 26・28・30（ghost 27） | 14／10・12・14 |
| bass `gallop_pedal`（`:265-275`） | answer 14・blue 15／climb 30（31 は anchor） | 14・15／14 |
| bass `octave_call_response`（`:279-287`） | answer 12／answer 22・blue 28 | 12／6・12 |
| guitar `power_chug`（`guitarRiff.ts:76-88`） | pickup 15／answer 26・28・30（ghost 27） | 15／10・12・14 |
| guitar `pedal_answer`（`:90-100`） | pickup 14／answer 26・28・30（ghost 27） | 14／10・12・14 |
| guitar `gallop`（`:102-113`） | answer 14・blue 15／climb 30 | 14・15／14 |

| ドラム型 | キック step | 奇数 step のキック |
|---|---|---|
| beat8.basic | 0, 8 | なし |
| beat8.syncopated | 0, 8, 10, 12 | なし |
| beat16.basic | 0, 6, 8 | なし |
| beat16.ghost | 0, 6, 8, **11** | **11** |
| four.rock | 0, 4, 8, 12 | なし |
| halftime.basic | 0, 12 | なし |
| dbeat.basic | 0, 2, 6, 8, 10, 14 | なし |

読み方：
- **答句はほぼ偶数 step（8分格子）にあり、キックも7型では偶数 step にしかありません**（例外＝`beat16.ghost` の 11）。したがって **16分（±1 step）の移動＝偶数→奇数** は、7型中6型でキックに当たらず、残る1型でも当たるのは step 11 の1か所です。逆に **8分（±2 step）の移動＝偶数→偶数** は、`beat8.syncopated`／`four.rock`／`dbeat.basic` のキックに当たり、さらに **step 24（bar2 の頭・anchor）** に答句 26 がぶつかります＝R6 を非推奨とする直接の根拠。
- ただし辞書には奇数 step にキックを持つ型もあります（`samba.simplified`＝`[0,3,4,7,8,11,12,15]`・`drumLibrary.ts:95`、シャッフル系＝`:74,77`）。**「奇数なら安全」を決め打ちにせず、`protectedSteps` を入力のドラムから毎回作る**（設計 §6-2 の既定どおり）のが正しい形です。
- 答句が既にキック step に乗っている場合（例 `pedal_answer` answer 26＝小節内 10 は `beat8.syncopated`・`dbeat` のキック、28＝12 は `beat8.syncopated`・`four.rock`・`halftime` のキック、30＝14 は `dbeat`）は**動かせない**（保護）。この条件では R1 は答句3音のうち1〜2音だけ動く、または全く動かない＝**設計 §6-3 の「打ち消しの実測」をリズムのレバーにも掛けて数えて告げる**。

### 5-2. 錨（案2）・和音追従との衝突

- **錨**：変わり目のキック＝必ずルート／滞在中のキック＝構成音も可／体が休符なら挿入 (c)。リズムのレバーが**キック step のセルを動かさず・キック step へ移さず・キック step のセルを消さない**（設計の保護集合と同じ3条件）なら、錨の判定対象（キック step）は変奏前後で同じセル集合になり、契約は構造上保たれます。R4（結合）で後ろの音を消す先がキック step なら (c) が根を挿して打ち消す＝**消す側も保護集合で弾く**必要があります（保護の定義に「削除」を含めているので設計どおり）。
- **和音追従**：ベース chordFollow・ギター `assignGuitarPitches` は「強拍＝コードトーン・弱拍＝スケール」。R1 で強拍（28＝小節内 12）から 27 へ前倒しされた音は弱拍扱いになり、コードトーン保証が外れます。**変わり目の小節**で bar2 末（step 30→31）を次の頭へ食わせる R2 は、**次のコードのルートを先取りするか・今のコードの音を引き延ばすか**の選択が生まれます（外部の定石は「変わり目の直前の音は接近音・次の頭は着地」＝`2026-07-10-bass-generation-upgrade.md:37`）。R2 を入れるなら、その音の音高は**次のコードの許容音**へ写す規則が要り、和音追従の読み替えになる＝設計の範囲を越えるので**変わり目の反復単位では R2 を掛けない**のが安全側です（最後の反復単位は次のセクションへ流れるので、`frame` に次の和音が無ければ現コードで写す）。
- **fill／cues.fill**：小節を丸ごと差し替える上位の道具。最後の小節がフィルで差し替わると、最後の反復単位に掛けた R1〜R3 は消えます＝既存の流儀「破れた事実を数えて告げる」。

### 5-3. 「わざとらしい」リスク

- 源流の「わざとらしい」判定はフィール層（揺れの盛り盛り）と辞書フィルの「kind 選択」に対して出ています（§3-2・`HANDOFF-NEXT.md:18,30`「grammar表は“わざとらしい/収束”の元」）。作曲上のずらしについての判定は**未取得**です。
- 外部の注意点は一貫して「**1か所・1回**」と「**拍子の床を残す**」（§2 末尾）。逆Uの右肩（崩壊）は「全層をいっぺんに盛る」ときに来る（Sioros／Witek）。設計の「最後の反復単位だけ・答句だけ・頭とペダルは不変」はこの注意点に既に沿っています。
- リズムを動かすと**ドラムとの模様**が生まれるので、良くも悪くも「意図」が聞こえます。ベースとギターが**同じずらし**を持てば「アレンジの意図」、片方だけなら「そのパートの遊び」。どちらが耳に合うかは試聴で（§8）。

### 5-4. 同一性のリスク

「リフの同一性の半分はリズム」（A-5）・「リズム保存×音高差し替えが逆の10倍」（メロの統計）。R1〜R3 は答句3〜4音のうち1〜3音の位置を16分だけ動かす／足すので、リズム型の大半（頭・ペダル・刻み＝打点の 80〜90%）は保たれます。R5（3-3-2）と R6（8分ずらし）はリズム型そのものを別物にするので、**「同じリフの変奏」を越えて「別のリフ」に聴こえる**可能性が高い＝設計 §12 表の「全部の段でずらす」の難点と同じ。

## 6. 要るかの判定材料（条件付き・断定しない）

| オーナーが求める「動き」がこれなら | リズムの変奏は | 根拠 |
|---|---|---|
| 「同じ形で答えが変わる」「間ができる」「単音が増える」 | **要らない**（音高と間で届く） | §4 の表・源流ソロの前例（§3-2） |
| 「前へ転がる」「押す」「食う」 | **要る**（R1・R2） | Tan ら 2019（ロックのシンコペ＝強拍直前）・§4 |
| 「句末で密度が上がってフィルへ流れる」 | **要る**（R3） | `sixteenth-rhythm.md`（16分は走句で来る）・Biamonte（句末での不協和） |
| 「音の長短が欲しい・一律の刻みが機械的」 | **要る**（R4）— ただし答句だけでは効果が薄い見込み | `2026-07-21-melody-note-value-and-harmonic-rhythm.md`（音価一律の耳判定）・刻みは不変の設計 |
| 「ドラムと違う模様が欲しい」 | **要る**（R1 を両パート同時に） | Sioros 2022（模様は楽器を跨ぐ） |
| 「bar 1 のペダルが固い」 | **要らない／届かない**（どのレバーも触らない） | 設計の同一性の錨・案4 の領分 |

**耳の期待値を下げる材料**：源流ピアノで「打点の変種はバリエーション止まり（質は動かなかった）」（§3-2）。リズムのレバーが「違う」を作るのは確実ですが、「良い」を作るかは不明で、これは試聴でしか分かりません。

**私の見立て（推し）**：苦情の原文「繰り返しとかうまく使ってもっと動かしたい」の「動かす」は、ギターの文脈（パームミュートの刻みが同じ）では**推進力**も含みうると読めるので、**R1（16分前倒し）と R3（分割）を試聴帳に載せる価値はある**と考えます。ただし「入れる前提」ではなく、**「多め（音高と間）」で足りるかを先に聴く**のが順序です（設計の推し「音高と間だけで始める」と同じ）。

## 7. 入れるならどう入れるか（設計の含意）

### 7-1. レバー候補と衝突しにくさ

| 候補 | 操作（整数 step） | 動かす／足す／消す | キック衝突（7型） | 頭・ペダル | 和音追従 | 決定論 | 推し順 |
|---|---|---|---|---|---|---|---|
| **R3 分割** | 答句の頭の直前 or 直後の**空いている奇数 step** に `note` を1つ足す（deg＝隣の答句と同じか階段で1段） | 足すだけ | 奇数 step＝6/7 型で衝突なし（`beat16.ghost` 11 のみ） | 無傷 | 弱拍＝スケール音で写る | 位置＝答句頭−1 固定・deg の向き＝seed 偶奇 | **1** |
| **R1 16分前倒し** | 答句の連続セル群を `step−1`（保護 step・既存セル・step<1 は除外。前音は自動で詰まる） | 動かす | 同上 | 無傷（24 に当たらない） | 強拍→弱拍で丸めが外れる | 対象＝最後の反復単位・向き固定 | **2** |
| **R2 次の頭への食い** | 最後の答句 `30→31`（gallop は 31 が anchor なので不可） | 動かす | 31 にキックを持つ型は7型に無し | 無傷 | **変わり目では次の和音の読みが要る**＝変わり目の単位では掛けない | 固定 | 3 |
| R4 結合（タイ） | 隣接答句2セルの後ろを消す（消す先が保護なら不可） | 消す | 消す先がキックなら (c) が挿す＝保護で弾く | 無傷 | なし | 固定 | 4 |
| R5 3-3-2 | 小節後半を 8／11／14 に（頭 8 固定・答句2音へ） | 動かす＋消す | 11（beat16.ghost）・14（dbeat） | 無傷 | 弱拍化 | 固定 | 5（同一性リスク） |
| R6 8分ずらし | `step±2` | 動かす | 偶数キックに当たる・**24 の頭に当たる** | **衝突** | 強拍の入れ替わり | — | **載せない** |

### 7-2. 層への足し方（`riffVariation.ts` の登録口）

- 現行の層は `RIFF_VARIATION_LEVERS`（`riffVariation.ts:175-179`＝名前→`RiffLever` の表）と `schedule`（`:190-196`・`opts.schedule` で差し替え可）を持つので、**リズムのレバーは同じ表に `anticipate`／`subdivide`／`lead_in` として additive に登録**し、スケジュールの「最後の単位」に名前を足すだけで済みます。層の型（`RiffCell.step` 整数・`protectedSteps`・入力非破壊）は変えません。
- **不変条件の追加（赤テストから）**：①出力の step はすべて整数 0..31・同一 tile 内で重複なし・昇順 ②保護 step のセルは step/kind/deg 不変・保護 step へ新規セルを置かない・保護 step のセルを消さない ③`anchor:true` のセルは不動 ④リズムのレバーを外すと現行の4レバーの出力と bit 一致（後方互換） ⑤前倒しは前のセルより前へ出ない（`anticipate` の規則を移す） ⑥変異検査＝保護集合を空にすると錨の (b)(c) が増える（打ち消し件数の感度）。
- **打ち消しの実測（設計 §6-3）を拡張**：リズムのレバーが保護で全く動けなかった反復単位を数え、`meta.warnings` に「リズムの変奏はキックの位置に重なり動かせませんでした」を載せる（ゲートにしない）。
- **診断値**：反復単位ごとの `lhlSyncScore`（`syncopation.ts:66`）を tile 0 と比べた差分を report に添える。`noriTargetBand({layer:"bass"})` の帯に対する位置は**参考表示**（審判にしない＝`design.md:2061` の思想）。
- **ベースとギターの揃え**：両パートは別々の生成（`gen_bass`／`gen_chord_pattern`）なので、同じ seed でも自動では揃いません。揃えて聴きたい試聴条件では **`/gen/section` で同じ `riffVariation` と同じドラムを配る**（4口のうち section が両方を1度に作れる唯一の口）。製品としてどちらを既定にするかは耳の後。

### 7-3. 3候補のどこに置くか

| 置き方 | 利点 | 難点 |
|---|---|---|
| 多めの最後の反復単位に R1（＋R3）を含める | 候補数3を保てる・「多め＝いちばん大きい」の階段が広がる | 音高の変奏とリズムの変奏を**耳で分離できない**（試聴で何が効いたか分からない） |
| **試聴帳だけ第4候補「多め＋リズム」を並べる**（製品は3候補のまま） | 効いた要素を分離できる・製品契約（なし／中／多め）を動かさない | 試聴帳の生成に内部フラグが要る（scratchpad・コード変更は層の登録だけ） |
| 中からリズムも | 差が最大 | 提示との同一性が薄れる（設計 §12 の「△」） |

**推し＝試聴帳では第4候補として分離**し、耳が採ったら多めに畳む（または「多め」を「多め（音高と間）」「多め（＋リズム）」に分けるかを聞く）。中には入れません。

## 8. 試聴で決められる形にする（提案）

物差しはオーナーです。文字の表では選べないので、次の形で音を並べることを提案します（設計 S5 の試聴帳の拡張・scratchpad・コード変更なし）。

**条件**：2026-09-13 と同じ3条件（王道 IV-V-iii-vi・8ビート・seed7／ロック i-bVII-bVI-bVII・16分・seed21／vi-IV-I-V・シンコペ・seed42）・4小節（反復単位2枚＝変奏は2枚目だけ）。加えて **8小節版を1条件**（スケジュールの階段＝t1 ゼクエンツ・t2 断片化・t3 拡大＋リズム、が段として聴こえるか）。ドラムは真因調査の7型のうち **`beat8.basic`（キックが拍頭だけ＝リズムのレバーが全部生きる）と `beat16.ghost`（奇数 step 11 にキック＝一部が保護で止まる）** を必ず含める。

**並べる項目（各条件・各楽器）**：

| 記号 | 中身 | 何を聴くか |
|---|---|---|
| A | なし（従来） | 基準 |
| B | 多め（音高と間＝現行4レバー） | 「輪郭＋間」で足りるか |
| C | 多め＋R1（答句の16分前倒し） | 推進力が増えたか・わざとらしくないか・キックと喧嘩しないか |
| D | 多め＋R3（答句直前に16分を1つ足す） | 句末の密度が「フィルへ流れる」か・走句として自然か |
| E | 多め＋R2（最後の答句を次の頭へ食わせる） | 次の反復への流れが出るか・着地が濁らないか |

- **ベース＋ドラムのみ**と**バンド込み**（ピアノ従来型＋ドラム）の2種（真因調査と同じ `mk.ts:49-65` の作法）。
- **ラベルは伏せる**（A〜E を条件ごとにシャッフルし、対応表は別ファイル）＝「多め」の字面で聴かないため。
- **両パート同時 vs 片方だけ**：ロック進行の条件だけ、`/gen/section` で「ベースとギターの両方に C」「ベースだけ C」「ギターだけ C」を追加。
- **各項目に添える数字（診断・合否なし）**：変わったセル数／動いた打点数／保護で止まった数／反復単位ごとの LHL 密度（tile 0 との差）／打ち消し件数。

**耳に聞くこと（1項目ごと・原文で記録）**：①「同じリフに聴こえるか」②「A や B より動いた感じがするか」③「わざとらしいか」④「キックと喧嘩していないか」⑤（ギター）「パームミュートの印象が変わったか」。加えて源流の採用率プロトコル（`CONCEPT.md` §3）を借りて **「直さず貼る／直して貼る／貼らない」の3値**を1件ずつ。

**判定の読み方（機械が決めない）**：C・D・E のどれかが B より「動いた」と言われ、かつ「わざとらしくない」「同じリフ」であれば、そのレバーを多めに畳む候補。B で足りれば入れない。C〜E がどれも「別のリフに聴こえる」なら、リズムのレバーは繰り返しの変奏ではなく**別の型（型辞書）**の話になる＝案4 か型の追加へ回す。

## 9. 自信の無い点（正直に）

1. **ロックの「シンコペ≒前倒し（約77%）」の数字は二次資料経由**（Song Cage の要約）です。Tan・Lustig・Temperley 2019 の本文 PDF は本環境で読めず、要旨（「ロックのシンコペは強拍の直前にアクセント音を置く特定の形をとる」）は UC Press の抄録で確認しましたが、数値は一次で当たっていません。
2. トレシージョの流行の統計（Jajoria ら 2024）は本文が読めず、出典として挙げるに留めています（444曲・1999–2019 の採用傾向という抄録レベル）。
3. 「打点の変種はバリエーション止まり」の耳記録はピアノ・コンピングのもので、ベース／ギターのリフで同じかは不明です。
4. §5-1 の衝突表は7ドラム型の辞書値との**机上の突き合わせ**で、api を通した実測ではありません（変奏の層が結線される S2/S3 の後に63条件で実測できます）。
5. R2（次の頭への食い）の和音追従の扱いは、変わり目の小節で「次の和音の許容音へ写す」規則が要り、本研究はそれを設計していません。変わり目では掛けない、という安全側の提案に留めています。
6. ドラム側を小節ごとに変える（源流の KICKS variant）方が耳には効くかもしれませんが、範囲外なので比較していません。

## 10. 出典

**外部（Web）**
- Open Music Theory「Rhythm and Meter in Pop Music」（syncopation／division-level／tresillo の定義）: https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/07:_Popular_Music/7.01:_Rhythm_and_Meter_in_Pop_Music
- Tan, I., Lustig, E., Temperley, D. (2019). *Anticipatory Syncopation in Rock: A Corpus Study.* Music Perception 36(4): https://online.ucpress.edu/mp/article-abstract/36/4/353/62973/Anticipatory-Syncopation-in-Rock-A-Corpus-Study （二次＝Song Cage「Syncopation Explained」: https://songcage.com/blog/syncopation/ ）
- Biamonte, N. (2014). *Formal Functions of Metric Dissonance in Rock Music.* MTO 20(2): https://mtosmt.org/issues/mto.14.20.2/mto.14.20.2.biamonte.html
- Krebs の grouping／displacement dissonance（概説）: https://viva.pressbooks.pub/openmusictheory/chapter/metrical-dissonance/ ／ https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)/11:_Rhythm_and_Meter/11.06:_Metrical_Dissonance
- Jajoria, P., Mäder, A. R., McDermott, J. (2024). *Prevalence of Tresillo Rhythm in Contemporary Popular Music.* SMC 2024: https://smcnetwork.org/smc2024/papers/SMC2024_paper_id219.pdf
- Premier Guitar「Rhythm Rules: How to Steal from Yourself」（rhythmic displacement）: https://premierguitar.com/articles/21295-rhythm-rules-how-to-steal-from-yourself
- Guitar World「How to Expand Your Jazz Chops with Rhythmic Displacement」: https://www.guitarworld.com/lessons/jazz-guitar-corner-how-expand-your-jazz-chops-rhythmic-displacement
- Guitar World「Eighth-note syncopations」: https://www.guitarworld.com/lessons/accelerate-your-rhythmic-understanding-with-this-lesson-on-eighth-note-syncopations
- Guitar Club「Understanding Rhythmic Displacement」: https://www.guitarclub.io/blog/understanding-rhythmic-displacement ／ Guitar Wiz: https://guitarwiz.app/articles/rhythmic-displacement-guitar/
- TalkingBass「How To Build A Funky Bass Line」: https://www.talkingbass.net/how-to-build-a-funky-bass-line/ ／ Kalman「Bass Timing」: https://lessons.talkalmanmusic.com/blog/the-importance-of-timing-and-rhythm-in-bass-playing/ ／ TalkBass「Tips for writing funky bass lines」: https://www.talkbass.com/threads/tips-for-writing-funky-bass-lines.544359/
- Call and response: https://en.wikipedia.org/wiki/Call_and_response_(music) ／ https://bradleysowash.com/blog/call-and-response ／ https://cooperpiano.com/call-and-response-rhythm-basics/
- Ethan Hein「What is syncopation?」（syncopation と swing の区別）: https://www.ethanhein.com/wp/2024/what-is-syncopation/
- 知覚（既存 doc 経由・再調査せず）: Witek 2014／Stupacher 2022／Sioros 2022／Matthews 2019＝`2026-07-14-syncopation-sweet-spot.md` の出典一覧

**otomemo（行番号は 2026-09-16 main）**
- 設計＝`../drafts/2026-09-15-riff-variation-layer-design.md`（§3 変換の語彙・§4 スケジュール・§6 順序・§12 問い・オーナー裁定）
- 真因＝`2026-09-15-anchor-rigidity-guitar-motion-rootcause.md`（§2-1 錨が触った数・§3-3 文法の構造・§3-4 音価）
- 既存研究＝`2026-08-02-riff-structure-and-variation.md`（A-5・B-1・B-6）／`sixteenth-rhythm.md`／`2026-07-14-syncopation-sweet-spot.md`／`2026-07-14-motif-transform-stats.md:46-56,128-135`／`2026-07-14-riff-ostinato-design.md:15-22,42,60,162`／`2026-07-21-melody-note-value-and-harmonic-rhythm.md`／`2026-07-10-bass-generation-upgrade.md:22-48`／`2026-07-14-stem-groove-measurements.md` §1（自作曲＝完全ユニゾンは存在しない）／`2026-07-11-swing-feel-layer-audit.md`
- 層＝`packages/music-core/src/riffVariation.ts:14-58`（型・保護）・`:94-179`（4レバーと登録表）・`:190-196`（スケジュール）／`syncopation.ts:63-66,127`
- 文法＝`apps/api/src/music/bassLibrary.ts:254-287`／`packages/music-core/src/guitarRiff.ts:76-113`・`:390-426`（強拍＝コードトーン）
- ドラム型＝`apps/api/src/music/drumLibrary.ts:43-104`（7型のキック step・`:95` samba の奇数キック）
- 前例＝`apps/api/src/music/melodyCells.ts:417-431`（`anticipate`）・`:1434-1440`（`drumLock`）／`docs/design.md:297`（bass 3ノブ）・`:383`（drumLock 上限）・`:1942`（push）・`:2061`（ノリのレンズ）・`:2095-2102`（feel 層分離）・`:2159`（B1 裁定）・`:2166-2200`（錨 (k)〜(k-6)）

**源流 phrase_maker（読むだけ）**
- `docs/CONCEPT.md` §2②③・§3／`docs/HANDOFF-NEXT.md:18,25,30`／`experiments/solo/solo.py:250-256,339-356`／`experiments/bass_rock_riff/diverge.py:1-13`／`experiments/bass_rock_riff/subfeel.py`（kick_steps 定義）／`experiments/drums/gen2/src/patterns.py:93-125`（KICKS／GHOST_STEPS の variant）／`experiments/ensemble/ensemble.py:1279-1284`／memory `phrase-maker-concept.md:36`・`feel-diagnosis.md:11,19`・`piano-v3-status.md:25`・`drums-rhythm-sheet.md:22-26`
