# コーパスDB診断（R0）— 「解析済データのごみ化」実測診断とスキーマ再設計（2026-07-14）

**任務**：DBの解析済コーパスがなぜ生成の材料として使えないかを**実測で診断**し、保存すべき統計の**スキーマを再設計**する。読み取りのみ（DB無変更）。

**結論（TL;DR）**：
- **メロ句辞書（1396件）の82%＝POP909由来"pop"（1139件）が位相ズレ焼き込み**。オンセットが小節頭に乗らず（拍0にオンセットを持つ句が **52.8%** のみ／irish 99.4%・game 97.0%）、位相ヒストグラムのピークが 0.25/0.75/1.75/2.25 に散る。**pitchは正規化健全（normalizeToC）だがリズムの拍位相が壊れている**＝生成の骨格材料として使うと拍が食う。
- **進行コーパス（402件）は断片・重複・長短分裂**。**≤2和音の断片 23.9%（96件）**、**完全重複 46.5%（187件）**、同一曲がループ毎の独立キー判定で長調版と短調版に**分裂**（例：Mr.Children「#2601」loop1=minor / loop2=major）。roots は度数正規化（C基準）健全。
- **スキーマ欠落**：メロは `key`・`bars` が **100% NULL**（Cへ正規化した事実も1フレーズ数も非保存＝暗黙契約）。品質語彙が不統一（`""` vs `maj`、`m` vs `min`）。
- 位相以外（pitch度数・句長・断片フィルタ）は健全。**ごみ化の主因は①pop句のリズム位相（コード起因×POP909注釈の秒/拍取り違え）と②進行のループ分割設計（コード起因）**。データではなくパイプラインが主因。

---

## 1. DBの所在と診断方法

- **稼働DB**：`/home/shuraba_p/projects/creative_manager/data/cm.sqlite`（13.4MB, 2026-07-13 更新）。`apps/api/src/main.ts:13` が既定でこれを絶対パス参照。`apps/api/data/cm.sqlite`（172KB）は cwd 取り違えの残骸で非稼働。
- **方法**：`better-sqlite3` を `{ readonly: true }` で開いて集計（**書込・削除なし**）。スクリプトは scratchpad（`q.js`/`melqual.js`/`phase.js`/`chords.js`）。
- **コーパスの格納形**：専用テーブルは無く、すべて `neta` テーブル（1939行）に格納。種別は `neta.kind`：
  - `melody` 1435（うち **`pattern` タグ 1396 = 句辞書本体**、残り39は ZZE2E/ZZDESIGN 等のテスト生成ゴミ）
  - `chord_progression` 402（うち **`取込` タグ 356 = 進行コーパス本体**）
  - 他：section 23 / bass 18 / rhythm 17 / chord_pattern 16 / lyric 10 …（ドラム系は少量、後述§7）
- スキーマ：`neta(id,kind,title,content,text,key INTEGER,mode TEXT,tempo,meter TEXT,bars INTEGER,mood,created,updated,scope)`。旋律/進行の実体は `content`（JSON文字列）。

---

## 2. メロ句辞書（1396件）の実測

計測：`kind='melody' AND tag='pattern'`。単位＝四分音符拍（`start`/`dur`、`midi.ts:75` で tick/division＝拍）。

| 指標 | 実測値 |
|---|---|
| 件数 | 1396（pop 1139=82% / irish 157=11% / game 100=7%） |
| `key` NULL | **1396 / 1396（100%）** ＝ tonic非保存 |
| `bars` NULL | **1396 / 1396（100%）** ＝ 小節数非保存 |
| `mode` | major 785 / minor 611（NULLなし） |
| meter | 4/4:1239, 6/4:33, 3/4:32, 2/4:26, 2/2:14, 6/8:50, 3/8:2 |
| 音数/句（中央値） | 20（p25=16, p75=25, min=4, max=64） |
| span（拍・中央値） | 15（p25=13.5, p75=16）＝ おおむね4小節 ✓ |
| 断片（<3音） | **0件（0.0%）** |
| span<3拍 | 2件（0.1%） |
| 完全重複（pitch@quantized start列一致） | **0件** |
| parse不能・音0 | 0 |

