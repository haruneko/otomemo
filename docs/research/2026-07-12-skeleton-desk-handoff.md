# 骨格の机（design #20 S6）実装ハンドオフ — Opus向け（2026-07-12・統合Fable）

> 用語注記：UI表示語は確定版へ改称（対応表＝docs/design.md #20 S6）。本doc本文は当時の設計語のまま。

**あなた（実装役）への一枚**。設計思考2本（[`2026-07-12-skeleton-if-redesign-memo`](2026-07-12-skeleton-if-redesign-memo.md)＋[`2026-07-12-desk-feel-seams-memo`](2026-07-12-desk-feel-seams-memo.md)・動くモック付き）を統合Fableが検証し、正典 `docs/design.md` **#20【S6 骨格の机】** に確定事項を書き込んだ。本docは**実装スライス D0〜D6**＝「生きている SectionEditor を壊さない縦スライス」（S1..S5 と同じ流儀）。判断済みの裁定と地雷も全部ここにある。**設計判断で迷ったら design.md S6 が勝ち・実装手順で迷ったら本doc**。

## 0. 一言でいうと
骨格を**単品で**編集する現 SkeletonEditor に対し、**セクション（伴奏ベッド）をループさせながら骨格を書き・畳み/実音レンズを止めずにA/Bし・接点をタップしてその瞬間だけ2声で聴く**「机」（SkeletonDesk）を web に新設する。**api は無改変**（S1〜S4 の生成契約を消費するだけ）。SkeletonEditor は素材庫クイック確認として存置（置換でなく主線の移動）。

## 1. 資産マップ（何が再利用で何が新設か）

### そのまま使う（無改変）
| 資産 | 場所 | 机での役割 |
|---|---|---|
| 骨格純ロジック全部 | `apps/web/src/skeletonEdit.ts` | dominion/explicitBassSegments/effectiveBassAt/analyzeCounterpoint/fold/TAP_SLOP/nudge。モックの機能はこの縮約移植で全部書けた＝**土台は在る** |
| 畳みレンズの2声 | 同 `skeletonPlaybackNotes(counterpoint:true)` | 畳みレンズ＝これ＋クリック（新設） |
| 実音レンズの骨格ミックス | 同 `skeletonEarNotes`（shift=配置移調） | 実音レンズ＝セクション合成＋これ（SectionEditor `skelEar()` と同計算） |
| ループ再生の状態機械 | `apps/web/src/useTransport.ts` | 机のトランスポート（loop/pause/playhead） |
| 生成契約（api） | `gen_skeleton`／`gen_melody(skeletonNetaId)`／`gen_bass(skeletonNetaId)`／`harmonize`／`substitute_chord`／`voiceLeadingReport`(items[].meta) | ③叩き台・④吹く・コード推定・②代替巡回・対位レポート。**apiに新契約を足さない** |
| 生成UIフック | `apps/web/src/useMelodyGen.tsx`（genPart/blowSkeleton/blowSkeletonBass/estimateChords/候補トレイ/pushCand） | ④出口トレイの中身（机コンテキストで呼ぶ） |
| realized_from 逆引き | getBacklinks（S3d 既設・RelationsPanel 流儀） | 骨格チップの「→吹いたメロ N」分岐スタック |
| 配置移調 | `melodyPlacementShift`/`harmonyPlacementShift`（music.ts） | 配置越し編集の往復（ビュー移調・保存時に外す） |
| Undo 流儀 | `history.ts`/`useEditHistory`（content snapshot） | 机の編集履歴 |
| パート別ゲイン | `apps/web/src/audio.ts` `partGains`/`ensureMaster(Tone, part)`/`setMixVolume` | レンズ無停止切替の土台（下記2.1） |

### 部品として流用（移設 or 共用化）
- **SkeletonEditor のロール描画**（`apps/web/src/components/SkeletonEditor.tsx`）：句ルーラー・畳みロール（打点■/支配帯▓/休符ハッチ/導出ベース線/音程バッジ）・休ストリップ・打点/ドラッグ/TAP_SLOP のハンドラ群。**理想＝ロール部分を共用コンポ（例 `SkeletonRoll.tsx`）へ抽出して両器（単品/机）が使う**。抽出が既存テストを揺らすなら、初手は机側にコピーして安定後に共通化でも可（PianoRoll と skeleton が別実装で共存している前例＝backlog に既記載の割り切り）。
- **SectionEditor の文脈閉包**：`sectionChords()`/`sectionBass()`/`sectionDrums()`/`earChords()`/`childDur`/`contentDur`（SectionEditor.tsx 内のクロージャ）。机は同じ計算でベッドを作る必要がある→ **D0 で純関数化して共有**。

