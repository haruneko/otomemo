# phrase_maker 取り込みの移行計画（作り直し版・上流から整合させたマスタープラン）— v3（最終版・三面レビュー R1/R2 反映）

作成 2026-09-09・**v3＝最終版。R1・R2（面A 上位整合／面B 源流忠実性／面C 実装可能性・3面とも「実装へ進んでよい」）を反映**（改訂履歴＝§10・着手手順＝§11）。土台＝引き継ぎ書 `2026-08-21-phrasemaker-arc-handoff.md`（現況）・既存計画 `2026-08-19-phrasemaker-port-implementation-plan.md`（**本書が見直す対象**）・M0契約・io-map・案C・カスケード設計・ベース棚卸し `research/2026-09-04-phrasemaker-bass-inventory.md`。
本書の性格＝**計画（案）**。裁定が出たら要点を design/requirements へ昇格し本文は archive へ（CLAUDE.md の置き場規約）。査読前提なので主張には行番号を付けています（`ファイル:行`）。**実装は一切していません**。

読み方：§0 だけで判断の全体が掴めるようにしました。§1→§2→§3 が上流（コンセプト→アーキ→要件/設計）、§4 が向こうの全体棚卸し（世代の札つき）、§5 以降が段取り、§8 が裁定、§10 が R1/R2 の改訂履歴（受け入れ／却下／保留）、§11 が実装者の着手手順です。

---

## §0 要約（最初に読む30行）

1. **何を**：phrase_maker（Python 試作・開発停止・リポは残す）の**音楽知識**を otomemo へ移す。コードの翻訳ではなく、ルール・物理・調整値・検証器を運ぶ（既存方針どおり）。
2. **今どこ**：M0（契約）・M1（最簡ドラム）・M2（ドラム本実装＝型辞書10型＋身体シミュレータ bodyFill）は完了、M3（ベース）は合図応答まで済み・本体（錨と間の分業）はこれから。
3. **既存計画の何が問題か**：2026-08-19 起草の M0〜M5 は、向こうの全体（約 5.6 万行）を見ずに割った。実測すると **ピアノ 23,142 行・quality_eval 7,768 行・ensemble 4,387 行・ギター 3,849 行・ケルト 3,407 行**が計画にほぼ載っていない。しかも向こうには**捨てられた前世代が残ったまま**（オーナー警告）で、規模＝価値ではない。
4. **上流で決めたこと（§1〜§3）**：
   - コンセプトは**8割同じ**。違う2割＝①出力の正体（MIDI 固定→生きたレシピ）②表現層（MIDI に焼く→feel 層で非破壊）③**CC/ピッチベンドを otomemo は持たない**（design.md:258）④ソロは初期外（要件では対象・設計で後回し）⑤「気に入らない小節だけ再生成」は別案粒度の話であって per-note 編集ではない。①②は裁定済み、③④⑤は本書で明文化する。
   - アーキは**ensemble.py の「指揮者」部分を移さない**。移すのは知識（譜ロックの3分岐・隙間刺し・低域譲り）と検証器だけ。**otomemo 側のアーキ変更提案は3点**（§2-4）＝ctx に薄い一方向契約 `band?: {bassTop}` を足す（M0 契約 §3 の凍結署名の改訂＝型スナップショット凍結で膨張を機械的に塞ぐ）／鍵盤の生成器の置き場（music-core／api／Python）＝content 形はその従属／Python 仮住まいの条件（否定はしない・条件が実物と違ったので書き直した）。
   - 要件は**ケルトの1行だけ**（B6 の要件化は落とし design へ・体験語彙で1行足すかは §8-4 の選択肢に残した）。design は §2106 追補 (k)〜(p) を指名（§3-2）。ケルトは「主旋律（前景）＝メロ側／伴奏＝world68 の隣／副次リード＝枝1で後回し」の**3分割**。装飾（cut/roll）は落とすが**slur は dur/タイで content に載る＝落とさない**。
5. **棚卸しの結論（§4）**：札は (a)現行到達点／(b)対照実験／(c)捨てられた前世代／(d)opt-in で生きている／**(e) 打ち切られた後発枝（R1 で追加）**。**quality_eval は `.gitignore:10` で除外＝正典外**（`git ls-files` 0件）だが耳の証拠（A/B クリップ）はそこにしか無い＝着手前に保全する。**ピアノ＝R1/R2 で最大の訂正**：バンドの鍵盤席は4エンジンとも `comp` 席（`ensemble.py:3553-3556,3571,3615`）＝handframe も伴奏。p11 のうちバンドが通る `build_rock` は legacy 刺しと同じ知識（二重計上を解消）、**耳で調律された知識（KNOBS 12セル・容器 DSL・軌跡・`_grade_slots`・4ジャンルのフィギュア）はソロ A/B の耳が生存証拠**で rock/pop の行は無い＝J-POP 向けの崩しは自作＝耳未確認。移す量は約 3,700 行（上限・§7）。
6. **段取り（§5）**：番号は活かし M4 以降を作り直す：M3 ベース本体（**py-parity を 3a より前に**・着手前の5点は §5-2 で埋めた）→ M4 検証器（横断・M3 と並行）→ M5 ギター（ヒット単位ボイシングは `ChordHit` の additive で解く）→ **RNG spike（半日・3g 依存）** → **M6a**（legacy/build_rock 刺し・`band` 契約凍結・低域譲り・handmodel＝裁定不要）→ **M6b**（p11 の耳付き知識）→ **M6c**（handframe・オルガン・p14 live）→ M7 ケルト（ジグ／リール別）。**M3・M4・M6a は即着手可、M6b 以降と M7 は裁定待ち。**
7. **検証（§6）**：R1 で「RNG 不使用」表を実物で洗い直した。真にクリーン＝譜ロック3分岐・`handmodel`。RNG が絡む＝`organ_comp`（Breath 注入）・`phrase_plan`（`rng.choices`・`getstate/setstate`）・walking v2（乱数が sort キー）・handframe（`random()` 2箇所＝軽い）・`chord_attack`（`gauss`＝feel 層へ逃がせば一致不要）。方針の先頭に **(0) RNG を決定的規則へ置換／持ち場を feel 層へ移す** を置き、不変条件は**変異検査・被覆率・ゲート型**で空虚化を防ぐ。
8. **捨てるもの**：ensemble の Chart（33フィールド）／if-elif 組み立て／ステム・ミックス・ギャラリー・fluidsynth／bass_expression のベンド／オルガン CC11・Leslie／前世代（piano comping・fingersim 系・walking v1・guitar gen1・celtic gen1・drums gen1）／打ち切り枝（walking v3 の**アーキ**・gesture p12/p13）。捨てた理由＝負の知識は §4-9（14項）に残す。
9. **裁定（§8）**：**オーナー裁定は4件**＝①ケルト（ジグ／リール）②鍵盤の生成器の置き場（**作曲家の物差し＝進行を変えたら付いてくるか／別の調に貼るとどう鳴るか／後から直せるか**で書き直した）③M0 契約の凍結を解いて `band` を足すか（耳の話＝低域衝突を残すか）④要件へのケルト1行。ほかは起草者が決めて理由を書いた（§8-B）。

---

## §1 コンセプト整合（いちばん上）

### §1-1 両者の芯（原文の所在）

| | phrase_maker | otomemo |
|---|---|---|
| 芯 | 「フレーズ自動生成機」ではなく「**楽器の身体性シミュレータ＋発散・選別の相棒**」（`docs/CONCEPT.md` §1）。手癖では選ばない"弾ける動き"を複数出し、**ユーザーが耳で選び、気に入らない小節だけ再生成**。出力は MIDI＝DAW に貼って仕上げる「タネ供給係」 | 〈作曲するユーザー自身の、外部化された延長〉（`docs/requirements.md:18-20`）。体験原則3＝「ユーザーが先に手を動かし、道具は小さく足し、いつでも覆せる。**完成品を差し出して主客が入れ替わったら延長ではない**」（同:27） |
| 入力契約 | スタイル＋コード進行＋リズムパターン＋拍子＋テンポ → 各パート（CONCEPT §1「コア入力契約」） | `frame`（tempo/meter/bars/key/section）＋`chords`＋`drums`（skeleton）＋つまみ＋seed → content（`generate.ts:1121` genBass・`:958` genChordPattern・`:1641` genDrums） |
| 生成アーキ | ①物理層＝生成する層 ②表現層＝ヒューマナイズ ③発散層＝top-k ＋リズムの器（RhythmSpec を全パート共有）（CONCEPT §2） | レシピ＝ジェネレーター・掴み＋つまみ＋seed→resolve（M0契約 §0）／skeleton は下から上・cues は上から下（design.md:2111）／feel 層は非破壊（design.md:2095） |
| 評価 | 「超雑に自分で打ち込んだ場合と差が出るか」＝採用率プロトコル。**機械指標は診断であって報酬にしない**（CONCEPT §3） | 「最終の良し悪しは人が耳で決める」（requirements:215）。理論スコアはガードレール止まり・評価器を fitness にしない（記憶 project-melody-eval-ceiling）・**LLM 判定は不採用**（記憶 feedback-eval-existing-weights-not-llm） |
| 手癖 | 「他人の手癖を借りるのは目的」・問題は常に「語彙が薄い／一人分／本物でない」（CONCEPT §3 ★手癖の原則） | 体験原則2＝仕上げは「近いほどよい」・**探す場面は遠い素材も引ける**（requirements:26）／「手癖の鏡は作らない」（design.md:527 枝6） |
| 他者データ | POP909 は隔離・製品に1音も混ぜない・GMD は CC BY（`docs/HANDOFF.md` ライセンス注意） | **他者コーパスは統計のみ・リテラルは移調してもアウト**（CLAUDE.md・記憶 feedback-corpus-statistics-only-copyright） |
| LLM の役割 | ネタ出し限定（CONCEPT §2 末尾） | 「何を・どんな雰囲気で」は Claude、音楽的妥当性は仕組みが担保（requirements:154・architecture.md:15） |

### §1-2 同じところ（そのまま乗る）

1. **完成品を追わない**。向こうの「そのままは使わず打ち込み直すのは狙い通り」（CONCEPT §1 用途）は、こちらの「候補まで機械・仕上げは人間」（記憶 project-design-philosophy-options-not-finished）・「ニュアンス／完パケは DAW（ABILITY）」（requirements:222 (iii)）と同じ向き。
2. **耳が最終・機械は診断**。向こうの「機械満点は『壊れていない』以上を意味しない」（`docs/PLAN-piano-comping.md` §5-6）と、こちらの「評価器は変なメロ検出ガード」は同じ立場。**quality_eval の測り方も LLM 判定を含まない**（§4-8 で実物確認）＝衝突なし。
3. **候補は複数・平均を出さない**。向こうの発散層（top-k）＝こちらの配札（ランキングしない・design.md:516）。
4. **共有の器**。向こうの RhythmSpec（ユーザーが描く b:/s:/a: 格子・`core/chart.py:177-433`）＝こちらの「ドラムだけ骨を描く・骨が skeleton としてバンド全員の掴み」（io-map「共通の芯」）。
5. **決定論**。向こう＝md5 seed・builtin hash 禁止（`CLAUDE.md` 取り決め・`PYTHONHASHSEED` を振っても 26 トラックがバイト一致＝面C 実測）。こちら＝mulberry32＋ソルト表（`packages/music-core/src/rngSalt.ts`）・bodyFill は md5 整数（`bodyFill.ts:9-14`）。
6. **他者コーパスは製品に混ぜない**。向こうの隔離規律はこちらの「統計のみ」の内側。ただし向こうの CONCEPT §4「権利処理済み実演データを構造化して足す（未決）」は**こちらでは統計にしか変換できない**（§1-3 の 7）。

### §1-3 違うところ（移植時にどう変換するか／しないか）

| # | 差分 | phrase_maker | otomemo | 変換の決め |
|---|---|---|---|---|
| 1 | **出力の正体** | 完成 MIDI（ステム＋ミックス）を DAW へ | 保存は掴み＋つまみ＋seed のみ・音は毎回 resolve（A＝生きたレシピ・M0契約 §0＝**裁定済み・本書では動かさない**） | 向こうの render/ステム/ミックスは移植しない。派生キャッシュをどう持つかは §8-2 |
| 2 | **表現層の持ち場** | velocity/タイミング/ゴーストを MIDI に焼く（`drums/gen2/src/timing.py` 絶対 ms・`bass_rock_riff/humanize.py`・`piano/gesture/chord_attack.py:85,91` の `gauss`） | タイミングは feel 層で非破壊（B1 裁定・design.md:2109）。**velocity は compositional＝データ層に残す**（design.md:2099「層の割り当て」） | **裁定済み（B1）**。移植の型＝「vel は content に書いてよい・ms は書かない」。**ms の揺れは Python と一致させる必要が無い**（＝RNG 一致検証の対象から外れる・§6-2） |
| 3 | **CC／ピッチベンド** | bass_expression＝スライドをベンドで。オルガン＝CC11/Leslie（研究 doc）。ピアノ＝ペダルを別リストで CC64（`handframe_band.py:516-521`・`gesture_p14.py:199-213`） | **「コントロールカーブは無し」＝content はノート＋楽器のみ**（design.md:258）。CC11 は backlog「可否要調査」（design.md:539）・オルガン CC 型は「劣化コピーで棚に載せない」（design.md:551） | ベンド系は移植しない（§8-B1）。ハンマ/プル＝同一弦レガートの重なりは dur/vel で近似。ペダル＝dur 延長で近似（**followChords と衝突するので排他＝§5-2 M6**） |
| 4 | **「気に入らない小節だけ再生成」** | 芯の一部（CONCEPT §1） | 編集はパターン単位・per-note レーンは足さない（requirements:222 (ii)・design.md:507） | **矛盾しない**＝小節単位の再生成は「別案の粒度」（seed の当て方）であって音符編集レーンではない。io-map 裁定#7＝**M2 で足すはずが未消化・backlog にも無い（R1 面A 発見）**＝§5-2 横断へ繰り越し |
| 5 | **ソロ／リード** | 正規対象（keyboard/synth solo＝`experiments/solo/`・ジグ旋律） | 器楽ソロは**要件では対象**（requirements:222「＋器楽ソロ/副次リード」）だが設計で**初期スコープ外＝後回し**（design.md:521 枝1）・背景扱い＝専用 verb で（design.md:507） | solo.py は**今回射程外**（§4-6）。ケルトの**主旋律**は前景（メロ側）、**副次リード（オブリガート）**は枝1＝本アークで扱わない（§3-1） |
| 6 | **型辞書 vs 物理生成** | 「物理層がバリデータに堕ちるとテンプレ・スタンパー」（CONCEPT §2①＝負の知識） | 型辞書（drumLibrary/bassLibrary/chordLibrary）は一級の道具。**B6 裁定＝併存・吸収しない**（design.md:2118 (j)） | 移植する生成器は向こうの負の知識を守る（辞書に堕とさない）。辞書は残す。UI の3択が前例 |
| 7 | **語彙注入（本物の実演を"色"として足す）** | CONCEPT §4「物理が土台・語彙が色」。色の具体形は未決 | 他者コーパスは**統計のみ**（硬い線） | こちらでは「色」＝統計較正（design.md:534）にしか変換できない。GMD の order-0 統計（`gmdPrior.ts`）が前例 |
| 8 | **音源** | vendored fluidsynth＋FluidR3Mono_GM.sf3 | Tone.js＋同梱 sf2（枝3「試聴音源に投資しない」design.md:523） | 比較は MIDI レベル。音源差を受け入れに混ぜない |
| 9 | **リズムの器の入口** | ユーザーが `b:/s:/a:/g:` 格子を書く（`core/chart.py:352-376`） | 骨は任意（空ならおまかせ骨＝io-map 裁定#1）・描く口はドラムのみ・ベース/コードは「指す」＝**描く口は将来枠のまま・本アークでは開けない**（io-map 裁定#2/#5） | 裁定済み。`a:`（アクセント行）は skeleton に無い＝M0 契約 §5-2「kick/snare のみ」を守る（アクセントは cue.intensity か vel で代替） |
| 10 | **ジャンルの射程** | ジャズ/ロック/ポップ/ボサ/ファンク＋**アイリッシュのジグ・リール（正規要望）** | 日本語ポップス/ボカロ中心（requirements:220「様式は"粗い寄せ"まで」・:221「古典の厳密理論は対象外」）。6/8 は `world68`（26 型・design.md:817-820）。メロ側に irish 統計あり（design.md:16） | **オーナー「ケルトは行けるなら入れたい」**＝§3-1・§4-7・§8-1 で判定（耳判定はジグ○／リール×＝R1 で確定） |

**結論**：芯は衝突しない。**変換が要る差分は 3（CC/ベンド）・5（ソロ）・10（ケルト）**の3点で、いずれも「移植しない部分を明示する」か「載せる層を選ぶ」で解ける。コンセプトそのものを動かす必要はない。

---

## §2 アーキテクチャ整合

### §2-1 otomemo 側の確定構造（動かさない前提）

- 音楽ドメインは **TypeScript（`apps/api/src/music/`）に一本化**・Claude 非依存の記号エンジン・MCP として公開（`docs/architecture.md:48`）。Python は「ジョブキュー越しに隔離・滅多に触らない安定サービス」（同:38）。**spawn 型（常駐しない）の前例が既にある**（`apps/api/src/accent.ts:2-12`＝`apps/audio/.venv` の python を detached spawn＋timeout・実測 0.13〜0.23 秒/回）。
- レシピの resolve 置き場＝`packages/music-core`（api/web 共有・design.md:2115 (c)）。**ただし resolve も Recipe も music-core にはまだ無い**（`packages/music-core/src` の一覧に無し・契約テスト `phrasemaker-resolve-contract.todo.test.ts` は todo 8 件のまま＝面C 実測）。実音化（コード楽器の voicing）は web `resolveChordPattern`（`apps/web/src/music.ts:941`）＝**api は content のみ・実音化は web** の分業（design.md:548）。
- **カスケード**（design.md:2106-2113）：曲／セクション／ネタの3層を ctx 1枚に畳んで演奏者へ push。**統合規則は1本＝内側優先スコープ・指揮者の頭脳・問い合わせ口・聴き合いループは作らない**。横断契約は薄い2本＝skeleton（下から上）・cues（上から下）。**曲レイヤーは実装丸ごと後回し**。
- `/gen/section` の依存順＝**rhythm→bass→chord_pattern→melody**（`apps/api/src/http.ts:471-489`）＝生産者を先に呼んで生成物を次へ渡す「黒板」の実装。bass は chord_pattern より先に生成される（面C 追認）。
- **CC/ベンド/オートメーションは持たない**（design.md:258）。
- 前景／背景＝主旋律だけが notes 編集・背景はパターンが content（design.md:506-507・**507 は「⚠オーナー未レビュー」札つき**）。
- **`skeleton` という名は既にメロの骨格ネタ（design #20・`SkeletonContent`）と `genBass` の `opts.skeleton`（`generate.ts:1125`）で使われている**＝新しい横断契約に同名を使わない（§2-4 A）。

