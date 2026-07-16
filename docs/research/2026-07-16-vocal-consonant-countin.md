# 仮歌の句頭子音切れ＝カウントイン設計（2026-07-16）

正典＝本doc。上流＝`docs/design.md` #13c（仮歌＝メロの楽器）／#25（弱起再生契約）。
実測の根拠＝下記§1（VOICEVOX phoneme タイミング実走）。**この doc は設計。実装は別エージェント（§7 計画）。**

---

## 0. 一行結論

仮歌の**先頭句の子音が切れる**のは「VOICEVOX が母音頭をノート境界に置き、子音をその**手前**（先頭休符／前ノート）に置く」正しい歌唱挙動に対し、再生側 `vocalSourceSchedule` が **offset で先頭休符を丸ごと飛ばして wav を母音頭から鳴らす**ため。さらに **初音が transport 0 ちょうど**だと 0 より前に子音を置く物理的余地が無い。

**採用設計＝仮歌があるとき全パートを共通の前シフト（`leadBeats`）に「カウントイン量」を上乗せして子音ぶんの前余白を作り、仮歌 wav は先頭休符を飛ばさず（offset=0）鳴らす。** カウントインは `playNotes` 内の**単一スカラ**として全楽器・全 vocal に一律加算するので、複数 Section／複数メロレーン／弱起の相対時刻は不変（§4 で証明）。

---

## 1. 実測（確定事実）

スコア「先頭休符24frame → 「さ」(sa) 47 → 「し」(shi) 47 → 末尾休符24」を `/sing_frame_audio_query`（1frame=256sample・93.75fps）に投げた phoneme 割り当て：

```
frame   len  音素
   0    +16  pau   ← 先頭休符が 24→16 に縮んだ
  16    + 8  s     ← 「さ」の子音がノート境界(24)の"手前"に食い込む
  24    +35  a     ← 母音 a がちょうどノート境界(24) から始まる
  59    +12  sh    ← 「し」の子音は前ノートの尻から借りる
  71    +47  i     ← 母音 i がちょうどノート境界(71) から始まる
 118    +24  pau
```

**読み取れる不変則**：
1. **母音頭 = スコアのノート境界（=先頭休符の公称長 leadRest 位置）にピタリ載る。**（frame 24＝先頭休符公称24 と一致。frame 71＝ノート境界と一致）
2. **子音は母音頭の直前に置かれる**（consonant anticipation＝実際の歌と同じ）。置き場は「先頭休符の後半」または「前ノートの尻」から借りる。先頭休符は必要ぶん縮む（24→16）。
3. 子音長は s≈8frame(≈85ms)、sh≈12frame(≈128ms)。日本語の長めの子音（sh/ch/ts）でおよそ 120〜150ms。
4. **句の途中の音**は子音を「前ノートの尻」から借りる（frame 59 の sh）。**連続 wav 内で自然に鳴る＝無害**。犠牲になるのは**先頭句の第1子音だけ**（その手前が wav の外＝再生開始点より前に落ちるため）。

含意：母音頭は「先頭休符 leadRest ぶん wav に入った位置」に**フレーム丸め誤差(<1frame≒10ms)以内で確実に居る**＝再生スケジュールはこの一点を使って正確に組める。

---

## 2. 現状コードの因果（実コードで確認済み）

### 2.1 再生スケジュール（`apps/web/src/audio.ts`）
`vocalSourceSchedule`（現行 L77-88）：
```
instrBeat = firstNoteBeat + leadBeats     // 楽器がこの初音を鳴らす transport 拍
whenBeat  = max(0, instrBeat)
offsetSec = (leadRestBeats + (whenBeat − instrBeat)) * spb
```
→ `src.start(whenBeat*spb, offsetSec)`。offsetSec は **wav の先頭休符 leadRest ぶんを丸ごと食う**＝再生を**母音頭から**始める。∴ frame16〜23 に置かれた**先頭句の子音を切り落とす**。

`leadBeats` は `pickupSchedule(finalNotes,{loop,loopEndBeat}).leadBeats`（L1126）で**全ノート一括に1つ**算出：
- 非ループ：`leadBeats = −min(start)`（弱起ぶん）。全ノート `+leadBeats` シフトし transport 0 開始。
- ループ：`leadBeats = 0`、弱起は `loopEnd + start` へ巻き込み。

