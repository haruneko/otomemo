# UI全機能棚卸し＋夜間監査計画（2026-07-15）

**目的**：全画面×全機能を一覧化→PC/SP双方で一個一個動作検証（スクショ保存）→壊れているものを修正、上流（設計）に波及するものは起票。オーナー既知の不満：①いじるシートのメロ🎲が動かない ②再生タイミングが一定しない。

**方法**：コード起点の棚卸し（4並列・本doc）＋計画の敵対的監査（G1-23・末尾）→ Playwright実走（PC 1280×800／SP 360×800 touch DPR2）。
**検証環境**：本番DBクローン＋本番同一dist配信のサンドボックスapi（127.0.0.1:8790、CM_FAKE_CLAUDE）。本番DBへは不書込。スクショ＝`logs/ui-audit-2026-07-15/`（gitignore済）。検証結果は別doc（2026-07-15-ui-audit-results.md）へ。

---

## 1. トップ画面（App.tsx＋NetaList/CreateShelf/FilterDrawer/KindTiles/ImportPanel/Tray/設定）

### App.tsx（トップの器）
| 機能 | 操作方法 | 期待挙動 | PC/SP差・条件 |
|---|---|---|---|
| ネタ帳レール開閉 | `toggle-rail`（☰） | `.notebook.closed`トグル | PCのみ(L445) |
| ホームへ | `.app-brand` | active/projectView解除 | 編集中SPはヘッダ非表示 |
| 器画面へ | `.app-crumb[project-home]` | projectView=true | activeProject時のみ |
| 機材相談 | `gear-chat` | gearモードChat | 常時 |
| 受け取りトレイ | `tray`＋`.badge` | Tray開く・seen更新 | doneCount>0でバッジ |
| 設定 | `settings` | 設定ダイアログ | 常時 |
| スコープすべて/未仕分け/器チップ/ライブラリ | `.proj-chip[role=tab]` | 絞り切替（未仕分け=prj無し、libは意味検索なし） | aria-selected連動 |
| ＋新規プロジェクト | `new-project` | prompt→setProject永続→アクティブ化 | 空名no-op |
| ＋作る▾ | `open-create-shelf` | CreateShelfボトムシート | 常時 |
| 検索 | `input[search]` | ハイブリッド検索（API不通はLIKE退避）。旧結果がseqで上書きされない | 常時 |
| 絞る▾ | `open-filter-drawer` | FilterDrawer。絞り中`.set` | 常時 |
| 意味検索劣化バナー | `search-degraded` | cm-search不通時のみ警告 | q入力中 |
| 種別行 | KindTiles row | 上位6・実在kindのみ | 検索中非表示 |
| つづき行 | `resume` | 最終更新1件をopenTop | 純ブラウズ時のみ |
| 検索合流 | `create-suggest` | 種別名前方一致で「＋◯◯を作る」 | q入力時 |
| ＋曲を組む | `.mainpane-empty .primary` | newSong(kind=song) | active無し時 |
| Chat FAB | `.chat-bubble` | openChat | !chatOpen && !deskTarget |
| D&D:レーン配置 | ハンドル→レーン | placeChild(row→ord) | active=section/song・kind一致 |
| D&D:並べ替え | ハンドル→別カード | 楽観arrayMove→reorderNeta | 素のproject一覧のみ |
| ドラッグ閾値 | PC=5px / SP=長押し250ms | タップ再生/開くと両立 | L155 |
| Android戻る | popstate | 最前面1レイヤ閉じ（トレイ>Chat>机>潜り>編集>器画面） | 単一guard L97-141 |
| オフライン同期 | onlineイベント | flushOutbox→reload | — |
| ジョブポーリング | 15s interval | doneバッジ＋新規完了でreload | — |
| SoundFont温め | pointerdown/idle | initSoundFont→prewarm（冪等） | L326 |

