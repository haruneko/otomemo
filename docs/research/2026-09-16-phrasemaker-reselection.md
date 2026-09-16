# phrase_maker から Otomemo に取り込む価値のあるものの選び直し（2026-09-16）

依頼＝オーナー「それなりにいいものがあったはずなんで取り込みたいです。取り込むときに必ずおとめもとフレーズメーカーのコンセプトにあってるか確認入れてください。」
立場＝**選び直し**。2026-08〜09 の取り込みアーク（ドラム・ウォーキング＝耳合格／ベースの錨・リフ文法・ギター・鍵盤の隙間刺し・変奏の層＝耳不合格で 09-16 に撤去）の計画書・棚卸しは、外した実装の当事者が書いたもの。**世代の札や file:line などの事実は使い、「何を取り込むべきか」の判断は実物（`~/projects/phrase_maker` のコード・doc・git 本文・耳の記録）で確かめ直した。** コードは変えていない。音の良し悪しは私が決めない（耳の記録が無いものは「未判定」）。

読み方：候補ごとに **(A) Otomemo のコンセプトに合うか／(B) phrase_maker のコンセプトに合うか（芯側か・芯から外れた部分か）** を明記し、両方通ったものだけを「取り込む候補」に置いた。

---

## 0. 結論（先に20行）

1. **phrase_maker に「リフ」を作る機構は無い。** ベース `riff.py`・ギター `gen2/riff.py` の3文法はいずれも「step と度数が数値で固定された2小節表」（`guitar/gen2/riff.py:3`「Each grammar is a fixed 2-bar ostinato」）で、和声との関係型を選ぶ引数も無い（`chordfollow.assign_pitches` の1種類のみ）。ギター gen1 `riffgen.py` は5本の固定テンプレで運指は事後表示（`riffgen.py:324-346`）。**S3 リフ雛形（和声4型×楽器イディオム）は向こうから移すものではなく Otomemo で作るもの**＝入口は既存 `genRiff`（`apps/api/src/music/generate.ts:1609-1662`・現状は indep/follow の2値・候補1件）。
2. **取り込む価値が最も高いのは、前アークが一度も運ばなかった鍵盤の「反転アーキ」handframe**（`experiments/piano/fingersim/handframe.py`＋`handframe_band.py`＋`handmodel.py`＋`phrase_arc.py`）。オーナーの課題「オルガン/ピアノの奏法バッキング」「似たニュアンスの別パターン」に直撃し、向こうの芯（掴んだ手の状態が次の音を選ぶ＝身体性から創発）そのもので、耳の記録が最も厚い（M1「悪くないかな」→M2「良くなった・やりたいことに近づいている」→M2.2「だいぶ前進」→M3「良くなったな。どれも良い」→バンド「品質的には元に戻った・良さそう」→掴みラダー「掴みは選べるべき・この幅で良い」）。**ただし Otomemo の文脈で1回も鳴らしていない＝移す前に耳。**
3. 次点＝**オルガン保持レイヤーの規則**（掴む時刻の探索規則・離しは次アタックの16分前・ルート抜き＋共通音タイは対）。小さく、Otomemo の OG-PAD 系5型に「規則」として乗る。耳は「伸ばしただけ」→「あんま変わってない・最低限合格」→ 現行版は**未判定**＝耳が先。
4. **ドラムの残り3点**（意図メニュー×近重複刈りの複数案、名前付きの狙い、自動シームの「息継ぎ」）は、耳合格済みの bodyFill の上に載る小物で、S2 配札の「数枚配る」の先例になる。
5. **ケルトのジグ**（`phrase_plan.py` の線プランナー＝閉形式の音型語彙＋半小節アンカー＋方向の慣性＋軸音）は条件付き。耳は割れている（「ジグは悪くない」「リールはよくない」「軸が無い」・軸音版は未判定）。オーナーの3課題には直接効かず、根拠は取り込み計画書の記録「ケルトは行けるなら入れたい」のみ（一次資料未確認）。
6. **取り込まない**＝ベースの発散ノブ（単一ノブの入れ子＝向こうの CONCEPT が自ら否定する形）・ギター一式（固定表／耳未判定の handshape）・gesture p11 の崩し度表（物理がバリデータ＝向こうの失敗形1）・p14 バラード（handframe が後継）・ソロ（枝1 で初期スコープ外＋耳未判定）・リール（耳×・slur 未実装）・ベース奏法層（ニュアンスは DAW）・配線層（Chart/ensemble/Breath）・前世代群。
7. 推す順＝**①handframe（耳→置き場裁定→移植）②オルガン規則（耳→S1 の棚へ）③ドラム3点（配札 S2 の部品として）④ジグ（裁定次第）**。いずれも 08-02 計画（S1/S2/S3）と接続してから走らせる（負の知識4）。

---

## 1. 物差し（両関門）と、当事者文書の扱い

