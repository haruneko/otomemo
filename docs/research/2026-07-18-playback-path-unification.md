# 再生経路の一本化（根治設計）— 2026-07-18

**動機（オーナー指示）**：「再生コンポーネントが複数あるのいただけない、根治として再生経路を一本化して」。
直接の症状＝ネタ帳カードの▶で仮歌（VOICEVOX wav）が歌わない（メロ単体カード・sectionカード両方）。原因はカード再生経路が仮歌サブシステムを丸ごと素通りしているため。だがこれは**クラスバグ**＝「再生ペイロードを各所が手組みしている」構造の一症状であり、個別パッチでは再発する。本docはその根治＝**再生経路の一本化**の設計。

関連正典：design.md #24（再生開始の非ブロック契約）・#25（弱起の再生契約）・docs/research/2026-07-16-vocal-consonant-countin.md（子音カウントイン）・backlog.md「FormStrip つなぎ試聴が仮歌を通していない」（片付け節・2026-07-17 F1監査#5）。

---

## 1. 現状マップ（全再生エントリポイント・実コード検証済み）

`playNotes(...)` の呼び出し式は **10箇所**（事前分析の「9箇所」は1つ過少＝Chat が2箇所あるため。トランスポート1＋素通し9が正確）。他に単発試聴 `previewNote` 系が7ファイル（別プリミティブ・§7参照）。

| # | 呼び出し箇所 | ペイロード組み立て | vocal | feel | compound | mute処理 | UX種別 |
|---|---|---|---|---|---|---|---|
| 1 | `useTransport.ts:36`（begin→playNotes） | 呼び出し側の `getNotes()` | ✅ `getVocal?.()`（:43） | ✅ | ✅ | 呼び出し側 | フルトランスポート（play/pause/loop/range/playhead/lens） |
| 1a | └ consumer `useNetaEditor.ts:182` | `playableFinal`（:156-175 kind別解決＋sing時muted） | ✅ jobs=`buildVocalJob`（:43-56）・ensureラッパ:191-195 | ✅ | ✅ | ✅ 歌うメロをmuted（:175） | エディタ |
| 1b | └ consumer `SectionEditor.tsx:211` | `playComposite()`（:414-430） | ✅ jobs=`singingJobs`（:180-206 ensemble込）・ensureラッパ:217-221 | ✅ sectionFeel（:433-436） | ✅ | ✅ 歌う子のmelodyをmuted（:423）＋レーンmute＋骨格耳 | エディタ |
| 1c | └ consumer `SkeletonDesk.tsx:315` | `stageAllNotes`（レンズ印つき） | ❌（渡していない） | ❌ | ❌ | レンズゲート | 机（無停止A/B・range） |
| 2 | `components/NetaList.tsx:98`（カード▶） | melody=`notesForContent`（:174）／section=`sectionNotes()`=生`compositeNotes`（:113-116） | ❌ **←今回のバグ** | ✅ :100 | ✅ :101 | ❌（歌う子も楽器で鳴る） | トグル（▶/⏹・starting窓:75） |
| 3 | `usePlacePicker.ts:133`（配置前試聴） | `notesForContent` | ❌ | ❌ | ❌ | ❌ | ワンショット（次試聴で止める） |
| 4 | `useMelodyGen.tsx:454`（候補トレイ試聴） | `notesForContent`（未保存候補） | ❌ | ❌ | ❌ | ❌ | ワンショット |
| 5 | `components/Chat.tsx:62`（toolカード候補試聴） | `notesForContent`（key:0固定・bpm120固定） | ❌ | ✅ | ❌ | ❌ | ワンショット（auditioning:57） |
| 6 | `components/Chat.tsx:454`（保存済ネタ試聴） | `notesForContent`（実key/tempo） | ❌ | ✅ | ✅ | ❌ | ワンショット（previewing:446） |
| 7 | `components/FormStrip.tsx:272`（遷移試聴） | `transitionWindowNotes(compositeNotes(...))`（:269） | ❌ **←backlog既載** | ❌（歌以前にfeelも欠落） | ❌ | ❌ | ワンショット（タイマー自前:275） |
| 8 | `components/SkeletonEditor.tsx:279`（叩き台試聴） | `skeletonPlaybackNotes` | ❌（歌う対象なし） | ❌ | ❌ | — | ワンショット |
| 9 | `components/StudyView.tsx:50`（研究ループ試聴） | `notesForContent("chord_progression")` bpm100固定 | ❌（歌う対象なし） | ❌ | ❌ | — | トグル |
| 10 | `components/AnalysisWorkbench.tsx:234`（音源解析再生） | 自前`buildNotes(seek)`（:202-218 メロ+コード+クリック） | ❌（対象なし） | ❌ | ❌ | — | トグル（自前rAFプレイヘッド:219-225） |

