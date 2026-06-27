# 和声・終止・声部進行の理論：細部リファレンス

作成: 2026-06-27 ／ 種別: **構造化リファレンス（網羅リスト・生成モデル設計用）**

目的＝**和声(harmony)・終止(cadence)・声部進行(voice-leading)・メロ⇄和声の相互作用**を、生成に落とせる粒度の規則・語彙で網羅する。我々のメロ生成モデル（骨格=Urlinie／contour=gap-fill）は深掘り済みだが、**コード側＝終止が1種類しか無い／偽終止・借用・二次ドミナントの概念が無い／メロと低音の声部進行(禁則)を見ていない**。本書はその盲点を埋める **辞書**。

姉妹文書との関係：
- 骨格・装飾(メロの縦)＝[`skeleton-theory-detail.md`](./skeleton-theory-detail.md)・[`skeleton-model-crossmap.md`](./skeleton-model-crossmap.md)。本書は重複させず**和声と声部の横**を扱う。
- ポップス進行の primer・エンジン設計＝[`2026-06-22-chord-progression-engine.md`](./2026-06-22-chord-progression-engine.md)（§1.1〜1.5 に T/S/D・定番進行・代替クラス）。本書はそれを**終止・声部進行の禁則・非和声音の解決**まで生成粒度で精密化する。

各表の列＝**①規則/概念（原語併記）／②定義（簡潔）／③生成への含意（どう判定・どう生成に足すか）**。
度数表記：`1̂`=スケール度（メロ/上声の音）、`I/V/vi`=和音度（ローマ数字）、`♭6`等=借用度。基準キー＝Cメジャー（例示時）。

---

## 枠1：終止(cadence)の全種類 — 「句をどう閉じる/開くか」の語彙

終止＝句末の和声＋上声の定型。**「閉じる(close)」か「開く(open)」か**で句構造を作る。我々は今 close=1度/open=5度の1種類（＝Urlinie 2̂→1̂ の最終着地）しか持たない。実際は**閉じ方・開き方が複数あり、強さ(終止感)が段階的**。

### 1-A. 終止の一覧（和声＋上声度数＋低音＋用途）

| ①終止（原語） | ②定義（和声 / 上声=メロ度数 / 低音） | ③生成への含意（句機能＝close/open と強さ） |
|---|---|---|
| **完全正格終止 PAC（Perfect Authentic Cadence）** | V(7)→I、両和音**根音位置**、上声が **2̂→1̂**（ソプラノ=主音で着地）、低音は 5→1（4度下行/5度上行） | **最強の close**。曲末・大サビ末に1回。我々の現 close（1度着地）はこれの上声条件。**低音 5→1 を明示**＝今は低音を見てない |
| **不完全正格終止 IAC（Imperfect Authentic Cadence）** | V→I だが PAC条件を1つ欠く：①どちらか転回、②上声が **3̂→1̂ or 5̂→… で主音以外で着地**、③V でなく vii° | **弱いclose**。句末だが曲末ほど締めない＝A/Bメロ末。上声を**3̂ や 5̂止め**にして「閉じたが先がある」を作る |
| **半終止 HC（Half Cadence）** | 任意→**V で止める**。上声は **2̂/7̂ など V構成音**で宙吊り。低音は V へ上行着地 | **open（問い）**。我々の現 open（5度=2̂止め）はこれ。前半句末＝後半を呼ぶ。**Vで止める**を明示。Interruption の 2̂ と一致 |
| **フリギア半終止（Phrygian Half Cadence）** | **iv⁶→V**（短調のみ）。低音が **♭6→5 の半音下行**、上声は 5̂へ。外声が反進行 | 短調の劇的な open。**低音半音下行**で V を引き寄せる＝強い開き。バラードのサビ前など |
| **変格終止 PC（Plagal Cadence・"Amen"）** | **IV→I**。上声 **1̂止め(または ♭6/♭7→…)**、低音 4→1 下行 | 柔らかい**追加のclose**。PAC の後の付け足し（コーダ/アウトロ）。主機能の補強。ポップスの「サビ後の余韻」 |
| **変格半終止（Plagal Half / ii→… 系）** | サブドミナント機能で一旦止める／IV や ii で句を区切る | open の柔らか版。Dへ行かず S で宙吊り＝穏やかな問い |
| **偽終止／中断終止（Deceptive / Interrupted, V→vi）** | **V(7)→vi**（短調は V→♭VI）。I を期待させ**裏切る**。上声 2̂→1̂ を期待しつつ **1̂が vi の3度として鳴る**／低音 5→6 上行 | **引き伸ばしの open**。「終わると見せて続く」。サビ前の煽り・1番サビ末をわざと閉じない。**ポップス頻出（後述 J-POP節）** |

