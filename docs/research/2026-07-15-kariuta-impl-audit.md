# 仮歌トラック 土台の実装棚卸し（監査 L2 / 2026-07-15）

対象＝「メロに仮歌詞を当てる → 整合を検査する →（将来）歌わせる」の土台。**コードは読み・判定のみ／本doc以外は触っていない**（analyze.py・audio-drums.ts・L1/L3/L4のresearchは並行エージェント担当）。file:line は監査時点の実測。

## 0. 結論（要点）
- **想定より実装が進んでいる**。タスクが「設計されたが未実装か？」と疑った `analyzeLyricFit`／`suggestLyricRhythm`／MCP verb 2本（`analyze_lyric_fit`・`suggest_lyric_rhythm`）は**すべて実装済・MCP配線済・CHAT_VERBS許可済・テスト付き**。design #13b（正典 L1200-1208、タスクが指した L1186-1188 は行ズレで実体は L1200 台）は**ほぼコード化済**。
- **本当の穴は「web 表示・編集」と「精度」の側**：整合レポート（赤/黄 hits）を返す関数はあるが、**PianoRoll は syllable 文字を並べるだけで severity ハイライトを描かない**（design L1206「UIが赤/黄ハイライト」未達）。歌詞編集は「一括流し込み＋クリア」のみで**モーラ単位の手直し動線が無い**。
- **精度の底**：モーラ分割は特殊拍（ー/っ/ん/拗音/外来音ふぁ）を正しく割るが、**句読点・記号を1モーラに数えてしまう**／**英字は1文字=1モーラ**／**漢字は未読み解決（各字1カウント）**。アクセント辞書は**9語の内蔵＋平板ヒューリスティック**＝L3（アクセント抽出・並行中）の刺し先。

---

## 1. 実装済みの棚卸し（file:line）

### 1-1. モーラ分割・流し込み（3か所に重複実装）
「かな→モーラ」「モーラ→ノートへ流す」ロジックが**3コピー**存在し、規約（拗音結合・ー/っ/ん独立）は一致：
- `apps/api/src/lyric.ts:16` `splitMora` / `:37` `flowLyric`（chat の `set_lyric` 用に api 側へ移植）。`SMALL`＝拗音小書き集合（`:14`）。`MORA_FLOOR=0.25`（16分・`:33`）。モーラ>音符は**最長音符を半分割して枠を増やす**（`:42-55`）、モーラ<音符は余りをメリスマ`ー`（`:57-61`）。
- `apps/web/src/lyrics.ts:8` `splitMora` / `:31` `flowLyric`（web PianoRoll 用・api とほぼ同一）。冒頭コメント（`:5`）が「漢字交じりは各字1カウント（厳密化は pyopenjtalk 側＝将来）」と自認。
- `packages/music-core/src/prosody.ts:46` `analyzeMoras`（上位版）＝各モーラを `{kana, kind(normal/long/sokuon/hatsuon), vowel}` に**分類**して返す（`Mora` 型 `:10`）。長音は直前の母音を継ぐ（`:53`）、っ/ん は vowel=null。**同じ SMALL/LONG/SOKUON/HATSUON 定義を prosody 側で再定義**（`:17-20`）。
- → **同一規約の実装が api・web・music-core に散在**（SSOT 違反の技術負債・後述 WP）。

