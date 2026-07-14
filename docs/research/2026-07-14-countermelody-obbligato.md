# 対旋律・オブリガート（内声域の裏メロ）— 生成制約とテンプレ

- 日付: 2026-07-14
- 担当: 編曲（対旋律・オブリガート）調査
- 位置づけ: **既知（再調査不要）** ＝メロ×ベース（外声）の対位（反行優先／並行完全協和回避／b9 衝突回避）は調査・実装済。
  本ドキュメントの的は **内声域の裏メロ／オブリガート**（ストリングス・ギターオブリ・シンセカウンター・コーラスのウーアー）。
- 思想: 「機械は候補まで・仕上げは人間」。ここで作るのは**生成制約（ガードレール）＋様式テンプレ**であって、完成した対旋律ではない。

---

## 0. 用語と外声との違い

- **対旋律（countermelody）**＝主旋律と同時に鳴る、独立した輪郭・リズムを持つ従属的な第二の旋律線。単独で取り出しても旋律として成立するが、主を食わない範囲に抑える（[Grokipedia: Counter-melody](https://grokipedia.com/page/Counter-melody)、[Panman Music](https://www.panmanmusic.com/writing-countermelodies/)）。
- **オブリガート（obbligato）／フィル（fill）**＝主旋律の**休符・伸ばし**の隙間に差し込む短い旋律断片。「歌が黙ったら弾く」＝*What to play when your singer shuts up*（[GuitarPlayer](https://www.guitarplayer.com/lessons/guitar-fills-what-to-play-when-your-singer-shuts-up)）。
- 外声（ベース）との違い＝**内声域は主旋律と音域が近い**ため、①音域分離、②リズム相補、③ぶつかり回避 の3点が外声より厳しい。ベースは常時鳴ってよいが、内声対旋律は**出し入れ（density）が本質**。

---

## 1. 配置原理（いつ・どこで動くか）

対旋律の「間（ま）」の設計。3つの定石。

### 1-1. 主旋律の休符で動く（call & response / fill-in）
- 主が黙る＝対旋律の出番。**主旋律アクティブ↔対旋律アクティブ**を交互にして会話性（conversational quality）を作る（[Wisseloord Academy](https://wisseloord.org/academy/how-to-write-counter-melodies-and-harmonies)、[whattoknow.blog](https://whattoknow.blog/countermelodies-contrast-music)）。
- フィルの鉄則＝**"get in, play something hot, get out"**。主旋律に戻る前に必ず引く。長居しない（[Guitar World](https://www.guitarworld.com/acoustic-nation/fill-er-creating-guitar-melodies-between-vocal-lines)）。
- 実例: Little Wing（Hendrix）＝各小節末、歌のブレスの隙間にフィル。Rhiannon（Buckingham）＝サビの歌フレーズ間に A minor pentatonic フィル（[GuitarPlayer](https://www.guitarplayer.com/lessons/guitar-fills-what-to-play-when-your-singer-shuts-up)）。

### 1-2. 主旋律が動く時は長音（相補リズム／rhythmic complement）
- 主が細かく動く区間では、対旋律は**伸ばし or 疎**にして交通整理する。主が長音なら対旋律は細かく。**リズム密度を互い違いに**＝どちらか一方だけが忙しい状態を保つ（[MusicRadar](https://www.musicradar.com/news/practical-music-theory-use-motion-to-make-a-melody-and-bassline-complement-each-other)、[Toshi Clinch](https://www.toshiclinchproductions.com/melody-countermelody)）。
- 「主が忙しくなったら対旋律を引っ込めて散らからせない（dial back so things don't get cluttered）」（Wisseloord）。

### 1-3. 音域分離（register separation）
- 内声定石＝主旋律の**下3度〜10度**（ローカウンター）。近すぎ（同度〜長2度）は濁り、遠すぎ（2オクターブ超）は無関係に聞こえる。
- 上に置く場合は**ディスカント（descant）**＝主旋律の上を舞う高音対旋律（ゴスペル／賛美歌の伝統、ソプラノ上声）。サビのクライマックスで映える。
- 楽器の違いでも分離を作る＝音域が近くても音色差（ストリングス vs ボーカル）で分ける（Wisseloord「create separation through instrumentation」）。

---

## 2. 音選び（ピッチ）

### 2-1. コードトーン軸
- 拍頭・長音・フレーズ着地は**コードトーン（1-3-5-7）を基軸**。経過的に非和声音（passing / neighbor）を通す。ベース対位で既知の原則をそのまま内声にも適用。
- テンションは主旋律と衝突しない範囲で色付けに使う（9th/13th）。**b9 衝突は既知回避**（主旋律の音の半音上/下でぶつけない）。

### 2-2. 3度／6度平行の区間（harmonizing）
- 主旋律に**3度下 or 6度下で平行**＝最も甘く・自動的にまとまる区間。サビや盛り上げで多用。ただし全編平行は「ハモリ」であって対旋律ではない＝独立性が消えるので**部分的に使う**。
- 3度と6度は転回関係（3度↔6度）。声部が交差しそうなら切り替える。

### 2-3. 反行の区間（contrary motion）
- 独立性を出す主力＝**主が上れば対旋律は下る**。平行に飽きた区間・ブリッジ・フレーズの折り返しで反行に切り替え、「似すぎ」を防ぐ（[Medium: beginner's guide](https://medium.com/@NickEss/a-beginners-guide-to-counter-melodies-ebc5ae8b10cd)、whattoknow.blog）。
- 運用＝**平行（3/6度）で寄り添う区間 と 反行で独立する区間 を交互に**。これが「ハモリでなく対旋律」に聞こえる分水嶺。

### 2-4. ぶつかり回避（2度衝突の扱い）
- 主旋律と**同時発音で短2度/長2度**は原則避ける（内声は音域が近く濁りやすい）。
- 許容＝①経過音として**弱拍を素通り**（[MasterClass 種対位法](https://www.masterclass.com/articles/how-to-play-species-counterpoint)の不協和は弱拍・経過で解決）、②**サスペンション**として置いてすぐ解決（2-3 掛留）、③タイミングをずらして**同時に鳴らさない**（call & response 化）。
- 完全協和（P1/P5/P8）への**並行進行は回避**（既知＝外声規則を内声にも適用）。斜行・反行で入る。

---

## 3. 様式別テンプレ（3種＋α）

### 3-A. ストリングス・カウンター（ポップスの定番）
- 役割＝主旋律の**下 or 上でレガートに歌う第二の声**。長めのフレーズで「うねり」を作る。
- 動き＝主旋律の休符でスワーッと上行/下行スケール（run）、主旋律の長音で**サステインの pad 的支え**（[MusicRadar]）。
- ピッチ＝コードトーン軸＋3/6度平行と反行の交互。着地はコードの3rd/5thでレガート。
- 密度＝2回し目・Cメロ・ラスサビで投入。1番Aメロは出さないのが定番。

### 3-B. ギター・オブリ（ペンタ系フレーズ）
- 役割＝歌の隙間の**短いフィル**。R&B系（Curtis Mayfield / Steve Cropper 直系）の「数音のペンタ、リズム明快、完璧なフレージング」（[GuitarPlayer]）。
- ピッチ＝**コードに対応するペンタトニック**（例: Dコード上で D minor pentatonic＝Crazy Little Thing 的、または major pentatonic）。装飾＝チョーキング／ハンマリング／スライドで表情。
- 配置＝小節末・歌のブレス・フレーズ末尾。**入って弾いてすぐ抜ける**。長いソロにしない。
- 密度＝サビの歌間、または落ちサビ〜ラスサビで存在感を上げる。

### 3-C. シンセ・カウンター
- 役割＝ストリングスとギターの中間。**アルペジオ／シーケンス系**の反復フレーズ（motif）か、レガートの副旋律。
- ピッチ＝コードトーンのアルペジオを土台に、主旋律の休符で目立つ音形（フック的な数音の反復）。ディレイ/リバーブで隙間を埋める。
- 密度＝反復モチーフは**同一音形の繰り返し**が武器。ただし主旋律と密度が競合したら間引く。EDM/ボカロで多用。

### 3-D. コーラスのウーアー（vocal pad / ooh-aah）
- 役割＝**ハーモニーの床（bed）**。長い伸ばしで周波数帯を埋め、リードを座らせる。「シンセpad/B3オルガンと同じ役割」（[AirGigs Part 2](https://blog.airgigs.com/2017/02/the-anatomy-of-a-background-vocal-arrangement-part-2-bgvs/)、[iZotope](https://www.izotope.com/en/learn/recording-backing-vocals-to-bring-your-chorus-to-life)）。
- ピッチ＝コードトーンで**3〜4声のロングトーン**（sustained）。ほぼ動かない＝主旋律のリズムを邪魔しない。動くとしても全音符/2分音符。
- 母音＝静かで優しい所は「ウー（ooooh）」、力強い/高い所は「オー/アー（oh/aah）」（[iZotope]）。
- 密度＝**サビで投入**が定番。ただし2番のAやBメロに入れて「listener に留まる理由を作る」変化技も有効（[AirGigs Part 1](https://blog.airgigs.com/2016/11/the-anatomy-of-a-background-vocal-arrangement-part-1-harmonies/)）。

---

## 4. 出現密度（density）— 常時鳴らさない

対旋律／オブリの価値は**出し入れ**にある。常時鳴ると「うるさい・散らかる」。

- **段階投入**: 1番Aメロ＝無し → 1番サビ＝薄く → 2番＝要素追加 → 落ちサビ＝間引き → ラスサビ＝全部乗せ。
- **セクション限定**: サビだけ／2回し目から。ハモリ（BGV）も「多くの曲は verse に無く chorus で重ねる」（AirGigs Part 1）。
- **主旋律の情報量に反比例**: 歌が詰まっている所は引く。歌が空いた所で出す（§1-2）。
- **1曲を通じたアーク**: 対旋律は「盛り上げの燃料」。最初から全開だと後半で足す物が無くなる。

---

## 5. 仕様化（実装向け）

### 5-1. 生成制約リスト（優先度つき）

活性化の入力＝**主旋律のイベント列**（各ノートの onset/duration、休符区間）とコード進行。

| 優先度 | 規則 | 判定/トリガ |
|---|---|---|
| P0（絶対） | 同時発音の**短2度/長2度**を主旋律との間に作らない | 同一 onset 帯で `|pitchClass差| ∈ {1,2}` を禁止。回避不可なら発音をずらす（call&response化）or 3/6度へ寄せる |
| P0 | 完全協和（P1/P5/P8）への**並行進行**を作らない | 連続 onset で両声部が同方向かつ到達区間が P1/P5/P8 → 反行/斜行へ差し替え |
| P0 | **b9 衝突回避**（既知） | 主旋律音の短9度上/下にテンション音を置かない |
| P1 | **音域分離**: 主旋律の下3度〜10度（ロー）or 明確に上（ディスカント） | 対旋律 pitch を主旋律の移動平均から `-3..-10半音` 圏 or `+オクターブ` 圏にクランプ |
| P1 | **相補リズム**: 主が動く区間は対旋律を長音/休符、主の休符区間で対旋律を活性化 | 主旋律の density（単位時間ノート数）を窓で計測。high→対旋律は sustain/rest、rest→対旋律 active |
| P1 | 拍頭・長音・フレーズ着地は**コードトーン** | strong beat の対旋律 pitch ∈ chordTones。非和声音は弱拍の経過/刺繍のみ |
| P2 | **平行(3/6度)区間 と 反行区間 を交互に**（全編平行禁止） | 平行が N 音続いたら反行区間へ切替。ハモリ化を防ぐ |
| P2 | 非和声音は**弱拍で解決**（passing/neighbor/suspension） | 2度でぶつける場合は suspension として次で半音/全音解決 |
| P3 | **density の出し入れ**: セクション役割で活性化 | Aメロ1回目=off、chorus=on、2回し目で要素追加、落ちサビ=間引き（§4） |
| P3 | **フィルは短く**: get in / get out | オブリ様式では 1フレーズ長を主旋律休符長以内にクランプし、主旋律 re-entry で強制終了 |

### 5-2. 活性化アルゴリズム（骨子）
1. 主旋律を窓（例 1〜2拍）で走査し **rest 区間** と **sustain 区間** と **busy 区間** にラベル。
2. rest/sustain 区間＝**活性ゲート ON**（対旋律 or フィルを鳴らす候補）。busy 区間＝ゲート OFF（鳴らすなら長音のみ）。
3. 活性区間ごとに様式テンプレ（5-A〜D 相当）を割当。
4. ピッチは chordTone 軸→3/6度平行 or 反行を交互選択→音域クランプ→2度衝突チェック（P0）で棄却/再抽選。
5. section role で density マスクを掛ける（§4）。
6. **候補を複数（seed/様式/密度違い）出す**＝仕上げは人間（思想準拠）。

### 5-3. 失敗モード＝「うるさくなる」警告
- ❌ **常時鳴り**: 主旋律の busy 区間にも対旋律をフルで重ねる → 交通整理崩壊。→ 相補リズム(P1)で必ず間引く。
- ❌ **全編平行3度**: 独立性が消え「ハモリ」に。対旋律に聞こえない。→ 反行区間を混ぜる(P2)。
- ❌ **音域衝突**: 主旋律と同オクターブで動き回る → マスキング＆濁り。→ 下3度〜10度クランプ(P1)。
- ❌ **2度べったり**: 同時発音で2度が連続 → 濁り。→ P0で棄却、ずらす/寄せる。
- ❌ **フィルの長居**: オブリが主旋律の再入に食い込む → 主客転倒。→ 休符長クランプ+強制終了(P3)。
- ❌ **density の平坦**: 最初から全部乗せ → 後半で盛り上げる燃料切れ。→ 段階投入(§4)。

---

## 6. 度数表記の8小節サンプル3本

表記＝各拍のスケール度数（`b`=フラット、`-`=前音の伸ばし/タイ、`R`=休符）。想定キー Am（自然短調中心）、4/4。
主旋律（Melody）と対旋律（Counter）を対で並記。数字はコードに対する意味も添える。

### サンプル A — ストリングス・カウンター（下3〜6度、相補リズム）
主旋律は各小節前半で動き、後半で伸ばす想定。対旋律は主旋律の伸ばし（休符的空白）で run を入れる。
```
小節:      |1        |2        |3        |4        |5        |6        |7        |8        |
Chord:      Am        F         C         G         Am        F         Dm        E7
Melody:     5 5 3 -    4 4 1 -   3 3 1 -   2 2 7 -   5 5 3 -   4 4 6 -   6 6 4 -   3 2 #7 -
Counter:    - - 1 2    - - 6 5   - - 5 6   - - 5 4   - - 1 2   - - 1 2   - - 2 1   - - 5 -
```
- 狙い: 主が動く前半は Counter が休み（`-`）、主が伸ばす後半（3拍目〜）で Counter が3〜6度下を run。8小節目 E7 で Counter=5(=B) が導音 G#(=melody #7) と6度を保ち終止感。反行と平行の交互（2小節目 melody下行↔counter上行=反行、5小節目は平行）。

### サンプル B — ギター・オブリ（ペンタ・フィル、call & response）
主旋律はフレーズ→休符（`R`）の歌もの。Counter はその **R の所だけ** ペンタで数音差す。
```
小節:      |1        |2        |3        |4        |5        |6        |7        |8        |
Chord:      Am        Am        F         G         C         Am        Dm  E7     Am
Melody:     3 3 5 R    R 5 3 R   1 1 R R   2 R R R   3 3 1 R   R 1 3 R   4 R 5 R   1 - - R
Counter:    R R R 1    5 R R b7  R R 5 6   R 5 b7 1  R R R 5   3 R R 5   R b3 R b7  R R R 5
```
- 狙い: A minor pentatonic（1 b3 4 5 b7＝A C D E G）で **主旋律の R を埋める**。主が鳴る所は Counter=R（重ならない＝2度衝突ゼロ）。`b7`=G、`b3`=C の泣きの音でギターらしさ。フレーズは各休符長以内で完結（get in/get out）。8小節目は最後に1音だけ余韻。

### サンプル C — コーラス・ウーアー（ロングトーンpad、コードトーン3声想定）
サビ想定。Counter は各小節ほぼ動かないコードトーン（ここでは上声1本を度数で表記、実装は3〜4声）。
```
小節:      |1        |2        |3        |4        |5        |6        |7        |8        |
Chord:      C         G         Am        F         C         G         F    G     C
Melody:     5 3 5 1    2 7 2 5   3 1 3 5   6 4 6 1   5 3 5 1   2 7 2 5   6 4 5 -   3 - - -
Counter:    3 - - -    5 - - -   5 - - -   3 - - -   3 - - -   5 - - -   1 - 2 -   1 - - -
```
- 狙い: 主旋律が忙しく動く（8分主体）ので Counter は**全音符ロングトーン**＝相補リズムの極。Counter は各コードの3rd/5th（C→E=3, G→D=5, Am→E=5, F→A=3…）を保持し、声部が滑らかに動く（E→D→E→A の最小移動＝共通音優先）。母音は静かなら「ウー」、サビ頂点なら「アー」。7小節目でわずかに動いて終止を作る。

---

## 7. 設計含意（このリポジトリへの落とし方）

- **入力契約**: 対旋律生成器は「主旋律イベント列（onset/dur/pitch）＋コード進行＋section role」を受け、`rest/sustain/busy` ラベリング（§5-2）を第一段に置く。ここが外声（ベース）生成と決定的に違う所＝**主旋律の間（ま）に依存**。
- **既知資産の再利用**: 反行優先・並行完全協和回避・b9回避は外声実装から流用可（P0/P2）。内声固有の追加＝**音域クランプ（下3〜10度/ディスカント）** と **相補リズム・ゲート** と **density マスク**。
- **候補提示に徹する**: 様式（strings/guitar/synth/BGV）×seed×密度で複数出す。単一乱数・同一密度は誤判断の元（思想＝機械は候補まで）。
- **耳較正が必須**: 2度衝突・マスキング・「うるさい」は数値で完全には測れない。生成後は実音 I/O で試聴（modeを層またいで結線する原則と同様）。
- **メロ最優先の位置づけ**: 対旋律は主旋律（ユーザーの苦手）を**引き立てる**足場。主旋律を食う density は禁止。fill は「歌が黙ったら」だけ。

---

## 出典（URL）

- [Grokipedia — Counter-melody](https://grokipedia.com/page/Counter-melody)
- [Panman Music — How to Write Countermelody](https://www.panmanmusic.com/writing-countermelodies/)
- [Wisseloord Academy — How to write counter-melodies and harmonies](https://wisseloord.org/academy/how-to-write-counter-melodies-and-harmonies)
- [whattoknow.blog — Countermelodies in Music Explained](https://whattoknow.blog/countermelodies-contrast-music)
- [Medium (Nick) — A beginner's guide to counter-melodies](https://medium.com/@NickEss/a-beginners-guide-to-counter-melodies-ebc5ae8b10cd)
- [MusicRadar — Use motion to make a melody and bassline complement each other](https://www.musicradar.com/news/practical-music-theory-use-motion-to-make-a-melody-and-bassline-complement-each-other)
- [Toshi Clinch Productions — How To Craft Melodies & Countermelodies](https://www.toshiclinchproductions.com/melody-countermelody)
- [MasterClass — How to Play Species Counterpoint](https://www.masterclass.com/articles/how-to-play-species-counterpoint)
- [GuitarPlayer — Guitar Fills: What to Play When Your Singer Shuts Up](https://www.guitarplayer.com/lessons/guitar-fills-what-to-play-when-your-singer-shuts-up)
- [Guitar World — Creating Guitar Melodies Between Vocal Lines](https://www.guitarworld.com/acoustic-nation/fill-er-creating-guitar-melodies-between-vocal-lines)
- [Guitar Music Theory — Pentatonic Phrasing (Lead Guitar Unlocked Ch.8)](https://www.guitarmusictheory.com/lead-guitar-unlocked-chapter-8-pentatonic-phrasing/)
- [AirGigs — Anatomy of a Background Vocal Arrangement Part 1 (harmonies)](https://blog.airgigs.com/2016/11/the-anatomy-of-a-background-vocal-arrangement-part-1-harmonies/)
- [AirGigs — Anatomy of a Background Vocal Arrangement Part 2 (BGVs)](https://blog.airgigs.com/2017/02/the-anatomy-of-a-background-vocal-arrangement-part-2-bgvs/)
- [iZotope — Recording Backing Vocals to Bring Your Chorus to Life](https://www.izotope.com/en/learn/recording-backing-vocals-to-bring-your-chorus-to-life)
