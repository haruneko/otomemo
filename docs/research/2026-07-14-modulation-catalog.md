# 転調（セクション間の調設計）型カタログ — J-pop実態と生成への結線

- 作成: 2026-07-14
- 任務: C2（セクション間の調設計＝転調の型カタログ）
- 位置づけ: `docs/design.md` の frame（セクションごとに key+mode を宣言）を、**複数キーをまたぐ「調プラン」**へ拡張するための知識ベース。現状ツールは曲全体が単一キー前提＝転調の語彙が無いので、その語彙を定義する。
- 思想の再確認: 「機械は候補まで、仕上げは人間」。本カタログは**調プランを候補として提示する**ためのもので、確定は人間。

---

## 0. 要旨（3行）

- J-popは洋楽ポップと逆行して転調が「多い」文化。特に **サビ入りの短3度上げ（♭+3＝平行調/同主調系）** と **最終大サビの半音上げ（♭+5＝トラックドライバー）** が二大頻出。
- 転調は「移動量（半音数・調関係）」×「遷移位置（どのセクション境界か）」×「準備手法（無準備/ピボット/セカンダリドミナント）」×「効果（高揚/転換/浮遊）」の4軸で型化できる。
- 生成側は「セクション列＋役割 → 各セクションの key+mode ＋境界の準備和音」を候補として吐く。メロ骨格は転調境界で**度数を読み替え**、可能なら**共通音で橋渡し**する。

---

## 1. 用語と軸の定義

### 1.1 一時転調（tonicization）と本格転調（modulation）の区別 ★重要

- **一時転調 / セクション内一時転調**: 数拍〜1〜2小節だけ他調のダイアトニックやセカンダリドミナントを差し込み、すぐ元調へ戻る。調の中心（トニック感）は移らない。ボカロで多用される「パラレルマイナーコード（♭Ⅵ, ♭Ⅶ, Ⅳm）を急に差し込む」もこれ。
  - → **frame（key+mode宣言）を変えるべきではない。** これはセクション内のコードイベント（借用和音・偽終止）として扱う。調プランの粒度に上げない。
- **本格転調**: 新しい調のトニックが確立し、しばらくその調が続く。カデンツ（V→I）や新調の反復で中心音が移る。
  - → **frame を切り替える。** 本カタログの主対象。
