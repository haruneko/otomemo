# 伴奏パターン品質の真因調査（コード楽器「候補が貧弱」「左手がいまいち」の層別実測）

- 日付: 2026-07-22
- 種別: research（実測診断・実装/UI 非変更）
- 発端: オーナー耳評定「パターン候補が貧弱」「コード楽器の左手がいまいち・現実的でないパターン」
- 方法: 生成チェーン (1)研究doc譜例 → (2)chordLibrary → (3)genChordPattern → (4)resolveChordPattern/resolveLh → (5)試聴経路 → (6)SF2 を層別に実コード追跡＋スクリプト実測（tsx で api/web の実関数を直接呼びダンプ）。
- 実測スクリプトと耳サンプル: `/tmp/claude-1000/-home-shuraba-p-projects-creative-manager/db887683-e224-4bdb-9222-6601851240aa/scratchpad/quality-probe/`（probe.ts / make-midi.ts / arp-drift.ts / *.mid）
- 結論先出し: **支配的な真因は (4)実音化層＝型辞書の content が `top` を持たず 2026-07-04 以前の後方互換 tones 経路で鳴っていること**（RH が1オクターブ低い・7th/テンション全落ち・左手と同帯域で衝突）。エンコードの劣化（H-b）と語彙の薄さ（H-d）が第2・第3因。試聴経路（feel 不在・候補は常にピアノ音色）は増幅要因。

---

## 1. 層別の検証結果（実測）

### H-a 試聴経路 — ロール/vel は届いている。feel と音色が欠けている

**効いているもの（無罪）**:
- **ギター弦順ロール（strumMs）**: 候補試聴（`useMelodyGen.tsx:517` が ctx.tempo を渡す）・「パターンを選ぶ▸」帯（`ChordPatternEditor.tsx:137`・tempo は `useNetaEditor.ts:96` で既定120＝常に定義）・カード再生（`music.ts:1726`）・合成（`music.ts:1711`）の全経路で tempo が渡る。実測: GT-FOLK8@100BPM でダウン各声 +0.023拍（=14ms）刻み、アップは高→低・上位4声・vel78。**ロール不発ではない**。
- **vel 層の到達**: `scheduleTimes`（`music.ts:1549` `(n.vel??100)/127`）→ `velToMidi`（`audio.ts:295`）、MIDI 書き出しも `music.ts:1334`。Note.vel は再生・書き出しの両方に届く。

**欠けているもの**:
- **feel（swing/humanize）が候補に構造的に乗らない**。`genChordPattern` は S4 で opts.swing/humanize を実装済み（`generate.ts:941`）だが、**呼ぶ者がいない**：候補トレイの body は pattern/variety のみ（`useMelodyGen.tsx:360-363`）、帯の fetch も同様（`ChordPatternEditor.tsx:113-118`）。さらに試聴は `buildPlayback({kind:"notes",…})` に feel を渡さない（`useMelodyGen.tsx:518`・`ChordPatternEditor.tsx:138`）。→ **候補は常に素のグリッド**。死にノブ。
- **候補の試聴音色が常にピアノ**。SectionEditor の `progForKind`（`SectionEditor.tsx:281`）は chord_pattern → 0（GM Grand Piano）。単体エディタも新規 chord_pattern の program 既定は 0（`useNetaEditor.ts:99-100`）。**ギターストラム型 13 種もピアノ音色で試聴される**（strum ロール付きピアノ＝ハープもどき）。シティポップ型もエレピでなく Grand Piano。耳サンプル `BONUS_GT-FOLK8_t100_p0_tray-piano-cond_CAmFG.mid` がこの実試聴条件の再現。

### H-b エンコードの劣化 — lh 配線は満点、語彙の中身が痩せている

型は 26（鍵盤13＋ギター13）。全型を実測棚卸し（probe.ts 出力）:
- **lh 配線: 13/13 の keyboard 型に lh があり全て custom 配線される**（`chordLibrary.ts:139-165`・`generate.ts:971-975`）。数は欠落なし。
- **CHORD_SOFT(64)＝`o` トークンの使用型はゼロ**。研究doc piano §5-1 の3値語彙は実質2値（100/112）。しかも**鍵盤13型中 9 型は RH 全打 vel100 フラット**（アクセントがあるのは DN-OFFBEAT/GS-STRIDE/JZ-CHARL のみ）。「和音内で1声だけ強く」（piano §5-1）は全型未実装＝全声部同値。
- **アルペジオ図形の喪失**: piano doc 型2/3/11 の `1-5-10-5`（10度・高5含む4音周期の figure）は表現不能。エンコードは `A`（打鍵）の並び＋mode:"arp"（up 巡回）のみで、**arpDir/arpReset も生成器が設定しない**。実測（arp-drift.ts）:
  ```
  PB-ARP8 × C→Am→F→G:
  bar1 (C):  C3 E3 G3 C3 E3 G3 C3 E3
  bar2 (Am): E3 A2 C3 E3 A2 C3 E3 A2   ← 小節頭が E3（位相ドリフト・R から登り直さない）
  bar3 (F):  A3 C4 F3 A3 C4 F3 A3 C4   ← レジスタが4度跳ねる
  bar4 (G):  G2 B2 D3 G2 B2 D3 G2 B2
  ```
  8打/小節 ÷ 3声プール＝毎小節2つずつズレる。研究docの「うねり」でなく「回り続ける三連装置」。
