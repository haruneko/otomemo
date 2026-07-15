# 独立監査: コード認識レーンの実効改善余地（2026-07-15）

**監査者**: 独立レーン（コード無変更・読み/測り/判定のみ）
**問い**: モデル（BTC-ISMIR19 large_voca・据え置き裁定済み）を変えずに、BTC生timeline→出口（候補ネタ・digest）の間で失われている実効をどれだけ取り戻せるか。
**方法**: 本番と同一の実関数（`apps/api/src/audio-chords.ts`・`music/audio-digest.ts`・`music/chordname.ts`・`music/localKey.ts`・`common-progressions.ts`）を tsx で import し、DB実データに対して各段の損失を測定。スクリプトは scratchpad（非保存）・ここには統計のみ残す（リテラル進行は非保存）。

**データ**（`data/cm.sqlite`）:

| 曲 | analysisネタ | job | BPM | 拍子 | BTC segs | bass_notes |
|---|---|---|---|---|---|---|
| 蜿蜒 on and on and（新・最終検収） | e7b9e7ad | 6f05d807 | 234.9 | 4/4 | 208 | 767 |
| 蜿蜒（旧・半取り） | （ネタ削除済→job facts から復元） | 7a28d80a | 117.5 | 4/4 | 208（**timeline は新と bit一致**＝BTCはBPM非依存を確認） | 739 |
| The Corrs - Forgiven | 605218da | 262e8169 | 89.1 | 4/4 | 186 | なし（旧解析） |
| DeepSea（6/8再解析） | ca736c47 | 7b518971 | 123 | 6/8(meter6) | 322 | なし（旧解析） |

**前提の再確認**: モデル天井（maj/min 82-87%が10年不動・7thは候補止まり）と BTC据え置き裁定は `research/audio-analysis-feasibility.md`・`2026-07-15-mir-2026-refresh.md` §1 のとおり＝本監査はモデルに触れない。本日 `2026-07-15-tempo-octave-fix.md` でテンポ倍半の自動判定が入り（蜿蜒 117.5→235）、**正しい拍格子が初めて手に入った**＝下流の量子化・和声リズムの前提が変わった。

---

## 1. モデル以外の実効誤差の定量（問い1）

### 1a. BTC細切れとマージの現状

BTC出力は frame単位 argmax の変化点切り（`_audio_poc/analyze.py::btc_chords` L284-297）＝数百ms断片が常在する。

| 曲 | 中央値seg長 | <1拍のseg | <0.5拍 | ABAサンドイッチ(<1拍) | 隣接遷移のうち同root・質違い |
|---|---|---|---|---|---|
| 蜿蜒@235 | 1.11s | 12.5% | 7.2% | 9件（内・同rootの質瞬きのみ4） | **48/202＝24%** |
| Forgiven@89 | 1.02s | 30.6% | 11.3% | 7件（同4） | 15/184＝8% |
| DeepSea@123 | 0.92s | 36.0% | 21.7% | 6件（同2） | **80/312＝26%** |

- 現行マージは「隣接同一(root,quality)を畳む」のみ（`chordsFromTimeline` L149・`timelineRuns` L127）。**ABAサンドイッチ（例: Am→Am7→Am の1拍未満の瞬き）と同root質フリッカーは畳まれず、`Math.max(1, round(...))` で強制的に≥1拍の"実在コード"へ昇格**する。
- 実物の候補ネタ（冒頭64拍抜粋）での帰結＝**dur=1拍のslot比率: 蜿蜒13%・DeepSea 28%・Forgiven 56%**。Forgiven の候補は半分以上が1拍コード＝弾き直せる進行になっていない。
- 折り畳みシミュレーション（<1拍runを ABA吸収＋同root隣接吸収）: run数 蜿蜒203→177（-13%）・Forgiven 185→164（-11%）・DeepSea 316→242（**-23%**）。**畳まれた断片の大半（15/20・12/15・65/69）は同rootの質違い＝「7th曖昧」シグナル**（→§3）。

