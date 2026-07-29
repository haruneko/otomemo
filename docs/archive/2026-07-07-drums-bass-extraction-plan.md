# 音源→ドラム/ベース抽出計画（拍・拍子の土台をドラムから確定し、rhythm/bassネタへ落とす）

**出自**：Fable 計画エージェント（読み取り専用）が実コード突合で起草（2026-07-07）。本docは**実装計画**＝着手前に design.md へ降ろす前段。正準は requirements/design。
**種別**: 実装計画 ／ **範囲**: ドラム抽出（＋拍/ダウンビート/拍子の確定）・ベース抽出。曲構成・自作コーパス・メロ生成品質は範囲外。
**芯**：分離は既に4stem出てるのに vocals しか使ってない → drums/bass は追加コストゼロで拾える。キック/スネアは最強のオンセット証拠＝ここから拍/ダウンビート/拍子の土台を固める（土台→上に他パートを載せる）。モデルは全部「差し替え可能な部品」・良し悪しは計測で決める。Python=perception(生オンセット/生ノート)／TS純関数=interpretation(meter推定/量子化/度数化/ループ折り畳み)。

---

## 1. 現在地（実コード根拠つき）

### 1-1. 分離：4stemは計算済みだが drums/bass を捨てている
- `_audio_poc/analyze.py` の `separate_vocals()`（L125-139）：htdemucs で `apply_model` を実行＝**vocals/drums/bass/other の4stemテンソルが全部メモリ上にある**のに、L137 で `src[m.sources.index("vocals")]` だけ取り出して保存し、残りを捨てている。**追加の分離コストゼロで drums/bass を拾える**。
- この「POC」が実は本番経路：`apps/api/src/audio-analyze.ts` L15 で `CM_AUDIO_SCRIPT ?? _audio_poc/analyze.py` を spawn（timeout 15分＝分離の重さ考慮済み、L59）。音源とstemは解析後に削除する契約（L126、著30-4＝派生事実のみ残す）。
- venv実態（確認済み）：Python 3.12.3、demucs 4.0.1・librosa 0.11・numpy 2.4.6・torch・scipy・pretty_midi・soundfile。**TensorFlow/onnxruntime は無い**（basic-pitch等は追加導入が要る）。

### 1-2. 拍・拍子：拍子は未検出、ダウンビートはコード変化ヒューリスティックのみ
- `analyze.py` L144・L153-168：`librosa.beat.beat_track`（tightness調整＋BPMヒント）で**実ビート時刻**は出るが、**拍子(meter)はユーザー指定・既定4/4**（`audio-analyze.ts` L104 も同じ）。
- ダウンビート＝`apps/api/src/audio-grid.ts` の `autoDownbeatOffset()`：「コード変化は小節頭に乗りやすい」だけで位相を推定。コードが1小節2回変わる曲・裏で変わる曲で外れる。**キック/スネアという最強のオンセット証拠を一切使っていない**＝土台がグラグラ。
- 初期アンカーの使われ先：`apps/api/src/reaper.ts` L190-212（audio_analyze の reap）で `autoDownbeatOffset` の結果を analysis ネタの `overlay.anchors` に入れ、`apps/web/src/components/AnalysisWorkbench.tsx` が小節線描画に使う（手動修正UIあり＝自動が外れても人が直せる導線は既にある）。

### 1-3. ベース：完全未着手
- bass stem 破棄（上記）。ピッチ検出は vocals の `librosa.pyin`（L36-41、fmin=65〜fmax=1300＝ボーカル帯域）→半音丸めRLE（L56-73）のみ。ベース帯域（E1≈41Hz〜）には未対応。

