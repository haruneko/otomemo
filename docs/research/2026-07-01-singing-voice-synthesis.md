# 歌声合成でメロ＋歌詞を鳴らす — 可能性調査（2026-07-01）

## 問い
歌詞を流し込んだメロディ（`Note.syllable`＝音符ごとのかな）を「歌声合成」で鳴らすのは簡単か。実装はせず**可能性の調査のみ**。

## 前提（本アプリの足場・実コード確認）
- **既にある橋**：`flowLyric`/`Note.syllable`＝音符ごとに `pitch(MIDI)・dur(拍)・syllable(かな)` を持つ。これは歌声合成の「スコア」の素そのもの。
- **MusicXML は入力のみ**（`apps/web/src/musicxml.ts parseMusicXml`）。**書き出しは未実装**＝MusicXMLを要求するエンジンには橋を新設する必要。
- **声/合唱のGM音色**（Choir Aahs=52 / Voice Oohs=53）は SF2 に存在＝音色として選ばせるだけで「ボーカル風」は即可能（言葉は出ない）。
- **母艦＝NucBox K8 Plus（WSL2・省電力ミニPC・専用GPU無しの見込み）**。ニューラル系はCPUで遅い。
- 方針＝**Tailnet限定・オフライン・プライバシー・個人用途**。自己ホストで完結できる案が合う。

## 結論（先に）
- **「ボーカル風の音色で鳴らす」だけなら ≒ 即**（SF2の合唱パッチ）。ただし**言葉は出ない**（アー/ウー）。
- **歌詞を実際に歌わせるのは「ライブラリを入れるだけ」では無い**。が、**VOICEVOX（歌唱）のローカルHTTPが本命**＝中規模で実現可能。無料・商用可・日本語ネイティブ・自宅完結。
- **ブラウザ単体の本格歌唱はほぼ無い**（`meSing.js` は古く英語寄り、Web Speech は喋りのみ）。

## 選択肢マップ（軽い→重い）
| Tier | 手段 | 何が鳴る | 手間 | 備考 |
|---|---|---|---|---|
| **0 即** | SF2 **Choir(52)/Voice(53)** パッチ | 母音ボーカル風（アー/ウー）**言葉なし** | ほぼ0（音色に追加） | 既存インフラ。まず"歌っぽさ"だけ欲しい時 |
| 1 疑似 | ローカルTTS(VOICEVOX読み上げ/Web Speech)で音符頭にかなを喋らせる | リズムに**言葉は乗るが音程は歌ってない** | 小 | 粗い。プレースホルダ |
| **2 本命** | **VOICEVOX 歌唱(Song/Humming)** ローカルHTTPエンジン | **本物の歌唱（日本語・かな）** | 中 | エンジン常駐＋スコア変換＋レンダjob。**商用/非商用とも無料**・CPU可 |
| 2' 高音質 | **NEUTRINO**（MusicXML入→WAV） | 高音質ニューラル歌唱 | 中 | freeware・CPU可だが**1分の曲に数分**・一部ボイス非商用。**MusicXML書き出し(未実装)が橋** |
| 2'' 別案 | **OpenUTAU**（classic=WORLDLINE軽量 + neural DiffSinger/ENUNU） | 軽量〜高音質 | 中〜大 | ボイスバンク豊富・GUI主体でヘッドレスrenderは要スクリプト |
| 3 最高音質 | Synthesizer V 等（商用） | プロ級 | — | 自動パイプライン化しづらく・オフライン/自宅方針と合わない。不採用寄り |

## 本命＝VOICEVOX歌唱の詳細
- 2024の更新で **歌唱（Song＝歌声／Humming＝喋り声で歌う）** に対応。**商用・非商用とも無料**。ローカルの VOICEVOX ENGINE（HTTPサーバ）で動く＝自宅サーバ/オフライン/プライバシーに最適・日本語ネイティブ。
- API（要公式docで最終確定）：**`sing_frame_audio_query`（スコア→歌唱クエリ）→ `frame_synthesis`（→WAV）**。スコアは音符列＝各音符に **key(MIDI音高)・長さ(frame)・lyric(かな)**。**我々の `pitch/dur/syllable` がほぼそのまま入力**になる（テンポ→frame換算だけ）。
- Song は現状フル歌声が一部キャラ（波音リツ等）、他は Humming（喋り声で歌う）中心＝キャラの声質次第だが**メロの確認用途には十分**。
- CPU で動作（humming は喋り声ベースで比較的軽い）。レンダは**非リアルタイム**（数秒〜）＝「音源レンダ」アクション。

