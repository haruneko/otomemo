# M0 契約のたたき台 — レシピ／resolve署名／RNGソルト／design追補（ドラム・4/4）

土台＝[実装計画](2026-08-19-phrasemaker-port-implementation-plan.md)（B1裁定済み・3小論点解決）・[入出力対応表](2026-08-20-phrasemaker-recipe-io-map.md)（掴み→生成物・7裁定）・[持ち場＝案C](2026-08-21-arrange-data-locus.md)（2026-08-21裁定・6点採用）・[カスケード実装設計](2026-08-21-cascade-briefing-implementation.md)（着工可）。本書は M0 で**凍結する契約の案**。
凍結する＝後で覆すと全レシピの音が変わる（スキーマの骨・resolve署名・ソルト表）。
**2026-08-21 更新**：生成器モデル（ヒューマナイザー枠を退役）・案C（フィル位置はセクションの合図へ）・ctx `cues?` 追加を反映。

## 0. 前提（裁定済み・確認のみ）
- **レシピ＝ジェネレーター**（ヒューマナイザーではない）：掴み（最小入力）＋つまみ＋seed を与えると resolve が**演奏そのものを毎回生成**する。保存は掴み＋パラメタ＋seed のみ＝**A＝生きたレシピ**（完成音は保存しない・再生/解決のたび毎回生成）。ノリは**生成物の一面**であってレシピの主目的ではない（出典：io-map 前提）。
- **掴みの非対称（io-map の芯）**：ドラムだけ骨を「**描く**」（キック＋スネア格子＝生成物に literal に残る）。**骨は必須でない**＝空でも「おまかせ骨」を生成する（io-map 裁定#1・描くのは任意の掴み強化）。ベース/コードは「**指す**」（コード＋役割の記号入力＝**音符は全部生成物**）＝署名は同じまま M3 以降。
- **ノリ（B1 裁定・2026-08-19）**：もたり・前ノリは**演奏レイヤー**。スコア（resolve が吐くノート／skeleton）は**常にストレート**。ノリの音＝**phrase_maker の値**。レシピが演奏パラメータとして抱え、鳴らす瞬間に feel 層が非破壊で当てる。**既定ON・OFF/クオンタイズで素に戻せる**。MIDI 書き出しは**ノリを当てて出す**（render 行為・内部スコアは素のまま）。
- **持ち場＝案C（2026-08-21 裁定）**：セクション＝**薄い合図**（cues＝位置＋性格・楽器非依存）／トラック（レシピ）＝**弾き方の語彙**／**resolve が合成**（ctx に合図が乗る）。**フィルの位置と強さはセクションの cue へ**（io-map 裁定#6 の 2026-08-21 改訂）＝レシピに残るのは「**フィルの弾き方**」だけ。3層モデル（曲/セクション/ネタ）だが**曲レイヤーは実装丸ごと後回し**（カスケード §1-3）。

## 1. design.md「フィール層分離」への追補（案・SDDの正準行き）
> **レシピ由来グルーヴ（2026-08-20 追補）**：ドラム等のレシピは「声部別グルーヴ（系統オフセット＋揺れ）」を**演奏側パラメータ**として持つ。resolve が返すノート・skeleton は**ストレート**を厳守し、グルーヴは再生／MIDI書き出しの境界で feel 層が**非破壊**に適用する（notes 常時ストレートの原則を破らない）。レシピが在るトラックは**レシピの声部別グルーヴが権威**（全体 `HUMANIZE_PROFILES` は非レシピ音のフォールバック）。既定は適用ON、ユーザーは OFF／クオンタイズ／演奏の指示（つまみ）で介入できる。**二重掛け禁止**＝グルーヴの適用点は feel 層の一箇所に限る（design 596 の「rhythm への feel UI 宙吊り」はこの一本化で解く）。

- 3層モデル（曲/セクション/ネタの一枚絵）とカスケード規則（内側優先）の design 正準化は**カスケード実装設計 S0 が担う**（本書は resolve 契約側の受け口＝ctx.cues を凍結する）。

