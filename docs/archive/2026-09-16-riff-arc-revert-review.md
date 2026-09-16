# リフを作るはずだったアークの第三者レビュー — どこまで戻すか

起草日: 2026-09-16。**決着（同日）＝§10 のオーナー裁定どおり撤去済み・本書は archive**。依頼＝オーナー「リフと言われてリフでないものを作り続けた結果ゴミコードが残っているはず。もう（当事者は）判断できない」。
立場＝**第三者**。進行役の計画書・引き継ぎ書・コミット文・監査報告の自己評価は「当事者の主張」として扱い、実コードと git 履歴を直接読んで判断しました。**コードは変えていません・リバートも実行していません**。物差しは依頼書のとおり（①Otomemo のコンセプト ②2026-08-02 のオーナーの困りごと ③phrase_maker の芯 ④リフ構造論 ⑤オーナーの耳判定）。音の良し悪しは私が決めず、耳の判定が無いものは保留に置きました。

## 0. 結論（20行）

1. **芯を外した地点＝2026-09-04〜09（`30c8749` 棚卸し → `2125ce4` 計画 v3 → `5d60c37` anchorLock → `bae525a` 文法3型）**。ここで「リフ」の中身が、オーナーの課題（**楽器固有のリフ・手癖を超える別パターン**＝design.md:510-534）から、phrase_maker の **合奏の糊（キックにルート／キックにパワーコードを揃えるロック）＋固定2小節のペダル表** へすり替わりました。ギター M5（`8566f1a`・09-13）は同じ型の繰り返しです。
2. すり替わった根拠は3つ。(a) phrase_maker 取り込みの計画書4本は、オーナーの計画（S3 リフ雛形＝和声4型×楽器イディオム・S2 配札）を**一度も参照していない**（grep で「リフ雛形」「和声4型」「gen_riff」が計画側に 0 件・「配札」は概念の対応表と鍵盤 (m) の2箇所だけでリフには結ばれていない）。(b) 棚卸し自身が「otomemo の bassLibrary 33型の方が広い・grammar 3種は移植不要」と書きながら（research/2026-09-04 §3 表）、同じ表を「体」として移植した。(c) 源流も「grammar 表は"わざとらしい/収束"の元」「ベースは grammar+lock で半分生存」と自認していた（phrase_maker `HANDOFF-NEXT.md:25,30`）。移植したのは源流が未完成と認めていた部分です。
3. 耳判定「固い・動かない」（09-13）のあとの直し（錨の弱化 (k-6)・刻みのつまみ (k-4)・変奏の層 (k-7)）は、**固定表という土台を疑わずに上へ積んだもの**です。真因調査自身が「案4（表を捨てて規則生成）が本命」と書きつつ「工事大」で後回しにしています（research/2026-09-15 §5）。オーナーの 09-15 裁定はこの選択肢表の上で下されたもので、土台の是非は問われていません。
4. **外すもの（b）**＝ベースの錨経路一式（anchorLock／厳しさ／案B／文法3型／`chordFollow` の錨連携）、ギターのリフ文法一式（3型・chug ロック・手の形の枠・フォーム DB・palmGate/ghostVel つまみ・web の実音化分岐）、変奏の層（`riffVariation.ts`＋両結線＋「変奏を3段で並べる」）、これらの UI・MCP・`/gen/section` の口・テスト・py-parity ダンプ。
5. **残すもの（a）**＝ドラム M2 一式（耳合格済み）、カスケード合図（cues）、ウォーキング JZ-WALK（耳「使える」）、検証器 `verify/`（観測専用・指板の到達可能性は今後の身体性の足場）、通知の口（`meta.warnings` の素通し・web ダイアログ）、MCP の分数コード修正、研究 doc 3本（事実）。
6. **保留（c）**＝鍵盤の隙間刺し `keyStab`（耳「もとが微妙でそれよりは良い」）、`chordFollow`（ベースの音高写し直し・耳未判定・JZ-WALK が表を共有）、手の物理モデル `handModel`（未結線・音に関係なし）、M6b/M6c/M7 の裁定4件（前提が崩れたので「決める」より「畳む」を推します）。
7. **一括 `git revert` は不可**。範囲にはドラム M2・cues・JZ-WALK・通知修正が混ざり、コミットの中でも残す部分と外す部分が同居しています（例＝`bae525a` は文法登録と通知の口の移設、`5944e6d` は錨の是正と `/gen/section` の warnings 素通し）。**選択的な除去**が要ります。ただし外す対象はすべて opt-in（既定 OFF）なので、**既定の出音は 1bit も変えずに外せます**。保存済みネタに新キー（`guitarRiff`/`bassRiff`/`keyStab`/`engine`）を持つものは **0 件**（DB 実測）＝データ移行は不要。
8. **オーナーに決めてほしいこと（4件）**＝①この仕分けで外してよいか（ベース錨＋ギター文法＋変奏の層） ②保留3件（隙間刺し／chordFollow／handModel）の扱い ③phrase_maker 取り込みアークを**ドラム＋ウォーキングで打ち切る**か ④次＝2026-08-02 計画の S2 配札／S3 リフ雛形へ戻ることの確認（既存 `gen_riff` verb が入口）。
9. 外した理由（負の知識）は §5 に書き、裁定後に design.md と research README へ1行ずつ残す段取りにしました。

## 1. 物差しと、当事者文書の扱い