### 1b. 拍量子化＝正しいBPMでどれだけ改善したか（蜿蜒 新旧比較）

同一timelineを新旧BPMで量子化（本番と同じ per-seg `round(dur/secPerBeat)`）:

| 指標 | 旧 BPM117.5 | 新 BPM234.9 | 改善 |
|---|---|---|---|
| 丸め誤差（平均/seg） | 155ms | **70ms** | ÷2.2 |
| 0.5拍未満→1拍強制 | 26seg | 15seg | -42% |
| 相対誤差>25%のseg | 21.5% | 13.7% | -36% |
| 累積ドリフト（全曲） | **+9.3s**（+18拍捏造） | +2.8s（+11拍） | ÷3.3 |

- **正しい拍格子は量子化の実効を約2倍改善**＝テンポ倍半判定は下流にちゃんと効いた。
- ただし残りの誤差は構造的: (i) per-seg独立丸め＋`Math.max(1,…)`の**上方バイアス**でドリフトは消えない（Forgiven +12.9s＝尺の5%・DeepSea +28.5s＝尺の9.5%を捏造）。(ii) 量子化は `bpm` スカラーのみで **実測 `beat_times` 格子を一切使っていない**（テンポ揺れ・6/8で特に痛い）。
- **副作用（新発見）**: `maxBeats=64` は拍数固定なので、BPMが235に正解化した結果、候補ネタの「冒頭抜粋」の実時間が **32.7s→16.3s に半減**（蜿蜒の候補は15slot・16秒分だけ）。抜粋窓の意味が変質した。

### 1c. 和声リズム（コードチェンジの小節内位置）の保存性

真の位置＝BTC変化点を `beat_times`＋overlay anchor（reaperの`anchorSec`）へ射影して算出:

| 曲 | 変化点の頭拍率（真値） | 拍格子±35%外（裏拍/食い） | 候補ネタの暗黙位置(start%meter)の真値一致 |
|---|---|---|---|
| 蜿蜒@235 | 48.3% | 31.2% | **13.3%** |
| 蜿蜒@118（旧格子） | 41.0% | 22.4% | 25% |
| Forgiven | 28.6% | 31.9% | 35.3% |
| DeepSea(6) | 25.9% | 23.7% | 24% |

- **和声リズムは出口でほぼ全滅**。候補ネタの start は「累積量子化拍」で小節頭アンカーと無関係＝slotの65〜87%が誤った小節内位置を暗示する。digest 側も chords（freq_top/main_loop）は位置情報を持たず、spots の bar 番号だけが位置を保持。
- 一方で**素材は揃っている**: BTC変化点は実測拍格子の±50%以内に **97.2〜98.9%** 収まり（最近傍拍まで中央値 67ms/139ms/105ms）、境界→拍スナップは well-posed。正しいBPMで蜿蜒の真の頭拍率が41→48.3%へ上がった＝**格子が正しくなった今だけ、スナップが意味を持つ**（半取り格子でスナップすると誤った頭拍に整列させる逆効果だった）。
- N/X（無和音）区間は cursor を進めず消える＝無音の分だけ後続が前詰め（N/X時間シェア: 蜿蜒1.6%・Forgiven 0.4%・DeepSea 6.3%）。冒頭抜粋では軽微、全曲展開時は要注意。

### 1d. 度数化の単一障害点（追加所見・想定外の発見）

digest の度数化（freq_top・main_loop・sections・H1/H2）は**グローバル調1点に全乗り**しており、その調は `facts.key`（＝analyze.py の Krumhansl-Schmuckler chroma 相関・feasibility実測 **83%**）を優先し、`resolveTonic`（コード整合・同 **96%**）はフォールバックのみ（`audio-digest.ts` L153-155）。**プロジェクト自身のフィジビリ結果と優先順位が逆**。