**生成への含意（句構造の格上げ）**：今の open/close は2値だが、実際は **(a)どの和音で止めるか(I/V/vi/IV) × (b)上声どの度数で着地するか(1̂/3̂/5̂/2̂) × (c)強さ** の3軸。句末ごとに終止タイプを1つ選ぶ＝**「閉じ方の選択器」**を作ると、A末=HC・B末=偽終止・サビ末=PAC のように**句の役割で終止を出し分け**られる。Urlinie の Interruption（前半2̂で半終止→後半1̂で完全終止）は **HC→PAC のペア**として実装できる。

**枠1 出典**:
- [Cadence (Wikipedia)](https://en.wikipedia.org/wiki/Cadence)
- [Cadences in Music Theory: The 4 Types (Musicnotes)](https://www.musicnotes.com/blog/cadences-in-music-theory-the-4-types-explained/)
- [AP Music Theory 5.5: Cadences and Predominant Function (Fiveable)](https://fiveable.me/ap-music-theory/unit-5/cadences-predominant-function/study-guide/INNHEx3QCfTJPy2yXPqC)
- [Cadences (Integrated Music Theory)](https://intmus.github.io/inttheory21-22/08-cadences-phrasing/a2-cadences.html)
- [Musical Cadences (Learn Jazz Standards)](https://www.learnjazzstandards.com/blog/musical-cadences/)

---

## 枠2：機能和声と進行文法 — T–PD–D–T と色付け

### 2-A. 機能(function)と標準構文

| ①概念（原語） | ②定義 | ③生成への含意 |
|---|---|---|
| **トニック T（Tonic）** | 安定・帰着。**I**（代理 vi, iii） | 句の始点/終点。終止の着地。T で始め T で閉じる |
| **プレドミナント PD（Predominant / Subdominant）** | D を**準備**する緊張の入口。**IV, ii**（ii⁶, IV）。Sとも | D の直前に置く。終止前定型 ii→V / IV→V の前半 |
| **ドミナント D（Dominant）** | 最大緊張・T へ解決したがる。**V(7), vii°** | 終止の核。導音(7̂)と第7音を含み I へ引っ張る |
| **標準構文 T–PD–D–T** | 機能の標準的循環＝離れて(PD)準備し緊張(D)して解決(T) | コード列の文法の背骨。**逆行(D→PD)は原則避ける**（後退感）＝遷移表の方向バイアス |
| **機能代理（functional substitution）** | 同機能内で差し替え：T=I/vi/iii、PD=IV/ii、D=V/vii° | 合法な代替候補の第1クラス（engine doc §1.4 と一致） |

### 2-B. 終止前の定型(pre-cadential formulas)

| ①定型 | ②度数 | ③生成への含意 |
|---|---|---|
| **ツーファイブワン** | **ii(7)–V(7)–I** | 最も滑らかな PD→D→T。低音 2→5→1。転調の糊にも |
| **サブドミ→ドミ→トニック** | **IV–V–I** | 力強い終止前。賛美歌/ロック的 |
| **6–4–1–5 / 王道系** | vi–IV–I–V 等 | ポップスの循環（閉じ切らず回す） |
| **4–6 カデンツの I⁶⁴** | **I⁶⁴–V–I**（cadential six-four） | V の直前に I の第2転回＝V を飾る古典定型。上声 装飾解決 |

### 2-C. 半音的拡張（色付け・非ダイアトニック）

| ①概念（原語） | ②定義（度数 / 解決） | ③生成への含意 |
|---|---|---|
| **二次ドミナント（Secondary Dominant, V/x・V7/x）** | 任意のダイアトニック和音 x を一時的に「I」と見なし、その **V7 を直前に挿入**。例 E7=**V/vi**（→Am）、D7=**V/V**（→G）。x の根音に**5度下行**で解決 | 「次の和音を強調」する最強の接着。**任意のコードの前に、その完全5度上の dom7 を挿せる**＝決定的関数。丸サ進行の III7=V/vi |
| **二次導音和音（Secondary leading-tone, vii°/x・viiø7/x・vii°7/x）** | x の導音上の減和音/減七を挿入。x へ半音上行解決 | V/x の代替（より滑らか・低音半音）。経過減和音として |
| **モーダルインターチェンジ／借用（Modal Mixture / Borrowed Chord）** | 同主短調(平行モード)から借用。長調へ **iv, ♭VI, ♭VII, ♭III, ii°, ♭II** 等。借用の半音(♭6 等)は**下行解決**が基本 | 陰影を足す。度数は保ち**和音の質/根音を半音ずらす**。J-POPの肝＝後述 |
| **サブドミナントマイナー（iv / ♭VI / IVm6）** | 借用の中で最頻＝**IV を iv に**。**♭6→5 の半音下行**を生む（IVの第3音 6̂ が iv で ♭6̂ に） | ポップスで「切なさ」を作る最強の1手。**IV→iv→I** や **IV→ivm6→I**。後述 J-POP 必須 |
| **ナポリの和音（Neapolitan, ♭II / N⁶）** | **♭2度上の長三和音**、通常第1転回(N⁶)。PD として V を準備。♭2̂→1̂ or ♭2̂→7̂ の下行傾向 | 強い PD 代理。短調バラードの終止前。低音 ♭2 or 4 |
| **増6の和音（Augmented Sixth: It / Fr / Ger）** | **♭6̂ と #4̂** が増6度を成し、**両者が 5̂ へ反進行**で解決＝V(or I⁶⁴)を準備。It=+1̂／Fr=+1̂+2̂／Ger=+1̂+♭3̂ | 最強の D 前駆。**♭6→5（下）と #4→5（上）の半音反進行**＝声部進行が定型。劇的終止前 |
| **トライトーン・サブ／裏コード（Tritone Sub, SubV7）** | V7 を**三全音離れた dom7** に差替（G7→D♭7）。低音が**半音下行(D♭→C)**で I へ | おしゃれ・ジャズ的。V/x にも適用可（SubV/x）。低音半音下行が売り |
| **循環(Circle of Fifths)進行** | 根音が**完全5度ずつ下行**（vi–ii–V–I 等）。最も自然な根音運動 | 進行の引力の基準。根音5度下行＝「強進行」を優先するバイアス |

**生成への含意**：色付け系は**有限の規則表**で「与えられた度数→挿入/差替候補」を返す決定的関数になる（ML不要）。導入の判定軸＝(a)直後の和音を強調したい→V/x、(b)切なさ→iv/♭VI、(c)終止前を盛る→N⁶/Aug6/SubV。**どれを採るかの好みは選択器(Claude/重み)に委ねる**が、**合法手の生成**は規則で出せる。

**枠2 出典**:
- [Secondary dominant chord (Wikipedia)](https://en.wikipedia.org/wiki/Secondary_chord)
- [Borrowed chord / Modal mixture (Wikipedia)](https://en.wikipedia.org/wiki/Borrowed_chord)
- [Neapolitan chord (Wikipedia)](https://en.wikipedia.org/wiki/Neapolitan_chord)
- [Chromatic Harmony (Toby Rush theorywiki)](https://tobyrush.com/theorywiki/index.php?title=Chromatic_Harmony)
- [Neapolitan and Augmented 6th Chords (Hansen Media)](https://hansenmedia.net/courses/chromatic-harmony/lessons/neapolitan-and-augmented-6th-chords/)
- [Advanced Chord Progressions: Borrowed Chords, Secondary Dominants (Music Theory Professor)](https://themusictheoryprofessor.com/advanced-chord-progressions-borrowed-chords-secondary-dominants-and-more/)

---

## 枠3：声部進行の禁則(voice-leading prohibitions) — メロと低音の関係

古典の禁則。**ポップスでは絶対ではない**が、**「なぜ濁る/独立性が消えるか」を知ると不自然を回避できる**。我々はメロ⇄低音(bass)の関係を全く見ていないので、まず**外声2声(soprano=メロ × bass)の禁則**だけでも効く。

| ①禁則（原語） | ②定義（何が禁止か / なぜ） | ③生成への含意（例外・チェック） |
|---|---|---|
| **並行5度（Parallel Fifths）** | 2声が**完全5度→完全5度**を同方向で連続。P5は最安定＝平行すると2声の独立性が消え「1声に溶ける」 | **メロと低音が連続P5になる遷移を禁止/減点**。例外：質の違う5度(P5→d5)、内声の経過、ポップスのパワーコード意図時 |
| **並行8度/1度（Parallel Octaves/Unisons）** | P8/P1→P8/P1 の連続。独立性が完全に消える | メロと低音が連続オクターブ平行＝**禁止**。ユニゾン演出時のみ意図的に |
| **隠伏(直行)5度/8度（Hidden/Direct 5th・8ve）** | **両声が同方向**で P5/P8 に到達（同じ音程でなくても）。特に**上声が跳躍**で入ると目立つ | 外声が同方向で完全音程に着地＝注意。**上声(メロ)が step で入れば許容**が定石。終止の 5→1 低音×メロ跳躍に注意 |
| **声部交差（Voice Crossing）** | 下の声部が上の声部より高くなる。声部の聞き分けが崩れる | メロが低音より下に潜る配置を避ける（音域管理） |
| **声部重複／重なり（Voice Overlap）** | ある声部が、**直前の隣接声部の音を越える**動き。独立性を侵す | 連続和音間でメロ⇄低音の音域が交錯しないよう保つ |
| **増音程の旋律進行（Augmented Melodic Interval）** | 旋律線が**増2度/増4度等**で跳ぶ。歌いにくい・古典で禁 | メロ生成の禁則跳躍（skeleton側 contour 禁則＝Fux と一致）。短調の ♭6̂↔7̂ の増2度に注意 |
| **導音の二重・解決（Leading Tone: no doubling, must resolve）** | **導音(7̂)を重複しない**／外声の導音は**1̂へ上行解決**。重複すると並行8度を生む | V→I で**メロが導音なら 1̂へ上げる**。低音と導音が衝突しない配置。偽終止では導音→1̂(viの3度)で受ける |
| **第7音の下行解決（Chordal 7th resolves down by step）** | 和音の**第7音は次で step 下行**して解決。重複しない | V7→I で **7̂(第7音=4̂… 注:V7の第7音は 4̂)→3̂** へ下行。ii7→V でも第7音下行。**メロが第7音なら下げる** |
| **対斜（False Relation / Cross Relation）** | 半音違いの同名音が**別声部で連続**（例 ある声で F♮、次に別声で F♯） | 借用/二次ドミナント挿入時に起きやすい。同一声部で半音を処理すると回避 |

**生成への含意（最小実装）**：完全な4声 part-writing は要らない。**メロ(soprano)と生成済み低音(bass)の2声だけ**で、各和音遷移に対し ①連続P5/P8 ②隠伏P5/P8(メロ跳躍時) ③導音の解決 ④第7音の下行 をチェックする**減点関数**を入れるだけで「濁り/不自然」を大幅に減らせる。これは我々が**完全に欠いている層**。

**枠3 出典**:
- [Voice leading (Wikipedia)](https://en.wikipedia.org/wiki/Voice_leading)
- [Consecutive fifths (Wikipedia)](https://en.wikipedia.org/wiki/Consecutive_fifths)
- [Voice Leading Rules (Fiveable)](https://fiveable.me/lists/voice-leading-rules)
- [SATB Voice Leading (Fiveable AP 4.2)](https://fiveable.me/ap-music-theory/unit-4/satb-voice-leading/study-guide/c71tSuvM22gVBJGNiw1V)
- [Common Part-Writing Errors (N. Rogers, FSU, PDF)](https://myweb.fsu.edu/nrogers/Handouts/Common_Part-Writing_Errors.pdf)

---

## 枠4：メロと和声の相互作用 — 非和声音・和声リズム・可能音/回避音

### 4-A. 非和声音(non-chord tones)の種別と解決

接近(approach)と離脱(resolution)の組み合わせで定義。**強拍(accented)か弱拍(unaccented)か**も型に含む。skeleton側 §1-C と用語は重なるが、本書は**「どの拍に置けるか・どう解決するか」を和声文脈で**精密化。

| ①非和声音（原語） | ②定義（接近 → 離脱 / 拍） | ③生成への含意 |
|---|---|---|
| **経過音（Passing Tone, PT）** | step で接近 → **同方向に** step で離脱。弱拍が基本(強拍版=accented PT も可) | 2つの和声音(コードトーン)の間を1音で埋める。**弱拍に置く**。我々の現「弱拍=passing」はこれ |
| **刺繍音（Neighbor, NT）** | step で離れ → **同じ音へ** step で戻る(上=UN/下=LN)。弱拍 | コードトーンを1音飾る。戻るので和声を乱さない |
| **倚音（Appoggiatura, APP）** | **跳躍で接近** → 反対方向に step 解決。**強拍(accented)** | 強拍に非和声をぶつけ→step解決＝「ため/切なさ」。skeleton §1-C の incomplete neighbor 系。我々は強拍を一律コードトーンに矯正＝**APPを潰している** |
| **掛留音（Suspension, SUS：prep–sus–res）** | 前の和音の音を**保留**(同音) → 強拍で不協和(sus) → **step 下行**で解決(res)。**強拍**。4-3/7-6/9-8/2-3 等 | 強拍に保留の不協和→下行解決＝最も歌物らしい「引っかかり」。skeleton §1-C と一致。**強拍掛留の許容**が brush-up |
| **遅延（Retardation）** | suspension の**上行解決版**（res が step 上行）。導音の遅延等 | 上行で解く保留。終止で導音→1̂を遅らせる |
| **逸音／刺繍逃避（Escape Tone, ET / échappée）** | step で接近 → **跳躍で反対方向**に離脱。**弱拍** | 弱拍の軽い飾り。フレーズ末の跳ね |
| **先取音（Anticipation, ANT）** | step(多くは下行) で接近 → 次の和音の構成音を**先に鳴らす**(同音保持で着地)。弱拍 | 次のコードトーンを前借り＝終止直前の「着地予告」。ポップスの語尾 |
| **保続音（Pedal Point）** | **低音(主に T or D)を保持**し、上で無関係の和音が動く。最後に協和へ解決 | ドローン/ベース固定の上でコードを動かす。イントロ/ブリッジの定番 |
| **連続刺繍／チェンジング・トーン（Neighbor Group / Cambiata）** | 上下の刺繍を跳躍で繋ぐ定型（X–上N–(跳)–下N–X 等） | 跳躍を挟む装飾定型。skeleton §1-C cambiata と一致 |

**強拍/弱拍の原則**：accented(強拍)＝APP, SUS, accented PT/NT＝「ぶつけて解決」で表情。unaccented(弱拍)＝PT, NT, ET, ANT＝「滑らかに繋ぐ」。**我々は強拍を常にコードトーンへ矯正している**ので accented 系(APP/SUS)が生成できていない＝**表情の欠落**。

### 4-B. 和声リズム(harmonic rhythm)

| ①概念 | ②定義 | ③生成への含意 |
|---|---|---|
| **和声リズム（Harmonic Rhythm）** | **コードが変わる速さ**（1小節1コード/2コード/半小節 等） | メロの密度と独立に**コード交替速度**を制御する軸。サビ＝速め(2コード/小節)で推進、Aメロ＝遅め |
| **強拍=和声変化（harmonic change on strong beat）** | コードチェンジは**強拍/小節頭**に来やすい | 構造音(コードトーン)を**コードが変わる拍に合わせる**＝メロ骨格と和声リズムの同期 |
| **加速/減速（halving/doubling）** | 句末や盛り上がりで和声リズムを倍速/半速に | 終止直前で和声リズムを詰める＝「締まる」演出 |

### 4-C. 可能音・回避音・テンション(chord-scale)

| ①概念（原語） | ②定義 | ③生成への含意（どのメロ音をどの和音に当てるか） |
|---|---|---|
| **コードトーン（Chord Tone, 1-3-5-7）** | 和音の構成音。最安定 | **強拍/構造音に置く**（我々の現ルール＝正しい） |
| **可能テンション（Available Tension, 9/11/13）** | 和音の質ごとに使える拡張音。協和的に乗る | 弱拍やロングトーンの彩り。質ごとに表で持てる |
| **回避音（Avoid Note）** | コードトーンの**半音上(短9度)**で濁る音。例 **C△に対する F(=3rdの半上=11th)** | **そのコードでメロのロングトーン/強拍に置かない**。経過音としてのみ通す。**最重要の新規チェック**＝今は度数だけ見て avoid を見ていない |
| **長調IマイナーチェンジのF問題** | I(△)上の 4̂(11th) は avoid＝強拍に置くと濁る | メロ強拍が 4̂ のとき和音を IV/ii にずらすか、4̂ を passing で通す |
| **ドミナントの自由度** | V7上は **♭9,#9,♭13** など alt が広く許容（3rd/7thに対し♭9は不可） | V のところはテンションを大胆に。終止前を派手にできる |

**生成への含意（最重要の新規層）**：**「メロのこの音を、この和音の上に強拍で置いてよいか？」**を判定する **avoid-note チェック**。手順＝(a)和音の chord-scale を引く→(b)メロ音が **コードトーン or 可能テンションなら OK**、**回避音(コードトーン半音上)なら NG→passing 扱い or 和音差替**。これと和声リズム同期(構造音=コード変化拍)を足すと、メロと和声の**当たり**が筋の通ったものになる。

**枠4 出典**:
- [Nonchord tone (Wikipedia)](https://en.wikipedia.org/wiki/Nonchord_tone)
- [Embellishing Tones (Open Music Theory)](https://viva.pressbooks.pub/openmusictheory/chapter/embellishing-tones/)
- [Nonchord Tones (Music Student 101)](https://musicstudent101.com/28-nonchord-tones.html)
- [Identifying Anticipations, Escape Tones, Appoggiaturas, Pedal Points (Fiveable AP 6.3)](https://fiveable.me/ap-music-theory/unit-6/identifying-anticipations-escape-tones-appoggiaturas-pedal-points/study-guide/qIBADFw1MYL3dIF3FZzX)
- [Avoid note (Wikipedia)](https://en.wikipedia.org/wiki/Avoid_note)
- [Chord-Scale Theory (Open Music Theory)](https://viva.pressbooks.pub/openmusictheory/chapter/chord-scale-theory/)
- [Available Tensions (The Jazz Piano Site)](https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-chords/available-tensions/)

---

## 枠5：日本のポップス/歌物で特に効く終止・進行（補遺）

我々の主戦場はポップス/歌物。古典の禁則より、**ここで挙げる「J-POPの定型」を生成できるか**が体感に直結する。

| ①技法（原語/和） | ②定義（度数・C基準） | ③生成への含意 |
|---|---|---|
| **王道進行（Royal Road / Ōdō）** | **IVM7–V7–iii7–vi**（FM7-G7-Em7-Am）。**V→iii→vi＝偽終止系の連鎖**。浮遊感＋切なさ | サビの定番。**V7→iii(m7) が「I を避ける」偽終止的動き**＝閉じずに進む。日本の歴代上位の23〜40%が含む |
| **小室進行（Komuro / 6451）** | **vi–IV–V–I**（Am-F-G-C）。短調始まり→希望へ解決。低音 6→4→5→1 | 疾走感・切なさ。サビ全体を回す循環。最後の V→I だけが PAC、それ以外は開いて回す |
| **サブドミナントマイナー（Subdominant minor, IV→iv→I）** | 長調で **IV を iv に借用**。第3音 **6̂→♭6̂→5̂** の半音下行を生む（F→Fm→C で A→A♭→G） | **J-POPの「切なさ」最強の1手**。サビ末・Bメロ末で「ふっと翳る」。**♭6→5 の半音下行**が肝＝声部進行で実現 |
| **ラインクリシェ（Line Cliché）** | 和音を保持しつつ**1声だけ半音/全音で動かす**。例 **I–IM7–I7–IV**（1→7→♭7→6 の下行線）、**Am–AmM7–Am7–Am6** | 内声/低音に**半音下行のメロ的線**を作る。バラードのコード保持区間。Imaj7→I7 の ♭7 が次の IV を呼ぶ |
| **偽終止  II m→V→VIm** | **iim7→V7→vi**（Dm7-G7-Am）。I を期待→vi で受ける | **1番サビ末をわざと閉じない**→ラストサビで V→I に回収＝構成の山。back number 等で頻出 |
| **下行ベースの進行（descending bass）** | カノン進行系。低音 1→7→6→5… の下行 | 荘厳・必然感。低音線を**順次下行**に設計＝メロと反進行で外声が美しい |
| **丸サ進行（おしゃれ系）** | **IVM7–III7–vim7–♭VIIm7…**（FM7-E7-Am7…）。**III7=V/vi（二次ドミナント）** を含む | 非ダイアトニックを1つ挟むおしゃれ。**III7→vi が V/vi の解決**＝二次ドミナントの実例 |

**生成への含意**：これらは**「終止/句末の出し分け」「借用1手(iv)」「二次ドミナント1手(V/vi)」「半音下行線(クリシェ/サブドミマイナー)」** の4部品でほぼ作れる。古典の網羅より、**この4部品＋avoid-note＋外声の禁則チェック**が体感への投資効率が高い。

**枠5 出典**:
- [王道進行 (Wikipedia 日本語)](https://ja.wikipedia.org/wiki/%E7%8E%8B%E9%81%93%E9%80%B2%E8%A1%8C)
- [Royal road progression (Wikipedia)](https://en.wikipedia.org/wiki/Royal_road_progression)
- [偽終止とは。ポップスで使われるコード進行例 (弾き語りすとLABO)](https://hikigatarisuto-labo.jp/false-stop/)
- [カノン進行・小室進行・王道進行 (JBG音楽院)](https://jbg-ongakuin.com/staff-blog/20250808/)
- [なぜ王道進行なのに古臭くないのか＝裏切りのテクニック (JBG音楽院)](https://jbg-ongakuin.com/staff-blog/20250415/)

---

## 我々のモデルの盲点 top10（＝今 概念として入れてない/間違えてる所）

優先度＝**効き(体感)×実装の軽さ**で並べた。各項目「盲点／理論／生成にどう足すか」。

1. **終止が1種類しかない**（最大盲点）。今 close=1度/open=5度の2値のみ。→ **終止タイプ選択器**を作る：句末ごとに `{PAC, IAC, HC, Phrygian-HC, Plagal, Deceptive}` から1つ選び、**和音(I/V/vi/IV)×上声着地度数(1̂/3̂/5̂/2̂)×強さ**を決める。A末=HC・1番サビ末=偽終止・ラスト=PAC。[枠1]

2. **偽終止(V→vi)の概念が無い**。ポップスで最も効く「閉じずに引き伸ばす」が出せない。→ 終止選択器に **V→vi** を入れ、上声は 2̂→1̂ を vi の3度として受ける。「1番は偽終止／ラストは回収」の構成テンプレ。[枠1・枠5]

3. **メロ⇄低音の声部進行(禁則)を全く見ていない**。→ **外声2声(メロ×bass)の最小チェック**：連続P5/P8・隠伏完全音程(メロ跳躍時)・導音の解決・第7音の下行＝**減点関数**。完全part-writing不要、外声だけで濁りが激減。[枠3]

4. **avoid-note を見ていない**（度数しか見ていない）。例 C△の強拍に 4̂(F) を置くと濁る。→ 和音ごとに chord-scale を引き、**メロ強拍/ロングトーンが回避音(コードトーン半上)なら passing 扱い or 和音差替**。[枠4-C]

5. **二次ドミナント(V/x)が無い**。「次の和音を強調」できない。→ 規則：**任意のコードの前に、その完全5度上の dom7 を挿入**(E7→Am 等)。丸サ進行/王道の III7 が実例。決定的関数で生成可。[枠2-C]

6. **借用＝サブドミナントマイナー(iv)が無い**。J-POPの切なさの中核。→ **IV→iv→I** や IV→ivm6→I を1手として持つ。本質は **♭6→5 の半音下行**＝声部進行で実装。[枠2-C・枠5]

7. **強拍を常にコードトーンへ矯正＝APP/SUS(倚音・掛留)を潰している**。歌物の「ため/引っかかり」が消える。→ **強拍に accented 非和声音(APP=跳躍接近+step解決／SUS=保留+下行解決)を稀に許容**。skeleton側 brush-up と整合。[枠4-A]

8. **非和声音が「passing」1種**。実際は PT/NT/APP/SUS/ET/ANT/Pedal の**接近×離脱×拍**の型がある。→ 弱位置音を**型に当てて**生成（弱拍=PT/NT/ET/ANT、強拍=APP/SUS）。和声的に筋が通る。[枠4-A]

9. **和声リズムを制御していない**（メロ密度任せ）。→ **コード交替速度を独立軸に**：Aメロ遅め/サビ速め、終止直前は詰める。**コード変化拍に構造音を合わせる**（骨格と和声の同期）。[枠4-B]

10. **進行に機能文法の方向性が薄い／半終止前の定型が無い**。→ **T–PD–D–T の方向バイアス**（D→PD の後退を減点）＋**終止前定型 ii–V / IV–V / I⁶⁴–V** を句末テンプレとして用意。循環(根音5度下行)を「強進行」として優先。[枠2-A/2-B]

**実装の効き順(まとめ)**：①②(終止＋偽終止＝句構造の格上げ) → ③④(外声禁則＋avoid＝濁り除去) → ⑤⑥(V/x＋iv＝色付け1手ずつ) → ⑦⑧(強拍非和声＝表情) → ⑨⑩(和声リズム＋機能文法)。**①〜④が「正しく聞こえる」ための土台、⑤〜⑧が「らしさ/切なさ」、⑨⑩が仕上げ**。
