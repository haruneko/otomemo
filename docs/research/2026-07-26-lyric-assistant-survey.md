# 作詞補助ツールの外部調査（3リサーチャー横断サーベイ）

調査日: 2026-07-26 / 担当: 3並列リサーチャー（Haiku・軸①〜③）＋本docでの清書・統合
起点: 既存の作曲支援（Otomemo）に「作詞そのものを助ける」機能を足せるか、というブレストの一次資料集め。
主眼＝**曲先**（既存メロに詞を当てる。ボカロ文化圏で主流、実務者証言でも「詞は音数のパズル」）だが、**詞先**（詞が先にあり、それに合う旋律を組む）も視野に入れる。

**⚠️ 出典URLは未検証（Haiku収集・スポットチェック未実施）。** 特に軸③（学術研究）の arXiv 番号は実在しない/番号を取り違えている可能性がある。明らかに疑わしいものには本文中で「(要検証)」を付けたが、それ以外も鵜呑みにせず、実装で当たる前に必ずアクセスして本文を確認すること。他者コーパス（POP909等）を扱う既存研究と異なり、本docは**ツール・手法の存在と設計思想を拾う調査**であり、歌詞の literal な引用は含まない。

用語（初出の一行説明）:
- **モーラ（拍）**: 日本語で音の数を数える単位。「きゃ」は2文字だが1モーラ。歌ではおおむね1音符に1モーラが乗る。
- **アクセント型**: 日本語のピッチアクセント。平板（下がらない）・頭高（1拍目が高い）・中高・尾高の4分類。旋律の上下と噛み合わないと語義が変わって聞こえたり不自然に聞こえたりする。
- **prosody（韻律）**: 英語では強勢（ストレス）の強弱パターン。歌では強拍に強勢音節、弱拍に非強勢音節を合わせると歌いやすい。
- **held note（ロングトーン）**: 長く伸ばす音符。乗せる母音の開口・共鳴特性が歌いやすさに直結する。

既存の関連 research と接続する点はその都度リンクする。本docは新規の「作詞そのもの」の技法・ツール調査であり、Otomemo側の詞×メロ整合機能（`suggest_lyric_rhythm`/`analyze_lyric_fit`/`set_lyric`、design #13b/#13d）は既に実装・稼働中（[2026-07-15-kariuta-impl-audit](2026-07-15-kariuta-impl-audit.md)）。本docの新規性は「言葉そのものを紡ぐ工程」の補助であり、音数合わせの補助ではない。

---

## 軸①: 日本語商業作詞の技法・ツール

日本語作詞実務（note記事・DTM解説・作詞講座サイト）から収集。ツールは主に個人開発の無料Webアプリ、技法は現役作詞家・講師の解説記事。

