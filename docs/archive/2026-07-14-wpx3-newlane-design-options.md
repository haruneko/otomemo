# WP-X3 新生成器群（対旋律／セクション楽器＝管弦／リフ）の新レーン設計 相談メモ

- 作成: 2026-07-14
- 目的: 対旋律・ホーン/ストリングス（セクション楽器）・リフ を生成する新生成器群を入れるにあたり、**「新レーン種別がデータモデルに触る」影響を実コードで確定**し、選択肢（A/B/C）を提示してオーナーと議論する材料にする。
- 位置づけ: 研究/設計相談ドキュメント。正準は `docs/design.md`。実装判断はこのメモを踏まえてオーナーと決めてから。
- 関連: `docs/research/2026-07-14-horn-string-arranging.md`（X6・ホーン/ストリングス書法の定型辞書）＝**本メモの「何を生成するか」の中身**。本メモは「**それをどのデータ種別/レーンに載せるか**」の器の話。

---

## 0. 要点（先に結論）

- **推奨＝案A（新kindを一級追加）を「対旋律(counter)」だけ先行**。理由は下記§6。ただし**セクション楽器(管弦)は "1kind=1レーン" 前提を割る**（複数声部が同時に要る）ので、A単純適用では足りず**レーンモデルの拡張が要る**＝ここがWP-X3最大の論点。
- **最大の落とし穴＝レーンは「lane列」を持たず `kind` から導出**（design #14）。同一kindのネタは全部同じ1レーンに落ちる。唯一の例外が `chord_pattern` の**2レーンハック（`ord===1`で振り分け）**＝ハードコード2本・位置依存で脆い。管弦の「ホーン3声＋ストリングス2声」を素直に並べる受け皿が**現状には無い**。
- **ede57f4（骨格追加）の教訓の実測**：新music kind追加は「登録1箇所」では終わらず、**色/アイコン/レーン(4種)/合成/再生パート/エディタ振分/MIDI名 の芋づる（下記§2の12〜13箇所）**を全部手当てしないと下流が黙って欠ける。§2に全リスト化した。

---

## 1. 現状のデータモデル（実証 file:line）

### 1-1. kind レジストリ（SSOT は web 側の1表）
- `apps/web/src/kinds.ts:15` `KIND_DEFS`＝**唯一の種別表**。`music/container/text/capturable/filterable` フラグから `KINDS/FILTER_KINDS/MUSIC_KINDS/…` を導出（:34-39）。現行 music kind＝`melody/bass/chord/chord_progression/chord_pattern/rhythm/skeleton`（:17-23）。
- **api 側に kind の enum 型は無い**（`neta` 表の自由文字列カラム。`apps/api/src/repo/neta-repo.ts` 等は文字列で扱う）。kind の「意味」を持つのは**ほぼ全部 web**（色/レーン/エディタ/再生）。＝**新kind追加のコスト重心は web**。
- 色: `apps/web/src/theme.ts:2` `KINDS_COLORED` ＋ `:18` `DEFAULT_COLORS`（新kindを両方に足す。足し忘れると `--k-xxx` 未定義で色が出ない）。`kinds.ts:43 kindColor()` は `chord_*→chord` に畳むだけ。
- アイコン: `apps/web/src/components/KindIcon.tsx`（kindごとの `case`。新kindは新caseかフォールバック）。

### 1-2. レーンモデル（＝新レーンの本丸）
- **compose_edge は lane列を持たない**（design.md:412「任意子DAG」）。**レーンは子の kind から導出**。
- レーン定義: `apps/web/src/components/sectionLanes.ts:13` `SECTION_LANES`＝7レーン（chord/skeleton/melody/chord_pattern[row0]/chord_pattern2[row1]/bass/rhythm）。**各レーンは `kinds:[…]` の集合で子を吸う**。
- レーンへの子の振り分け: `apps/web/src/sectionContext.ts:31 laneChildren()`＝`inLane(lane,kind) && (lane.row===undefined || rowOf(c)===lane.row)`。`rowOf`（:29）＝**`c.ord===1 ? 1 : 0`**。
  - ★**crux**: 「1kindを2レーンに割る」唯一の既存手段が chord_pattern の row ハック。**ハードコード2本・`ord` 依存で、3声以上/任意本数は表現できない**。管弦（ホーン隊＋ストリングス隊で最低2〜4声部を同時に見せたい）はこの器では窮屈。
