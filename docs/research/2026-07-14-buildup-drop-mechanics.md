# ビルドアップ／ドロップの緊張-解放メカニクス（MIDIテンプレ化）

- 日付: 2026-07-14
- 目的: EDM/ダンス系の「ビルドアップ→ドロップ」の緊張-解放を、**MIDIで表現できる要素だけ**に絞ってテンプレ化する。フィルタ/リバーブ等の音響加工はDAW側前提。本ツールが吐くのはノート・ベロシティ・GMドラムのみ。
- 制約: MIDIレベルで再現できる操作＝(a) ノート密度の時間スケジュール、(b) ベロシティ・カーブ、(c) ピッチ（上行スケール/クロマ連打）、(d) 発音の間引き/無音ギャップ、(e) 音域・レイヤの出入り。連続フィルタ掃引はMIDI外なので**ベロシティ漸増＋音域上げ**で近似する。

---

## 0. なぜ効くのか（設計の根拠：知覚・神経）

「ドロップが気持ちいい」の正体は**予測と逸脱の報酬**であって、単に音量が上がることではない。これがMIDIテンプレの設計原理になる。

- **Huron の ITPRA 理論**（`Sweet Anticipation`）: 期待反応は5段階＝Imagination / **Tension** / Prediction / Reaction / Appraisal。イベント接近に伴い**生理的覚醒＝Tensionが上昇**し、イベント発生後に予測的中/逸脱の評価が快をもたらす。ビルドアップは「T（緊張）を機械的に積む区間」、ドロップは「P/R/A（解決）を一気に発火させる点」という役割分担で捉えると設計がぶれない。 出典: https://mtosmt.org/issues/mto.09.15.3/mto.09.15.3.aversa.html , https://direct.mit.edu/books/monograph/1961/bookpreview-pdf/2429413
- **ドーパミンの二相性**: 快の前（クライマックス直前の数秒）に「期待＝wanting」系が発火し、ピーク到達で「快＝liking」系（側坐核）に移る。**期待側の報酬が実体験に匹敵/上回ることがある**＝ビルドの作り込みがドロップ本体と同じくらい効く、という実装上の含意。 出典: https://www.nature.com/articles/nn.2726
- **予測誤差と覚醒**: 期待イベントのミスマッチが注意処理を強め、覚醒を上げ、報酬系（VTA）のドーパミン活動を誘発。**「溜め切ってから外す/落とす」構造**が快を増幅する。 出典: https://pmc.ncbi.nlm.nih.gov/articles/PMC11592396/
- **ドロップのEEG研究**: ダンス音楽の突然の変化（drop）が前頭前野の活動と興奮・ポジティブ感情に及ぼす効果が測定対象になっている（Huron のcontrastive valence＝直前の緊張が直後の快を増す、と整合）。 出典: https://www.biorxiv.org/content/10.1101/637983.full.pdf

**設計含意**: テンプレは「単調増加（tension）→ 一瞬の空白（予測の宙吊り）→ 全帯域一斉復帰（解決）」の3局面を必ず持たせる。緊張の積み方は**単調（monotonic）**でなければならない（下がると溜めが抜ける）。

---

## 1. ビルドアップの要素分解（MIDI近似）

### 1-1. スネアロール＝密度倍加スケジュール（本命）

コアは「**分割を段階的に倍にして体感加速**」。テンポは変えず、ノート数だけ増やす（＝プロジェクトBPM固定のまま加速して聞こえる）。教則の定番進行は「4拍打ち→8分→16分→…」の倍化。

出典: https://www.edmprod.com/ultimate-guide-build-ups/ （"started off with 4 bars of a snare hitting every beat, then it doubled to eighth notes, and so on"） / https://www.attackmagazine.com/technique/tutorials/10-snare-rolls-for-the-drop/ （"Speed Up Roll" 4分→8分→16分を1小節内で増やす）/ https://www.musicradar.com/how-to/how-to-create-the-ultimate-snare-roll-build-up

**8小節ビルドの密度スケジュール（4/4, GMスネア=D1/38）**：

| 小節 | 分割 | 1小節あたりノート数 | 音価(16分=1として) |
|---|---|---|---|
| 1–2 | 4分 | 4 | 4 |
| 3–4 | 8分 | 8 | 2 |
| 5–6 | 16分 | 16 | 1 |
| 7 | 16分 | 16 | 1 |
| 8 | 32分（前半）→ 空白（後半） | 32→0 | 0.5 |