| 項目 | 内容 | 出典URL | 設計含意 |
|---|---|---|---|
| ピッチアクセント4型の可視化 | 平板・頭高・中高・尾高をメロディの音高描画と並べて表示し一致/不一致を目で見せる | https://note.com/helloya/n/n62eb422ba823 | OJADやpyopenjtalkでアクセント型を検出し、既存の音高描画（メロエディタ）に重ねて可視化する案。Otomemoは既に `analyze_lyric_fit` で赤/黄判定を持つが、**視覚化（描画上に重ねる）はまだ**（[kariuta-impl-audit](2026-07-15-kariuta-impl-audit.md) の穴②「webがanalyzeLyricFitを呼ばず赤黄ハイライト未配線」と同根） |
| モーラ数の定番フレーム | 5-7／4-4-4-4／8-8／10-10 等、定型の音数割りをテンプレとして提案 | https://note.com/helloya/n/n60cbc2e7df88 | 句割りテンプレ辞書として実装可能。`planLyricMelody`（詞先モード）の句割りロジックに定番形の初期値として注入できそう |
| モーラ数リアルタイムカウンター | ひらがな入力＋漢字は形態素解析で読みを出し、促音/撥音/長音を1モーラとして数える | https://benrilab.com/app/mora-counter/ | 既存 `analyzeMoras`（`packages/music-core/src/prosody.ts`）とほぼ同じ考え方＝**既に持っている土台**。UIとして「入力しながら数える」体験を足す余地 |
| 作詞5段階フロー | テーマ→連想語→構成割振→メロディ適用→視点統一、の順で作る型 | https://note.com/masatsumu/n/n302a501cf3ae | 会話フローの型として使える。[2026-07-19-lyric-support-t1](2026-07-19-lyric-support-t1-lyric-writing-anatomy.md)（作詞の解剖＝4層モデル）と粒度が異なるが矛盾はしない。「連想語」ステップはブレスト支援の具体形 |
| 言語負荷への対処（省略・比喩） | 日本語は同じ意味を乗せるのに英語の2〜3倍の音数を要するため、省略語・比喩を使う技法 | https://note.com/matsumiyakazuto/n/n9a8aa2cb761e | 数値の出典裏取りは要（要検証）。ただし「日本語は音数が窮屈になりがち」自体は実務的に広く言われる話で、言い換え候補提示（下記）と直結する動機付け |
| 韻検索（複数モード） | 母音完全一致／前方一致／後方一致に加え「語感踏み」という緩い一致モードを持つ辞書検索 | https://news.j-wave.co.jp/2020/11/post-6993.html／https://kujirahand.com/web-tools/Words.php | 56万語規模の辞書＋母音スペクトル類似という実装がある（kujirahand）。日本語韻は子音でなく**母音中心**（[jp-prosody-melody-rules](2026-07-14-jp-prosody-melody-rules.md) の既存所見と一致）。自前実装するなら国語辞書＋母音列インデックスで足りる規模 |
| ロングトーン向き母音の音響特性 | え/うは高音で伸ばしやすく、いは喉が詰まりやすいという声楽的知見 | https://nayutas.net/school/hiroshima/blog/75730/ | Otomemoは既に「頂点音/ロングトーンは開口母音（う段禁止級）」という**独自の実測知見を持っている**（[kariuta-lyrics-craft](2026-07-15-kariuta-lyrics-craft.md)）。この記事は方向は一致するが**う段の扱いが逆**（記事=う段OK寄り、Otomemo実測=う段は共鳴の物理で不利）＝要すり合わせだが、Otomemo側は仮歌の実測に基づく分だけ強い |
| OJAD辞書連携 | 東京大学の日本語話し言葉アクセント辞典。約9000語の名詞＋約3.5万の活用形、東京標準アクセントの音声付き | https://www.gavo.t.u-tokyo.ac.jp/ojad/ | **プロジェクトは既に検討・裁定済み**＝アクセント抽出は OJAD スクレイピングでなく **pyopenjtalk を採用**（モーラ分割20/20一致・同綴異義を文脈弁別・都度spawn 0.13-0.23秒・軽量依存、[kariuta-accent-feasibility](2026-07-15-kariuta-accent-feasibility.md)）。OJADは辞書としての権威は高いが実装済みの代替がある＝**再検討は不要、既決事項として README から到達できるようにする** |
| 初心者10失敗パターン・チェックリスト | 冗長・登場人物過多・イントネーション不一致・単語の切れ目の不自然・無計画な韻・視点ブレ 等 | https://srm-music.com/lyrics-prohibition/ | 「推敲監査」フェーズのチェック項目リストとして転用できる。後述の横断要点「無審判ドラフト→推敲監査の2段」の監査側の具体的なチェック項目源 |
| 五七調・七五調の自動検出 | 定型リズム（5-7/7-5）を検出する機能。sakushi というツールの一機能 | https://note.com/enspire/n/n51d26a01f331 | 検出は `analyzeMoras` の出力（モーラ列）にパターンマッチをかければ実装可能。優先度は低（伝統定型は必須ではない） |
| セクション役割分割アシスト（曲先） | A/Bメロ・サビでそれぞれ「何を言うか」を先に設計してから書く支援 | https://sakky.tokyo/kyokusen-sakusshi/ | 既存の `section?: SectionContext`（role名前空間、[section-role-framing](2026-07-10-section-role-framing.md)）と接続できる。「役割ごとに書くべき内容のガイド」を会話の型として持たせる案 |
| 視点ブレ検出 | 人称や時制の揺らぎを警告する自己添削チェックリスト | https://jibunkyo.main.jp/self-editing-7-checkpoints/ | 意味層のチェック（音数/韻とは別レイヤー）。LLMによる文章解釈が必要＝Otomemoの「候補までは機械・仕上げは人間」原則に照らすと**指摘は良いが確定させない**形で持たせるべき |
| 母音の偏り統計化 | セクション別・全体で母音の出現バランスを円グラフ化する（sakushi） | https://note.com/enspire/n/n51d26a01f331 | 診断・可視化系。実装は軽い（母音頻度カウント＋グラフ）。母音の偏りが単調な音色感につながるという経験則の可視化 |
| ジャンル別の作詞コツ分岐 | ボカロ／アニソン／J-POPでコツが変わるという解説 | https://note.com/rakshaka/n/nf3139e345f6d | ジャンル別プリセット的な会話ガイドの材料。実装優先度は低い（テキストのアドバイス集約） |
| 言い換え候補（モーラ数指定） | メロに合うモーラ数の別表現を類義語辞典から提示（sakushi） | https://note.com/enspire/n/n51d26a01f331 | **横断で最も支持が厚い機能**（後述）。類義語辞書＋モーラ数フィルタで実装可能。国語の類語DB（自作 or 既存公開データ）＋ `analyzeMoras` で音数一致フィルタをかける設計 |
| 倒置法・修辞テンプレート | 「君が好き」→「好きなのは君」のような語順入れ替えパターン集 | https://sound-web.com/dtm/26 | 定型変形のパターン辞書として実装可能。音数が変わらない変形が多く、言い換え候補と同じ枠組みに載せられる |