| 物差し | 所在 | 本レビューでの使い方 |
|---|---|---|
| ① コンセプト | `docs/requirements.md:18-35`（延長・候補まで機械・完成品を差し出さない）／`CLAUDE.md` | 「提案のみ・自動適用しない・シーケンサー化しない」は今回のコードは守っている。争点はここではない |
| ② オーナーの困りごと | `docs/design.md:510-534`（2026-08-02 計画確定）・`docs/backlog.md:22-29` | **「手癖で似たニュアンスの別パターンが出せない・楽器固有リフ」**。採用＝語彙帳＋配札。S3＝**和声4型×楽器イディオムのリフ雛形**（`gen_riff` verb が既存）。自作採取不採用・手癖の鏡は作らない・他者実データは統計のみ |
| ③ phrase_maker の芯 | `~/projects/phrase_maker/docs/CONCEPT.md` §1-§3 | 「身体性シミュレータ＋発散」「平均を出さない」「物理層がバリデータに堕ちるとテンプレ・スタンパー」「差が薄い＝語彙が薄い」 |
| ④ リフとは何か | `docs/research/2026-08-02-riff-structure-and-variation.md` 設計含意1〜5 | 和声4型（移調/固定/ペダル/微調整）を明示パラメータに・リズム輪郭が主役・controlled variation・MAP-Elites 式のビン提示・類似度はガードレール |
| ⑤ 耳判定 | `docs/archive/2026-08-21-phrasemaker-arc-handoff.md` 耳の判定表（09-13）・オーナー原文（09-16） | 錨＝要らない／JZ-WALK＝使える／ギター＝微妙／鍵盤＝微妙（相対的に良い）／09-16＝ギターもベースもリフではない・直したものも謎 |

当事者文書（計画 v3・引き継ぎ書・真因調査・変奏の層の設計・監査報告）は**事実の引用（file:line・実測値）だけを採り、評価語（「価値最大」「本命」「機械の残りなし」）は採りません**。真因調査（`docs/research/2026-09-15-…`）の実測は精度が高く、本レビューの土台として使いました＝ただし結論部の「推し」は当事者の推しとして扱っています。

## 2. どこで芯を外したか（時系列・根拠）

### 2-1. 2026-08-02 の計画から 08-19 の別アークへ（接続なし）

- 08-02：オーナー裁定で「語彙帳＋配札」計画確定（`b80fac7`・design.md:510）。S1（写像）だけ機械側完了（`921ea7b`）。**S2 配札（Task #3）・S3 リフ雛形（Task #4）は未着手のまま**（`docs/drafts/2026-08-02-arrange-arc-handoff.md:186-191`）。
- 08-19〜21：phrase_maker 取り込み計画（`docs/archive/2026-08-19-phrasemaker-port-plan.md`）が別に起草。目的＝「otomemo の伴奏・アレンジが弱い…**伴奏のバリエーションを増やす（質の向上はおまけ）**」（同 :7）。**オーナーの課題（楽器固有リフ）も S3 リフ雛形も一度も出てこない**。09-09 の計画 v3（752行）・引き継ぎ書も同じ（「リフ雛形」「和声4型」「gen_riff」＝0件。「配札」は v3 の概念対応表 :45 と鍵盤 (m) :184 に出るだけでリフとは結ばれていない・§0 結論2）。
- つまり「リフを作る話」は S3 に置かれたまま、phrase_maker アークは「伴奏のバリエーション」として別に走り、途中で「リフ文法」という名を持ち込みました。**名前だけが合流し、課題は合流していません。**

### 2-2. ドラム M2（08-21〜08-30）＝ここは芯を外していない

耳判定を通過（08-30・B6 併存裁定）。フィルは「型でなく毎回解く（bodyFill）」で、phrase_maker の芯（身体性）にも沿っています。今回の撤去対象ではありません。

### 2-3. 2026-09-04 棚卸し＝すり替わりの起点（`30c8749`）

- 棚卸し §3 の表：「ジャンル型格子＝bassLibrary 33型 vs riff grammar 3種 → **otomemo の方が広い。移植不要**」（`docs/research/2026-09-04-phrasemaker-bass-inventory.md` §3 表1行目）。
- 同 §4 推し順1：「**錨と間の分業＝価値最大。耳GO実績（「ロックとても良い」）**」。→ 09-15 の真因調査 §2-3 が自ら訂正＝「ロックとても良い」はバンド全体の評価・ベース単体は「まあまあ」→「微妙では？」。**移植の根拠だった耳の実績は読み違いでした。**
- 同 §3「統計的な傾き（kickLock）より構造的な契約（錨）が上」。→ 09-13 の耳＝「必ずベースルートになるのは保守的と言うか固くない？」。**契約の方が上、という前提そのものが耳で否定されました。**
- 源流の自認（`~/projects/phrase_maker/docs/HANDOFF-NEXT.md:25,30`）：「ベースの 4/4 リフ強化（現状は grammar+lock で**半分生存**）」「**grammar 表は"わざとらしい/収束"の元**」。計画 v3 §4-9 も負の知識4・11として記録しています（「辞書はわざとらしい」「kick ロック挿入は同期100%・補完0%」）。**記録したうえで、その2つを M3 の本体として移植した**のが事実です。

### 2-4. 2026-09-09〜10 M3（`5d60c37` `43754f0` `bae525a` `39cdd9d`）