## 本アプリへの接続（橋の設計・未実装／検討のみ）
- **入力はもう持ってる**：`notes[{pitch,dur,syllable}]`。
- VOICEVOX：`notes[{key:MIDI, frame_length:長さ, lyric:かな}]` へ変換 → ローカルエンジンに POST → **WAV** → ブラウザで再生/DL。**worker job or 小サービスで非同期レンダ → asset(role=render) に保存**（既存の job/asset/render ロールに乗る）。ライブ再生ではなく「レンダして聴く」。
- NEUTRINO/OpenUTAU：**MusicXML 書き出しを新設**（今は入力のみ）→ CLI レンダ。汎用の橋にもなる（他ソフトにも渡せる）。

## 再生UX・負荷の設計（自動再生成 vs オンデマンド）※重要
「編集のたびに裏で歌唱生成し、メロが変わったら破棄・再生成」＝**一番"重い"パターン**。しかも歌唱レンダは非リアルタイム（数秒〜）なので、**自動にしても常に編集より遅れて聴こえ、体感はむしろ悪い**。結論＝**自動再生成はしない**。
- **編集中の即時フィードバック＝楽器（SF2）で即再生**（既にある）。必要なら合唱パッチで音色だけ"歌っぽく"。ここは歌声合成を使わない。
- **歌唱版＝明示的レンダ（「🎤 歌わせる」ボタン）＋キャッシュ＋stale表示**。押した時だけ VOICEVOX に投げ、**WAV を asset(role=render) に保存**。メロ/歌詞が変わったら「（メロ変更済み・再レンダ要）」の印を出すだけで**自動再生成はしない**。ユーザーが聴きたい時に押す。
- **content-hash キャッシュ**：key=hash(notes+syllable+声質+tempo)。同一内容なら**レンダせず即キャッシュ返し**＝再クリックも無料・stale判定もハッシュ比較だけ。
- **粒度**＝フレーズ/セクション単位でレンダすると、一箇所直しても影響は its フレーズだけ（無効化が局所）。MVPはメロネタ単位でも可。
- **これで"重さ"は消える**：レンダは押した時だけ＝**1セッションで数回**。常駐サーバのCPUには全く問題ない（重いのは"毎編集で回す"時だけ）。
- 実装は既存の **job/asset/render** に乗る＝「sing ジョブ→ローカルVOICEVOX HTTP→WAV asset→通知」。VOICEVOX ENGINE は cm-search と並ぶ常駐サービスとして1本追加。

## PoC実測（2026-07-01・母艦で実行）
VOICEVOX ENGINE 0.25.2 linux-cpu-x64 を母艦（Ryzen 7 8845HS・16スレッド・WSL2・GPU未使用）で直起動し、サンプルメロを歌わせて実測。**成功**。
- **導入**：GitHub release の `voicevox_engine-linux-cpu-x64-0.25.2.7z.001`（**DL 1.82GB**）→ 解凍後 **2.1GB**。7z解凍は `uv tool install py7zr`（sudo不要）。起動＝`./run --host 127.0.0.1 --port 50021`（**起動1秒**）。
- **歌唱スタイル構造**：`/singers` の各styleに `type`。**`sing`＝波音リツ(id 6000)＝本物の歌声**、**`frame_decode`＝ハミング（ずんだもん3003等・多数キャラ）**。正道＝**query は sing、synth は frame_decode(声質)** を別々に渡す。
- **API**：`POST /sing_frame_audio_query?speaker=<sing id>`（body=Score）→ FrameAudioQuery → `POST /frame_synthesis?speaker=<frame_decode id>`（body=query）→ **WAV(24kHz mono 16bit)**。
- **Score形（確定）**：`{"notes":[{"key":MIDI番号 or null(休符), "frame_length":フレーム数, "lyric":"かな" or ""}]}`。**先頭に休符noteが必要**。フレームレート=**93.75 fps**（24000/256）＝`frame_length = round(秒 × 93.75)`。我々の `pitch/dur/syllable` がほぼ直変換。
- **速度＝リアルタイムより速い**：2.9秒の歌唱を **query 0.80s + synth 0.29s = 合計1.10s（0.38x）**。→ **オンデマンドで1フレーズ≒1秒**。前提だった「数秒〜重い」は覆り、CPUで十分実用。
- **注意（実測中に判明）**：エンジンはHTTP常駐1プロセス。**未ロードstyleは初回に遅延ロード**（初回レンダのみ遅い場合あり＝ウォームアップ推奨）。本PoCでは初回1.1s、別styleへの2回目呼びで詰まり→（サンドボックス側のタイムアウトSIGTERMがエンジンに波及して落ちた＝運用では無関係）。
- **結論**：**本命VOICEVOX歌唱はローカルCPUで実用速度・音質は要試聴。** フットプリント約2GB＋常駐1プロセス。導入は直バイナリでsudo不要。