### 2.2 初音が transport 0 問題
`pickupSchedule` 非ループは最小 start を 0 へ寄せる。弱起「みなそこ(-0.5)」なら **弱起の初音が transport 0**。子音を鳴らすには母音より前に置き場が要るが、**0 より前に置けない**＝物理的に鳴らせない。弱起が無いメロ（初音 start=0）でも同じく初音が transport 0＝子音の置き場が無い。**offset のアライン修正だけでは救えない**＝前余白（カウントイン）が要る。

### 2.3 vocal の予約（`playNotes` L1148-1177）
`opts.vocal: VocalPlay[]`（歌う声部ごとに1本の AudioBuffer）を **1本の transport** に `AudioBufferSource` で予約。各 VocalPlay は**共通 `leadBeats`** を受ける（`scheduleVocalEvent` の `leadBeats` は 1 個）。歌う声部の楽器音は `muted:true` で発音予約から外れる（`scheduleFrom` の `.filter((n)=>!n.muted)`）が、`pickupSchedule`／尺計算には残る。

### 2.4 job 構築点（複数 vocal がどこで生まれるか）
- **ネタ単体**＝`apps/web/src/useNetaEditor.ts` L139-160。`vocalJob` は最大1本、`getVocal: () => vocal.peek(jobsRef.current)`。
- **Section（複数メロレーン）**＝`apps/web/src/components/SectionEditor.tsx` L157-179。`singingJobs` を**歌う子ごとに1本**構築（`compositeNotes([c])` で各自の配置オフセット・移調解決）、`getVocal: () => vocal.peek(jobsRef.current)`。
- 両者とも `useTransport({getVocal})` → `playNotes({vocal: c.getVocal()})`（`useTransport.ts` L43）。**vocal 配列は playNotes に集約**。∴ **カウントインを job 側や useVocal 側に置くと各 vocal が独立適用してバラける（オーナー懸念そのもの）。playNotes の単一スカラに置けば破綻しない**（§4）。

### 2.5 合成側の先頭休符（`apps/api/src/sing.ts`）
`notesToScore` L83：`{ key:null, frame_length: framesOf(0.25, spb), lyric:"" }`＝**先頭休符 0.25拍**（テンポ依存）。`SING_LEAD_REST_BEATS=0.25`（web `music.ts` L692）と**二重定数**（api は 0.25 リテラル、web は定数）。`singHashOf`（L189）は `score.notes` 全体を hash＝**先頭休符の frame 長が変われば自然に別キー＝旧 wav を再利用しない**（確認済）。

---

## 3. 採用設計

### 3.1 骨子（純関数の一般式）
`vocalSourceSchedule` を次の一般式へ置換（母音頭をターゲット拍に載せ、子音の手前余白を offset の残しで確保）：

```
vowelTargetBeat = firstNoteBeat + leadBeats + countInBeats   // 母音頭を載せたい transport 拍
srcStartBeat    = vowelTargetBeat − leadRestBeats            // wav 頭(先頭休符の頭)を置く拍
whenBeat        = max(0, srcStartBeat)
offsetSec       = (whenBeat − srcStartBeat) * spb            // = max(0, leadRestBeats − vowelTargetBeat) * spb
```
`src.start(whenBeat*spb, offsetSec)`。**offset は「先頭休符を飛ばす」のをやめ、余地がある限り 0**＝wav を頭から鳴らす＝先頭休符（後半に子音が居る）を丸ごと再生。母音頭は `whenBeat + (leadRestBeats − offset/spb) = vowelTargetBeat` に載る。

**カウントイン量 `countInBeats`**：
```
countInBeats = (!isLoop && vocals.length) ? maxLeadRestBeats(vocals) : 0
```
すなわち**カウントイン ＝ 先頭休符 leadRest と同値**（複数 vocal で先頭休符が異なれば max）。1つのスカラ。

この結合の帰結（非ループ・`base = firstNoteBeat + leadBeats ≥ 0`）：
- `vowelTargetBeat = base + leadRest`、`srcStartBeat = base ≥ 0`、`whenBeat = base`、**`offsetSec = 0`**。
- ∴ **wav は base 拍（=旧 instrBeat）から頭ごと鳴り、先頭休符ぶん後の母音頭がちょうど `base + leadRest`＝楽器の初音位置に載る。子音は base〜base+leadRest の余白で鳴る（切れない）。**

