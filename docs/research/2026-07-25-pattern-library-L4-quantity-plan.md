# パターンライブラリ L4（量産）計画 — カバレッジ地図・候補型・方式・裁定点（2026-07-25）

- **この doc の役割**＝L4「各ジャンル × 主要場面で候補4件以上が"別型"で埋まる」（`2026-07-22-pattern-library-arc-plan.md` §4 L4行）を
  実行可能にする**計画のみ**。パターン/ネタの作成・seed 実行・実装は一切含まない。
- 実測の源＝コード内3辞書（`apps/api/src/music/chordLibrary.ts`／`bassLibrary.ts`／`drumLibrary.ts`）と
  シード（`apps/api/scripts/seed-pattern-library.ts`）・ピッカー（`apps/web/src/components/patternLibrary.ts`・`PatternImportDialog.tsx`）を直接数えた値。
- 制約（コンセプト既定の硬い線）：他者コーパスからのリテラルな旋律/モチーフは保存しない。新型は**一般定石（教則的パターン）を度数×グリッドで書く**
  ＝既存語彙doc（piano/guitar/bass/drum vocabulary）と同じ流儀・出典URL付きで研究docに起こしてから辞書化する。

---

## 0. 前提の実測（何件が今ライブラリに焼かれるか）

seed（`seed-pattern-library.ts`）が焼くのは：

| kind | 源 | 実測型数 | seed 対象 | 備考 |
|---|---|---|---|---|
| chord_pattern | `COMP_TYPES`（chordLibrary.ts） | **26**（鍵盤13＋ギター13） | 26 | 全4/4 |
| bass | `BASS_TYPES`（bassLibrary.ts） | **28**（＋フィル5＝計33） | 28 | フィル（`BASS_FILLS`）は seed 対象外（スクリプト冒頭コメント） |
| rhythm | `BEAT_PATTERNS`（drumLibrary.ts） | **18**（＋フィル15） | **17** | `six8.ballad`（6/8）は L3 の 4/4 前提で除外。`FILL_TYPES` も対象外 |
| **計** | | | **71件** | |

注意：arc-plan と seed コメントの「bassLibrary 33型」は**フィル込み**の数。ベースライン型として棚に並ぶのは 28（実測・`BASS_TYPES` 配列を数えた）。

**セルの定義**＝L4 目標の「ジャンル×場面」は、L1 タグ SSOT（`genre:<g>`／`scene:<role>`）で import ダイアログが AND 絞りする単位
（`PatternImportDialog.tsx:83-84`）。ゆえにカバレッジのセル＝ **kind × genre タグ × scene タグ**、「別型」＝セル内の distinct `pat:<型ID>`。
**主要場面＝verse（Aメロ）と chorus（サビ）**とする（歌モノの滞在時間の大半・`chordLibrary.ts` GENRE_TABLE も verse を既定 fallback にしている）。
intro/prechorus/bridge/interlude/outro は準主要（4件目標の対象外・2件あれば御の字、として別掲）。

---

## 1. カバレッジ地図（実測・2026-07-25 の main）

### 1-1. chord_pattern（26型・genre×scene 件数）

型定義の `genre`／`roles` から集計（`chordLibrary.ts:138-197`）。**太字＝4件以上（達成）**。

| genre | intro | verse | prechorus | chorus | bridge | interlude | 主要場面の判定 |
|---|---|---|---|---|---|---|---|
| ballad | 1 | 2 | 1 | 1 | 1 | 0 | ✗✗ |
| rock | 1 | **5** | 0 | **6** | 1 | 2 | ✓✓ |
| citypop | 0 | 2 | 1 | 2 | 0 | 1 | ✗✗ |
| dance | 0 | 1 | 0 | 2 | 1 | 0 | ✗✗ |
| anison | 0 | 1 | 1 | 1 | 1 | 0 | ✗✗ |
| gospel | 0 | 1 | 0 | 1 | 0 | 0 | ✗✗ |
| jazz | 0 | 1 | 0 | 1 | 1 | 0 | ✗✗ |
| folk | 1 | 3 | 1 | 2 | 1 | 0 | ✗✗（verse は残り1） |
| pop | 0 | 2 | 0 | 2 | 0 | 0 | ✗✗ |
| funk | 0 | 1 | 0 | 1 | 1 | 1 | ✗✗ |
| reggae | 0 | 1 | 0 | 1 | 0 | 0 | ✗✗ |
| metal | 0 | 1 | 0 | 1 | 0 | 1 | ✗✗ |

