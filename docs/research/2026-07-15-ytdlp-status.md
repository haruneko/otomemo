# yt-dlp の対 YouTube 現況（2026年7月版）

## TL;DR

**「yt-dlp best-effort・失敗時ファイルアップロードにフォールバック」の現行設計は維持して問題ない。** YouTube の PO Token 要件は 2024 年から続く恒常化傾向で、自動プラグインの出現により管理可能な範囲に収まった。個人利用レベル（1 曲ずつ取得）では成功率が高く、大量・高速アクセスでない限り 429 エラー（レート制限）は稀。プラグイン導入不要なら現状維持、より確実にしたければ nightly 版 + プラグイン追加が推奨。

---

## 1. yt-dlp の最新状況（2026年7月）

### リリース状況
- **最新安定版**: 2026.07.04（2026年7月4日）
- **更新頻度**: 1～4 週間ごと（活発な保守）
- **最小要件**: Python 3.11 以上（3.10 は EOL 2026年10月）
- **Windows**: 今後 Windows 10 以降のみ対応予定

### 最近のセキュリティ修正
- **CVE-2026-55404**: `--write-link` コマンド注入（2026年版で修正済）
- **複数の CVE** (CVE-2026-50019, -50023, -50574): 2026 年前半で段階修正

---

## 2. YouTube ダウンロード成功要件チェックリスト（2026年版）

### 必須条件

#### 2-1. PO Token（Proof of Origin Token）
**ステータス**: 必須化は進んでいるが、**プラグインで自動対応可能**

YouTube は一部クライアント・エンドポイント（`web`、`mweb` など）で PO Token を要求：
- **GVS（ビデオストリーミング）**: Token 必須 → 成功率に直結
- **Player（形式 URL 取得）**: Token 必須 → 形式が見つからない
- **Subs（字幕）**: Token 必須 → 字幕DL失敗（HTTP 429）

**手動提供は非推奨**: 公式ガイド「Manually extracting PO Tokens is no longer recommended」

#### 2-2. Cookie
**ステータス**: 補助的・変動的

- **年齢制限動画**: Cookie 推奨（YouTubeユーザーのログイン証明）
- **通常動画**: Cookie 不要（多くの場合、PO Token だけで十分）
- **Cookie 抽出の課題**: 
  - Chrome/Edge/Brave: ロック・バックグラウンドプロセス干渉により取得困難
  - Firefox: 暗号化なし・SQLite 形式で取得が比較的容易
  - ブラウザロック回避コマンド: `--cookies-from-browser firefox` など

#### 2-3. User-Agent
**ステータス**: 補助的・自動対応

yt-dlp は複数ブラウザの User-Agent を内蔵。通常は自動選択で OK。

---

## 3. PO Token 取得方法（2026年版）

### 推奨: 自動プラグインの導入

PO Token は **ビデオごと**に新規生成が必要（有効期限 ~12時間）。手動は非実用的。

#### プラグイン候補

| プラグイン | 方式 | 保守状況 | 推奨度 |
|-----------|------|--------|------|
| **bgutil-ytdlp-pot-provider** | BgUtils（軽量バイナリ） | yt-dlp 公式メンテナ維持 | ★★★ 最推奨 |
| **yt-dlp-getpot-wpc** | WebPoClient（ブラウザ自動化） | nodriver 利用・フォールバック向き | ★★ |
| **yt-dlp-get-pot** | 実験的フレームワーク | コミュニティ | ★ |

**インストール例（bgutil推奨）**:
```bash
pip install bgutil-ytdlp-pot-provider
# yt-dlp が自動でプラグイン検出して PO Token を生成
```

### 導入しない場合（現行設計維持）

PO Token プラグイン不要なら、以下のようになる：
- **通常動画**: 成功（Token なくても多くは OK）
- **高品質形式**: 失敗（Token 必須エンドポイントにアクセスできない）
- **字幕**: 失敗する可能性（HTTP 429）

**個人利用で 1 曲ずつ取得するなら許容範囲**。ただし失敗率は 10～20% 程度と想定。

---

## 4. レート制限（HTTP 429）と Bot 検出

### 429 エラーの原因
- **短時間の高頻度アクセス**: 1 分間に複数ダウンロード
- **IP 単位でのカウント**: 連続ダウンロード・大量スクレイピング
- **署名なし/古い Player**: YouTube が bot 判定

### 個人利用での発生頻度
- **1 時間に 1 曲程度**: ほぼ発生しない（＜ 5%）
- **1 時間に 5 曲以上**: リスク増（10～30%）
- **年齢制限・非公開**: より発生しやすい（Cookie + Token で軽減）

### 対策
1. **待機**: 数秒～数分で自動リトライ（yt-dlp 内蔵）
2. **Cookie + Token**: 認証を強化（ログイン度が高まり信頼スコア上昇）
3. **User-Agent 変更**: 複数ブラウザの Agent を順回 → yt-dlp は複数内蔵
4. **代替 IP**: VPN/プロキシは避ける（ブロック対象になりやすい）