### 1-4. 受け皿（ネタ形）は既に完備＝流し込むだけ
- **rhythm**：`apps/web/src/music.ts` L149-173 `{rhythm:{steps, lanes:[{name, midi, hits:[stepIdx], vel?}], kit?}}`（1step=16分）。MIDI取込の `apps/api/src/midi-import.ts` L27-40 `drumRhythm()` が「ノート列→rhythm content」変換の**既存実装見本**。reapの正解形＝`apps/api/test/job.test.ts` L377 `{rhythm:{steps:16, lanes:[{name:"Kick",midi:36,hits:[0]}]}}`。GMマップ既定＝Kick36/Snare38/HiHat42/OpenHat46（music.ts L187-194）。
- **相対bass**：`music.ts` L230-242 `{mode:"relative", steps, pattern:[{step, degree:"R"|"3"|"5"|"7"|"8"|"approach", dur}], preview_chords?}`。度数→実音解決は `resolveRelativeBass`（L299-）で実装済み。reapの正解形＝`job.test.ts` L186。絶対 `{notes}` のbassも有効（`music/generate.ts` genBass L850）。
- **reapの受け口**：`reaper.ts` の audio_analyze 分岐（L165-229）は既に facts から analysis ネタ＋chord_progression 候補ネタを materialize している。**ここに rhythm/bass の materialize を足すのが自然な差し込み口**。`hasMusic()`（L32-45）は rhythm/相対bass 両対応済み。
- **計測の下地**：`_audio_poc/midi_truth.py`・`compare.py`＝「MIDI正解 vs 音源解析」比較の前例あり（コード進行用）。ドラム/ベースにも同じ型（自作MIDI→レンダ→解析→突合）が使える。

**総括**：穴は「分離結果を拾う数行」＋「オンセット/ピッチの perception 層」＋「グリッド確定と量子化・ループ折り畳みの interpretation 層」＋「reaperの materialize 分岐」。受け皿・計測前例・削除契約・停止機構は全部ある。

---

## 2. 候補比較表（モデルは全部「差し替え可能な部品」・良し悪しは計測で決める）

### 2-1. 分離器（既定＝htdemucs継続。ただしA/B枠を作って固定しない）

| 候補 | 精度感 | 速度 | ライセンス | 商用 | 導入難度 | 判定 |
|---|---|---|---|---|---|---|
| **htdemucs**（導入済 demucs 4.0.1） | 4stem SDR ≈7-9dB・drums/bass比較的得意 | CPUで重い（既にtimeout15分設計） | MIT | ✅ | ゼロ（動いている） | **既定の出発点** |
| htdemucs_ft（同パッケージ） | +0.25dB程度（**要確認**） | 約4倍遅 | MIT | ✅ | 引数1つ | 最初のA/B相手（追加リスクゼロ） |
| BS-RoFormer / Mel-RoFormer 系（ZFTurbo MSST等の重み） | SOTA級（SDR 9-11+、**要確認**） | GPU推奨 | **コードはMIT系だが学習済み重みは非商用条件が多い（重みごとに個別確認必須）** | ⚠️ 重み次第で**製品NG** | 中〜高 | 精度天井を測る「物差し」用途なら可。製品同梱は重みライセンス確認まで保留 |
| UVR（MDX-Net系） | 高（モデル依存） | 中 | GUI本体とモデルでライセンス混在（**要確認**） | ⚠️ | 中 | 同上 |
| Spleeter / Open-Unmix | htdemucsより劣る | 速い | MIT | ✅ | TF依存(Spleeter) | 後退＝候補から外してよい |

**補足（分離器の差が効く所）**：拍/拍子用途はキック/スネアのオンセットが残れば十分＝分離器の差が効くのは**ベース音程転写側**。∴分離器A/Bの計測指標は「ベースのノートF値」を主にする。なお facebookresearch/demucs リポジトリはアーカイブ済みの可能性（**要確認**・pip版4.0.1は動作中なので当面問題なし）。

### 2-2. ドラム分類（ADT）

| 候補 | クラス | ライセンス | 商用 | 導入難度 | 判定 |
|---|---|---|---|---|---|
| **帯域ヒューリスティック自前**（librosa onset_detect＋帯域エネルギー比：低域<150Hz=Kick／中域＋広帯域ノイズ=Snare／高域>6kHz=HiHat） | 3クラス | ISC(librosa)＋自前 | ✅ | **追加依存ゼロ** | **v1採用**。分離済みdrums stem相手なら「そこそこの下書き」に十分。土台グリッド用途にはこれで足りる |
| ADTOF | 5クラス（+Tom/Cymbal） | MIT（**要確認**） | 要確認 | TF依存・py3.12/numpy2.4互換**要確認** | v2昇格候補（計測で自前を上回れば） |
| OaF Drums（Magenta/E-GMD） | 多クラス | Apache-2.0 | ✅ | 旧TF系＝導入難 | 保留 |
| ADTLib | 3クラス | **要確認** | 要確認 | 古い | 後退気味 |
| arXiv:2509.24853（2025・stem分離+ADT+velocity） | — | コード公開有無**要確認** | — | — | ウォッチのみ |