| 関門 | 所在 | 今回どう使ったか |
|---|---|---|
| **(A) Otomemo** | `docs/requirements.md:18-35`（延長・候補まで機械・完成品を差し出さない）／`:222`（楽器アレンジ＝提案のみ・自動適用しない・音符を1個ずつ直すレーンを足さない・ニュアンスは DAW）／`CLAUDE.md`（評価に大規模言語モデルを使わない・他者コーパスは統計のみ）／`docs/design.md:510-534`（語彙帳＋配札・S1/S2/S3・自作採取不採用・手癖の鏡を作らない）／`docs/backlog.md:22-37`（オーナーの生の課題＝**手癖で似たニュアンスの別パターンが出せない・楽器固有リフ・オルガン/ピアノの奏法バッキング**・残不満「棚が静的では対応幅が狭い・パターンも動的に出したい」＝design.md:563） | 候補が「候補を出す道具」に収まるか／3課題のどれに効くか／S1〜S3 のどこに接続するか |
| **(B) phrase_maker** | `~/projects/phrase_maker/docs/CONCEPT.md` §1（身体性シミュレータ＋発散・選別の相棒）・§2①（物理層がバリデータに堕ちるとテンプレ・スタンパー）・§2③（密度ノブや最小コスト1解ではなく質的に別の候補）・§3（超雑に自分で打ち込んだ場合と差が出るか）／`GAP-AUDIT.md`／`HANDOFF-NEXT.md`／各 SPEC・CRITIQUE・AUDIT・NOTES／`~/.claude/projects/-home-shuraba-p-projects-phrase-maker/memory/*.md`（耳の記録の多くはここ） | 候補が「芯」側（物理が生成する・平均を出さない）か、芯から外れた部分（合奏の糊・固定表・対照実験・前世代・打ち切り枝）か。向こう自身が自認する失敗形を根拠にする |

**当事者文書の扱い**：`docs/archive/2026-09-09-phrasemaker-port-master-plan.md` §4（世代の札）と `docs/research/2026-09-04-phrasemaker-bass-inventory.md` からは **file:line・耳の引用・世代の判定のうち実物で追認できたものだけ**を採り、「移植○／◎」などの評価語は採らない。**doc とコードが食い違う実例**（`GAP-AUDIT.md` G7 は現コードで修正済み、`bass_expression/ACCEPTANCE.md` は FAIL のままだがコードは修正済み、`solo/LISTEN.md` は 0 bars の掲載が残る）があるので、片方だけで断定しない。

**耳の記録の探し方**（向こうの慣行）：機能を出すコミット本文は必ず「Not yet ear-checked.」で終わり、**耳の言葉は次の増分の SPEC/CRITIQUE 冒頭・研究 doc 冒頭・`tools/FEATURED.txt` の見出し・メモリに転記されている**。当該コミットだけ見ると必ず「未記録」と誤る。

---

## 2. 取り込む候補（(A)(B) 両方を通過）

### 2-1. 鍵盤の反転アーキ handframe（＋handframe_band・handmodel・phrase_arc）

| 項 | 内容 |
|---|---|
| 何を解くか | 「コードを掴む→ポジションが決まる→自由指が届く範囲で崩す→届かなければシフト/跳躍が強制される」を状態機械で回し、**音高は手の到達窓からしか出ない**（`handframe.py:484-638 enumerate_moves`／窓＝`handmodel.py:224-263 free_finger_reach`／候補＝`win ∩ pool` `handframe.py:508-517`／物理コスト `partial_cost` がスコアに入る `:517`／選択＝上位3の温度付き抽選 `sample_topk :769-795`）。バンド版は共有リズム譜のスネアに掴みを合わせ、掴み密度を4段で選べ（`handframe_band.py:315-323`）、ベース最高音の上に床を置く（`:67-68,468`）。フレーズの弧 `phrase_arc.py` が密度・音域・velocity を頂点へ向けて変調する（M3）。 |
| 課題への効き | **オルガン/ピアノの奏法バッキング**（直撃）／**似たニュアンスの別パターン**（seed・grip/mid/loose・掴みラダー L1〜L4・弧の変種＝同じ進行で質的に別の候補が出る＝オーナーの残不満「棚が静的」への答え＝S2 の「動的に出す」経路）。楽器固有リフには効かない。 |
| 耳の記録（原文） | M1 bossa 単手「悪くないかな」／M2 ballad 両手「良くなった・やりたいことに近づいている」（memory `handframe-status.md:18-19`）／M2「良くなった。均等八分からはやや発展した」＋不満3点（`docs/poc/SPEC-piano-handframe-M2_2.md:5-11`）／M2.2「音符レベルはかなり良くなった。まあ違和感はある」「行き先のが不思議な感じで…連打しちゃって溜まる。間には救われてそう」（`SPEC-piano-handframe-M3.md:6`）・「だいぶ前進・濁り改善・固くない・反復0.6でも退屈でない」（memory :21）／**M3「良くなったな。どれも良い、変種の差は好みレベル」**（memory :25・違和感の言及なし）／バンド初移植「全然だめ・劣化・全曲同じ」（`tools/FEATURED.txt:117`・原因＝耳GO設定の落ち＝`CRITIQUE-piano-handframe-band.md:15`）→ wave1「**品質的には元に戻った・良さそう**」（memory :27・git `bb173cf`「back to good quality (2026-08-15)」）／掴みラダー「**掴みは選べるべき・この幅で良い**」・新スネア型 OK（memory :27）／和声粗3点修正・掴みグリッド＝**未判定**（`bb173cf` 本文「Not yet ear-checked」）。 |
| **(A) 判定＝通る** | 候補を出す道具（生成→パターン単位で採用）に収まる。per-note 編集レーンは要らない。**保存の形は前例あり**＝bodyFill と同じ「生きたレシピ（掴み＋つまみ＋seed を保存・音符は毎回生成）」（`docs/archive/2026-08-21-phrasemaker-arc-handoff.md`「A＝生きたレシピ」）。進行変更→自動で当て直し（design 枝5）は「再生のたびに今の進行で弾き直す」置き方なら構造で満たす（master plan §8-2 ①の形）。他者コーパスは不使用（Parncutt 1997 の到達表＋pianoplayer の定数＝`handmodel.py:10-22`・MIT・帰属表記は `8d332fa` で一度書いた実績あり、撤去 `dd9fdd5` で消えているので再掲が要る）。**注意**：4/4 限定（`handframe_band.py:48`・`ensemble.py:2113-2114`）＝Otomemo の 6/8（world68）には当面効かない。 |
| **(B) 判定＝通る（芯そのもの）** | 向こうの CONCEPT §2① の失敗形（バリデータ化）を名指しで直した設計（`SPEC-piano-handframe.md:27`）。物理が候補集合を決めていることをコードで確認（上記）。gesture 系（p10/p11/p14）が `best_assignment(...) is None` で届かない音を落とすだけ（`gesture_p11.py:312-313`・`gesture_p14.py:403-408`）なのと対照的。「平均を出さない」＝argmin 禁止・top-k 抽選（`SPEC-piano-handframe.md:18,183`）。反証テスト＝束縛度3点（窓が合法候補を刈った割合≥0.7・強制遷移≥1/8小節・退化走行0＝`:198-200`・`quality_eval/handframe_m1/run_m1.py:117-136`）。摂動テストの記録はピアノ側に無い（ギター側のみ）＝移すなら Otomemo 側で「物理の重みを振ると出力が変わる」を受け入れテストに足す。 |
| Otomemo に既にあるもの | 静的な型辞書 50型（`apps/api/src/music/chordLibrary.ts:302`＝KEYBOARD 21／GUITAR 14／WORLD68 10／ORGAN 5）・followChords・bars:2（S1）。**生成器として毎回違う崩しを出す経路は無い**（撤去した keyStab は「キックの隙間に和音」で別物）。`voice_chord`（`comping.py:162`）は Otomemo の `voiceToTop` と役割が重なる＝差分のみ。 |
| 前アークとの関係 | M6b/M6c として「裁定待ち」に置かれ一度も運ばれていない。09-16 の撤去で `handModel.ts` を外したのは「呼び手（M6c）が消えるなら死にコード」という理由（`docs/archive/2026-09-16-riff-arc-revert-review.md` §3-1）で、**耳の否定ではない**。handframe を運ぶなら handmodel は一緒に戻る（矛盾しない）。 |
| 規模感 | `handframe.py` 1,700行・`handframe_band.py` 581行・`handmodel.py` 361行・`phrase_arc.py` 109行＝約 2,750行（stdlib のみ・numpy 不要・RNG は2箇所 `handframe.py:783,1235`）。行数は価値の代理にしない。 |
| 前提（移す前） | ①**耳**（§4-1）②置き場の裁定（master plan §8-2 の3択＝その場で毎回作る／作った音を持つ／別の道具で作る）③`handModel` と NOTICE の再掲。 |

