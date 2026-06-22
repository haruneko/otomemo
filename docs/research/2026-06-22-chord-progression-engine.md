# 研究レポート：コード進行エンジン — 「進行DB＋ルール＋Claude選択」で music21 重理論ライブラリ無しに作れるか（ポップス）

調査日: 2026-06-22 / 対象: creative_manager（自己ホスト・Python worker＋TS core・C基準/拍ベースJSON・ポップス）
種別: **研究（実装ではない・コード不変）**。一次資料はコード読取＋WebSearch/WebFetch の引用付き。推測と事実を分離する。
関連先行研究: `docs/research/2026-06-21-generation-methods.md`（#86 Claude非依存スタック）, `docs/research/2026-06-21-routing-scenarios.md`（振り分けA・名前付き進行DB提案）。

> **結論（先出し・5行）**
> 1. ポップスのコード進行の**生成・代替・つなぎ**は、深い理論ライブラリ無しの「**実在進行DB（度数列＋タグ）＋等価クラス表（ルール）＋Claudeの選択**」で十分作れる。実在システム（Hooktheory/ChordChord/Captain Chords/Band-in-a-Box）が全部この型＝DB・テンプレ・確率＋薄いルールで、ML生成は本流でない。
> 2. **music21 は撤廃可能**。残る2機能（`detect_key`=Krumhansl, `analyze_progression`=度数→ローマ数字）は**自前で40〜80行**に落ちる（KSは公開プロファイル、ローマ数字はコード既知なので度数表引き）。`analyze_fit`は既に自前。
> 3. music21 撤廃の**本丸は生成ではなくリファレンス分析の入口**。源が **MIDI なら表引きで分析ライブラリ不要**（既存 import_midi 経路＝root/quality 既知）。**audio なら要ライブラリ**（madmom/chordino 等、ただし精度 ~84% 止まり＝下流の信頼を割引く前提）。
> 4. **役割境界（#86改訂案）**：Claude＝コード選択・代替/つなぎの「好み」判断、ルール＝合法手の列挙・実音realize・当てはまり判定（analyze_fit 維持）。「Claudeは音符に触らない」を「**Claudeは度数（記号）を選ぶ／実音はルールが作る**」へ意図的に改訂。
> 5. **置き場**：データモデルとretrieval/substitute/continuationは**ほぼ表引き＝TS core 移管が #20 と整合**。ただし当てはまり判定（analyze_fit）と将来のaudio分析はPythonに残す＝**ハイブリッド（記号操作=TS、信号/判定=Python）**を推奨。

---

## 0. 現状の事実（コードで確認）

`apps/worker/src/cm_worker/music/` を読んで確定した事実：

- **生成**は全て自前Python・music21非依存：
  - `generate.py: gen_chords` … 機能和声 T/S/D マルコフ＋**ダイアトニック度数表だけ**（`_DIATONIC_MAJOR/_MINOR`）。入力は frame `{key, meter, bars, mood}`。mood に短調ヒント語があれば短調表へ。**非ダイアトニック（E7セカンダリードミナント, Gm7）を原理的に出せない**（routing調査で確認済）。
  - `generate.py: gen_melody/gen_bass/gen_drums` … コードトーン拘束・GMテンプレ。
  - `progressions.py`（#98）… **名前付き進行DB**＝`NAMED_PROGRESSIONS: dict[name→{aliases, degrees:[(root_pc, quality)…]}]`。C基準の度数列で丸の内/カノン/小室/王道4536/ツーファイブ/12小節ブルースを確定保持。`find_progression`（別名・表記揺れ照合）, `realize_progression`（1コード=1小節でcontentへ）。**本レポートが拡張する起点**。
  - `bass.py` … 相対ベース解決（度数→実音高）。
  - `theory.py` … `QUALITY_INTERVALS`（コード品質→半音インターバル）, `MAJOR/MINOR_SCALE`, `chord_pcs`, `scale_pcs`, `norm_root`。**純Python・依存ゼロ**。
- **music21 を使うのは `analyze.py` の2機能だけ**（grep で確認、他に import 無し）：
  - `detect_key(notes)` … Krumhansl-Schmuckler 調推定（`stream.analyze("key")`）。
  - `analyze_progression(chords, key)` … `roman.romanNumeralFromChord` でローマ数字＋機能（T/S/D）。
  - `analyze_fit(melody, chords, key)` は**自前**（拍重み在和音率＋非和声音分類、~0.01ms）。`correct.py: fit_to_chords` も自前（other型外し音のスナップ）。
- 依存: `apps/worker/pyproject.toml` に `numpy>=2, mido>=1.3, music21>=9.1`。**music21 を外せば numpy/mido のみで生成系は全部動く**（generate/progressions/theory/bass/correct は numpy も不使用）。
- 設計の正準（design.md）:
  - **#86**「生成はルール優先・**Claudeは音符に触らない**」「判定が提案の前提」。
  - **振り分けA**（L259-262）：consult を **(S)特定/名前/旋法/様式→Claude知識** vs **(G)汎用→ルール** に分岐。#98 名前付き進行DBで(S)の定番を「Claudeのそれっぽさ」→「確定realize」に格上げ済。
  - **#20**：操作はMCPで公開（TS=操作所有・薄いproxy/route、Python/Claude=知能）。「TS↔Python＝ジョブ表のみ」。
  - **#14**：content は C基準保存・調は配置/ネタの key で後段トランスポーズ。

→ **「music21 を生成から外す」は既に完了済み**（generate/progressions が証拠）。残る課題は (a) 分析2機能の自前化、(b) gen_chords のマルコフを DB+ルール+Claude選択に置換するか、(c) リファレンス分析→DB蓄積の入口設計。