- **32分は最後の1〜2拍だけ**に留める（GM再生でつぶれやすい・DAW差し替え前提でも密度は十分伝わる）。全編32分にすると加速の"到達点"が消える。
- **三連の亜種**: 16分の代わりに8分3連（1小節12ノート）を挟むと"転がる"質感。ジャンルで選択。
- **倍加の位置**: 段は必ず**小節頭**で切り替える（拍中で変えると加速が不明瞭）。

### 1-2. ベロシティ漸増（フィルタ開き/リバーブ増の MIDI 近似）

連続フィルタ掃引はMIDI外。**ベロシティを 1→127 へ単調ランプ**して「明るく・前に出てくる」を代替する。

- **全体カーブ**: ロール先頭 vel≈40〜60、ドロップ直前で vel≈120〜127 の直線または軽い指数（後半で急）。
- **拍内アクセント併用**: 4連の頭を強く残り3つを弱く（"1つ強+3つ弱"）＝機械的にならずグルーヴが出る。単調ランプ×拍内アクセントの二層。 出典: https://www.attackmagazine.com/technique/tutorials/10-snare-rolls-for-the-drop/
- 実装は既存 feel/velocity 層に「区間ベロシティ・エンベロープ」を1本足すだけで足りる。

### 1-3. ピッチライザーの MIDI 近似（上行スケール／クロマチック連打）

シンセriserの代替。**単音の連打をスケール上行/半音上行させる**、または持続的な上行ラインを重ねる。

- **クロマ連打**: 8分〜16分で半音ずつ上げる連打（例 C→C#→D…）。ドロップ直前2〜4小節に配置。
- **スケール上行**: キー/モードに沿った上行（key+mode宣言を尊重）。連打版（刻み）＋持続版（ロングトーン）の2層でriser特有の"厚み"を近似。 出典: https://unison.audio/how-to-create-risers/ , https://www.edmprod.com/ultimate-guide-build-ups/
- **上げ過ぎ注意**: 教則も「高すぎは耳に痛い」。到達音は概ねリード最高音の少し下で頭打ち。
- **音域も緊張軸**: MIDIでは「音域を徐々に上げる」こと自体がフィルタ開きの代替になる（低域を削る＝低ノートを間引き、高域を足す＝上行）。

### 1-4. リズム間引き（キック抜き）＝低域の除去を MIDI で

教則の要点は「ビルド終盤で**低域を抜いてドロップのインパクトを稼ぐ**」。MIDIでは連続HPFの代わりに**キック（GM=C1/36）とベースの低ノートを間引く/停止**する。

- 典型: ビルド後半（残り2〜4小節）で4つ打ちキックを**停止**、スネアロールと riser だけにする。
- ベースは**オクターブ上げ**か停止で低域を空ける（ドロップで戻すコントラストが最大化）。
- 「キックのサステインを削る（HPF）」の代替＝キックを短い別ノート/弱ベロに置換、または抜く。 出典: https://www.edmprod.com/ultimate-guide-build-ups/

### 1-5. 無音ギャップ（ドロップ直前 1拍〜1小節）

「**真のインパクトは静寂から来る**」。ドロップ直前に発音を止める空白＝ITPRAの「予測の宙吊り」を作る。

- **長さの相場**: 1拍（軽い）／2拍／1小節（最大級）。ロング曲・大サビほど長め。
- **完全無音 vs 残響**: 教則は「完全無音より**リバーブ/ディレイのテール**を残す」ことが多い＝MIDIでは直前ノートをsustain/長めにして"余韻だけ残る"を演出（実残響はDAW）。 出典: https://www.edmprod.com/ultimate-guide-build-ups/
- **配置**: 密度スケジュールの32分ピーク直後にギャップ＝「加速し切る→ふっと消える→落ちる」。

### 1-6. ハーモニックな溜め（コード反復）

「最後のコードをドロップ直前まで反復」して和声解決を宙吊りにする（Vや不安定和音で止める）。MIDIのコードトラックで実装可能。 出典: https://www.edmprod.com/ultimate-guide-build-ups/

---

## 2. ドロップの構造

### 2-1. 頭の要素＝同時 or 時間差

ドロップ冒頭の入り方は2系統。**どちらもMIDIで完全制御可能**（各トラックのノート開始拍）。