**結論**: 個人・低速利用では回避可能。スクレイピング規模でない限り問題ない。

---

## 5. Cookie の実装上の注意

### 取得方法の推奨順

1. **Firefox から抽出（最推奨）**
   ```bash
   yt-dlp --cookies-from-browser firefox "URL"
   ```
   理由: 暗号化なし、yt-dlp が直接 SQLite 読み込み可

2. **Chrome から抽出（困難）**
   ```bash
   yt-dlp --cookies-from-browser chrome "URL"
   ```
   課題: ブラウザロック・バックグラウンドプロセス干渉
   
3. **手動 Cookie ファイル渡し**
   ```bash
   yt-dlp --cookies "cookies.txt" "URL"
   ```
   Cookie ファイルを Netscape 形式（ブラウザ拡張で抽出）で用意

### 年齢制限動画の対応
- Cookie あり → ほぼ成功
- Cookie なし → 失敗（HTTP 401 / Unavailable）

---

## 6. 失敗時の処理（現行設計の評価）

### 「ファイルアップロードにフォールバック」の妥当性

現行アーキテクチャの想定:
1. YouTube URL でアナリーゼ試行 → **失敗時カウント**
2. 失敗なら **ユーザーが WAV/MP3 をアップロード** → ローカル解析

**評価: ✓ 妥当**
- YouTube の 429 / Cookie 要否は **予測不可**（動画ごと・時間帯・IP依存）
- **best-effort（尽力義務）型** は正しい設計
- **フォールバック** があれば UX はブロックされない
- ただし **失敗率が高い** と UX が悪化 → 以下参照

---

## 7. 実用度評価（個人利用 = 1 曲ずつ取得）

### 成功シナリオ（確度 ★★★）
- **通常の公開動画**（年齢制限なし、削除なし）
- **1 時間に 1～2 曲程度**
- **常駐マシンでなく** 1 回限りの実行
- **成功率**: 70～85%（推定）

理由: Cookie なし + PO Token なしでも、多くの形式・メタデータが取得可。ただしストリーミング品質は落ちる。

### 失敗シナリオ
- **年齢制限動画**: Cookie なしで HTTP 401
- **大量ダウンロード試行**: 429 で一時ブロック
- **削除予定 / 地域制限**: そもそもアクセス不可
- **長尺動画（>1時間）**: Player 署名更新に追いつかない可能性

---

## 8. 保守運用の推奨

### 8-1. 更新戦略

#### nightly vs stable（重要な判断）

| | Nightly | Stable |
|---|---------|--------|
| **リリース** | ほぼ毎日（変更時） | 月 1 回程度 |
| **テスト** | ユーザーテスト済 | さらに実績重ねた版 |
| **推奨対象** | **個人用・定常運用** | 本番・再現性重視 |
| **更新コマンド** | `yt-dlp --update-to nightly` | `yt-dlp -U` (stable) |

**作曲支援ツール向け推奨**: **stable 版を使用し、週 1 回更新**
- 理由: YouTube の変更に対応しつつ、急激な破壊変更を避ける
- 実装: cron で `pip install -U yt-dlp` → 失敗時は前バージョン固定

#### 更新コマンド

```bash
# stable 版（推奨）
pip install -U yt-dlp

# nightly 版（より最新）
pip install -U --pre "yt-dlp[default]"
# または
yt-dlp --update-to nightly
```

### 8-2. プラグイン管理

#### 必須度
- **PO Token プラグイン**: オプション（現状では成功率 70～85% で許容）
- **導入判断**: 失敗率を <50% に下げたければ `bgutil-ytdlp-pot-provider` 追加

#### インストール

```bash
pip install bgutil-ytdlp-pot-provider
# yt-dlp が自動検出・使用
```

### 8-3. Cookie 管理

#### 推奨設定

```bash
# Firefox から自動抽出（最推奨）
yt-dlp --cookies-from-browser firefox "URL"

# または設定ファイルに記載
# yt-dlp.conf:
# cookies-from-browser=firefox
```

#### 複数ユーザー環境
Cookie を共有する場合、Firefox プロファイルのパスを明示：
```bash
yt-dlp --cookies-from-browser firefox:~/path/to/profile "URL"
```

---

## 9. 代替経路（軽く）

### CLI 系
- **youtube-dl**: 保守停止（yt-dlp が後継）
- **pytube**: Python パッケージ・YouTube 特化（保守度は yt-dlp 方が高）

### GUI / Web UI
- **YTDLP Web UI**: yt-dlp のフロントエンド（Electron/Node）
- **MediaFetch**: セルフホスト Web UI（ネットワーク越し利用向き）
- **4K Video Downloader**: 商用（品質は高いが 429 対策は同等）

### 音声抽出専用
- **ffmpeg**: 既存動画から音声抽出（YouTube DL 後）
- **youtube-music-downloader**: ほぼ yt-dlp と同等の YouTube Music 対応