### 2-2. オルガン保持レイヤーの規則（掴む時刻・離す時刻・ルート抜き＋共通音タイの対）

| 項 | 内容 |
|---|---|
| 何を解くか | オルガンは減衰しない楽器なので「同じ和音を1小節6回連打」は機関銃になる（`ec81b1a` 本文）。規則＝**掴む時刻**＝区間頭から2マス以上4マス以内で、共有リズム譜の打点かつキック以外の最初のマス（1周目キック回避・無ければ ValueError で黙らない）（`ensemble.py:2496-2504`・`SPEC-organ-sustain-layer.md:74,89`）／**離す時刻**＝次の実アタックの16分前（`:2512-2524`）／ボイシング＝役割優先順位（3度・7度＞変化5度＞9度…＞ルート）で選び最小間隔を制約として積む（`:2312-2364`）／**共通音タイ**（`:2560-2580`）／velocity 平坦（`:2583-2598`）。RNG 不使用の純関数（`:2441`）。 |
| 課題への効き | **オルガン奏法バッキング**（直撃・S1 の OG-PAD/OG-PAD2 に「規則」として乗る）。 |
| 耳の記録（原文） | 音色差し替えだけ「ピアノの延長になってる、オルガンは減衰しないのに」（`FEATURED.txt:78`）／保持のみ「**伸ばしただけ、打ち込み適当と変わらん**」（`FEATURED.txt:50`・`SPEC-organ-idiom-layer.md:5`）／語法4点 round1「壊れてないが良くなった実感が薄い」「あんま変わってない」「破綻していないから最低限合格」（`CRITIQUE-organ-celtic-round2.md:4`・`AUDIT-organ-musical.md:17,19`）／**round2（現行出荷版）＝未判定**（`6db2dd2` 本文「Not yet ear-checked」・以後記録なし）。 |
| **(A) 判定＝通る** | S1 の裁定と整合＝CC が型の定義そのものの型（drawbar/leslie/gliss/shake）は棚に載せない（design.md:551）。**CC11 の D2 は移さない**（同裁定）。掴み・離し・タイは content の dur で表せる（followChords＝境界で切って再ボイシング、と排他にする設計メモ＝master plan §4-4）。 |
| **(B) 判定＝通る（条件つき）** | 物理層（運指）は無いが、「楽器の物理（減衰しない）と慣用（時間設計）」から時間を決める規則＝芯の「身体性・慣用の制約空間」の側。固定表ではない（譜を読んで探索する）。向こうの負の知識「色（音高）だけ変えても時間設計を変えないと耳は動かない」（`CRITIQUE-organ-celtic-round2.md:40`）と「ルート抜きは声部連結には有害＝共通音タイと対で」（`AUDIT-organ-musical.md:131`）を一緒に運ぶ。 |
| Otomemo に既にあるもの | ORGAN_TYPES 5型・followChords（`chordLibrary.ts:277-300`）。掴み時刻の探索・離しの規則・共通音タイは無い。 |
| 規模感 | 規則 4本＋ボイシング優先順位＝100〜200行相当。**耳が先**（§4-2）。 |