- **ゴーストの近似が粗い**: guitar doc §4 は「16分の 1/2〜1/4 の極短＋実コードの0.3-0.5×」。実装は `x`＝dur1（16分フル）×全声×vel40（`chordLibrary.ts:71`・`compHitsForBar` は ghost を dur1 にするだけ）。GT-FUNK16 は 384音中288音がこの「全声 vel40 の16分和音」＝チャッでなくモヤ。
- **小節間バリエーションなし**: 全26型が1小節タイルの反復（`generate.ts:951`）。piano doc §3-2「長短を混ぜる」「チャールストンは毎小節ずらす」は未エンコード。4小節×同一타일＝機械感の一因。
- **辞書 lh の度数語彙が単音のみ**: doc の「LHオクターブ8分」（rock8/anison-verse）や R10 は preset（root5/oct）専用で、辞書 lh（deg トークン）から使えない。PR-8TH/AN-VERSE の LH は**単音 R の16分スタッカート連打**（`R . R .`＝dur1）＝docの「oct 8分の推進」と別物。

### H-c レンダの平板さ — ★最大の発見: 型辞書は旧 tones 経路で鳴っている

`buildCompContent`（`generate.ts:955-962`）が組む voicing は `{tones:["R","3","5"], openClose, octave:0, …}` で **`top` を積まない**。`voiceChord`（`music.ts:765-776`）は guitar→voiceGuitar／`top!=null`→voiceToTop／**それ以外→後方互換 tones 経路（L768-775・anchor=CHORD_BASE=48）**。つまり**鍵盤13型は全て、2026-07-04 の響きモデル作り替え以前のレガシー経路で実音化される**（手作りネタは `emptyChordPattern` が top:72 を持つ＝新モデル。型辞書経由だけが旧経路という逆転）。帰結は3つ、全て実測で確認:

1. **RH が1オクターブ低い**: 全鍵盤型の RH 実音域 = **G2..C4**（probe.ts メトリクス）。研究doc piano §2-1 の指定は「RH＝C4–C5」。C3 アンカーの密積みは §2-2 low interval limit の泥帯（G2+B2 の長3度は下限すれすれ）。top:72 を注入するデータ実験では G3..C5 に上がる（`BONUS_*_top72_*.mid` で可聴）。
2. **7th/テンション全落ち**: tones 経路は R/3/5 だけ積む。実測: **CP-SYNC16 × FM7 の実音＝F3 A3 C4（＋LH F2 C3）＝E（maj7）が存在しない**。シティポップ型が7thを鳴らさない。ギター型は voiceGuitar が QUALITY_INTERVALS から色音を拾うので鳴る（GT-FOLK8 × FM7 に E5 あり）＝鍵盤だけの欠損。
3. **ボイシングの変化・声部進行なし**: 進行4コードに対し distinct ボイシング 4〜8（＝コードごと1種の同一密積みトライアドの連打）。和音内 vel 差もゼロ（H-b）。「同一ボイシング・全声 vel100 連打」を定量確認（PR-8TH: 128音中 RH 96音全て vel100・4ボイシング）。

### H-d 候補の同質性 — 語彙が薄くて variety=4 が埋まらない

`pickCompTypes` 実測（probe.ts・seed5）:

| ジャンル/role/tempo | 出た候補 | リズム指紋の種類 | テンポ域内 |
|---|---|---|---|
| citypop/verse/100 | CP-16CUT, CP-SYNC16 | 2/2 | 2/2 |
| citypop/verse/120 | CP-16CUT, CP-SYNC16 | 2/2 | **0/2（全て域外）** |
| ballad/verse/72 | PB-ARP8, GT-BALLAD, PB-ARP16, PB-WHOLE | 4/4 | 4/4 |
| rock/chorus/120 | PR-SUS, PR-8TH, GT-DOWN8, GT-BACKBEAT | **2/4** | 4/4 |
| pop/chorus/110 | GT-DU16, GT-POP16 | 2/2 | 2/2 |
| anison/chorus/160 | AN-VERSE, AN-CHORUS | 2/2 | 2/2 |
| omakase/verse/120 | GT-DOWN8, GT-DU8, GT-FOLK8, GT-DU16 | 3/4 | 4/4 |
| dance/chorus/124 | DN-OFFBEAT, DN-ANTICIP | 2/2 | 2/2 |

