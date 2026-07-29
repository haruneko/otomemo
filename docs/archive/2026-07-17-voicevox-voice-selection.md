# VOICEVOX 歌わせる声を選ぶ — 設計（2026-07-17）

## 狙い（オーナー要望）
仮歌を歌わせる**声（キャラ・歌唱スタイル）をユーザーが選べる**ようにする。今は実質固定（波音リツ ノーマル 3009）。

## 結論（先に3行）
- **「声を選ぶ」＝ frame_decode スタイルid を選ぶこと**。ピッチ曲線モデルは常に `sing(6000 波音リツ)` 固定で、声色だけ差し替わる（VOICEVOX の歌唱2段構成そのもの）。
- **伝播経路はもう全部通っている**。`content.sing.speaker` → job.speaker → `/sing?speaker` → `synthesize(frameDecodeId)` まで speaker が端から端まで結線済み。**欠けているのは選択UIと編集state だけ**＝極薄スライス。
- **列挙は engine の `GET /singers` を `type==="frame_decode"` で絞る**（実機で81スタイル確認）。ハードコード表は起動不要フォールバックとして小さく持つ。

---

## ① 現状の speaker 取り扱いマップ（実コード・file:line）

### 用語の確定（実測 2026-07-15 feasibility §2＋今日ライブ再確認）
VOICEVOX 0.25.2 の `GET /singers`＝**30キャラ**。スタイルの `type` で用途が割れる：
- `type=sing`（本物の歌声・**query に使う**）＝ **波音リツ「ノーマル」id 6000 の1つだけ**。
- `type=frame_decode`（声色・**synth に使う**）＝ **81スタイル**（四国めたん/ずんだもん/春日部つむぎ/雨晴はう/波音リツ…各キャラ×感情）。
- **正道**：query は `sing(6000)` 固定で f0/phonemes を作り、synth は `frame_decode の任意id` で wav 化。**ユーザーが選ぶのは後者（声色id）**。

今日のライブ実測（`http://127.0.0.1:50121`・engine 0.25.2 稼働中）：
- `type` 集計 = `{frame_decode: 81, sing: 1}`。sing = `(6000, 波音リツ, ノーマル)` の1体のみ。
- 同一 query を speaker=3009/3003/3065 で `frame_synthesis` → **3つとも別バイト列の wav**（md5 相違）＝声色差し替えが end-to-end で効くことを確認。

### コード上の speaker 経路
| 層 | 場所 | 役割 |
|---|---|---|
| 定数 | `apps/api/src/sing.ts:18` `SING_SPEAKER=6000` | query 固定（歌声モデル） |
| 定数 | `apps/api/src/sing.ts:19` `DEFAULT_FRAME_DECODE=3009` | synth 既定（波音リツ声色） |
| 合成 | `sing.ts:211-220` `synthesize(score, frameDecodeId=3009)` | `:216` query=`?speaker=6000` 固定 / `:218` synth=`?speaker=${frameDecodeId}` |
| キャッシュ鍵 | `sing.ts:241-243` `singHashOf(score, speaker)` | **speaker を鍵に含む**＝声変えれば別 wav（stale なし） |
| 汎用歌唱 | `sing.ts:254-274` `singGeneric(..., frameDecodeId?)` | `:264` `speaker = frameDecodeId ?? DEFAULT_FRAME_DECODE` |
| ネタ歌唱 | `sing.ts:277-288` `singNeta(..., frameDecodeId?)` | `:283` 同上フォールバック |
| API | `apps/api/src/http.ts:733-761` `POST /sing` | `:740` `speaker: z.number().int().optional()` を受け `:754` singGeneric へ |
| API | `http.ts:708-728` `POST /neta/:id/sing` | `:710` speaker 受け `:722` singNeta へ |
| MCP | `apps/api/src/mcp.ts:1046-1066` `sing_neta` | `:1053` speaker（声色 frame_decode id・既定3009）を受け singNeta へ |
| web api | `apps/web/src/api.ts:245-248` `api.sing(notes,bpm,speaker?,ensemble?)` | speaker を body に透過 |
| web フック | `apps/web/src/useVocal.ts:22-26,52` `VocalJob.speaker` | `:52` `api.sing(..., j.speaker, ...)` |
| web Section | `apps/web/src/components/SectionEditor.tsx:180-202` `singingJobs` | `:197` job key に `s:speaker` を含む・`:198` `speaker: sing.speaker` |
| スキーマ | `apps/web/src/music.ts:695-705` `SingSetting{enabled, speaker?}` / `singOf()` | メロ content に載る歌声宣言 |
| **保存（穴）** | `apps/web/src/useNetaEditor.ts:254-260` `singContent()` | 既存 speaker は**温存するがUIで編集しない**（`:254` コメント「UIでは編集しない」）＝**ここが未接続点** |
| **UI（穴）** | `apps/web/src/components/MetaPanel.tsx:134-168` 音色ピッカー | `:145-149` 「歌声」optgroup に**単一 option `value="sing"` のみ**＝声の選択肢が無い |
| UI 配線 | `apps/web/src/components/NetaDialog.tsx:60-69` | `sing`/`setSing`/`program`/`setProgram` を MetaPanel へ渡す（`speaker` はまだ無い） |