### 2-3. ドラムの残り3点（複数案・名前付きの狙い・息継ぎ）

| 項 | 内容 |
|---|---|
| 何を解くか | ① **fill_variation**（`ensemble.py:1520-1597`）＝オーナー観察「DP は長さが決まると1個に収束」（memory `drums-rhythm-sheet.md:134`）への答え。行き先5段×忙しさ4段＝20の「狙い」で bodyfill を解き直し、出力署名の正規化レーベンシュタイン≥0.34 で近重複を刈って実効8〜12案（`_effective_menu :1584-1597`）。② **AIM_PRESETS**（`:1533-1539`）＝名前付きの狙い5種（floor_flashy/ghost_roll/tom_tumble/snare_build/uphill_crash）＝数値の組であって形の辞書ではない（`:1531`）。③ **自動シーム**（`:1637-1650`）＝大境界は派手・中境界は控えめ、中境界の約1/4を無フィルの「息継ぎ」に。 |
| 課題への効き | 3課題に直撃ではないが、**「似たニュアンスの別パターン」を「数枚配って選ぶ」機構の先例**＝S2 配札の候補分散（design.md:520 ③）に一般化できる。 |
| 耳の記録（原文） | 「ここにフィル」マーカー好評（`HANDOFF-NEXT.md:20`）／フィル全体「**私では作らん感じ、中級者手前のドラマー**」（`:21`）／既知の要注意＝名前付きの狙い同士が必ずしも別物でない（`:24`・`32bd0ea` 本文）。 |
| **(A) 判定＝通る** | 提案のみ・候補単位。Otomemo の cue（`packages/music-core/src/cues.ts:15-23`）に aim の名前を足すだけ／複数案は候補トレイに積む。 |
| **(B) 判定＝通る** | 辞書に戻らず毎回 DP（芯側）。「バリエーション＝狙いを振る」は向こうの実測プローブ＋敵対批評で条件付きGo を取った形（memory :134）。 |
| Otomemo に既にあるもの | bodyFill（`packages/music-core/src/bodyFill.ts`）・数値ノブ bodyDepth/bodyDensity/bodyCrescendo/bodyTailAnchor（`generate.ts:1722,2097-2098`）・cue の aim は "up"/"down" の2値（`cues.ts:22`）。**無い**＝名前付きの狙い・意図メニューと近重複刈り・自動シームと息継ぎ（grep 0件）。 |
| 規模感 | 小（各 50〜100行）。耳合格済みの上に載るので耳は「別物に聞こえるか」の1点。 |

### 2-4. ドラムのグルーヴ部品（ゴーストの制約生成・ハット開閉の状態機械）＝低優先

| 項 | 内容 |
|---|---|
| 何を解くか | `patterns.py:169-195 _spec_ghosts`＝ハット格子にもキック∪スネアにも無い裏拍で、スネアの1〜2マス前を優先して密度上限で刈る（制約生成）。`lefthat.py`＝キックのシンコペ以降の最初の8分でハットを開き、4拍目の既存クローズで閉じる状態機械（再オープン禁止・bar 毎 ≤2）。 |
| 耳の記録 | 個別の記録なし（「ロックとても良い」はバンド全体＝負の知識3で評価単位を確かめる）。**未判定**。 |
| (A)(B) | (A) 通る（候補のパターンの中身）。(B) 通る（表でなく制約から生成）。 |
| Otomemo | ゴーストは乱択1発（`generate.ts:1866`）・オープンハットは確率（`:1875`）か型辞書の固定レーン。 |
| 判定 | 小さく効きそうだが耳の記録が無いので**低優先・耳先**。 |

### 2-5. 条件付き＝ケルトのジグ（線プランナー）

| 項 | 内容 |
|---|---|
| 何を解くか | 決定変数を「次の音高」から (a) 半小節ごとの目標音列（弧に沿う）(b) 目標間を埋める音型（`SHAPES` 12種・**閉形式**＝音列を作らず端点の式で成立判定 `phrase_plan.py:462-633`）に反転。方向の慣性（`:1222-1231`）・重み積で `rng.choices` 1回（`:1240`）・軸音への周期帰還 v3（`:975-1002`）。拍子依存は `MeterProfile`（`:289-350`）に閉じている。 |
| 耳の記録（原文） | 旧「彷徨っている」→ v1「良くなった、結局パターンが強い印象はある…向かう先の音符をもう少しちゃんとしたらかなり良さそう」（`SPEC-celtic-reel-orn-anchor-v2.md:26-28`）→ v2「壊れてはいないが明確に良くなった実感が薄い」→ round2「**ジグは悪くない・リールはよくない**」（`research/celtic/04:12`）→ 本物との A/B「実データが明確にいい。…今の動きは動きのエッセンスはあるものの**軸が無い**」（`research/celtic/05:3-4`）→ v5 軸音＝**未判定**（`d885828`「Not yet ear-checked」・効く箇所が16中1＝`FEATURED.txt:4`）。 |
| **(A) 判定＝通る（置き場を選べば）** | 主旋律は前景＝メロ側 `gen_melody` の候補提示に載る（design.md:507）。J-POP 中心の要件（requirements:220「粗い寄せ」）に対しジャンルを1つ足す判断が要る。装飾（cut/roll）は格子外＝落とす。 |
| **(B) 判定＝芯の外側だが失敗形ではない** | 物理層は無い（`SPEC-celtic-phrase-planner.md:476`「ケルト旋律エンジンには物理層が無いまま」）。一方で「平均を出さない」（重み付き抽選）・反証テスト（音型を1つ消すと一致率が 0.13 に落ちる＝`e90c3d7` 本文）・機械指標を報酬にしない是正（`6db2dd2` 本文）は芯の作法どおり。 |
| 判定 | 課題3点に直接効かない。根拠は master plan の記録「オーナー『ケルトは行けるなら入れたい』」（`docs/archive/2026-09-09-phrasemaker-port-master-plan.md:63`・**一次資料は見つけていない**）。**ジグだけ・耳先・裁定待ち**。リールは取り込まない（§3）。 |
| 副産物 | 「表を敷かず規則で選ぶ」（負の知識5）の具体形として、**閉形式の音型語彙＋アンカー＋慣性**は S3 リフ雛形を Otomemo で作るときの設計参考になる（コードは移さない）。 |

