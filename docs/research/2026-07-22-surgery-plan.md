# 大手術計画：H1/H2 完成の残工事（裁定＋スライス分割＋design 文案・2026-07-22）

**性格**＝Fable による設計起案（実装なし）。調査5本（I1〜I5・scratchpad/surgery/）と正典
（`2026-07-22-performance-editing-architecture-audit.md`＝H1/H2・`2026-07-22-melody-pattern-thought-experiment.md`＝統一原理
「content は人が仕上げる単位」・design 修理#1/#2）を突き合わせ、全論点に裁定を下し、Opus 並列実装のための
スライス分割（同一ファイル非競合）と design.md 追記文案を確定する。

**親の裏取り済み事実（前提）**：I3 の feel 落とし＝savePatch 実読で確定（melody/bass/counter/riff/相対bass/rhythm が漏らす・
chordPat 系のみ spread 生存）／I1 の相対 bass patternId 欠け＝確定／I4 の placements API 実在＝確定。

---

## 1. 裁定一覧（論点 × 決定 × 理由）

### I1：ベースの「編集の家」完成

| 論点 | 決定 | 理由 |
|---|---|---|
| 絶対↔相対の乗り換え動線 | **(a) 破壊的トグルを追認＋切替時に確認ダイアログ**。変換ロジック新設(c)・別ネタ化(b)は否決 | 絶対→度数の逆算は repo に前例なし＝研究級の新規工事で本手術の射程外（backlog）。別ネタ化はトグル UX と不整合でネタ増殖。現状の「切り替えて保存すると旧モードの中身が消える」は不可逆（Undo は効く）なのに UI が無言＝データ喪失に見える。**現モードに中身が有り、切替先で保存すると失われる場合のみ confirm**（「切り替えて保存すると絶対ノート（/相対パターン）は失われます」）。相対→絶対の「実音に焼く」変換は resolveRelativeBass で安価に可能だが文脈（どの進行で焼くか）の UX 設計が要る＝backlog 追記 |
| 「パターンを選ぶ ▸」帯（工事順6の前半） | **採用＝BassStepEditor（相対ビュー）内に修理#1 と同 UI**。候補取得＝ドラム流儀（`seed×4` 並列 `gen_bass({style, relative:true, seed:base+d})`・**frame から tempo を外して pool を広げる**＝修理#1 決定C と同文・要耳較正）。dedupe＝`patternId ?? JSON.stringify(content)` | gen_bass に variety が無い＝RhythmEditor の実装がそのまま雛形。帯は相対ビュー専用（絶対 PianoRoll には出さない）＝適用＝pattern/steps/patternId の置換で乗り換え問題が発生しない。絶対ネタで使いたければトグル（確認付き）を先に通る＝動線が一本 |
| 「おまかせ」chip | **web 側で seed から6ジャンルのいずれかを決定的に選んで style を必ず付ける** | relative は style 必須（style 未指定＝`relativeFallback:"no-style-pattern"`＝絶対 notes が返り相対エディタに混入する事故の口）。api 無改変で塞がる。加えて fetch 結果の番兵＝`mode!=="relative"` の候補は捨てる（6/8 手動相対ネタ等の保険）・compound meter では帯非表示 |
| 拡張語彙（2/6/クロマチック/next/vel）編集 UI | **案1＝「その他」レーン＋セルポップオーバー**（度数 b2..#7・2・6／next トグル／vel）。前面6レーンは不変 | 監査 B'3 の推奨（前面は行契約の流儀を維持）どおり。レーン増(案2)は全語彙で行数爆発、案3（長押し）とほぼ等価だが「隠れ度数がどこに居るか」をマーカーで可視化できる分だけ案1が上。**同 step 排他＝現行モノフォニック置換を正式仕様化**：可視レーンを置けば同 step の隠れ度数は消える／「その他」で置けば同 step の可視レーン音が消える（一貫） |
| vel を resolver に反映する順序 | **resolver 先行（契約スライスで vel→Note.vel 反映）→ その後に UI** | UI 先行だと「編集しても音が変わらない」無音編集の齟齬（I1 リスク明記）。resolveRelativeBass は vel 無し content で出力不変＝additive・bit 一致。生成側は ghost を休符扱い（修理#2 決定A表）＝既存生成物に vel は無い＝回帰ゼロ |
| 相対 content への patternId 追加 | **追加する**：`RelativeBassContent.patternId?`（web 型）＋ api 相対出力が `styleType.id` を刻む。style+fill 合成でも **base 型の id を維持**（ドラム applyDrumFill 継承と同流儀） | rhythm/chord_pattern と同じ流儀＝一貫（違反③の残り）。帯の dedupe と「いま：<型名>」の土台。相対出力は opt-in（relative:true 指定時のみ）かつ**実データの相対ネタはゼロ**（I5 R7）＝`gen-bass-relative.test.ts` (b)群の golden 更新は安全な**意図的変更**。既定（relative 未指定）経路は bit 一致のまま |

### I2：管弦(section_inst)への帯の誤適用