### 1-2. chat verb（②歌詞↔メロ・MCP）
- `apps/api/src/mcp.ts:54` で `suggestLyricRhythm`・`analyzeLyricFit` を `@cm/music-core` から import。
- `read_neta`（`mcp.ts:917`）＝メロの notes/syllable/コードを読む（メロ→仮歌詞・音数合わせ）。analysis ネタは巨大 raw を要約射影。
- `set_lyric`（`mcp.ts:928`）＝ melody ネタに歌詞かなを `flowLyric(notes, splitMora(lyrics))` で 1:1 流し込み `syllable` を付与→`updateNeta`（`:936-940`）。
- `suggest_lyric_rhythm`（`mcp.ts:943`, handler `:950`）＝ `suggestLyricRhythm(lyrics, {unit})`。
- `analyze_lyric_fit`（`mcp.ts:953`, handler `:966-975`）＝ id からネタの notes を引くか notes 直渡し。**各音符に syllable が無ければ err**（`:974`「先に set_lyric して」）。`accents`/`meter` を opts へ。
- **CHAT_VERBS 許可**：`apps/api/src/chat-session.ts:21`（`read_neta`・`set_lyric`）と `:23`（`suggest_lyric_rhythm`・`analyze_lyric_fit`・「許可漏れ厳禁＝過去BUG#1型」注記）。chat prompt にも歌詞↔メロ手順（`chat-session.ts:107-118`）。
- **テスト**：`apps/api/test/mcp.test.ts:126` の VERBS 一覧に両 verb／`:279` suggest／`:288` analyze（A-01赤検出）／`:298` syllable無しで err。`:438` CHAT_VERBS 一致テスト。music-core 側 `packages/music-core/test/prosody.test.ts`＝16 it（suggest R-01〜12・analyze A-01〜05/07）。

### 1-3. web 側の歌詞表示・編集（PianoRoll）
- `apps/web/src/components/PianoRoll.tsx:4` が `../lyrics` から `flowLyric/splitMora` を import。
- **入力動線**：歌詞入力欄（textarea）＋「流し込む」ボタン（`:194-199`＝`onChange(flowLyric(notes, splitMora(lyricDraft)))`）＋ syllable があれば「クリア」（`:201-204`）。＝**一括流し込み／全消しのみ**。
- **表示**：syllable を持つ音符があれば下端固定の歌詞レーン `.proll-lyric-lane`（`:303-320`）に各モーラを絶対配置。メリスマ`ー`は `.proll-syl.melisma` で灰色（CSS `transport-cards.css:1110`）。レーンは `position:sticky; bottom:0`（音域が広くても常時可視・CSS `:1075`）。
- **未実装**：モーラ単位の**個別編集**（1音符の syllable を打ち直す UI が無い）。整合 hits の**赤/黄ハイライト**（後述）。

### 1-4. ②歌詞↔メロの実 e2e 動線（usecases-chat.md）
- usecases-chat.md「②実装状況→✅本番api live（2026-07-05）」＝chat で `read_neta`/`set_lyric`（`lyric.ts`）を用い **歌詞→メロ（fit→capture→set_lyric）／メロ→仮歌詞** が通し動作確認済と記載。chat-session.ts:17 のコメントに「read_neta/set_lyric はここに無くて実際は動いていなかった＝E2Eで発覚・2026-07-05」＝**許可漏れを修正済**の履歴あり。プロソディ 2 verb（#13b）は 2026-07-14 追加で usecases 本文には未反映（記載は 15 verbs 時点）。

---

## 2. 設計されたが未実装（design #13b の消化状況）

タスクの疑い（「未着手か grep で確定」）に対する回答＝**大半は実装済**。design.md L1204-1208 と research 規則表 R-01〜14/A-01〜10 の消化：

