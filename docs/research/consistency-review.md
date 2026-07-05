# 整合監査：研究findings ↔ 設計#12-M ↔ 実装（rhythmCells / melodyCells）

文脈を持たない素の目での監査。根拠はファイルのみ。対象＝
`docs/research/melody-corpus-findings.md`（findings）／`docs/design.md` #12-M S7・S8／
`docs/research/melody-generation.md` §10・§12／`apps/api/src/music/rhythmCells.ts`・`melodyCells.ts`＋両テスト。

**テスト実行**：`npx vitest run test/rhythm-cells.test.ts test/melody-cells.test.ts`
→ **24/24 緑**（rhythm 12・melody 12）。緑だが、後述のとおり**契約の穴**で実装バグを取り逃している。

---

## ① 一致している点

- **リズム拍セル語彙＝2^枠/拍**：findings①(distinct15・50%5語) と design S7（拍単位なら15種・語彙=2^枠）と `rhythmGrid`/`barCells`（4/4→16分4枠、複合6/8→8分3枠）が一致。複合拍子の `.25/.75 が存在しない` も `slotsPerBeat:3` で正しく実装（rhythmCells.ts:12）。
- **位置条件マルコフ＋小節頭リセット**：design S7「P(次セル│直前セル,小節内拍位置)」「小節をまたがない」を `learnRhythmCells`（prev リセット, rhythmCells.ts:55,87）が実装し、テスト rhythm-cells.test.ts:45,48 が保証。
- **音数DP（歌詞の音数指定）**：design S7/§12.2「拍上DP・合計onset=N を必ず満たす」を `genCount`（状態=累積onset数, rhythmCells.ts:98）が実装、test:75-89 が N=3..8・複数小節・不能=throw まで保証。**ここはfindings/設計/実装/テストが完全整合**。
- **joint cell の条件づけ＋±3クランプ**：design S8 層2「P(cell│骨格move ±3）」を `learnMelodyCells`+`clamp3`（melodyCells.ts:39,46）が実装、test:46 が保証。**条件なしだと爆発（findings⑪/design 3771種）→条件づけ必須** という研究の禁則は守られている（C評価＝OK）。
- **8分基底（16分は8分の細分）**：findings/design「16分はBPM依存→8分基底」に対し、cell は常に2スロット×0.5拍固定（melodyCells.ts:33,84）＝16分を絶対刻みにしていない。研究の禁則に反していない。

---

## ② ズレ／未実装／矛盾（最重要）

### 矛盾A（実バグ）：fallback が旧記法 `"0@0"` を返し、`realizeMelody` で NaN ピッチを生む
- `sampleCell` のデフォルト fallback は **`return "0@0";`**（melodyCells.ts:68）。
- だが cell の正準記法は `;` 区切り（`parseCell` は `cell.split(";")`、melodyCells.ts:26、コメント「旧 move@slot から拡張」melodyCells.ts:23）。
- `parseCell("0@0")` → 区切り無し1トークン `"0@0"` → `Number("0@0")=NaN` → `{kind:"onset", move:NaN}`。
- `cellToNotes` は `Number.isFinite(s.move)` ガードがあり**音を黙って捨てる**（melodyCells.ts:33）が、**`realizeMelody` には finite ガードが無い**（melodyCells.ts:87 `idx(skeleton[i])+tk.move`）→ **pitch=NaN の音符を出力**。
- ＝学習データに無い move を引いた時（fallbackも全滅した時）に**壊れた音符が混入**。design S8 のコメント「空で落ちない」という意図に反し、実際は NaN で静かに壊れる。
- 修正方針：fallback は `"0"`（または `"0;r"`）等の `;` 正準記法に。加えて realizeMelody:87 に finite ガードを足す。

### 未実装B：design S8 が「実装中」と謳う **層3＝16分細分（r01）** がコードに存在しない
- design:604「層3＝16分細分（稀・装飾）…全部 r01・違いは2音目の度数move のみ」、findings⑫/M12 が核心構造として記載。
- だが `melodyCells.ts` の cell は **8分2スロット固定**で 16分スロットを表現する記法・展開が無い（grep: r01/16分/sixteenth ヒット無し）。`realizeMelody` は1拍=必ず2イベント（melodyCells.ts:84 `s<2`）。
- ＝design S8 段階(2)「sampleCell＋16分細分」、findings 層3 は**設計・研究にあるが未実装**。

### 矛盾C：design 段階(1) が約束したモデル形 `{byMove, sub}` の **`sub` が無い**
- design:606「(1)`learnMelodyCells(units)→{byMove,sub}`」と明記。
- 実装の `MelodyCellModel` は **`{ byMove }` のみ**（melodyCells.ts:38）。`sub`（16分細分テーブル）フィールド未定義。Bと同根＝層3未着手。

### 未実装D：design S8 段階(3)(4)(5) の **骨格生成・カデンツgesture・コード付き出力が無い**
- design:606 段階(3)「skeleton生成（move付き・自己反復）」(4)「assemble: 骨格→各拍cell→16分→**カデンツgesture(着地先で上下噛み overshoot/undershoot)**」(5)「コード付き出力」。
- findings⑧(overshoot77%/undershoot61%)、findings③/⑩(自己反復 lag8/lag16)が裏付けとして存在。
- だが実装は `realizeMelody`（骨格を**外から受け取り**各拍cellを展開するだけ）止まり。**骨格を生成する関数・自己反復(lag8/16)・カデンツgesture(overshoot/undershoot)・コード連動は一切無い**（grep: overshoot/cadence/selfRepeat/lag8 ヒット無し）。
- ＝design S8 は「実装中（段階(1)(2)の前半のみ）」が正確。設計の現在形「実装中」と本文の網羅的記述の温度差が、読者に「層3〜5も実装済」と誤読させる。**design 本文に実装済/未の線引きを書くべき**。

### 配管ギャップE：**両モジュールはどこからも import されていない＝生成パイプライン未接続**
- grep `melodyCells|rhythmCells` → ヒットは**テスト2本のみ**。`generate.ts`/`buildMotif`/`rhythm.ts` からの参照ゼロ。
- design S7:596「buildMotif の固定figを学習リズムへ差し替え」、S8:607「旧 planSkeletonTones/buildMotif のピッチ手当てを置換」が**未実行**。
- ＝純関数ライブラリとして緑だが、**実際のメロ生成は依然 旧経路**。design の「置換方針」と現状コードが乖離。さらに**コーパス→units/bars を抽出する ingest スクリプトも無い**（design S8:606「別スクリプト」未作成）＝モデルを学習する手段が無く、現状 `learn*` はテストの合成入力でしか動かない。

### ズレF（研究の△項目を設計が断定使用していないか）：おおむねOK、ただし1点注意
- findings は「⑦着地方向の度数別（5度=下から/oct=下から）」を**△再現せず（flag）**、「⑥stay/move反転率 11%/22%」も**△再現せず**と明記。
- design S8 層1（design:602）は **`着地先(1度=上から降る/5度=水平〜上げ/8度=下から駆け上がる)で条件づけ`** と、findings が再現できなかった方向主張を**断定的に記述**している。findings:69-73 が「度数別の上から/下から主張は支持されない（flag）」と警告した当の主張。
  - ただし design:602 は S8（2026-06-27）で、findings はそれを受けた後追試の可能性もあるが、**現 design 本文は flag を反映していない**＝CLAUDE.md「△再現せず を設計が断定的に使わない」原則に抵触。少なくとも「※着地方向は追試で再現弱（findings⑦）」の注記が要る。なお**この条件づけ自体も未実装**（D）なので実害は今のところ無い。
- design:602 の数値「順次18%/向き反転68%」は findings⑤(順次22%/反転65%)と**僅差だが不一致**（findings側が実測・newer）。design S8 が melody-generation.md §12 ではなく古い対話値を引いている疑い。**design を findings 実測値へ寄せるべき**。

---

## ③ テストの穴

1. **realizeMelody の NaN を取り逃す**（最重要）：fallback `"0@0"` を踏むケースのテストが無い。`sampleCell(model, move)` で全 byMove に該当が無い状況→`realizeMelody` の出力 pitch が `Number.isFinite` か、を検証するテストが必要。現状 melody-cells.test.ts:62 は「length>0」しか見ず、`"0@0"` を実際に通していない。
2. **cellToNotes と realizeMelody の onset 整合が未検証**：design は「cellToNotes＝1拍の onset 音だけ」と realizeMelody（骨格2拍移動）の二系統を持つが、両者が同じ cell に対し**同じ onset ピッチ**を出すか（base の取り方が cellToNotes=anchor最近接 / realizeMelody=skeleton最近接で**別物**）のクロス検証が無い。
3. **rest の dur 精算の境界**：realizeMelody:93 `Math.max(0.25, ...)` のクランプが効くケース（cell が `r;0` で直後 onset が 0.5拍後＝dur 0.5、だが連続 rest で 0 になり 0.25 にクランプ）が未テスト。
4. **空入力**：`learnRhythmCells([], meter)`・`learnMelodyCells([])`・`realizeMelody([], ...)`（空骨格）・`genRhythm(emptyModel,...)` の挙動が未テスト。`genFree` は空 model だと `weightedPick` が `e[e.length-1]` で undefined→例外の可能性。
5. **複合拍子の音数DP**：rhythm-cells.test の DP は 4/4 のみ。6/8（slotsPerBeat=3）で onsetsOf 上限が変わるDPの正しさ未検証。
6. **16分細分（層3）**：未実装ゆえテスト皆無＝設計の核心主張（r01・2音目move 90%5語）が一切担保されていない。

---

## ④ 推奨アクション（優先順）

1. **【バグ】`sampleCell` fallback を `;` 正準記法へ**（`"0@0"`→`"0"` 等）＋`realizeMelody:87` に `Number.isFinite(tk.move)` ガード。先に**赤テスト**（全 byMove 不一致→出力が finite pitch）を書く（TDD）。
2. **design #12-M S8 に実装状況の線引きを追記**：層1(realize) 部分実装 / 層3(16分)・骨格生成・カデンツgesture・コード出力・配管(buildMotif置換)は**未実装**、と明示。`{byMove,sub}` の `sub` 未実装も注記。
3. **findings の △/flag を design に反映**：着地方向（5度/oct=下から）と stay/move反転率 11/22% を design S8 から「断定」→「flag付き仮説」に格下げ、または削除。数値（順次/反転）を findings 実測へ更新。
4. **配管 or backlog 化**：buildMotif/planSkeletonTones 置換と corpus→units ingest スクリプトは大きな未実装。Task化 or `docs/backlog.md` へ明示（着手まで「死蔵ライブラリ」状態を可視化）。
5. テスト穴③の 1・4 を最低限埋める（NaN防止と空入力の不落下）。

---

## 最重要 top3（要約）

1. **NaN バグ**：`sampleCell` の fallback が旧記法 `"0@0"` を返し、`realizeMelody`（finiteガード無し, melodyCells.ts:87）で **pitch=NaN の音符**を生む。テストは「length>0」しか見ず取り逃している。
2. **設計の過剰記述**：design S8 は「実装中」としつつ層3(16分r01)・骨格生成・カデンツgesture(overshoot/undershoot)・コード出力・`{byMove,sub}` の `sub`・buildMotif置換配管を**全て未実装**のまま網羅記述＝読者に実装済と誤読させる。`rhythmCells`/`melodyCells` は**どこからも import されず生成パイプ未接続**。
3. **研究の△を設計が断定使用**：findings が「△再現せず（flag）」とした着地方向（5度/oct=下から）と stay/move反転率を、design S8 層1 が断定的に記述（CLAUDE.md の「後追いでスペックを腐らせない」に抵触）。実害は当該条件づけ自体が未実装ゆえ今は無い。