**決定＝(a) ゲートのみ**：`ChordPatternEditor` に `showPicker?: boolean`（既定 true）を追加し、KindEditorBody:260 で
`showPicker={isChordPat}` を渡す＝管弦は帯なし。

- 理由：誤適用は「変だが鳴る」でなく確実な劣化（role 恒久喪失・guitar 型なら弦をギター奏法で鳴らす・D/U 帯まで露出）。
  最小2〜3行で入口を断てる。管弦には型を選ぶ UI が元々無い（TinkerSheet 管弦＝drawer 無し＝pad 固定）ので機能後退ゼロ。
  role は今 playback で未使用でも §6-3「energy×section→role 出し入れ計画」の布石メタ＝**喪失経路を断つこと自体に価値**（I2 問い3＝yes）。
- **(c) role 切替帯（gen_section_inst・pad/stab chip）＝次期スライス候補として backlog へ**（役立つが本手術の射程＝止血を超える）。
- **(b) SectionType 辞書＝将来アーク**：研究doc `2026-07-14-horn-string-arranging.md` §6 に材料は揃うが、multi-part voicing は
  現 resolveChordPattern が未対応＝web 実音化拡張とセット＝section_inst の chord_pattern 相乗り解消の裁定込み。手術に入れない。
- 既に汚染された保存ネタ（guitar 型適用済み section_inst）の自動修復は**しない**（ソロ開発・存在未確認。見つけたら手で直す）。

### I3：feel の「編集の家」（C-6）

| 論点 | 決定 | 理由 |
|---|---|---|
| 射程 | **(b)＝止血＋家まで一気に**（melody/bass/counter/riff/相対bass に NoriRow） | バグ根治（feel state＋savePatch 透過）と家の新設（NoriRow 結線）が同じ配線＝分けると同ファイルを二度触る。NoriRow は完成部品（section で本番稼働中）＝新規部品ゼロ。統一原理どおり feel＝演奏層パラメータは content に住み、家はネタエディタ |
| 透過方式 | **明示 feel 保持（feel state 経由）**。savePatch の spread 統一（unknown キー全透過）は否決 | spread 統一は「savePatch が何を書くか」の列挙性を失い副作用審査が広がる（sing/patternId 等は既に明示保持済＝実利薄い・I3 §4a）。**規則を一文にする**：「chordPat 系（spread 既存・触らない＝二重載せ回避）以外の全 content 再構成枝に `...(feel ? {feel} : {})` を織り込む」＝relBass/notes系/skeleton/chords/rhythm 全部。UI の無い kind は state が初期値のまま＝生成 feel を落とさないだけ（先回り止血。backlog #29 P1-5 の rhythm 経路もこれで塞がる） |
| rhythm を今含めるか | **保存透過は含める（上の一文規則に含まれる）／NoriRow は出さない** | genDrums は feel 未添付＝実害ゼロ＋ドラム humanize 既存経路との二重掛け審査が未了。UI は melody/bass/counter/riff/相対bass に絞る（chord は抽象・skeleton は無音・chordPat 系は spread 流儀と NoriRow の整合設計が別途要る＝backlog） |
| NoriRow 設置場所 | **MetaPanel に「ノリ」行（条件出現）** | 「奏法」select（chord_pattern のみ二段）と同型の先例＝kind 条件出現の流儀が既にある。section 側の家（TinkerSheet いじる▾）と同じ「設定面」に置く一貫性。TransportBar は共有・モバイル幅で過密 |
| 保存挙動の変化（bit 一致の例外） | **意図的変更＝バグ修正として正当化** | 生成が刻んだ content.feel を保存で落とすのは savePatch の再構成漏れ＝**落とすのが誤り**。修正後＝feel 持ちネタの保存 JSON に feel が残る（新挙動が正）。feel 無しネタは byte 一致（`feel?{feel}:{}` はキーを生やさない＝NoriRow の「両0＝undefined＝キー削除」契約と対称）。undo/redo＝snapshot/applySnapshot に feel を追加 |

### I4：patternId 乖離＋共有バッジ

| 論点 | 決定 | 理由 |
|---|---|---|
| patternId 乖離（B-5） | **折衷案＝patternId は残し `patternEdited?: true` を content に立て「いま：GT-FOLK8（改）」表示**。(a)消す＝来歴喪失（違反③の再発）で否決。(b)正準比較＝frame 依存で脆く buildCompContent 未export＝api 往復が要る＝重くて否決 | 折衷は (a) 並みの工事で (b) の目的（帯が嘘をつかない＋来歴保持）を達成。判定＝編集イベントのみ（正準再構成なし）。**patternId が在る時だけ** patternEdited を付与＝patternId 無しの既存ネタは編集しても新キーが生えない＝bit 一致。「編集」の線引き＝**content の演奏内容を変える onChange 全部**（hits/vel/dir/lh/voicing/小節数）。program・title 等メタは対象外。applyPattern＝候補 content で置換＝patternEdited は自然に消える（候補に無いキー）。Undo＝snapshot 方式なので自動で戻る（I4 確認済） |
| 共有バッジ（C-7） | **NetaDialog ヘッダに「N箇所で使用中」小バッジ**（`placementCount>=2`）。既存 `api.getPlacements` をマウント時1回・`.catch(()=>null)`＝失敗時非表示 | 安全の可視化は折りたたみの外＝常時視認が目的に適う（I4 の判断どおり）。api 変更ゼロ（placements API は実在＝backlog D3b の前提は古い→backlog 訂正）。トップ開きの3択ガードは**入れない**（parentId 無し＝ガード無効は意図的設計・監査 §5-6 の推奨もバッジ止まり）。「複製して切り離す」は別物＝backlog のまま |