**検証で確定した事実**：

- `playNotes` の vocal 契約は `PlayOpts.vocal?: VocalPlay[] | null`（audio.ts:61-70）。未指定/空＝仮歌経路を一切触らない bit-safe 設計（audio.ts:1176-1177, 1203-1236）。カウントイン・弱起・muted除外（:1193-1194）は **playNotes 内に閉じている**＝入口さえ vocal を渡せば全経路で正しく効く。土台は既に一本化されている。**割れているのはその手前＝ペイロード組み立て層**。
- エディタ2箇所の playPause ラッパ（`useNetaEditor.ts:191-195` と `SectionEditor.tsx:217-221`）は**逐語的に同一ロジック**（busy中no-op→stopped時ensure→tp.playPause）＝重複実装。
- 仮歌 wav キャッシュは `useVocalRender` の **フックインスタンス毎の ref**（useVocal.ts:31）＝エディタで歌わせた直後でも、カードで鳴らせば別インスタンス＝再レンダが要る（サーバ側 content-hash で合成はスキップされるが fetch+decode は再走）。
- 「単一Transport」は playNotes 冒頭の `transport.stop(); transport.cancel(0); disposeKit()`（audio.ts:1104-1107）で**音響上は**保証される。しかし各サイトが独自に `handleRef`＋`playing` state を持つため、**古いハンドルの stop() がグローバル transport を殺す**（audio.ts:1322-1336 は自分が現行かを知らない）：カードA再生→カードB再生（Aの音は消えるがAのUIは⏹のまま）→Aの⏹を押す→**Bの再生が止まる**（disposeKit がBのkitを破棄）。stale-handle が現行再生を殺すクラスバグが潜在。
- 書き出しコンポジット（`compositeNotes` music.ts:616-687）は unmuted のまま MIDI 書き出し（SectionEditor.tsx:440-449 laneTracks）が使う。再生コンポジット（playComposite）との分離は既に存在し、**維持必須**。
- `music.ts:1159` の `export * from "./audio"` により純ドメイン module が副作用 module を丸ごと再輸出＝NetaList等が `../music` から playNotes を import できてしまう（S5アーキ是正の趣旨＝audio.ts:1-3 に反する漏れ）。
- `transitionWindowNotes`（formPlan.ts:58-74）はスプレッドで全フィールド保持＝syllable もマーカーも窓切り出しを生き残る（§2の設計が FormStrip に自然適用できる根拠）。

## 2. 根治アーキテクチャ

### 方針：2層＋1機構

```
[純ドメイン層 music.ts]   buildPlayback(...) → PlaybackPlan     …ペイロード解決（唯一）
[駆動層 playback.ts(新)]  startPlayback(plan, opts) → Handle    …ensure→playNotes（唯一のチョークポイント）
[機構]                    歌唱マーカー付きノート（notes 内で「誰がどの声で歌うか」を運ぶ）
```

エントリポイントは「plan を作る→driver に渡す」だけになり、vocal/feel/mute/compound の欠落は**構造的に起こせなくなる**。

