# 曲内ループ・レンズの再現テスト＝林原めぐみ5曲＝「手癖の単位は作曲者」（2026-07-06）

## 目的
[2026-07-06-within-song-loop-lens](2026-07-06-within-song-loop-lens.md)（SURFACEで確立した曲内反復ループ・レンズ）が**別アーティストでも再現するか**。再現したらフレーム実装に進む、という判断ゲート。

## 対象・手法
- 林原めぐみ5曲＝**Northern lights／Successful Mission／~infinity~∞／feel well／KOIBUMI**。全て YouTube「**Megumi Hayashibara - Topic**」チャンネル（レーベル配信の公式スタジオ音源・フル尺）で `yt-dlp --simulate` 照合済。※King Records は公式フルが少なくカバー/TVサイズ/カラオケが多い→ Topic チャンネルが唯一の安全な公式ソース。Give a reason は Topic版が無く不採用。
- 手法は SURFACE と同一（yt-dlp→analyze.py→`chordSequenceFromTimeline`→曲内 L∈{4,8} 最頻n-gram→dur重み `resolveTonic` で度数化）。**今回は per-song `chords`（dur込）を JSON 保存＝再解析コストを二度払わない**（前回の反省）。データ＝`scratchpad/hayashibara-loops.json`。

## 結果：各曲のコア・ループ
| 曲 | 調(dur重み) | コア・ループ(4連・実音) | 度数 | 反復 | 性格 |
|---|---|---|---|---|---|
| Northern lights | Am | Am→F→G→Am | i–♭VI–♭VII–i | ×18 | 純Aeolian（SURFACEと同核） |
| ~infinity~∞ | C#m | G#→Fm→A#m→F# | V–iii–vi–iv 系 | ×17 | **本物のV（機能和声）** |
| KOIBUMI | Gm | Cm→D→Gm→F | iv–**V**–i–♭VII | ×7 | 機能的マイナー（V使用） |
| feel well | E♭ | E♭→A♭→E♭→A♭ | I–IV–I–IV | ×12 | 単純メジャー |
| Successful Mission | C#m? | C→Fm→C#→D# | 半音的・調あいまい | ×5 | クロマチック/転調系（調検出も不確実） |

## 結論：メソッドは再現した。「手癖」は出なかった。そしてそれが正解
1. **レンズは再現OK**：別アーティストでも各曲に明確な固有ループ（反復×5〜18）を検出できた。曲内反復レンズは頑健。
2. **共有核は薄い**：Northern lights のみ純 Aeolian。infinity/KOIBUMI は**本物のV（導音あり＝機能和声）**、feel well は単純メジャー I–IV、Successful Mission はクロマチック。5曲はハーモニー的に**バラバラ**。SURFACE（4曲が♭VI–♭VII–i系で強く一致）と対照的。
3. **理由＝正しい挙動**：林原めぐみは**歌手であって作曲者ではない**。曲は たかはしごう・佐藤英敏 ら複数作曲者。SURFACE が一致したのは実質1作曲者（永谷喬夫）だから。⇒ **手癖の単位は「歌手/アーティスト」でなく「作曲者」**。メソッドは「まとまっていない対象に偽の共通を出さない」＝正しく判別した。

## 方法論の到達点（n=2 で妥当）
- 片方（SURFACE＝単一作曲者）で核が立ち、片方（林原＝複数作曲者）で正しく"立たない"＝**曲内ループ・レンズは判別力を持つ**（generic n-gram 頻度は両方で♭VI–♭VII–i を出して区別できなかったはず）。
- 実装 GO の根拠が固まった。**設計上の含意＝study は「作曲者」で括るのを基本にする**（アーティスト＝歌手だと複数作曲者が混ざり核がぼける）。UI/入力で「作曲者」を意識させるか、少なくとも所見で「この対象は単一作曲者か」を明示する。

## 実装タスク（design.md #S11 に先に反映してからコード＝SDD）
1. `songCoreLoops(chords)` 純関数＝曲内 L∈{4,8} 最頻ループ（回数付き・被覆指標は使わない）。dur重み `resolveTonic` で度数化。TDD 先行。
2. study の主レンズを per-song core loop へ：保存＝各曲の core loop（＋生 `chords` を dur込で保持し再解析回避）。
3. cross-song は「core loop 度数shape の一致」で見る（generic n-gram 出現でなく反復ループ同士）。
4. 所見プロンプトに「対象が単一作曲者か・核が立つか立たないか」を判断させる。
5. StudyView：曲ごとの core loop（実音・試聴可）を主役に。