---

# 1. ポップス・コード理論 primer（実装者の地ならし）

> 実装者がこの節を読まずに作ると的を外す。最小限の語彙と「等価クラス」「終止」「セクションのつなぎ」を入れておく。すべて**度数（C基準ローマ数字）**で考える＝アプリの content と同じ。

## 1.1 機能（T/S/D）とダイアトニック
- メジャーキーの7和音（ダイアトニック）と機能：
  - **T（トニック・安定）**：I, vi, iii
  - **S（サブドミナント・準備）**：IV, ii
  - **D（ドミナント・緊張）**：V, vii°
- マイナーキーは i, ii°, ♭III, iv, v/V, ♭VI, ♭VII（自然短音階）＋和声短音階で V（長三和音）を作ると終止が締まる。
- 機能の典型運動：**T→S→D→T**（離れて準備して緊張して解決）。これが gen_chords の `_FUNC_NEXT` の根拠。
- 機能代理：同じ機能内のコードは互いに**代理**できる（I↔vi↔iii、IV↔ii）。これが代替の最初の等価クラス。

## 1.2 ポップス定番進行（度数・C基準）
| 名前 | 度数 | C基準例 | 性格 |
|---|---|---|---|
| I-V-vi-IV（"4 chords"/Axis） | I-V-vi-IV | C-G-Am-F | 最頻出・万能・明るい |
| 王道進行（4536） | IVM7-V7-iii(m7)-vi(m7) | FM7-G7-Em7-Am7 | 浮遊感＋次への期待（J-POP頻出） |
| 小室進行（6451） | vi-IV-V-I | Am-F-G-C | マイナー始まり→希望への解決 |
| カノン進行 | I-V-vi-iii-IV-I-IV-V | C-G-Am-Em-F-C-F-G | 下降ベース・荘厳 |
| 丸サ/JtToU進行 | IVM7-III7-vim7-Vm7-I7 | FM7-E7-Am7-Gm7-C7 | おしゃれ・**非ダイアトニック含む** |
| ツーファイブ（ii-V-I） | iim7-V7-IM7 | Dm7-G7-CM7 | ジャズ的解決・転調の糊 |
| 12小節ブルース | I7×4/IV7×2 I7×2/V7 IV7 I7 V7 | C7…F7…G7… | ブルース定型・全部dom7 |

事実：Hooktheory（75,000+曲・1.5M Hookpad）の集計で **I=18.9%, IV=17.2%** が最頻出コード。「IV→I の後に V が続く」が44%等、**コード遷移は確率的に強く偏る**（DB+遷移確率で十分予測できる根拠）[Hooktheory]。J-POPの3大定番（カノン/小室/王道）は**全てダイアトニックのみ**で構成され、丸サ進行のように非ダイアトニックを含むものは別格[JBG音楽院/UtaTen/Wikipedia 王道進行]。

## 1.3 終止（cadence）＝「終わり風 vs 続く感じ」を決める核
| 終止 | 形 | 感覚 |
|---|---|---|
| 正格終止（authentic / PAC・IAC） | V→I（ソプラノが主音なら完全=PAC） | 最強の「終わった」 |
| 半終止（half） | …→V で止める | 「続く・宙ぶらりん」＝Aメロ末・問いかけ |
| 偽終止（deceptive / interrupted） | V→vi（I を期待させて裏切る） | 「続く・引き伸ばし」＝サビ前で煽る |
| 変格終止（plagal / "Amen"） | IV→I | 柔らかい終止・付け足し |

実装示唆：**「終わり風 vs 続く感じ」は最後の2コードで決まる**。continuation 操作は「終止を検出し、続けたいなら half/deceptive、締めたいなら authentic/plagal を選ぶ」だけで体験を作れる[muted.io/Wikipedia Cadence/musicnotes]。

## 1.4 代替の等価クラス（substitute の理論的核）
代替＝「同じ役割の別のコードに差し替える」。ポップスで使う等価クラス：
1. **機能代理（diatonic substitution）**：I↔iii↔vi（T）、IV↔ii（S）、V↔vii°（D）。最も安全。
2. **相対・平行**：I↔vi（相対短調）、共通音3つ。
3. **セカンダリードミナント（V/x）**：あるコードへ向かう一時的V7を挿入（例：Am の前に E7=V/vi）。丸サ進行のIII7がこれ。
4. **裏コード / トライトーン・サブ（tritone sub / SubV）**：V7 を**三全音離れた dom7** に差し替える（G7→D♭7）。ルート運動が半音下行になる＝おしゃれ・ジャズ的[Wikipedia Tritone substitution/HubGuitar]。
5. **モーダルインターチェンジ／借用（borrowed chord）**：平行調から借りる（メジャーキーに iv, ♭VII, ♭VI, ♭III 等）。色付け[Yamaha/AudioFanzine]。
6. **テンション付加**：三和音→7th/9th/sus（質の差し替え。丸サ進行は全部7th系）。

これらは**有限の規則で表に書ける**＝「与えられた度数＋質→代替候補のリスト」を返す決定的関数になる。ML不要。これが本レポートの `substitute` の土台。

> 注（severity: 中）：等価クラスは**文脈依存**（前後のコード・キー・声部進行で適否が変わる）。表は「合法手の候補」を出すまで。**どれを採るかの好み判断＝Claude**に委ねる（§4の境界）。