### 新設
- `apps/web/src/components/SkeletonDesk.tsx`（机の器・全画面）
- `apps/web/src/deskLens.ts`（純ロジック：lens×stage×文脈→再生 Note 列。クリック生成含む）
- `apps/web/src/sectionContext.ts`（D0：文脈計算の抽出先）
- 接点ストリップ＋説明文（`contactText` 純関数）・B-lite の stale 判定純関数
- audio.ts のレンズバス小拡張（下記2.1）

## 2. 実測済みの技術所見（先に知っておく罠）

### 2.1 「レンズ切替を止めない」は現行 playNotes では成立しない（最大の技術核）
`audio.ts playNotes`（:716）は**再生開始時に全ノートを Tone.Transport へ先行スケジュール**する（`transport.schedule(...)` ループ・:762）。状態を都度読む仕組みは無い＝レンズをトグルしても鳴る音は変わらない。選択肢：
- **案イ（推奨）＝両レンズ同時スケジュール＋レンズ別バスのゲート切替**。`partGains`（melody/chord/bass/drums の GainNode・:78〜）と同じ建付けで**レンズバス**を足し、畳みセット/実音セットの両方を最初からスケジュール・鳴らす側のバスだけ開く。切替＝ゲイン切替＝**無音ギャップゼロ・小節途中でも滑らか**（モックの体験と同じ）。実装＝Note に группи用の目印（`part` の拡張 or 新 `lensGroup`）＋PlaybackHandle に `setLensGain(group, on)` を足す。ユーザーのミキサー設定（setMixVolume）とは**直列の別ゲート**にする（上書きしない）。ボイス数は倍になるがセクション規模では実害なし（SF2 sampler は共有）。
- **案ロ（代替）＝切替時に cancel→再スケジュール＋位置維持**。`transport.pause()` は seconds を保持する（useTransport のコメント参照）ので、cancel(0)→新セットを schedule→同 seconds から start。実装は薄いが**切替瞬間の鳴りかけの音が切れる**・サンプラ再準備のもたつきリスク。
- 受け入れ（D1）：**ループ再生中にレンズをトグルして、再生位置が飛ばず・音が途切れず、同じ小節を畳み⇄実音で聴き比べられる**（実機・耳確認必須＝memory「品質変更後は耳確認」）。

### 2.2 ベッドの鮮度＝机は自分で composition を持つ
モバイルは mv-pane＝一度に1画面（App.tsx の流儀）＝机が開いている間 SectionEditor はアンマウント相当。机は**自分で `api.getComposition(sectionId)` を持ち**、②での差替・③での編集を自分の state に反映（「①②の編集が③のベッドへ流れる」は同一 state だから成立する）。閉じる時に SectionEditor 側へ reload（`reloadSignal` 流儀 or 単純に閉→開で load）。

### 2.3 配置越し編集の座標系
`skeletonEarNotes` が既にやっている往復が正解の形：**ビュー＝実調（セクション実調へ shift 適用）・保存＝素材の調（shift を外す）**。コードは `earChords()` と同じく key-aware 移調→骨格位置相対（`ch.start - c.position`）。机の編集ハンドラは「表示ピッチ→ unfold（畳み解除）→ unshift（配置移調解除）→ 保存」の2段解除になる（単品エディタは unfold のみだった＝1段増える。テストで固定する）。

### 2.4 保存と Undo
単品エディタは NetaDialog（useNetaEditor/useEditHistory）の枠内で state→自動保存だった。机は独立画面＝**自前で updateNeta（debounce flush）＋useEditHistory 流儀の snapshot Undo** を持つ。②のコード差替も同様（下記 D3＝試着→採用の2段で、在庫を破壊上書きしない）。