- `anchorLock` 第三経路（`apps/api/src/music/generate.ts:1444,1573-1690`）＝**ドラムのキック step にルートを置き、間は固定表**。「体」＝`BASS_GRAMMARS`（`apps/api/src/music/bassLibrary.ts:182-297`）＝2小節×3型、pedal_answer は18打点中ルート14。
- 物差し④に照らすと、3型は全部**ペダル型**（移調型・固定型・微調整型が無い＝真因調査 §3-3 の1）。「和声4型を明示パラメータに」（設計含意1）は満たしていません。
- 物差し③に照らすと、この経路には**物理層が無い**（源流ブレスト `BRAINSTORM-bass-kick-lock.md` §1-4「この経路に物理層がない」）。「身体性から創発」ではなく「表を敷いて規則で直す」側です。
- **`bassLibrary` の型と何が違うか**：BassType も「度数×16分格子の純データ」（bassLibrary.ts:1-8）。文法3型は同じ性質の表に anchor/role 注記を足したものです。既存33型と同じ棚の別表であって、「リフを作る仕組み」が増えたわけではありません。
- JZ-WALK（`39cdd9d`・`packages/music-core/src/walkingBass.ts`）は例外＝表を持たず拍ごとに規則で選ぶ。耳「使える」と整合（真因調査 §4 の対照）。

### 2-5. 2026-09-13 M5 ギター（`8566f1a` `7392a31` `7e91a1a` `927bb47`）

- `GUITAR_GRAMMARS` 3型（`packages/music-core/src/guitarRiff.ts:75-122`）＝power_chug／pedal_answer／gallop。3型とも源流の説明文が「palm-muted chug」「root pedal」「mostly root pedal」。
- `assignGuitarPitches`（同 :390-426）：**パワーコードは常にその小節のルートに置き `deg` を読まない**（`if (o.voicing !== "mono") p = gtrRootLow(ch.pedalPc)`）。power_chug が表に持つ i→bVII→bVI の動きはここで捨てられます（真因調査 §3-3 の2）。1小節1コードなら「同じパワーコードの連打」＝オーナーの「パームミュートのパワーコードみたいな音しかしてない」は構造の帰結です。
- `lockGuitarChugToSheet`（同 :303-344）＝キック step に必ず POWER8。ベースの錨と同じ発想。
- 手の形（`guitarHandshape.ts`）は「枠のみ・重みは otomemo の仮置き・耳未判定」（同ファイル冒頭）。物差し③の「物理層がバリデータに堕ちる」形に最も近い部品です。

### 2-6. 2026-09-15〜16 直し（(k-6)・(k-4) つまみ・(k-7) 変奏の層）

- 真因調査（`docs/research/2026-09-15-…` §0 10・§5）：「A と B の根は同じ＝**固定2小節のペダル型の表をそのまま敷き、ルート追従で決め、反復に変奏を持たない**」。案4（表を捨て規則生成＝ウォーキング方式）を「本命」と書きつつ「工事大・次の白紙設計へ」。推し＝案1＋案2（表の上に層を足す・錨を弱める）。
- 09-15 のオーナー裁定（案2・案6・案1）はこの表の上で下されています。**「固定表を土台にしたまま直すか、土台を替えるか」は選択肢として提示されていません**（§6 の問いは錨の扱い・音価・変奏の出し方の3問）。
- 変奏の層（`packages/music-core/src/riffVariation.ts`）は、文法の**答句セル（2小節で3〜4音）**だけを階段でずらす・断片化する・広げる。動かせる音が元から 10〜19%（真因調査 §3-3 の3）なので、変わる量は構造的に小さい。監査自身が「gallop の中は構造的に効きにくい」「octave 型は多め≡中」を確認しています（design.md (k-7)・`d2aab8a` `4ed8589`）。
- 09-16 オーナー「直したやつも何を作りたいのか謎」＝**土台を疑わないまま3層（錨の弱化・つまみ・変奏）を積んだ結果**です。

### 2-7. まとめ＝「リフ」の中身が置き換わった表

| | オーナーの課題（08-02） | phrase_maker アークが作ったもの（09-04〜09-16） |
|---|---|---|
| 目的 | 手癖で出ない**別パターン**・楽器固有リフ | ドラムのキックに**揃える**（錨／chug ロック） |
| 中身 | 和声4型×楽器イディオムの雛形＋controlled variation＋ビン提示 | 固定2小節のペダル表3型（ベース・ギター）＋ルート追従 |
| 発散 | 配札（数枚配る・ピンを種に再配札） | 候補1件（`variety` を捨てて告げる）→ 後付けで3段 |
| 物理・身体性 | 楽器イディオム（開放弦ペダル・輪郭） | 無し（手の形は枠のみ・未結線） |
| 耳 | — | 錨＝要らない／ギター＝微妙／09-16＝リフではない |

## 3. 仕分け（残す／外す／保留）

区分の名前＝**(a) 残す**（耳合格・または音に関係しない道具）／**(b) 外す**（リフでないものをリフと呼んだ実装・その上のつぎはぎ・無難へ寄せる規則）／**(c) 保留**（耳かオーナーの判断が要る）。「照らした物差し」の番号は §1 の表。

### 3-1. コード（music-core / api / web）