### 3.2 全パートへの一律加算（結線点＝`playNotes` のみ）
- `pickupSchedule` は現状のまま（`pickupLead` を返す）。`totalLead = pickupLead + countInBeats`。
- **楽器**：`scheduleFrom` が `pickupSchedule(finalNotes)` で寄せた後、`countInBeats>0` の時だけ全 start に `+countInBeats`（＝楽器の初音が `pickupLead + countInBeats` へ）。`countInBeats===0` は map せず**同一参照のまま**（bit-safe）。
- **終端自動停止**：`endStopSec = totalSec(notes)+ totalLead*spb`（カウントインぶん延伸）。
- **プレイヘッド**：`handle.leadBeats = totalLead`（リード区間で線が 0 待機＝**視覚的カウントイン**。弱起表示流用・ラベル差別化は §6 の磨き）。
- **vocal**：`vocalSourceSchedule` に `leadBeats=pickupLead`・`countInBeats` を渡す（§3.1）。全 vocal が同じ `pickupLead`・`countInBeats` を共有。

### 3.3 なぜ「先頭休符 leadRest = カウントイン」で子音長を知らなくて良いか
実測（§1）で**母音頭は先頭休符公称位置ちょうど**・**子音は先頭休符の後半に収まる**。よって wav を頭から（offset=0）鳴らせば子音は必ず含まれ、前余白 `leadRest` が母音頭の前に丸ごと確保される。**子音長を VOICEVOX に問い合わせる必要が無い**（保守的だが確実）。テンポ非依存で欲しければ先頭休符を時間床にする（§3.4）。

### 3.4 先頭休符（合成側）の扱い＝テンポ非依存の床
現状 0.25拍（テンポ依存）。子音の実測上限 sh≈128ms に対し 0.25拍は bpm92=163ms（余裕）／bpm120=125ms（境界）／bpm140=107ms（不足）。**速いテンポで子音がはみ出す**。是正＝先頭休符を**「0.25拍 と 固定床（例 0.18s）の大きい方」**にする（`framesOf` を `max(framesOf(0.25,spb), round(0.18*FPS))` 相当）。カウントインは leadRest に追従するので**両者が一緒に伸び整合**。owner の「一小節前から」は leadRest を1小節にした極端＝カウントイン1小節（大きすぎ）。**推奨は 0.18〜0.25s の小マージン**（owner 勘の"前余白"を満たしつつ試聴のテンポを損なわない）。

### 3.5 SSOT（api → web で leadRest を返す）
先頭休符を床付きにすると api の実 frame と web の `SING_LEAD_REST_BEATS=0.25` が乖離する。**`/sing` 応答に実測 `leadRestSec`（=`score.notes[0].frame_length / FPS`）を追加**し、web は `VocalPlay.leadRestBeats = leadRestSec / spb` で受ける＝二重定数を解消。`singHashOf` は先頭休符 frame を含むので**床変更＝別キー＝旧 wav 非再利用**（自動・確認済）。この SSOT 化は**先頭休符を変える時に必須**（変えないなら 0.25 のまま両者一致で当面据え置き可）。

---

## 4. 複数 Section／複数 vocal／ループ窓／弱起で破綻しない証明

**モデル**：`compositeNotes` が全 Section・全メロレーンを**1本の絶対拍 notes[]** に平坦化。`playNotes` が**唯一の transport** を組み、**唯一の `pickupLead`（全 notes 一括）** と**唯一の `countInBeats`（vocal 有無で 0/一定）** を持つ。総シフト `S = pickupLead + countInBeats` は**単一スカラ**。

**各イベントの transport 時刻**（非ループ）：
- 楽器ノート n：`(n.start + S) * spb`。
- vocal v の母音頭：`vowelTarget_v * spb = (firstNoteBeat_v + S) * spb`。`firstNoteBeat_v` は v の第1音の生 start。v の第1音を鳴らす（muted）楽器ノートは `(firstNoteBeat_v + S)*spb`＝**同時刻**。∴ **各 vocal はそれぞれ自分のメロ初音に自動整合**（v ごとに firstNoteBeat_v が違っても、共有 S を足すだけ）。