### NetaList / NetaCard
| 機能 | 操作方法 | 期待挙動 | 条件 |
|---|---|---|---|
| 表示密度 | `.list-density`（▦/☰） | dense切替・localStorage永続 | 既定list |
| 並べ替え | `select.list-sort` | 既定順/更新/種別/タイトル | 永続 |
| ドラッグハンドル | `drag-{id}`（⠿） | 並べ替え/配置の掴み | canReorder時 |
| 開く | `.card-main[role=button]` | onOpen | 常時 |
| 単独再生/停止 | `play-{id}`（▶/⏹） | playNotes/停止 | MUSIC_KINDSのみ |
| コンテナ合成再生 | 同 | getComposition→合成再生 | section/song |
| 相談 | 「相談」 | onChat(neta) | カードモード |
| more展開 | `more-{id}` | 副操作（外/Escで閉じ） | 非dense時 |
| 器へ▾/入れる/出す | `assign-{id}`/`.assign-menu` | assignProjectトグル | project時 |
| ＋新しい器 | `assign-new-{id}` | prompt→付与 | — |
| 複製 | 「複製」 | copyNeta | project時 |
| ライブラリへ | 「ライブラリへ」 | setScope(library) | project時 |
| ＋プロジェクトへ | — | copyNeta | library時 |
| 作例を生成 | 「作例を生成」 | genSection | ※scope/kind無差別に出る（怪しい） |

### CreateShelf（＋作る▾）
- パーツ9タイル（メロ/骨格/対旋律/コード=chord_progression/ベース/リズム/コード楽器=chord_pattern/リフ/管弦=section_inst）＋組み立て・文字4タイル（セクション/曲=newSong/歌詞/テーマ）→ createBlank→エディタ直行。取込トグル`toggle-import`。backdrop/✕で閉じ。