**pitch正規化は健全（`normalizeToC` が効いている）**。C基準の pitch-class 分布（%）：
- major：`0:20 2:17 4:19 5:5 7:19 9:14 11:5`（半音 1/3/6/8/10 ≈ 0%）＝ **Cメジャー相当でクリーン**。
- minor：`0:21 2:9 3:15 5:17 7:20 8:3 10:13`＝ **C自然的短音階でクリーン**。
- game のみ major に `8:4 10:4 6:1` の半音漏れ＝ **キー推定（`detectKeyFromNotes`）由来の調/mode誤判定が数%**（pop/irish は注釈キーで漏れなし）。

### 2.1 位相ズレ（根因候補①）＝確定した主欠陥

「小節内オンセット位相ヒストグラム」（各音の `start mod 拍/小節`、拍0＝小節頭）：

| style | 位相ヒスト上位 | 拍0にオンセットを持つ句 | 先頭音が start=0 |
|---|---|---|---|
| **pop（1139）** | **0.25:9% 2.25:8% 1.75:8% 0.75:7% 0:7% 0.5:6%**（ピークが拍頭に無い・散在） | **601（52.8%）** | 47（4%） |
| irish（157） | **0:20%** 1:18% 0.5:17% 1.5:14% | 156（99.4%） | 95 |
| game（100） | **0:16%** 2:12% 1:10% 3:10% | 97（97.0%） | 77 |

**pop の句は小節頭に音が乗らない**（拍0オンセット被覆 52.8% ＝ ほぼコイン投げ、先頭音が拍0はわずか4%）。位相のピークが **0.25拍ずれた位置に散る**＝**メトリック格子に対して位相が固定されていない**。irish/game は拍0が最頻＝正しく小節頭アンカーされている。**pop がコーパスの82%を占めるため、辞書全体が「拍が食う句」で汚染**されている。

**作成日 2026-06-26〜07-11**＝`data/backups/cm.sqlite.before-downbeat-anchor.20260626-153337`（アンカー修正前バックアップ）より**後**。つまり「downbeatアンカー修正」を入れた後に再構築しても pop の位相は直っていない＝**修正が実効していない**。

---

## 3. 進行コーパス（402件）の実測（根因候補②）

計測：`kind='chord_progression'`（356が `取込`）。`content.chords[].root` は度数（C基準pc）、`quality` は品質文字列。

| 指標 | 実測値 |
|---|---|
| `key` | 0（C正規化）が大多数・**NULL 19** |
| `mode` | major 231 / minor 146 / **NULL 25** |
| `meter` NULL | 29 |
| 和音数ヒスト | 2:93, 3:72, 4:87, 5:23, 6:25, 7:17, 8:34, 16:45, ≤1:3, その他 |
| **≤2和音の断片** | **96件（23.9%）** |
| **完全重複（mode+root+quality列一致）** | **55種で187行（46.5%）** |
| root欠落・quality欠落 | 0 / 0 |
| 品質語彙 | `"":1092, m:451, m7:161, maj7:139, 7:133, sus4:99, 6:69, dim:26, maj:18, m7b5:8, m6:16, aug:2, min:2, sus2:2, 9:1` |

- **root度数分布**（C基準）：`0:728 5:372 7:364 9:185 2:138 3:88 4:76 8:128 10:92 11:26 1:13 6:9`＝ **I,IV,V,vi,ii が支配的でダイアトニック健全**。度数正規化そのものは正しい。
- **長短分裂の実証**：同一曲がループ毎に別mode。例（実データ）：
  - `Mr.Children - #2601 (loop1)` → key=0 **mode=minor**（`0:m, 3:"", 8:7`）
  - `Mr.Children - #2601 (loop2)` → key=0 **mode=major**（`0:"", 2:7`）
  1曲が長調版と短調版に割れている（同一相対キーの平行調をループ毎に独立判定して符号化）。
- **品質語彙の不統一**：メジャー三和音が `""`（1092）だが `maj`（18）も混在、マイナーが `m`（451）だが `min`（2）も混在＝ 遷移統計を数えると同一和音が別トークンに割れる。