### 2-3. 拍・ダウンビート・拍子

| 候補 | 出力 | ライセンス | 商用 | 導入難度 | 判定 |
|---|---|---|---|---|---|
| **自前：drum onsets＋ルール/自己相関**（キック=1拍目・スネア=バックビート(2,4拍)・小節長周期の一致度で meter∈{3,4}（＋6/8）×位相を採点） | meter＋downbeat位相＋信頼度 | 自前(TS純関数) | ✅ | 小。`audio-grid.ts` の前例と同じ場所に足す | **v1採用**。TDDしやすい（合成オンセットでテスト） |
| madmom DBNDownBeat | beat+downbeat+meter | BSD-2だが**一部機能に特許条項**（既存research doc記載・該当範囲**要確認**）＋pip版のpy3.12/numpy2互換**要確認** | ⚠️ | 中 | 自前が弱ければ比較対象 |
| allin1 | beat+downbeat（+構成） | MIT | ✅ | **NATTEN依存で導入難**・内部demucs重複＝重い | 構成は範囲外なので今回は見送り。将来構成をやる時に一括で |
| Beat This!（CPJKU 2024） | beat+downbeat SOTA | **要確認**（MITと思われる） | 要確認 | torch＝既存と相性良 | 自前の次の比較候補 |
| BeatNet | beat+downbeat+meter | **CC BY-NC 系＝非商用の可能性大（要確認）** | ❌濃厚 | — | 避ける |

### 2-4. ベース音程検出

| 候補 | 出力 | ライセンス | 商用 | 導入難度 | 判定 |
|---|---|---|---|---|---|
| **pyin（librosa・導入済）** fmin≈30/fmax≈400に変更＋既存RLEノート化流用 | f0→自前ノート化 | ISC | ✅ | **ゼロ**（vocalsで同じ道を通した） | **v1採用**。ベースは概ね単音＝pyinで成立 |
| basic-pitch | **onset/offset付きノート**（ノート化まで面倒を見る） | Apache-2.0 | ✅ | TF or onnxruntime追加・numpy2.4/py3.12互換**要確認** | v2昇格の本命。pyinとF値でA/B |
| torchcrepe | f0（高精度） | MIT | ✅ | torch既存に乗る＝軽い | f0精度が律速と判明した時の差し替え |
| CREPE（TF版） | f0 | MIT | ✅ | TF追加＝重い | torchcrepeで代替 |

**設計原則**：Python側は「perception＝生オンセット/生ノートを facts に出す」だけ、meter推定・量子化・度数化・ループ折り畳みは**TS純関数（interpretation）**に置く。→ 部品差し替え（分離器/ADT/ピッチ検出）が facts 契約の内側で完結し、TS側のテストは差し替え後も正解のまま。

---

## 3. 最初の手（縦スライス1）：ドラム→拍/ダウンビート/拍子の土台＋rhythmネタ

**WHAT**：音源1本を投げると、(a) 拍子とダウンビートが自動推定されて解析ワークベンチの小節線が最初から合っている、(b) トレイに「それらしいドラムパターン」の rhythm ネタ（候補タグ付き）が届く。

**HOW骨子（変更点は4ファイル＋テスト）**：

1. **`_audio_poc/analyze.py`**（perception）
   - `separate_vocals` → `separate_stems` に拡張：vocals に加え drums.wav / bass.wav を workdir へ保存（分離は1回のまま・追加コスト≈ファイル書き出しのみ。stemは解析後削除の既存契約のまま）。
   - `drum_onsets(drums_wav)` 追加：`librosa.onset.onset_detect`（backtrack）→各オンセットの帯域エネルギー比で Kick/Snare/HiHat に分類→facts に `drum_onsets: [[t_sec, "kick"|"snare"|"hihat", strength], ...]` を追加（**追加のみ＝後方互換**）。