蜿蜒の実測: facts.key=A minor(conf 0.697) に対し resolveTonic=**D**・localKey(detectKeySegments)も D系セグメント優勢・root=D の時間シェア **42.2%** vs A **16.7%**。結果の digest は freq_top 首位が iv(23.8%)+IV(16.1%)＝「4割の時間が下属和音」という自己矛盾出力・main_loop も ♭II系の不自然な度数列。真値は耳確認が要るが、**Dを中心と読めばダイアトニックに収まる度数列がAで読んだため借用だらけに見えている**疑いが濃い。H1偽スポット（下記§3）と併発し、この曲の digest 度数出口は信頼できない。

---

## 2. refineChordsWithBass の実効（問い2）

蜿蜒（bass_notes ありの唯一のデータ）全曲で実測:

- **発火**: 203slot中 btc=181 / **slash=17（8.4%）** / **bass-root=5（2.5%）**。BPM新旧で発火は不変（時間領域処理なので当然・確認済み）。
- **前提の追試**: ベース被覆=64.7%時間・支配pcあり205span中184。root一致 **70.1%**・コードトーン **85.3%** ＝フィジビリ主張「9割コードトーン・8割弱ルート」をやや下回るが同水準＝転回優先の設計判断自体は依然妥当。
- **slash（転回）**: 17件中、長尺（7〜11拍）の IV/I・IVm/I・Im/V 等は音楽的に妥当な形。出口も生きている＝web再生（`music.ts` L176-180）が on-bass を最低音に配置する。ただし**冒頭64拍抜粋には slash 0件**（発火が曲後半に偏在）＝候補ネタの実物では実効が見えていない。
- **bass-root（ルート補正）＝誤爆優勢**: 発火5件中 **4件が dur=1拍の断片**上で、補正後rootのダイアトニック率60%（全slot 81.8%より低い）。♭IIm 等の文脈上不自然な補正を含む＝**ベース採譜の質が低い現状では、断片への補正はノイズ×ノイズの掛け算**。corrStrength=0.6 のガードは効いている（発火自体は稀）が、「短いrunには補正しない」ガードが無い。
- **ベース質が上がった場合の期待値**: root不一致span 55件の内訳＝slash発火17・**slash漏れ（コードトーンだが frac<0.4）11・非トーン弱22・補正発火5**。被覆64.7%→9割になれば slash は最大 ~28件（+65%）まで伸びる余地。bass-root はガード無しで増やすと誤爆も比例するため、**質向上の恩恵は転回検出に集中させ、ルート補正は長尺run限定**が安全。

---

## 3. 7th/テンションの候補戦略＝捨てている情報（問い3）

- **語彙の量**: 7th/6th/sus の時間シェア＝蜿蜒 **27.1%**・DeepSea **28.0%**・Forgiven 5.4%。large_voca の恩恵は実データで確かに出ている。
- **保存されているもの**: parse（min7→m7 等）→候補ネタの quality →digest 度数suffix（i7・IVM7 等）まで**ラベル自体は素通しで生きている**。chat へも `chords_timeline` 生が素通し（`mcp.ts` L173-174）。
- **捨てている/歪めているもの**:
  1. **信頼度が源流で消滅**: analyze.py は argmax のみ（L292 `pred[i].item()`）＝softmax確率・第2候補は最初から存在しない。「候補・信頼度つき」の材料は現状ゼロ。
  2. **フリッカー＝無料の不確実性シグナルを捨てている**: 同root質違いの隣接遷移が全遷移の24-26%（蜿蜒・DeepSea）。「X↔X7 を行き来する」は本来 **「Xで7thの含みあり（確信度=7th側の継続長シェア）」** という candidate 情報なのに、現行は≥1拍のゴミslotと偽スポットに変換している。
  3. **H1/H2 スポットの断片汚染**: 蜿蜒の H1 借用和音 10件中 **5件が<2拍run由来（0.09〜0.47s断片）**＝BTCノイズが「見どころ」に昇格。conf式は run長を反映するが 0.41〜0.56 で生き残る。H2（セカンダリドミナント）2件は 2.5/18.5拍で健全。
  4. **パース誤り**: `chordname.ts` L19 の `/dim7/` が **`hdim7`（half-diminished＝m7b5相当）に先勝ちして dim7 へ誤縮約**（isHalfDim の判定語彙に "hdim" が無い）。DeepSea で 1.2%時間が実害。m7b5 と dim7 は減7音/短7音の違い＝理論所見（ø vs °）まで歪む。
  5. 小粒: digest `degLabel` は sus2/sus4/6/m6/aug/mM7 の suffix を落とす（時間シェア小・実害軽微）。`chordSequenceFromTimeline` の「同root畳み・代表質」は調推定用途なので許容。

