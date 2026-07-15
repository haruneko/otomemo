# F4: チャット × アナリーゼの深掘り会話 E2E フィジビリ（2026-07-15）

音源アナリーゼの結果（`analysis` 種別ネタ）を、常駐チャット（`claude -p` 薄ラッパー＋creative-manager MCP・chat面）で
「読み返して深掘りできるか」を静的確認＋本番api実走で実測した記録。**修正はしていない（所見の列挙まで＝後続W3）。**

対象api：本番稼働中 `http://100.109.159.48:8787`（Tailscale bind・cm-search 生存）。実走スレッド `f4-e2e`（実走後に削除済＝本番会話を汚さない）。
既存ネタは読み取りのみ・変更/削除なし。api再起動なし。

---

## TL;DR — 深掘り会話は「成立する。ただし迂回に成功したから」

- **深掘り会話そのものは高品質に成立した。** 3ターン（コード進行の特徴／2番以降の変化／理論的説明）すべてで、具体的・
  正確・理論接地した回答が返り、所要は各23〜89秒。特に「2番以降でコードは変わる？」に対し **実測タイムライン通りの秒刻み
  （143.98s Am→G→D 等）で正答**、理論説明も engine の返り値（explainProgression の「エオリアン類似度0.75」）を引いて接地していた。
- **しかし『詰まり』＝本命の直通パスは壊れている。** 最初の `search`（アナリーゼを狙った素直な検索）は
  **「result 2,038,607 characters … exceeds maximum allowed tokens」で即ハードエラー**した。`analysis` ネタの facts が
  巨大すぎて MCP ツール出力の上限（Claude Code 既定 ~25K tokens）を大幅超過し、丸ごと弾かれる。
- **成立したのは“たまたま軽い双子ネタ”があったから。** モデルはエラー後にリカバーし、`kind:"knowledge"` で再検索して
  **手作りの軽量アナリーゼ双子ネタ（6KB・chords_timeline を含むが melody_f0 を含まない）**を掴んで正答した。
  この双子ネタは Forgiven ともう1曲にしか存在せず、**標準の `analyze_audio` パイプラインは作らない**。
  双子の無い解析ネタ（例：DeepSea）では同じ深掘りは token 壁で頓挫する見込み。
- **記号系verbの「露出していない疑い」は半分当たり・半分外れ。** 単体の `identify_progression`/`analyze_progression`/
  `explain_progression` は **legacy 専用でchat面に非露出（確定）**。だが**同じ理論エンジンは chat面の統合verb `analyze`
  （question: identify/explain/progression）から呼べる**＝機能欠落ではなく冗長。実走でも `analyze(explain)` が実際に発火し接地回答を作った。
  → **BUG#1「黙って死ぬ」型ではない**。理論解析は動く。**壊れているのは facts の読み返し（サイズ）**の方。

**結論：詰まりは「verb の許可漏れ」ではなく「`analysis` ネタの facts が chat から読めないサイズ（特に melody_f0）」。W3 は read_neta/search の facts 間引き（要約射影）に振るべき。**

---

## 1. chat面 verb 露出の静的確認（file:line）

### 露出の決まり方（二重ゲート）
- **許可リスト**：`apps/api/src/chat-session.ts:18-28` `CHAT_VERBS`（`--tools`＋`--allowedTools` に載る＝モデルが見えて呼べる）。
- **登録**：`apps/api/src/mcp.ts:144` `buildMcpServer(opts.surface)`。`mcp.ts:146` `legacy = surface !== "chat"`。
  `mcp.ts:148`〜`mcp.ts:727` が `if (legacy) { … }`＝**full面のみ**。`mcp.ts:729`以降が chat面共通verb。
- 両方に載って初めて生きる。片方だけは「見えても is_error で黙って死ぬ」＝過去BUG#1型。