## 表現（細かい雰囲気）の編集可否（2026-07-01・実エンジンで確認）
「細かい雰囲気を編集できるか」＝**できる。しかも肝は API 側**。
- **VOICEVOX GUI(Song)の範囲**：ピアノロールにノート＋歌詞、**ピッチ編集モード＝音程曲線を手で描く**、**音域調整(-12〜12)**、**声量調整＝声の"力み(tension)"** 。SynthV のような per-note のビブラート/ブレス/テンション個別パラメータは無いが、音程曲線と力みは触れる。
- **API 側（我々に効く本命）**：`sing_frame_audio_query` の戻り値 **`FrameAudioQuery` を編集してから `frame_synthesis`** に渡せる。実測した中身（93.75fps のフレーム配列）：
  - **`f0`**：フレーム毎の基本周波数(Hz)の**全ピッチ曲線**。編集で **ビブラート・ポルタメント(しゃくり/滑り)・ピッチ補正・デチューン** 等が自在。
  - **`volume`**：フレーム毎の**全ダイナミクス曲線**。編集で **クレッシェンド/アクセント/語尾フェード/ため** 等。
  - **`phonemes`**：`{phoneme, frame_length, note_id}` の**発音タイミング**。`frame_length` 編集で子音を伸ばす/母音を詰める＝アタックや譜割りの微調整。
  - `volumeScale`(全体音量)・出力SR/stereo。
- **含意**：我々のアプリはパイプラインを握っているので、**f0/volume 配列を編集する「表現コントロール」（ビブラート深さ/速さ・しゃくり量・強弱カーブ・アクセント）を自前UIで載せられる**＝VOICEVOXのGUI以上の作り込みが可能。設計思想（機械は足場/候補・人が仕上げ）と合致＝「プリセットで雰囲気→手で微調整」。
- **限界**：AI駆動の表現スタイルや声質そのもの（ブレス/性別/歌い回し）はモデルに焼き込み＝そこはSynthV等（商用・API連携弱）の領分。ピッチ/強弱/タイミングのニュアンスは VOICEVOX のフレーム配列で十分。

## ちゃんとしたエディタ（フリー）＝ある。しかも MusicXML/MIDI 取込
- **VOICEVOX 公式エディタ自体が"ちゃんとした"編集を持つ**：Song モードに**ピッチ編集モード（ノート上に波線をドラッグして音程曲線を描く）**、talk側はフレーズ単位のピッチ/音量/話速/無音編集。**File メニューから MIDI / UST / MusicXML をインポート**できる。無料。
- **もっと本格派＝OpenUTAU（無料・OSS）**：ピッチ/表現の作り込みが強い定番の歌エディタで、**VOICEVOX の声をボイスバンクとして使える**（widely used）。UTAU系の表現（ピッチベンド/ビブラート/フラグ）＋ neural(DiffSinger)も。
- **我々への含意（設計が楽になる）**：VOICEVOXエディタも OpenUTAU も **MusicXML/MIDI/UST を取り込める**。→ **自前で本格ボーカルエディタを作らなくてよい**。役割分担＝
  - **本アプリ**＝作曲/スケッチ＋歌詞流し込み＋**ラフな歌唱プレビュー**（VOICEVOX API・表現なしで"言葉と音程"を即確認）。
  - **仕上げの歌の表現**＝**MusicXML/MIDI(+歌詞)を書き出して → VOICEVOXエディタ or OpenUTAU で作り込む**。
  - ＝**MusicXML書き出し（今は入力のみ・未実装）が最重要の橋**（NEUTRINO用だけでなく、公式エディタ/OpenUTAU への受け渡しにも効く）。[[project-design-philosophy-options-not-finished]] と合致（機械は足場、仕上げは専用ツールで人が）。