---

## 4. 欠陥のコード起因 vs データ起因（file:line 切り分け）

### 4.1 メロ位相（pop）＝**コード起因**（POP909注釈の秒/拍取り違え）

抽出経路：`apps/api/scripts/build-phrase-dict.ts` → `popPhrases()`（L47-67）→ `segmentByBars()`（`apps/api/src/music/phrase.ts:121`）。

- **MIDI音の時間軸**：`apps/api/src/music/midi.ts:75` `start = startTick / division`＝**MIDIファイル先頭(tick0)からの四分音符拍**。
- **アンカー源**：`build-phrase-dict.ts:54` `anchor = firstDownbeatFromBeats(beat_midi.txt)`。`phrase.ts:112-116` は **beatファイルの行indexを返す**（`return i`）＝「1行=1拍」前提で `r[2]===1`（第3列＝小節頭フラグ）を探す。
- **POP909の実フォーマット**（README, music-x-lab/POP909-Dataset）：`beat_midi.txt` は **第1列=時間(秒)・第2列=beat order**（下記§5・出典）。**列が秒ベースで、コードが期待する「第3列=downbeatフラグ」「行index＝拍番号」と一致しない**。
  - 帰結A：第3列が無ければ `firstDownbeatFromBeats` は null → `popPhrases:64` の `anchor ?? undefined` で**アンカー無しのフォールバック**（`phrase.ts:137-140` の「最初の音の小節頭にfloor」）へ。ところが POP909 MIDI は tick0＝小節頭とは限らず（イントロ・変則開始）、`Math.floor(firstStart/beatsPerBar)*beatsPerBar` が**誤った小節頭**を刻む → 位相散乱。
  - 帰結B：仮に第3列があっても「行index＝拍」の仮定が秒ベース注釈と噛み合わず、`origin = anchorBeat + k*span`（`phrase.ts:136`）が**分数位相**でずれる。
  - **どちらでも net = pop句の拍位相が固定されない**（実測 §2.1 で確定）。**raw POP909はリポジトリ外**（ビルド時入力・現存せず）なのでAかBの確定はできないが、**症状は実測で確定**。
- **対照**：irish は `irishPhrases:39-41` で ABC のバーライン由来 `notesC` をそのまま `segmentByBars`（アンカー無しだが**楽譜が既に小節整合**）→ 位相健全。game も MIDI が小節整合しているものが多く健全。

### 4.2 スキーマ欠落（key/bars 非保存）＝**コード起因**

- `build-phrase-dict.ts:121` `core.createNeta({ kind:"melody", ..., meter, mode, ... })`＝**`key` と `bars` を渡していない**。normalizeToC で C(=0) 化した事実も、1パターン＝4小節である事も**行から復元不能**（'pattern' タグを知る暗黙契約に依存）。

### 4.3 進行の断片・分裂・重複＝**コード起因**（ingest設計）

`apps/api/src/ingest-ufret.ts`：

- **≤2和音の断片**：`extractLoops()`（L62-85）が反復サイクルを機械抽出＝ E↔B 型の**自明な2和音バンプ**を1本として保存（コメント L98-100 も自認）。閾値・最小長のゲートが無い。
- **長短分裂**：`songToProgressions()`（L135-155）が**ループ毎に独立して** `detectKeyFromChords(loop,1)`（L138）→ 各ループが別々に key/mode 判定 → 同一曲・同一相対キーが loop1=minor / loop2=major に割れる。**曲単位でキーを1回決めてから全ループを同じ度数枠へ**投影していない。
- **重複**：各ループを無条件 `createNeta`（L152-）＝**曲間・曲内の正規化後dedupが無い**。「簡単コードver.」と通常版が同一進行を二重登録（実データで確認）。
- **品質語彙**：パーサ側で `""/maj`・`m/min` を単一トークンへ正規化していない。

> 既知の先行監査 `docs/research/2026-07-08-melody-chord-audit.md:33` が既に「356中91件が2コード断片・重複46・相対長短コインフリップで分裂」を **M5/M6 未対応**として記録。本診断は**未修正のまま現存**（むしろ402件に増加）を再確認した。

