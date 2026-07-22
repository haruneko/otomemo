# ギター系コード楽器の奏法語彙（ストラム／アルペジオ／カッティング）をMIDIで再現する定石

- 日付: 2026-07-22
- 目的: 「雑なコード名列のメモでも、ギターを選ぶとギターらしく鳴る」を実現するための外部調査。
  現状 chord_pattern は **block（＝mode:"strum" だが実体は全声部同時発音）／arp** しか無く、
  GM SF2 のギター音色で鳴らしても「ピアノの和音をギター音色で鳴らした」感になる。
  この文書はその是正に必要な**奏法定石（ボイシング・ストラム型・ダウン/アップ差・カッティング・ギター的アルペジオ）**を
  一般定石（度数×リズム型）として棚卸しし、最後に本プロダクトへの設計含意を書く。
- 前提となる現行実装: `apps/web/src/music.ts` の `ChordPatternContent`（`mode:"strum"|"arp"`, `voicing`, `steps`, `hits`, `program`）、
  `voiceChord()`/`voiceToTop()`（コード品質→MIDIノート集合をレンダ時に導出）、
  feel 層 `applyFeelEnsemble()`（humanize/swing）。backlog.md L322「ストラム時間展開（じゃら〜ん）」が本件の入口。

---

## 0. スコープと feel 層との線引き（最重要）

タイミングに関わる要素を3層に切り分ける。**本研究は下記(B)まで。(C)は既存の feel 層の担当。**

- **(A) 奏法そのもの＝ノートの選び方**（ボイシング／どの弦を鳴らすか／音の並び順・弦数）
  → **生成/レンダの奏法モデルの担当。本研究の主対象。**
- **(B) ストラムの弦またぎ時差（ロール＝じゃら〜ん）**：ダウン/アップで弦が数〜数十ms ずれて鳴る。
  これは**「1回の打弦の中で6声が時間差で立ち上がる」＝奏法の一部**であり、拍そのものの揺れではない。
  → **本研究のスコープ（chord_pattern の resolve が導出する）。** backlog L322 の指摘通り「resolveChordPattern 出力は導出なので契約安全」。
- **(C) 拍の微揺らぎ／スイング／ヒューマナイズ**（打点そのものを ±ms 動かす、裏拍を後ろへ、ベロシティ揺らぎ）
  → **既存 `applyFeelEnsemble()`（feel 層）の担当。二重にやらない。**

線引きの実務ルール：
- ストラムの「弦順ロール」は**発音順序が決定的（低→高 or 高→低）**で、コード内の各声に**固定の相対オフセット**を与えるもの。
  → 奏法モデルが `note.t` に決定的オフセットを書く（seed に依らない）。
- feel の humanize は**各打点に乱数的な微小オフセット**を足すもの（seed 依存・OFFで消える）。
  → ロールの上にさらに feel が乗る（合成順：奏法ロールを先に確定 → その集合に feel を適用）。
- ベロシティも同様に二段：奏法（ダウン>アップ、アクセント拍）で基準を決め、feel が微揺らぎを足す。