### §2-2 ensemble.py（4,387 行）は何で、どこがカスケードに収まるか

向こうの統合層は 2026-08-17 に「役割つき Part リスト」へ作り直された（コミット `728a66f`・`docs/poc/SPEC-orchestrator-unified.md`）。構造（行番号は `experiments/ensemble/ensemble.py`）：

| 部位 | 場所 | 中身 | otomemo での対応 |
|---|---|---|---|
| 共有チャート | `class Chart`:257（**33 フィールド**＝実測・楽器別つまみ置き場。`CRITIQUE-orchestration-structure.md` §1.2 は「31」＝728a66f が `parts`/`seed_alias` を末尾に足した） | 進行・拍子・テンポ・RhythmSpec・楽器別ノブ | **移植しない**（案C が避けた神オブジェクト。こちらは frame＋section cues＋各レシピの knobs） |
| 部品リスト | `class Part`（`core/chart.py:479`）・`ENGINES`:3545・`default_parts`:3591 | role（bass/drums/comp/lead/drone）×engine×gm×gain×knobs | 「役割語彙5語」は参考。こちらのレーン（トラック）の存在＝編成 |
| 組み立て器 | `build_chart`:3822 | 部品を並び順に呼び ctx（`n_bars`/`bass_stem`/`bass_onset_beats`/`kick_beats`/`head_times`）を渡す（`:3838-3846`） | `/gen/section` の依存順と同型。**問い合わせ口なし・単発・ctx は一方向の掲示板**＝「賢い指揮者」ではない。ctx 信号のうち **`bass_stem`（ベースの最高音）** だけがこちらに無い（§2-4 A） |
| 噛ませる処理 | `_lock_bass_roots_to_sheet`:1111・`_sheet_line`:1372・`_lock_guitar_chug_to_sheet`:2678・`rock_piano`:2102 の sheet 分岐（`:2128-2161`＝**既定で鳴っている legacy ピアノ**） | 共有譜の kick に錨／隙間刺し（`onsets − kick`＝バックビートを含む） | **音楽知識＝移植対象**（§4-1/§4-3/§4-5） |
| 検査 | `band_overlap`:3225・`coverage_metrics`:3250・interlock 指標 | 低域衝突・途中で消えるトラック・キック共有率 | **検証器として移植**（§6） |
| ヒューマナイズ | `class Breath`:896（相関・低周波ドリフト・`rng.uniform`×3 の位相 `:902-908`） | 全パート共通の揺れ | feel 層の管轄（B1）。今回は移植しない（backlog「文脈依存ヒューマナイズ」へ合流）。**`organ_comp` には引数で注入されている（`:2584-2593`）＝移植時は注入しない**（§6-1） |
| レンダ | ステム/ミックス/LISTEN/fluidsynth（`:3301-3386`） | 成果物づくり。**仮メロ乗せは未実装**（`HANDOFF.md:27` の記述は構想） | **移植しない** |
| 旧経路 | jazz_*:1018-1078・rock_*:1182-2102・jig_* 手書き | Part 化以前の固定編成（`default_parts` から今も呼ばれる） | 世代の札は §4-6 |

**判定**：ensemble.py のうち otomemo に運ぶのは「噛ませる処理（知識）」と「検査（検証器）」だけ。**組み立て器・Chart・Breath・レンダは運ばない**。SPEC-orchestrator-unified が「単一契約」と呼ぶものは、こちらでは既に **frame＋cues＋skeleton＋各レシピ** に分かれて存在しており、統合モジュールを新設する必要はない（カスケード設計 §2-1「統合器という名のモジュールは作らない」）。

### §2-3 パート間依存の実態（向こうは4本・こちらに足すのは1本）

SPEC-orchestrator-unified §2「部品間依存は4本のみ」：comp←bass_max／jazz drums←bass 強拍時刻／rock 系←bass の n_bars／jig←lead が n_bars を決める。

- **n_bars 系2本**＝こちらでは frame.bars が先に決まっているので消える。
- **jazz drums←bass 強拍時刻**＝**受け取っているが使っていない死んだ引数**（`ensemble.py:1053` `head_set = head_times` の1行のみ・以後参照 0 件）。形だけ移さない。ウォーキングはドラムの後に置き「ベースが skeleton を読む」向きに揃える。
- **comp←bass_max（低域譲り）**＝こちらに無い。`bass_max` は**ステム全体の最高音1個**（`ensemble.py:2021,2078`）で、床は曲を通して1本（`handframe_band.py:62-68,464`）。**これが唯一、otomemo に足すべき横断契約**（§2-4 A）。`bass_onset_beats` は jazz drums と interlock 指標しか読まない＝**M4〜M6 に消費者がいない＝足さない**（R1 面B/面C）。

### §2-4 otomemo 側のアーキ変更提案（明示・勝手にコードで動かさない）

**A. ctx に薄い一方向契約 `band?: { bassTop?: number }` を足す（M0 契約 §3 の凍結署名の改訂）**
- v1 は「`ctx.skeleton` に足す」と書いたが、**M0 契約 §3 の ctx に `skeleton` は存在しない**（skeleton は resolve の**戻り値**）。かつ `skeleton` の名は既に別物に使われている（§2-1）。→ **別名の薄い契約 `band?`** として ctx に additive（生産者がドラムでなくベースであることを型で表す）。
- 改訂対象＝**M0 契約 §3（ctx 署名・凍結）＋design.md §2106(b) 追補 (l)**。§5-2（skeleton の定義）は動かさない。未指定＝従来（bit 一致）。導出は純関数（bass content → `max(pitch)`）・`/gen/section` は bass を先に生成しているので配線は1〜2行（`http.ts:487-489`）。
- **膨張の機械ガード**：`Cue` に課している**型スナップショット凍結**（design.md:2113）と同じテストを `band` にも課す（フィールド集合が動いたら赤）。「今回だけ1個」が Chart（33フィールド）へ育つ道を塞ぐ。
- 「賢い指揮者」ではない（面A 追認）：問い合わせ口・聴き合い無し・生成済みデータを一方向に敷くだけ。危険は指揮者性でなく**掲示板の膨張**＝上のガードで塞ぐ。
- 消費者は M6（鍵盤の低域譲り）。**契約の凍結は最初の消費者と同じ段（M6）で行う**（消費者不在で粒度＝セクション1個のスカラーか小節ごとか、を決められないため＝面C）。
- 昇格先＝§3-2 (l)。裁定＝§8-3。

**B. 鍵盤の生成器をどこに置くか（content 形とプランB はこの従属）**
- **分業は壊れない**（v1 の「どれを選んでも分業と衝突」は誤り＝面A）：resolve の置き場は music-core（design.md:2115）で、web の再生境界で走らせれば `resolveChordPattern` と同じ位置。分業に例外が要るのは「api の応答に絶対 notes を載せる」時だけ。**ベースの絶対 notes は前例ではなく是正中の違反②**（design.md:565-566「修理#2」）＝前例に引かない。引けるのは `rhythm`＝派生キャッシュ（実装計画 §5①・A案裁定済み）だけ。
- ただし**現行の生成器は全部 api（`generate.ts`）にあり、music-core に resolve は未実装**。「毎回 resolve」には2グレードある（R2 面C）＝**(i) `resolveChordPattern` と同型の純関数を music-core に置き web の再生境界から呼ぶ**（M0 の凍結 `resolve(recipe, ctx)` 契約は実装しない＝分業無傷・進行追従・保存はレシピのみ、の効能は全部得られる）／**(ii) M0 の resolve 契約そのもの（todo 8件）を実装する＝本アーク外**。ボイシング層（`voiceChord`/`voiceToTop`/`voiceGuitar`＝`music.ts:723-790`）は (i) でも music-core へ移す。**Python 仮住まいを採ると web からは呼べない＝毎回 resolve は自動的に不可＝派生キャッシュ確定**。
- content 形（派生キャッシュ）を chord_pattern に足す実コスト＝**web 7 箇所**（面C 実測）：`ChordPatternMode` 型（`music.ts:649`）・`isChordPattern`（`:1053`＝`hits`&`voicing` で判定＝**キーを残さないと `notesForContent` が `[]`＝無音**）・`resolveChordPattern`（`:941`）・**`compositeNotes` の移調規則（`:1174-1183`＝chord_pattern は「実音解決済み＝移調しない」＝絶対 notes を別調セクションへ置くと黙って原調で鳴る**＝既存の出音に触る唯一の危険箇所）・`ChordPatternEditor` の hits グリッド編集・MiniRoll/lanes・ライブラリ判定。
- 裁定＝§8-2（「生成器の置き場」1問に畳む）。

**C. Python 仮住まい（プランB）の条件（v1 の条件文は実物と違ったので書き直し）**
- 成立する材料：spawn の前例（`accent.ts`）・母艦 `/usr/bin/python3` 3.12.3・`apps/audio/.venv`（uv 管理）・`handframe.py`/`handmodel.py`/`phrase_plan.py`/ギター gen2 は**素の python3 で import 可**（stdlib のみ）。
- 成立しない材料：**`handframe_band.py` は `gesture_p5`→`gesture_p2` 経由で numpy を引く**（`gesture_p2.py:67`）＝v1 の「stdlib＋pretty_midi のみ」は band 版で破れる。`chord_follow.py:33` は networkx（`graph_line`）を import（音の経路では未使用だが import 時に要る）。向こうには venv が6つあり単一インタプリタでは動かない。`~/projects/phrase_maker` を実行時依存にするのは不可（リポ外・未版管理・世代混在）。v1 の「常駐機に torch は無く Python3 のみ」は不正確（root venv に numpy/networkx/music21/pretty_midi 等あり）。
- 採るなら条件＝**`apps/piano-py/` として otomemo に vendor**（`apps/audio` と同じ `pyproject.toml`＋`uv.lock`＋専用 venv）・対象は `handframe.py`＋`handmodel.py`＋（band 相当は自前で薄く書き直す）・spawn 型・JSON 契約凍結・**失敗時はサイレントでなく通知してフォールバック**（2026-09-04 裁定）。
- 判断は M6 冒頭の**測れる3項目**（§7）。裁定＝§8-2 に畳む。

**D. CC/ベンド無し設計は維持**（design.md:258）。bass_expression のベンド・オルガン CC は移植しない。

**E. ケルト**＝主旋律はメロ生成（前景）・伴奏は world68 の隣（背景・**選抜経路には載せない**＝design.md:826 の既決と同じ）・副次リードは枝1。**新しい「アーキの軸」は要らない**（9/8・12/8 は `meter.ts:28-29` で compound 解釈済み・詰まるのは型辞書の grid 16/12 だけ）。

### §2-5 「賢い指揮者を作らない」への適合チェック

| 誘惑 | 本書の答え |
|---|---|
| ensemble の `build_chart` を移植して「バンド生成器」を作る | 作らない。`/gen/section` の依存順＋ctx 透過で足りる |
| ピアノがベースを見て空きを探す「聴き合い」 | しない。ベース生成物から `bassTop` を**データとして敷く**だけ（生成済みを次へ渡す単発）。膨張は型スナップショットで塞ぐ |
| 曲全体のエネルギーからフィルを自動配置 | しない（曲レイヤー後回し・`deriveCues` を頭脳にしない） |
| quality_eval の指標で候補をランキング | しない（design.md:516）。指標は検証器（ゲート/診断）に限る |
| web の resolve で兄弟のベースを見て床を上げる（毎回追従） | しない＝**既存の出音が動く**（bit 一致違反）。低域譲りは**生成時に content へ焼く**（`ChordVoicing.floor?` を opt-in で・面C） |

---

## §3 要件・設計への影響（上位 doc のどこを書き換えるか）

### §3-1 要件（`docs/requirements.md`）

**動かさないもの**：コンセプト（:18-20）・体験原則1〜7（:24-35）・「最終の良し悪しは人が耳で決める」（:215）・楽器アレンジの3線（提案のみ／パターン単位／完パケは DAW＝:222）。phrase_maker の知識はこの内側に収まる（§1-2）。

**追記案（1行・WHAT のみ・裁定は §8-4）**

| 場所 | 追記案（40字） | 理由 |
|---|---|---|
| :220 の隣（様式は"粗い寄せ"まで） | 「アイリッシュのジグ／リールも条件付きで対象（様式は粗い寄せまで）」 | オーナー「ケルトは行けるなら入れたい」の受け。既存語彙（:220「粗い寄せ」）に合流させ新しい断定を増やさない。**9/8・装飾（cut/roll）の除外は設計層の帰結＝design (o) へ**（R1 面A） |

v1 にあった「型を選ぶ／身体の制約から作る」の要件追記は**落とす**（生成機構の語彙＝設計層。B6 は design.md:2118 (j) に正典化済み）。体験語彙で言い直した「候補は在庫から選ぶだけでなく、その場で作られることもある」を足すかどうかは **§8-4 の選択肢③**に残した。

**ケルトを入れると otomemo のどの層に何が増えるか（3分割・R1 で副次リード枠を追加）**

| 層 | 増えるもの | 既にあるもの | 新しい軸か |
|---|---|---|---|
| 拍子 | なし（6/8 は既存。9/8・12/8 も `meter.ts:28-29` が compound として解釈・`phrase.test.ts:9-10`）。**型辞書の grid は 16/12 のみ**（`chordLibrary.ts:34`・`bassLibrary.ts:39`）＝9/8 の型（grid 18）は設計上の理由で当面外（源流未実装＝`phrase_plan.py:353` は根拠にしない） | 6/8＝12 格子・world68 26型（design.md:817-820） | **軸は増えない** |
| **主旋律（ジグ/リール本体）＝前景** | 「線の計画」＝アンカー（半小節頭）＋音型語彙12種＋方向の慣性＋軸音（周期帰還）＋弧 e(τ)＋AA'BB' 構造 | genMelody（骨格→表面・モチーフ・arc・**style=irish 統計＝design.md:16「irish186 投入済」**）＝既存 style との関係（置換か上乗せか）を M7 Scope で決める | **メロ生成の新経路（型の追加）**＝design.md:506「メロの型は生成の上流に住む」の内側。伴奏アークではない。土台の design.md:507 は未レビュー札つき |
| **副次リード（ケルト風オブリガート）＝背景** | J-POP にフィドル/ホイッスルの対旋律を足す用途 | `gen_counter`・将来の `gen_solo`（design.md:507・:521 枝1＝初期スコープ外） | **本アークでは扱わない**（枝1 の後回し。要件では対象＝落ちたわけではない） |
| リズム語彙 | ジグ lilt `(2,1)/(1,1,1)/(3)` の確率表・リール 4/4 の表（`phrase_plan.py:326-328,343-344`）＝**記譜されたリズム＝content** | rhythmCells / 6/8 対応 | additive（表を足す）。**lilt と swing を混同しない**（lilt は content・reel swing 6% は feel 層） |
| **装飾（cut/roll）** | cut（30ms グレース）・roll（45ms 刻み5音）＝**絶対秒・格子外**（`celtic_gen2.py:318-338`） | 無い。content はノートのみ（design.md:258） | **載らない＝落とす**。弓3連 uneven（16分・16分・8分・`phrase_plan.py:77`）だけは格子に乗るが耳の効果は否定的（§4-7）＝保留 |
| **slur（スラー＝1弓で2音以上を繋ぐ）** | **リールの芯**（コミット `6db2dd2` 本文「the melody has zero slurs anywhere, which research names as THE core reel-drive technique」・未実装） | dur／タイで表せる（content 内） | **載る＝落とさない**（R1 面B）。リールを入れるなら**実装が前提条件**（§8-1） |
| ノリ | reel swing・breath warp・jitter ±12ms | feel 層（swing/humanize） | 既存 feel 層 |
| 伴奏 | ボーラン（tom41/45）・付点4分ペダル・ドローン・sheet ロック版 | world68 の drum8/bass8/chord10（`w68-dr-jigskel`・`w68-bs-jig`・`w68-ch-drone5` 等） | **ジャンル語彙の追加のみ**（`irish` タグ or world68 に型を足す・**GENRE_TABLE には載せない**＝design.md:826） |
| ハーモニー | i / bVII 交替のガイド・和声を「定義域の制限」に使う（`phrase_plan.py:702-710`・`ensemble.py:2936-2964`） | chords 入力 | additive（コード非追従ではないので J-POP アプリと相性が良い） |
| テンポ | ジグ既定＝付点4分 110〜120（`AUDIT-jig-musical.md:40-48`） | tempo | 型の tempo 帯に書く |
| 軸音 | 「ジグもリールも基準になる音に対して上下の反復をする。今の動きは軸が無い」（`research/celtic/05-axis-tone.md:3-4`＝**ジグにも向けられた否定的な耳**）。手当て＝v5 軸音（耳未記録） | genMelody の「地元の音」 | メロ経路に足す一般則。裁定材料として §8-1 ①のデメリットにも書く |

**結論**：新しい軸は要らない。ケルトは「主旋律（前景・メロ側）＋伴奏語彙（背景・world68 の隣）」の**2箇所に載り、副次リードは枝1**。装飾は落とし、**slur は載せる**。9/8 は当面外。

### §3-2 設計（`docs/design.md`）への追補（指名）

既存の確定設計は壊さない。追補は §2106 の続き番号で置く（正準化は裁定後）。