## 1.5 セクション役割とつなぎ・転換の型
- **役割**：イントロ / A（verse）/ B（pre-chorus）/ サビ（chorus）/ ブリッジ（bridge）/ アウトロ。
- **つなぎの型**（continuation が出すべきもの）：
  - **ピボット転換**：セクション末を half/deceptive で開いておき、次セクション頭へつなぐ。
  - **エネルギー転換**：Aは落ち着き（I始まり多め）→Bで緊張を溜める（D系・上行）→サビで開放（4 chords や王道）。
  - **転調**：サビで半音/全音上げ、平行調へ。ピボットコード（両キー共通の機能和音）で橋渡し。
  - **同進行の質替え**：Aとサビで同じ度数進行のまま voicing/テンションを変える（ポップス頻出）。
- Rohrmeier の生成文法（generative syntax of tonal harmony）は「進行はマルコフ遷移表より複雑で、**再帰的依存と機能的に等価なコードの置換**で組織される」と論じる＝**階層・置換**が本質という理論的裏付け[Rohrmeier 2011, tandfonline/SMC07]。実装では完全な文法は要らず、**(a) 等価クラス置換（substitute）＋(b) 終止/役割の階層（continuation）**という二点だけ Rohrmeier から借りれば足りる。

---

# 2. 手法サーベイ（DB+ルール+LLM選択 vs 文法 vs マルコフ/HMM vs ニューラル）

## 2.1 手法比較（ポップス×当アーキ文脈）
| 手法 | 仕組み | 長所 | 短所 | 本件適合 |
|---|---|---|---|---|
| **DB＋タグ検索＋ルール＋LLM選択（本命）** | 実在進行を度数列＋タグで蓄積→検索→代替/つなぎ規則→Claudeが選ぶ | 定番を**確実に再現**・当てはまり保証・学習ゼロ・説明可能・少データで動く | DBの網羅性とタグ品質に依存・「未知の独創進行」は出にくい | **◎** |
| 生成文法（Rohrmeier型 PCFG） | 機能の階層を文法規則で展開 | 長期構造・再帰・置換を原理的に表現 | 実装重・ポップスには過剰・確率付与が要学習 | △（置換/階層の発想だけ借用） |
| マルコフ / HMM | コード遷移確率（現 gen_chords） | 軽い・少データ・実装容易 | **長期構造を持たない**・定番の固有形（丸サ等）を出せない・凡庸化 | △（多様性の補助に格下げ） |
| ニューラル（Transformer/RNN/VAE） | コーパス学習で次コード予測 | 滑らかな遷移・大規模なら高品質 | 要GPU/データ・自前学習非現実・**LLMは和声理解が欠落**（先行研究R3） | ×（自前学習）／推論流用は隔離（#86 Stage3） |

## 2.2 実在システムは何でできているか（裏取り）
- **Hooktheory / TheoryTab**：75,000+曲のクラウドソース分析DB。Trends/API は**度数（ローマ数字・キー相対）の遷移確率**を返し、「次に来やすいコード」を確率サイズで提示。**完全に DB＋統計**でML生成ではない[Hooktheory blog/API docs/Trends]。→ **本件の DB+遷移確率と同型**。
- **ChordChord / AutoChords / Musicca 等のWeb生成器**：**音楽理論ルール内のランダム化**（ダイアトニックの質パターン I=major, ii=minor…＋機能進行）。「ランダムだが常に機能的」[ChordChord/Musicca]。→ ルール＋ランダムで十分動く実証。
- **Captain Chords（Mixed In Key）**：**有名曲の進行プリセット**＋キー/スケール内のコードを Magic Button で並べる。triads/7/9/sus やモード（Phrygian/Mixolydian…）選択。**プリセットDB＋スケール拘束＋手動選択**[Mixed In Key]。→ 本件の DB+質替え+ユーザー(Claude)選択と同型。
- **Band-in-a-Box**：ユーザーがコード進行を入力→**スタイルDB**から algorithmic patterns で伴奏生成（実奏者音源を加工）。生成の核は**スタイルDB＋パターン**[PG Music/Grokipedia]。
- **Scaler 2**：**MIDI/audio 検出**でコードを認識し、スケール内の代替コードを提示。**MIDI検出は高精度・audio検出は精度が落ちる**と明記[andrulian/soundand.design]。→ **§5の MIDI源=高精度・audio源=要注意**を実システムも追認。
- **RAG×LLM（学術）**：Jonason et al.「Retrieval Augmented Generation of Symbolic Music with LLMs」は、**mode/meter/type でタグ付けした曲DB**から retrieval-LLM がタグ抽出→Jaccard類似で3例フェッチ→生成LLMのプロンプトに注入。「実装容易で有望」と報告[arxiv 2311.10384]。→ **本件の「タグ検索＋Claude選択」を直接裏付ける**先行研究。ただし定量評価は未確立＝**retrieval品質とLLM選択一貫性は要検証**（§7）。

> **裏取り結論（事実）**：「DB＋ルール＋（人/LLM）選択」は、ポップスのコード生成・代替・つなぎを担う**実在の主流**であり、ML生成は本流ではない。本件（DB+rules+Claude）は妥当。

---

# 3. 設計ドキュメント（コード進行エンジン）

## 3.1 データモデル（#98 progressions.py を吸収・拡張）

現 `NAMED_PROGRESSIONS` を **タグ付きエントリ**へ拡張する（C基準度数列は維持）。JSON/テーブル両表現：

