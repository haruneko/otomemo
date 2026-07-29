# 歌詞テキストと音符に載る音節 — 既存ツールの入力UI調査（2026-07-29）

## 0. 目的と方法

**目的**：Otomemo の作詞補助で、歌詞の入力口が2つある現状（①「歌詞」欄＝漢字仮名交じりを打つと自動で音符にかなが載る・音符数不変／②「かな」欄＋「流し込む」ボタン＝モーラ数に合わせて音符を分割して割り当て）について、オーナーから「流し込むのUIと機能重複してるしこれどうするのがいいんかな？？」「歌詞変えた瞬間に仮歌変わるの微妙くない？」と指摘を受けた。目先の重複消しでなく、**歌声合成ソフト・楽譜ソフト・DAWの先例がこの問題をどう解いているか**を調べ、理屈を立てた提案の材料にする。

**方法**：Web上の公式マニュアル・解説記事による机上調査（2026-07-29 実施・調査エージェント3体に分担）。**実機での動作確認はしていない**。公式マニュアル（VOCALOID 6 と旧 Piapro Studio は PDF 全文抽出で原文確認・信頼度高）を優先し、無い項目は解説記事・非公式Wiki・ソースコードで補った（各行の出典で区別できる）。分からなかった項目は「不明」と書き、推測で埋めていない（§6）。他者の歌詞・楽曲データは転記していない。

**6つの観点**：(1) 入力口の数と呼び名 (2) 適用は自動か明示か (3) 音符数と音節数が合わないときの挙動 (4) 元の文章（全文テキスト）を保持するか (5) 日本語特有の扱い (6) 画面上の置き方。

---

## 1. ツール別一覧（歌声合成）