| 追補 | 置き場 | 中身（要点） |
|---|---|---|
| **(k) ベース M3 本体** | design.md:297-311（gen_bass×ドラム結線）と :392-394（bassLibrary）の隣 | 第三経路 `anchorLock`（構造的ロック＝`_lock_bass_roots_to_sheet` の3分岐＋案B「シンコペ裏の無音キックはベースを休む」つまみ）を kickLock/style と**排他**で additive（既定 OFF＝bit 一致・`relative:true` との組み合わせは `relativeFallback` 流儀で理由を返す）。chord_follow の5ガード＋`core/chordlib.py` 層B（25 クオリティ×スケール整合）を「接近音・弱拍の整合」として足す（approach ノブと排他）。walking＝**v2 の候補生成に v3 の規則3本（禁則音程／跳躍後の順次回復／同方向連続跳躍の禁止）を制約として足し、乱数タイブレークを決定的規則へ置換**した `JZ-WALK` style（§4-1・§6-1・**規則は耳の言葉から出ているが v3 自体は耳未判定**）。**anchorLock の体＝style 型の16分格子**（kick step にルート錨・非 kick セルは無傷＝style とは併用・kickLock とは排他・style 未指定時は grammar セル既定 `pedal_answer` 相当を体にする）。**アクセントは M3 では持たない**（otomemo の skeleton は kick/snare のみ＝案B つまみは `strong`＝拍頭キック以外の無音キックを休む、の意味で実装・将来ドラム content の hit 別 vel が入ったら accents を導出）。**錨のコード読みは step 粒度**（`chordAt(t)` を `Math.floor` せずに呼ぶ読み手を anchorLock 内に持つ・既存 `rootAtBeat`（`generate.ts:1140`）は触らない）。**engineVersion の置き場＝music-core 定数 `PM_ENGINE_VERSION`＋新経路使用時のみ content に `engine:{version}` を載せる**（M0 契約 §2 の形・既定経路はキーを生やさない）。grammar セル3型は bassLibrary に anchor/role 注記付きで追加。オクターブ選択は「最寄りのレジスタ」を音高距離で決める（帯の下限で決めない＝`f2c3241` の −11 半音の教訓）。**描く口は開けない**（io-map 裁定#2/#5＝将来枠のまま） |
| **(l) ctx `band?` 契約** | design.md:2111「skeleton は下から上」の隣＋**M0 契約 §3（ctx 署名）** | `band?: { bassTop?: number }` を additive（§2-4 A）。型スナップショット凍結。凍結は最初の消費者（M6）と同じ段。`bassOnsets` は足さない |
| **(m) 鍵盤の生成器の置き場と2アークの合流点** | design.md:545-563（アレンジS1）の隣 | 語彙帳（辞書＝chordLibrary）と生成器（p11 の耳付き知識／handframe）は併存（B6 と同型）・配札 UI（S2）は両方の候補を配る。**崩し度は連続2ダイヤルに畳まず、p11 の KNOBS の実態＝3段・ジャンルごとに違うキー（neosoul `{freq,voices,traj,ghost}`・jazz `{freq,voices,traj}`・bossa `{freq,split}`・ballad `{freq,updown,hold_extra}`・共通は `freq` のみ）の名前付きプリセット表として持つ**（耳が名指しで直した軸＝bossa の `split`・ballad の `updown` を消さない）。**rock/pop の行は源流に無い＝J-POP 向けの崩しは自作＝耳未確認と明記**。**オルガンは S1 の既存 `OG-*` 型に「掴み規則（キック回避）／D3+D5 ボイシング」の差分を当てる＝新設しない**。反復系の型（2小節テンプレ・cell repeat）は**和声リズムが遅い曲でしか耳に立たない**（`GESTURE_P13_NOTES.md:11`）＝型のメタデータに適用条件を持つ。生成物の content 形は §8-2 の裁定に従う（`hits`/`voicing` キーは必ず残す＝`isChordPattern` を壊さない・配置時の調の扱いを先に決める・notes モードのエディタは読み取り専用＋「作り直す」） |
| **(n) 小節単位の別案** | design.md:507 の隣 | 「小節単位の再生成は別案の粒度であり、per-note 編集レーンではない＝シーケンサー化に当たらない」1行（io-map 裁定#7 の根拠を正典に）＋**裁定#7 が M2 で未消化＝繰り越し**の記録 |
| **(o) ケルトの置き場** | メロ側＝design #12-M（style/型）・伴奏側＝design.md:817-820 world68 節の隣 | §3-1 の表のとおり3分割。**9/8（grid 18 未対応）・cut/roll（絶対秒）は当面外・slur は dur/タイで載せる**と理由つきで。伴奏型は GENRE_TABLE に載せない（design.md:826 と同じ） |
| **(p) 検証器の作法＋負の知識** | §2106 の末尾 | 移植する検証器（低域衝突＝`gap_semitones>0` をゲート・`overlap_frac` は診断／四肢衝突（グルーヴ全体へ適用範囲拡張）／着地チェック／微小タイミングの系統性／coverage）と、作法9項（§6-4）。**新しい検証器が既存資産（drumLibrary 32型・chordLibrary・`QUALITY_INTERVALS`）を落としても、それを理由に既存を直さない＝診断に記録し、直すかは耳（オーナー）で決める**（既存の `"11"` は backlog へ）。**負の知識16項（§4-9）を design に載せることをこの追補の完了条件にする** |
| **不変の再確認** | design.md:258（CC 無し）・:2095（feel 層）・:2118 (j)（B6 併存）・:2111（曲レイヤー後回し） | 本計画はいずれも動かさない |

**`docs/architecture.md`**：技術選定（:36-45）は動かさない。プランB（Python 仮住まい）を採る場合のみ「未決・要調査」（:52）に条件付きで1行（§2-4 C）。採らなければ変更なし。

**`docs/backlog.md`（置き場規約に合わせて3分割・R1 面A）**：(i) **後回し**＝backlog へ：CC11 可否調査（既存節に合流）・9/8 型（grid 18）・Breath（文脈依存ヒューマナイズ節 :436 に合流）・**小節単位の別案（io-map 裁定#7・繰り越し）**・弓3連 uneven・walking の 6/8 スロットの耳較正・低域譲りの「毎回追従」（resolve 契約実装後）。(ii) **やらないと決めたもの＋負の知識**＝design (p)（backlog には置かない）。(iii) 経緯＝本 doc が裁定後に `docs/archive/` へ。

**M0 契約（`2026-08-20-phrasemaker-M0-contract.md`）**：§3 の ctx 署名に `band?: { bassTop?: number }` を additive 追記（(l)）。§5-2（skeleton＝kick/snare）は動かさない。ソルト表は動かさない（walking は乱数を消すので新ソルト不要）。

**引き継ぎ書（`2026-08-21-phrasemaker-arc-handoff.md`）**：マイルストーン表（M4＝ギター/アンサンブル・M5＝ピアノ）を §5-1 の新しい割りへ更新する（横断の段取りに含める）。

**research（`2026-09-04-phrasemaker-bass-inventory.md`）**：事実の記録なので書き換えない。ただし**訂正注記が要る箇所を本書で指名**する：§5-4「walking は 6/8 非対応（G7）」＝現コードでは修正済み（`core/parts.py:388`）／§1-4・§4-5「bass notes は velocity 非対応」＝2026-09-04 の land（`generate.ts:1385`）で vel を書けるようになった／§1-3・§4 推し3「v3 が知識の核」＝v3 は**v2 の後継だが批評パネルが否定し打ち切られた枝**（`CONCEPT.md:90`）で、生成器として移植する対象ではない（規則3本は活かす）。research README の当該行に「訂正注記＝本計画 §4-1 参照」を追記する作業を横断に置く。

---

## §4 全体棚卸し（世代の札つき）

### §4-0 判定の作法

オーナー警告「phrase_maker はゴミが多いはず。作っては捨てずに残して新しく作った」を前提に、各モジュールへ**世代の札**を付けました。

- **(a) 現行の到達点**＝移植候補
- **(b) 対照実験・ablation**＝価値主張の分母。移植しないが理由を記録
- **(c) 捨てられた前世代**＝後継がある。移植しない。ただし「なぜ捨てたか」＝負の知識は拾う
- **(d) opt-in で生きている**＝既定では呼ばれないが現行。移植候補
- **(e) 打ち切られた後発枝（R1 で追加）**＝後発だが採用されず・後継なし。生成器は移植しない・規則や測定器は拾う（例：walking v3・gesture p12/p13）

証拠の優先順位：①呼び出し関係（`ensemble.py` の `ENGINES`/`default_parts`/`BUILDER_MAP`・各 `main.py`・`_load_*`）②向こうの正典が自認する失敗形（`CONCEPT.md`・`GAP-AUDIT.md`・`HANDOFF-NEXT.md`・`AUDIT-*`・`CRITIQUE-*`）③ACCEPTANCE/LISTEN の結論（**doc とコードが食い違う例があるので単独で断定しない**）④git 日付（**弱い証拠**＝初回コミット `faea7c2`（2026-08-07）は squash された初期スナップショット）。

**耳判定の探し方（R1 面B の指摘＝向こうの慣行）**：機能を出すコミットは必ず「Not yet ear-checked.」で終わり、**耳の言葉は次のラウンドのコミット本文と research doc の冒頭に引用される**。当該コミットだけ見ると必ず「未記録」と誤判定する（v1 のケルトがその誤り＝§4-7）。

**前提として確定した事実**
- **`experiments/quality_eval/`（7,768 行）は `.gitignore:10` で除外＝`git ls-files` 0件＝正典外**。ローカルにしか無い。**ただし追跡されている `tools/FEATURED.txt` はほぼ全行が `quality_eval/*.wav` を指す＝耳判定の対象物（A/B クリップ・O'Neill's 参照 WAV）はここにしか無い**＝消える前に保全する（§5 横断）。逆に `experiments/robustness/` は追跡（4本）。
- **向こうの正典 doc は最終コードより古い**：`CONCEPT.md`＝コミット 2026-08-09（本文の日付は 08-08）・`GAP-AUDIT.md`＝08-07・`HANDOFF-NEXT.md`＝08-12 に対し、主要成果 20 コミットが 08-17/18。**G7（walking の 6/8 非対応）は現コードでは修正済み**（`core/parts.py:388`）。**G8（コード解釈4系統）は実効3系統**＝根拠は `core/chordlib.py:12-13` が piano/gen2 版を再エクスポート（第5コピーではない・`GAP-AUDIT.md:101` 自認）で、music21 の base PoC は死んでいるため。付記：`ensemble.py:76` の `import chordlib` は静的には `piano/gen2` を指す（sys.path `:62-69`）が、**実行時は `walking_v2` の import が core/ を先頭に挿すため `core/chordlib.py` に解決される**（venv で `E.chordlib.__file__` を実測）。層B を参照表に選んでも**パーサの3系統（bass `chords_theory`／guitar `chordtheory`／chordlib）は解消しない**。
- **Chart のフィールド数＝33**（`ensemble.py:257-359` の dataclass 注釈行を実測。CRITIQUE の「31」は 728a66f 以前）。

### §4-1 ベース（棚卸し済み＝`research/2026-09-04-phrasemaker-bass-inventory.md` を土台）

既存棚卸しの結論（①錨と間の分業②chord_follow ガード群③walking④指板グラフ⑤奏法）の骨は維持。**今回の全体棚卸しと R1 で加わった判定・訂正**：

| モジュール | 札 | 追加の根拠 | 判定の更新 |
|---|---|---|---|
| `ensemble.py:1111 _lock_bass_roots_to_sheet`・`:1372 _sheet_line` | **(a)** | `default_parts:3618-3626` が掴む。耳「ロックとても良い」（`HANDOFF-NEXT.md:14`）。RNG/hash 不使用（`:1136-1138`）・`min(cands, key=(abs(c-base), c))`（`:1159`）は第2キーが `c` 自身で同値タイブレークが起きない（面C 追認） | **M3 の本体＝最優先**。案B つまみ（`bass_rest_on_syncopated_kick:1166`・Not yet ear-checked）は additive の opt-in で。案D（リズムだけロック・音選びは指板・ルートは強い選好＝`BRAINSTORM-bass-kick-lock.md:113-124`・未実装）は将来枠として (k) に記す |
| `bass_rock_riff/chords/chord_follow.py`・`chords_theory.py` | **(a)**／**(c) 寄りの現行** | `chord_follow.py:33` は **networkx を import**（`solve_fingering` は `:326` のメトリクス用のみ＝音の経路では未使用）。参照表は `core/chordlib.py` 層B（`:88-107`「CT から verbatim 移植・数値はバイト一致」） | TS 移植には無害。**プランB（Python 仮住まい）では致命**（§2-4 C）。層B を正とするのは `13` について。**`"11"` は層A・層B とも `(0,4,7,10,2,5)`（`core/chordlib.py:131`）＝同じ avoid note＝どちらも正としない（ドミナント 11th は3度を省く＝`9sus4`）** |
| `bass_walking/v2/walking_v2.py` | **(a)** | `ensemble.py:74`＋`core/parts.py:63` の二経路で現役。`v2/ACCEPTANCE.md:19-22` PASS。**ただし乱数が候補選択そのもの**（`:133` `score=(in_scale, abs(d), rng.random())` → `:137` sort・`:188` `randrange(2)`）＝「タイブレークだけ」ではない（R1 面C）。耳＝v3 の起点「wild / forbidden-sounding」（`v3/LISTEN.md:3`）・実測 **FORB 3〜5**（`v3/LISTEN.md` ii-V-I） | 生成器の土台にする。**乱数を決定的規則へ置換**（`score=(in_scale, abs(d), p)`）＝Python 参照との一致は主張しない・不変条件で受ける |
| `bass_walking/v3/` | **(e) 打ち切られた後発枝**（v1 の (c) は誤り＝時系列が逆） | `walking_v3.py:1-30` は「v2 への耳フィードバックを起点」＝v2 の**後継**。実測 FORB 0・recov 100%（`v3/LISTEN.md`）。しかし `CONCEPT.md:90`「v3案は批評パネルが満場一致で否定（逐次貪欲のアーキ限界）…v4 打ち切り」・ACCEPTANCE 無し・誰も import しない | **アーキ（逐次貪欲）は持ち込まない・規則3本（禁則音程／跳躍後の順次回復／同方向連続跳躍の禁止）は v2 の候補フィルタに制約として持ち込む**（R1 面B の推し②を採用。**援護＝`SPEC-piano-handframe.md:18` が「逐次貪欲の限界の実体は argmin の最尤の凡庸であって逐次性そのものではない」と向こう自身が射程を絞り直している**）。**v3 自体は耳未判定**（`v3/LISTEN.md:15`「call is the listener's」・ACCEPTANCE/批評 doc なし）＝規則は v2 への耳の言葉から出ているが、効いたことは未確認。禁則 0 は**制約で保証される（byConstruction）**ので、ゲートに置くのは W1〜W5＋「制約の被覆率」（§6-4）。v1 の「v2 生成＋v3 ゲート」は v2 が FORB 3〜5 で落ちる自己矛盾だった |
| `bass_walking/walking.py`（v1） | **(c)** | `Beat`/`build_beats` は v2 の依存（`walking_v2.py:52-54`）。負＝「這いすぎ」 | 部品だけ v2 と一緒に来る |
| `bass_rock_riff/graph_line.py`（networkx） | **(c) 寄り** | 到達不能は `raise ValueError`（`:20`）。コスト床 `max(0.02,…)`（`fretboard.py:58-63`）は**負辺で Dijkstra が落ちる実装都合** | 指板ソルバはギター gen2 の自前層状 DP を一般化して4弦を乗せる（§4-5 (d)）。床は持ち込まない |
| `bass_expression/` | **(d)** ただし前提が欠ける | otomemo は CC/ベンドを持たない（design.md:258）。bass notes の vel は land（`generate.ts:1385`）で書けるようになった＝既存棚卸し §1-4/§4-5 は古い | **ベンド系は移植しない**（§8-B1）。ghost/dead の弱打（vel）・同一弦レガート（dur）は後段候補 |
| `theory.py:33 root_low`（bass・guitar 両コピー） | 移植注意 | `REG_LO + ((root_pc - _E_PC) % 12)`＝root_pc 0〜3 で**負数の `%`**（Python は除数の符号・JS は被除数の符号）。ホットパス | TS では `normRoot`（`music-core/src/index.ts:108`）＝`((a%n)+n)%n` を使う（面C 追認10） |

**ベース側の負の知識（§4-9 へ）**：v1「順次だけでは歩かない」／v2「跳躍の量を報酬にすると禁則跳躍へ最適化」／v3「逐次貪欲では弧が出ない」／kick ロック (c) 挿入は「同期100%・補完0%」（`BRAINSTORM:36-40`）／−11 半音の"解決"は register-floor（オクターブ選択を帯の下限で決める）の欠陥（`f2c3241` 本文）。

### §4-2 ドラム（移植済みの外側に残っているもの）

M2 で移植済み＝`fills.py` 型10種・`humanize.py`・`bodyfill.py`・`timing.py` の声部別 ms・GMD order-0 統計。**四肢衝突検証も `drumFill.ts:351-380` に移植済み**（面C 追認5）＝残るのは**適用範囲の拡張**（グルーヴ全体へ）。

| モジュール | 札 | 根拠 | 移植 |
|---|---|---|---|
| `drums/gen2/src/patterns.py:198-234 spec_groove_bar`・`_spec_ghosts:169-195` | **(a) 未移植** | `ensemble.py:1744,1794` が呼ぶ本線。ゴーストの制約生成（候補＝kick∪snare∪hat 格子に無い裏拍・スネアの 2step 以内優先・md5 同点解決） | ○ otomemo の `bone.cells`→rhythm 展開（M1）が同役＝**差分だけ**（アクセント→vel 写像・ゴースト制約生成） |
| `drums/gen2/src/validate.py:21-41`（四肢衝突） | **(a)** | RF/LF/HAND・同時 ≤4・キック1・ペダル1・手2・重複禁止 | ○ **既に `drumFill.ts` に移植済み**＝genDrums 出力全体（フィル外）へ掛ける拡張（M4 横断） |
| `drums/gen2/src/metrics.py:55 microtiming_structural` | **(a)** 診断 | `|snare|≥3ms かつ |hat|≥3ms かつ snare>0>hat` | ○ feel 層のテストに |
| `drums/gen2/src/lefthat.py` | **(a)** | ハット開閉の状態機械（`ensemble.py:1747-1755`） | ○ M2 で「枠だけ」だった分 |
| `ensemble.py:1520-1597` fill_variation（意図メニュー20候補×正規化レーベンシュタイン τ=0.34＝実効 ~12） | **(a)** | 好評（`HANDOFF-NEXT.md:18`）。`fill_auto_variation` 既定 False | ○ 「複数案を出す」機能全般に転用可（配札 S2 の候補分散） |
| `ensemble.py:1494-1541` fill_marks／`AIM_PRESETS`（意図空間の名前付き点・形の辞書ではない） | **(a)** | 「ここにフィル」好評。未決＝名前同士が近い（`:24`） | ○ otomemo の `bodyDepth/bodyDensity` にプリセット名5つを足すだけ。位置は cue（案C） |
| 自動シーム（`:1637-1650`・md5 で 1/4 は「息継ぎ」） | **(a)** | 「N 小節ごとに必ずクラッシュ」の機械臭回避 | △ cue 無しフォールバックの既定に発想だけ |
| `drums/src/`（gen1） | **(c)** | git 1コミット・sys.path は gen2 のみ。手書きリテラル表 | 移植しない（drumLibrary 32型で足りる） |
| `fills.py` の kind 選択（辞書） | **(c)** | 耳「わざとらしい」却下→bodyfill。otomemo は B6 で併存 | 移植済み・併存 |
| `fill_section_bars=3` の四肢衝突 8/108 | 向こうのバグ | `HANDOFF-NEXT.md:26`。機構はフィル同士の脱衝突が無いこと（推定・未再現） | 移植しない（cue 方式では隣接フィルは人が置く） |

### §4-3 ピアノ（23,142 行・**R1 で最大の訂正＝コンピング生成器を落としかけていた**）