```jsonc
// progression entry（C基準・調はヒント＝#14）
{
  "id": "marunouchi",
  "name": "丸の内",
  "aliases": ["丸サ", "justthetwoofus", "jtou"],
  "degrees": [                       // C基準の (root_pc, quality)（#98互換）
    [5,"maj7"],[4,"7"],[9,"m7"],[7,"m7"],[0,"7"]
  ],
  "roman": ["IVM7","III7","vim7","Vm7","I7"],   // 表示・機能解析用（任意・導出可）
  "tags": {
    "mood": ["おしゃれ","都会的","切ない"],       // mood語彙（§3.2でClaude/埋め込みが写像）
    "genre": ["citypop","jpop"],
    "function_profile": ["S","D","T","S","D"],   // 各コードの機能（導出 or 明示）
    "cadence": "none",                            // 終止タイプ（authentic/half/deceptive/plagal/none）
    "section_role": ["A","chorus"],              // 似合うセクション役割
    "non_diatonic": true                          // 非ダイアトニック含むか（gen_chordsで出せない印）
  },
  "meta": {
    "source": "curated|midi_import|web|user",     // provenance
    "provenance": "椎名林檎 丸ノ内サディスティック",
    "confidence": 1.0,                            // curated=1.0, audio抽出=低
    "bars_hint": 5
  }
}
```

テーブル案（TS core / SQLite に置く場合）：
- `progression(id PK, name, degrees_json, roman_json, source, provenance, confidence, non_diatonic, created_at)`
- `progression_tag(progression_id, kind, value)` … kind ∈ {mood, genre, section_role, cadence}。検索用に縦持ち＋index。
- `function_profile` と `cadence` は **degrees から導出可能**（§5の自前 analyze_progression）＝**保存は任意・キャッシュ扱い**。冗長保存は「タグの主観性」を一箇所に閉じ込める利点もある。

移行：`progressions.py: NAMED_PROGRESSIONS` の6エントリをこのスキーマへ。`find_progression`（別名・表記揺れ照合）はそのまま retrieval の「名前一致」レーンとして残す。

## 3.2 操作API（必須3つ＋洗い出し）

### ① `retrieve(query) → progressions[]`（雰囲気/言葉→進行）
- 入力：自然言語 query（"おしゃれで切ない"、"サビで盛り上がる"、"丸の内っぽい"）＋ frame（key/meter/bars/section_role）。
- 二段：
  1. **名前一致レーン**（既存 `find_progression`）：固有名・別名があれば確定ヒット。
  2. **タグ検索レーン**：query→タグ集合に写像→DBをタグ一致でフィルタ→候補列挙。
- **mood→タグ写像の方式（要決定・§7）**：
  - (a) **Claude（NL→tags）**：queryをタグ語彙に正規化（"切ない"→mood:切ない/悲しい, genre推定）。語彙が小さく説明可能・実装容易。RAG先行研究もこの「retrieval-LLMがタグ抽出」型[arxiv 2311.10384]。**推奨：まずこれ**。
  - (b) **埋め込み**：query と各entryの説明文を embedding cos。語彙固定が要らないが、少データでブレ・説明性低。cm-search 既存基盤に乗るが**当面は(a)優先**。
- タグ語彙（定義必須・閉じた集合にする）：
  - `mood`：明るい/切ない/暗い/おしゃれ/都会的/疾走/荘厳/浮遊/ノスタルジック …（10〜20語に固定）
  - `genre`：jpop/citypop/anison/ballad/rock/blues/jazz …
  - `cadence`：authentic/half/deceptive/plagal/none
  - `section_role`：intro/A/B/chorus/bridge/outro
- 返り：候補進行＋なぜ合うか（タグ一致点）。**最終選択はClaude**（§4）。

### ② `substitute(progression, index) → alternatives[]`（代替候補）
- 入力：進行＋差し替えたい位置 index。
- ルール（§1.4 等価クラス表を関数化・**決定的に合法手を列挙**）：
  1. 機能代理（同機能の度数）
  2. 相対/平行（I↔vi 等）
  3. セカンダリードミナント（次コードへの V/x 挿入）
  4. 裏コード（dom7→tritone離れの dom7）
  5. モーダルインターチェンジ（借用：iv, ♭VII, ♭VI, ♭III）
  6. テンション質替え（triad→7/9/sus）
- 各候補に「種別ラベル＋当てはまり（§1.4の文脈注意）」を付ける。**どれを採るか＝Claudeの好み判断**。
- 返り：`[{degrees変更後, kind:"secondary_dominant", why}, …]`。実音realizeは既存 `realize_progression`。

### ③ `continuation(progression, target_section) → candidates[]`（つなぎ/次セクション案）
- 入力：現進行＋向かう先（target_section役割 or "続ける"/"締める"）。
- ルール：
  1. **終止検出**（§5の自前 analyze_progression で末尾2コードの機能を見る）→ いま「閉じている/開いている」を判定。
  2. **意図に応じた末尾整形**：締めたい→authentic/plagal、続けたい→half/deceptive。
  3. **次セクション頭の候補**：DBから target_section に合うタグの進行を retrieve、ピボット（共通機能和音）で接続。転調なら共通コードを橋に。
  4. **エネルギー転換**（§1.5）：A→B→chorus のテンション曲線に沿うものを優先。
- 返り：`[{tail_fix:[…], next:[…progression], kind:"deceptive→chorus", why}, …]`。選択はClaude。

### 洗い出した有用な追加操作
| 操作 | 内容 | 主担当 |
|---|---|---|
| `reharmonize(progression)` | 全体を一括で代替適用（おしゃれ化＝7th/9th化、ジャズ化＝ツーファイブ挿入） | ルール列挙→Claude選択 |
| `transpose_section` / `modulate(progression, to_key)` | 転調＋ピボット提示（決定的・既存transformと整合） | ルール |
| `analyze(progression)` | ローマ数字・機能・終止タイプ・非ダイアトニック箇所（§5自前） | ルール |
| `simplify(progression)` | テンション/借用を外しダイアトニックへ（substituteの逆） | ルール |
| `extend(progression, bars)` | 反復/前半リフレインで小節を埋める | ルール |
| `ingest_reference(midi or audio)` | リファレンス→度数列＋タグ抽出してDB追加（§5の本丸） | MIDI=ルール / audio=ライブラリ＋Claudeタグ付け |

