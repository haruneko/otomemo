# ピアノ伴奏の左手が右手と同じ高さに出ている件＝どの段で壊れたかの実測（2026-09-18）

きっかけ＝画面の見本（生成した伴奏の最初の8小節のピアノロール）を見たオーナーの指摘「左手が右手と同じ位置にある」。

## 結論
**Otomemo は壊れていない。** 移植した4つの段のどこでも音は変わっていない。左手の殻が右手の塊より上に出るのは
**移植元（phrase_maker 試作 #1）がそう作っているから**で、耳で合格した音そのものである。
「手」は**役割の名前**（右手＝リズムの波／左手＝伸ばす殻）であって、**高さの上下の名前ではない**。

## 各段の実測（進行 Fmaj7｜G｜Em7｜Am7→G ×4・キーC・96bpm・種1234・揺れなし）

| 段 | 左手 | 右手 |
|---|---|---|
| 試作 #1 の MIDI（`listen7/work/h1_half_mid.mid`）| （手の情報なし）全243音 50..72・中央62・60未満93音 | 同左 |
| 基準音 `reference_half_mid.json`（Python 出力の写し）| 64音 **60..71**・中央65.5 | 179音 **50..72**・中央59 |
| ① `generateHandFrameBand`（`packages/music-core/src/handFrameBand.ts`）| 64音 60..71 | 179音 50..72 |
| ③ 和音パターンへの写し→実音化（`explicitNotes.ts` → `apps/web/src/music.ts` `resolveLh`）| 64音 60..71 | 179音 50..72 |
| ④ 見本づくり（`listen14/gen.ts`・`mkmid.py`）| 64音 60..71 | 179音 50..72 |

全段で**同じ**＝壊れた段は無い。基準音との bit 一致テスト（`handframe-band.test.ts`「Python と bit 一致」）も緑。
`listen14/gen.ts` の `r.notes[i]![4]` は `content.notes[i]` と同じ並び（`handFrameBand.ts:421` の `[...rh, ...lhNotes]`）なので、
手の入れ替わりも無い。

## なぜ左手が上に出るのか（移植元の作り）
- 左手＝`shellLift`（`handFrameBand.ts:226` / 源流 `handframe_band.py:127 _shell_lift`）＝3度と7度だけの殻を
  `placeMid(center=60, lo=52, hi=72)`（`handFrameBand.ts:219` / 源流 `:102 _place_mid`）で**中音域（C4 あたり）**に置く。
  ジャズの「根音を弾かない左手ボイシング」の置き方で、ベースが根音を持つ前提。
- 右手＝`bandRhVoicing`（`handFrameBand.ts:229` / 源流 `:424 band_rh_voicing`）＝根音+3度+5度+8va を
  `liftAbove(…, bassMax=48)`（`handFrame.ts:591`）で**ベースの壁のすぐ上**へ持ち上げるだけ＝50 から始まる。
- 結果、右手の塊（50..62 あたり）が左手の殻（60..71）より**下**に来る区間が常時ある。両手とも 50..72 の
  1オクターブ半に収まる＝ピアノロールでは1つの塊に見える。

## 固定したこと
`packages/music-core/test/handframe-band.test.ts`「左手の殻と右手の音域（実測の固定・2026-09-18）」で
上表の音域を数値で固定した。音域を動かす変更は必ずここが落ちる。

## 残る論点（耳の裁定）
音域の設計を変えるかは耳の判定。材料＝`listen16`（試作 #1／今の Otomemo／左手の殻を1オクターブ下げた版）。
下げた版は左手 48..59・右手 50..72＝左手が下に入るが、いちばん低い 48 はベースの壁と同じ高さに触れる。
採るなら設計（`docs/drafts/2026-09-16-handframe-evolution-design.md` §4.2）を先に直してからコードを変える。
