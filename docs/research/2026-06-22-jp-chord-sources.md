# 研究レポート：日本の曲のコード進行を「大量に」仕入れる現実的手段（正攻法API〜スクレイピング）

調査日: 2026-06-22 / 対象: creative_manager（個人用・自己ホスト作曲支援ツール）のコード進行DB
種別: **データ調達リサーチ（実装ではない・コード不変）**。一次資料は各ソースを WebFetch で実際に覗いた事実＋引用URL。推測と事実を分離する。
前提（1行）: 用途は**個人利用**のコード進行DB。保存形式は**C基準の度数列＋タグ＋provenance(出典)**＝成果物を度数列に正規化すれば安全側（機能和声＝コード進行の度数列は著作権の対象外。守るべきは特定曲の編曲/歌詞/音源の複製を作らないこと）。
関連: `docs/research/2026-06-22-chord-progression-engine.md`（進行DB＋ルール＋Claude選択の新エンジン設計）。既存 `apps/worker/src/cm_worker/music/progressions.py`（C基準 `(root_pc, quality)` 度数列の既存形式）。

> **結論サマリ（先出し・どこから何曲・どの順で）**
> 1. **段階1＝集計済み「定番進行リスト」で骨格**を即作る（最速・最低リスク）。**Meloko（12進行・度数併記・実曲名つき）**と**O-TO（100種超×12key・度数トグル）**は**既に度数列（ローマ数字）**を持つ＝正規化不要で `NAMED_PROGRESSIONS` を数十パターンに即拡張できる。ライセンス明示が無いので「進行名＋度数列の参考」として自前テーブルに再構成する。
> 2. **段階2＝Songle API（産総研, 正攻法の本命）**で曲単位を量産。`GET https://widget.songle.jp/api/v1/song/chord.json?url=<メディアURL>` が**APIキー不要**でコード列JSON（`{index,start,duration,name}`）を返す（実フェッチ確認済）。**1.5M曲超が解析済**、未解析でもWeb公開URLを登録すれば自動解析。**非商用無料**。弱点は**自動解析ゆえの精度**と**キー情報が無い**（自前キー推定が要る）。
> 3. **段階3＝人手譜面スクレイプで補完**（精度高め）。**楽器.me が技術的に最易**（`<span class="cd_fontpos">` 直書き、CSSセレクタ一発、約7.5万曲）。**U-FRET は最大手14万曲超**で `ufret_chord_datas` JS変数にプレーンテキスト埋め込み（canvas/画像ではない＝正規表現で抽出可）。**ChordWiki は ChordPro 形式で度数化が最楽だが Cloudflare bot チャレンジで一括取得が実質困難**。
> 4. **度数化の共通の壁**：人手譜面サイト（U-FRET/楽器.me）も Songle も**絶対キー（C/Am等）の明示が弱い/無い**。度数化には**コード列からのキー推定**（Krumhansl 等）が実装上の最大ポイント。J-Total Music だけ Original Key を構造的に明示。
> 5. **規模・度数列で即使える機械可読データセット**は **lead-sheet-dataset（TheoryTab由来・度数＋コード名＋Cキー正規化＋timestamp、約1.1万曲）**が最有力だが**学術目的限定ライセンス**。日本曲を含む蓋然性は高いが要個別確認。
> 6. **ToS/robots/著作権の事実**：人手譜面サイトはいずれも JASRAC/NexTone 許諾下で、ToS は概ね「複製・転載・再配布・営利」を禁止（楽器.me・リンネは「外部ツール/解析」も明示禁止、U-FRET は名指し無いが「過度の負担」禁止）。Hooktheory本体はスクレイプを規約で明示禁止。**→ 抽出物を「度数列＋タグ＋出典」に正規化し、個人DB内に留め、特定曲の譜面/歌詞を再現・再配布しないことで安全側に倒す。**
>
> **最初に着手すべき1手** → **Meloko の12進行＋O-TO の定番を「進行名＋C基準度数列」で `progressions.py: NAMED_PROGRESSIONS` に手で20〜40件追加**（取得ゼロリスク・即DBの骨格が太る・Songle/スクレイプ前の足場）。

---

## 0. 既存コードとの接続点（ハーベスト先の器）