## 軸②: 英語圏の作詞支援ツール

商用ツール（プロダクトサイト・レビュー記事）と、Berklee/Pat Pattison系のsongwriting教則を中心に収集。

### ツール比較

| 名前 | 何をするか | 出典URL | 設計含意 |
|---|---|---|---|
| RhymeZone | 無料の韻辞典。類語・near-rhyme（弱い韻）・homophone（同音異義）も検索可 | https://rhymezone.com | 「調べる」型の最も枯れた実装。日本語版は kujirahand が相当。英語圏の事実上の標準 |
| MasterWriter | 2003年から続くプロ用スイート。類語・韻・頭韻・慣用フレーズ・文化参照（固有名詞等）を横断検索 | https://masterwriter.com | 老舗の生存＝「調べる」型は普遍的ニーズと確認できる。文化参照検索（比喩のネタ元）は日本語圏ツールにあまり見ない差別化要素 |
| Hookpad/Hooktheory | 和声（コード進行）とメロが主役で、歌詞は副次的な扱い | https://www.hooktheory.com | Otomemoのコード/メロ生成機能と役割が近い。歌詞面では参考にならないが「メロが主で詞が従」という設計の対極例として位置づけを整理する材料 |
| LyricStudio | AIによる文脈認識生成。類語・韻も内蔵。writer's block（書けなくなる状態）の解消を謳う | https://lyricstudio.net | **既存の [t5](2026-07-19-lyric-support-t5-existing-ai-tools.md) で既に実証込みで扱われている**＝「一から書く道具でなく補助」と提供者自身が明言、質の体系的検証は無し、課金トラブルの苦情あり。**既決＝再調査不要**、README該当行を参照 |
| SongPad | 行ごとの音節カウンタ＋韻マッチ＋版管理（ドラフトの履歴保存） | https://www.songpad.co | 音節カウンタ＋韻は既存機能と重複。**版管理（ドラフト履歴）はOtomemoに無い視点**。詞は何度も書き直すので、行/セクション単位のundo的な履歴機能は検討余地あり（[backlog.md](../backlog.md) の undo/redo 版管理と関連） |
| RHYMEBOOK | 音節辞書＋韻スキーム解析（AABB/ABAB等の型を検出）＋構成ビルダー（ドラッグでセクション配置） | https://www.rhymebook.com | 構成ビルダー（フォーム俯瞰＝Verse/Chorus/Bridgeをドラッグで組む）は既存の `SectionEditor` と機能的に近い。韻スキーム解析は日本語には型として薄い（日本語ポップスは脚韻文化が薄い）ので優先度低 |
| Snon AI | ジャンル認識＋Verse/Chorus/Bridgeの自動タグ付け | https://stackshare.io/snon-ai-lyric-generator | 自動タグ付けは既存の `role:` タグ名前空間と発想が同じ。完成品生成型（Otomemoの「機械は候補まで」思想とは相性が悪い） |
| Lyricistant | OSSのクロスプラットフォームエディタ。基本的な韻補助のみ | https://alternativeto.net/software/lyricistant | 最小構成の実装例として実装コスト感の参考になる程度 |

### 技法・知見（Pat Pattison系 prosody 理論、及び実務ブログ）