| ツール | (1) 入力口と呼び名 | (2) 適用 | (3) 数が合わないとき | (4) 元の文章の保持 | (5) 日本語 | (6) 置き方 |
|---|---|---|---|---|---|---|
| **VOCALOID 6** | 2つ＋補助1。①ノートをダブルクリック/[Enter]でインライン（「歌詞入力モード」Ctrl+R＝「歌詞で入力」/「発音記号で入力」）②ジョブメニュー**「歌詞の流し込み」**（Ctrl+I・右クリックからも）「選択したノートを開始点として歌詞を流し込みます」③ノートインスペクターの「歌詞編集」 | 明示（[Tab]で確定して次ノートへ）。流し込みウィンドウの確定操作の詳細は不明。「元に戻す」は回数無制限 | 不明（マニュアルに記載なし）。ノートの分割/結合はジョブに別機能としてあり歌詞連動の警告は不明。**「歌詞を一文字前に/後ろにずらす」**（Shift+A / Shift+Z）＝ズレの手修正が前提 | 不明（保持・編集する場所の記載なし。ショートカット表に「歌詞の抽出」のみ存在し本文説明なし） | 漢字→かな変換の記載なし＝不明（かな変換ツールがユーザー側で流通＝かな入力前提を示唆）。「-」＝前ノートの母音を伸ばす（メリスマ記号） | インライン＋別ウィンドウ（流し込み）＋右パネル |
| **VOCALOID 5** | 2つ。ノート下ダブルクリック＋右クリック**「歌詞の流し込み」**（テキストエディター。パート右クリックからも可） | 記載なし＝不明 | 不明 | 不明 | ひらがな/カタカナ/ローマ字（半角スペース区切り）。漢字の扱い記載なし | インライン＋テキストエディター |
| **Piapro Studio NT2** | 実質1つの窓に2用途：ノートダブルクリックで**「歌詞入力パレット」**。同パレットで**「歌詞の流し込み入力」**＝「文字を連続して入力すると、既に入力済みのノートに歌詞が一音ずつ割り当てられます」 | **明示（[OK]で確定）**。「空欄にして[OK]をクリックした場合は、歌詞／発音記号は変更されません」。「元に戻す」あり | **「ノート数を超える文字は切り捨てられます」**（原文）。音符の自動追加の記述なし | 不明（記載なし） | **漢字不可**＝ひらがな/全角カタカナ/半角ローマ字。発音記号へ自動変換・手修正可。「を」は「お」。促音「っ」は3通りの表現。「-」＝母音伸ばし。拗音は1ノートにかな2文字（音素対応表あり） | ノートダブルクリックで開く小ウィンドウ（パレット） |
| **旧 Piapro Studio v2**（V3/V4X世代） | 同上（歌詞入力パレット＋[OK]確定） | 明示（[OK]） | **パレットの「詳細設定▼」に「余った歌詞」の選択肢＝「切り捨て」／「ノートを追加」（音符を自動で追加・追加時のノート長も設定）／「最後のノートにまとめる」**（余りを最後の音符に載せ、ナイフツールで分割すると「音節に合わせて歌詞も分割されます」）＝**不一致時の扱いをユーザーに選ばせる唯一の先例** | 不明 | 「漢字や数字やアルファベットなどを入力してもそのままでは歌わせることができないので、ひらがなや全角カタカナに直して入力して下さい」（原文）。**「ノートに含む」設定＝促音「っ」/長音「ー」を1音符に割り当てるか選択**。発音記号直接入力は赤字表示＝再入力時に「歌詞の割り当て」確認画面（上書き警告） | 同上 |
| **Synthesizer V Studio（Pro/2）** | 2つ。①ノートダブルクリックのインライン②メニュー**「修正」→「歌詞入力」**（Ctrl+L）/右クリック「歌詞入力」のダイアログ（英語UIは「Insert Lyrics…」系） | 明示（インライン＝Enter確定/Escキャンセル/Tabで次へ。ダイアログ＝OK）。Undoの明文は不明 | 音符の分割/結合はしない。多音節語を少ないノートに貼ると**1ノートに詰め込まれて発音され残りは空**（フォーラム実例）。「+」＝前の語の次の音節をこのノートへ、「-」＝母音伸ばし。ダイアログに「一文字づつ区切る」（CJK向け）「自動繰り返し」。余り時の警告は不明 | 不明（記載なし） | ひらがな/カタカナ/ローマ字対応。**日本語は1ノート1モーラ/1文字を推奨**（マニュアル）。漢字→かな変換の記載なし＝不明。音素はノート上部表示・ダブルクリックで直接編集可 | インライン＋別ダイアログ |
| **CeVIO AI（ソング）** | 2つ＋補助。①ノートダブルクリック/[F2]（[Tab]で次ノートへ連続入力）②**「歌詞のまとめ入力」**（ソングメニュー/右クリック/[F8]）＝モード**「スペース区切り」**と**「1音符1文字」**。補助＝「音素で歌詞入力」「英語歌詞の自動分割」 | 明示（[Enter]確定・[Tab]確定して次へ・まとめ入力はダイアログ） | 不明（公式ガイドに余り/不足の記載なし）。「スペース区切り」では1音符に複数文字も載せられる | 記載なし（音符上の歌詞のみ） | **入力可能文字は「全角ひらがな／カタカナ、半角アルファベット」と明示＝漢字不可**。「しゃ」等は「1音符1文字」モードでも2文字が割り当たる＝**モーラ単位** | インライン＋ダイアログ |
| **VoiSona** | 2つ。ノートダブルクリック＋**「歌詞のまとめ入力」**（ボタン/右クリック）＝「スペース区切り」/「1音符1文字」 | 明示（Tab/Shift+Tabで移動・ピアノロールクリックで確定） | 不明（「スペースの後ろの歌詞が次の音符に割り当てられます」の送り仕様のみ確認） | 記載なし | かな/アルファベット（CeVIO系と同仕様）。読みの微修正は音素列編集（「,」＝音素の区切り・「\|」＝シラブルの区切り。例「ちせい」→`ch,i\|s,e\|i`） | インライン＋パネル |
| **UTAU** | 複数。メイン画面常設の**「Lyric」欄**＋**「歌詞で挿入」**ボタン（新規音符ごと書き出し）＋**「歌詞を置換」**ボタン（選択済み音符へ流し込み・休符は除外）＋ノートダブルクリック＋プロパティ。歌詞操作の多くはプラグイン文化（「連続音一括設定」等） | 明示（ボタン押下）。Undoは不明 | 「歌詞の文字数よりも選択された音符の数が少ない時は前の文字から書き込まれます」＝**先頭から音符数ぶんだけ使い、自動分割しない**。歌詞が少ない場合は不明 | Lyric欄は入力作業用で、正データは音符ごとの歌詞のみ | 漢字変換なし（かな入力・「は→わ」等の発音化も人間の仕事）。1音符1モーラが基本。連続音化はプラグイン | 常設欄（ピアノロール外）＋音符上編集 |
| **OpenUtau** | 2つ＋拡張。①ノートダブルクリックの Lyric Box（tabで確定し次へ）②複数ノート選択＋Enterで Lyrics Dialog（一括）。ほかに Batch Edits／Lyric Transformers／Legacy Plugins | 明示。一括ダイアログは**Undo対応をソースで確認**（`StartUndoGroup("command.note.lyric")`） | ソースの `for (i < lyrics.Count && i < notes.Length)` により**少ない方に揃える＝余った歌詞は捨てられ、余ったノートは元の歌詞のまま**。分割/結合しない。複数ノートにまたがる音節は「+」「+~」を手で置く | なし（ノートの `lyric` プロパティのみ。テキストエディタで編集する外部プラグイン UNotePad の存在が「まとまったテキスト編集口の不在」の傍証） | 漢字変換なし。かな→音素は内蔵 phonemizer。かな1ノート1モーラ基本 | インライン＋ダイアログ |
| **NEUTRINO** | 本体に歌詞入力UIなし（入力は MusicXML＝歌詞は楽譜ソフト側で付ける）。非公式「NEUTRINO調声支援ツール」は右クリック→**「歌詞の流し込み」**（実メニュー名）でひらがな一括 | 本体はファイル一括処理。支援ツールはダイアログ→OK（明示） | エラー・警告の記載なし。「一音符に対して母音を二つ以上いれた場合、区切らずに繋いで歌う傾向」＝不正でもそのまま処理 | **正データが外部の楽譜ファイル（MusicXML）**＝楽譜ソフト側でまとまった歌詞をいつでも編集できる（本体の外に全文が恒久保持される唯一の構図） | 「ひらがな・カタカナで発音通りに全角で記述」＝漢字不可・読み変換は人間。「'」＝母音脱落、「ー」＝直前の母音と同じ、「っ」単独は特別処理 | 本体はUIなし。楽譜ソフトの歌詞行＋支援ツールのダイアログ |
| **VOICEVOX ソング**（0.16でソング・0.19で一括入力追加） | **実質1つ**。「ノートをダブルクリックすることで歌詞を入力できます」＋同じ欄に「複数の文字を入力すれば一括入力できます」（後続ノートへ順に割り当て）。独立した流し込み画面は無い。**issue #2116**＝「1モーラ入力と一括入力で違いが無く…2モーラ以上を入力しないとこの機能があることに気付けない」＝**口を1つに兼ねた結果の発見性問題が実際にissue化**（右クリック一括はopen提案） | フォーカスアウトで確定＋入力中プレビュー（PR #1952 のコードで確認）。Undoは不明 | 不明（超過分の扱いの記載を公式・issueとも見つけられず）。自動分割の記載なし | なし（要望 #1815 自体が使い捨て流し込み） | 文字種制限（漢字可否）は公式に明示なし＝不明。1ノート1文字（1モーラ）基本 | ノート上のインラインのみ |