### 2.1 機構：歌唱マーカー（sungBy）

事前分析案は `buildPlayback(neta,{tree?})` が vocalJobs を別立てで返す形だったが、検証の結果 **FormStrip の窓切り出し**（合成→transitionWindowNotes→再生）が別立てだと破綻する：合成後の Note[] からは「どの子がどの speaker で歌うか」が消えており、窓に合わせた vocal job を組めない。そこで**ノート自身に歌唱情報を積む**：

```ts
// music.ts Note に加算 optional（lens/part/muted と同型の再生用印。保存contentには書かない）
interface Note {
  ...
  sungBy?: { singer: string; speaker?: number }; // singer=歌う子の識別子（単体は "self"）
}
```

- **付与**：再生用コンポジット解決時に、歌う子（kind=melody・sing.enabled・歌詞あり＝現行 SectionEditor.tsx:184-189 の判定そのまま）の melody ノートへ `sungBy` を付け、同時に `muted:true`（現行 :423 と同じ）。単体メロは playable 解決時（現行 useNetaEditor.ts:173-175 相当）。
- **回収**：`vocalJobsOf(notes: Note[], bpm): VocalJob[]`（純関数）が sungBy でグループし、ensemble 音高（全 singer の結合＝現行 :191-192 のA仕様）・key（JSON of {n,t,e,s}＝現行 :197 と同型）・firstNoteBeat を組む。`buildVocalJob`（useNetaEditor.ts:43-56）と `singingJobs` 組み立て（SectionEditor.tsx:180-202）はこれに吸収され両ファイルから消える。
- **利得**：ノート列を**どこでどう切っても**（FormStrip の窓・将来の部分再生）マーカーが生き残り、その切片から正しい vocal job が再導出できる。muted 除外（audio.ts:1193）も従来どおり効く。
- **key 形式の統一**：単体エディタの key は現行 {n,t,s}（useNetaEditor.ts:50）、Section は {n,t,e,s}（SectionEditor.tsx:197）。{n,t,e,s} に統一（単体は e=自分の音高列）。セッション内キャッシュが一度無効になるだけで、サーバ側は content-hash 合成スキップ（useVocal.ts:57）が効くため実害なし。

### 2.2 解決層（純・music.ts）：buildPlayback

```ts
export type PlaybackSource =
  | { kind: "neta"; neta: { kind; content; key?; mode?; tempo?; meter? } }             // 単体（カード/Chat/ピッカー）
  | { kind: "tree"; children: CompositeChild[]; key: number; mode?: string | null;    // 合成（sectionカード/FormStrip）
      tempo: number; meter?: string | null; lanesMuted?: string[] }
  | { kind: "notes"; notes: Note[]; tempo: number; meter?: string | null };           // 手組み（AnalysisWorkbench等の素通し口）

export interface PlaybackPlan {
  notes: Note[];        // 歌うメロは sungBy+muted 済み。歌なし＝現行と bit 一致（マーカーもmutedも付かない）
  bpm: number;
  program?: number;     // 単体kindの既定音色（合成は per-note program 済＝undefined）
  feel?: Feel | null;   // feelOf(content) / sectionFeel 相当を内部で解決
  compound?: boolean;   // isCompoundMeter(meter)
  vocalJobs: VocalJob[];// vocalJobsOf(notes,bpm)。[]＝仮歌なし＝レガシー完全一致
}

export function buildPlayback(src: PlaybackSource, opts?: { vocal?: boolean }): PlaybackPlan;
```