- **variety=4 を要求しても半数のジャンルは2件しか出ない**（citypop/pop/dance/anison=2型、jazz/gospel/reggae=1型の語彙）。「候補が貧弱」は文字通り母集団の枯渇。
- rock は4件出るが**オンセット集合が同一の8分格子が3件**（PR-8TH/GT-DOWN8/GT-BACKBEAT）＝耳には「同じリズムの音色違い」。しかも試聴は全部ピアノ（H-a）なので差が更に潰れる。
- omakase は seed 起点の**連続回転**（`chordLibrary.ts:292-295`）なので COMP_TYPES 配列順の隣接4つ＝ギター4連発になりがち。多様性最大化はしていない。
- テンポ域外の距離順充填（`chordLibrary.ts:279-286`）: section 既定 tempo120 では citypop が全滅→両方域外で提示。空トレイ回避としては機能しているが、85-115 帯の型を120で敷く＝グルーヴの性格がずれた状態で評価されている。

### H-e 左手の実態 — 配線は生きているが音域規則が欠けている

- preset（白玉 root/root5/oct・`music.ts:849-868`）: C2..B2 に anchor 白玉・vel106。地味だが破綻しない。
- 辞書 lh（custom・`music.ts:832-847`）: **`5` が root の上に積まれ fold されない**（L842: `pitch = lhBand(rootPc) + degreeInterval(deg)`、L844 の LIL ガードは R/5/8 を対象外＝**上方向へは無制限**）。実測 GS-STRIDE × Am: LH の「5度」= **E3**（lhBand(9)=45+7=52）。同時に RH（レガシー経路）の Am トライアドは A2 C3 E3 — **左手のベース音が右手の最上声と同音**。probe.ts の overlapSemis（LH最高−RH最低）は最大 **+9半音**（=左手が右手の中に9半音めり込む）。「左手が現実的でない」の実体はこれ＝**ストライドの跳躍が下でなく上へ跳び、右手と同じ帯域で潰れる**。
- doc（piano §2-3）の R10・oct 語彙は辞書 lh から使えない（H-b）。LH_VEL=106>RH100 の「左手強め」だけは doc 準拠。
- 根本は二段: ①辞書 lh の度数解決に「LH 窓（C2-C3）へ fold」が無い、②RH が低すぎて（H-c）本来空くはずの分離帯が無い。**RH を C4-C5 に戻せば衝突の大半は消える**（BONUS_GS-STRIDE_top72 で可聴）。

### H-f 文脈（定性）

- 仮進行 C→Am→F→G は素トライアド＝7th 系の型（citypop/jazz/gospel）の性格が原理的に出ない。ただし実進行を与えても鍵盤型は 7th を落とす（H-c）ので、**現状は進行を変えても改善しない**＝文脈は主因でない。
- ドラム/ベース不在の単体試聴＋GM SF2 Grand Piano（サステインの表情なし）＋feel なし＝「デモ以下の打ち込み」の複合印象。各要素は増幅係数であって、根はデータ（H-c/H-b）にある。

---

## 2. 真因の序列（寄与の見積り）

1. **【支配的】(4)実音化層: 型辞書 content に `top` が無く旧 tones 経路で鳴る**（`generate.ts:955-962` × `music.ts:765-776`）。RH 1oct 低下・7th全落ち・LH衝突の三重苦が鍵盤13型全部に効く。これは**設計の抜け**: S2/S3 は「hits が16分格子に落ちる」ことだけ検証し、voicing がどの経路で実音化されるかを検証しなかった（piano doc §6-1 は voiceToTop を前提に書かれているのに、生成器はそこを通らない content を作った）。
2. **【大】(2)エンコード: 語彙の平板化**。和音内/打点間の vel 設計が実質未使用（soft 0型・9/13型フラット）・アルペジオ図形なし＋位相ドリフト・ゴースト近似が粗い・小節間変化ゼロ・辞書 lh が単音のみ。
3. **【中】(5)試聴経路: 候補が常にピアノ音色＋feel なし**（`SectionEditor.tsx:281`・`useNetaEditor.ts:99`・swing/humanize は生成器に実装済みだが UI から誰も呼ばない）。ギター型の存在意義が試聴段階で消える。
4. **【中】(データ量) ジャンル語彙が2型以下が過半**＝variety=4 が空回り。「候補が貧弱」の直接因のもう半分。
5. **【小】(6)SF2/文脈**: 増幅要因。単体では主因にならない。