## 3.3 Claude とルールの境界（#86 の意図的改訂）

> **#86 原文**：「生成はルール優先・**Claudeは音符に触らない**」「判定が提案の前提」。
> **本レポート改訂案（明文）**：**Claude＝コード（度数＝記号）の選択／ルール＝合法手の列挙・実音 realize・当てはまり判定**。
> ＝「Claudeは音符（実音高=pitch）に触らない」は維持しつつ、「**Claudeは進行（記号レベルの度数選択）には触れてよい**」へ緩める。これはユーザー確定方針1の明文化であり、#86 の精神（理論保証はルールが持つ・判定が提案の前提）を壊さない。Claude が選ぶのは**度数列という記号**で、実音高・voicing・当てはまりはルールが決定的に保証する。

| 操作 | ルールがやること（決定的・保証） | Claudeがやること（選択・好み） |
|---|---|---|
| retrieve | 名前一致・タグフィルタ・候補列挙 | query→タグ写像（NL解釈）／候補から1つ選ぶ理由付け |
| substitute | 等価クラスから**合法な代替候補を全列挙** | 文脈に合う1つを選ぶ・なぜを言語化 |
| continuation | 終止検出・末尾整形候補・次候補列挙・ピボット計算 | 「締める/続ける/盛り上げる」の意図解釈・選択 |
| realize | 度数列→C基準content→（後段）トランスポーズ・実音高 | （触らない） |
| 当てはまり判定 | `analyze_fit`（在和音率・非和声音）＝**維持** | 所見を読む批評 |
| ingest（audio） | 信号→コード候補（ライブラリ） | ラベルの揺れをタグ/名前へ解釈 |

不変条件（#86維持）：**Claudeが選んだ進行も必ず `analyze_progression`/（メロが絡むなら）`analyze_fit` を通す**＝「判定が提案の前提」。

## 3.4 music21 の処遇

### 生成＝不要（既にそう）
generate/progressions/theory/bass は music21 非依存。**何もしなくてよい**。

### 残る2機能の自前化評価
| 機能 | 現状 | 自前化の難易度 | 推奨 |
|---|---|---|---|
| `detect_key(notes)` | music21 `stream.analyze("key")`（KS） | **低**。KS/Aarden等のプロファイルは公開数値、相関を取るだけ＝**~40行**（先行研究R2に「Krumhansl自前~40行」と既出。rnhart.net に実装解説あり）。コードが既知のときはコードルートのPCH集計でさらに簡単 | **自前化可**。プロファイルは TKP/KS を定数表に |
| `analyze_progression(chords, key)` | music21 `romanNumeralFromChord` | **低**。**コードは既知（root/quality）**＝度数 = (root - key) mod 12 を度数名へ、qualityでローマ数字大小・記号を付ける表引き＝**~80行**。`_function_of` は既に自前 | **自前化可**。`theory.QUALITY_INTERVALS` と度数表で完結 |

→ **music21 は両機能とも自前置換可能**。`romanNumeralFromChord` の真価は「**未知の和音集合からコードを推定**」する所だが、本件は**コード既知**（content に root/quality）なので**最難関を踏まない**＝表引きで十分。**music21 を pyproject から落とせる**（依存削減・cold-start解消＝music_mcp の存在理由の一つが消える）。

> 注（severity: 低）：detect_key の自前KSは music21 と微差が出る可能性。**移行時に既存テストでスナップショット比較**（後退ゼロの担保）。and detect_key はそもそも `analyze_fit` 内で key 未指定時のフォールバックに使うだけ＝影響局所。

### リファレンス分析→蓄積の入口（music21撤廃の本丸・源で分岐）
| 源 | 必要なもの | music21代替 | 推奨 |
|---|---|---|---|
| **MIDI**（既存 import_midi 経路） | コードは**表引きで度数化可能**（root/quality 既知 or 同時発音pcから三和音マッチ）＝**分析ライブラリ不要** | 不要。自前の「pc集合→QUALITY_INTERVALS逆引き」でコード名、度数化、タグはClaude/ルール | **MIDI源を第一級に**。最も正確で安い |
| **audio（mp3等）** | コード認識が要る（信号処理） | **madmom**（CNN+CRF, MIREX上位）/ **Chordino(NNLS-Chroma)** / librosa+自前。music21は不要 | **要ライブラリ**だが**精度 ~84%（SOTA ChordFormer 84.7% root/84.1% majmin）止まり**＝maj/min中心で7thや借用は崩れる。**confidence低でDB投入**し、ユーザー/Claude確認を挟む |

事実：audio chord recognition の SOTA は ChordFormer で root 84.7% / majmin 84.1% / MIREX 83.6%[arxiv 2502.11840]。コーパスの 65% が純major/minor、seventh語彙で86%カバー[同/2602.19778]。Scaler2 も「**MIDI検出 > audio検出**」と明言[andrulian]。→ **audio分析は「完全採譜」を目標にせず、特徴量/おおまかな進行＋低confidence**で蓄積（先行研究R2の「特徴量レベルで十分」と一致）。

> ユーザー認識「何らか音響処理ライブラリは要るが music21 必然性は低い」は**正しい**。music21 は audio分析を**しない**（記号処理ライブラリ）。audio が要るなら madmom/librosa であって music21 ではない＝music21 は本件のどの用途でも必然性が無い。