### 2.5 その他の地雷（プロジェクト既知）
- **dist焼き**：本番webは dist 配信＝コミットしてもUIは変わらない。スライス毎に `pnpm --filter web build`（backlog「ボタンがない」事故の再発防止）。
- **TAP_SLOP**：ロールのタップ/パン区別は必須（SkeletonEditor の click＋isTap＋pointercancel 方式をそのまま）。
- **拍子**：グリッドは `beatsPerBar(meter)` で 3/4・6/4 対応済みだが、snap 既定2拍は 3拍系で要調整（memo §7）。初手は 4/4 中心で受け、3/4 の snap 表は D7（パーキング）でよい。
- **骨格が同一セクションに複数配置**されうる：机の焦点＝タップしたブロックの骨格1つ。他の骨格はベッドでは無音（合成に入らない従来どおり）＝無視でよい。明示コメントを残す。
- **bit一致鉄則**：api・skeletonEdit.ts 既存関数・SectionEditor 既存挙動・compositeNotes/MIDI書き出し（骨格無音）は不変。新規はすべて加算。

## 3. スライス列（D0〜D6・各スライスで緑→耳→次へ）

**受け入れは全スライス2層書式**（オーナー方針 2026-07-12）：
- **［機械］＝Opusが自分で検証して自己完結する層**。TDD緑・bit一致境界・回帰ゼロに加え、**機構を駆動して観測**する項目（スケジュールされる音符列・バッジ値・イベント発火をコード/テスト/コンソールで確認）。「壊した/契約を外した」はここで全部潰す。
- **［耳/手］＝機械では受け入れ不能・人間必須の層**。スマホ実機での試聴/触診＝このプロジェクトの主戦場。**各スライスから小さく的を絞った依頼だけ**をオーナーへ返す（「全部聴いて」は禁止・何をどう操作して何が聞こえれば緑かを1〜3点で）。［耳/手］が返るまで次スライスに**進んでよい**（ブロッカーではない・memory「問題が無ければ止めない」）が、フィール系の設計見直しは耳FBを待って行う。

### D0 セクション文脈の抽出（純化・バイト等価）
- **目的**：SectionEditor 内クロージャの文脈計算を、机と共有できる純関数へ。机が SectionEditor と**同じ計算**でベッドを得る保証。
- **触る**：`SectionEditor.tsx` → 新設 `apps/web/src/sectionContext.ts` へ `sectionChords`/`sectionBass`/`sectionDrums`/`earChords`/`skelEar 相当`/`childDur`/`contentDur` を（children/LANES/keyPc/mode/BPB を引数に取る形で）抽出。SectionEditor は委譲。
- **緑［機械］**：新規 `sectionContext.test.ts`（連結オフセット・rowOf・移調・beatsPerStep 混在の防御など既存コメントの性質をテスト化）＋既存 SectionEditor テスト全緑。**抽出前後で同一 children 入力に対する sectionChords/sectionBass/sectionDrums/earChords の出力を deepEqual で突合**（バイト等価の実証）。SectionEditor の再生ノート列（playComposite）・feel・レーン描画が不変。
- **緑［耳/手]**：なし（純移設＝人間確認不要。強いて言えば実機で任意セクションを1回再生し従来どおり鳴ることだけ）。
- **bit**：純移設＝挙動不変（Task#2 の useMelodyGen 抽出と同じ流儀）。DOM/CSS 不変。

