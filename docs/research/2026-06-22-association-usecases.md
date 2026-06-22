# 研究レポート：連想ユースケース群を「どの仕組み（retrieval / ルール / embeddings / Claude）」で満たすか

調査日: 2026-06-22 / 対象: creative_manager（個人用・自己ホスト作曲支援ツール）
種別: **設計研究（実装ではない・プロダクトのコードは不変）**。一次資料はコード読取＋WebSearch/WebFetch の引用付き。**推測（INFER）と事実（FACT）を分離**する。
前提（1行）: **ドメインロジック（進行/度数/連想/類似度/操作）は全部 TypeScript（apps/api core）で作り、Python は信号処理に限定（embeddings/意味検索=cm-search、音声解析、pyopenjtalk）。** 連想は4軸（①機能 ②タグ/意味 ③構造類似 ④メロ⇔コード結合）×多粒度（進行まるごと/2小節セル/コード遷移/(メロ動機,コード)ペア）で整理済み。

関連先行研究（土台・重複しない）:
- `docs/research/2026-06-22-chord-progression-engine.md`（DB＋ルール＋Claude選択／#86改訂＝Claudeは度数を選ぶ・実音はルール／music21撤廃）
- `docs/research/2026-06-22-jp-chord-sources.md`（日本曲の進行データ仕入れ：Songle API/スクレイプ/集計リスト→度数列＋タグ＋出典に正規化）
- `docs/research/2026-06-22-key-degree-tech.md`（コード列→調1〜2候補→度数：度数変換=Tonal.js、調推定=自作KS）

> **結論サマリ（先出し・7行）**
> 1. 列挙された A〜G の全ユースケースは、**8つの共通機構**に畳める：(M1)意味/様式retrieval (M2)構造類似/コントラストretrieval (M3)機能的継続 (M4)制約付き変形（リハーモ/部分固定） (M5)ハモ付け（harmonization） (M6)歌詞→メロ生成 (M7)変奏/展開（エネルギー操作） (M8)説明/命名。**この8個を作れば全部に効く**。
> 2. **役割分担の鉄則**：**ルール/DB=合法手の決定的列挙と保証**、**embeddings(cm-search)=言葉/様式/ムードの「あいまい一致」retrieval**、**Claude=自然言語→どの操作かの翻訳＋候補からの選択＋"なぜ"の言語化**。Claudeは**候補リストの中からのみ選ぶ**（自由に音符・度数を捏造させない＝#86の精神を記号レベルで守る）。
> 3. **「アーティストっぽさ」は近似可能だが交絡が最大の敵**（FACT：作曲家同定は易80〜94%/難62〜87%だが、モデルは作風でなく時代/ジャンル/国籍を学びがち）。実装は**(度数n-gram＋カデンツ/借用頻度＋旋律音程分布＋リズム)の"指紋ベクトル"＋ムード/タグ埋め込み**を連結し、**Hooktheory等の全体分布を事前分布として差し引いて「そのアーティスト固有の逸脱」を抽出**するのが文献的最善。要データ＝**1アーティスト十数〜数十曲の度数解析**。
> 4. **「感情/ムード」は Arousal(激しさ) > Valence(明暗) で安定**（FACT：MERメタ分析 r=0.81 vs 0.67）。「もっと切なく」系の単体コード感情シフトは**ルール（テンション付加/借用/長短反転）＋小語彙ムードタグ**で十分。
> 5. **共通インフラの作る順序**：(i)度数化（自作KS=TS, key-degree研究）→(ii)機能/カデンツ解析（TS, analyze_progression移植）→(iii)進行DB＋タグ（jp-sources）→(iv)タグ/embeddings（cm-search＝既存・Python）→(v)メロ-コード当てはまり（analyze_fit=TS移植）→(vi)アーティスト指紋。**(i)〜(iii)が全機構の土台**。
> 6. **即できる（retrieval＋既存資産）**：名前付き進行retrieve、似た進行/似たメロ（melody_similarity既存）、定番代替、当てはまり判定→補正（analyze_fit/fit_to既存）。**新機構必須**：ハモ付け、歌詞→メロ、エネルギー操作、アーティスト指紋。
> 7. **最初の縦スライス**＝**「この進行に似てる／後ろだけ違うやつ」＝構造類似retrieval（M2）**。度数列距離は純整数演算＝TSで即書け、進行DBがあれば即値が出て、編集距離は既存 melody_similarity の発想がそのまま移る。Claudeは「似てる定義（前半固定？ムード維持？）」の解釈と提示だけ。

---

# 0. 現状の事実（コードで確認・既存資産の棚卸し）

`apps/worker/src/cm_worker/music/` ＋ `search.py` を読んで確定（各機構の素地になる）：

| 資産 | 実体（確認した事実） | 連想軸 | TS移植 or Python残置 |
|---|---|---|---|
| `analyze.py: analyze_fit` | メロ×コードの当てはまり。拍重み付き在和音率＋**非和声音分類（経過/刺繍/掛留/other）**＋スケール外率→score。純Python・~0.01ms。**④メロ⇔コード結合の素地**。 | ④ | **TS移植容易**（numpy不使用）。#86で「判定=単一の真実」位置づけ |
| `analyze.py: detect_key / analyze_progression` | 調推定（KS）／ローマ数字＋T/S/D。**music21依存**（撤廃対象）。`_function_of(degree)` だけ自前。 | ① | KS=自作TS化（key-degree研究）、ローマ数字=度数表引き |
| `correct.py: fit_to_chords` | analyze_fit で「other」判定の音だけ最寄りコードトーンへスナップ（決定的）。経過/刺繍/掛留は不変。**修復(M修復)の素地**。 | ④ | TS移植容易 |
| `similar.py: melody_similarity / find_similar` | **音程列の重み付き編集距離（簡易 Mongeau-Sankoff）・移調不変**。0..1。**③構造類似（メロ）の素地・そのまま使える**。 | ③ | **TS移植容易**（純整数DP） |
| `generate.py: gen_chords/melody/bass/drums` | 機能和声 T/S/D マルコフ＋ダイアトニック度数表。**非ダイアトニック不可**（routing調査で確認）。fallback基線。 | ① | TS化 or 残置（#86既存） |
| `progressions.py` | 名前付き進行DB（C基準 `(root_pc,quality)` 度数列）。`find_progression`(別名照合)/`realize_progression`。**①機能軸retrieve・名前一致レーンの素地**。 | ①③ | **TS移管（engine研究の方針）** |
| `theory.py` | `QUALITY_INTERVALS`/`chord_pcs`/`scale_pcs`/`norm_root`。依存ゼロ。全機構の算術土台。 | 共通 | TS化（単一の真実に） |
| `bass.py` | 相対ベース解決（度数→実音高）。**F：ベース操作の素地**。 | ④ | TS化 |
| `search.py`（cm-search :8788） | **Ruri v3（`cl-nagoya/ruri-v3-310m`）埋め込み常駐＋ブルートフォース cosine**。neta を遅延埋め込み・キャッシュ。**②タグ/意味軸の素地**。**既知の難点（design.md L493）＝anisotropyで無意味クエリも cosine 0.81 高止まり＝絶対閾値で足切り不能**。 | ② | **Python残置（信号処理＝embeddings）**。ドメイン境界の正しい側 |