**系譜**：`generate.py`（gen1・music21）→ `gen2/`（naive vs 理屈・和声供給）→ `comping/`（手書き9テクスチャ・耳不合格）→ `fingersim/fingersim.py`（Parncutt 物理プランナ・耳初合格）→ `fingersim_rhythm.py`（不合格）→ `fingersim_twohand.py`（物理がバリデータ化＝失敗形2度目）→ `gesture/p0〜p14`（14世代）→ **`fingersim/handframe.py`＋`handframe_band.py`**（反転アーキ）。

**役の事実（R2 で確定）**：バンドの鍵盤席は**4エンジンとも `comp` 席**＝`ENGINES:3553-3556`（`rock_comp_piano`/`gesture_comp_piano`/`gesture_lead_piano`/`handframe_piano` が全部 `_b_rock_comp`）・`_ROCK_COMP_ENGINE:3571-3574`・`default_parts:3615`（`Part("comp", comp_engine, …)`）・`_COMP_SEAT_ENGINES:3581`「EVERY keyboard comp seat」。**`BUILDER_MAP:1987-1991` の "comp"/"lead" はピアノの書き方の中の脇役/主役の呼び分けであって、このバンドに旋律席は無い**（`generate_lead_band` の中身も分散和音の波）。＝handframe（`handframe_band.py:1-22`「バンドのピアノパート＝RH テクスチャ＋LH 3rd/7th 殻」）も伴奏。既定は `piano_engine="legacy"`（`:317`・**リポ全体でこれを別値に上書きするチャート/ツールは無い**）・**handframe/gesture は 4/4 限定**（`:2112-2114`）。

**p11 の二重計上（R2 面B・逐行確認）**：バンドが通る `("comp","rock")→build_rock:587` は docstring（`:588-595`）自ら「`comp_steps = container.onsets − container.kick`…level/rng/b は非依存＝**legacy rock_piano と同性格**」＝**legacy sheet 分岐と同じ知識**。`KNOBS:157-189`・`STYLES:118-147` に **rock の行は無い**。耳で調律された知識（KNOBS・容器 DSL・軌跡・`_grade_slots`・neosoul/jazz/bossa/ballad の4フィギュア）は **p11 のソロ・ハーネス（`main:720`）でのみ稼働し、生存証拠は `GESTURE_P11_NOTES.md:3` のソロ A/B の耳**（BUILDER_MAP ではない）。

| モジュール | 札 | 根拠（file:line） | 移植 |
|---|---|---|---|
| **`gesture/gesture_p11.py`（1,114行）＝(1) バンド経路 `build_rock:587-618`** | **(a)+(d)** ＝ legacy と同じ知識 | `BUILDER_MAP` comp 席。`comp_steps = onsets − kick`・`accents` は role="anchor" で vel 加点・空なら slot 6,14（legacy の 1.5/3.5）・level/rng/b 非依存 | **legacy sheet 分岐と1本にまとめて移す（M6a）**＝二重計上しない |
| **同 (2) 耳付きの知識**＝**ジャンル別 16 ステップ容器 DSL**（`STYLES:118-147`：neosoul/bossa/ballad/jazz Charleston）・**崩し度**（`GRADE_CANDS`/`DEFAULT_GRADE:149-150`・`KNOBS:157-189`＝**3段（weak/mid/strong）×4ジャンルの12セル・キーはジャンルごとに違い共通は `freq` のみ**：neosoul `{freq,voices,traj,ghost}`・jazz `{freq,voices,traj}`・bossa `{freq,split}`・ballad `{freq,updown,hold_extra}`＝P10 の耳判定を数値化。`block` は KNOBS に行を持たない別扱い）・**手の軌跡4種**（`traj_ascending/descending/alberti/nearest:240-267`＝固定 bottom→top ロールの**正の対**）・**`render_bar` の vel 表**（`:276-340`：ghost 45／anchor 60／colour 53・アクセント 小節頭+7／拍+3／裏−2＝逐語一致・**vel は content に書ける**）・**`_grade_slots`**（`:352-368`＝密度を変えずに位置を回す）・**4ジャンルのフィギュア**（`build_neosoul:391/jazz:445/bossa:474/ballad:516`） | **(a)** ただし生存証拠は**ソロ A/B の耳**（`GESTURE_P11_NOTES.md:3`「neo-soul かなり良い・jazz 音楽的→維持、ボサ・バラードは割りすぎ→控えめに」・`gesture_p11.py:6-11`）。**バンドでは一度も通っていない**。**rock/pop の KNOBS 行は無い** | **○ M6b**。ハーネス（`main:720`・`write_notes:980`・診断 `:657-716`）は移さない。**J-POP 向けの崩し（rock/pop）は源流に無い＝自作＝耳未確認**（3択は M6b 冒頭で決める：neosoul の段を流用／rock は塊 stab のまま崩しは自作して耳で当てる／M6b では崩しを入れない）。負＝`render_bar` は小節ローカル描画でタイ不可（`how-piano-is-played.md:162-167`）。**逐行読了は M6b の着手条件**（今回は 118-200・587-618・関数一覧まで） |
| `gesture/gesture_p14.py`（2,464行） | **(a)+(d)・部分** | `generate_lead_band:516`＝handframe の置換対象（移さない）。**`generate_ballad_v3:388`＝耳GO（2026-08-09）を取った実物**（`SPEC-piano-band-unify.md:13`）・`_piano_line:341` 跳躍コスト表（ベース walking からの横断知識）・`swing_notes:245`（0.4→1.5:1／0.667→2:1 の較正＝feel 層の swing の根拠）・`CELLS:726` ボサ2小節セル5種＋surdo（辞書として chordLibrary に載る・「裏拍始まり・跨ぎタイ・先取り」）・イベント層（タイ・跨ぎ・`finger_held_at:146-155`） | △ 上の live 部分を列挙して移す。`generate_lead_band` と `main()/write_notes()`（約900行）は移さない |
| `fingersim/handmodel.py`（361行） | **(a)** | 全世代が import。**外部依存ゼロ・RNG ゼロ・「pure integers/floats」**（`:24`＝v1 の「整数演算のみ」は不正確）。Parncutt reach（`:52-63`・REACH6 `:167-179`）・**pianoplayer（marcomusy）由来の定数を verbatim 再現**（`:12-19` に出典明記）・反転アーキの3入口 `free_finger_reach:224`/`constrained_assignment:266`/`best_assignment:102` | **◎ 最優先・ほぼ機械翻訳**。`round()` 6箇所は `pyRound`。**pianoplayer のライセンス確認と帰属表示（`NOTICE.md` 前例）が着手前の作業**（§4-10） |
| `fingersim/handframe.py`（1,700行） | **(a)+(d)** | FEATURED「★本命」（`tools/FEATURED.txt:146`）。耳GO は **M1〜M3 時点の版**（`bb173cf`「M1-M3 all ear-approved」「Ear: back to good quality (2026-08-15)」）で、**HEAD の band-harmony fix と grab-grid は「Not yet ear-checked」**（同コミット本文）。RNG＝`rng.random()`（`:783` 手書き線形走査の top-k）と `skip_rng.random()`（`:1235`）の**2箇所だけ**（`choices`/`choice`/`shuffle` 不使用＝面C 実測） | **◎ バラード/リード席の中核**（HandFrame 状態機械 `:219-286`・7遷移・音価語彙 `:75-80`・境界クランプ `dur_end:293-313`）。**4/4 限定**。一致検証は `PyRandom.random()` で届く（§6-2） |
| `fingersim/handframe_band.py`（581行） | **(a)+(d)** | `ensemble.py:2051-2100`。入力＝トークン列・voicing・共有 RhythmSpec・**`bass_max`（スカラ1個）**。低域譲り＝帯の壁 `floor=max(bass_max+REG_GAP, PIANO_FLOOR)`（`:468`・定数 `:67-68`＝2／52）・ルートレス殻 `_shell_lift:127-140`・grab スロット（`:255-313`）・密度ラダー4段（`:315-359`）・共生成。**numpy を引く**（`gesture_p5`→`gesture_p2.py:67`） | **◎**（TS では numpy 不要）。ペダル `[(down,up)]`（`:516-521`）は dur 延長で近似＝followChords と排他 |
| `fingersim/phrase_arc.py`（109行） | **(a)** | 純関数。**ケルトの `arc_at` は意図的なコピー**＝「import するとピアノの調整が黙ってケルトの出力を変える」（`phrase_plan.py:184-190`） | ○ **関数の形は共有・調律値（peak/cadence/e_floor/e_cad）は楽器ごとに持つ**（v1 の「横断共有部品」は向こうの回避理由を逆転していた＝R1 面B）。Done に「ピアノの arc 定数を振ってもケルト出力が 1bit も変わらない」 |
| `gesture/chord_attack.py`（188行） | **(a)** | velocity-first attack（`:78-93`）。**`rng.gauss`（`:85,91`）**。POP909 は数値既定のみ（`:44`） | ○ ただし **ms は feel 層の管轄（B1）＝Python と一致させない**（`gauss_next` キャッシュの移植は不要＝面C） |
| `gesture/gesture_p2.py:12-21` 当て方4族／`gesture_p3.py:176-244` 隙間の作り方／`gesture_p5.py` 半分アタック | **(a) 知識** | p3〜p14 の根／候補集合からキック衝突スロットを落とす（生成時フィルタ）／オーナー直接指示 | ○ テーブル・規則・定数として |
| **`ensemble.py:2128-2161` legacy ピアノの sheet 分岐** | **(a) 既定で鳴っていた** | `piano_engine="legacy"` の既定経路。`comp_steps = onsets − kick`（`:2130`）＝**キックの隙間＋バックビートに刺す（rock 慣用・意図的）**・高音域。耳GO を取ったバンドクリップの中で鳴っていたが、**ピアノ単体の耳判定は無く、源流は「バンドの `rock_piano` は塊 stab のみ」と最優先の不足に名指し**（`HANDOFF-NEXT.md:22`）。`HANDOFF-NEXT.md:14`「ロックとても良い」はバンド全体（括弧内はベースの指標） | ○ 数十行・最安＝**M6a の最初の1本**（`build_rock` と1本化・低域譲りと同時）。「耳の実績あり」とは書かない |
| `gesture/gesture_p9.py` 装飾層（approach/enclosure/grace） | **(a) チェーン内** | p11 が間接使用 | △ グレースは格子外（§3-1） |
| `gesture/gesture_p0`・p1 ROLL・p4 OLD・p6/p8/p10 | **(c)/(b)** | p0 手書き台本／p1 固定ロール（却下）／p4 対照／p10 の崩しは p11 が上書き | 移植しない |
| `gesture/gesture_p12`・`p13` | **(e)** | v3 POC（`gesture_p14.py:5`「promotes the P13 reversal-POC」）＝p14 に吸収 | 移植しない |
| `fingersim/fingersim.py`・`fingersim_rhythm.py`・`fingersim_twohand.py` | **(c)** | 防壁3で import 禁止（`SPEC-piano-handframe.md:5`）／耳不合格／物理が眠る（`gesture_p7.py:6-7`） | 移植しない（負の知識） |
| `comping/comping.py`（767行） | **(c)** ただし `voice_chord:162` は **(a)** | `TEXTURES:232` は手書き・**handmodel を import しない＝物理層が無い**（失敗形1）。`voice_chord` は gesture 全世代が使う | TEXTURES は移植しない／`voice_chord` は otomemo の `voiceToTop`（`music.ts:723`）との差分のみ |
| `comping/smoke_build.py`・`transplant.py` | **(b)／(c)** | POP909 のリテラル音列を書き出す | 移植しない（§4-10） |
| `gen2/generate.py:228 build_voicing` | **(a) 部分** | `core/parts.py:45-46` が現役ロード | `voiceToTop` との差分のみ |
| `gen2/chordlib.py`（240行・58クオリティ） | **(a) ただし表に誤りがある** | `core/chordlib.py:12-13` が再エクスポート。**`11`（`:100`）・`13`（`:102`）・`maj13`（`:104`）が長3度と ♮11 を同時に含む＝avoid note の取り違え**。層B は `13`（`core/chordlib.py:132`＝11 無し）だけ正で、**`11` は層B（`:131`）も同じ誤り**。**otomemo の `QUALITY_INTERVALS`（`music-core/src/index.ts:98`）の `"11"` も `[0,4,7,10,2,5]`＝同じ癖**（`13`/`maj13` は 11 を省いている＝正） | otomemo は既に 34 クオリティを持つ（`index.ts:63`）＝**「本当に足りないか」を当ててから差分取り込み**。M6 の不変条件「avoid note 0」は**生成器が自分で積むボイシングだけに掛ける**（進行側の品質指定は対象外）。**既存の `"11"` は本アーク外＝backlog に1行（意図的 bit 破壊＋耳確認が要る）・黙って直さない** |
| `stress/*`・`piano/generate.py`（gen1） | **(b)／(c)** | 100% pass だが本体欠陥未修正／最古 | 不変条件6種の設計だけ／移植しない |

**ピアノの入出力契約（移植先で決めるべきこと）**：入力＝コード列・voicing・共有 RhythmSpec・`bass_max`・tempo・seed・arc。出力＝`(pitch,start,end,vel,hand,bar)`＋ペダル別リスト。**CC は持たない**→ペダルは dur 延長で近似（**followChords はコード境界で切って再ボイシングする＝`music.ts:952` 付近＝ペダル区間と排他にする**）。タイ・小節跨ぎ：handframe は跨がない（`dur_end` がコード境界でクランプ）。

**移す量の見直し（§7・R2 で再計算）**：p11 の非ハーネス部 612 行から P8 再エクスポート（`:79-104`）・診断 60 行（検証器へ）・`build_block`＋`build_rock` 約 50 行（legacy と重複）を引くと**新規に運ぶコンピング知識は約 450〜500 行**。合計＝legacy/build_rock 数十＋p11 約 500＋handmodel 361＋handframe 1,700＋band 581＋phrase_arc 109＋p14 live 約 300＋organ 規則 ≒ **約 3,700 行（上限＝移植作業量ではない）**。行数は価値の代理にしない（§7 に RNG 消費点数・content 外出力数の列を足した）。

**負の知識（§4-9 へ）**：手書きテクスチャは物理が甘いと何でも通す／逐語コピーは不可／両手独立は初心者的／物理が発火しないバリデータ（2度）／固定ロールは機械的／小節ローカル描画はタイ不可／等間隔サンプリングは形の同一性が無い／「崩しの程度」1軸は軸違い／**反復は和声リズムが速いと耳に立たない**（`GESTURE_P13_NOTES.md:11`）／**耳で調律した定数を楽器間で共有しない**（`phrase_plan.py:184-190`）。

**otomemo との重なり**：アレンジ S1 が **chordLibrary 45型＋オルガン5型＋followChords＋複数小節テンプレ**を持つ（design.md:545-563）。オーナーの残不満「棚が静的では対応幅が狭い・パターンも動的に出したい」（design.md:563）に対する S2 の答えとして、**p11 の KNOBS（崩し度3サブノブ）と `_grade_slots`、handframe 生成器はまさに「動的に出す」経路**＝2アークの合流点（§3-2 (m)）。

### §4-4 オルガン

実装は **`ensemble.py` 1本**（`:2182-2664`・`organ_comp:2437`）。ピアノ handframe とは共有していない。

| 要素 | 札 | 根拠 | 移植 |
|---|---|---|---|
| sustain layer＝**掴みの探索規則**（v1 の「固定位相 +8分」は誤り＝R1 面B）：「区間頭から `attack_min_steps`（2）以上 `attack_window_steps`（4）以内で、**骨の onset かつキック以外**の最初のマス。1周目でキック回避・妥協した場合は診断 `attack_on_kick` に数えて黙って通さない」（`SPEC-organ-sustain-layer.md:74,89`・実装 `:2496-2501`）／離し＝次の**実アタック**の 16分前（`:2513-2525`）／CC64 は使わない | **(d)** | 純関数だが **`Breath` を引数で受けて start/vel に入れる**（`:2584-2593`）＝移植時は注入しない（feel 層へ）。機械受け入れ 28 テスト fails 空 | **○ 規則ごと移す**（形＝step 2 は譜の偶然）。otomemo の `OG-PAD` に規則を当てる（新設しない・(m)） |
| idiom layer **D3（ルート抜き open voicing）＋D5（共通音タイ）は対で** | **(d)** | `AUDIT-organ-musical.md:16` 声部移動 21→53 に後退・`:131`「D3 のルート抜きは和声の色には正しく声部連結には有害・**D5 は D3 のせいで発火機会が減った**」＝D5 は D3 の副作用を打ち消す機構（R1 面B） | D3 単独は持ち込まない（v1 の誤り）。**D3+D5 を対で**＝otomemo の followChords（境界で切って再ボイシング）が同じ穴に落ちうる＝設計メモ。D4（vel 平坦化）は研究どおり・D2（CC11）は不採用 |
| `docs/research/organ/01-03` | 事実 | otomemo の研究 doc とほぼ同内容 | 差分（掴み規則・Al Kooper の8分遅れ）だけ |

負の知識：「色（音高）だけ変えても時間設計を変えないと耳は動かない」（`CRITIQUE-organ-celtic-round2.md:40`）／「MIDI 差≠音の差」（`:115`）／FluidR3 のオルガンは押しっぱなしでも 5〜6dB 減衰（`AUDIT-organ-musical.md:183`）。

### §4-5 ギター（3,849 行）

**gen1（`riffgen.py`+`theory.py`）＝(c)**：誰も import しない・「音高を先に決めて運指は事後表示」＝バリデータ失敗形。移植しない。

