# カスケード・ブリーフィングの実装設計 — 曲/セクション/ネタの3層を ctx 1枚に畳んで演奏者へ配る（一案）

土台（確定・再議論しない）＝[持ち場の裁定＝案C](2026-08-21-arrange-data-locus.md)（セクション＝薄い合図・トラック＝弾き方の語彙・resolve が合成・神化回避基準）／[M0契約](2026-08-20-phrasemaker-M0-contract.md)（`resolve(recipe, ctx)`・ctx＝`{meter,tempo,bars,key?,chords?,sectionRole?,slashBass?}`）／[入出力対応表](2026-08-20-phrasemaker-recipe-io-map.md)。
本書はそれを**実装の形**（型・置き場・merge 規則・段階・テスト）に落とす。方針＝**一番安い実装**：新モジュールを作らず、既存の ctx 組み立て（`Frame.section`・`/gen/section`・resolve ctx）の**延長**に置く。

## 0. モデルの一枚絵（概念＝正準行きの命名）

```
曲       ＝ セクションが持てない構造（フォーム順・キー計画・エネルギー山谷・「これがラスサビ」）
  ↓ オーケストレート＝「賢い指揮者」でなく、共有の1枚（ctx＝黒板）に書き揃える数行の merge
セクション＝ ネタが持てない構造（役割・境界の合図＝フィル/ビルド/ブレイク・レイヤー抜き差し）
  ↓ push（resolve 時に ctx として配る。演奏者からの問い合わせ・聴き合いループは作らない）
ネタ      ＝ 各トラックの弾き方の語彙（骨・つまみ・groove・seed）＝演奏者
            演奏 ＝ 自分の語彙 × 渡された ctx（決定的・単発生成）
```

- **規則は1本＝内側優先のスコープ上書き**（セクション＞曲）。既存 design #169「明示ノブ＞role プリセット＞既定」と同型のカスケードが、1段上（曲→セクション）にも同じ形で伸びるだけ。
- **曲レイヤーは実装丸ごと後回し（オーナー裁定）**：outer スロットと merge 規則は凍結して残すが、曲レイヤーの実データ供給は今は一切しない＝3層目は将来の宿題。ラスサビは当面**分家（vary）で回避**。
- **skeleton（下から上・実音の噛み合い）と ctx の合図（上から下・構造/意図）は別軸**＝1本化しない（design「skeleton＝下から上、cues＝上から下」）。
- **例外の一撃**＝人間が置いた具体（骨の音・明示ノブ）が最強詳細度。合図は音を**足す/変える方向にだけ**働く。
- メタファ＝レコーディングセッションのチャート（譜面台の1枚）。全員が同じ1枚を見る。指揮者はいない。

## 1. データモデル

### 1-1. 型（`packages/music-core` に置く＝api/web 共有。applyFeel/Note 型一元化と同じ前例）

```ts
// packages/music-core/src/cues.ts（新規・純型＋純関数のみ）
export type CueKind = "fill" | "build" | "break";  // 人が書ける＝保存可（裁定2）
export interface Cue {
  bar: number;             // セクション相対の小節番号（0-based）。fill では「フィル本体の開始小節」（§2-3）
  kind: CueKind;
  intensity?: number;      // 0..1（fill の派手さ・build の傾き）。未指定＝各演奏者の既定
  aim?: "up" | "down";     // 狙いの向き（駆け上がり/下降）。未指定＝演奏者任せ
}
// land＝導出専用＝型で分離（保存型 Cue には入らない）。resolve の ctx.cues はこちらを受ける。
export type DerivedCue = Cue | { bar: number; kind: "land" };
```

- **land の書き込みガード**：content は `z.unknown()` 素通しゆえ update_neta で `kind:"land"` を書けてしまう。防御は型分離＋**読み取り点1箇所**＝`deriveCues` が保存 cues を読む際に `kind==="land"` を捨てる（保存された land は無効・警告なし）。書き込み経路の reject は増設しない（読み側1箇所で足りる＝安い）。
- **範囲外 cue の寿命**：フォーム改訂等で section の bars が縮み `bar >= bars` になった cue は**解決時に無視**（deriveCues でフィルタ・データは消さない＝bars を戻せば復活）。警告表示は後段の UI 課題。「フォーム改訂で腐らない」設計なので、自分の腐り方をここで定義しておく。
- 楽器の名前・楽器別フィールドは**一切持たない**。キメの縦格子（リズム）は将来 `kind:"kime"`＋`grid?: number[]` の additive 追加で吸収（今は作らない）。
- **神化回避基準の充足**：楽器が増えても `Cue` は1バイトも動かない。新楽器の対応＝その楽器の resolver に「cues をどう弾くか」を書くだけ（§3）。判定テスト＝`Cue` 型のフィールド集合をスナップショットで凍結し、楽器追加 PR で差分ゼロを機械確認（§6）。

