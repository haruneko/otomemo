# 再生押下→発音までの無音区間に「生成中/読み込み中」を見せる（設計・2026-07-17）

オーナー課題：▶を押しても音が鳴るまで無音＝無反応に見える。原因は SF2 ロードと VOICEVOX 仮歌合成の2つの非同期。
本 doc は**コード変更なしの設計スペック**（実装は別 Opus エージェント）。①無音区間マップ→②見た目/配置→③状態遷移→④結線→⑤申し送り。

---

## ① 無音区間の実測マップ（押した→鳴るの分解・file:line）

▶押下（SectionEditor / NetaDialog とも同型）から発音までの直列パイプライン：

```
▶押下
 └ playPause()                SectionEditor.tsx:217 / useNetaEditor.ts:174
    ├ [W1] vocal.ensure(jobs)   useVocal.ts:44-67   ← 歌う子があり未キャッシュの時だけ。最長・数秒〜
    │       missing を**直列 for ループ**で1本ずつ：
    │         api.sing (VOICEVOX合成)  useVocal.ts:52 / api.ts:245   … RTF≈0.10（8.3s歌唱→0.83s）+ HTTP往復
    │         fetch(wav) + decodeVocal useVocal.ts:53 / audio.ts:98-103
    │       ※同一入力は api 側 content-hash で合成スキップ＝2回目以降は速い
    └ tp.playPause() → begin() → playNotes()   useTransport.ts:30-55 / audio.ts:1064
        ├ import("tone") + Tone.start()          audio.ts:1073-1074（軽微）
        ├ [W2] ensureSoundFont(…, waitIfCold=false)  audio.ts:1086 / 671-728
        │       冷（in-flight 無し）→ 即 null＝簡易シンセで**鳴る**（無音ではないが音色が違う）
        │       in-flight 有り→ #24 有界待ち ≤COLD_START_WAIT_MS=400ms (audio.ts:632) → 負けたら fallback
        │       実測：温30ms ↔ 冷13,000ms（audio.ts:631 コメント）。IndexedDB キャッシュ(audio.ts:524-)で冷は稀に
        ├ [W3] prepareDrumKits + prepareMelodicSamplers  audio.ts:1088-1090 / 906-934 / 447-491
        │       SF2 有効時のみ。初出の楽器（drum 名ごと / part:program ごと）の loadInstrument を await。
        │       並列化済(#84 S0)だが初回合成再生は歴史的実測 1〜2.5s（audio.ts:917 コメント）。**表示なし**
        └ transport.start()   audio.ts:1310 → 発音
```

**無音の主犯は W1（仮歌合成）**。W2 はフォールバック発音で「無音」ではない（音色後退のみ・既に
TransportBar「音源読込中…」で可視 TransportBar.tsx:35,75-79）。W3 は SF2 有効時の初回合成再生で体感される
サブ秒〜数秒の空白で、**現状インジケータが無い**。

### 既にある loading/pending 状態（拾える口）
| 状態 | 所在 | 現在の見た目 |
|---|---|---|
| SF2 本体ロード中 | `sfLoading` + `subscribeSfLoading`/`isSfLoading` audio.ts:643-665 | TransportBar「音源読込中…」`.sf-loading`（transport-cards.css:56） |
| 仮歌レンダ中 | `vocal.busy` useVocal.ts:32,47,62 | `.fit-report` 段落「歌声を作っています…」SectionEditor.tsx:502-504 / NetaDialog.tsx:124 ＝**▶ボタン（下端バー）から遠く、スクロールで視界外になり得る** |
| 仮歌の報告/失敗 | `vocal.msg` useVocal.ts:33,58,60 | `.fit-report` 段落（タップで消す） |
| W3 sampler 準備中 | **状態なし**（playNotes 内 await のみ） | なし |
| ▶ボタン自体 | `tp.state` は ensure 完了まで "stopped" のまま | アイコン変化なし＝「押したのに無反応」の正体 |

---

## ② 見た目と配置（推奨＋代替）

原則：既存語彙に乗せる＝**下端 TransportBar の `.sf-loading` スロット（位置表示の隣）を「単一のステータススロット」に一般化**＋**▶ボタンの busy 化**。新しい浮遊UI・トーストは作らない（過剰演出回避）。

