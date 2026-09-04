# phrase_maker ベース側の音楽知識 棚卸し（M3移植の前提調査）

**作成: 2026-09-04。方法: `~/projects/phrase_maker` の実コード・ACCEPTANCE/LISTEN/STRESS・docs（CONCEPT/GAP-AUDIT/HANDOFF-NEXT）を全部読んで事実ベースで記録。実装は一切していない（調査のみ）。**
文脈：phrase_maker 取り込みアーク（ドラム=M2 完了、次=M3 ベース）。「向こうに何があり、こちら（otomemo genBass）に何が無いか」を確定させる。
比較先＝`apps/api/src/music/generate.ts` の `genBass`（1118行〜）・`apps/api/src/music/bassLibrary.ts`・`docs/design.md`「gen_bass×ドラム結線」・`docs/drafts/2026-08-20-phrasemaker-recipe-io-map.md` ベース列。

**教訓の適用（bodyfill 事故の再発防止）**：本稿では「デモ/パイプラインから呼ばれていない」ことと「移植対象でない」ことを峻別する。呼ばれ方は §1 の各行に明記し、死にコード認定は一切しない。

---

## 0. 全体地図（ベース系は3実験＋派生、約4,700行）

phrase_maker のベース知識は3系統＋共有インフラに分かれる。行数は実測（venv除く）。

| 系統 | 場所 | 実装行数(py) | 検証 |
|---|---|---|---|
| ロックリフ（本体） | `experiments/bass_rock_riff/` | 863 | ACCEPTANCE **PASS** |
| ├ コード追従 | `bass_rock_riff/chords/` | 962 | ACCEPTANCE **PASS**（独立再計測・意地悪12進行） |
| ├ 敵対ファズ | `bass_rock_riff/stress/` | 584 | 600+ケース・INV1〜6 全通過 |
| ウォーキング v1/v2/v3 | `experiments/bass_walking/`（+v2/v3） | 762+800+1046 | v1/v2=ACCEPTANCE PASS、**v3=LISTEN のみ**（独立検証なし） |
| 特殊奏法（articulation） | `experiments/bass_expression/` | 822 | ACCEPTANCE は **E1 FAIL**→後日コードで修正済（§5参照） |
| 合奏配線（錨と間の分業の完成形） | `experiments/ensemble/ensemble.py`（bass部分） | 抜粋 | 耳GO（HANDOFF-NEXT §1「ロックとても良い」） |

全系統とも**外部コーパス不使用**：ルール・文法・コストは全部手書き（POP909/GMD/TheSession の隔離データはピアノ/ドラム側の話で、ベース系には1バイトも入っていない）。リテラル音列の著作権問題は無い。

決定論：全系統 md5 シード（builtin `hash()` 禁止が取り決め）・別プロセス/`PYTHONHASHSEED=random` でも **MIDI バイト一致**を独立検証済み（walking W7=36/36、stress INV6=sha256一致）。→ ドラムM2でやった「Python と 246/246 データ一致」方式は**そのまま使える**（§4）。

---

## 1. モジュールごとの棚卸し（何を解いているか）

### 1-1. bass_rock_riff（ロックリフ＝「錨と間の分業」の原型）