## 3.5 置き場・言語の推奨（Python worker維持 vs TS core移管）

ユーザーのお気持ち：「ただの文字列処理/表引きに成り下がるなら Python 不要」。実評価：
- **データモデル・retrieve（タグ検索）・substitute（等価クラス表）・continuation（終止検出＋表引き）・realize（度数→content）** … **ほぼ表引き＋整数演算＝Python の必然性なし**。TS で書ける。#20「TSが操作コア・操作を所有」と整合し、MCP公開も自然。SQLite に進行DBを置けば retrieve はSQL。
- **`analyze_fit`（在和音率・非和声音分類）** … 純Pythonだが numpy も使わず**TS移植も容易**。ただし #86 で「判定はworkerの単一の真実」と位置づけ済＝**急いで動かす理由は薄い**。
- **audio分析（madmom/librosa）** … **Python必然**（信号処理ライブラリがPython）。
- **将来のDL推論流用（#86 Stage3 AMT等）** … Python＋隔離。

**推奨＝ハイブリッド（記号操作=TS core / 信号・判定=Python worker）**：
1. **進行DBと retrieve/substitute/continuation/realize は TS core へ新規実装**（表引き中心・#20準拠・MCPで公開）。#98 progressions.py の度数列データは TS へ移送（C基準・不変）。
2. **analyze_fit/detect_key/analyze_progression（判定）は当面 Python に残す**（#86の単一の真実・後退ゼロ）。music21だけ外して自前化。TS移植は急がない（移植は後退リスク・利得小）。
3. **audio分析（ingest_reference の audio源）は Python worker に新設**（madmom等・隔離venv）。MIDI源は TS でも Python でもよい（既存 import_midi 経路がどちらか次第）。

> ＝「成り下がる」部分（DB+表引き操作）は**素直に TS**。Python に残すのは**Python でないと損な部分**（判定の既存資産・信号処理）だけ。これで「記号操作のために Python を抱える」無駄は消える。

## 3.6 既存との移行計画（後退ゼロ・段階）

| 段階 | 内容 | gen_chords(マルコフ) | #98 | analyze_fit | routing-A |
|---|---|---|---|---|---|
| **S1**（DB拡張・後方互換） | #98 をタグ付きスキーマへ拡張＋定番進行を**20〜40件に増やす**（mood/genre/cadence/section_role タグ付け）。`find_progression` 維持 | 据置 | 吸収・拡張 | 不変 | 名前一致は強化 |
| **S2**（retrieve） | mood/言葉→タグ写像（Claude NL→tags）＋タグ検索。consult の(S)分岐を「名前一致 or タグ検索でDBヒット→確定realize」に拡張 | 据置（(G)汎用のfallback） | retrieve基盤に | 不変 | **(S)の網羅が増え(G)へ落ちる頻度減** |
| **S3**（substitute/continuation） | 等価クラス表・終止検出を実装。操作API＋MCP公開。Claude選択を配線 | 据置 | — | 不変 | 操作系は分岐外（新口） |
| **S4**（自前analyze） | detect_key/analyze_progression を music21から自前化→**music21 を pyproject から削除** | 据置 | — | **維持（自前化）** | 不変 |
| **S5**（ingest） | MIDI源の度数化→DB追加（表引き）。audio源は隔離venvで低confidence蓄積（任意） | — | DB成長 | — | — |
| **S6**（gen_chords去就・判断） | DBが厚くなったら gen_chords を**(a)retrieve+ランダム選択へ置換 or (b)多様性fallbackとして残す**。実測で決める | 置換 or 縮退 | — | 維持 | **DBが全部見るなら(S)/(G)分岐は薄まる**（下記） |

**routing-A分岐の行方**：DB＋Claude選択が「特定も汎用も」retrieve で扱えるようになると、**(S)特定 vs (G)汎用の前置き分岐は不要に近づく**（どちらもDB retrieve→ヒットすれば確定realize、外れたら gen_chords or Claude知識へ）。ただし完全には消えない＝**DBに無い旋法/様式/最新曲参照**は依然 Claude知識/web 残余（routing調査の残課題と一致）。→ S6 で「分岐廃止 or 縮退」を判断。

**gen_chords(マルコフ)の去就**：いきなり廃止しない。DBヒットしない「枠だけ汎用（mood=明るい・bars=4等）」の fallback として**当面残す**（実測で score≥0.6 が99.3%＝動く基線）。DBが十分厚くなり retrieve がカバーしたら縮退。**後退ゼロ＝既存テスト全緑を各段階で確認**。

## 3.7 評価軸（"良くなった"を何で測るか・silent改善にしない）

| 軸 | 指標 | 現マルコフのbaseline |
|---|---|---|
| **定番進行の再現** | 「丸の内/カノン/王道で」と頼んで正しい度数列が出る率（名前付き＝100%を維持・タグ検索でも出るか） | gen_chordsは**0%**（非ダイアトニック不可） |
| **当てはまり保持（#86不変）** | retrieve/substitute/continuation 出力を analyze_fit に通した score（メロ併走時） | ルール基線 mean 0.884 / <0.6 が0.7%（既測）を**下回らない** |
| **代替の妥当性** | substitute候補が等価クラスとして正しい率（理論チェック）＋Claude選択が文脈に合うか（少数人手レビュー） | 機能なし |
| **つなぎの妥当性** | continuationの終止タイプが意図（締める/続ける）と一致する率 | 機能なし |
| **多様性 vs 凡庸** | retrieve結果のタグ分布・進行の種類数（マルコフの凡庸化と対比） | マルコフは定番固有形を出せず凡庸 |
| **コスト** | retrieve/substitute は決定的・~ms。Claude選択は1ターン。audio ingestは非同期 | — |
| **人の耳（最終1回）** | 試聴は最終ゲートに圧縮（先行研究R2/R3の方針） | — |