- レーン付随テーブル（新レーンごとに手当て）: `sectionLanes.ts:32 LANE_COLOR`／`:43 LANE_MIDI_NAME`（MIDI分割書出のASCIIトラック名）。
- ミニ表示レーン（ネタ帳カード）: `apps/web/src/components/MiniRoll.tsx:78 MINI_LANES`（別定義＝**二重管理**。ここも足す）。

### 1-3. 合成（assemble）と再生パート
- `apps/web/src/music.ts:614 compositeNotes()`＝section の子を実調へ移調＋位置オフセットして1本の `Note[]` へ。
  - **未知kindは無音**: `:598 notesForContent()` が `kind==="melody"||"bass"` 等の**明示分岐のみ**を notes 化し、それ以外は `return []`（:601）。→ **新kindは notesForContent に足さないと合成で一切鳴らない**（skeleton は敢えて `[]`＝合成無音・:644）。
  - **再生パート(MixPart)**: `:647` `part = bass?…:rhythm?…:chord_pattern?"chord":"melody"`。**新kindは何もしないと "melody" パートに落ちる**（メロと同じフェーダー/音量。うるさく混ざる）。MixPart 型＝`melody|chord|bass|drums`（`:43`）＋ `apps/web/src/audio.ts:60 MIX_PARTS`。**独立フェーダーが欲しければ MixPart を1つ増やす**（music.ts型＋audio.ts配列＋MixerControl UI）。
  - 音色(GM program): `:649` 個々のノートに `content.program` を載せる（bass 既定33等）。**program はノート単位で自由**＝管弦のGM音色（Strings48/Trumpet56等）は content 側で持てる＝**再生の器は既に対応済**（新kind不要でも音色は出せる）。

### 1-4. エディタ振り分け
- `apps/web/src/useNetaEditor.ts:97-103` `isMelody/isBass/isChord/isChordPat/isRhythm/isSkel/isContainer` の bool 群。program 既定も `:65`（bass=33/skeleton=48）。
- `apps/web/src/components/KindEditorBody.tsx:108` これらフラグで**どのエディタUIを出すか分岐**（melody/bass＝ピアノロール共用、chord_pattern・rhythm・skeleton＝専用）。**単音ラインの新kindは isMelody 相当に相乗り可**（ピアノロール流用）。

### 1-5. MIDI/DAW 書き出し
- **MIDI分割書出**: `apps/web/src/components/SectionEditor.tsx:284 laneTracks()`＝**`LANES.map()` で回すので新レーンは自動で1トラックになる**（:288 `LANE_MIDI_NAME[lane.key]`・:291 program は composite notes から採る）。→ **レーンさえ足せば MIDI分割は追従**（laneTracks 自体は改修不要）。
- **DAW(Reaper)書出**: `apps/api/src/reaper.ts:86 kindOf`＝ジョブ intent→kind の対応表（gen_melody/gen_chord/gen_rhythm のみ）。**非同期ジョブ経由の生成を足す場合のみ**ここに追記が要る（同期 /music 経由なら不要）。

### 1-6. 生成の結線（新 gen verb の定型）
- HTTP: `apps/api/src/http.ts:174 app.post("/music/:op")`＋`:192 case "gen_melody"` / `:232 case "gen_bass"`。**新verbは case を1本足す**。
- 依存順生成: `:296 /gen/section`＝**rhythm→bass→melody の依存順**で各パートを生成し place（:311-317）。対旋律は「melody生成後にそのメロを相手に」＝**この依存鎖の末尾に counter を足す**のが素直（既存 `counter` ノブ＝§4）。
- MCP: `apps/api/src/mcp.ts:534 gen_melody` / `:586 gen_bass` / `:568 gen_skeleton` のツール定義群。**新verbはツール定義1本＋inputSchema**。
- ドメイン: `apps/api/src/music/generate.ts`（`genMelody/genBass/genChords`…）に**新生成関数**。
- web 生成UI: `apps/web/src/useMelodyGen.tsx`＋`SectionEditor.tsx` の「いじる▾」メニュー（候補トレイ/試聴/置く）。

---