### 1-2. セクションレイヤー＝section ネタの content に additive（裁定3）

```
section.content = { ...既存(shown/hidden 等), cues?: Cue[] }
```

- content は `schemas.ts` の `z.unknown()` 素通し＝**DB スキーマ変更なし・新 kind なし・migration なし**。web の既存 consumer（`sectionContext.ts` の shown/hidden 読み等）は知らないキーを無視する＝bit 安全。
- 既に section が持つ構造情報（変えない）：`role:` タグ（`formStrip.ts::roleOf/withRole`）・key/mode/tempo/meter/bars（neta カラム）・レイヤー抜き差し＝レーンへの配置そのもの。**cues はこの隣に座る1配列**だけが増える。

### 1-3. 曲レイヤー＝**今は新フィールドを1つも足さない**（YAGNI・「器だけ先行させない」）

曲が持つべき構造は、実は大半が**既に住所を持っている**：

| 曲の構造情報 | 現住所（実装済み） | 新規追加 |
|---|---|---|
| フォーム順 | song の children 並び（composition） | なし |
| キー計画 | suggest_key_plan → 子ネタの key/mode へ**適用済みの実体**（`formPlan.ts::planKeyApplication`・分家含む） | なし |
| テンポ・拍子 | song/section の neta カラム | なし |
| エネルギー山谷 | suggest_energy_plan＝**提案止まり**（正典 §6「人が崩す」）。確定値は各セクションの role・生成ノブに落ちる | なし（後段candidate） |
| 「これがラスサビ」 | 現状は分家（vary）＋role タグで表す（drop_chorus/last_chorus は energyPlan 語彙に既存） | なし（未決＝§7-2） |

- **曲レイヤーは実装丸ごと後回し（オーナー裁定・2026-08-21）**：この表のとおり大半は既存住所で足りており、新フィールドは1つも足さない。将来必要になった項目（例：曲全体の build 指定・モチーフ回想の参照）は、**cues が sectionRole の隣に座ったのと同じ手順で ctx に additive に足す**。器（songArrange オブジェクト等）を先に切らない。
- **将来結線時の戒め（レビュー指摘＝ここが指揮者神化の巣）**：曲レイヤーを outer に結線する時は**データを敷くだけ**。`deriveCues` を「曲の意図から合図を生成する頭脳」にしない（energy 山谷→outer cue の変換は提案系 verb（suggest_*）側の仕事＝人が採用して初めてデータになる）。
- **モチーフ回想＝参照運搬**は名前だけ確保：将来 `Cue` に `ref?: string`（ネタID・音符は運ばない）。今は実装しない。

## 2. オーケストレート（統合）＝ctx 組み立ての延長・数行の merge

### 2-1. 合成点は既存の2箇所＋resolve（新モジュールなし）

| 経路 | 現状の ctx 組み立て | 追加 |
|---|---|---|
| 旧生成器（genDrums/genBass/genMelody…） | `Frame.section: SectionContext`（generate.ts:66・role/prevRole/nextRole/energy…） | `SectionContext` に `cues?: DerivedCue[]` を1行追加（呼び出し側が導出済みを渡す）。各生成器が読む |
| `POST /gen/section`（http.ts:419） | frame を各生成器へ透過・feel を配布（design 306「配り役」） | body/section content の cues を `frame.section.cues` に載せて**全生成器へ同じ1枚を配る** |
| レシピ `resolve(recipe, ctx)`（M0・music-core） | ctx＝`{meter,tempo,bars,key?,chords?,sectionRole?,slashBass?}` | `cues?: DerivedCue[]` を追加（sectionRole と同じ席・additive・land は導出済みで届く） |