- **同時（simultaneous / full-force）**: キック＋ベース＋リードを1拍目で一斉復帰。最も強い解放。1-5の無音ギャップと組むと最大インパクト。 出典: https://cymatics.fm/blogs/production/edm-song-structure
- **時間差（staggered）**: よくある型は「1小節目はキック＋ベースのみ→2小節目でリード投入」または「ドロップ頭は間引き、2〜4小節目でフル」。full spectrum（bass+lead+drums全部）に**段階的に到達**させて2段目の盛り上げを作る。 出典: https://theproaudiofiles.com/tips-for-better-buildups-and-drops-in-edm/
- **実装ノブ**: `drop_entry = "hit_all" | "stagger_lead" | "stagger_full"`。

### 2-2. 8/16小節構造

- ドロップ本体の相場は**8〜32小節、16小節が最頻**。 出典: https://exclusivemagazine.co.uk/when-should-you-add-a-drop-in-a-track/ , https://edmtips.com/edm-song-structure/
- **内部の8小節割り**: 16小節ドロップは「前半8＝主フレーズ／後半8＝ベース or リズムに変化」。8小節ごとに何か変える＝飽き対策の定石。 出典: https://theproaudiofiles.com/tips-for-better-buildups-and-drops-in-edm/
- 16/32小節はDJミックスの単位でもある（intro/outro）。 出典: https://cymatics.fm/blogs/production/edm-song-structure

### 2-3. セカンドドロップの変化

- 2回目は**同尺 or やや長め**にしてエネルギーを上乗せ。 出典: https://exclusivemagazine.co.uk/when-should-you-add-a-drop-in-a-track/
- 変化の付け所（MIDI可）: ベースパターン変更／リズム変更／リードのオクターブ・裏メロ追加／ドラムのフィル密度増／ハーフタイム化やダブルタイム化。「同一反復にしない」が原則。

---

## 3. 長さの相場（まとめ）

| 区間 | 相場 | 出典 |
|---|---|---|
| ビルドアップ | **8小節が安全牌**、4（短い遷移）/16（大サビ前）も可 | https://www.edmprod.com/ultimate-guide-build-ups/ |
| riser/スネアビルド | 4 / 8 / 16小節（遷移の重さで選ぶ） | https://unison.audio/how-to-create-risers/ |
| ドロップ本体 | 8〜32小節、**16が最頻** | https://exclusivemagazine.co.uk/when-should-you-add-a-drop-in-a-track/ |
| 無音ギャップ | 1拍〜1小節 | https://www.edmprod.com/ultimate-guide-build-ups/ |
| intro/outro | 16 or 32小節（DJ都合） | https://cymatics.fm/blogs/production/edm-song-structure |

---

## 4. J-pop / ボカロ / バンド編成への転用

EDMの「ビルド→ドロップ」語彙は、バンド編成の「**Bメロ後半／プリコーラス → サビ**」にほぼ写像できる。低域除去や連続フィルタは無いが、MIDIで再現できる手法に対応がある。

| EDM語彙（MIDI近似） | バンド/J-pop での対応 | MIDI操作 |
|---|---|---|
| スネアロール密度倍加 | プリコーラス〜サビ直前の**ドラムフィル**、タム回し、スネア連打 | GMスネア/タムの密度スケジュール（16分・6連） |
| キック抜き＋低域除去 | **全楽器ブレイク**（サビ直前にバンドが一斉に止まる/一発だけ残す） | 全トラック停止＋1ヒットのみ |
| 無音ギャップ | サビ直前の"タメ"（ボーカルだけ/無伴奏1拍） | 伴奏ノート停止、1〜2拍 |
| riser上行 | ストリングス/シンセ/ギターの**上行ライン**、ボーカルの音域上昇 | スケール上行ライン追加 |
| ベロシティ漸増 | クレッシェンド（バンド全体の強打へ） | 区間ベロシティ・ランプ |
| コード反復の溜め | サビ直前でV/on-コードのペダル、ドミナント保持 | コードトラックで宙吊り |
| ドロップ頭の一斉復帰 | **サビ頭のバンドイン**（全楽器fff同時） | サビ1拍目に全トラック復帰 |