---

## 3. 取り込まない（どちらの関門で外れたか）

| 対象 | 外れた関門 | 理由（出典） |
|---|---|---|
| ベースの発散ノブ `bass_rock_riff/diverge.py`・`chords/chord_follow.py:235-275` | **(B)** | 単一 0..1 ノブで「先頭から k 個」の入れ子部分集合を動かす（`diverge.py:64-67`）＝向こうの CONCEPT §2③ が「密度ノブや最小コスト1解ではなく質的に別の候補」と自ら否定した形。動かす土台が固定文法（負の知識2）。発想（軸を1本だけ壊す・保護 step）は `riffVariation` の撤去時に設計知識として design (k) に残っている＝二重に運ばない |
| ギター gen1 `riffgen.py`＋`theory.py` | **(B)** | 5本とも固定テンプレ（`riffgen.py:83-199`）・運指は音高確定後の表示のみ（`:324-346`）＝「音高を先に決めて運指は事後」＝バリデータ失敗形。耳は「5楽器 gen1 まとめて『全般に面白い』」（`CONCEPT.md:88`）でギター単独の判定なし |
| ギター gen2 文法・`chordfollow`・chug ロック | **(A)(B)** | 09-16 に撤去したものと同型（固定2小節のペダル表・キックに刻みを揃える＝合奏の糊）。design.md 追補 (k) の負の知識1・2 |
| ギター gen2 **handshape**（`handshape.py`・`shapeline.py`・`shapefollow.py`） | **(B)（芯には沿う）／(A)（課題に答えない）** | 反転アーキとしては本物（摂動テストで「重みを振っても出力が変わらない＝バリデータ」を実測発見し修正＝`SPEC-guitar-handshape.md:170-190`）。しかし**和音を弾くか単音かは型が決める**（`:241`）・本線 power_chug で手が選べるのは「2音/3音/オクターブ形の別」だけ（`CRITIQUE-guitar-handshape.md:55-68`）・commit `19c405a`「closer to "chunkier chords" than "the hand is choosing freely"」「Ear status: not yet judged」。唯一の耳＝A/B から派生した「導音…変な臭みがあって、あんまり聞かない動き」（`CRITIQUE-guitar-approach-tone.md:4`）＝撤去済みの旧機構への否定。**ギターの「楽器固有リフ」への答えではない**。ただし将来 S3 でギターの身体性（フォーム＝状態・調弦からフォーム DB を導出・移動時間ゲート）が要るときの設計参考＝§4-5 に耳の項を1つだけ置く |
| gesture **p11**（容器 DSL・KNOBS 12セル・軌跡・`_grade_slots`） | **(B)** | 物理は到達不能な掴みの切り捨てのみ（`gesture_p11.py:312-313`）＝向こうの失敗形1（バリデータ化）。耳「neo-soul かなり良い・jazz 音楽的→維持、ボサ・バラードは割りすぎ」（`GESTURE_P11_NOTES.md:3`）は本物だが、その後の研究が「『リズムの枠を叩くか叩かないかに聞こえる／右手左手を同時にバラしてる』はアーキテクチャの正確な記述で、程度の調整では消えない」（`docs/research/how-piano-is-played.md:24-26`）と診断し handframe に置換された。Otomemo に載せるなら静的な型（表）にしかならず、残不満「棚が静的」と逆向き。neosoul/jazz Charleston の語彙表は `docs/research/2026-07-22-piano-comping-vocabulary.md` の参考に留める |
| gesture **p14** `generate_ballad_v3`・ボサ `CELLS`・`swing_notes` | **(B)** | 耳GO（solo・2026-08-09＝`SPEC-piano-band-unify.md:13,39`）は事実だが、物理は `reachable` ゲート（`gesture_p14.py:403-408`）＝バリデータ側。handframe が「置換対象」として後継（`SPEC-piano-handframe.md:6`）。スイング較正（0.4→1.5:1／0.667→2:1）は feel 層の参考値としてだけ |
| `solo/solo.py` | **(A)** | 器楽ソロは初期スコープ外（design.md:521 枝1）。加えて耳未確定（`CONCEPT.md:82,109`・`FEATURED.txt` に0行）、`ACCEPTANCE.md:38-42`「arc 単独は naive/phrased を分離しない」。変換は移高＋反転＋切り詰めの3種のみ（`solo.py:339-362`）＝リフの controlled variation としても薄い |
| ケルトの**リール**・装飾（cut/roll・弓3連） | **(B)** | 耳「リールはよくない」（`research/celtic/04:12`）・芯の slur が未実装（`6db2dd2` 本文「the melody has zero slurs anywhere」）・装飾は「足すと逆効果寄り」（memory `quality-eval-harness.md:14`）・格子外 |
| `bass_expression/`（スライド・ハンマリング・ゴースト） | **(A)** | ニュアンス・音符の詰めは DAW（requirements:222 (iii)）。Otomemo はピッチベンド/CC を持たない（design.md:258）。耳記録なし |
| ウォーキング v1・v3 | 済 | v2＋v3規則＝JZ-WALK として移植済み・耳「使える」。v1「這いすぎ」・v3「逐次貪欲」は負の知識として記録済み |
| `core/`（Chart・RhythmSpec・parts）・`ensemble.py` の配線（ENGINES/default_parts/Chart 33項目）・`Breath` | **(A)** | 配線層は Otomemo の cues／resolve が持つ（「賢い指揮者を作らない」）。Breath（相関ノイズ）は feel 層＝backlog「トラック別 feel」の話で今回の射程外。共有リズム譜に錨を揃える思想は負の知識1 |
| `fills.py` 辞書・drums gen1・`comping.py` TEXTURES・fingersim v1/rhythm/twohand・gesture p0〜p10/p12/p13・`piano/generate.py`・`transplant.py`/`smoke_build.py`（POP909 逐語） | 済／(B) | 後継あり・失敗形・対照実験・逐語コピー（`CONCEPT.md` §4 で却下）。理由は master plan §4 の札と一致することを実物で確認 |
| `quality_eval/`・gallery・fluidsynth | — | 正典外（gitignore）。検証の純関数は `verify/` に既に移っている。**ただし耳の対象物（A/B クリップ・O'Neill's 参照 WAV）はここにしか無い**＝§4 の試聴に使う |