→ **③構造類似（メロ）と④当てはまり/修復は既存コードがほぼ完成**。①機能軸は進行DB＋度数化が要る。②意味軸は cm-search があるが**閾値問題**（後述・批判）。

---

# 1. ユースケース → 仕組み マトリクス（核心）

各ユースケースに【連想軸/機構｜入力｜候補の作り方(retrieval/ルール/両方)｜Claudeの役割 vs ルール/DB/embeddings｜必要データ(今あるか/タグ要るか/アーティストコーパス要るか)｜既存資産の流用｜難所｜TS/Python】。
機構ID（§2で詳説）：M1意味/様式retrieval, M2構造類似/コントラスト, M3機能的継続, M4制約付き変形, M5ハモ付け, M6歌詞→メロ, M7変奏/展開, M8説明/命名。

## A. アーティスト/様式っぽさ（"ミスチルっぽい""椎名林檎っぽい""シティポップ風""90年代J-POP"）

| 項目 | 内容 |
|---|---|
| 機構/軸 | **M1（②意味/様式軸）＋アーティスト指紋（①③軸の特徴ベクトル化）** |
| 入力 | 自然言語の様式語（"○○っぽい"）＋frame（key/bars/section） |
| 候補の作り方 | **両方**。(a)retrieval＝そのアーティスト/様式タグの進行を進行DBから引く（embeddings＋タグ）。(b)指紋＝そのアーティストの解析済みN曲から「多用する度数n-gram・カデンツ・借用・旋律音程分布・リズム」の特徴ベクトルを作り、近い進行/動きを生成・選択 |
| Claude vs 機械 | Claude＝"○○っぽい"→様式タグ/指紋IDへの翻訳＋候補から選択＋"なぜそれっぽいか"の説明。機械＝DBフィルタ・指紋距離計算・度数列realize |
| 必要データ | **アーティスト別コーパス必須**（FACT：作曲家同定は中央値251インスタンス・各100音符で54%/1万音符で84%＝**1アーティスト十数〜数十曲の度数解析**が現実的出発点）。タグ（genre/era/artist）も要る |
| 既存流用 | progressions.py（名前付きの延長）、cm-search（様式タグ意味検索）、analyze_progression（指紋の度数/機能抽出） |
| 難所（最大） | **交絡**（FACT：モデルは作風でなく era/genre/国籍を学びがち・同時代の似た作家弁別が困難）。"っぽさ"の主観・著作権（jp-sources研究で度数列正規化＝安全側）。データ仕入れ工数 |
| TS/Python | 指紋計算・距離・retrieve＝**TS**。embeddings＝Python（cm-search） |