「データが薄い」のは事実だが、**薄いデータすら本来の響きで鳴っていない**（真因1）が先。順番を間違えると語彙を増やしても全部同じ泥色で鳴る。

---

## 3. 直し方の選択肢（層ごと・工事規模）

- **案A【推奨・小工事】実音化の是正**: ①`buildCompContent` の voicing に `top`（keyboard 型＝72 目安・型ごとに調整可）を積んで voiceToTop 経路へ乗せる（7th 復活・RH C4-C5・LH 分離が一挙に直る）。②`resolveLh` の custom 度数に LH 窓 fold を足す（R/5/8 が LH_HI 超なら 1oct 下げ）。既定OFF原則との整合: 型辞書経由の新規 content のみに効く＝既存ネタ・従来経路は bit 一致のまま。効果/工数比が圧倒的に良く、耳サンプル（BONUS_top72）で事前確認済み。
- 案B【中工事】エンコード拡充: arp 図形（度数トークン列 or arpReset=1小節の既定化）・和音内 vel 差・ghost の短 dur・小節バリエーション（2小節型/バリアント）。スキーマ拡張を伴う＝第二弾。
- 案C【小-中工事】試聴経路: progForKind をコンテンツ連動に（style:guitar→25 等・citypop 型→EP4）＋候補 fetch に swing/humanize を結線 or 試聴時に既定 feel を付与。
- 案D【大工事】語彙拡充: 薄いジャンル（citypop/pop/dance/anison/jazz/gospel/reggae）に各+2〜4型、omakase の回転を多様性優先に。
- **推奨は案Aの一本**。A で「鳴り」が本来設計に戻ってから B/C/D の優先度を耳で再判定するのが順路（今の泥色のまま B/D をやると評価不能）。

---

## 4. 耳サンプル（オーナー最終審判用）

パス: `/tmp/claude-1000/-home-shuraba-p-projects-creative-manager/db887683-e224-4bdb-9222-6601851240aa/scratchpad/quality-probe/`
（scratchpad はセッション限定。残したければ早めに退避）

代表3型 ×｛1素のまま（現状の候補試聴と同条件）／2 feel付与（swing0.5+humanize0.5）／3実進行（IVmaj7→V7→IIIm7→VIm7・citypop的）｝＝リテラル既存曲不使用:

| ファイル | 何を聴くか |
|---|---|
| CP-SYNC16_t100_p4_1plain_CAmFG.mid | 現状のシティポップEP型。低い・7thなし・LHめり込み |
| CP-SYNC16_t100_p4_2feel_CAmFG.mid | feel を足すとどこまで人間味が戻るか（=それでも音は低い） |
| CP-SYNC16_t100_p4_3citypop-prog.mid | 実進行でも 7th が鳴らないことの確認 |
| GT-FOLK8_t100_p25_1plain/2feel/3citypop-prog.mid | ギターD/U+ロールは比較的まとも（無罪の層の確認） |
| GS-STRIDE_t110_p0_1plain/2feel/3citypop-prog.mid | 左手の「5度が上に跳ぶ」違和感・RHとの衝突 |
| **BONUS_CP-SYNC16_t100_p4_top72_citypop-prog.mid** | **案A後の音（top72 データ注入・コード非変更）＝7th 復活＋C4-C5 帯** |
| **BONUS_GS-STRIDE_t110_p0_top72_CAmFG.mid** | **案A後の左手分離** |
| BONUS_GT-FOLK8_t100_p0_tray-piano-cond_CAmFG.mid | 候補トレイの実試聴条件（ギター型をピアノ音色で）＝H-a の再現 |

聴き方: まず CP-SYNC16 の 1plain と BONUS_top72 を続けて聴くのが最短（真因1の before/after）。次に GS-STRIDE 1plain（左手の違和感）→ BONUS_top72。GT 系は「壊れていない層」の基準として。

---

## 5. 無罪の確認（今回の調査で切り分けが済んだもの）

- strumMs ロールの結線（全試聴経路で tempo が渡る）
- vel の再生/書き出し到達（scheduleTimes / notesToMidi）
- ギターの D/U 差（アップ=上位4声・0.78×・ロール0.75×＝doc §3.5 準拠で動作）
- lh の配線数（13/13 型が custom lh を持ち keyboard 解決時に鳴る）
- つんのめり（アンティシペーション）のコード先取り解決（bass と対称に動作）