## 2. レシピスキーマ v1（ドラム・4/4。M1 で実装するのは骨＋グルーヴ＋seed、他は枠）
```
Recipe = {
  v: 1,                         // スキーマ版（additive 進化・未知フィールドは保存時に保持）
  instrument: "drum",
  bone?: {                      // 掴み（任意＝io-map裁定#1・空/省略なら「おまかせ骨」を生成）
    cellsPerBar: 16,            // 1小節のマス数（16分＝16）＝拍子非依存（4/4ハードコードを踏まない）
    cells: DrumCell[]           // 発音（voice, step, vel?）※ストレートな格子位置。置いた音は生成物に literal に残る（生成が消さない）
  },
  groove?: {                    // 演奏側データ（feel層が当てる・省略＝既定プロファイル）
    perVoice?: Record<Voice,{offsetMs:number, jitterSd:number}>,  // phrase_maker値の初期既定
    intensity?: number          // 0..1 「演奏の仕方」の指示つまみ（実装はM2・枠だけ）
  },
  knobs?: {                     // ゴースト/押し引き/ハット開閉/熱量（枠のみ・M2）
    respondToCues?: boolean     // 既定 true＝合図に乗る（案C裁定6・初期から持つ。false＝ctx.cues を読まない）
  },
  fills?: FillStyle[],          // 「フィルの弾き方の既定」＝語彙・量・狙いの既定（枠のみ・M2）。
                                // ※読み替え（2026-08-21・案C）：旧「フィル位置マーカー」の意味は退役＝
                                //   位置と強さはセクションの cue が持つ（レシピは位置を持たない）
  seed: number,
  engine: { version: string }   // エンジン更新で音が変わり得る＝刻む
}
Voice = "kick"|"snare"|"ghost"|"chh"|"ohh"|"ride"|"tom_hi"|"tom_lo"|"crash"|...
```
- **resolve は生成器**：notes＝骨の literal 音**＋生成された演奏**（ハット開閉・ゴースト・フィル・強弱…＝io-map「生成物」列。M1 時点の実装は骨どおり＋枠で、生成部は M2 で蒸留）。
- **戻り値は2枚**：(a) 既存 rhythm content 形に落ちる**ストレート実音**、(b) 機械可読の **skeleton**（kick/snare の格子位置＝後段ベース/ギターが読む横断接点＝「下から上」）。**(a)(b) ともグルーヴ非適用**。
- グルーヴは戻り値の第3要素として**別に**返す（`groove` 解決済みプロファイル）＝再生/書き出しが feel 層へ渡す。

## 3. resolve 署名
```
resolve(recipe, ctx) -> { notes: Note[], skeleton: Skeleton, groove: GrooveProfile }
ctx = { meter, tempo, bars, key?, chords?, sectionRole?, slashBass?, cues?: DerivedCue[] }
```
- **ctx に feel は入れない**（feel は resolve の後段が正準・ノリ系は recipe.groove/knobs 側）。
- ドラムは `chords` を無視するが、署名には最初から入れる（ベース・ピアノで署名を壊さない）。
- `notes`/`skeleton` はストレート。`groove` は「声部→{offsetMs,jitterSd}」の解決済みプロファイル（tempo 込みで確定）。
- 置き場＝`packages/music-core`（api/web 共有・applyFeel 単一実装の前例。cues の型・純関数も同居＝カスケード §1-1）。

### 3-1. `cues?: DerivedCue[]`（2026-08-21 追加＝カスケード由来・sectionRole と同席）
- **additive**：未指定＝bit 一致（「frame.section 自体なし」も「section は在るが cues 不在」も、従来出力と一致）。
- **型**（`packages/music-core/src/cues.ts`・カスケード §1-1）：`Cue = {bar, kind:"fill"|"build"|"break", intensity?, aim?}`＝人が書ける＝**保存可**（section ネタ content の additive フィールド）。`DerivedCue = Cue | {bar, kind:"land"}`＝**land は導出専用**（人は書かない・保存されていても deriveCues が捨てる）。resolve へは**導出済み**（deriveCues 通過後）が届く。
- **越境の規約**（カスケード §2-3）：fill の `bar`＝フィル本体の開始小節。**`bar === bars-1`＝越境**＝着地は次セクション bar0（`land` を導出で差す＝案C裁定4）／**`bar <= bars-2`＝内部着地**（セクション内で完結・導出なし）。自動フォールバック（cue 無しの既定フィル）は越境しない。
- **合図は合図**：音を**足す/変える方向にだけ**働き、骨で置いた音・明示ノブは消えない（合成順＝カスケード §3-2＝#169「明示ノブ＞role プリセット＞既定」の延長）。**知らない kind は黙って無視**（additive の要）。`knobs.respondToCues=false` のトラックは cues を読まない。
- 情報の流れ＝**skeleton は下から上・cues は上から下**の 2 本の薄い横断契約（1本化しない）。