**相対時刻の保存**：
- vocal A と B：`(fnb_A+S) − (fnb_B+S) = fnb_A − fnb_B`（S が相殺）＝生の相対を保存。
- vocal と楽器：同じ S＝保存。
- **カウントインは全イベントに同一スカラを足すだけ**＝絶対時刻は平行移動するが**相対時刻は不変**。∎

**破綻の唯一の原因**は「各 vocal job が独立にカウントインを適用する」こと。本設計は **countInBeats を `playNotes` の単一スカラに閉じ込め**、job 構築（SectionEditor/useNetaEditor）・useVocal には一切置かない。∴ 何本 Section／メロを重ねても、各 vocal が同じ S を共有し破綻しない。**実装上の鉄則＝カウントインを job/フックへ漏らさない。**

**弱起（負 start）**：`pickupLead = −min(start)` が全 vocal 共通。弱起 vocal の第1音は `base = firstNoteBeat + pickupLead`。全体で最も早い vocal は `base = 0`、`srcStartBeat = base + countIn − leadRest = 0`（countIn=leadRest）＝ちょうど 0 から鳴り母音頭が `leadRest` 位置＝楽器初音へ。最も早くない vocal は `base > 0`＝余裕。∴ **全 vocal で `srcStartBeat ≥ 0`（負に落ちない）**。

**ループ窓 [s,e)**：本設計のカウントインは**非ループ限定**（`countInBeats=0` in loop）。ループはシームレス性が命で、ループ本体にカウントイン無音を毎周挿入すると隙間が出る＝不可。ループでの vocal は一般式に `countIn=0` を入れる：`vowelTarget=base`、`srcStartBeat = base − leadRest`。`base ≥ leadRest` なら offset=0 で子音も鳴る（＝**句がループ頭より後で始まるメロは既に救える**）。`base < leadRest`（メロがループ頭 0 ちょうどから始まる典型）だけ子音が切れる＝§5 の残余・§7 フェーズ2で pre-roll 対応。**既存ループ挙動は一般式に countIn=0 を入れると現行テスト値と一致**（§7 で確認：現行テスト④ when=0/offset=(lead+0.5)spb は一般式で厳密再現）。

---

## 5. 限界（正直に）

1. **ループでメロがループ頭 0 ちょうどから始まる場合**、初音の子音は救えない（前余白が構造的に無い）。フェーズ2の loop pre-roll（vocal を `loopEnd − leadRest` に予約して**前周の尻で子音を鳴らし母音頭をループ境界に載せる**）で対応。#25 の「初回周だけ弱起は先頭で鳴らない」と同族の割り切り。
2. **フレーム丸め**：母音頭は先頭休符公称位置 ±<1frame(≒10ms)。サブ知覚。
3. **子音が先頭休符に収まらない極端**（超速テンポ×長子音）：先頭休符の時間床（§3.4）を超えると切れる。床を十分（0.18s〜）に取れば実用域で発生しない。
4. **視覚**：カウントイン中プレイヘッドは 0 待機＝「弱起…」表示を流用。厳密には弱起でなくカウントインなので、ラベル差別化は磨き（§6）。

---

## 6. design.md 反映案（提案・実ファイルは未編集）

### #13c（L1222 の「弱起ズレ修正」段の直後に追記）
> **句頭子音カウントイン（2026-07-16・オーナーFB「句頭の子音が切れる／一小節前から鳴らしたい」）**：VOICEVOX は母音頭をノート境界に、**子音をその手前（先頭休符/前ノート）**に置く（実測＝`docs/research/2026-07-16-vocal-consonant-countin.md`）。旧 `vocalSourceSchedule` は offset で先頭休符を丸ごと飛ばし母音頭から鳴らす＝**先頭句の子音を切る**。加えて初音が transport 0 だと子音の置き場が無い。**修正**＝(1) `vocalSourceSchedule` を一般式化＝`vowelTarget = firstNoteBeat+leadBeats+countIn`／`when = max(0, vowelTarget−leadRest)`／`offset = max(0, leadRest−vowelTarget)·spb`＝**余地がある限り offset=0（先頭休符ごと鳴らす）**。(2) **カウントイン `countInBeats`**＝仮歌があるとき（非ループ）だけ `leadRest` ぶんを**共通 `leadBeats` に上乗せ**し全楽器・全 vocal を一律後ろへ＝子音の前余白を作る。カウントインは **`playNotes` の単一スカラ**に閉じ込め job/フックに漏らさない＝**複数 Section/複数メロレーン/弱起で相対時刻不変**（証明＝doc §4）。**先頭休符はテンポ非依存の床（0.18〜0.25s）**とし、api `/sing` が実測 `leadRestSec` を返して web と SSOT 化（`SING_LEAD_REST_BEATS` 二重定数を解消・`singHash` は先頭休符 frame 変化で自然に別キー）。**ループのループ頭 0 起点メロの子音は残余**（loop pre-roll＝フェーズ2）。**仮歌なし（vocal 空/null）は countIn=0＝全経路 bit 不変。**