### ImportPanel（取込）
| 機能 | 入力 | 挙動 |
|---|---|---|
| MIDI取込 | `.mid,.midi`複数 | base64→import_midiジョブ・最長12s毎秒reload |
| 楽譜取込 | `.musicxml,.xml`複数 | ローカルparseMusicXml→melodyネタ（prjタグ付） |
| ハミング録音 | HummingRecorder | 録音→pitchTrackToNotes→melodyネタ（※prjタグ無し＝怪しい） |
| 音源アナリーゼ | audio/*単一 | audio_analyzeジョブ→トレイ |
| URLアナリーゼ | `analyze-url`+Enter | 同上（失敗無通知＝怪しい） |
| 歌詞取込 | `.txt`複数 | 空行分割→lyricネタ群 |

### FilterDrawer / KindTiles
- 種別タイル格子（件数降順・`kind-filter-{k}`・再タップ解除）＋0件ゴースト`kt-zero`（非操作）＋mood入力`mood-filter`（クライアント側filter）。

### Tray（受け取りトレイ）
- 由来チャットを開く`open-chat`／ジョブ削除・実行中停止`delete-job`／結果ネタを開く`open-result`／waiting時の自由回答`answer-{id}`・構造化フォーム`form-{id}-{key}`→answerJob。

### 設定（Theme/SoundFont）
- テーマ：プリセットselect＋kind別color picker＋既定に戻す。
- SoundFont：SF2選択`sf-select-{id}`/削除`sf-delete-{id}`/アップロード`sf-upload`/試聴チップ6種`sf-audition-*`（SF2無しでも簡易シンセ）/読み込み確認`sf-test`/状態ピル`sf-status`。

---

## 2. ネタ編集（NetaDialog＋kind別エディタ）

### kind→エディタ対応（KindEditorBody）
melody→PianoRoll(歌詞ON・いじる▾あり)／bass絶対→PianoRoll(低域)・相対→BassStepEditor／counter・riff→PianoRoll(歌詞OFF)／chord系→ChordEditor／chord_pattern・section_inst→ChordPatternEditor／rhythm→RhythmEditor／skeleton→SkeletonEditor／section・song→SectionEditor／テキスト系→textarea(lyricはモーラ表示)。TransportBarはisMusicのみ。

### EditorHeader / MetaPanel
- 戻る`close`（未保存フラッシュ→閉）／タイトル`title`（600msデバウンス保存）／保存状態`save-status[data-state]`（タップで即保存）／削除（confirm）。
- メタ（折り畳み・localStorage記憶）：調`key`・長短`mode`（音楽/容器のみ、rhythm除く）／調を推定`detect-key`（chord時・候補巡回）／拍子`meter`／テンポ`tempo`／音色`program`（melody/bass/chordPat）／＋1小節（melodyのみ）／小節数BarsControl・弱起`pickup-*`（ロール系）／継続して調べる`continuous-research`（テキスト系のみ）／タグ・ムード。

### KindEditorBody ツール
- bass絶対/相対トグル／描く・選ぶ・消す`mode-draw/select/erase`／いじる▾`tools`（melody・非候補時）＝崩す`reshape`・調推定`detect-key-melody`・似たメロ`find-similar-melody`・移調±半音±8va／崩し候補バー（強さ弱中強・別案・新ネタ保存`save-candidate`・破棄）。

### PianoRoll
- 音価NoteValuePicker＋付点／セルtap配置（即プレビュー発音）・tap削除／鍵盤プレビュー`key-{name}`／選択モード：複製`dup`・コピー`copy`・貼付`paste`（arm→セルtap）・削除`del`・nudge4方向／歌詞流し込み`lyric-draft`+`flow-lyric`・クリア／調内音ハイライト／プレイヘッド。

### BassStepEditor（相対）
- レーン8/7/5/3/R/→approach。度数セルtap配置（モノフォニック・即発音）・同所tap削除。BarsControl・音価・付点。

### ChordEditor
- ＋コード追加（reflow）／削除`remove-chord-{i}`／root・triad・ext・alt・オンベースselect／長さ`len-{i}-{v}`・付点`dot-{i}`／再生中ハイライト（100msポーリング）。

### ChordPatternEditor（chord_pattern/section_inst）
- hitセル`hit-{s}`（頭=消す/伸び=長さ/空き=新規・和音プレビュー）／音価・付点・BarsControl(max4)／ストラム⇄アルペジオ／トップ音`top-*`・広がり`spread`・向き`arp-*`・駆け上がり幅・区切り／パワーコード（strum時）／高さ`oct-*`。

### RhythmEditor
- BarsControl(max4・拍子依存)／ドラムキットselect（アコ/エレキ）／hitセル`hit-{lane}-{step}`（onにした時だけ発音）。

### TransportBar / MixerControl
- Undo/Redo／頭出し`rewind`／再生/一時停止`play-pause[aria-pressed]`（Spaceキー可・入力中無効）／ループ`loop`（再生中は再begin）／位置`position`（毎フレームref直書き）／ミキサー`volume`→master＋パート別range（localStorage `cm.mix`・再生中即反映）。

### RelationsPanel / PlacePicker
- 連関：`relation-{type}-{id}`で相手を開く（realized_fromは向きラベル）。
- 配置ピッカー：検索`picker-search`／元ネタ絞り`picker-source`／拍子一致トグル`picker-other-meter`／新規作成`picker-create`／おすすめ`picker-rec-{id}`／配置`place-{id}`／試聴`preview-{id}`。

### 小物
- NumberField：空入力許容→blurで元値復元。BarsControl：`bars-dec/inc/count`境界disabled。NoteValuePicker：`16/8/4/2/1`+`dotted`。MiniRoll：読み取り専用svg`mini-preview`。

---

## 3. Section編集・いじる・骨格（SectionEditor/TinkerSheet/useMelodyGen/SkeletonEditor/SkeletonDesk）

### SectionEditor
| 機能 | 操作 | 挙動 |
|---|---|---|
| 通常/消しゴム | `mode-edit`/`mode-erase` | tap=編集(骨格は机へ)／tap一発で外す |
| いじる▾ | `tools` | TinkerSheet開閉 |
| 尺 | `bars-dec8/dec/inc/inc8`・`bars-count` | ±1/±8（8〜32/64） |
| 空セル配置 | `place-{lane}-{bar}` | PlacePicker起動 |
| ブロック編集 | `block-{id}@{pos}` | 潜る／骨格=机 |
| ループ伸ばし | `extend-{id}@{pos}`ドラッグ | unit刻みタイル反復・縮め=末尾削除 |
| 骨格:メロ/ベ/対旋律を作る | `blow-{id}`/`blow-bass-{id}`/`blow-counter-{id}` | gen_melody/bass/counter(skeletonNetaId)→候補 |
| 骨格:コード推定 | `estimate-{id}` | harmonize→chord候補（コード無時のみ） |
| 候補トレイ | `candidate-tray` | 試聴`audition-candidate`/keep`keep-candidate`/置く`place-candidate`/捨てる/レンズ`lens-axis`/**もっと`more-candidates`**（lastPartRef再生成）/閉じる |
| fitレポート | `fit-report` | 診断1行・tapで消す |
| MIDI書き出し | いじる▾内`export-midi`/`export-midi-split` | downloadMidi(composite)/downloadMultitrackMidi(laneTracks) |
| 骨格を鳴らす | `skeleton-audible` | メロmute+骨格2声重ね（MIDI非混入） |
| SongStatus | 段階/次の一手input | onBlurでupdateSong |

### TinkerSheet（いじる）
- ハブ：旋法`palette-*`／☆おまかせ一式`gen-set`（ドラム→ベース→メロ）／パーツタイル`gen-{op}`・`gen-skeleton`／引き出し扉`drawer-{id}`／MIDI書き出し2種。
- メロ引き出し：プリセット8種＋マイ設定＋保存／**🎲`dice-roll`＝rollDice（ノブ乱択のみ）**／ノブ13種（density/swing/runs/expression/push/finest/rhythmParts/voice/hook/foreground/articulation/phrasing/form/breathe/flow/pickup/counter/humanize、各🔒lock）／上下ハモ`harmony-up/down`／コードに合わせる`fit-to-chords`／噛み合い診断`analyze-fit`／メロを生成`gen-gen_melody`。
- ドラム引き出し：ジャンル・フィル・型直指定・ビルドアップ・生成。ベース引き出し：ジャンル・フィル向き・型10種・生成。骨格引き出し：構造`skel-form`・生成。

### SkeletonEditor（骨格）
- スナップ`snap`／入力先`input-voice`（メロ/ベース）／ベース表示`fold-oct`／再生モード`play-mode`（非embedded）／小節`skel-bars-*`／色付け`skel-color`／かたち`skel-contour`／**機械に叩き台`gen-skeleton-stub`→候補、🎲別案`stub-again`＝genStub再呼び（正しく再生成）**／打点tap（isTap判定）・点ドラッグ・削除・選択／句チップ`phrase-{i}`・境界ドラッグ／休符ストリップ`rest-strip`／鍵盤プレビュー／選択操作`skel-del/left/right/up/down`／候補試聴`stub-audition-{i}`・採用`stub-adopt-{i}`・閉じる。

### SkeletonDesk（骨格の机・全画面）
- 閉じる`close-desk`／ステージ①②③④`stage-*`（レンズ意味読替・reloop）／範囲ブレース`desk-brace-start/end`（reloopで窓）／②コードチップ`chord-chip-{i}`→候補`chord-cand-{k}`試着→`chord-revert`/`chord-adopt`/`chord-undo`／③=SkeletonEditor埋込／接点バッジ`contact-{i}`→`contact-listen`（ダイアッド）・`stale-count`／④メロを作る`desk-blow`・分岐スタック`realized-stack`・候補（`audition-on-bed`無停止試聴/`place-at-skeleton`/捨てる/**もっと`more-candidates`**/閉じる）／下端：`desk-play`/`desk-rewind`/レンズA/B`lens-fold`/`lens-real`/`desk-undo`/`desk-redo`。