| 項目 | design 指定 | 実測 |
|---|---|---|
| `suggestLyricRhythm` | prosody.ts に純関数 | ✅ `prosody.ts:108`。candidates=basic/subdivide/tail（`:114/123/138`）・pickup（R-10・`:146-152`, PICKUP_WORDS `:93`） |
| `analyzeLyricFit` | prosody.ts・score/hits/contour/melodyDir | ✅ `prosody.ts:257`。A_WEIGHT 表（`:203-210`）・score=1-ΣW/(3×pairs)（`:290`）・A-07 句末上げ（`:284-288`） |
| MCP verb 2本 | 「CHAT_VERBS へ必ず両方追加」 | ✅ 追加済（1-2 参照）。BUG#1 型の再発なし |
| R 実装 01/02/03/04/05/06/07/08/10/11/12（11本） | design 明記 | ✅ basic(01/03/05/06)・tie=長音(02)・rest=促音詰め(04)・subdivide(07 字余り)・tail(08/11/12 字足らずメリスマ)・pickup(10)。roleOf `:97` |
| A 実装 01/02/03/04/05/07（+08 noop・計7 handled）| design 明記 | ✅ 判定分岐 `prosody.ts:273-277`＋A-07 `:285`。ruleNote 解説 `:294` |
| R-09/13/14 保留 | 語境界×拍・リフレイン再利用・母音韻＝辞書/句解析要 | ⏸ 未実装（設計どおり保留） |
| A-06/09/10 保留 | 特殊拍への強アタック・語分断休符＝pyopenjtalk 接続時 | ⏸ 未実装（設計どおり保留） |
| **UI 赤/黄ハイライト**（L1206「UIが赤/黄ハイライト・握りつぶし可」）| design 明記 | ❌ **未実装**。web は analyzeLyricFit を呼ばず（`grep 0 hit`）、PianoRoll 歌詞レーンは severity 無着色。hits を可視化する経路が chat 応答テキスト止まり |

**アクセント精度の実体**：内蔵辞書は**9語のみ**（`prosody.ts:185-195`＝はし/そら/やま/はな/きみ/こころ/ひかり/なみだ/ゆめ）＋未知語=平板(kernel0)ヒューリスティック（`buildContour:235`）。語境界は誤検出回避で FLAT リセット（`:247`）。＝実運用の精度は `accents` 明示（人間 or L3 抽出）に依存。pyopenjtalk 未接続（design どおり）。

---

## 3. splitMora の質（実測・読み取り実行のみ）

`apps/api/src/lyric.ts` の `splitMora` を自作サンプルで実行（tsx）：

```
"さくら"          => 3 ["さ","く","ら"]              正
"せーの"          => 3 ["せ","ー","の"]              正（長音ー独立）
"きっと"          => 3 ["き","っ","と"]              正（促音っ独立）
"こんにちは"      => 5 ["こ","ん","に","ち","は"]    正（撥音ん独立）
"きゃりーぱみゅぱみゅ"=> 7 ["きゃ","り","ー","ぱ","みゅ","ぱ","みゅ"] 正（拗音結合）
"ふぁいと"        => 3 ["ふぁ","い","と"]            正（外来音小母音ぁ結合）
"がっこう"        => 4 ["が","っ","こ","う"]          正
"とうきょう"      => 4 ["と","う","きょ","う"]        正
"Loveだよ"        => 6 ["L","o","v","e","だ","よ"]    ✗ 英字が1文字=1モーラ（4枠過大）
"あ、ねえ"        => 4 ["あ","、","ね","え"]          ✗ 読点「、」を1モーラに数える
"ドレミ"          => 3 ["ド","レ","ミ"]              正（カタカナOK）
```

**所見**：
- 特殊拍（長音/促音/撥音/拗音/外来音）は**設計どおり正確**＝#13 の「最重要の正しさ（前にくっつけない）」を満たす。
- **欠陥1＝記号**：`\s` のみスキップ（`lyric.ts:21`）で句読点・記号を落とさず 1 枠に数える→音数チェックが狂う。prosody.ts:51 の `analyzeMoras` も同じ（同一欠陥）。
- **欠陥2＝英字**：ローマ字/英単語を1文字ずつモーラ化＝発音単位でない。
- **欠陥3＝漢字**：漢字は各字1カウント（web lyrics.ts:5 が自認）。読み解決は #13 で pyopenjtalk 予定・未接続。

---

## 4. ギャップ → WP リスト（既存資産で足りる / 小改修 / 新規）

仮歌トラック＝「当てる→検査→歌わせる」の各段に必要な実装。L1（歌詞書法）・L3（アクセント抽出）・L4（歌唱合成）の並行成果の刺し先も併記。

