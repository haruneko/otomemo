# phrase_maker 取り込みアーク — 引き継ぎ書（2026-08-21・生きている間は上書き可）

新セッションはまず本書を読む。次に記憶 [[project-phrasemaker-port-arc]]。詳細は各 drafts。

## これは何
otomemo の伴奏が弱い → phrase_maker（Python 試作・ルール/物理で伴奏生成）の**音楽知識**を otomemo に取り込む。phrase_maker は開発停止・リポは残す（未 push は 2026-08-19 に push 済み）。

## 確定した設計（覆さない・正典は下記 drafts＋design.md §2106）
- **レシピ＝ジェネレーター**（ヒューマナイザーではない）・**A＝生きたレシピ**（掴み＋つまみ＋seed だけ保存・音符は毎回生成）。`rhythm` content は派生キャッシュ（正はレシピ）。
- **B1**：ノリ（もたり/前ノリ）＝演奏レイヤー・値は phrase_maker・スコアはストレート・既定 ON 非破壊。
- **掴み→生成物**（`2026-08-20-phrasemaker-recipe-io-map.md`・7 裁定）：ドラムだけ骨を「描く」（任意＝空でおまかせ）・ベース/コードは「指す」（音符は生成物）。
- **持ち場＝案C→カスケード**（`2026-08-21-arrange-data-locus.md`＋`2026-08-21-cascade-briefing-implementation.md`）：セクション＝薄い合図 cues（位置＋性格・楽器非依存）／トラック＝弾き方の語彙／resolve が合成。**統合＝内側優先スコープ（賢い指揮者を作らない）**。skeleton＝下から上・cues＝上から下の 2 本の薄い横断契約。**曲レイヤーは実装丸ごと後回し**（当面ラスサビは分家 vary で回避）。
- 契約＝`2026-08-20-phrasemaker-M0-contract.md`（ctx に `cues?: DerivedCue[]`・`fills?`＝弾き方の既定・RNG ソルト表）。計画＝`2026-08-19-phrasemaker-port-implementation-plan.md`（M0〜M5・§7 先送り一覧）。

## 実装済み・コミット済み（main 直・全緑・bit 一致で既存不変）
- **`a74363b`**：S0（`packages/music-core/cues.ts`＝Cue/DerivedCue/mergeCues/deriveCues・`rngSalt.ts`）＋ S1/S2（generate.ts で cue.bar 駆動 fill・/gen/section で deriveCues 配布・land）＋ 仕様整合＋ design.md §2106 に 3 層カスケード正準昇格。
- **`97520a4`**：M2 フィル蒸留＝phrase_maker `fills.py` 型10種（tom_descent/triplet_cascade/snare_roll/herta/gallop/buildup 等）＋`humanize.py` を TS 移植（`drumFill.ts`・`humanizeFill.ts`）。忠実度データ検証済（363 配置 event 一致＋humanize 1e-9・CPython MT19937/銀行丸め）。`generate.ts` に `fillStyle:"physical"` を additive 分岐（既定 "grid"＝従来 bit 一致）。**`bodyfill.py` は死にコード＝移植対象でなかった**。
- テスト＝music-core 244 / api 1562 緑・typecheck clean。

## 次の一手（順序厳守・慌てない）
1. **✅完了（2026-08-21・裁定B）フィルの呼び方（kind 選択）を最小で決めた**＝cue.aim でプール分け（up＝buildup/gallop/snare_roll/_32/herta・down＝tom_descent/triplet_cascade/offbeat_syncopated・未指定＝全10型＝従来 bit 一致）・プール内は seed・**明示 fillKind＞プリセット**・intensity は型選択に使わない（二重掛け回避）。選抜 kind は `rhythm.fillKind` に自己記述。**硬化させない初期割り当て**（利用で微調整）。正典＝design §2106(d)。実装＝`buildPhysicalFill`（apps/api）。テスト＝`drum-physical-fill.test.ts`（aim プール5本追加・全緑1567）。
2. **✅完了（2026-08-21）結線＝物理フィルを再生/MIDIへ流す**。`buildPhysicalFill` を grid 経路同様に **N 小節へ展開**（base groove タイル・fillBar は grid を空ける・bars=N/steps=N*grid）＝セクション合成はタイルしないので自己完結が必須。web `rhythmToNotes`（再生 Tone.js・MIDI 書き出しが収束する単一点）で `fillNotes`（絶対qb＝Note.start と 1:1）を重畳＝両経路で鳴る/書ける。到達口＝`/music/gen_drums`・MCP `gen_drums`・`/gen/section`（`drums.fillStyle:"physical"`＋任意 `fillKind`）。web UI＝TinkerSheet ドラム「細かく」内「物理フィル」トグル。正典＝design §2106(e)。テスト＝api drum-physical-fill（展開/fillKind 検証に更新）＋web music.test（fillNotes 重畳）・全緑（api1567/web1289）。実機疎通済（grid=fillNotes無し・physical=bars4/fillBar2/fillNotes載る・aim プールが /gen/section でも効く）。
3. **← 次はここ：実際の作曲で使って耳で採否**（step3）。使えるようになって初めて価値が出る＝抽象 A/B ゲート（辞書より良いか等）は置かない。オーナーが TinkerSheet の「物理フィル」トグルで生成→試聴し、型プール（aim 割り当て）や粒/強度を利用の中で微調整。

先送り（捨てない）＝計画 §7（ベース/コードの描く口・曲レイヤー・break 本実装・キメ・参照運搬・小節/レーン別案の残り・cue 配置 UI 等）。

## 効いた教訓（同じ轍を踏まない）
- **観察を確定要件に硬化させない・生成結果の優劣は使用の中でしか出ない**（辞書より良いか等の評価軸を今の段階で立てない）。
- **忠実移植はデータ一致で証明＝耳確認不要**（家族判定 A/B ゲートを置かない）。
- **反射で慌てて実装しない**（結線を呼び方の前にやりかけた／ヒューマナイザーと生成器を混同した、が過去の失敗）。
- 運用＝メインは進行役・一塊は Fable/コーディング サブエージェント。実コード検証（テスト実行・スクショ目視）は自分でやる。
- **オーナーには必ず丁寧語**（[[feedback-use-polite-japanese]]）。判断を頼む時は理由と推奨を添える。

## 検証・材料の道具（再現用）
- phrase_maker 実音レンダ＝vendored fluidsynth：`LD_LIBRARY_PATH=~/projects/phrase_maker/vendor/fluidsynth/usr/lib/x86_64-linux-gnu ~/projects/phrase_maker/vendor/fluidsynth/usr/bin/fluidsynth -ni -F out.wav <TimGM6mb.sf2> <mid>`。素材 MIDI＝`~/projects/phrase_maker/experiments/drums/fills/out/*.mid`。
- 音の聴き比べは WAV 個別送信でなく **mp3 埋め込みの試聴ページ（Artifact）**にする（`ffmpeg -ac 1 -ar 32000 -b:a 72k` で圧縮・base64 で <audio> 埋め込み）。
- スタック＝`bash scripts/restart.sh`（skill: restart）。テスト＝各 package で `npm test`。
