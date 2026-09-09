# phrase_maker 取り込みアーク — 引き継ぎ書（最終更新 2026-09-09・生きている間は上書き可）

新セッションはまず本書を読む。次に記憶 [[project-phrasemaker-port-arc]]。詳細は各 drafts と design §2106。

## これは何
otomemo の伴奏が弱い → phrase_maker（Python 試作・ルール/物理で伴奏生成）の**音楽知識**を otomemo に取り込む。
phrase_maker は開発停止・リポは残す（未 push は 2026-08-19 に push 済み）。

## マイルストーンの現況（計画＝**`2026-09-09-phrasemaker-port-master-plan.md` v3 §5-1/§5-2**）
**2026-09-09 に割り直した**：M0〜M3 の番号は活かし、**M4 以降を作り直した**（旧 `2026-08-19-…-implementation-plan.md`
の M4＝ギター/アンサンブル・M5＝ピアノ は、向こうの全体 5.6 万行を見ずに割ったものだった＝マスタープラン §5-1）。

| | 内容 | 状態 |
|---|---|---|
| M0 | 契約凍結＋カスケード S0 | **完了** |
| M1 | 最簡ドラム端から端まで＋カスケード S1/S2 | **完了** |
| M2 | ドラム本実装（蒸留） | **完了・耳判定も通過（2026-08-30）** |
| M3 | **ベース**（3g py-parity → 3a anchorLock → 3b chord_follow ガード → 3c grammar セル辞書化 → 3d JZ-WALK → 3e 指板検証） | **着手中**（合図応答＝land／respondToCues 完了・棚卸し済み。**3g＋3a 完了 2026-09-09**＝py-parity 110件一致・anchorLock 第三経路が4口から。残＝3b/3c/3d/3e） |
| M4 | **検証器（横断・M3 と並行）**＝band_overlap／四肢衝突のグルーヴ全体版／coverage／microtiming／決定論の grep ゲート／ゲート型の強制 | 着手可（裁定不要） |
| M5 | **ギター**（chug ロック・chordfollow・riff 3文法・Tuning/フォーム DB・handshape 枠）＋並行して **RNG spike**（3g 依存） | M3 の後 |
| M6a | **鍵盤・裁定不要の土台**（legacy/build_rock 刺し・`band?:{bassTop}` 契約凍結・低域譲り・handmodel） | 着手可（裁定不要） |
| M6b | 鍵盤・p11 の耳付き知識（容器 DSL・KNOBS 12セル・軌跡・`_grade_slots`） | **§8-2 の裁定待ち** |
| M6c | 鍵盤・handframe／オルガン／p14 live（プランB判断点） | **§8-2 の裁定待ち** |
| M7 | ケルト（ジグ／リールで分けて裁定） | **§8-1 の裁定待ち** |

**着手可否**＝M3・M4・M6a は今すぐ着手可。M5 は M3 の後。M6b・M6c・M7 はオーナー裁定待ち（マスタープラン §8）。

**番号の注意**：身体シミュレータ（`bodyFill.ts`）は **M2 の続き**であって計画の M3 ではない。
一時期 design とコメントで「M3＝身体シミュレータ」と書いていたが 2026-09-04 に訂正済み。**M3 はベース。**

## 確定した設計（覆さない・正典は design §2106 と各 drafts）
- **レシピ＝ジェネレーター**（ヒューマナイザーではない）・**A＝生きたレシピ**（掴み＋つまみ＋seed だけ保存・音符は毎回生成）。
- **B1**：ノリ（もたり/前ノリ）＝**演奏レイヤー・スコアには焼き込まない**。2026-08-29 に結線完了（下記）。
- **掴み→生成物**（`2026-08-20-phrasemaker-recipe-io-map.md`）：ドラムだけ骨を「描く」（任意）・ベース/コードは「指す」。
- **持ち場＝案C→カスケード**（`2026-08-21-arrange-data-locus.md`＋`2026-08-21-cascade-briefing-implementation.md`）：
  セクション＝薄い合図 cues／トラック＝弾き方の語彙／resolve が合成。**統合＝内側優先スコープ**（賢い指揮者を作らない）。
  **曲レイヤーは実装丸ごと後回し**（当面ラスサビは分家 vary で回避）。