---

## 4. コードを移す前に、向こうの Python で音を出して耳に出すもの（条件つき）

前回の反省＝「移植の忠実さを進捗と取り違えた」。**耳を先に**。全部 `~/projects/phrase_maker` の venv（`experiments/bass_rock_riff/.venv/bin/python`・3.12）で今日動くことを `--help`／API 直呼びで確認済み。書き出し先はリポジトリ外（各ハーネスの `OUT = HERE` はリポジトリ内固定なので、API を直接呼んで scratch へ書く）。

| # | 聴くもの | 条件（これで判断できる） | 問い（採用率プロトコル＝直さず貼る／フィールだけ直す／音符を書き換える／貼らない＋「自分では思いつかない置き方があったか」） |
|---|---|---|---|
| 4-1 | **handframe**：(a) ソロ M3（BALLAD A＝Fmaj7 Dm7 Gm7 C7／66bpm／8小節／両手／ペダル）の `off`・`dens_vel`・`register`・`motif` の4本（`quality_eval/handframe_m3/run_m3.py` の条件・wav 未生成なので再レンダ）／(b) バンド wave1 の `set1_handframe_restored` vs `set1_legacy`（既存 wav・`FEATURED.txt:138,144`）／(c) 掴みラダー L1 と L4（`set6`・既存 wav） | **Otomemo の同じ進行・同じテンポで現行 KEYBOARD 型（例 KB のバラード系）を並べて聴く**＝「超雑に打ち込んだ場合と差が出るか」を Otomemo 基準で。ペダル有無・主旋律なしを明記。4/4 のみ | 手癖に無い置き方が出るか／別 seed・別 preset で「似たニュアンスの別パターン」に聞こえるか／Otomemo の文脈（J-POP 進行）でも生きるか |
| 4-2 | **オルガン**：`band_pop_organ_hold`（保持のみ）vs `band_pop_organ_idiom`（現行・round2 版＝未判定）の stem_organ と mix（`ensemble.py --out <scratch>` で全チャート再レンダ） | 同じ進行・同じ他パート（seed_alias で bass/drums/guitar は md5 一致）。CC11 は現行版で dip=0 | 「伸ばしただけ」から出たか／掴む位置（区間頭から8分後）と離し（16分前）が耳で分かるか／Otomemo の OG-PAD（followChords）と差が出るか |
| 4-3 | **ジグ v5 vs 本物**：`FEATURED.txt:2-16` のセット（ピアノ音色・伴奏なし・既存 wav）＝生成 v5 と O'Neill's の実曲2本 | 楽器音源の癖を除いた音符運びだけ。v5 の効く箇所は16中1（`FEATURED.txt:4`）＝差は小さい前提で聴く | 「軸が無い」が消えたか／Otomemo に入れる価値があるか（入れたい気持ちが今もあるか＝一次資料が無いので本人に確認） |
| 4-4 | **フィルの複数案**：同じシームで意図メニューから残った8〜12案を並べる（`quality_eval/fill_variation/demo.py`・出力先は引数で scratch へ） | 同じ譜・同じ長さ・同じ drummer | 案同士が「別物」に聞こえるか（名前付きの狙いが近い＝既知）／Otomemo の bodyFill 1案と比べて選ぶ価値があるか |
| 4-5 | （低優先）**ギター handshape** 見せ場 `gtr_showcase_pedal_handshape` vs `_grammar`（導音撤去後は未レンダ＝`f2c3241` 本文・要再レンダ） | 単音リフ・共有譜なし・コード変化が速い場面 | 「手が選んでいる」と聞こえるか／「弾けるが退屈」か。S3 でギターの身体性を使うかの材料にだけする |

