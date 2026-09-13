# NOTICE — 第三者データの出所表記

otomemo は、外部データセットから**統計量のみ**を抽出して同梱している。リテラルな旋律・打点列・
音源そのものは同梱しない（コンセプト既定線＝「他者コーパスは統計のみ」）。
下記は各データセットのライセンスが求める表示義務を果たすためのもの。

---

## Groove MIDI Dataset (GMD)

> **Groove MIDI Dataset by Google Magenta, CC BY 4.0**

- 作成者: Google Magenta / Google LLC
- 入手元: https://magenta.tensorflow.org/datasets/groove
- ライセンス: Creative Commons Attribution 4.0 International (CC BY 4.0)
  https://creativecommons.org/licenses/by/4.0/
- **改変あり**（CC BY 4.0 は改変の明示を求める）。同梱しているのは MIDI 本体ではなく、
  rock / 4/4 / beat の 120 ファイルから算出した **order-0 の集計統計のみ**
  ＝ドラマー2名ぶんの 8 ビンの打圧カーブ・密度カーブと、フラム率・ゴーストキック率・
  ペダルハイハット率（各 7 項目）。**bigram / n-gram / リテラルな打点列は含まない。**
- 実体: `packages/music-core/src/gmdPrior.ts`（`GMD_PRIORS` / `GMD_PRIOR_META`）。
  コード中の定数は `GMD_ATTRIBUTION`（`packages/music-core/src/bodyFill.ts`）。
- 用途: ドラムフィルの身体シミュレータ（`bodyFill.ts`）に与える「実ドラマーの手触り」。
  この prior を外して（`bodyDrummer: "none"`）も生成は成立する＝統計は必須ではなく色付け。

CC BY 4.0 は商用利用と改変を許し、**コピーレフトではない**（otomemo 側のコードのライセンスに
影響しない）。義務は「表示」と「改変の明示」のみで、それを本ファイルとアプリ内クレジットで果たす。

---

## pianoplayer（手の物理モデルの定数）

> **pianoplayer by Marco Musy, MIT License**

- 作成者: Marco Musy
- 入手元: https://github.com/marcomusy/pianoplayer （`hand.py`）
- ライセンス: MIT License（一次資料＝同リポジトリ直下 `LICENSE`「Copyright (c) 2017 Marco Musy」／GitHub API の SPDX 判定 `MIT`。2026-09-13 確認）
- 経路: phrase_maker `experiments/piano/fingersim/handmodel.py:12-19` が pianoplayer `hand.py` の定数を再現し、
  otomemo はそれを TS へ移植した（コードそのものではなく**数値定数**）。該当する定数：
  - `FREST = [-7, -2.8, 0, 2.8, 5.6]`（指 1〜5 の休止位置・3 指＝0）
  - `WEIGHTS = [1.1, 1.0, 1.1, 0.9, 0.8]`
  - `BFACTOR = [0.3, 1.0, 1.1, 0.8, 0.7]`（黒鍵の弾きやすさ）
  - 和音の最大ストレッチ閾値（半音）＝`REACH` の MaxPrac 列：(3,4)5 (4,5)5 (2,3)6 (2,4)7 (3,5)8 (2,5)11 (1,2)12 (1,3)14 (1,4)16
    （(1,5)=17 は phrase_maker が1段外挿した値＝pianoplayer 由来ではない）
- 実体: `packages/music-core/src/handModel.ts`（コード中の定数は `PIANOPLAYER_ATTRIBUTION`）。
- 以下は MIT License の求める著作権表示と許諾表示（原文）：

```
MIT License

Copyright (c) 2017 Marco Musy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

MIT は**コピーレフトではない**（otomemo 側のコードのライセンスに影響しない）。義務は著作権表示と許諾表示の同梱のみで、本ファイルで果たす。

## Parncutt et al. 1997（指の組ごとの到達範囲の表）

- 出典: Parncutt, R., Sloboda, J. A., Clarke, E. F., Raekallio, M., & Desain, P. (1997). An ergonomic model of keyboard fingering
  for melodic fragments. *Music Perception*, 14(4), 341–382.
- `REACH` の MinComf/MaxComf 列と `REACH6` の MinRel/MaxRel/MinPrac 列は、この論文の模型に沿って phrase_maker が置いた値
  （`handmodel.py:156-165` 自身が「補間値・原典 PDF で要照合」と注記）。学術論文の数値表の参照＝出典表記のみ。