silent改善回避：S2/S3着手前に上記の**定番再現・当てはまり保持**を計測スクリプト化（既存 `scripts/measure_gen.py` を拡張）。各段階で baseline と比較し doc/status に残す。

---

# 4. 批判的レビュー（adversarial・severity付き）

| # | 論点 | severity | 内容・リスク | 緩和 |
|---|---|---|---|---|
| 1 | **タグの主観性** | 高 | "おしゃれ"/"切ない"/"都会的" は人により基準が違う。誰がタグ付けするか（curated=作者主観、Claude=学習バイアス、audio抽出=不可能）で品質が割れる。tag語彙が曖昧だと retrieve が当たらない | tag語彙を**閉じた小集合**に固定・定義文を付ける。curated を一次・Claude写像は正規化のみ。mood→tagの写像を**説明可能**に（なぜそのタグか） |
| 2 | **retrieval品質** | 高 | DBが小さいと「該当進行が無い→凡庸 fallback or 捏造」。タグ一致だけでは粒度不足（同じ"切ない"でも色々）。RAG先行研究も**定量評価が未確立**[arxiv 2311.10384] | DBを**最低20〜40件＋成長経路（ingest）**。retrieve は「ヒット/ニアミス/ミス」を返し、ミス時は gen_chords or Claude知識へ明示 fallback（捏造させない） |
| 3 | **Claude選択の一貫性** | 高 | 同じ入力で違う進行を選ぶ・好みがブレる・候補を無視して勝手に書く恐れ。#86で避けたかった「Claudeが理論を外す」が記号レベルで再来しうる | **候補リストの中からのみ選ばせる**（自由生成させない・MCPツールで合法手だけ提示）。選択も `analyze_progression` を通す。決定性が要る所はルールが既定値を持つ |
| 4 | **audio分析の精度コスト** | 高 | SOTA ~84%・maj/min中心で7th/借用/転回は崩れる[arxiv 2502.11840]。誤ったコードをDBに入れると**汚染源**。madmom等は重い依存・環境破綻リスク（#86でMagenta系の教訓） | audio源は**低confidence・隔離venv・人/Claude確認必須**。完全採譜を目標にしない（特徴量/おおまかで可）。MIDI源を第一級に |
| 5 | **等価クラスの文脈無視** | 中 | substitute表は「合法手」だが前後文脈・声部進行で不適なものを出す。ポップス対象なので voice-leading は対象外だが、それでも「直前と同じになる」等の事故 | 候補に文脈フィルタ（直前コードと重複排除等）＋Claude選択＋analyze で足切り |
| 6 | **C基準保存と転調の整合** | 中 | 進行は C基準（#14）だが modulate/転調のピボットは**実キー**で考える必要。C基準のまま転調を表現するとズレる | modulate は「frame.key 付替＋ピボット」を**配置/realize段で**解決（#14のヒント保存原則を崩さない設計に） |
| 7 | **gen_chords 廃止の判断基準** | 中 | 「DBが十分厚い」を何で判断するか曖昧。早すぎる廃止は汎用枠生成の後退 | S7評価軸（定番再現・カバー率）で**数値的に**判断。当面残す |
| 8 | **TS移管の二重実装リスク** | 中 | theory（QUALITY_INTERVALS等）を TS と Python 両方に持つと乖離する | 度数表/品質表を**単一の真実**に（生成データJSONを共有 or 片方を導出）。判定はPython据置で重複を最小化 |
| 9 | **「名前付き」と「タグ」の二重管理** | 低 | find_progression（名前）と tag検索が別レーンで、同じ進行に名前とタグの両方が要る | 名前はtagの特殊ケース（exact match）として一本化も可。当面は両レーン併存で可 |
| 10 | **旋法/様式の残余** | 低 | ドリアン/リディアン等はポップス対象外と整理したが、ユーザーが要求しうる。DBにも入りにくい | 対象外と明記（将来軸）。来たら Claude知識 fallback（routing-A 既存） |

---

# 5. 推奨サマリ（箇条書き）

- **DB＋ルール＋Claude選択でポップスのコード進行は作れる**。実在システム（Hooktheory=統計DB / ChordChord=ルール+ランダム / Captain Chords=プリセット+スケール拘束 / Band-in-a-Box=スタイルDB / RAG×LLM学術）が全てこの型で、ML生成は本流でない＝**妥当・裏取り済**。
- **#86 を「Claudeは度数（記号）を選ぶ／実音はルールが作る」へ明文改訂**。「音符（pitch/voicing/当てはまり）に触らない」は維持。判定（analyze_fit）が提案の前提も維持。
- **データモデル**：#98 を「度数列＋タグ（mood/genre/function_profile/cadence/section_role/source/provenance/confidence）」へ拡張。function_profile と cadence は度数から導出可＝保存は任意。
- **操作3つ**：retrieve（名前一致＋タグ検索、mood→tagは**まずClaude NL→tags**）/ substitute（等価クラス表＝決定的合法手列挙→Claude選択）/ continuation（**終止検出**＋末尾整形＋ピボット→Claude選択）。追加で reharmonize/modulate/analyze/simplify/extend/ingest。
- **music21 は撤廃可能**。detect_key（自前KS ~40行）/ analyze_progression（コード既知＝度数表引き ~80行）に置換し pyproject から削除。**コード既知ゆえ和声推定の最難関を踏まない**。
- **リファレンス分析の本丸は源で分岐**：**MIDI＝表引きで分析ライブラリ不要**（第一級にせよ）／**audio＝madmom等が要るが精度~84%止まり**＝低confidence・隔離・確認必須。music21 は audio をしないので**どの用途でも必然性なし**（ユーザー認識は正しい）。
- **置き場＝ハイブリッド**：DB＋retrieve/substitute/continuation/realize は**TS core 移管**（表引き中心・#20整合・MCP公開）。analyze_fit/detect_key/analyze_progression は**Python据置**（自前化のみ）。audio分析は**Python新設**。「表引きに成り下がる」部分だけ TS にし、Python は判定資産と信号処理に限定。
- **移行はS1〜S6**（DB拡張→retrieve→substitute/continuation→自前analyze→ingest→gen_chords去就）。**gen_chords(マルコフ)は当面 fallback で残す**・後退ゼロ・各段で既存テスト緑。

