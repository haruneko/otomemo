# 仮歌を歌わせる — VOICEVOX 歌唱のローカル・フィジビリ（実測 L4・2026-07-15）

## 問い
ツールのメロネタ（`Note{pitch, start, dur, syllable}` ＝モーラ付き音符列）＋仮歌詞を、この母艦（Ryzen 7 8845HS・16スレッド・WSL2・**GPU未使用**・CPUのみ）で **wav に歌わせられるか**。机上判定（`research/2026-07-01-singing-voice-synthesis.md`）で「本命＝VOICEVOX 歌唱（ローカルHTTP・無料商用可・日本語）」と結論済み。本タスクは**実際に入れて歌わせる実証**。

---

## TL;DR（結論5行）
1. **回る。** VOICEVOX ENGINE 0.25.2（linux-cpu-x64）を母艦に立て、自作8音メロ＋モーラ歌詞 → **wav 生成に成功**。3ファイル出力（試聴はオーナー手番）。
2. **速い。** レンダは **リアルタイムの約10倍速（RTF ≈ 0.10）**。8.3秒の歌唱を synth 0.83s。ウォーム時の query は 0.1s 未満。**1フレーズ ≒ 1秒**でオンデマンド実用。
3. **コスト＝初回のモデルロードのみ。** 冷起動後の初回 query が約2.1s（モデル遅延ロード）、以降は 0.1s 未満。起動は約1秒。常駐RAM ≈ **691MB**、ディスク ≈ **2.1GB**（展開後、7z 別）。
4. **歌声（type=sing）は波音リツ1体のみ**、**ハミング声質（type=frame_decode）は81スタイル**。正道＝query は sing(リツ 6000)・synth は frame_decode（声質を差し替え）。
5. **音質は機械範囲で健全**（無音でない・クリップなし・RMS/ピーク良好）。**言葉と音程は乗る**。ニュアンスの良し悪しは要試聴。

---

## 1. 導入（再現可能）

### 置き場所・状態
- **導入済み（2026-07-01 の PoC 資産を再利用）**：`/home/shuraba_p/voicevox-poc/extracted/linux-cpu-x64/`
  - 展開後サイズ **2.1GB**（`libvoicevox_core.so` / `libvoicevox_onnxruntime.so` / `model/` / `run`）。
  - 元アーカイブ `/home/shuraba_p/voicevox-poc/engine.7z.001`（1.82GB・DL 済み）も残存。**engine.7z 込みで voicevox-poc 全体 3.8GB**。
  - ディスク余裕：`/`（母艦ルート）は **906GB 空き**（`df -h` 確認済み）＝逼迫なし。
- 補助ディレクトリ `~/.local/share/voicevox-engine/`（音声ライブラリ格納先・現状ほぼ空）。

### 新規に入れる場合の手順（sudo 不要）
1. GitHub Releases から `voicevox_engine-linux-cpu-x64-<ver>.7z.001`（≈1.8GB）を DL。
2. 7z 解凍：`uv tool install py7zr` → `py7zr x engine.7z.001`（uv/py7zr は導入済み）。
3. 実行権限付き `run` バイナリが出る（PyInstaller バンドル＝Python/依存同梱・**Docker 不要**）。

### 起動コマンド（本タスクで実走）
```bash
cd /home/shuraba_p/voicevox-poc/extracted/linux-cpu-x64
./run --host 127.0.0.1 --port 50121   # 既定は 50021。並行衝突回避で 50121 を使用
```
- 起動 **約1秒**で `GET /version` → `"0.25.2"` 応答。疎通 OK。
- OpenAPI は `/docs`（Swagger）・`/openapi.json`。
- **Docker 版でも可**（`voicevox/voicevox_engine:cpu-latest`）だが、母艦は architecture 方針で Docker 非依存＝**直バイナリ起動が整合**。

> 実行後は本タスクで**エンジンを停止済み**（後片付け）。プロセスは残していない。

---

## 2. 歌唱 API の実測

### 歌唱対応キャラ（API `GET /singers` で列挙）
- 全 singers = **30体**。スタイルの `type` で用途が分かれる：
  - **`type=sing`（本物の歌声・query に使う）＝波音リツ「ノーマル」id 6000 の1つのみ。**
  - **`type=frame_decode`（ハミング声質・synth に使う）＝81スタイル**（四国めたん/ずんだもん/春日部つむぎ/雨晴はう/波音リツ/玄野武宏…各キャラ×感情）。例：ずんだもんノーマル 3003、波音リツ frame_decode 3009、リツ「クイーン」3065。
