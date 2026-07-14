# 楽曲構成の統計 ＝ 構成型辞書（X2）

- 日付: 2026-07-14
- 種別: 外部調査（公開研究・分析記事）／構成型辞書の仕様化
- 的: **構成型（form）と小節数の統計**。イントロ/アウトロの型・ゲームループ設計は既知（X3）なので本書では扱わない。
- 用途: セクション役割の列（intro / Aメロ / Bメロ / サビ / 間奏 / Cメロ / 落ちサビ / アウトロ）を「構成候補」として提案する生成の足場。
- 注意: 他者コーパスからは**統計のみ**抽出（リテラルな旋律/歌詞は保存しない）。自作曲の実測は本タスク外。

---

## 0. 到達点サマリ（結論だけ先に）

- **verse–chorus（VC）型がポップの支配的形式**。1950s後半以降、strophic / AABA / VC の3系統が主軸で、AABA は徐々に VC に置換された。
- **プリコーラス（Bメロに相当）は「標準オプション」だが必須ではない**。1960s半ばに出現 → 1980s後半には VC 曲の約 **60%** が装備。funk（〜1970）・disco（〜1980）期に2度の減少。→ **Bメロ有無は生成でトグルにすべき**。
- **セクションは 8 小節が基準単位、16 小節が拡張、変則は 12 小節（4の倍数外）**。プリコーラスは 8〜12 小節、サビは 8〜16 小節が相場。文（sentence, srdc）構造では 4+4+4+n の内部分割が典型。
- **ポストコーラス（サビ後・大サビ落とし/ドロップ）は2010s の新標準**。2010–2015 の Top-40 で **13.3%**。EDM ドロップ由来。
- **J-pop 伝統形**: 1番（A–A'–B–サビ）→ 間奏 → 2番（短縮）→ Cメロ → 落ちサビ → 大サビ → アウトロ。
- **尺の年代推移**: 洋楽は 1990（約4:19）ピーク後に短縮（2020 約3:17、イントロは 80s の20秒超→現在約5秒）。J-pop は**イントロだけ短縮**（1995 約26秒 → 2020 約13.5秒）で全体尺は必ずしも短くない（オリコン系調査は 2020 も 4:39）。**ボカロは明確に短尺化**（4〜5分→3分前後、2分半も珍しくない）。**アニソン TVサイズは 89 秒制約**。

---

## 1. 公開研究の統計（洋楽コーパス）

### 1-A. Summach「プリコーラスの構造・機能・発生」（MTO 17.3, 2011）
コーパス: **Billboard 年間 Top 20、1955–1989 の 700 曲**。
出典: <https://mtosmt.org/issues/mto.11.17.3/mto.11.17.3.summach.html>

- 形式の内訳（700曲中）:
  - **strophic（AAA）: 93 曲**
  - **AABA: 202 曲**
  - **verse–chorus（残り、1980s後半にはチャート支配）**
- プリコーラス（＝機能的にJ-popのBメロ）の普及:
  - 出現: **1960s 半ば**（早期候補: Del Shannon "Runaway" 1961、確立: 1966–67）。VC と strophic が「4部構成」へ収斂する過程で生まれた。
  - **1965–1969: VC 曲の約 1/3 がプリコーラス装備**
  - **1970 前後に減少**（funk 台頭。停滞的ハーモニーは推進型プリコーラスと相性が悪い）
  - **1979–1980 に2度目の減少**（disco 系）
  - **1980s 後半: VC 曲の約 60% がプリコーラス装備**（標準化）
- 内部の文（sentence）構造 = **srdc**（statement–restatement–departure–conclusion）:
  - コンパクトな文: 各部 **4 小節**
  - 拡張した文: 各部 **8〜16 小節以上**
  - モジュール長の一般域: **8〜24 小節**
- センテンシャル・ストローフ（sentential strophe）の比率: 1959 で strophic/AABA の 33% 未満 → **1964 に 60%** → 1965–89 は平均約60%（1965–69 は 43% へ揺れ）。
- 設計含意: **Bメロは「入れる/抜く」の二値パラメータ**にすべき（必須ではない）。プリコーラス内部は srdc 的な 4+4 分割が扱いやすい。