### 保存粒度
- speaker は**メロ子ネタ単位**（各 melody ネタの `content.sing.speaker`）に保存される。Section 単位でもグローバル設定でもない。
- 既定 = キー欠落 → api の `DEFAULT_FRAME_DECODE=3009`。
- **キャッシュ整合はOK**：`singHashOf` も SectionEditor の job key（`{n,t,e,s:speaker}`）も speaker を鍵に含むので、声を変えれば必ず別 wav（stale 再利用の穴なし）。

### 要点
**伝播チェーンは既に完成している。** `content.sing.speaker` を UI で書けるようにするだけで、`/sing` の synth 声色まで自動で流れる。追加のドメイン結線は不要＝縦スライスは薄い。

---

## ② 歌声列挙の方式（engine 問い合わせ vs 表）

### 方式A：engine 問い合わせ（推奨・S2 本命）
`GET /singers` → 各キャラの styles を **`type==="frame_decode"` で絞る** → `[{id, character, style}]`。
- 長所：**権威**。エンジン版・追加音声ライブラリに自動追従。ハードコードのドリフトが無い。
- 短所：engine 稼働が前提。**ただし列挙のためだけに engine を spawn してはいけない**（VOICEVOX 起動は約2秒＋常駐＝ドロップダウンを開くコストとして重すぎる）。→ `engineUp()`（spawn しない ping）で**起きている時だけ**問い合わせ、起きていなければ方式B にフォールバック。

### 方式B：ハードコード curated 表（S1 の初期口＋フォールバック）
`music.ts` に**よく使う声を数体だけ**定数で持つ（GM_INSTRUMENTS の「よく使う」optgroup と同じ発想）。例：
`3009 波音リツ/ノーマル`（既定）・`3003 ずんだもん/ノーマル`・`3002 四国めたん/ノーマル`・`3008 春日部つむぎ`・`3010 雨晴はう`・`3065 波音リツ/クイーン` 等。
- 長所：engine 不要で即描画。オフラインでも UI が出る。
- 短所：81 全ては出せない／エンジン更新でズレる。

### 採用：**B を土台に A を上乗せ**
`GET /sing/voices`（新 api）= engineUp なら `/singers` を frame_decode で絞って返す・ダメなら curated 表を返す。web は起動時に一度取得してメモ。**列挙のために engine を起こさない**のが鉄則。

**⚠ 除外必須**：`type=sing` の 6000（波音リツ）は**声の選択肢に出さない**。6000 は query 用モデルであって `frame_synthesis?speaker=6000` は正道でない。列挙は frame_decode のみ。

---

## ③ 選択UI・保存粒度・伝播の設計

### 保存粒度：**per-child（メロ子ネタ単位）＝現行のまま**
`content.sing.speaker` に保存。既存スキーマ（`SingSetting.speaker`）をそのまま使う＝**スキーマ変更ゼロ**。
- 既定（未選択）は speaker キーを**書かない**＝ api 既定 3009 に委ねる（後方互換 bit 一致・`useNetaEditor.ts:259` の現行挙動を踏襲）。

### UI 案（オーナー分岐＝要判断）
どちらも既存 `<select>`＋`<optgroup>` パターンの再利用で、**新しい見た目要素は無い**。

- **案B（推奨）＝二段**：音色ピッカーで「仮歌（歌声）」を選ぶと、**その下に「声」ドロップダウンが1つだけ出る**（キャラで optgroup グループ化。frame_decode 81 をキャラ別に束ねる）。
  - 長所：楽器ドロップダウンが 81 声で汚れない。歌声モード時だけ「声」が現れて発見的。GM family の optgroup と同じ手触り。
- **案A＝一段（フラット）**：「歌声」optgroup を展開し、声ごとに option（`value="sing:3003"` 等・ラベル「仮歌（ずんだもん・ノーマル）」）。
  - 長所：配線が最小（既存 setSing 分岐の延長）。短所：楽器ドロップダウンに 81 声が同居して長大化。

→ **推奨は案B**（楽器選択の清潔さと発見性）。ただし「1タップで済む案A が好き」ならAでも配線は通る。**ここはオーナー好み分岐**。

### 伝播
UI で書いた `content.sing.speaker` は**既存経路をそのまま流れる**：
`singOf(content).speaker` → SectionEditor `job.speaker`（`:198`） → `api.sing(speaker)` → `POST /sing?speaker` → `singGeneric(speaker)` → `synthesize(frameDecodeId)` → `frame_synthesis?speaker=<id>`。
**新規結線ゼロ。**

### プレビュー（試聴）
専用プレビューは**初期は不要**。ネタエディタの ▶（`useVocalRender`）が job.speaker で毎回レンダするので、**声を変えて ▶ を押す＝それが試聴**（cache key に speaker が入るので確実に鳴り直す）。声ごとのワンタップ試聴やお気に入りは backlog。

