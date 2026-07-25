# L4 トラックA 起草定義 — 新21型＋roles拡張（chord9/bass6/drum6・2026-07-25）

- **この doc の役割**＝起草役3並列（chord/bass/drum）が語彙doc4本から書いた**新型の定義**を集約。次工程＝Fable受け入れ監査→テスト先行→辞書化→再seed→実機18セル確認→耳確認プローブ束。
- 起草計画＝`2026-07-25-L4-trackA-authoring-plan.md`（§4 型リスト・§6 実施順）。共通分類＝design.md「Task2/L1＞共通分類の横串統一」（場面7種・ジャンル類型・co-tag）。
- 制約＝**リテラル転写ゼロ**（一般定石・骨格のみ）。各型に出典节。**vel/strumMs/シンセ近似は要耳較正＝オーナーのプローブ束で採否**（機械はcontent/タグ/件数まで保証）。
- スキーマ追記2点（データ欄のみ・生成器コード不変）＝`CompType.coGenres?: string[]`／`BeatPattern.roles?: Role[]`。

---

## A. コード伴奏（chord_pattern・9型）
既存 `COMP_TYPES`（`chordLibrary.ts`）と同フィールド形。RHトークン `A >(accent) o(soft) D d U x . -`／LHトークン `R 5 8 3 . -`（LH `3` は `resolveLh` のLILガードで10度へ上がる＝R10分散が実音化）。全型16セル確認済・未知トークン無し。

| id | 種 | genre / coGenres | roles | tempo | 出典 |
|---|---|---|---|---|---|
| PB-WHOLE-R10 | 研 | ballad | intro,verse | 60-85 | piano §2-3（R10定石）+§1型1 |
| PB-LH8OCT | 研 | ballad | chorus | 65-95 | piano §2-1/2-4（左右手分業） |
| PB-BLOCK8 | 新 | ballad | chorus | 65-95 | piano §3-2（長短対比）/3-3/5-1 |
| PB-SUSBLD | 新 | ballad | chorus,bridge | 60-90 | piano §1型5（rock-sustain低速化） |
| GT-MUTE8 | 新 | rock / vocarock | verse | 100-180 | guitar §4（ミュート）+§2型2 |
| AN-SYNC | 新 | anison / vocarock | prechorus,chorus | 130-180 | piano §3-1（前借り） |
| DN-PLUCK8 | 新 | dance / edm | verse,chorus | 118-130 | piano §4（音色差分・staccato） |
| DN-GATE16 | 新 | dance / edm | verse,chorus | 124-140 | 一般定石（トランスゲート）+guitar §2記法 |
| DN-PAD4 | 新 | dance / edm | verse | 120-128 | piano §4（パッド）+§5-1（vel層でポンプ近似） |

**譜（RH/LH・16セル・`|`は区切り）**
- **PB-WHOLE-R10**（keyboard・strum）：RH `A - - - | - - - - | - - - - | - - - -`（白玉保持）／LH `R - - - | - - - - | 3 - - - | - - - -`（R→10度分散）。狙い＝白玉最静＋LH R→10度で低域濁らず明暗を土台に。
- **PB-LH8OCT**（keyboard）：RH `A - - - | - - - - | A - - - | - - - -`（半小節打ち直し面）／LH `R - 8 - | R - 8 - | R - 8 - | R - 8 -`（R↔oct8分）。狙い＝右手面・左手推進の分業。
- **PB-BLOCK8**（keyboard）：RH `> - o . | > - o . | > - o . | > - o .`（拍頭長/裏短）／LH `R - - - | - - - - | 5 - - - | - - - -`。狙い＝長短対比で単調化回避のサビ。
- **PB-SUSBLD**（keyboard）：RH `> - - - | - - - - | > - - - | - - - -`（半小節アクセント打ち直し＋伸ばし）／LH `R - - - | - - - - | 5 - - - | - - - -`。狙い＝rock-sustain低速化＝パワーバラード。
- **GT-MUTE8**（guitar・strumMs10）：RH `D . D . | D . D . | D . D . | D . D .`（8分オールダウン短dur）／LH無（guitar=voiceGuitarがroot土台）。狙い＝ブリッジミュート近似の低エネAメロ。**要耳較正**（GMにミュート音無し）。
- **AN-SYNC**（keyboard）：RH `> - . . | . . A - | > - . . | . . A -`（拍1アクセント+2.5拍前借り／拍3+4.5拍前借り）／LH `R - R - | R - R - | R - R - | R - R -`（oct8分疾走）。狙い＝ボカロ/アニソンのサビ前「食い」。
- **DN-PLUCK8**（keyboard・open）：RH `A . A . | A . A . | A . A . | A . A .`（8分pluckスタブ）／LH `R . . . |`×4（拍頭root=キック同期）。狙い＝減衰速い粒立ちのEDM verse/chorus。
- **DN-GATE16**（keyboard・open）：RH `A . A A | . A . A | A . A A | . A . A`（16分非対称ゲート）／LH `R . . . |`×4。狙い＝パッドを16分で刻むトランスゲート。**要耳較正**。
- **DN-PAD4**（keyboard・open）：RH `> - - - | A - - - | > - - - | A - - -`（各拍打ち直し・1/3拍アクセント）／LH `R . . . |`×4（四つ打ち拍頭）。狙い＝サイドチェイン/ポンピングをvel層で近似。**要耳較正**。