---

## 4. 結論（問い4）＝モデルを変えないレバー

### レバー1（本命）: 拍格子スナップ量子化＋小節頭アンカーの継承
`chordsFromTimeline`/`refineChordsWithBass` の「bpmスカラー丸め＋累積cursor」を「境界を実測 `beat_times` の最近傍拍へスナップ・`anchorSec` 起点の拍位置を保持」に置換（reaper は beatTimes/anchorSec を既に手元に持っており引数を渡すだけ）。
- **効き**: 累積ドリフト 2.8〜28.5s→≈0・1拍強制の捏造消滅・**和声リズムの出口保存 13〜35%→≈98%**（境界の97-99%が拍±50%以内）・候補ネタが「小節のどこで変わるか」を初めて持つ。テンポ倍半判定（本日）が前提条件を満たした今が着手適期＝**半取り格子のままなら逆効果だったレバー**。
- **コスト**: 純関数1本の改修＋呼び出し2箇所＋テスト。**副作用**: 新規解析の候補ネタのみ形が変わる（既存ネタ不変）。`maxBeats=64` の意味も同時に是正推奨（拍数でなく小節数 or 秒で切る＝BPM235で抜粋16秒問題の解消）。

### レバー2: <1拍フリッカー折り畳み＋「7th候補」注記（非破壊）
量子化前に <1拍run を ABA吸収・同root質違い吸収で親へ畳み、**畳んだ質を「7th含み（継続長シェア=確信度）」として候補ネタmeta/digestに残す**。timeline原本は不変（可逆）。
- **効き**: run -11〜23%・dur1ゴミslot大幅減（Forgiven 56%→）・H1偽スポットの約半減・**argmaxで消えた7th不確実性の代替シグナルを無料で回収**＝問い3の回答を兼ねる。
- **コスト**: 純関数＋テスト。**副作用**: 実在の速いパッシングコードを潰すリスク→拍格子基準の最小長（レバー1と併用で正確化）＋meta保持で緩和。

### 小ガード（1行級・ついで推奨）
- bass-root補正に **run≥2拍ガード**（現発火5件中4件が1拍断片・誤爆優勢）。slash はそのまま。
- `chordname.ts` の **hdim7→m7b5 誤縮約修正**（isHalfDim に `hdim` を追加）。
- digest のグローバル調を **resolveTonic（96%）優先 or facts.key との乖離時に spot で両論併記**（§1d）。これは key推定レーンとの境界案件＝オーナー判断待ちだが、蜿蜒の度数出口は現状信頼不能。

### やらない判定
- **モデル乗り換え**: mir-2026-refresh で裁定済み（ChordFormer等は同値・weights未公開）。本監査でも覆す材料なし。
- **BTC softmax温存（python側で確率/第2候補を出力）**: 理想形だが analyze.py 改修＋facts契約拡張＋既存解析の再実行が重い。**フリッカー統計（レバー2）が実質同等の不確実性シグナルを無料で与える**ため、7thを本格運用する将来局面まで保留。
- **beat-synchronous デコード（拍同期median filter/HMM後処理）**: レバー1+2で細切れ・位置・ドリフトの大半を回収してから。現時点では過剰。

