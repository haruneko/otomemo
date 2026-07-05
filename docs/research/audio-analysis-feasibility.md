# オーディオ・アナリーゼの実現可能性（CPU自己ホスト・2024–2025）

**目的**：流行曲（音源）を解析して BPM・調・構成・音域・使用楽器・コード進行・メロディの特徴を知る、を otomemo に足せるか。自己ホスト（WSL2・torch/numpy 有・**GPU無し前提**）での feasibility。全主張に出典。法的助言ではない。2体のリサーチエージェントが分担調査し統合。

## TL;DR（正直な結論）
- **これは記号(neta/MIDI)と別の柱＝オーディオMIR**。意識的に「audio解析ピラー」として置く。
- **音源分離だけが本当に高品質**：Demucs `htdemucs`(MIT) が CPU の甘い所（実時間の~1.5倍・SDR~9dB）。真SOTA(BS-RoFormer 12dB)はGPU級で非現実。
- **コード認識は10年の天井**：maj/min ~82–87%、**7th/テンションは弱い(~55–72%・正確なtetrad<60%・9/11/13/転回は信頼不可)**。三和音は信頼、テンションは候補。`BTC`(MIT・pretrained・CPU可)が最良のローカル選択。
- **メロ**：単旋律ピッチ追跡は**ほぼ解決**(CREPE ~97%)。多声ノート採譜は弱く**ボーカルが最悪**(basic-pitch note-F ~49%)。`basic-pitch`(Apache-2.0・<1MB・CPU)が現実的既定。
- **パイプライン**：**分離first**→ボーカルstemにメロ/ピッチ、**コードは混合/"other"ステム**に。分離はメロ/ボーカル解析を実際に改善（文献）。**Demucsが実行時間を支配→stemをキャッシュ必須**。
- **設計思想と一致**：信頼できるのは「音域・メロ輪郭・調・三和音」まで。7th/テンション/正確なノート境界は**候補**として出す＝otomemo「機械は候補・人間仕上げ」。

---

## 1. 基礎メタ（BPM・調・構成）

**BPM**：`librosa`(ISC・軽・実時間超速・定常4/4なら十分、ルバートは弱い) / `essentia RhythmExtractor2013`(高精度・C++速・**AGPLv3**) / `madmom DBN`(**最精度**だが2018停止・Py≤3.7・numpy/Cythonビルド破綻・**モデルNC**＝避ける)。→ **librosa が実用既定**。※後述 allin1 が拍/ダウンビート/テンポをSOTA精度でオマケ出力。

**調**：`essentia KeyExtractor`(プロファイル選択可・pop **>80%**・edmm/temperley等・**AGPLv3**) / `libKeyFinder`(GPLv3・Mixxx・DJ実績) / `librosa`のKrumhansl-Schmuckler自作(ISC・精度低)。**全て単一グローバル調**＝**転調/中間転調は原理的に苦手**、5度・平行調の取り違えが主誤り。→ **信頼度を出す・転調はスコープ外**と割り切る。allin1は調をやらないので調検出は別途要。

**構成（Intro/Aメロ/サビの区切り）**：**`allin1`(mir-aidj・ISMIR2023)が明確な勝者**。Harmonix SOTA（Beat F1 .958 / Downbeat .915 / 境界HR .660 / ラベルPWF .738）。**拍+ダウンビート+テンポ+機能ラベル付き構成を1モデル**で。ただし**調は無し**、内部で**Demucs pass**を回す(CPU可だが遅い)、`NATTEN`の手動ビルドが要る。軽量代替 MSAF/ruptures はラベル無し＋Py3腐敗。