- J-pop/アニソンの定石として、プリコーラスで**ドラムが倍速化して加速感**、サビ直前に**4拍目からスネアを先取りするフィル→一瞬の休符でドラマ化**が知られる。 出典: https://sgtwiggles.github.io/wotagei/structure/ , https://thalesmatos.com/blog/arrange-pop-songs-instrumentals/
- 「ビルド的手法＝スネア連打＋全楽器ブレイク→サビ」は、EDMドロップと**同じ緊張-解放の骨格**（ITPRA）を共有する。ジャンルが違っても本ツールの同一テンプレを流用できる、が設計上の含意。

---

## 5. 仕様化（実装へ）

### 5-1. ビルドテンプレ 3種（要素×小節タイムライン）

記号: ●=フル発音 / ◔=間引き・弱 / ↑=上行riser / ▓=スネアロール（分割） / ␣=無音ギャップ / ✕=停止

#### テンプレ A：「Standard 8-bar」（汎用・安全牌）

| 小節 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Kick(4つ打ち) | ● | ● | ● | ● | ● | ◔ | ✕ | ✕ |
| Snare roll | 4分▓ | 4分▓ | 8分▓ | 8分▓ | 16分▓ | 16分▓ | 16分▓ | 32分▓→␣(末尾1拍) |
| Riser(上行) | – | – | – | ↑ | ↑ | ↑ | ↑ | ↑→␣ |
| Bass | ● | ● | ● | ● | ◔(oct up) | ◔ | ✕ | ✕ |
| Velocity | 50 | 60 | 70 | 82 | 95 | 108 | 120 | 127→(gap) |
| Chord | 進行 | 進行 | 進行 | 進行 | V保持 | V保持 | V保持 | V保持→␣ |
| ギャップ | | | | | | | | 末尾**1拍**無音 |

#### テンプレ B：「Big 16-bar」（大サビ前・最大溜め）

- 1–8小節: A の 1–4 を倍尺に引き延ばし（4分▓×4 → 8分▓×4）。riser は9小節目から。
- 9–14小節: 16分▓、Kick は12小節で停止、Bass 停止、Velocity 90→120 単調増。
- 15小節: 32分▓ピーク＋クロマ上行連打。
- 16小節: **1小節まるごと無音ギャップ**（残響テール想定でコード最終音のみ長音）。
- 用途: ラスサビ前、フェス的な最大クライマックス。

#### テンプレ C：「Tight 4-bar / J-pop プリコーラス」（軽量・遷移用）

| 小節 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Drums | 通常ビート | 通常＋ゴースト | 8分▓へ密度up | フィル(16分/6連)→**4拍目タメ␣** |
| Riser/上行 | – | – | ↑ | ↑ |
| Band低域(Bass) | ● | ● | ◔ | ✕(全楽器ブレイク) |
| Velocity | 70 | 80 | 95 | 110→(gap) |

- 用途: Bメロ→サビ、prechorus。EDMの軽量ビルド＝バンドのプリコーラスに直結。

### 5-2. ドロップ・チェックリスト（生成後の検証項目）

- [ ] 直前ビルドの緊張が**単調増加**か（ベロシティ・密度・音域が下がっていない）
- [ ] ドロップ直前に**無音ギャップ**（1拍〜1小節）があるか（宙吊り）
- [ ] **低域**（キック/ベース低ノート）がビルド終盤で抜け、ドロップ頭で**復帰**しているか（コントラスト）
- [ ] ドロップ頭の入りを宣言（`hit_all` / `stagger_lead` / `stagger_full`）
- [ ] ドロップ本体が **8/16/32小節**の枠に収まっているか（16推奨）
- [ ] 16小節なら**後半8小節で何かが変化**しているか（ベース/リズム/裏メロ）
- [ ] セカンドドロップは初回と**差分**があるか（同一反復でない）
- [ ] riser の到達音がリード最高音を**超えていない**か（耳痛回避）
- [ ] 32分ロールは**末尾1〜2拍限定**か（加速の到達点を潰していない）
- [ ] コードが直前で**ドミナント/宙吊り**、ドロップ頭で**解決**しているか

### 5-3. セクション役割への組み込み案

既存の frame（key+mode宣言）＋セクション役割パイプラインに、緊張-解放を**セクション属性**として足す。

