# メロコーパス調査＋「崩す」生成（提示メロ→同雰囲気の別メロ）

最終更新: 2026-06-29

## 問い
メロの連想（引く・つなぐ・ハモ付け）の質はコーパス量に依存（requirements L159）。だが他者メロをそのまま持つと著作権が危うい。
ユーザー指摘：**「持ってくるなら崩す機能が要る＝提示メロから崩した同雰囲気のメロ」**。これは正しい。本書はその実装現況・法的根拠・使える情報源を一本化する。

## 結論（要点先出し）
1. **「崩す」は既にこの設計の中核で、実装もある**：`melodyEssence`（抽象層だけに落とす）＋`genFromEssence`（リズム指紋＋輪郭を継ぎ、ピッチ列はコードに沿って作り直す＝「似てるが別物」）。http `/music` の `gen_from_essence` で稼働可能。方針 `motif-extraction.md`＝**統計のみ抽出・リテラル非保存**も確立済。
2. **法的にも筋が通る**：事実・アイデア・方法は非保護（17 USC §102(b)）。統計/抽象特徴の抽出＝**非表現的利用(TDM)**で米フェアユース支持が厚い。**日本は著作権法30条の4（情報解析目的の利用）が明文で広く許す**（※要確認・法律助言ではない）。出力側の侵害判定は **substantial similarity**＝ありふれた構成要素（短い音型/音階/輪郭/常套リズム）は "thin" 保護（Dark Horse/Stairway 判例）。**輪郭・リズム・ムードだけ共有しピッチ列を作り直したメロは、単一原曲に実質的類似しにくい**。
3. **足りないのは“データ投入”と“崩しの制御/混合”**：library に essence レコードが空。崩し強度ノブと複数参照ブレンドを足すと、UX（同雰囲気の別メロ）と著作権ファイアウォールが両立。
4. **情報源**：**PDMX（254K曲・PD/CC0 MusicXML）＝最有力のクリーン大量源**＋**ユーザー過去作（フルにリテラル可）**。POP909/Hooktheory/Lakh は**統計のみ**（現方針どおり）。thesession は曲はPDだが配布DBが ODbL＋「LLM禁止」条項で要注意。

---

## ① 既にあるもの（崩す＝実装済み）
- `apps/api/src/music/melodyEssence.ts`：`MelodyEssence = { intervals（移調不変音程列）, contour（Parsons輪郭）, rhythm（IOI指紋）, pcHist（音名分布） }`。コメント明記「**絶対ピッチ＋絶対リズムの同時一致＝複製は持たない＝著作権セーフ**」。`normalizeToC` でC基準相対化。
- `apps/api/src/music/generate.ts::genFromEssence`：参照メロの**リズム指紋＋輪郭（身振り）を保ち、音高はコードに沿って再生成**（開始＝コードトーン、輪郭方向にスケールを歩く・歩幅は `rng.choice([1,1,2])` で作り直し、拍頭はコードトーンへスナップ）。決定的(seed)。＝**「崩す」の実体**。http `/music` `gen_from_essence` で露出済。
- `similarity.ts`（多層 melodySimilarity）＋ similarMelodies retrieval、`corpusBias.ts::learnMotifModelFromLibrary`（library から**モチーフ統計モデル**を学習＝リテラルでなく統計）。
- 方針docs：`motif-extraction.md`（モチーフ辞書＋展開統計／sequence・inversion・リズム変形%で崩す）、`melody-corpus-findings.md`（POP909 を**統計のみ**独立追試）。
- **現状の限界**：①library に essence レコードが**未投入**（連想の燃料が空）②崩しが固定（輪郭は厳密保存・強度ノブ無し）③単一参照のみ（複数ブレンド無し）。

## ② 法的整理（※法律助言ではない・最終確認要）
- **非保護の層**：米国は事実・アイデア・手続き・方法・概念を保護しない（17 USC §102(b)）。**音程分布・輪郭統計・リズム指紋などの抽象特徴＝アイデア/事実側**＝抽出・保存しても表現の複製ではない。
- **非表現的利用 (TDM)**：著作物を「読む/解析して統計・抽象に変換」する利用はフェアユースで広く許容される、という整理（cacm/UC Davis Law Review 等）。**日本＝著作権法30条の4**：情報解析等「著作物に表現された思想・感情の享受を目的としない」利用は権利者の許諾なく可（学習・解析向き）。本ツールは作曲者本人の私的支援＝市場代替性も低い。
- **出力側＝substantial similarity**：侵害は「実質的類似」で判定。判例は**ありふれた構成要素に薄い保護**：
  - *Gray v. Hudson（Dark Horse, 2020）*：8音オスティナートは「ありふれた構成要素」で非保護→非侵害。
  - *Skidmore v. Led Zeppelin（Stairway, 2020）*：下行音型・常套リズム・pitch collection 等の個別要素は非保護。
  - ＝**輪郭の向き・リズムのノリ・調/ムードだけ共有し、絶対ピッチ列（保護される表現）を作り直す**なら、単一原曲への実質的類似は成立しにくい。**複数源をブレンド**すれば更に希薄化。
