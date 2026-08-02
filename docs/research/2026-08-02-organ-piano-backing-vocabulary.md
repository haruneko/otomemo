# エレキオルガン（ハモンド系）とピアノの「奏法に沿ったバッキング」語彙

外部調査（2026-08-02）。機械生成のパターン語彙表に使うための、ジャンル別バッキング構造の整理。
**他者楽曲のリテラルな旋律・フレーズの採譜は含めない**（型・統計・一般語彙のみ）。

## 設計含意（5行）

1. オルガンとピアノは**発音モデルが根本的に違う**（オルガン＝velocity無効・音量はCC11、ピアノ＝velocity層が命）＝生成パラメータ空間を楽器別に分けるべき。
2. バッキング型は「**リズム型 × ボイシング傾向 × 左右の役割 × 奏法要素**」の4軸で正規化できる＝語彙表のスキーマはこの4軸＋MIDI再現ヒントで持つ。
3. オルガンの表情は音符でなく**コC（CC11スウェル・Leslie速度切替・ドローバー登録）で作る**＝ノート生成だけでなくCCイベント生成が語彙の一部。
4. ピアノ側はジャンルごとに「型の名前」（アルベルティ／ブロック／シンコペコンピング等）が確立している＝型名を第一級の語彙IDにしてよい。
5. 白玉パッド（オルガン）と分散和音（ピアノ）は**同じコード進行から両方生成できる**＝共通の和声入力→楽器別レンダラという構造が自然。

---

## 1. 楽器の基礎特性（生成の前提）

### 1.1 ハモンド系オルガン