- **再生コンポジット vs 書き出しコンポジットの分離を型で固定**：`buildPlayback({kind:"tree"})` の内部は `compositeNotes`＋（レーンmute・歌う子mute・sungBy付与）＝現行 playComposite（SectionEditor.tsx:414-430）の骨格/レンズ以外を吸収した `playbackComposite()`。**`compositeNotes` 本体（music.ts:616）は一切触らない**＝MIDI 書き出し（laneTracks/downloadMidi・blockPreviewNotes SectionEditor.tsx:275-279）は unmuted・マーカー無しのまま。
- `opts.vocal === false`＝sungBy を付けない＝mute もしない＝完全ドライ（試聴系のオプトアウト）。既定 true。
- エディタ固有の重ね物（SectionEditor の骨格耳 skelEar・SkeletonDesk のレンズ印/ステージ合成）は **plan の notes への後段デコレータ**として各エディタに残す（共有コアへは持ち込まない）。plan.notes を受けて足す/差し替えるだけなので vocal/mute とは直交。

### 2.3 駆動層（副作用・新 module `apps/web/src/playback.ts`）：startPlayback

```ts
export type VocalMode = "ensure" | "peek" | "off";
// ensure＝未レンダをレンダしてから鳴らす（1〜3s待ち・busy可視化）＝カード/エディタ
// peek  ＝レンダ済みだけ歌う・絶対に待たない＝高速試聴系（#24 非ブロック契約の仮歌版）
// off   ＝歌わない（planのmutedはunmuteして楽器で鳴らす）

export async function startPlayback(
  plan: PlaybackPlan,
  opts?: { vocalMode?: VocalMode;            // 既定 "ensure"
           loop?: {startBeat;endBeat}; onEnd?; activeLens?; range? }, // playNotes へパススルー
): Promise<PlaybackHandle>;
export function stopPlayback(): void;        // 現行再生の停止（所有サイト不問）
export function subscribeVocalBusy(cb): unsubscribe;  // 「歌声を作っています…」通知（sfLoading と同型 audio.ts:643-665）
```

契約（＝唯一のチョークポイント）：

1. **wav キャッシュを module スコープへ**（SF2 の sfBufCache/sfDrumCache 方式・audio.ts:372, 511 と同型）。`ensureVocal(jobs)`/`peekVocal(jobs)` を playback.ts に置き、`useVocalRender`（useVocal.ts）は busy/progress/msg の**購読フック**に痩せる（cacheRef 撤去）。→ エディタで歌わせた wav がカード/FormStrip でも即時再利用される。in-flight 共有で同 key の二重 api.sing も構造的に防ぐ。
2. `startPlayback` は `vocalMode` に応じ ensure/peek→`playNotes(plan.notes, plan.bpm, {program, feel, compound, vocal, ...})` を呼ぶ。**web内で playNotes を呼んでよいのは playback.ts と useTransport（→S3で playback.ts 経由化）だけ**（§4 S5 で敷居を敷く）。
3. **現行ハンドルレジストリ（stale-stop 根治）**：module 変数 `current` に世代トークンを持ち、返す Handle をラップ＝`stop()` は自分が現行の時だけ実 stop、代替わり済みなら no-op（＋`onPreempted` 通知で旧サイトの ⏹ 表示を戻せる）。§1 の「Aの⏹がBを殺す」バグをクラスごと潰す。
4. **二重発火ガード**：vocal ensure 進行中の再 start は no-op（現行の各所 starting/auditioning/previewing フラグの意味論を driver に集約。表示用フラグは各サイトに残ってよい）。
5. ensure 失敗（VOICEVOX 不通等）＝現行どおり msg 通知＋レンダ済み分のみで再生（useVocal.ts:65-73 の意味論を維持）。改善オプション（任意・別スライス）：jobs があるのに 1本も鳴らせない場合は muted を解除して楽器フォールバック（現行は歌うメロが無音になる既知の粗）。既定は現行維持＝bit-parity 優先。

### 2.4 エディタのトランスポートとの関係

