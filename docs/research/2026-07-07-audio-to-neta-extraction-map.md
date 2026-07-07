# 音源 → ネタ化 抽出マップ（現状 × 候補ミドルウェア/AI・出典/ライセンス付き）

**目的**：「音源から“ネタの構成相当”を抜き出す」という到達点に対し、**ネタ種別ごとに** ①今 取ってる/捨ててるか ②精度を上げる/穴を埋める候補ツール（ライセンス・出典）を1枚に整理する。
**方針の芯（前段の議論より）**：聴き取り層（分離/音程/コード/構成境界）は**専門の音モデルが天井**＝賢いLLMでは上がらない、差し替えが効く。**LLM(Fable等)の推論が効くのは「生fact→ネタの木への組み立て/掃除」層だけ**。完璧は不要＝「仕上げは人間」なので“そこそこの下書き”で価値が出る。

## 0. 現状パイプライン（`_audio_poc/analyze.py` 実読・2026-07-07）
- 分離：**htdemucs**（demucs）で4stem（vocals/drums/bass/other）に分けるが、**今はvocalsしか使わず drums/bass/other は捨てている**。
- テンポ/ビート：`librosa.beat.beat_track`（実ビート時刻）。**拍子(meter)は検出せずユーザー指定（既定4/4）**。
- 調：`librosa` chroma 相関（Krumhansl系の自前 estimate_key）。
- メロ：分離ボーカルに `librosa.pyin` → 半音丸め→RLEで音符化（＋f0輪郭は表示用）。**basic-pitch は未使用**（候補どまり）。
- コード：**BTC**（large voca=170和音）で mix 全体のタイムライン。
- 出力＝「解析ネタ1枚（ワークベンチ）」。**曲⊃section⊃各パートの“ネタの木”には組み立てていない**。overlay.sections は空（人間が手で区切る前提）。

→ **到達度＝夢の4〜5割**：上澄み（調/テンポ/コード/歌メロ）は取れる。**構成・多パート化・木への組み立てが丸ごと残っている**。

## 1. ネタ種別 × 取得状況 × 候補ツール

| ネタ種別 | 今 | 穴/課題 | 精度↑・穴埋めの候補（ライセンス） |
|---|---|---|---|
| **調 key** | ✅ librosa chroma相関 | 転調に弱い・単一調前提 | 現状維持で可。強化するなら essentia KeyExtractor（AGPL/商用は要注意）。allin1 は調を出さない |
| **テンポ/ビート** | ✅ librosa beat_track | 揺れ・**ダウンビート弱い** | **allin1**（beat＋downbeat同時, MIT）／madmom（BSD-2, ただし一部機能に特許条項）|
| **拍子 meter** | ❌ ユーザー指定 | 検出なし | allin1 の downbeat から拍子推定の足場が作れる |
| **コード進行 chord_progression** | ✅ **BTC**（170和音, MIT） | mix上での精度天井 | BTC継続で可。新手＝**Chordformer**(2025・大語彙conformer)／“source-separationしてから認識”で精度↑の報告。**⚠ Chordino/NNLS＝GPL（製品に伝染）・autochord＝25和音で後退→避ける** |
| **メロ melody** | 🟡 librosa **pyin**→量子化 | pyinは素朴・音符の切り分けが甘い | 分離ボーカルに **basic-pitch**（Apache-2.0・onset/offset付きでノート化が上手）or **CREPE**（MIT・f0精度が高い）。basic-pitch は内部がCREPE＋onset/offset＝“ノート化まで”やってくれる |
| **ベース bass** | ❌ demucsのbass stem**捨ててる** | 未転写 | **既にあるbass stem**に単音ピッチ（CREPE / basic-pitch / pyin）を当てるだけで出せる（ベースは概ね単音＝容易）|
| **ドラム rhythm** | ❌ demucsのdrums stem**捨ててる** | 未転写 | **ADTOF**（5クラス:kick/snare/hh/tom/cymbal）／ADTLib（3クラス・古い）。2025:「drum stem分離＋ADT＋velocity推定」で現実味↑（arXiv:2509.24853）。**既にdrums stemがある**のが追い風 |
| **コード楽器 chord_pattern（コンピング）** | ❌ | 未 | 直接転写は困難。**コード進行＋other stem から“刻みの型”を当てる**＝推論/ヒューリスティック寄り（perception より interpretation） |
| **構成 section（Aメロ/サビ）** | ❌ **完全に無し** | **最大の穴** | **allin1** 一発で intro/verse/chorus/bridge/outro＋beat＋downbeat（MIT・arXiv:2307.16425）。demucsを内部で使う設計＝素性が合う |
| **組み立て（生fact→ネタの木）** | ❌ 平らな解析ネタ止まり | song⊃section⊃parts に組む・誤り掃除 | **← ここがLLM(Fable)の効く層**：どれがサビ/この4和音がループ/コード直し/パートの役割分担。知識(曲形式・進行の型)で“それっぽく整える” |