### 1-B. Nobile「verse–prechorus–chorus 形式のテレオロジー, 1965–2020」（MTO 28.3, 2022）
出典: <https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html>

- **1980s の Billboard 年間 Top 20 では、プリコーラス無しの VC より VPC（verse–prechorus–chorus）が多く、VPC が最頻形式**。
- セクション/サイクル長の実例:
  - プリコーラス **12 小節**（"Like a Rolling Stone" 1965）
  - サイクル総長 **16 / 24 / 32 / 36 小節**が繰り返し登場
  - **8+8+8+9 小節**サイクル（"You Oughta Know" 1995）＝ 最後の句が1小節伸びる**着地の引き延ばし**
  - **16 小節のバース**（"Bad Guy", "New Rules"）＝ 近年は verse が長尺化する例も
- 設計含意: **合計は 16/24/32 小節が「気持ちのいい単位」**。着地で +1 小節して緊張を作る変則（8+8+8+9）は自然。

### 1-C.「Form in Popular Song, 1990–2009」（UNT 学位論文, Peter Kaminsky 系）
コーパス: **Billboard 年間チャート Top 20 入り 402 曲（1990–2009）**。
出典: <https://digital.library.unt.edu/ark:/67531/metadc822808/> （PDFは bot ガードで直読不可。書誌: <https://ouci.dntb.gov.ua/en/works/7PMdXgXz/>）

- 扱う形式分類: **AAA strophic / AABA / verse–chorus / verse–chorus + prechorus / verse–chorus + postchorus / verse–chorus–bridge / その混成**。
- セクション分類:
  - コア: **verse, chorus, bridge**
  - 補助（ancillary）: **intro, prechorus, postchorus, solo/instrumental, outro, link**
- 設計含意: セクション役割の語彙を「コア3 + 補助6」で持つと過不足ない。creative_manager の役割列（intro/A/B/サビ/間奏/C/落ちサビ/アウトロ）はこれに対応（link＝間奏、bridge＝Cメロ）。

### 1-D. ポストコーラス（サビ後の追い）の台頭（2010s）
出典: <https://www.mtosmt.org/issues/mto.22.28.2/mto.22.28.2.stroud.html> ／ <https://www.top40theory.com/blog/everything-you-need-to-know-about-the-postchorus>

- **2010–2015 の Top-40 で 1,335 曲中 13.3% がポストコーラス装備**。
- 概念は **Mark Spicer が2011年に定式化**。EDM の「ドロップ」由来の「pop drop」もポストコーラスの一種。
- 型: **codetta 型（サビの余韻を締める短い後付け）** と **anthem 型（サビと同格の第二のフック）**（Stroud 2022）。
- 設計含意: 「サビの後にもう一段」＝**落ちサビ/大サビとは別軸の "hook 延長" 枠**。J-pop でも「サビ→サビ後リフレイン」で使える。

---

## 2. セクション小節長の分布（相場と変則）

| セクション | 標準 | 拡張 | 変則（頻度低） | 出典・根拠 |
|---|---|---|---|---|
| verse / Aメロ | 8 | 16 | 12 | Summach 8–24小節域, Nobile 16小節verse |
| prechorus / Bメロ | 8 | 12 | 4, 6 | Summach 1/3→60%, Nobile 12小節 |
| chorus / サビ | 8 | 16 | 12, 8+8反復で16 | J-pop 実務ガイド, srdc拡張 |
| bridge / Cメロ | 8 | 16 | — | 一般ガイド |
| 内部文構造 srdc | 4+4+4+4=16 | 8+8+8+16=40 | 8+8+8+9=33 | Summach "Runaway", Nobile "You Oughta Know" |

- **基準単位は「4小節の倍数」**。8 が最頻、16 が次点。**12 小節**は「8+4」または「4+4+4」に割れる変則で、Bメロ/サビの引き延ばしに使われる。
- 変則の作られ方は2系統: (a) **句の追加**（8→12）、(b) **着地の +1 小節**（8→9、srdc の c を伸ばす）。
- 出典: 上記 1-A/1-B ＋ J-pop 実務ガイド（下記 3-A）。

---

## 3. J-pop 固有の構成

