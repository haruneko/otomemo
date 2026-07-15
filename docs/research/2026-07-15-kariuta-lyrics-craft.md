# 仮歌の歌詞書法 — 歌詞×メロディ相互作用の理論と生成規則（L1）

- 作成: 2026-07-15
- 位置づけ: 仮歌トラックの土台。メロに**仮歌詞**を当て、ゆくゆく歌唱合成（VOICEVOX等・並行調査L2）で耳確認する流れの「歌詞側の理論と生成規則」。
- 前提doc: [2026-07-14-jp-prosody-melody-rules.md](2026-07-14-jp-prosody-melody-rules.md)（M3＝R-01〜14/A-01〜10。本docのK規則は**その上に載る美学・音色の層**。番号は K-xx で衝突なし）／[2026-06-28-lyric-melody-ai-survey.md](2026-06-28-lyric-melody-ai-survey.md)（外部モデル調査＝空白確認済・generate-check-repair方針）。
- 実装接点: `apps/api/src/lyric.ts`（splitMora/flowLyric・set_lyric）・`packages/music-core/src/prosody.ts`（analyzeMoras＝**母音a/i/u/e/o付きモーラ**・suggestLyricRhythm・analyzeLyricFit）。
- 思想: 機械は候補まで・仕上げは人間。本docの規則は**候補生成のバイアス＋ソフト警告**であり確定しない。

---

## TL;DR

1. **仮歌詞は「音の設計図」**。完成歌詞と求められる質の優先順位が逆転する＝**音数の正確さ＞母音の乗り＞語感・アクセント＞意味**（完成歌詞は意味・物語が上位）。プロ実務でも「ラララ/適当英語より、日本語らしい実在語の仮歌詞」が推奨される（田村信二）。
2. 段階は4層＝**①ラララ（メロ強度の確認）→②ジブリッシュ（メロが要求する母音形の発見）→③仮日本語歌詞（モーラ数確定・提示品質）→④本歌詞**。各層は別の検証道具であり、良かった断片は上の層へ「勝ち残り」する（Scrambled Eggs→Yesterday）。
3. 書法の核＝**頂点・ロングトーンに開口母音（あ＞え≧お、う段は不可）、フレーズ頭の強拍に強子音（か行・た行）、助詞は弱拍へ、句末母音で余韻/翳りを選ぶ**。音響学的裏付けあり（高音では狭母音i/uのF1をF0が超え、母音修正＝明瞭度低下が不可避）。
4. Claude生成プレイブック＝**①メロ解析（枠数/頂点/ロングトーン/強拍）→②モーラ数確定→③母音テンプレ設計→④虫食いで語当てはめ（複数トーン案）→⑤splitMora実測＋analyzeLyricFitで検査→repair**。LLMにモーラを数えさせない（実測で検査）は既定路線。
5. 機械で測れる＝モーラ一致率・**母音開口度×音高/音価の相関**・頂点開口度・アクセント整合（実装済）・句頭子音カテゴリ・母音韻。耳でしか測れない＝意味の座り・濁音の質感・調音結合・キャラ適合＝L2歌唱合成で耳へ回す。

---

## 1. 仮歌の実務論（出典付き）

### 1.1 現場の4層と「何を検証する道具か」