| 項目 | 内容 | 出典URL | 設計含意 |
|---|---|---|---|
| Prosody（強弱音節整合） | 強拍に強音節、弱拍に弱音節を合わせ「言語の自然な形を保つ」という原則（Pat Pattison） | https://www.patpattison.com/language-and-songwriting | 英語版アクセント整合原則。日本語では [jp-prosody-melody-rules](2026-07-14-jp-prosody-melody-rules.md) のアクセント整合(A-01〜10)が相当し、Otomemoは既に**「硬い制約にはしない」と裁定済み**（実メロのアクセント厳密一致は31.7%しかない、[lyrics-first-melody-verdict](2026-07-15-lyrics-first-melody-verdict.md)）。英語圏の理論もこの裁定の傍証として使える（「自然な形を保つ」＝完全一致ではなくガイドライン） |
| 強勢/非強勢音節の役割分担 | 強勢＝高・大・長で名詞/動詞/形容詞が担う、非強勢＝冠詞・前置詞・接続詞が担う | https://lyricassistant.com/syllable-counts-stress-make-lines-singable-without-math-trauma/ | 品詞ベースで強勢/非強勢を機械的に推定できる可能性を示唆（英語）。日本語では助詞を強拍に置かない、というOtomemoの既存所見（[kariuta-lyrics-craft](2026-07-15-kariuta-lyrics-craft.md)）と同型の発想 |
| meter（韻律格） | iambic（弱強＝上昇調・明るい印象）とtrochaic（強弱＝下降調・憂鬱な印象）を感情に合わせて選ぶ | https://literarydevices.net/mastering-poetry-meter-how-to-read-and-write-rhythmic-verse | 日本語には韻律格の概念自体が薄い（アクセント言語であり強勢言語ではない）。直接移植は不可、参考程度 |
| rhyme types（韻の型） | perfect（完全韻）/family/additive-subtractive/assonance/consonance を使い分け緊張と安定を演出 | https://www.tunedly.com/blog/understanding-rhyme-types-for-better-songwriting.html | 日本語の「韻」は母音一致が基本で英語ほど型が細分化されない。ただし「完全韻を多用しすぎない」という下記のover-rhyming警告は日本語でも成立しうる観点 |
| object writing（対象を7感覚で書く） | 一つの対象を10分間、視覚以外も含む7つの感覚で書き出すBerklee発の発想法 | https://www.masterclass.com/articles/object-writing | ブレスト支援の具体的なワーク。会話型の「発想を広げる」フェーズに使える型。[t3-intent-formation](2026-07-19-lyric-support-t3-intent-formation.md)（意図は書きながら形になる）と相性が良い＝いきなり歌詞を書かせず、まず対象を多感覚で書き出させる誘導 |
| held noteの母音選択 | 開母音（a/o/u）は伸ばしやすく、front vowel（前舌母音）は高音向き、back vowel（後舌母音）は低音向き | https://vocaltechnique.ca/vowels/ | 軸①の日本語ロングトーン知見と同じ着眼。英語版は前舌/後舌という軸を追加で持つ。Otomemo既存の「開口母音」知見の裏取りとして機能 |
| syllable-to-note原則 | 1音節=1音符が基本、詰まった場合は短縮形（gonna, I'll）で音数を減らす | https://www.rhymebook.com/tools/music/syllable-counter | 日本語の1モーラ=1音符原則（[jp-prosody-melody-rules](2026-07-14-jp-prosody-melody-rules.md)）と対応する英語版の原則。短縮形に相当する日本語の技法は省略・体言止め等 |

### 未充足（英語圏ブログの不満・課題）

