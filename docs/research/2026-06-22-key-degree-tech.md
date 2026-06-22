# コード進行 → 調 → 度数 変換の要素技術調査

調査日: 2026-06-22 / 対象: creative_manager / 入力前提: **コード記号の列**（音声でもノート列でもない。例: `["FM7","E7","Am7","Gm7","C7"]`, `["C","G","Am","F"]`）

関連doc: `docs/research/2026-06-22-chord-progression-engine.md`（music21撤廃・TS core移管方針）, `docs/research/2026-06-22-jp-chord-sources.md`（源データ）

---

## 0. 結論サマリ（先に）

- **「調→度数」変換はTS/Pythonとも実用ライブラリあり・ほぼ自明**。難所ではない。
  - TS: **Tonal.js `Progression.toRomanNumerals(tonic, chords)`** が `["CMaj7","Dm7","G7"]→["IMaj7","IIm7","V7"]`。**非ダイアトニック根もOK**（`Bb` in C → `bVII`、quality 接尾辞も保持＝`Bb7→bVII7`）。
  - Python: 既存 `theory.py`（mod-12算術＋quality写像）で十分。music21 `romanNumeralFromChord` も可だが撤廃対象。
- **「コード列→調（複数候補ランキング）」を直接やれる既製ライブラリは事実上無い**。
  - **Tonal.js には key detection が無い**（`Key.majorKey/minorKey` は鍵データ"生成"のみ。`Scale.detect`/`Chord.detect` は**ノート集合**入力で、コード列→調ではない。ランキングでもない）。
  - **music21 `key.analyze` は唯一「複数候補＋相関スコア」を返せる**（`alternateInterpretations`）。ただし入力は**ノート列**（ChordSymbolは無視される）＝コード構成音へ展開して食わせる必要。かつ重い・撤廃対象。
- **したがって核心（コード列→調・上位2候補）は自作が現実的**。Krumhansl-Schmuckler を**コード構成音から作ったpcプロファイル**に適用し、24調と相関→**上位2**を返す薄い純TS/純Python関数。既存 `theory.py`（`QUALITY_INTERVALS`, `scale_pcs`, `chord_pcs`）がそのまま土台になる。工数小（半日〜1日）。
- **推奨**: **(c)自作の調推定 + (a)度数変換はTonal.js（TS移管後）/ 当面はtheory.py**。music21 の `detect_key`/`analyze_progression` は両方とも純コードで置換可能。

---

## 1. 候補別カード

判定凡例: ◎採用可 / ○部分採用 / △補助 / ✕不可

### Tonal.js (@tonaljs) — TypeScript
| 項目 | 評価 |
|---|---|
| 言語 | TS（型付き・純関数・ESM）。npm `tonal` メタパッケージ or 個別 `@tonaljs/*` |
| コード列→調(複数候補) | **✕ 機能なし**。`@tonaljs/key` は `majorKey/minorKey/majorTonicFromKeySignature` のみ＝鍵の**データ生成**。`Scale.detect(notes)`/`Chord.detect(notes)` は存在するが**ノート集合**入力で、調推定でもランキングでもない |
| 調→度数 | **◎** `Progression.toRomanNumerals(tonic, chords)` / `fromRomanNumerals`。内部は `distance(tonic, root)→interval→romanNumeral` ＝**任意の根で動く**。`Bb` in C → `bVII`、quality接尾辞保持（`Bb7→bVII7`, `Dm7→IIm7`） |
| ランキング返却 | ✕（調推定自体が無い） |
| コード記号パース | `Chord.get("FM7")` 等で root/quality 分解。maj7/m7/7/分数(`D7/F#`)は扱える。表記ゆれ（`△`,`-`等）や複雑テンションは要確認 |
| 依存・ライセンス | **MIT**、ほぼゼロ依存・小バンドル。v6系で活発メンテ（最終publish数ヶ月内） |
| 判定 | 度数変換=**◎** / 調推定=**✕（自作で補う）** |

→ **TS移管の度数変換層として最適**。ただし**調を別途決めて渡す**必要がある（tonic必須）。

### music21 — Python（現状ベースライン・撤廃検討対象）
| 項目 | 評価 |
|---|---|
| コード列→調(複数候補) | **○（唯一の複数候補対応）**。`stream.analyze('key')`＝Krumhansl-Schmuckler。`KrumhanslSchmuckler().getSolution(stream)` の結果に `key.alternateInterpretations`（全24調を相関順）＋ `correlationCoefficient`。Bellman-Budge / Temperley(Kostka-Payne) / Aarden-Essen の重みも選べる |
| 入力の注意 | **ノート列前提。ChordSymbolは解析で無視**＝コード構成音pcへ自前展開してStreamに積む必要。現状 `detect_key` もノート列入力 |
| 調→度数 | **○** `roman.romanNumeralFromChord(chord, key)`＝現状 `analyze_progression`。`.functionalityScore`(0-100) あり。Chord 構成音から判定 |
| ランキング返却 | **◎**（`alternateInterpretations`） |
| 依存・ライセンス | **BSD-3**。コア純Pythonだが**重い**（パッケージ大、グラフ系で numpy/matplotlib 連れてくる）。起動・import コスト大 |
| 判定 | 機能=○だが**重量級＝撤廃方針**。ランキングのロジックは**自作の参考**にする |