- 「統合器」という名のモジュールは**作らない**。増えるのは music-core の純関数2つ（`mergeCues`・`deriveCues`）と、既存組み立て点でのフィールド透過だけ。

### 2-2. 内側優先の上書き規則（カスケードの実体＝数行）

スカラー項目（将来曲レイヤーが値を持ったとき）はオブジェクト spread の順序がそのまま規則：

```ts
// 外→内の順に重ねる＝後勝ち＝内側優先。#169「明示ノブ＞roleプリセット＞既定」の1段上版。
const ctx = { ...engineDefaults, ...songLayer, ...sectionLayer, ...explicitKnobs };
```

cues（配列）は (bar, kind) をキーに内側が勝つ：

```ts
// packages/music-core/src/cues.ts
export function mergeCues(outer: Cue[] = [], inner: Cue[] = []): Cue[] {
  const key = (c: Cue) => `${c.bar}`;                      // 同一小節は内側の合図で丸ごと上書き
  const m = new Map(outer.map(c => [key(c), c]));
  for (const c of inner) m.set(key(c), c);                  // 内側優先（kind 違いも同小節なら内側が正）
  return [...m.values()].sort((a, b) => a.bar - b.bar);
}
```

- **衝突例**：曲レイヤー（将来）が「終盤 build」で bar6 に `build` を敷いた × セクションが bar6 に `break` を置いた → **セクションの break が勝つ**（落ちサビの静寂を曲の盛り上げ指定が潰さない＝内側＝現場が正）。
- 同一小節キーで丸ごと上書き（kind 別併存にしない）のは規則を1文で言えるため：「**同じ小節に両方が口を出したら、内側の言い分だけ聞く**」。1小節に fill と break を同時に、が必要になったら配列キーを `(bar,kind)` に緩める（additive）。
- **outer は当面実発火しない純規則**（曲レイヤー丸ごと後回し＝§1-3）：今日時点で outer（曲）は常に空＝mergeCues は実質恒等。**規則とテストだけ先に凍結**しておく（後から規則を変えると音が変わるため）。3層目の結線は将来の宿題。

### 2-3. 導出（並びからしか分からない情報）＝`deriveCues`

保存しない・毎回導出（prevRole/nextRole を「並びから導出・保存しない」既存前例と同型）：

**cue.bar の意味（ここで確定・1文）**：`fill` の `bar` ＝**フィル本体の開始小節**。着地＝`bar + フィル型の小節数（ft.bars）` の頭（1小節フィルなら bar+1 頭）。

**越境の規約（最重要・これが無いと裁定4が黙って死ぬ）**：
- **`bar === bars-1` の fill cue ＝越境**＝着地がセクション外に出る＝次セクション bar0 に `land` を導出で差す（裁定4）。
- **`bar <= bars-2` の fill cue ＝内部着地**＝着地はセクション内（bar+ft.bars の頭）で完結・導出なし。
- **自動フォールバック（cue 無しの既定フィル）は越境しない**＝従来どおり最終小節内で着地まで完結（`applyDrumFill` の landing・bit 一致のため）。
- 帰結＝「次のセクション頭に着地させたい」は**最終小節（bars-1）に cue を置く**のが正しい書き方。フォールバックの位置（本体が bars-2 相当）に倣って bars-2 に置くと内部着地になる＝仕様どおり（UI/MCP の説明文に明記する）。

```ts
// 曲の並び（sections: 各 {cues, bars, role}）から、各セクションの実効 cues を導く
export function deriveCues(sections: {cues?: Cue[]; bars: number}[], i: number): DerivedCue[] {
  const clean = (s: {cues?: Cue[]; bars: number}) =>
    (s.cues ?? []).filter(c => (c.kind as string) !== "land" && c.bar < s.bars); // 保存landの無効化＋範囲外cueの無視（§1-1）
  const own = clean(sections[i]);
  const prev = sections[i - 1];
  // 裁定4：前セクション最終小節(bars-1)に fill ＝越境＝このセクションの bar0 に "land" を導出で差す。
  const landed = prev && clean(prev).some(c => c.kind === "fill" && c.bar === prev.bars - 1)
    ? [{ bar: 0, kind: "land" as const }] : [];
  return mergeCues(landed, own);   // 自分の合図が内側＝bar0 に自前の合図があればそちらが勝つ
}
```