## 2. 芋づるの全リスト（新 music kind 1個を足すと触る所）

ede57f4（skeleton）は特殊要素（専用エディタ・机・対位法・合成無音）を含み ~28ファイルに波及したが、**「melody と同型の notes を持つ単音ラインkind（=counter/riff）」に限れば下記 12〜13箇所**。各々は小追記だが**1つでも抜くと下流が黙って欠ける**（色出ない/合成で鳴らない/MIDIに乗らない）。

| # | 箇所 (file:line) | 内容 | 抜くと |
|---|---|---|---|
| 1 | `apps/web/src/kinds.ts:15` KIND_DEFS | 種別登録（music:true, capturable, filterable） | 捕獲/絞込に出ない |
| 2 | `apps/web/src/theme.ts:2,18` KINDS_COLORED＋DEFAULT_COLORS | 種別色 | `--k-xxx` 未定義＝無色 |
| 3 | `apps/web/src/components/KindIcon.tsx` | アイコン case | アイコン欠け |
| 4 | `apps/web/src/components/sectionLanes.ts:13` SECTION_LANES | **レーン追加**（配置の受け皿） | 配置できない |
| 5 | `sectionLanes.ts:32` LANE_COLOR | レーン色 | ピッカータブ無色 |
| 6 | `sectionLanes.ts:43` LANE_MIDI_NAME | MIDI分割トラック名 | key名フォールバック（日本語化けは回避されるが雑） |
| 7 | `apps/web/src/components/MiniRoll.tsx:78` MINI_LANES | ネタ帳カードのミニ表示レーン | カードに出ない（二重管理） |
| 8 | `apps/web/src/music.ts:598` notesForContent | notes化（合成/尺計算/プレビュー） | **合成で無音・尺0** |
| 9 | `music.ts:647` compositeNotes の part 分岐 | MixPart 割当 | melodyパートに混ざる |
| 10 | `apps/web/src/useNetaEditor.ts:97-103,65` isXxx＋program既定 | エディタ判定・既定音色 | 編集UIが出ない/音色既定0 |
| 11 | `apps/web/src/components/KindEditorBody.tsx:108` | エディタ本体の振分（melody相乗り可） | 空エディタ |
| 12 | （任意）`music.ts:43 MixPart`＋`audio.ts:60 MIX_PARTS`＋MixerControl | 独立フェーダーが要るなら | 独立音量調整不可 |
| 13 | （生成する場合）http.ts case＋mcp.ts tool＋generate.ts＋useMelodyGen/SectionEditor＋（非同期なら reaper.ts:86） | 生成verb一式 | 手置きのみ |

**自動追従する（触らなくてよい）もの**＝ `laneTracks()`（LANES.map で回る）・`compositeNotes` の移調/位置ロジック（kind非依存の実音経路）・GM program（ノート単位）・検索/DB（kind自由文字列）。

---

## 3. 「セクション楽器＝管弦」がデータモデルに突きつける固有問題（重要）

対旋律/リフは**単音ライン**＝melody と同型（notes配列・1レーン）で素直。だが**ホーン隊/ストリングス隊は本質的に複数声部の束**（X6 doc＝ブロックボイシング・ディヴィジ）。これがデータモデルに2つの選択を迫る:

1. **1ネタ=多声（和音notes）にする**か、**1ネタ=1声で複数ネタを並べる**か。
   - `chord_pattern` は既に「進行に解決する多声voicing」を1ネタで持つ（`music.ts:593 resolveChordPattern`）＝**管弦は chord_pattern の親戚**（コードに追従する多声）として作れる可能性がある。ただし chord_pattern は「コード楽器（伴奏刻み）」の意味に寄っており、**旋律的セクションライン（ホーンのフレーズ）とは意味が違う**。
2. **複数レーンで見せたい**（ホーン/ストリングスを別レーンに）場合、§1-2 の crux にぶつかる＝**kind→レーン導出では任意本数を割れない**。chord_pattern の row ハック（2本・ord依存）を一般化するか、**レーンモデルに「サブレーン/声部」概念を入れる**必要がある＝これはデータモデル改修（design #14/#19 に触る）＝**WP-X3で最も重い意思決定**。

→ **対旋律/リフ**（単音）と**管弦**（多声・複数レーン）は**難易度が段違い**。分けて扱うべき。