### pychord — Python
| 項目 | 評価 |
|---|---|
| コード列→調 | ✕（鍵推定なし） |
| 調→度数 | △ `Chord.from_note_index("I", "C major")` 等＝**度数→コードの生成**が主。コード→度数の逆解析は弱い |
| パース | コード記号パースは得意（`Chord("Cm7")`→構成音） |
| 依存・ライセンス | MIT・軽量 |
| 判定 | **△**（コード記号パーサとしては可。調推定・逆度数解析は不可） |

### mingus — Python
| 項目 | 評価 |
|---|---|
| コード列→調 | ✕（鍵推定なし） |
| 調→度数 | ○ `progressions.determine(chords, key, shorthand=True)`＝コード列を**与えたkey基準**でローマ数字化。`chords.I("C")` 等で逆生成も。**ただしkeyは自前指定が必要**＝調推定はしない |
| 依存・ライセンス | LGPL、軽量だがメンテ低調（0.5系で停滞気味） |
| 判定 | **△**（key既知なら度数化可。Tonalで足りるので採用優先度低） |

### まとめ表
| ライブラリ | 言語 | コード列→調(複数) | 調→度数 | ランキング | 重さ | License | 判定 |
|---|---|---|---|---|---|---|---|
| Tonal.js | TS | ✕ | ◎ | ✕ | 軽 | MIT | 度数◎/調✕ |
| music21 | Py | ○(要展開) | ○ | ◎ | **重** | BSD | 撤廃方針 |
| pychord | Py | ✕ | △(生成寄り) | ✕ | 軽 | MIT | △ |
| mingus | Py | ✕ | ○(key必須) | ✕ | 軽 | LGPL | △ |

**重要な事実**: コード列から調を**推定して複数候補で返せる**のは music21 だけ。それ以外は全て「tonicを与える」前提。つまり**調推定だけは誰も肩代わりしてくれない**。

---

## 2. アルゴリズム（自作の土台）

### 2.1 コード列 → 調ランキング（Krumhansl-Schmuckler の応用）
KS は元来「ノートの出現分布（pcヒストグラム）」を24調プロファイルと相関させる。**コード記号入力でも適用可**＝各コードを構成音pcへ展開し、重み付けでヒストグラムを作るだけ。

手順:
1. 各コードを `chord_pcs(root, quality)`（既存）で構成音pc集合へ展開。
2. **重み付きpcプロファイル**(長さ12)を作る。重み案:
   - 各コードの**ルートに加点**（調中心の手がかり）、構成音にも加点、**コードの長さ（拍）で重み**。
   - 任意: 進行末尾（終止感のある最後のコード）にボーナス。
3. 12×2=**24調プロファイル**（Krumhansl の major/minor profile）と**ピアソン相関**。Temperley の Kostka-Payne 重みや Aarden-Essen も差し替え可（ポップス向けは経験的に Temperley 系が無難）。
4. 相関降順に**全24調ランキング → 上位2を返す**（スコア/信頼度つき）。relative major/minor は相関が拮抗しやすく、まさに**2候補で吸収**する設計が要件に合致。

### 2.2 ダイアトニック適合スコア（補助 or 代替）
「どの調が列の全コードを最も diatonic に説明するか」を別軸で評価:
- 各調の `scale_pcs(key,mode)`（既存）に対し、各コードの構成音がどれだけ収まるか＋ルートが diatonic か。
- セカンダリードミナント/借用は減点 or 既知パターン（V7/x, bVII, iv 等）として小減点。
- KS相関と**スコア融合**（重み付き和）すると、ポップス（非ダイアトニック混じり）で安定しやすい。relative の曖昧さは KS が、機能的整合は適合スコアが補完。

### 2.3 調 → 度数変換（自明）
調候補ごとに: `degree = (chord_root - key_root) mod 12` → ローマ数字写像（0=I,2=II,...,10=bVII 等）＋ quality 接尾辞。**mod-12算術＋quality写像で原理自明**。既存 `theory.py` がそのまま使える。TS移管後は Tonal `toRomanNumerals` に委譲してもよい（同じ結果）。

### 2.4 精度の観点（ポップス）
- KS単独はポップスで relative/旋法に弱い（クラシック前提のプロファイル）。**ダイアトニック適合スコアとの融合**で改善。
- セカンダリードミナント・借用・部分転調は単一調では割り切れない＝**2候補返却**が設計上の正解（要件どおり）。
- 終止・反復・最終コードの重み付けが当たり率に効く（経験則）。

---

## 3. 推奨