### I5：相対ベースの既定切替（推奨のみ・実施は本手術外）

- **推奨＝(b) UI 既定＝新規のみ相対**：web の body 組み立て（useMelodyGen genPart）で style 指定時に `relative:true` を送る。
  api 既定は false 据置＝`gen-bass-relative.test.ts` の bit 証明12件が生き続ける・`/gen/section` 一括は絶対のまま残せる＝最低リスク。
  MCP（Claude 経由）は絶対のまま＝一貫性の代償は明示的 `relative:true` で埋まる。実績が付いたら (c)（api 側 style 時のみ相対既定）へ
  進める二段構え。**切替の実施＝オーナー耳確認後の別裁定**（本手術に含めない）。
- **本手術に含める準備工事＝表示文脈の先回り（R1）**：候補トレイ試聴/描画の `isRel` に相対 bass を追加＋MiniRoll に文脈
  （preview_chords）注入。既定 bit 一致（絶対 content の経路は不変・相対 bass は現状トレイに来ない）だが、帯（I1）で相対ネタが
  今日から生まれる＝ネタ帳サムネ/試聴が「進行無視の絵」になる劣化を先に塞ぐ。
- **切替アークに残す宿題（実施時に必須・design に列挙）**：R2 api 側メタ（VL/シンコペ）の相対解決（api に resolver が無い＝要新設）／
  R4 `/gen/section` への relative 透過／R5 相対時のドラム連動ノブ（kickLock 等）無効化/非表示の UI 分岐（「動かないツマミ」問題）／
  R6 bit 証明テストの再設計。

### 横断整合チェック（統一原理「content は人が仕上げる単位」に照らす）

- ベース（背景）＝人はパターンを仕上げる→帯・語彙 UI・vel はすべて**パターンの家（BassStepEditor）**に足す ✅
- feel＝演奏層パラメータ＝content に住み家はネタエディタ（監査 §1 の feel 先例の完成）✅
- patternId/patternEdited＝来歴も content キー（監査 違反③の解）。「編集したら（改）」＝手編集主権の宣言＝原理と同方向 ✅
- section_inst ゲート＝管弦用でない語彙（鍵盤/ギター型）を content に流し込む口を断つ＝「仕上げる単位」の混入防止 ✅
- バッジ＝パターンがネタに住むほど共有の影響面が広がる（監査 §5）ことの可視化＝H1×H2 の随伴工事 ✅
- 矛盾なし。唯一の緊張＝「帯適用も破壊的置換」だが、帯は相対ビュー専用＝絶対 notes との衝突はトグル確認が先に受ける ✅

---

## 2. スライス分割（Opus 並列・同一ファイル非競合）

### 構成＝並列6本（第1波）→ 直列1本（第2波）→ 並列2本（第3波）＝計9スライス・3段

| # | スライス | 触るファイル（正確に） | 波 |
|---|---|---|---|
| S1 | api：相対出力に patternId | `apps/api/src/music/generate.ts`・`apps/api/test/gen-bass-relative.test.ts` | 1（並列） |
| S2 | web 契約：型追加＋vel 実音化 | `apps/web/src/music.ts`・`apps/web/test/music.test.ts`（相当） | 1（並列） |
| S3 | feel の家 | `apps/web/src/useNetaEditor.ts`・`apps/web/src/components/NetaDialog.tsx`・`apps/web/src/components/MetaPanel.tsx`＋各テスト | 1（並列） |
| S4 | ChordPatternEditor：ゲート＋（改） | `apps/web/src/components/ChordPatternEditor.tsx`＋テスト | 1（並列） |
| S5 | RhythmEditor：（改） | `apps/web/src/components/RhythmEditor.tsx`＋テスト | 1（並列） |
| S6 | トレイ/サムネの相対 bass 文脈 | `apps/web/src/components/MiniRoll.tsx`・`apps/web/src/useMelodyGen.tsx`・`apps/web/src/components/SectionEditor.tsx`＋テスト | 1（並列） |
| S7 | ベースの家（帯＋トグル警告＋patternId 配線） | `apps/web/src/useNetaEditor.ts`・`apps/web/src/components/NetaDialog.tsx`・`apps/web/src/components/KindEditorBody.tsx`・`apps/web/src/components/BassStepEditor.tsx`＋テスト | **2（直列・S2/S3 の後）** |
| S8 | ベース拡張語彙 UI（「その他」レーン） | `apps/web/src/components/BassStepEditor.tsx`＋テスト | 3（並列・S7 の後） |
| S9 | 共有バッジ | `apps/web/src/components/NetaDialog.tsx`＋テスト | 3（並列・S7 の後） |