---

## 4. 骨格の机（design #20）との関係

- 対旋律は既に**メロ生成の中に部分的に存在**：`gen_melody` の `bass`＋`counter` ノブ（`mcp.ts:534`・design.md:280-285）＝「ベースに対して反行/斜行を優先」する**対位バイアス**。ただしこれは**メロ自身を対位的にする**ものであり、「**独立した対旋律ネタを別トラックで生む**」ものではない。WP-X3の対旋律は後者＝**新レーンが要る所以**。
- 机の「④出口」＝骨格→表面メロ生成（design.md:1747）。対旋律を机に載せるなら選択肢:
  - (a) **④出口の第2種**：焦点骨格から「対旋律を作る▶」＝主メロ or 骨格を相手に counter 生成→counterレーンへ置く（realized_from を counter 用途で流用/拡張）。既存の「メロを作る▶/ベ▶」に**third button**を足す形＝机の構造に素直。
  - (b) **机の第5前景**：design.md「E 背骨は別楽器」裁定（research 2026-07-12-desk-feel-seams）で「机の第5前景は偽り・別楽器がtransport/loop共有が正直」と既に結論済。→ **対旋律を"机の前景"にはしない方が設計と整合**。「transport/loop/在庫を共有する別の道具」として置く。
- 管弦（多声）は骨格の机の**2声レンズ（骨格だけ⇄フル）**とは層が違う（伴奏ベッド側）。机の「①伴奏/②コード」前景の**フル側の中身が厚くなる**だけ＝机本体の改修は不要、レンズの「フル」に自然に含まれる。

---

## 5. 選択肢（A/B/C）

### 案A: 新kindを一級追加（`counter` / `section_inst`(or `horn`/`strings`) / `riff` を各々）
- 触る: §2 の 12〜13箇所 × 種別数（ただし counter/riff は melody相乗りで #10/#11 は軽い）。管弦は §3 のレーン改修が上乗せ。
- 工数感: **counter/riff＝各 中（半日〜1日/種）**。**section_inst＝大（レーンモデル改修込みで数日）**。
- 骨格の机: counter は §4(a) の④出口第2種として素直に載る。管弦は机外（伴奏ベッド）。
- MIDI/再生: レーン追加で MIDI分割は自動追従（#6のみ）。再生は MixPart 追加を推奨（独立音量）。
- リスク: **意味が明確**（対旋律/管弦/リフが別物として一覧・色・フィルタで立つ）。デメリットは芋づるを種別数ぶん払うこと＋**足し忘れ事故**（ede57f4の轍）。→ §2表をチェックリスト化して防ぐ。

### 案B: `melody` kind 再利用＋role タグ（`role:counter` 等）
- 触る: ほぼゼロ（タグ運用＋生成時に role を付ける）。既存 melody 経路に相乗り。
- 工数感: **小**。
- 骨格の机/MIDI/再生: melody と同一扱い＝**独立レーンにできない**（§1-2＝melodyレーンは1本、role で分けられない）。**MIDI分割で対旋律が主メロと同じ"Melody"トラックに合流**。MixPart も melody 固定。
- リスク: **「どれが主メロか」混同**（メロ最優先＝ユーザーの苦手領域なのに主/副が曖昧化）。フィルタ/色で立たない。**メロ帳が対旋律/リフで濁る**（retrieval 汚染）。管弦は表現不能。**メロ最優先方針（MEMORY: priority-melody-first）と衝突**＝非推奨。

### 案C: 汎用「楽器ライン」kind 1個（`inst_line`）＋ instrument/role メタ
- 触る: §2を1回だけ（kind1個）。ただしレーン導出を**メタ駆動**に拡張（kind→レーンでなく `content.role`→レーン）＝§1-2/design #14 の「kindからレーン導出」原則を**メタ導出へ一般化**する改修が要る。
- 工数感: **中〜大（初回の抽象化コスト）／以降は追加種別ゼロ**。
- 骨格の机/MIDI/再生: レーン/パート/色を**メタで引く**汎用テーブルにできれば、管弦の任意声部も「role=horn1/horn2/strings」で複数レーンに割れる＝**§3の crux を正面から解く唯一の案**。
- リスク: **抽象で意味が薄い**（一覧に「楽器ライン」ばかり並ぶ）。UIラベル/色をメタから引く実装が要る。design #14「lane列を持たない」を**「lane はメタから導出」に更新**する必要＝上位spec改訂。将来の拡張（ギターソロ/パッド/SE…）には最強。