---

## 4. 器・Chat・アナリーゼ・Study

### ProjectScreen（器画面）
- 編集トグル`edit-project`→説明`project-description`・指示`project-instructions`・保存・**器を削除`delete-project`**（confirm・件数明示）／起点チャット`start-chat`+`start-chat-go`／ジョブ一覧（表示のみ）／会話取り込み`import-session`→未仕分け会話を器へ／会話を開く・改名`rename-session`・削除`delete-session`／＋曲を組む`create-song`／曲一覧タップ／ファイルDL（`/asset/:id`）・削除`delete-file`。

### Chat
- モード相談/調べる／送信（Enter・IME中無効・Shift+Enter改行）→SSEストリーム`streaming`＋実況`thinking`／停止`stop-turn`／裏ジョブバナー`inflight`（4sポーリング）／候補カード試聴`play-candidate`・保存`save-candidate`／書込カード開く`open-card-neta`・取り消す`undo-card`／知見化（40字以上/改行あり）／ネタ開く`open-neta`・試聴`preview-neta`／会話一覧`sessions`・新規`new-session`・選択・削除・履歴クリア`clear-history`／器の指示バナー／機材モード（thread=gear固定）／**target付きで開くと最初の提案を自動送信（=実claude1ターン消費）**／再アタッチ（走行中turnのlive購読）。