- **B3（GMD 統計の持ち込み）＝裁定済み 2026-08-29＝持ち込む**。CC BY 4.0 は表示と改変明示のみが義務・非コピーレフト。
- **B6（型辞書と生成器の終着）＝裁定済み 2026-08-30＝併存（吸収しない）**。「生成が上位互換だから辞書を畳む」はしない。

## M2 で最終的に何ができたか（＝いま使えるもの）
ドラムのフィルの作り方が**3つ**あり、UI の3択がそのまま正準（design §2106(e)(i)）。

1. **型から選ぶ（従来）** ＝ otomemo の `FILL_TYPES` を譜面の16分格子に置く。既定。
2. **型から選ぶ（32分・フラムも）** ＝ `fillStyle:"physical"`。phrase_maker `fills.py` の固定10型を
   note レベル（絶対qb）で `fillNotes` に載せる＝格子に収まらない粒を持てる。
3. **生成する（毎回ちがう）** ＝ `fillStyle:"body"`。`bodyFill.ts`＝phrase_maker `bodyfill.py` の忠実移植。
   型を引かず、両手の経路をビーム DP で毎回解く。**型の在庫という上限が無い。**

補助のつまみ＝**フィルの行き先**（`bodyDepth`）・**実ドラマーの癖**（`bodyDrummer`＝GMD 統計の人／`"none"` で純物理）。
到達口＝`/music/gen_drums`・MCP `gen_drums`・`/gen/section`・web UI の**4口すべて**。
**ノリ**＝`content.feel` に載る（スコアはストレート）。body 経路のみ既定 `humanize: 0.5`。

## 効いた教訓（同じ轍を踏まない・ここが本書のいちばんの価値）
- **引き継ぎ書の誤記は実装漏れになる。** 「`bodyfill.py` は死にコード」と誤って書いたせいで、
  phrase_maker の芯（676行の身体シミュレータ）が M2 で丸ごと移植から漏れた。
  **「使われていない」と「移植しなくてよい」は別**。opt-in のエンジンは呼ばれていなくても生きている。
- **忠実移植はデータ一致で証明する＝耳確認は不要**（配置イベント一致・246/246・監査の抜き打ち 86/86）。
  逆に**「良いか」は耳でしか決まらない**＝抽象 A/B ゲート（辞書より良いか等）を先に立てない。
- **源流の「デモ」と「常用形」を混同しない。** 一律「末尾1拍」は `_kinds_tour_fills`＝全型を機械的に並べる
  巡回デモの値で、musical デモは型ごとに長さを変えていた。**根拠にする前にどのデモか確かめる。**
- **丸めた値で時間軸を計算しない。** `beatsPerStep` は round3 済み（三連＝0.333）。これで qb を敷くと
  小節をまたぐほどずれる。実際に「フィル開始点の打が消し残って二重に鳴る」バグになった。**正準値を復元して使う。**
- **作ったのに触れないノブは硬化。** 関数に生えていても HTTP/MCP から渡せなければ無いのと同じ。
  **通知も同じ**＝UI にだけ出すと MCP（Chat 入口）から聞こえない。
- **通知が嘘をつくのがいちばん悪い。** 「テンプレートから選択しました」を、実際には何も鳴っていない
  ケース（5/4・7/8）でも出していた。落ち先で言い分ける。
- **受け入れ監査を独立で立てると効く。** 上流から下流まで見る役を別に立てたら、現物のバグ1件＋
  到達不能3件＋doc 乖離2件が出た。主張（○○件一致）は**抜き打ちの別条件で検算させる**。
- **観察を確定要件に硬化させない。** ノリ既定 0.5 は「0.25 との差が判別できなかったので上げた」暫定値。
  **判別できなかったという事実ごと**記録する（でないと次の人が確定値だと思う）。
- 運用＝メインは進行役・実装は難易度で Sonnet/Opus/Fable を振り分け。**他者の報告は実コードで裏取り**
  （今回も監査報告の型数に誤りが1件あった＝down は6型でなく5型）。