**結論：12ジャンル×2主要場面＝24セル中、達成は rock の2セルのみ。22セルが4件未満**。特に「1ジャンル1型」（gospel/jazz/reggae は
全場面が同一型の使い回し）はオーナー評定「候補が貧弱」（arc-plan §1）がそのまま残る形。

### 1-2. bass（28型・genre×scene 件数）

`bassLibrary.ts:62-97` の `genre`／`roles` から集計。

| genre | intro | verse | prechorus | chorus | bridge | interlude | outro | 主要場面の判定 |
|---|---|---|---|---|---|---|---|---|
| rock | 1 | 2 | 2 | 2 | 1 | 1 | 1 | ✗✗ |
| ballad | 1 | 2 | 2 | 2 | 1 | 0 | 1 | ✗✗ |
| citypop | 1 | 2 | 1 | 2 | 1 | 1 | 1 | ✗✗ |
| funk | 1 | 2 | 1 | 2 | 2 | 1 | 1 | ✗✗ |
| edm | 1 | 2 | 1 | 3 | 1 | 0 | 1 | ✗✗ |
| vocarock | 1 | 2 | 1 | 2 | 1 | 1 | 1 | ✗✗ |

**結論：6ジャンル×2主要場面＝12セル全て未達（最大は edm chorus の3）**。ベースは研究doc（`2026-07-14-bass-genre-vocabulary.md`）の
33型を**全て実装済**（28ベース＋5フィル）なので、埋めるには**新型の起草が必要**（§2-2）。
さらに**ジャンル穴**：chord に在る jazz/folk/reggae/gospel/anison/dance/pop/metal のベースが無い（生成器側は `GENRE_ALIAS` で
吸収するが、**ライブラリ検索はタグ一致＝エイリアスを知らない**。`patternLibrary.ts:24` は `genre:<g>` の生タグで引く）。
例：chord を「アニソン」で絞れてもベース側タグは `genre:vocarock` ＝ジャンル横断で棚が揃わない（§4 裁定B）。

### 1-3. rhythm／ドラム（seed 17件・**genre のみ**）

`BeatPattern` は `roles` を持たず seed も scene タグを付けない（`seed-pattern-library.ts:75-76`）。import ダイアログは
「母集団に scene: が在れば場面絞りを出す」データ駆動（`PatternImportDialog.tsx:75`）＝**ドラムは場面軸そのものが存在しない**。
ゆえに現状測れるのは genre 単位のみ（`genres` 配列から集計・4/4のみ）：

- **達成（≥4）**：rock 5・jpop 4・pop 4・citypop 4
- 未達：dance 3／idol 2・rnb 2・funk 2・punk 2・latin 2／**ballad 1**（`six8.ballad` が 6/8 除外で脱落し `beat16.basic` だけ）
  ・emo/blues/aor/dnb/breakbeat/motown/bossa/samba/metal/hardcore 各1・**gospel 0**（6/8のみだった）

**結論**：ドラムの L4 は「型を足す」前に、(i) **scene タグの導入**（型に roles を持たせるか、`drumLibrary.ts` GENRE_TABLE（ジャンル×役割
→型ID・:193-199）を seed 時に逆引きしてタグ化）と、(ii) **6/8 除外で崩壊した ballad/gospel の扱い**（§4 裁定D）を先に決める必要がある。

### 1-4. 横断の所見

- **管弦（section_inst）はライブラリにゼロ**。研究doc（`2026-07-14-horn-string-arranging.md` §6-1）の8型は未実装のまま
  （design.md:563-564 のとおり multi-part voicing が `resolveChordPattern` 未対応＝実音化拡張とセットの別スライス）。