- 判定の目安: 「新しいキーで終止（V→I）したか」「新しいトニックが十分な長さ保持されたか」。一過性なら一時転調＝frame不変。
- 出典: [作曲編曲のやり方87の法則 一時的転調と本格的転調](https://www.4th-signal.com/compose/tenchou-chord-progress/) / [SoundQuest ポップスの転調技法](https://soundquest.jp/quest/chord/chord-mv4/modulation-in-pops-5/)

### 1.2 調関係（近親調）の整理

基準調に対する主な近親調（＝転調しやすい先）:

| 調関係 | 定義 | 主音の移動 | 明暗 |
|---|---|---|---|
| 平行調 (relative) | 同じ調号（例 C major ↔ A minor） | 短3度下（長→短） | mode反転（明暗の質は保つ） |
| 同主調 (parallel) | 同じ主音、mode違い（C major ↔ C minor） | ±0 | 明暗が直接反転 |
| 属調 (dominant) | Vをトニックにする調（C→G） | 完全5度上（+1♯） | 明るく開く |
| 下属調 (subdominant) | Ⅳをトニックにする調（C→F） | 完全4度上（+1♭） | 温かく落ち着く |
| 短3度上（同主の平行 or 平行の同主） | C→E♭ 等 | 短3度上（+3♭ 等） | 適度なインパクト・持ち上げ |

- 出典: [うちやま作曲教室 転調その1（調の種類）](https://sakkyoku.info/theory/changing-key-01/) / [うちやま 短3度転調](https://sakkyoku.info/theory/modulation-minor-third/)

### 1.3 準備手法（3系統）

1. **無準備（direct / phrase modulation）**: 前触れなく新調のコードへ飛ぶ。境界でスパッと切り替わる。セクション境界（特にサビ入り・大サビ）と相性良。効果=ギアチェンジ感・高揚。
2. **ピボットコード（共通和音）**: 両調に共通するダイアトニックを蝶番にして滑らかに移る。境界がなめらか＝「自然な転調」。効果=気づかせない/浮遊。
3. **セカンダリドミナント（ドミナント準備）**: 転調先トニックの直前に、その仮のVを置いて引っ張る。効果=強い牽引・「そこへ行くぞ」の予告。
- 出典: [うちやま 転調その3（ピボット/ドミナントモーション）](https://sakkyoku.info/theory/changing-key-03/) / [弾き語りすとLABO ピボットコード](https://hikigatarisuto-labo.jp/pivot-code/) / [OTO×NOMA 転調の基本](https://kensukeinage.com/chord_modulaiton_basic/)

---

## 2. 洋楽ポップとの頻度差（実態の背景）

- **洋楽ポップは転調が激減**。Chris Dalla Riva の Billboard Hot 100 #1 分析: 1960s〜90s は #1 曲の約1/4に key change があったが、2010年代の #1 で key change があったのは **たった1曲（Travis Scott "Sicko Mode", 2018）**。
- 要因説: ヒップホップの影響、および **DAW中心の制作**（DAWはアレンジ/音作りは伸ばすが、和声・構造の面白さは支援しない）。
- 対して **J-pop/アニソン/ボカロは転調が「多い」文化**が続いている。2020年代のヒットチャート上位でも頻繁に転調する技巧的な楽曲が多い。→ **本ツールの主戦場（J-pop/ボカロ/ゲーム）では転調語彙が競争力になる。**
- 出典: [Wikibooks Popular Music/Modulation](https://en.wikibooks.org/wiki/Popular_Music/Modulation)（Dalla Riva研究の要約） / [音楽的 サビで転調するJ-POP](https://musicmusicologic.com/j-pop-that-modulates-in-the-chorus/)

---

## 3. 型カタログ（本体）

移動量は「基準調から見た半音数」。調号ベースの分類（♯/♭ の増減）は khufrudamonotes の全12種を援用。頻度感は J-pop 文脈での主観5段階（★1稀〜★5頻出）。

| 型ID | 名称 | 移動量(半音) | 調関係 | 典型セクション位置 | 準備手法 | 効果 | 頻度 | 代表・メモ |
|---|---|---|---|---|---|---|---|---|
| M-PARA | 同主調交替（明↔暗） | 0 | 同主調 (mode反転) | サビ/Bメロで明暗を反転 | ピボット（共通の音多い）or 無準備 | 転換・陰影 | ★★★ | サビだけ長調/短調を切替。Aメロ短調→サビ長調で開放感、逆で翳り |
| M-REL-DN | 平行調へ（長→短） | -3 | 平行調 | Bメロ/落ちサビで沈める | ピボット（同一ダイアトニック） | 浮遊・翳り | ★★★ | 同じ音使いのままトニックが移る。気づかれにくい滑らかさ |
| M-SUBD | 下属調へ（+1♭） | +5(=-7) | 下属調 (Ⅳ調) | Bメロ/中間部 | ピボット/サブドミナント | 落ち着き・温かさ | ★★ | 一段落ち着ける。緊張を緩める中間部向き |
| M-DOM | 属調へ（+1♯） | +7 | 属調 (Ⅴ調) | Bメロ→サビの手前で明るく開く | セカンダリドミナント自然 | 高揚（穏やか） | ★★ | 自然に明るくなる。V of V 経由が定石 |
| M-WHOLE-UP | 全音上げ（+2♯） | +2 | 全音上 | Bメロ→サビ / 最終サビ | 無準備 or ピボット | 高揚（技巧感） | ★★★ | 半音より距離が大きく「持ち上げた」感。Superfly「愛をこめて花束を」B♭→C |
| M-WHOLE-DN | 全音下げ（+2♭） | -2 | 全音下 | 中間/大サビ後 | ピボット | なめらか・沈静 | ★ | 滑らかに下げる。稀 |
| M-MIN3-UP | 短3度上げ（♭+3） | +3 | 同主調の平行 / 平行調の同主 | **サビ入り（A/B→サビ）で最頻** | 無準備が多い/ピボット可 | 高揚＋色替え | ★★★★★ | J-popサビ転調の本命。適度なインパクトと扱いやすさ。♭+3はヒット曲最多クラス |
| M-MED-UP | 3度（メディアント）系 | +4等 | 3度関係 | サビ/大サビ | ピボット（半音共有多） | 強いインパクト | ★★ | ♯+3系。強い色替え |
| M-HALF-UP | 半音上げ＝トラックドライバー（♭+5） | +1 | 半音上 | **最終大サビ（最後の繰り返し）** | 無準備（direct）が定番 | 最大級の高揚・ダメ押し | ★★★★★ | 「大サビは半音上げ」の代名詞。ポルノ「サウダージ」Em→Fm、ABBA "Hasta Mañana" |
| M-HALF-DN | 半音下げ（♯+5） | -1 | 半音下 | 中間/落ちサビ | 無準備/ピボット | 下降・翳り | ★ | 稀。あえて沈める演出 |
| M-TRITONE | 三全音（最遠） | +6 | トライトーン | 間奏・ブリッジでの遠隔転調 | ドミナント/無準備で衝撃 | 断絶・場面転換 | ★ | 最も遠い。間奏でガラッと世界を変える用途 |
| M-REMOTE | 遠隔転調（近親調外・任意） | 任意 | 遠隔 | **間奏・ブリッジ**で自由に飛ぶ | ピボット（異名同音/共通音）or 無準備 | 大転換・異空間 | ★★ | 間奏は歌が無いので冒険可。戻り方（§4）とセットで設計 |

補足（一時転調＝frame不変で扱う。§1.1）:

| 型ID | 名称 | 内容 | 扱い |
|---|---|---|---|
| T-BORROW | 借用和音（一時転調） | ♭Ⅵ/♭Ⅶ/Ⅳm 等を数拍差し込む | セクション内コードイベント。frame変えない |
| T-SECDOM | セカンダリドミナント経由 | V/x を置いて次を強調、すぐ戻る | 同上。牽引の色付け |

- 出典（型の分類）: [khufrudamonotes 転調まとめ全12種類](https://khufrudamonotes.com/kind-of-modulation) / [khufrudamonotes 転調が多い曲](https://khufrudamonotes.com/a-lot-of-modulation) / [うちやま 短3度転調](https://sakkyoku.info/theory/modulation-minor-third/) / [TV Tropes: Truck Driver's Gear Change](https://tvtropes.org/pmwiki/pmwiki.php/Main/TruckDriversGearChange)
- 出典（代表曲）: [音楽的](https://musicmusicologic.com/j-pop-that-modulates-in-the-chorus/)（Cry Baby, パプリカ, サイレントマジョリティー, B'z ZERO 等）/ サウダージ Em→Fm・Superfly B♭→C は §1検索の日本語分析記事群による

### 3.1 セクション位置ごとの「効き」まとめ

- **A→Bメロ**: 平行調(M-REL-DN)・下属調(M-SUBD)・同主調(M-PARA) など**近い/沈める系**で場面を替える。Bメロは「ためて落とす／浮かせる」役。「Bメロで転調しまくる（謎転調）」パターンもここ。
- **B→サビ**: **短3度上げ(M-MIN3-UP)** と **全音上げ(M-WHOLE-UP)** が本命。持ち上げて開放。属調(M-DOM)で明るく開くのも定番。
- **最終大サビ**: **半音上げ(M-HALF-UP)＝トラックドライバー**。無準備でスパッと上げてダメ押し。ボーカルだけ先に転調して楽器が追う演出も（サウダージ）。
- **間奏/ブリッジ**: **遠隔転調(M-REMOTE)・三全音(M-TRITONE)**。歌が無いので冒険でき、後で元調へ戻す“旅”の設計に使う。
- 出典: [DATT.MUSIC Bメロで転調しまくる楽曲6選](https://datt-music.com/ongaku-riron/bmero-modulation-gakkyoku-syokai/) / [音楽的](https://musicmusicologic.com/j-pop-that-modulates-in-the-chorus/)

---

## 4. 戻り方（転調後にどう元キーへ帰るか）の型

転調は「行き」だけでなく「帰り」の設計が曲の骨格を決める。

| 戻り型ID | 名称 | 挙動 | 使いどころ |
|---|---|---|---|
| R-NONE | 戻らない（上げっぱなし） | 大サビで上げたら最後までその調。フェードアウト/エンディングで終わる | トラックドライバー(M-HALF-UP)の定番。ダメ押しして帰らない |
| R-INTERLUDE | 間奏で戻す | 遠隔/短3度で飛んだあと、間奏やブリッジをピボット/ドミナント準備区間に使って元調に着地 | M-REMOTE/M-TRITONE の受け皿。旅→帰還の物語 |
| R-INSTANT | 瞬時に戻す（無準備） | 転調セクションが終わった瞬間、次セクション頭で元調へパッと戻る | Bメロだけ転調→サビで元調、の「行って帰る」。落ちサビだけ平行調→大サビで復帰 |
| R-PIVOT-BACK | ピボットで滑らか帰還 | 戻り先トニックの直前に共通和音を挟んで違和感なく回収 | 自然さ重視。ループ設計とも相性（§6） |
| R-DOM-BACK | 元調のV経由で帰還 | 元調のドミナントを1〜2拍作って強制的にトニックへ解決 | 明快な回収。サビ前の“戻り”に有効 |

- 設計含意: frameの調プランは「行き遷移」と「帰り遷移」を**対で**持たせる。R-NONE 以外は「戻り遷移＝どこで・どの手法で元調へ」を明示フィールドにする。
- 出典: [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/TruckDriversGearChange)（上げっぱなし＋フェードの定番） / [うちやま 転調その3](https://sakkyoku.info/theory/changing-key-03/)（ピボット/ドミナントによる帰還）

---

## 5. 生成への結線案（設計含意）

### 5.1 データモデル（frame拡張）

セクションは既に role（Aメロ/Bメロ/サビ…）と key+mode の frame を持つ。ここに**遷移（境界）オブジェクト**を足す:

```
Section = { role, key, mode, bars, ... }         // 既存frame
Transition = {                                    // 新規：セクション境界に付く
  fromSection, toSection,
  typeId,           // M-MIN3-UP / M-HALF-UP / M-PARA ...（§3）
  semitones,        // 移動量（度数読み替えの根拠）
  prep,             // "direct" | "pivot" | "secondary_dominant"
  prepChords?,      // 準備和音（ピボット和音 or セカンダリV）具体列
  effect,           // "lift" | "shift" | "float"
  returnPlan?       // R-NONE / R-INTERLUDE / R-INSTANT / ...（§4）
}
```

一時転調（T-BORROW/T-SECDOM）は Transition ではなく**セクション内のコードイベント**として持ち、frameは動かさない（§1.1）。

### 5.2 「調プラン候補」を吐くロジック（候補生成、確定は人間）

1. 入力: セクション列＋役割（例 Intro-A-B-Chorus-A-B-Chorus-Bridge-LastChorus）＋基準key/mode。
2. 役割→遷移テンプレを当てる:
   - B→Chorus: 候補に M-MIN3-UP / M-WHOLE-UP / M-DOM / M-PARA を提示（頻度で重み付け＝短3度を筆頭）。
   - LastChorus 直前: M-HALF-UP（トラックドライバー）を高優先候補に。
   - Bridge: M-REMOTE / M-TRITONE ＋ 対の returnPlan（R-INTERLUDE/R-DOM-BACK）。
3. 各遷移に prep を割当（近親調ならpivot優先、遠隔・ギアチェンジ狙いならdirect、牽引したいならsecondary_dominant）。
4. **複数案をばらつかせて出す**（seed違い・「上げない案」も必ず含める＝洋楽的な転調ゼロ案も候補に）。単一解を出さない（機械は候補まで）。
5. 出力: 各セクションの key+mode 列 ＋ 各境界の準備和音列 ＋ 戻り計画。

### 5.3 メロ骨格への影響（度数の読み替え・共通音の橋渡し） ★

- **度数の読み替え**: メロ骨格が「度数（スケール上の位置）」で表現されているなら、転調境界の**向こう側は新keyの度数系で解釈**する。同じ骨格線でも実音は semitones ぶんズレる（トラックドライバーで「メロの形そのまま移調」＝度数保存・実音平行移動、が典型）。
- **共通音の橋渡し**: 境界の直前・直後で**両調に共通する実音（コモントーン）**を骨格のアンカーに置くと、転調が滑らかに聞こえる。ピボット準備と組み合わせると効果大。M-PARA/M-REL系は共通音が多く橋渡ししやすい。
- **無準備ギアチェンジ**では逆に共通音を狙わず、境界でスパッと段差を作る（それが快感の源）。
- 設計含意: 骨格レンダラは Transition を読み、境界で「度数系の基準key」を切替える。共通音ヒント（prep=pivot時）を骨格アンカーへ渡す。
- 出典: [音楽的](https://musicmusicologic.com/j-pop-that-modulates-in-the-chorus/)（「メロディーの形そのまま移調」＝度数保存の観察）

---

## 6. ゲームBGM文脈：ループと転調の両立

- ゲームBGMは**ループ再生前提**。イントロ→A→B…の直線展開を避け、数十秒で閉じる構造が多い。ここに転調を入れると**ループ境界で調が食い違う**（末尾がFで先頭がCだと繋ぎ目で段差）。
- 両立の型:
  1. **ループ内で行って帰る**: ループ区間の中で転調し、ループ末尾までに**必ず元調へ回収**（R-PIVOT-BACK / R-DOM-BACK）。ループ先頭＝末尾の調を一致させる。← 転調とシームレスループの正攻法。
  2. **イントロ付きループ（intro + loop body）**: 一度きりのイントロで転調的な導入を済ませ、以降ループするbody は単一調で閉じる。先頭/末尾の整合を気にせず済む。
  3. **上げっぱなし（R-NONE）はループと相性が悪い**: 楽曲的クライマックス用（ボス曲の最終形態など「もう戻らない」場面）に限る。ループには使わない。
- 設計含意: ゲーム用途フラグが立った frame では、調プラン生成に **「ループ末尾key＝ループ先頭key」制約** を課す（＝ループ内転調は returnPlan必須、上げっぱなし禁止）。イントロ区間を分離できるなら転調はイントロ側に寄せる。
- 出典: [g-angle ゲームサウンドのループ問題（前編）](https://www.g-angle.co.jp/blog/sound/sound-loop1/) / [同（後編）](https://www.g-angle.co.jp/blog/sound/sound-loop2/) / [JBG音楽院 シームレスなループと垂直遷移](https://jbg-ongakuin.com/staff-blog/20250627/) / [wararyo ループ音楽の注意点](https://wararyo.com/2017/05/loopmusic/)

---

## 7. 設計含意サマリ（design.md へ落とす候補）

1. frame は単一キー前提から**「セクション列＋境界Transition」モデル**へ拡張する。Transition = 型ID/移動量/準備/効果/戻り計画。
2. **一時転調（借用和音）と本格転調を層で分ける**: 前者はセクション内コードイベント（frame不変）、後者だけ frame を切替える。ここを混ぜると調プランが破綻する。
3. 生成は**役割→遷移テンプレ**で候補を出す（B→サビ=短3度/全音上げ、最終サビ=半音上げ、間奏=遠隔＋戻り）。**「転調しない案」も必ず候補に**（洋楽的トレンド＆ユーザーの選択肢のため）。
4. メロ骨格は境界で**度数系の基準keyを切替え**、prep=pivot時は**共通音アンカー**を渡す。
5. ゲーム用途は**ループ整合制約**（末尾key＝先頭key、上げっぱなし禁止、転調はイントロ寄せ）。
6. J-popは転調が競争力になる領域（洋楽は激減）。頻度重みは**短3度上げ・半音上げを筆頭**に。

---

## 出典一覧（URL）

- J-pop転調（多い曲/事例）: https://khufrudamonotes.com/a-lot-of-modulation
- 邦楽 転調実例: https://sakkyoku.info/theory/modulation-japanese-songs/
- サビで転調するJ-POP（代表曲群）: https://musicmusicologic.com/j-pop-that-modulates-in-the-chorus/
- 転調まとめ 全12種類: https://khufrudamonotes.com/kind-of-modulation
- 転調のやり方（10以上の方法）: https://khufrudamonotes.com/how-to-modulation
- Bメロで転調しまくる楽曲6選: https://datt-music.com/ongaku-riron/bmero-modulation-gakkyoku-syokai/
- うちやま 転調その1（調の種類）: https://sakkyoku.info/theory/changing-key-01/
- うちやま 転調その3（ピボット/ドミナント）: https://sakkyoku.info/theory/changing-key-03/
- うちやま 短3度転調: https://sakkyoku.info/theory/modulation-minor-third/
- うちやま 転調パターンまとめ: https://sakkyoku.info/theory/modulation-pattern/
- SoundQuest ポップスの転調技法（短3度上）: https://soundquest.jp/quest/chord/chord-mv4/modulation-in-pops-5/
- 一時的転調と本格的転調: https://www.4th-signal.com/compose/tenchou-chord-progress/
- ピボットコード解説: https://hikigatarisuto-labo.jp/pivot-code/
- OTO×NOMA 転調の基本: https://kensukeinage.com/chord_modulaiton_basic/
- TV Tropes: Truck Driver's Gear Change: https://tvtropes.org/pmwiki/pmwiki.php/Main/TruckDriversGearChange
- Wikibooks Popular Music/Modulation（Dalla Riva研究要約・洋楽激減）: https://en.wikibooks.org/wiki/Popular_Music/Modulation
- ゲームループ問題（前編）: https://www.g-angle.co.jp/blog/sound/sound-loop1/
- ゲームループ問題（後編）: https://www.g-angle.co.jp/blog/sound/sound-loop2/
- JBG音楽院 シームレスループと垂直遷移: https://jbg-ongakuin.com/staff-blog/20250627/
- wararyo ループ音楽の注意点: https://wararyo.com/2017/05/loopmusic/