| 項目 | 内容 | 出典URL | 設計含意 |
|---|---|---|---|
| melody-first workflow gap | 汎用AIは既存メロに詞を合わせられず、行の長さしか見ない | https://mysongcoach.com/using-ai-for-writing-lyrics/ | Otomemoは既にここを解いている（`analyze_lyric_fit`/`suggest_lyric_rhythm`はモーラ・アクセント両方を見る）＝**この不満は自ツールでは既に解消済みの領域**と確認できた |
| 音数ミスマッチで下書き放棄 | 「メロを直せ」でなく「同義語を5個出して」が欲しいという具体的な要望 | https://yourcreativeaura.com/lyric-writing-problems/ | 言い換え候補（軸①でも最頻出）への直接的な裏付け。**3軸で一致した最も確実な機能候補**の一つ |
| 弱いhook・差別化されないサビ | フックが弱い、サビが他曲と似てしまう、という悩み | https://allaboutsongwriting.com/the-seven-songwriter-problems-that-are-secretly-one-problem/ | 意味層の悩みでメロ側の[earworm-hook-features](2026-07-14-earworm-hook-features.md)と隣接するが、こちらは歌詞のフック（キャッチコピー的な一節）の話。実装は難しい（評価が主観的）ので現時点では保留候補 |
| over-rhyming | 完全韻を多用しすぎると幼稚に聞こえるという警告 | https://yourcreativeaura.com/lyric-writing-problems/ | 「韻を踏む機能を作るなら、踏みすぎ警告もセットで」という設計上の注意点。機能を作る際の副作用管理として記録 |
| 未完成曲問題 | ブレスト（無審判の発散）と推敲（収束）を分離すべき、完成を急がせてはいけない | https://online.berklee.edu/takenote/common-lyric-writing-roadblocks-and-ways-to-overcome-them/ | **横断要点の核**（後述）。Otomemoの既存の会話設計原則（[feedback-separate-what-from-how](../../../.claude/... 略／メモリ参照)＝発散→収束）と完全に一致する外部裏付け |
| フォーム俯瞰×行単位prosody統合ビュー不在 | 曲全体の構成（フォーム）を見る画面と、行ごとの音節・韻律を見る画面が分かれたままで統合されていない | https://www.rhymebook.com/tools/music/song-structure-builder | **横断要点で最も明確な「穴」**（後述）。RHYMEBOOKの構成ビルダーとSongPadの行カウンタが別ツールなのと同型の断絶がOtomemo内にも起こりうる＝`SectionEditor`（フォーム俯瞰）と歌詞編集（行単位）の統合UIは要設計 |

## 軸③: AI/学術研究＋DTM同人の声

**この軸のURL、特にarXiv番号は最も検証優先度が高い。** 番号のフォーマット自体はarXiv規則（YYMM.NNNNN）に沿っているが、実在確認はしていない。2602.22606（2026年2月投稿を意味する）は本リポジトリの既存 [t5](2026-07-19-lyric-support-t5-existing-ai-tools.md) にも同一番号が登場しており（CoLyricist論文として）、その doc 側でも出典として使われている＝独立に2回出てきたこと自体は多少の傍証になるが、**それでも一次アクセスでの確認は済んでいない**ため要検証のまま扱う。