| モジュール | 札 | 根拠 | 移植 |
|---|---|---|---|
| `gen2/chords/chordfollow.py`（244行）＋`chordtheory.py`（171行・32品質・スラッシュ） | **(a)** | `load_guitar:164-177` が掴む。`chords/ACCEPTANCE.md:50-51` 24候補 PASS・`BREAKAGE.md:46` incidents None。stress 0 failures（件数は doc 600×5 と成果物 n=200 が食い違う＝引用しない） | ○ ベース chord_follow とは別設計（類似度 0.06）。**`f2c3241` で撤去されたアプローチ分岐（`chordfollow.py:151-159`・`shapefollow.py:87-90`）が到達不能のまま残置＝機械的に翻訳すると TS で復活する→翻訳前に落とす** |
| `ensemble.py:2678 _lock_guitar_chug_to_sheet`・`_GTR_GATE:2675`・POWER8 chug `[0,7,12]` | **(a)** | 3分岐（昇格／MONO→POWER8 上書き／挿入）・アクセント権限を譜の `a:` に一本化・ghost/dead 不可侵。RNG 不使用 | ○ M5。**ただし「MONO→POWER8 上書き」はヒット単位のボイシング切替＝現行 `ChordVoicing` は content 単位・`ChordHit` は `{step,dur,vel,dir}`（`music.ts:657-671`）で表せない＝content 形の裁定（§8-2）後**（R1 面C）。昇格／挿入／アクセント一本化は先行可 |
| `gen2/riff.py`（3文法）・`subfeel.py`・`theory.py`・`GAIN_SAFE_INTERVALS={0,7,12}` | **(a)** | `load_guitar` が掴む | ○ chordLibrary ギター型に役割注記付きの文法セル／定数 |
| `gen2/handshape.py`+`shapeline.py`+`chords/shapefollow.py`（反転アーキ・778行） | **(d) 耳未判定** | `19c405a`「Ear status: not yet judged」「closer to "chunkier chords" than "the hand is choosing freely"」。`BREAKAGE-handshape.md:46-59` 14件（grammar 0件）。r3 で「重みを振っても出力が変わらない＝バリデータ」を実測発見・修正（`SPEC-guitar-handshape.md:180-190`） | **設計思想（フォーム＝状態・`Tuning` からフォーム DB を導出・移動時間ゲート・層状 Viterbi・緩和ラダー）のみ**。重み・定数は移植しない。**摂動テスト（重みを振ると出力が変わる）は全ソルバの必須テストに格上げ**（§6-4） |
| `gen2/graph_line.py`（81行・自前層状 DP）・`fretboard.py`（`Tuning`・B弦 +3 補正・`valid_root_strings`） | **(b) だが再利用価値大**／**(a)+(d)** | ensemble 未ロードだが bass の networkx 版の上位互換 | ○ 4弦/6弦共通の指板ソルバの土台（(d)） |
| `gen2/naive.py`・`diverge.py`・`metrics.py`・`stress/*` | **(b)** | 藁人形／防壁1に反する／測定器／独立オラクル（`oracle.py:1-18`） | metrics と stress の設計だけ |

**(d) 共通化**：`Fretboard(tuning)`＋`Form` 集合＋`solve(layers, dts, weights)` を共有し、フォーム集合と許容 pc だけ楽器で差す。**ギター側を一般化して4弦を乗せる**。重み差（1.4 vs 1.2・閾値 4 vs 5）は楽器パラメータ。**差を作る項は床に潰されない場所（節点）に置き、同点タイブレークは id 順にしない（seed 由来の決定的タイブレーク）**（`SPEC-guitar-handshape.md:180-190` の教訓＝§4-9）。

### §4-6 統合層・core・solo・robustness

| モジュール | 札 | 根拠 | 移植 |
|---|---|---|---|
| `ensemble.py` 譜ロック3分岐・隙間刺し・`band_overlap:3225`・`coverage_metrics:3250`・フィル意図メニュー | **(a)** | §2-2・§4-1・§4-2 | 知識＝○／検証器＝○ |
| `Breath:896` | **(a)** | 相関ノイズ（i.i.d. 却下＝`SPEC-ensemble.md:13`） | feel 層の将来（backlog）へ・今回×。`organ_comp` への注入も外す |
| `build_chart:3822`・`ENGINES:3545`・`default_parts:3591`・`Chart`（33）・`_load_isolated`・ステム/ミックス/LISTEN/CLI・A/B 梯子 18 チャート・`seed_alias` | 統合／配線／デモ | 問い合わせ口なし・ctx は一方向（`:3838-3846`）・`jazz_drums` の `head_times` は未使用 | **移植しない** |
| `core/chart.py`（`Meter`・`Feel`・`RhythmSpec`・`Part`・`ROLES`） | **(a)** | `RhythmSpec.__post_init__:209-273`＝「非 onset の grab は沈黙で切り捨てず ValueError」等 | 契約の思想（「ユーザーの指示が黙って消えない」）だけ |
| `core/chordlib.py` 層B（25クオリティ×スケール整合） | **(a)** | walking の要石。`13` は層B が正（§4-3） | ○ 参照表 |
| `core/parts.py`（`walking_bass_adapter:391` 6/8 スロット `(0,2,6,8)`・`core_surdo_bass:181`） | **(a)/(d)** | ensemble は呼ばない | walking の 6/8 スロットは○ |
| `core/demo.py`・`audio.py` | **(b)／レンダ** | 誰も import しない／全編配線。`demo.py:254` は `--out` の親へ LISTEN.md を書く G2 同型の未修正欠陥 | × |
| `solo/solo.py`（775行） | **(a) だが耳未確定・Part 契約の外** | `CONCEPT.md:82`。フレーズ弧・5リズム細胞＋間・モチーフ提示→変奏。`phrase_arc_rate` は naive と分離しない（`ACCEPTANCE.md:44-48`＝自己否定）。G1/G2 は修正済み（`solo.py:90-114,625`） | **今回射程外**（枝1）。将来 `gen_solo` の材料としてポインタ |
| `robustness/harness_new.py`（追跡済み） | **(a)** | ケース毎サブプロセス＋`RLIMIT_AS`・graceful は ValueError のみ・80ケース 21→0。残課題4 | ○ 入力ファズの設計（`/music/*` 入口に同型のケース表）。スクリプトは× |

### §4-7 ケルト（3,407 行・オーナー「行けるなら入れたい」・**R1 で耳判定を訂正**）

**世代**：`src/celtic_gen.py`（gen1）＝(c)。`gen2/celtic_gen2.py`＋`gen2/src/phrase_plan.py`＝(a)。gen2 内でも `gen_part_naive`＝(b)・`gen_part_theory`（ランダムウォーク）＝(c)+(d)（A/B 相手として残る）・**`phrase_plan.plan_part`＝現行到達点**。

**耳判定（v1 の「未記録」は半分誤り＝§4-0 の慣行を知らなかった）**：

| ラウンド | 耳の言葉（原文） | 出所 | 判定 |
|---|---|---|---|
| v1（planner 導入） | 「まあ良いけど」の「良い」の中身＝v1 が本命の改善（`AUDIT-jig-musical.md:19-21`） | 監査 | ○ |
| v2（根音着地） | 小さいが本物の改善（`:23`）。ただし「小節頭で根音を踏む率は品質と逆相関＝この指標を追ってはいけない」（`:28-31`） | 監査 | △ |
| round2（ジグ密度・リール装飾） | **「ジグは悪くない・リールはよくない」** | `research/celtic/04-same-pitch-repetition.md:12,100-104`（コミット `6db2dd2`・`4e60377` 本文にも） | **ジグ○・リール×** |
| v4（同音連打） | 「実データが明確にいい。ジグもリールも基準になる音に対して上下の反復をする。今の動きは動きのエッセンスはあるものの**軸が無い**」 | `research/celtic/05-axis-tone.md:3-4` | △（→ v5 軸音の動機） |
| v5（軸音・`d885828`） | 記録なし（`FEATURED.txt:2-4`「★今の焦点…効く箇所が16箇所中1箇所」） | — | **真に未記録はここだけ** |

**リールが「よくない」最有力の原因＝slur の欠落**：コミット `6db2dd2` 本文「the reel's missing slur mechanism (research's biggest idiom gap) — the melody has zero slurs anywhere, which research names as THE core reel-drive technique」（実装ゼロ）。加えて `AUDIT-reel-ornament-musical.md:143-151`「2/2 の大拍を一度も表現していない・スラーが1つも無く弓のつなぎ方が最大の未着手レバー」。**slur は装飾ではなく articulation＝dur とタイで content に載る**（§3-1）。

| 知識 | 場所 | 札 | 根拠 |
|---|---|---|---|
| 線の計画（アンカー＝半小節頭・音型語彙12種の閉じた成立式・方向の慣性・重み積） | `phrase_plan.py:362-364,462-631,1147-1268` | **(a)** | 外部依存ゼロ（`:19`）。**ただし RNG 駆動**＝`rng.choices(weights)`（`:1220`）＋`getstate/setstate` でストリームを複製（`:912-914`）＝v1 の「同順＝データ一致◎」は誤り（§6-1） |
| ジグ 6/8 リズム表（lilt/flow/rolling）・リール 4/4 表 | `:326-328,343-344` | **(a)** | rolling が現行推し。lilt＝content |
| 軸音（役割分布 root .45/fifth .35/third .20＝O'Neill's 実測の正規化） | `:147,856-999`・研究05 | **(a) 耳未記録（v5）** | 一般則として J-POP にも効く |
| 同音連打3型（restrike/double/pedal4） | `:592-629`・研究04 | **(a) 耳あり（ジグ○・リール×）** | 置き場所の実測（ジグは半小節頭・リールは内側の拍） |
| 弧 e(τ) | `:217-223` | **(a)** | ピアノ `phrase_arc` の意図的コピー（調律値は共有しない） |
| 装飾（cut/roll） | `celtic_gen2.py:318-338` | **(a) だが格子外** | 落とす |
| 弓3連 treble | `phrase_plan.py:1320-1382` | **(d) 負の結果** | `AUDIT-reel-ornament-musical.md:113`「長音 0 個…線は詰まった」・`CRITIQUE-organ-celtic-round2.md:88`「2〜7dB 小さい」 |
| breath feel・reel swing・jitter | `celtic_gen2.py:539-594,372,526-528` | **(d) 仮説** | 演奏レイヤー |
| 伴奏（bodhran/pedal/drone/sheet 版） | `ensemble.py:3091-3179`・`irish_jig_band:513` | **(c)+(a)** | 旧手書き3本は後継あり |
| コード内コメントの O'Neill's 断片 | `phrase_plan.py:346-347,407,413-414,604` | 著作権メモ | PD 由来だが**移植時にコメントから実曲名と ABC 断片を落とす**（§4-10） |

**判定（§8-1 の材料）**：ジグは耳○・技術リスク低（stdlib・決定論）だが天井は「音数と速さ」（`AUDIT-jig-musical.md:40-48`）。**リールは耳×で、芯（slur）が未実装**＝入れるなら slur 実装が前提条件。バンド経路は AA' しか作らない（`ensemble.py:2984-2988`）＝AA'BB' は `build_candidate` 側を採る。**耳判定は「未記録」ではなく「割れている」**＝裁定はジグ／リールで分ける。

### §4-8 quality_eval（正典外）と評価観の照合

- **LLM 判定はゼロ件**（grep 実測）。思想も同じ（`CONCEPT.md:41`・`CLAUDE.md:23`）。**otomemo の評価観と衝突しない＝同じ思想の先行実装**。
- コーパス由来の重みは **order-0＋per-drummer＋リテラル非保存**（`extract_texture_prior.py:5-7`）。
- 測り方の4分類が実装されている：ゲート（**陰性対照つき**）／by-construction（`bass_sheet/verify_and_render.py:89`「tautological, not quality」と自認）／診断（`pass=None` 枠）／耳（A/B）。
- **持ち込むと危険な癖3つ**：①ゲートと診断の境界がブレる（`handframe_m2/run_m2.py:343` は形の要求をゲートに）②**自己参照 oracle**（`STRESS_AUDIT.md:96-115`「`maj7` を壊しても 0 failures」）③緩い許容集合（blues license 12音中10音→撤去で 0.653%→0）。
- 再利用できる純粋な計測：低域衝突（`piano_lo − bass_max > 0`・`band_overlap`（`ensemble.py:3225-3240`）は `overlap_frac` と `gap_semitones` を**返すだけで閾値を持たない**。源流の実ゲートは `gesture_p14.py:1143-1144` の `overlap_frac <= 0.10`。v2 の「0.34」は `_FV_TAU:1529`＝フィル近重複の閾値の取り違え＝削除）／同時打鍵とペダルのリングを分けて数える（`run_wave1.py:246-252`）／四肢・スティッキング≤2・バウンス減衰／フィル着地／跳躍・波形／サステイン衝突（`sustain_clash_count`）／密度ラダーの単調性。
- 移植不要：fluidsynth・gallery・`git show HEAD:` バイト等価（相対参照＝腐る）・`__defaults__` 内省。**「別プロセス決定論」は TS では空振り**（PYTHONHASHSEED に対応物なし＝面C）→ §6-3 で置き換え。

### §4-9 負の知識（横断・design (p) へ・R1/R2 で 11→16 項）

1. 物理層が「何でも通すバリデータ」に堕ちるとテンプレ・スタンパー（ピアノ2度＋ギター r2）。**検出法＝コスト重みだけ動かして出力が変わらなければバリデータ**。
2. 逐語コピーは不可（グリッド不整合・ライセンス・発散ゼロ）。
3. 機械指標を報酬にすると同じ場所で止まる（`jig_lilt_ratio`・小節頭ルート率・`phrase_arc_rate`・v2 walking の跳躍量）。
4. 辞書（kind カタログ）は「わざとらしい」。ただし辞書の良さも認め併存（B6）。
5. 一様乱数のヒューマナイズは「わざと臭い」→ 相関ノイズ／声部別の系統オフセット（絶対 ms）。
6. 色（音高）だけ変えても時間設計を変えないと耳は動かない（オルガン）。MIDI 差≠音の差。
7. 楽器で慣用が違う（ベースの半音接近はギターでは「聞かない動き」）。
8. 「聴き合い」の配線が名目だけの例（`jazz_drums` の `head_times`）＝形だけ移さない。
9. 自己参照 oracle・緩い許容集合・ゲート/診断の混同。
10. ケルトの天井は音数と速さ（装飾を足すと長音が消える）。
11. kick ロック (c) 挿入は同期100%・補完0%＝沈黙のジャンルと相性が悪い。
12. **耳で調律した定数を楽器間で共有すると片方の調整が黙ってもう片方を壊す**（向こうは `phrase_arc` をあえてコピー＝`phrase_plan.py:184-190`）。
13. **差を作る項が床に潰され、同点タイブレークが id 順だと 3音形が 0 件になる**（`SPEC-guitar-handshape.md:180-190`）＝節点コストに置き・seed 由来の決定的タイブレークに。
14. **反復（2小節テンプレ・cell repeat）は和声リズムが速いと耳に立たない**（`GESTURE_P13_NOTES.md:11`）＝J-POP の既定進行では原理的に聞こえない可能性＝型に適用条件を持つ。
15. **ルート抜きは和声の色には正しく声部連結には有害＝共通音保持と対で使う**（`AUDIT-organ-musical.md:131`）。
16. **数値の出所を取り違えない**＝`0.34` はフィル近重複の閾値であって低域衝突のゲートではない（R2 面A の発見）。ゲートに置く数値は出所の行を必ず引く。

### §4-10 コーパス・コード由来の定数・ライセンス

| 素材 | 所在 | ライセンス | 読むコード | 移植への含意 |
|---|---|---|---|---|
| GMD | `data/quarantine/GMD/` | CC BY 4.0（PROVENANCE あり） | `bodyfill.py`・`extract_texture_prior.py`（order-0） | 裁定済み・移植済み（`gmdPrior.ts`・`NOTICE.md`） |
| POP909 | `data/quarantine/POP909/` | 研究ライセンス | `piano/comping/smoke_build.py`・`transplant.py`（リテラル書き出し） | 移植対象外 |
| thesession | `data/quarantine/thesession/` | ODbL＋ミラーの LLM 利用禁止条項 | **0件** | 触らない線を維持 |
| O'Neill's（7曲 ABC＋WAV） | `quality_eval/oneill_reference/`（gitignore・PROVENANCE 無し） | 1907＝PD（転写物 folkies/oneill のライセンス未記録） | 0件（耳の参照のみ） | 移植しない。**研究 doc とコード内コメント（`phrase_plan.py:346-347,407,413-414,604`）の実曲名・ABC 断片は移植時に落とす** |
| PIG | `data/quarantine/PIG/` | 未取得（空） | — | 依存なし |
| **他者コード由来の定数（R1 面B 追加）** | `handmodel.py:12-19`＝**pianoplayer（marcomusy）`hand.py` の `frest`/`weights`/`bfactor`/最大ストレッチ閾値を verbatim 再現**＋Parncutt 1997 の reach 表 | pianoplayer＝**要確認**（OSS のライセンス種別と帰属表示の要否）／Parncutt＝学術論文の数値表（出典表記） | M6-6a＝移植の最優先項目そのもの | **着手前に調べ、`NOTICE.md`＋コード定数（`GMD_ATTRIBUTION` 前例）で処理**。調べずに移すと後で剥がせない |

---

## §5 移行計画本体

### §5-1 番号の扱いと順序の根拠（R1/R2 で改訂）

**M0〜M3 の番号は活かす**。**M4 以降は作り直す**：M4＝検証器（横断・M3 と並行）、`band` 契約と低域譲りは最初の消費者と同じ段へ。**M6 は3段に割る**（M6a＝裁定不要・M6b/M6c＝§8-2 の裁定後）。順序の根拠＝(i) ギターはベースと指板/chordfollow/錨ロックの基盤を共有＝M3 直後 (ii) ヒット単位ボイシングは `ChordHit` の additive で解け §8-2 に依存しない（§8-2 で②③に落ちた場合だけ M6c に回収段を置く）(iii) 鍵盤は置き場の裁定と RNG spike の結果が先に要る (iv) ケルトはジグ／リールで裁定が分かれる。

**着手可否（R2 の3面判定）**：**M3・M4・M6a は今すぐ着手可。M5 は M3 の後。M6b・M6c・M7 は §8 の裁定待ち。**

### §5-2 マイルストーン

```
M3(ベース本体：3g py-parity → 3a…) ─→ M5(ギター) ─→ M6a(裁定不要) ─→ M6b(p11 耳付き知識) ─→ M6c(handframe/オルガン/p14) ─→ M7(ケルト)
   ∥ M4(検証器・横断)          ∥ RNG spike(半日・3g 依存)        M7 のメロ側は M6 と独立（並行可）
```

#### M3 ベース本体（着手中の続き・**着手前の5点は埋めた**）

**着手前に決めた5点（R2 面C）**
1. **anchorLock の体＝style 型の16分格子**（`bassLibrary` の型＋3c で足す grammar セル3型）。kick step にルート錨を置き、**非 kick セル（リフ本体）は無傷**＝「リフ無傷」はこれで定義できる。**style とは併用・kickLock とは排他**（型格子と kickLock の二重適用禁止＝design.md:394 と同じ理由）。style 未指定時は grammar セル既定（`pedal_answer` 相当）を体にする。`relative:true` との組み合わせは絶対で返し `relativeFallback:"anchor-lock"` を添える。
2. **アクセントは M3 では持たない**（otomemo の skeleton は kick/snare のみ＝M0 契約 §5-2）。源流の (a) accent 昇格は「錨に昇格」まで・案B つまみは **`strong`（`gstep%4===0`）のみ**＝「拍頭でない無音キックはベースを休む」の意味で実装。将来ドラム content の hit 別 vel が入ったら accents を導出（backlog）。
3. **錨のコード読みは step 粒度**＝anchorLock 内に `chordAt(t)`（`generate.ts:431`・小数 t を受ける）を `Math.floor` せずに呼ぶ読み手を持つ。既存 `rootAtBeat`（`:1140`・拍量子化）は触らない（style 経路の bit 一致）。
4. **3g（py-parity）を 3a より前に置く**。dump スクリプトに venv（`experiments/bass_rock_riff/.venv/bin/python`）と sys.path の順（`~/projects/phrase_maker` → `/core` → `/experiments/ensemble` … ＝`ensemble.py:62-69` の挿入順を再現し、**`import walking_v2` が core/ を先頭に挿す**ことを前提に書く）を焼く。ケース表はコミット。
5. **engineVersion の置き場**＝music-core 定数 `PM_ENGINE_VERSION`（`rngSalt.ts` と同居）＋**新経路使用時のみ** content に `engine:{version}` を載せる（M0 契約 §2 の形・既定経路はキーを生やさない＝bit 一致）。