2. **新規 `apps/api/src/audio-drums.ts`**（interpretation・純関数・TDD本丸）
   - `estimateMeterDownbeat(beatTimes, drumOnsets)`：meter候補{4,3}（6/8は既存UIが meter=6 を認識＝AnalysisWorkbench L238 の表示分岐を確認済みなので候補に含めるか要判断）×位相を「キックの小節頭一致＋スネアのバックビート一致＋小節周期の自己相関」で採点→ `{meter, offset, confidence}`。低信頼時は既存 `autoDownbeatOffset`（コード変化）へフォールバック。**ユーザー指定meterは常に優先**（現行 params.meter の意味を「未指定=自動」に拡張。mcp.ts L618・audio-analyze.ts L104 の既定4を「0=auto」に変える契約変更＝design.md に先に書く）。
   - `drumOnsetsToRhythm(onsets, beatTimes, offset, meter)`：オンセット→拍位置（beat_times線形補間＝AnalysisWorkbench L46 の手法を純関数化）→16分stepへ量子化→小節ごとのパターン列→**多数決で1〜2小節ループに折り畳み**（各lane×stepで出現率≥50%採用。2小節周期性が有意なら steps=32）→ `{rhythm:{steps, lanes:[{name:"Kick",midi:36,hits},...]}}`（`midi-import.ts drumRhythm` と同形）。
3. **`apps/api/src/reaper.ts`** audio_analyze 分岐：facts に drum_onsets があれば (i) anchors の初期値をドラム由来offsetで置換（chords由来より強い証拠）、(ii) analysis meta に `meter_detected {meter, confidence}`、(iii) rhythm ネタを materialize（title「アナリーゼ: X のドラム（候補）」・tags `["アナリーゼ","候補"]`・tempo/meter付き）。
4. **`apps/api/src/audio-analyze.ts`**：`summarizeFacts` に meter推定とパターン概要のみ追加（**生オンセット配列はプロンプトに入れない**＝L78-79 のタイムアウト教訓を踏襲）。

**テスト方針（TDD・vitest）**：
- `audio-drums.test.ts`（新規）：合成データで赤→緑。①8ビート4小節（kick 0/8・snare 4/12・hat八分）→ meter=4・offset正解・折り畳み結果が期待lanesに一致。②ワルツパターン→ meter=3。③位相ずらし→offset検出。④±30msジッタ＋偽オンセット混入→頑健性。⑤ドラム希薄→低信頼でフォールバック。
- `job.test.ts`：drum_onsets入りfactsの audio_analyze reap → rhythmネタが正しい形で1枚（既存 L367 の import_midi テストが雛形）。
- Python側はユニットテスト基盤が無い→薄く保ち、検証は下記の計測スクリプトで（自作MIDIドラム→GMレンダ→pipeline→打点F値、`compare.py` の型を流用）。

**工数感**：analyze.py改修 0.5日／audio-drums.ts＋テスト 1〜1.5日／reaper・summarize配線＋テスト 0.5日／計測1周（MIDIレンダ2-3曲＋実音源2-3曲）0.5〜1日 ＝ **合計2.5〜3.5日**。

**リスク**：①タム/キック・ゴーストノートの混同（→3クラスに限定し閾値強め＝「下書きで価値」の割り切り）②シンバル被り（分離粗でもキック/スネアは残る想定＝計測で裏取り）③ハーフタイム/倍テンポの位相曖昧（→confidence併記＋ワークベンチの手動アンカーが既にある＝人間の逃げ道確保済み）④テンポ揺れ（beat_times補間で吸収・固定BPM前提にしない）。

---

## 4. 続く手