- **オーナーには必ず丁寧語**（[[feedback-use-polite-japanese]]）。判断を頼む時は材料と推しを添える。

## 検証・材料の道具（再現用）
- **Python 参照の走らせ方**：venv＝`~/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python`。
  `sys.path` に `~/projects/phrase_maker` → `/core` → `/experiments/drums/src` → `/experiments/drums/fills/src`
  の順で insert（**最後が最優先**。順序を間違えると別の `fills` を掴んで `AttributeError`）。
- **実音レンダ**：vendored fluidsynth＝
  `LD_LIBRARY_PATH=~/projects/phrase_maker/vendor/fluidsynth/usr/lib/x86_64-linux-gnu ~/projects/phrase_maker/vendor/fluidsynth/usr/bin/fluidsynth -ni -g 0.8 -F out.wav <sf2> <mid>`。
  **アプリと同じ音にするなら sf2 は `data/assets/2041d1d2-51c1-4c81-9e68-aba10404883d.sf2`**（32MB）。
- **試聴帳**＝mp3 埋め込みの Artifact（`ffmpeg -nostdin -ac 1 -ar 32000 -b:a 72k`。
  `-nostdin` を忘れるとループの stdin を食って一部が焼かれない）。
  **ノリを聴かせるなら `applyFeelEnsemble` を通してから MIDI へ焼く**（スコアはストレートなので通さないと出ない）。
- スタック＝`bash scripts/restart.sh --build`（skill: restart）。テスト＝各 package で `npm test`。

## 次の一手
**M3＝ベースの本体**（計画 §3）。掴みは「指す」＝コード進行（`ctx.chords`・slashBass 込み）＋役割/スタイル＋
**ドラムレシピの skeleton** を読んで縦が噛み合うこと（結合をアンサンブルまで先送りしない）。

**M3 で済んだところ（2026-09-04・`30c8749`）**＝カスケード §3-1 の表を完結＝ベースが合図に応える。
`fill`（既出）＋`land`（bar0 頭をルートへ vel118・無ければ1音挿す）＋`respondToCues`（既定 true・
false でそのトラックだけ合図に乗らない＝裁定6）。到達口は `/music/gen_bass`・MCP `gen_bass`・`/gen/section` の3口。
cues 不在／`respondToCues:false`／未知 kind は従来と **bit 一致**（vel キー自体を生やさない）を実測済み。
`build`/`break` は仕様どおり前倒しせず未実装。music-core 269／api 1606 緑・typecheck clean。

**残り＝向こうの音楽知識そのものの移植。** 棚卸し＝`docs/research/2026-09-04-phrasemaker-bass-inventory.md`
（ベース系3実験・約4,700行を読んだ結果）。推し順は同 §4：
1. **錨と間の分業**（`ensemble.py:1111` `_lock_bass_roots_to_sheet` 相当）＝価値最大・耳GO実績あり・**RNG 不使用**
   ＝ドラム M2 と同じ「Python 参照とのデータ一致」で証明できる。既存 kickLock/style と排他の第三経路として additive に足す。
   otomemo の kickLock は**統計的な傾き**（共有率）・向こうは**構造的な契約**（全キックに錨・リフは無傷・境界は必ず解決）＝
   キックが密なパターンでは上限 0.85 でも取りこぼすことを実測済み（four.rock＝16箇所中ベース音なし4）。
2. コード追従のガード群（強拍CT強制・弱拍スケール整合・発散後の解決）＝approach ノブの上位互換・移植は機械的。
3. ウォーキング v3（ジャズ/バラードが丸ごと増える）。**ただし v3 は独立 ACCEPTANCE が無い**＝
   「検証済み扱い」で移植すると bodyfill と逆向きの事故になる（同 §5-1）。
4. 指板グラフ＝当面は検証器として薄く。5. 奏法（`bass_expression`）＝**後回し**（bass notes が velocity 非対応＝前提が欠けている）。

止めるブロッカーは無い。残タスクの全体像は `docs/backlog.md` と本書末尾。