**耳の負荷**（memory `ear-check-load.md`）：抜き打ちの目隠しは負担大。少数・短尺・任意で、判定は大まかな方向として受け取る。

---

## 5. 優先順と推し

| 順 | 候補 | 理由 | 接続先（負の知識4） | 次の一手 |
|---|---|---|---|---|
| **1** | **handframe（鍵盤の反転アーキ）** | 3課題のうち2つに直撃・向こうの芯そのもの・耳の記録が最も厚い・Otomemo に無い「動的に出す」経路＝残不満「棚が静的」への答え | S1 の棚（コード楽器）の隣に**生成器**として／S2 配札の候補分散（seed・preset・ラダー・弧の変種） | §4-1 の耳 → 置き場裁定（master plan §8-2 の3択・推しは「その場で毎回作る」＝進行を変えたら付いてくる）→ handmodel＋NOTICE 再掲 → 移植（データ一致は `PyRandom.random()` で届く＝RNG 2箇所） |
| **2** | **オルガン保持レイヤーの規則** | 小さい・S1 の OG-PAD に規則として乗る・課題「オルガン奏法」に直撃 | S1 | §4-2 の耳 → 掴み/離し/タイの3規則を followChords と排他で設計 |
| **3** | **ドラムの3点** | 耳合格済みの上に載る小物・S2「数枚配る」の先例になる | S2 | §4-4 の耳 → cue.aim に名前・候補トレイに複数案 |
| **4** | **ジグ（条件付き）** | 耳が割れている・3課題に直接効かない・「入れたい」の一次資料未確認 | メロ側（前景） | オーナーに「今も入れたいか」を1行で確認 → §4-3 の耳 → ジグのみ |
| 5 | ゴースト制約生成・ハット状態機械 | 小・耳記録なし | ドラム型辞書の生成側 | 手が空いたら |

**推し＝1**。理由は上記のとおり。**2 は 1 と独立に安く進む**ので並走できる。**S3 リフ雛形は向こうに材料が無い**＝Otomemo で `genRiff` を和声4型（移調／固定／ペダル／微調整）×楽器イディオム×候補複数へ育てる（研究 `2026-08-02-riff-structure-and-variation.md` 設計含意1〜5）。設計の参考になる向こうの形＝JZ-WALK の「表を敷かず規則で選ぶ」・ジグの「閉形式の音型語彙＋アンカー＋慣性」・handshape の「フォーム＝状態」。

---

## 6. 今回の選び直しで確認した負の知識（design 追補 (k) の5項に足す候補）

6. **向こうの「リフ」はどこも伴奏の刻みだった。** ベース・ギターの3文法とも固定2小節表・ギター gen1 は固定テンプレ・和声との関係型を選ぶ口は無い。「リフ」と名の付くものを中身で判定してから運ぶ。
7. **物理層が「生成」しているか「検査」しているかはコードの1行で見分けられる。** handframe＝窓の交差が候補集合（`handframe.py:508-517`）／gesture 系＝`best_assignment(...) is None` で落とすだけ（`gesture_p11.py:312-313`）。耳が良くても後者は運ばない（向こうの失敗形1）。
8. **単一ノブの入れ子発散は「質的に別の候補」ではない**（`diverge.py:64-67`）。向こうの CONCEPT §2③ が先に否定している。
9. **耳GO の構成を移すときは構成同値を機械で確認する**（handframe バンド初移植「全然だめ・劣化・全曲同じ」の原因＝4ノブが黙って落ちた＝`CRITIQUE-piano-handframe-band.md:15`）。移植後に「良い」が消えたら、まず設定の落ちを疑う。
10. **耳の記録は次の増分の冒頭に転記されている。** 当該コミットだけ見て「未判定」と書かない（ケルト v1 で前計画が誤った）。

---

## 7. 自信の無い点

- **handframe を Otomemo の J-POP 進行・現行音源で鳴らしたことは無い。** 耳GO は全部 BALLAD A（jazz ballad）・bossa・band_rock_gtr（ロック）＋FluidR3 音源。Otomemo で同じ印象になる保証は無い＝§4-1 を先に。
- **「ケルトは行けるなら入れたい」の一次資料を見つけていない。** master plan の記録のみ。オーナーに1行で確かめる。
- **オルガン現行版の耳は未判定**で、直前の版は「あんま変わってない」。規則は小さいので外しても痛くないが、期待値は高くない。
- **ドラム3点の耳「好評」はマーカー（位置指定）に対するもので、複数案の「別物度」は独立受け入れで「名前付きの狙い同士が必ずしも別物でない」と出ている**（`32bd0ea` 本文）。
- 09-16 に外した `handModel.ts`（py-parity 8,000件一致）を戻す判断は、撤去直後の再提案になる。理由（呼び手が無かった→handframe が呼び手）は書いたが、オーナーの受け取り方は確かめていない。
- 行番号は 2026-09-16 時点の `~/projects/phrase_maker`（`gap-fixes` HEAD `e186970`）と Otomemo `main`（撤去コミット `df18ea5` 以後）。

---

## 8. 出典