出典: [librosa beat](http://librosa.org/doc/0.11.0/generated/librosa.beat.beat_track.html) / [essentia Key](https://essentia.upf.edu/reference/std_KeyExtractor.html) / [libKeyFinder](https://github.com/mixxxdj/libkeyfinder) / [allin1 arXiv 2307.16425](https://arxiv.org/abs/2307.16425)

---

## 2. コード自動認識（本丸の難所）

| ツール | maj/min | 7th/大語彙 | CPU | ライセンス | 判定 |
|---|---|---|---|---|---|
| **BTC**(Bi-dir Transformer, ISMIR'19) | **82.3–82.7% WCSR** | 7th 71.8 / tetrad 65.5 / MIREX 80.8 | ○(12MB torch) | **MIT** | **精度＋pretrained＋CPU可＝最良** |
| **Chordino/NNLS-Chroma**(Vamp) | ~78–80% | maj7/min7/dom7弱・拡張不可 | ○(純DSP) | GPL-2.0 | ML無しで動く古典 |
| **chord-extractor**(Chordinoラップ) | =Chordino | =Chordino | ○ | GPL-2.0 | **pip一発のChordino**(2025保守) |
| **autochord** | 67.3% | majminのみ | ○ | MIT | 手軽だが精度低 |
| **CREMA** | ~78–82% | 転回付き602クラス・7th低 | ○ | BSD-2 | 転回予測できる唯一・2022停止/旧TF |

**正直な天井**：maj/min **~80–87% が10年動いていない壁**（注釈曖昧性＝C6 vs Am7 等で人間も10–15%不一致＝ラベルノイズ天井）。**7th/テンションは本当に弱い**：寛容metricで~71–72%、**正確tetrad ~65%**、大語彙59–66%、4+音<30%、稀quality(min-maj7/aug/dim7)は near-zero。**9/11/13/転回は開放モデルでは信頼不可**。→ **三和音+基本7thはローカルで信頼、拡張は human-in-the-loop**＝otomemoの候補主義に合致。

出典: [BTC repo(pretrained同梱)](https://github.com/jayg996/BTC-ISMIR19) / [MIREX2017 ACE](https://music-ir.org/mirex/wiki/2017:Audio_Chord_Estimation_Results) / [chord-extractor](https://github.com/ohollo/chord-extractor) / [天井の実測(2024 thesis)](https://arxiv.org/html/2512.22621v1)

---

## 3. メロディ／ノート採譜

| ツール | タスク | 精度 | CPU | ライセンス | 判定 |
|---|---|---|---|---|---|
| **basic-pitch**(Spotify) | 多声→ノート+ベンド | Note-F: GuitarSet 84 / piano 71 / **vocals ~49** | ○native(TFLite/ONNX) | **Apache-2.0** | **melody→MIDIの既定**(vocals/密多声は弱) |
| **CREPE / torchcrepe** | 単旋律f0 | RPA **~97%**@50¢ | ○(torchcrepe=torchのみ) | MIT | **ボーカルf0最良**・ノート化は別途 |
| **librosa.pyin** | 単旋律f0 | ~66–92% | ○純DSP | ISC | zero-dep f0 fallback |
| **Melodia** | 主旋律f0 | MIREX上位 | ○ | **NC・クローズド** | 強いが**製品/配布不可** |
| **MT3 / omnizart** | 多楽器ノート | 中 | **GPU** | Apache/OSS | **CPUでは非現実** |

**天井は2レジーム**：**(a) 単旋律ピッチ追跡はほぼ解決**(CREPE clean 99.9% / 実stem ~97%・octave滑りのみ)。**(b) 多声ノート採譜は弱い**(basic-pitch piano~70% / 多楽器61% / **vocals~49%**)＋**offset(音の終わり)はさらに不可**。→ **音域+輪郭には basic-pitch で十分、採譜品質ではない**。

出典: [basic-pitch](https://github.com/spotify/basic-pitch) / [basic-pitch paper](https://ar5iv.labs.arxiv.org/html/2203.09893) / [CREPE](https://ar5iv.labs.arxiv.org/html/1802.06182) / [torchcrepe](https://github.com/maxrmorrison/torchcrepe)

---

## 4. 使用楽器・編成（正直に弱い）

混合音源からの楽器同定は**あてにならない**：OpenMIC(20クラス・好条件)で最良~F1 0.81、実世界は<0.7、YAMNet汎用mAP 0.306。→ **現実解＝Demucsの stem名(vocals/drums/bass/other)を「編成の事実」として使う**(near-deterministic・MIT)。分離した"other"ステムに YAMNet(Apache-2.0)/essentia head をかけて主旋律音色(ギター/シンセ/弦)を**低信頼ヒント**で出すのが上限。混合音源の楽器名は出さない。

出典: [OpenMIC](https://brianmcfee.net/papers/ismir2018_openmic.pdf) / [essentia models](https://essentia.upf.edu/models.html) / [Demucs](https://github.com/facebookresearch/demucs)

## 5. 音域（register）

**分離→ボーカルstem→単旋律ピッチ→頑健な min/max**。ボーカルは CPU で出しやすい部類。**naive min/max はダメ**(CREPEは無声区間もピッチを吐く/pyinはoctave誤り)＝**voicing/信頼度でゲート→パーセンタイル(5–95%)＋メディアンフィルタ＋octave外れ除去→Hz→音名**。この**クリップ工程が精度を決める**(モデル選択より重要)。推奨: Spleeter/Demucs 2-stem → `librosa.pyin`(voicing確率付) or torchcrepe。

## 6. パイプライン（分離first→解析）

```
音源(mp3/wav)
   └─ (a) Demucs htdemucs [MIT] → vocals/drums/bass/other  ★実行時間のボトルネック=stemをキャッシュ
        ├─ 混合 or "other" → (b) コード: BTC / Chordino
        ├─ vocals          → (c) メロ: basic-pitch → MIDIノート(音域/輪郭)
        └─ vocals          → (d) f0: torchcrepe → ピッチ曲線
```
- **分離firstはメロ/ボーカル解析を実際に改善**（文献：伴奏除去で訓練分布に近づく）。[MSS-for-lyrics 2506.15514](https://arxiv.org/pdf/2506.15514)
- **コードだけ例外**＝混合/"other"に（Chordino/BTCは多声混合前提）。
- **CPU速度(3–4分曲)**：Demucs htdemucs ~3–6分(~1.5x・RAM~3GB) / htdemucs_ft ~20分(CPU回避) / basic-pitch 5–15秒 / torchcrepe-tiny 即 / BTC・Chordino 秒。→ **Demucsが1–2桁支配・stem必ずキャッシュ**。
- **依存地獄注意**：ML枠を2つ混ぜない。**torch-first**(Demucs+torchcrepe)＋basic-pitchは**TFLite/ONNX**軽量backendで。Spleeterは死(旧TF・Py3.11破綻)。Vamp/Chordinoはネイティブbinary→`chord-extractor`が緩和。essentiaは全部入りだが**AGPLv3**、madmomは2018停止+NC。

## 7. 取得と著作権（日本＝有利な管轄）

- **yt-dlp**(Unlicense/publicdomain・活発)：`-x`で音声抽出だが、2024–25のYouTube防御(**SABR**・**per-video PO Token**)で「昔は一発」が**cookies+POトークンprovider必須で難化**。**YouTube ToSは原則DL禁止**（Premiumオフライン等を除く）＝**ToSは著作権とは別レイヤー**。
- **著作権（日本 著30-4「情報解析」＝この用途に寛容）**：**表現を享受しない解析目的の複製を広く許容・営利可・オプトアウト不可**。ただし①権利者利益を不当に害さない②**海賊版ソースの利用は不利**（文化庁は保守的）。[bunka.go.jp](https://www.bunka.go.jp/english/policy/copyright/amendments_2018/)
- **判例の含意**（米）：索引/スニペット=fair use(Google Books/HathiTrust)、**市場代替は不可**(Thomson Reuters v Ross)、訓練は変容的でも**海賊版ライブラリ保持は不可**(Bartz v Anthropic)。
- **保存の線引き（実務）**：**残してよい＝派生的で非表現的な事実**（BPM/調/拍子/構成timing/音域/クロマ/統計/要約）。**危うい＝音源そのものの恒久保持・全曲リテラル採譜・再配布**。→ otomemo は**音源を貯めず、解析の事実/要約だけを知見ネタに残す**が線。専門家確認推奨。

## 8. クラウド代替（据えない）

**Spotify Audio Features/Analysis API は2024/11に新規アプリ向け廃止**（さらに2026にdev-mode有料化）＝**設計の依存に据えてはいけない**。AcousticBrainz終了。残るは有料B2B（**Music.ai**$9.99 Pro APIが最もhobby向き・Sonotellerがfeatures clone・Cyanite/ACRCloudはenterprise）。→ **ローカルfirstが唯一の耐久解**（deprecateされない・自分で持つ）。

---

## 設計含意（otomemo への落とし込み）

1. **実行基盤の再判断**：これは**重いPython音声MLバッチ**（Demucs/basic-pitch/BTC）。今日 cm-worker を撤去したが**これは別物**（LLMジョブルータでなく決定的な音声ツール群）。素直な形は2択：
   - **(A) api が Python音声CLIを spawn**：`demucs`/`chord-extractor` 等を子プロセスで叩き結果JSONを受ける＝「gen_* を決定的TSにした」の**音声版**（脳でなく道具）。継続調査と同じ **job consumer** に `audio_analyze` intent を足す形。
   - **(B) `cm-audio` 常駐サービス**（FastAPI・torch）を新設＝**cm-search と同型の「別プロセスのPython専任」**。api が HTTP で投げる。モデル常駐でウォーム。
   - どちらも **1曲=数分CPU＝非同期**＝継続調査と同じ「**投げて→裏で→受信トレイ**」骨格に乗る。**stemはasset化してキャッシュ**。
2. **出力＝音源を保存しない**（30-4線）。派生事実（BPM/調/構成/音域/コード候補/メロ輪郭）を**知見ネタ or 参考ネタ**として保存。**Claudeが数値+輪郭を「アナリーゼ文」に言語化**（メロの特徴の言語化＝Claudeの独壇場）。
3. **UX**：Chatに「このURL解析して」→ `audio_analyze` job（裏）→ トレイに「アナリーゼ結果」ネタ。**まさに継続調査の骨格の再利用**。
4. **信頼度を必ず添える**：三和音/音域/BPM/調＝事実寄り、7th/テンション/正確ノート＝候補（人間検算）。otomemoのコードネタ/メロネタに**候補として落として自分で弾き直せる**のが理想の出口。

## 推奨・段階プラン（堅い順）
1. **基礎メタ+音域**（確実に「使える」）：Demucs stems ＋ librosa(BPM/調) ＋ pyin/torchcrepe(音域)。→ まずここで「URL→BPM/調/構成/音域が数十秒で返る」を成立。
2. **メロ輪郭**：basic-pitch(vocal stem)→ノート→**Claudeが特徴を言語化**（跳躍/順次/シンコペ/音域）。
3. **コード**：BTC/Chordino(混合)→**三和音候補**→otomemoのコードネタに落として人間検算。
4. **構成ラベル**：allin1(Intro/Aメロ/サビ)。NATTENビルド要＝重いので後。
5. **楽器**：stem名=事実、それ以上は低信頼ヒント。

## 最小CPUスタック（2025）
Demucs `htdemucs`(MIT)＋ffmpeg ／ basic-pitch(Apache-2.0, TFLite/ONNX) ／ torchcrepe(MIT) ／ BTC(MIT) or chord-extractor(GPL) ／ librosa(ISC)。**torch-first**でML枠を割らない。**feasible=stems/メロノート/ボーカルf0/三和音**、**fantasy=BS-RoFormer/MT3(GPU級)**、**精度弱=7th拡張/多声ボーカル採譜/ノートoffset**。
