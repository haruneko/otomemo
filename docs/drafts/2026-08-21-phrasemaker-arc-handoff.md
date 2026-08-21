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
1. **フィルの呼び方（kind 選択）を最小で決める**＝どの型をいつ出すか。**硬化させない**（利用の中で決まる）。位置はセクション cue・弾き方はレシピ。
2. **その後に結線**＝物理フィル（`fillNotes`＝絶対qb/GM番号）を **web の実レンダ（Tone.js／MIDI 書き出し）へ流す**＝アプリ本体で実際に鳴るようにする。**1 を飛ばして 2 を先にやると捨て配線**（2026-08-21 の反省）。
3. 使えるようになって初めて価値が出る（実際の利用の中で）。抽象 A/B ゲート（辞書より良いか等）は置かない。

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