### AnalysisWorkbench
- 再生/停止`play`（メロ+コード+クリック合成）／アンカー◀▶`anchor-prev/next`（250msデバウンス保存）／拍そろえ`toggle-quantize`／所見`toggle-prose`／シーク（strip click）／切り出し`cut-from`/`cut-to`/`cut`（→chord_progressionネタ化）。

### StudyView（読み取り専用）
- 所見トグル／曲コアループ試聴`play-song-{si}-{li}`（トグル）／共通進行試聴`play-common-{i}`（songCount≥2・上位24件）。

---

## 5. 🎲サイコロ3系統の実装（不満①の解）

1. **TinkerSheetメロ🎲`dice-roll`＝rollDice（useMelodyGen.tsx:217-223）**：ロック外ノブを現在値±0.3で乱択**するだけ**。生成もシート閉じもしない。生成ボタン（`gen-gen_melody`）や「もっと」が明示的にgenPartを呼ぶのと非対称。さらに (a)振られる11ノブ中7本は折り畳み内で不可視 (b)seg既定0は負方向乱数でclamp→無変化＝**「押しても何も起きない」体感の正体**。
2. **SkeletonEditor「🎲別案」`stub-again`**＝genStub再呼び（新seed群）→**正しく再生成**。
3. **SectionEditor/SkeletonDesk「もっと」`more-candidates`**＝`lastPartRef.current && genPart(...)`→再生成だが、直前操作がgenSkeleton/makeHarmony/fitToChords/estimateChords だと lastPartRef=null で**沈黙**（useMelodyGen.tsx:308,336,359,385,396）。

## 6. 再生系ディープダイブ（不満②の候補・audio.ts/useTransport/usePlayhead）

方式：グローバルTone.Transport単一を全再生で共有。playNotes(audio.ts:830)＝stop/cancel(0)→bpm設定→scheduleTimes一括予約→transport.start()。視覚はusePlayheadがrAFでtransport.seconds直読み。