---

## 6. 推奨

**二段構え**:
1. **対旋律(counter) と リフ(riff) ＝ 案A（一級kind・melody相乗りエディタ）で先行**。単音ラインで芋づるが軽く、意味も明確、メロ最優先方針とも整合（主/副が色とレーンで立つ）。counter は机の④出口に「対旋律を作る▶」として載せる（§4a）。
2. **管弦(section_inst) ＝ 単独で走らせず、案C的なメタ駆動レーンの検討とセットにする**。§3 の「1kind=1レーン」を割る問題は case A 単純適用では解けない。ここは**先にレーンモデル（design #14/#19）の意思決定**をしてから実装。急ぐなら暫定で chord_pattern 親戚（コード追従多声・レーン1本）として1声だけ先行も可だが、ホーン隊の複数声部は保留。

理由の芯: **単音ライン（counter/riff）と多声セクション（管弦）はデータモデル要求が別物**（前者は既存レーンに素直、後者はレーン改修必須）。混ぜて一括設計すると管弦のレーン問題が counter/riff を人質に取る。

---

## 7. オーナーへの質問（これが決まらないと設計が振れる）

1. **管弦の見せ方**: ホーン隊/ストリングス隊は「**1ネタ=多声（和音）で1レーン**」で足りるか、それとも「**声部ごとに別レーン（horn1/horn2/strings…）で並べて触りたい**」か？ 後者ならレーンモデル改修（案C or row ハック一般化）が要る＝WP-X3の重さが跳ねる。
2. **管弦の生成の相手**: 管弦は「コード進行に追従する伴奏（chord_pattern 親戚）」寄りか、「メロと絡む旋律的セクションライン（対旋律の厚いやつ）」寄りか、両方要るか？（X6 doc は両方の書法を持つ＝どちらを先に器にするか）
3. **対旋律の置き場**: 対旋律は「**独立した counter ネタ（別トラック・別色）**」が欲しいか、それとも今の `gen_melody` の `counter` ノブ（メロ自身を対位的にする）の強化で足りるか？ 前者なら新kind、後者なら既存ノブ拡張で済む。
4. **独立フェーダー**: 対旋律/管弦は再生時に**主メロと別の音量ツマミ**が要るか（＝MixPart を増やすか）、当面 melody/chord パートに相乗りで良いか。
5. **抽象化の許容**: 将来ギターソロ/パッド/SE 等も足す気があるなら、いま案C（汎用楽器ラインkind＋メタ）に投資しておく価値がある。個別kindを都度足す（案A反復）方が好みか、1回抽象化して以降ゼロコストにしたいか。

---

## 8. オーナー裁定（2026-07-14・確定）

§7への回答：
1. **管弦の見せ方＝1ネタ多声・1レーンで十分**（声部ごと別レーンは不要）→ §3のcrux（レーンモデル改修）は**回避**。案C検討は不要になった
2. **管弦の性格＝両方欲しい・伴奏(pad/stab)を先に** → 第1弾はchord_pattern親戚（コード追従多声）として実装、旋律的セクションラインは後続
3. **対旋律＝独立counterネタ**（案A・一級kind・机④出口に「対旋律を作る▶」）
4. **抽象化＝都度・案A反復**（counter/riff/section_instを個別kindで。案Cは管弦で行き詰まった時に再検討）

**確定した実装形**（WP-X3を3スライスに分割・1エージェント直列で）：
- X3a `counter`：一級kind・melody相乗りエディタ・§2の12箇所チェックリスト・MixPart追加（独立フェーダー）・④出口третий button・生成=X5 doc（間ま依存・P0-P3制約）
- X3b `riff`：一級kind・melody相乗り・生成=X7 doc（2部構造・4スキーム・和声関係3類型）
- X3c `section_inst`：一級kind・**1ネタ多声1レーン**・chord_pattern親戚（resolveChordPattern流用検討）・生成=X6 doc（pad/stab先行・ボイシング規則）・GM音色はcontent.program