### 縦スライス2：ベース→bassネタ（相対度数）
1. `analyze.py`：bass stem に pyin（fmin≈30・fmax≈400、frame_length は低域周期を覆うか要調整）→既存RLE（`vocal_melody` を汎用化）→ facts `bass_notes: [[start,end,midi],...]`。
2. 新規 `apps/api/src/audio-bass.ts`（純関数）：ドラム由来グリッドで16分量子化→ `chords_timeline`（`audio-chords.ts` の parse 前例）から各時点のコードを引き、**ピッチクラス−ルートの音程→度数**（0=R/3,4=3/7=5/10,11=7/12=8）。次コードのルートへ半音/全音で寄る短音= approach。写像不能音は最近傍度数か棄却し、**mapped_ratio を信頼度として記録**。ドラム同様ループ折り畳み→ `{mode:"relative", steps, pattern, preview_chords}`。
3. reaper：bass ネタ materialize。**推奨＝相対1枚をネタに、絶対 `[start,end,midi]` は analysis.raw.bass_notes に保存**（ワークベンチ表示＋将来の再変換用。2枚出すかはオーナー判断）。
4. テスト：度数写像・approach判定・折り畳みの純関数テスト＋reapテスト。工数 **2〜3日**。リスク＝オクターブ誤検出（pyinの倍音誤り→帯域制限で軽減）・スラップ等ノイズ奏法。

### 分離器/検出器A/Bの据え方（固定しない仕組み）
- `analyze.py` に分離モデル名の引数/環境変数（`htdemucs`｜`htdemucs_ft`｜将来枠）を通し、**計測スクリプト**（`_audio_poc/compare.py` の隣に drums/bass 版）で「ドラム打点F値（±50ms）／ベースノートF値・度数一致率／meter正解率・downbeat F値」を曲セットに対して一発出力。**採用判断は必ずこの数字＋耳**。basic-pitch vs pyin も同じ土俵で。mir_eval（MIT・**要確認**）を入れるか自前実装かは導入時に判断。

---

## 5. 耳検証が要る所／オーナー判断待ち
1. **折り畳んだループが「それらしい」か**＝F値では決まらない。rhythm/bassネタを実際に鳴らして判断（RhythmEditor/BassStepEditorで即再生可能）。
2. **正解セットの用意**：自作MIDI（レンダ経由＝正解厳密・無料）を何曲＋市販/実音源を何曲（拍子・小節頭・8小節分のドラムパターンの手採譜＝1曲30分程度）にするか。最低ライン提案＝MIDIレンダ3曲＋実音源3曲（4/4×4・3/4or6/8×2）。
3. **分離器の最終選択**：v1はhtdemucs据置でよいか。RoFormer系の重みライセンス調査に工数を割くか（製品化時期次第）。
4. **meter自動の見せ方**：自動値をそのまま採用か「検出: 3/4（信頼度低）」表示で人が確定か。
5. **bassネタの枚数**（相対のみ vs 相対+絶対の2枚）。

## 6. 要確認・不確実（事実と推測の線引き）
- **コードで確認済みの事実**：4stem計算済みでvocals以外破棄／meter未検出・ユーザー指定／downbeatはコード変化のみ／rhythm・相対bassスキーマとreap受け口・変換前例（drumRhythm）・計測前例（midi_truth/compare）の存在／venvの導入パッケージとバージョン。
- **要確認（未検証の外部事実）**：htdemucs_ftの精度向上幅／ADTOF・ADTLib・Beat This!・mir_evalの正確なライセンス／RoFormer系重みの個別ライセンス／madmomの特許条項の範囲とpy3.12互換／basic-pitchのnumpy2.4/py3.12互換／facebookresearch/demucsのアーカイブ状況／BeatNetの非商用条項。
- **推測（計測で答え合わせ）**：帯域ヒューリスティックADTが土台用途に足りる／分離粗でもキック・スネアオンセットは残る／pyinがベース帯域で実用になる。
- **SDD手順**：着手前に `docs/design.md` へ「facts契約の追加フィールド」「meter=0(auto)の意味変更」「reaperのrhythm/bass materialize」を先に書く→Task化→TS純関数のテスト先行→コード（CLAUDE.mdの順序厳守）。

## 実装時の起点ファイル
- `_audio_poc/analyze.py`（stem保存・drum_onsets・bass_notes の perception 追加）
- `apps/api/src/reaper.ts`（audio_analyze 分岐に rhythm/bass の materialize と anchors 改善）
- `apps/api/src/audio-grid.ts`（meter/downbeat 推定の拡張先＝新規 audio-drums.ts / audio-bass.ts の設計前例）
- `apps/api/src/midi-import.ts`（ノート列→rhythm content 変換の既存見本 drumRhythm）
- `apps/api/test/job.test.ts`（rhythm/相対bass の reap 正解形＝テスト先行の雛形）