- フィル（ドラム15・ベース5）は seed 対象外＝「パターン（土台）」と「フィル（修飾）」を棚で混ぜない現行判断。L4 でも据え置きを推す
  （フィルは feel/ノリ行と同じく適用側のノブであり、単体で「候補4件」を競う棚の住人ではない）。

---

## 2. 不足を埋める候補型リスト（どのセルに何を足すと4件に届くか）

以下は**候補の名寄せまで**（型の中身＝テキスト譜の起草は L4 実施時に研究doc→辞書の順で。ここでは作らない）。
「研」＝研究docに既に譜例がある未実装分、「新」＝新規起草（一般定石・出典を付けて書く）。

### 2-1. chord_pattern

**(A) 研究doc未実装分（最初の弾・arc-plan §3-2 の言う「ギター3連系・左手リズム型」）**

| 候補型 | 由来 | 埋まるセル | 備考 |
|---|---|---|---|
| GT-SHUFFLE（3連ストラム） | 研：guitar doc §2 #12 | jazz/blues 系 verse/chorus | **12格子3連＝現行 `CompType.grid:16` 固定（chordLibrary.ts:38）と衝突**。スキーマ拡張が要る（§3 の例外扱い） |
| GT-ARP-PIMA（指弾き上行） | 研：guitar doc §5.2 基本上行 | folk/ballad intro/verse | 親指=root固定は現行 arp で近似可否の確認要 |
| GT-TRAVIS（オルタネート・ベース） | 研：guitar doc §5.2 トラビス | folk verse/chorus | 同上（ベース声部の独立リズム） |
| GT-ARPBASS（ベース保持＋上3弦ループ） | 研：guitar doc §5.2 | ballad/folk intro/verse/bridge | 同上 |
| PB-WHOLE-R10（LH=ルート+10度） | 研：piano doc §2-3 | ballad intro/verse | **左手リズム型**＝RH 同型でも LH 差で別型として鳴る |
| PB-LH8OCT（LH オクターブ8分交互） | 研：piano doc §2-1/§2-4 | ballad/anison chorus | 同上 |
| CP-LHSYNC（LH 前借りシンコペ） | 研：piano doc §3-1 | citypop verse/prechorus | 同上 |
| GS-STRIDE2（ストライド変形＝LH R↔5交互） | 研：piano doc §1 型12系 | gospel verse/chorus | 同上 |

**(B) 新規起草案（1ジャンル1型の解消・優先ジャンルはオーナー裁定§4-Aの後に確定）**

| 候補型（新） | 一般定石の名 | 埋まるセル |
|---|---|---|
| JZ-FREDDIE | ギター4分刻み（フレディ・グリーン奏法） | jazz verse/chorus |
| JZ-OFFCOMP | 裏拍コンピング（レッド・ガーランド型） | jazz verse/chorus/bridge |
| RG-BUBBLE | レゲエ鍵盤バブル（裏拍8分オルガン） | reggae verse/chorus |
| FK-CLAV16 | クラビネット16分カッティング | funk verse/chorus |
| MT-HALFSUS | ハーフタイム白玉パワーコード | metal chorus/bridge |
| DN-PLUCK8 | シンセ pluck 8分刻み | dance verse/chorus |
| AN-SYNC | アニソン前借りシンコペ（サビ前展開） | anison prechorus/chorus |
| CP-EPPAD | エレピ白玉＋前借り打ち直し | citypop verse/bridge |
| PB-BLOCK8 | バラード8分ブロック（拍頭+裏の対比） | ballad chorus |
| PO-ARPPOP | ポップ8分アルペジオ（鍵盤） | pop verse/chorus |

規模感の実測：chord の未達22セルを全部4件にするには（1型が複数 roles で複数セルを埋める効率込みで）**およそ25〜30型の追加**が要る。
上の18候補で「全ジャンル最低2〜3件・オーナー優先ジャンルは4件」まで行ける＝**全ジャンル一律4件は L4 一回では過大**（§4-A の裁定対象）。

### 2-2. bass