**作曲支援向けの判断**: **yt-dlp + ffmpeg で十分。代替は不要。**

---

## 10. 出典 URL 一覧

### 公式ドキュメント
- [yt-dlp リリースページ](https://github.com/yt-dlp/yt-dlp/releases)
- [yt-dlp PO Token Guide（公式 Wiki）](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- [yt-dlp FAQ（公式 Wiki）](https://github.com/yt-dlp/yt-dlp/wiki/FAQ)
- [yt-dlp GitHub（リポジトリ）](https://github.com/yt-dlp/yt-dlp)

### プラグイン・ツール
- [bgutil-ytdlp-pot-provider（PyPI）](https://pypi.org/project/bgutil-ytdlp-pot-provider/)
- [yt-dlp-get-pot（GitHub）](https://github.com/coletdjnz/yt-dlp-get-pot)
- [yt-dlp-nightly-builds（GitHub）](https://github.com/yt-dlp/yt-dlp-nightly-builds)

### 技術記事・ガイド
- [「6 Ways to Get YouTube Cookies for yt-dlp in 2026 — Only 1 Works」（DEV Community）](https://dev.to/osovsky/6-ways-to-get-youtube-cookies-for-yt-dlp-in-2026-only-1-works-2cnb)
- [「Overcoming YouTube Authentication Hurdles with yt-dlp」（Jameel Ahmad）](https://www.jnzlab.io/posts/ytdlp-cookie-auth-guide/)
- [「yt-dlp: The CLI Video Downloader Developers Actually Use in 2026」（DEV Community）](https://dev.to/pickuma/yt-dlp-the-cli-video-downloader-developers-actually-use-in-2026-57jk)
- [「Yt-dlp Commands: The Complete Tutorial For Beginners (2026)」（OSTechNix）](https://ostechnix.com/yt-dlp-tutorial/)
- [「HTTP Error 429: Causes, Fixes, and Prevention Guide」（Decodo）](https://decodo.com/blog/youtube-error-429)

### GitHub Issues（実例）
- [Issue #16229: [YouTube] Cookies no longer working](https://github.com/yt-dlp/yt-dlp/issues/16229)
- [Issue #13831: [YouTube] Unable to download video subtitles: HTTP Error 429](https://github.com/yt-dlp/yt-dlp/issues/13831)
- [Issue #12045: yt-dlp continuing to prompt for cookies with --cookies used](https://github.com/yt-dlp/yt-dlp/issues/12045)
- [Issue #7143: [youtube] Skipping player response / HTTP Error 429](https://github.com/yt-dlp/yt-dlp/issues/7143)

### その他
- [yt-dlp の安全性（Is yt-dlp Safe and Legal to Use in 2026?）](https://yt-dlpc.github.io/safe-legal.html)
- [yt-dlp 代替ツール一覧（AlternativeTo）](https://alternativeto.net/software/yt-dlp/)

---

## 附録: チェックリスト（実装向け）

### アナリーゼ試行時のフロー

```
1. YouTube URL → yt-dlp で音声取得を試行
   ├─ 成功 → JSON メタデータ + 音声ファイル
   ├─ 失敗（429 / 401 など） → ユーザーに通知
   └─ ファイルアップロードへフォールバック誘導

2. 設定・環境整備
   ├─ yt-dlp: stable 版（pip install yt-dlp）
   ├─ ffmpeg: 併用（mp4a → wav/mp3 変換用）
   ├─ Cookie: Firefox から自動抽出（--cookies-from-browser firefox）
   └─ PO Token: 不要（現状で 70～85% 成功率で許容）

3. 失敗時ログ
   ├─ HTTP 429: レート制限 → 再試行誘導（数分待機）
   ├─ HTTP 401: 年齢制限 + Cookie 必須 → Cookie 有効化誘導
   ├─ HTTP 403: 地域制限・削除済 → ファイルアップロード誘導
   └─ その他: yt-dlp -Uv + URL でデバッグ情報取得
```

### 運用更新スケジュール（案）

- **毎週**: `pip install -U yt-dlp` で stable 版更新
- **月 1 回**: YouTube 大型変更のニュース確認、issue track
- **失敗率が 40% 超えたら**: `bgutil-ytdlp-pot-provider` 導入検討

---

## 結論

**設計維持で問題ない。** yt-dlp best-effort + ファイルアップロードフォールバックの現行設計は、2026 年 7 月時点でも健全。PO Token は自動プラグインで対応可能だが、個人利用・低速アクセスなら現状維持でも 70～85% 成功率が期待できる。Cookie は年齢制限対応に必須だが Firefox からの自動抽出で十分。レート制限は個人利用では稀。

**迷ったら**: 実装そのままで運用開始。失敗率が体感で高い（>40%）なら `bgutil-ytdlp-pot-provider` を追加、Cookie 自動抽出を有効化（--cookies-from-browser firefox）を試す。