**実装注記**：`coGenres` は `CompType` 未存在＝欄追加＋seed併記で `genre:vocarock`/`genre:edm` 検索に載る（出音・生成無影響）。LH `3`→10度化は `music.ts` `resolveLh`（LH窓 LH_LO=36/HI=48）。

---

## B. ベース（bass・6型＋roles拡張1）
生成子 `T(id, genre, tempoMin, tempoMax, kickRel, roles, pattern)`。トークン `R 8 3 5 6 b7 approach` 等（`DEGREE_SEMI`のみ・**"10"トークンは無い**）／`-`tie `.`rest `x`ghost `>`末尾=next `/ \`スライド。`kickRel ∈ unison|interlock|counter|mixed`。全型16セル確認済・ID一意。

**貼付用 `T(...)`**
```ts
T("BL-2BEAT",  "ballad",   60,  90,  "unison",    ["verse"],           "R . . . | . . . . | 5 . . . | . . . ."),
T("BL-ARPUP",  "ballad",   60,  95,  "unison",    ["verse","chorus"],  "R - - - | 5 - - - | 8 - - - | 3 - - -"),
T("BL-8ROOT",  "ballad",   65,  95,  "unison",    ["chorus"],          "R . R . | R . R . | R . R . | R . R ."),
T("VR-OCTRUN", "vocarock", 160, 210, "interlock", ["verse","chorus"],  "R . 8 . | R . 8 . | R . 8 . | R . 8 ."),
T("VR-LINE8",  "vocarock", 160, 200, "unison",    ["verse","chorus"],  "R . R . | R . R . | R . b7 . | 6 . 5 R>"),
T("ED-GATE8",  "edm",      120, 128, "counter",   ["verse","chorus"],  ". . R - | . . R - | . . R - | . . R -"),
```
**狙い**：BL-2BEAT＝BL-HALF5のタイでなく休符で切るデタッシェ2-feel（静Aメロの隙間美学）／BL-ARPUP＝R-5-8-10の分散上行（彩り・高揚）／BL-8ROOT＝8分ルート推進の低速版（既存balladに不在）／VR-OCTRUN＝高速オクターブ駆動（vocarockにオクターブ語彙不在）／VR-LINE8＝b7-6-5下降で次コードへ接続（walk downを本体化）／ED-GATE8＝オフ8分＋長音価のサイドチェイン近似（ED-OFFBEATと別）。

**roles拡張**：`ED-PULSE` の roles を `["chorus"]`→`["verse","chorus"]`（8分パルスは低エネverseの土台にも定石。roles=sceneタグSSOTで GENRE_TABLE 独立＝出音不変）。

**実装フラグ（要テスト）**：**BL-ARPUP の末尾「10度」**＝トークンに10無く `3`(semi4)で書くと realize が低位置へ落として上行が崩れる恐れ＝**octave-aware写像（直前音以上の最近傍レジスタ）が要**。未対応なら安全フォールバック `R - - - | 5 - - - | 8 - - - | - - - -`（R-5-8で確実に上行）へ切替。テスト「BL-ARPUP末尾が8より上に鳴るか」を先に赤で。

---

## C. ドラム（rhythm・6型）
既存 `BeatPattern`（`drumLibrary.ts`）＝`lanes` は `L(name, DRUM.x, hits[], vel)`。**`roles?: Role[]` を新欄追加**（`Role` union は既在＝7scene全部含む）。GMマップ SideStick=37/Ride=51/Clap=39 実在確認済。全型 4/4・grid16・bars1・ストレート格子（swing/humanizeはfeel層委譲）。

**貼付用**
```ts
{ id:"ballad.rim8",     meter:"4/4", grid:16, bars:1, tempoMin:60, tempoMax:100, genres:["ballad","citypop"], roles:["intro","verse","chorus"],
  lanes:[ L("HiHat",DRUM.HHc,[0,2,4,6,8,10,12,14],V.hh8), L("SideStick",DRUM.SideStick,[4,12],V.side), L("Kick",DRUM.Kick,[0,8],100) ] },
{ id:"ballad.soft16",   meter:"4/4", grid:16, bars:1, tempoMin:60, tempoMax:100, genres:["ballad","rnb"], roles:["intro","verse"],
  lanes:[ L("HiHat",DRUM.HHc,[0..15],38), L("Snare",DRUM.Snare,[4,12],90), L("Kick",DRUM.Kick,[0,8],95) ] },
{ id:"halftime.ballad", meter:"4/4", grid:16, bars:1, tempoMin:65, tempoMax:100, genres:["ballad","emo"], roles:["prechorus","chorus","bridge"],
  lanes:[ L("HiHat",DRUM.HHc,[0,2,4,6,8,10,12,14],V.hh8), L("Snare",DRUM.Snare,[8],108), L("Kick",DRUM.Kick,[0,6],V.kick) ] },
{ id:"beat8.ride",      meter:"4/4", grid:16, bars:1, tempoMin:100, tempoMax:160, genres:["jpop","rock","vocarock"], roles:["chorus","outro"],
  lanes:[ L("Ride",DRUM.Ride,[0,2,4,6,8,10,12,14],V.ride), L("Snare",DRUM.Snare,[4,12],V.snare), L("Kick",DRUM.Kick,[0,8],V.kick) ] },
{ id:"four.edm16",      meter:"4/4", grid:16, bars:1, tempoMin:120, tempoMax:140, genres:["dance","edm"], roles:["verse","chorus"],
  lanes:[ L("HiHat",DRUM.HHc,[0..15],V.hh16), L("Clap",DRUM.Clap,[4,12],V.clap), L("Kick",DRUM.Kick,[0,4,8,12],V.kick) ] },
{ id:"four.clapride",   meter:"4/4", grid:16, bars:1, tempoMin:120, tempoMax:140, genres:["dance","edm"], roles:["chorus","outro"],
  lanes:[ L("Ride",DRUM.Ride,[0,2,4,6,8,10,12,14],V.ride), L("Clap",DRUM.Clap,[4,12],V.clap), L("Kick",DRUM.Kick,[0,4,8,12],V.kick) ] },