| モジュール・機能 | 区分 | 根拠（物差し） | 所在 |
|---|---|---|---|
| ドラム M2 一式（drumFill／humanizeFill／bodyFill／gmdPrior／UI 3択／fillNotes） | **(a)** | ⑤耳合格 08-30・B6 裁定。保存ネタ 23 件が `fillNotes` を使用 | `packages/music-core/src/{drumFill,humanizeFill,bodyFill,gmdPrior}.ts`・TinkerSheet.tsx:380-405 |
| カスケード合図 cues（S0/S1/S2・land・respondToCues） | **(a)** | 音でなく配線。ドラム・ベース fill 位置の正準 | `packages/music-core/src/cues.ts`・generate.ts の fill/land 分岐 |
| JZ-WALK ウォーキング | **(a)** | ⑤「使える」。表を持たず規則で選ぶ＝③にも沿う | `packages/music-core/src/walkingBass.ts`・generate.ts:1537-1572・TinkerSheet.tsx:187,208 |
| 検証器 `verify/`（band_overlap／limbs／coverage／microtiming／nondeterminism／fretboard／pcMembership） | **(a)** | 観測専用・出音に触らない。**fretboard は「楽器の身体性」の足場**（③④ A-4） | `packages/music-core/src/verify/` |
| 通知の口（`meta.warnings` 素通し・web `genWarning` ダイアログ・`drumsSentButUnreadable`） | **(a)** | 08-29 裁定「フォールバックを通知する」の一般部品 | http.ts `/gen/section` warnings・useMelodyGen.tsx:177,459・SectionEditor.tsx:496-501 |
| MCP `chords` に分数コードの bass を足す | **(a)** | バグ修正（`01610b0`） | mcp.ts |
| rngSalt／engineVersion／PyRandom（choices・getState） | **(a)** | 基盤。engine 印は外す経路と一緒に消えるが定数は残してよい | `packages/music-core/src/{rngSalt,engineVersion}.ts`・humanizeFill.ts:87 |
| **ベース anchorLock 経路一式**（成立条件・体の組み立て・`lockBassRootsToSheet` 呼び出し・実音化・錨の台帳 `anchorStarts`/`anchorRootPc`・契約の実測・approach の錨回避・`relativeFallback:"anchor-lock"`） | **(b)** | ⑤錨＝要らない・09-16「ベースもマジで同じ」。②の課題に答えていない。③物理層なし | generate.ts:1420-1480（条件）・1573-1690（経路）・1778・1934-1990（通知） |
| `anchorStrictness`（(k-6) 変わり目だけ）・`anchorRestOnSyncopatedKick`（案B） | **(b)** | 外す経路のつまみ。09-15 裁定に従った実装だが土台ごと外す | anchorLock.ts の `strictness`／`kept`・generate.ts:1447-1453 |
| `BASS_GRAMMARS` 文法3型・`bassGrammarById`・`BASS_GRAMMAR_DEFAULT_ID`・`anchorGrammar` | **(b)** | ④ペダル型のみ。棚卸し自身が「移植不要」。源流「わざとらしい/収束の元」 | bassLibrary.ts:182-297 |
| `packages/music-core/src/anchorLock.ts`（移植関数） | **(b)** ただし `pmClamp`/`rootLowPitch`/`chordAtStep` は JZ-WALK・chordFollow が使う → 小さな共有ファイルへ移す | 依存＝walkingBass.ts:37・chordFollow.ts・generate.ts:30 | |
| **ギター guitarRiff 一式**（3型・`buildGuitarSkeleton`・`lockGuitarChugToSheet`・`assignGuitarPitches`・`gtrOnsetsToHits`・`GTR_QUALITY` 表） | **(b)** | ⑤微妙→09-16「リフじゃない」。④ペダル型のみ・追従が deg を捨てる。③物理層なし | `packages/music-core/src/guitarRiff.ts`・generate.ts:1016-1163 |
| `guitarRealize.ts`・`guitarHandshape.ts`（手の形の枠・`SHAPE_WEIGHTS_OTOMEMO` 仮置き） | **(b)** | ③「重みを振っても変わらなければバリデータ」の危険を自ら書いている枠。耳未判定・guitarRiff からしか届かない | `packages/music-core/src/{guitarRealize,guitarHandshape}.ts` |
| `guitarForms.ts`（調弦からフォーム導出・B弦補正） | **(b)→(a) 候補** | 幾何だけで耳の調律を含まない。使い手が無くなるので外す。指板の仕事を続けるなら `verify/` へ寄せて残す | `packages/music-core/src/guitarForms.ts` |
| `guitarPalmGate`／`guitarGhostVel`（案6・(k-4)） | **(b)** | 外すものの表面のつまみ。真因調査自身「動きの無さの本体には効かない」 | generate.ts:1046-1053・TinkerSheet.tsx:625-642 |
| web の実音化分岐 `resolveChordPattern` の `guitarRiff`・`ChordHit.voice/riff`・`ChordPatternContent.guitarRiff/engine/keyStab` 型 | **(b)**（keyStab 型は (c) に従属） | 外す経路の受け口。保存ネタに該当キー 0 件（DB 実測） | apps/web/src/music.ts:6,670,696-703,951-957 |
| **変奏の層 `riffVariation.ts`**＋ベース結線（`varyBass`・`bassRiff` 印・打ち消し実測）＋ギター結線（`guitarRiffTiles`/`guitarSkeletonFromTiles`）＋`riffVariationSteps` の3件化 | **(b)** | ⑤09-16「直したやつも謎」。入力が文法の役割注記に依存＝土台と一体。**発想（軸を1本だけ壊す・3段・保護 step・打ち消しの実測）は ④B-1/B-6 に沿うので負の知識でなく設計知識として §5 に残す** | `packages/music-core/src/riffVariation.ts`・generate.ts:986-1010,1361-1380,1600-1640・useMelodyGen.tsx:498-500 |
| **`chordFollow`（ベースの音高写し直し・5ガード＋層B表）** | **(c)** | 耳未判定・リフではない・「無難へ寄せる規則」（強拍＝コードトーン強制）の側。**表（`PM_CHORD_TONES`・`scaleOffsets`）は JZ-WALK が import** → 表は残す・genBass の `chordFollow` 経路と UI「コードに合わせ直す」は耳で要不要を決める | `packages/music-core/src/chordFollow.ts`・generate.ts:1892-1915・TinkerSheet.tsx:549-557 |
| **鍵盤の隙間刺し `keyStab`** | **(c)** | ⑤「もとが微妙でそれよりは良い」＝相対的には正。リフではなく「キックの隙間に和音」。自己完結（68行＋hits）。09-16 の発言に鍵盤は無い | `packages/music-core/src/keyStab.ts`・generate.ts:1164-1200・TinkerSheet.tsx:644-651 |
| **手の物理モデル `handModel.ts`** | **(c)** | 未結線・音に関係なし。③身体性の土台としては筋が通る。使う計画（M6c）が消えるなら死にコード（CLAUDE.md backlog「死にコード撤去」） | `packages/music-core/src/handModel.ts`・NOTICE.md |
| py-parity ダンプと参照値（8.8MB） | **(b)**（外す経路の分）／(a)（drums・walking・keyStab 分） | 外す関数の一致証明は用済み。`cases/`（anchorLock）・`cases-chord-follow`（保留）・`cases-guitar`・`cases-rng-spike`（残す）・`cases-handmodel`・`cases-key-stab`（保留） | `tools/py-parity/` |