---

## ④ 縦スライス

- **S1（最小・これで単一声の要望は満たす）**：curated 表（方式B）＋案BのUI＋editor state＋保存。
  - `music.ts` に curated 声リスト定数＋ラベル関数。`useNetaEditor` に `singSpeaker` state（初期 `singOf(neta.content)?.speaker`）＋ `singContent()` に speaker 注入。`MetaPanel`/`NetaDialog` に「声」ドロップダウンと props を通す。
  - 完了条件：メロで声を選ぶ→ ▶ でその声で歌う。Section 通し再生でも各子が自分の声で鳴る（伝播は既存）。
- **S2（列挙を権威化）**：`GET /sing/voices`（engineUp なら `/singers` を frame_decode 絞り込み・ダメなら curated 返し）。web は起動時取得＋メモ。ドロップダウンが全81声（キャラ別 optgroup）に。
- **S3（混在の確認・ほぼタダ）**：複数メロ子が別々の声＝speaker が per-child なので**もう成立**。FormStrip/Section 要約に選択声を1行出すと分かりやすい（任意）。
- **S4（backlog）**：声ごとのワンタップ試聴・お気に入り・起動時ウォームアップ（初回声の遅延ロード ~2s を隠す）。

---

## ⑤ 実装Opus への申し送り

### 触るファイル
- `apps/web/src/music.ts` — curated 声リスト定数（`{id, character, style, label}`）＋ラベルヘルパを export。`SingSetting.speaker` は既存（変更不要）。
- `apps/web/src/components/MetaPanel.tsx` — 「歌声」選択時に「声」ドロップダウンを追加描画（props `speaker`/`setSpeaker`/`voices`）。既存 optgroup パターン踏襲。
- `apps/web/src/useNetaEditor.ts` — `singSpeaker` state 追加（初期 `singOf(neta.content)?.speaker`）。`singContent()`（`:256-260`）に speaker を注入（未選択＝キー省略で bit 一致維持）。
- `apps/web/src/components/NetaDialog.tsx` — `speaker`/`setSpeaker` を MetaPanel へ透過（`:60-69` の並びに追加）。
- **S2 追加**：`apps/api/src/sing.ts` に `listSingVoices()`（engineUp?→/singers→frame_decode 絞り／else curated）を export。`apps/api/src/http.ts` に `GET /sing/voices`。`apps/web/src/api.ts` に `api.singVoices()`。

### 赤テスト観点
- `sing.ts`（純）：`singHashOf` は speaker 差で別ハッシュ（既存テストがあれば温存・無ければ追加）。
- **`listSingVoices()`（S2）**：`/singers` レスポンスをモック → **frame_decode のみ返す・`type=sing`(6000) と talk を除外**・`{id,character,style}` 形。engine down 時は curated フォールバックを返す。
- `useNetaEditor.singContent()`：speaker 設定時 `{sing:{enabled:true, speaker}}`／未設定時 speaker キー無し（**後方互換 bit 一致**）。
- `MetaPanel`：歌声選択時のみ「声」ドロップダウンが出る／onChange が `setSpeaker` を呼ぶ。
- SectionEditor：job key が speaker 変更で変わる（`s:speaker`・dbab138 で既に導入済みなら回帰確認）。

### 地雷
- **列挙で engine を spawn しない**（`ensureEngine` でなく `engineUp` ping＋フォールバック）。ドロップダウンを開くたび VOICEVOX を2秒起動＝NG。
- **6000（type=sing）を声の選択肢に出さない**（query 専用モデル・frame_synthesis の正道でない）。
- **後方互換**：既定 speaker 未設定のネタは `content.sing={enabled:true}`（speaker キー無し）を維持＝既存 wav と同一に鳴る。
- 実機反映は api 再起動＋dist 焼き（restart スキル）＝声を変えても鳴らないときは engine 稼働と dist を疑う。

---

## ⑥ デザイン用Opus 要否

**不要。** 変更は既存 `<select>`＋`<optgroup>` に「声」ドロップダウンを1つ足すだけ＝新しい視覚言語もレイアウト刷新も無い（GM family グルーピングの手触りをそのまま流用）。
- 将来「声のギャラリー（アバター／波形プレビュー／お気に入り）」まで作り込むなら**そこはデザイン案件**＝backlog に切り出し、その時にデザインOpus を立てる。
- なお UI 配置（案A一段 vs 案B二段）と保存粒度（per-child 確定・"全部この声で" 一括便利ボタンを足すか）は**視覚デザインでなくプロダクト判断＝オーナー好み分岐**。

---

## 出典・実測
- `docs/research/2026-07-15-kariuta-voicevox-feasibility.md` §2（sing=6000 1体・frame_decode=81・query/synth 分離）。
- ライブ実測 2026-07-17（engine 0.25.2 @127.0.0.1:50121）：`/singers` type 集計 `{frame_decode:81, sing:1}`／同 query を 3009/3003/3065 で synth→別 wav（声色差し替えの end-to-end 確認）。