## 限界
- 正解コードラベルが無いため「正しさ」は代理指標（ダイアトニック率・断片統計・拍格子整合・自己矛盾検出）による内部整合性監査。n=3曲＋新旧2条件。
- ベース精緻化の検証は蜿蜒のみ（他2ネタは bass_notes 導入前の解析）。Forgiven/DeepSea は bass 付き再解析で追試可能。
- 蜿蜒のグローバル調（A minor vs D系）の真値はオーナーの耳確認待ち。

## 出典・参照
- コード: `apps/api/src/audio-chords.ts`・`apps/api/src/music/audio-digest.ts`・`apps/api/src/music/chordname.ts`（L13-19）・`apps/api/src/music/localKey.ts`・`apps/api/src/reaper.ts`（L195-377）・`apps/api/src/mcp.ts`（L164-181）・`_audio_poc/analyze.py`（L17-33, L265-299）・`apps/web/src/music.ts`（L123-180）
- 研究: `docs/research/audio-analysis-feasibility.md`・`2026-07-15-mir-2026-refresh.md`・`2026-07-15-tempo-octave-fix.md`・`2026-07-15-local-key-detection-survey.md`・`2026-07-15-local-key-proto-results.md`
- データ: neta e7b9e7ad/605218da/ca736c47・job 6f05d807/7a28d80a/262e8169/7b518971・候補ネタ 64f6d9ee/223acb34/8f49f20a（`data/cm.sqlite`）

---

## 実装（2026-07-15）＝レバー1/2＋小ガード＋度数化の調優先是正

TDD（赤→緑）で以下を実装・`pnpm --filter @cm/api test` 全緑（106ファイル/1167テスト）・tsc クリーン。変更＝`audio-chords.ts`・`music/audio-digest.ts`・`music/chordname.ts`・`reaper.ts`（配線）＋各テスト。BTC モデル・facts 契約・raw は不変（出口の解釈層のみ）。

### C0 度数化の調優先の是正（§1d の正典違反＝最重要）
digest のグローバル調を **facts.key（librosa K-S 83%）優先 → resolveTonic（コード頻度・継続長ヒートマップ 96%）優先**へ反転（コード列が空の時だけ facts.key へフォールバック）。usecases-chat L94「①調はコードの度数から導く」に整合。**DB実データ before/after**（`data/cm.sqlite` の analysis ネタ・実 facts で buildDigest を再走）:

| 曲 | 旧 facts.key | 新 resolveTonic | freq_top 首位（旧→新） | 判定 |
|---|---|---|---|---|
| **蜿蜒 e7b9e7ad** | A minor(conf0.697) | **D major** | **iv 23.8% → i 23.9%**（同じ絶対和音が「下属」→「トニック」に） | ★自己矛盾解消。「4割の時間が下属和音」という旧出力が、Dを中心に読めば首位＝トニックへ落ちた |
| Forgiven 605218da | D major(0.869) | D major | I 51.2%（不変・首位＝トニックで健全） | 退行なし（librosa が既にコードと一致） |
| DeepSea ca736c47 | D minor(0.73) | D minor | i 17.9%（不変・首位＝トニック） | 退行なし（同上） |

- **トニック着地（筆頭結果）**：蜿蜒は **D** に落ちた。旧A minor読みで freq_top 首位が iv(23.8%) だった同一和音が、新D読みで **i（トニック）23.9%** になり自己矛盾が解消。root=D の時間シェア 42.2%（§1d 実測）とも整合。
- **注記**：resolveTonic の mode 判定は D **major** を返した（継続長ヒートマップで D:M が D:m を上回るため）。ただし freq_top は i(Dm 23.9%)＞I(D 16.1%) で D 上に長短両方が混在＝**major/minor（Dorian含む）の最終判定はオーナーの耳**。本是正の射程は「トニックをコード頻度から導く」であり、mode 微調整は resolveTonic 既存挙動（study/common-progressions と共有）で別案件。
- librosa が既にコードと一致する2曲（Forgiven/DeepSea）では反転は**no-op**＝退行ゼロを実データで確認。