- **velocity非感応**。打鍵の強さは音量に影響しない。音量・表情は**スウェル（エクスプレッション）ペダル＝CC11**で作る（[Keyboard expression - Wikipedia](https://en.wikipedia.org/wiki/Keyboard_expression)）。
- **ドローバー（9本）**＝倍音の足し算で音色を作る。表記は「888000000」のような9桁（16', 5-1/3', 8', 4', 2-2/3', 2', 1-3/5', 1-1/3', 1'）（[Wicked Keys: Beginner's Guide to Drawbars](https://wickedkeys.com.au/blogs/news/shaping-authentic-hammond-organ-sounds-a-beginner-s-guide-to-drawbars)）。
- **パーカッション**（2nd/3rd倍音のアタック付加）＝シングルトリガー：レガートで弾くと最初の音にしかアタックが付かない→打ち込みでも「切ってから弾く音」にだけパーカッションが乗る。
- **Leslie（回転スピーカー）**＝slow(コラール)/fast(トレモロ)の2速切替が表情の要。DAWではモッドホイールやCCでオートメーション（[BookerLAB: MIDI for Leslie Speakers](https://bookerlab.com/2019/04/29/midi-for-leslie-speakers/)、[Apple Community: B-3 Leslie Speed Control](https://discussions.apple.com/thread/6667122)）。
- 2段鍵盤：**上鍵盤＝リード/コンプ、下鍵盤＝コンプ/ベース**が典型（[PianoGroove: Comping on the Hammond Organ](https://www.pianogroove.com/blues-piano-lessons/comping-hammond-organ/)）。

### 1.2 ピアノ

- **velocity感応**＝ダイナミクスの主軸。全ノート同velocityは即「打ち込み臭」（[MusicRadar: realistic programmed piano](https://www.musicradar.com/tuition/tech/how-to-make-a-programmed-piano-part-sound-more-realistic-632299)）。
- **サステインペダル（CC64）**でコード間を滑らかに接続。ノート終端を次ノートに僅かに重ねるのも有効（[Soundtrap: Adding Realism to MIDI](https://blog.soundtrap.com/adding-realism-to-midi/)）。
- バンド内では**左手はベーシストと衝突しない**よう簡素化。ソロ/弾き語りでは左手の自由度が上がる（[Yamaha: Pop/Rock Chord Voicings](https://hub.yamaha.com/keyboards/k-how-to/poprock-voicings-part-1/)）。

---

## 2. 奏法要素の語彙（楽器別プリミティブ）

### 2.1 オルガン

| 語彙ID | 内容 | 構造 | MIDI再現要点 |
|---|---|---|---|
| `organ_pad` | 白玉パッド | 全音符〜2分でコードを保持。声部はなめらかに共通音保持（no-lift） | ノートを隙間なく（次コードへ重ね気味に）。CC11で山なりのスウェル。Leslie=slow |
| `organ_stab` | スタブ／ショット | 裏拍・シンコペ位置に短いコード打ち。ホーンセクション的 | dur 60–120ms程度の短ゲート。パーカッションon（音間を切るとアタックが立つ） |
| `organ_gliss` | グリッサンド／スメア | 手のひらで鍵盤を掃く上昇（下降）。セクション頭やフィルに | 半音階の高速連続ノート（20–40ms間隔）を目標コードトーンに着地させる |
| `organ_shake` | シェイク（トレモロ的揺すり） | コードの上で隣接音を高速交互 | 2音の高速交互（32分相当）。長い白玉の終盤の飾りに |
| `organ_lh_bass` | 左手ウォーキングベース | 下鍵盤で4分のウォーキング、ペダルはアタック補強 | 4分レガート気味・登録は 868000000/888000000 系（Jimmy Smith流。[NY Jazz Workshop](https://newyorkjazzworkshop.com/jimmy-smith/)、[Organ Freak: Jazz Organ Bass Tips](https://www.organfreak.com/bass.html)） |
| `organ_drawbar` | ドローバー登録の切替 | 曲想でプリセット切替（音色語彙） | 例：バラード=008000000（丸い）、明るいポップ=8300000378、ファンクショット=888611348 系、ジャズ=888000000+3rdパーカッション（[Wicked Keys](https://wickedkeys.com.au/blogs/news/shaping-authentic-hammond-organ-sounds-a-beginner-s-guide-to-drawbars)、[Hammond Today: Drawbar Settings](https://www.hammondtoday.com/category/drawbar-settings/)） |
| `organ_leslie_swell` | Leslie速度切替＋スウェル | サビ前でfastへ→戻す。盛り上げの定石 | CC(モッド割当)で slow→fast をセクション境界で切替。CC11をクレッシェンドと連動 |
| `organ_punch` | パンチコード（ゴスペル） | 高音域でのシンコペした短いコード挿し。長めはシェイク併用 | 上鍵盤高域・短ゲート・裏拍。（[Wikipedia: Preaching chords](https://en.wikipedia.org/wiki/Preaching_chords)） |

### 2.2 ピアノ

| 語彙ID | 内容 | 構造 | MIDI再現要点 |
|---|---|---|---|
| `piano_block` | ブロックコード刻み | 右手三和音を4分/8分で均等打ち。ポップの基本（[8notes: Rock and Pop Piano](https://www.8notes.com/school/lessons/piano/funk_pattern1.asp)系列教材） | スタッカート気味（dur 50–70%）だと軽快、レガートだと重厚。vel は拍頭>裏 |
| `piano_alberti` | アルベルティバス | 分散和音を「低-高-中-高」順で8分/16分（[Wikipedia: Alberti bass](https://en.wikipedia.org/wiki/Alberti_bass)、[Baylor Piano Basics](https://openbooks.library.baylor.edu/pianobasics/chapter/accompaniment-styles-broken-chord-alberti-bass-and-waltz-bass/)） | 左手・均一寄りvelで滑らかに。クラシック～レトロポップ調 |
| `piano_arp` | アルペジオ／流れる分散 | 低→高へ広く分散。バラードの主役型 | CC64踏みっぱなし区間で。velは上行で漸増、頂点で山 |
| `piano_oct_pulse` | オクターブ連打（左手） | 左手オクターブを4分/8分で刻み、右手ブロックと組む＝ロックの推進力（[Cooper Piano: 10 Piano Rhythm Patterns](https://cooperpiano.com/10-piano-rhythm-patterns-for-popular-genres/)） | vel高め(90–110)・dur短め。8分は表拍やや強 |
| `piano_sync_comp` | シンコペコンピング | 裏拍・アンティシペーション主体の短いコード。ジャズ/ファンク | 拍のわずか後ろ（behind the beat）が効く。休符が語彙の一部 |
| `piano_funk_16th` | 16分スタブ（ファンク） | 右手の刺すような16分コード＋左手はドラム的リフ（[8notes: Funk Pattern](https://www.8notes.com/school/lessons/piano/funk_pattern1.asp)） | 16分をジャスト〜やや後ろ。ゴーストは vel 30–50、アクセント 100+ |
| `piano_waltz` | ワルツバス | 「ベース-和音-和音」の3拍型（[Baylor Piano Basics](https://openbooks.library.baylor.edu/pianobasics/chapter/accompaniment-styles-broken-chord-alberti-bass-and-waltz-bass/)） | 1拍目ベース強・2,3拍和音弱 |
| `piano_gospel_walk` | ゴスペル・ウォークダウン/アップ | 左手のI-V往復や経過音つきベース＋右手厚いボイシング（[PianoWithJonny: Gospel Piano Chords and Walking Bass](https://pianowithjonny.com/piano-lessons/gospel-piano-chords-and-walking-bass/)） | 経過音は短め・目標和音で長く。CC64は和音単位で踏み替え |

---

## 3. ジャンル別の型（リズム型 × ボイシング × 左右 × 奏法）

語彙表スキーマ：`{genre, instrument, rhythm, voicing, lh_role, rh_role, elements[], midi_hints}`

### 3.1 ロック

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| ピアノ | 4分/8分の均等刻み。推進力重視 | 右手トライアド（転回で音域を保つ）、テンションは薄め | 左=オクターブ連打、右=ブロック | `piano_block`+`piano_oct_pulse` |
| オルガン | 白玉パッド主体＋セクション頭のグリス | 密集トライアド〜add9。歪み前提で音数少なめ | 右=パッド/スタブ、左=（バンド内では）休みかルート補強 | `organ_pad`+`organ_gliss`+`organ_leslie_swell` |

MIDI: ピアノは vel 90–110・タイト（クオンタイズ強め）。オルガンはサビで Leslie fast＋CC11 上げが定石。
（[Cooper Piano](https://cooperpiano.com/10-piano-rhythm-patterns-for-popular-genres/)、[Yamaha: Pop/Rock Voicings](https://hub.yamaha.com/keyboards/k-how-to/poprock-voicings-part-1/)）

### 3.2 ポップス

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| ピアノ | 8分刻み or 「4分＋裏の抜き」。スタッカート気味で軽快 | トライアド中心＋add9/sus。C-G-Am-F 型の定番進行と好相性 | 左=ルート/5度の白玉 or オクターブ、右=刻み | `piano_block`（軽め）+`piano_arp`（Bメロ等で切替） |
| オルガン | 白玉パッド（薄く敷く）。存在感が要る所だけ明るい登録 | 上声3〜4音・トップノートを旋律的に動かす | 右=パッド、左=休み | `organ_pad`+`organ_drawbar`（8300000378系の明るい登録） |

MIDI: ピアノは dur 50–70% のスタッカート気味が「軽さ」の正体。オルガンパッドは vel 一定・CC11 で強弱。
（[Cooper Piano](https://cooperpiano.com/10-piano-rhythm-patterns-for-popular-genres/)、[Wicked Keys](https://wickedkeys.com.au/blogs/news/shaping-authentic-hammond-organ-sounds-a-beginner-s-guide-to-drawbars)）

### 3.3 ファンク

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| ピアノ/クラビ系 | 16分主体・休符とゴーストが本体。「やや後ろ」のレイドバック | 7th/9thの4度堆積や狭い3–4音。短く刺す | 左=ドラム的リフ（1音リフ/オクターブ）、右=16分スタブ | `piano_funk_16th`+`piano_sync_comp` |
| オルガン | 裏拍ショット＋要所のグリス。ホーン的な「shots」 | 密集4音・高め音域。パーカッションonで輪郭 | 右=スタブ、左=ベースかルート打ち | `organ_stab`+`organ_gliss`、登録=888611348系（Tower of Power系shots。[Hammond Today](https://www.hammondtoday.com/category/drawbar-settings/)） |

MIDI: 16分の behind-the-beat（+5〜15ms 程度後ろ）とゴーストノート（vel 30–50）が命。スタブは dur 60–100ms。
（[8notes: Funk Pattern](https://www.8notes.com/school/lessons/piano/funk_pattern1.asp)、[PianoGroove: Blues Comping Patterns](https://www.pianogroove.com/blues-piano-lessons/blues-comping-patterns-rhythms/)）

### 3.4 ソウル／R&B

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| オルガン | 「敷き（白玉）と挿し（スタブ）」の二層運用。12小節ブルース由来の型が基層 | 温かい中域中心。サステインを活かした保持 | 右=パッド/リフ的コンプ、左=補助 | `organ_pad`+`organ_stab`+`organ_shake`（Stax系＝B-3が主役の編成。[Wikipedia: Green Onions](https://en.wikipedia.org/wiki/Green_Onions)、[Stax Records](https://staxrecords.com/number-ones/green-onions-booker-t-mgs/)） |
| ピアノ | 8分〜16分のゆったりシンコペ。ゴスペル由来の経過和音 | 7th/9th厚め・右手は密集上声 | 左=I-V往復や経過音つきベース、右=コンプ | `piano_gospel_walk`+`piano_sync_comp` |

MIDI: オルガンは共通音を切らずに保持（no-liftパッド。[Hear and Play: Organ Worship Basics](https://hearandplay.com/main/organ-worship-basics-chords/)）。ピアノ経過音は短ゲート・目標和音で解放。

### 3.5 ジャズ（オルガントリオ含む）

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| ピアノ | 裏拍・アンティシペーション中心の疎なコンピング。「置かない」勇気 | シェル（3rd+7th）〜ルートレス4音。両手ボイシングも（[PianoWithJonny: Jazz Piano Comping With Two Hand Voicings](https://pianowithjonny.com/piano-lessons/jazz-piano-comping-with-two-hand-voicings/)） | 左=シェル、右=旋律 or 上声拡張 | `piano_sync_comp` |
| オルガン | 左手=4分ウォーキングベース＋右手=グルーヴに沿ったコンプ。ペダルはアタック補強（アップテンポ時） | 下鍵盤 868000000/888000000 でベースとコンプ兼用 | 左=ベース、右=コンプ/ソロ | `organ_lh_bass`+`organ_stab`、3rdパーカッションon（[NY Jazz Workshop: Jimmy Smith](https://newyorkjazzworkshop.com/jimmy-smith/)、[PianoGroove: Hammond Comping](https://www.pianogroove.com/blues-piano-lessons/comping-hammond-organ/)） |

MIDI: ウォーキングは4分レガート（dur 90–100%）・velほぼ一定。コンプは拍のわずか後ろ・スイング比はテンポ依存（速いほど1:1に近づく）。

### 3.6 バラード

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| ピアノ | 白玉＋流れるアルペジオの併用。小節内で密度を波打たせる | 開離（左=ルート+5度or10度、右=3音）。トップを歌わせる | 左=ロングトーン or 分散、右=アルペジオ/和音 | `piano_arp`+`piano_block`（サビで厚く） |
| オルガン | 全編白玉パッド。コード変化点だけ声部移動 | 丸い登録（008000000系）・狭い中域 | 右=パッド、左=低音補強（薄く） | `organ_pad`+`organ_leslie_swell`（Leslie=slow基調、クライマックスのみfast） |

MIDI: ピアノは CC64 をコード単位で踏み替え・vel 40–75 の狭いレンジ・クオンタイズ50–70%で揺らす。オルガンは CC11 のロングスウェルがフレーズの呼吸。
（[Cooper Piano](https://cooperpiano.com/10-piano-rhythm-patterns-for-popular-genres/)、[Soundtrap](https://blog.soundtrap.com/adding-realism-to-midi/)）

### 3.7 ゴスペル／ワーシップ（ソウルの母体として）

| 楽器 | リズム型 | ボイシング | 左手/右手 | 主要素 |
|---|---|---|---|---|
| オルガン | no-liftの白玉パッド＋高域パンチコード。歌い手に追従（テンポ可変前提） | 厚い密集＋共通音保持。「finger crawl」（指替えで切らず動く） | 右=パッド/パンチ、左=I-Vベース | `organ_pad`+`organ_punch`+`organ_shake`（[Hear and Play: Organ Worship Basics](https://hearandplay.com/main/organ-worship-basics-chords/)、[Wikipedia: Preaching chords](https://en.wikipedia.org/wiki/Preaching_chords)） |
| ピアノ | 経過和音の多い8分・堂々としたウォーク | 7th/9th/11thの厚いボイシング | 左=ウォーキング/I-V、右=厚い和音 | `piano_gospel_walk`（[PianoWithJonny](https://pianowithjonny.com/piano-lessons/gospel-piano-chords-and-walking-bass/)） |

---

## 4. MIDI打ち込み再現の一般則（横断）

| 項目 | オルガン | ピアノ |
|---|---|---|
| velocity | **無意味（音源側で無視 or 一定に）**。表情はCC11 | 主軸。パターン内で拍頭>裏、フレーズ単位で山を作る。全ノート同値は禁物 |
| デュレーション | パッド=100%+（重ね気味）／スタブ=60–120ms。**音を切る/つなぐ自体が語彙**（パーカッションのリトリガー制御） | 型で決まる：スタッカート刻み50–70%、レガート90–100%＋CC64 |
| タイミング | パッドはジャストでよい（音量変化はCC）。スタブ・グリスはグルーヴ依存 | クオンタイズ50–70%で残す・ファンク系は16分をやや後ろへ・コード構成音を1–10ms散らす（完全同時を避ける） |
| CC | CC11（スウェル）＝常時使う。Leslie速度＝モッド等に割当てセクション境界で切替 | CC64（サステイン）をコード単位で踏み替え。CC11は通常不要 |
| 音色 | ドローバー登録がパッチの一部＝語彙に登録文字列を持たせる | velocity層の多い音源前提（層が浅いと表情が頭打ち） |

（[MusicRadar](https://www.musicradar.com/tuition/tech/how-to-make-a-programmed-piano-part-sound-more-realistic-632299)、[Soundtrap](https://blog.soundtrap.com/adding-realism-to-midi/)、[Unison: How to Humanize MIDI](https://unison.audio/how-to-humanize-midi/)、[Keyboard expression - Wikipedia](https://en.wikipedia.org/wiki/Keyboard_expression)、[BookerLAB](https://bookerlab.com/2019/04/29/midi-for-leslie-speakers/)）

---

## 5. 出典一覧

- Hammond/ドローバー・奏法
  - https://wickedkeys.com.au/blogs/news/shaping-authentic-hammond-organ-sounds-a-beginner-s-guide-to-drawbars （ドローバー登録の様式別例）
  - https://www.hammondtoday.com/category/drawbar-settings/ （様式別登録集：ファンクshots等）
  - https://www.pianogroove.com/blues-piano-lessons/comping-hammond-organ/ （B3コンピング：下鍵盤運用）
  - https://berkleepress.com/keyboard/hammond-organ-complete-tunes-tones-and-techniques-for-drawbar-keyboards/ （Berklee: Hammond Organ Complete＝ジャンル横断の体系教本）
  - https://newyorkjazzworkshop.com/jimmy-smith/ ・ https://www.organfreak.com/bass.html （左手ベース＋右手コンプの分業、868000000系登録）
  - https://en.wikipedia.org/wiki/Green_Onions ・ https://staxrecords.com/number-ones/green-onions-booker-t-mgs/ （ソウル/R&BにおけるB-3の役割）
  - https://hearandplay.com/main/organ-worship-basics-chords/ （no-liftパッド・finger crawl・I-Vベース）
  - https://en.wikipedia.org/wiki/Preaching_chords （パンチコード・シェイク／トレモロ）
- ピアノ型
  - https://cooperpiano.com/10-piano-rhythm-patterns-for-popular-genres/ （ジャンル別リズムパターン概観）
  - https://www.8notes.com/school/lessons/piano/funk_pattern1.asp （ファンク：右手スタブ＋左手リフ）
  - https://hub.yamaha.com/keyboards/k-how-to/poprock-voicings-part-1/ （ポップ/ロックのボイシングとバンド内の役割）
  - https://en.wikipedia.org/wiki/Alberti_bass ・ https://openbooks.library.baylor.edu/pianobasics/chapter/accompaniment-styles-broken-chord-alberti-bass-and-waltz-bass/ （アルベルティ/ブロークン/ワルツバスの定義）
  - https://pianowithjonny.com/piano-lessons/jazz-piano-comping-with-two-hand-voicings/ （ジャズ両手ボイシング）
  - https://pianowithjonny.com/piano-lessons/gospel-piano-chords-and-walking-bass/ （ゴスペルのウォーキング）
  - https://www.pianogroove.com/blues-piano-lessons/blues-comping-patterns-rhythms/ （ブルースコンピングのリズム型）
- MIDI再現
  - https://www.musicradar.com/tuition/tech/how-to-make-a-programmed-piano-part-sound-more-realistic-632299 （ピアノ打ち込みの velocity/timing）
  - https://blog.soundtrap.com/adding-realism-to-midi/ ・ https://unison.audio/how-to-humanize-midi/ （ヒューマナイズ一般則）
  - https://en.wikipedia.org/wiki/Keyboard_expression （オルガンはvelocity非感応＝スウェルで表情）
  - https://bookerlab.com/2019/04/29/midi-for-leslie-speakers/ ・ https://discussions.apple.com/thread/6667122 （Leslie速度のMIDI/オートメーション）