### 3-2. 画面（web UI）に「リフ」として見えているもの

| 画面の文言 | 区分 | 所在 |
|---|---|---|
| ベース引き出し「キックにルートを置く（間のリフはそのまま残す）」「間のリフ（ペダル／ギャロップ／オクターブ）」「ルートを置くキック（変わり目だけ／全キック）」「変奏を3段で並べる」「裏キックは休む」 | **(b)** | TinkerSheet.tsx:495-548 |
| ベース引き出し「コードに合わせ直す」 | **(c)** | TinkerSheet.tsx:549-557 |
| ベース 型直指定「ウォーキング（試作・耳未判定）」＝JZ-WALK | **(a)**（文言の「耳未判定」は「使える」へ更新） | TinkerSheet.tsx:208 |
| コード楽器引き出し「ギターのリフ（試作）」群＝リフ文法／変奏3段／キックに刻みを揃える／手の形で弾く／刻みの短さ／弱音の強さ | **(b)** | TinkerSheet.tsx:589-643 |
| コード楽器引き出し「キックの隙間に刺す（鍵盤）」 | **(c)** | TinkerSheet.tsx:644-651 |
| ドラム「フィルの作り方」「フィルの行き先」「実ドラマーの癖」 | **(a)** | TinkerSheet.tsx:380-405 |
| 既存「リフ」レーン（`gen_riff`・WP-X3b） | **(a)・今回無傷** | TinkerSheet.tsx:49・generate.ts:2123 |

## 4. 外す場合の依存関係と危険・一括 revert か選択的除去か

### 4-1. 一括 `git revert a74363b^..HEAD` が不適切な理由

- 範囲 73 コミットに **残すもの**（ドラム M2 `97520a4`〜`b3fcd97`・cues `a74363b`・JZ-WALK `39cdd9d`・検証器 `a5ff438` `7bf5ecd`・通知 `48d6bae` `5944e6d`・MCP 修正 `01610b0`）が混ざる。
- **1コミットの中で混在**している例：`bae525a`（文法3型の登録＝外す ＋ 通知を `meta.warnings` へ移す＝残す）／`5944e6d`（錨の是正＝外す ＋ `/gen/section` が warnings を素通し＝残す）／`8566f1a`（ギター文法＝外す ＋ `QUALITY_INTERVALS` 共通化の確認＝影響なし）／`c7c561e`（`chordAtStep` の共通化＝JZ-WALK/検証にも効く）／`30c8749`（land/respondToCues＝残す ＋ 棚卸し doc＝残す）。
- 逆順に個別 revert すると (k-7) 系（`a229629`〜`d2aab8a` の 11 本）・`74f1845`（k-6）・`4f105be`（案6）はほぼ綺麗に戻りますが、M3-3a/3c・M5・M6a の到達口コミット（`193d6a9` `7e91a1a` `870fdfe` `1a35221`）は http.ts/mcp.ts/useMelodyGen.tsx の同じ行を後続が上書きしており、衝突の解消が手作業になります。

### 4-2. 推す手順＝選択的除去（既定の出音は不変）

外す対象は全部 opt-in で、立つ条件が明示のフラグ（`opts?.anchorLock === true`・`opts?.guitarRiff != null`・`opts?.riffVariation`）なので、経路を落としても未指定の出音は変わりません（各経路の「未指定＝bit一致」テストが既にあり、除去後もその主張は成り立つ＝除去作業の受け入れテストに使える）。