### 記号系（理論）verb の露出
| verb | mcp.ts 定義 | legacyブロック内か | chat面に露出 | 実質チャットから使えるか |
|---|---|---|---|---|
| `identify_progression` | mcp.ts:213-229 | **Yes（148-727内）** | **非露出** | ○ 統合 `analyze(question:"identify")` 経由で可 |
| `analyze_progression` | mcp.ts:231-244 | **Yes** | **非露出** | ○ `analyze(question:"progression")` 経由 |
| `explain_progression` | mcp.ts:246-255 | **Yes** | **非露出** | ○ `analyze(question:"explain")` 経由 |
| `analyze`（統合） | mcp.ts:1134-1171 | No（chat面共通） | **露出** | ◎ 上記3エンジンへ dispatch（1167-1169） |

→ **理論解析はchat面から到達可能**（統合 `analyze` が同じ `identifyProgression`/`explainProgression`/`analyzeProgression` を呼ぶ）。
ただし **`analyze` は `chords` を引数で受ける＝ネタidから読まない**。よって「解析ネタの進行を理論解析する」には
**先に facts から chords を取り出してモデルが `analyze` に渡す**必要がある＝facts の読み返しが前提条件（ここが詰まる）。

### chat面に実登録されている verb（26本・mcp.ts:729以降を実測）
`capture, revise, assemble, song_state, plan_next, check_loop, read_neta, set_lyric, suggest_lyric_rhythm,
analyze_lyric_fit, analyze_audio, fetch_chords, start_study, suggest_cliche, suggest_key_plan, suggest_form,
suggest_energy_plan, suggest_emotion_params, generate, fit, reshape, convert, continue, search, analyze, check_originality`

### ★副次発見：許可リストとの不一致（BUG#1候補）
`CHAT_VERBS`（chat-session.ts:18-28）は **25本**。mcp.ts が chat面に登録するのは **26本**。差分＝**`suggest_emotion_params`**
（mcp.ts:998-1014 で chat面登録済だが `CHAT_VERBS` に無い）。**登録あり・許可なし＝モデルから見えず/呼べば is_error で黙って死ぬ**
＝chat-session.ts:16-17 のコメントが警告する過去BUG#1型そのもの。F4本題ではないがW3で `CHAT_VERBS` に1行追加すべき。

### read_neta / search が返す形（サイズ非圧縮）
- `read_neta`（mcp.ts:793-797）＝`core.getNeta(id)` を **そのまま** `ok()`。**content丸ごと**（facts全部）を返す。
- `search`（mcp.ts:1124-1131）＝ `q` ありは意味検索マージ、ヒットしたネタの **content丸ごと** を返す（間引きなし）。
- `ok()`（mcp.ts:80-82）＝ **`JSON.stringify(data, null, 2)`（pretty print）**。数千点の数値配列で
  改行＋インデントが要素ごとに付く＝**生バイトの約2.6〜3.3倍に膨張**（下表 raw→pretty）。爆発の増幅器。

---

## 2. facts サイズ実測（`analysis` ネタ × フィールド）

DBは `data/cm.sqlite`（better-sqlite3・readonly）。概算トークン＝pretty-print バイト ÷ 3。`ok()` が pretty で返すので
**チャットが実際に食うのは pretty 側**。

### アナリーゼ: The Corrs - Forgiven (WB検証) — 605218da
| フィールド | 要素数 | raw bytes | pretty bytes | ~tokens(pretty/3) |
|---|---|---:|---:|---:|
| meta | – | 196 | 271 | 90 |
| **raw（合計）** | – | 91,796 | 246,115 | **82,038** |
| ├ beat_times | 383 | 2,860 | 4,010 | 1,337 |
| ├ melody_notes | 431 | 8,593 | 17,645 | 5,882 |
| ├ **melody_f0** | **5,552** | 76,533 | 165,366 | **55,122** |
| └ chords_timeline | 186 | 3,747 | 7,654 | 2,551 |
| overlay | – | 91 | 145 | 48 |
| prose | – | 2,534 | 2,534 | 845 |
| **content 全体** | – | 94,653 | **300,542** | **~100,181** |