研究docは実装済＝全て新規起草。ジャンル穴（jazz/reggae/folk）は chord と棚を揃える意味で優先度高。

| 候補型（新） | 一般定石の名 | 埋まるセル |
|---|---|---|
| JZ-WALK4 | 4分ウォーキング | jazz（新ジャンル）verse/chorus |
| JZ-2FEEL | 2フィール（ルート+5度の2分） | jazz verse |
| RG-ONEDROP | レゲエ・ワンドロップ型ライン | reggae（新ジャンル）verse/chorus |
| FO-ALT5 | フォーク root↔5 交互（2ビート） | folk（新ジャンル）verse/chorus |
| RK-16DRIVE | ロック16分刻み | rock verse/chorus |
| RK-SYNC | キック食いシンコペ（8分+前借り） | rock verse/chorus |
| BL-ARPUP | バラード分散上行（R-5-8-10） | ballad verse/chorus |
| BL-2BEAT | バラード2分（R/5交互・穏） | ballad verse |
| CP-DISCO4 | ディスコ4分＋裏オクターブ | citypop verse/chorus |
| ED-GATE8 | サイドチェイン風8分（裏長め） | edm verse/chorus |
| FK-JBROOT | ワン強調＋スペース型の変形 | funk verse/chorus |
| VR-OCTRUN | 高速オクターブ駆動 | vocarock verse/chorus |

12セル全達成には**各セル+1〜2＝およそ12〜16型**。上の12候補＋既存型の roles 拡張（例：RK-PEDAL を verse にも適格化＝
音楽的に妥当な範囲で。安易な全面解放はしない）で届く。

### 2-3. rhythm／ドラム

| 候補型（新） | 一般定石の名 | 埋まるセル |
|---|---|---|
| ballad.rim8 | サイドスティック8ビート（4/4バラード） | ballad（1→2） |
| ballad.soft16 | 静16ビート（HH弱・キック疎） | ballad（→3） |
| halftime.ballad | ハーフタイム・バラード | ballad（→4） |
| four.edm16 | 4つ打ち＋16分ハット | dance/idol |
| four.clapride | 4つ打ち＋ライド/クラップ変形 | dance/idol |
| beat16.halfghost | ハーフタイム16ゴースト | rnb/funk |
| funk.one | ワン強調ファンク（キック頭・スネア4） | funk |
| beat8.ride | ライド8ビート（サビ展開） | jpop/rock（既達成セルの厚み） |

＋**scene タグ導入**（§1-3 の (i)。型追加より先。`GENRE_TABLE` 逆引きで機械導出→耳確認で調整）。
ballad/gospel の 6/8 問題は §4-D。ジャンルタグが細かすぎる問題（emo/aor/motown 等の1件ジャンル）は「集約タグを併記するか」を
語彙裁定（§4-B）に含める。

### 2-4. 管弦8型（section_inst）— **L4 に含めない提案**

`2026-07-14-horn-string-arranging.md` §6-1 の8型（funk_horn_stab_4pc／citypop_horn_stab_3pc／anison_brass_hit_unison／
strings_pad_4part／strings_16th_ostinato／strings_hi_sweetener／horn_counter_solo／strings_counter_vc）は語彙として完成済みだが、
- multi-part voicing の実音化が `resolveChordPattern` 未対応（design.md:563-564＝別アークと明記済）
- section_inst はピッカーのゲート外（`showPicker=false`・design.md:668）
＝**seed しても試聴・適用の経路が無い**。L4 で無理に単声近似で焼くより、「実音化拡張＋ピッカー結線とセットの後続スライス」に切るのが
上位（design）と整合。→ 本計画では**対象外と明示**（オーナーが管弦優先と裁定したら順序を入れ替える）。

---

## 3. 量産の方式：**(a) 辞書に型追加→再seed を推す**（直接ネタ authoring はしない）

### 3-1. 推奨＝(a)。根拠4点