**依存の実体**：S7 は S2（RelativeBassContent.patternId?/patternEdited? 型）と S3（useNetaEditor/NetaDialog の feel 改修と同ファイル）に依存
＝第2波。S1 は機能上 S7 の dedupe を強くするだけ＝ファイル独立で第1波。S8/S9 は S7 と同ファイル（BassStepEditor/NetaDialog）＝S7 の後、
相互にはファイル素（BassStepEditor vs NetaDialog）＝並列可。

### ファイル競合マトリクス（ホットファイル×スライス・「○」＝触る）

| ファイル | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | 判定 |
|---|---|---|---|---|---|---|---|---|---|---|
| api `generate.ts` | ○ | | | | | | | | | 単独 |
| api `mcp.ts`／`http.ts` | | | | | | | | | | **不触**（本手術は api 表面を patternId 以外変えない） |
| web `music.ts` | | ○ | | | | | | | | 単独 |
| `useNetaEditor.ts` | | | ○ | | | | ○ | | | **直列**（S3→S7） |
| `NetaDialog.tsx` | | | ○ | | | | ○ | | ○ | **直列**（S3→S7→S9） |
| `MetaPanel.tsx` | | | ○ | | | | | | | 単独 |
| `KindEditorBody.tsx` | | | | | | | ○ | | | 単独（S7 のみ） |
| `ChordPatternEditor.tsx` | | | | ○ | | | | | | 単独 |
| `RhythmEditor.tsx` | | | | | ○ | | | | | 単独 |
| `PatternPickerBar.tsx` | | | | | | | | | | **不触**（器のまま流用） |
| `BassStepEditor.tsx` | | | | | | | ○ | ○ | | **直列**（S7→S8） |
| `TinkerSheet.tsx` | | | | | | | | | | **不触** |
| `MiniRoll.tsx`／`useMelodyGen.tsx`／`SectionEditor.tsx` | | | | | | ○ | | | | 単独 |

**S4↔S7 の結合契約（並列安全の根拠）**：ゲートは2ファイルに跨るが、prop 契約を design で先に固定する＝
`ChordPatternEditor.showPicker?: boolean`（**既定 true**）。S4 が prop を実装（未指定＝従来描画＝bit 一致）、S7 が
KindEditorBody:260 に `showPicker={p.flags.isChordPat}` を1行足す。どちらが先に着地しても壊れない（S4 のみ＝既定 true で従来どおり／
S7 のみ＝未知 prop は React が無視）。ゲートの発効＝両方着地後。

### 各スライスの仕様

**S1（api：相対出力 patternId）**
- 目的：`genBass(..., {relative:true})` の相対 content に `patternId: styleType.id` を刻む（fill 差替え時も base 型 id 維持）。
- テスト（赤→緑）：相対出力に patternId が載る／fill 併用でも base id／**relative 未指定＝従来絶対出力 deepStrictEqual 不変**（既存 (a)群が緑のまま）。
- bit：既定経路＝bit 一致。相対 opt-in 経路＝golden 更新（**意図的変更**：opt-in のみ・実データ相対ネタ0・正当化は design ②）。
- 耳較正：不要。

**S2（web 契約）**
- 目的：`RelativeBassContent.patternId?/patternEdited?`・`ChordPatternContent.patternEdited?`・`RhythmContent.patternEdited?` の型追加
  ＋ `resolveRelativeBass` が `BassStep.vel` を Note.vel へ反映（`:483` コメント「将来」の解消）。
- テスト（赤→緑）：vel 付き step→Note.vel／vel 無し content の resolve 出力＝現行と deepStrictEqual。
- bit：既定 bit 一致（新キー未指定＝不変）。
- 耳較正：vel の鳴り（S8 の UI が乗ってから・オーナー）。

**S3（feel の家）**
- 目的：feel 落としバグ根治＋NoriRow 常設。useNetaEditor に `feel` state（初期＝`feelOf(neta.content)`）・savePatch の
  **chordPat 系以外の全 content 再構成枝**（relBass/notes系/skeleton/chords/rhythm）に `...(feel?{feel}:{})`・snapshot/applySnapshot に feel 追加・
  NetaDialog→MetaPanel へ feel/onFeelChange を配線・MetaPanel に「ノリ」行（`<NoriRow/>`・表示＝melody/bass/counter/riff/相対bass のみ）。
- テスト（赤→緑）：feel 持ちメロを編集保存→feel 残存（現状は落ちる＝赤から）／feel 無しネタ保存→content に feel キーが生えない
  （byte 一致）／NoriRow 両0→キー削除／undo で feel が戻る／chordPat 系は触らない（spread 生存の現状維持・二重載せなし）。
- bit：**意図的変更（バグ修正）**＝feel 持ちネタの保存 JSON が変わる（＝残るのが正）。feel 無し＝byte 一致。
- 耳較正：単体ネタで跳ね/人間味を動かした鳴り（オーナー・軽く）。

