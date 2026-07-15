# 音楽的事前確率つきボーカル採譜 ＝ f0 曲線を文脈で「読む」復号（R5）

作成 2026-07-15 ／ 研究タスク R5。
狙い：現状の「PESTO f0 → energyVAD → 半音丸め RLE」パイプラインに、**調・コード・自前コーパスの度数統計**という音楽的事前確率を後段の**復号（decode）層**として足し、節回しの揺れが大きい歌手（畑亜貴）で「二度三度このへんだろ」と文脈で読む採譜へ寄せられるかを、外部研究と自前資産の両面から詰める。

---

## TL;DR（推奨アーキ1本）

**「あたりは PESTO が付けている。事前確率は"どの半音に丸めるか"の局所判定にだけ効かせ、区間の存在は VAD が握ったまま動かさない」** ＝ **セグメント単位の prior-informed Viterbi 再ラベル**を推奨する。

- **層の割り当て（家訓 Python=perception / TS=interpretation に忠実）**：
  - **Python（perception, `_audio_poc/analyze.py`）**：PESTO f0（10ms・conf）、energyVAD、区間分割まで。加えて各セグメントに **stationary pitch（cent 中心線）＋±1半音の候補2〜3個＋各候補の質量/conf** を吐くよう拡張。**半音丸めの確定はしない**（f0 の生情報を落とさず TS へ渡す）。
  - **TS（interpretation, `packages/music-core/`）**：セグメント列に対し **Viterbi 復号**。エミッション＝f0 の cent 中心線（ガウス）、遷移＝**自前コーパスの度数 bigram**（`loadNoteTransitions`）、局所事前＝**コード相対分布 `chordRelStrong/Weak`**（拍の強弱でゲート）＋**音域 prior `rangeHist`/vocal_range**＋**持続 prior**。復号は既に DB に取り込み済みの corpus 資産（`apps/api/src/music/corpusStats.ts`）を再利用する。
- **効かせる層**：f0→ノートの**「丸め」層だけ**。オンセット/区間存在（VAD）には触れない。これで「歌ってない区間を作る」「実際に歌った区間を消す」の二大事故を構造的に封じる。
- **暴走ガード（最重要）**：復号後のラベルは **raw stationary pitch から ±1 半音を超えて動かさない**ハードクランプ。事前確率は「揺れをどっちの半音に読むか」を決めるだけで、コードトーンへ音符を"瞬間移動"させない。倚音/経過音は **weak-beat では `chordRelWeak`（経過音が生き残る分布）＋コード重み低**で保護。
- **回帰安全**：ブレンド係数 λ=0 で現行出力に**ビット一致**するよう実装（LostMemory note-F 0.755／floor 0.74 を無条件に守る退避路）。

**要するに**：ROSVOT 級の歌特化 DNN を CPU 化するより、**すでに計算済みの自前コーパス統計＋chords_timeline＋key を純 TS の Viterbi 復号に結線する**方が、費用対効果・家訓適合・「文脈で読む」という要望への直撃度、すべてで勝つ。DNN は "より良い音響採譜"（77% COnPOff）を作るが、オーナーが欲しい "文脈で読む" はやらない。

---

## 手法サーベイ表（出典つき）