### アナリーゼ: DeepSea (6/8再解析) — ca736c47
| フィールド | 要素数 | raw bytes | pretty bytes | ~tokens(pretty/3) |
|---|---|---:|---:|---:|
| meta | – | 194 | 269 | 90 |
| **raw（合計）** | – | 118,749 | 311,954 | **103,985** |
| ├ beat_times | 601 | 4,528 | 6,332 | 2,111 |
| ├ melody_notes | 651 | 13,053 | 26,725 | 8,908 |
| ├ **melody_f0** | **6,667** | 94,196 | 200,869 | **66,956** |
| └ chords_timeline | 322 | 6,909 | 13,672 | 4,557 |
| overlay | – | 91 | 145 | 48 |
| prose | – | 2,442 | 2,442 | 814 |
| **content 全体** | – | 121,512 | **379,203** | **~126,401** |

### 読み
- **1ネタ read_neta = 100K〜126K tokens。** Claude Code の MCP ツール出力上限（既定 ~25K tokens）を**4〜5倍超過**
  ＝**単体 read_neta でも丸ごと弾かれるサイズ**。実走の `search` が 2M chars で `exceeds maximum allowed tokens` を出した
  のと同じ壁（search は複数ネタ content を合流＝更に肥大）。
- **melody_f0 が支配的（55K〜67K tokens・全体の約55%）。** 中身は `[t, hz|null]` の F0 時系列（voiced_ratio≈0.5＝
  半分は `null`）。**チャットの推論にほぼ無価値**なのに最大の重り。次点 melody_notes（6K〜9K）。
- **チャットが実際に欲しいのは prose（~800tok）と chords_timeline（2.5K〜4.5K）だけ。** meta（90tok）も安い。
  この3つに絞れば **1ネタ ~5K tokens 以下**＝上限内で丸ごと読める。
- 補足：`raw` には設計上 `drum_onsets`（reaper.ts:232）も入るが、今回の2ネタは空（ドラムstem無/低信頼）。入っていれば更に増える。
- パイプラインの出所：`analysis` ネタは `apps/api/src/reaper.ts:221-244` が生成＝**raw に全時系列を素で保存**（読み返し/ワークベンチ用）。
  `prose` は `text` 列と `content.prose` の両方に入る。**軽量な `knowledge` 双子や全長 `chord_progression` は標準では作らない**。

---

## 3. 実走ログ要約（本番api・thread `f4-e2e`・3ターン・実走後スレッド削除）

| # | 質問 | 使ったツール（順） | 所要 | 結果の質 | 詰まり |
|---|---|---|---:|---|---|
| 1 | この曲のコード進行と特徴は？ | search×3（1本目=**巨大エラー**→kind絞りで復帰） | 23.5s | ◎ Dミクソリディアン断定・コード頻度表・v–♭Ⅶ–Ⅰのループ・V7不使用まで正確 | **本命 search が token 上限でハードエラー**。knowledge双子に迂回して正答 |
| 2 | 2番以降で調/コードは変わる？ | analyze(question:"progression") ×1 | 89.3s | ◎ 「調は不変・後半で C→G 置換増／Em集中区間／Am→D短絡」を**実測タイムライン通りの秒刻みで正答**（143.98/154.63/165.28/183.8s＝DB実データと完全一致） | 迂回で得た双子ネタ内の timeline を精読。双子が無ければ不可能だった |
| 3 | この進行を理論的に説明して | analyze(question:"explain") ×1 | 75.0s | ◎ 導音欠如/全音上行の平行/主音の二重性（D mixo↔A aeolian）まで、engine返り値「エオリアン類似度0.75」を引いて接地 | なし（`analyze` 経由で理論エンジンが正常発火） |

補足観測：
- ターン1の1本目 `search` 応答＝`Error: result (2,038,607 characters across 104,085 lines) exceeds maximum allowed tokens.
  Output has been saved to /home…`（is_error=false のテキストとして届く＝モデルは「巨大すぎて読めない」とだけ分かる）。
- ターン1の復帰＝`search{q:"Forgiven Corrs", kind:"knowledge"}`（26,636 bytes）に**手作りの軽量アナリーゼ双子**
  （id 8514610a・6,143 bytes・chords_timeline を含み melody_f0 を含まない）がヒット。**深掘りの正確さはこの双子に依存**。
