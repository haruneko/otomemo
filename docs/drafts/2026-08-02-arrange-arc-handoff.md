# 引き継ぎ：アレンジ打ち込み助けアーク（2026-08-02 夕時点）

アーク単位の引き継ぎ書（生きている間は上書き可・完走で archive へ）。前提知識ゼロで読める形で書く。

## いまどこにいるか（1分版）

「語彙帳＋配札」計画（2026-08-02 朝オーナー裁定・正準＝design「楽器アレンジの打ち込み助け＝計画確定」節）の **S1＝写像＋試聴＋採用は機械側完了**（commit `921ea7b`・全テスト緑・実機反映・DB seed済み）。
その後の**導線テスト**（エージェント6体・正準＝`docs/research/2026-08-02-arrange-s1-dousen-test.md`）で「説明あり3/3・なし0/3」＝入口が初見に発見不能と実測され、**夕方にオーナー裁定＝ライブラリ入口の一本化**（正準＝design S1契約節の末尾「裁定（2026-08-02 夕・オーナー）」）が出た。
**次の作業＝この統合工事（Task #5）→ 終わったら S2（配札）着手（Task #3）**。

## 次にやる統合工事（裁定済み・design に仕様あり・未着手）

1. `PatternImportControl`/`PatternImportDialog`・⤓アイコン・ゴーストCTA を**撤去**（3エディタ：ChordPatternEditor/BassStepEditor/RhythmEditor から）。関連テスト（patternGhostCta.test.tsx 等）も整理。Task1f〜1L の路線は本裁定で廃止＝design に追記済み。
2. **文脈試聴▶を PlacePicker へ移植**。`apps/web/src/contextAudition.ts` の `contextAuditionPlan` は現在「編集中ネタの content 差し替え」モードのみ＝**空きセル用に「仮想子を追加」モードを拡張**する（レーン・位置は usePlacePicker が知っている）。PlacePicker は SectionEditor 文脈内なので配線は NetaDialog 経由より簡単。▶⇄■＋「主旋律と一緒に試聴中」の最小表示も付ける。
3. `NetaDialog` の auditionCtx 配線（getComposition を引く useEffect）は取込ダイアログ専用だったので撤去。
4. 検索是正＝OG-SOUL/OG-PUNCH の表示名に「オルガン」を含める（`apps/api/src/music/chordLibrary.ts` の scenes）＋ピッカー絞り込みがネタ名に当たるか確認・是正 → **再seed 必須**：`cd apps/api && CM_DB=/home/shuraba_p/projects/creative_manager/data/cm.sqlite npx tsx scripts/seed-pattern-library.ts`（冪等）。
5. タップ操作系（空き=置く/埋まり=潜る）は**変えない**（オーナー「洗練されていていい」）。

## S1 で作った資産（統合しても無傷・場所）

- **contract③ followChords**＝白玉がコード境界で再ボイシング（RH＋LH custom）：`apps/web/src/music.ts`（`chordSegments`・`resolveChordPattern`・`resolveLh`）。既定＝キー無し＝bit一致。
- **contract④ 複数小節テンプレ**＝`CompType.bars`・サイクル張り＋末尾切り詰め：`apps/api/src/music/chordLibrary.ts`・`generate.ts buildCompContent`。
- **オルガン5型**＝OG-PAD/OG-PAD2(bars:2)/OG-STAB/OG-SOUL/OG-PUNCH（CC前提の drawbar/leslie/gliss/shake 型は不採用＝劣化コピーで棚に載せない裁定）。
- **文脈試聴の合成**＝`apps/web/src/contextAudition.ts`（純関数）＋ NetaDialog 配線（撤去予定側）。
- 採用が相対 content のまま持たれる構造により**枝5（進行変更→自動当て直し）は実装ゼロで成立**。

## オーナーの物差し（このアークで出た生の声・従うこと）

- 「セクション編集のタップ操作系は洗練されていていい」＝触るな。
- 「重複UIの意味を感じない」＝入口は一本。
- **残不満（S2の動機）**：「棚が静的では対応幅が狭い・パターンも動的に出したい・自分で大量に用意するのと同じ」→ S2（配札＋注文チップ＋統計較正）が答えという説明は済み・納得の明確な返事はまだ。S2 設計時はこの不満を要件の芯に据える。
- ランキングしない・最適を機械が当てない（朝の裁定）。手癖の鏡は作らない。自作採取不採用＝**他者コーパスは統計のみ（リテラル保存禁止・移調してもダメ）**。

## 残タスク・未決（Task 機能と対応）

- **Task #2（S1）in_progress**：機械側完了。**残＝オーナー耳確認**（オルガン音色 program16/18・top76/84 要耳較正／followChords の濁り解消／文脈試聴の使い勝手）＋裁定1件（オルガン型を GENRE_TABLE に載せるか＝現状 L4 先例どおり非登録）。
- **Task #5（統合工事）**：上記。これが今の最優先。
- **Task #3（S2 配札）**：統合工事後に着手。材料＝riff 研究docの変換カタログ/和声4型/MAP-Elites 式ビン分け（`docs/research/2026-08-02-riff-structure-and-variation.md` §B）＋横断統計較正（POP909 等・⚠統計のみ）。
- **Task #4（S3 リフ雛形）**：S2 後。
- 導線テストの残問題（統合工事でカバーされないもの）＝CoW シート「やめる」が採用を取り消さない（問題5）／潜るタップと繰り返しハンドルの当たり判定同居で 8→1 事故（問題6）／曲がトップ196件リストに埋没（B1所見）等＝全11件は research doc 参照。**未対応のまま**＝必要なら別 Task 化。
- backlog に記録済みの隣接バグ2件（voiceGuitar 6声間引き破れ・LH 未知度数サイレント根音化）＝S1に混ぜない別修理。

## 環境・生成物メモ

- 実機＝`http://100.109.159.48:8787`（restart スキルで dist焼き/再起動）。DB＝`data/cm.sqlite`（導線テスト前の backup `data/cm.sqlite.bak-dousen-test` あり・**テスト後に復元済み＝現DBはS1 seed込み・テスト汚れ無し**）。
- スクショ114枚＝`ui-captures/2026-08-02-dousen-test/`（README 索引付き・git ignore・デザイン改修の材料に使う指示あり）。
- オーナー向け平易版報告書（Artifact）＝ https://claude.ai/code/artifact/2fb52cb5-f554-4091-83a2-52655de48f9a （更新時は同URLへ）。
- 主要コミット：`b80fac7` 計画確定 → `921ea7b` S1実装 → `04d485b` 導線テスト実測doc。
- テスト実行＝`pnpm -C apps/api test`（1538）・`pnpm -C apps/web test`（1288）。web typecheck に**既存**エラー5件（chordTimeline.ts / ChordEditor.tsx・S1と無関係）。
- 委譲の流儀＝実装は Opus 並列（commit 禁止で下ろし進行役がレビュー→コミット）・bit一致テストの定型（`(a) 未指定は従来と bit一致`・`"x" in obj` でキー不発生確認・条件 spread）。