- `useTransport` は**そのまま存続**（state 機械・playhead・loop/range/reschedule/lens は編集画面固有の関心＝共有コアに混ぜない）。変更は2点だけ：
  1. begin の `playNotes(...)` 直呼び（useTransport.ts:36-48）を `startPlayback(plan, {…})` 経由へ（ハンドル互換＝PlaybackHandle は不変）。
  2. 入力を `getNotes+getVocal` の2本から `getPlan: () => PlaybackPlan` の1本へ。**begin 内で vocalMode:"ensure" が効く**ため、useNetaEditor.ts:191-195 と SectionEditor.tsx:217-221 の同文ラッパは**両方削除**（busy は subscribeVocalBusy を TransportBar/PrepStatus が購読）。
- `usePlayhead`・TransportBar・Space キー結線は不変。SkeletonDesk の reschedule/setLensGain/range も Handle パススルーのまま不変。

## 3. 各サイトの移行後の姿

| サイト | 移行後 | vocalMode | 効果 |
|---|---|---|---|
| useNetaEditor（1a） | `getPlan=()=>buildPlayback({kind:"neta",…})`＋骨格等のkind分岐はplan内へ。ensureラッパ削除 | ensure | 挙動不変（重複解消）。buildVocalJob/muted手組みが消える |
| SectionEditor（1b） | `getPlan=()=>decorateSkel(buildPlayback({kind:"tree",…,lanesMuted}))`。singingJobs/ensureラッパ削除 | ensure | 挙動不変。骨格耳はデコレータで残す |
| SkeletonDesk（1c） | `getPlan` 化（stageAllNotes を {kind:"notes"} で包む） | off（当面） | 挙動不変。机で歌わせるかは将来のオーナー判断（offフラグ1つ） |
| **NetaList カード▶**（2） | melody/section とも `startPlayback(buildPlayback(...))`。sectionNotes の生 compositeNotes を tree ソースへ | **ensure** | **仮歌バグ根治**（歌う子はmuted＋wav同期再生）。starting スピナー窓（:75-90）に vocal busy が自然に乗る＋PrepStatus 系で「歌声を作っています…」表示 |
| usePlacePicker 試聴（3） | resolver+driver | **peek** | 待たせない。エディタで鳴らした後ならカードでも歌う。feel/compound 欠落も直る |
| useMelodyGen 候補試聴（4） | resolver+driver | peek | 候補は sing 設定を持たない＝実質ドライ（自然に jobs=[]） |
| Chat toolカード試聴（5） | resolver+driver | peek | 同上（key:0/bpm120 の現行値は維持） |
| Chat 保存済ネタ試聴（6） | resolver+driver | **ensure** | 歌う設定のネタは Chat 試聴でも歌う（previewing 窓:446 が待ちを吸収） |
| **FormStrip 遷移試聴**（7） | `transitionWindowNotes(buildPlayback({kind:"tree"}).notes, …)` → `{kind:"notes"}` で再planし driver へ。窓切片の sungBy から窓専用 vocal job が再導出される | ensure | **backlog項目（FormStrip仮歌欠落）が構造の帰結として解消**。feel 欠落も同時に直る。窓 wav は短い＝レンダ軽い＋content-hash キャッシュ |
| SkeletonEditor 叩き台（8） | resolver+driver | off | 挙動不変（骨格に歌う対象なし） |
| StudyView（9） | resolver+driver | off | 挙動不変 |
| AnalysisWorkbench（10） | `{kind:"notes"}` ソースで driver へ（buildNotes は固有＝残す） | off | 挙動不変（自前プレイヘッドも当面残置） |
| previewNote 系（PianoRoll:148 等7ファイル） | **対象外**（Transport 非使用の単発入力FB・audio.ts:1019-1056）。現状維持を明記 | — | — |

## 4. 移行スライス（SDD/TDD）

鉄則ガードレール（全スライス共通・テスト先行）：
- **G1 bit一致**：歌わないソースについて、`buildPlayback(...).notes / program / feel / compound` が現行の各サイト手組みペイロードと**深い等値**（フィクスチャ：単体メロ・相対bass・chord_pattern・rhythm・section合成・レーンmute・6/8・弱起）。vocalJobs=[]。
- **G2 書き出し不変**：`compositeNotes` のスナップショット不変＋laneTracks/downloadMidi が muted/sungBy を一切含まないこと。
- **G3 仮歌等値**：歌うフィクスチャで `vocalJobsOf(plan.notes)` が現行 singingJobs（ensemble/firstNoteBeat/speaker）および単体 buildVocalJob と等値（key 形式差は §2.1 の統一仕様で吸収）。

