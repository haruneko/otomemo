# コーパスDB ごみ化根治＝再構築の検証記録（2026-07-14）

**位置づけ**：`2026-07-14-corpus-db-diagnosis.md`（R0診断＝正準）で確定した「解析済コーパスのごみ化」を実際に**修正・再構築し、before/after を数値検証**した記録。R0 が「何が壊れているか」、本doc が「直した結果」。

## 真相確認（着手第一手）＝scenario (b)

R0 は「downbeatアンカー修正を入れた後も pop 位相が直っていない」と観測。可能性 (a)修正が失われた／(b)修正は残るが別バグ／(c)コードは正しくDBだけ古い、を **git log＋現行コード＋実データ**で切り分けた。

- **アンカー修正はコミット済**（`f839ce3` に `firstDownbeatFromBeats`/`segmentByBars(anchorBeat)` が現存）＝ (a)ではない。
- **現行コードで実データを再抽出したら 54.0%**（DB実測 52.8% と一致）＝ (c)でもない。**現行コードが今も壊れている**。
- **∴ scenario (b) 確定**：アンカー機構は在るが、**別バグ**が残存していた。

### 本当の根因（R0 の指摘を実データで精密化）
R0 は「beat_midi.txt の秒(1列目)と行index=拍の取り違え」「第3列=downbeatフラグが無い」と記した。**実ファイルを検証すると精密化が要る**：
- POP909 `beat_midi.txt` は**実際は3列**（`0.0553 1.0 1.0` …）＝**1列目=秒・2列目=拍強勢(1/0)・3列目=downbeat(1/0)**。**READMEの「2列(時刻,beat order)」記述は古い**（実ファイルと不一致）。コードの「3列目=downbeat」「1行=1拍」の読みは**実は正しい**。
- 真のバグは**位相**：`firstDownbeatFromBeats` が返す**行index を「MIDI拍」と同一視**（`anchor=行index`）。だが MIDIノートの拍位置は `tick/division`＝**MIDIの内部拍**で、**表情テンポ＋曲頭オフセット**により**注釈拍（行index）に整数対応しない**。
  - 例（曲020）：注釈の最初のdownbeat（行1・時刻1.059s）は、テンポマップ換算で **MIDI拍1.835** に相当。コードは `anchor=1`（整数）を使うので**0.835拍ぶん位相がズレ**、句のオンセットが 0.25/0.75 に張り付く。曲001（テンポ一定・オフセット~0）はたまたま整合＝**曲による当たり外れ**で全体 54%。

## 修正（R0 §5 の「テンポマップ経由で拍化」を実装）
1. **tick→秒**：MIDIの set-tempo(0x51) 列を抽出し区分線形積分（`midi.ts makeTickToSeconds`）。
2. **秒→注釈拍**：beat秒列（1列目）へ線形内挿（`phrase.ts makeSecondsToBeat`/`remapToBeatGrid`）。**この座標では downbeat が整数拍＝行index に乗る**。
3. **4小節分割**：`anchor=firstDownbeat行index`（整数）で `segmentByBars`。
4. **phase_ok ゲート**：句内に拍0近傍オンセットが無ければ辞書に入れない（`phraseHasDownbeatOnset`）。
5. **メタ明示**：`key=0`（C正規化済の明示）・`bars=4`・`content.phase_ok`・`content.pickup`。

## before / after（実測）

### メロ句（pop・拍0オンセット被覆＝R0 の測定法を再現）
| style | before | after | 備考 |
|---|---|---|---|
| **pop** | **52.8%**（DB）／54.0%（現行コード再抽出） | **100.0%**（抽出時93.3%→phase_okゲートで100%） | 目標≥90% 達成 |
| irish | 99.4% | 99.4%（経路不変・実測同値） | 注釈拍で既に健全 |
| game | 97.0% | 97.0%（経路不変・実測同値） | MIDIが小節整合 |

- 位相ヒスト（pop）：before ピーク `0.25:9% 2.25:8% 1.75:8%`（拍頭に無い）→ after `0:16% 2:12% 1.5:11% 1:11%`（**整数拍がピーク**＝irish/game と同形）。
- 再構築件数：pop パターン **1139 → 1087**（13461フレーズ→count≥3クラスタ・クラスタリング884.5s）。firstNote@0 は 47→168。
- key/bars：旧 100% NULL → **key=0・bars=4 を 1087/1087 明示保存**。phase_ok=true 1087/1087・pickup フィールド 1087/1087。
- 不可侵確認：project melody 39・project chord_progression 46＝**無変更**（両スクリプトとも scope=library のみ操作）。library 総パターン 1344（pop1087+irish157+game100）。

### 進行コーパス（scope=library・在DB正規化＝U-FRET生データ消失で再ingest不能）
| 指標 | before | after |
|---|---|---|
| 件数 | 356 | **210** |
| 断片（<3和音） | 91（25.6%） | **0** |
| 完全重複行 | R0=46.5%相当 | **0**（署名dedup） |
| count 明示 | 無 | **210件全部** |
| project自作（不可侵） | 46 | **46（無変更）** |

- ドロップ内訳：断片91 ＋ 重複/長短分裂の相方55 = 146。
- 長短分裂：six-based署名（短調tonic→相対長調vi=+9）でループ毎独立キー判定の割れを畳んだ。

## 手順（再現用）
1. DBバックアップ：`data/backups/cm.sqlite.before-r0-fix.20260714-100621`
2. 進行：`CM_DB=... npx tsx scripts/normalize-progressions.ts --apply`
3. pop メロ：`CM_DB=... CM_DICT_STYLES=pop npx tsx scripts/build-phrase-dict.ts <dummy> <POP909> <dummy>`（popのみ再構築＝irish/game/projectは不変）
4. POP909 取得：`curl -sL https://codeload.github.com/music-x-lab/POP909-Dataset/tar.gz/refs/heads/master | tar xz`

## 残タスク
- **実機反映には api 再起動が必要**（systemd 常駐）。本セッションでは再起動していない＝DBは更新済だが稼働apiは旧メモリの可能性。
- **R0 §6 の新テーブル化**（`phrase_pattern`/`chord_progression_pattern`）と**遷移統計（note_transition/chord_transition・B/D）は残タスク**＝今回は既存 `neta`(key/bars/content) で契約充足に留めた。遷移統計は将来の個人コーパスと合流（backlog）。
- game のキー推定漏れ（数%）＝信頼度フラグは未対応（R0§7）。
