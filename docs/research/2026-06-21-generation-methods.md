# 研究レポート：Claude非依存の音楽生成・分析・判定・類似度の技術（#86）

調査日: 2026-06-21 / 対象: creative_manager（自己ホスト・余剰PC・Python worker・C調基準/拍ベースJSON・手持ちデータ＝mp3中心＋少数MIDI＋歌詞）

並列サーベイ3本（R1 生成手法 / R2 分析・判定・類似度 / R3 LLMハイブリッド・個人化・自己ホスト）＋まとめ。本文＝成果物。

---

## 0. まとめ（上段：何があればいいか → どう作るか）

### 何が必要だったか（needs）
枠(調/拍子/BPM/小節)の中で、メロ/コード/ベース/ドラムに対し **①生成 ②分析・判定 ③類似度 ④作風反映** を、Claude任せでなく持ちたい。今は①をClaudeにJSONで吐かせるだけで、②③④が空。

### 3本の一致した結論（＝採るべき設計の芯）
> **Claude＝発想・計画・批評（言語/アイデア/指示分解）。決定的な記号エンジン（music21＋機能和声ルール＋可変長マルコフ＋GMテンプレ）＝拘束・保証・補正。深層学習は"自前学習せず推論流用のみ"、しかも隔離。** これが「理論保証ゼロのJSON吐き」の正統な進化。

研究的裏付け：GPT-4級でも**和声理解は欠落**（隣接音ばかり、コード/アルペジオが成立しない／ChatMusician・Sparks of AGI）。だからClaudeに厳密な音高/和声を委ねない。一方、ルール＋制約＋少データ確率モデルはCPU・学習ゼロで動き、本プロジェクトの「データ乏しい・GPU弱い・拍ベースJSON」という制約に最も合う。

### 最重要の一手：**判定（分析）層が要(かなめ)**
**「分析→判定」が無いと"提案"ができない**（今ここが空）。判定があって初めて、Claude出力の検品・補正、既存ネタへの提案、専用生成の良し悪し測定が全部できる。だから最初に作るべきは生成器ではなく**判定器**。

その核は **メロ × コードの「当てはまり」の定量化**：
- **(A) 拍重み付き在和音率**（メロ各音が同時刻コードの構成音か、音価×拍位置で重み付け）＝第一の決定的指標。
- **(B) 非和声音の検出・分類**（経過/刺繍/掛留/逸音… 到来音程・離脱音程・拍位置・音価のルールで）＝「外し音が正当か、宙ぶらりんか」を出す。
- いずれも **music21 + numpy・CPU極小・学習ゼロ**。コード既知（rootは入力で持っている）なので、和声解析の最難関「コード自動推定」を踏まずに済む＝精度問題の大半を回避。

### 統合ロードマップ（段階）
| Phase | 内容 | コスト |
|---|---|---|
| **P1（即・学習ゼロ・全CPU）** | **判定層**＝在和音率＋非和声音分類（メロ×コード）。調検出=Krumhansl(TKP重み)、コード機能化=music21 `romanNumeralFromChord`。これで「Claude生成の検品」と「提案」の土台が入る | music21+numpy のみ |
| **P2（補正）** | Claude案 → 判定層で検査 → スケール外/コード不一致を**最小修正(CSP/スナップ)**。落ちた案は再生成。生成器はまずルール＋マルコフ＋GMテンプレ（コード=機能和声、ベース=コードトーン規則、ドラム=テンプレ+バリエーション） | 学習ゼロ |
| **P3（作風・探索）** | 類似度：重複=Chromaprint、メロ探索=Parsons n-gram→Mongeau-Sankoff、作風=CLAP embedding。作風寄せ=few-shot自作注入→RAG | CPU/埋め込み |
| **P4（任意・隔離DL）** | メロ補完=Anticipatory Music Transformer(small,Apache-2.0)、ドラム人間味=GrooVAE humanize、mp3採譜=Basic Pitch。**別venv/Dockerで隔離**しworker本体を汚さない。作風寄せの最終形=State Tuning（少データでLoRA超え） | 弱GPU可・隔離 |

