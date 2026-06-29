# ドラム音の解決＝アドホック点検＋ピッチ異常の診断/修正

最終更新: 2026-06-29

## 問い
ユーザー指摘：「ドラムの音選びが今アドホック＋ヒューリスティックでは？見直すだけで良くなるのでは。あとピッチ解決が変で、異様に高い/低い音が出る」。実SF2（`data/assets/*.sf2`・31MB・GM 13ドラムキット）で点検した。

## 結論（要点）
1. **音名解決は確かにアドホック**：`audio.ts drumNameFor` が**楽器名を正規表現15本でマッチ**＋#55fでキック/スネアを手書き上書き。**だが SF2 の権威ゾーンマップ（bank128/preset0）はほぼ完璧に解決する**（下表）。＝regexを権威マップに置き換えれば見通し激変＋**全13キットに一般化（アコ/エレキ選択がほぼタダ）**。
2. **ピッチ異常は実在＝原因特定＋修正済**：`root = overridingRootKey ?? originalPitch` の `?? originalPitch` が、rootKey無しゾーンで **(GM番号 − originalPitch) ぶん勝手にピッチを飛ばす**。実測で ride2=+8 / Tamb=+12 / pHH=+10.5 等。→ `root = overridingRootKey ?? gmPitch`（叩いた鍵＝自然音高）に修正。最大|eff| 12→ほぼ0。

## ① 権威マップ vs ヒューリスティック（Standardキット・実測）
SF2 の preset zone(keyRange)→instrument→instrument zone(keyRange)→sample を正規に辿った解決：

| GM | 役割 | 権威解決サンプル |
|---|---|---|
| 36 | キック | Standard Kick 3（#55fはKick1を好み手書き上書き＝唯一の主観差） |
| 38/40 | スネア | Standard Snare 1 / 3 |
| 37 | サイドスティック | Jazz Rim Shot |
| 42/44/46 | ハイハット | Closed Hard / Pedal / Open |
| 41-50 | タム | Standard Tom 5..1（per-sample） |
| 49/57/51/53 | シンバル | Crash / Crash / Ride / Ride Bell |
| 54/56 | パーカス | Tambourine / Cowbell |

＝**唯一 regex が必要なのは「キック=Kick3でなくKick1を好む」主観1点**。残り全ノートは権威マップが正しく、regex15本は権威マップの劣化再実装。

## ② ピッチ異常の診断（修正前・実効semitoneズレ eff）
eff＝自然音高からのズレ＝`(gm − op) + detune/100 = (gm − root) + coarse + fine/100`（op はキャンセル）。
- 正常（eff≈0）：kick/snare/hihat/crash/ride 等大半。
- **異常**：`59 Ride2 = +8`（rootKey無し→op=51基準で +8）／`54 Tamb`・`44 pHH`（width誤判定時 +10〜12）／`56 Cowbell = -7`。
- 原因：rootKey が無いゾーンで `root = originalPitch` に落ち、(gm − originalPitch) ぶん飛ぶ。ride2(gm59)を originalPitch51 のライドで鳴らす＝+8。

## ③ 修正（実装済 2026-06-29・`audio.ts drumVoiceFor`）
`root = zoneGen(kz,58/*overridingRootKey*/) ?? gmPitch`：
- **rootKey あり**＝キット作者の音程意図（トム/tune）＝spec準拠で使う。
- **rootKey 無し**＝叩いた鍵を root＝**自然音高（eff=0）**。従来の `?? originalPitch` を断つ。
- 実測：最大|eff| 12 → ほぼ0。残るは `Cowbell -7`（**overridingRootKey=61 をキットが明示**＝spec通り・データエラーでない）＝勝手に上書きせず家で試聴判断。
- **回帰ゼロ**：良ケース（eff=0）は gmPitch==op で値不変。buggyノート（ride2等＝普段使わない高GM番号）のみ修正。

## ④ 残・次（refactor＝権威マップ＋キット選択）
- `buildGmDrumMap(preset)` を preset パラメタ化＋キット別キャッシュ／`drumNameFor` を「権威マップ＋キック主観1行＋薄いフォールバック」に圧縮（regex一掃）。
- リズムに `kit`（GMドラム番号）→再生＆**MIDI ch10 program 書き出し**（ABILITY一致 #47 維持）→**アコ(Standard/Room/Power/Jazz/Brush)/エレキ(Electronic/808-909/Dance)選択**。
- Standard 既定は不変＝回帰ゼロ。新キットの音の良し悪しは**耳判断（出先保留）**。

## 出典
- 自実測：SF2 PHDR/PBAG/IGEN ゾーン解析（`soundfont2` パーサ）。SF2/GM spec：overridingRootKey=gen58・coarseTune=gen51（semitone）・fineTune=gen52（cents）。smplr は region.pitch=originalPitch で鳴らし overridingRootKey を無視→detune で補正（#84）。