---

## 5. Web調査：注釈設計・度数正規化・位相アンカーのベストプラクティス（出典URL付き）

### POP909（本コーパスのpop源）
- 注釈は **tempo/beat/downbeat/key/chord** を別ファイルで提供、tempoは手動・他はMIRアルゴリズム。`beat_*.txt` は **第1列=時間(秒)・第2列=beat order**、`chord_*.txt`/`key_*.txt` は **start秒 end秒 ラベル**。MIDIは MELODY/BRIDGE/PIANO の3トラック。
  - 出典：README（https://github.com/music-x-lab/POP909-Dataset）、論文 https://ar5iv.labs.arxiv.org/html/2008.07142 、ISMIR2020 https://program.ismir2020.net/poster_1-04.html
- **含意**：注釈は**秒ベース**。オンセット→拍/小節への写像は **beatタイムスタンプ列（＝テンポマップ）で内挿**して行うのが正。行indexを拍とみなす実装は不可。

### De Clercq & Temperley — Rock Corpus（RS200）
- 100曲を手分析、ローマ数字（**tonic相対＝度数正規化**）、反復区間は**再帰的（文脈自由文法的）記法で圧縮**（＝参照による重複排除）。`.tdc`/`.rs` 形式。
  - 出典：https://www.rockcorpus.midside.com/ 、A corpus analysis of rock harmony（Cambridge, https://www.cambridge.org/core/journals/popular-music/article/abs/corpus-analysis-of-rock-harmony/C5210A8EC985DDF170B53124F4464DA4 ）
- **Six-based minor**（de Clercq 2021, MTO 27.4）：ポップスは平行長短の**関係調が曖昧**（Axis進行など）。短調tonicを「1」とせず**scale-degree 6**に置くことで、**長調/短調を強制選択せず**関係調間の機能を一貫トラッキング。Nashville数字システムの実務に一致。
  - 出典：https://mtosmt.org/issues/mto.21.27.4/mto.21.27.4.de_clercq.html （PDF: https://mtosmt.org/issues/mto.21.27.4/mto.21.27.4.de_clercq.pdf ）
- **含意（本コーパスの長短分裂に直撃）**：ループ毎に major/minor を独立判定して割るのが誤り。**曲（または相対キー群）で1つの度数枠**（例：長調中心＝ vi をマイナーtonicと見なす six-based）に**投影**すれば、`#2601` の loop1/loop2 は**同一度数語彙**に統合され分裂が消える。

### CoCoPops / McGill Billboard / RS200（注釈形式の標準）
- CoCoPops は McGill Billboard（**root-quality**表現）＋RS200（**ローマ数字**）を **humdrum `**kern`/`**harm`** に統一。**旋律は scale-degree 注釈＋オクターブ/輪郭方向マーカー**で符号化。
  - 出典：ISMIR2023 https://archives.ismir.net/ismir2023/paper/000027.pdf 、GitHub https://github.com/Computational-Cognitive-Musicology-Lab/CoCoPops 、Zenodo https://zenodo.org/records/10265267 、McGill Billboard https://ddmal.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/
- **含意**：旋律も**度数（tonic相対）＋メトリック位置**で持つのが標準。絶対pitchで持つ本コーパスの pitch は normalizeToC で実質度数化できているが、**拍位置（メトリック位相）を明示アンカーして持つ**べき（今は暗黙で壊れている）。

### 位相アンカーのベストプラクティス（総合）
1. **オンセットはテンポマップ経由で拍化**（POP909 なら beat秒列で内挿）。tick0 や行indexを拍に流用しない。
2. **小節頭（downbeat）を明示アンカーとして保存**し、句は downbeat 相対の拍位置で持つ（弱起は負値）。
3. **メトリック検証をゲートに**：抽出句は「拍0近傍にオンセットを持つ」等の**メトリック健全性テスト**を通す（本診断の 52.8% はこのゲートで弾ける）。

---

## 6. スキーマ再設計案（再構築の実行仕様レベル）