### A. 「当てる」（歌詞をメロへ）
- **足りる**：`set_lyric`／`flowLyric`／web 一括流し込み＝縦スライス通し済。
- **小改修**：
  - `splitMora`/`analyzeMoras` の**記号・句読点フィルタ**（欠陥1）＝1関数に punctuation 除外を足すだけ。**3コピーを music-core `analyzeMoras` に一本化**し api/web を薄いラッパにする（SSOT 負債解消）＝仮歌の前に片付けたい基盤。
  - web に**モーラ単位の syllable 編集**（音符タップ→かな打ち直し）。
- **新規（L1 刺し先）**：漢字→読み解決。L1「歌詞書法」が字余り/字足らず/表記ゆれの規約を出すなら、`suggestLyricRhythm` の subdivide/tail 候補ラベルと接続。読み解決本体は #13 の pyopenjtalk（Python worker）＝別作業。

### B. 「検査する」（整合を見る）
- **足りる**：`analyzeLyricFit`（score/hits/contour/melodyDir）＝ロジック完成。MCP 経由の chat 検査は動く。
- **小改修（最優先の穴）**：**web PianoRoll に hits の赤/黄ハイライト**を描く（design L1206 の未達分）。music-core 関数はブラウザからも呼べる純関数＝web が `analyzeLyricFit(notes,{accents})` を叩き、`FitHit.noteIdx/severity` で `.proll-syl` を着色＋ツールチップに `note`。握りつぶし（hit 無視）トグルも design 明記。＝**新規UIだが計算は既存資産で足りる**。
- **新規（L3 刺し先）**：**アクセント抽出**。現状 9 語辞書＋平板ヒューリスティック（精度天井）。L3 が語ごとの核位置を返せば `analyzeLyricFit(opts.accents)` にそのまま流し込める（`AccentEntry{kana,kernel}` が受け口・`prosody.ts:197`）。pyopenjtalk 接続で R-09/A-06/09/10 の保留 3+3 本も解禁。＝**受け口は既にある＝配線のみ**。

### C. 「歌わせる」（将来・歌唱合成）
- **新規（L4 刺し先）**：`syllable`＋pitch＋start/dur が既に各音符に載る＝**歌唱合成の入力契約は最低限そろっている**（かな＋音高＋タイミング）。L4「歌唱合成」（research: 2026-07-01-singing-voice-synthesis.md 等）が要求する追加情報（音素/ビブラート/子音先行量など）は現状 syllable 止まりで未保持＝新規スキーマ拡張が要る。melisma`ー`の tie 表現（flowLyric `:57`）は歌唱でロングトーンに写せる。

### 結線図（要約）
```
L1 歌詞書法 ─┐(字余/字足/表記規約)
             ├→ suggestLyricRhythm(候補) → set_lyric/flowLyric → syllable 付き melody ネタ
漢字読み解決 ┘(#13 pyopenjtalk・未接続)
                                             │
L3 アクセント抽出 ──(accents: kernel)────────┼→ analyzeLyricFit(notes,{accents}) → hits[]
  (pyopenjtalk 語境界→R-09/A-06/09/10 解禁)   │        └→ [新規] web 赤/黄ハイライト
                                             │
L4 歌唱合成 ←─(syllable+pitch+timing・要スキーマ拡張:音素/ビブラート)─ melody ネタ
```

---

## 補足：技術負債・注意点
- **モーラ分割 3コピー**（api/web/music-core）＝規約は今一致するが将来ズレる。music-core へ SSOT 化推奨。
- usecases-chat.md の verb 数（15）は #13b 追加（2 verb・2026-07-14）前の記述＝ドキュメント更新漏れ（本監査は読みのみ・修正せず）。
- design のプロソディ節は L1200-1208（タスク指定 L1186-1188 から行ズレ）。