### 3-A. 伝統形とその変種
出典: <https://er-music.jp/theory/726/> ／ <https://blog.onlive.studio/song-structure-150> ／ <https://momomodayo.com/j-pop_pattern/> ／ <https://info.shimamura.co.jp/digital/special/2025/10/161911>

- **標準伝統形（黄金型）**:
  `イントロ → Aメロ → A'メロ → Bメロ → サビ → 間奏 → Aメロ → Bメロ → サビ → Cメロ → 落ちサビ → 大サビ → アウトロ`
- 各役割の機能:
  - **Aメロ**: 静かで安定、歌い出し。しばしば **A + A'（同型反復8+8）** で 1番だけ倍尺。
  - **Bメロ**: A とサビを繋ぐ**推進部**（＝洋楽 prechorus）。省略可。
  - **サビ**: 最大の山。1番・2番で歌詞が同じことが多い。
  - **Cメロ（bridge）**: A/B/サビと違う雰囲気。間奏後・落ちサビ前に置く**転換部**。
  - **落ちサビ**: 大サビ直前、伴奏を薄くしてボーカルを聴かせる**弱起点**。
  - **大サビ**: 最後のサビ（しばしば転調・レイヤ増しで最高潮）。
- 相場の小節数（実務ガイドの目安）: **Aメロ 8 + Bメロ 8 + サビ 8〜16**。
- 変種:
  - **サビ頭**: 冒頭にサビを先出し（イントロ→サビ→A…）。2020s で非常に一般化。出典: <https://www.tokyo-vanceking2023.com/24/>
  - **B メロ省略**（A→サビ直行）: 短尺化・ボカロで頻出。
  - **A' 省略**（A 一回で B へ）: 短尺化。
  - **Cメロ→落ちサビ→大サビ**の後半ドラマは J-pop の識別的特徴（洋楽 bridge より役割が細分）。

### 3-B. アニソン TVサイズ = 89 秒制約
出典: <https://www.lisani.jp/0000227619/> ／ <https://rockinon.com/news/detail/160248> ／ <https://www.nanigoto.net/entry/2017/05/09/133020>

- **TVサイズ主題歌は約 89 秒（89.5秒）**。前後に 0.5 秒ずつの無音を入れるため実尺はさらに厳しい。
- 制作フロー: **まず TVサイズを提出 → OK後にフルコーラス化**。
- 89 秒に「イントロ→Aメロ→Bメロ→サビ（→Cメロ）」を圧縮 → **1コーラス完結の超圧縮構成**が要求される。
- 設計含意: 「**TVサイズ・プリセット**」＝合計尺を約89秒に固定して各セクション小節数を自動圧縮する生成モードが有用。

### 3-C. ボカロの短尺化傾向
出典: <https://note.com/tsurezure_cat/n/nc0a757ea3a91>（Spotify 10,054曲, 2007–2022）／ <https://realsound.jp/2020/08/post-599464.html>