- **実務結論**：本ツールの「essence(抽象)を保存→`genFromEssence`で別メロ再生成」は、**入力(解析)・保存(抽象)・出力(再生成)のどの面でも安全側**。リテラルな他者メロを保存/提示しないことが要石。

## ③ 「崩す」を安全弁として強化する案
1. **崩し強度ノブ**：現状は輪郭を厳密保存。`strength∈[0..1]` で **輪郭の確率的反転/平滑化・歩幅分布の拡張・リズム指紋の augmentation/diminution（motif-extraction の変形タグ）** を増やす＝弱=寄せる/強=面影だけ。
2. **複数参照ブレンド**：retrieval上位N件の essence を**平均/混合**してから再生成＝出力が単一源に辿れない（類似の希薄化＝著作権・凡庸さ両対策）。
3. **保存規約**：library には **essence＋出自タグ＋ライセンス区分**のみ。PD/CC0と自作は**リテラルも可**、それ以外は**essenceのみ**（リテラル禁止）をデータ層で強制。
4. **UXは崩し前提**：「似たメロを引く」は**必ず `genFromEssence` の再生成**を返す（保存リテラルを出さない）＝ユーザーの言う「崩した同雰囲気の別メロ」がそのまま既定動作になり、著作権ファイアウォールを兼ねる。

## ④ 情報源マップ（ライセンス別・出典付き）
**A. クリーン＝リテラル保存も可（PD/CC0）**
- **PDMX**（最有力）：MuseScore 由来の**254,077スコア・約6,250時間・MusicXML**、**PD Mark / CC0 のみ厳選＝商用可**。記譜情報も保持。大量・クリーンの本命。 https://arxiv.org/html/2409.10831
- **ユーザー過去作**：自作＝制約なし。**「自分らしさ」連想の最良源**（requirements L89/154）。
- パブリックドメイン古典/民謡（pre-1929・伝承曲の楽譜）。

**B. 統計のみ抽出（リテラル非保存・現方針どおり）**
- **POP909**（CC-BY）：注釈はCC-BY だが**原曲メロは商用著作物**＝統計のみ（既にそうしている）。 https://github.com/music-x-lab/POP909-Dataset ／ https://archives.ismir.net/ismir2020/paper/000089.pdf
- **Hooktheory Lead-Sheet-Dataset**（〜16k断片）：Hooktheoryスクレイプ＝明確ライセンス無し・原曲著作物→**統計のみ**。
- **Lakh MIDI (LMD)**：出自混在・不明確→統計のみ。
- **Meertens MTC / Essen(EsAC)**：研究用民謡コーパス（学術ライセンス・要規約確認）。民謡＝曲はPD寄りだが配布規約に従う。 https://www.liederenbank.nl/mtc/

**C. 避ける/要注意**
- **thesession.org データ配布**：伝承曲（曲自体はPD）だが、**配布DBは ODbL＋「LLM利用禁止」カスタム条項**＝そのままは不可。使うなら個別ABC（PD曲）を規約外で。 https://github.com/adactio/TheSession-data
- **Wikifonia**：著作権ライセンス継続不能で2013年閉鎖＝不可。 https://en.wikipedia.org/wiki/Wikifonia

## ⑤ 設計含意・次の一手
- **データ投入の本命＝PDMX＋自作**：ここから melody を抽出→`melodyEssence`＋motif統計→`normalizeToC`→**library に essence ネタ化**（出自/ライセンスタグ付き）。POP909等は**統計モデル(`learnMotifModelFromLibrary`)更新のみ**に使う。
- **崩しの制御を実装**：`genFromEssence` に `strength` 引数＋複数essenceブレンドを足し、MCP/Chat に「これを崩して/似た雰囲気で別案」を露出（基盤は揃っている）。
- **データ層のライセンス区分強制**：essenceネタに `lic: pd|cc0|own|stats-only` を持たせ、`stats-only` はリテラル content を保存しない。
- 優先度：ユーザー方針では**メロ最優先**。本作業＝連想の本領を出す本丸。データ出所の最終判断はユーザー（#13/#59）。

## 出典
- データセット/ライセンス：PDMX(arXiv 2409.10831) / POP909(ISMIR2020・GitHub music-x-lab) / Meertens MTC(liederenbank.nl/mtc) / TheSession-data(GitHub adactio, ODbL+LLM禁止) / Wikifonia(Wikipedia)。
- 法：TDM/非表現的利用＝CACM "Text and Data Mining of In-Copyright Works" / UC Davis Law Review "Why Text and Data Mining Is Lawful" / Emory TDM legal guide。substantial similarity＝Gray v. Hudson(Dark Horse)・Skidmore v. Led Zeppelin(Stairway)（cll.com / copyrightalliance.org 各解説）。日本＝著作権法30条の4（情報解析）※条文要確認。