### 落とし穴（横断）
- **Claudeに和声を任せない**（決定的層で保証）。LLMには ABC記法系が MIDIテキストより合う（worker側でmusic21変換）。
- **DL自前学習は非現実的**（データ不足）→推論流用のみ。**Magentaは環境破綻リスク高**＝隔離必須。**Magenta RealTimeは音声出力で出口違い**＝不採用。
- **マルコフは長期構造を持たない**＝section/frame構造はアプリの枠が外から与える（#85が効く）。
- **客観メトリクスは「破綻の足切り」専用**。良し悪しの最終判断は数値に委ねない。FADは少データで不安定。
- **mp3採譜は不完全前提**＝特徴量レベルで使えば作風データとして十分（完全採譜を目標にしない）。

### #85（枠＋動作＋構造）との接続
- 既存の `gen_*`/`gen_variations` の**後段に判定層を挟む**＝「枠内か・コードに合うか」を検査して reap 前に補正/再生成。frame は「Claudeのプラン」と「エンジンの拘束」の接点。
- condition(fit_to)の「合わせる」も、今のプロンプト依頼から**判定層での検証付き**へ進化できる。
- transform(決定的)は既に正しい思想＝この記号エンジン路線の先取り。

---

以下、各サーベイ本文（成果物）。

---

# R1. 自動生成手法 — メロディ / コード進行 / ベースライン / ドラム

評価軸: 生成できる要素 / 品質 / 少データ適性 / 自己ホスト推論コスト(CPU可否) / ライセンス / MIDI接続性 / 統合コスト / 適合度(◎○△×)。

**最重要の前提**：「学習データが乏しい・CPU/小GPU・拍ベースJSON」という制約は、深層学習の自前学習を実質排除し、**記号的(ルール+確率)手法と"学習済みモデルの推論流用"に絞り込む**。正しい補強は、LLMをアイデア源に残しつつ**記号エンジンで拘束・補正するハイブリッド**。

## 要素別「使える手法」一覧

### メロディ
| 手法 | 種別 | CPU自己ホスト | 少データ | 適合 |
|---|---|---|---|---|
| スケール/コードトーン拘束 + 輪郭ルール | ルール | ◎ | ◎ | ◎ |
| 可変長マルコフ / N-gram | 確率 | ◎ | ○ | ◎ |
| Anticipatory Music Transformer (small 128M) | 深層・学習済 | ○(遅) | ◎(推論のみ) | ○ |
| MusicVAE/MelodyRNN (Magenta) | 深層・学習済 | △(TF1環境難) | ◎ | △ |
| Music/Pop Transformer(REMI) | 深層・学習済 | △(重・ピアノ寄り) | ◎ | △ |
| 制約(CSP/最適化) | 制約 | ◎ | ◎ | ○ |
| LLM(Claude) → 記号補正 | ハイブリッド | ◎ | ◎ | ◎ |

### コード進行
| 手法 | 種別 | CPU | 少データ | 適合 |
|---|---|---|---|---|
| 機能和声ルール(T/S/D・二次ドミナント・五度圏)+music21 | ルール | ◎ | ◎ | ◎ |
| マルコフ/N-gram(コード遷移) | 確率 | ◎ | ○ | ◎ |
| CSP/制約(スケール度・voice leading) | 制約 | ◎ | ◎ | ○ |
| Coconet/DeepBach | 深層 | △ | ◎ | △(クラシック寄り) |
| LLM → ダイアトニック検証 | ハイブリッド | ◎ | ◎ | ◎ |

### ベースライン
| 手法 | 種別 | CPU | 少データ | 適合 |
|---|---|---|---|---|
| コードトーン+ルール(強拍root/5th, walking) | ルール | ◎ | ◎ | ◎ |
| パターンテンプレ(ジャンル別) | ルール | ◎ | ◎ | ◎ |
| マルコフ(輪郭・経過音) | 確率 | ◎ | ○ | ○ |
| MuseGAN bass | 深層 | △ | ×(要学習・大量) | × |