### D1 机の器＝③前景＋共有ループ＋レンズA/B（本丸・最大スライス）
- **目的**：骨格をセクションのループの上で編集し、畳み/実音を**止めずに**聴き比べる。ここまでで痛みの本体（単品編集の文脈切断）が解消。
- **触る**：新設 `SkeletonDesk.tsx`（ヘッダ=セクション名/key/meter/tempo・③前景のみ・固定下端トランスポート［▶ループ｜レンズ2択｜位置］）＋新設 `deskLens.ts`（純関数：`foldLensNotes(content, chords, bpb, bars)`＝skeletonEarNotes＋`clickNotes(bars,bpb)`(4分・小節頭アクセント・ドラムchannel or woodblock)／`realLensNotes(children, skeleton…)`＝composite＋骨格線ミックス）＋audio.ts レンズバス拡張（2.1案イ）＋App/SectionEditor の入口（骨格ブロックタップ→机。`onOpenNeta` の骨格分岐。単品経路＝ネタ帳→KindEditorBody→SkeletonEditor は不変）。
- **再利用**：SkeletonEditor のロール（抽出 or 初手コピー・§1）・useTransport・useEditHistory・sectionContext(D0)。
- **編集**：配置越し（2.3 の2段解除）・打点/休符/句境界/選択 nudge は S2 仕様のまま・自動保存 debounce＋Undo。
- **緑［機械］**：(a) deskLens 純関数のユニット＝畳みレンズの出力に**2声＋クリックのみ**が含まれコード楽器/ドラムが入らない・実音レンズ＝合成＋骨格線・クリックは4分×bars本で小節頭だけvel高、を音符列で assert (b) 配置越し編集の往復ユニット＝表示ピッチ→unfold→unshift→保存→再読込→再表示で元に戻る（2段解除の bit 往復） (c) レンズ切替で**スケジュール対象の音符列（or 案イならバスゲイン状態）が期待通り切り替わり、transport の位置が保持される**ことを駆動テスト/計測ログで確認 (d) 机で打点→updateNeta の保存 content が正しい（移調外し済み） (e) 既存テスト全緑＝SectionEditor/SkeletonEditor/合成/MIDI書き出しに骨格混入なし。
- **緑［耳/手]（オーナーへの的・3点）**：①スマホ実機で骨格ブロック→机が開き、ループ再生しながら打点できるか（スクロールで誤打点しないか） ②**再生中にレンズをトグルして音が途切れず・位置が飛ばず**、畳みで音程が読め実音で編成の座りが聞こえるか（この器の核） ③クリックの音量/音色がベッドとして邪魔でないか。
- **bit**：skeletonPlaybackNotes/skeletonEarNotes 無改変（deskLens は呼ぶだけ）。SectionEditor の変更は入口分岐のみ。

### D1.5 ループ範囲ブレース（小・早めに効く）
- **目的**：8小節等の長尺で「この2小節だけ回す」（トップライン書きは短い窓を回す＝memo §7-6）。
- **触る**：机のルーラーに範囲ブレース→ `playNotes` の既存 `loop:{startBeat,endBeat}` に渡すだけ（機構は既にある）。useTransport に range 引数を足す（未指定＝全体＝従来）。
- **緑［機械］**：range 指定時に playNotes へ渡る loop 値が正しい・未指定＝全体＝従来コードパスと同値（bit一致）。既存 useTransport 消費者（NetaDialog/SectionEditor）不変。
- **緑［耳/手]（1点）**：実機で「2小節だけ回しながら打点」が気持ちよく回るか（ブレースの掴みやすさ含む）。

### D2 接点ストリップ＋ダイアッド試聴
- **目的**：「どこが引っかかるか（目）→本当に引っかかるか（耳）」を1タップで往復。
- **触る**：机のロール下に接点行（`analyzeCounterpoint` 出力の要約列・バッジ属性で色分け）。タップ→説明ポップ＋「この瞬間だけ聴く」＝当該拍のメロ点＋実効ベース(+1oct)の2音だけ短く鳴らす（previewNote×2 で足りる・持続0.8拍程度）。新設純関数 `contactText(MelCp): string`（例「強拍の2度。掛留として解決するなら味」＝**指摘のみ・禁止しない文言**。dissonant/parallel/cross/consonant の分岐）。
- **緑［機械］**：contactText の文言分岐ユニット（dissonant/parallel/cross/consonant×強弱拍）・接点ストリップのバッジが analyzeCounterpoint の mod-12 単音程と一致（既存 intervalBadge のテーブルを崇拝＝再実装しない）・接点タップで**当該拍の2音だけ**が previewNote に渡る（ベッドの音符が混ざらないことを引数で assert）。
- **緑［耳/手]（2点）**：①指摘文が「禁止でなく味の説明」に読めるか（文言の手触り＝オーナー語彙） ②ダイアッドの持続/音量で不協和が「聴き取れる」か（短すぎて分からない、が典型の失敗）。
- **bit**：analyzeCounterpoint 無改変。