- `land` は**導出専用**（人は書かない・保存されていても捨てる＝§1-1 ガード）。演奏者側の語彙＝ドラムなら crash+kick（`applyDrumFill` の landing 節と同じ音）、ベースなら着地ルート強打、コードなら頭打ち。
- prevRole/nextRole も同じ場所で並びから埋める（現 web は role しか渡していない＝useMelodyGen.tsx:322。導出は追加であり従来呼び出しは bit 一致）。

## 3. 演奏者への開示と演奏

### 3-1. 各演奏者は同じ1枚（ctx.cues）を自分の語彙で解決する

| cue | ドラム | ベース | コード楽器 |
|---|---|---|---|
| `fill` | 当面＝`resolveFillType`＋`applyDrumFill` を cue.bar 相対に（intensity→F型選抜は既存 0..1 経路そのまま）。M2＝bodyfill（打撃経済DP） | `resolveBassFill`＝該当小節を fill セルへ差替（既存機構・bars-2 を cue.bar に）。aim=up なら駆け上がり型を選抜 | 初期は**無視**（正直に何もしない）。後段＝アルペジオ密度上げ |
| `build` | 初期は fill の弱形（intensity 低の F型）で近似 or 無視。M2＝ハット開閉勾配・クレッシェンド | 後段＝8分刻み密度上げ | 後段＝上行ボイシング・刻み密度 |
| `break` | 該当小節を**間引く**…ではなく初期は無視（「合図は足す/変える方向」の原則との整合は §7-3 の論点） | 同左 | 同左 |
| `land`（導出） | bar0 頭に crash+kick（`ft.landing` と同じ音） | bar0 頭ルート・vel 強 | bar0 頭打ち |

- **知らない kind は黙って無視**が全演奏者の共通契約（additive の要＝kime を将来足しても旧 resolver は壊れない）。
- **応答つまみ（裁定6・初期から持つ）**：レシピ側 `knobs.respondToCues?: boolean`（既定 true）。false＝ctx.cues を読まない（そのトラックだけ合図に乗らない自由）。旧生成器側の対応物は「opts.fill を明示指定したらそれが勝つ」（下記合成順）＝専用ノブは足さない。

### 3-2. 合成順（1トラック内のカスケード＝#169 の延長・上書きは内側勝ち）

```
弱い ←──────────────────────────────────→ 強い
エンジン既定（自動シーム＝cue 無し時の既定フィル位置：ドラム=最終小節アンカー・ベース=bars-2 等）
  ＜ role プリセット（applySectionPreset）
  ＜ ctx.cues（セクションの合図）
  ＜ 明示ノブ（opts.fill=型ID 名指し 等・人の指定）
  ＜ 人間が置いた具体（レシピの骨 bone.cells・明示配置ノート）＝絶対に消えない
```

- 「置いた意図は生成が消さない」の一般化＝最下段（骨）は cue がどうあれ literal に残る。cue 起因の生成音は骨の**周りに足す/差し替える**だけ（フィル小節の骨キック扱い＝B2 裁定待ち・M2 で実音レンダして決める）。
- 明示 `opts.fill`（型ID）と cue.fill が両方ある時＝**明示ノブが位置も型も勝つ**（#169 と同じ・人の指定＞構造の合図）。

### 3-3. resolve への渡し方（push・単発・決定的）

- 演奏者から曲/セクションへの問い合わせ口は**作らない**。resolve 呼び出し側（/gen/section・MCP・web の各 gen ボタン）が `deriveCues`→`ctx.cues` に畳んで渡す。多段 resolve・聴き合いループなし。
- 決定性＝cues は ctx の一部なので「同一 (recipe, ctx, engineVersion) → 同一出力」の既存契約に**自動的に含まれる**。**cue.bar は位置だけを動かし、フィルの内容（seed 依存の型選抜・中身）は不変**＝現行 fill は生 seed を使う（`resolveFillType(..., seed)`:1660・`resolveBassFill(..., seed??42)`:1167/1315）＝新しい乱数消費を増やさない。（注：ソルト `fill=+37` は M0 契約 §4 の**将来提案・未実装**＝レシピ resolve 実装時にそちらへ寄せる。cues 無しの既存出力が不動なのは「cue 経路が発火しない」ことによる＝ソルトの話ではない。）

## 4. 既存との整合・移行（additive・従来 bit 一致）