1. **(k-7)・(k-6)・案6 を逆順に revert**（`d2aab8a`→`2671238`、`74f1845`、`4f105be`）。design.md の (k-6)(k-7) は revert で消えるので、後で §5 の記録を書き直す。
2. **ギター M5 を手で除去**：generate.ts:1016-1163（gtrWins ブロック）・`guitarRiff/anchorLock/guitarShape/guitarPalmGate/guitarGhostVel/riffVariation*` の opts と http/mcp/section の受け口・useMelodyGen/TinkerSheet のギター群・music.ts:6,670,696-703,951-957・music-core の `guitarRiff.ts` `guitarRealize.ts` `guitarHandshape.ts` `guitarForms.ts`（残すなら verify/ へ）・index.ts の export・テスト（api 4本・web 1本・music-core 4本）・`tools/py-parity/cases-guitar`＋`dump_guitar.py`。**注意**＝`keyStab` は `!gtrWins` 条件を持つので、(c) で残すなら条件を単純化する。
3. **ベース M3-3a/3c を手で除去**：generate.ts の anchor 条件（1420-1480）・経路（1573-1690）・approach の錨回避（1778）・chordFollow の `isAnchor` 判定（1892-1915 内）・通知（1934-1990 の anchor 系）・`riffVariationSteps` 分岐（1361-1380）・bassLibrary.ts:182-297・http/mcp/section の受け口・UI・テスト（api 5本・music-core 2本）・`tools/py-parity/cases`＋`dump_bass_anchor_lock.py`。**`anchorLock.ts` の `pmClamp`/`rootLowPitch`/`chordAtStep` は JZ-WALK と chordFollow・検証器の番人テスト（`verify-shared-single-impl.test.ts`）が使う**＝`bassWindow.ts` 等へ移してから本体を削除。
4. **各段で3スイート実行**（music-core／api／web）。既存の「未指定＝bit一致」テストが緑のまま＝既定の出音不変の確認。
5. `packages/music-core/src/index.ts:36-90` のコメントと export を実態へ。`NOTICE.md` の pianoplayer 行は handModel を残す限り維持。

### 4-3. 危険

- **保存データ**＝該当キーを持つネタ 0 件（`data/cm.sqlite` の `neta.content` を LIKE で実測：guitarRiff 0／bassRiff 0／keyStab 0／engine 0／JZ-WALK 0／fillNotes 23）。移行不要。
- **MCP の inputSchema**＝`gen_bass`/`gen_chord_pattern` の説明文（mcp.ts:791,840）に錨・文法・変奏の長い説明が焼かれている。外し忘れると Chat 入口の Claude が存在しないつまみを渡す。
- **テストの規模**＝外す対象の専用テストは api 約 170 件・music-core 約 60 件・web 4 件（`grep -c` 概算）。既存の一般テスト（bit一致）は残る。
- **`/gen/section` の型**（http.ts:459）に `bass.anchor*`/`chord.guitar*` が生えている＝外し漏れると型だけ残る。
- **実機**＝dist 焼き直しと再起動（restart スキル）。

## 5. 文書の後始末（CLAUDE.md「ドキュメントの置き場」に従う）

| 文書 | 今 | 裁定後の扱い |
|---|---|---|
| `docs/design.md:2166-2377` 追補 (k)〜(k-7) | 錨・chordFollow・文法・JZ-WALK・指板検証・ギター・鍵盤・(k-6)(k-7) が1ブロック | **残す部分だけに書き直す**＝JZ-WALK（(k-2) 3d）・指板検証（3e）・通知の口の規約・(k-5) 隙間刺し（保留の間）。外した部分は削り、末尾に**「2026-09-16 撤去＝固定表＋キックロックはリフではない（負の知識）」を5行**で残す。design (p)「負の知識」欄が未作成なら、ここに置く |
| `docs/design.md` 追補 (j)〜M2 の記述 | 残す | 変更なし |
| `docs/archive/2026-09-09-phrasemaker-port-master-plan.md` | 裁定待ちリストに載っている | **archive へ**。決着1行＝「M3〜M6a 実装後、ベース錨・ギター文法・変奏の層は 2026-09-16 に撤去裁定。M6b〜M7 の裁定4件は打ち切り（§7 の③次第）」 |
| `docs/archive/2026-09-15-riff-variation-layer-design.md` | 裁定待ち（実装済み） | **archive へ**（決着＝撤去。設計知識＝レバー登録口・3段・保護 step・打ち消しの実測、は §5-2 の負の知識に1行） |
| `docs/drafts/2026-08-19-…port-plan.md`・`…implementation-plan.md`・`2026-08-20-…M0-contract.md`・`…recipe-io-map.md`・`2026-08-21-arrange-data-locus.md`・`…cascade-briefing-implementation.md` | 裁定待ちリスト | M0〜M2 は消化済み＝**archive へ**（決着＝ドラムで完走・ベース以降は打ち切り） |
| `docs/archive/2026-08-21-phrasemaker-arc-handoff.md` | 「機械の残りなし・試聴帳は耳待ち」 | **アーク完走（打ち切り）として書き直してから archive へ**。残す資産（ドラム・JZ-WALK・検証器・通知）と外した理由を1画面で |
| `docs/drafts/2026-08-02-arrange-arc-handoff.md` | S1 完了・S2/S3 が次 | **これが生きている引き継ぎ書**＝オーナーの課題の正準。S2/S3 へ戻る起点として更新 |
| `docs/research/2026-09-04-phrasemaker-bass-inventory.md` | 事実の記録 | 消さない。README の行に **訂正注記を1行追加**＝「§4 推し順1の耳実績はバンド全体の評価（真因調査 §2-3）・§3 表の『移植不要』が正しかった」 |
| `docs/research/2026-09-15-anchor-rigidity-…`・`2026-09-16-rhythmic-variation-…` | 事実の記録 | 消さない。README の行末に「→ 2026-09-16 土台ごと撤去裁定（本レビュー）」 |
| `docs/backlog.md:22-47` | M3 由来の項目（錨の縮退・耳判定2件・真因調査済み） | 錨・ギターの項目は**削除**（経緯は archive の引き継ぎ書と本レビューが持つ）。残す＝S2/S3 の行・6拍子ドラム（自作）・小節単位の別案・隣接バグ2件 |
| `docs/drafts/README.md` | 上記が裁定待ちに並ぶ | 上記を「決着して出ていったもの」へ移し、**空に近づける** |
| メモリ `project-phrasemaker-port-arc.md` | 「機械の段は M6a まで完了・残＝裁定4件」 | 進行役が実態へ更新（本レビューの範囲外＝指摘のみ） |