### ドラム
| 手法 | 種別 | CPU | 少データ | 適合 |
|---|---|---|---|---|
| GMパターンテンプレ(steps/lanes/hits)+確率バリエーション | ルール | ◎ | ◎ | ◎ |
| GrooVAE humanize(velocity/timing) | 深層・学習済 | △(Magenta) | ◎ | △→○(humanizeのみ) |
| DrumsRNN | 深層 | △ | ◎ | △ |
| マルコフ(ヒット列) | 確率 | ◎ | ○ | ○ |

## 解説（具体名・根拠）
- **music21**（BSD系）: 機能和声・ローマ数字解析、`voiceLeading`（Verticality, 並行5/8度規則）、`chordify`。コードトーン/スケール度/voice leading拘束に直接。MusicXML/MIDI入出力。CPU即時。
- **可変長/可変オーダーマルコフ**: オーダーで秩序↔ランダムを調整。**少データに最強**（最小「1系列」から）。長期構造は持たない→section/frameはアプリの枠で与える分業。
- **Walking Bass Generator**（MaxHilsdorf等）: 「強拍にroot/5th、間を経過音/contour」のルールはポップのルート弾き/オクターブにも一般化可。
- **GMドラムパターン集**（gvellut/dmp_midi=書籍「200/260 Drum Machine Patterns」MIDI化, 460 free GM等）＋ **scribbletune/pydrums**: steps/lanes/hits に直写像。テンプレ+確率バリエーション+humanizeが最短。
- **Anticipatory Music Transformer**（Stanford CRFM, **Apache-2.0**, small 128M/medium 360M, HF重み）: Controllableなinfilling（一部書いて補完）。**「枠+条件付きで部分生成」というこのPJの思想と一致**。CPU推論は可だが遅い（数十tok/s）→非同期ジョブ向き。
- **GrooVAE**（Magenta, Apache-2.0, Groove MIDI Dataset 13.6h学習）: テンプレドラムに表現的velocity/timingを付与＝humanize後処理に最適。ただしレガシーMagentaはTF1系で環境破綻多発→専用コンテナ+note-seqのみで隔離。
- **Magenta RealTime**: **音声生成（出口違い）**＝MIDI/JSON生成の本件には不採用。名前で混同しない。
- **MuseGAN/DeepBach/Coconet**: 要学習大量データ or 特化（バッハ四声体）＝汎用性/少データで×〜△。
- **制約付き生成(CSP)**（IJCAI 2024等）: スケール内・コードトーン・音域をハード/ソフト制約で。学習不要・「コードに合わせる」条件付き生成に効く。
- **ハイブリッド**: codified-constraintsでLLMを矯正（lyric-to-melodyで記号メトリクス＋人手評価が改善）＝「Claudeのアイデア×ルールの保証」の裏付け。

## R1 推奨スタック
**LLM=発想/方針、記号エンジン=拘束/保証/補正、確率/テンプレ=多様性。** frameとsectionはアプリの枠が固定し、各手法は枠内の音選びだけ担う。
- コード進行＝機能和声ルール+music21+マルコフ補助（LLM案はmusic21で検証）。
- メロディ＝コードトーン/スケール拘束+輪郭ルール+可変長マルコフ（補完がいる時だけAnticipatory small）。
- ベース＝コードトーン+ルール+ジャンル別パターン。
- ドラム＝GMテンプレ+確率バリエーション（人間味だけGrooVAE humanize）。
- 段階: P1ルール/マルコフ/テンプレ+検証 → P2 LLM案のCSP補正 → P3 隔離DL推論。