**出典（歌声合成）**：
- VOCALOID 6: [V6.7.0 リファレンスマニュアル(PDF)](https://rsc-net.vocaloid.com/assets/pdf_files/bb/VOCALOID_Reference_Manual_JPN.pdf)（原文確認）／補助 [解説記事](https://bringyouralibis.hateblo.jp/entry/2023/04/20/092202)・[DTMステーション](https://www.dtmstation.com/archives/58414.html)・[かな変換ツールの流通](https://booth.pm/ja/items/3599937)・[かな歌詞作成マニュアル](https://piapro.jp/content/axltne87x5a9eg52)
- VOCALOID 5: [sleepfreaks 基本](https://sleepfreaks-dtm.com/softsynth/vocaloid-5-1/)・[sleepfreaks 応用](https://sleepfreaks-dtm.com/softsynth/vocaloid5-advance-1/)・[サンレコ](https://www.snrec.jp/entry/special/vocalo-p_chapter2-1)
- Piapro Studio NT2: [公式オペレーションマニュアル](https://sonicwire.com/download/pps-manual/2510_ppsnt2/ja/ppsnt2_manual-ja.html)
- 旧 Piapro Studio v2.0.0: [オペレーションマニュアル(PDF・archive.org)](https://dn710207.ca.archive.org/0/items/data2_202411/Documents/Piapro%20Studio%20v2.0.0%20Operation%20Manual%20-%20JPN.pdf)（原文確認）
- Synthesizer V: [非公式マニュアル(英)](https://manual.synthv.info/quickstart/entering-lyrics/)・[Dreamtonics公式 SV2](https://svdocs.dreamtonics.com/ja/synthv/basic-usage/pianoroll)・[旧公式 batch_lyric_input](https://synthesizerv.com/manual/batch_lyric_input.htm)・[sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)・[非公式Wiki](https://synthesizer-v.fandom.com/ja/wiki/%E5%BF%9C%E7%94%A8%E6%93%8D%E4%BD%9C)・[サンレコ](https://www.snrec.jp/entry/PR/technique/synthesizerv_2401_1)・[多音節詰め込みの実例報告](https://gearspace.com/board/music-computers/1440451-synthesizer-v-singer-synthesis-software-anyone-using.html)
- CeVIO AI: [公式ユーザーズガイド 歌詞の入力](https://cevio.jp/guide/cevio_ai/songtrack/song_04/)・[メニュー一覧](https://cevio.jp/guide/cevio_ai/operation/menu/)
- VoiSona: [公式マニュアル](https://manual.voisona.com/ja/song/pc/2b6e9bc7efb180d7bc2dd6c8e40ae93d)・[解説記事](https://note.com/tsukikagesansyo/n/n16c4724a1d9f)・[oyu-sound](https://oyu-sound.com/cevio-pro-howtouse/)
- UTAU: [UTAU用語一覧(wiki)](https://wikiwiki.jp/kitkat3/UTAU%E7%94%A8%E8%AA%9E%E4%B8%80%E8%A6%A7)・[使い方解説](https://free2songwrite.com/utau-tsukaikata/)・[連続音](https://free2songwrite.com/utau-vcv/)・[くろ州「ツールバーでよく見る項目」](https://note.com/96s_km4osm/n/n2a357ea74769)
- OpenUtau: [Getting Started(公式wiki)](https://github.com/stakira/OpenUtau/wiki/Getting-Started)・[LyricsViewModel.cs(ソース)](https://github.com/stakira/OpenUtau/blob/master/OpenUtau/ViewModels/LyricsViewModel.cs)・[PR #554](https://github.com/stakira/OpenUtau/pull/554)・[UNotePad](https://github.com/oxygen-dioxide/UNotePad)
- NEUTRINO: [公式 MusicXML仕様](https://studio-neutrino.com/332/)・[MuseScore連携解説](https://oyu-sound.com/neutrino-musescore/)・[調声支援ツール解説](https://ossan-gamer.net/post-82050/)・[npaka解説](https://note.com/npaka/n/n5a4a9b683534)
- VOICEVOX: [公式 使い方](https://voicevox.hiroshiba.jp/how_to_use/)・[変更履歴](https://voicevox.hiroshiba.jp/update_history/)・[issue #2116](https://github.com/VOICEVOX/voicevox/issues/2116)・[issue #1815](https://github.com/VOICEVOX/voicevox/issues/1815)・[PR #1952](https://github.com/VOICEVOX/voicevox/pull/1952)・[くろ州 Song解説](https://note.com/96s_km4osm/n/n899ea3bdb1f8)

---

## 2. ツール別一覧（楽譜ソフト・DAW）

| ツール | (1) 入力口と呼び名 | (2) 適用 | (3) 数が合わないとき | (4) 元の文章の保持 | (5) 日本語/CJK | (6) 置き方 |
|---|---|---|---|---|---|---|
| **MuseScore**（4系） | 実質1つ＋準バルク。①音符選択→`Add → Text → Lyrics`（Ctrl+L）でインライン。Space＝次の語・「-」＝次の音節で次の音符へ ②専用の流し込みUIは無く、整形済みテキストをコピーして**Ctrl+Vを繰り返し押すと1音節ずつ貼り付く** | 打鍵/貼り付けの都度即確定（Undoの明文は不明） | **分割/結合は一切しない**。貼り付けは1回1音節なので余りは貼られず残るだけ。メリスマは「_」「-」を音符数ぶん押す | **保持しない**（音符に付いた音節だけが正データ。全文の編集場所なし） | 日本語IMEはSpaceが「変換」に取られ次音符へ進めない既知問題。回避のコミュニティプラグインあり | 五線下インライン |
| **Dorico** | 実質1つ＋公式貼り付け。①Shift+L の **Lyrics popover**（`Write > Create Lyrics`）。Space/「-」で送る ②popoverへの**クリップボード貼り付けが公式機能**＝元テキストのハイフン/スペースに従い自動で次音符へ | popover確定の都度即適用（Undoの明文は不明） | 分割/結合しない。貼り付け前に「単一スペース・単一ハイフンのみか」をチェック。メリスマ箇所は貼り付け中でも手で Space/「-」/右矢印 | **全文は保持しない**。「Edit > Lyrics > Edit Line of Lyrics…」で1行を連続テキストとして一括編集できるが**音節の総数を変えてはならない**（音節列からの再構成ビュー） | v3公式に「**CJK文字を含む歌詞はコピー/ペーストできない**」と明記。日本語向け「ハイフン（音引き「ー」）を延長線の代わりに使う」公式オプションあり | ポップオーバー（音符に追従する小入力欄）→五線下描画 |
| **Sibelius** | **3つ**を公式に区別。①Ctrl+L で直接タイプ ②歌詞入力中に**Ctrl+Vを1音符ずつ**（言語設定で自動音節分割）③**「From Text File...」**＝テキストファイルを選び自動ハイフネーション＋**スラーの位置からメリスマを判定して一括流し込み** | ①②は即時。③はダイアログでOK（「Automatically syllabify ambiguous words」をOFFにすると曖昧語ごとに人へ確認） | 分割/結合しない。③はメリスマを事前のスラーから判断。余った音節の扱いは不明 | **保持しない**（From Text File は読込時の一方向変換） | 不明 | 五線下インライン＋③のみダイアログ |
| **Finale** | **2つ**を公式に区別。①**「Type Into Score」**＝譜面上で直接タイプ ②**「Click Assignment」**＝先に**「Lyrics window」**（内蔵テキストプロセッサ）へ歌詞全文を書き、音符クリックで音節を割当。**Ctrl+クリックで残りを連続音符へ一括割当** | ①即時 ②クリック/Ctrl+クリックという明示操作。Undoあり（マニュアル明記） | 分割/結合しない。一括割当は「**until it runs out of either notes or syllables**」＝どちらかが尽きたら止まり、**余った音節は Lyrics window に未割当のまま残る** | **保持する（今回の調査で唯一の本格的な全文保持）**。Lyrics window が全文を持ち譜面と**双方向に動的リンク**：「If you change a syllable in the Lyrics window, every occurrence … is automatically changed in the score—and vice versa」。ただし削除経路で非対称（Type Into Scoreで消すと全文からも消える／Selectionツール等で消すと譜面から外れるだけで全文には残る） | 不明 | ①五線下インライン ②別ウィンドウ＋譜面クリックの併用 |
| **Cubase（Score Editor）** | **2つ**。①Symbolsタブの「Lyrics」で音符下をクリック→入力→**Tabで次の音符へ** ②**「Scores > Functions > Lyrics from Clipboard」**＝「語はスペース・音節はダッシュ区切り」のテキストを選択音符から一括適用。ほかにカラオケMIDI歌詞のテキスト読込設定 | ①Return/枠外クリックで確定 ②メニュー実行（明示） | 分割/結合しない。歌詞はノート位置に紐づくテキストで、**音符間隔のほうが歌詞に合わせて広がる**。余剰・メリスマ操作の明文なし＝不明 | **保持しない**（読み込みは一方向） | 不明 | 五線下インライン＋メニュー一括 |
| **Logic Pro（Score Editor）** | **1つ（音符1つずつのみ）**。Part boxの「lyric object」＋Textツールでクリック→入力→**Tab（Returnではない）で次の音符へ**。クリップボード一括・ファイル読込は文書に存在しない | 入力の都度確定 | 分割/結合しない。1つの長い音符に複数音節を書ける（逆方向の自由）。「each syllable is saved as an independent lyric object」 | **保持しない** | 不明 | 五線下インライン |

**出典（楽譜ソフト・DAW）**：
- MuseScore: [ハンドブック Lyrics](https://handbook.musescore.org/text/lyrics)・[v4ハンドブック](https://musescore.org/en/handbook/4/lyrics)・[日本語IME問題](https://musescore.org/en/node/16011)・[日本語歌詞入力プラグイン](https://github.com/bakajikara/MuseScoreLyricsJP)
- Dorico: [Inputting lyrics(公式)](https://www.steinberg.help/r/dorico-pro/6.1/en/dorico/topics/write_mode/write_mode_notations_input/write_mode_lyrics_inputting_t.html)・[Copying/Pasting lyrics(v3・CJK不可の明記)](https://archive.steinberg.help/dorico/v3/en/dorico/topics/notation_reference/notation_reference_lyrics/notation_reference_lyrics_copying_pasting_t.html)・[Edit Lyrics dialog(公式ブログ)](https://blog.dorico.com/2019/10/tip-edit-lyrics-dialog/)・[日本語ハイフン設定(公式・日本語)](https://www.steinberg.help/r/dorico-pro/6.1/ja/dorico/topics/notation_reference/notation_reference_lyrics/notation_reference_lyrics_hyphens_japanese_hiding_showing_t.html)・[popover一覧](https://www.steinberg.help/r/dorico-pro/6.1/en/dorico/topics/write_mode/write_mode_notations_input/write_mode_lyrics_popover_r.html)
- Sibelius: [3 ways of entering lyrics](https://enjoymusiconaprofessionallevel.wordpress.com/2014/04/11/sibelius-6-quick-tip-no-24-lyrics-part-5-3-ways-of-entering-lyrics/)・[Scoring Notes](https://www.scoringnotes.com/tips/making-lyrics-something-to-sing-about/)・[From Text File 解説](https://makingthemostofnotationsoftware.blog/2010/09/16/sibelius-lyric-entry-from-a-text-file/)・[公式リファレンス(PDF)](https://resources.avid.com/SupportFiles/Sibelius/2024.3/Sibelius_Reference.pdf)
- Finale: [Lyrics(公式マニュアル)](https://usermanuals.finalemusic.com/FinaleWin/Content/Finale/Lyrics.htm)・[Lyrics window(公式)](https://usermanuals.finalemusic.com/FinaleWin/Content/Finale/EDITLYRC.htm)・[Click Assignment(公式チュートリアル)](https://usermanuals.finalemusic.com/Finale2010Mac/Content/Finale/Tutorial_2__Adding_Details4.htm)
- Cubase: [Inserting Lyrics(公式)](https://archive.steinberg.help/cubase_pro_score/v10.5/en/cubase_nuendo_score/topics/working_with_text/working_with_text_lyrics_inserting_t.html)・[Lyrics from Clipboard(公式)](https://archive.steinberg.help/cubase_pro_artist/v9/en/cubase_nuendo/topics/midi_editor_score_editor/working_with_text/score_editor_lyrics_from_the_clipboard_adding_t.html)・[Lyrics(公式v12)](https://archive.steinberg.help/cubase_pro_score/v12/en/cubase_nuendo_score/topics/working_with_text/working_with_text_lyrics_r.html)
- Logic Pro: [Add lyrics to a score(Apple公式)](https://support.apple.com/guide/logicpro/add-lyrics-to-a-score-lgcp8535c865/mac)・[skydocu(ミラー)](https://logicpro.skydocu.com/en/view-and-edit-music-notation/add-lyrics-and-text/add-lyrics/)・[macProVideo解説](https://www.macprovideo.com/article/new-articles/logic-tutorial-lyric-entry-logic-pros-score-editor)

---

## 3. 共通する定石（複数ツールが同じ形に収束している点）

1. **入力口は「音符1つずつのインライン編集」＋「まとめて流し込む明示操作」の2本立てが標準。** VOCALOID 6/5・Piapro・Synthesizer V・CeVIO・VoiSona・UTAU・OpenUtau・Sibelius・Finale・Cubase が全部この形。呼び名は「歌詞の流し込み」（VOCALOID・NEUTRINO調声支援ツール・Piaproは「歌詞の流し込み入力」）、「歌詞のまとめ入力」（CeVIO/VoiSona）、「歌詞入力/Insert Lyrics」（SynthV）、「Lyrics from Clipboard」（Cubase）、「From Text File」（Sibelius）。くろ州の横断記事も「多くのソフトに共通する機能としては『歌詞の流し込み』のみ」と述べる（[出典](https://note.com/96s_km4osm/n/n2a357ea74769)）。
2. **適用はすべて明示。** OK/Enter/Tab/ボタン/フォーカスアウトのどれかを必ず挟む。**「文章を書いた瞬間に音符へ載る」自動適用のツールは、調査した15種のどれにも見つからなかった。**
3. **音符を勝手に分割・結合するツールは（既定の挙動としては）1つも無い。** 楽譜ソフト・DAW 6種は構造的にしない（歌詞は既存の音符に載るだけ）。歌声合成も既定は「少ない方で止まる」＝余りは切り捨て（Piapro NT2 原文「切り捨てられます」・OpenUtau はソースで確認）か、未割当のまま見せる（Finale＝Lyrics window に残る）。**唯一の例外が旧 Piapro Studio v2 の「余った歌詞」設定＝「切り捨て／ノートを追加／最後のノートにまとめる」をユーザーに明示的に選ばせる**（音符を増やすのは選択肢の1つであって既定ではない）。
4. **元の文章（全文テキスト）を保持するツールはほぼ皆無。** 音符にばらしたら音節だけになる。例外は2つだけ＝**Finale の Lyrics window**（全文を保持し譜面と双方向動的リンク）と、**NEUTRINO**（正データがそもそも外部の楽譜ファイル＝ツールの外に全文が残る）。
5. **漢字→読みの自動変換を持つ歌声合成は無い。** Piapro・CeVIO・NEUTRINO は「かな（＋英字）のみ」と明文があり、変換は人間の仕事。VOCALOID 向けには「ひらがな変換ツール」がユーザー側で流通している。
6. **日本語は1音符1モーラが原則。** 拗音（きゃ等）はかな2文字で1音符（CeVIO・Piapro音素表）。長音・促音は「-」記号や設定（旧Piapro「ノートに含む」）で扱う。読み・発音の微修正は「発音記号/音素の直接編集」という別レイヤーの口で受ける（VOCALOID発音記号・SynthV音素・VoiSona音素列）。

## 4. 分かれている点（設計判断が要る所）

- **まとめて入れる口の形**：別ダイアログ（CeVIO/SynthV/Piapro/VOCALOID）／常設欄（UTAUのLyric欄）／**同じインライン欄の多文字入力で兼ねる（VOICEVOX）**。VOICEVOX の「口を1つに兼ねる」形は省スペースだが、「2モーラ以上を入力しないとこの機能があることに気付けない」と**発見性の問題が実際に issue 化されている**（[#2116](https://github.com/VOICEVOX/voicevox/issues/2116)）。
- **余った音節の扱い**：切り捨て（Piapro NT2・OpenUtau）／最後の音符に詰める（旧Piapro選択肢・SynthVは1音符に詰めて発音）／未割当のまま人に見せる（Finale）／ユーザーに選ばせる（旧Piapro）。警告を出すという形は今回の調査では確認できなかった。
- **全文を持つかどうか**：Finale だけが持つ。持つ場合の同期方向も Finale は「双方向・自動」だが、削除経路で非対称になる複雑さを抱えている。
- **メリスマ・音節送りの記号**：「+」（SynthV/OpenUtau）／「-」「_」（楽譜ソフト）／「ー」（日本語系）／スラーから判定（Sibelius）と、ツールごとにばらばら。
- **音符側を変える道具の置き場**：音符の分割/結合は歌詞機能と別のジョブ（VOCALOID 6）に置くのが普通で、歌詞入力が音符を変えるのは旧 Piapro の明示オプションのみ。

---

## 5. Otomemo への含意

### 5-1. 現状の2つの入力欄を先例に照らすと

| 現状 | 先例での位置づけ |
|---|---|
| ① 歌詞欄＝漢字仮名交じりを**打つと自動で**音符にかなが載る（音符数不変） | **「打った瞬間に適用」は15種のどれにも無い形**（定石2）。オーナーの「歌詞変えた瞬間に仮歌変わるの微妙くない？」は、先例が全員「明示適用」を選んでいる事実と符合する |
| ② かな欄＋「流し込む」＝モーラ数に合わせて**音符を分割**して割り当て | **既定で音符を変えるのも先例に無い形**（定石3）。最も近い先例＝旧 Piapro の「余った歌詞→ノートを追加」だが、それは**ユーザーが明示的に選ぶ選択肢の1つ**で、既定は「切り捨て」 |
| 正データ＝漢字仮名交じりの全文（句としてメロに持つ） | **他ツールの弱点を埋める側**。ほぼ全ツールが「音節だけになって元の文章が消える」のに対し、全文保持は Finale の Lyrics window と NEUTRINO（外部楽譜が正データ）だけ。**この設計は捨てるべきでなく、先例の中では最良の部類に接続している** |

つまり、いまの2欄の重複の正体は「**入口の違い（表記か・かなか）**」と「**作用の違い（音符を変えないか・変えるか）**」が絡まったまま2つの欄になっていること。先例は口を「入口の文字種」では分けず、**インライン（1音符ずつ）とまとめ入力（明示操作）で分け、音符を変える作用は既定から外す**という形に収束している。

### 5-2. 案（いずれも提案＝最終の物差しはオーナー）

**案A：適用だけ明示にする（2欄は残す）**
- 歌詞欄の自動適用をやめ、「当てる」ボタンを押したときだけ音符にかなが載るようにする。かな欄＋流し込むはそのまま。
- 倣う先例：全ツール共通の明示適用（定石2）。
- メリット：変更が最小。仮歌が勝手に変わる問題は消える。
- デメリット：**2つの口の重複そのものは残る**（「歌詞を当てる」と「かなを流し込む」が並ぶ理由を説明できない）。オーナーの1つ目の指摘（機能重複）に答えていない。

**案B：口を1本にし、「音符を変えない適用」を既定にする（推し・提案）**
- 入力欄は歌詞欄（漢字仮名交じり）1本。**「当てる」を押したときだけ**、機械が読みを取り**音符を変えずに**かなを写す。モーラが余る/足りない分は「字余り」「メロがまだ途中」として**見せるだけ**（勝手に割らない）＝既に裁定済みの「字余りとメロが途中を分ける」とそのまま噛み合う。
- 音符を割りたいときは**別の明示操作**（例：「音符を割って当てる」）として言い分ける。旧 Piapro の「余った歌詞＝切り捨て/ノートを追加/最後のノートにまとめる」のように、**音符を変える作用は人が選ぶ選択肢**に格下げする。
- 読みの取り違えは音符側のインライン編集（全ツールが持つ口）で直す＝かな欄の役割はここに退避する。
- 倣う先例：CeVIO/VoiSona「歌詞のまとめ入力」（まとめ口は明示ダイアログ1つ）＋旧 Piapro「余った歌詞」（音符を変えるのは明示の選択）＋全ツール「勝手に割らない」（定石3）＋音符ごとインライン（定石1の片翼）。
- メリット：重複が消える。確定済みの裁定（正データ＝表記／かなは仮歌のための写し／読みは手で直せる／字余りとメロ途中を分ける）と全部整合。スマホ幅で欄1つ＋ボタンに収まる。
- デメリット：かなをまとめて直したい場面（読ませたい発音を一気に指定する今の使い方）は1音符ずつの手直しに変わり手数が増える。頻度が高ければ「かなだけ直すまとめ口」を後から足す余地は残る。

**案C：Finale 型＝全文パネルを常設し、反映は明示にする**
- 歌詞テキストを常設の編集場所（正データの面）として独立させ、音符との対応は「当てる」操作でだけ更新。テキストを直した直後は音符・仮歌は変わらず、「音符にまだ写していない」ことを印で示す。
- 倣う先例：Finale Lyrics window（全文保持・譜面との対応づけ）。ただし Finale の「双方向・自動同期」はやらない（削除経路で非対称になる複雑さを Finale 自身が抱えている＋オーナーの「歌詞変えた瞬間に仮歌変わるの微妙」への答えとして自動同期は逆向き）。
- メリット：正データ＝全文という Otomemo の思想に最も忠実。通しの推敲面と地続きにできる。
- デメリット：「未反映」状態の見せ方という新しい設計が要る。歌詞全体画面の姿（未確定の論点）と絡むので、いま単独では決めきれない。

**推し（提案）**：**案B**。定石（明示適用・勝手に割らない・まとめ口は1つ＋音符ごとの手直し口）に全部沿い、既に確定している裁定とそのまま噛み合い、360px 幅でも欄1つで成立する。案C は案B の発展形として、歌詞全体画面（通しの推敲面）を設計するときに一緒に検討すればよい（矛盾しない）。

### 5-3. スマホ幅（360px 基準）の観点

- 調査対象は**全部PC用ソフト**で、スマホ用の歌声合成/楽譜アプリの先例は今回調べていない（→§6）。その上で言えること：
- **まとめ入力がダイアログ/パレット型**（CeVIO F8・Piapro 歌詞入力パレット・SynthV Ctrl+L）なのはスマホに移しやすい形＝全画面シートに置き換えられる。常設欄2つ（現状の Otomemo）は 360px では縦積みで場所を食う。案B なら「欄1つ＋ボタン」で1行に収まる。
- **音符1つずつのインライン編集**は全ツールが持つが、スマホでは音符が小さくタップ精度が要る。Otomemo では「音符をタップ→画面下部の欄で直す」形（ピアノロール直上でなく固定位置の欄）に置き換えるのが現実的。
- **VOICEVOX の「1つの欄で1音節入力と一括入力を兼ねる」形は省スペースでスマホ向きに見えるが、発見性の問題が実際に issue 化されている**（#2116）。欄を減らすときは「まとめて当てる」操作に名前とボタンを残すこと（暗黙の多文字入力に折り畳まない）。
- 音符を割る・割らないの選択（旧 Piapro の「詳細設定▼」）は、スマホではボタンを2つに分ける（「当てる」「割って当てる」）ほうが、ダイアログ内の設定項目より押し間違いにくい。

---

## 6. 調べたが分からなかったこと（推測で埋めていない）

**歌声合成**
- VOCALOID 6「歌詞の流し込み」ウィンドウの詳細（確定ボタン名・前回テキストが残るか・音符数と文字数が合わないときの挙動）。公式マニュアルは機能名と一行説明のみ。
- VOCALOID 6/5 の漢字の扱いの公式明文（周辺ツールの流通からかな入力前提と示唆されるが一次出典なし）。「歌詞の抽出」（Alt+Shift+L）の機能内容。
- Synthesizer V：歌詞が選択ノート数より多いときの正式仕様（余りが捨てられるか末尾に詰まるか）・漢字対応の有無・Undo の明文。
- Piapro Studio NT/NT2 で旧版の「余った歌詞」オプション（ノート自動追加等）が残っているか（NT2 マニュアルで確認できたのは「切り捨てられます」のみ）。
- CeVIO AI／VoiSona：まとめ入力で歌詞が音符数と合わないときの挙動・長音「ー」の公式記述・Undo の明文。
- UTAU：歌詞が選択音符より少ない場合の挙動・Undo。
- VOICEVOX：一括入力で文字数がノート数を超えたときの扱い・ソングでの漢字入力可否・Undo。
- NEUTRINO：音符に歌詞が無い場合にエラーになるか。

**楽譜ソフト・DAW**
- Sibelius「From Text File」で音節が余った/足りないときの正確な挙動（警告の有無）・CJK 対応。
- Cubase「Lyrics from Clipboard」で語が音符より多い場合の挙動・メリスマ専用操作・CJK。
- Finale・Logic の CJK/IME 対応の公式情報。
- 各ツールの歌詞操作の Undo の明文（Finale・OpenUtau 以外。一般の Undo が効くと思われるが出典が無いため断定しない）。
- Dorico popover への日本語 IME 直接入力の公式サポート明記（日本語チュートリアルは存在・公式が明記するのはコピペの CJK 不可のみ）。

**横断**
- **スマホ用の歌声合成・楽譜アプリの歌詞入力UIは今回調べていない**（調査対象は全部PC用。スマホ幅の議論は §5-3 の範囲で先例からの類推に留まる）。
- 「不一致時に警告を出す」ツールの実例は見つからなかった（無いことの証明ではない）。

---

## 7. 関連文書

- `2026-07-29-lyric-assist-HANDOFF.md` — 作詞補助アークの引き継ぎ書（現状の実装実測＝`flowLyric` は必ず音符を割る・音符を変えずに写す関数は存在しない、等はここに）
- `2026-07-29-lyric-assist-design-settled.md` — 設計（音符を変えずに写す `placeMoras` を新設する方針）。本調査の定石2・3はこの方針を先例の側から裏づける
- `2026-07-27-lyric-assist-intonation-verdict.md` — 高低2値の裁定（読みの手直しの前提）


---

## 8. 追補：Otomemo の現状を実機で測った（2026-07-29・360px・メインセッション）

先例と突き合わせるため、歌詞の入った使い捨てメロを作って実機（Tailscale の稼働アプリ）を 360×800 で開き、
歌詞まわりの操作要素を y 座標つきで拾った（読み取りのみ・計測後にネタは削除）。

| y | 中身 |
|---|---|
| 122 | 描く／選ぶ／消す／詞 ・ いじる▾ |
| 159 | 長さ(分) |
| **199** | **「歌詞」入力欄**（漢字仮名交じり） |
| 235 | 「読み：とけーのはりがとまる（10音）」＋「字余り5」 |
| 261 | 「読みを取り直す」ボタン |
| **304** | **「かな」入力欄** |
| 340 | 「流し込む」「クリア」 |
| 381 | 韻律チェック＋凡例 |
| **820〜** | ピアノロール（＝**画面の外**。viewport は 800px） |

**測って分かったこと**

1. **歌詞を書いているあいだ、音符が1つも見えない。** 帯が7段積まれ、ロールが折り返し（800px）より下に出る。
   出先のスマホが原点の道具で、歌詞とメロを見比べられないのは、ボタンの名前より重い。
2. **同じ形のテキスト入力が2つ縦に並ぶ**（「歌詞」199px と「かな」304px）。片方は音符を変えない・もう片方は
   **音符を割る**のに、見た目も名前もそれを言っていない。オーナーが「重複してる」と言ったのはここ。
3. **「流し込む」は、かな欄が空のあいだ押せない灰色のボタンとして常駐**している。使わない人にはずっと死んだ
   ボタンが見えている。
4. 状態（読み・字余り）と操作（読みを取り直す）が別々の段に分かれ、2段を使っている。
5. 副産物：設定の帯が「4小節」と出るが、このメロは実際には**2小節**。エディタの表示尺に16拍の下限がある
   （`useNetaEditor.ts` の `len`）ためで、句の範囲の既定からは外した（design #31-0）が**表示は直っていない**。

**一次資料の裏取り（メインセッションで実施）**

- OpenUtau の一括入力＝`for (int i = 0; i < lyrics.Count && i < notes.Length; ++i)`（少ない方で止まる）・
  音符の分割/追加は無し・`DocManager.Inst.StartUndoGroup("command.note.lyric")` あり。**§1 の記述どおり**。
- VOICEVOX issue #2116 ＝「ダブルクリックで表示されるテキストボックスは1モーラ入力と一括入力で違いが無く…
  **2モーラ以上を入力しないとこの機能があることに気付けない**」。解決案は右クリックの専用ダイアログ。
  ＝**口を1つに兼ねると発見性が落ちる**実例。「欄を1本にまとめる」案はこの反例を踏まないよう設計する必要がある。