```
（`[0..15]`は全16step・実装時に展開）。**狙い**：ballad.rim8＝バックビートをリムで丸めた静Aメロ／ballad.soft16＝beat16の弱音・疎キック／halftime.ballad＝3拍1発の粘り／beat8.ride＝HH→ライドの安全なサビ上げ／four.edm16＝16分クローズドHHの前進4つ打ち／four.clapride＝ライドで開放感のビッグルーム。

**実装フラグ**：`BeatPattern` に `roles?: Role[]` 追加（消費者はseedのみ＝生成器bit不変）。ballad系velはV dictでなく実数直書き（kick100/HH38/SN90等）＝V新エントリ化は実装時判断。

---

## 実施順（起草計画 §6・SDD+TDD）
1. 本doc＝研究doc起草✅ → 2. design.md下ろし（型リスト・coGenres/roles欄・GENRE_TABLE据え置き明記） → 3. **テスト先行（赤）**：型数(chord26→35/bass28→34/drum17→23)・16セル・ID一意・BL-ARPUP末尾10度・seed件数とタグ（genre:vocarock chord5件・drumにscene:タグ・co-tag型はgenreタグ2個）→ 4. 辞書追加＋coGenres/roles欄＋seedタグ展開（緑）→ 5. 再seed→18セル実機確認 → 6. 耳確認プローブ束（要耳較正群＝GT-MUTE8/DN-GATE16/DN-PAD4/VR kickRel/ED-GATE8裏長め/BL-ARPUP 10度）。

## 出典
語彙doc4本（piano/guitar/bass/drum vocabulary）／起草計画 `2026-07-25-L4-trackA-authoring-plan.md`／実コード `chordLibrary.ts`・`bassLibrary.ts`・`drumLibrary.ts`・`music.ts`（resolveLh）。