### 5-1. 必ず残す負の知識（外した理由・design と research README へ）

1. **キックに揃える規則（錨・chug ロック）は合奏の糊であってリフではない。** 耳＝「必ずルートは固い」。研究上も「キック位置＝ルート」の規則は無く「変わり目＝ルート・強拍＝構成音」（源流ブレスト §1-1）。
2. **固定2小節の表を貼る方式は、既存の型辞書と同じ性質＝リフを"作る"仕組みではない。** 源流も「grammar 表はわざとらしい/収束の元・半分生存」と自認。表の上に変奏の層を足しても、動かせる音が元から 10〜19% では差が出ない。
3. **移植の根拠にした耳の実績は、評価の単位（バンド全体／単体）を確かめる。**「ロックとても良い」はベース単体の評価ではなかった。
4. **別アークの計画は、オーナーの課題の計画（S2/S3）と接続してから走らせる。** 名前（リフ）だけ合流して課題が合流しなかったのが今回の形。
5. **「使える」と言われた JZ-WALK と「固い」と言われた錨の差＝表を敷かず規則で選ぶ／表を敷く**（真因調査 §4）。次にリフを作るときの向き。

## 6. 次に作るべきもの（入口だけ・設計はしない）

- **戻る先＝2026-08-02 計画の S2 配札・S3 リフ雛形**（design.md:532-534・Task #3/#4）。入口は既存の `gen_riff` verb（generate.ts:2123・研究 `2026-07-14-riff-ostinato-design.md`＝2部構造・和声 indep/follow 自動判定・ループ適性）＝**今回のアークが一度も触らなかった、本来のリフ生成器**。
- **材料の制約を守る形**：他者実データ（POP909 等）は**リズム分布・輪郭・遷移統計のみ**で候補分布を較正（design.md:534 横断）。自作 MIDI 採取は不採用のまま。オーナーに自作リフを求めない。
- **足場として再利用できる今回の資産**：`verify/fretboard.ts`（指板の到達可能性＝ギター/ベースの身体性の制約・生成の `playable` 述語として注入可）・`riffVariation.ts` の**発想**（軸を1本だけ壊す・なし/中/多めの階段・保護 step・打ち消しの実測＝④B-1/B-6）・候補トレイに複数件を積む web の動線（`useMelodyGen.tsx:462-463`）・JZ-WALK の「表を敷かず規則で選ぶ」作り。
- **問いの立て方**（設計ではなく方向）：和声4型（移調/固定/ペダル/微調整）を**選べる**こと・楽器イディオムを**制約**として持つこと・数枚配って**ピンを種に再配札**できること。これが 08-02 の枝2「惜しい候補の救済」と枝6「課題自体は生きている」への答え。

## 7. オーナーに決めてほしいこと

| # | 問い（20字） | 選択肢（40字） | 私の見立て（材料として） |
|---|---|---|---|
| 1 | 錨・ギター文法・変奏の層を外す | (A) §3 の (b) を全部外す／(B) 変奏の層の純関数だけ残す／(C) 外さない | **(A)**。(B) は呼び手が無くなり死にコード。(C) は 09-16 の発言と整合しない |
| 2 | 保留3件の扱い | 隙間刺し＝残す／外す。chordFollow の経路＝残す／外す（表は残す）。handModel＝残す／外す | 隙間刺し＝耳が相対的に良いので**残す**寄り。chordFollow 経路＝耳未判定なので**耳で1回**。handModel＝M6c を畳むなら**外す** |
| 3 | phrase_maker アークの終わり方 | (A) ドラム＋JZ-WALK＋検証器で完走扱い・M6b〜M7 と裁定4件は打ち切り／(B) 鍵盤・ケルトを別枠で続ける | **(A)**。続けるなら、S2/S3 の後に改めて計画を切る |
| 4 | 次＝S2/S3 へ戻る | 戻る／別に考える | **戻る**。入口は `gen_riff`＋和声4型＋配札 |

## 8. 自信の無い点

- **変奏の層の試聴帳（09-16・https://claude.ai/artifact/4Sn2eJrG3CPXAt4F9gbzn7）をオーナーが聴いたか不明**。依頼書の指示どおり「直したやつ」への評価として (b) に置いたが、聴いていて「3段の出し方は使える」なら、層の純関数だけを S3 の部品として残す選択（問い1の (B)）はあり得る。
- **chordFollow と keyStab は耳判定が薄い**。私は「リフではない・別の道具」と見て (c) に置いたが、「今回のアーク由来は全部外す」という判断もオーナーの物差しとして成り立つ。
- **09-15 のオーナー裁定（案2・案6・案1）と本レビューの結論は食い違う**。裁定は当事者が用意した選択肢表（土台を替える案4は「次の白紙設計」）の上で下されたものと私は読んだが、オーナーが案4 を承知のうえで案1/2 を選んだのなら、(k-6)(k-7) を外す判断は再確認が要る。
- **テスト件数・行番号は 2026-09-16 main（`16c45a8`）時点**。除去作業の際は再取得する。
- `guitarForms.ts` を残すか（verify/ へ）外すかは、指板の仕事を S3 で続けるかに依存＝私は決めていない。