| ファイル | 行 | 解いている問題 | 呼ばれ方 |
|---|---|---|---|
| `riff.py` | 120 | **リフ構文（grammar）**：1〜2小節オスティナートを「(16分step, kind, degree, anchor, role)」のタプル列で記述。型は3種＝pedal_answer（ルートペダル＋ペンタ答句）・gallop_pedal（ギャロップ＋ブルーノート＋半音クライム）・octave_call_response（オクターブ跳びの呼応）。**拍頭 head は anchor フラグ＝発散でも壊さない**。kind=accent/note/ghost/dead が音価ゲート（0.92/0.85/0.42/0.35）とvelを規定 | main.py・chords・ensemble から現役 |
| `fretboard.py` | 70 | **4弦ベース指板の状態空間モデル**：pitch→(弦,フレット)の1対多逆写像・遷移コスト＝フレット移動1.0/弦跨ぎ1.4/4フレット超ポジション移動+2.0/開放弦-0.3/ハイポジ微ペナルティ。負エッジ回避の下限0.02（Dijkstra対策、コメントに経緯明記）`fretboard.py:42-66` | 全ベース系が共有（walking/expression も import） |
| `graph_line.py` | 46 | **運指ソルバ**：音列→各音の可能状態を層にした DAG を Dijkstra 最短路＝「最も楽な運指」を出すと同時に**物理的に弾けることの証明**になる（解が無ければ弾けない） | 全候補の validate で現役 |
| `theory.py` | 65 | **リフの語彙**：マイナーペンタ＋blue b5＋b7＋oct、傘スケール=ナチュラルマイナー。クロマチックは「次音への半音接近」だけ許す（`is_in_key` が chromatic-approach を経過音として注記・OUT-OF-SCALE と区別）。`root_low` が E/A ルートを開放弦へ落とす設計（＝運指グラフが開放弦ペダルを"創発"する仕掛け）`theory.py:39-44` | 現役 |
| `subfeel.py` | 61 | **リズムの器**：feel（straight8/gallop/halftime）×テンポ×**キックパターン**×palm_gate（パームミュートの詰まり）を束ねる。ドラム床（kick+backbeat+hat）も出してキックロックを可聴化 | 現役 |
| `diverge.py` | 87 | **発散ノブ（理屈⑤）**：リズム骨格と head anchor を固定し、非anchor の 'note' の**ピッチだけ**を段階的に動かす。knob 0..1 で「動く音の数」が入れ子部分集合で単調増加、帯域で手段がエスカレート（低=オクターブ移送/中=コードトーン再選択/高=blue・box shift）。**語彙外へは絶対に出ない**＝発散しても調外0・演奏可能を保証（ACCEPTANCE §6 で単調性を実測確認） | 現役 |
| `generate.py` | 83 | オーケストレーション＋ablation（naive vs 理屈）＋検証（調外/経過音/演奏不能） | 現役 |
| `naive.py` | 34 | ablation の対照＝ストレート8分＋スケール内ランダム（意図的な「凡庸の藁人形」）。**移植対象ではないが「何と比べて価値を主張しているか」の定義そのもの** | 現役（対照専用） |
| `humanize.py` | 24 | kind別ベロシティ（accent114/note92/ghost42/dead30）＋±10msタイミング＋音価ジッタ。seed付き | 現役 |
| `render.py` | 124 | MIDI/WAV/タブ譜出力 | 現役 |

### 1-2. bass_rock_riff/chords（コード追従＝進行の上でリフを生かす）