| 既存 | 位置づけの変化 | bit 互換 |
|---|---|---|
| `genDrums` opts.fill＝**最終小節アンカー**（applyDrumFill・generate.ts:1664 `fillStart = N-1-ft.bars`＝本体が bars-2 になるのは 1小節フィルの時だけ。複数小節フィルはさらに前から） | **自動シーム＝cue 不在時のフォールバック**へ格下げ（phrase_maker auto seams と同役）。`frame.section.cues` に fill があれば cue.bar＝本体開始小節を使う | cues 未指定＝現行コードパスに一切触れない＝bit 一致 |
| `genBass` opts.fill＝bars-2 固定（generate.ts:1166, 1310＝こちらは常に1小節） | 同上（fig/kick 経路・style 型経路の両方とも cue.bar 差替に対応） | 同上 |
| ライブラリ単独試聴（合図なし） | 裁定5＝末尾に自動フィル＝上のフォールバックがそのまま担う | 変更なし |
| feel 配布（design 306＝section は配り役・保存は各トラック content） | **同型の先例**。違いは cues の保存場所が section 側なこと＝feel は「奏者の癖」（トラックの持ち物）、cues は「構造の合図」（セクションの持ち物）で、案Cの持ち場分けそのもの | 変更なし |
| `frame.section`（role/energy/prevRole/nextRole） | cues が**同じ席**に増えるだけ。role→プリセットの適用順も不変 | section 未指定＝bit 一致（既存契約のまま） |
| M0 契約 ctx | `cues?: DerivedCue[]` を1項目追加 | 未指定＝一致（sectionRole と同じ） |
| io-map 裁定#6（改訂済み） | レシピの `fills?` は「弾き方の既定」（語彙・応答つまみ・量の既定）の意味で確定 | — |

**同じ「末尾に置く」位置知識が genDrums/genBass に別々に（しかも微妙に違う式で）ハードコードされている重複**は、cue 経路が本線になった時点で「フォールバック実装が2箇所」に縮む。統一（フォールバック位置も deriveCues で1箇所導出）は安全になってからの後段リファクタ（挙動同一・テスト固定で）。

## 5. 段階（何を今・何を後）

### S0（契約・即）＝型と規則の凍結
- `packages/music-core/src/cues.ts`：`Cue`・`mergeCues`・`deriveCues`＋テスト（内側優先・land 導出・スナップショット凍結）。
- M0 契約 doc に ctx `cues?` を追記（本書が根拠）。design.md へ3層の概念（§0 の一枚絵）とカスケード規則を正準化。

### S1（最小の縦・実需要＝フィル）
- `SectionContext` に `cues?` 追加 → `genDrums`/`genBass` の fill 位置が cue.bar を読む（不在＝従来の既定位置＝bit 一致）。
- `/gen/section`：body に `cues?: Cue[]`（または section ネタ再生成時は content から）→ `frame.section.cues` に載せて全生成器へ配布。
- web `useMelodyGen`：編集中 section の `content.cues` を frame.section.cues へ透過（role タグ読みの隣・useMelodyGen.tsx:322）。
- MCP `gen_drums`/`gen_bass`/`gen_section` の frameSchema に cues 追加（allowlist 忘れ注意＝BUG#1型）。
- **break の受理と正直表示**：S1 では build/break も schema 上は受理するが**全演奏者が無視＝置いても鳴りは変わらない**。UI/MCP の説明文にこの1行を明記する（黙って効かないのは信頼毀損）。あわせて越境規約（§2-3＝末フィルは bars-1 に置く）も説明文に載せる。
- 置く手段は当面 MCP/チャット（update_neta で content.cues を書く）。**cue を置く UI（セクション小節ルーラーへのチップ）は別スライス**＝見た目の裁定はモックが先。

### S2（境界をまたぐ）
- `deriveCues` を /gen/section・web の生成呼び出しに結線＝セクション末 fill の `land` が次セクションの bar0 に鳴る（裁定4）。prevRole/nextRole の自動導出も同所で。
- レシピ resolve（M1 ドラム）が ctx.cues を消費（bodyfill 前の暫定＝applyDrumFill 流用）。