**設計思想**：機械は候補まで／理論スコアはガードレール止まり ⇒ コーパスは**生成の材料（辞書＋遷移統計）**に振る。**リテラル旋律は非保存（統計・度数・相対のみ）＝著作権セーフ**。「何を数え・どう正規化し・何を保存するか」を以下に固定する。

### 6.1 何を正規化するか（共通規約）
- **調正規化**：全エントリ **tonic→pc 0（C）** へ移調。**tonic（元キーpc）と mode を必ず明示保存**（暗黙Cを廃止）。
- **長短の統一枠**：**曲/相対キー単位で1回だけ**キー判定。平行長短の曖昧曲は **six-based（長調中心・vi=マイナーtonic）** に寄せて度数枠を統一（ループ毎判定を禁止）。`mode` は「représentativeな中心」1値。
- **メトリック正規化**：`start`/`dur` は **downbeat相対の拍**（弱起＝負）。拍位置は 1/48拍等の格子へ量子化。**位相アンカーはテンポマップ由来の実downbeat**（行index流用禁止）。
- **品質語彙正規化**：`{maj→"" , min→m , ...}` の**正準トークン表**を1本化（`music-core` のエイリアス表に集約）。

### 6.2 保存すべき統計（テーブル設計）
既存 `neta` を汚さないよう、**コーパス専用テーブルを新設**（生成材料の一級市民化）。SQLite想定・JSON列併用。

**(A) `phrase_pattern`（メロ句辞書）**
```
id            TEXT PK
style         TEXT     -- pop|irish|game|...
mode          TEXT     -- major|minor（six-based中心）
tonic_pc      INTEGER  -- 元キーの主音pc（C正規化前）※復元・検証用。保存音はC基準
meter         TEXT     -- 4/4 等
bars          INTEGER  -- 句の小節数（=4）※明示
pickup_beats  REAL     -- 弱起量（downbeat相対の負オフセット絶対値）
degrees       JSON     -- [{deg, oct, startBeat, durBeat}] deg=tonic相対の度数(0..11)+方向, startBeatはdownbeat相対
count         INTEGER  -- クラスタ出現頻度（＝バイアス重み）
phase_ok      INTEGER  -- メトリック健全性ゲート合格フラグ（1=拍0近傍にオンセット有）
source_meta   JSON     -- {corpus, license, n_songs}（リテラル非保存）
```
- **degrees は絶対pitchでなく tonic相対度数＋オクターブ＋downbeat相対拍**（CoCoPops/RS200流）。リテラル旋律にならない粒度（度数＋リズム）。
- **`count`（頻度）を必ず保存**＝生成バイアス／遷移重みの素。
- **`phase_ok` を保存し、生成は phase_ok=1 のみ採用**（§2.1のゲートを永続化）。

**(B) `note_transition`（メロ遷移統計・任意だが推奨）**
```
style, mode, meter, from_deg, to_deg, ioi_bucket, beat_phase_bucket, count
```
- 度数×リズム×拍位相の**n-gram（bi/tri-gram）カウント**。辞書だけでなく**遷移統計**として持つと、句を丸コピーせず**新規生成の材料**になる（設計思想＝候補生成）。

**(C) `chord_progression_pattern`（進行辞書）**
```
id, mode, meter,
chords     JSON  -- [{degree(root, 0..11), quality(正準), startBeat, durBeat}]
length     INTEGER  -- 和音数（ゲート：>=3 のみ採用）
count      INTEGER  -- 正規化後dedup重複を畳んだ出現数
functions  JSON     -- 任意：機能ラベル(T/S/D/modal)列
source_meta JSON
```
- **ゲート：`length>=3`**（≤2断片を排除）。**正規化後キーで完全一致dedup**して `count` に畳む（46.5%重複を解消）。

**(D) `chord_transition`（進行遷移統計・推奨）**
```
mode, from_deg_qual, to_deg_qual, count
```
- 既存 `next_chord`（無ランク・監査L11）へ**重み**を供給。