**S4（ChordPatternEditor）**
- 目的：`showPicker?: boolean`（既定 true・false で PatternPickerBar 非表示）／手編集ハンドラ（setV/toggleHit/toggleDir/setLh/commitChord/
  小節数等の content 変更系）を共通 setter に集約し **patternId が在る時だけ** `patternEdited:true` 付与／nowLabel＝`patternId +（patternEdited?"（改）":"")`／
  applyPattern＝候補 content 置換（patternEdited 自然消滅・feel も候補側に従う＝置換の意味論を維持）。
- テスト（赤→緑）：showPicker=false で帯なし／patternId 有りネタの手編集→patternEdited 付与・（改）表示／patternId 無しネタの手編集→
  新キーが生えない（bit）／apply で（改）解除／program 変更では付与しない。
- bit：既定 bit 一致（patternId 無しの既存ネタ不変）。patternId 持ちネタ（修理#1 以降）の編集で patternEdited が付く＝**意図的変更**（正直表示）。
- 耳較正：不要（表示のみ）。

**S5（RhythmEditor）**：S4 と同内容の rhythm 版（toggle/commitCell/eraseAt/setBars→共通 setter・patternEdited・（改））。テスト/bit 同型。

**S6（トレイ/サムネの相対 bass 文脈）**
- 目的：`auditionCandidate`（useMelodyGen:507〜）と SectionEditor 候補カード（:525〜）の `isRel` 判定に `isRelativeBass(content)` を追加
  ＝相対 bass 候補/ネタをセクション進行で試聴・描画。MiniRoll＝content が相対 bass のとき `preview_chords`（有れば）を ctx.chords へ注入。
- テスト（赤→緑）：相対 bass content がトレイで chords 付き解決になる／絶対 bass・他 kind の経路は payload/出力不変。
- bit：既定 bit 一致（相対 bass は現状トレイに現れない・絶対経路不変）。
- 耳較正：不要（既定切替アークで本格確認）。

**S7（ベースの家・本丸）**
- 目的：(i) BassStepEditor（相対ビュー）に「パターンを選ぶ ▸」帯＝ジャンル chip6＋おまかせ（web 側 seed でジャンル決定）→
  `seed×4` 並列 `gen_bass({frame(tempo 抜き), style, relative:true, seed:base+d})`→`mode!=="relative"` 除外→`patternId??JSON` dedupe→最大4件
  →試聴＝`notesForContent("bass", cand.content, {key})`→適用＝pattern/steps/patternId 置換＋patternEdited 解除（Undo は既存 snapshot で1操作）。
  compound meter は帯非表示。(ii) 絶対↔相対トグルに破壊確認 confirm（現モードに中身が有る時のみ）。(iii) useNetaEditor に
  `bassPatternId`/`bassPatternEdited` state（初期＝content から）＋ savePatch L302 を
  `{mode:"relative",steps,pattern,...(patternId?{patternId}:{}),...(patternEdited?{patternEdited:true}:{}),...(feel?{feel}:{}),program}` へ＋
  `setBassPattern` 経由の手編集で edited 付与＋snapshot に bass メタ追加。(iv) KindEditorBody:260 に `showPicker={p.flags.isChordPat}` を1行。
- テスト（赤→緑）：帯 fetch/dedupe/番兵（絶対候補除外）／適用で patternId 反映・（改）解除／手編集で（改）付与（patternId 有時のみ）／
  トグル confirm（中身有→出る・空→出ない）／savePatch の相対 content 透過（patternId/edited/feel）／patternId 無し相対ネタ保存＝現行 byte 一致。
- bit：既定 bit 一致（新キー未使用の既存ネタ不変）。
- 耳較正：**要**＝帯候補のばらけ方（tempo 外しの副作用）と鳴り（synth C2 基準・オーナー）。

**S8（ベース拡張語彙 UI）**
- 目的：BassStepEditor に「その他」レーン（可視6レーン外の度数を持つ step にマーカー）＋セルポップオーバー（度数 b2..#7・2・6／
  next トグル／vel）。同 step 排他＝可視レーン配置は隠れ度数を置換・「その他」配置は可視レーン音を置換（モノフォニック一貫）。
- テスト（赤→緑）：ポップオーバーで置いた拡張度数が pattern に載る／同 step 排他の両方向／既存の非破壊保持テスト緑のまま。
- bit：既定 bit 一致（UI のみ・保存形は S7 の透過に乗る）。
- 耳較正：**要**＝vel・クロマチック度数の鳴り（S2 の resolver 反映と合わせて・オーナー）。

**S9（共有バッジ）**
- 目的：NetaDialog ヘッダに `placementCount>=2` で「N箇所で使用中」小バッジ。マウント時 `api.getPlacements(neta.id)` 1回・
  `.catch(()=>null)`＝非表示フォールバック。3択ガード等の挙動変更なし。
- テスト（赤→緑）：placements モックで表示/非表示/失敗時非表示。
- bit：読み取りのみ＝bit 一致。耳較正：不要。

---

## 3. design.md 追記文案（そのまま貼れる形・修理#2 ブロックの直後に挿入）