### R1 参考URL
music21 voiceLeading https://www.music21.org/music21docs/moduleReference/moduleVoiceLeading.html ／ マルコフmelody https://github.com/SpackiGabriel/procedural-melody-generation-markov-chain ／ Walking Bass https://github.com/MaxHilsdorf/Walking-Bass-Generator ／ GMドラムMIDI https://github.com/gvellut/dmp_midi ／ pydrums https://github.com/scribbletune/pydrums ／ Anticipatory https://github.com/jthickstun/anticipation ・ https://huggingface.co/stanford-crfm/music-large-800k ・ ローカル検証 https://arxiv.org/html/2411.09625v1 ／ GrooVAE https://magenta.tensorflow.org/groovae ・ https://arxiv.org/pdf/1905.06118 ／ Magenta install破綻 https://github.com/magenta/magenta/issues/1962 ／ Magenta RealTime(音声) https://github.com/magenta/magenta-realtime ／ REMI https://github.com/YatingMusic/remi ／ MuseGAN https://github.com/salu133445/musegan ／ DeepBach https://arxiv.org/pdf/1612.01010 ／ CP音楽(IJCAI2024) https://www.ijcai.org/proceedings/2024/0858.pdf ／ Anticipation-RNN https://arxiv.org/pdf/1709.06404 ／ LLM×ルール矯正 https://arxiv.org/html/2604.18489 ／ ComposerX https://arxiv.org/pdf/2404.18081

---

# R2. 分析・良し悪し判定・類似度測定

## 「分析・判定」一覧
| 目的 | 手法 | ライブラリ | コスト | 適合 |
|---|---|---|---|---|
| 調/スケール検出 | Krumhansl-Schmuckler(+Aarden/Bellman-Budge/TKP重み) | music21 | 極小 | ◎ |
| 局所調/転調 | 窓ローリングKS | music21 | 小 | ○ |
| コード→ローマ数字・機能(T/S/D) | rule-based RN | music21 `romanNumeralFromChord`+Key | 小 | ◎ |
| 多声→コード列 | chordify | music21 | 小 | ○ |
| コード品質/構成音 | harmony/chord | music21 | 極小 | ◎ |
| 進行の妥当性 | 機能遷移確率+voice-leading | 自前(music21上) | 小 | ○ |
| 協和/不協和 | Hutchinson-Knopoff / Sethares roughness | `dissonant`(PyPI) | 小 | ○ |
| テンション曲線 | Lerdahl Tonal Tension / TIS | 自前 | 中 | △ |
| メロ輪郭/跳躍比/音域/密度/フレーズ | 特徴量 | numpy+mido/music21 | 極小 | ◎ |

## 「類似度」一覧
| 対象 | 手法 | ライブラリ | 用途 | 適合 |
|---|---|---|---|---|
| 記号(MIDI) | Mongeau-Sankoff 編集距離 | 自前DP | 探索・近似一致 | ◎ |
| 記号 | 輪郭/区間 n-gram(Parsons) | 自前 | 高速粗フィルタ | ◎ |
| 記号 | PCH + KL/cos | numpy | 作風・粗 | ○ |
| 記号 | Tonal Pitch Space距離 | 自前 | 和声的近さ | △ |
| 音声(mp3) | Chromaprint/AcoustID | `pyacoustid`+fpcalc | **重複検出** | ◎ |
| 音声 | beat-sync chroma + DTW/Qmax | librosa, ChromaCoverId | カバー/同曲(転調耐性) | ○ |
| 音声/横断 | CLAP embedding + cos | laion-clap/HF | **作風近似・意味検索** | ◎ |
| 音声 | OpenL3/VGGish/MusicNN | — | 作風(汎用) | ○ |
| 分布 | Frechet Audio Distance | fadtk | 品質/作風一致 | △ |