1. **冪等性の所有権**：seed は `scope:"library"＋lib:factory` を**全削除→再投入**する設計（`seed-pattern-library.ts:29-32`）。
   (b) 直接 authoring で `lib:factory` のネタを DB に手で作ると、**次回 seed で消える**＝現行の冪等機構と根本的に両立しない。
   (b) を採るなら seed の削除規約自体を変える羽目になる（упsert 化＝差分検出の複雑化）。
2. **決定性＝bit一致**：辞書→生成器→content は `seed=1`・型ID直指定で決定的（`seed-pattern-library.ts:34`）。再seedしても同一 content。
   手打ちネタはこの再現保証が無い。
3. **監査可能性とTDD**：型はテキスト譜 SSOT＋パーサの16セル検証（`chordLibrary.ts:126`／`bassLibrary.ts:57`）で赤→緑が回る。
   型数・タグ・content 形のユニットテストが既にある土俵に乗るだけで済む。
4. **gen_\* 第二経路との一元管理**：辞書は生成器（style/pattern ノブ）の語彙でもある（arc-plan §3-2「コード内辞書は当面残置＝seed源」）。
   ライブラリだけに型が在る二重管理を作らない。

### 3-2. (a) の注意点と例外規定

- **GENRE_TABLE への追加は別判断**：型を `COMP_TYPES`/`BASS_TYPES` に足すだけなら seed 対象が増えるのみだが、
  `GENRE_TABLE`（chordLibrary.ts:204／bassLibrary.ts:118）に足すと**生成器第二経路の seed 回転（候補プール長）が変わる**
  ＝既存ノブ利用者の出音が同じ seed で変わる。既定OFF経路ではないので鉄則違反ではないが、**design.md に意図として明記してから**足す
  （黙って変えない）。最小方針＝L4 では辞書配列にのみ追加し、GENRE_TABLE 追加は L5（生成器の位置づけ整理）で一括。