- **Scope**：3g py-parity（Python dump＋TS 比較ヘルパ＋ケース表）→ 3a `anchorLock` 第三経路（3分岐＋案B つまみ・既定 OFF）→ 3b chord_follow の5ガード＋層B 25 クオリティ表（otomemo の 34 クオリティ `index.ts:63` と当ててから差分・`11` は層A/B とも正としない）→ 3c grammar セル3型を bassLibrary に anchor/role 注記付きで → 3d `JZ-WALK`（v2 候補生成＋v3 規則3本を制約＋乱数タイブレークを決定的規則へ・4/4 と 6/8 スロット `(0,2,6,8)`）→ 3e 指板検証（ギター gen2 の自前 DP を一般化・負数 `%` は `normRoot`）。3f 奏法（ベンド）は落とす。
- **到達口**：`/music/gen_bass`・MCP `gen_bass`（どちらも `drums`/`chords` を既に受ける＝`mcp.ts:782`・`http.ts:273`）・`/gen/section`（`b.bass` 素通し `http.ts:481`＝型だけ）・web TinkerSheet「細かく（ドラム絡み・分数）」（`TinkerSheet.tsx:456-470`）に seg 1つ。**4口すべて**。
- **Done**：anchorLock・JZ-WALK が4口から呼べる／既定は 1bit も変わらない／py-parity が動きケース表がコミットされている／`PM_ENGINE_VERSION` が刻まれる／引き継ぎ書の表を更新。
- **受け入れ**（分類はコメントで持ち、型化は M4 で被せる）：`gate`＝W1〜W5・INV1〜6・bit 一致（3スイート）・データ一致（anchorLock・chord_follow＝RNG 不使用）・変異検査（**この段で有効な変異＝出力に注入**：錨を1つ削る／錨を1半音ずらす／seed を無視して同一出力＝それぞれ落ちる不変条件が1つ以上）・JZ-WALK の摂動テスト（規則の重みを振ると出力が変わる）。`byConstruction`＝「全 kick step にルート錨」「非 kick セル無傷」「境界接近」「禁則 0」＝被覆率（錨が置かれた step／kick step 総数・制約が働いた候補数／候補総数）を数値で出す。`diagnostic`＝回復率・compound・7→3・walking の Python 参照（seed 固定1本・Breath が乗っているので差分の出所に注意）。耳＝作曲で。
- **撤退**：技術的破綻のみ→opt-in のまま凍結して次へ。

#### M4 検証器（横断・M3 と並行）
- **Scope**：`band_overlap`＝**`gap_semitones>0` をゲート・`overlap_frac` は診断**（源流の実ゲート値を引くなら `overlap_frac<=0.10`＝`gesture_p14.py:1143-1144` gate8）／四肢衝突をグルーヴ全体へ適用拡張（`drumFill.ts:351-380` は移植済み）／`coverage`／`microtiming_structural`／`Math.random|Date.now|new Date|crypto.` の grep ゲート（現状 0件）／**ゲート型を戻り値で強制**（§6-4 #8）／music-core 共有関数が api・web 双方から同じ入力で同じ出力（二重実装の番人）。
- **既存資産を落としても直さない**：drumLibrary 32型・chordLibrary が新検証器で赤になっても、型を直さず診断に記録＝直すかは耳（オーナー）。
- **Done**：検証器が陰性対照つきで緑。**受け入れ**：機械のみ。**撤退**：なし。

#### M5 ギター
- **Scope**：5a `_lock_guitar_chug_to_sheet` の昇格／挿入／アクセント権限の一本化を chord_pattern のギター型に additive。**MONO→POWER8（ヒット単位ボイシング）＝`ChordHit` に additive フィールド（例 `voice?: "mono"|"power"`・`vel?`/`dir?` と同じ前例）で解く＝§8-2 に依存しない**。§8-2 で②③に落ちた場合の回収は M6c に1項目／5b chordfollow（**撤去済みアプローチ分岐 `chordfollow.py:151-159`・`shapefollow.py:87-90` は翻訳前に落とす**）＋chordtheory（層B と重複分は共通化）／5c riff 3文法を役割注記付きで／5d `Tuning`・フォーム DB 導出・B弦補正・`GAIN_SAFE_INTERVALS`／5e handshape は枠のみ・重みは移植しない・アプローチトーンは持ち込まない／5f フォールバック通知。
- **並行＝RNG spike（半日・3g に依存＝順序を明記）**：`PyRandom` に `choices`（accumulate＋bisect_right）と `getState/setState` を足し（`gauss` は不要）、CPython と 10,000 ドロー×seed 10本で一致確認。結果がそのまま M6 冒頭の判断材料。
- **到達口**：`/music/gen_chord_pattern`・MCP・`/gen/section`・web ChordPatternEditor の guitar 型。
- **Done**：ギター型が骨に錨を置いて鳴る／指板ソルバが4弦・6弦で同じ DP／engineVersion／**ギター型に絶対 notes を載せる道を選んだ場合は配置時の調の扱い（`music.ts:1174-1183`）を先に決めている**（R2 面C n3）。
- **受け入れ**：`gate`＝データ一致（chug ロック・chordfollow）・強拍 CT・演奏可能・非整合音 0・bit 一致・摂動テスト（handshape 枠）。handshape 枠は耳未判定と明記して opt-in。
- **撤退**：handshape 枠が摂動テストに落ちたら凍結。

#### M6a 鍵盤・裁定不要の土台（**即着手可**）
- **Scope**：6a **legacy sheet 分岐と `build_rock` を1本化して移す**（`onsets − kick` の相補刺し＋バックビート・空なら slot 6,14）／6b **`band?:{bassTop}` 契約の凍結**（型スナップショット凍結テスト・粒度＝セクション1個のスカラー＝源流の `bass_max` と同じ）＋低域譲り＝生成時に `ChordVoicing.floor?` へ焼く（opt-in・`voiceToTop` にクランプ1つ・**後からベースを変えても床は付いてこない＝作り直し**）／6d `handmodel`（データ一致・**pianoplayer のライセンス確認と `NOTICE.md` 帰属を着手前に**）。
- **到達口**：`gen_chord_pattern`（HTTP/MCP）に `chords`（optional）と `band.bassTop` を足す／`/gen/section` に `chord:{...}` 枝を新設。
- **Done**：`band` の型スナップショットテストが緑／bass 先行の `/gen/section` で低域衝突ゲート（`gap>0`）が opt-in 時に緑／`handmodel` ゴールデン一致／3スイート緑／engineVersion。
- **受け入れ**：`gate`＝データ一致（handmodel）・`gap_semitones>0`・bit 一致・変異検査（床を無効化して落ちること）。`diagnostic`＝`overlap_frac`。

#### M6b 鍵盤・p11 の耳付き知識（§8-2 の裁定後）
- **冒頭で決める（M6b 着手条件）**：①p11 の逐行読了 ②**rock/pop の崩し**＝(a) neosoul の段を流用／(b) rock は塊 stab のまま・崩しは J-POP 向けに自作して耳で当てる／(c) M6b では崩しを入れない、の3択（「耳で調律された数値を運ぶ」の建前が rock/pop では成立しないことを明文化してから）。
- **Scope**：容器 DSL（4ジャンル）・KNOBS（12セル・名前付きプリセット・連続ダイヤルに畳まない）・手の軌跡4種・vel/アクセント表（vel は content・**vel の揺れはデータ層のまま otomemo の既存 Rng**）・`_grade_slots`・4ジャンルのフィギュア。ハーネスと診断は移さない。
- **Done**：ソロで p11 候補が鳴り別案で md5 相異／ボサ `split`・バラード `updown` が UI から選べる（プリセット名）／web 7箇所（②の場合）が `isChordPattern` を壊さず配置時の調の扱いが決まっている。
- **受け入れ**：`gate`＝out-of-chord 0・**avoid note 0（生成器が積むボイシングのみ）**・候補相異・摂動テスト・変異検査。`diagnostic`＝密度・声部移動量。耳＝作曲で。

#### M6c 鍵盤・反転アーキとオルガン（§8-2 の裁定後・プランB判断点）
- **冒頭の判断チェックリスト（測れる3項目）**：①spike が緑か赤か ②`handframe` の RNG 消費点数（実測 2）と `choices` 以外の件数（実測 0）③content に載らない出力の件数（ペダル・跨ぎ・hand 属性）。①赤かつ③多い→プランB＝**アーキ変更（architecture.md:52 に1行）なので実装前にもう一度報告する**。
- **Scope**：6e `handframe`＋`handframe_band`（4/4 のみ・numpy は TS で不要・HEAD の band-harmony fix と grab-grid は耳未確認と明記）＋`phrase_arc`（調律値は楽器別）／6f `chord_attack` の velocity-first＝**ms の揺れは feel 層・vel の揺れはデータ層**・どちらも Python 一致を要求しない／6g ペダル＝dur 延長（**followChords と排他＝ペダル区間は followChords を無効化**）・小節跨ぎは第一段なし／6h オルガン＝掴み規則（キック回避＋`attack_on_kick` 診断）＋D3+D5 対＋D4 を `OG-*` 型へ差分で／6i p14 の live 部（`generate_ballad_v3`・跳躍コスト表・ボサ5セル・swing 較正→feel 層）／6j §8-2 が②③の場合＝M5 で切り出した MONO→POWER8 の回収。
- **Done**：バンド（bass 先行）で低域衝突 0／別案で md5 相異／**ピアノの arc 定数を振ってもケルト出力が 1bit も変わらない**／engineVersion／3スイート緑。
- **受け入れ**：`gate`＝`handframe` は `PyRandom.random()` で参照一致（`math.exp` ULP の反転は個別検分）・可弾（MaxPrac 逸脱 0）・片手 ≤4・out-of-chord 0・avoid note 0（生成器のボイシングのみ）・摂動テスト・変異検査（m1＝重みを全部同じに＝この段で有効）。耳＝作曲で。
- **撤退＝プランB**：条件は §2-4 C。**その場合も M6a は TS**。
- **判断チェックリスト①②の実測（2026-09-13・RNG spike `ee571ab`＋独立監査 `audit-m5-spike`）**：
  - ① spike＝**緑**。CPython 3.12.13 と seed 10本×1万ドローで `random()`・`choices`（全形）・`getstate/setstate` が全一致。別 seed の抜き打ちと参照 JSON の焼き直しバイト一致も監査で確認。
  - ② `handframe.py` の乱数は **`rng.random()` のみ**（`randint`/`randrange`/`shuffle`/`sample`/`choice`/`choices` は不使用）。seed は md5 先頭8桁＝2^32 未満＋32bit XOR＝**TS の対応範囲内**。`handmodel.py` は乱数不使用。
  - **訂正＝「`gauss` は不要」は鍵盤では成り立たない**：`handframe_band.py` は `humanize=True`（既定・rock/pop も既定 True・`ensemble.py:2087` もこの既定）で `chord_attack.py:85,91` の `rng.gauss()` を1音2回使う。ただし**打鍵の揺れ専用の別の乱数の流れ**で本体と混ざらない＝**本体は Python と bit 一致、揺れは otomemo 側の乱数へ置換**（ms の揺れは feel 層・vel の揺れはデータ層＝6f の既決と整合）。`PyRandom` に `gauss` は足さない。
  - 注意＝`PyRandom` は 2^32 以上・負数の seed を**例外なしで黙って丸める**（実測で0ドロー目から不一致）。移植経路では出ないが、入口で弾くガードを M6c で1つ置く。

#### M7 ケルト（§8-1 の裁定後）
- **Scope（ジグ）**：7a メロ側＝`phrase_plan` 層B を genMelody の新経路として（**既存 `style:"irish"` 統計との関係＝置換か上乗せかを先に決める**）＋リズム表（content）＋AA'BB' はセクション4つ／7b 伴奏側＝world68 の隣に `irish` タグの型（GENRE_TABLE 非登録）／7c 装飾・9/8・breath は対象外。
- **Scope（リール・入れる場合の追加）**：7d **slur を dur/タイで実装**（前提条件）・2/2 の大拍表現。
- **Done**：ジグ（付点4分 110〜120）で旋律＋伴奏が `/gen/section` から出る。
- **受け入れ**：`gate`＝データ一致（spike が緑なら成立・赤なら不変条件）・out_of_mode 0・変異検査。`byConstruction`＝cadence_target（被覆率を出す）。**`diagnostic`＝1小節あたり音数（源流の監査は 4.1 音・実演 6 音と観測。ゲートではない＝密度の可否は耳）**・`jig_lilt_ratio`・小節頭ルート率・音型語彙の出現比。耳＝作曲で。
- **撤退**：メロ側だけで止めても価値が残る。**入れない場合の代案**＝音型語彙・軸音・弧だけを一般部品に。

#### 横断（各段に相乗り）
- **M3 着手と同時に `experiments/quality_eval/` と `data/quarantine/` を otomemo 外へ保全コピー**（耳の証拠はここにしか無い）。
- 検証器の型分離（§6-4）を music-core のテスト方針として1枚（M4）。
- 負の知識16項を design (p) へ＝(p) の完了条件。
- 到達口の監査（4口）と engineVersion を各段の Done に。
- backlog の3分割・引き継ぎ書のマイルストーン表更新・research README への訂正注記（§3-2）・**`QUALITY_INTERVALS["11"]` の backlog 1行（本アーク外・意図的 bit 破壊＋耳確認）＝追加済み**。
- io-map 裁定#7（小節単位の別案）の繰り越しを backlog に立てる。
- pianoplayer のライセンス確認（M6a の前）・p11 の逐行読了（M6b の前）。

---

## §6 検証戦略（R1 で表を実物で洗い直し・R2 で層の呼び名を訂正）

### §6-0 方針の先頭＝(0) RNG を決定的規則へ置換／持ち場を移す

一致検証が要らなくなるものを先に消す：`chord_attack` の `gauss`＝**ms の揺れは feel 層・vel の揺れはデータ層（design.md:2099「humanize velocity はデータ層残置」）・どちらも otomemo の既存 Rng で作り Python 一致を要求しない**／`organ_comp` の `Breath`＝注入しない（素の位相）／walking v2 の乱数（`:133,188`）＝決定的タイブレークへ置換（参照との一致は主張しない）。残るのは `handframe`（`random()` 2箇所）と `phrase_plan`（`choices`＋`getstate/setstate`）だけ＝**spike で白黒がつく**（spike は 3g の py-parity に依存＝順序）。

### §6-1 データ一致が成立する箇所（実測列つき・R2 で7行とも実物一致を確認済み）

| 対象 | 実測（grep の対象と結果） | 判定 | やり方 |
|---|---|---|---|
| `_lock_bass_roots_to_sheet`（`ensemble.py:1111-1179`）・`_sheet_line`（`:1372-1471`）・`_lock_guitar_chug_to_sheet`（`:2678-2740`） | `rng`/`random`/`hash(` 0件。`min(key=(abs(c-base), c))` は同値不発生。`RhythmSpec.kick/accents` は `tuple(sorted(set))` で集合順非依存 | **◎ 真にクリーン** | py-parity で onset/pitch 列を JSON 固定→ deepEqual。`pyRound`・`normRoot`（負数 `%`） |
| chord_follow の base line・diverge | RNG 0件。`networkx` は import のみ（`:33`・`solve_fingering` は `:326` のメトリクス用） | ◎ | 同上 |
| `handmodel.py` 全関数 | `import itertools` のみ・RNG 0件・`round()` は `:120,121,261,262,305,306` の6箇所 | ◎ | 関数単位ゴールデン（`pyRound`） |
| ギター `Tuning` 導出・層状 DP・chordfollow | gen2 で `import random` を持つのは `naive.py`・`humanize.py`・`stress/fuzz.py` のみ。handshape は knob=0 で eps を作らない（`shapefollow.py:181-182`） | ◎（knob=0） | 同上 |
| `organ_comp`（`:2437-2664`） | 関数内 RNG 0件。引数 `breath` が start/vel に入る（`:2584-2593`）・`Breath.__init__` は `rng.uniform`×3（`:902-908`） | ○ **Breath を注入しなければ純関数** | 素の位相で参照を dump して一致 |
| `handframe.py` | `rng.random()`（`:783`）・`skip_rng.random()`（`:1235`）の2箇所のみ・top-k は手書き線形走査（`:769-795`）・`choices/choice/shuffle` 0件 | ○ **`PyRandom.random()` で届く** | 参照一致。`math.exp`（`:782`）の ULP で境界候補が稀に反転＝不一致ケースを個別検分。seed<2^32 を前提に明文化 |
| 四肢衝突・band_overlap・coverage・跳躍品質メトリクス | 純粋な計測 | ◎ | 固定テーブル |

### §6-2 成立しない／条件付きの箇所と代替

| 対象 | 理由（実測） | 一次案 | 一次案が駄目なとき |
|---|---|---|---|
| `phrase_plan`（ケルト） | `rng.choices(range, weights, k=1)`（`:1220`）・`getstate()`→別インスタンスへ `setstate()`（`:912-914`） | **spike**＝`PyRandom` に `choices` と `getState/setState` を足して一致 | 不変条件（out_of_mode 0・変異検査）＋診断（音数・音型語彙の出現比） |
| walking v2 | 乱数が sort キー（`:133`）と `randrange(2)`（`:188`）。源流の出力には `walking_bass_adapter`（`core/parts.py:391`）経由で Breath も乗る | **(0) 置換**＝`score=(in_scale, abs(d), p)`・弧の向きは seed 由来の決定的規則 | 受けるのは W1〜W5＋制約の被覆率。Python 参照は seed 固定1本を眺めるだけ（一致は主張しない・Breath 由来の差を誤読しない） |
| `chord_attack` の `gauss` | `gauss_next` キャッシュ | **(0) ms は feel 層・vel はデータ層**＝一致不要 | （`gauss_next` の移植は最後の手段） |
| `organ_comp` の `Breath` | `uniform`×3＋`math.sin` | **(0) 注入しない** | Breath ごと欲しければ前例あり（`humanizeFill.ts:178-180`） |
| ヒット単位ボイシング（M5 MONO→POWER8） | `ChordHit` は `{step,dur,vel?,dir?}` | **`ChordHit` の additive フィールド**＝§8-2 に依存しない | §8-2 で②③なら M6c に回収 |
| 耳（良いか） | 測れない | **ゲートを置かない**。作曲で使って採否 | — |

### §6-3 ゴールデン回帰・bit 一致（定型）