- 既存形式（`apps/worker/src/cm_worker/music/progressions.py`）：
  `NAMED_PROGRESSIONS[name] = {"aliases":[...], "degrees":[(root_pc, quality), ...]}`。
  `root_pc`＝0-11 のC基準ピッチクラス、`quality`＝`theory.QUALITY_INTERVALS` のキー（`""`=major, `m`, `7`, `m7`, `maj7`, `dim`, …）。content は**C基準保存**で、実調は配置/ネタの key で後段トランスポーズ（design #14）。
- MIDI 源があるなら **`jobs.py: handle_import_midi`（L816）経路でroot/quality既知＝分析ライブラリ不要**（engine doc の「源がMIDIなら表引き」）。だが本調査の源はWeb譜面/解析＝**コード名テキスト**なので、度数化（キー推定＋表記正規化）が必須。
- よって調達物の正規形は2系統：
  - **(a) パターン（定番進行）**：曲非依存。`degrees` 列をそのまま `NAMED_PROGRESSIONS` に。**段階1**。
  - **(b) 曲単位の進行**：曲ごとのコード列＋timestamp。キー推定→度数化→セクション分割→タグ付与して**進行DBの実例コーパス**に。**段階2/3**。

---

## 1. ソース別カード（全ソース・実フェッチ事実ベース）