### C2 <1拍フリッカーの折り畳み＋7th含み注記（レバー2・偽H1 根治）
`timelineRuns` の後段に `foldFlickers`（閾値=1拍）を追加：(a) ABAサンドイッチ吸収・(b) 同ルート隣接吸収（quality は継続長多数決）。畳んだ base三和音↔7th の瞬きは `digest.chords.seventh_hints`（`{deg, conf=7th側継続長シェア}`）へ残す＝argmax で消えた 7th 不確実性の代替回収。加えて H1 に **<1拍フロア**（fold 後も残る非ABA短片＝BTCノイズを借用に昇格させない）。**蜿蜒 実データ before/after**（run 203→177＝-12.8%）:

| 調フレーム | 旧（fold/floor 無し）H1 | 新（fold+floor）H1 | 除去された断片 |
|---|---|---|---|
| A minor（旧key） | 12（うち<2拍 7・最短 0.09s） | **10**（うち<2拍 2） | 0.09/0.18/0.19s の BTC ノイズ断片が消滅 |
| D major（新key） | 16（うち<2拍 5） | **14**（うち<2拍 1） | 同上（0.09/0.19/0.18s 由来の偽借用が消滅） |

- **§3.3 の「H1 借用10件中5件が 0.09-0.47s 断片由来」＝根治**：1拍(235BPM で 0.255s)未満の瞬き断片が借用「見どころ」に昇格しなくなった。残る H1 はすべて ≥1拍（実在の借用）。
- seventh_hints 実データ：蜿蜒 `i7 conf0.96 / v7 0.80 / ♭IIM7 0.80 …`（トニックに強い 7th 含み）・DeepSea は多数が conf~0.94（7th 語彙が濃い曲）＝継続長=確信度の設計どおり。

### C1 候補ネタの拍格子スナップ（レバー1・和声リズム保存）
`chordsFromTimeline`/`refineChordsWithBass` に `GridOpts{beatTimes, anchorSec, meter}` を追加。beatTimes 指定時は境界を**実測 beat_times の最近傍拍へスナップ**・**anchorSec 起点で小節内位相を保持**（未指定なら従来 bpm スカラー丸め＝後方互換・既存テスト bit 一致）。reaper が `{beatTimes, anchorSec, meter}` を配線。効き＝累積 cursor 丸めのドリフト（Forgiven +12.9s・DeepSea +28.5s の捏造）を排し、N/X の穴と「小節のどこでコードが変わるか」を出口へ運ぶ。

### C3 小粒2件
- `refineChordsWithBass` の bass-root 補正に **run≥2拍ガード**（§2 実測＝発火5件中4件が1拍断片・ノイズ×ノイズ）。転回(slash)はガードせず継続。
- `chordname.ts` の **hdim/hdim7 → m7b5** 修正（§3.4＝`/dim7/` 先勝ちで dim7 へ誤縮約していた・isHalfDim に `hdim` 追加）。通常 dim7 は退行なし。

### D1（別監査 drum §a0）＝区間分解ゲートの独立化（SDD：design.md #S12改 に是正追記）
`reaper.ts` の `extractSectionPatterns` 呼び出しを**全体 conf ゲートから分離**（区間採否は区間自身の conf≥0.3・既存 per-section ガードが担う）。全体 conf<0.3 でも高conf区間の rhythm/bass/melody 区間ネタが立つ。合成データ（全体 conf 0.235・区間 conf 1.0）で回帰テスト追加＝旧実装なら 0 枚だった rhythm ネタが 1 枚立つことを固定。

### 未着手（本バッチの射程外・記録のみ）
- resolveTonic の mode（major/minor/Dorian）微調整＝共有関数のため別案件・耳較正待ち。
- BTC softmax 温存・beat-synchronous デコード・maxBeats の秒/小節化＝§4「やらない判定」のとおり保留。