### S3以降（概念に置いて実装後回し）
- build/break の楽器別解決（ハット勾配・上行ボイシング）＝M2 の蒸留と同時。
- キメ（`kind:"kime"`＋縦格子）・モチーフ回想（`ref`＝ネタID参照・音符は運ばない）・曲レイヤーの値（エネルギー山谷を outer cues として敷く）＝**必要になった項目から additive**。結線時は§1-3の戒め＝**データを敷くだけ・deriveCues を「曲の意図から合図を生成する頭脳」にしない**。
- cue 配置 UI・フォーム改訂への追従表示。

## 6. テスト境界

**A. ブリーフィング固定 → 演奏者テスト**（各 resolver のゴールデン）
- 固定 ctx（cue fill@bar2, intensity 0.7）→ genDrums：bar2 に F型・他小節は base 型不変・bar3 頭に着地。genBass：bar2 が fill セル差替・他不変。
- 骨保存：cue があっても bone.cells／明示配置ノートが全て出力に literal に残る（「置いた音は消えない」）。
- 未知 kind 無視：`kind:"kime"`（未実装）入り ctx → 現行出力と bit 一致。
- respondToCues=false → cues 入り ctx でも cues 無しと同一出力。

**B. 演奏者固定 → 統合テスト**（merge/導出の純関数＋配布の配線）
- `mergeCues`：内側優先（同 bar 衝突＝build×break→break）・非衝突は和集合・順序安定。
- `deriveCues`：前セクション末 fill → bar0 land／自前 bar0 cue が land に勝つ／先頭セクション＝land なし。
- 配布の1枚性：/gen/section が drums/bass（将来 melody/comp）へ**同一の cues 配列**を渡す（同じ黒板を見ている）。

**C. 決定性・互換（既存契約の器に載せる）**
- 同一 (recipe|frame, ctx, seed, engineVersion) → 同一出力（cues は ctx の一部＝既存テスト③の条件に自動包含。**cues も固定条件に明記**）。
- cues 未指定＝現行全生成器と deepStrictEqual bit 一致（既存テスト⑤の型）。**「frame.section 自体なし」と「section はあるが cues なし」の両方で回す**（cues の undefined 取り回しで音が動かないことの機械確認）。
- 保存 land・範囲外 cue（bar>=bars）入り content → deriveCues が捨てる＝cues なしと同一出力（§1-1 ガードの機械確認）。
- `Cue` 型スナップショット凍結＝「楽器が増えてもセクションのスキーマが1バイトも動かない」の機械判定。
- ソルト表非衝突テストに変更なし（新ソルトを足していないことの確認）。

## 7. 未決点（オーナー裁定 or 後段で材料を作る）

1. **B2（既存ブロッカー・M2）**：フィル小節に骨キックがある時＝骨停止か骨保持＋追加か。実音レンダ2案で裁定（本設計は「骨は消えない」を上限契約として持つのみ）。
2. **「これがラスサビ」の住所**：同一サビネタの複数配置で最後だけ last_chorus＝ネタの tags では表せない（共有ネタ問題）。現行の答え＝分家（formPlan の branch 前例）。配置レベル注記を足すかは**曲レイヤーに実需要が来た時**に設計（今は分家で足りる）。
3. **break の意味論**：「合図は足す/変える方向にだけ働く」原則と「break＝間引く」は緊張がある。初期実装は break を演奏者が無視することで先送り。実装時に「骨は残し生成音だけ間引く」で原則と両立できるかを実音で確認。
4. **同一小節に複数 kind**（fill＋build 併記）：現 merge は小節キーで単一化。必要が出たら (bar,kind) キーへ緩める（additive）。
5. **cue 配置 UI**：モックが先（見た目の裁定は文字の表では選ばない）。本書のスコープ外。
6. **リタルダンド（にじみ・脱落防止の転記）**：減速は「次のセクション頭が来る」ことあってこその隣接効果＝越境の同族（land と同じ導出の型に乗る候補）。テンポは feel/再生層の管轄でもあり、cue 語彙に入れるかは実需要が来た時に設計。
7. **歌詞（にじみ・脱落防止の転記）**：歌詞の物理はトラック content（lyric）だが、推敲は必ず通し＝レイヤーをまたぐ。切り分け＝**このモデルは「生成の情報流」の原理であり、人間の編集は全レイヤーを縦断してよい**（ブリーフィングは生成器への配り方の話・人の推敲導線を縛らない）。