## 要点（メロ×コードの「当てはまり」＝判定の核、厚め）
4レイヤで定量化：
- **(A) コードトーン率**：各メロ音が同時刻コード構成音(`chord.pitchClasses`)に含まれるか、拍重み付き在和音率 = Σ(コードトーンの音価×拍位置重み)/Σ(全音価)。numpy極小。
- **(B) 非和声音の検出・分類**：到来音程・離脱音程・拍位置・音価の標準特徴で 経過/刺繍/掛留/逸音/anticipation 等に分類（まずルールベースif-then、データが貯まれば回帰/DNN）。
- **(C) 不協和度**：Hutchinson-Knopoff/Sethares roughnessをメロ音×コード音ペアに（`dissonant` PyPIが実装）。**絶対値でなく相対/閾値運用**（モデル間で数値が食い違う）。
- **(D) テンション/アボイド**：コード品質×scale-degree表で決定的判定。全体テンション曲線はLerdahl（実装重・後段）。

**調検出の実態**：楽曲全体で総合75%級、コーパス依存（Bach 87%/Mozart 60%）。プロファイル別 TKP 85.4% > KS 78.0% > Bellman-Budge 73.2% → **TKP重みを既定**、転調は窓多数決。
**和声解析の限界**：rule-based RNはBachで人手と約82%一致が上限、装飾音多い箇所で破綻。**本PJはコード既知**＝`romanNumeralFromChord`に渡すだけなら精度問題の大半を回避。

## 類似度（用途別）
- 重複mp3 → Chromaprint/AcoustID（即）。
- メロ探索 → Parsons/区間n-gramで粗フィルタ → Mongeau-Sankoffで精密。
- 作風が近い → 記号はPCH/輪郭分布、音声は**CLAP embedding cos**（FAD研究でVGGish/OpenL3より音楽で優位）。
- カバー/同曲(転調込み) → beat-sync chroma cross-similarity（後段）。

## 品質メトリクス
MGEval（PCH/transition/density/range をKL・overlap比較）、MusPy（polyphony/pitch entropy/empty-beat/groove consistency）。自前で スケール外率・コード不一致率(=1−在和音率)・反復度・pitch entropy。**客観指標は「破綻の足切り」専用**、FADは少データで不安定＝当面参考値。

## R2 推奨
- 判定核：R2.0=拍重み在和音率＋ルール非和声音分類（即）→ R2.1=roughness＋テンション表、調=TKP、機能化=romanNumeralFromChord → R2.2=メロ指標＋テンション統合、総合スコア=重み付き線形和（重みは手持ち良曲でキャリブレーション）。
- 類似度：重複=Chromaprint / メロ探索=Parsons n-gram→Mongeau-Sankoff / 作風=CLAP＋PCH/輪郭。

### R2 参考URL
music21: discrete分析 https://music21.org/music21docs/moduleReference/moduleAnalysisDiscrete.html ・ roman https://music21.org/music21docs/moduleReference/moduleRoman.html ・ chordify https://music21.org/music21docs/usersGuide/usersGuide_09_chordify.html ／ 調検出精度 https://mtosmt.org/issues/mto.18.24.2/mto.18.24.2.white.html ・ http://rnhart.net/articles/key-finding/ ／ RN解析限界 https://transactions.ismir.net/articles/10.5334/tismir.45 ／ 非和声音 https://intmus.github.io/inttheory/09-non-chord-tones/a1-nonchordtonespt1.html ・ DNN https://dl.acm.org/doi/10.1145/3144749.3144753 ／ dissonant https://pypi.org/project/dissonant/ ・ https://github.com/bzamecnik/dissonant ／ Lerdahl https://www.academia.edu/8318278/Modeling_Tonal_Tension ・ TIS https://www.mdpi.com/1099-4300/22/11/1291 ／ Mongeau-Sankoff https://hal.univ-lorraine.fr/CRISTAL-ALGOMUS/hal-02340896v1 ／ Parsons https://grokipedia.com/page/Parsons_code ／ QBH https://www.cs.cornell.edu/zeno/papers/humming/humming.html ／ Chromaprint https://acoustid.org/chromaprint ／ ChromaCoverId https://github.com/albincorreya/ChromaCoverId ／ MGEval https://github.com/RichardYang40148/mgeval ／ MusPy https://arxiv.org/pdf/2008.01951 ／ FAD https://arxiv.org/html/2311.01616v2

