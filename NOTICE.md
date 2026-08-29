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