```markdown
### H1/H2 残工事の一括裁定（修理#3・2026-07-22・正典＝`docs/research/2026-07-22-surgery-plan.md`＋監査 `2026-07-22-performance-editing-architecture-audit.md`／統一原理＝`2026-07-22-melody-pattern-thought-experiment.md`）
修理#1/#2 が残した工事（監査 工事順6-7・feel の家 C-6・patternId 乖離 B-5・共有バッジ・管弦への帯誤適用）を一括裁定。
鉄則は従来どおり**既定 bit 一致**。例外は②（相対 opt-in 出力の golden 更新）と③（feel 保持＝バグ修正）のみ＝下で個別に正当化。
- **決定①：feel の家（C-6・バグ根治込み）**。`useNetaEditor.savePatch()` が content を既知キーで再構成するため
  content.feel が保存で落ちる（melody/bass/counter/riff/相対bass/rhythm/skeleton/chords。chordPat 系のみ `{...chordPat}` spread で生存＝非対称がバグの正体）。
  → useNetaEditor に `feel` state（初期＝`feelOf(neta.content)`）を設け、**chordPat 系以外の全 content 再構成枝**に
  `...(feel ? { feel } : {})` を織り込む（chordPat 系は spread 既存＝触らない＝二重載せ回避）。snapshot/applySnapshot に feel を追加（undo 結線）。
  編集 UI＝既存 `NoriRow`（section で本番稼働中）を **MetaPanel「ノリ」行**として条件出現（melody/bass/counter/riff/相対bass のみ。
  chord＝抽象・skeleton＝無音・rhythm＝genDrums 未添付＋drum humanize 経路との二重掛け審査未了＝UI は出さない。保存透過だけ先回りで塞ぐ＝backlog #29 P1-5 の解）。
  **bit の意味論**：feel 無しネタ＝保存 JSON byte 一致（`feel?{feel}:{}` はキーを生やさない・NoriRow の「両0＝undefined＝キー削除」契約と対称）。
  feel 持ちネタ＝保存で feel が残る＝**意図的変更**。正当化＝生成が刻んだ content.feel を保存が落とすのは savePatch の再構成漏れ＝
  **落とすのが誤り**（feel は演奏層＝content に住む・監査 §1）。修正後の挙動が正。
- **決定②：ベースの「編集の家」完成（監査 工事順6-7）**。
  - **patternId（相対 content・additive）**：`RelativeBassContent.patternId?: string`。api は `relative:true` の相対出力に
    `styleType.id` を刻む（fill 差替えでも base 型 id 維持＝ドラム applyDrumFill 継承と同流儀）。rhythm/chord_pattern と同一流儀（違反③の残り）。
    **既定（relative 未指定）＝絶対 notes＝bit 一致不変**。相対 opt-in 経路の golden（`gen-bass-relative.test.ts` (b)群）は更新＝
    **意図的変更**（opt-in のみ・実データの相対ネタ 0＝後方互換の実害なし）。
  - **「パターンを選ぶ ▸」帯（BassStepEditor＝相対ビュー内・修理#1 決定B と同 UI）**：ジャンル chip6（rock/ballad/citypop/funk/edm/vocarock）
    ＋おまかせ＝**web 側で seed から6ジャンルを決定的に選び style を必ず付ける**（relative は style 必須＝style 未指定 fallback の絶対 notes
    が相対エディタへ混入する事故の口を塞ぐ）。候補取得＝gen_bass に variety が無いため**ドラム流儀**（`seed×4` 並列・
    **frame から tempo を外して pool を広げる**＝修理#1 決定C と同文・**要耳較正**）→ `mode!=="relative"` の候補は捨てる（番兵）→
    `patternId ?? JSON.stringify(content)` dedupe→最大4件。試聴＝`notesForContent("bass",…,{key})`（既存経路）。
    適用＝pattern/steps/patternId 置換（Undo＝既存 snapshot で1操作）。compound meter（6/8）は帯非表示。帯見出し「いま：<型ID>」＋（改）（決定④）。
  - **絶対↔相対トグル＝破壊的切替の追認＋確認**：変換ロジックは新設しない（絶対→度数の逆算は前例なしの研究級＝backlog。
    相対→絶対の「実音に焼く」も文脈選択 UX が要る＝backlog）。現モードに中身が有り切替先で保存すると失われる場合のみ
    confirm を出す（無言のデータ喪失に見える UX の是正）。帯は相対ビュー専用＝絶対ネタで使うにはトグル（確認付き）を先に通る＝動線一本。
  - **拡張語彙の編集 UI（監査 B'3＝案1）**：前面6レーン不変。「その他」レーン1行＋セルポップオーバー（度数 b2..#7・2・6／next／vel）。
    **同 step 排他＝モノフォニック置換を正式仕様化**（可視レーン配置→同 step の隠れ度数を置換／「その他」配置→可視レーン音を置換）。
  - **vel の実音化を UI より先行**：`resolveRelativeBass` が `BassStep.vel` を Note.vel へ反映（無音編集の齟齬防止）。
    vel 無し content＝resolve 出力 deepStrictEqual 不変（生成側は ghost=休符扱い＝既存生成物に vel 無し＝回帰ゼロ）。**要耳較正**。
- **決定③：管弦(section_inst)への帯の誤適用＝ゲートで止血（A-3）**。帯（gen_chord_pattern＝コード楽器26型）を管弦に適用すると
  role（pad/stab）恒久喪失＋guitar 型なら弦楽器にギター奏法（voicing.style/strumMs/D-U 帯）が載る＝確実な劣化。
  → `ChordPatternEditor` に **`showPicker?: boolean`（既定 true＝未指定は従来描画＝bit 一致）** を追加し、KindEditorBody で
  `showPicker={isChordPat}` を渡す（section_inst＝false＝帯なし）。管弦に型選択 UI は元々無い＝機能後退ゼロ。role は将来の
  出し入れ計画（horn-string 研究doc §6-3）の布石メタ＝喪失経路を断つこと自体に価値。**管弦用 SectionType 辞書（同 §6）と
  role 切替帯（gen_section_inst）は本手術外＝backlog**（multi-part voicing は resolveChordPattern 未対応＝実音化拡張とセットの別アーク）。
  既に帯適用で汚染された保存ネタの自動修復はしない（ソロ開発・存在未確認）。
- **決定④：patternId 乖離＝（改）フラグ（B-5・折衷）**。手編集ハンドラは `{...pattern}` spread で patternId を保持したまま
  onChange する＝帯が元の型名を出し続ける（乖離）。→ **patternId は消さず**（来歴保持＝違反③を再発させない）、
  `ChordPatternContent.patternEdited?: true`／`RhythmContent.patternEdited?: true`／`RelativeBassContent.patternEdited?: true`（additive）を
  **patternId が在る時だけ** content 変更系ハンドラ（hits/vel/dir/lh/voicing/小節数。program・title 等メタは対象外）で付与。
  帯表示＝「いま：GT-FOLK8**（改）**」。applyPattern＝候補 content 置換＝フラグ自然消滅。Undo＝snapshot 方式で自動復元（特別対応不要）。
  正準 content との一致判定（buildCompContent 再構成）は**やらない**（frame 依存で脆い・api 往復が要る）。
  **bit**：patternId 無しの既存ネタ＝編集しても新キーが生えない＝不変。patternId 持ちネタ（修理#1 以降の生成物）の編集でフラグが付く＝
  意図的変更（帯が嘘をつかないための正直表示）。
- **決定⑤：共有ネタ「N箇所で使用中」バッジ（C-7・監査 §5 工事順10）**。`GET /neta/:id/placements`（**既存**・web ラッパ
  `api.getPlacements` も既存＝backlog D3b の「read api が無い」は実態と乖離＝backlog を訂正）で `placementCount>=2` のとき
  **NetaDialog ヘッダ**に小バッジ（常時視認＝折りたたみの外）。マウント時1回 fetch・`.catch(()=>null)`＝失敗時非表示。
  トップ開きの3択ガードは入れない（parentId 無し＝ガード無効は意図的設計の維持・バッジは「気づき」の緩和策）。api 無改変・読み取りのみ。
- **決定⑥：相対ベース既定切替の推奨と準備（B-4・実施は別裁定）**。推奨＝**(b) UI 既定＝新規のみ相対**（web genPart が style 指定時に
  `relative:true` を送る。api 既定 false 据置＝bit 証明12件が生存・`/gen/section` は絶対のまま・最低リスク）→実績後に (c)
  （api 側 style 時のみ相対既定）へ二段構え。**切替の実施＝オーナー耳確認後の別裁定＝本手術に含めない**。
  本手術で先回りするのは**表示文脈のみ（R1）**：候補トレイ試聴/描画の `isRel` に相対 bass を追加＋MiniRoll に preview_chords 注入
  ＝既定 bit 一致（絶対経路不変・相対 bass は現状トレイに来ない）。帯（決定②）で相対ネタが生まれ始めるため
  「進行無視の絵/試聴」の劣化を先に塞ぐ。**切替アークの宿題（実施時に必須）**：R2 api 側メタ（voiceLeadingReport/syncopationReport）の
  相対解決（api に resolver 無し＝要新設）／R4 `/gen/section` relative 透過／R5 相対時のドラム連動ノブ（kickLock/snareGap/approach/slashBass）
  無効化/非表示の UI 分岐（「動かないツマミ」問題）／R6 「未指定＝絶対」bit 証明テストの再設計。
- **統一原理との整合（確認）**：①〜⑥はすべて「content は人が仕上げる単位」の帰結＝背景パートはパターン（＋feel・来歴キー）が
  content に住み、家はネタエディタに常在。前景（メロ/リフ/counter）には何も外挿しない。
```