### #25（L2044 受け入れの後に1行）
> **仮歌カウントイン（#13c）との合成**：仮歌がある非ループ再生は `leadBeats` に `countInBeats(=leadRest)` を上乗せ＝プレイヘッドはカウントインぶん 0 待機・終端も追従。弱起 lead L とカウントインは同じ単一シフト S に合流＝相対時刻不変（doc §4）。仮歌なしは従来の pickup 契約と完全一致。

---

## 7. 実装計画（別エージェント向け・そのまま着手可）

TDD（赤→緑）・SDD（design を先に §6 で更新）。段階＝**非ループ先行 → SSOT/床 → ループ pre-roll**。

### フェーズ1（非ループ・カウントイン核）＝最小で耳に効く

**F1-a. 純関数 `vocalSourceSchedule` を一般式へ（`apps/web/src/audio.ts` L77-88）**
- 新シグネチャ：
  ```ts
  vocalSourceSchedule(opts: {
    firstNoteBeat: number; leadRestBeats: number; leadBeats: number;
    countInBeats: number; spb: number;
  }): { whenBeat: number; offsetSec: number }
  ```
- 本体：`vowelTarget = firstNoteBeat + leadBeats + countInBeats; srcStart = vowelTarget − leadRestBeats; whenBeat = max(0, srcStart); offsetSec = (whenBeat − srcStart) * spb;`
- **先にテスト**（`apps/web/test/audio.test.ts` の該当 describe を書き換え。spb=60/92, lead=SING_LEAD_REST_BEATS=0.25）：
  | ケース | firstNoteBeat | leadBeats | countIn | 期待 whenBeat | 期待 offsetSec |
  |---|---|---|---|---|---|
  | 弱起(-0.5) 非ループ | −0.5 | 0.5 | 0.25 | **0** | **0** |
  | 初音0 非ループ | 0 | 0 | 0.25 | **0** | **0** |
  | 初音0.25 非ループ | 0.25 | 0 | 0.25 | **0.25** | **0** |
  | ループ弱起(countIn=0) | −0.5 | 0 | 0 | **0** | **(0.25+0.5)·spb** ＝現行④と一致 |
  | ループ 初音1.0(余裕) | 1.0 | 0 | 0 | **0.75** | **0**（子音鳴る・回帰で余地時 offset=0 を確認）|
  - 追加不変条件テスト：**同一 S で2 vocal の相対時刻保存**（fnb 0 と fnb 2 で `when` 差が 2 になる／countIn 変えても差不変）。

**F1-b. `playNotes` へカウントイン結線（`apps/web/src/audio.ts` L1114-1177 周辺）**
- `const vocals = opts.vocal ?? [];`
- `const countInBeats = (!isLoop && vocals.length) ? Math.max(...vocals.map(v => v.leadRestBeats)) : 0;`
- `const pickupLead = pickupSchedule(notes,{loop:isLoop,loopEndBeat}).leadBeats;`
- `const totalLead = pickupLead + countInBeats;`
- `scheduleFrom` を変更：`pickupSchedule` で寄せた後、`if (countInBeats) scheduled = scheduled.map(n => ({...n, start: n.start + countInBeats}))`（**`countInBeats===0` は map せず同一参照＝bit-safe**）。
- `endStopSec = () => totalSec(notes,bpm) + totalLead*spb`。
- `handle.leadBeats = totalLead`。
- `scheduleVocalEvent`：`vocalSourceSchedule({ firstNoteBeat:v.firstNoteBeat, leadRestBeats:v.leadRestBeats, leadBeats:pickupLead, countInBeats, spb })`。
- **回帰テスト**：仮歌なし（vocal 空/null）で `scheduleFrom` の出力が現行と同一参照／`leadBeats` が pickup のみ＝**bit 不変**。既存 pickup テスト（audio.test L211-273）緑維持。