- **正道**：ピッチ曲線は **sing(6000)** で作り、声色は **frame_decode の任意 id** で鳴らす（query と synth で speaker を分ける）。

### 呼び出しフロー（2段）
```
POST /sing_frame_audio_query?speaker=6000      body = Score      → FrameAudioQuery(f0/volume/phonemes)
POST /frame_synthesis?speaker=<frame_decode id> body = FrameAudioQuery → WAV (24kHz mono 16bit)
```

### Score 形式（実測・確定）
```json
{"notes":[
  {"key": null, "frame_length": 23, "lyric": ""},   // 先頭に休符 note 必須
  {"key": 60,   "frame_length": 47, "lyric": "そ"},  // key=MIDI音高, lyric=モーラ(かな)
  ...
  {"key": null, "frame_length": 23, "lyric": ""}     // 末尾も休符で締める
]}
```
- `key` = MIDI ノート番号（休符は `null`）。`frame_length` = **フレーム数**。`lyric` = モーラ（かな・休符は `""`）。
- **フレームレート = 93.75 fps**（= 24000 / 256）。`frame_length = round(秒 × 93.75)`。
- FrameAudioQuery の中身（フレーム配列・93.75fps）：`f0`（基本周波数Hz・全ピッチ曲線）／`volume`（全ダイナミクス曲線）／`phonemes`（`{phoneme, frame_length}` の発音タイミング）／`volumeScale`／`outputSamplingRate`。**合成前に f0/volume を編集して表現注入が可能**（自前UIの余地）。

### 実測メロ（自作）
- BPM120・四分音符主体・8音「**そらにかぜふくよ**」（末尾2拍伸ばし）＝ピッチ 60,62,64,65,67,65,64,60。
- 16音版「**そらにかぜがふいてはるがきたよね**」＝ピッチ 60..67 の上行下行。

### 合成時間（CPU 実測・16スレッド）
| ケース | notes | audio長 | query | synth | RTF(synth/audio) |
|---|---|---|---|---|---|
| 冷起動 初回 8音 | 10 | 4.77s | **2.10s**(モデルロード込) | 0.47s | 0.099 |
| ウォーム 8音 | 10 | 4.77s | **0.07〜0.08s** | 0.47s | 0.098 |
| ウォーム 16音 | 18 | 8.28s | 0.09s | 0.83s | **0.100** |

- **synth は audio 長にほぼ線形・RTF ≈ 0.10 で安定**（音符数でなく秒数に比例）。query はウォーム後ほぼ無視できる。
- **含意**：初回だけ style の遅延ロードで ~2s、以降フレーズあたり ≈ 1秒。**ウォームアップ推奨**（起動後にダミー1回投げる）。

### 音質の所感（機械範囲）
- WAV = **24kHz / mono / 16bit**。sanity（RMS/ピーク）：8音リツ peak 11160、16音 peak 10799(0.33 FS) / RMS 2140 ＝ **無音でない・クリップなし・健全な信号**。
- **言葉（モーラ）と音程は確かに乗る**。破綻・全域ノイズは検出されず。**歌い回し/自然さの良否は耳＝オーナー手番**。

---

## 3. メロネタ → VOICEVOX スコア 変換仕様（案・実装しない）

**入力**：`Note{ pitch:number(MIDI), start:number(拍), dur:number(拍), syllable?:string }[]` ＋ `bpm`。
**出力**：`Score{ notes:[{key:number|null, frame_length:int, lyric:string}] }`。

### 換算式
- `secPerBeat = 60 / bpm`
- `frames(beats) = round(beats * secPerBeat * 93.75)`
- 各 Note → `{ key: pitch, frame_length: frames(dur), lyric: syllable ?? "ラ" }`
  - `syllable` 欠落時は既定モーラ（"ラ"等）でフォールバック（音程確認用途）。

### 休符・タイ・音域外の扱い
- **先頭・末尾に休符 note 必須**：`{key:null, frame_length: frames(0.25), lyric:""}`（無いと破綻し得る）。
- **音符間ギャップ（start の非連続）**＝休符 note を挿入：`gapBeats = next.start − (cur.start + cur.dur)`、`gapBeats > 0` なら `{key:null, frame_length:frames(gapBeats), lyric:""}` を差し込む。オーバーラップ（gap<0）は前音を丸めるか後音を後ろへ。
- **タイ／メリスマ**（1モーラを複数音符に伸ばす）＝2音目以降を **`lyric:""`** で同音/別音の note にする（VOICEVOX は空 lyric で母音継続）。逆に長い1音符に複数モーラを割る場合は音符を分割。
- **音域外**：type=sing は歌声モデルの学習音域を外れると破綻し得る。**クランプ（例 C3〜C5 目安）またはオクターブ折り返し**を前段で。要試聴で境界確定。
- **キャッシュ鍵**：`hash(notes + syllable + bpm + singId + frameDecodeId)`（前調査の設計と同型）。同一なら再レンダせずキャッシュ返し。