| 項目 | 内容 | 出典URL | 設計含意 |
|---|---|---|---|
| Workflow統合型AI支援 | 完成品を出すのでなく、人間の判断サイクルの中に提案を挿し込む設計思想 | https://arxiv.org/pdf/2602.22606 (要検証) | Otomemoの「候補まで機械・仕上げは人間」思想そのもの。[t5](2026-07-19-lyric-support-t5-existing-ai-tools.md)のCoLyricistと同一論文の可能性が高い（番号一致）＝**既に本リポジトリで検討済みの文献の可能性大**、新規性は薄いかもしれない |
| 2次元アライメント符号化 | 音節と音符の対応を1対1・1対多で符号化する手法 | https://arxiv.org/pdf/2412.18107 (要検証) | 歌詞→メロ生成（詞先）側の技術的な参考。Otomemoは既に `planLyricMelody` で音数厳密一致の割付を実装済み＝相当する機能は自前で解決している |
| 旋律拘束下での歌詞改作 | 曲先で歌いにくい詞を、旋律を保ったまま自動的に書き直す | https://aclanthology.org/2025.naacl-long.564.pdf (要検証) | 軸②のREFFLY（[t5](2026-07-19-lyric-support-t5-existing-ai-tools.md)に既出）と同種の技術。**書き直しを機械が「する」のはOtomemoの「仕上げは人間」原則と緊張関係にある**＝提案止まりにすべき機能 |
| Prosody可視化による歌いやすさ向上 | 韻律を可視化するとスコアが上がるという実験結果 | https://www.ijcai.org/proceedings/2024/0872.pdf (要検証) | 軸①のアクセント可視化案の裏付けとして機能。可視化そのものの効果を実証している点が価値 |
| 音韻継続時間モデリング | 音素の継続時間（ノート長）をボカロ/UTAUのノートに反映するモデル | https://arxiv.org/pdf/2102.09202 (要検証) | Otomemoの歌唱合成（VOICEVOX歌唱、[singing-voice-synthesis](2026-07-01-singing-voice-synthesis.md)）に近い領域。ノート長の自動最適化は既存実装の外側の話で優先度は低い |
| 言語学的強勢規則の学習 | 強勢のある音節を強拍・高音へ配置する規則をデータから学習する | https://arxiv.org/pdf/2412.04202 (要検証) | 英語版の規則学習。日本語版は既に [jp-prosody-melody-rules](2026-07-14-jp-prosody-melody-rules.md) で規則表として整備済み＝**手元に既にある成果物の方が具体的** |
| 長音への母音選択戦略 | ロングトーンにどの母音を当てるかの実務的な戦略記事 | https://homerecording.com/bbs/threads/use-of-vowels-when-writing-songs.389092/ | 軸①②のロングトーン母音知見と三重に一致（後述横断要点）。フォーラム投稿のため証拠の強さは弱いが、実務者の実感としては裏付けが厚い |
| 音韻アクセント整合（pitch accent言語） | 「橋」と「箸」のような同綴異義語をアクセント辞書から抽出し旋律の音高と照合する | ICPhS2015 https://www.internationalphoneticassociation.org/icphs-proceedings/ICPhS2015/Papers/ICPHS0277.pdf (要検証) | Otomemoの `analyze_lyric_fit` がまさにこれをやっている（同綴異義の文脈弁別込みでpyopenjtalkが対応、[kariuta-accent-feasibility](2026-07-15-kariuta-accent-feasibility.md)）＝**既に実装済みの機能の学術的裏付け** |
| 制約充足による日本語作曲Orpheus | 詞を先に決め、韻律を制約として動的計画法で旋律を最適化生成する | https://link.springer.com/chapter/10.1007/978-3-642-04052-8_47 | Otomemoは既にこの設計（Orpheus型二段DP＝設計B）を検討・**不採用と裁定済み**（[lyrics-first-melody-B](../archive/2026-07-15-lyrics-first-melody-B.md)＝硬い制約は自作曲を生成禁止にするほど厳しすぎると実測で判明、[lyrics-first-melody-C-audit](2026-07-15-lyrics-first-melody-C-audit.md)）。**既決事項＝再検討不要** |
| 歌唱翻訳（音節/韻/音素制約の同時充足） | 多言語で歌える翻訳を音節数・韻・音素制約を同時に満たしながら作る | https://arxiv.org/pdf/2305.16816 (要検証) | Otomemoのスコープ外（翻訳は扱っていない）。制約充足の手法としてのみ参考 |
| アマチュアの困りごと：音数合わせの反復 | 音数を合わせる作業を何度も繰り返す苦労 | https://note.com/kawauso_gt/n/n02344a089a14 | 軸②「音数ミスマッチで下書き放棄」と同型の日本語版の声。**言い換え候補機能の必要性を三重に裏付け** |
| 意味先行 vs 音先行のトレードオフ | 意味を優先するか音を優先するかをスライダーで調整する案 | https://note.com/kascy4869/n/na8cfe2e771fe | 発想として面白いが実装は難しい（「意味」を機械がどう評価するかが未解決）。むしろ会話の中で「今は音優先で言い換えて」「今は意味優先で」と**利用者が明示的に指定するUIの方が現実的** |
| OSS歌唱合成基盤 | UTAU/Sinsy/OpenUTAU連携についての情報 | https://github.com/OpenUtau/OpenUtau | Otomemoは既にVOICEVOX歌唱を採用済み（[singing-voice-synthesis](2026-07-01-singing-voice-synthesis.md)で比較検討済み・裁定済み）。再検討不要 |
| 音高輪郭の整合と感情 | 音節内/音節間のピッチの動きの整合と、感情表現の一致についての研究 | https://arxiv.org/pdf/2207.05688 (要検証) | [t5](2026-07-19-lyric-support-t5-existing-ai-tools.md)の melody-to-lyrics 技術群に既に同一URLが登場（3.節）＝重複確認済みの文献 |
| アマチュアの困りごと：試聴→手直しの反復が7割 | 入力してから試聴し手直しする反復作業が作業時間の約70%を占めるという体感談 | https://note.com/rit4_hinarai/n/n6eeb47257eed | 数字の出典裏取りは要（要検証・個人の体感の可能性）。ただし方向性は「試聴環境を速くする」ことの価値を裏付ける＝既存の歌唱合成（RTF≈0.10、[kariuta-voicevox-feasibility](2026-07-15-kariuta-voicevox-feasibility.md)）は既にこの反復を速くする側に寄与している |
| 制約充足フレームワークCOMPOzE | 作曲全体をCSP（制約充足問題）として定式化し候補を高速列挙する古典研究 | https://www.ps.uni-saarland.de/Publications/documents/COMPOzE96.pdf (要検証) | 1996年の文献と思われ、現代のニューラル系手法と比べ具体的な実装示唆は薄い。CSPという発想の源流として記録するのみ |
| 歌詞メロディ関係の実証設計原理 | ヒット曲コーパスから統計を取り、キーワードは高音に乗る等の関係を実証した研究 | https://www.researchgate.net/publication/220723643 (要検証) | Otomemoは自前でPOP909統計を多数取得済み（[skeleton-corpus-stats](2026-07-14-skeleton-corpus-stats.md)等）。歌詞×メロの関係に絞った統計は未取得＝将来の自前統計の候補（他者コーパスからは統計のみ抽出の原則を守った上で） |
| 既存音声からのForced Alignment | 「歌ってみた」音声から詞とメロの対応を逆抽出し個人のreference corpusを作る | https://www.iis.sinica.edu.tw/papers/whm/19922-F.pdf (要検証) | オーナー自身の過去曲・仮歌wavを教材化する発想として面白い。Otomemoは既にVOICEVOX歌唱＋既存のオーディオ解析基盤（[audio-to-neta-extraction-map](2026-07-07-audio-to-neta-extraction-map.md)）を持つため、技術的には遠くない。ただし優先度は現時点で低（新規のパイプラインが要る） |