**検証（F1）**：`pnpm --filter web test`（vitest・純関数＋pickup 回帰）。実機耳確認（非ループ▶で先頭句「さ」の子音が鳴る・複数メロ Section で各句頭が鳴りズレない）＝**オーナー手番**（restart スキルで dist 焼き→cm-api 再起動後）。

### フェーズ1b（先頭休符の床＋SSOT）＝速いテンポの保険

**F1b-a. 先頭休符に時間床（`apps/api/src/sing.ts` `notesToScore` L83, L100）**
- 先頭休符 frame＝`Math.max(framesOf(0.25, spb), Math.round(0.18*FPS))`（末尾休符は据え置きで可）。定数 `SING_LEAD_REST_SEC=0.18` を明示。
- **先にテスト**（`apps/api/test/sing.test.ts`）：bpm=180（spb=1/3）で先頭休符 frame ＝ `round(0.18*93.75)=17`（>`framesOf(0.25,1/3)=round(0.25/3*93.75)=8`）を確認／bpm=92 では従来どおり `framesOf(0.25,spb)` が勝つ。

**F1b-b. `/sing` 応答に `leadRestSec`（`apps/api/src/http.ts` L716-738・`apps/api/src/sing.ts` `singGeneric`）**
- `singGeneric` の返りに `leadRestSec = score.notes[0].frame_length / FPS` を追加（`notesToScore`/`Score` に露出 or `singGeneric` 内で算出）。
- `/sing` レスポンス：`{ assetId, shift, clamped, speaker, leadRestSec }`。
- api クライアント（`apps/web/src/api.ts` L232-233）の返り型に `leadRestSec:number` を追加。
- `useVocal.ts`：`toPlay` の `leadRestBeats` を **`r.leadRestSec / spb`** 由来へ（`VocalJob` に `leadRestSec` を持たせ、`spb=60/bpm` で beats 換算）。`SING_LEAD_REST_BEATS` 直参照を撤去（定数は後方互換のため残置可だが未使用化）。
- **回帰**：床が効かないテンポ（bpm≤120 付近）では `leadRestSec/spb ≒ 0.25` で従来一致。singHash 別キー＝旧 wav 非再利用を `sing.test.ts` で確認。

**検証（F1b）**：`pnpm --filter api test` ＋ `pnpm --filter web test`。実機は速いテンポ（bpm150+）の句頭子音＝**オーナー手番**。

### フェーズ2（ループ pre-roll）＝ループ頭起点メロの子音救済
- `scheduleVocalEvent` のループ枝：`countIn=0` のまま、`base < leadRest` の vocal は予約拍を `loopEnd − leadRest`（`whenBeat=max(0, loopEndBeat − leadRest)`）へ回し**前周の尻で子音→母音頭をループ境界に載せる**。初回周は #25 同様「頭で歌わない」割り切り。
- **先にテスト**：ループ total=8・lead=0.25 で vocal 予約 when が `8−0.25=7.75` 相当・母音頭がループ境界に載る。既存ループ vocal 回帰。
- リスク＝ループ再火（`vocalCur` 張り替え・L1160-1176）との二重発火。境界付近予約は現行の毎周 refire と整合するか実測要。**着手前に doc §4 ループ節を実コードで再検証**。

### 想定回帰・地雷
- **dist 焼き忘れ**＝実機に反映されない（restart スキル必須）。
- **bit 一致鉄則**：仮歌なし経路で `scheduleFrom` が同一参照を返すこと（countInBeats===0 で map しない）を必ずテスト。
- 既存 `vocalSourceSchedule` 3テストは**値が変わる**（offset→0）＝契約変更として書き換え（design 先行済み）。
- `handle.leadBeats` にカウントインを乗せると `usePlayhead` のリード表示が延びる＝**意図どおり**（視覚カウントイン）。playhead テストがあれば期待値更新。

### 手番の割り当て
- 実装＋vitest（web/api 純関数・回帰）＝**実装エージェント**。
- dist 焼き→cm-api 再起動＝**restart スキル**。
- 実機耳確認（子音が鳴る・複数メロでズレない・テンポ別・ループ）＝**オーナー**。