### D3 ②コード前景＝「対位の相手を書く段」
- **目的**：コード差替（分数含む）→③の導出ベース・バッジが即変わる体験。②に「この段が③の相手を決めている」を見せる。
- **触る**：机に②前景＝コードチップ列（sectionChords 表示）＋**導出ベース線の常時表示**（effectiveBassSegments 流用）。チップタップ→ `substitute_chord`（既存api）候補巡回＝**試着（ローカルstate）→採用で書込**（updateNeta・破壊上書きしない流儀・Undo可）。本格編集は既存コードエディタへ潜る（机内に別エディタを作らない）。コード進行ネタに「他N箇所で使用」バッジ＋「複製して切り離す」（copy_neta→この配置だけ差し替え）。
- **緑［機械］**：G→G/B 差替で③の当該拍バッジが 6度→4度 に変わる（seams モックの具体例をそのままユニットのシナリオに＝state 差替→analyzeCounterpoint 再計算の突合）・**採用まで在庫不変**（試着中に updateNeta が飛ばないことを assert）・「他N箇所」の N が place 数と一致・複製切り離し後は元ネタ不変＋この配置だけ新 id。
- **緑［耳/手]（2点）**：①コードチップを巡回して③の響きの変化が**ループを止めずに**耳で追えるか ②「他N箇所で使用」の警告で共有の罠が伝わるか（気づかず他所を壊す事故が起きないか）。
- **bit**：api 無改変（substitute_chord/copy_neta は既存）。
- **注**：②のレンズ［和声だけ｜編成］は「和声だけ」＝コード楽器を素の三和音で鳴らす簡易合成が要る（seams A）。**重ければ②のレンズは D5 まで後回しでよい**（②は表示と差替が本体・レンズは③のまま流用でも成立）。

### D4 ④出口トレイ＝吹く→試着→置く＋分岐スタック
- **目的**：④を「③の出口」として机に内蔵（レール表記＝書く[①②③]＋出口[④]）。表面候補を**ベッドの上で・レンズを効かせて**試聴してから置く。
- **触る**：useMelodyGen の genPart/blowSkeleton/blowSkeletonBass/候補トレイを机コンテキストで呼ぶ（ctx 引数は D0 の sectionContext で揃う）。候補の試着＝candPreview（再生中なら実音レンズのメロ枠を候補で差し替え・現骨格/現メロはゴースト）。置く＝既存契約（capture→place→link realized_from・S2/S3c のまま）。骨格チップに「→吹いたメロ N」（getBacklinks）。③叩き台（gen_skeleton 候補・句単位再抽選は後回し）も同じトレイ流儀。
- **緑［機械］**：吹く→トレイ→置く＝新メロ neta＋realized_from リンクが張られ骨格 content 不変・旧メロ不滅（吹き直しで neta が増えることを assert）・分岐スタックの N が getBacklinks 件数と一致・試着中は在庫不変（candPreview はローカル state のみ）・meta.voiceLeading バッジが S3d の summary と一致・SectionEditor 側の既存「吹く▶」ショートカット回帰緑。
- **緑［耳/手]（2点）**：①候補の**試着がループを止めずに**次周から鳴り、現メロとの比較が耳でできるか ②「書く[①②③]＋出口[④]」のレール表記で「戻って再度吹いても手直し済みメロは消えない」が直感に落ちるか（分岐スタックの見え方）。
- **bit**：gen_melody 契約無改変・meta.voiceLeading（S3d）はトレイのバッジにそのまま出す。

### D5 ①ビート前景（薄）＋レンズのステージ相対一般化
- **目的**：4前景が揃う＋レンズを一般形「焦点以外を畳む」へ（seams A の縫い）。
- **触る**：①＝リズムレーン子の表示（内部再設計はしない・タップで既存ドラムエディタへ潜る）＋レンズ［パターン単体｜ベッド］＝drums solo（partGains 流用）。レンズを `{ focusLayer, labels:[string,string], reduce() }` のステージ属性に整理し、トランスポートのレンズ2択は選択中ステージのラベルを読む。**③④の reduce は現行関数のまま＝bit一致**。②の「和声だけ」簡易合成もここで。
- **緑［機械］**：ステージ切替で transport 状態・ループ位置が維持される（駆動テスト）・**③④の reduce 出力が D1 実装と音符列 deepEqual（bit一致）**・①レンズ「パターン単体」でスケジュール音符列がドラムのみ・レンズラベルがステージごとに切り替わる。
- **緑［耳/手]（2点）**：①レンズの2ラベルが段ごとに読み替わっても「同じ1つの操作」に感じるか（Aの縫いの体感） ②①前景の solo が「自分の作業を消さない」か（seams A の破れが本当に塞がったか）。