### 3.1 music21 の置換可否（具体）
- **`detect_key`（ノート列→調1個）** → **自作KS（純Python/純TS）で置換可。かつ上位2候補化で機能向上**。現状はコード既知なので、`detect_key` を**コード列入力版**に拡張するのが本質（メロのノート列版は当てはまり判定 `analyze_fit` 用に残す選択肢あり）。
- **`analyze_progression`（key基準のローマ数字＋T/S/D）** → 度数変換は `theory.py`で自作 or Tonal `toRomanNumerals` で置換可。T/S/D機能は既存 `_function_of` がそのまま使える。**music21不要**。

### 3.2 方針別
- **(a) Tonal.jsで足りるか**: **度数変換は足りる（◎）。調推定は足りない（✕）**。→ Tonalは度数層として採用、調推定は自作を併用。
- **(b) Python据置**: 可能だが、TS core移管方針と逆行。調推定の自作ロジックは**言語非依存**なので、先にPythonで書いて検証→TSへ移植が低リスク。
- **(c) 自作**: **調推定は自作必須**（誰も肩代わりしない）。度数変換は自作 or Tonal。**結論=「調推定は自作、度数はTonal/theory.py」のハイブリッド**。

---

## 4. 自作する場合の設計スケッチ

`theory.py` を土台に、新規 `key_detect.py`（純Python・依存なし）を想定。TS移管時は同ロジックを `core` へ移植。

```python
# theory.py に定数追加（KSプロファイル）
KS_MAJOR = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]  # Krumhansl
KS_MINOR = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]
# ↑ Temperley/Kostka-Payne 版に差し替え可（ポップス向け）

def chord_list_to_profile(chords) -> list[float]:
    """コード列(root,quality,dur?) → 重み付きpcヒストグラム(len12)。
    各コード: 構成音に dur 重み、ルートに加点。既存 chord_pcs を使用。"""

def rank_keys(profile, top=2) -> list[dict]:
    """24調プロファイルとピアソン相関 → [{key,mode,score}] を相関降順 top件。
    relative拮抗を許容（上位2で吸収）。"""

def diatonic_fit(chords, key, mode) -> float:
    """scale_pcs(key,mode) への適合スコア（補助軸・融合用）。既存 scale_pcs を使用。"""

def detect_key_from_chords(chords, top=2) -> list[dict]:
    """本命API: コード列 → 調ランキング上位2（スコアつき）。
    rank_keys と diatonic_fit を融合。"""

def to_degrees(chords, key) -> list[dict]:
    """調基準でローマ数字化。(root-key)%12 → roman写像 + quality接尾辞。
    既存 progressions.py のC基準度数表と整合。"""
```

- **既存資産の流用**: `QUALITY_INTERVALS`/`chord_pcs`（構成音展開）, `scale_pcs`（適合スコア）, `norm_root`（音名→pc）, `KEY_NAMES`。`progressions.py` は既に**C基準度数列**保存なので、`detect_key_from_chords→to_degrees(key=推定調)→C基準正規化` の流れがそのまま噛む。
- **工数感**: KSプロファイル＋相関＋ランキング＝**半日**。ダイアトニック融合・重み調整・テスト（定番進行で当たり率検証）＝**+半日**。計**1日**。TS移植は同ロジックなので**+半日**。
- **TDD**: 定番進行（丸サ=FM7-E7-Am7-Gm7-C7 は C/Am 系、王道4536、カノン=C/G/Am…）を**期待調つきの固定ケース**にして赤→緑。relative拮抗ケースは「上位2にどちらも入る」をアサート。

---

## 5. 次アクション（最初の1手）

**`apps/worker/src/cm_worker/music/` に `key_detect.py` の関数シグネチャ＋失敗テスト（定番進行→期待調・上位2）を先に書く（TDD赤）。** KSプロファイル相関の `detect_key_from_chords` を最小実装して緑にし、music21依存の `detect_key`/`analyze_progression` を段階置換できるか実コードで確認する。度数変換は当面 `theory.py` で自作、TS移管時に Tonal `Progression.toRomanNumerals` へ委譲を検討。

---

## 出典
- Tonal.js: https://github.com/tonaljs/tonal , `@tonaljs/key`: https://github.com/tonaljs/tonal/blob/main/packages/key/README.md , `@tonaljs/progression`: https://github.com/tonaljs/tonal/blob/main/packages/progression/README.md , 実装: https://github.com/tonaljs/tonal/blob/main/packages/progression/index.ts , roman-numeral: https://github.com/tonaljs/tonal/tree/main/packages/roman-numeral , Scale.detect議論: https://github.com/tonaljs/tonal/issues/36
- music21 discrete analysis (KS / alternateInterpretations): https://music21.org/music21docs/moduleReference/moduleAnalysisDiscrete.html , roman: https://music21.org/music21docs/moduleReference/moduleRoman.html , key.py: https://github.com/cuthbertLab/music21/blob/master/music21/key.py , 後Tonal章: https://www.music21.org/music21docs/usersGuide/usersGuide_25_postTonalTools1.html , PyPI(BSD): https://pypi.org/project/music21/
- mingus progressions: https://bspaans.github.io/python-mingus/doc/wiki/refMingusCoreChords.html , http://bspaans.github.io/python-mingus/_modules/mingus/core/progressions.html
- pychord: https://pypi.org/project/pychord/
