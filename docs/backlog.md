# creative_manager — 積みタスク（やりそびれ・あとで）

スペック層（requirements/architecture/design）にも Task 機能にも載せきれない「いつかやる／保留」をここに貯める。
着手したら Task 化して、ここからは消すか「→ #NN」と印を付ける。最終更新を都度書く。

最終更新: 2026-07-14（コード楽器arp 幅/区切り・全GM・コード楽器2音色/MIDI音色バグ修正・骨格フォーム回帰skelForm S1/S2・一曲書くE2E受け入れ〈機能/デザイン監査を分離実施〉を反映。耳確認未消化＋デザイン据え置き1件〈極小ブロック〉を追記）

## 骨格層（design #20）実装後の負債・残り（2026-07-11・S1/S2完了時点の棚卸し→同日Fable調査でTask #1-#11に組み直し）
S1(6c1efc4)/S2(ede57f4,b741932)で骨格neta＋編集UIは動く。~~残＝S3群(→#3-#6)/S4リズムパーツ(→#7-#8)/S5歌詞(→#9)~~ → **S3群✅・S4✅(#7=88d3973/#8=a3559e0「S4完了」)済＝残は実質S5歌詞(#9)のみ**（2026-07-13棚卸し）。以下は実装中に確定した負債：
- ~~**S3d 対位法チェック露出（analyzeVoiceLeading転用）** → **#6**~~ **→ ✅S3d済 2026-07-11（api844/web404緑）**：voiceLeadingReport.ts で gen_melody/gen_bass 候補に VoiceLeadingReport を items[].meta 添付（読み取り専用・候補ノート不変）。lower＝bass明示/骨格明示ベース+コード導出/コードroot代用の順。web 候補カードに対位法バッジ（指摘のみ・score低でも置ける）。design #20 S3d 参照。**これで S3 群（S3a/b/c/d）完了**。
- ~~**骨格休符(pitch:null)が表面でまだ鳴る** → **#4**：V2アンカーがnull不可のためcarry-forward（skeletonNeta.ts skeletonToV2Skel）。根治＝breathe（句頭遅延入場）へ結線して休符区間の表面音を抑制。~~ **→ ✅S3b済 2026-07-11**：案A（restマスク別チャネル）＝skeletonRestMask で pitch:null 区間を抽出→genMotifMelodyV2 が最終出力で当該区間の onset drop＋食い込み dur を区間頭で切る。アンカーは carry-forward 据え置き（内部足場・耳に出ない）。休符なし骨格＝bit一致。design #20 S3b 参照。
- ~~**骨格phrasesがV2ブロック構造(A/A'/B展開)に未結線** → **#3**：ブロック割りは従来 phrasing ノブ由来のまま。骨格の句割りが本当に効くのはカデンツ着地とプレビュー切れ目まで。~~ **→ ✅S3a済(8b34dfb・Task#3)**：`skeletonPhrasesToV2` で骨格phrases→V2ブロック構造に結線（可変長ブロック/breathe/句末カデンツが骨格句割りで効く）。
- ~~**SectionEditor増改築のフィール劣化懸念（オーナー2026-07-11）** → **#2**：1087行・骨格レーン/トグル追加後の実測点検＋PlacePicker等の機械的分割。blowSkelRef（画面横断可変ref・genPartガードL487とrealized_fromリンクL654を条件付け）の安全化は **#1**。~~ **→ ✅#2済(2026-07-11・本doc下方「SectionEditor(~900行)の分割→Task#2で完了」参照＝1086→732行・フィール劣化なし)。blowSkelRef安全化も✅#1済(cd9e2c1＝blowSkelRef撤去・候補が骨格idを保持)**。
- ~~**「noteEditアダプタ流用」は名目のみ** → **#1**：skeletonEdit.ts pointsToNotes/notesToPointsはデッドコード・実体はnudge/deleteのコピー再実装。design記述の是正込み。~~ **→ ✅#1済(cd9e2c1・偽アダプタ削除＋design是正)**：pointsToNotes/notesToPoints は現sourceに grep 0件。
- **再生ベースoctノブ未露出**（対位法再生=+1oct固定）。オーナー要望は「表示再生とも調整可」＝表示側(+2/+3)のみ実装。聞きづらければ足す。
- **導出→明示の境界則=暫定**（明示ベース点は次の明示点か句末まで支配・句末で導出に戻る）。耳較正で見直し可（design #20に明記）。
- **SkeletonEditorがPianoRollと別実装**：意図的（PianoRoll無改変＝既存メロ編集への波及ゼロ）だが、操作系（タップ/パン区別・選択・nudge）が二重管理。安定後に共通化を検討。低リスクな共通抽出（pc/isBlack/音階集合）のみ **#1** で先行。選択編集本体は同定単位が違う（index集合 vs voice@startキー・2声横断選択）＝共通化はselbar UI程度に留めるのが現実的（2026-07-11調査）。
- **骨格の単体プレビュー用コード(preview_chords)が非state**＝エディタ内でコードを変えられない（導出ベースの源が固定）。
- ✅**メロ生成エンジンの大物負債（骨格層の動機そのもの）＝#11 経路撤去＋ノブ再編＝完了(2026-07-12)** → **~~#10（死にプロト＋Note型）~~✅・~~#11（J1〜J4）~~✅**：genMelody(generate.ts)の4経路early-return並存（補完/V2/motifModel/旧経路）を **①partial補完→②useV2 V2→④フォールバック=V2 の3経路**へ整理（③motifModel撤去）。倚音/掛留の**三重実装（applyExpression④／V2 melodyCells／genMotifMelody③）は ④撤去＋③撤去で V2 の表情パス一本に一元化＝完了**。
  - ✅**J1 呼出グラフ全数調査**(research doc 2026-07-11)・✅**J2a 3/4・6/4**(#13)・✅**J2b chordless**(#14)・✅**J2c fit useV2化**(#12)・✅**J3 旧経路④撤去＝V2一本化**(#15・2026-07-11・api874緑)：④ヘルパ~250行＋stepWeights系(learnStepWeights/learnStepWeightsFromLibrary/cScaleArr/MOVES/DEFAULT_STEP_WEIGHTS)を撤去、V2非対応拍子(2/4・5/4・7/8等)は明示エラー。design【J3】参照。
  - ✅**J4 ③motifModel(genMotifMelody)撤去＋appoggiatura ノブ削除**(#16・2026-07-12・api874緑)：generate.ts ③ブロック＋melodyCells.ts genMotifMelody関数(~95行)＋snapToChordTones の appo分岐＋appoggiatura ノブを撤去。③の受け皿＝V2フォールバック(motifModel消費・corpusModel活きる)＝useV2:true と bit 等価(invariants J4テストで実証)。共有ヘルパ(snapToChordTones本体/genSkeleton v1/genContour/sampleBarRhythm)は汎用＋単体テスト持ちで残置。design【J4】参照。
- ~~**6/4(bpb=6)メロ V2 の負dur bug**（2026-07-11 J3で発見）~~ **→ ✅済(2026-07-12・Task#17)**：render/renderPreserve のブロック末フォールバックが `*4` ハードコード（barLen非依存）ゆえ 6/4(barLen=6) で末端が実ブロック末より手前になり負gap→負dur（例 start=10/dur=-2）になっていた。`*4`→`*barLen` で根治（melodyCells.ts L639/L724・barLen=4 は同値=bit一致）。generate-invariants は 6/4 を OK_METERS＋span スイープに復帰済＝`dur>0` を全 mood×bars×seed で担保（2026-07-13 確認）。
  - ✅**#10 死にプロト撤去**：melodyCells.ts 冒頭の joint cell 遺構（parseCell/cellToNotes/MelodyCellModel/learnMelodyCells/sampleCell/genCells/realizeMelody＝テストからのみ参照）を撤去。makeRng/weightedPick は sampleBarRhythm が使うので残置。テスト14件（melody-cells.test.ts の対応describe）も削除。
  - ✅**#10 Note型一元化**：基本形 `Note={pitch,start,dur,vel?,syllable?}` を @cm/music-core に新設し SSOT 化。api の voiceLeading/phrase/voiceLeadingReport/evalMelody/melodyCells が import、chordDetect は `Note&{channel?}` 交差、web music.ts の Note は `extends CoreNote` へ。**派生は無理に統一せず残置**＝corpusBias/fit（start?/dur? 任意・fit は harmonize が import）。匿名インライン（generate.ts 等）は挙動不変優先で未着手＝#11 のノブ再編時に。
- **音価(agogic)**：上の「音価バリエーション不足」項の(a)骨格に長音アンカー案は、骨格層ではdurを持たない設計（分割方式）にしたため**リズムパーツ層（S4）の長音パーツ**で実現する方針に変わった（design #20）。
- **S4-2 L2 の web 小節ペイントUI（未実装・着手時Task化）**：S4-2（Task#8）で placement（小節ごとにパーツ名指し）＋custom（インラインパーツ）＋採取（extract_rhythm_part）は **api/MCP に実装済＝Claudeチャット経由で使える**が、web は L1 の rotate ピッカーのみ（現状維持）。bar 単位でパーツを塗る/採取ボタン→customに積む UI は大きいので送り。着手時は SectionEditor のメロ生成ノブ段に「小節×パーツ」グリッド＋「このメロから採取」を足す（design #20 S4-2 参照）。
- **骨格の机（design #20 S6・2026-07-12設計確定）から明示的に送った分**（**実装スライスD0〜D6は実装済＝2026-07-12全mainコミット**・handoff=`docs/research/2026-07-12-skeleton-desk-handoff.md`・以下は明示的に送った分＝着手したらTask化）：
  - **B本格＝変更来歴の永続追跡**：コード区間→依存骨格接点の逆引きをDB/relationに持ち、共有 chord_progression の編集が**別セクション**の骨格対位を腐らせた時に波及通知（背骨レールの「B波及」バッジ含む）。机内のセッション内 stale（B-lite・D6）で価値を実測してから。realized_from 逆引きと同じ建付け。
  - **E＝背骨（曲）楽器の遷移試聴**：前セクション末小節→次セクション頭小節を鳴らす「縫い目→耳」。机はセクション楽器＝曲レベルは別楽器（song エディタ側）・共有は transport/ループ選択/在庫のみ（design S6 の線引き）。
  - **単品 SkeletonEditor の撤去/共通化判断**：机の実使用後。ロール部品の共用抽出（SkeletonRoll）と同時に。
  - **机の後続小物**：3/4・6/4 の snap 表（付点系）・句単位再抽選（「句2だけ引き直す」）・②聴き方「コードだけ」（旧「和声だけ」・用語対応表＝design #20 S6）の voicing 込み化。
  - **①ドラム/分岐スタックの潜り導線（机に onOpenNeta）**：D4/D5 の裁定で一覧・表示のみに留めた分（design #20「D7パーキング」参照）。机に onOpenNeta 導線を1本足せば①ドラム行タップ→ドラム編集・分岐スタックタップ→旧メロへ潜れる。
  - **D3b＝②コードの「他N箇所で使用」バッジ＋複製して切り離す（copy_neta）**（2026-07-12・D3コアから切り出し）：コード進行ネタの**他セクション配置数**を出す＝`compose_edge` の逆引き（親/placements）を返す **read api が現状無い**（`/neta/:id/relations` は realized_from のみ）。S6「api無改変（生成契約を足さない）」に対し read クエリ追加の是非を要判断。api足すなら `getBacklinks(id,"compose_edge")` 相当の薄い read route＋web で N表示＋copy_neta→この配置だけ removeChild/placeChild 差し替え。D3コア（チップ/導出ベース/substitute試着採用）は着地済。
- **机レビュー(2026-07-13・Fable/Sonnet 3観点)由来の送り分**（P0=#1再スケジュール鮮度/#2 chordTrial deps/#3トレイ埋没/#4音名ガター/#5②レンズ窓切り/#8 undoChord stale＝**修正済コミット**。以下は判断/低優先で送り）：
  - ~~**#8b SF2フォールバック時レンズゲート素通し**~~ **→ 対応せず（オーナー裁定2026-07-13）**：SF2未ロード時の簡易シンセ再生で聴き方2択が両方鳴る件。**基本 SF2 が正の機能＝フォールバックは鳴らなくてよい**。修正しない。
  - ~~**sectionChords/Bass の位置=小節扱い(×BPB)＝#6**~~ **→ ✅済(2026-07-13・c.position を拍で統一・×BPB撤去・earChords と一致)**：非0位置にコード/ベースを置くと gen/fit へ4倍ずれた和声文脈が渡っていた既存潜在バグ（D0以前35fbacc由来）。オーナー承認（踏んでるデータがあっても直す）で是正。生成出力は非0位置配置のケースで変わる（正しい方へ）。
  - ~~**ループ再生中の骨格編集(打点/ドラッグ)が音に入らない＝#7**~~ **→ ✅済(2026-07-13・#7-C reschedule-in-place)**：`reloop` を「その場組み直し(transport.cancel(0)→再スケジュール・stop/startしない＝頭に戻らず途切れず)」化＋骨格編集を400ms debounce で反映。ステージ切替/コード採用/候補試聴も seamless に。begin/一括スケジュール経路・他画面は不変。**滑らかさ/間合いは実機耳確認待ち**。
  - ~~**P3小物**：接点先頭バッジのガター重なり／候補トレイ足「閉じる」右端見切れ／候補Am重複／保存失敗の無音catch~~ **→ ✅済(2026-07-13・13765b0)**：P3-1 バッジ左寄せ・P3-2 desk-cand-foot flex-wrap・P3-3 `dedupeChordSubs`(api無改変)・P3-4 saveErr表示＋タップ再試行。**残**：~~chordChips の laneChildren 再実装を sctx 受けへ~~ **→ ✅済(2026-07-13)**：deskChords.chordChips のインライン `rowOf`＋`kinds.includes` フィルタを sctx 正準の `inLane`/`rowOf` へ委譲（同一述語＝earChordsRel とバイト等価・deskChords.test 10件緑）。**SkeletonDesk 毎レンダ再計算の memo化＝据え置き**：backlog 自身が「実害薄・未確認 jank 候補」。値（chips/effChords/secCtx）は useMelodyGen へ供給されるため投機的 useMemo は stale-closure リスクの方が大きい。**実測で jank が出てから**着手（「なぜ今」を問う規律）。
- **運用**：本番webはdist配信＝**コミットしてもUIは変わらない**。機能追加後は必ず `pnpm --filter web build`（2026-07-11に「ボタンがない」事故）。apiはtsx watchで自動反映。
- **耳確認未消化**：フィール層（swing/humanize非破壊化・7/10-11分）と骨格S2の較正（強拍不協和の注意色の鳴り具合・導出→明示境界の手触り）。**＋2026-07-13追加分**＝骨格フォーム回帰 skelForm（period/aaba）のS3較正（効き/Bの対比量/カデンツ差・ABAB/AABB追加の要否）／ハープ arp の駆け上がり幅×区切りの手触り／全GM音色がSF2で鳴るか。正典＝`docs/research/2026-07-13-e2e-write-a-song-acceptance.md`（一曲書くE2E受け入れ）＋`2026-07-13-skeleton-form-reuse.md`。
- **デザインE2E監査(2026-07-13・一曲書く)の送り分**：8指摘中7件修正済（豆腐SVG化/arp折返し/区切りselect統一/レーンラベル/NaNガード/タイル折れ/MiniRoll平坦）。**据え置き1件＝セクションの極小ブロック潰れ**：1小節content×8小節セクションの疎データ固有で、`.lane-block` の min-width を上げると小節spanを超えグリッド（bar位置基準の絶対配置）と不整合になる＝タイムライン改修が要る領域。実運用でセクションを埋めれば自然に解消するため据え置き（着手時は width閾値でMiniRoll/ラベルの出し分け＝要設計）。

## メロの音価バリエーション不足＝ノート長が機械的に一律（2026-07-10・オーナー耳FB）
反復音モチーフ(Phase2案B)で**ピッチ**は良くなったが、**音価(ノート長)が全部同じくらいで機械的**＝「短い音がたくさん・長短の対比が無い」との耳FB。**別レイヤの課題**（ピッチでなくリズムの表情）。
- **原因（実コード）**：render の dur は「次onsetまでの gap を埋める」（`melodyCells.ts` render/renderPreserve の dur ループ・`gap>1.4`等の少数の切りだけ）＝onset間隔が一様なら音価も一様。onset は mkMotif のリズム語彙(RHYTHM16_DATA)＋density＋受入音数帯で決まるが、**density は総量ノブで「長短の分散(agogic)」を作らない**。＝白玉(長い持続音)と細かい動きの対比・付点・タイ・アゴーギクを狙って出す機構が無い。articulation(U6)は短く切る側で、長く延ばす側は無い。
- **音楽的な狙い**：フレーズ内の長短対比（例：頭に長い持続音→後半で細かく動く／付点＋短のロングショート／句末の長い着地）＝「歌の呼吸」。実曲は音価分布に山がある（白玉〜16分）が、生成は8分/16分の帯に固まりがち。
- **効きそうな方向（未着手・要設計）**：(a) 動機/骨格に「長音アンカー」を持たせ拍頭や句頭を伸ばす（skeleton の強拍を長く）、(b) リズム語彙に持続(タイ/白玉)を持つパターンを足し density と別に「音価の分散(rhythmicContrast ノブ)」で選好、(c) 句末カデンツ音を長く延ばす（既に一部あるが弱い）、(d) POP909の音価分布(IOI/duration ヒストグラム)を実測して目標分布に寄せる。
- **着手ルール**：Phase2の耳較正が一段落してから。まず research doc で「音価分布の実測＋長短対比の理論(agogic accent・Lerdahl-Jackendoff の grouping)」を裏取り→設計→ノブ。既定0でbit一致の新ノブとして足す（既存の density/swing と同格）。


## 締めパス(2026-07-05)で見送った改善（監査で挙がったが低優先/中リスク）
デザイン監査(サブエージェント)＋リファクタ監査で挙がったうち、明確・低リスクなもの(MIDI名ASCII/ピッカー色/PC間延び/死にコード/kindColor SSOT)は実施済。以下は見送り：
- **[デザインL] エディタ内ヘッダの一貫性**：編集画面はローカルな `← 戻る [title][✓][🗑]` バーで、Otomemo ロゴ/パンくずが消える（モバイル一画面ずつの設計上そうなっている）。パンくずを正準にするなら編集画面も `Otomemo › 器 › ネタ` にする案。ただしモバイル土台(mv-pane)と衝突しうる＝要設計。着手前に「なぜ今」を問う。
- **[デザインL] エディタのツール列/設定行の統一**：ピアノロールは 描く/選ぶ/消す ＋長さ行、section は 描く/消す ＋小節ステッパで、同role コントロールの見た目/位置が微妙に違う。いじる▾ を右寄せ固定、設定行のフィールド順を統一、等。別エディタなので本質的差はあるが揃える余地。
- **[リファクタ中] childDur/contentDur/durOf の共通化**：SectionEditor と MiniRoll に同旨の「子の実長」計算が重複。`music.ts` に純関数として抽出して共有（再帰＋bpbフォールバックを厳密に保つ）。
- **[リファクタ中] kindColor SSOT の全面適用**：色ヘルパ `kinds.kindColor` は新設・ピッカーで使用開始。作成タイル/filter-kinds/LANE_COLOR/MINI_LANES もこれ由来に寄せると kind→色の重複(5箇所)が1本化。filter-kinds は `FILTER_KINDS`+除外リスト由来にも。
- ~~**[リファクタ大] SectionEditor(~900行)の分割**~~ → **Task#2 で完了(2026-07-11)**：place-picker の state+handlers を `usePlacePicker.ts`、生成/ハモリ道具(13ノブ/候補トレイ/ハモリ/fit)を `useMelodyGen.tsx` に抽出。SectionEditor 1086→732行。JSXは現在位置に残置＝DOM/CSS不変・挙動不変(SectionEditor44/44緑)。フィール実測も劣化なしを確認＝`docs/research/2026-07-11-sectioneditor-feel-check.md`。

## 配置後に中身の尺が変わった時の「はみ出し重複」検出（保留・コスト高＝やらない）
配置/ループの重複は**配置時**に尺(スパン)判定でガード済（`spanOverlaps`・2026-07-05）。ただし
**配置した後にそのネタの中身を長く編集**すると、既存の配置は再スペースされないので後続と重なりうる
（例：1小節リズムをループ配置→後からドラムを2小節ぶんに打ち直す）。オーナー判断＝**仕方ない・やらなくてよい**
（尺変化の検出＋警告 or 自動間隔調整は、編集⇄配置の双方向依存を張る必要があり**コストが高い**）。
- **着手ルール（重要）**：やりたくなったら**まず「なぜ今それが要るか」を問う**こと。実害の頻度が低い
  （マルチ小節ネタをループ後に伸ばす、という稀な操作でしか起きない）ので、明確な理由（実使用で頻発した等）
  が無ければ着手しない。安請け合いで双方向依存を入れない。

## ~~ネタ一覧の手動並べ替え~~ → ✅実装済（design LV-A・2026-07-02）
被せ表 neta_order＋dnd-kit sortable(touch長押し)で実装。以下は当初の検討メモ（残す）。
LV1/LV2（表示密度・基準ソート）は実装済。**手で自由に上下入れ替え**は未実装（ユーザー「多分必要」）。
- **後付けは痛くない**（＝今やらなくてよい根拠）：①並び順データは**純加算**で足せる＝被せ表
  `neta_order(project, neta_id, position)` を1枚（既存 `song` overlay/`chat_thread` と同じパターン・
  既存 neta 行のマイグレ不要）。②初期順の**種は既にある**＝現状 `ORDER BY updated DESC`。後付け時に
  timestamp順で backfill すれば今の並びをそのまま初期手動順に写せる＝何も失わない。
- **実装筋（縦スライス）**：被せ表＋`reorder` API（position 更新）＋`listNeta` の ORDER BY を
  `COALESCE(neta_order.position, updated順)` に＋web は **dnd-kit の useSortable＋touchセンサー**
  （長押しで掴む・タップ再生/カード開くとの誤爆回避＝activation constraint）。
- **設計判断1つ**：順序をグローバル1本 or プロジェクト別か（ネタは複数 prj: を持てる→忠実は被せ表＝上記）。
  どちらも加算で後付け可。

## プロジェクト＝器（ワークスペース）の不足機能（2026-06-29・コード面＋E2E[SP/PC]で洗い出し）
S0-S4実装済。S5で操作面の一部を是正（下記✅）。残りは未充足。優先度[H/M/L]。
- ✅**会話の改名・削除**：ProjectScreen 会話カードに ✎改名(setChatThread.title)/🗑削除(新 deleteChatThread=履歴+所属行)。実機verify済。
- ✅**ファイルのDL修正・削除**：DLを `api.assetUrl()` に（dev破綻解消）＋🗑削除(deleteAsset・confirm)。実機verify済。
- ✅**ワークスペースから曲を新規作成**：ProjectScreen に「＋曲を組む」（現状は section を作る＝既存newSong流用。kind=song化は Task#5 待ち）。
- ✅**空プロジェクト到達**：picker を facets.projects → 新 `GET /projects`(prj:タグ ∪ project行) に変更。説明だけの器も選べる。
- ✅**会話を器へ取り込む（未仕分けの取り込み）**：ProjectScreen 会話に「＋取り込む」＝未仕分け(project=null)の会話一覧→選んで `setChatThread(project)`。実機verify済。
- ✅**ジョブ/継続研究の可視化**：`GET /projects/:p/jobs`(prj配下ネタ対象ジョブ)＝ProjectScreen「進行中・受け取り」ブロック(状態ラベル＋実況)。実機verify済。
- ✅**指示の実感表示**：Chat に「📌『器』の指示が効いています」バナー（free chat＋activeProject＋instructions時）。App が getProject で引いて渡す。実機verify済。
- **[M] ファイルの追加・プレビュー**：器画面からのアップロード→prj配下ネタ紐付け／テキスト・音のプレビューは未（**紐付け先ネタの選択が曖昧＝要設計**：器に複数曲がある時どの曲に付けるか）。
- ✅**モバイルのワークスペース土台 刷新**（2026-06-29・design「狭い＝mainpane全画面」を一級化）：状態ごとの `:has()` ハック（空→隠す/編集→fixed overlay）を撤去し、**一度に1つの全画面ビュー**モデルへ。App が `.workspace` に `mv-home`(ネタ帳主役)/`mv-pane`(mainpane=編集 or プロジェクト主役)を付与し、表示しない側を `display:none`（両方マウントのまま＝状態保持）。mainpane はモバイルで通常フロー全幅（sticky/overflow:hidden解除）。**効果**：①レール積み重ね解消(☰=ホームへ・自動畳み応急処置を撤去)②app-head が常駐＝**編集の「戻る」が☰を覆う問題が解消**③mv-pane でバブル非表示＝**最下段の被り解消**④横はみ出し無し。`useIsMobile`(matchMedia 820)・jsdomガード。E2E(Playwright)で home/project/editor 切替・戻る・PC2ペーン回帰を確認。**残（任意・小）**：ネタ帳を真のドロワー/シート化（今はビュー切替）・editor下部の余白詰め。
- **[L] プロジェクトの改名・削除**：無し。改名は prj:タグ(全ネタ)＋`chat_thread.project`＋`project`行＋localStorage 横断更新＝重い（要設計）。
- **[L] 既定会話の整合**：💬バブルを器内で開くと `cm-chat-session`(global=未仕分け)に着地し器の一覧に出ないことがある（指示バナーは出る）。新規 or 器の最新へ寄せると自然。
- **[L] 指示の即時反映**：instructions は次 spawn（idle reap=15分後 or プロセス死）から反映。走行中プロセスへの即時反映は未。


## メロ生成 brush-up（理論裏打ち済・耳確認が要るので滞留＝出先で音が聴けない間は保留）
根拠＝`docs/research/skeleton-model-crossmap.md`（我々×音楽理論 cross-map）。各々 melodyCells の層に対応。**着手は音を聴ける時に**（微細な質改善は耳検証が要る）。対処済＝骨格v2(Urlinie下降+単一頂点)・禁則跳躍除外。残：
- **① interruption の明示2分割**：句を「前半=2̂で半終止(open)→後半=1̂で完全終止(close)」に構造化。我々の open/close を端点でなく**句の二分構造**へ格上げ。終止も 1̂直行でなく **2̂(V)→1̂(I)**。[Schenker Unterbrechung]
- **② 装飾を型に当てる（最重要・「取らない音」の本質直し）**：弱位置音を generic マルコフでなく **passing（構造音間を一方向通過）/ complete・incomplete neighbor（刺繍・滑り込み）/ suspension / cambiata** の**型**で生成。[Schenker prolongation / Fux 2-5種]
- **③ 強拍 suspension の許容**：snap が強拍を一律コードトーンへ矯正＝掛留(強拍非和声→下行step解決)を潰してる。稀に許容＝「もたれ/滑り込み」表情。[Fux 4種]
- **④ Narmour 閾値の明示**：contour マルコフに **P4以下→継続(Process)/P5以上→反転(Reversal)/三全音=境界** を明示バイアス。[Narmour I-R]
- **⑤ head 選定＋反復時の構造音整列**：構造音を「強拍×協和×主音近接」で選び、反復句では**構造音も並行(parallelism)**に。[GTTM TSRPR1,2,4]
- **⑥ 変奏を句機能で位置駆動**：consequent=模続(sequence)/句末=拡大・断片化。旧 planSkeleton 資産と接続（新モチーフ経路で一旦失った）。
- **⑦ リズム16分細分（layer3）**：8分の稀(6%)な細分。BPM非依存の装飾として。

## メロ V2(A2レシピ)の利用時パラメータ（フィーチャー）
genMotifMelodyV2 は production 本線（`gen_melody` useV2）。利用時コントロール済＝repetition/rangeSteps/**motifBars(1-4)**。残フィーチャー：
- **フレーズ対称/非対称の選択**：今は厳密 2+2+2+2(対称)＝機械的。**対称⇔非対称を利用時に選べる**ように（非対称＝アウフタクト/句の伸縮/問い4+答え4の起承転結/句末拡大）。motifBars と同様にパラメータ化。ユーザー『対称も非対称も選べないとダメ』＝必須フィーチャー。
- **メロ補完(`complete_melody`)の6/8発展の作り込み**：現状 best-effort（4/4が主・compound発展の運びが粗い可能性＝みなそこ4倍補完で確認）。6/8の発展部(A'/B/A'')の図形/接続を6/8ネイティブに。補完自体は実装済＝品質の詰めのみ。
- **メロ補完の局所infill/変奏の拡張**：`seedMotif`/`keepFirstBlocks` の機構で「弱い1小節だけ差し替え」「変奏候補」も足せる（同じ「部分→V2発展」の枠）。優先度＝「より良い選択肢」方向([[project-design-philosophy-options-not-finished]])。

## 和声/終止 brush-up（理論裏打ち済＝`docs/research/harmony-cadence-theory.md`・盲点top10）
メロ側と別に**和声・終止・声部進行**が手薄。効き順（①〜④=正しく聞こえる土台／⑤〜⑧=らしさ・切なさ）：
- **① 終止タイプ選択器**：句末ごとに PAC/IAC/HC/plagal/deceptive を「和音×上声着地度数×強さ」で選ぶ（今は close=1度/open=5度の1種のみ）。
- **② 偽終止(deceptive V→vi)**：1番サビ末=偽終止／ラスト=V→I回収 のテンプレ。
- **③ メロ×低音の声部進行 減点関数**：外声2声で 並行/隠伏 P5・P8／導音解決／第7音下行 をチェック（今は完全に未監視）。
- **④ avoid-note 回避**：強拍/ロングトーンが回避音(コードトーン半音上)なら passing 扱い or 和音差替。
- **⑤ 二次ドミナント(V/x)**：任意コード前に完全5度上 dom7 を挿入する決定的関数。
- **⑥ サブドミナントマイナー(iv＝♭6→5)**：IV→iv→I。J-POPの切なさ。借用/モーダルミクスチャー一般。
- **⑦ 強拍 suspension/appoggiatura 許容**（melody brush-up ③と同件）。
- **⑧ 非和声音を型に**（PT/NT/APP/SUS/ET/ANT/Pedal を拍で出し分け・melody brush-up ②と同件）。
- **⑨ 和声リズム制御**：コード交替速度を独立軸化＋コード変化拍に構造音同期。
- **⑩ T–PD–D–T 方向バイアス＋終止前定型**（ii–V–I / IV–V–I / I⁶⁴–V）を句末テンプレ化。
J-POP特効＝サブドミナントマイナー(♭6→5)・偽終止の構成的使い分け・ラインクリシェ(半音下行)・王道のV→iii。

## 簡易作曲ツールの不足（2026-07-01・実コードで棚卸し＝フィーチャー群・着手時Task化）
「一曲を書き上げる」動線の穴。影響順。※undo/redo と 跳ね/swing は下の既載と重複＝ここに集約。
### A. 編集の手触り（最優先・毎回引っかかる）
- ✅**エディタの Undo/Redo**（2026-07-01 実装・design 決定U1-U3）：`history.ts`(純ロジック+`useEditHistory`)＋NetaDialog に content 一式 snapshot 履歴＝melody/chord/bass/rhythm/chord_pattern 全部に一発。UI＝**TransportBar 左に ↩/↪**(文字矢印・空でdisable)。TDD6＋Playwright実機OK。**残＝section/song コンテナ対応・「取り消しました」トースト・テキスト系(title/text)は input native に委譲**。※backlog「ネタの版管理(chat書込のサーバ側undo)」とは別レイヤ・両立。
- ✅**ノート編集の拡充**（2026-07-02 実装・design N1-N3・案A）：ロールに[描く]/[選ぶ]トグル＋タップ選択(複数)＋選択バー(複製/コピー/貼付/削除/←→↑↓nudge移動)。`noteEdit.ts`純ロジックTDD6・Undo自動連動・選択=黄枠。web227緑・Playwright実機OK。**残＝範囲マーキー・ドラッグ移動(v2)**。
- **ベロシティ/強弱編集**（今は一律100・「後回し」コメント）：ロールで音符別 vel/音量カーブ。**humanize の土台**。
### B. 一曲に仕上げる
- **曲フォーム組み立て**（section/song箱はあるが薄い）：section を A-B-A/サビ繰り返しで並べ1曲化するタイムライン・リピート・セクション再利用。
- **簡易ミックス**（無し）：パート毎の 音量/ミュート/ソロ（バランス＋「今これだけ聴く」＝書きながら集中）。
### C. 外に出す
- **音声(WAV/mp3)書き出し**（無し・MIDIのみ）：`OfflineAudioContext`/`MediaRecorder` で合成をバウンス＝デモ共有/保存。**仮歌レンダとも土台共有**。
- **MusicXML 書き出し**（入力のみ）：リードシート/外部エディタ受け渡し（**仮歌の橋＝VOICEVOX公式Song/OpenUTAU と同じ**）。
### D. メロの書きやすさ（ユーザーの苦手×最優先に効く）
- **スケール/コードトーン ハイライト**（無し）：ロール上で「調内/コード内」を可視化＝外し音を避ける。
- **メトロノーム/カウントイン**（無し）。跳ね/スイング（下記「跳ねるボタン」）。
- **アルペジエーター（新規・2026-07-04）**：メロのパッド入力(StepPad)を撤去した際に出た案。パッド的な"素早く音形を作る"用途は、格子タップでなく**アルペジエーターとして別実装すべき**（コード/スケールを与えて up/down/updown・レート・オクターブ幅で音形生成＝候補プレビュー→ネタ化）。コード楽器(chord_pattern)の arp とも近い＝設計を寄せられるか要検討。着手時 Task 化。**※2026-07-13：chord_pattern の arp に「駆け上がり幅(arpOctaves 1-4)＋区切り(arpReset 拍)＋向き」を追加済（design #CP）＝この語彙/機構を melody 用アルペジエーターに流用できる。ただし「各stepの音を手指定」はシーケンサー化ゆえ chord_pattern 側では意図的に非対応＝独立アルペジエーターが担う住み分け。**

## 機能（中〜大）
- **仮歌入れ込み（歌声合成・別口／2026-07-01 研究クローズ）**：流し込んだ歌詞(`Note.syllable`)でメロを"仮歌"として鳴らす。調査＝`docs/research/2026-07-01-singing-voice-synthesis.md`（**VOICEVOX歌唱をローカルCPUで実測＝リアルタイムより速い0.38x・音質OK・footprint≈2GB常駐1・sudo不要**）。最小実装案＝**①ラフ歌唱プレビュー**（VOICEVOX HTTP `sing_frame_audio_query→frame_synthesis`・Score={notes:[{key:MIDI,frame_length,lyric:かな}]}・93.75fps・先頭休符必須／**編集毎の自動再生成はしない＝「🎤歌わせる」明示レンダ＋content-hashキャッシュ＋stale表示**・job/asset(role=render)に乗る）→**②MusicXML/MIDI+歌詞の書き出し**（今は入力のみ＝橋を新設。VOICEVOX公式Song/OpenUTAU へ受け渡し）→**③表現編集(f0/volume/phonemeをフレーム編集＝ビブラート/しゃくり/強弱)は自作の余地**（offloadだけでなく自前UIも可・ユーザー意向）。声質そのものはモデル焼込＝SynthV領分。着手時 Task 化。
- **コード楽器のテンション込みvoicing**：コード語彙拡張(2026-06-30・S1-S3)で進行プレビュー/MIDIはテンション(9/13等)が鳴るが、**comping(chord_pattern)の voicing は当面 R/3/5/7 まで**＝9/11/13 をボイシングに積めない。voicing tones に「9/11/13」を足す＋テンション配置(上に開く/5度オミット)を設計。併せて **compingの声部進行最適化**（アンカー最寄りで跳ねは消えたが、共通音保持/最小移動の本格ボイスリーディングは未）。
- **跳ね/スイング＝亜種(「跳ねるボタン」)**：Layer①の拍セル・リズムモデルは**均等グリッド前提**（16分/8分ストレート）。スイング・三連跳ねは**打点位置を後処理で 1/3:2/3 等にマップし直す**「跳ねるボタン」で亜種化＝**語彙/遷移表はそのまま流用**できる（学習し直し不要）。Layer① が乗ってから着手。
- **ネタの版管理（undo/redo）**：チャットの書込（revise/assemble）を**取り消せる/やり直せる**ようにする。
  いまは capture のみ undo=削除で可逆（S3b）。revise/assemble は「変更前」が無く undo できない＝
  サーバ側に **ネタの履歴（version 列 or 別表）+ /neta/:id/undo,/redo** を足すのが本筋。設計から起こす。
  （#100④a「書いてから可逆」を本当に成立させるための土台。）
- **調査系タスク＝Claude コマンド化（承認/トレイ配送の作り直し・2026-07-05 退避）**：Chat の旧承認ワークフローは
  撤去済（design.md「Chat 旧ジョブ流路を撤去」）。**曲の調査系タスクを実装する時に、下記 UX 契約を Claude
  コマンド（headless Claude が裏で調査/生成しネタを書く）流で作り直す**＝受け入れ条件：
  ① **承認ワークフロー**（変異を即適用せず、原本↔提案を並置・試聴・比較→個別/すべて承認→承認時のみ書込）。
     ※単発の可逆変異は現状の書込カードで足りる＝これは**複数提案のバッチ triage** が要る時に導入。
  ② **裏で続行→受け取りトレイ配送**（チャットを閉じても裏で走り、結果がトレイ📥＋由来チャットに届く）。
  ③ **待ち UX**（確定進捗 done/total＋『待たずに戻る』＝裏で継続）。同期ターンには不要、非同期タスクで再導入。
  実行基盤は worker(Python) でなく Claude コマンドで設計（memory「worker脳撤去→Claude脳」と整合）。
- ~~**worker の claude_prompt 完全撤去（#100 の最終形）**~~ → ✅**worker脑撤去 完了**（2026-07-05）。①生成→決定的
  `/gen/section`（GN-08）②scheduled research→api内claude実行器（`research-runner.ts`）③`claude_prompt`＋10 LLMハンドラ
  （brainstorm/suggest/gen_melody/gen_chord/gen_rhythm/gen_variations/gen_lyric/fetch/research/collect）＋死にヘルパ撤去。
  **worker は 100% 決定的**（import_midi＋rule handlers）。`grep claude_prompt apps/worker/src`=空・pytest 28緑・api442緑。
  - ✅**済**：`import_midi` は **api へ TS(@tonejs/midi)移植済**（`apps/api/src/midi-import.ts`＝`parseMidiImport`／`main.ts:108` の
    job consumer で parse→completeJob→reaper が materialize）。∴ **ジョブ処理系の worker は撤去完了**。`apps/worker` に残るのは
    **cm-search（意味検索・:8788）だけ**＝存続方針（architecture「残る唯一のPython」）なので apps/worker 自体は削除しない。
- **research に外部検索ツールを足すか検討**：今は research streaming＝Claude の知識のみ（実在曲を語る）。
  ネット検索が要るなら MCP に research/web ツールを追加（要・到達/プライバシー判断）。

## 片付け（小〜中）
- ~~**Chat.tsx 旧ジョブ経路の死にコード撤去**~~ → ✅撤去済（2026-07-05・A案）。`runJob`/`handleConsult`/
  `waitForJob`/`finishWait`/`pick`/`applyProposal`/`saveRef`＋`ProposalCard`/`ProposalGroup`＋型＋`waitInfo`/
  `cancelWait`＋死にCSS を除去。承認/トレイ配送/待たずに戻る の **UX 契約は design.md「Chat 旧ジョブ流路を撤去」
  ＋下記『調査系タスク＝Claude コマンド化』に退避**。web273緑。
- ✅**済（2026-07-07・負債D9）systemd 自動起動**：`deploy/systemd/install.sh` を実行し cm-api/cm-search/
  cm-backup.timer を `--user` systemd に enable＋linger 設定（再起動・ログアウトでも生存）。全 active・health OK。
  ついでに install の潜在バグを修正：systemd の非対話ログインシェルは `~/.bashrc` を読まず pnpm/node(nvm) が
  PATH に載らない → cm-api.service の ExecStart で pnpm home 前置＋nvm.sh source を明示（そのままでは起動失敗した）。
- ✅**済（2026-07-07・負債D8）systemd 死にユニット剪定**：`cm-worker.service` を削除、`install.sh` から cm-worker の
  pkill 行と enable 対象を除去（cm-music-mcp 参照は install.sh には元々無し）。生存ユニットは cm-api/cm-search/cm-backup の3つに揃った。

## チャット E2E 由来（2026-07-05・詳細=docs/research/chat-e2e-2026-07-05.md）
  <!-- BUG#1(allowlist不一致)・BUG#2(アナリーゼ誠実化)・ネタカード非永続 は 2026-07-05 修正済(design S6+/S7/S8)。 -->
- **BUG#2 続き【任意・低】URL→audio_analyze 橋渡し**：曲名/URLアナリーゼは今は「推定＋取込🎵へ誘導」で誠実化済。
  さらに踏み込むなら、チャットで URL を渡されたら audio_analyze ジョブを自動起票(create_job)して本物MIRに繋ぐ。
- **BUG#3【低】孤児スレッド剪定**：user発言のみ返信欠落の空スレッド(S5前のストリーム切れ残骸)が3本。
  空/片方向スレッドを履歴一覧から畳む or 掃除ボタン。実害なし・美観。role不整合(ai/assistant)も同様に低。
- **【低】chat-live のバッファ肥大化**（S5+ で顕在化）：`--include-partial-messages` 化で `chat-live` が
  `text_delta` を**全部**バッファする＝長い生成＋再アタッチでリプレイが重い。粗いイベント(assistant/tool/result)だけ
  バッファし、live 購読者にだけデルタをファンアウトする（reattach は full ブロックで一括表示＝復帰は十分）分離が素直。今は実害小で放置。

## 運用・監視
- **quota（7日）監視**：常駐 claude は Max 認証。7日クォータの天井に近いと会話が死ぬ。枯渇検知＋表示。
  <!-- 「バッチジョブの true cancel」は 2026-07-05 実装済＝job-procs.ts＋DELETE /job/:id で abort→SIGKILL
       （design「#100④-S6+」）。削除でプロセスも止まる。 -->

## ドッグフード由来（低優先・UX磨き）
- 再生トランスポートの絵文字 □ 化 → SVG アイコンに。
- 意味検索が 0 件のときのヒント表示（無言にしない）。
- スマホの mood 入力が見切れる。
- セクションエディタのオーバーレイが一部欠ける（sliver）。

## 音源(SF2)ロードの重さ（2026-07-09・ドッグフード「音出るまで時間かかる」由来）
- ✅**済＝多重DL根絶(50c91c7)**：smplr 1.0.0 が sampler 毎に global fetch(url) を直叩き→旋律＋ドラム十数本で同じ31MBを12回同時DL(実測370MB)。global fetch を SF2 URL だけ横取りし1回DLを全 sampler で共有(370MB→30.8MB)。先読みもアイドル裏読みに戻した。
- **残**：既定SF2が**31MB**と大きく、Chromeはこのサイズをブラウザキャッシュに乗せない（実測・逐次でも再DL）＝**ページを開き直す毎に31MB DL**。削減案：①より小さい既定SF2（数MB級のGM音源）を用意②IndexedDB/CacheStorage に本体を永続化しセッションを跨いで再利用（smplr の `CacheStorage` は Soundfont2 loader が storage 無視なので使えない→自前で ArrayBuffer を IndexedDB 保存し、横取り fetch でそこから返す）。着手時Task化。

## フロント初回展開の重さ＝バンドル分割（2026-07-09・ドッグフード「Section開くのが重い」由来）
Playwright実測(CPU6倍絞り)＝一覧4.3s/初回セクション展開2.5s。**済**：一覧プレビュー遅延描画(LazyPreview)でDOM rect 1775→135・composition取得 全コンテナ→見える1件・取得の詰まり解消(f356471)、Section読込失敗の再試行バー。
- **残（本丸）**：壁時計の初回展開はSVGでなく **1.4MB JSバンドル**(index 625KB+340KB+…)のパース+初回JITが主因。コード分割で削る：①Tone.js/SoundFont を再生操作まで遅延ロード（`import()`）②SectionEditor/Chat 等の重い画面を `React.lazy`③`manualChunks` でベンダ分離。着手時Task化。実測は `apps/web` の Playwright スクリプト流儀（scratchpadに雛形あり・恒久化するなら test:e2e に統合）。

## DB肥大（job.params の base64 音声・2026-07-09 サブエージェント調査）
真犯人＝study/audio_analyze が **base64 音声を `job.params` に永続保存**（1件最大24MB・job テーブルだけで99MB＝DB本体127MBの大半）。
- ✅**済 P1（df54e86）**：一覧経路（`listJobs`/`listForProjectTag`）から `params` を除外＝15秒ポーリングの払い出しを **85.9MB/2.14s→1.47MB/0.063s（実測・約58倍）**。
- ✅**済 P3＝既存肥大の回収（2026-07-09・ユーザー選択「asset に移して1本化」）**：`apps/api/scripts/migrate-audio-to-assets.ts`（DRY既定・content-hash 重複排除）で既存 base64 音源（DeepSea×5＋LostMemory×3＝実質2曲）を `asset`(data/assets/*.mp3・kind=audio) へ1本化・生存ネタに source リンク→全 job.params から base64 除去→VACUUM。**DB 127.1MB→6.7MB（実測・約19分の1）**。バックアップ＝`data/backups/*.before-audio-migrate.20260709-093945`。
- ✅**済 P2（2026-07-09・前向き防止）**：今後の study/audio_analyze は**音源を asset(重複排除)へ保存＋処理後に params の audio_b64 を strip**＝done後に base64 が残らない（再蓄積の恒久防止）。共有ヘルパ `audio-asset.ts`（`saveAudioAsset`＝content-hash dedup／`assetsDir` SSOT化）・`core.stripJobAudio`。reaper が結果の `audio_asset_id`／`audioAssets[]` を生成ネタへ `role=source` リンク。design #16 に契約明記。ユニット6本＋実機e2e（fail時も strip＋asset保存を確認・後始末済）。
- 潜在（現規模で低優先）＝listNeta/getComposition の tags N+1（1425行で5.6ms＝無害・万件規模で `IN(...)`一括へ）。

## e2e spec の陳腐化（2026-07-12・大手術後の一括e2e検証）＝✅**全解消済**
大手術（メロ生成V2一本化＋SectionEditor分割）後の全e2e通しで13赤。**全て大手術と無関係**（UI崩れ・機能退行はゼロと確認）＝過去の意図的UX変更/環境にspecが未追従だっただけ。**全13を現行UXへfaithfulに追従して解消**（プロダクトコード無改変・specとconfigのみ／最終通し 28 passed・2 flaky[並列DB競合でリトライ自己修復]・0 failed）：
- ✅**保存ボタン系 7件**（crud×3・editors×3・section-save×1）＝自動保存化(26f465f)で明示「保存」撤去済→「編集で値確定→`getByLabel("close")`（EditorHeaderの戻る＝`useNetaEditor.close()`が未保存をflush）で閉じ一覧へ」に書換。crud の削除ボタンも同リファクタでアイコン化(`aria-label="削除"`)＝追随。
- ✅**midi.spec 1件**＝MIDI書き出しが単体編集→Section「いじる▾」へ移設(2026-07-04)→section作成＋メロ配置→`getByLabel("tools")`→`export-midi`/`export-midi-split` でDL検証。
- ✅**search/section-dnd セレクタ腐敗 2件**＝toggle-filters廃止(常時表示)へ追従・kind-filter群→個別ボタンのdisabled判定／`@12` を `block-` に限定（remove-…@12 との二重マッチ是正）。
- ✅**chat-stream 3件**＝**環境要因ではなく既定configの設定漏れ**。この spec は専用config(playwright.chat.config.ts・フェイクclaude・`pnpm test:e2e:chat`)専用なのに、既定configに testIgnore が無く実claude/実MCP背後で走って必ず赤→既定configに `testIgnore:/chat-stream\.spec\.ts$/` を追加して除外。

## デザイン回帰監査（2026-07-12・大手術後・二重法でやり直し）
初回監査が「フルページ流し見＋絶対破綻(overflow/overlap)のみ」で甘く、実デグレ（作成タイル孤立）を見落としてオーナー激怒。**二重法で再監査**＝①ベースライン(85765ee=#20 UI着手前)を worktree で実ビルドし現行と同一データ・同一ビューで**視覚diff**（客観）②現行UIを**要素単位で拡大**して敵対的検分。教訓＝**デザイン監査はベースライン差分＋コンポ拡大が必須**、絶対破綻チェックだけでは相対劣化を拾えない。
- 根本パターン：**ede57f4(骨格層S2)が「骨格」を作成種に足したが下流の追従を全部忘れた**（グリッド列数・フィルタ配列・rel-itemスタイル）＝#1〜#3は同根の芋づる。
- ✅**#1 作成タイル孤立を修正**（`.ct-parts` 5列→6列・モバイルは詳細度付き@mediaで3×2＝assets-bass.css）。実測: モバイル3×2/デスクトップ6列1行・孤立ゼロ。**CSS罠**＝@mediaは詳細度を上げず後方の基底ルールに負ける(base.css:109と同型)→`.create-tiles .ct-parts`で勝たせた。
- ✅**#2 rel-itemの青CTA化を修正**（span→button化でグローバルbutton継承→`.rel-item`にbg透明/color:inherit/fw400を追加＝chat.css）。realizedの青地青文字の低コントラストも解消。computed実測で裏取り。骨格→表面化(realized_from)＝#20本流で出るので実害あった。
- ✅**#3 骨格を種別フィルタに追加**（オーナー「やって」）＝App.tsx filter-kinds に skeleton をメロ直後に追加＋`.filter-kinds` grid repeat(9)→10。実測: 10チップが行幅358に収まり横はみ出し無し・骨格チップ描画確認。※`filterable` は kinds.ts 以外どこからも読まれない死にメタと判明（フィルタ行はハードコード）＝矛盾の実害は元々無かったが、ギャップ(骨格を絞れない)自体を解消。
- ❌**#4 SectionEditorモバイルの空レーン/ラベル潰れ＝却下（誤検出）**：オーナー指摘で再考＝空レーンは「空きをタップ→置く」の**配置ターゲット**（骨格レーンは#20一級レーンの提示・常時2声の意図）＝隠す/畳むと配置機能を殺す改悪。ラベル「6/…」潰れも8ブロック×390pxの密度の宿命＋当該ネタが偶々「6/8…」始まりの命名なだけ＝回帰でない（レーン名＋色で判別可）。**直さない**。教訓＝監査は「甘い見落とし」も「過剰申告」も不可、#4は後者だった。
- ✅**既存: 設定/Trayダイアログのモバイル縦間延び**（大手術のデグレではない既存粗）＝`.dialog` モバイル(100dvh grid)に `align-content:start` で上詰め（dialog-forms.css）。実測: 子要素間gap 約150px→[8,20]px。
- ✔**既存: Chat生Markdown壁＝偽陽性**（大手術無関係・調査で棄却）：現行AIメッセージは P/OL/TABLE/UL/HR へ完全パース（ReactMarkdown+remarkGfm 正常・改行保持）。監査が見た壁は再現せず＝ストリーム途中orその1メッセージ固有の崩れ。**コード修正対象なし**（捏造修正しない）。もし現物で再現するメッセージがあれば別途調査。

## データ収集（要ユーザー関与）
- メロコーパスのデータ収集（Hooktheory 型・Task #59）。
- 確認リストの維持（自走中の不明点・Task #10）。