### 推奨（A案）：▶ボタン内スピナー ＋ ステータステキスト（transport 内）
1. **▶ボタン**：pending 中は play アイコンをスピナーに差し替え、`aria-busy="true"`・opacity 0.75
   （`.proll-sing[aria-busy]` transport-cards.css:1399 と同じ弱め表現）。スピナーは既存 `@keyframes cm-spin`
   （chat.css:237,251・グローバルCSS）を流用し `prefers-reduced-motion: reduce` で animation:none（既存イディオム
   skeleton.css:152 と同じ）。押下は pending 中 no-op（二重 ensure ガード兼用・後述）。
2. **ステータステキスト**：既存 `.sf-loading` と同スタイル・同位置（`transport-time` の隣）に1本だけ、優先順位で出す：
   - `歌声を作っています… N/M`（仮歌レンダ中・最優先）
   - `音源読込中…`（SF2 本体ロード中・従来どおり）
   - `楽器準備中…`（W3 sampler 準備中・SF2有効の初回のみ・通常は一瞬）
   role="status"（aria-live=polite）。
3. **既存の `.fit-report`「歌声を作っています…」段落は撤去**（表示が transport に一本化・重複を出さない）。
   `vocal.msg`（移調/クランプ報告・失敗）は従来どおり `.fit-report` に残す（これは「読み込み中」でなく結果報告）。

モバイル幅：TransportBar は下端固定・`.sf-loading` は nowrap。`歌声を作っています… 12/16` は 375px で
undo/redo 付き（NetaDialog）だと窮屈 → **ラベルは短形「歌声 N/M…」を採用**（PC も同じ・語彙のブレを作らない）。
SF2 側は従来文言「音源読込中…」を変えない（既存テスト TransportBar.test.tsx:54-64 と検収済み文言）。

### 代替（B案）：段落は残し、▶ボタンだけ busy 化
`.fit-report` の busy 段落を残し（現状表示位置）、TransportBar には▶スピナーのみ追加。
→ 実装最小だが「押した場所（下端バー）に進捗が出ない」課題が半分残る。**オーナー好み分岐**：
- **分岐1：ステータスの置き場**＝A案 transport 内チップ（推奨） vs B案 既存段落のまま。
- **分岐2：N/M の粒度**＝「歌声 1/3…」（推奨・進んでいる感） vs 総数なし「歌声を作っています…」（静か）。

却下案：レーン上のオーバーレイ/プログレスバー（chat.css:538 `wait-bar-indet` 流用）＝再生開始のたびに
画面が動く演出は過剰。子ごとのレーン内バッジ＝どの子が合成中かまで出すのは v1 過剰（N/M で足りる）。

---

## ③ 状態遷移定義

▶押下後の pending は **UI 上ひとつの直列フェーズ列**（内部は W1→W2/W3）：

```
IDLE (tp.state=stopped)
  │ ▶押下
  ├─ 歌う子あり＆未キャッシュあり ──→ VOCAL_RENDERING (n/m)   n=完了数+1, m=missing数
  │                                       │ 全完了 or 失敗(msg へ)
  └─ それ以外 ─────────────────────────→ ENGINE_PREP
                                          │  ├ SF2 in-flight → 有界待ち≤400ms（音源読込中…は継続表示・負けたら簡易シンセ）
                                          │  └ sampler 準備 (W3) → PREPARING（楽器準備中…）
                                          ▼
                                        PLAYING (transport.start・▶→⏸・スピナー消灯)
PLAYING ⇄ PAUSED：素通し（pending に入らない・ensure はキャッシュ済）
PLAYING/PAUSED → ⏮ or 終端 onEnd → IDLE
VOCAL_RENDERING 中の▶再押下：no-op（スピナーが応答の証）。⏮/Space も同様に無視。
VOCAL_RENDERING 失敗：vocal.msg に従来どおり表示 → ENGINE_PREP へ進み伴奏は鳴らす（現挙動維持）。
```