- **S0（SDD）**：design.md に #27 を起票（§6 の文面）。backlog.md の FormStrip 項目に「#27 S4 で解消予定」を追記。
- **S1（純関数・赤→緑）**：music.ts に `sungBy` 型・`playbackComposite`・`vocalJobsOf`・`buildPlayback` を**追加のみ**（既存経路は未接続＝挙動ゼロ変更）。G1/G2/G3 のテストを先に書く。
- **S2（駆動層）**：`playback.ts` 新設＝module wav キャッシュ・ensure/peek・startPlayback・現行ハンドルレジストリ・busy 通知。useVocal.ts は購読フックに縮退。テスト＝playNotes をモックし（__setSfTestHooks 方式・audio.ts:759）ensure→play 順序・peek 非待機・stale-stop no-op・二重発火 no-op。
- **S3（エディタ切替＝挙動不変）**：useTransport を getPlan 契約へ。useNetaEditor / SectionEditor / SkeletonDesk を resolver 経由に差し替え、同文 playPause ラッパ2つと singingJobs/buildVocalJob の現地版を削除。web 既存テスト全緑＋G1 実配線で再確認。
- **S4（素通し9サイトの移行＝ここで直る）**：NetaList（**仮歌カードバグ解消**）→ FormStrip（**backlog項目解消**）→ Chat×2 → usePlacePicker → useMelodyGen → SkeletonEditor → StudyView → AnalysisWorkbench。各サイト1コミット・vocalMode は §3 の表どおり。カード▶に「歌声を作っています…」（subscribeVocalBusy→PrepStatus 系）を接続。
- **S5（封鎖と検収）**：`music.ts:1159` の `export * from "./audio"` を明示再輸出（型・previewNote 等）へ絞り、**playNotes は playback.ts 以外から import 禁止**（ESLint no-restricted-imports か export 面の縮小）。死んだ手組みコード掃除。実機検収＝カード▶（メロ/section）で歌う・エディタ回帰・FormStrip 遷移で歌う・stale-stop 再現手順が no-op になること（要 dist 焼き＋api 再起動＝restart スキル）。

kariuta カードバグと FormStrip backlog は**独立パッチではなく S4 の帰結**として閉じる（同じ resolver+driver を通した瞬間に直る）＝再発防止込みの根治。

## 5. リスク / トレードオフ

- **単一トランスポート契約の変質**：ハンドルレジストリ導入で「古い stop が現行を殺す」挙動が no-op に変わる。現行挙動に依存した箇所は無い（各サイトは自分の再生を止める意図でしか stop を呼ばない）が、エディタ unmount 時の停止（useTransport.ts:112・NetaList.tsx:78）は「自分が現行の時だけ止まる」＝意図どおり動くことを S2 テストで固定する。
- **1〜3秒の wav レンダ待ち UX**：カード ensure は待ちが発生（初回のみ・以後は module キャッシュ＋サーバ content-hash）。busy 可視化（starting スピナー＋「歌声を作っています…」）と再押下 no-op で受ける。試聴系は peek＝**絶対に待たない**（#24 の非ブロック思想の仮歌版）。peek の含意＝「一度も歌わせていないネタの試聴は楽器で鳴る」＝表示なしだと『歌わないバグ』に見えるリスク → 試聴UIには出さない選択を明記（待たない方を優先・オーナー耳確認で再調整可）。
- **muted＋レンダ失敗＝メロ無音**：現行仕様の踏襲（エディタも同じ）。§2.3-5 の楽器フォールバックは挙動変更なので既定 OFF・オーナー判断で別スライス。
- **vocal key 統一によるセッション内キャッシュ一回無効**：実害なし（サーバ側 hash が吸収）。
- **buildPlayback の肥大リスク**：kind 分岐（相対bass解決・chord_pattern・skeleton プレビュー等）は既に notesForContent（music.ts:584-604）に集約済み＝resolver はその上の薄い層に留める。エディタ固有の重ね物をデコレータとして**外に置く**規律を design #27 に明記（混ぜたら負け）。
- **回帰面積**：S3/S4 は接触ファイルが多い。1サイト1コミット＋G1 スナップショット＋既存 web テスト（520+）で刻む。実機耳確認（歌・スイング・弱起・カウントイン）はオーナー手番として残タスク化。