- 既存の定型＝`cues-cascade.test.ts:27-77`（section 無し／section 有るが cues 無し／未知 kind／respondToCues:false）をコピー。全新経路は**既定 OFF**でこれを通す。**回帰は3スイート（api 1,606／web 1,298／music-core 269＋todo 8＝R2 面C 実測）**。
- ゴールデン＝耳で通った瞬間の TS 出力を JSON で固定（`body-fill.test.ts` 前例）。固定条件＝seed・tempo・cues・**engineVersion**・bassTop（新規）。基準はコミットに固定。
- **「別プロセス決定論」は置き換える**（JS に PYTHONHASHSEED の対応物なし）：`Math.random|Date.now|new Date|crypto.` の grep ゲート（現状 0件）＋music-core 共有関数の api/web 双方からの同一出力（**「api 経路と web 経路の一致」は api に実音化が無いので空振り＝R2 面C が撤回**）。
- py-parity（M3-3g）で「○件一致」を後から抜き打ち検算できる形に。venv と sys.path の順を dump スクリプトに焼く。

### §6-4 検証器の作法（design (p) へ・9項）

1. **型で分ける**：`gate`／`byConstruction`／`diagnostic`。形の要求（音数・上行幅・cadence 着地）はゲートにしない。
2. **自己参照禁止**：検算側は生成が使う表を import しない。
3. **許容集合の空虚さを自己診断**：許容音が全音の何割かを必ず出す。
4. **陰性対照を対で置く**。
5. **主張は抜き打ちで検算**。
6. **変異検査（mutation gate）**：**生成器でなく出力に注入してよい**＝(m1) コスト重みを全部同じに（**ソルバがある段＝M5 handshape・M6c でのみ有効**）(m2) 音高を1半音ずらす (m3) 片手に5音 (m4) 低域の床を無効化／錨を1つ削る (m5) seed を無視。**各変異につき落ちる不変条件が1つ以上**。各段の受け入れに「この段で有効な変異」を書く。
7. **被覆率をテストに書く**（レンジで assert）。
8. **ゲートの型を戻り値で強制**（M4 で型化・M3 はコメントで分類）。
9. **摂動テストは全ソルバ必須**。
10. **既存資産を検証器で覆さない**：新検証器が既存の型辞書・`QUALITY_INTERVALS` を落としても直さない＝診断に記録し耳で決める。
11. **ゲートの数値は出所の行を引く**（`0.34` の取り違えの再発防止）。

---

## §7 見積りと撤退（R1/R2 で列を追加・量を再計算）

| 段 | 移す知識の実体 | 規模感（上限＝作業量ではない） | RNG 消費点（実測） | content に載らない出力 | 検証 | 止めても残る価値 | プランB判断点 |
|---|---|---|---|---|---|---|---|
| M3 | ロック3分岐 70行・chord_follow 355行の5ガード・層B 表・walking v2 235行＋規則3本・grammar 3文法・指板 DP 81行・py-parity | 中 | walking 2（置換で 0）・他 0 | 0 | ◎ | anchorLock だけでも価値 | なし |
| M4 | 検証器4本＋grep ゲート＋型 | 小 | 0 | 0 | 機械のみ | 永続資産 | なし |
| M5 | chug ロック 60行・chordfollow 244・chordtheory 171・Tuning 100・層状 DP 155 | 中 | 0（handshape knob=0） | ヒット単位ボイシング（`ChordHit` additive） | ◎ | ギター型が骨に錨を置く | handshape 枠が摂動テストに落ちたら凍結 |
| M6a | legacy/build_rock 刺し 数十行・`band` 契約・`floor`・handmodel 361 | 小〜中 | 0 | 0 | ◎ | 低域譲り・handmodel は単独で価値 | なし |
| M6b | p11 耳付き知識 約 450〜500 行（容器 DSL・KNOBS 12セル・軌跡・vel 表・`_grade_slots`・4フィギュア） | 中 | 未計測（逐行前） | 0（vel は content） | 不変条件＋摂動 | KNOBS プリセットは配札 S2 に効く | rock/pop の崩しの3択（M6b 冒頭） |
| M6c | handframe 1,700・band 581・phrase_arc 109・organ 規則・p14 live 約 300 | **大** | handframe 2（`random()` のみ）・`gauss` 2（層を移す）・Breath 3（注入しない） | ペダル・小節跨ぎ・hand 属性 | ○（spike 次第） | 反転アーキは opt-in のまま凍結可 | **ここ**＝3項目 |
| M7 | phrase_plan 層B 約 800行・リズム表・伴奏型 10〜20・（リール）slur | 中＋小 | `choices` 1・`getstate/setstate` 1 | cut/roll（落とす）・breath（feel） | spike 次第 | 音型語彙・軸音は J-POP にも効く | 入れない裁定なら代案 |

合計の上限＝約 3,700 行（§4-3）。**撤退の原則**：各段は additive・既定 OFF なので途中で止めても既存は 1bit も変わらない。技術的破綻以外で撤退しない。

---

## §8 裁定（オーナー裁定4件＋起草者が決めた）

### §8-A オーナー裁定（4件・ラベル20字／説明40字・詳細は脚注）

**順番＝§8-1 → §8-4（§8-1 が決まれば §8-4 は自動）→ §8-3 → §8-2。**

#### §8-1 ケルトを入れるか（ジグ／リールで分ける）

| 選択肢（20字） | 説明（40字） | メリット | デメリット | 整合性 |
|---|---|---|---|---|
| ①ジグだけ入れる | メロ経路＋伴奏型＋要件1行。リール・装飾・9/8 は外 | 耳○（round2「ジグは悪くない」）・stdlib・決定論＝リスク低 | 天井「音数と速さ」は同じ。**ジグにも「軸が無い」の耳あり**（研究05）＝手当ての v5 軸音は耳未記録 | 要件:220 に1行・design (o)。新軸なし。副次リードは枝1（本アーク外） |
| ②ジグ＋リールも | ①に加え slur（dur/タイ）と 2/2 大拍を実装 | 要望に正面から応える | **リールは耳×**（round2「リールはよくない」）・slur は源流でも未実装＝新規 R&D | 507（未レビュー札）の判別軸で主旋律＝前景 |
| ③部品だけ取る | 音型語彙・軸音・弧を一般部品に。ジャンルは立てない | 工数最小・J-POP にも効く | 「入れたい」に応えない | 変更なし |

**推し＝①**（ジグ先行・リールは slur の設計が立ってから additive）。耳判定が割れている事実を材料にする。
脚注：ジグの既定テンポ付点4分 110〜120／既存 `style:"irish"` 統計との関係は M7 Scope で／伴奏型は GENRE_TABLE に載せない。

#### §8-2 鍵盤の生成器をどこに置くか（作曲家の物差しで・保存はレシピ＝裁定済みで争点でない）

| 選択肢（20字） | 説明（40字） | 進行を変えたら付いてくるか | 別の調に貼るとどう鳴るか | 後から手で直せるか | 作る側の重さ |
|---|---|---|---|---|---|
| ①その場で毎回作る | 生成器を共有部品に置き、再生のたびに今の進行で弾き直す | **付いてくる**（自動） | **その調で鳴る**（貼った先の進行を引く） | パターン単位（今のコード楽器と同じ） | (i) 純関数を共有部品へ＝**中**／(ii) 凍結契約の実装＝本アーク外 |
| ②作った音を持つ | 生成した音を控えとして保存し、そのまま鳴らす | **付いてこない**（作り直しボタン） | **貼った先の調を先に決めないと原調のまま鳴る**（web 7箇所の手当て） | 読み取り専用＋「作り直す」 | 中（web 7箇所） |
| ③別の道具で作る | Python を otomemo に同梱して呼ぶ（spawn・通知つき） | 付いてこない（②と同じ） | ②と同じ | ②と同じ | 小〜中。**ただしアーキ変更＝落ちる時は実装前に再報告** |

**推し＝①（(i) のグレード）を既定に置き、M6c 冒頭の測れる3項目で②③へ落とす**。①→②は additive。③は①②が両方駄目な時だけ。
脚注（実装語）：①(i)＝`resolveChordPattern` と同型の純関数＋ボイシング層を music-core へ・M0 の凍結 resolve 契約は本アーク外／②＝`chord_pattern.notes` を派生キャッシュ（`hits`/`voicing` は残す・`compositeNotes` の移調規則を先に決める・エディタは読み取り専用）／③＝`apps/piano-py/` に vendor・spawn・JSON 契約・失敗は通知（§2-4 C）／ベースの絶対 notes は前例でなく是正中の違反②（design:565）。

#### §8-3 M0 契約の凍結を解いて `band` を足すか（耳の話＝低域衝突を残すか）

| 選択肢（20字） | 説明（40字） | メリット | デメリット | 整合性 |
|---|---|---|---|---|
| ①足す | ベースの一番高い音を鍵盤に渡し、その上に床を置く | ピアノとベースの低域がぶつからない | M0 契約 §3 の凍結を1項目解く（別名の薄い契約・膨張は型スナップショットで塞ぐ） | design (l)。指揮者性なし（一方向・データ1個）。**床は生成時のベースで決まる＝後でベースを変えたら作り直し** |
| ②足さない | 床は固定値（E3 相当）だけ | 契約に触らない | ピアノとベースの低域がぶつかったままになりうる | — |

**推し＝①**。技術的な形（別名 `band`／skeleton には相乗りしない＝定義に反する・名前衝突・書き手が2人）は起草者が決めた（§8-B12）。凍結は M6a で。

#### §8-4 要件へのケルト1行（§8-1 の従属）

| 選択肢（20字） | 説明（40字） | メリット | デメリット | 整合性 |
|---|---|---|---|---|
| ①ケルト1行を足す | :220 の隣に「ジグ／リールも条件付きで対象（粗い寄せまで）」 | 要件に痕跡が残る | 要件が1行増える | 既存語彙に合流・9/8・装飾は design へ |
| ②足さない | design (o) だけで持つ | 要件は「ポップス中心」のまま | ケルトが設計の裁量に見える | — |
| ③①＋体験語彙1行 | ①に加え「候補は在庫から選ぶだけでなく、その場で作られることもある」 | 「棚が静的」の残不満（design:563）への応答が要件に残る | 機構の匂いを要件に持ち込む懸念（体験語彙で書けば薄い） | B6（design:2118）の体験側の言い直し |

**推し＝§8-1 が①か②なら①、③なら②。体験語彙1行（③）は要望があれば**。

### §8-B 起草者が決めた（報告のみ・異論があれば言ってください）

| 項 | 決めた | 理由（根拠） |
|---|---|---|
| B1 ベースの奏法（ベンド） | 落とす | design.md:258 から一意。CC11 可否調査（backlog）と合流 |
| B2 walking | v2 生成＋v3 規則3本を制約＋乱数置換。v3 のアーキ・v1 は不採用。**v3 自体は耳未判定** | `CONCEPT.md:90`・`v3/LISTEN.md:15`・`SPEC-piano-handframe.md:18`（向こう自身の射程絞り直し） |
| B3 M 番号 | M0〜M3 維持・M4＝検証器・M6 を a/b/c に分割 | M4/M5 は未着手＝損失ゼロ。段の締めの線＝止めても価値が残る線 |
| B4 quality_eval | 検証器の純関数だけ拾う・M3 着手と同時に保全コピー | gitignore＝正典外／耳の証拠がそこにしか無い |
| B5 装飾（cut/roll・弓3連） | 落とす（slur は載せる） | 格子外＝design:258。弓3連は耳の効果が否定的 |
| B6 `bassOnsets` | 足さない | M4〜M6 に消費者がいない |
| B7 `phrase_arc` の共有 | 関数の形は共有・調律値は楽器別 | `phrase_plan.py:184-190` |
| B8 オルガン D3 | D5 と対で移す・掴みは規則ごと | `AUDIT-organ-musical.md:16,131`・`SPEC-organ-sustain-layer.md:74,89` |
| B9 低域譲りの置き場 | 生成時に content へ焼く（`ChordVoicing.floor?`） | web resolve で兄弟を見ると既存の出音が動く。帰結（床は生成時に固まる）は §8-3 脚注 |
| B10 要件の B6 追記 | 落とす（design (m) で持つ・体験語彙は §8-4 ③） | 生成機構の語彙＝設計層 |
| B11 backlog の使い方 | 後回しだけ backlog・不採用と負の知識は design (p) | CLAUDE.md の置き場規約 |
| B12 `band` の技術的な形 | 別名の薄い契約（skeleton に相乗りしない） | skeleton＝「ドラムの骨」の定義に反する・書き手が2人＝Chart 化の芽・`SkeletonContent` と名前衝突（`generate.ts:1125`） |
| B13 既存資産と検証器 | 新検証器で既存が落ちても直さない（診断に記録・耳で決める）。`QUALITY_INTERVALS["11"]` は backlog | 上位「理論スコアはガードレール止まり」。既存を直すのは意図的 bit 破壊＝耳が要る |
| B14 M3 の5点 | §5-2 M3 冒頭のとおり（体＝style 型格子／アクセント無し／step 粒度／3g 先行／engineVersion の置き場） | R2 面C。いずれも実装初日に当たる |
| B15 MONO→POWER8 | `ChordHit` の additive で解く（§8-2 非依存） | `vel?`/`dir?` の前例 |

---

## §9 出典（主要ポインタ・行番号付き）

**otomemo 側**
- `CLAUDE.md`（層順・置き場規約・統計のみ）
- `docs/requirements.md:18-20`（コンセプト）・`:24-35`（体験原則）・`:67`・`:154`・`:215`（耳が最終）・`:217-222`（達成度の線引き・楽器アレンジ3線・ソロは対象）・`:220`（粗い寄せ）
- `docs/architecture.md:15`・`:36-45`・`:38`・`:48`・`:52`
- `docs/design.md:16`（irish 統計）・`:258`（CC 無し）・`:297-311`・`:392-394`・`:410`・`:506-507`（未レビュー札）・`:510-563`・`:521`・`:527`・`:548`（分業）・`:551`・`:563`・`:565-585`（修理#2＝違反②）・`:817-826`・`:2095-2099`（層の割り当て）・`:2106-2160`・`:2115`（resolve 置き場）
- `docs/drafts/`：引き継ぎ書（`:16-17` マイルストーン表）・実装計画（§5①）・M0 契約（§2 `engine:{version}`・§3 ctx・§5-2 skeleton）・io-map（裁定#2/#5/#7）・案C・カスケード設計・`2026-08-02-arrange-arc-handoff.md`
- `docs/research/2026-09-04-phrasemaker-bass-inventory.md`（訂正注記の指名＝§3-2）・`2026-08-02-organ-piano-backing-vocabulary.md`
- `docs/backlog.md:223`（テンション込み voicing＝`"11"` の1行を追加）・`:436`（phrase_maker 節）
- コード：`apps/api/src/music/generate.ts:431`（chordAt）・`:1106-1130`・`:1125`（skeleton opts）・`:1140`（rootAtBeat の floor）・`:1195-1260`・`:1385`・`:958-1052`・`:1641-1720`／`apps/api/src/music/theory.ts:5`（music-core 再エクスポート）／`bassLibrary.ts`／`chordLibrary.ts:34`／`apps/api/src/http.ts:273,335-341,432-490`／`apps/api/src/mcp.ts:782,832`／`apps/api/src/accent.ts:2-12`／`packages/music-core/src/{cues,rngSalt,bodyFill,drumFill:351-380,humanizeFill:87-160}.ts`・`index.ts:63,97-98,108,165-176`／`packages/music-core/test/phrasemaker-resolve-contract.todo.test.ts`／`apps/web/src/music.ts:649,657-671,723-790,941,952,1053,1107-1110,1174-1191`／`apps/web/src/chordQuality.ts:8,25,55,57`／`apps/api/src/music/meter.ts:28-29`／`apps/api/test/cues-cascade.test.ts:27-77`／`apps/web/src/components/TinkerSheet.tsx:456-470`
- 記憶：project-design-philosophy-options-not-finished・feedback-eval-existing-weights-not-llm・project-melody-eval-ceiling・feedback-corpus-statistics-only-copyright・project-arrange-layer-midi-help-scope・feedback-dont-harden-observations-into-requirements・feedback-decision-requests-need-material