- **`prechorus = build（軽量版）`という解釈は妥当**。ITPRA的にプリコーラスはサビ前のTension積み区間で、EDMの4/8小節ビルドと機能同型。ただし「軽量版」＝密度倍加を1〜2段に留め、無音ギャップは短め（1拍）、低域除去は任意。**フル・ビルドはサビ/ドロップ直前専用**として区別する。
  - `prechorus.tension = "build_light"`（4小節・密度2段・gap≤1拍）
  - `drop前/大サビ前 = "build_full"`（8/16小節・密度3段・gap 1拍〜1小節・低域除去必須）
- **セクション役割に緊張エンベロープ属性を持たせる**:
  - `section.energy_target`（到達エネルギー 0–1）、`section.approach`（`flat`/`build`/`drop`/`breakdown`）
  - build区間は自動で「密度スケジュール＋ベロシティ・ランプ＋riser＋低域除去＋末尾gap」を敷設。
  - drop/サビ区間は「全帯域復帰＋entryモード＋後半変化」を敷設。
- **contrast は隣接セクションの差分で評価**（breakdown/Bメロで一度エネルギーを落としてからbuild→dropにすると解放が最大化。ITPRAのcontrastive valence）。
- 既存 role UI（track-wiring シリーズ）に `approach` ノブを1つ追加するのが最小実装。

---

## 6. 設計含意（要点）

1. **緊張は単調増加の合成**＝密度（ノート数）×ベロシティ×音域上げ×低域除去。MIDIで全部ノブ化できる。連続フィルタが無くてもこの4軸で"ビルド感"は十分立つ。
2. **無音ギャップは必須の一級要素**。音を足すのでなく"止める"ことが解放を作る（ITPRA/予測誤差）。テンプレのデフォルトに末尾gapを組み込む。
3. **ドロップ＝低域と全帯域の一斉復帰**。ビルドで抜いた低域を戻すコントラストが本体。抜いていないと戻す快が出ない＝チェックリスト必須項目。
4. **prechorus = build_light は妥当**だが、フルビルドと段階を分ける（密度段数・gap長・低域除去の有無で差別化）。
5. **J-pop/ボカロも同一骨格**。全楽器ブレイク＝キック抜き、ドラムフィル＝スネアロール、サビイン＝ドロップ同時入り。EDMテンプレをジャンル横断で流用可能。
6. **32分ロール/riser到達音の頭打ち**は品質ガード。やり過ぎると加速の到達点・耳の快が消える。

---

## 出典一覧（URL）

- EDMProd, Ultimate Guide to Build-Ups: https://www.edmprod.com/ultimate-guide-build-ups/
- Attack Magazine, 10 Snare Rolls For The Drop: https://www.attackmagazine.com/technique/tutorials/10-snare-rolls-for-the-drop/
- MusicRadar, Ultimate snare roll build-up: https://www.musicradar.com/how-to/how-to-create-the-ultimate-snare-roll-build-up
- Unison, How to Create Risers: https://unison.audio/how-to-create-risers/
- Cymatics, EDM Song Structure: https://cymatics.fm/blogs/production/edm-song-structure
- EDMTips, EDM Song Structure: https://edmtips.com/edm-song-structure/
- Hyperbits, EDM Song Structure: https://hyperbits.com/blog/edm-song-structure/
- Pro Audio Files, 6 Tips for Better Buildups and Drops: https://theproaudiofiles.com/tips-for-better-buildups-and-drops-in-edm/
- Exclusive Magazine, When to Add a Drop / timing: https://exclusivemagazine.co.uk/when-should-you-add-a-drop-in-a-track/
- 学術: Salimpoor et al., Anatomically distinct dopamine release (Nature Neuroscience): https://www.nature.com/articles/nn.2726
- 学術: Neural Mechanism of Musical Pleasure Induced by Prediction Errors (EEG, PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC11592396/
- 学術: When tension is exciting — EEG exploration of excitement in music (bioRxiv): https://www.biorxiv.org/content/10.1101/637983.full.pdf
- Huron, ITPRA / Sweet Anticipation（レビュー・書誌）: https://mtosmt.org/issues/mto.09.15.3/mto.09.15.3.aversa.html , https://direct.mit.edu/books/monograph/1961/bookpreview-pdf/2429413
- J-pop/アニソン構造: https://sgtwiggles.github.io/wotagei/structure/
- ポップス編曲（プリコーラス密度化・フィル）: https://thalesmatos.com/blog/arrange-pop-songs-instrumentals/