| 手法 | 事前確率にしたもの | f0→ノートのどの層に効かせたか | 報告値・要点 | 出典 |
|---|---|---|---|---|
| **Ryynänen & Klapuri（ISMIR2006 / TASLP）** ＝本命の直系 | **キー推定＋音符 bigram/trigram** の遷移尤度（musicological model）。別に3状態 left-to-right の note HMM（acoustic model）と no-melody モデル | multiple-F0 → **note HMM のノード**をキー依存の**遷移確率**で結び、Viterbi でノート/休符列を復号。事前確率は「隣接ノート間の遷移」に効かせる | RWC popular で recall 63% / precision 46%。MIREX05 baseline に対し有意改善。musicological model がキー外の遷移を抑える | [ISMIR2006 PDF](https://archives.ismir.net/ismir2006/paper/000005.pdf) / [thesis](https://trepo.tuni.fi/bitstream/handle/10024/114671/ryynanen.pdf) / [Semantic Scholar](https://www.semanticscholar.org/paper/Modelling-of-note-events-for-singing-transcription-Ryyn%C3%A4nen-Klapuri/c72bf5555f716b1211b7a0657d8318d918a0c9c6) |
| **pYIN / Tony（Mauch & Dixon 2014, Mauch et al. 2015）** | **なし（純音響）**。多f0候補の分布 prior のみ | 2段：①多f0候補を HMM Viterbi で滑らかな f0 track に。②その track を**別の HMM**（attack/stable/silent 3状態、高い自己遷移）で Viterbi 復号しノート分節 | ノート分節を f0 平滑と**分離**した設計が示唆的。キー/コード事前は無し＝揺れ歌手では丸めの手掛かりが弱い | [pYIN](https://code.soundsoftware.ac.uk/projects/pyin) / [Tony(TENOR2015)](https://www.tenor-conference.org/proceedings/2015/04-Mauch-Tony.pdf) / [tony repo](https://github.com/sonic-visualiser/tony) |
| **Nishikimi et al.（ISMIR2017）Scale- & Rhythm-Aware** | **音楽スケール（キー）＋リズム（tatum）**の score model | 階層 HSMM＝**score model（音符の音高×スケール×リズム）× F0 model（音符列からの時間周波数偏差）**。事前を「音符列そのものの生成モデル」に効かせ、ビブラート/しゃくりは F0 model の偏差として吸収 | semi-tatum-synchronous HHSMM。スケール事前とリズム事前を同時に。偏差を別層に逃がす思想が畑亜貴系に効く発想 | [ISMIR2017 PDF](https://eita-nakamura.github.io/articles/Nishikimi_etal_ScaleAndRhythmAwareMusicalNoteEstimationForVocalF0_ISMIR2017.pdf) |
| **ROSVOT（Li et al., ACL2024）** ＝歌特化 DNN の最前線 | **なし（純音響）**。キー/コード/和声事前は不使用 | U-Net＋Conformer。ノート境界を1次元セマンティックセグメンテーション、attention pitch decoder。入力＝mel＋f0(RMVPE)＋語境界(MFA) | clean で COnPOff-F1 **77.4%**、onset-F1 94.0%、pitch acc 97.0%。**2080Ti GPU 前提**（5分曲を一括）。CPU 常時起動機には重い | [arXiv 2405.09940](https://arxiv.org/abs/2405.09940) / [html](https://arxiv.org/html/2405.09940v1) / [demo](https://rosvot.github.io/) |
| **BERT-APC（2025）** ＝設計思想の金脈 | **記号音楽 LM（MusicBERT）の文脈事前**（MIDI大量事前学習）。明示的な和声注釈は使わず文脈から尤もらしい音高を推論 | ①ノート分節＋**stationary pitch**（ビブラート/遷移を除いた安定域の学習加重集約）②MusicBERT が octuple（拍位置等）＋連続音高補間埋め込みで文脈補正③**ノート単位の一様シフト**（フレーム量子化でなく）で intra-note のビブラート/ベンド/ポルタメントを保存 | 強デチューン曲で RPA **89.24%**（ROSVOT 78.75% を +10.5pt）。stationary pitch 3.5cent MAE。**ノート単位補正＝過補正回避**の原理が最重要教訓 | [arXiv 2511.20006](https://arxiv.org/html/2511.20006v2) |
| **ビブラート中心線推定（一般・特許/研究）** | 生理事前（ビブラート≒中心音高まわりの3〜7Hz変調） | f0 曲線に **3Hz LPF** で変調成分を除き中心線を得る／安定ビブラート周期区間の**平均**を定常音高とする | 「ビブラートは1音として書く」。前処理で中心線化 → 丸め断片化を根治 | [Google Patents US20090125298](https://patents.google.com/patent/US20090125298) / [Voice Science: Vibrato](https://www.voicescience.org/lexicon/vibrato/) |
| **非和声音（NCT）理論** | 経過音/倚音/刺繍音は和声外・**弱拍優位**（経過音は上下の和声音に挟まれ順次進行） | ラベル判定時の「守るべき音」の定義。強拍=和声音寄り、弱拍=NCT が生存 | コード吸着の副作用を弱拍で緩める設計根拠 | [Nonchord tone (Wikipedia)](https://en.wikipedia.org/wiki/Nonchord_tone) |

**系譜の読み**：事前確率を効かせる場所は歴史的に3系統。(a) **遷移**（Ryynänen＝キー×bigram、本命）、(b) **音符列の生成モデル**（Nishikimi＝スケール×リズム、偏差は別層）、(c) **文脈 LM**（BERT-APC＝記号LM＋ノート単位シフト）。自前資産（度数 bigram＋chordRel）は (a) と (c) のハイブリッドを**モデルサーバー無し**で組めるのが強み。

---

## 実装スペック案

### アーキテクチャ全体（2層）

```
[Python / perception  _audio_poc/analyze.py]
  PESTO f0(10ms,conf) → energyVAD gate → voiced segments(現RLEの手前)
    ├ 各 voiced 区間で:
    │    centerCents = 中心線推定（3Hz LPF 相当のメディアン/安定域平均、onsetの立ち上がり20%とビブラート両端を除外）
    │    candidates  = round(centerCents/100) を中心に ±1半音の {midi, massPct, conf} を 2〜3個
    └ 出力（新フィールド） melody_segments = [{t0,t1, centerCents, cand:[{midi,mass,conf}], onBeatStrong?}]
        ※ 既存 melody_notes / melody_f0 は互換のため残す（λ=0 経路）

[TS / interpretation  packages/music-core/src/priorDecode.ts（新規）]
  入力: melody_segments, chords_timeline, key{tonic,mode}, vocalRange,
        corpus資産（loadNoteTransitions / loadSkeletonPriors from corpusStats.ts）
  出力: melody_notes'（prior-informed）  ← materializeSectionNotes へ供給
```

### 疑似コード（TS・純関数・Viterbi）

```ts
// packages/music-core/src/priorDecode.ts
export function priorInformedNotes(
  segs: Seg[],                 // Python由来: {t0,t1,centerCents,cand:[{midi,mass,conf}],strongBeat}
  ctx: {
    key: { tonicPc: number; mode: "major"|"minor" };
    chordAt: (t: number) => { rootPc: number; qualityPcs: number[] } | null; // chords_timeline から
    bigram: Map<string,[number,number][]>;   // loadNoteTransitions（度数遷移 "4>2" 等）
    chordRelStrong: PriorEntry[]; chordRelWeak: PriorEntry[]; // pc相対→pct
    rangeHist: PriorEntry[]; vocalRange: {lowMidi:number; highMidi:number};
    lambda: number;            // 0=現行完全再現, 既定 0.5
  }
): Note[] {
  // 1) 候補格子: 各 seg の cand（既に raw±1半音にクランプ済＝暴走封じ）
  // 2) エミッションlogP(seg -> cand):
  //    emis = w_f0 * gaussCents(centerCents, cand.midi*100, SIGMA_CENT=45)   // f0が"あたり"
  //         + λ * w_chord * chordRelLogP(cand.pc - rootPc, strongBeat?strong:weak)
  //         + λ * w_range * rangeLogP(cand.midi, vocalRange)
  //         + w_conf * log(cand.conf)
  //    ※ chord根が無い区間(chordAt=null)は chord項をスキップ
  // 3) 遷移logP(prev.cand -> cur.cand):
  //    dPrev = pcToDeg(prev.pc, key); dCur = pcToDeg(cur.pc, key)
  //    trans = λ * w_trans * bigramLogP(`${dPrev}>${dCur}`)         // 自己遷移25.4%が自然に効く
  //          + persistLogP(cur.dur)                                  // 短断片ペナルティ=旧absorb代替
  // 4) Viterbi で全 seg 最尤パス。λ=0 なら emis=f0項のみ＝現行の round と一致（回帰退避路）
  // 5) 後処理: 同ラベル隣接マージのみ（旧 postprocess の absorb/isolated は持続priorへ移譲）
}
```

### パラメータ初期値（較正の出発点）

| 記号 | 初期値 | 意味・根拠 |
|---|---|---|
| `SIGMA_CENT` | 45 cent | f0 エミッションのガウス幅。半音=100cent の半分弱＝「あたりは付いてる」を尊重 |
| `HARD_CLAMP` | ±1 半音 | raw stationary pitch から動かせる上限（暴走封じ・最重要） |
| `lambda(λ)` | 0.5（0で現行再現） | 事前確率のブレンド。回帰が割れたら下げる |
| `w_f0` | 1.0 | f0 が主・事前は従（あたり優先） |
| `w_chord` | 0.6（strong）/ 0.25（weak） | 拍でゲート。弱拍は経過音保護で低く |
| `w_trans` | 0.5 | 度数 bigram 遷移 |
| `w_range` | 0.3 | 音域 prior |
| `PERSIST_MIN` | 100 ms | これ未満は log ペナルティ（旧 NOTE_ABSORB_DUR 0.14 の原理化） |
| 中心線 LPF | 3 Hz 相当 | ビブラート除去（研究値） |

### 自前資産の結線先（file:path）

- **f0/VAD/中心線・候補生成**：`_audio_poc/analyze.py`（`pesto_vocal` L52, `vocal_melody` L202, `postprocess_notes` L138）を拡張。`melody_segments` を digest/raw に追加。
- **度数遷移 bigram**：`apps/api/src/music/corpusStats.ts` の `loadNoteTransitions(db, style, mode)`（`bigram: Map<"4>2",[to,count][]>`）。元データ `data/corpus-stats/skeleton-corpus-stats-20260714.json`（`bigramFull` 909曲・POP909由来・統計のみ）。
- **コード相対分布**：`loadSkeletonPriors` の `chordRelStrong`/`chordRelWeak`（実測: strong で pc0/pc7 が各20%弱＝1・5度、weak で pc0=23%/pc7=22%＝経過音側もなだらか。これが NCT 保護の実証データ）。
- **音域 prior**：`rangeHist`（span 8〜12半音が7割超）＋ analysis の `vocal_range`。
- **コード時刻**：`apps/api/src/reaper.ts` L193/248 の `chords_timeline`（BTC・[t0,t1,label]）→ `chordAt(t)` へ。
- **復号呼び出しと取り込み口**：`reaper.ts` L316-317 `materializeSectionNotes(melodyNotesSec,"melody")` の直前で `priorInformedNotes` を通す。key/mode は analysis の key（コード頻度由来）。
- **新規純関数＋テスト**：`packages/music-core/src/priorDecode.ts` ＋ `packages/music-core/test/prior-decode.test.ts`（既存 `melodyLenses.ts` の度数/pc ユーティリティを流用）。

### 受け入れ基準案

1. **回帰床（無条件）**：λ=0 で現行 `melody_notes` と**ビット一致**。λ=既定で **LostMemory note-F ≥ 0.74**（現 0.755 を割らない）。割れたら λ を下げる or w_chord を下げる。→ `_audio_poc` の note-F 回帰スクリプトで測る。
2. **揺れ歌手での改善（本題）**：畑亜貴系1曲のサビ8〜16小節を**人手で正解ラベル**（オーナー手番、または本人の耳コピ）。指標＝ note-F の上昇＋**断片率**（voiced秒あたり <100ms ノート数）の低下＋**スケール適合率**（decoded 音高が key スケール/chord トーンに乗る割合の上昇）。
3. **副作用ゼロ検査（自動）**：(a) voiced 区間の総数・総尺が復号前後で不変（存在を作らない/消さない）。(b) 各ノートの pc が raw から ±1 半音以内（暴走なし）。(c) 弱拍の非和声音が chordRelWeak 想定内で残存（経過音が消えていない）。
4. **耳 A/B**：λ∈{0, 0.3, 0.5, 0.7} を書き出し、オーナーが「意図した音程列に近いのはどれか」を耳で選定（理論スコアはメロ質の天井＝ガードレール止まりのため最終判定は耳）。

---

## 副作用と限界の正直な記録

- **コード吸着の危険**：w_chord を上げると、実際に歌った倚音・経過音・ブルーノートを和声音へ吸い取る。畑亜貴の「しゃくり終わりの一瞬の非和声音」がまさに標的になり得る。→ **±1半音ハードクランプ**＋**弱拍ゲート（chordRelWeak・低 w）**＋**f0 主/事前従（w_f0=1）**の三重で抑える。それでも消えるなら λ を下げるしかない＝事前は"タイブレーカー"に留めるのが安全思想。
- **BTC コード誤りの伝播**：chords_timeline 自体が外れると事前が逆効果。→ chord conf 低区間は chord 項を無効化（`chordAt=null`扱い）。
- **キー推定依存**：度数 bigram はキーへの写像が前提。転調/借用和音で度数がずれると遷移事前が濁る。→ 部分転調は将来課題、まずは1キー固定で。
- **体感で直らない可能性（正直に）**：揺れの本体が「どの半音か曖昧」でなく「オーナーの脳内で二度三度先まで補完している」場合、それは f0 に情報が無い＝**事前確率でも復元できない**（"あたり"すら付いていない箇所）。この復号は「あたりは付いているが丸めが割れる/引っ張られる」区間には効くが、無い音を創作はしない（それは補完＝別パラダイム、既に「完成は人間」の設計思想で棚上げ済み）。期待値は**断片化の解消と丸めの安定**であって、耳コピの全自動化ではない。
- **セグメント境界の誤り**：現 RLE は半音変化で切るため、ポルタメントを跨ぐ長い1音が既に複数 seg に割れている場合、再ラベルでは1音に戻せない。→ 将来 BERT-APC/pYIN 流の**音高非依存オンセット分節**（音節オンセット）へ差し替える余地（重い、後回し）。

---

## 競合との比較（正直な見立て）

| 選択肢 | 得られるもの | コスト | 「文脈で読む」要望への直撃 | 判定 |
|---|---|---|---|---|
| **本案：corpus-Viterbi 復号（純TS）** | 丸めの安定・断片減・調/コード整合。既存資産100%再利用 | 低（純関数・モデルサーバー無し・数百行） | ◎（まさに key/chord/度数で読む） | **採用** |
| **ROSVOT を CPU 化** | より良い"音響"採譜（77% COnPOff） | 高（GPU前提の U-Net+Conformer、f0=RMVPE＋MFA語境界が追加依存、CPU化は実用速度が疑問） | ✕（純音響・key/chord 事前を使わない＝要望と別軸） | 見送り |
| **BERT-APC 流（MusicBERT）** | 記号LM文脈で強力な補正（RPA 89%） | 中〜高（MusicBERT のモデルサーバー常駐＋octuple 変換） | ○（文脈補正だが LM は自前コーパスでない） | 後回し（思想だけ輸入） |

**結論**：ROSVOT の CPU 化は費用対効果が悪い（重い・要望とズレる）。BERT-APC の**「ノート単位シフト＋stationary pitch＋過補正回避」という設計思想は輸入する価値が最大**だが、実体のモデルは要らない。**自前コーパスの度数統計＋chords_timeline＋key を純 TS Viterbi に結線する本案が、家訓（Python=perception/TS=interpretation・モデルサーバーは贅沢品で後回し）にも要望にも最適合。**

---

## 出典URL一覧

- Ryynänen & Klapuri, "Transcription of the Singing Melody in Polyphonic Music", ISMIR2006 — https://archives.ismir.net/ismir2006/paper/000005.pdf
- Ryynänen 博士論文 "Automatic Transcription of Pitch Content in Music…" — https://trepo.tuni.fi/bitstream/handle/10024/114671/ryynanen.pdf
- "Modelling of note events for singing transcription" (Semantic Scholar) — https://www.semanticscholar.org/paper/Modelling-of-note-events-for-singing-transcription-Ryyn%C3%A4nen-Klapuri/c72bf5555f716b1211b7a0657d8318d918a0c9c6
- pYIN (Mauch & Dixon) — https://code.soundsoftware.ac.uk/projects/pyin
- Tony (Mauch et al., TENOR2015) — https://www.tenor-conference.org/proceedings/2015/04-Mauch-Tony.pdf ／ repo https://github.com/sonic-visualiser/tony
- Nishikimi et al., "Scale- and Rhythm-Aware Musical Note Estimation for Vocal F0 Trajectories" (HHSMM), ISMIR2017 — https://eita-nakamura.github.io/articles/Nishikimi_etal_ScaleAndRhythmAwareMusicalNoteEstimationForVocalF0_ISMIR2017.pdf
- ROSVOT: "Robust Singing Voice Transcription Serves Synthesis", ACL2024 — https://arxiv.org/abs/2405.09940 ／ html https://arxiv.org/html/2405.09940v1 ／ demo https://rosvot.github.io/
- BERT-APC: "A Reference-free Framework for Automatic Pitch Correction via Musical Context Inference" — https://arxiv.org/html/2511.20006v2
- Vibrato detection / center-pitch (US20090125298) — https://patents.google.com/patent/US20090125298
- Vibrato (Voice Science lexicon) — https://www.voicescience.org/lexicon/vibrato/
- Nonchord tone (Wikipedia) — https://en.wikipedia.org/wiki/Nonchord_tone

---

### 自前資産の実測メモ（doc内・持ち出し統計のみ）

- corpus: `data/corpus-stats/skeleton-corpus-stats-20260714.json`（909曲/880曲4-4・phrases 13597）。
- major `chordRelStrong`: pc7=19.9% pc0=19.8% pc4=13.1%（強拍＝1・3・5度＝和声音支配）。
- major `chordRelWeak`: pc0=23% pc7=22.3% … pc5=6.7%/pc10=5.6%（弱拍は経過音側もなだらか＝**NCT 保護の実データ根拠**）。
- `selfTransitionPct`=25.4（同度反復が最頻＝ビブラート断片を1音へ寄せる遷移事前として妥当）。
- `bigramFull`: "0>0" 6.3% / "4>4" 4.8% / "4>2" 4% / "2>0" 3.8%（順次下降が強い＝丸めの方向事前）。
- `ornType`: passing:weak 9% / neighbor:weak 15% / appoggiatura/escape:weak …（非和声音は弱拍優位＝理論と一致）。

---

## 実装と実測（2026-07-15）

本案（corpus-Viterbi 復号）を実装し、機械受け入れ 1〜4 を通した。**λ 既定＝0.5**（R5 推奨値を採用・LostMemory 回帰の床を保ちつつ揺れ歌手で最も効く帯）。

### 実装（変更ファイル・スペックとの差分）

- **Python / perception `_audio_poc/analyze.py`**：`build_melody_segments(notes,f0,voiced,times)` を追加し、facts に **`melody_segments`**（`[{t0,t1,centerCents,cand:[{midi,mass,conf}]}]`）を追加出力。postprocess 済み各ノート `[s,e,midi]` のフレーム f0 から **cent 中心線**（`centerCents=MIDI*100` スケール、A4=6900）と **±1 半音候補**（フレーム毎丸めの mass）を付ける。**中心線の偏差は ±49cent にクランプ＝`round(centerCents/100)==midi` を保証**（TS λ=0 の bit 一致の土台）。`melody_notes`/`melody_f0` は従来どおり出し続ける（追加のみ・後方互換）。energyVAD・断片化後処理・PESTO 経路・テンポ判定（別作業の `resolve_tempo_octave`）は不変。
- **TS / interpretation `apps/api/src/music/melody-decode.ts`（新規・純関数）**：`decodeMelody(segs, chordsTimeline, key, opts)` → `[[start,end,midi]]`。Viterbi＝エミッション（f0 中心線ガウス `SIGMA_CENT=45`）＋λ×コードトーン事前（強拍 `w=0.6`/弱拍 `w=0.25`・拍でゲート）＋λ×音域 prior（`w=0.3`）、遷移＝λ×度数 bigram（`w=0.5`・tonic 相対 pc "4>2"）。**ハードクランプ＝候補は生 f0 committed の ±1 半音のみ**（格子がそもそも 3 候補）。強拍判定は `opts.beatTimes/meter/downbeatSec` から拍位置を割る（Python でなく TS が拍グリッドを握るため）。復号後は同ラベル隣接のみマージ（旧 absorb/isolated は Python 側で完了済）。**スペック差分**＝R5 疑似コードは `packages/music-core/priorDecode.ts` を想定したが、実装はタスク指定どおり `apps/api/src/music/melody-decode.ts`・関数名 `decodeMelody` に配置（corpusStats/chordname/theory と同居で結線が短い）。bigram は「度数 1..7」でなく **tonic 相対 pc(0..11)**（コーパスの実データ形）で照合。
- **結線 `apps/api/src/reaper.ts`**：`buildDigest`/`raw`/`materializeSectionNotes` の手前で、facts に `melody_segments` があれば `decodeMelody` を通し **`facts.melody_notes` を精緻版へ差し戻す**（digest/raw/区間ネタが全て精緻版を使う）。corpus は `hasCorpusStats(core.db)` で存在確認し `loadNoteTransitions`/`loadSkeletonPriors`（style=pop・mode=key由来）を再ロード。segments 無し／DB 未整備／例外は try/catch で従来 `melody_notes` に自動フォールバック（後方互換）。λ は `CM_MELODY_LAMBDA` env で上書き可（既定 0.5・A/B 用）。

### 受け入れ 1：TS 単体（`apps/api/test/melody-decode.test.ts`・9 ケース緑）

λ=0 退避路（round 一致・事前無視）／合成セグメントの遷移+コードによる正解収束／強拍のコードトーン確定・弱拍の経過音保護／**±1 半音ハードクランプ境界**（λ を過剰にしても候補外へ瞬間移動しない）／空入力・corpus 空でも死なない・同ラベル隣接マージ。

### 受け入れ 2：LostMemory 回帰（GT track8・offset 2.45・mir_eval note-F onset±50ms/pitch±50cent）

本番コードパス（`pesto` f0→VAD→postprocess の committed 483 ノート）から `melody_segments` を再生成し、`decodeMelody` を通して採点（python→TS→python 往復＝`scratchpad/f2work/{prep_segments.py,decode_run.ts,score.py}`）。

| 経路 | note-F | P | R | onF | n | dur_med | ≤0.15率 | scale外率 |
|---|---|---|---|---|---|---|---|---|
| baseline（現行 melody_notes） | **0.747** | 0.851 | 0.666 | 0.776 | 483 | 0.260 | 0.253 | 0.017 |
| decode λ=0（退避路） | 0.747 | 0.851 | 0.666 | 0.776 | 483 | 0.260 | 0.253 | 0.017 |
| decode λ=0.3 | 0.750 | 0.855 | 0.668 | 0.777 | 482 | 0.260 | 0.251 | 0.012 |
| **decode λ=0.5（既定）** | **0.749** | 0.854 | 0.666 | 0.776 | 481 | 0.260 | 0.252 | 0.006 |
| decode λ=0.7 | 0.742 | 0.849 | 0.658 | 0.773 | 478 | 0.260 | 0.253 | 0.004 |

**λ=0 は baseline に bit 一致（note-F 0.747）＝退避路を実証**。λ=0.5 は **0.749（≥ 床 0.74・baseline も割らない）**、スケール外率 1.7%→0.6%。LostMemory はボカロ的クリーンレンダーで揺れが少なく、復号が直す余地が小さい（想定どおり効果は微増）＝**床維持が本受け入れの要件で、これは満たす**。λ=0.7 は 0.742 まで下がるが床は保つ。

### 受け入れ 3：揺れ歌手 蜿蜒（生歌・GT無し・bpm_hint=235・A minor・実験後に音源/stem/採譜リテラル削除）

before=analyze の `melody_notes`（451）、after=`decodeMelody` λ 掃引（統計のみ・リテラル非保存）。

| 経路 | n | dur中央値 | ≤0.15率 | スケール外率 | 隣接音程 [同度/歩進/3度/跳躍] |
|---|---|---|---|---|---|
| before | 451 | 0.220 | 0.231 | **0.126** | 0.09 / 0.47 / 0.15 / 0.29 |
| after λ=0 | 451 | 0.220 | 0.231 | 0.126 | 0.09 / 0.47 / 0.15 / 0.29 |
| after λ=0.3 | 443 | 0.220 | 0.226 | 0.095 | 0.11 / 0.45 / 0.14 / 0.29 |
| **after λ=0.5** | 425 | 0.230 | 0.214 | **0.066** | 0.12 / 0.42 / 0.15 / 0.31 |
| after λ=0.7 | 421 | 0.230 | 0.209 | 0.050 | 0.14 / 0.40 / 0.15 / 0.31 |

**揺れ歌手では効果が大きい**：λ=0.5 で **スケール外率 12.6%→6.6%（ほぼ半減）**、ノート 451→425（±半音揺れ断片が同音へ吸収・**同度率 0.09→0.12 上昇／短ノート率 0.231→0.214 低下／dur中央 0.220→0.230 上昇**）。クリーン曲（1.7%→0.6%）より遥かに強く効く＝「あたりは付いているが丸めが割れる/引っ張られる」区間に効くという設計仮説と整合。**耳 A/B（λ∈{0,0.3,0.5,0.7}）はオーナー手番**（理論スコアはメロ質の天井＝ガードレール止まり）。

### 受け入れ 4：api 全スイート＋tsc

`pnpm --filter @cm/api test` ＝ **106 files / 1156 tests 緑**、`tsc --noEmit` クリーン。フル e2e は非実行（規約どおり）。

### λ 既定＝0.5 の根拠

R5 推奨初期値を採用。LostMemory 回帰で床（0.74）を割らず（0.749）、蜿蜒でスケール外率を半減しつつ短ノート断片も畳む中庸帯。0.3 は回帰 note-F が僅かに高い（0.750）が揺れ歌手への効きが弱い、0.7 は効くが回帰が 0.742 まで落ちる。**「機械は候補まで・原音の揺れを殺しすぎない」思想**（±1 半音クランプ＋弱拍ゲートの三重ガード込み）で 0.5 を中庸点に置く。最終微調整は耳 A/B 後、`CM_MELODY_LAMBDA` または `melody-decode.ts` の `LAMBDA_DEFAULT` で。