出典: MIDI ストラムの時差=奏法という扱いは各社 MIDI-strum ツールの共通実装（[x42 MIDI Strum](https://x42.github.io/midifilter.lv2/http___gareus_org_oss_lv2_midifilter_midistrum.html), [Strum Roll / LDM](https://isotonikstudios.com/product/strum-roll/)）。

---

## 1. ボイシングの物理制約（コード品質 → 弦ごとの度数配置 → MIDIノート集合）

### 1.1 物理制約の要点
- ギターは**6弦・標準チューニング**で、押さえられるのは概ね**4フレット幅**。ゆえに鍵盤のような任意のクローズドボイシングは組めず、
  **開放弦・オクターブ重複・度数の飛び**が必然的に混ざる。結果として**同じコードでも「根音や5度が複数オクターブで重複」「3度は1つだけ・高め」**という
  特徴的な音の分布になる。これが「ピアノ和音との違い」の物理的な源。
- 標準チューニング開放弦の MIDI ノート（低→高、6→1弦）:
  **E2=40, A2=45, D3=50, G3=55, B3=59, E4=64**（4弦↔3弦だけ長3度・他は完全4度）。
- 「弦をまたいで同度数が重なる」「隣接弦が4度/3度」というこの不均一さが、ギターらしい**開いた響き＋根音の厚み**を生む。
  出典: 開放弦・バレー・パワーコードの区分は [The American Guitar Academy: Open/Barre/Power/Drop](https://www.theamericanguitaracademy.com/post/open-barre-power-drop-understanding-chord-types-on-the-guitar), [Wikipedia: Open chord](https://en.wikipedia.org/wiki/Open_chord), [Wikipedia: Bar chord](https://en.wikipedia.org/wiki/Bar_chord)。

### 1.2 定石ボイシング（度数配置 → 具体 MIDI ノート集合）

弦は **6(低E)→1(高E)** の順。`X`=ミュート（鳴らさない）。度数 R=根音 / 3=長3度 / b3=短3度 / 5=完全5度 / R'=オクターブ上根音。

**開放弦型（オープンコード）** — 明るく開いた響き。根音/5度が2〜3個重複し3度は1個。

| コード | フレット | 弦ごとの度数(6→1) | MIDIノート集合 |
|---|---|---|---|
| E  | 022100 | R 5 R 3 5 R | 40,47,52,56,59,64 |
| Em | 022000 | R 5 R b3 5 R | 40,47,52,55,59,64 |
| A  | X02220 | – R 5 R 3 5 | 45,52,57,61,64 |
| Am | X02210 | – R 5 R b3 5 | 45,52,57,60,64 |
| C  | X32010 | – R 3 5 R 3 | 48,52,55,60,64 |
| G  | 320003 | R 3 5 R 5 R'| 43,47,50,55,59,67 |
| D  | XX0232 | – – R 5 R 3 | 50,57,62,66 |
| Dm | XX0231 | – – R 5 R b3 | 50,57,62,65 |

要点：**低音側は必ず根音**（＝ベース感）、**3度は1つだけ・中〜高域に1個**（3度を重ねると濁るため定石は3度を薄く）、**5度と根音のオクターブ重複が厚みを作る**。
GM 再現ではキー別の開放弦感まで追わなくてよく、「根音を最低声部に置き、3度は1つ、5度/根音を重ねる」という度数分布さえ守ればギターらしくなる。

**バレー型（可動フォーム）** — どのキーでも同じ度数分布で平行移動。開放弦の代わりに全弦を押さえる。

- **E-shape（根音＝6弦）**: 度数(6→1) = **R 5 R 3 5 R**（マイナーは 3→b3）。6弦フル。例 F: 41,48,53,57,60,65。
- **A-shape（根音＝5弦, 6弦ミュート）**: 度数(5→1) = **R 5 R 3 5**（マイナーは 3→b3）。例 Bb: 46,53,58,62,65。
  出典: [Wikipedia: Bar chord](https://en.wikipedia.org/wiki/Bar_chord)（E-shape=バレーした開放E、A-shape=X13331・6弦は指で軽く触れてミュート）。

**パワーコード（5 / no-3rd）** — ロック/歪み向け。**3度を省く**＝R+5(+R')のみ。歪んでも濁らない。

- 2音: 度数 **R 5**（隣接2弦, 例 6/5弦 E5 = 40,47）。
- 3音: 度数 **R 5 R'**（例 40,47,52）。GM の Overdrive/Distortion で刻む時はこれ一択。
  出典: [The American Guitar Academy: Open/Barre/Power/Drop](https://www.theamericanguitaracademy.com/post/open-barre-power-drop-understanding-chord-types-on-the-guitar)。

**省略形（voicing の間引き定石）**
- **3度抜き**＝パワーコード（上記）。
- **根音抜き（rootless）**＝バンドでベースが根音を担うとき上物が3度・5度・7度だけを鳴らす。ジャズ/ファンクのコンピングで多用。
  出典: [Applied Guitar Theory: Chord Voicings](https://appliedguitartheory.com/lessons/chord-voicings-for-guitar/)（5度は機能が弱く省略の第一候補、rootless の例）。
- **上3弦トライアド／シェルボイシング**＝カッティングでは6声フルでなく**高音側3〜4弦だけ**を鳴らすのが定石（後述4章）。

### 1.3 現行 `voiceToTop()` との差分（ここがギターらしさの欠落点）
現行は「top 狙い音に最寄りのコードトーンを最高声部に置き、残りを**その直下に密に積む**」＝**鍵盤的クローズドボイシング**。
ギター化には、①**最低声部を根音に固定**、②**3度は1個・中高域**、③**根音/5度をオクターブ重複**、④弦チューニング由来の**4度/3度飛び**、を反映する必要がある。

---

## 2. ストラムパターン型辞書（16分グリッド譜・10〜15型）

記譜: 16分グリッドを `1 e & a  2 e & a  3 e & a  4 e & a`（16マス）で表す。
記号 **D**=ダウン / **U**=アップ / **d**=弱ダウン / **u**=弱アップ / **X**=ミュート打（ゴースト/チャック） / **·**=手は振るが弦に当てない（空振り＝発音なし） / **–**=8分などマス無し。
`>` を頭に付けたマスはアクセント（強拍）。**「手は止めず常に上下運動」**が全型共通の原則（[JustinGuitar](https://www.justinguitar.com/guitar-lessons/ups-to-the-all-down-16ths-b2-906), [Guitar Lobby](https://www.guitarlobby.com/guitar-strumming-patterns/)）。

| # | 型名 | ジャンル/テンポ帯 | グリッド(16分, 1 e & a ×4) | 備考 |
|---|---|---|---|
| 1 | 4つ打ちダウン | ロック/バラード土台・遅〜中 | `D · · ·  D · · ·  D · · ·  D · · ·` | 全部ダウン四分。最も硬派・安定 |
| 2 | 8分オールダウン | ロック刻み・中速 | `D · D ·  D · D ·  D · D ·  D · D ·` | 全ダウン8分＝パンク/ハードロックの推進 |
| 3 | 8分ダウンアップ | ポップ/フォーク・中速 | `D · U ·  D · U ·  D · U ·  D · U ·` | 連続8分の基本。裏をアップ |
| 4 | フォーク定番 | フォーク/弾き語り・中速 | `D · D U  · U D U` (8分×4拍を DDU·UDU 展開) | 通称 "D-DU-UDU"。最頻出の万能型 |
| 5 | アルティメット/バラード | 弾き語りバラード・中速 | `D · · U  · U D U` | 2拍目頭を抜く（休符の間）。エモい |
| 6 | 16分オールダウン | ドライブ感の遅め曲 | `D · D ·  D · D ·` を16分全ダウンに=`D D D D ...` | 全16分ダウン＝重い推進（速度限界あり） |
| 7 | 16分オールダウン+アップ補完 | 速い曲の16分維持 | `D u D u  D u D u  D u D u  D u D u` | ダウンの間にアップを挿し16分を埋める（[JustinGuitar B2-906]） |
| 8 | 16ポップ | ポップ/R&B・中速 | `D · D U  · U · U  D · D U  · U · U` | 16分の混合。跳ねさせるとネオソウル |
| 9 | 16ファンク・カッティング | ファンク・中〜速 | `>X u X u  >D u X u  >X u X u  >D u X u` | 大半ゴースト、要所で実コード（4章）。チキンスクラッチ |
| 10 | ファンク・シンコペ | ファンク/ディスコ・速 | `X X D u  X >U X X  X D X u  >U X X X` | Nile Rodgers 型の16分チャンク |
| 11 | レゲエ/スカ・スキャンク | レゲエ・中速 | `· · >D ·  · · >D ·  · · >D ·  · · >D ·` | 裏拍(&)だけを短くアップ気味に切る |
| 12 | シャッフル/ブルース | ブルース・中速(3連) | `D · U  D · U  D · U  D · U`（3連グリッド） | 8分3連の1・3を弾く跳ね。※3連は12/8グリッド |
| 13 | バラード分散（アルペジオ寄り） | バラード・遅 | 6章のアルペジオへ（ストラムせず分散） | 低速では分散に切替が定石 |
| 14 | パワーコード刻み | ロック/メタル・速 | `D D D D  D D D D  D D D D  D D D D` | パワーコード＋全16分ダウン＋ブリッジミュート |
| 15 | 8ビート・バックビート強調 | ポップロック・中速 | `D · U ·  >D · U ·  D · U ·  >D · U ·` | 2・4拍にアクセント（スネアに同期） |

出典: [Guitar Lobby: 10 Essential Strumming Patterns](https://www.guitarlobby.com/guitar-strumming-patterns/), [Music2Me: Strumming Patterns](https://music2me.com/en/magazine/guitar-strumming-patterns), [The American Guitar Academy: Most Common Strumming Patterns](https://www.theamericanguitaracademy.com/post/the-most-common-guitar-strumming-patterns-every-player-should-know), [JustinGuitar: Ups To The All Down (16ths)](https://www.justinguitar.com/guitar-lessons/ups-to-the-all-down-16ths-b2-906)。

---

## 3. ダウン/アップの音響差の MIDI 再現（弦順ロール・弦数・ベロシティ）

打弦1回＝コード内の各声を**時間差で立ち上げる**（＝2章各Dの1マスは、内部で数声のロールに展開される）。

### 3.1 弦順（ロールの向き）
- **ダウン(D)** = ピックが**低音弦→高音弦**（6→1弦）に降りる ⇒ **低い声から順に発音**。
- **アップ(U)** = **高音弦→低音弦**（1→6弦）⇒ **高い声から順に発音**。
  出典: [KVR: Emulating the Up and Down Strum](https://www.kvraudio.com/forum/viewtopic.php?t=252387), [x42 MIDI Strum](https://x42.github.io/midifilter.lv2/http___gareus_org_oss_lv2_midifilter_midistrum.html)。

### 3.2 弦またぎ時差（ms 相場）
- **1弦あたり 5〜30ms**。標準は **10ms/弦**（6弦フルで約 50ms＝5間隔）。
  出典: [Strum Roll / LDM](https://isotonikstudios.com/product/strum-roll/)（各弦=前弦から N ms 後）、[x42 MIDI Strum]。
- テンポ帯での相場（実装目安）:
  - 速い刻み/ファンク・カッティング: **5〜12ms/弦**（ほぼ同時に近い、タイト）。
  - 中速ストローク: **10〜18ms/弦**。
  - バラードの「じゃら〜ん」: **20〜35ms/弦**（大きく開く）。
- **アップはダウンより速い（時差が小さめ）**傾向＝実演の手の返しが速いため。ダウン比 0.6〜0.8 倍が自然。

### 3.3 鳴らす弦数（アップは減る）
- **ダウン＝全弦（4〜6声）**、**アップ＝上側の3〜4弦だけ**が定石（アップで低音弦まで完全に届かない実演を模す）。
  ⇒ MIDI では**アップ時にボイシング下位1〜2声を落とす**。これがダウン/アップの音色差の主因の一つ。
  出典: [KVR: Emulating the Up and Down Strum], [Ableton Forum: realistic guitar via MIDI](https://forum.ableton.com/viewtopic.php?t=234213)。

### 3.4 ベロシティ差
- **ダウン > アップ**：アップは概ね **ダウンの 0.7〜0.85 倍**。
- **アクセント拍**（2章の `>`）はさらに +10〜20（本プロダクト既存語彙なら `CHORD_ACCENT=112` 相当）。
- 各弦内でも±数の微揺らぎ（＝これは feel 層の humanize に委ねる。奏法側は基準値だけ）。
  出典: [Strum Roll / LDM](https://isotonikstudios.com/product/strum-roll/)（velocity randomization）, [x42 MIDI Strum]。

### 3.5 パラメータ相場まとめ（実装デフォルト案）
| パラメータ | ダウン | アップ |
|---|---|---|
| 弦順 | 低→高 | 高→低 |
| 時差/弦 | 10ms（5〜35で可変） | 8ms（ダウンの ~0.75×） |
| 鳴らす声数 | 全声(4〜6) | 上位3〜4声 |
| ベロシティ基準 | 100 | 78（~0.78×） |
| アクセント時 | +12（→112） | +12 |

---

## 4. カッティング／ブラッシング（ゴースト／ミュート打）

- **チャック/ゴースト打（記号 X）**＝弦を鳴らすが左手/右手で消音し**ピッチのない「チャッ」**。16分グリッドを**手を止めず**埋め、
  実コードは要所にだけ置く（2章 #9,#10）。ファンクの「チキンスクラッチ」（Jimmy Nolen）、洗練形が Nile Rodgers。
  出典: [GuitarWiz: Muted Strums & Ghost Strumming](https://guitarwiz.app/articles/muted-strums-ghost-strumming-guitar/), [TrueFire: 16th Note Funk Exercises](https://blog.truefire.com/guitar-lessons/10-minute-16th-note-guitar-exercises-for-funk/), [London Guitar Academy: Mastering Funk Guitar](https://www.londonguitaracademy.com/mastering-funk-guitar)。

### MIDI での置き方
- **短い dur**：ゴースト打は**1step 未満相当の極短ノート**（実装なら dur を最小＝16分の 1/2〜1/4、`dur:1` の更に短縮 or 専用フラグ）。
- **低ベロシティ**：実コードの **0.3〜0.5 倍**（本プロダクトなら `CHORD_SOFT=64` より更に低い 30〜50）。
- **ピッチ**：GM ではピッチレス表現が難しいので二択 —
  (a) 実コードと同じ度数を極短・極弱で鳴らす（近似）、
  (b) ミュート音色/専用ノート（GM に「ギターの pizzicato/mute」は無いので (a) が現実的）。
- **配置**：16分の空きマスをゴーストで埋め、アクセントマスに実コード（強ダウン）を置く＝「疎密の対比」がグルーヴの本体。
- **ブリッジミュート（パワーコード刻み #14）**：右手を弦に軽く乗せ**dur を短め＋ベロシティ中**（ゴーストほど弱くない・ピッチは残す）。歪み音色で刻む。

---

## 5. ギター的アルペジオ（ピアノ arp との差）

ピアノ arp＝単純な音階的巡回（現行 `arpDir` up/down/updown + `arpOctaves` 駆け上がり）。
ギターの指弾きは**弦の物理配置に紐づく型**で、以下が定石。

### 5.1 p-i-m-a（右手指）由来の型
- 記譜: **p**=親指(低音弦=根音/ベース) / **i**=人差指(4弦付近) / **m**=中指(3弦付近) / **a**=薬指(1弦付近)。
  出典: [Guitar Noise: Basic Travis Picking](https://www.guitarnoise.com/lessons/basic-travis-finger-picking/), [ICMP: 5 Fingerpicking Patterns](https://icmp-elevate.com/5-fingerpicking-patterns-a-guitarist-should-know), [The American Guitar Academy: Fingerstyle Patterns](https://www.theamericanguitaracademy.com/post/the-most-common-fingerstyle-patterns-every-guitar-player-should-know)。

### 5.2 具体パターン（コード内声を「弦index」で巡回）
声を低→高で `[0]=最低(根音)…[n]=最高` と番号付けし、8分/16分グリッドで弦を選ぶ。

- **基本上行アルペジオ**: `p i m a`＝`[0][k][m][top]`（低音から上へ、pは常に根音）。
- **上行下行(往復)**: `p i m a m i`＝山型。ピアノ updown に近いが**pが根音固定**な点が違う。
- **トラビス・ピッキング（オルタネート・ベース）**: 親指が**低音弦2本(根音↔5度)を交互**に刻み続け、その間に i/m が上弦で裏拍を足す。
  型: `p(R) i  p(5) m  p(R) i  p(5) m`（＝ベースが1・3拍と2・4拍で根音/5度を往復）。カントリー/フォークの土台。
  出典: [Guitar Noise: Travis Picking], [SoundGuitarLessons: Travis Picking Patterns](https://www.soundguitarlessons.com/blog/Top-4-Fingerpicking-Guitar-Patterns-Travis-Picking-Style)。
- **ベース保持＋上3弦ループ**: 最低声(根音)を**長く保持（サステイン）**しつつ、上位3声を `i m a` でループ。＝バラードの定番。
  MIDI: `[0]` を長い dur で1回、`[k][m][top]` を各拍で反復。
- **アルペジオ・ロール（かき鳴らしに近い分散）**: 全声を高速に順次（数十ms差）＝3章のストラム・ロールの極端に遅い版。

### 5.3 ピアノ arp との実装的差分（要点）
1. **最低声＝常に根音**（ピアノ arp は単に音階最下位）。
2. **ベース声部の保持/オルタネート**（親指の独立ライン）＝上物ループと別リズム。
3. **弦の物理隣接**＝任意跳躍でなく隣接弦中心の音形（4度/3度の飛びを含む）。
4. 立ち上がりに**弦のピッキング・ノイズ的アタック**があるが GM では velocity で近似。

---

## 6. 設計含意（本プロダクトへの落とし込み）

### 6.1 chord_pattern に「楽器モード（piano/guitar）」を持たせるべきか — **持たせる（voicingStyle）**
- 現行 `voicing` は鍵盤的（top 狙い＋直下に密積み）。**楽器の別＝ボイシング規則の別**なので、
  `voicing` に **`style?: "keyboard" | "guitar"`（既定 "keyboard"）** を追加するのが素直。
  - `"keyboard"`＝現行 `voiceToTop`（不変）。
  - `"guitar"`＝新規 `voiceGuitar`（最低声=根音、3度1個、根音/5度重複、弦チューニング準拠の度数分布、パワーコード/rootless対応）。
- `mode` は現状 `"strum"|"arp"`。**"strum" の実体は「全声同時=block」**なので、
  ロール展開は mode を増やすより **`voicing.style:"guitar"` かつ strum 時に弦順ロールを付与**する方が既存語彙を壊さない。
  （将来 `mode:"cutting"` 等を足す余地は残す。）

### 6.2 ストラム時差／ボイシング変換をどの層に置くか — **レンダ時（resolve）に置く**
- 現行アーキは **chord_pattern＝保存スペック（mode/voicing/hits）／実音は `voiceChord` がレンダ時に導出**。
  ボイシング変換（keyboard→guitar）も**同じレンダ層（`voiceChord`/新 `voiceGuitar`）**で行う＝保存データは度数抽象のまま、
  楽器を切り替えると鳴りだけ変わる（＝メモの可搬性を保つ）。
- **ストラムの弦順ロール（弦またぎ時差）もレンダ層で導出**＝各 hit を、ボイシング声数ぶんの微小オフセット付きノート群に展開。
  backlog L322「resolveChordPattern 出力は導出なので契約安全」と一致。保存 hits は `{step,dur,vel?}` のまま増やさない。
- **層の順序**（合成）: `voiceGuitar`（声の選定）→ ストラム・ロール展開（決定的な弦順オフセット・ダウン/アップの声数/vel差）→ **その上に feel 層**（`applyFeelEnsemble` の humanize/swing）。
  奏法の決定的オフセットと feel の乱数オフセットは加算合成。二重掛けしない（feel はロール後の集合に一様適用）。

### 6.3 既定OFF＝bit一致の原則との整合 — **守れる**
- 追加パラメータはすべて**既定で現行と同一出力**にする:
  - `voicing.style` 既定 `"keyboard"` ⇒ 未指定は `voiceToTop` そのまま＝**deepStrictEqual/バイト一致**。
  - ストラム・ロール既定 **0ms・全声同時・vel均一** ⇒ 既存 strum(block) と一致。ロールは `strumMs>0` で初めて発火。
  - ダウン/アップの声数間引き・vel差は、方向情報（hit に `dir?` or パターン型）が**明示された時だけ**適用。未指定は全声・均一。
  - ゴースト打は新フラグ（例 `hit.ghost` or 極小 dur+専用 vel）で表現＝既存 hits には現れない。
- これにより **arpOctaves/arpReset と同じ「ノブ既定0でOFF＝旧ネタは1bitも変わらない」方針**を踏襲できる。

### 6.4 実装の縦スライス順（推奨）
1. `voiceGuitar`（度数分布のギター化・パワーコード/rootless）＝耳で一番効く。既定OFFで bit 一致テスト先行。
2. ストラム弦順ロール（`strumMs`・ダウン/アップ方向・声数/vel差）＝レンダ層で hit→ノート群展開。
3. ストラム型辞書（2章）をプリセット化（chord_pattern の hits＋dir＋ghost の並びとして）＝UI から選ぶ。
4. ギター的アルペジオ型（5章）＝arp の弦順選択規則として追加（既存 arpDir/arpOctaves と併存）。
5. カッティング/ゴースト＝短dur+低velの hit 種別。

---

## 出典一覧
- [The American Guitar Academy: Open, Barre, Power, Drop](https://www.theamericanguitaracademy.com/post/open-barre-power-drop-understanding-chord-types-on-the-guitar)
- [The American Guitar Academy: Most Common Strumming Patterns](https://www.theamericanguitaracademy.com/post/the-most-common-guitar-strumming-patterns-every-player-should-know)
- [The American Guitar Academy: Most Common Fingerstyle Patterns](https://www.theamericanguitaracademy.com/post/the-most-common-fingerstyle-patterns-every-guitar-player-should-know)
- [Wikipedia: Open chord](https://en.wikipedia.org/wiki/Open_chord)
- [Wikipedia: Bar chord](https://en.wikipedia.org/wiki/Bar_chord)
- [Applied Guitar Theory: Chord Voicings for Guitar](https://appliedguitartheory.com/lessons/chord-voicings-for-guitar/)
- [Guitar-chord.org: Voicings](https://www.guitar-chord.org/voicings.html)
- [Guitar Lobby: 10 Essential Guitar Strumming Patterns](https://www.guitarlobby.com/guitar-strumming-patterns/)
- [Music2Me: Guitar Strumming Patterns](https://music2me.com/en/magazine/guitar-strumming-patterns)
- [JustinGuitar: Ups To The All Down (16ths)](https://www.justinguitar.com/guitar-lessons/ups-to-the-all-down-16ths-b2-906)
- [x42 MIDI Strum (LV2)](https://x42.github.io/midifilter.lv2/http___gareus_org_oss_lv2_midifilter_midistrum.html)
- [Strum Roll by LDM / Isotonik](https://isotonikstudios.com/product/strum-roll/)
- [KVR: Emulating the Up and Down Strum](https://www.kvraudio.com/forum/viewtopic.php?t=252387)
- [Ableton Forum: realistic guitar sound via MIDI](https://forum.ableton.com/viewtopic.php?t=234213)
- [GuitarWiz: Muted Strums and Ghost Strumming](https://guitarwiz.app/articles/muted-strums-ghost-strumming-guitar/)
- [TrueFire: 10-Minute 16th Note Guitar Exercises for Funk](https://blog.truefire.com/guitar-lessons/10-minute-16th-note-guitar-exercises-for-funk/)
- [London Guitar Academy: Mastering Funk Guitar](https://www.londonguitaracademy.com/mastering-funk-guitar)
- [Guitar Noise: Basic Travis Finger Picking](https://www.guitarnoise.com/lessons/basic-travis-finger-picking/)
- [ICMP: 5 Essential Fingerpicking Patterns](https://icmp-elevate.com/5-fingerpicking-patterns-a-guitarist-should-know)
- [SoundGuitarLessons: Top 4 Fingerpicking Patterns (Travis)](https://www.soundguitarlessons.com/blog/Top-4-Fingerpicking-Guitar-Patterns-Travis-Picking-Style)