---

# R3. LLM(Claude)×音楽専用技術の役割分担／個人化／自己ホスト

## 結論の構図
既存「ClaudeにJSONで音符を吐かせるだけ」は研究的にも**最弱の使い方**。GPT-4級でも「ABC構文は90%+正しいが、和声(chords/arpeggios)はほぼ理解せず、声部を足してもharmonyが成立しない」（ChatMusician/Sparks of AGI）。→ **Claude=言語/アイデア/計画/批評/分解、厳密な音高/和声/拘束=決定的エンジン＋軽量学習層**。

## LLMに音楽を渡す表現
| 表現 | 構文正確性 | 和声保証 | 自己ホスト実装性 | 適合 |
|---|---|---|---|---|
| **ABC記法** | 高(90%+) | ✕ | 高(music21双方向) | ◎ メロ/構造の素案に最適 |
| MIDIテキスト(REMI等) | 中〜低(冗長) | ✕ | 中 | △ worker内中間表現として |
| **JSON(現状)** | 高 | ✕✕(理論ゼロ=現状の問題) | 高 | △ APIの器としては有用、生成主体だと弱い |
| 専用トークン+専用モデル | モデル依存 | △(学習で改善) | 低〜中(GPU) | △ 弱GPUでは重い、state-tuning部分採用 |
**示唆**: Claudeとは **ABC(or簡潔JSON)を「人間可読な素案レイヤ」**にし、worker側でmusic21がMIDI/内部表現と相互変換。専用トークン列を直接吐かせない。

## ハイブリッド構成（主流＝計画→ミクロ生成→反復批評）
実例: ComposerX（leader/melody/harmony/reviewer等の役割分担）、CoComposer（Initial→Iterative Review→Final の閉ループ）、MusicAgent（LLMが外部ツールのオーケストレータ）。
**creative_manager向け**：
```
Claude=プランナー/批評            決定的エンジン=実行/拘束
 ・歌詞/指示理解、#85 frame設計  ─▶ music21:
 ・コード進行候補・メロ輪郭(ABC)     ・キー/スケール強制、音域補正
 ・違反レポートを読み再計画     ◀─   ・voiceLeading/figuredBass.checker
                                      ・グルーヴ量子化、frame整合
 → CoComposer型「生成→検査→修正」を2〜3回で収束
```

## 作風個人化（少データ）
**最重要新知見**：個人作曲家の少データregimeでは **State Tuning（MIDI-RWKV: 本体凍結し初期状態ベクトルのみ最適化）が LoRA を上回る**。
| 手法 | 必要データ | 弱GPU適性 | 少データ効果 |
|---|---|---|---|
| **Few-shot/in-context(自作注入)** | 数曲〜 | ◎(学習ゼロ) | 中（最初に必ず） |
| **RAG(自作を検索注入)** | 数十曲〜 | ◎ | 中〜高（text-to-musicでRAGは品質/追従改善） |
| **State Tuning(RWKV系)** | 少MIDIで効く | ○ | **高(LoRA超え)** |
| 軽量LoRA | 中(数十〜百) | △(GPU) | 中(少だと過学習) |
| スタイル特徴量条件付け | 少 | ◎ | 中 |
**mp3を作風データ化**: **Basic Pitch(Spotify,OSS,CPU可)** が第一候補→music21で作風特徴量（コード傾向/音域/リズム密度/スケール使用率）抽出。完全採譜不要、**特徴量レベルで十分**。