## 9. 出典

- otomemo：`CLAUDE.md`／`docs/requirements.md:18-35`／`docs/design.md:510-534,563,2166-2377`／`docs/backlog.md:22-47`／`docs/drafts/2026-08-02-arrange-arc-handoff.md:157-191`／`docs/archive/2026-08-19-phrasemaker-port-plan.md:7`／`docs/archive/2026-09-09-phrasemaker-port-master-plan.md` §0・§1・§4-1・§4-9・§5-2・§8／`docs/archive/2026-08-21-phrasemaker-arc-handoff.md`（耳の判定表）／`docs/archive/2026-09-15-riff-variation-layer-design.md`／`docs/research/2026-08-02-riff-structure-and-variation.md`（設計含意・A-3・B-1・B-6）／`docs/research/2026-09-04-phrasemaker-bass-inventory.md` §3・§4／`docs/research/2026-09-15-anchor-rigidity-guitar-motion-rootcause.md` §0・§2-3・§3-3・§4・§5・§6／`docs/research/2026-07-14-riff-ostinato-design.md`
- コード（main `16c45a8`）：`apps/api/src/music/generate.ts:964-1200,1353-1990,2123`／`apps/api/src/music/bassLibrary.ts:1-60,182-297`／`apps/api/src/http.ts:285-365,459-525`／`apps/api/src/mcp.ts:790-843`／`apps/web/src/music.ts:6,670,696-703,951-957`／`apps/web/src/useMelodyGen.tsx:177,491-515,524-532,459-463,577-606`／`apps/web/src/components/TinkerSheet.tsx:187-208,380-405,495-557,589-651`／`packages/music-core/src/{anchorLock,chordFollow,walkingBass,guitarRiff,guitarRealize,guitarForms,guitarHandshape,keyStab,handModel,riffVariation}.ts`／`packages/music-core/src/index.ts:36-90`／`packages/music-core/src/verify/index.ts`
- git：`git log --oneline --reverse a74363b^..HEAD`（73 コミット・2026-08-21〜09-16）／`git diff --stat a74363b^..HEAD`（377 ファイル・うち fixtures 除き 121）／`git show 30c8749`
- DB 実測：`data/cm.sqlite` `neta.content` LIKE 検索（better-sqlite3・読み取り専用）
- phrase_maker（読むだけ）：`docs/CONCEPT.md` §1-§4／`docs/HANDOFF-NEXT.md:14,25,30`／`docs/poc/BRAINSTORM-bass-kick-lock.md` §0-§3

## 10. オーナー裁定（2026-09-16）と撤去の結果（追記）

**裁定**
1. §3 の仕分けどおりに外す（(b)＝ベース錨一式・ギター文法一式・変奏の層・それらの UI/MCP/section の口・テスト・py-parity）。
2. **保留の3件も外す**＝鍵盤の隙間刺し（keyStab）・和音追従の経路（chordFollow）・手の物理モデル（handModel）。ただし **JZ-WALK は残す**＝JZ-WALK が実際に依存している表と関数は壊さない。handModel を外すなら NOTICE.md の pianoplayer 帰属も整理。
3. 残す＝ドラム M2・cues・JZ-WALK・検証器 `verify/`・通知の口・MCP の分数コード `bass`・研究 doc。
- §7 の③（phrase_maker アークの終わり方）④（S2/S3 へ戻る）は本裁定では明示されていない＝`docs/backlog.md` の「楽器アレンジの打ち込み助け」節に裁定待ちとして残した。

**撤去の結果**（コミット＝`3b0ea56` web／`dce4cb6` api／`dd9fdd5` music-core／本書を移した docs コミット）
- 外した：§3 (b)(c) の全部（keyStab・chordFollow・handModel を含む）。music-core の `anchorLock/chordFollow/guitarRiff/guitarRealize/guitarForms/guitarHandshape/keyStab/handModel/riffVariation.ts`、api の経路・`BASS_GRAMMARS`・到達口、web の引き出しとギター実音化、テスト、`tools/py-parity/` の cases/cases-chord-follow/cases-guitar/cases-handmodel/cases-key-stab と dump、NOTICE.md の pianoplayer・Parncutt 節。`guitarForms.ts` は使い手が無くなるので外した（§8 の問いは「外す」で決着）。
- **JZ-WALK の依存の扱い**：実物で追うと JZ-WALK が import していたのは anchorLock の `pmClamp`/`rootLowPitch` と chordFollow の層B スケール表（`scaleOffsets` ほか）・`CfChord`・`chordTonePcs`/`chordScalePcs`/3度/5度/7度だった（§3 の「`chordAtStep` も JZ-WALK が使う」は**誤り**＝`chordAtStep` はギターの検算と web 実音化だけが使っていた）。これらを `packages/music-core/src/chordScale.ts` へ文字どおり移し、表の一致は撤去前の py-parity 参照値から抜いた fixture（`test/fixtures/chord-scale-layerB.json`）で引き継いだ。JZ-WALK と既定経路の出力は撤去前後で sha 一致を実測。
- `rngSalt`/`engineVersion`/`PyRandom`（choices・getState）と `tools/py-parity/cases-rng-spike` は残した（py-random-parity テストが使う）。
- 外したつまみが古い呼び出しから来たら `meta.warnings`（/gen/section は `warnings`）で「2026-09-16 に外した機能」と告げる（MCP は schema から外し passthrough で拾う）。
- 負の知識（§5-1 の5項）＝`docs/design.md` 追補 (k) の撤去記録へ昇格。