### backlog.md 追記文案（親が反映）

```markdown
- 管弦の型辞書アーク：(c) role 切替帯（gen_section_inst・pad/stab chip・PatternPickerBar 流用＝TinkerSheet 管弦の role 未指定穴も埋まる）
  →(b) SectionType 辞書（horn-string 研究doc §6・multi-part voicing＝resolveChordPattern 拡張とセット・CC11 可否要調査）。修理#3 決定③の続き。
- ベース絶対↔相対の変換：相対→絶対「実音に焼く」（resolveRelativeBass 流用・焼く文脈の UX 設計要）／絶対→相対の度数逆算（研究級・優先度低）。
- 相対ベース既定切替アーク（修理#3 決定⑥の宿題）：R2 api 側メタの相対解決・R4 /gen/section 透過・R5 ドラム連動ノブの UI 分岐・R6 bit テスト再設計＋オーナー耳確認。
- chordPat 系（chord_pattern/section_inst）への NoriRow：spread 流儀と feel state の整合設計後に。rhythm の NoriRow＝genDrums feel 添付と
  drum humanize 二重掛け審査とセット（#29 P1-5 の残り半分）。
- D3b 訂正：逆引き read api は `GET /neta/:id/placements` として既存（backlog:60 の前提は古い）。バッジは修理#3 決定⑤で実装済へ。
  「複製して切り離す」動線のみ残る（useCowGuard の branch 経路が実装の手本）。
```