- **N/M の意味**＝その▶押下で新規レンダが必要な job 数 m（`missing.length`）のうち処理中が n。
  キャッシュ済の子は分母に入れない（「3人歌うのに 1/1」はキャッシュ2人の意）＝「残り作業量」表示に統一。
- SF2 の `音源読込中…` は従来どおり **sfLoading の期間ずっと**出る（再生と独立・prewarm 中も）。pending 列とは
  独立のフラグだが、表示スロットは1本＝優先順位（歌声 > 音源読込 > 楽器準備）で1つだけ出す。

---

## ④ 結線設計（薄い足し方・bit一致/SSOT 維持）

方針＝**既存3つの状態源（vocal.busy / sfLoading / 新設 sfPreparing）を表示だけに使う**。再生の非同期
制御フロー（ensure→playPause、有界待ち、prepare の await 順）は一切変えない。

### 触るファイル
1. **apps/web/src/useVocal.ts**（+10行程度）
   - `const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)` を追加。
   - `ensure` の `if (missing.length)` ブロック内：ループ前に `setProgress({ done: 0, total: missing.length })`、
     各 job の `cacheRef.set` 後に `setProgress({ done: i+1, total })`、`finally` で `setProgress(null)`。
   - return に `progress` を追加。**busy/msg/cache/直列ループは不変**（progress は純粋な副チャネル）。
2. **apps/web/src/audio.ts**（+15行程度）
   - `sfLoading` リスナーイディオム（643-665）を複製して `sfPreparing` / `isSfPreparing()` /
     `subscribeSfPreparing()` を新設（listener Set・同値スキップ・例外握り潰し同型）。
   - `playNotes` の初回 prepare（1088-1090）を `setSfPreparing(true)` … `finally setSfPreparing(false)` で包む。
     `doReschedule`（走行中・既に鳴っている）と `previewNote`（1音・短命）は包まない。
     **await の追加なし＝タイミング/スケジュール bit 不変**。
3. **apps/web/src/components/TransportBar.tsx**（+15行程度）
   - 新 optional prop `pending?: string | null`（＝仮歌レンダ中のラベル。null/未指定＝従来 markup 完全一致）。
   - `tp-main` ボタン：`pending != null` で `aria-busy="true"`＋アイコンをスピナー（`<Icon name="spinner">` 新設
     または CSS 回転の span）に差し替え。onClick は pending 中 no-op（呼び出し側ガードと二重の安全）。
   - ステータススロット：`useSyncExternalStore` で `sfPreparing` も購読し、
     `pending ?? (sfLoading ? "音源読込中…" : sfPreparing ? "楽器準備中…" : null)` を1本表示。
     aria-label は既存テスト互換のため `sf-loading` を維持しつつ、pending 時は `play-pending` を使う
     （既存テスト TransportBar.test.tsx は sfLoading 単独時の文言を見る＝不変で緑のまま）。
4. **apps/web/src/components/SectionEditor.tsx**
   - `<TransportBar … pending={vocal.busy ? label : null}>`、
     `label = vocal.progress ? \`歌声 ${Math.min(vocal.progress.done + 1, vocal.progress.total)}/${vocal.progress.total}…\` : "歌声を作っています…"`。
   - `playPause`（217-220）冒頭に `if (vocal.busy) return;`（二重押下で ensure 二重発火→api.sing 重複 fetch を防ぐ。
     現状は state=stopped のままなので再押下が素通りする）。Space キー経路（223-233）も同関数なので同時に塞がる。
   - 502-504 の busy 段落を撤去（A案）。msg 段落（505-507）は残す。
5. **apps/web/src/useNetaEditor.ts / components/NetaDialog.tsx**
   - 同型：`playPause` に busy ガード、NetaDialog.tsx:108 の TransportBar に `pending` を渡し、124 の busy 段落を撤去。
   - useNetaEditor は `vocal` を返却済（NetaDialog.tsx:124 が参照）＝progress もそのまま届く。追加返却なし。