- **曲尺は年々短縮**（p<0.0001 の回帰）。従来「4〜5分」→現在「3〜4分」、**2分半**も珍しくない。
- **BPM 中央値は 132 で安定**（速くなったのではなく歌詞密度が上昇）。
- 短縮は**イントロ・間奏（ソロ）を露骨に削る／Aメロの折返し(A')無し／Bメロ省略**で達成。
- ボカロP 出身アーティストがポップ全体に波及し、J-pop 全体の短尺化を牽引。
- 設計含意: 「**ボカロ短尺プリセット**」＝間奏最小・A' 無し・B省略可・合計 2.5〜3.5 分。

---

## 4. 全体尺の分布（年代推移）

### 4-A. 洋楽
出典: <https://www.washingtonpost.com/entertainment/interactive/2024/shorter-songs-again/> ／ <https://www.prsformusic.com/m-magazine/features/song-length-the-spotify-effect> ／ UCLA調査（Medium 経由 <https://medium.com/@maya.l.hazarika/why-pop-songs-are-getting-shorter-a87c61af47d8>）

- 平均尺: **1930 約3:15 → 1990 約4:19（ピーク）→ 2020 約3:17**。近年は 2019 比でさらに約30秒短。
- Spotify 人気曲ピーク: **2010–2015 の 225秒 → 2016–2021 の 198秒**。
- **イントロ: 1980s は 20秒超 → 現在 約5秒**。冒頭5秒で1/4がスキップ、30秒で1/3が離脱 → 30秒課金ラインの手前でフックを出す圧力。

### 4-B. J-pop（洋楽と挙動が違う点に注意）
出典: <https://showtakasugi.hatenablog.jp/entry/2021/10/16/200224>（日本のヒット曲, 5年刻み）／ <https://datt-music.com/chord-bunseki/pops-rock/jpop-gakkyokukousei-intro/>

- **イントロ長**: 1970 約15.1秒 → **1995 約26.2秒（ピーク）** → 2020 約13.5秒。U字型（90s J-pop 黄金期は長尺イントロ、現在は「0〜4秒の即入り」か「20秒超の作り込み」に**二極化**）。
- **全体尺（オリコン系ヒット）**: 1970 約3:21 → 2000 約4:28 → **2020 約4:39**（＝全体尺はむしろ微増）。
- 一方で作曲実務側の体感（DATT）は「2000s の5〜6分 → 現代 3〜4分弱」。**調査母体（オリコン物理ヒット vs ストリーミング/若手）で結論が割れる** → J-pop は「イントロ短縮は明確・全体尺は層による」と整理する。
- 設計含意: J-pop 生成では**イントロ短縮を既定**とし、全体尺はプリセット（伝統フル / 短尺 / TVサイズ）で切替える。

---

## 5. 仕様化 ＝ 構成型辞書＋生成設計

### 5-A. 構成型辞書（form dictionary）

役割コード: `I`=intro, `A`=Aメロ, `A'`=Aメロ変奏, `B`=Bメロ(prechorus), `C`=サビ(chorus), `PC`=ポストコーラス, `Br`=Cメロ(bridge), `Inst`=間奏(link/solo), `DC`=落ちサビ, `LC`=大サビ(last chorus), `O`=アウトロ。
小節はデフォルト値（[]内は許容レンジ）。合計尺は BPM 120・4/4 で概算（1小節=2秒）。

| 型ID | 名称 | セクション列（小節） | 合計小節 | 概算尺(120) | ジャンル/年代文脈 | 出典根拠 |
|---|---|---|---|---|---|---|
| F01 | J-pop 黄金フル | I8 A8 A'8 B8 C16 Inst8 A8 B8 C16 Br8 DC8 LC16 O8 | 128 | 4:16 | J-pop 2000s主流 | 3-A |
| F02 | J-pop 標準（A'省略） | I8 A8 B8 C16 Inst8 A8 B8 C16 Br8 DC8 LC16 O4 | 108 | 3:36 | J-pop 汎用 | 3-A |
| F03 | J-pop 短尺（B省略・間奏最小） | I4 A8 C16 Inst4 A8 C16 Br8 LC16 O4 | 84 | 2:48 | 現代J-pop/ボカロ | 3-C,4-B |
| F04 | サビ頭 | I2 C8 A8 B8 C16 Inst4 A8 B8 C16 DC8 LC16 O4 | 106 | 3:32 | 2020sストリーミング | 3-A(サビ頭) |
| F05 | ボカロ超短尺 | A8 B8 C16 A8 B8 C16 Br8 LC16 O2 | 90 | 3:00 | ボカロ/イントロ無 | 3-C |
| F06 | アニソン TVサイズ | I4 A8 B8 C16 O2 (≈89秒に圧縮) | 38 | ~1:29 | アニメOP/ED | 3-B |
| F07 | 洋楽 VC 標準（Bメロ無） | I4 V8 C8 V8 C8 Br8 C8 O4 | 48 | 1:36→(×繰返)~3:00 | 洋楽pop 汎用 | 1-A,1-C |
| F08 | 洋楽 VPC（プリ有） | I4 V8 PreC8 C8 V8 PreC8 C8 Br8 C8 O4 | 60 | ~3:20 | 洋楽 80s–現在 最頻 | 1-A,1-B |
| F09 | 洋楽 VC+ポストコーラス | I2 V8 PreC8 C8 PC8 V8 PreC8 C8 PC8 Br8 C8 PC8 O2 | 86 | ~2:52 | 2010s EDM系pop | 1-D |
| F10 | AABA（オールドスタイル） | I4 A8 A8 B8 A8 (×2 or +solo) O4 | 44 | ~2:00 | 50s–60s, ジャズ/歌謡 | 1-A |
| F11 | AAA strophic | I4 V16 V16 V16 O4 | 56 | ~1:52 | フォーク/物語歌 | 1-A |
| F12 | ゲームループ（既知X3・参照のみ） | I → A → B →（loop点）… | — | — | BGM。詳細は別doc | 既知 |
| F13 | 落ちサビ強調型 | I8 A8 B8 C16 Inst8 A8 B8 C16 Br8 DC16 LC16 O8 | 128 | 4:16 | バラード/J-pop | 3-A |
| F14 | ダブルサビ（サビ2連） | I8 A8 B8 C16 C16 Inst8 A8 B8 C16 C16 Br8 LC16 O8 | 144 | 4:48 | J-pop ドラマ主題歌 | 3-A拡張 |

（10型以上＝F01–F14 で 14 型。F12 は既知のゲームループでプレースホルダ、詳細は別doc）

### 5-B. 「構成候補を提案する」生成の設計案

**入力パラメータ**:
- `genre_context`: {jpop, vocaloid, anime_tv, western_pop, ballad, game_loop}
- `length_target`: {full(~4:30), standard(~3:30), short(~2:45), tv_size(89s), custom(秒)}
- `has_prechorus`: {on, off, auto}（auto はジャンル既定：jpop=on, vocaloid_short=off寄り, western=確率60%）
- `chorus_first`: bool（サビ頭）
- `post_chorus`: bool（既定 western_2010s=on, 他=off）
- `bridge`: {C_melo, none}（後半ドラマの有無）
- `bpm`, `time_sig`

**アルゴリズム（提案生成）**:
1. `genre_context` から候補型を辞書引き（例: jpop→F01/F02/F04/F13、western→F07/F08/F09）。
2. `length_target` で各型のデフォルト小節を**スケーリング**（超過→間奏/A'/イントロ/アウトロを優先削除、不足→サビ反復/大サビ延長）。削除優先順位: `Inst > O > I > A' > B`（＝短尺化の実証パターン 3-C に一致）。
3. `has_prechorus/chorus_first/post_chorus/bridge` のフラグで型を変形。
4. 各セクション小節数を**4の倍数に丸める**。変則許容時のみ 12/+1小節を確率的に注入（1-B の 8+8+8+9 パターン）。
5. **合計尺を秒換算**して `length_target` の許容帯（±10%）に収まるまで 2〜4 を反復。
6. 候補を **3〜5案**返す（seed 違い・型違い・尺違いでばらつきを出す＝ユーザー方針「サンプルはバリエーション」に合致）。人間が最終選択・仕上げ（「機械は候補まで」原則）。

**スコアリング（候補の順位付け、任意）**:
- ジャンル整合（辞書一致度）＋ 尺一致（target との差）＋ 変則ペナルティ（変則は控えめに）＋ 山の配置（サビが黄金比〜後半に来るか）。

### 5-C. 2番の変化規則（1番との差分）

1番→2番は「**構造は保つが情報を間引く／レイヤを足す**」が原則。差分ルール:

| 規則 | 1番 | 2番 | 根拠 |
|---|---|---|---|
| R1 A'折返し省略 | A + A'（16小節） | A のみ（8小節） | 短縮の最頻手（3-C, 実務ガイド） |
| R2 Bメロ短縮/省略 | B 8小節 | B 4小節 or 無し | 推進部の圧縮 |
| R3 イントロ→間奏置換 | I（導入） | Inst（つなぎ、より短く） | イントロ相当を2番前に置かない |
| R4 サビ歌詞同一 | サビ歌詞X | サビ歌詞X（同一が多い） | 3-A（J-pop慣習） |
| R5 レイヤ増（編曲差） | 素の伴奏 | ドラム/対旋律/ハモリ追加 | 反復の飽き回避（編曲層で差別化） |
| R6 後半だけ新セクション | （無し） | 2番サビ後に Br/DC/LC を新設 | J-pop 後半ドラマ（3-A） |
| R7 大サビの押し上げ | サビ（原調） | 大サビ=転調 or オクターブ上/レイヤ最大 | 3-A（最高潮） |
| R8 落ちサビの間引き | （無し） | 大サビ直前に伴奏を薄くした DC | 3-A（弱起点→爆発の対比） |

**実装への落とし込み**: 2番は 1番テンプレを複製 → R1/R2/R3 で**尺を削り**、R5/R7 で**強度を上げる**、R6/R8 で**後半に新規セクションを追加**。差分は「セクション列の編集操作（delete/shorten/replace/append）＋レイヤ・タグ（arr_intensity, transpose）」として表現すると生成器と相性が良い。

---

## 6. 設計含意（creative_manager への接続）

- 役割語彙は **コア3（A/verse, サビ/chorus, Cメロ/bridge）＋補助（intro, Bメロ/prechorus, ポストコーラス, 間奏/link, 落ちサビ, 大サビ, アウトロ）** で足りる（1-C 準拠）。既存の役割列と整合。
- **Bメロ（prechorus）は必須でなく二値トグル**。ジャンル既定＝ jpop:on / western:確率 / vocaloid_short:off 寄り。
- **小節は 4 の倍数、8 基準・16 拡張・12 変則**。変則は確率注入で「たまに」出す。着地 +1 小節（8→9）は自然な緊張生成。
- **尺プリセット**（フル/標準/短尺/TVサイズ89秒/ボカロ2.5–3.5分）を用意し、超過時の削除優先順位 `Inst>O>I>A'>B` を実装。
- **候補は3〜5案・ばらつき前提**で提示、完成は人間（設計思想「選択肢を出す・仕上げは人間」に一致）。
- ポストコーラス/サビ頭/ダブルサビは**近年トレンド枠**として型に含めるが既定は控えめ。

---

## 出典一覧（URL）

- Summach「The Structure, Function, and Genesis of the Prechorus」MTO 17.3 (2011): <https://mtosmt.org/issues/mto.11.17.3/mto.11.17.3.summach.html>
- Nobile「Teleology in Verse–Prechorus–Chorus Form, 1965–2020」MTO 28.3 (2022): <https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html>
- 「Form in Popular Song, 1990–2009」UNT学位論文: <https://digital.library.unt.edu/ark:/67531/metadc822808/>（書誌: <https://ouci.dntb.gov.ua/en/works/7PMdXgXz/>）
- Stroud「Codetta and Anthem Postchorus Types」MTO 28.2 (2022): <https://www.mtosmt.org/issues/mto.22.28.2/mto.22.28.2.stroud.html>
- Top40Theory「Everything You Need to Know About the Postchorus」: <https://www.top40theory.com/blog/everything-you-need-to-know-about-the-postchorus>
- Washington Post「Pop songs are getting shorter…」(2024): <https://www.washingtonpost.com/entertainment/interactive/2024/shorter-songs-again/>
- PRS for Music「Song length: the Spotify effect」: <https://www.prsformusic.com/m-magazine/features/song-length-the-spotify-effect>
- 「Why Pop Songs Are Getting Shorter」(UCLA調査引用): <https://medium.com/@maya.l.hazarika/why-pop-songs-are-getting-shorter-a87c61af47d8>
- J-pop 構成: <https://er-music.jp/theory/726/> ／ <https://blog.onlive.studio/song-structure-150> ／ <https://momomodayo.com/j-pop_pattern/> ／ <https://info.shimamura.co.jp/digital/special/2025/10/161911>
- DATT.MUSIC「近年のJ-popにおける楽曲構成の話」: <https://datt-music.com/chord-bunseki/pops-rock/jpop-gakkyokukousei-intro/>
- サビ頭/イントロ0秒: <https://www.tokyo-vanceking2023.com/24/>
- 日本のヒット曲 5年刻み調査（イントロ/尺）: <https://showtakasugi.hatenablog.jp/entry/2021/10/16/200224>
- アニソン TVサイズ89秒: <https://www.lisani.jp/0000227619/> ／ <https://rockinon.com/news/detail/160248> ／ <https://www.nanigoto.net/entry/2017/05/09/133020>
- ボカロ長期変化（Spotifyデータ）: <https://note.com/tsurezure_cat/n/nc0a757ea3a91>
- ボカロ変遷考察: <https://realsound.jp/2020/08/post-599464.html>