---

## 4. NEUTRINO（軽く1段のみ・実走せず）
- **導入コスト**：freeware・ダウンロード配布（Windows 主・Linux は wine/ビルドの手間）。モデル同梱で**数GB級**。CPU 可だが **1分の曲に数分**＝VOICEVOX より桁で遅い。
- **橋の現状**：入力は **MusicXML**。本ツールは `apps/web/src/musicxml.ts` に **parse（import）のみ**実装、**書き出し関数は不在**（`writeMusicXml/exportMusicXml/toMusicXml/serializeMusicXml` いずれも grep ヒットなし）。**NEUTRINO を使うには MusicXML 書き出しの新設が前提**。
- **ライセンス**：一部ボイス非商用。
- **判定**：VOICEVOX が実用速度で立った以上、**NEUTRINO は当面不要**（高音質が要る局面の将来オプション）。MusicXML 書き出しは NEUTRINO 専用でなく VOICEVOX 公式エディタ/OpenUTAU への受け渡しにも効く汎用の橋＝作るなら別トラック。

---

## 5. 成果物（wav・オーナー試聴用）
スクラッチパッド `/tmp/claude-1000/-home-shuraba-p-projects-creative-manager/2b6f9b3e-7623-463b-b771-2e7824cf6256/scratchpad/` に：
- `kariuta_rits.wav` — 8音「そらにかぜふくよ」・声色=波音リツ frame_decode(3009)・4.77s
- `kariuta_zunda.wav` — 同メロ・声色=ずんだもんノーマル(3003)・4.77s
- `kariuta_rits_16.wav` — 16音「そらにかぜがふいてはるがきたよね」・リツ(3009)・8.28s

> スクラッチパッドはセッション隔離＝揮発し得る。恒久保存が要るなら別途コピー。

---

## 6. 限界と次の一手（api 統合の形）
- **歌声モデルは1体（波音リツ）**。声色は frame_decode で多彩だが、query の歌い回し自体はリツ由来。多様な歌声が要るなら OpenUTAU/DiffSinger の別ボイスバンク（別トラック）。
- **自動再生成はしない**（前調査の結論）＝編集中は SF2 で即再生、歌唱は **明示レンダ（🎤ボタン）＋content-hash キャッシュ＋stale 表示**。レンダは押した時だけ＝CPU 負荷は無問題。
- **api 統合の形＝cm-search と同型の常駐サービス1本追加**が素直：
  - VOICEVOX ENGINE を Tailnet ローカルで常駐（起動1s・RAM 691MB）。api から HTTP で `sing_frame_audio_query → frame_synthesis`。
  - 起動直後に**ウォームアップ1発**（初回2sを潰す）。
  - WAV は既存の **job/asset(role=render)** に載せる（「sing ジョブ → ローカル VOICEVOX → WAV asset → 通知」）。
  - **都度起動でも可**（起動1s＋初回モデルロード2s＝計3s のコールドコスト）だが、頻用なら常駐が快適。まずは**常駐1本追加**推奨。
- **表現の作り込み**：合成前に FrameAudioQuery の f0/volume を編集して、ビブラート/しゃくり/強弱カーブを自前UIで注入する余地（設計思想「機械は足場・人が仕上げ」と整合）。将来オプション。
- **漢字→読み**は別問題（`syllable` はかな前提）。pyopenjtalk 等は別トラック。

---

## 出典・参照
- 前調査（机上判定＋2026-07-01 PoC）：`docs/research/2026-07-01-singing-voice-synthesis.md`
- VOICEVOX ENGINE 0.25.2 linux-cpu-x64（本タスクで実走・OpenAPI `/docs`・`/singers`・`/sing_frame_audio_query`・`/frame_synthesis`）
- 素材の型：`packages/music-core/src/melodyLenses.ts`（`LensNote{pitch,start,dur,syllable?}` ＝ `@cm/music-core Note` の部分集合）
- MusicXML import のみ：`apps/web/src/musicxml.ts`（export 関数は不在＝grep 確認）