**Otomemo**：`CLAUDE.md`／`docs/requirements.md:18-35,210-222`／`docs/design.md:507-566,2166-2200`（追補 (k) 撤去記録・負の知識5項）／`docs/backlog.md:22-47`／`docs/drafts/2026-08-02-arrange-arc-handoff.md`／`docs/archive/2026-09-16-riff-arc-revert-review.md`／`docs/archive/2026-09-09-phrasemaker-port-master-plan.md` §4・§8／`docs/archive/2026-08-21-phrasemaker-arc-handoff.md`／`docs/research/2026-09-04-phrasemaker-bass-inventory.md`／`docs/research/2026-08-02-riff-structure-and-variation.md`／`apps/api/src/music/generate.ts:1609-1662,1722,1866,1875,2080-2122`／`apps/api/src/music/chordLibrary.ts:277-302`／`packages/music-core/src/{bodyFill,cues,gmdPrior,verify/fretboard}.ts`／`apps/web/src/useMelodyGen.tsx:170-174,408-418,559-615`／`NOTICE.md`／git `8d332fa`・`dd9fdd5`・`df18ea5`。

**phrase_maker（読むだけ）**：`docs/CONCEPT.md` §1-§6／`docs/GAP-AUDIT.md`／`docs/HANDOFF-NEXT.md:12-30`／`docs/poc/SPEC-piano-handframe.md:6,18,27,183,198-200`・`SPEC-piano-handframe-M2_2.md:5-11`・`SPEC-piano-handframe-M3.md:6`・`CRITIQUE-piano-handframe-band.md:15`・`SPEC-piano-band-unify.md:13,39`・`SPEC-organ-sustain-layer.md:74,89`・`SPEC-organ-idiom-layer.md:5`・`AUDIT-organ-musical.md:17,19,131`・`CRITIQUE-organ-celtic-round2.md:4,40`・`SPEC-guitar-handshape.md:170-190,241`・`CRITIQUE-guitar-handshape.md:55-68`・`CRITIQUE-guitar-approach-tone.md:4`・`SPEC-celtic-phrase-planner.md:152-162,476`・`SPEC-celtic-reel-orn-anchor-v2.md:26-28`・`AUDIT-jig-musical.md:21,40-47`／`docs/research/how-piano-is-played.md:24-26`・`celtic/04:12,102`・`celtic/05:3-4`／`experiments/piano/fingersim/handframe.py:484-638,769-795,783,1235`・`handframe_band.py:48,67-68,315-323,432-439,468`・`handmodel.py:10-22,224-263`／`experiments/piano/gesture/gesture_p11.py:119-124,160-164,312-313`・`gesture_p14.py:388-475`・`GESTURE_P11_NOTES.md:3`／`experiments/ensemble/ensemble.py:1520-1597,1533-1539,1637-1650,2113-2114,2437-2664,3545-3628`／`experiments/drums/gen2/src/patterns.py:169-234`・`lefthat.py`／`experiments/bass_rock_riff/diverge.py:60-70`・`generate.py:49-83`／`experiments/guitar/riffgen.py:83-199,324-346`・`gen2/riff.py:1-8,27-103`・`gen2/handshape.py`・`shapeline.py`／`experiments/celtic/gen2/src/phrase_plan.py:289-350,374-425,462-694,794-1317`／`experiments/solo/solo.py:315-383`・`ACCEPTANCE.md:38-42`／`experiments/ACCEPTANCE.md`・`LISTEN.md`／`tools/FEATURED.txt:2-16,36,50,78,117,138,144`／git 本文 `bb173cf`・`ec81b1a`・`d8f7c51`・`6db2dd2`・`e90c3d7`・`4e60377`・`d885828`・`19c405a`・`f2c3241`・`32bd0ea`・`3591c9a`／メモリ `~/.claude/projects/-home-shuraba-p-projects-phrase-maker/memory/{handframe-status,piano-v3-status,guitar-handshape-status,bass-kick-lock-status,drums-rhythm-sheet,piano-comping-hand-position,comping-eval-protocol,quality-eval-harness,ear-check-load,phrase-maker-concept}.md`。

## オーナーの耳判定（2026-09-16・試聴帳）
**いまの型の棚**（https://claude.ai/artifact/NiTXz16D8xmdfwyn89fu2r）＝3グループとも**静的に感じる**：
- オルガン（OG-PAD/PAD2/STAB/SOUL/PUNCH）：「**あとにごりがひどい。テンションコードの 7th の配置がゴミってる気がする。**」
- ポップス（鍵盤5・ベース3・ドラム4）：「**これならおとめものリズム機能で手で打ち込むわ。**」
- ボカロック（6型）：「**これもおとめもの標準機能でリズムで打ち込みしたほうがらくだと思う。**」

**phrase_maker 取り込み候補**（https://claude.ai/artifact/8hRmEAgbtYuVuhqYYT2c4V）＝**Fable 判定＋Opus 反対三面の「全件移植しない」と食い違う**（物差しはオーナーの耳）：
- 鍵盤の手の形（handframe）＝**取り込みたい**：「**全部取り込んでいい。ただつかみ以外は雑なので進化先をもっと考えていいと思う。**」
- オルガンの伸ばし方＝判定なし：「**よくわかんない。なんで最初 8 分休符があるの？？それがそもそもおかしくて比較しづらい。**」
- ジグ＝**まだ判断できない**：「**研究途上感。骨格メロディの周りを回るような感じにしたら少しましになるのでは？**」
- フィルの複数案＝**取り込みたい**（一部）：「**タムを転がすまではいいんじゃ？スネアとゴーストロールの差はない、駆け上がりは聞いたことない音で却下。**」