## 4. RNG ソルト表（凍結・後で変えると全レシピの音が変わる）
既存流儀＝`new Rng(seed + salt)`（`rng.ts` mulberry32・generate.ts の seed+101、drumLock seed+61 と同型）。役割別に固定：
```
kick=+11  snare=+13  ghost=+17  hihat=+19  ride=+23  tom=+29
fill=+37  jitter=+41  altTake(別案seed)=+43
```
- 新つまみ＝新ソルト＝既存レシピの音に触らない（後付け不可なので初日に凍結）。値の衝突が無いことをテストで固定。
- **注記（現行コード準拠・カスケード §3-3）**：`fill=+37` は**将来枠＝未実装**。現行の fill は**生 seed** を使う（`resolveFillType(..., seed)`:1660・`resolveBassFill(..., seed??42)`:1167/1315）。レシピ resolve 実装時にソルト派生へ寄せる。cues 無しの既存出力が不動なのは「cue 経路が発火しない」ことによる＝ソルトの話ではない。

## 5. 裁定済み3点（2026-08-20・オーナー）
1. **既定グルーヴ強度＝phrase_maker 生値（snare+14 等）そのまま＋つまみ**で開始。ただし**これは近似**＝一律の声部別固定値。本来のノリ（もたる／突っ込む）は身体・文脈から起きる＝**位置依存**（バックビートでもたる・フィルやサビ頭へ突っ込む等）。いずれ「人っぽい・文脈依存のヒューマナイズ」へ育てる（→将来方向・§7）。スキーマは additive ゆえ後で育っても壊れない。
2. **skeleton＝kick/snare のリズム骨格**（ghost/hihat は載せない・後段を縛りすぎない）。
3. **engineVersion＝刻むが永久保守も告知機構も作らない**。バッサリ更新していく＝旧レゾルバを残さない。旧音に戻したい時は git 履歴から考え直す（ソロ利用ゆえ告知不要）。engineVersion はゴールデン回帰と決定性の識別のためだけに残す。

## 6. M0 で書く契約テスト（TDD・赤で置く）
- ①ソルト表凍結（役割→saltの値と非衝突。fill の生 seed→ソルト移行は移行時に別テストで固定）。
- ②スキーマ round-trip（未知フィールド保持・v additive・bone 省略可）。
- ③`resolve` 決定性：同一 (recipe, ctx, engineVersion) → 同一 notes/skeleton/groove（**seed と tempo に加え cues も固定条件に明記**＝cues は ctx の一部）。
- ④notes/skeleton が**ストレート**（グルーヴ非適用＝格子位置と一致）。
- ⑤recipe 未指定の既存 rhythm ネタ＝従来出力と bit 一致（回帰の器）。**cues 未指定の bit 一致は「frame.section 自体なし」「section は在るが cues 不在」の両方で回す**（undefined 取り回しで音が動かないことの機械確認）。
- ⑥グルーヴ適用は feel 層の一箇所のみ（二重掛けが無い＝適用前後の差分が groove プロファイルと一致）。
- ⑦cues 関連（カスケード §6 のテスト境界と共有）：未知 kind（例 `"kime"`）入り ctx＝現行出力と bit 一致／保存 `land`・範囲外 cue（bar>=bars）は deriveCues が捨てる＝cues なしと同一出力／`respondToCues=false`＝cues 入りでも cues なしと同一出力／cue があっても bone.cells は全て出力に literal に残る（骨保存）／`Cue` 型スナップショット凍結（「楽器が増えてもセクションのスキーマが1バイトも動かない」の機械判定）。

## 7. 将来方向（M2以降・backlog）＝文脈依存ヒューマナイズ
現行のグルーヴ＝声部別の**一律固定オフセット＋ガウス揺れ**は近似。将来は**位置・文脈依存**へ：もたり/突っ込みが小節内位置・フィル前後・セクション役割・強拍/弱拍から起きる（phrase_maker `timing.py` の「toms は tension を作りながら lay-back」の発想の一般化）。適用点は feel 層一箇所のまま、`groove` パラメータを「位置→オフセット」の関数に育てる（perVoice 固定値はその特殊解）。schema は additive で吸収。cues（フィル前・セクション頭）が位置文脈の供給源になり得る＝この将来方向とも同じ向き。