### D6 B-lite＝「変化→耳」（粗い痕・セッション内）
- **目的**：②の差替が③の詰めた対位を黙って腐らせる問題を**見せる**（自動修正はしない）。
- **触る**：机のセッション内で「②で編集されたコード区間」を記録→③の接点のうち当該区間に載るもの＝stale（純関数：`staleContacts(editedRanges, cp[])`）。③レールに「要確認×N」痕・戻ると該当接点パルス・タップで「変化した瞬間を聴く」（D2 のダイアッド流用＝差替後の2声を鳴らす）。
- **やらない（backlog 送り・design S6 に明記済み）**：永続的な変更来歴追跡（コード区間→依存骨格接点の逆引きをDBに持つ）・クロスセクション波及（共有 chord_progression が別セクションの骨格を腐らせる通知）・背骨レールの「B波及」バッジ。
- **緑［機械］**：staleContacts 純関数のユニット（編集区間に載る接点だけ stale・区間外は非 stale・骨格編集では立たない）・seams モックのシナリオ＝③で bar2 downbeat E を G 上の6度に詰める→②で G→G/B→**stale が当該接点1つだけに立ち**要確認×1 が出る→タップでダイアッド（4度）が発火、を駆動テストで通す。
- **緑［耳/手]（2点）**：①差替で**腐った接点だけ**がパルスする（無関係な接点まで騒がない＝オオカミ少年化しない）か ②「変化した瞬間を聴く」で悪化（6度→4度）が耳で分かるか。

### D7 パーキングロット（着手時に Task 化）
- 3/4・6/4 の snap 表（付点系）／句境界ドラッグの机内仕上げ
- 句単位再抽選（「句2だけ引き直す」＝phrases 構造の使い道）
- 単品 SkeletonEditor の撤去判断（机の実使用後・部品共通化と同時）
- E＝背骨の遷移試聴（前セクション末→次セクション頭）＝**別楽器**（song エディタ側）
- B本格＝変更来歴の永続追跡＋クロスセクション波及
- ②レンズ「和声だけ」を素の三和音でなく voicing 込みに（コード楽器実装と合流）

## 4. 判断済みの裁定（統合Fableの決定・理由つき）
1. **ワークフロー正名**（design §1538 追記済み）：①〜⑤はデータ依存の**層モデル**・作業は**前景切替**＝「骨格先行の書き口 vs 机のコード/トラック先行」の噛み合わなさは、層の順序と作業の順序の混同と診断して書き分けで解消（§1548「先後非固定」と整合）。
2. **B は lite 先行**（D6）：痕＋パルス＋瞬間試聴・判定は同 section 同居・セッション内・非永続。理由＝seams memo 自身が「まず痕だけでも価値が出る」と言っており、永続依存追跡は耳FB前に作る土台として重すぎる。
3. **E は線引きのみ**：机=セクション楽器を design に明記・曲レベルの実装（遷移試聴等）は backlog。理由＝seams memo の「同じ机は諦めるのが正直」をそのまま採る。
4. **SkeletonEditor は存置**（置換しない）：ネタ帳→単品の経路は素材庫クイック確認として残す。理由＝生きている経路を壊さない縦スライス原則＋部品の供給元。撤去判断は机の実使用後。
5. **④＝③の出口**（レール正名・新画面を足さない）：seams C の裁定どおり。
6. **レンズ無停止切替は audio 拡張してでも守る**（案イ推奨）：モックで実証された体験の核＝ここを妥協すると「両方で聴きたい」が画面遷移に退化する。

## 5. 進め方の約束（プロジェクト規約の再掲）
- スライス毎：テスト先行（赤→緑）→**［機械］受け入れを自分で全部消化**→ `pnpm --filter web build`（dist焼き）→**［耳/手］の的をオーナーへ1〜3点で依頼**（操作手順つき・「全部聴いて」禁止）→ design.md S6 に DONE 追記（［耳/手］が未返なら「耳待ち」と明記）。
- ［耳/手］待ちで手を止めない（次スライスへ進んでよい）。ただし耳FBが設計を動かす類（レンズの音量バランス・クリック音色・パルスの騒がしさ）は既定値を「暫定既定・耳較正で見直し可」とコメントに書き残す（S2/S3c と同じ流儀）。
- 【骨格】/【表面】どの層を触るかを作業冒頭に明記（memory 規約）。本シリーズはほぼ【骨格】＋器。
- 節目ごとに残タスクを出す。勝手に「終わり」を宣言しない。