## 6. design.md への落とし方（新 #27・貼り付け用文面）

現行 design.md の最終番号は #26（コード進行エディタ・design.md:2071）＝次番号 #27。

```markdown
## #27 再生経路の一本化（PlaybackPlan＋単一ドライバ）（2026-07-18・オーナー指示「根治として一本化」）

**問題**：playNotes 呼び出しが10箇所に散り、各所がペイロード（notes/feel/compound/仮歌/mute）を手組み
していた。仮歌を結線していたのはエディタ経路のみ＝ネタ帳カード▶で歌わない（クラスバグ）。

**決定**：再生は2層に一本化する。
1. **解決層（純・music.ts）** `buildPlayback(source) → PlaybackPlan {notes, bpm, program, feel,
   compound, vocalJobs}`。歌う子の melody ノートには **sungBy マーカー＋muted** を付け、
   `vocalJobsOf(notes)` が任意のノート切片（FormStrip の窓切り出し含む）から vocal job を再導出する。
   **書き出しコンポジット（compositeNotes）は不変・unmuted**＝MIDI 面に再生都合を混ぜない。
2. **駆動層（playback.ts）** `startPlayback(plan, {vocalMode: ensure|peek|off, …})` が唯一の
   チョークポイント＝wav キャッシュ（module スコープ・SF2 と同方式）→ ensure/peek → playNotes。
   現行ハンドルレジストリで stale な stop() を no-op 化（別サイトの再生を殺さない）。
   busy は subscribeVocalBusy（sfLoading と同型）で可視化。

**規律**：playNotes を直接呼んでよいのは playback.ts（と経由する useTransport）のみ。エディタ固有の
重ね物（骨格耳・レンズ・自前プレイヘッド）は plan への後段デコレータとして各エディタに置く。
vocalMode＝カード/エディタ/Chat保存済は ensure（待ちは busy 表示）、高速試聴（ピッカー/候補/toolカード）は
peek（絶対に待たない・#24 の仮歌版）、歌う対象が無い面は off。
previewNote（単発入力FB）は Transport 非使用の別プリミティブ＝対象外。

**帰結**：カード▶の仮歌バグと FormStrip 遷移試聴の仮歌欠落（backlog）はこの一本化の副産物として解消。
正典＝docs/research/2026-07-18-playback-path-unification.md（現状マップ・移行スライス S0〜S5・ガードレール）。
```

## 7. 残しておくもの（意図的スコープ外）

- `previewNote` 系（PianoRoll.tsx:148,359・BassStepEditor.tsx:73・RhythmEditor.tsx:49・ChordPatternEditor.tsx:64・SkeletonEditor.tsx:161,453・SkeletonDesk.tsx:464・SoundFontSettings.tsx:18-26）＝Transport を使わない低遅延の単発入力フィードバック（audio.ts:1019-1056）。一本化の対象はトランスポート再生のみ。
- AnalysisWorkbench の自前 rAF プレイヘッド（:219-225）と StudyView の固定 bpm100 ＝固有 UX として当面残置（driver 経由化のみ）。
- SkeletonDesk で歌わせるか＝将来のオーナー判断（vocalMode フラグ1つで開けられる状態にして終える）。