> §4 で深掘り。FACT根拠：[作曲家同定サーベイ](https://arxiv.org/html/2506.12440v1)、[Composer Vector（少数作品でスタイルベクトル）](https://arxiv.org/html/2604.03333v1)。

## B. 雰囲気/感情（"切ない""悲しい""元気""切羽詰まった"／単体コード感情シフト"もっと切なく/明るく"）

| 項目 | 内容 |
|---|---|
| 機構/軸 | 進行全体＝**M1（②意味/ムード軸）**。単体コードシフト＝**M4（①機能・ルール）** |
| 入力 | ムード語（＋強度）／対象コードと方向（切なく/明るく） |
| 候補の作り方 | 進行＝retrieval（moodタグ＋embeddings）。単体＝**ルール**（明→暗＝長三和音を短三和音/m7へ・テンション付加（add9/sus）・借用（♭VI,♭VII,iv）・セカンダリードミナント。"切なく"＝ maj→m7/借用、"明るく"＝ m→maj/sus解決） |
| Claude vs 機械 | Claude＝ムード語→moodタグ＋強度の翻訳・候補選択・説明。機械＝moodタグ検索／単体は決定的ルールで合法な感情シフト候補を列挙 |
| 必要データ | mood小語彙（10〜20語に固定）＋進行へのmoodタグ付け。単体シフトは**データ不要・ルールのみ** |
| 既存流用 | cm-search（mood意味検索）、theory.py（質替え/借用の算術） |
| 難所 | **ムードの主観**（FACT：AllMusic 178ムード語をRussell4象限に縮約が定番＝語彙を絞れ）。**Valence(明暗)はArousal(激しさ)より当てにくい**（FACT：MERメタ分析 r=0.67<0.81）＝"明暗"系は曖昧、"激しさ"系は安定 |
| TS/Python | 単体シフト＝**TS（ルール）**。ムード進行retrieve＝TS（タグ）＋Python（embeddings） |

> FACT根拠：[MERメタ分析](https://dl.acm.org/doi/full/10.1145/3796518)、[ムードタグLast.fm/AllMusic](https://www.researchgate.net/publication/49176999)、[Spotify valence/energy](https://music-tomorrow.com/blog/how-spotify-recommendation-system-works-complete-guide)。

## C. 進行の連想/変形（似てる／つながる／後ろだけ違う／サビへ／3つ目の代替／ベタすぎ→ひねる／リハーモ）

| ユースケース | 機構/軸 | 候補の作り方 | Claude vs 機械 | 既存流用 | TS/Python |
|---|---|---|---|---|---|
| **この進行に似てる** | **M2（③構造類似）** | retrieval＝度数列の編集距離で進行DB近傍 | Claude＝"似てる"の軸解釈（前半？ムード？） / 機械＝距離計算 | melody_similarity の発想を**コード度数列**へ | **TS** |
| **この進行につながる** | **M3（①機能的継続）** | ルール＝末尾の機能/カデンツ検出＋コーパス遷移＋ピボット | Claude＝意図解釈・選択 / 機械＝終止検出・遷移確率・候補列挙 | analyze_progression、進行DB遷移 | **TS** |
| **後ろだけ違うやつ** | **M2（等価クラス置換＋類似）** | ルール＝前半固定・後半を等価クラス/別終止で差替→近傍retrieval | Claude＝どこから変えるか / 機械＝固定区間以降の合法手列挙 | progressions.py、theory.py | **TS** |
| **サビにつながるように** | **M3（機能的継続・目標到達）** | ルール＝目標(サビ頭コード)への経路探索（半終止/偽終止で煽る→解決） | Claude＝サビの想定・選択 / 機械＝経路・カデンツ計算 | analyze_progression | **TS** |
| **3つ目のコードの代替** | **M4（①等価クラス）** | ルール＝機能代理/相対/セカンダリ/裏コード/借用/質替えを決定的列挙 | Claude＝文脈に合う1つ選択・説明 / 機械＝合法手全列挙 | theory.py（engine研究のsubstitute表） | **TS** |
| **ベタすぎ→ひねる（意外性）** | **M4（変形・低頻度側へ）** | ルール＝等価クラス＋**遷移確率の低い（意外な）候補**を優先提示 | Claude＝意外性の度合い選択 / 機械＝低確率代替を列挙 | 遷移確率（コーパス由来）、theory.py | **TS** |
| **メロ固定でおしゃれコードに（リハーモ）** | **M4（制約付き変形＝analyze_fitの逆制約）** | ルール＝メロのコードトーン適合を満たす範囲でトライトーンサブ/ii-V挿入/借用を列挙→analyze_fitで検証 | Claude＝"おしゃれ"度合い選択 / 機械＝合法リハーモ列挙＋当てはまり保証 | **analyze_fit（逆制約に使う）**、theory.py | **TS**（判定=fit はTS移植 or Python） |

> FACT根拠：[Hooktheory Trends＝Markov遷移確率](https://www.hooktheory.com/blog/trends-tool/)（IV→I が32%等）、[VOMM次コード予測 0.277 vs Markov 0.140](https://arxiv.org/pdf/2410.17989)、リハーモのトライトーンサブ/ii-V/借用＝[決定論的規則化の特許例](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11978426)、[Pachet制約付きMarkov(Flow Composer)](https://www.francoispachet.fr/wp-content/uploads/2021/01/pachet-14a.pdf)。

## D. メロ⇔コード（合う進行→直す／メロ修復／ハモ付け／歌詞→メロ／継続生成）

| ユースケース | 機構/軸 | 候補の作り方 | Claude vs 機械 | 既存流用 | 難所 | TS/Python |
|---|---|---|---|---|---|---|
| **メロに合う進行を引いてよしなに** | **M5ハモ付け＋M4** | retrieval（似たメロの実進行）＋ルール（各セグメントのコードトーン適合）→当てはまり補正 | Claude＝候補選択 / 機械＝適合スコア・retrieve・補正 | analyze_fit、melody_similarity、fit_to | 適合と自然さの両立 | **TS** |
| **メロが変→直して** | **M修復（④）** | ルール＝analyze_fitで「other」検出→fit_toでスナップ or 再retrieval | Claude＝直す/活かすの判断 / 機械＝検出・補正 | **analyze_fit＋fit_to（ほぼ完成）** | 「変」の線引き | **TS** |
| **メロだけある→合うコード数案（ハモ付け）** | **M5（④メロ⇔コード結合）** | **両方**＝(a)コードトーン適合スコア×(b)コーパス遷移プライア×(c)似たメロの実進行retrieval | Claude＝数案から選択・"なぜ" / 機械＝適合・遷移・retrieve | analyze_fit（適合）、進行DB（遷移/retrieve） | 機能整合と適合の同時最適 | **TS** |
| **歌詞からメロ数パターン** | **M6（歌詞→メロ）** | ルール＝モーラ数→音符数(1:1)＋アクセント核→輪郭制約＋コードトーン拘束で候補列挙 | Claude＝歌詞のニュアンス・選択 / 機械＝譜割り・輪郭・候補 | bass/gen_melody（コードトーン拘束）、**pyopenjtalk（モーラ/アクセント=Python）** | アクセントと旋律の両立 | メロ生成=**TS**／**モーラ抽出=Python** |
| **進行の先が無い→次をいい感じに（継続）** | **M3（機能的継続）＋M5** | ルール＝末尾機能＋遷移確率で次コード、メロがあればanalyze_fitで整合 | Claude＝意図・選択 / 機械＝遷移・整合 | analyze_progression、進行DB | 長期構造 | **TS** |

> FACT根拠：[MySong/Songsmith＝~300リードシートのHMM＋小節コードトーン適合のブレンド](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/mysongchi2008.pdf)（**小データ＋HMM＋適合ブレンドで音楽家同等評価**＝個人ツールの実証点）、[1モーラ=1音が日本語歌唱の基本](https://vocaloid.fandom.com/wiki/Japanese_Phonetics)、[非DLは音節数→音符数を先に確定](https://dl.acm.org/doi/fullHtml/10.1145/3424116)、[Orpheus＝韻律制約下の最適経路（DP）で旋律生成](https://link.springer.com/chapter/10.1007/978-3-642-04052-8_47)、[ReLyMe＝tone/rhythm/structureを制約として後付け](https://arxiv.org/abs/2207.05688)、[pyopenjtalkでモーラ/アクセント抽出](https://github.com/r9y9/pyopenjtalk)、[harmonizationはHMM/Viterbi or ルール+制約](https://homepages.inf.ed.ac.uk/ckiw/postscript/harmony3a.pdf)。

## E. アレンジ/展開（ビルドアップ／落ちサビ／variation／コントラストB／部分固定継続）

| ユースケース | 機構/軸 | 候補の作り方 | Claude vs 機械 | 既存流用 | TS/Python |
|---|---|---|---|---|---|
| **サビ最後に上って締め（ビルドアップ）** | **M7（エネルギー操作）** | ルール＝エネルギーカーブ単調増（音域↑/密度↑/緊張↑/dynamics↑）＋上行進行/カデンツ | Claude＝締め方選択 / 機械＝カーブ操作 | gen_*（密度/音域操作） | **TS** |
| **落ちサビ/静かに（ダイナミクス↓）** | **M7（エネルギー局所急落）** | ルール＝サビ位置で density/register/dynamics を急落→再上昇 | Claude＝どこで落とすか / 機械＝局所カーブ | gen_* | **TS** |
| **セクション複製＋末尾だけ展開変える（variation）** | **M7（コピー＆語尾変奏）** | ルール＝大半保持・末尾n音/末尾コードを cadence 差替（半終止→完全終止等） | Claude＝どう展開させるか / 機械＝語尾変換 | progressions、analyze_progression | **TS** |
| **Aと対照的なB（コントラスト検索）** | **M2の逆（非類似retrieval）** | retrieval＝類似度を**最小化**する候補（輪郭/リズム/密度ベクトル距離・最大化） | Claude＝対照の軸選択 / 機械＝dissimilarity計算 | melody_similarity（逆向き） | **TS** |
| **頭2小節固定で残り作り直し（部分固定継続）** | **M4（部分固定）＋M3** | ルール＝固定区間以降のみ等価クラス/継続で再生成→当てはまり保証 | Claude＝固定範囲解釈 / 機械＝固定制約付き生成 | analyze_fit、gen_* | **TS** |

> FACT根拠：[緊張=構造/リズム/和声/ラウドネスの操作](https://www.edmprod.com/tension/)、[harmonic density は連続体・register/density増で緊張上昇](https://www.beyondmusictheory.org/how-to-create-tension-in-music/)、[musical tension curves 研究](https://yonsei.elsevierpure.com/en/publications/musical-tension-curves-and-its-applications/)、[落ちサビ≒drop/quiet chorus（パターン中断→復帰）](https://www.musicradar.com/tuition/tech/how-to-write-a-hit-structure)、[モチーフ変換技法（augmentation/inversion/fragmentation等）](https://fiveable.me/ap-music-theory/unit-6/motive-motivic-transformation/study-guide/z0DJQvgjoByphnhSnztH)。注：「落ちサビ」和語の厳密定義・対比セクション自動探索は出典が機能的記述/INFER止まり。

## F. 別要素（合うリズム/ドラム／歩くベース・ルート弾き）

| ユースケース | 機構/軸 | 候補の作り方 | Claude vs 機械 | 既存流用 | TS/Python |
|---|---|---|---|---|---|
| **進行に合うリズム/ドラム** | **M1（②ジャンル/ムードタグ）＋ルール** | retrieval（ジャンルタグのリズムパターン）＋ルール（拍子/テンポ整合） | Claude＝ノリ選択 / 機械＝パターン検索・整合 | gen_drums、cm-search（rhythm検索） | **TS**＋Python(embeddings) |
| **歩くベース/ルート弾き** | **M4/F（①機能・ルール）** | ルール＝進行の度数→ウォーキング（経過音/コードトーン）or ルート弾き | Claude＝スタイル選択 / 機械＝決定的生成 | **bass.py（相対ベース解決＝素地）**、gen_bass | **TS** |

## G. メタ（道具が教える/育てる）（なぜ切ない/進行の名前／重複検出／譜割り適合）

| ユースケース | 機構/軸 | 候補の作り方 | Claude vs 機械 | 既存流用 | TS/Python |
|---|---|---|---|---|---|
| **なぜ切ない？/この進行の名前は？（説明・命名）** | **M8（説明/命名）** | ルール＝機能ラベル＋名前付き進行マッチ＋moodタグ抽出→Claudeが"なぜ"を語る | **Claude＝説明の主役**（機械所見を読む） / 機械＝機能解析・名前照合・タグ | analyze_progression、find_progression、cm-search | **TS**（解析）＋Claude |
| **前の曲とかぶってない？（自分コーパス重複検出）** | **M2（③構造類似・自コーパス）** | retrieval＝melody_similarity/進行距離で自分の過去ネタと近傍 | Claude＝かぶりの許容判断 / 機械＝距離・閾値 | **melody_similarity/find_similar（ほぼ完成）** | **TS** |
| **歌詞モーラ数とメロ音数合ってる？（譜割り適合）** | **M6/G（譜割り検査）** | ルール＝モーラ数 vs 音符数の照合（1:1基準）＋ズレ箇所指摘 | Claude＝直し方提案 / 機械＝モーラ抽出・カウント照合 | **pyopenjtalk（モーラ=Python）**、メロ音数=TS | 照合=**TS**／モーラ=**Python** |

---

# 2. メカニズムの分類学（横串・8機構）

個別ユースケースの裏にある共通機構。各々が4軸のどれを使い、Claude/ルール/DB/embeddings のどう分担かを明記。

## M1. 意味/様式 retrieval（②タグ＋embeddings：mood・artist・genre）
- **使う軸**：②（意味）。**入力**＝自然言語。**出力**＝タグ一致＋embedding近傍の進行/リズム。
- **分担**：Claude＝NL→閉じたタグ語彙へ写像（FACT：RAG研究も「retrieval-LLMがタグ抽出」型）。embeddings(cm-search)＝あいまい一致。DB＝タグフィルタ。**選択はClaude**。
- **アーティストっぽさの位置づけ**：M1だけでは弱い（タグ "○○っぽい" は主観・データ薄）。**§4の指紋ベクトルで補強**して初めて実用。
- FACT：[RAG×LLM記号音楽＝mode/meter/typeタグ検索＋LLM選択](https://arxiv.org/html/2311.10384v2)、[chord/genre統計はジャンルで異なる(Hooktheory Trends)](https://www.hooktheory.com/blog/trends-tool/)。

## M2. 構造類似 retrieval ／ コントラスト（非類似）retrieval（③）
- **使う軸**：③（構造距離）。進行＝度数列の編集距離、メロ＝音程列の移調不変編集距離（**既存 melody_similarity がこれ**）。
- **多粒度**：進行まるごと/2小節セル/コード遷移/(メロ動機,コード)ペアの各レベルで距離を測れる。
- **分担**：**ほぼ全部ルール/機械（決定的距離）**。Claude＝「似てる/対照の軸」の解釈と提示のみ。embeddings不要（純整数演算）。
- **コントラスト**＝距離を最大化（A vs B、重複回避の逆）。**部分固定**＝前半を距離0固定し後半のみ近傍/遠方探索。
- FACT：既存 similar.py（簡易 Mongeau-Sankoff）。[モチーフ変換の計算モデル](https://arxiv.org/pdf/2603.26478)。

## M3. 機能的継続（①機能＋コーパス遷移＋終止モデル）
- **使う軸**：①（T/S/D機能・度数=共通座標）。**つながる/次作る/サビへ/ビルドアップ**を統一的に扱う。
- **3要素**：(a)末尾の機能/カデンツ検出（analyze_progression）、(b)コーパス由来の遷移確率（Markov/VOMM）、(c)目標到達なら経路探索（半終止/偽終止で煽る→解決）。
- **分担**：機械＝終止検出・遷移確率・経路計算・候補列挙。Claude＝「締める/続ける/盛り上げる」意図解釈と選択。
- FACT：[Hooktheory Trends＝Markov遷移確率](https://www.hooktheory.com/blog/trends-tool/)、[VOMM>Markov](https://arxiv.org/pdf/2410.17989)、終止＝engine研究§1.3（authentic/half/deceptive/plagal）。INFER：サビ誘導はセクション別Markov＋カデンツ制約の経路探索（Orpheusと同型のDP）。

## M4. 制約付き変形（リハーモ／部分固定／後ろだけ変える＝等価クラス置換）
- **使う軸**：①（等価クラス）＋④（メロ固定時の適合制約）。
- **リハーモ**＝メロのコードトーン適合（analyze_fit）を満たす範囲でトライトーンサブ/ii-V挿入/借用を列挙＝**analyze_fitの逆制約**。**部分固定/後ろだけ**＝固定区間を制約に残りを等価クラス置換。
- **分担**：機械＝合法手の決定的列挙＋当てはまり保証。Claude＝"おしゃれ/意外性"の度合い選択。**Claudeは列挙された候補からのみ選ぶ**。
- FACT：[トライトーンサブ/ii-V/借用の決定論的規則化(特許)](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11978426)、[Pachet制約付きMarkov](https://www.francoispachet.fr/wp-content/uploads/2021/01/pachet-01-Musical_Harmonization_with_Constraints.pdf)。

## M5. ハモ付け（harmonization：メロ→コード候補）
- **使う軸**：④（メロ⇔コード結合・機能で橋渡し）。
- **3層（FACT：MySongがこの型）**：(a)コードトーン適合スコア（=各セグメントのメロ音を支えるコード×非和声音ペナルティ＝**analyze_fit**）、(b)コーパス由来の遷移プライア（進行DBのbigram）、(c)似たメロの実進行retrieval（M2）。**学習モデル不要**でこの3層が実証点。
- **分担**：機械＝適合・遷移・retrieve・数案生成。Claude＝数案から選択・"なぜ"。
- FACT：[MySong＝~300リードシートHMM＋小節コードトーン適合のブレンドで音楽家同等評価](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/mysongchi2008.pdf)、[harmonization=HMM/Viterbi or ルール+制約](https://homepages.inf.ed.ac.uk/ckiw/postscript/harmony3a.pdf)。

## M6. 歌詞→メロ生成（モーラ/アクセント→リズム/フレーズ→コードトーン拘束）
- **使う軸**：④（コードトーン拘束）＋言語（モーラ/アクセント）。
- **手順**：pyopenjtalkでモーラ列＋アクセント核抽出（**Python**）→モーラ数=音符数(1:1)で譜割り→アクセント核位置で旋律輪郭制約（核手前まで上げ核直後で下げる）→コードトーン拘束で音高候補→数パターン列挙。
- **分担**：モーラ/アクセント抽出＝Python（信号/言語）。譜割り・輪郭・候補生成＝**TS（ドメイン）**。Claude＝歌詞ニュアンス・選択。
- FACT：[1モーラ=1音(日本語)](https://vocaloid.fandom.com/wiki/Japanese_Phonetics)、[非DLは音節数→音符数先決](https://dl.acm.org/doi/fullHtml/10.1145/3424116)、[Orpheus(DP最適経路)](https://link.springer.com/chapter/10.1007/978-3-642-04052-8_47)、[ReLyMe(tone/rhythm/structure制約)](https://arxiv.org/abs/2207.05688)、[pyopenjtalk](https://github.com/r9y9/pyopenjtalk)。

## M7. 変奏/展開（コピー＋末尾変形・エネルギー操作・落ちサビ）
- **使う軸**：構造（コピー）＋エネルギー（音域/密度/和声緊張/dynamics）。
- **エネルギーのパラメータ化（FACT）**：register（音域）/density（音符密度）/harmonic density（声部数・連続体）/harmonic tension（不協和度）/dynamics の合成カーブ。**ビルドアップ=単調増、落ちサビ=局所急落→再上昇**。
- **変奏**＝大半保持・末尾の cadence/フレーズ差替（モチーフ変換：augmentation/diminution/inversion/fragmentation）。
- **分担**：機械＝カーブ操作・語尾変換。Claude＝展開意図・選択。
- FACT：[緊張操作](https://www.edmprod.com/tension/)、[harmonic density連続体](https://www.beyondmusictheory.org/how-to-create-tension-in-music/)、[tension curves](https://yonsei.elsevierpure.com/en/publications/musical-tension-curves-and-its-applications/)、[モチーフ変換](https://fiveable.me/ap-music-theory/unit-6/motive-motivic-transformation/study-guide/z0DJQvgjoByphnhSnztH)。

## M8. 説明/命名（解析→機能ラベル＋名前付き進行マッチ＋感情タグ→Claudeが"なぜ"）
- **使う軸**：①（機能解析）＋②（ムードタグ）。
- **手順**：analyze_progression（ローマ数字/機能）＋find_progression（名前照合）＋moodタグ抽出→Claudeが言語化。
- **分担**：機械＝解析・照合・タグ（**根拠を提供**）。**Claude＝説明の主役**（機械所見を読んで"なぜ切ないか"を語る）。
- INFER：唯一Claudeが前面に出る機構。他は「機械が候補、Claudeが選択」だがM8は「機械が事実、Claudeが物語」。

### 機構×軸×分担 早見表
| 機構 | 主軸 | retrieval | ルール/DB | embeddings | Claude |
|---|---|---|---|---|---|
| M1 意味/様式 | ② | ◎ | タグフィルタ | ◎(cm-search) | NL→タグ・選択 |
| M2 構造類似/コントラスト | ③ | ◎ | 距離計算 | ✕ | 軸解釈 |
| M3 機能的継続 | ① | △(遷移) | ◎ | ✕ | 意図・選択 |
| M4 制約付き変形 | ①④ | △ | ◎(等価クラス) | ✕ | 度合い選択 |
| M5 ハモ付け | ④ | ○(似たメロ) | ◎(適合+遷移) | △ | 数案選択 |
| M6 歌詞→メロ | ④+言語 | △ | ◎(譜割り) | ✕(Python=モーラ) | ニュアンス |
| M7 変奏/展開 | 構造+エネルギー | ✕ | ◎(カーブ) | ✕ | 展開意図 |
| M8 説明/命名 | ①② | ○(名前) | ◎(解析) | ○(mood) | **主役** |

---

# 3. 共通インフラ要件（全機構を支える土台）

| # | インフラ | 何か | 今あるか | 作る順序 | TS/Python |
|---|---|---|---|---|---|
| (i) | **度数化** | コード列→調1〜2候補→C基準度数（自作KS） | △（detect_keyはmusic21・コード列版は未） | **1番**（全機構の共通座標） | **TS**（key-degree研究） |
| (ii) | **機能/カデンツ解析** | 度数→ローマ数字/T-S-D/終止タイプ | △（analyze_progression=music21） | **2番** | **TS**（表引き、`_function_of`流用） |
| (iii) | **進行DB＋タグ** | 度数列＋mood/genre/artist/cadence/section/provenance | △（progressions.py 6件のみ） | **3番**（jp-sources研究で仕入れ・20〜40件→成長） | **TS**（DB）＋仕入れ |
| (iv) | **タグ/embeddings** | 意味/様式/ムードのあいまい一致 | ○（cm-search :8788 Ruri v3 既存） | 4番（既存に乗る） | **Python**（信号処理側＝境界の正しい側） |
| (v) | **メロ-コード当てはまり** | analyze_fit（適合・非和声音・修復fit_to） | ◎（既存・ほぼ完成） | 5番（M5/M4/修復の前提） | **TS移植**（or Python残置） |
| (vi) | **アーティスト指紋** | N曲解析→度数n-gram/カデンツ/借用/旋律音程/リズムの特徴ベクトル | ✕（コーパス＋抽出器が要る） | **最後**（最難・最欲） | **TS**（抽出・距離）＋データ仕入れ |

**タグ付けの方式（誰が）**：(a)curated（手・一次・主観だが説明可）／(b)Claude写像（NL→閉じた語彙へ正規化＝**推奨の主役**）／(c)自動（cadence/機能は度数から決定的に導出可＝タグ要らず）。**mood/artist/genre＝Claude写像、cadence/function/non-diatonic＝自動導出、最終確認＝curated**。

**コーパスの粒度（jp-sources研究と接続）**：M1/M8＝進行まるごと＋mood/genreタグ。M2＝度数列（距離用）。M3＝コード遷移bigram（確率用）。M5＝(メロ,進行)ペア（似たメロretrieval用）。§4指紋＝アーティスト別N曲の度数解析。→ **同じ仕入れデータを多粒度で索引する**（重複仕入れ不要）。

---

# 4. 「アーティストっぽさ／感情」の表現可否（最難・最欲を深掘り）

## 4.1 アーティストっぽさは度数/カデンツ/借用/リズム/旋律音程分布で近似できるか？

**結論（FACT＋INFER）：粗い近似は可能。ただし"同時代の似た作家の弁別"は困難で、交絡分離が成否を分ける。**

- **FACT（近似可能の根拠）**：記号特徴（音程n-gram・和音n-gram・リズム）＋SVM/kNNで作曲家同定は**易80〜94%／難62〜87%**。寄与上位は**音程とテクスチャ**。[作曲家同定サーベイ](https://arxiv.org/html/2506.12440v1)。古典的にも各100音符で54%・1万音符で84%（[n-gram作曲家分類](https://www.scielo.org.mx/scielo.php?script=sci_arttext_plus&pid=S1405-55462024000100085)）。→ **度数/カデンツ/借用/旋律音程ヒストグラム/リズムを連結した手作り"指紋ベクトル"は文献的に妥当な第一近似**。
- **FACT（少データで動く）**：作曲家同定実験の中央値は**4作曲家・251インスタンス**、85%が1000曲未満。[Composer Vector](https://arxiv.org/html/2604.03333v1) は「作品数が少ない前提」で作風ベクトル（transformer隠れ状態の作曲家平均）を抽出。→ **INFER：1アーティスト十数〜数十曲の度数解析が現実的出発点**。
- **FACT（マルチモーダルが効く）**：音声＋歌詞の late fusion は単一モーダルを上回る（最高94.58%）。[マルチモーダルMER](https://arxiv.org/html/2504.18799v1)。→ **指紋ベクトル（記号）＋ムード/タグ/歌詞 embedding（cm-search）の併用が筋**。
- **限界（FACT・最重要）**：
  1. **交絡**：モデルは作風でなく**era/genre/国籍**を学びがち。同時代の似たアーティスト弁別が困難。[サーベイ](https://arxiv.org/html/2506.12440v1)。→ **INFER緩和：Hooktheory等の全体/ジャンル分布を事前分布として差し引き、「そのアーティスト固有の逸脱」を抽出**（交絡分離の実務的近道）。
  2. **高次n-gramのスパース性**で汎化が落ちる（低次に留める）。
  3. **評価の甘さで過大評価**（88実験中信頼できるのは27のみ。accではなくBalanced Accuracy）。→ silentに「できる」と言わない。
- **chord2vec の落とし穴（FACT）**：素朴chord2vecは**異名同音/機能差を潰す**（Eb:dim=C:dimを同一視）。[chord2vec](https://github.com/Sephora-M/chord2vec)。→ **度数・機能を保つ表現（ローマ数字度数、pitchclass2vec）を使う**＝当アプリのC基準度数列と整合（むしろ有利）。

## 4.2 感情/ムードの表現可否
- **FACT**：感情は**Valence×Arousal**が主流。**ArousalはValenceより当てやすい**（メタ分析 r=0.81 vs 0.67）。[MERメタ分析](https://dl.acm.org/doi/full/10.1145/3796518)。→ **"激しい/疾走/切羽詰まった"（Arousal系）は安定、"明るい/切ない"（Valence系）は曖昧**＝後者はタグ語彙を絞り強度を粗くする。
- **FACT**：ムードタグは AllMusic 178語をRussell4象限に縮約が定番。[ムードタグ](https://www.researchgate.net/publication/49176999)。→ mood語彙は10〜20語に固定（engine研究と一致）。
- **単体コードの感情シフト**は embeddings不要・**ルールで決定的**（長短反転/テンション付加/借用）。Valenceの曖昧さに依存しない＝堅い。

## 4.3 実装プラン（指紋）
- **指紋ベクトル**＝ [ローマ数字度数のn-gram頻度（1〜2gram）｜カデンツ頻度（authentic/half/deceptive/plagal）｜借用/セカンダリ頻度｜旋律音程分布｜リズムパターン頻度] を連結。analyze_progression（機能/度数）＋melody_similarityの音程列がそのまま材料。
- **アーティスト類似**＝指紋ベクトルのcos距離。**背景分布（全体/ジャンル）を引いて逸脱を強調**。
- **生成/選択**＝そのアーティストが多用する度数遷移を遷移確率の重みに反映（M3）＋mood/genreタグでretrieve（M1）。
- **データ**＝jp-sources研究の仕入れをアーティスト別に索引（度数列正規化＝著作権安全側）。

---

# 5. 何が今すぐできて／何にデータor新機構が要るか（severity/段階）

| ユースケース群 | 状態 | 根拠 |
|---|---|---|
| **似た進行/似たメロ/重複検出（M2）** | **即（既存）** | melody_similarity/find_similar 完成。進行版は度数列に編集距離を移すだけ（TS純整数） |
| **当てはまり判定→修復（M修復・C/D）** | **即（既存）** | analyze_fit＋fit_to ほぼ完成 |
| **名前付き進行retrieve（M1名前レーン）** | **即（既存拡張）** | find_progression あり。DBを20〜40件に増やせば実用（jp-sources段階1） |
| **定番代替/リハーモ（M4）** | **小（ルール表）** | 等価クラス表をTSで書く（engine研究§3.2のsubstitute）。データ不要 |
| **機能的継続/サビ誘導（M3）** | **中（DB＋遷移）** | 進行DB＋コーパス遷移確率が要る（jp-sources段階2のSongle等） |
| **ムード/様式retrieve（M1意味レーン）** | **中（タグ＋閾値問題）** | cm-searchあるが**anisotropy閾値問題（design.md L493＝無意味でも0.81）**＝足切り設計が要る |
| **ハモ付け（M5）** | **中（新機構・既存素地）** | analyze_fit＋進行DB＋retrieveの3層を組む（MySong型・学習不要） |
| **歌詞→メロ（M6）** | **中〜大（新機構）** | pyopenjtalk連携（Python）＋譜割り/輪郭ロジック（TS）新規 |
| **エネルギー操作/落ちサビ（M7）** | **中〜大（新機構）** | エネルギーカーブのパラメータ化が新規。落ちサビ和語定義は出典薄 |
| **アーティストっぽさ（A・指紋）** | **大（データ＋新機構）** | アーティスト別コーパス（十数〜数十曲）＋指紋抽出器＋交絡分離。最難 |

**silent禁止**：M3/M5/M6/M7/指紋は「retrievalだけでは出ない・新機構かデータが要る」。M1意味レーンは閾値問題を解かないと「無関係20件」を返す（既知）。

---

# 6. 段階計画（S1.. 最小で価値が出る縦スライス順）

| 段階 | 機構 | 内容 | retrieval+既存で即か |
|---|---|---|---|
| **S1** | **M2** | **「この進行に似てる／後ろだけ違うやつ／重複検出」**＝度数列の編集距離retrieval。進行DB（S0=jp-sources段階1で20〜40件）＋melody_similarityの発想をコード度数列へ。**最初の縦スライス**（§7） | **即** |
| S2 | M4 | 定番代替/リハーモ（等価クラス表・analyze_fit逆制約）。データ不要・ルールのみ | 即（ルール） |
| S3 | M1名前+意味 | 名前付きretrieve拡張＋mood/genreタグ検索。**閾値問題の設計込み**（gap/該当なし） | 中 |
| S4 | M修復+M5 | 当てはまり修復（既存）→ハモ付け3層（適合×遷移×似たメロ） | 中 |
| S5 | M3 | 機能的継続/サビ誘導（コーパス遷移＋カデンツ経路） | 中 |
| S6 | M6/M7 | 歌詞→メロ（pyopenjtalk連携）／エネルギー操作 | 大 |
| S7 | A指紋 | アーティスト別コーパス＋指紋ベクトル＋交絡分離 | 大 |

**土台の前提**：S1の前に共通インフラ(i)度数化(ii)機能解析(iii)進行DBが要る（§3）。(iv)cm-searchは既存、(v)analyze_fitは既存。

---

# 7. 最初の縦スライス（1つ）

**「この進行に似てる／後ろだけ違うやつ／前の曲とかぶってない？」＝構造類似 retrieval（M2）。**

理由：
- **③構造類似軸**は **embeddings不要・純整数演算**＝**TSドメインの正しい側**で完結（Python越境ゼロ）。
- **既存 melody_similarity（簡易 Mongeau-Sankoff・移調不変）の発想がそのままコード度数列に移る**＝実装リスク最小。
- 進行DB（jp-sources段階1で20〜40件）があれば**即・実値**が出る。閾値問題（M1意味）もアーティストデータ（指紋）も要らない。
- Claudeの仕事は薄い＝「似てるの定義（前半固定？ムード維持？対照？）」の解釈と候補提示のみ＝**#86「Claudeは候補から選ぶ」を最小で実証**。
- 縦スライス（UI＝似た進行リスト表示＋API＝距離retrieve＋ドメイン＝度数列編集距離）が薄く揃う。

**TDD赤の起点**：度数列の編集距離関数（移調不変＝度数なので元から不変・C基準）＋「丸サに似た進行top3」「カノンと小室の距離>カノンとカノン亜種の距離」を固定ケースに。melody_similarity のDPを度数列（(root_pc,quality)）版へ。

---

# 8. 批判レビュー（adversarial・severity付き）

| # | 論点 | severity | 内容・リスク | 緩和 |
|---|---|---|---|---|
| 1 | **cm-search の閾値問題** | **高** | FACT(design.md L493)：Ruri v3 cosine が無意味クエリでも0.81高止まり（anisotropy）＝**絶対閾値で足切り不能・常に無関係20件・「該当なし」が出ない**。M1意味retrievalの生命線が既に折れている | gap/相対順位/タグ前置フィルタで足切り。embeddingは「タグ候補の補助」に格下げ、**一次はClaude NL→閉じたタグ語彙**（exact）。Stage3 reranker は今は入れない（design方針） |
| 2 | **アーティスト指紋の交絡** | **高** | FACT：作風でなくera/genre/国籍を学ぶ。同時代の似た作家を弁別できない。"っぽさ"が薄まる | 背景分布を差し引く（逸脱抽出）。低次n-gramに留める。Balanced Accuracyで評価。**「っぽい」は確定でなく"寄せ"と明示**（過大広告しない） |
| 3 | **タグの主観性** | 高 | mood/artistタグは人/Claude/抽出で品質が割れる。retrieve精度の生命線 | 閉じた小語彙（10〜20）＋定義文。cadence/機能は**自動導出（主観ゼロ）**に寄せる |
| 4 | **Claude選択の一貫性** | 高 | 同入力で違う選択・候補無視・捏造（#86が避けた「理論を外す」が記号レベルで再来） | **候補リストからのみ選ばせる**（MCPで合法手だけ提示）。選択も analyze_progression/analyze_fit を通す。決定性が要る所はルールが既定値 |
| 5 | **データ不足（DB小）** | 高 | M2/M3/M5/指紋は進行DBが薄いと凡庸 or 捏造。retrieveが「ミス」を返せないと嘘をつく | jp-sources段階で20〜40件→成長。retrieveは**ヒット/ニアミス/ミスを返し**ミス時は明示fallback（捏造禁止） |
| 6 | **harmonization/継続の自然さ評価** | 中 | 適合スコアが高くても音楽的に平凡/不自然。FACT：純制約ベースは「正しいが平凡」 | コーパス遷移プライアを掛ける（MySong型）。最終ゲートは試聴1回に圧縮（先行研究の方針） |
| 7 | **歌詞→メロのアクセント整合** | 中 | モーラ数=音符数は単純だがアクセントと旋律輪郭の両立は難。melisma例外 | Orpheus/ReLyMe型＝制約は**後付けスコアリング**（ハード生成しない）。候補を出してanalyze_fit/輪郭でフィルタ |
| 8 | **落ちサビ/エネルギーの定義不在** | 中 | FACT不足：「落ちサビ」和語の厳密定義・対比セクション自動探索は出典が機能記述/INFER止まり | エネルギーを合成カーブ(register/density/tension/dynamics)で操作的に定義。落ちサビ=局所急落と割り切る。評価で詰める |
| 9 | **Python越境の誘惑** | 中 | ドメイン（度数/距離/変形）をうっかりPythonに書くと境界が崩れる | **境界の線=記号操作はTS/信号処理はPython**を全機構で機械的に適用（§1のTS/Python列）。embeddings/モーラ/音声のみPython |
| 10 | **多粒度の管理コスト** | 低 | 進行まるごと/セル/遷移/(メロ,コード)ペアの4粒度を別々に索引する複雑さ | **同一仕入れデータを多粒度索引**（重複仕入れ不要・§3）。粒度は機構が要求する分だけ作る |

---

## 参考URL（一次資料・引用）

ハモ付け/リハーモ/継続:
- harmonization HMM/Viterbi（Allan&Williams） https://homepages.inf.ed.ac.uk/ckiw/postscript/harmony3a.pdf ／ サーベイ https://arxiv.org/pdf/2109.07623
- 制約ベース harmonization（Pachet&Roy survey） https://www.francoispachet.fr/wp-content/uploads/2021/01/pachet-01-Musical_Harmonization_with_Constraints.pdf ／ Flow Composer/Markov制約 https://www.francoispachet.fr/wp-content/uploads/2021/01/pachet-14a.pdf
- MySong/Songsmith（CHI2008・小データHMM＋適合ブレンド） https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/mysongchi2008.pdf ／ 特許 https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7705231
- リハーモ決定論的規則化（特許） https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11978426 ／ 入門 https://learnmusictheory.net/pdfs/pdffiles/04-09-introductiontoreharmonization.pdf
- 次コード予測（VOMM>Markov） https://arxiv.org/pdf/2410.17989 ／ n-gram vs RNN https://arxiv.org/pdf/1804.01849 ／ Hooktheory Trends https://www.hooktheory.com/blog/trends-tool/ ・ https://www.hooktheory.com/api/trends/docs

アーティストっぽさ/感情:
- 作曲家同定サーベイ https://arxiv.org/html/2506.12440v1 ／ Composer Vector https://arxiv.org/html/2604.03333v1 ／ n-gram分類 https://www.scielo.org.mx/scielo.php?script=sci_arttext_plus&pid=S1405-55462024000100085
- chord2vec https://github.com/Sephora-M/chord2vec ／ pitchclass2vec https://arxiv.org/pdf/2303.15306
- MERメタ分析 https://dl.acm.org/doi/full/10.1145/3796518 ／ マルチモーダルMER https://arxiv.org/html/2504.18799v1 ／ ムードタグ https://www.researchgate.net/publication/49176999 ／ Spotify推薦 https://music-tomorrow.com/blog/how-spotify-recommendation-system-works-complete-guide ／ スタイル転送CycleGAN https://www.researchgate.net/publication/329743586

歌詞→メロ/エネルギー/変奏:
- 1モーラ=1音 https://vocaloid.fandom.com/wiki/Japanese_Phonetics ／ 音節数→音符数 https://dl.acm.org/doi/fullHtml/10.1145/3424116 ／ Orpheus https://link.springer.com/chapter/10.1007/978-3-642-04052-8_47 ／ ReLyMe https://arxiv.org/abs/2207.05688 ・ https://microsoft.github.io/muzic/relyme/ ／ pyopenjtalk https://github.com/r9y9/pyopenjtalk ／ 日本語ピッチアクセント https://en.wikipedia.org/wiki/Japanese_pitch_accent
- 緊張操作 https://www.edmprod.com/tension/ ／ harmonic density https://www.beyondmusictheory.org/how-to-create-tension-in-music/ ／ tension curves https://yonsei.elsevierpure.com/en/publications/musical-tension-curves-and-its-applications/ ／ 曲構造/drop chorus https://www.musicradar.com/tuition/tech/how-to-write-a-hit-structure ／ モチーフ変換 https://fiveable.me/ap-music-theory/unit-6/motive-motivic-transformation/study-guide/z0DJQvgjoByphnhSnztH ／ モチーフ変換計算モデル https://arxiv.org/pdf/2603.26478

RAG/既存基盤:
- RAG×LLM記号音楽 https://arxiv.org/html/2311.10384v2
