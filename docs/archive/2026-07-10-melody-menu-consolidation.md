# メロ生成/編集メニュー整理＋counter露出（2026-07-10）

> 状態＝計画。対象＝`apps/web/src/components/SectionEditor.tsx`。UI再編が主眼・API側のノブ定義は温存（`gen_melody` schema・`genMelody` opts・`http.ts` 透過は不変）。

## 問題

メロ生成メニューが **10個のスライダー/セレクトを無階層でベタ置き**（density/swing/expression/runs/push/humanize/foreground/breathe/phrasing/form・`SectionEditor.tsx:578-642`）＝「ノブの壁」。使用頻度に段差（density ≫ swing/expression/runs/push ≫ 残り）があるのに全部同格。加えて `counter`/`backbeat` は「bass/drums 在れば固定値0.3を自動送信」（`SectionEditor.tsx:415,420`）でユーザーが選べない。

## 決定＝案A（基本/詳細の二段）＋counterを詳細段へ露出

- **基本段（常時表示）**：density・swing・runs・expression（頻度上位）。
- **詳細段（"▸詳細"で展開・既定畳み）**：push・humanize・foreground・breathe・phrasing・form ＋ 新規 counter。
- プリセット（案B「跳ねる/走る/しっとり」）は基本段頭への**第2段階の追加**として温存。役割ドリブン（案C）はrole入力UIが別スコープゆえ今回見送り。

### counter（対位）の露出設計 ＝ 要望②の実装形

現状 `if (bass.length) { body.bass = bass; body.counter = 0.3; }`（`SectionEditor.tsx:415`）を、**詳細段の「対位（ベース回避）」ON/OFF＋弱0.2/中0.4/強0.7の3択セグメント**へ。

- **既定OFF（counter/bass を載せない）**＝「係数0で従来bit一致」の鉄則整合。現状のハードコード0.3は既定挙動を無言で変えていたので、OFF既定に戻すのが正。
- ON かつ bass在り → `body.bass=sectionBass(); body.counter={0.2|0.4|0.7}`。
- bassレーン非在時はグレーアウト（対位の相手がいない）。擬似ベース案は別件（standaloneで常に対位したい場合の将来拡張）。
- 較正根拠＝[[project-track-wiring-series]]／`2026-07-10-melody-bass-counterpoint.md`（推奨帯0.2-0.4・pitch変更2-3.5%でモチーフ反復無傷）。
- 連続スライダーでなく3択にするのは「0=無効」の意味を明確にするため。

`backbeat=0.3`固定（`SectionEditor.tsx:420`）も同型の自動配線問題だが、今回はcounterが主。ドラム3ノブ（backbeat/drumLock/converse）は「ドラム連動」小見出しへ畳む案を後続として付記。

## 段階と受入条件

1. **Step1（小）**：`gen-knobs`（:578-642）を基本段＋"▸詳細"段に分割。`detailsOpen` state 1個追加。body組み立て(:412)不変・API不変。
2. **Step2（中）**：詳細段に「対位」ON/OFF+弱中強を新設。`counter` state追加。`genPart`(:413-416)を「OFF=非送信／ON=選択強度＋bass送信」へ。bass非在でdisabled。
3. **Step3（任意）**：基本段頭に名前付きプリセット数個（web定数・state一括セット）。

**受入条件**：API契約差分ゼロ（`mcp.ts` schema・`generate.ts` opts・`http.ts` 不変）／counter OFFで同一seed bit一致／詳細段の開閉・counter OFF時body非搭載・bass非在disabled をweb component testで（既存 `aria-label` パターン踏襲）／既存aria維持で回帰なし／tsc緑・webスイート緑。

## 設計思想整合

「機械は候補/選択肢まで・仕上げは人間」「改善は選択肢/ばらつき/足場に振る」（[[project-design-philosophy-options-not-finished]]）に沿う。counterを人の選択にするのは「自動で決めない」方向そのもの。既定OFFはbit一致鉄則の副次的な是正。

## 変更集中箇所

`SectionEditor.tsx`（state:81-90・genPart:392-428・counter:413-416・knob UI:578-642）に閉じる。`mcp.ts`/`generate.ts`/`http.ts` は参照のみ・変更なし。