| 層 | 呼び名 | 何を検証する道具か | 出典 |
|---|---|---|---|
| ① | ラララ / ハミング | **メロ自体の強度・記憶性**。単一母音にすることで音高・リズムだけを裸で聴く。40mPは「引っかかるキーワードが浮かぶまでラララでひたすら口ずさむ」＝キーワード発掘の探索段階でもある | [40mP N高講義](https://originalnews.nico/69842)・[G.C.M Records（ボカロにラララで仮歌唱）](https://www.gcmstyle.com/howto-vocaloid-song-create/) |
| ② | ジブリッシュ / ダミー英語 / スキャット | **メロが「要求する」母音形とリズムの発見**。デタラメ音節で歌うと、輪郭が語るもの・繰り返し現れる母音シェイプが見えてくる。英語圏toplineの標準工程（"mumbling melodies"）。母音は音符ごとに音色（timbre）を変える＝ここで音色設計の当たりを取る | [Secrets of Songwriting](https://www.secretsofsongwriting.com/2017/04/20/singing-nonsense-syllables-i-e-gibberish-to-get-a-song-going/)・[iZotope: dummy lyrics](https://www.izotope.com/en/learn/lyric-writing-tips-how-to-use-dummy-lyrics-in-your-song)・[BMI: toplining](https://www.bmi.com/news/entry/how-to-write-to-a-music-track-the-art-of-toplining) |
| ③ | 仮日本語歌詞（仮歌詞） | **モーラ数の確定・歌唱可能性・提示品質**。プロ作曲家・田村信二「ラララや適当英語より、普通の歌詞っぽく少なくとも日本語であるのが望ましい」＝コンペ/クライアント提示で世界観を想像させるため。文法的完全性は不要＝「その曲が良くなれば」OK | [田村信二ブログ](https://ameblo.jp/tamutamuphoto/entry-11982950525.html) |
| ④ | 仮歌（仮歌さん歌唱） | **人の声で心に響くか＝最終提示品質**。コーライト実務では仮歌さんへの発注物（インスト・シンセメロ・ふりがな付き歌詞・ディレクションシート）が定式化 | [ペンギンス: 仮歌発注](https://www.penguins-cowriting-days.com/entry/2020/06/03/230001)・[田村信二](https://ameblo.jp/tamutamuphoto/entry-11982950525.html) |

**本ツールの守備範囲は①〜③**。①②はメロ生成側が既にやっている行為の言語化で、③＝仮日本語歌詞の自動生成が本docの主対象。④の「人の声」は歌唱合成（L2）で代替する。

### 1.2 ダミー歌詞の古典と「勝ち残り」原則

- McCartneyの *Yesterday* は数ヶ月間「Scrambled eggs, oh my baby how I love your legs」で運用された。ダミーの役割＝**メロを憶えておくため**（言葉が付くとメロは記憶に定着する、Hal Davidも同旨）。[The Paul McCartney Project](https://www.the-paulmccartney-project.com/song/scrambled-eggs/)・[Far Out Magazine](https://faroutmagazine.co.uk/paul-mccartney-beatles-yesterday-original-lyrics-scrambled-egss/)
- Paul Simonは「Coming home」→「Kodachrome」＝**母音骨格（o-i-o-）を保ったまま語を差し替え**。*Tea for Two* はダミーがそのまま本採用。→ ダミーは捨てるものではなく、**韻スキーム・音節数・アクセント位置を本歌詞に遺伝させる骨格**であり、良い断片は残す（勝ち残り）。[iZotope](https://www.izotope.com/en/learn/lyric-writing-tips-how-to-use-dummy-lyrics-in-your-song)

### 1.3 仮歌詞に求められる質＝完成歌詞との違い（本docの定義）

| 観点 | 仮歌詞 | 完成歌詞 |
|---|---|---|
| モーラ数・譜割り | **厳密**（ここがズレたら道具として無価値） | 厳密（同じ） |
| 母音の乗り（頂点・伸ばし） | **厳密**＝本歌詞に遺伝させる設計図 | 意味と衝突したら妥協もある |
| アクセント整合 | soft（A規則で検査・破っても仮なら可） | soft（意図的に破る自由） |
| 語感・韻 | 中（サウンド先行で決めてよい） | 高（推敲対象） |
| 意味・物語 | **低**＝「曲のコンセプトに沿った仮テキスト」で十分。意味の完全性は不要 | **最高**＝ここが本体 |
| 一貫した視点・人称 | 不要 | 必要 |

つまり仮歌詞は**音韻レイヤーだけを先に完成させる工程**。ボカロ実務の「サウンド先行型→虫食いを意味で埋める」（[kawauso note](https://note.com/kawauso_gt/n/n02344a089a14)※検索要約）と同型で、40mPの「キーワード→虫食い穴埋め」もこの順序。

---

## 2. 書法規則表（K-01〜26）

M3のR（リズム割付）/A（アクセント整合）の**上に載る層**＝「割付が正しい」の先の「良し悪し」。硬さ凡例はM3と同じ: **H**=hard（破ると不自然・強バイアス）/ **S**=soft（寄せたい）/ **P**=preference（彩り・提案のみ）。出典の無い行は**本docの音楽的判断**（[判断]と明記）。

### 2.1 母音設計（K-01〜05）— 母音×音高・音価

母音の開口度ランク（本doc設計値・§4の物差しでも使用）: **a=1.0 ＞ o=0.8 ＞ e=0.6 ＞ i=0.35 ＞ u=0.2**。
根拠: 声楽・作詞両サイドで「あ段最良・え段次点・う段は伸ばし不可」が一致（[音楽サプリ 母音講座](https://www.music-mastered.com/supple/detail/60/)・[Producers' Inc.](https://www.producers-inc.com/column/words-and-tone/)）。音響学: 高音では狭母音 /i/ /u/ の第1フォルマント（R1）を基本周波数F0が超え、歌手はR1:F0チューニング＝母音修正を強いられ明瞭度が落ちる（[Joliveau et al., soprano vocal tract resonances](https://www.phys.unsw.edu.au/~jw/reprints/Joliveauetal.pdf)・[Chan & Do 2021](https://journals.sagepub.com/doi/full/10.1177/20592043211055168)・[voicescience: formant tuning](https://www.voicescience.org/lexicon/formant-tuning/)）。「高い音で狭母音は物理的に苦しい」は主観でなく共鳴の物理。

| ID | 規則 | 硬さ | 根拠・例 |
|---|---|---|---|
| K-01 | **頂点音（フレーズ最高音）には開口母音（あ段第一候補・え/お段次点）**。い/う段の頂点は歌唱難＋母音が潰れて聞き取れない | S（強） | 上記音響学＋[音楽サプリ](https://www.music-mastered.com/supple/detail/60/)。M7歌いやすさ研究と接続 |
| K-02 | **ロングトーン（伸ばし・概ね2拍以上/句末延長）はあ段＞え段。う段は禁止級**（口が最小・勢いが出ない）。サビ・Bメロ終わりの見せ場ほど効く | S（強） | [音楽サプリ](https://www.music-mastered.com/supple/detail/60/)・[Producers' Inc.（え段はサビ終わりのロングトーンに適切）](https://www.producers-inc.com/column/words-and-tone/) |
| K-03 | 高音でい/う段を避けられない場合、**開口側の類義語・活用形への置換候補**を出す（例:「見つめて(u)」→「眺めて(a)」）。人間の歌手が母音修正でやることを語選択でやる | S | 音響学（母音修正）の作詞への翻訳。[判断] |
| K-04 | 伸ばし枠のバリエーションとして**1音に「あ/え段＋い」「あ/え段＋ん」**（〜ない・〜たい・〜さぁん）を候補に。開口母音で発音し二重母音/撥音で閉じる＝響きと語彙の両立 | P | [音楽サプリ（明記のテク）](https://www.music-mastered.com/supple/detail/60/) |
| K-05 | **頂点の前後で母音を変える**（同一母音の連打は割付は楽だが山が立たない）。例: 頂点「あ」なら直前は い/お 系で開口度の谷→山を作る | P | [判断]＝開口度の輪郭を音高の輪郭に相似させる発想（§4の相関指標の根） |

### 2.2 子音設計（K-06〜10）— 子音×リズム・アタック

| ID | 規則 | 硬さ | 根拠・例 |
|---|---|---|---|
| K-06 | **サビ頭・フレーズ頭の強拍には強い子音＝か行・た行（破裂音）**。跳ねたメロ・ロックと相性良。定石は「か行/さ行 × あ段・い段・お段」の組み合わせ | S | [Producers' Inc.（か行た行=強い・サビ頭に効果的）](https://www.producers-inc.com/column/words-and-tone/)・英語圏でも t/k/p/d はパーカッシブ（[Speed Songwriting](https://speedsongwriting.com/phonetics-in-songwriting/)） |
| K-07 | **さ行・は行（摩擦音）はインパクト弱いが耳ざわり良い**＝疾走感・息の抜け。摩擦音は立ち上がりに息が先行するため、細かい16分やアウフタクトに乗せると前ノリの推進力になる | P | 前半=[Producers' Inc.](https://www.producers-inc.com/column/words-and-tone/)。後半（前倒し効果）=[判断] |
| K-08 | **バラード・優しい曲の句頭は鼻音・接近音（な/ま/や行）**。ソフトな子音は愛や癒しの情感、硬い子音は緊張・攻撃の情感と対応 | P | [Producers' Inc.](https://www.producers-inc.com/column/words-and-tone/)・[Speed Songwriting（m,l=love song / k,t=tension）](https://speedsongwriting.com/phonetics-in-songwriting/) |
| K-09 | **ら行の連続・速いパッセージのら行を避ける**（日本語のrは弾き音＝高速連打が歌唱難。日常語にも少なく浮きやすい） | S | [Producers' Inc.（ら行=歌唱が難しい）](https://www.producers-inc.com/column/words-and-tone/) |
| K-10 | **促音・撥音をリズムのアクセントに使う**（「きっと」「ずっと」＝促音で直前が詰まりスタッカート感、「〜んだ」＝撥音で粘る）。M3 R-03/R-04の割付の上で、**置く場所を裏拍・シンコペ点に狙って選ぶ** | P | M3 R-03/04＋[判断]。「っ/ん は次の音への助走」（M3出典の譜割り論）の攻めの利用 |

### 2.3 モーラ配分の美学（K-11〜15）— M3規則の上の「良し悪し」

| ID | 規則 | 硬さ | 根拠・例 |
|---|---|---|---|
| K-11 | **1番と2番で同メロの字脚（モーラ数）を揃える**。仮歌詞の段階でこの枠を確定するのが最大の実務価値（後で本歌詞を差し替える際の型紙） | S（強） | [letty.life（字脚）](https://www.letty.life/word.html)・[松浦洋介 音数のルール](https://note.com/yosuke_matsuura/n/nd66d1ffa9793) |
| K-12 | **字余りの吸収は特殊拍位置で**＝長音・撥音・二重母音・う段は1音符に相乗りさせやすい（「きょう」「ちゃん」「はっ」）。逆に通常モーラの相乗りは目立つ | S | [松浦洋介（二重母音・撥音・促音・ウ段は1音符に乗る）](https://note.com/yosuke_matsuura/n/nd66d1ffa9793)・M3 R-07/字余り論 |
| K-13 | **語の切れ目と音の切れ目（休符・跳躍・小節線）を一致させる**。語がまたがる休符（「そ_ら」）は仮歌詞でも耳に立つ最悪の違和感＝A-10の美学面 | S（強） | M3 A-10・ReLyMe③（休符・長音は語中でなく句境界に） |
| K-14 | 二重母音の扱いはスタイル選択＝**分離（か・い＝2音符）は端正/歌謡的、圧縮（かい＝1音符）は英語調/都会的**。曲のジャンル指定から選ぶ | P | M3 R-05＋[北村 J-POP音韻（英語的圧縮の増加）](http://www.chukyoeibei.org/egakkai/topics/bun/eibungaku26/kitamura26.pdf) |
| K-15 | **助詞・接続詞を強拍に置かない**（弱起・弱拍へ）。助詞の強拍アタックは「素人臭さ」の最頻因。内容語の第1モーラに強拍を譲る | S（強） | M3 R-10/A-06・ReLyMe②（キーワード強拍/補助語弱拍） |

### 2.4 言葉の重心×メロの山（K-16〜20）

| ID | 規則 | 硬さ | 根拠・例 |
|---|---|---|---|
| K-16 | **サビ頭＝タイトル/最重要キーワードの最有力ポジション**。サビは「言いたいことを余さず歌い上げる」パートで、サビにタイトル語があると曲全体に統一感 | S | [40mP（サビから作る・言いたいことをメロに乗せる）](https://originalnews.nico/69842)・[エンタメクロス等作詞指南](https://www.ticket.co.jp/entx/music/lyric_writing_tips/) |
| K-17 | **頂点音（セクション最高音）に「聴かせたい語」の第1モーラを置く**。ただし高音は言葉が伝わりにくい（K-01の音響）ので、**仮歌では母音優先・本歌詞では意味優先**の二段構え＝衝突したら仮歌詞は開口母音を取る | S | [UtaTen等（高音部は言葉が伝わりにくい・狙いを持って置く）](https://utaten.com/live/lyrics-tips/)＋[判断]（優先順位の切り分けは本docの定義） |
| K-18 | **サビの一言目は「強子音×開口母音」が定石**（か/た行×あ段が最強の組合せ。「か」「た」「さ」始まりのサビはヒット曲に多いとされる） | P | [Producers' Inc.](https://www.producers-inc.com/column/words-and-tone/)。統計的裏付けは二次記事レベル（§信頼度メモ） |
| K-19 | **リフレイン（サビ反復・タイトル反復）は同一リズム型＋同一母音枠を保つ**。語を差し替える場合も母音列を保存（Coming home→Kodachrome方式） | S | M3 R-13・ReLyMe④・[iZotope](https://www.izotope.com/en/learn/lyric-writing-tips-how-to-use-dummy-lyrics-in-your-song) |
| K-20 | **句末母音で感情の余韻を選ぶ**＝あ/お段で締める→開いた余韻・大団円、い段→切なさ/鋭さ、う/ん→翳り/含み。セクションの感情設計と結線する | P | [判断]（え段ロングトーン適性は[Producers' Inc.](https://www.producers-inc.com/column/words-and-tone/)、感情対応は本docの整理） |

### 2.5 韻・語感（K-21〜23）

| ID | 規則 | 硬さ | 根拠・例 |
|---|---|---|---|
| K-21 | **韻は母音韻（アソナンス）中心・句末合わせが基本**。子音は無視〜低重み。対応する句（Aメロ1行目↔2行目等）の**句末2〜3モーラの母音列一致**を狙う（「解放 kaihou ↔ 最高 saikou」型） | P | M3 §4・[letty.life（心は解放/気分は最高）](https://www.letty.life/word.html) |
| K-22 | **対句・同型反復**＝同じモーラ数・同じ構文の行を並べるとフックになる（音数の型が揃う→K-11とも整合）。ボカロ系は特にこの「型の快感」が強い | P | [北村 J-POP音韻](http://www.chukyoeibei.org/egakkai/topics/bun/eibungaku26/kitamura26.pdf)・[判断] |
| K-23 | **仮歌詞のデフォルトは「サウンド先行モード」**＝意味の完全性を捨て、K-01〜22の音韻条件を満たす実在語を優先。意味は「コンセプト方向のキーワード」を数個混ぜる程度でよい（虫食いは本歌詞工程で埋める） | S | §1.3・[40mP虫食い方式](https://originalnews.nico/69842)・[G.C.M（コンセプトに沿った仮テキストで可）](https://www.gcmstyle.com/howto-vocaloid-song-create/) |

### 2.6 仮歌モード特有（K-24〜26）

| ID | 規則 | 硬さ | 根拠・例 |
|---|---|---|---|
| K-24 | **仮歌詞は日本語の実在語で書く**（ラララ・ダミー英語より）。理由: (a)母音・子音がメロの音色を変えるため裸メロと違って聞こえる（=検証になる）(b)人に聴かせたとき世界観が伝わる | S | [田村信二](https://ameblo.jp/tamutamuphoto/entry-11982950525.html)・[iZotope（母音が音符のtimbreを変える）](https://www.izotope.com/en/learn/lyric-writing-tips-how-to-use-dummy-lyrics-in-your-song) |
| K-25 | **仮歌詞で「音の設計図」を確定させる**＝モーラ数（字脚表）・頂点/ロングトーンの母音・韻スキーム・キーワード位置。本歌詞はこの設計図の上で語を差し替える（rhyme schemeとアクセント配置は仮→本で保存される、が英語圏実務の知見） | S | [iZotope](https://www.izotope.com/en/learn/lyric-writing-tips-how-to-use-dummy-lyrics-in-your-song) |
| K-26 | **勝ち残り原則**＝仮歌詞で「妙にハマった」フレーズは本歌詞候補として保持・記録する（Tea for Two型）。生成時は複数案を出し、ユーザーが断片単位で拾えるようにする | P | [iZotope]・[Secrets of Songwriting（gibberishから実語が浮かぶのを待つ）](https://www.secretsofsongwriting.com/2017/04/20/singing-nonsense-syllables-i-e-gibberish-to-get-a-song-going/)・設計思想「選択肢を出す・仕上げは人間」 |

---

## 3. Claude生成プレイブック案（そのまま貼れる形）

チャットのplaybookに追記する想定の手順書。**入力**＝メロ（`notes[]`: pitch/start/dur、句境界）＋セクション種別（A/B/サビ）＋任意のテーマ/キーワード。**出力**＝仮歌詞3案以上（かな）＋各案の検査レポート。

```markdown
## 仮歌詞の段階生成（このメロに仮歌詞を当てる）

原則: 仮歌詞は「音の設計図」。優先順位は 音数の正確さ > 母音の乗り > 語感 > アクセント > 意味。
意味は最後。モーラ数は自分で数えず必ず実測ツールで検査する。

### ① メロ解析（枠を読む）
- 句ごとに: 実音符数（=モーラ枠。促音用の詰めは枠に数えない）・最高音の位置・
  ロングトーン（2拍以上 or 句末延長）の位置・強拍に乗る音符・句末の音符。
- 頂点（セクション最高音）がどの句の何番目かをメモ。

### ② モーラ数確定（字脚表）
- 句ごとの目標モーラ数を確定し、同型句（1番/2番相当・リフレイン）は同数に揃える（K-11）。
- 字余り許容点＝長音/撥音/二重母音を置ける枠、字足らず許容点＝句末伸ばし枠を先に印付け（K-12）。

### ③ 母音テンプレ設計（語より先に母音を決める）
- 頂点音・ロングトーン枠 → あ段（次点え/お段）。う段は禁止（K-01/K-02）。
- サビ頭の第1モーラ → 強子音×開口母音（か/た行×あ段が第一候補、K-06/K-18）。
- 句末母音 → 感情設計から選ぶ（開放=あ/お、切なさ=い、翳り=う/ん、K-20）。
- 対応句の句末2〜3モーラは母音列を揃える（母音韻、K-21）。
- 出力例: 句=8モーラ「[Ka] * * * [a:] | * * [o]」（[ ]=固定・*=自由・a:=伸ばし）

### ④ 語の当てはめ（虫食い・複数案）
- キーワード（あれば）の第1モーラを頂点かサビ頭へ（K-16/K-17）。
- 助詞・接続詞は強拍に置かない。句頭の「そして/でも/ねえ」等は弱起へ（K-15）。
- 語の切れ目を休符・跳躍と一致させる（K-13）。ら行連打を避ける（K-09）。
- **3案以上・性格を変える**: (a)情景系（名詞多め） (b)心情系（動詞/形容詞多め）
  (c)サウンド系（意味最小・語感全振り）。加えて韻スキーム違い・キーワード位置違いも可。

### ⑤ 検査 → repair（自分の数えを信用しない）
- splitMora（/analyzeMoras）で各句の実モーラ数を測り、②の字脚表と突合。
  ズレたら「どの句が何モーラ過不足か」を差分で受けて語を差し替え（generate-check-repair）。
- analyzeLyricFit でアクセント整合（A-01赤は語を替えるか意図として明記）。
- 母音テンプレ照合: 頂点/ロングトーン枠の母音が開口側か（§4のV1/V2）。
- 通ったら set_lyric（flowLyric）で流し込み → 歌唱合成で耳確認（L2）。

### 禁則
- モーラ数の自己申告を信じない（トークナイザはモーラを数えられない）。
- 全部の頂点を「あ」にしない（単調）。頂点前後は母音を変える（K-05）。
- 他者の既存歌詞のフレーズをそのまま使わない。
```

**ばらつき設計**（家訓「サンプルはバリエーション」）: 同一メロに対し最低3案＝性格軸（情景/心情/サウンド）×任意で韻スキーム軸。UI/チャットでは案を句単位で分解提示し、**句単位のいいとこ取り**（K-26勝ち残り）をユーザーに許す。

---

## 4. 機械評価の物差し（analyzeLyricFit系との接続）

### 4.1 機械で測れる部分（純TS・実装可能な順）

| ID | 指標 | 定義 | 実装接点 |
|---|---|---|---|
| V0 | モーラ数一致率 | 句ごとに `1 - |実モーラ数 - 実音符枠| / 枠`。全句平均。**最重要・既に決定的に測れる** | `splitMora`/`analyzeMoras`＋flowLyricの枠。字脚一致（K-11＝同型句どうしの分散）も同じ道具で |
| V1 | 頂点開口度 | セクション最高音・最長音符に乗るモーラの開口度（a=1.0/o=0.8/e=0.6/i=0.35/u=0.2。ん/っ=0、ーは直前を継ぐ＝`Mora.vowel`がそのまま使える）。閾値でsoft警告（例: 頂点がu段→黄） | `analyzeMoras`の`vowel`＋notesのpitch/dur。K-01/K-02の検査器 |
| V2 | 開口度×音高/音価相関 | 句内の（開口度列, pitch列）と（開口度列, dur列）の順位相関。正なら「高い/長い音ほど開いた母音」。**全体傾向の指標**（V1は点、V2は線） | 同上。重みは初期手決め→将来E-corpus较正 |
| V3 | アクセント整合スコア | 実装済＝`analyzeLyricFit`（A-01〜05/07）。仮歌詞ではsoft運用（赤のみ提示等） | `packages/music-core/src/prosody.ts`（済） |
| V4 | 句頭子音カテゴリ | サビ頭/強拍頭のモーラの子音を{破裂・破擦/摩擦/鼻音・接近/母音}に分類し、セクション意図（強い/優しい）との一致を判定（K-06/K-08） | かな→子音カテゴリ表を`prosody.ts`に追加（小さい） |
| V5 | 母音韻スコア | 対応句ペアの句末2〜3モーラの母音列一致度（子音無視）。K-21の検査器 | `analyzeMoras`の`vowel`列比較（小さい） |
| V6 | 語分断・助詞強拍 | A-10（語をまたぐ休符）・A-06（助詞が強拍）。**語境界が要る**＝pyopenjtalk/VOICEVOX `/accent_phrases` sidecar待ち（M3 §7・サーベイA-2） | 将来スライス（L2のVOICEVOX導入と同じsidecarで一石二鳥） |

**スコアの出し方**はM3と同じ分解型＝単一絶対値にせず `{V0..V5, hits[]}` をUIで赤/黄/情報ハイライト、ユーザーが握りつぶせる。**V0だけはhard寄り**（仮歌詞の存在意義なので、不一致はrepairループで自動修正してから提示）。

### 4.2 耳でしか測れない部分（線引き）

- **意味の座り**: 文法・語彙選択の自然さ。LLM自身の得意領域なので生成時に担保し、数値化しない。
- **濁音・清音の質感**: 開口度が同じでも「かがやく」と「輝く（読み同じ）」の表記差、「た」と「だ」の重さは規則表の外＝耳。
- **調音結合（子音渡り）**: モーラ間の口の移動距離（「らりるれろ」連打の歌いにくさの一般形）。原理的には数値化可能だが、較正データが無いうちは耳に回す（K-09の個別規則だけ機械化）。
- **キャラ・世界観適合**: 曲調×語彙のトーン一致。ユーザー（＋LLMの提案理由文）の領域。
- **実歌唱のブレス・テンポ耐性**: BPMとモーラ密度の限界（16分早口の成立性）は、**歌唱合成で実際に歌わせて聴くのが最短の検証**＝L2の存在理由。理論値化はメロ評価の天井問題（理論はガードレール止まり）と同じ構図で深追いしない。

---

## 5. 次の一手（L2-L4との合流点）

1. **V0＋V1/V2の評価器**（純TS・`prosody.ts`拡張）: `Mora.vowel`が既にあるので開口度マップと頂点検査は小さく足せる。仮歌詞生成の検査ループ（プレイブック⑤）の足場。
2. **プレイブック§3をチャットのplaybookへ追記**: `set_lyric`/`analyzeLyricFit`の既存verb結線で①〜⑤が今すぐ回る（V1/V2が無い間は目視ルール運用）。
3. **L2（歌唱合成）合流**: VOICEVOX系エンジンを立てるなら `/accent_phrases` でV6（語境界×リズム）も同時に取れる＝**歌わせる道具とアクセント辞書が同一sidecar**。導入判断はL2側で。
4. **L3/L4合流（本歌詞工程・コーパス）**: 仮→本の差し替えは「母音骨格保存の語置換」問題＝K-19/K-25がそのまま制約になる。自作コーパス（P2）が載れば開口度重みとV2閾値をE-corpus较正へ。

## 信頼度メモ

- 「サビ一言目はあ段/か行が多い」（K-18）は作詞指南記事レベルの言説で、**一次統計は未確認**（検索でも該当研究なし）。定石としてPで採用、統計主張はしない。
- 摩擦音の前倒し効果（K-07後半）・句末母音の感情対応（K-20）・開口度の数値マップは**本docの設計判断**＝耳較正（オーナー手番）で重み調整前提。
- ソプラノ音響研究はクラシック発声の実測。ポップス地声はF0が低く効果は緩むが、「高音ほど狭母音が苦しい」の向き自体はジャンル共通（作詞指南と一致）。

## 出典一覧

- 仮歌実務: [田村信二「デモでも、仮歌、仮歌詞を入れよう！！」](https://ameblo.jp/tamutamuphoto/entry-11982950525.html)・[ペンギンス「仮歌発注、ここに気をつけよう！」](https://www.penguins-cowriting-days.com/entry/2020/06/03/230001)・[G.C.M Records ボカロ曲制作全工程](https://www.gcmstyle.com/howto-vocaloid-song-create/)・[40mP N高作詞術](https://originalnews.nico/69842)
- ダミー歌詞（英語圏）: [iZotope: How to Use Dummy Lyrics](https://www.izotope.com/en/learn/lyric-writing-tips-how-to-use-dummy-lyrics-in-your-song)・[Secrets of Songwriting: Singing Nonsense Syllables](https://www.secretsofsongwriting.com/2017/04/20/singing-nonsense-syllables-i-e-gibberish-to-get-a-song-going/)・[BMI: The Art of Toplining](https://www.bmi.com/news/entry/how-to-write-to-a-music-track-the-art-of-toplining)・[The Paul McCartney Project: Scrambled Eggs](https://www.the-paulmccartney-project.com/song/scrambled-eggs/)・[Far Out Magazine: Yesterday original lyrics](https://faroutmagazine.co.uk/paul-mccartney-beatles-yesterday-original-lyrics-scrambled-egss/)
- 母音・子音×歌: [音楽サプリ 新作詞講座③ 歌いやすさと母音](https://www.music-mastered.com/supple/detail/60/)・[Producers' Inc. 作詞のコツ〜言葉と音編〜](https://www.producers-inc.com/column/words-and-tone/)・[同〜言葉とメロディ編〜](https://www.producers-inc.com/column/word-and-melody/)・[Speed Songwriting: Phonetics in Songwriting](https://speedsongwriting.com/phonetics-in-songwriting/)
- 音響学（高音×母音）: [Joliveau, Smith & Wolfe: Vocal tract resonances in singing — the soprano voice (JASA)](https://www.phys.unsw.edu.au/~jw/reprints/Joliveauetal.pdf)・[Chan & Do 2021: Vowel Modification (Aggiustamento) in Soprano Voices](https://journals.sagepub.com/doi/full/10.1177/20592043211055168)・[voicescience.org: Formant Tuning](https://www.voicescience.org/lexicon/formant-tuning/)
- 作詞技法（日本語）: [letty.life 作詞のコツ（字脚・韻）](https://www.letty.life/word.html)・[松浦洋介 はじめての作詞 第4回（音数のルール）](https://note.com/yosuke_matsuura/n/nd66d1ffa9793)・[UtaTen 作詞のコツ](https://utaten.com/live/lyrics-tips/)・[エンタメクロス 作詞のコツ](https://www.ticket.co.jp/entx/music/lyric_writing_tips/)・[kawauso ボカロPの歌詞の作り方（サウンド先行型）](https://note.com/kawauso_gt/n/n02344a089a14)・[北村 J-POPの音韻的考察](http://www.chukyoeibei.org/egakkai/topics/bun/eibungaku26/kitamura26.pdf)
