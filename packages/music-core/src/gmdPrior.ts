import type { GmdPrior } from "./bodyFill";

// GMD テクスチャ prior（order-0 統計のみ）＝phrase_maker `data/quarantine/GMD/texture_prior_rock.json`
// からの転記。**実ドラマーの集計値だけ**を持ち込む：打圧カーブ・密度カーブ・フラム率・足ゴーストの率。
// **bigram も n-gram もリテラルな打点列も持たない**＝「他者コーパスは統計のみ」の内側（コンセプト既定線）。
//
// 出所と義務（CC BY 4.0）：
//   データセット : Groove MIDI Dataset (groove-v1.0.0-midionly)
//   作成者       : Google Magenta / Google LLC
//   入手元       : https://magenta.tensorflow.org/datasets/groove
//   ライセンス   : CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
//   改変         : **あり**。MIDI 本体は同梱しない。rock・4/4・beat の 120 ファイルから
//                  order-0 の集計統計（8ビンの打圧/密度カーブ・率）だけを算出したもの。
// CC BY 4.0 は商用利用も改変も許すが**表示は必須**＝`GMD_ATTRIBUTION` を製品のクレジットに出すこと。
// コピーレフトではないので、otomemo 側のコードのライセンスには影響しない。

/** 抽出の来歴（統計の素性を自己記述＝後から検算できるように）。 */
export const GMD_PRIOR_META = {
  style: "rock",
  order: "0 (aggregate curves + rates only; NO bigram / NO n-gram)",
  n_files: 120,
  increment: "first (texture only: density/vel curves + ghost feet + flam)",
  fingerprint: "b5517d719fa763a9c0bfd948ed824007",
  source: "data/quarantine/GMD/groove (isolated quarantine)",
  outliers_excluded: {"min_fills_per_drummer": 20, "n_notes": [4, 64], "span_qb": [0.5, 12.0]},
} as const;

/** ドラマー別の order-0 テクスチャ表。d1 はフラムが多く、d7 は少ない（人が違う）。 */
export const GMD_PRIORS: Record<string, GmdPrior> = {
  drummer1: {
    vel_curve: [90.1, 64.2, 81.2, 87.2, 93.3, 97.7, 100.3, 118.1],
    density_curve: [0.166, 0.1252, 0.1265, 0.1238, 0.1054, 0.0962, 0.1199, 0.137],
    flam_rate: 0.1664,
    ghost_kick_per_qb: 0.45,
    ghost_kick_vel: 49.5,
    pedal_hh_per_qb: 0.4803,
    pedal_hh_vel: 55.2,
    // 抽出元: n_fills=53 / n_hits=759
  },
  drummer7: {
    vel_curve: [79.8, 83.7, 86.7, 89.4, 94.0, 94.3, 101.5, 95.9],
    density_curve: [0.1405, 0.1065, 0.1171, 0.1246, 0.1231, 0.1178, 0.1156, 0.1548],
    flam_rate: 0.0941,
    ghost_kick_per_qb: 0.5228,
    ghost_kick_vel: 51.2,
    pedal_hh_per_qb: 0.2127,
    pedal_hh_vel: 65.1,
    // 抽出元: n_fills=67 / n_hits=1324
  },
};

/** 既定のドラマー（利用の中で選び直せるように・硬化させない）。 */
export const GMD_PRIOR_DEFAULT = "drummer1";