| # | 箇所 | 疑い |
|---|---|---|
| 1 | audio.ts:851 ensureSoundFont(waitIfCold=false) | **初回=簡易シンセ・2回目以降=SF2**＝立ち上がり/音色が回により違う（最有力） |
| 2 | audio.ts:900-915 doReschedule | cancel(0)後にsampler準備をawait＝走行中クロックが進み直後イベントがズレる |
| 3 | usePlayhead.ts:57,88 | lookAhead補正が視覚のみ・start時1回捕捉。latencyHint/lookAhead/updateInterval全て未設定（Toneデフォルト依存）＝環境で音↔線オフセット変動 |
| 4 | useTransport.ts:71-78 toggleLoop | 再生中stop→begin＝ループ毎に全再スケジュール（async所要が毎回変動） |
| 5 | useTransport.ts:84 reloop | NetaDialogで未配線＝再生中のtempo/notes変更が効かない（bpmはbegin時のみ） |
| 6 | useTransport.ts:34-47 | playNotes解決後にstartPh＝音が先・線が後（出だしのばらつき） |
| 7 | audio.ts:972 | transport.start()時刻引数なし＝開始基準がぶれる余地 |
| 8 | ChordEditor.tsx:58 | ハイライト100msポーリング（表示精度） |
| 9 | audio.ts:793 previewNote | Transport非経由の即時発音＝再生と混線経路 |

## 7. コード読みで見つけた怪しい箇所（棚卸し由来・検証/修正候補）

1. **戻るガード漏れ**：App.tsx:119 anyOpenにshelfOpen/filterDrawerOpen不参加＝棚/引き出しを開いて戻るとアプリ離脱（実走で確認済み・修正対象）
2. **Capture.tsx完全dead**＋outbox.ts queueNeta呼び元消滅＝オフライン捕獲動線が実質死（設計判断→起票）
3. 「作例を生成」がライブラリscope/非音楽kindにも露出（NetaList.tsx:334）
4. 検索合流「＋コードを作る」が棚と別kind（chord vs chord_progression、App.tsx:259）
5. HummingRecorderがprojectTags非付与＝録音ネタが未仕分けへ
6. importMidi完了待ち12s打ち切り＝遅いジョブが「失敗に見える」
7. URLアナリーゼ失敗が無通知
8. reorderable="すべて"でもtrue＝reorderNeta("")の意味曖昧
9. FilterDrawer 0件ゴーストに作成不可kind（reference等）が混じり文言が嘘
10. Chat inflightポーリングが開いてる限り2req/4s
11. Chat target付きオープンで自動claude送信（課金・意図せぬ生成）
12. AnalysisWorkbench anchors配列を単一要素で上書き／beat_times空でロール幅破綻
13. placeCandidate重複除去がposition=0固定呼びで別小節の既存メロを巻き込み削除し得る（useMelodyGen.tsx:443）
14. Tray INTENT_LABELと実intent名の突合未確認
15. ProjectScreen loadContentがPromise.all一括catch＝1本失敗で全体不更新

## 8. 敵対的監査（G1-23）の要点と反映

- **G1 dev/prod一致**：検証は:8790（本番同一dist）で実施 ✅
- **G2 依存ゲート**：/healthでcm-search疎通確認済み ✅
- **G3 retries禁止**：自作ドライバ＝リトライ無し。タイミングはN回反復で分布採取 ✅
- **G4/C3 音の絶対判定はエミュ不可**：ロジック健全性のみ判定・耳確認は残タスク固定 ✅
- **G5 朝壊れ防止**：dist退避済み・本番反映は疎通ゲート緑時のみ ✅
- **G6 DB隔離**：クローンDB＋CM_DBサンドボックス ✅
- **G8 localStorage状態**：空状態/活動ありの2相を意識 ／ **G9 状態網羅**：正常/空/エラー/縮退を判定軸に
- **G11 戻る**／**G13 confirm方針**（sandboxはaccept可）／**G14 undo/redo**／**G16 🎲=名指し検証**／**G17 autoplay許可＋実測**／**G19 生成直列**／**G21 Chatはfake接続** ✅
- **C1 スクショはfail厚め・passは代表**／**C2 設計波及は起票止まり**（夜間実装は低リスク・テスト先行のみ）

**索引**：検証結果→ `2026-07-15-ui-audit-results.md`（実走後に作成）。