---

## 4. リスクと検収基準

### リスク

| # | リスク | 手当 |
|---|---|---|
| 1 | **直列鎖がクリティカルパス**（S3→S7→S8/S9・useNetaEditor/NetaDialog/BassStepEditor の3ファイル収束） | 波の境界で必ず全テスト緑を確認してから次波を発進。S7 の仕様（state 名・savePatch の形）は本 doc で確定済＝設計判断を実装エージェントに残さない |
| 2 | patternEdited の「編集」線引きの誤実装（program 変更で（改）が付く等） | S4/S5/S7 のテスト要件に境界ケース（program 変更→付与しない）を明記済。共通 setter 集約で判定を1箇所に |
| 3 | 帯経由で絶対 notes が相対エディタに混入（relativeFallback） | おまかせ＝web 側 style 必須化＋`mode!=="relative"` 番兵＋compound meter 帯非表示の三重（S7 仕様） |
| 4 | feel の保存挙動変化が想定外の kind に波及 | 透過は「chordPat 系以外の全再構成枝」の一文規則＝審査可能。feel 無しネタの byte 一致テストを全 kind 横断で敷く |
| 5 | S1 の golden 更新を「bit 破壊」と誤読 | 既定経路（relative 未指定）の deepStrictEqual 群が緑のままであることをテストで機械証明（S1 要件）。更新は opt-in (b)群のみ |
| 6 | tempo 外しで帯候補の音楽的妥当性が落ちる（ドラム帯と同じ既知の弱み） | 要耳較正としてオーナー確認に送る（検収 M3）。潰れる/変なら pool 戦略を再裁定 |
| 7 | feel と section feel の優先関係（単体で feel を編集→section 配置で sectionFeel が優先） | 既存挙動（section.content.feel 優先→無ければ feelOfTree）は不変＝本手術は触らない。挙動が気になればオーナー確認時に説明 |

### 検収基準

- **T1（機械）**：全既存テスト緑。例外＝意図的更新2箇所のみ（`gen-bass-relative.test.ts` (b)群＝patternId 追加／feel 保持の新旧挙動テスト）。
- **T2（bit 番兵・新設テストで機械証明）**：feel 無しネタの保存 JSON byte 一致（全 kind 横断）／patternId 無しネタの手編集で
  patternEdited が生えない／relative 未指定の genBass 出力 deepStrictEqual 不変／絶対 bass のトレイ payload 不変（S6）。
- **M1（実機）**：管弦ネタで帯が出ない・コード楽器では従来どおり出る／コード楽器の手編集で「いま：<型ID>（改）」・apply で解除・Undo で復元。
- **M2（実機）**：feel 持ちメロを開いて1編集→リロード→feel 残存（跳ねが聞こえ続ける）／NoriRow で両0→保存 content から feel キー消滅。
- **M3（実機・要耳較正＝オーナー）**：ベース相対ネタで帯→候補4件のばらけ→試聴→適用→（改）→Undo の一連／トグル確認ダイアログの文言／
  vel・拡張度数の鳴り（synth C2 基準）／共有ネタでバッジ表示。
- **M4（結線確認・MEMORY の教訓）**：テスト緑≠結線保証＝S3/S7 は実機フロー（開く→編集→保存→リロード）で必ず確認。
- **M5（UI一貫性・追補＝オーナー指示 2026-07-22「UIの一貫性も受け入れ時に確認」）**：全波完了・dist焼き後、**3エディタ（コード楽器/ドラム/ベース）の「パターンを選ぶ」帯＋（改）表示＋ノリ行＋トグル確認**を実機スクショで揃え、**薄コンテキストFable監査**（新鮮な目・前回2026-07-22初見監査と同方式）にかける。観点＝「同じ文法に見えるか（帯の位置/見出し/chip/カード/適用の一貫）」「新設行（ノリ/左手/その他レーン）の視覚統一（選択色=青・折返しなし・44px級標的）」「導線のやりやすさ」。**指摘の客観的破綻（不整合・折返し・被り）は受け入れブロッカー＝直してから手術完了と宣言**。好みの範疇はオーナーtriageへ。