- モデルは**一度も read_neta を呼んでいない**（3ターンとも）。read_neta を呼べば100K超で同じ壁に当たるため、実質使えていない。
- 沈黙/クラッシュ無し。エラーは黙殺されず自然にリカバーされた＝UXは破綻しないが、**軽量双子が無い解析では正確性が担保されない**。

---

## 4. 所見リスト（W3 配線候補）

**A. facts の読み返しを chat向けに射影する（最優先・詰まりの本体）**
1. **read_neta に「軽い版」を持たせる。** `analysis` ネタを read_neta したとき、`raw.melody_f0` を**既定で落とす/要約**する
   （このF0時系列は voiced_ratio≈0.5 でチャット推論に無価値・55K〜67K tokens）。同様に `melody_notes`/`beat_times` も既定は
   要約（件数・音域・代表値）に。**prose + meta + chords_timeline** を素通しすれば1ネタ ~5K tokens で丸ごと読める。
   フル配列が要る呼び出しには `fields:["melody_f0"]` 等のオプトインを付ける（ワークベンチ用途は温存）。
2. **search が content 丸ごとを返すのを止める。** mcp.ts:1124-1131 の検索結果はヒットネタの content 全部を pretty で返す＝
   `analysis` が1件混じるだけで token 上限を割る。**検索結果は要約射影（id/kind/title/key/meter/prose冒頭）だけ返す**べき。
   フルは read_neta（の軽量版）に委ねる。ターン1のハードエラーはこれで消える。
3. **`ok()` の pretty-print を数値配列で圧縮。** mcp.ts:80-82 の `JSON.stringify(data, null, 2)` が数値配列を約3倍に膨らませる。
   少なくとも `raw.*` の巨大配列は非pretty（`null,0`）で返すだけで pretty分（×2.6〜3.3）が消える。

**B. 軽量双子を標準で作る（Bが有れば深掘りが再現性を持つ）**
4. **`analyze_audio` パイプライン（reaper.ts:221-）に、chat向けの軽量ネタを1本自動生成させる。** prose＋chords_timeline＋meta
   だけの `knowledge`（or `chord_progression` 全長）ネタ＝今回 Forgiven の正答を支えた双子（6KB）を**全解析で自動化**。
   これが最も費用対効果が高い（read_neta改修と独立に効く）。DeepSea 等の双子欠落を根絶する。

**C. verb 露出の是正（副次・低コスト）**
5. **`CHAT_VERBS`（chat-session.ts:18-28）に `suggest_emotion_params` を追加。** 登録あり・許可なしの不一致（§1）＝過去BUG#1型の
   休眠バグ。1行。
6. **理論verbは統合 `analyze` で足りている**＝`identify_progression`/`analyze_progression`/`explain_progression` を chat面へ
   出す必要は薄い（冗長になる）。ただし **`analyze` がネタid から chords を読めない**のは不便＝Aの read_neta 軽量化と合わせ、
   モデルが「read_neta→chordsを`analyze`へ」の2段を踏めるようにするのが筋（もしくは `analyze` に `netaId` 入力を足して
   内部で chords_timeline を吸わせる案もあるが、facts射影(A)が先）。

**D. 非対象（今回は変えない）**
- melody_f0 を DB から消すのは不可（ワークベンチのピアノロール描画が使う）。**保存は残し、chat面の read_neta/search で射影**が正解。
- api再起動・既存ネタ改変は本タスク範囲外（W3で実施）。

---

## 付録：確認に使った実測コマンド（再現用）
- DBフィールド別サイズ：`better-sqlite3` で `kind='analysis'` を JSON.parse → フィールドごと `JSON.stringify` の
  raw/`(,null,2)` バイト比較。
- 実走：`curl -sN -X POST http://100.109.159.48:8787/chat/f4-e2e/turn -d '{"text":"…"}'`（SSE）→ stream-json イベントを
  parse し tool_use/tool_result/result を抽出。実走後 `DELETE /chat/f4-e2e` でスレッド削除。