## 推奨アーキテクチャ（第一カット）
Claude(claude-opus-4-8, adaptive thinking, effort=high, **frame検証/music21はtool useで**) → ABC/JSON素案＋拘束指定 → Python worker(music21拘束の番人：スケール強制/voice leading検査/補正＋違反レポート) → Claude(批評/再計画) → 2〜3反復で収束。few-shot自作とframeはプロンプト前段固定でprompt caching。
段階: P1 few-shot+music21拘束+検査ループ（即・学習ゼロ）→ P2 Basic Pitch採譜→特徴量DB→RAG → P3 State Tuning作風寄せ → P4(任意) 専用記号モデル併用。

## 評価（人手最小）
客観指標(muspy: pitch entropy/groove/scale consistency)を**自動ゲート**（閾値NGで再生成）、Claudeは**LLM-as-judge の従**として作風1軸採点、人間の試聴は最終1回に圧縮。

## 落とし穴
Claudeに和声を任せない／マルチトラックABC直叩きは非整合（トラックはworkerで合成）／少データLoRA過学習→State Tuning/few-shot優先／採譜不完全前提（特徴量で使う）／弱GPU常駐機で重学習を回さない／prompt cache無効化（可変要素を前段に置かない）。

### R3 参考URL
LLM和声限界 https://arxiv.org/pdf/2402.16153 ・ https://arxiv.org/pdf/2303.12712 ・ https://arxiv.org/pdf/2407.21531 ／ 表現 https://arxiv.org/pdf/2404.06393 ・ https://arxiv.org/html/2511.03942v1 ／ ハイブリッド https://arxiv.org/html/2404.18081v1 ・ https://arxiv.org/pdf/2509.00132 ・ https://arxiv.org/pdf/2504.12796 ／ 個人化 https://arxiv.org/pdf/2506.13001 ・ https://arxiv.org/html/2506.17497v1 ・ https://aclanthology.org/2024.nlp4musa-1.6.pdf ／ 採譜 https://engineering.atspotify.com/2022/6/meet-basic-pitch ・ https://github.com/Music-and-Culture-Technology-Lab/omnizart ／ music21決定的層 https://github.com/cuthbertLab/music21/blob/master/music21/voiceLeading.py ・ https://www.music21.org/music21docs/moduleReference/moduleFiguredBassChecker.html ／ 評価 https://arxiv.org/pdf/2408.01696

---

## 次アクション（#86 → 設計に降ろす最小スライス）
1. **判定層 R2.0 を最初の縦スライスに**：worker に music21 を有効化し、`analyze_fit(melody, chords, key?)` → `{in_chord_rate, non_chord_tones:[{type,pos}], scale_outside_rate, score, issues[]}` を実装。
2. これを **(a) gen_*/gen_variations の reap 前検品**（#85の後段）と **(b) 既存ネタへの"提案"** の両方に配線。
3. 続いて生成の P2（コード=機能和声ルール、メロ=コードトーン拘束+マルコフ）で「Claude非依存の生成」を1要素から。
4. SDDで要件/設計に「Claude=計画/批評・記号エンジン=拘束/保証」の役割分担を明記してから実装（契約変更＝acceptor）。

## 追補: ルール生成の当てはまり実測（2026-06-21）

`apps/worker/scripts/measure_gen.py` で測定（50 seed × 3 frame = 150件、判定=analyze_fit、key=0）。

| 指標 | mean | min | p10 | 備考 |
|---|---|---|---|---|
| メロ score | 0.884 | 0.556 | 0.782 | score<0.6 は **0.7%** だけ |
| メロ in_chord_rate | 0.897 | 0.667 | 0.812 | 拍頭コードトーン拘束 |
| ベース in_chord_rate | 0.942 | 0.812 | 0.812 | 強拍root/弱拍5th |

**結論**：ルール生成は「判定器に通る品質」を**安定供給**（99.3%が score≥0.6）。Claudeの音符生成は当てはまり
保証が無い（#86研究の定性結論）。よって **生成はルール優先・Claudeは音符に触らない** の方針を実測でも支持。
Claude側の同条件比較は claude_prompt のコスト高につき harness（`--claude`）を残すのみ＝必要時に実行。