**phrase_maker 側（`~/projects/phrase_maker`・HEAD `e186970` 2026-08-18・33 コミット）**
- `CLAUDE.md`・`README.md`・`docs/CONCEPT.md`（`:25,41,55-56,74-77,82,90,101`）・`docs/GAP-AUDIT.md`（`:37,101`）・`docs/HANDOFF-NEXT.md:9-30`（`:14` バンド全体の耳・`:22` 「塊 stab のみ」）・`docs/HANDOFF.md:27,31`・`docs/PLAN-piano-comping.md`・`docs/PLAN-coverage-and-fill.md`
- `.gitignore:9-10`・`tools/FEATURED.txt:2-16,146`
- `experiments/ensemble/ensemble.py`：`:62-76`・`Chart:257-359`（33）・`Breath:896-917`・`:1053`・`_lock_bass_roots_to_sheet:1111-1179`（`:1140` accents・`:1159`・`:1166` 案B）・`_sheet_line:1372-1471`・fill `:1494-1690`（`:1529 _FV_TAU=0.34`）・`:1987-1991`（BUILDER_MAP）・`_piano_via_handframe:2051`・`rock_piano:2102`（sheet 分岐 `:2128-2161`・`:2130`）・`:2112-2114`（4/4）・organ `:2182-2664`（`:2496-2525,2584-2593`）・`_lock_guitar_chug_to_sheet:2678`・celtic `:2830-3191`（`:2984-2988`）・`band_overlap:3225-3240`（閾値なし）・`coverage_metrics:3250`・**`ENGINES:3553-3556`・`_ROCK_COMP_ENGINE:3571-3574`・`_COMP_SEAT_ENGINES:3581`・`default_parts:3615`**・`build_chart:3822-3846`
- `experiments/core/chart.py:41,177-433,474,479,517,531`／`core/chordlib.py:12-13,88-107,115-171,131-132`／`core/parts.py:59-63,388,391`／`core/demo.py:254`
- ピアノ：`fingersim/handmodel.py:12-19,24,34-39,52-63,102-133,120-121,167-179,224-307`・`handframe.py:75-88,219-313,769-795,783,979-980,1235`・`handframe_band.py:1-22,67-68,127-140,255-359,432-468,516-529`・`phrase_arc.py`・`gesture/chord_attack.py:5-104,44,85,91`・`gesture_p2.py:12-21,67`・`gesture_p3.py:176-244`・`gesture_p5.py`・**`gesture_p11.py:6-11,79-104,118-147,149-150,157-189,240-267,276-340,352-368,373-618,587-618,657-716,720,980`**・`gesture_p14.py:5,146-213,245,341,388,516,726,1143-1144,1571,2079`・`GESTURE_P11_NOTES.md:3`・`GESTURE_P13_NOTES.md:11`・`comping/comping.py:162,232`・`gen2/chordlib.py:100,102,104`・`docs/poc/SPEC-piano-fingersim.md`・`SPEC-piano-handframe.md:5-9,18`・`SPEC-piano-handframe-band.md:22,197-200`・`SPEC-piano-band-unify.md:13`・`SPEC-piano-handframe-band-wave1.md:58`・コミット `bb173cf`
- オルガン：`docs/poc/SPEC-organ-sustain-layer.md:15,74,89,95`・`AUDIT-organ-musical.md:11-19,131,183`・`CRITIQUE-organ-celtic-round2.md:40,88,115`
- ギター：`guitar/gen2/{theory:33,fretboard,graph_line,riff,subfeel,handshape:29-131,shapeline}.py`・`gen2/chords/{chordfollow:151-159,chordtheory,shapefollow:87-90,181-182}.py`・`chords/ACCEPTANCE.md:50-51`・`chords/BREAKAGE.md:46`・`BREAKAGE-handshape.md:46-59`・`docs/poc/SPEC-guitar-handshape.md:16-18,180-190`・`CRITIQUE-guitar-approach-tone.md:79-138`・コミット `19c405a`・`f2c3241`
- ベース：`bass_rock_riff/graph_line.py:8,20`・`fretboard.py:52-63`・`theory.py:33`・`chords/chord_follow.py:33,326`・`bass_walking/v2/walking_v2.py:52-54,133,137,188`・`v2/ACCEPTANCE.md:19-22`・`v3/walking_v3.py:1-30`・`v3/LISTEN.md:1-40`（`:15` listener's）・`docs/poc/BRAINSTORM-bass-kick-lock.md:30-43,85-124`・コミット `a27c3a9`
- ケルト：`celtic/gen2/src/phrase_plan.py:8-20,77-78,147,184-190,217-223,326-328,343-353,346-347,362-364,407,413-414,462-631,592-629,604,702-710,856-999,912-914,1147-1268,1220,1320-1382`・`celtic_gen2.py:318-338,372,526-528,539-594`・`celtic/src/celtic_gen.py:47-55`・`gen2/ACCEPTANCE.md:14-25,78-79`・**`docs/research/celtic/04-same-pitch-repetition.md:5-12,100-104`・`05-axis-tone.md:3-8`**・`docs/poc/AUDIT-jig-musical.md:19-48,142-148,177-181,230-234`・`AUDIT-reel-ornament-musical.md:11,113,143-151`・コミット `6db2dd2`・`4e60377`・`d885828`・`data/quarantine/thesession/PROVENANCE.md:9-15`
- ドラム残り：`drums/gen2/src/patterns.py:169-234`・`validate.py:21-41`・`metrics.py:55`・`lefthat.py`・`fills/src/fills.py:337-396`
- 統合 doc：`docs/poc/SPEC-ensemble.md:13`・`SPEC-orchestrator-unified.md`・`CRITIQUE-orchestration-structure.md:11-12,19-38,65-94`・コミット `728a66f`
- 評価系：`experiments/quality_eval/*`（gitignore）・`experiments/STRESS_AUDIT.md:38-115,132-140`・`experiments/robustness/{harness,harness_new}.py`・`data/quarantine/GMD/extract_texture_prior.py:5-23`
- solo：`experiments/solo/solo.py:4-17,90-114,258-283,315-383,416-510,625`・`solo/ACCEPTANCE.md:19-22,44-48,97-101`

**本書の裏取りの範囲（正直に）**：向こうの実 py は要所を自分で確認したが、`gesture_p11.py`（118-200・587-618・関数一覧まで）・`gesture_p14.py`・`handframe.py` の内部は逐行未読（**p11 の逐行は M6b の着手条件**）。耳判定は全てテキスト記録からの引用で、音は聴いていない。quality_eval のハーネスは実行していない。R1/R2 の指摘は §10 のとおり1件ずつ実物で検算した。

---

## §10 改訂履歴

### §10-1 R1（2026-09-09）＝受け入れ 22／却下 3／保留 5

（v2 の記録をそのまま保持）

| # | 面 | 指摘 | 検算（実物） | 直した箇所 |
|---|---|---|---|---|
| 1 | B-重大1 | handframe は lead 役の置換・p11 が現行のコンピング生成器 | `ensemble.py:1987-1991` BUILDER_MAP。p11 の `STYLES/KNOBS/traj/render_bar/_grade_slots/builders` を読了。handframe_band は docstring で「バンドのピアノパート」 | §4-3・M6・§7 |
| 2 | B-重大2 | v2 生成＋v3 ゲートは自己矛盾・v3 の札は後発枝 | `v3/LISTEN.md` v2 FORB 3/5・`walking_v3.py:1-30`・`CONCEPT.md:90` | (e) 追加・§4-1・(k)・M3-3d・§8-B2 |
| 3 | B-重大3 | ケルトの耳判定は記録あり・slur は articulation | `research/celtic/04:12,100-104`・`05:3-4`・`6db2dd2` | §4-0・§3-1・§4-7・§8-1 |
| 4 | B-重大4 | phrase_arc の共有は回避理由の逆転 | `phrase_plan.py:184-190` | §4-3・§4-9 #12 |
| 5 | A-重大1／C-重大1／C-重大2 | §8-2 の材料が誤り・web 7箇所・§8-3 と連動 | `design.md:2115,548,565-566`・`music.ts:1053,1107-1110,1174-1191,649,657-671`・todo 8 | §2-4 B・§8-2 |
| 6 | C-重大3 | M5 のヒット単位ボイシングは content 形に依存 | `ChordHit`（`music.ts:671`） | §4-5・M5 |
| 7 | C-重大4 | MT19937 前例の射程・handframe は軽い・`gauss` は層を移す | `humanizeFill.ts:151,157`・`handframe.py:783,1235`・`chord_attack.py:85,91` | §6-0/1/2・spike |
| 8 | C-重大5 | RNG 表の誤り3行＋networkx | `ensemble.py:2584-2593,902-908`・`phrase_plan.py:1220,912-914`・`walking_v2.py:133,137,188`・`chord_follow.py:33,326` | §6-1・§4-1/4/7 |
| 9 | C-重大6 | 不変条件の空虚化防止 | 採用 | §6-4 |
| 10 | A-重大2 | 音数≥5 は観察の硬化 | 計画自身の §6-4 | M7→診断・全段を洗った |
| 11 | A-重大3／C-中1／B-中5 | ctx に skeleton は無い・名前衝突・bassOnsets 不要・型凍結 | M0 契約 §3・`generate.ts:1125`・`ensemble.py:3424,3455` | §2-4 A・(l)・§8-3 |
| 12〜22 | 各面の中・軽微・漏れ | 要件の層違い／副次リード枠／裁定の水増し／5列表／backlog 規約／行番号／io-map #7／描く口／オルガン二重在籍／負の知識の着地／ソロ／avoid note／D3+D5／掴み規則／4/4 限定／legacy 行／負の知識2件／pianoplayer／コメント断片／保全／handmodel 原文／MTX／到達口／engineVersion／通知／irish 統計／ペダル×followChords／低域譲りの置き場／web テスト／py-parity／§7 の列／プランB 条件 | 各 file:line を確認 | 各節 |

**却下（R1）**：①B-中1「chordlib は core に解決しない」→ 実行時は `walking_v2` の sys.path 挿入で `core/chordlib.py` に解決（venv 実測）／②B-nit「Chart 30」→ 実測 33／③B-重大1 の言い方「handframe＝リード用」→ 伴奏の一種・両方移す。**R2 面B の再監査で3件とも起草者が正しいと確定**（下記）。
**保留（R1）**：B-重大2 推し②（採用・異論あれば裁定へ）／リールの slur 前提（§8-1 ②）／A-3 vs C-中1 の band の形（別名で一致）／要件の体験語彙（§8-4 ③）／§8-2 と §8-3 の畳み（畳んだ）。

### §10-2 R2（2026-09-09・最終巡）＝受け入れ 21／却下 0／保留 1

**R1 却下3件の決着（R2 面B 再監査）**：3件とも起草者が正しく、前任が誤り。①`E.chordlib.__file__`＝`core/chordlib.py`（`walking_v2.py:44-52` の `sys.path.insert(0, core)`＋`import chordlib` が `sys.modules` を先に確定させる＝`find_spec` では測れない）②`len(dataclasses.fields(E.Chart))`＝33 ③**バンドの鍵盤席は4エンジンとも `comp`**（`ENGINES:3553-3556` が全部 `_b_rock_comp`・`_ROCK_COMP_ENGINE:3571`・`default_parts:3615` `Part("comp",…)`・`_COMP_SEAT_ENGINES:3581`「EVERY keyboard comp seat」）＝BUILDER_MAP の comp/lead はピアノ内部の脇役/主役の呼び分けで旋律席は無い。**walking の読み（否定されたのはアーキで規則ではない）も耐えた**＝`CONCEPT.md:90` が理由を「逐次貪欲のアーキ限界」と名指し・後発の `SPEC-piano-handframe.md:18` で向こう自身が「逐次貪欲の限界の実体は argmin の最尤の凡庸であって逐次性そのものではない」と射程を絞り直し逐次生成を再採用。**次の人はこの3点を蒸し返さないこと。**

| # | 面 | 指摘 | 検算（実物） | 直した箇所 |
|---|---|---|---|---|
| 1 | B-中1/中2 | `build_rock` ≡ legacy（二重計上）・KNOBS は3段12セル・rock/pop 行なし・生存証拠はソロ A/B | `gesture_p11.py:588-595` docstring「level/rng/b は非依存＝legacy rock_piano と同性格」・`KNOBS:157-189` のキー・`GRADE_CANDS:149-150` | §0-5・§4-3（p11 を2行に分割・量 3,700）・§3-2 (m)・M6a/M6b・§7 |
| 2 | B-中3 | legacy「耳の実績あり」は過大 | `HANDOFF-NEXT.md:14`（バンド全体）・`:22`（塊 stab のみ） | §4-3 legacy 行 |
| 3 | B-中4 | v3 は耳未判定 | `v3/LISTEN.md:15` | §4-1・(k)・§8-B2 |
| 4 | B-中5 | 層B の `"11"` も同じ avoid note | `core/chordlib.py:131` | §4-1・§4-3 |
| 5 | B-軽微 | p11 行番号（149-150／240-267）・`floor` は `:468`・legacy は `:2128-2161`・ジグにも「軸が無い」 | 各行を確認 | §4-3・§3-1・§8-1 ① |
| 6 | A-中1 | `band_overlap 0.34` は `_FV_TAU:1529` の取り違え・実ゲートは `overlap_frac<=0.10`（`gesture_p14.py:1143-1144,1264-1265,1424-1425`） | `band_overlap:3225-3240` は閾値を持たない（実測） | §4-8・M4・(p)・§4-9 #16・§6-4 #11。**閾値・定数を全部洗った**（残る数値は全て出所の行つき） |
| 7 | A-中2／C 宿題 | avoid note ゲートが既存の出音を否定・既存資産を検証器で覆さないルール・`"11"` は backlog | `index.ts:98`・`backlog.md:223` | §4-3・(p)・§6-4 #10・M4・§8-B13・**backlog に1行追加** |
| 8 | A-中3／C-中2 | §8-2 を作曲家の物差しで・①の2グレード分離・③は再報告 | — | §2-4 B・§8-2 |
| 9 | A-中4／軽微4 | M6 を a/b/c に割る・Done に型スナップショット | — | §5-1・§5-2 M6a/b/c |
| 10 | A-§8-3 | 2択に絞る・skeleton 相乗りは §8-B へ・B9 の帰結を脚注 | — | §8-3・§8-B12 |
| 11 | A-§8-4 | 体験語彙1行の選択肢を戻す | — | §8-4 ③ |
| 12 | A-軽微1/2/3/5 | 2114→2115・§4-9 は 15（→16）・§8-4 5列・cadence_target は byConstruction | `design.md:2115` | §2-1・§2-4 B・§4-9・§8-4・M7 |
| 13 | A-B6〜13 | 既存資産の扱い／保全コピーは M3 着手と同時／pianoplayer は M6a 前／p11 逐行は M6b 前 | — | §5-2 横断・M6a/M6b |
| 14 | C-着手前5点 | 体＝style 型格子／アクセント／step 粒度／3g 先行／engineVersion | `chordAt:431`・`rootAtBeat:1140`・M0 契約 §2 | §5-2 M3 冒頭・(k)・§8-B14 |
| 15 | C-中1 | vel の揺れは feel 層でなくデータ層 | `design.md:2099` | §6-0・§6-2・M6c-6f |
| 16 | C-中3 | MONO→POWER8 の回収段・`ChordHit` additive で §8-2 非依存 | `music.ts:671` | M5-5a・M6c-6j・§8-B15 |
| 17 | C-中4 | api/web 一致テストは空振り（面C が撤回） | `theory.ts:5` 再エクスポート | §6-3・M4 |
| 18 | C-n1/n2 | 変異は出力に注入・段ごとに有効な変異・M3 は分類をコメントで | — | §6-4 #6/#8・M3 受け入れ |
| 19 | C-n3/n4 | M5 の Done に調の扱い・walking 参照には Breath | `core/parts.py:391` | M5 Done・§6-2 |
| 20 | C-spike 順序 | spike は 3g に依存 | — | §5-2・§6-0 |
| 21 | A-13項目の振り分け | A1〜A5＝紙の上で直した（§8-2/§8-3/0.34/§8-4/数）。B6〜B10＝ルールとして計画に書いた（既存資産・avoid note の範囲・M6 分割・型凍結 Done・cadence）。C11〜C13＝横断の期限を固定（保全＝M3 同時／pianoplayer＝M6a 前／p11 逐行＝M6b 前）。D＝オーナー4件はこの順（§8-1→§8-4→§8-3→§8-2） | — | §5-2・§8-A |

**却下（R2）**：なし。
**保留（R2）**：B-中2 の rock/pop 崩しの3択＝M6b 冒頭で決める（源流に無いので耳で当てるしかない＝オーナーの物差し）。

---

## §11 実装の着手手順（M3・実装者がそのまま辿る）

### §11-1 最初に読む（この順・30分）
1. **§5-2 の M3 ブロック**（着手前の5点・Scope 3g→3a…・到達口・Done・受け入れ・撤退）。
2. **§3-2 (k)**＝design 追補の中身（anchorLock／JZ-WALK／grammar セル／オクターブ選択／描く口を開けない）＝正準になる文面。
3. **`~/projects/phrase_maker/experiments/ensemble/ensemble.py:1111-1179`（`_lock_bass_roots_to_sheet`）の docstring と本体**＝(a)昇格／(b)上書き／(c)挿入の3分岐が原文の docstring に書いてある。**移植の一次資料はこれ**。続けて `:1372-1471`（`_sheet_line`・6/8）。
4. **§6-1 の1行目と §6-3**＝データ一致の取り方（py-parity → deepEqual）と bit 一致の定型。
5. **§6-4（作法11項）と M3 受け入れの3分類**。
6. 補助＝`docs/research/2026-09-04-phrasemaker-bass-inventory.md` の §1-1・§1-5・§3。**ただし §5-4（walking 6/8）・§1-4/§4-5（bass vel）・§1-3/§4 推し3（v3）は本計画 §3-2 の訂正注記を正とする**。

### §11-2 環境（py-parity の前提）
- venv＝`~/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python`。
- `sys.path` の順は `ensemble.py:62-69` の挿入順を再現し、**`import walking_v2` が `experiments/core` を先頭に挿す**ことを前提にする（`chordlib` は実行時 `core/chordlib.py`）。dump スクリプトにこの順を焼く。
- 参照値は JSON（onset step・pitch・role・anchor・kind）でコミット（`tools/py-parity/cases/*.json`）。

### §11-3 最初に書くテスト（この順・赤から）
1. **bit 一致4本立て**＝`apps/api/test/cues-cascade.test.ts:27-77` をコピーして `anchorLock` 版に（①section 無し ②section 有り cues 無し ③未知 kind ④`respondToCues:false`）＋**「`anchorLock` 未指定＝従来 `genBass` 出力と `deepStrictEqual`」**（`"engine" in content` が false であることも）。**これを最初に緑にしてから 3a を書く**。
2. **py-parity のスモーク（3g）**＝Python dump → JSON → TS 比較ヘルパ→ **`_lock_bass_roots_to_sheet` の1ケース**（4/4・`pedal_answer`・kick `[0,8]`・進行 `Am F C G`）を通す。ここが動かないと M3 の受け入れが実行できない＝**3a より前**。
3. **データ一致の本体**＝ケース表（kick パターン×コード進行×grammar セル3型×案B on/off）を足し、onset/pitch 列を deepEqual。`pyRound`（`drum-fill.test.ts:143-151` 前例）と `normRoot`（`music-core/src/index.ts:108`）を必ず経由（Python の負数 `%` と銀行家丸め）。
4. **不変条件（`byConstruction` は証拠に数えない）**＝「全 kick step にルート錨」「非 kick セルが1つも書き換わっていない（リフ無傷）」を assert し、**被覆率**（錨が置かれた step／kick step 総数）を数値で出す。
5. **変異検査**＝出力に故障を注入＝(a) 錨を1つ削る (b) 錨を1半音ずらす (c) seed を無視して同一出力＝**それぞれ落ちる不変条件が1つ以上**。
6. **JZ-WALK（3d）**＝データ一致は主張しない。W1〜W5＋禁則 0（byConstruction・制約の被覆率）＋回復率（diagnostic）＋**摂動テスト**（規則の重みを振ると出力が変わる）。6/8 スロット `(0,2,6,8)`（`core/parts.py:388`）。
7. **到達口**＝`/music/gen_bass`・MCP `gen_bass`・`/gen/section`・web seg の4口から `anchorLock:true` が届くこと（受け入れ監査は別の人が抜き打ちで）。

### §11-4 着手と同時にやる1回きりの作業
- ✅ `experiments/quality_eval/` と `data/quarantine/` の保全コピー（otomemo 外）＝**2026-09-10 実施**（受け入れ監査 中⑤で未実施を指摘されて消化）。置き場＝`~/backup/phrase_maker-quality_eval-2026-09-10/`（`quality_eval` 403MB・788 ファイル／`quarantine` 182MB・8,677 ファイル＝計 585MB・`cp -a`・ファイル数を照合済み）。**otomemo リポジトリの中には置かない**＝他者コーパス由来（GMD 等）が混じるため（著作権の硬い線＝統計のみ・リテラルは持たない）。
- 引き継ぎ書（`2026-08-21-phrasemaker-arc-handoff.md:16-17`）のマイルストーン表を §5-1 の割りへ更新。
- research README の当該行に「訂正注記＝本計画 §3-2 参照」を追記。
- `PM_ENGINE_VERSION` を `rngSalt.ts` の隣に置く。
