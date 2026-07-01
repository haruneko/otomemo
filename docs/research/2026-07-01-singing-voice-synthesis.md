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

## 制約・注意
- **GPU無し見込み**→ニューラル(NEUTRINO/DiffSinger)はCPUで遅い（数分/分）。**VOICEVOX humming / OpenUTAU classic(WORLDLINE) は軽め**。
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

## 出典
- NEUTRINO（freeware・MusicXML入→WAV・CPU可だが低速・一部ボイス非商用）：[Vocal Synth Wiki](https://vocalsynth.fandom.com/wiki/NEUTRINO) / [sleepfreaks解説](https://sleepfreaks-dtm.com/en/softsynth/neutrino/)
- OpenUTAU（classic WORLDLINE + neural DiffSinger/ENUNU/Vogen・ボイスバンク）：[Rendering Pipeline (DeepWiki)](https://deepwiki.com/stakira/OpenUtau/4.1-rendering-pipeline) / [OpenUtau Wiki](https://github.com/stakira/OpenUtau/wiki/Voicebank-development)
- VOICEVOX 歌唱（Song/Humming・商用非商用無料・ローカルHTTP・歌唱API）：[VOICEVOX Song](https://voicevox.hiroshiba.jp/song/) / [歌唱API解説(Qiita)](https://qiita.com/hachi_mori_/items/a91e64ba52bb8507a2de) / [ハミング対応の報](https://forest.watch.impress.co.jp/docs/news/1579399.html)
- ブラウザ内歌唱（古い/英語寄り）：[meSing.js](https://github.com/usdivad/mesing) / Web Speech（喋りのみ）：[MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