- **表現力の壁がある型の例外＝(b')「seed 内の決定的 content テーブル」**：3連グリッド（GT-SHUFFLE）のように現行スキーマ
  （`grid:16` 固定）や生成器で表現できない型は、(i) スキーマ/生成器を拡張して (a) に載せる か、(ii) **seed スクリプト付随の
  content リテラル表**（コードにチェックインされた決定的データ）として焼く。**DB への手打ちは (ii) でもしない**＝冪等・再現・レビュー可能を維持。
  推奨順序は (i)＞(ii)（(ii) は生成器と乖離した孤児 content を作るため最終手段）。
- **既存ネタ不可侵**：現行どおり `scope:"library"＋lib:factory` のみ削除・project scope と `lib:user` に触れない（`seed-pattern-library.ts:6`）。
  再seedでネタ id が変わるが、L3 の適用は **content コピー**（`patternLibrary.ts:38-39`＝原本参照を持たない）なので既存曲は壊れない。
  将来「原本リンク」を導入するなら upsert 化が前提になる＝それまでは削除→再投入でよい。

### 3-3. 手順（L4 実施時のスライス内順序・SDD+TDD）

1. **研究docに型を起こす**（新規分。一般定石＋出典URL・度数×16分テキスト譜。リテラル転写なし）→ README に索引追加。
2. **design.md に L4 の型リストとタグ方針を下ろす**（GENRE_TABLE 据え置き・ドラム scene タグ導出方式を含む）。
3. **テスト先行**：辞書の型数/16セル/ID一意、seed の件数・タグ（genre/scene/tempo/pat）・content 形の期待値を先に赤にする。
4. **辞書へ型追加**（データのみ・生成器/レンダのコード変更は原則なし）→ 緑。
5. **再seed は明示コマンドで**（`CM_DB=<path> npx tsx scripts/seed-pattern-library.ts`）→ import ダイアログで件数・絞りを実機確認
   （Playwright 実測の流儀＝`reference-playwright-live-ui-check`）。
6. **耳確認プローブの一括生成**：真因調査の流儀（`data/quality-probe-20260722/` の before/after MIDI束）に倣い、
   新型を一括 MIDI 化した聴き比べ束を作ってオーナーの耳確認を1回にまとめる（型ごとに個別依頼しない）。

---

## 4. 要オーナー裁定／耳確認の線引き

**機械でやれる所**（裁定不要・上の手順で進められる）：カバレッジ実測（本doc）・型の起草〜辞書化〜seed〜件数検証・タグの機械導出・
プローブMIDIの束作成・カバレッジ再計測。

**オーナー裁定が要る所**（着手前にまとめて確認・arc-plan §5 未決#3 の具体化）：

- **A. どのジャンルを厚くするか（＝L4 の初期規模）**。全ジャンル一律4件は chord だけで25〜30型＝過大（§2-1実測）。
  選択肢：(i) オーナー作風の4〜6ジャンルを先に4件へ（推定 chord 12〜15型＋bass 8〜10型＋drum 5〜6型）、(ii) 全ジャンル最低2件の
  底上げを先に、(iii) 全部。**作風の物差しはオーナー**＝機械は表（§1）を出すまで。
- **B. ジャンル語彙の正準化**。anison（chord）／vocarock（bass）／jpop（drum）、dance（chord/drum）／edm（bass）が別タグで
  **ジャンル横断で棚が揃わない**（§1-2）。統合するか・seed 時に複タグ併記（例 vocarock 型に `genre:anison` も付与）か・現状維持か。
  1件しかないドラム細分ジャンル（emo/aor/motown 等）の集約もここ。語彙はオーナーの言葉に合わせる（造語をUIに出さない）。
- **C. ドラムの scene タグ**。機械導出（GENRE_TABLE 逆引き）で入れてよいか。「この型はサビ向き」の割当は軽い裁量を含む＝
  導出結果の一覧をオーナーが眺めて直す運用を提案。
- **D. 6/8 の扱い**。`six8.ballad` 除外で ballad ドラム1件・gospel 0件（§1-3）。4/4 バラード型の追加で当面埋める（§2-3）か、
  L3 の 4/4 前提を外す工事（別スライス）を積むか。
- **E. 耳確認＝「作品として鳴るか」の採否**。型の content 正しさ・タグ・件数までは機械が保証するが、**鳴りの採否と較正
  （vel 層・strumMs 等の要耳較正群）はオーナーの耳**。プローブ束（§3-3 手順6）を1回聴いて型ごとに採/否/直しを付ける運用。
  評価器で代替しない（`project-melody-eval-ceiling`＝理論スコアはガードレール止まり）。
- （報告のみ・裁定不急）管弦8型は実音化拡張とセットの後続スライスへ（§2-4）。オーナーが管弦優先なら順序を入れ替える。

---

## 出典（本docが読んだファイル）
- 正典計画：`docs/research/2026-07-22-pattern-library-arc-plan.md`（L4行・§3-2/3-4・未決5点）
- 実装実測：`apps/api/src/music/chordLibrary.ts`（26型・GENRE_TABLE・grid:16固定）／`bassLibrary.ts`（28型+フィル5）／
  `drumLibrary.ts`（18型+フィル15・BeatPattern に roles 無し）／`apps/api/scripts/seed-pattern-library.ts`（冪等削除・タグ付与・6/8除外）
- ピッカー実測：`apps/web/src/components/patternLibrary.ts`（タグ検索・content コピー適用）／`PatternImportDialog.tsx`（genre/scene AND 絞り・データ駆動 scene）／`apps/web/src/genres.ts`（ジャンル/scene 日本語ラベル SSOT）
- 語彙doc：`docs/research/2026-07-22-piano-comping-vocabulary.md`（左手分業則 §2・前借り §3-1）／
  `2026-07-22-guitar-comping-vocabulary.md`（15型中13実装＝#12 3連・#13/§5 指弾き系が未実装）／
  `2026-07-14-bass-genre-vocabulary.md`（33型=28+フィル5・全実装済）／`2026-07-14-drum-pattern-genre-library.md`（18型・§9 選択表）／
  `2026-07-14-horn-string-arranging.md`（§6-1 管弦8型・未実装）
- 設計整合：`docs/design.md`（管弦ゲート :563-564/:668・L4 別スライス宣言 :725）