## 2. ライセンス地雷メモ（製品前提）
- **避ける**：Chordino / NNLS-chroma＝**GPL-2.0+**（リンクで伝染）。essentia＝**AGPL**（商用は別ライセンス要）。
- **綺麗なstack**：demucs(MIT)＋allin1(MIT)＋basic-pitch(Apache-2.0)＋CREPE(MIT)＋BTC(MIT)＋librosa(ISC)。→ 今のコア（demucs/BTC/librosa）は**商用OKで揃っている**。madmom(BSD-2)は使うなら特許条項の該当機能に注意。

## 3. どこにFableを使う/使わないか（前段の結論の具体化）
- **使わない**（音モデル天井）：分離・ビート/ダウンビート・コード・音程・構成境界。ここは「良い音モデルに差し替える」仕事＝賢いLLMは寄与しない。
- **使う価値がある**（interpretation層）：**生fact→ネタの木への組み立てと掃除**。曲形式・進行の型・楽器の役割といった知識で、粗い抽出結果を“筋の通った構成ネタ”に整える。ただし入力(perception)の質で頭打ち＝過度な期待は禁物。

## 4. 推奨の次の一手（順序）
1. **正解の用意**：数曲、手で「構成/コード/メロ」を採譜し ground truth に（抽出は生成と違い**正解が実在**＝ここは計測が機能する）。
2. **構成を足す**：allin1 導入＝“構成の穴”を一撃で埋める最大ROI。
3. **捨ててるstemを拾う**：bass stem→単音ピッチ、drums stem→ADT。分離済みなので追加コスト小。
4. **メロを basic-pitch/CREPE に差し替え**、pyinと精度比較。
5. **組み立て層をLLMで設計**（Fableの窓はここ）＝facts→song⊃section⊃parts。

## 出典
- All-In-One（構成+beat+downbeat, MIT）: https://github.com/mir-aidj/all-in-one ／ arXiv:2307.16425 https://arxiv.org/abs/2307.16425
- Demucs（分離, MIT・商用OK）: https://github.com/facebookresearch/demucs
- Basic Pitch（音源→MIDI, Apache-2.0・内部CREPE+onset/offset）: https://github.com/spotify/basic-pitch ／ https://engineering.atspotify.com/2022/6/meet-basic-pitch
- CREPE（f0推定, MIT）: 参照 https://www.jordipons.me/estimating-pitch-in-polyphonic-music/
- BTC（コード認識, MIT）: https://github.com/jayg996/BTC-ISMIR19
- Chordino / NNLS-chroma（GPL・回避対象）: https://github.com/c4dm/nnls-chroma
- autochord（25和音・語彙少）: https://github.com/cjbayron/autochord
- ADTLib（ドラム3クラス）: https://github.com/CarlSouthall/ADTLib ／ ADT via drum stem separation(2025) arXiv:2509.24853 https://arxiv.org/abs/2509.24853
- 新コード認識(2025・参考)：Chordformer / BACHI（BACHIは**記号入力**＝音源には直では使えない）