### ★ Songle API（産総研 AIST）＝ 正攻法の本命
- **URL/取得方法**：REST（**APIキー不要**）。`GET https://widget.songle.jp/api/v1/song/chord.json?url=<メディアURL>`（`url` 必須＝YouTube等の公開メディアURL、`revision_id` 任意で音楽地図版を指定、既定0=最新）。`/api/v1/song/beat.json` `/melody.json` `/chorus.json` も同形。JS Widget（`songle-api` npm, `SongleJp/songle-api`）でも `song.scene.chords[i]` から取得可。
  - 出典：[Widget REST docs](https://widget.songle.jp/docs/v1?lang=en)（`/api/v1/song/chord.{json|xml}`, params `url`/`revision_id`）, [SongleJp/songle-api](https://github.com/SongleJp/songle-api)。
- **データ形式（実フェッチで確認）**：`GET .../chord.json?url=www.youtube.com/watch?v=PqJNc9KVIZE` の実レスポンス：
  ```json
  {"chords":[
    {"index":0,"start":0,"duration":12139,"name":"N"},
    {"index":1,"start":12139,"duration":3199,"name":"Eb"},
    {"index":25,"start":64938,"duration":3199,"name":"AbM7"}
  ]}
  ```
  トップレベルは `chords` 配列のみ。各要素 `index`（連番）/`start`（ms）/`duration`（ms）/`name`（コード記号、`"N"`=無音/no-chord）。**キー/スケールのフィールドは無い**＝度数化には自前キー推定が必須。コード記号は実音名（`Eb`, `Cm7`, `AbM7` 等）。
- **対象楽曲**：Web上で公開された**150万曲超が自動解析済**。指定は**メディアURL**（YouTube 等の配信元URL／自分のMP3アップロードも可）。未解析曲は Songle にURL登録すれば自動解析が走る（＝任意の公開URLを実質対象化できる）。出典：[api.songle.jp](https://api.songle.jp/), [docs.songle.jp/en/help](https://docs.songle.jp/en/help/)。
- **登録要否・無料条件・レート**：chord/beat等の**解析データ取得はAPIキー不要**（実フェッチで確認）。**アクセストークン（要登録）が要るのは Songle *Sync*（複数端末同期）機能だけ**＝コード収集には不要。出典：[songle-api client](https://github.com/SongleJp/songle-api)（`accessToken` は Sync 用）。**利用規約は非商用無料**：「営利利用（企業の無償サービス含む）は songle-ml@aist.go.jp に要相談」、解析ログは集計結果として研究公表されうる、Widgetは非表示利用禁止（Widget文脈）。出典：[terms_of_use.pdf](https://api.songle.jp/terms_of_use.pdf)（産総研・非商用条件）, [Widget利用規約](https://widget.songle.jp/docs/terms-of-use)。明示レート制限の記載は無し（が常識的に低速・礼儀的アクセスを）。
- **精度**：自動解析（信号処理）ゆえ**誤りを含む**（Songle 自体「解析誤りをユーザーが訂正できる」設計＝誤りがある前提）。engine doc の audio コード認識 ~84% と同水準の割引で扱う。**下流の信頼度を割引く provenance タグ（source=songle, confidence=auto）を付ける**。
- **クライアントライブラリ**：[SongleJp/songle-api](https://github.com/SongleJp/songle-api)（JS, browser/Node, `npm i songle-api`, `player.useMedia(url)`）。[songle-api npm](https://www.npmjs.com/package/songle-api)。入門本 [SongleJp/tbf-songle-api](https://songlejp.github.io/tbf-songle-api/)。**Python公式は無い**が REST が素直なので `requests` 直叩きで十分（URLパラメータ1個）。
- **度数化の要点**：コード名→`(root_pc, quality)` 化は表記パーサで容易。**キーが無いので①コード列からキー推定→②全コードをキーの相対度数に**。`start/duration`(ms) はテンポ既知なら拍に換算しセクション分割の材料。

### ② 既存データセット（GitHub / HuggingFace / 学術）
- **lead-sheet-dataset（TheoryTab由来）★度数列で即使える最有力**：[wayne391/lead-sheet-dataset](https://github.com/wayne391/lead-sheet-dataset)。4,956アーティスト/11,380曲/18,843解析。**度数（roman）と実コード名（symbol）両方＋「原キー」と「Cキー正規化」両方＋timestamp**を持つ＝**正規化不要で度数列が手に入る稀少例**。MIDI/ピアノロールも。**ライセンスは "academic purposes only"**（商用不可と見るべき・個人研究利用はグレー）。日本曲（J-Pop/アニメ）を含む蓋然性は高いが要個別確認。
- **Hooktheory TheoryTab（本体）**：[theorytab](https://www.hooktheory.com/theorytab) に **J-Pop専用ジャンル**（[genres/j-pop](https://www.hooktheory.com/theorytab/genres/j-pop)）あり、アニメ曲も登録。一次表現は**度数（ローマ数字）**。だが**[利用規約](https://www.hooktheory.com/terms)でDBのコピー/スクレイプ/一括DL/再配布を明示禁止**＝**スクレイプ不可。正規ルートは [trends API](https://www.hooktheory.com/api/trends/docs)**（OAuth2, 10req/10s, 「次に来るコード確率」等の集計を返す＝曲全進行ダンプ用ではない）。
- **Hooktheory由来の整形データ**：[jhamer90811/chord_progression_assistant](https://github.com/jhamer90811/chord_progression_assistant)（3/4/5コード進行を**ローマ数字**＋曲/アーティスト/セクションで CSV 化）, [owencm/hooktheory-data](https://github.com/owencm/hooktheory-data)。**規約リスクは本体②を継承**。
- **Chordonomicon（最大規模）**：[HF ailsntua/Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon), [GitHub](https://github.com/spyroskantarelis/chordonomicon), [論文](https://arxiv.org/html/2410.22046v3)。約66万〜68万曲。**実コード名**（例 `<verse_1> C F E7 Amin`）で**度数列ではない**＝キー推定＋度数化が必要。timestamp無し（構造区分のみ）。**CC BY-NC 4.0（非営利のみ）**。**日本曲の有無は明示なし**（Spotify ID 経由フィルタは工数大）。
- **ufret等専用スクレイパ／ダンプ**：公開された著名なものは**見つからず**（Ultimate Guitar 向けは多数あるが日本曲カバレッジ不明・規約リスク）。楽器.me 由来の小規模事例のみ（下記③参照）。

### ③ 人手譜面サイト（スクレイプ・精度高め）

#### U-FRET（ufret.jp）＝ J-POP最大手
- **URL/取得**：曲ページ `https://www.ufret.jp/song.php?data=<id>`（id連番でクロール可）。例 [data=41](https://www.ufret.jp/song.php?data=41)。
- **埋め込み方式（実HTML解析で確定）**：**canvas/画像ではない**。コードは JS変数 `ufret_chord_datas` 内に **`[C]歌詞[G]…` のプレーンテキスト**で埋め込み（`ufret_chord_datas = ["[C]　[G]　[Am]　[F]\r", ...]`）。**1リクエストで全曲分のコード列が取れ、`\[([A-G][#b]?…)\]` で抽出可**。（WebFetch要約は「canvas」と誤判定したが生HTML直読みで否定）。
- **robots.txt**：[robots.txt](https://www.ufret.jp/robots.txt) は **HTTP 200 だが本文空（0バイト）＝Disallow行なし**（制限明示なし・許可明示でもない）。
- **ToS（事実）**：[利用規約 第12条](https://www.ufret.jp/app/terms.php)。「運営・維持を妨げる行為」「ネットワーク/システムに**過度の負担**をかける行為」「通常意図しないバグを利用/外部ツールの利用・作成・頒布」を禁止。**スクレイプ名指しは無い**が、知的財産権は「当社又は権利者に全帰属」。大量アクセスは「過度の負担」に抵触しうる。
- **曲数**：**14万曲超**（App Store 名「U-FRET 140000曲以上」, [apps.apple.com](https://apps.apple.com/jp/app/id1483940246)）。
- **キー/カポ**：移調オフセット（`key_capo`, `key_scrollbar`, `song_key`）を保持し移調UIあり。**ただし「原曲が C/Am」等の絶対キー明示は弱い**＝度数化にキー推定が要る。
- **既存ツール**：著名な専用スクレイパは確認できず。
- **度数化**：抽出は容易・表記ゆれ小（半角#）。**絶対キー不明が難点→キー推定必須**。

#### 楽器.me（gakufu.gakki.me）＝ 技術的に最易
- **URL/取得**：曲ページ `https://gakufu.gakki.me/m/data/<ID>.html`（例 [OCDS5309](https://gakufu.gakki.me/m/data/OCDS5309.html)）。[検索](https://gakufu.gakki.me/search/) から到達。
- **埋め込み方式（実HTML解析で確定）**：**`<span class="cd_fontpos">C</span>` で1コード1span直書き**。`BeautifulSoup.find_all("span", class_="cd_fontpos")` で順に取れる＝**全ソース中もっとも抽出が容易**。canvas/JS描画不要。
- **robots.txt**：[robots.txt](https://gakufu.gakki.me/robots.txt) は **HTTP 404＝不在（Disallow行なし）**。
- **ToS（事実・より厳格）**：[利用規約](https://gakki.me/kiyaku/)。「プログラム等の**改変・リバースエンジニアリング・解析またはユーティリティの作成・頒布**」「運営に支障を生じさせる行為」「**営利目的利用**」「コンテンツの**転載・複製・公衆送信等を事前承諾なしに行う/行わせる**こと」を**明示禁止**。運営は有限会社サウンド・デザイナー、JASRAC/NexTone 包括許諾下（[取扱い](https://gakki.me/atsukai/)）。
- **曲数**：**約7.5万曲**（74,900±, 2025初時点）。
- **キー/カポ**：移調ボタン（原曲キー [0] ハイライト）・カポ項目あり。**絶対キー名の明示は弱い**。
- **既存スクレイパ**：**実在**（[Qiita](https://qiita.com/bokuranosenjou/items/973a39c0ac708ecc71a0) が `span.cd_fontpos` 抽出、[GitHub bokuranosenjou/roselia_chord](https://github.com/bokuranosenjou/roselia_chord)）。ただし約14曲・「転調なし曲を手動でC/Am移調」した小規模＝**自動キー推定は回避**している点に注意。
- **度数化**：抽出最易だが**表記ゆれ大**＝分数コード `ConG`（=C/G）・**全角＃**（`F＃dim`）・`♭`。正規化前に `on`→`/`、`＃`→`#`、`♭`→`b` 置換必須。キー推定も必要。

#### ChordWiki（ja.chordwiki.org）＝ ChordPro で度数化は最楽だが取得が困難
- **データ形式**：**サイト全体が ChordPro 形式強制**（`[C]仰げば[F]尊し` のインライン記法、フラットは小文字 `b`、シャープ `#`、非ChordProは削除対象）。出典：[help](https://ja.chordwiki.org/help.html), [Guideline](https://ja.chordwiki.org/Guideline.html)。**標準 ChordPro パーサがそのまま流用可＝度数化が最も楽**。
- **一括取得**：公式API/ダンプ/全件RSS**無し**。URLは規則的（`wiki.cgi?c=view&key=<移調>&t=<曲名>`、出典 [chordwiki-plus](https://github.com/koedame/webextension-chordwiki-plus)）。**重大障壁＝サイト全体が Cloudflare managed challenge 下**：ブラウザUAの curl でも `/robots.txt` 含め全URLが **403＋"Just a moment..."**（実測 `cType:'managed'`）。**素のHTTPクライアントで大量クロール不可**＝ヘッドレスブラウザ＋低速チャレンジ通過が必須で規模取得は重い。
- **robots.txt**：上記チャレンジで**取得不能**（robots以前にbot対策で遮断）。
- **ToS**：[TermOfUse](https://ja.chordwiki.org/TermOfUse.html)。歌詞はJASRAC配信範囲（**DL・コピー・印刷は禁止**）。**歌詞を除く ChordPro ソース/生成コード譜の著作権は投稿者に帰属**＝コード列の利用可否は投稿者権利＋歌詞ライセンスが絡むグレー。
- **曲数**：**約26,243曲**（[トップ](https://ja.chordwiki.org/)表示）。
- **キー**：移調機能あり、ソースは実音コード列。原調キー名フィールドの全曲一貫性は未確証＝曲頭からのキー推定で度数化。
- **既存ツール**：直接スクレイパ未確認。関連 [chordwiki-plus](https://github.com/koedame/webextension-chordwiki-plus)、汎用 ChordPro パーサ群。

#### J-Total Music（music.j-total.net）＝ キー明示が最良
- **データ形式**：**プレーンHTMLテキスト**（歌詞上行にコード `[Em][D][CM7]` 等、JSリンク化テキスト・画像でない）。例 [糸/中島みゆき](https://music.j-total.net/data/021na/003_nakajima_miyuki/067.html)。URLは `/data/{かな}/{連番_artist}/{連番}.html` 規則的、[アーティスト別索引](https://music.j-total.net/a_search/)あり＝クロール容易。
- **robots.txt**：実質**不在**（独自404がindexへリダイレクト＝規則明示なし）。
- **ToS**：専用規約ページ確認できず。曲ページに「コピー/配信禁止」の著作権表記、JASRAC/NexTone 許諾下（JASRAC 9012714001Y38026 / NexTone FID000000484）。
- **曲数**：数千曲規模（2002〜の老舗）。
- **キー★最良**：曲ページに **Original Key（例 B♭ major）／Capo（例 3）／Play Key** を構造的に明示＝**度数化に唯一有利**（キー推定不要で確実に度数化できる）。
- **既存ツール**：専用パーサ未確認。

#### リンネのコードブック（chord-rinne.jp）＝ 規約が最も厳しい
- **データ形式**：HTMLテキスト＋動的描画、歌詞は**ストリーミング表示でDL不可設計**。曲URLは `*.php`（連番ID、10,000超まで存在）。出典 [トップ](https://www.chord-rinne.jp/)。
- **robots.txt**：**不在（404）**。
- **ToS（最も明確に禁止）**：[利用規約](https://www.chord-rinne.jp/terms_of_service.php)。「ユーザー自ら**ダウンロード・コピー・印刷・転載・複製することはできません**」「**外部ツールの利用・作成・頒布**」「無断**複製・改変・編集・送信・頒布・販売**」を**明示禁止**。JASRAC/NexTone許諾下。
- **曲数**：数千（ID>10,000）。**キー/度数表示の有無は未確認**。
- → データ調達対象としては**最も不利**。

### ④ 既製の集計済み進行リスト（曲単位不要・最速・低リスク）
- **Meloko ★度数併記＋実曲名・根拠が強い**：[chords-list](https://meloko-support.com/chords-list), [一覧表](https://meloko-support.com/archives/1410), [Aメロ編](https://meloko-support.com/archives/2137)。**度数（ローマ数字 `Ⅳ⇒Ⅴ⇒Ⅲ⇒Ⅵ`）と実コード名（`F⇒G⇒Em⇒Am`）を併記・Cキー正規化済＝度数列がそのまま使える**。頻出ランキング**12種**（各に実在J-POP曲名＋アーティスト＋セクション付き＝頻度の根拠が明確、例 #1 J-POP進行＝あいみょん「君はロックを聴かない」）。取得はHTML表コピーで足る。ライセンス明示なし。
- **O-TO（khufrudamonotes）★網羅**：[chord-progression](https://o-to.khufrudamonotes.com/o-to-chord-progression), [解説](https://khufrudamonotes.com/chord-progression), [移調ツール](https://o-to.khufrudamonotes.com/o-to-degree-change)。**度数（ディグリー）と実コード名をトグル表示**＝度数列が直接得られる。**100種超×12key**。**JS描画アプリ**ゆえ静的スクレイプ不可＝ヘッドレスor内部JS配列抽出が要る。ライセンス明示なし。
- **ネクスト・デザイン chord_database**：[J-POP](https://www.nextdesign-jp.com/chord_database/j-pop.html), [まとめ](https://www.nextdesign-jp.com/chord_database/chord_matome.html)。**実コード名のみ（Cメジャー表記）・ローマ数字なし**＝度数化要だがCキー固定で機械変換容易（C=I, Dm=IIm…）。名前付き進行25〜30種、HTMLベタ書きで**スクレイプ容易**。ライセンス明示なし。
- **music-chord.com**：[トップ](https://music-chord.com/)。性質が違い「**曲ごとの実コード譜DB**」。**JASRAC許諾第9040419001Y38026号/NexTone許諾ID000009986を明示する商用サイト**＝スクレイプは権利リスク高く**非推奨**。

---

## 2. 正規化パイプライン設計（各ソース生データ → C基準度数列＋quality）

### 2.1 全体フロー
```
生データ（コード名列 or 度数列）
  → [A] 表記正規化（コード記号のパース・表記ゆれ吸収）
  → [B] キー確定（サイトが持てば採用／無ければコード列からキー推定）
  → [C] 度数化（各コード root を キーの相対度数 root_pc(C基準) に、quality 維持）
  → [D] セクション分割（timestamp/小節から intro/A/B/サビ）
  → [E] タグ付け（mood/genre/終止/セクション役割）
  → [F] provenance 付与（source, url, confidence）
  → progressions.py 形式 {degrees:[(root_pc, quality)], ...} へ
```

### 2.2 [A] 表記正規化（表記ゆれ吸収）
- ルート＋quality を分解するパーサを1枚用意。`theory.QUALITY_INTERVALS` のキー（`""`,`m`,`7`,`m7`,`maj7`,`dim`,…）へ写像。
- 吸収すべきゆれ（実調査で確認）：
  - **メジャー7**：`Cmaj7 = CM7 = C△7 = CΔ` → `maj7`。
  - **分数/オンコード**：`C/G`, `ConG`（楽器.me）, `DonF＃` → ルートとベースを分離。**ベース音は度数列では当面捨てるか別フィールド（`bass`）に**（既存 `bass.py` は相対ベース解決を持つ＝将来は分数も活かせる）。
  - **全角→半角**：`＃`→`#`, `♭`→`b`（楽器.me 必須）。ChordWiki は元から `b`/`#` 規約。
  - **テンション**：`add9`, `sus4`, `9`, `7(9)` 等＝QUALITY_INTERVALS に無いものは**最近傍 quality へ丸める**（例 `Cadd9`→`""`、`C7(9)`→`7`）か、quality 拡張表を別途増やす（engine doc の等価クラス表と整合）。
  - **`N`（Songle の no-chord）**：度数列から除外。

### 2.3 [B] キー確定（度数化の心臓・最大の論点）
- **①サイトがキーを持つ場合＝採用**：**J-Total Music（Original Key 明示）**が唯一確実。U-FRET/楽器.me/ChordWiki は移調オフセットはあるが絶対キーが弱い＝原則②へ。Songle はキー無し＝②。
- **②キー推定（自前・engine doc の `detect_key` 方針と合流）**：コード列からの簡易推定。
  - 安価な実装：**コード root の出現頻度＋開始/終止コード**（最初/最後が I か vi か）＋ダイアトニック適合度の最大化（候補12キー×major/minor でコードが何個ダイアトニックに収まるか）。engine doc は Krumhansl-Schmuckler を自前40-80行で持つ方針＝**音名ヒストグラムでも代用可**。
  - **転調曲は当面 弾く/分割**（先行 roselia_chord 事例も転調なし曲だけを扱った）。provenance に `key_inferred=true` を残し信頼度を割引く。
- **メジャー/マイナーの C基準統一**：本DBは「C基準度数列」＝**メジャーは C を I、マイナーは Am（=A=9）を vi として扱う既存 progressions.py 慣習に合わせる**（小室進行が `(9,"m")` 始まり等）。キー推定結果に応じ root を C(=0) からの相対ピッチクラスへ平行移動。

### 2.4 [C] 度数化
- `root_pc = (chord_root_pc - key_tonic_pc) mod 12`（メジャー）。マイナーキー曲は平行長調の度数で表す（C基準統一の既存流儀）。`quality` は [A] で正規化済みをそのまま。
- 出力＝既存 `degrees:[(root_pc, quality), ...]` に直結。

### 2.5 [D] セクション分割
- Songle：`start/duration`(ms) ＋ Songle の chorus/構造（`/chorus.json`）を使えば intro/A/B/サビの timestamp が取れる＝**役割タグの自動化に最適**。
- 譜面サイト：歌詞行のセクション見出し（「Aメロ」「サビ」等）や繰り返し構造から分割。Meloko は元からセクション付き。

### 2.6 [E] タグ付け（誰が）
- **mood/genre**：曲メタ（アーティスト/タイアップ）から**自動マッピングは弱い**＝**Claude に「度数列＋曲メタ」を渡して mood/genre/終止種別を推定させる**のが現実的（engine doc の「Claude＝記号の選択/判断」役割と整合・音符には触らない）。
- **終止（cadence）/セクション役割**：度数列の末尾2コードから**ルールで自動判定**（V→I=正格, IV→I=変格, V→vi=偽終止 等）。
- **頻度の根拠**：Meloko は実曲名つき＝そのまま `provenance.examples` に。

### 2.7 [F] provenance（出典）と安全側の整理
- 各進行に `{source, url, song?, artist?, section?, key_inferred, confidence}` を保持。
- **「度数列に正規化＝安全側」**：保存物は曲固有の編曲/歌詞/音源ではなく**機能和声の抽象（度数列）＋出典メタ**＝著作権で保護されないコード進行そのもの。**特定曲の譜面/歌詞を再現・再配布しない**限り個人DBとして安全側。Songle/譜面サイトのToSは**サービス上の再配布・営利**を縛るので、**抽出物を個人DB内に留め公開・販売しない**現運用と整合。

### 2.8 既存 import_midi の活用
- 将来 MIDI 源（自作/購入MIDI）があれば `handle_import_midi`（root/quality 既知）で**キー推定も信号解析も不要**＝最高精度。本調査のWeb源では使えないが、**度数化レシピの「理想形（表引き）」がMIDI経路**＝Web源はそれに寄せる。

---

## 3. 推奨ハーベスト計画（段階・各々の正規化レシピ）

### 段階1：集計済み定番リストで「骨格」（最速・最低リスク・取得ほぼゼロ）
- **対象**：Meloko（12進行・度数併記・実曲名）＋ O-TO（100種・度数トグル）＋ ネクスト・デザイン（C固定コード名）。
- **やること**：**進行名＋C基準度数列**を手で `NAMED_PROGRESSIONS` に20〜40件追加。Meloko/O-TO は度数列既有＝正規化レシピ [A][C] のみ（キー推定不要）。ネクスト・デザインは C固定→単純 root マッピングで度数化。
- **provenance**：`source=meloko/o-to/nextdesign`, `confidence=curated`。Meloko の実曲名は `examples` に。
- **成果**：既存6進行→数十進行に。Claude の「名前付き進行」(routing A の S 系)が即太る。

### 段階2：Songle API で曲単位を量産（正攻法・非商用無料）
- **対象**：Songle `chord.json`（＋`chorus.json` でセクション）。曲リストは「自分の作りたい/参照したいJ-POPのYouTube URL集」または既解析の人気曲。
- **やること**：`requests` で `chord.json?url=...` を低速取得→[A]パース→[B]キー推定→[C]度数化→[D]Songle構造でセクション→[E]Claude/ルールでタグ→[F] `confidence=auto`。
- **留意**：精度は自動解析水準（誤りあり前提・confidence低め）。レート明示なしでも礼儀的低速・非商用個人利用に限定。Sync用トークンは不要。
- **成果**：実曲ベースの進行コーパス（timestamp/セクション付き）。

### 段階3：人手譜面スクレイプで精度補完
- **優先順**：**楽器.me（最易・CSSセレクタ一発）→ U-FRET（最大手14万曲・JS変数テキスト）→ J-Total（少数だがOriginal Key明示で度数化が確実）**。ChordWiki は ChordPro で度数化は楽だが Cloudflare で取得困難＝**後回し/小規模手動**。リンネは規約最厳＝**対象外**。
- **やること**：低速クロール→[A]（楽器.meは全角#/onコード正規化必須）→[B]（J-Total以外はキー推定）→[C][D][E][F] `confidence=human-sourced`。
- **留意（ToS事実）**：楽器.me/リンネは「複製・解析・営利・外部ツール」を明示禁止、U-FRETは「過度の負担」禁止。**個人DBに度数列として留め、譜面/歌詞を再現・公開・再配布しない**ことで安全側。robots は U-FRET 空/楽器.me 404（制限明示なし）だが ToS が上位の事実。

---

## 4. リスク／留意（事実の整理）

| 観点 | 事実 | 安全側の方針 |
|---|---|---|
| 著作権 | コード進行の**度数列＝機能和声は著作権の対象外**。歌詞/特定曲の編曲/音源は保護。 | 保存を**度数列＋タグ＋出典**に正規化。歌詞は捨てる。譜面再現物を作らない。 |
| Songle ToS | **非商用無料**・営利は要相談・解析データはAIST側も利用しうる・キー不要。 | 個人非商用に限定。商用化時は songle-ml@aist.go.jp。 |
| 譜面サイト ToS | 楽器.me/リンネ=複製/解析/営利/外部ツール明示禁止。U-FRET=過度の負担禁止・IP全帰属。J-Total/music-chord=JASRAC/NexTone許諾下でコピー禁止。 | 抽出物を個人DBに留め非公開・非販売。低速アクセス。 |
| robots | U-FRET=空(200)/楽器.me=404/リンネ=404＝**Disallow明示なし**。ChordWiki=Cloudflareで取得不能。 | robots制限が無くてもToSが上位。礼儀的クロール。 |
| 精度 | Songle=自動解析で誤りあり。譜面サイト=人手で高精度だがキー明示弱い。Hooktheory/lead-sheet=高品質だが規約/ライセンス制約。 | source/confidence を provenance に。auto は下流で割引く。 |
| ライセンス | lead-sheet=学術限定 / Chordonomicon=CC BY-NC / Hooktheory=スクレイプ禁止(trends APIのみ)。 | 個人研究利用に限定。再配布しない。Hooktheoryは trends API のみ。 |
| 度数化精度 | 絶対キー明示が弱い源が多数＝キー推定誤りが度数誤りに直結。転調曲も難。 | J-Totalのキー明示を優先活用。キー推定は転調曲を弾く＋key_inferredフラグ。 |

---

## 5. 次アクション（最初に着手すべき1つ）

**Meloko の12頻出進行（度数併記）＋ O-TO の定番を、「進行名＋C基準度数列＋実曲名(provenance)」で `apps/worker/src/cm_worker/music/progressions.py: NAMED_PROGRESSIONS` に20〜40件 手追加する。**
- 取得リスクゼロ（度数列が既に公開・参考情報として自前再構成）、正規化はコード名→度数の単純写像のみ、即DBの骨格が太り、Songle/スクレイプの足場になる。
- 続く2手目＝Songle `chord.json` の Python 取得＋キー推定＋度数化の縦スライスを1曲で通す（engine doc の `detect_key` 自前化と合流）。

---

### 引用URL一覧（主要）
- Songle: [api.songle.jp](https://api.songle.jp/) / [Widget REST docs](https://widget.songle.jp/docs/v1?lang=en) / [terms_of_use.pdf](https://api.songle.jp/terms_of_use.pdf) / [Widget利用規約](https://widget.songle.jp/docs/terms-of-use) / [SongleJp/songle-api](https://github.com/SongleJp/songle-api) / [docs.songle.jp/en/help](https://docs.songle.jp/en/help/) / 実エンドポイント例 `https://widget.songle.jp/api/v1/song/chord.json?url=...`
- データセット: [lead-sheet-dataset](https://github.com/wayne391/lead-sheet-dataset) / [Hooktheory theorytab](https://www.hooktheory.com/theorytab) / [trends API](https://www.hooktheory.com/api/trends/docs) / [Hooktheory terms](https://www.hooktheory.com/terms) / [Chordonomicon HF](https://huggingface.co/datasets/ailsntua/Chordonomicon) / [chord_progression_assistant](https://github.com/jhamer90811/chord_progression_assistant)
- 譜面サイト: [U-FRET曲ページ](https://www.ufret.jp/song.php?data=41) / [U-FRET robots](https://www.ufret.jp/robots.txt) / [U-FRET規約](https://www.ufret.jp/app/terms.php) / [楽器.me曲ページ](https://gakufu.gakki.me/m/data/OCDS5309.html) / [楽器.me規約](https://gakki.me/kiyaku/) / [roselia_chord(既存スクレイパ)](https://github.com/bokuranosenjou/roselia_chord) / [ChordWiki help](https://ja.chordwiki.org/help.html) / [ChordWiki ToU](https://ja.chordwiki.org/TermOfUse.html) / [J-Total曲ページ](https://music.j-total.net/data/021na/003_nakajima_miyuki/067.html) / [リンネ規約](https://www.chord-rinne.jp/terms_of_service.php)
- 集計済みリスト: [Meloko一覧](https://meloko-support.com/archives/1410) / [O-TO](https://o-to.khufrudamonotes.com/o-to-chord-progression) / [ネクスト・デザインJ-POP](https://www.nextdesign-jp.com/chord_database/j-pop.html) / [music-chord.com](https://music-chord.com/)