### 6.3 再構築の実行仕様（手順）
1. **旧ゴミ隔離**：`neta` の `pattern`/`取込` タグ群は**残したまま**、新テーブルへ再構築（DB無変更の原則を破らず、再構築は別スクリプト＋新規テーブル）。ZZE2E/ZZDESIGN テスト生成メロ（39件）は生成対象から除外。
2. **メロ再抽出**：`popPhrases` を修正—**beatタイムスタンプ列（秒）でオンセット→拍を内挿**し、**実downbeat**を得てから `segmentByBars` にアンカー。抽出後 **メトリック健全性ゲート**（拍0近傍オンセット率≥閾値、`phase_ok`）で選別。`tonic_pc`/`bars`/`pickup_beats` を保存。
3. **進行再抽出**：`songToProgressions` を修正—**曲単位で1回キー判定**→ six-based度数枠へ投影 → `extractLoops` に **最小長≥3ゲート** → **正規化後dedup**して `count` 集約 → 品質語彙を正準トークンへ。
4. **遷移統計を同時生成**（B/D）。
5. **検証（TDD赤→緑）**：再構築後DBに対し本診断スクリプトを回し、**pop拍0被覆≥90%**・**進行断片0%**・**重複0%**・**長短分裂0件（同曲同枠）**を受け入れ基準に。

---

## 7. その他の気づき・範囲外メモ

- **ドラム/リズム系は少量**（rhythm 17・chord_pattern 16・bass 18）＝ 句/進行の「ごみ化」規模（1396/402）とは桁が違う。crash境界抽出（`docs/research/2026-07-08-drum-transcription-journey.md`）の是非は本診断の主対象外＝**P2として別途**。まず件数支配的なメロ位相と進行断片を優先。
- **テスト生成ゴミの混入**：`melody` 1435 のうち 39件が ZZE2E/ZZDESIGN 等。`scope`/タグでコーパスと明確分離できているが、**辞書ビルドの入力から test scope を除外**する明示ゲートが欲しい。
- **key の保存規約が kind 間で不一致**：進行は `key=0` を保存、メロは `key=NULL`。**「C正規化済みは key=0 を明示」で統一**すべき（暗黙契約の解消）。
- **game のキー推定漏れ**：`detectKeyFromNotes` 由来の調/mode誤判定が数%（pc半音漏れで観測）。注釈のある源（pop/irish）を優先し、推定源は `phase_ok` 同様の**信頼度フラグ**を付す。

---

## 出典一覧（URL）
- POP909：https://github.com/music-x-lab/POP909-Dataset ／ https://ar5iv.labs.arxiv.org/html/2008.07142 ／ https://program.ismir2020.net/poster_1-04.html
- Rock Corpus（De Clercq & Temperley）：https://www.rockcorpus.midside.com/ ／ https://www.cambridge.org/core/journals/popular-music/article/abs/corpus-analysis-of-rock-harmony/C5210A8EC985DDF170B53124F4464DA4
- Six-based minor（de Clercq 2021 MTO 27.4）：https://mtosmt.org/issues/mto.21.27.4/mto.21.27.4.de_clercq.html
- CoCoPops（ISMIR2023）：https://archives.ismir.net/ismir2023/paper/000027.pdf ／ https://github.com/Computational-Cognitive-Musicology-Lab/CoCoPops ／ https://zenodo.org/records/10265267
- McGill Billboard：https://ddmal.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/

## 参照コード（file:line）
- 稼働DB選択：`apps/api/src/main.ts:13`
- MIDI音の拍化：`apps/api/src/music/midi.ts:75`
- pop句抽出＋アンカー：`apps/api/scripts/build-phrase-dict.ts:47-67`（特に L54, L64）
- 句分割・位相アンカー：`apps/api/src/music/phrase.ts:112-116`（行index返却）, `:121-155`（segmentByBars, origin L136 / fallback L137-140）
- key/bars 非保存：`apps/api/scripts/build-phrase-dict.ts:121`
- 進行のループ分割・長短分裂・断片：`apps/api/src/ingest-ufret.ts:62-85`（extractLoops）, `:135-155`（per-loop detectKeyFromChords）
- 先行監査（未修正記録）：`docs/research/2026-07-08-melody-chord-audit.md:33`