---

# 6. ユーザーが次に決めるべき論点

1. **#86 改訂を正式採用するか**（「Claudeが度数=記号を選ぶ」を design に下ろすか）。下ろすなら design-acceptor 案件。
2. **tag語彙の確定**（mood を何語に固定するか・誰がタグ付けするか＝curated主観 vs Claude写像）。retrieve品質の生命線（批判#1/#2）。
3. **mood→tag写像の方式**：Claude(NL→tags) で始めるか、cm-search 埋め込みに乗せるか。
4. **置き場**：DB＋操作を TS core へ移管するか（推奨）、Python worker に留めるか。二重実装（theory表）をどう単一化するか（批判#8）。
5. **gen_chords(マルコフ) の最終去就**：DBが厚くなったら廃止か fallback 維持か（評価軸で判断する基準を先に決める）。
6. **audio ingest をやるか**：madmom等の重い依存・隔離コストを払って audio参考曲をDB化するか、当面 **MIDI源のみ**に絞るか（精度コスト＝批判#4）。
7. **DBの初期規模と出所**：curated 何件・どの定番まで・provenance/著作権の扱い（実在曲の進行を保存することの整理）。

---

## 参考URL（一次資料・引用）

理論primer:
- Rohrmeier, Towards a generative syntax of tonal harmony (2011) — https://www.tandfonline.com/doi/abs/10.1080/17459737.2011.573676 ／ https://tu-dresden.de/.../gsm-rohrmeier-2011.pdf ／ A generative grammar approach to diatonic harmonic structure (SMC07) http://smc.afim-asso.org/smc07/SMC07%20Proceedings/SMC07%20Paper%2015.pdf ／ Jazz harmony grammar (DCML) https://www.epfl.ch/labs/dcml/a-grammar-theory-of-jazz-harmony/
- 終止 — https://muted.io/cadence/ ／ https://en.wikipedia.org/wiki/Cadence ／ https://www.musicnotes.com/blog/cadences-in-music-theory-the-4-types-explained/
- 代替/置換 — Tritone substitution https://en.wikipedia.org/wiki/Tritone_substitution ／ https://hubguitar.com/music-theory/tritone-substitute-dominant-chords ／ Modal interchange/secondary dom https://hub.yamaha.com/guitars/g-how-to/a-guitaristss-guide-to-chord-substitutions-part-2-beyond-diatonic/ ／ https://en.audiofanzine.com/music-theory/editorial/articles/tritone-substitution-and-secondary-dominants.html
- J-POP定番 — 王道進行 Wikipedia https://ja.wikipedia.org/wiki/%E7%8E%8B%E9%81%93%E9%80%B2%E8%A1%8C ／ JBG音楽院 https://jbg-ongakuin.com/staff-blog/20250808/ ／ UtaTen 4536 https://utaten.com/live/royal-road-progression/ ・ 6451 https://utaten.com/live/komuro-progress/

手法サーベイ・実在システム:
- Hooktheory — https://www.hooktheory.com/blog/music-theory-analysis-1300-songs-for-songwriting-part2/ ／ API https://www.hooktheory.com/api/trends/docs ／ Popular progressions https://www.hooktheory.com/theorytab/popular-chord-progressions ／ DB Sankey分析 https://github.com/DataStrategist/Musical-chord-progressions
- ChordChord https://chordchord.com/ ／ Musicca chord player https://www.musicca.com/chord-player ／ AutoChords https://autochords.com/
- Captain Chords (Mixed In Key) https://mixedinkey.com/captain-plugins/captain-chords/ ／ Band-in-a-Box https://en.wikipedia.org/wiki/Band-in-a-Box ・ https://grokipedia.com/page/Band-in-a-Box ／ Scaler 2 review https://www.andrulian.com/review-of-scaler-2-chord-detection-and-creative-chord-progression-creator-utility-vst-au-aax-by-pluginboutique/
- RAG×LLM 記号音楽 — Jonason et al. https://arxiv.org/html/2311.10384v2

music21撤廃・分析:
- Krumhansl調推定 実装解説 http://rnhart.net/articles/key-finding/ ／ 調検出精度 https://mtosmt.org/issues/mto.18.24.2/mto.18.24.2.white.html
- audio chord recognition SOTA — ChordFormer https://arxiv.org/html/2502.11840 ／ pseudo-label/KD https://arxiv.org/html/2602.19778v2 ／ madmom https://madmom.readthedocs.io/en/v0.16/modules/features/chords.html ・ https://github.com/CPJKU/madmom ／ Deep Chroma https://fdlm.github.io/post/deepchroma/
- MIREX Audio Chord Estimation 2024 https://music-ir.org/mirex/wiki/2024:Audio_Chord_Estimation