---

## 横断の要点

3つの調査軸は独立に集められたが、複数軸で同じ結論に収束した項目と、逆にどの軸にも薄い「穴」がある。

### 3軸が独立に一致した「筋の確実な柱」

1. **音数割付（モーラ/音節カウント）** — 軸①（モーラカウンター・定番フレーム）／軸②（syllable counter・SongPad/RHYMEBOOK）／軸③（アマチュアの困りごと：音数合わせの反復）の3軸すべてで最頻出。Otomemoは `analyzeMoras`/`suggestLyricRhythm` で**既に土台を持つ**。
2. **アクセント/prosody整合** — 軸①（ピッチアクセント4型可視化・OJAD）／軸②（Pat Pattisonの強弱整合）／軸③（pitch accent言語のICPhS研究・言語学的強勢規則学習）で三重に一致。Otomemoは既に実装・裁定済み（**硬い制約にせず検査/ランキング**、[lyrics-first-melody-verdict](2026-07-15-lyrics-first-melody-verdict.md)）＝この裁定が3軸の知見とも整合していたことが今回のサーベイで確認できた。
3. **ロングトーン向き母音** — 軸①（え/う高音向き・いは喉詰まり）／軸②（open vowel/front-back vowel）／軸③（長音への母音選択戦略）で三重に一致。Otomemoは既に独自の実測知見を持つ（[kariuta-lyrics-craft](2026-07-15-kariuta-lyrics-craft.md)）が、う段の扱いに軸①との食い違いがあり要すり合わせ（上表参照）。
4. **言い換え候補（音数を保った類義語提示）** — 軸①（sakushi）／軸②（「同義語5個が欲しい」という直接の不満の声）／軸③（アマチュアの困りごと：音数合わせの反復）で三重に一致。**3軸で最も支持の厚い未実装機能**。実装は類語辞書＋`analyzeMoras`のモーラ数フィルタで、既存の土台からの距離が近い。
5. **俯瞰ビュー（フォーム構成を見る画面）** — 軸①（構成別テーマ統一・視点ブレ検出は構成全体を見て初めて可能）／軸②（RHYMEBOOKの構成ビルダー）で一致。Otomemoには既に `SectionEditor` があるが、**歌詞編集と統合されているかは別問題**（後述の穴と表裏）。
6. **無審判ドラフトと推敲監査の2段構成** — 軸②（object writing＝無審判の発散／未完成曲問題＝ブレストと推敲の分離）と軸①（初心者10失敗パターンのチェックリスト＝推敲側の監査項目）で対になって一致。これは**既存プロジェクトの合意事項と完全に整合する**外部裏付け＝「WHATとHOWを分ける」「発散→収束」という運用原則（ユーザーメモリの既存合意）、および助け方の6型を切り分けた [t2-modes-of-helping](2026-07-19-lyric-support-t2-modes-of-helping.md) の枠組みと同じ構造。実装的には「候補を出す（無審判・発散）」フェーズと「チェックする（推敲・収束）」フェーズを会話上で明確に分けて提示するのが筋。

### 誰も埋めていない穴