| ファイル | 行 | 解いている問題 |
|---|---|---|
| `chord_follow.py` | 355 | **リフのリズム骨格を固定したままピッチだけ進行へ再写像**。5つのガード＝①強拍/head は必ずコードトーン（`_nearest_chord_tone` スナップ）②弱拍はその区間のスケール内 or 半音接近のみ③**区間末の自由onsetを次コードルートへの接近音に retarget**（`apply_boundaries`/`resolve_approaches`＝発散の**後**に解決させる順序設計）④全音を指板ソルバで証明⑤リフ骨格の反復保存（`riff_repetition`=1.0）。発散はコードスコープ（現コードトーン内 reselect のみ） |
| `chords_theory.py` | 290 | **広語彙コードモデル（25クオリティ）**：maj/min/dim/aug/7系/6系/9-11-13/alt(7b9,7#9,7#5,7b5)/sus/add9/power＋**分数コード**（bass音を追加アンカー扱い）。各クオリティに「コードトーン＋整合スケール」を持ち、リフの5度族/blue度数を**そのコードの実際の5度へ**ルーティング（aug/dim でも衝突しない）。絶対ルート＝グローバルキー不要＝借用/転調は「別ルートのコード」として自然に通る |
| `stress/fuzz.py`+`oracle.py` | 584 | **敵対ファズ**：25クオリティ×全12ルート×tempo40-260×和声リズム0.25〜4小節/コード×2〜16コード＋意地悪14本を600+ケース。**独立オラクル**（実装のコード表を信用せず自前のtextbook表・ブルース免罪符なし）で INV1〜6 判定。INV6=バイト決定論 |

検証：BREAKAGE.md「incidents: None」＋独立 ACCEPTANCE が意地悪進行（二次ドミナント C E7 Am Ab G7・Am圏→Cm圏転調・1拍1コード）まで**強拍CT 100%/未解決調外0/演奏不能0/境界接近全d=1/リフ反復1.0**を自前再計測で確認。

### 1-3. bass_walking（ウォーキング＝v1→v2→v3 の弁証法。**v3が知識の核**）

3版とも同じ機械不変条件（W1 区間頭=ルート・W2 チェンジ直前拍=次ルートへ≤2半音接近・W4 未解決調外0・W5 演奏可能・W7 決定論）を保ち、**「弾けるが凡庸↔面白いが乱暴」の間を耳フィードバックで3往復した記録**になっている：

- **v1（walking.py 233行）**＝順次進行最適化（平均音程1.56・跳躍0）。機械は全PASS（ACCEPTANCE）だが**耳で「ウォーキング感が無い」却下**＝「機械満点≠音楽的正しさ」の実証例。
- **v2（walking_v2.py 235行）**＝アウトライン再建：コードトーンを**跳躍で**渡り歩き、ガイドトーン（3rd/7th）を縫い、オクターブ級のアーチ。ACCEPTANCE PASS だが**耳で「乱暴・理論から遠い禁則っぽい跳び」却下**（トライトーン跳躍・M7跳躍・同方向大跳躍の連続が出ていた＝LISTEN 実測 FORB 最大20/進行）。
- **v3（walking_v3.py 328行）**＝**跳躍の合法化（voice-leading etiquette）**：
  - 禁則音程のハード禁止（トライトーン6半音・長7度11・オクターブ超）、短7度は最終手段のみ、オクターブは稀 `walking_v3.py:76-78`
  - **跳躍後の回復則**＝4度以上（≥5半音）の跳躍の次は順次進行 or 小さい反行。同方向大跳躍の連続（compound leap）は禁止
  - voice economy＝跳躍は原則「最寄りのコードトーン」・3度〜6度帯。小節に1拍だけ意図的な「アーチ」（〜6度/oct）を許し、回復則で引き戻す
  - **7→3 ガイドライン**＝区間内で 3rd（ルート直後）と 7th（小節後半）を縫い、7th を次コードの 3rd の近くに置いて小節線を跨いで順次解決
  - 結果（LISTEN 実測）：FORB=0・平均音程 2.5〜4.0（v1=1.5とv2=5.8の中間）・recov 100%近辺。**ただし v3 は ACCEPTANCE.md が無い＝独立機械検証は未実施**（LISTEN の self-report のみ。耳の最終判定の記録も見当たらない）。
- `metrics.py`/`metrics_v2/v3` ＝ W指標＋跳躍品質指標（forbidden数・回復率・compound数・7→3解決率・スパン）の**自己申告メトリクス群（pass/failは決めない）**。v3 の跳躍品質メトリクス自体が「良いウォーキングとは何か」の操作的定義＝知識。
- `progressions.py`（58行）＝ジャズ定番＋意地悪の9進行バッテリ（ii-V-I・リズムチェンジ・F blues・五度圏・枯葉・altered/slash/modal）。テスト資産として価値。
- GAP-AUDIT G11：walking は**自由 `--chords` 入口が無い**（能力あり口なし）＝ライブラリとしては任意進行対応済み。

### 1-4. bass_expression（特殊奏法＝MIDIレベルの articulation）

| ファイル | 行 | 解いている問題 |
|---|---|---|
| `engine.py` | 293 | **素のラインに奏法を後付けする層**（ピッチ/リズム骨格は不変）：①スライド＝ピッチベンドのランプ（2〜7半音・**同一弦で両端が押さえられる時だけ**・強拍着地優先・小節1回まで）②ハンマリング/プリング＝同一弦レガート重なり＋打点低vel（×0.55）③デッド/ゴースト＝拍直前の空き16分に低vel(28)ミュート打ち④**密度上限 0.40**（規則的・慣用的な配置＝E5）。配置は全てグリッド位置駆動＝決定論 |
| `fret.py` | 40 | 自己完結の指板ミニモデル＝`common_strings`（両端が同一弦で押さえられるか）＝スライド/ハンマの物理前提 |
| `sources.py` | 89 | 入力ライン（rock_riff の out/ 再読込＋デモ2本）。**既存MIDIを読み込んで着彩する**入出力契約が確立している点が重要 |
| `render.py` | 175 | RPN でベンドレンジ設定（FluidSynth が同時刻CCを並べ替えて RPN を落とす罠への時差挿入 `engine.py:_rpn_bend_range`）＋**書き出し後の .mid を生イベント順で再パースする E1 検証**（`render.py:57 reparse_bend_report`） |

検証の経緯（地雷候補・§5）：独立 ACCEPTANCE は **E1（ベンドが必ず0に戻る）FAIL** を検出した——pretty_midi が同一tickのベンドを値昇順で書き出すため、上昇スライドのリセット0が消えて**+5半音ハングが1.8秒残る**という書き出し時バグ。その後コード側は修正済み（`engine.py` の PEAK_LEAD/RESET_LEAD/BEND_TICK_GAP 定数＋自己検証を「書き出し前 in-memory」から「書き出し後再パース」へ移行、main.py:44-57 が target_stuck を headline に集計）。**ただし ACCEPTANCE.md は FAIL 版のまま更新されていない**＝再検証の記録が無い。

### 1-5. ensemble.py の bass 部分（分業の完成形・耳GO済み）

- `_lock_bass_roots_to_sheet`（`ensemble.py:1111`）＝**共有リズム譜（RhythmSpec）のキック step ごとに必ずルート錨を置く**決定的アルゴリズム。3分岐＝(a) grammar onset が既にルート級→音域そのまま head 昇格（オクターブ往復を殺さない）(b) 非ルート→**ロック優先**＝元ピッチに最も近いレジスタのルートへ上書き（輪郭保存）(c) 休符 step→低域ルートを新規挿入（opt-in でシンコペ裏キックはベース無音＝キック単独）。コードは step 粒度で読む（1拍1コードでも stale root 無し）。RNG/hash 不使用と docstring に明記。
- 錨の**間**は grammar のリフ本体（octave/answer/pedal/ghost…）が無傷で生きる＝**「錨（キック直結・決定的）と間（リフ文法）の分業」**。6/8 は `_sheet_line`（`ensemble.py:1372`）＝錨＋figureセル＋境界アプローチの純関数版。
- 耳の判定（HANDOFF-NEXT）：kick_on_bass 0.25→1.0 で「ロックとても良い」「ベースまあまあ」。残課題として「ベースの4/4リフ強化（grammar+lock で半分生存）・fill×riff・変位の自動生成」が向こうの未着手リストに残っている。

---

## 2. 音楽知識の抽出（理屈として何を主張しているか／otomemo に無いもの）

phrase_maker のベースが主張する理屈を1行ずつに圧縮すると：

1. **指板の物理から「弾ける動き」を出す**（fretboard+graph_line）——pitch→(弦,fret) の1対多と遷移コストの最短路が (a) 演奏可能性の証明 (b) 開放弦ペダル等のイディオムの創発 (c) 手癖に無い動きの源、を同時に与える。CONCEPT.md の芯（「身体性シミュレータ」）のベース実装。**otomemo に該当物ゼロ**（genBass は音域窓 33..48 のクランプのみ＝「音域内」は保証するが「運指として弾ける・楽」の概念が無い）。
2. **リフ＝構文（grammar）＋anchor**——リフは「音の列」でなく「役割付き骨格」。head は不可侵、発散は非anchorのピッチのみ。→「フックが発散で壊れない」ことが構造で保証される。otomemo の bassLibrary 33型は**度数×格子の静的辞書**であり、anchor/role/発散の概念が無い（型は差し替え・実現のみ）。
3. **錨と間の分業**——キック step には決定的にルート錨、間にはリフ文法。otomemo の kickLock との違いは §3 で詳述。
4. **コード追従は「骨格固定・ピッチ再写像」**——強拍=コードトーン強制・弱拍=区間スケール・**境界=接近音を発散の後に解決**・広語彙25クオリティ＋分数。意地悪進行（転調・二次ドミナント・1拍1コード）で破綻ゼロを敵対ファズ+独立オラクルで証明済み。otomemo の approach ノブは確率的に1音を弄るだけ・コードのクオリティ別スケール整合の概念は無い（root/5度/octしか使わない）。
5. **ウォーキング＝声部進行の作法**——区間頭ルート・≤2半音の境界接近・そして v3 の核心＝**跳躍の合法性**（禁則音程・跳躍後回復・compound禁止・7→3ガイドライン）。v1→v2→v3 の履歴自体が「順次だけでは歩かない・跳ぶだけでは乱暴」という**負の知識2つ**を含む。otomemo に walking は存在しない（bassLibrary にもジャズ型は無い）。
6. **奏法レイヤー＝ピッチ/リズム不変の着彩**——スライド/ハンマ/ゴーストを物理前提（同一弦）と慣用配置（強拍着地・密度上限0.40）で。otomemo の bass notes は **velocity 未対応**（design.md も「ゴーストは vel 追加が先行条件」と明記）＝この層は丸ごと無い。
7. **ablation で価値を測る**——naive 対照＋機械メトリクス（診断であって報酬にしない）＋最終は耳。otomemo の評価思想（E-rule/耳）と整合的。

otomemo に**無い**知識＝上記 1・4（広語彙整合スケール）・5・6。部分的に有る＝2（辞書はあるが構文でない）・3（確率ロックはあるが分業でない）。

## 3. otomemo genBass との重なり（移植不要なもの／kickLock vs 分業の違い）

### 既にあって移植不要（同等機能）

| 機能 | otomemo | phrase_maker | 判定 |
|---|---|---|---|
| ジャンル型格子 | bassLibrary 33型（6ジャンル・度数×16/12格子・tempo/role フィルタ・fill型） | riff grammar 3種 | **otomemo の方が広い**。移植不要（ただし「anchor/role」注記は将来足せる） |
| スネアゲート | snareGap（スネア頭で dur を切る） | （明示的な同等物なし） | otomemo 固有・維持 |
| 分数コードの低音 | slashBass（アンカーを chord.bass へ） | chords_theory の slash（bass を追加アンカー） | 同等。移植不要 |
| セクション末フィル | fill ノブ＋cue 連動（M2で結線済み） | （bass fill は未実装＝向こうの残課題4「fill×riff」） | otomemo が先行 |
| feel（swing/humanize） | buildFeel 共通契約 | humanize.py | 同等（B1裁定＝ノリは演奏レイヤー・phrase_maker 値の採否は別論点） |
| 相対パターン/skeleton | relative content・skeleton 表面化 | 該当なし | otomemo 固有・維持 |
| 6/8 | compound 一級（12格子・world68） | core.Meter＋_sheet_line（walking は 6/8 非対応=G7） | ほぼ同等 |

### kickLock と「錨と間の分業」の違い（本題）

| 観点 | otomemo kickLock（generate.ts:1206-1247） | phrase_maker `_lock_bass_roots_to_sheet` |
|---|---|---|
| キックとの結合 | **確率的**：各キック step を `rng.next() < kickLock` で採用（上限0.85＝完全ユニゾンは実測非実在の安全弁）。onset **集合を作ってから**ピッチを決める | **決定的**：全キック step に必ずルート錨（opt-in でシンコペ裏の休符キックだけ免除）。実測で kick_on_bass 1.0 |
| キック間の音 | R/5度/oct を重み付き**ランダム選択**（bias.busy で裏8分を確率追加） | **grammar リフ本体が無傷で生きる**（octave往復・answer句・ghost・pickup＝役割付き音列）。リフの「フック」が反復保存される |
| 既存音との関係 | onset 列を新規生成（fig 経路とは排他） | 既存 grammar onset を **keep/上書き/挿入の3分岐**で編集＝輪郭・レジスタを保存（最寄りレジスタのルートへ） |
| コード読み | 拍粒度 chordAt | **step 粒度** chord_at（1拍1コードでも stale しない） |
| 境界 | approach ノブ（確率・±1/−2半音・独立Rng） | 区間末の自由onsetを**構造的に**接近音化・発散後に解決（全境界 d=1 を実測） |
| 何が保証されるか | 「キック共有率がだいたい kickLock になる」 | 「全キックにルート・リフは壊れない・全境界が接near・強拍は全部コードトーン」 |

要するに otomemo は**統計的な傾き**（share の目標値）、phrase_maker は**構造的な契約**（錨は必ず・リフは必ず生存・境界は必ず解決）。recipe-io-map の「既存 kickLock の確率ロックより構造的」の中身はこれ。副作用として phrase_maker 方式は seed に依らず骨が安定し、データ一致検証もしやすい。

## 4. 移植の難易度と価値の見立て（推し）

決定論の観点：ベース系は全系統 md5 シード・バイト一致検証済み。さらに核心部は RNG 消費が少ない——`_lock_bass_roots_to_sheet` と chord_follow の base line は **RNG 完全不使用**、diverge も決定的（順序巡回のみ）、walking の RNG はタイブレーク（`0.001*rng.random()`）と approach の同点崩しのみ。→ **ドラムM2と同じ「Python 参照実装とのデータ一致」検証がそのまま成立する**。注意点は Python `round`（銀行家丸め）と `min(key=)` の同値タイブレーク規則を TS 側で揃えること（ドラムで既習）。

推し順（価値×難易度×決定論）：

1. **錨と間の分業（_lock_bass_roots_to_sheet 相当）**——価値最大。耳GO実績（「ロックとても良い」）・RNG不使用・入出力が単純（onset列＋kick列＋コード区間）・既存 kickLock/style 経路と排他の第三経路として additive に足せる（bit一致の鉄則を守れる）。grammar セル（riff.py の3型）を bassLibrary の語彙に「anchor/role 付き」で足す小改修が対になる。
2. **コード追従のガード群（chord_follow の5ガード＋chords_theory の広語彙整合スケール）**——強拍CT強制・弱拍スケール整合・境界接近の「発散後解決」。敵対ファズで枯れており、25クオリティ表は純データ＝移植が機械的。otomemo の approach ノブの上位互換になる。
3. **ウォーキング v3（合法跳躍）**——otomemo に無いスタイルが丸ごと増える（ジャズ/バラード）。ただし v3 は独立ACCEPTANCE 未実施＝**移植前に Python 側でデータ一致の基準を固めるか、v3 の跳躍品質メトリクス（forbidden/recov/compound/7→3）を移植後の検証器として使う**のが筋。v1/v2 は移植せず「負の知識」として設計メモに残す。
4. **指板グラフ（fretboard+graph_line）**——芯の思想だが、当面は「検証器」として薄く（演奏可能性チェック・運指コスト診断）。生成側の主導権を握らせるのは後段。networkx 依存だが Dijkstra は自前実装で足りる（層状DAGなので単純）。
5. **bass_expression（奏法）**——価値はあるが前提が欠けている：otomemo の bass notes は velocity 非対応・ピッチベンドの再生経路も未確認。design.md 自身が「vel 追加＋synth の鳴り確認が先行条件」と言っている。**後回し**（着彩層＝「既存ラインを読んで足す」契約なので、いつでも additive に入れられる）。

## 5. 地雷・既知の未達（向こうの doc が自認している穴）

1. **walking v3 に ACCEPTANCE が無い**（v1/v2 にはある）。LISTEN の self-report のみで独立検証・耳の最終判定の記録が無い。「v3=完成」と思い込んで移植すると M2 の bodyfill と逆向きの事故（未検証を検証済み扱い）になる。
2. **bass_expression の ACCEPTANCE.md は「E1 FAIL」のまま**だが、コードはその後修正済み（engine.py の PEAK_LEAD 定数群＋書き出し後再パース検証 `render.py:57`・main.py が target_stuck を集計）。doc だけ読むと「壊れている」、コードだけ読むと「直っている」＝**どちらか一方だけ見ると誤記録する**。移植時は Python を再実行して stuck=0 を確認してから。バグの中身（pretty_midi の同一tick昇順並べ替えでベンドリセット消失）自体も、ベンドを扱う移植をするなら**同種の罠が otomemo 側シンセにもあり得る**という一般教訓。
3. **naive.py / build_naive 系は「死にコード」ではなく ablation の対照**（naive の凡庸さの定義が価値主張の分母）。移植対象ではないが、削除・無視の判断理由を「対照だから」と正しく記録すること。
4. **walking は 6/8 非対応**（GAP-AUDIT G7：compound で明示 ValueError）。ジグ等はアダプタ側の割り切り。
5. **bass fill（fill×riff）・リフの変位生成は向こうでも未着手**（HANDOFF-NEXT 残課題4）。「phrase_maker にあるはず」と探しても無い。
6. **コード解釈が4系統に分裂**（GAP-AUDIT G8：bass `chords_theory`/guitar/piano=core `chordlib`/music21。md5 相異）。core.chordlib（piano 版再エクスポート）が最広語彙・fuzz 堅牢の正とされるが、**walking の内部は今も bass `chords_theory` 経由**。移植の参照実装をどの表から取るかを最初に固定しないと「同じクオリティ名で違うスケール」を掴む。
7. **diverge のノブ帯域は otomemo に前例が無い概念**（発散＝入れ子部分集合で単調）。移植するなら ACCEPTANCE §6 の単調性チェック（div_curve 非減少・全knobで調外0）を検証器ごと持ってくる。
8. GAP-AUDIT の LOW 群（tempo 上限クランプ無し・beats 型検証無し等）は設計判断で残した穴＝移植時に otomemo 側の既存ガードで塞がる範囲か個別確認。

## 6. 出典（主要ポインタ）

- リフ構文・語彙・発散：`experiments/bass_rock_riff/{riff,theory,diverge,subfeel}.py`・`README.md`・`ACCEPTANCE.md`
- 指板物理：`experiments/bass_rock_riff/fretboard.py:31-66`・`graph_line.py`
- コード追従：`experiments/bass_rock_riff/chords/{chord_follow,chords_theory}.py`・`ACCEPTANCE.md`・`BREAKAGE.md`・`stress/STRESS.md`
- ウォーキング：`experiments/bass_walking/walking.py`・`v2/walking_v2.py:1-40`・`v3/walking_v3.py:1-90`・`v3/metrics_v3.py`・`ACCEPTANCE.md`（v1）・`v3/LISTEN.md`
- 奏法：`experiments/bass_expression/{engine,fret}.py`・`ACCEPTANCE.md`（FAIL版）・`render.py:57`（修正後の検証）
- 分業の完成形：`experiments/ensemble/ensemble.py:1111`（`_lock_bass_roots_to_sheet`）・`:1372`（`_sheet_line`）
- 思想・現在地：`docs/CONCEPT.md`・`docs/GAP-AUDIT.md`・`docs/HANDOFF-NEXT.md`
- otomemo 側：`apps/api/src/music/generate.ts:1118`（genBass）・`apps/api/src/music/bassLibrary.ts`・`docs/design.md`「gen_bass×ドラム結線」・`docs/drafts/2026-08-20-phrasemaker-recipe-io-map.md`