## 制約・注意
- **GPU無し見込み**→ニューラル(NEUTRINO/DiffSinger)はCPUで遅い（数分/分）。**VOICEVOX humming / OpenUTAU classic(WORLDLINE) は軽め**。
- **フットプリント（VOICEVOX ENGINE）**：Docker **CPU版 ≈1.85GB（圧縮・Docker Hub表示）→展開後の実ディスクはその2〜3倍(≈4-5GB目安)**。GPU版≈2.95GBは**GPU無しなので不要**。嵩の主因は音声モデル。RAMは常駐で数百MB〜。**※母艦はarchitecture上「Docker不使用(WSL2でtsx/uv直起動)」方針**＝Docker前提にするか、engineをバイナリ/uvで直起動するかは要判断（ディスク量は同程度・モデルが本体）。数GB＋常駐1プロセス＝ミニPCで許容範囲だが「軽くはない」。合唱パッチ(Tier0)は+0GB。
- **読み(かな)の質**：`splitMora` はかな前提。漢字→読みは未（設計 L1 で lyric に「読み」欄を持つ方針）。歌声合成はかな/音素前提なので、**読みを正準にする設計(L1)と整合**。漢字自動読みが要るなら pyopenjtalk 等（別問題）。
- **ライセンス**：VOICEVOX＝商用可（強い）。NEUTRINO/一部ボイス＝非商用。**個人用途なら概ね可**。生成音声・キャラクターの利用規約は各要確認。
- **プライバシー/到達**：全案ローカル自己ホストで完結可（クラウド送信不要）＝Tailnet/オフライン方針と合致。

## 設計思想との整合
- これは「自分のメロ＋歌詞を**そのまま歌わせて確認**」＝Suno的な"完成品生成"ではなく **モニタ/足場**。[[project-design-philosophy-options-not-finished]] と整合（機械は確認材料まで・完成は人間）。歌声合成は「引いた候補を耳で判断する」を強化する道具。

## 推奨（可能性の結論）
1. **すぐ**：Tier0＝Choir/Voice パッチを音色に足して「ボーカル風プレビュー（言葉なし）」。ほぼ0コスト。
2. **本命**：Tier2＝**VOICEVOX歌唱をローカルHTTP**で。まず**疎通PoC（1フレーズ→WAV）**から。無料商用可・日本語・自宅完結。中規模。
3. **高音質が要る時**：NEUTRINO（MusicXML書き出し新設が前提）。

## 未決／次にやるなら
- VOICEVOX歌唱APIの正確なスコアJSONを公式docで確定・**音質の実聴**・**母艦CPUでのレンダ速度実測**。
- MusicXML書き出しを作るか（NEUTRINO/汎用の橋）。
- 漢字→読みの自動化（pyopenjtalk 等）は別トラック。

## 研究クローズ（2026-07-01）＝結論と持ち越し
- **技術的にアリ**：VOICEVOX歌唱をローカルCPU（母艦Ryzen8845HS）で**リアルタイムより速く**（0.38x）レンダ成功・音質もユーザーOK。フットプリント≈2GB＋常駐1・sudo不要で立つ。
- **細かい雰囲気も可**：`FrameAudioQuery` の f0/volume/phoneme をフレーム編集して合成前に注入できる＝**自前UIで表現を作り込む余地あり**（ユーザー意向＝offloadだけでなく自作の余地を残す）。
- **外部の本格エディタも無料であり**（VOICEVOX公式Song＝MusicXML/MIDI取込・OpenUTAU）。橋＝**MusicXML/MIDI+歌詞の書き出し（未実装）**。
- **これは本線（作曲支援）とは別口**＝研究はここでクローズ。**フィーチャーは backlog「仮歌入れ込み」に記載**（着手時に Task 化）。最小実装案＝①ラフ歌唱プレビュー(VOICEVOX API・🎤+キャッシュ)②MusicXML/MIDI+歌詞書き出し③表現編集(f0/volume)は将来の自作余地。

## 出典
- NEUTRINO（freeware・MusicXML入→WAV・CPU可だが低速・一部ボイス非商用）：[Vocal Synth Wiki](https://vocalsynth.fandom.com/wiki/NEUTRINO) / [sleepfreaks解説](https://sleepfreaks-dtm.com/en/softsynth/neutrino/)
- OpenUTAU（classic WORLDLINE + neural DiffSinger/ENUNU/Vogen・ボイスバンク）：[Rendering Pipeline (DeepWiki)](https://deepwiki.com/stakira/OpenUtau/4.1-rendering-pipeline) / [OpenUtau Wiki](https://github.com/stakira/OpenUtau/wiki/Voicebank-development)
- VOICEVOX 歌唱（Song/Humming・商用非商用無料・ローカルHTTP・歌唱API）：[VOICEVOX Song](https://voicevox.hiroshiba.jp/song/) / [歌唱API解説(Qiita)](https://qiita.com/hachi_mori_/items/a91e64ba52bb8507a2de) / [ハミング対応の報](https://forest.watch.impress.co.jp/docs/news/1579399.html)
- ブラウザ内歌唱（古い/英語寄り）：[meSing.js](https://github.com/usdivad/mesing) / Web Speech（喋りのみ）：[MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