- **フォーム俯瞰×行単位prosodyの統合ビューの不在** — 軸②で最も明確に指摘されている（RHYMEBOOKの構成ビルダーとSongPadの行カウンタが別ツール）。日本語圏でも構成全体を見るツール（sakushi等）と行単位のモーラカウンターは別々の道具として存在し、統合例は見当たらなかった。Otomemo自身も `SectionEditor`（構成）と歌詞編集（行単位）が現状どこまで統合されているか要確認＝設計時の要注意点。
- **曲先領域の手薄さ** — 軸②の商用ツールはほぼ全て詞先（メロなしでテキストとして書く）を前提にしており、「既にあるメロに詞を合わせる」機能を持つのはSongPad/RHYMEBOOKの音節カウンタ程度で、旋律の**音高**まで見て韻律を合わせるツールは軸②③どちらでも実在が確認できなかった（軸③のREFFLY/CoLyricistが研究レベルで最も近いが商用ではない）。**Otomemoの `analyze_lyric_fit`（音高×アクセント照合）は、この「誰も埋めていない曲先領域」に既にかなり踏み込んでいる**という位置づけが今回の調査で相対的に確認できた。

---

## 実装の足場（既存資産との対応）

| 足場 | 現状 | 出典 |
|---|---|---|
| アクセント辞書 | pyopenjtalk採用済み（OJADでなく）。都度spawn 0.13-0.23秒、モーラ分割20/20一致、同綴異義を文脈弁別 | [kariuta-accent-feasibility](2026-07-15-kariuta-accent-feasibility.md) |
| モーラ規則 | `analyzeMoras`（`packages/music-core/src/prosody.ts`）で促音/撥音/長音を1モーラ計上済み | コード：`packages/music-core/src/prosody.ts:46` |
| 制約充足（詞先メロ生成） | `planLyricMelody` + `gen_melody` の `lyrics` パラメータで音数厳密一致のメロ候補生成が既に実装済み（design #13d）。6/8系は未対応 | コード：`apps/api/src/mcp.ts:741`以降 |
| `suggest_lyric_rhythm` | かなをモーラへ分割し譜割り案を返すMCPツール。チャットのallowlistに登録済み | `apps/api/src/mcp.ts:1027`, `apps/api/src/chat-session.ts:23` |
| `analyze_lyric_fit` | メロに乗った歌詞のアクセント×音高の整合を検査し赤/黄で報告するMCPツール。確定はしない候補提示 | `apps/api/src/mcp.ts:1032`, `packages/music-core/src/prosody.ts:332` |
| `set_lyric` | かな歌詞を音符へ流し込む（syllable付与）MCPツール | `apps/api/src/lyric.ts`, `apps/api/src/mcp.ts:1007` |
| Web側の可視化配線 | `analyze_lyric_fit` はwebから未呼び出し＝赤黄ハイライトが画面に出ていない（穴として既知） | [kariuta-impl-audit](2026-07-15-kariuta-impl-audit.md) |

今回のサーベイで新たに浮かんだ実装候補（言い換え候補・韻検索・フォーム俯瞰統合）は、上記のどれとも重複しない**新規領域**であり、上の足場に「乗せる」形で追加できる。

## 競合

| ジャンル | 名前 | 位置づけ |
|---|---|---|
| 日本語 | sakushi | 五七調検出・母音バランス可視化・言い換え候補・構成別視点ブレ検出まで持つ最も総合的な日本語作詞支援。Otomemoが新規機能を検討する際の直接比較対象 |
| 英語 | MasterWriter | 2003年から続く老舗プロ用スイート。類語・韻・頭韻・文化参照の網羅性が強み |
| 英語 | LyricStudio | AI生成寄り。既に[t5](2026-07-19-lyric-support-t5-existing-ai-tools.md)で実証込み検討済み（質の第三者検証なし・課金トラブル報告あり） |
| 英語 | RhymeBook | 音節辞書＋韻スキーム解析＋構成ビルダー。フォーム俯瞰の実装例として参考になる |
| 英語 | SongPad | 行ごと音節カウンタ＋韻マッチ＋版管理。版管理の視点が独自 |

---

## 残タスク（このサーベイの後段）

- 本doc記載のURL、特に軸③のarXiv番号のスポット確認（実在確認・タイトル一致確認）。
- 「言い換え候補（音数保持の類義語提示）」を最有力の新規機能候補として design.md へ落とすかどうかの検討（このdocは調査止まり・実装判断は別途）。
- フォーム俯瞰（`SectionEditor`）と行単位歌詞編集の統合状況の現状確認（穴として指摘した箇所の実態確認）。