6. **apps/web/src/styles/transport-cards.css**（+10行程度）
   - `.tp-main[aria-busy="true"] { opacity: 0.75; }`・スピナー（`animation: cm-spin 0.9s linear infinite`・
     `@media (prefers-reduced-motion: reduce) { animation: none }`）。`cm-spin` keyframes は chat.css:251 に既存
     （全 css は index.css で束ねられグローバル）だが、**chat.css への依存を嫌うなら keyframes を transport-cards.css に
     複製**（名前衝突回避で `tp-spin` に改名推奨）。

### SSOT / bit一致の担保
- 仮歌キャッシュ（cacheRef）・key 設計・leadRestSec SSOT・countInBeats・pickupSchedule は**一切触らない**。
- `pending` 未指定の TransportBar は現 markup と同一（SkeletonEditor 等 他 consumer が居ても不変）。
  ※現 consumer は SectionEditor と NetaDialog の2箇所のみ（grep 確認済）。
- audio.ts の追加は通知のみ（setSfPreparing）＝スケジュール時刻・sampler 生成順に影響なし。

---

## ⑤ 実装 Opus への申し送り

### 赤テスト観点（先に書く）
1. **useVocal progress**（新規 test/useVocal.test.ts か既存 vocal 系テストへ追加）：
   `api.sing` を deferred fake（手動 resolve）に差し替え、missing 2件で
   `progress: null → {done:0,total:2} → {done:1,total:2} → null`・`busy: false→true→false` を検証。
   失敗系＝1件目 reject で `progress=null`・`msg` に失敗文言・busy=false。
2. **TransportBar pending**（test/TransportBar.test.tsx へ追加）：
   `pending="歌声 1/3…"` で (a) play-pause ボタンが `aria-busy=true` (b) `play-pending` ラベルの表示
   (c) sfLoading=true と同時なら pending が勝つ（sf-loading 文言が出ない） (d) pending=null で従来 markup（既存3テスト緑のまま）。
3. **sfPreparing 通知**（test/audio-nonblock.test.ts のイディオム＝`__setSfTestHooks` で makeSampler を遅延 fake に）：
   playNotes 実行で `subscribeSfPreparing` が true→false を1往復。SF2 無し（activeSfUrl=null）経路では発火しない。
4. **二重押下ガード**（SectionEditor.test.tsx / NetaDialog.test.tsx）：vocal レンダ中（deferred）に▶を2度押して
   `api.sing` 呼び出しが子の数ぶんだけ（重複なし）。
5. **回帰**：pending 未指定・仮歌なし経路で従来スナップショット/挙動一致（特に TransportBar と playNotes）。

### 実装順（縦スライス）
useVocal progress（テスト1）→ TransportBar pending＋CSS（テスト2）→ SectionEditor/NetaDialog 結線＋ガード（テスト4）
→ audio.ts sfPreparing（テスト3）。前3つだけでも主犯 W1 の体感は解決＝W3 は独立スライス。

### 地雷・注意
- **`vocal.busy` 中の `tp.state` は "stopped"**＝▶アイコンは play のまま。スピナーは `pending` prop 起点で出す
  （tp.state に手を入れない）。
- ensure の直列ループを Promise.all 並列化したくなるが**しない**（VOICEVOX は実質直列・N/M の意味も壊れる）。
  並列化は backlog 行き。
- ラベル文言：transport 内は短形「歌声 N/M…」。「音源読込中…」は既存テスト・検収済み文言＝変えない。
- Icon コンポーネント（components/Icon.tsx）に spinner を足す場合は既存 name 列挙の型へ追加を忘れない。
- 稼働中スタックへ反映するときは restart スキル（dist 焼き→cm-api 再起動）。UI のみなら web の再ビルドで足りる。

### 観察事項（本設計のスコープ外・backlog 候補）
- 仮歌レンダ**全滅**時：singingChildren のメロ楽器音は muted のままなのに wav が無い＝そのメロが完全無音で再生される
  （SectionEditor.tsx:417-422 と useVocal.peek の組合せ）。失敗時は mute を外して楽器で鳴らすフォールバックが筋。
- 仮歌の**先読み**（メロ編集確定時に fire-and-forget で ensure）＝▶押下時の W1 自体を消せるが、api 負荷と
  無駄合成（編集途中の中間形）のトレードオフ＝設計判断が要るので backlog。
