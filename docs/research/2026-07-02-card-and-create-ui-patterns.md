# カード式管理＋多様な種別の起票UI 調査（2026-07-02）

## 問い
ネタ帳（カード一覧）＋作成タイル（＋メロ/＋コード…）を、作曲に限らず**カード式管理＋多様な種別の起票**の定石で詰められないか。真似できる例を探す。

## 調べた定石（出典付き）
- **カードは"異種混在"に最適**：ダッシュボード的に複数種別を同一画面に並べる用途にカードは向く（＝我々のネタ=melody/chord/lyric… 混在に合致）。[NN/g Cards](https://www.nngroup.com/articles/cards-component/)
- **ただしカード羅列はスキャン/比較が弱い**：可変サイズで位置が揃わず、リストの方が「予測可能な位置」で比較しやすい（アイトラで往復が増える）。→ **多数を見比べる時はリスト/コンパクト表示が要る**。[NN/g Cards](https://www.nngroup.com/articles/cards-component/)
- **カードの情報優先度**：サムネ → タイトル → 短い説明 → 副アクション → 時刻/タグ。[NN/g](https://www.nngroup.com/articles/cards-component/) / [Card UI best practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- **タッチ**：カード全体をクリッカブルに＋影でクリック可能性を示す（タッチ標的を大きく）。[NN/g](https://www.nngroup.com/articles/cards-component/)
- **種別の区別＝一貫した色＋アイコン＋ラベル**（緑=追加/赤=削除 等の色規約）。[ui-patterns Cards](https://ui-patterns.com/patterns/cards) / [Card UI best practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- **面(solid)アイコンは輪郭(outline)より認識が速い**＝小さいタイルのkindアイコンは塗りが有利。[UX Movement](https://uxmovement.com/mobile/solid-vs-outline-icons-which-are-faster-to-recognize/)
- **起票の定石＝「＋」＋動詞ラベル**（Add New/Create）を目立つ位置・コントラストで。[Card UI best practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- **テンプレギャラリー（アイコン付きタイルで"新規X"）**＝Notion の定石。我々の「作成タイル」はこれに合致。[Notion Template Gallery](https://www.notion.com/help/guides/category/template-gallery)
- **コマンドパレット/クイック作成**（Notion `Cmd+P`・`/`、Linear の高速作成）＝雑な入力は"1本の高速入口"へ。我々の「雑な捕獲はチャットへ委譲」はこの思想と同じ。[Notion Command Palette](https://noteforms.com/notion-glossary/command-palette)
- **ギャラリー↔表↔リストの表示切替**（Notion gallery view）＝同じデータを密度違いで見る。[Notion Gallery view](https://www.notion.com/help/galleries)

## 我々への改善案（詰められそうな所・効き順）
1. **コンパクト/リスト表示の切替**（最有力）：今のカードは背が高くリッチ＝**数が増えると比較しにくい**（NN/g）。密なリスト表示トグル（タイトル＋kind色ドット＋小さなミニロール/なし）を足すと、探す・並べ替えるが速い。ギャラリー↔リストの2密度。
2. **カードの情報優先度を整える**：**タイトル最優先**、**id(1ae4ffd3…)は薄く/小さく**（今は右上に目立つが価値低）、mini-roll と tags は補助。副アクション(▶/相談/複製/…)は数が多い→主要2つ＋「…」に畳む案も。
3. **タッチ affordance**：カード全体クリック＋**押下/hoverの影**でタップできると分かる（今 card-main はクリック可・影は弱い）。
4. **kindアイコンは面(solid)で統一**（認識が速い）＝現状の KindIcon の方向でOK。統一感を上げるなら Lucide/Phosphor 等の既製セットに寄せる手も（自前SVGでも可）。
5. **作成タイルはテンプレギャラリー定石どおり**＝現状で王道。強いて言えば「＋」の視認性・並び順（使用頻度順：メロ/コード/歌詞を前に）。

## 結論
- **作成側（タイル＋チャット委譲）は定石に合っており、これ以上は詰めどころ少**。
- **詰めしろはカード"一覧"側**：①**表示密度の切替（リスト/コンパクト）**が一番効く、②カードの情報優先度（タイトル主役・id退避・アクション整理）。
- モバイル前提＝全体クリック＋影のタッチ affordance。

## 出典
- [NN/g: Cards component](https://www.nngroup.com/articles/cards-component/)
- [Eleken: Card UI examples & best practices](https://www.eleken.co/blog-posts/card-ui-examples-and-best-practices-for-product-owners)
- [ui-patterns: Cards](https://ui-patterns.com/patterns/cards)
- [UX Movement: Solid vs outline icons](https://uxmovement.com/mobile/solid-vs-outline-icons-which-are-faster-to-recognize/)
- [Notion: Template Gallery](https://www.notion.com/help/guides/category/template-gallery) / [Gallery view](https://www.notion.com/help/galleries) / [Command Palette](https://noteforms.com/notion-glossary/command-palette)
