# Python サイドカーの配置・命名・統合管理（調査＋提案）

日付: 2026-07-17 ／ 種別: リポジトリ衛生（配置/命名/依存管理）の分析・提案。
> **【実施済み 2026-07-17】** Option A を採用＝`_audio_poc` → `apps/audio` へ移動完了（uv 統合はしない=独立2本維持）。TS 6行/.gitignore/eslint/test fixture/上位doc 更新・`git mv`＋`uv sync` で venv 再生成・api 再起動で反映。移動時に**依存採り漏れが発覚**（`analyze.py` は関数内で `pesto`＋`BTC-ISMIR19`(→`mir_eval`/`pretty_midi`/`pandas`) を使うのに pyproject 未宣言→uv sync が削除→pyproject に4依存追記して復旧）。以下は当時の提案の記録。
対象: `_audio_poc/`（音声サイドカー）と `apps/worker/`（cm-search 意味検索サーバ）の2つの Python プロジェクトの配置・命名・uv 管理方針。

---

## 0. 要旨（結論だけ先に）

- **統合（uv workspace で一元化）＝やらない**。2つの Python プロジェクトは依存が大きく食い違い（audio=torch/demucs/librosa ≈1.4GB／worker=sentence-transformers）、uv workspace は**1ロックファイル＋1共有 venv** を強制するので、両者の torch を単一解へ co-resolve させ、巨大 venv が1つに膨らむ。得るものは `uv sync` 入口の一本化程度で、失うものが大きい。**独立2本を維持**が正解。
- **命名／配置＝`_audio_poc` → `apps/audio` へ移すのを推奨**（`apps/worker` と対称。どちらも「TS の api が spawn/HTTP で叩く Python サイドカー・各々 uv プロジェクト」という同じ mental model に揃う）。"poc"（捨てPOC）の嘘を消すのが主目的。低コスト代替＝**その場改名 `_audio_poc` → `_audio`**（`_`プレフィックス流儀を保つ・移動より触る箇所が少ない）。
- **移行コストは中程度・境界は明確**。壊れ得る箇所は「TS 2ファイルのパス文字列」「.gitignore 11行」「eslint ignore 1行」「テストの fixture 文字列1行」に限局。**dist 焼きは不要**（api は `tsx src/main.ts` でソース起動＝パス文字列を変えて api 再起動だけで反映）。唯一の実作業上の罠は **venv は再配置不可**（`bin/yt-dlp` 等のコンソールスクリプトが絶対パス shebang を持つ）＝移動後に `uv sync` で venv を張り直す必要がある。

---

## 1. 現状マップ（実測・2026-07-17）

### 1.1 2つの Python プロジェクト

| | `_audio_poc/`（`cm-audio`） | `apps/worker/`（`cm-worker`） |
|---|---|---|
| 役割 | 音声解析サイドカー（`analyze.py`=demucs/librosa/BTC、`accent.py`=pyopenjtalk） | 意味検索サーバ `cm-search`（:8788・sentence-transformers/fastapi/uvicorn） |
| 呼ばれ方 | TS api が **spawn**（`.venv/bin/python analyze.py` / `accent.py`・都度起動） | systemd 常駐サービス `cm-search.service`・api が **HTTP** で叩く（:8788） |
| uv 形態 | `package = false`（素のスクリプトを spawn・ビルドしない）／`pytorch-cpu` explicit index | `[project.scripts] cm-search`／hatchling build／`[dependency-groups] dev=pytest` |
| 主要依存 | torch 2.12.1+cpu・torchaudio・demucs 4.0.1・librosa・numpy・pyopenjtalk・yt-dlp（≈1.4GB） | sentence-transformers>=3.3・numpy・fastapi・uvicorn（内部で torch を別途 pull） |
| requires-python | >=3.12 | >=3.12 |
| pnpm workspace | 対象外（`apps/*`・`packages/*` のみ・下記1.4） | 対象外（`apps/*` 配下だが package.json 無し＝pnpm は無視） |

両者とも `pyproject.toml` + `uv.lock` を版管理し、`.venv/` は gitignore（宣言から `uv sync` で再現）＝**同型の uv プロジェクト**。すでに構造は揃っている。名前と場所だけが非対称。

### 1.2 spawn の既定パスと env override（`apps/api/src`）

- `audio-analyze.ts`（現役・音声解析）
  - `const REPO = resolve(import.meta.dirname, "../../..")`（`apps/api/src` → リポジトリルート）
  - `PY = process.env.CM_AUDIO_PY ?? join(REPO, "_audio_poc/.venv/bin/python")`（L16）
  - `SCRIPT = process.env.CM_AUDIO_SCRIPT ?? join(REPO, "_audio_poc/analyze.py")`（L17）
  - `YTDLP = process.env.CM_YTDLP ?? join(REPO, "_audio_poc/.venv/bin/yt-dlp")`（L18）
- `accent.ts`（現役・仮歌アクセント W-K1）
  - `PY = process.env.CM_ACCENT_PY ?? join(REPO, "_audio_poc/.venv/bin/python")`（L10）
  - `SCRIPT = process.env.CM_ACCENT_SCRIPT ?? join(REPO, "_audio_poc/accent.py")`（L11）

＝**パスは全て env で差し替え可**。移行中は env で旧/新を切り替えられる（下記4段の後方互換に使える）。

### 1.3 リポジトリの命名流儀

- `_`プレフィックス＝「pnpm 非パッケージ・補助/足場」の合図：`_audio_poc/`・`_dogfood_ui/`・`_quarantine/`。
- `apps/` 配下＝アプリ本体：`apps/api`（TS）・`apps/web`（TS）・`apps/worker`（**Python・package.json 無し**）。
- ＝ `apps/worker` が既に「apps/ 配下の Python サイドカー」という前例。`apps/audio` はこの前例と完全対称。

### 1.4 pnpm workspace との関係（移動しても壊れない根拠）

- `pnpm-workspace.yaml` は `apps/*` と `packages/*`。だが **pnpm はパッケージを package.json の有無で判定**する。`apps/worker` は package.json が無いので今も pnpm から無視されている（`pnpm -r test` も素通り）。
- したがって `apps/audio`（package.json 無し）も同様に pnpm から無視される＝**`apps/` 配下へ移しても pnpm ワークスペース・`pnpm -r test` に一切影響しない**（apps/worker が動いている実績が証明）。

### 1.5 api はソース起動＝dist 焼き不要（重要）

- `apps/api/package.json`：`"start": "tsx src/main.ts"`（systemd `cm-api.service` の ExecStart も `pnpm --filter @cm/api start`）。**api は dist を焼かずソース直実行**。
- spawn パスは `import.meta.dirname`（`apps/api/src`）起点の相対＋リテラル文字列。**パス文字列を変えたら api 再起動だけで反映**（`scripts/restart.sh`・`--build` 不要）。web の dist とは無関係。

---

## 2. 選択肢 A / B / C

### Option A ── `apps/audio` へ移動（改名・独立 uv 維持）＜推奨＞

`_audio_poc/` を `apps/audio/`（`cm-audio` のまま）へ移す。uv は独立プロジェクトのまま（統合しない）。

- 利点
  - **`apps/worker` と対称**＝「apps/ 配下に Python サイドカー2本・各々 uv プロジェクト・TS api が叩く」で mental model が1つに。
  - "poc"（捨てPOC）の**誤解を根絶**。README で生死表を書いて名前の嘘と戦う必要が消える。
  - pnpm/`pnpm -r test` に無影響（1.4 の根拠・apps/worker 実績）。
  - env override 健在ゆえ移行中の切替が容易。
- 欠点／コスト
  - TS 2ファイルのパス文字列・.gitignore・eslint ignore・テスト fixture を更新（下記4）。
  - **venv 再配置不可**：`bin/yt-dlp` 等コンソールスクリプトの shebang が旧絶対パスを指すので、`mv` 後に `uv sync`（または `uv venv` 再作成）で張り直しが必要（1.4GB を再解決・数分）。`bin/python` は system python への symlink なので mv でも生きるが、yt-dlp は落ちる＝**必ず sync**。
  - `_`プレフィックスが持つ「補助/足場」の合図は失う（が、それはもう実態と乖離＝現役本番なので手放すのが正しい）。

### Option A′ ── その場改名 `_audio_poc` → `_audio`（低コスト代替）

移動はせず名前だけ "poc" を落とす。`_`流儀は保持。

- 利点：触る箇所が Option A と同じ集合だが**場所が変わらない分だけ思考コストが低い**。venv 再配置問題は同じ（mv するので sync は要る）。
- 欠点：`apps/worker` との対称は得られない（片方 apps/・片方ルート `_`）。honesty は得るが構造の一貫性は半端。

### Option B ── uv workspace で統合（ルート `[tool.uv.workspace]`）

ルートに `pyproject.toml` を置き、`members = ["_audio_poc"（or apps/audio）, "apps/worker"]` で一元化。

- 利点
  - `uv sync` / `uv lock` の入口がルート1つに。Python プロジェクトの存在がルートから見える。
- 欠点（重い・却下理由）
  - **uv workspace は1ロックファイル＋1共有 venv を強制**。audio（torch 2.12.1+cpu を pytorch-cpu explicit index から固定）と worker（sentence-transformers が**別途 torch を pull**）を**単一解へ co-resolve**させることになる。torch のバージョン／index 制約が衝突しやすく、解けても**巨大 venv が1つ**に膨らむ（軽い検索サーバの起動環境に demucs/librosa/1.4GB が同居）。
  - audio は `package = false`＋explicit index、worker は hatchling build＋`[project.scripts]`＝**設定思想が異なり**、workspace ルート化で扱いが複雑化。
  - systemd `cm-search.service` は `WorkingDirectory=apps/worker` で `uv run cm-search`＝メンバー配下でも動くが、共有 venv 化で解決グラフが audio 依存に引きずられる副作用を負う。
  - 得（入口一本化）に対して失（依存衝突・巨大 venv・思想差の吸収）が過大。**却下**。

### Option C ── 現状維持（`_audio_poc` のまま・README で担保）

すでに `_audio_poc/README.md` に生死表・uv 手順・gitignore 方針を整備済み。

- 利点：**移行コスト 0**。壊れる箇所なし。研究doc 15本＋design.md の既存参照が全て有効なまま。
- 欠点：名前が嘘（"poc"＝捨て、実体＝本番現役）を抱え続ける。新規参加者/未来の自分が「消していい」と誤読するリスクを README でしか止められない（＝ドキュメント依存の防御）。

---

## 3. 推奨と理由

1. **統合（Option B）はやらない**＝独立 uv 2本を維持。依存分岐が大きく、uv workspace の「1共有 venv」制約が torch co-resolution 衝突と巨大 venv を招く。入口一本化の利は小さい。
2. **命名は Option A（`apps/audio`）を推奨**。`apps/worker` と対称になり、"poc" の嘘が消え、pnpm へは無影響（apps/worker が実証）。ただし**急がない**＝1つの意図的スライスとして実施（コードだけ先走らない・CLAUDE.md 作法）。
3. **時間/意欲が薄いなら Option A′（`_audio`）か Option C（現状維持）**で十分許容。README の生死表が既に嘘を大幅に緩和しているため、C の実害は「新規読者の初見誤読」に限られる。**やるなら A、やらないなら C**の二択で、A′ は中間。

＝ **推奨の一行：「uv 統合はしない。名前は `apps/audio` へ移して apps/worker と対称化する（1スライス）。急がないなら README 済みの現状維持で実害は小さい。」**

---

## 4. 段階的移行手順（Option A を採る場合）

env override が全パスに効くので、**新旧を env で並走させながら**安全に移せる。

1. **ディレクトリ移動＋venv 張り直し**
   - `git mv _audio_poc apps/audio`（追跡対象＝`*.py`/`pyproject.toml`/`uv.lock` が移動）。
   - venv は gitignore ＝物理 `.venv/` を `mv` しても shebang が壊れる。**`cd apps/audio && uv sync`** で venv を新パスに再生成（`bin/yt-dlp` の shebang を正す）。旧 `_audio_poc/.venv` は掃除。
2. **TS の既定パス更新（api 再起動で反映・dist 焼き不要）**
   - `apps/api/src/audio-analyze.ts` L16-18：`_audio_poc/...` → `apps/audio/...`（`CM_AUDIO_PY`/`CM_AUDIO_SCRIPT`/`CM_YTDLP` の既定値）。
   - `apps/api/src/accent.ts` L10-11：同様に `CM_ACCENT_PY`/`CM_ACCENT_SCRIPT` の既定値。
   - ※ REPO 起点（`import.meta.dirname` の `../../..`）は不変（ファイルは `apps/api/src` のまま）。
   - 並走したいなら、この編集前に `~/.config/creative-manager.env` へ `CM_AUDIO_PY` 等を新パスで先出しし、api 再起動→動作確認→ソース既定を書換、が最も安全。
3. **周辺の参照更新**
   - `.gitignore` L27-38：`_audio_poc/...` の11行を `apps/audio/...` に置換（`.venv`・`__pycache__`・`BTC-ISMIR19`・`*.wav/pt/mp3/mid`・`venv-f1/f2`・`*.out/err`）。
   - `eslint.config.js` L20：`"_audio_poc/**"` → `"apps/audio/**"`。
   - `apps/api/test/audio-analyze.test.ts` L307：スロー fixture 文字列内の `_audio_poc/.venv/bin/python`（＝テストは「パスがユーザーに晒されない」ことを検証する代表入力・**機能依存ではない**が、正確性のため新パスへ）。
4. **ドキュメント整合（CLAUDE.md 作法：上位を腐らせない）**
   - **本番参照**＝`docs/design.md`（L647/985/1236）・`docs/usecases-chat.md`（L42/98/127/134）・`docs/backlog.md`（L292・venv-f1/f2 掃除項）は現行を指す上位文書ゆえ更新。
   - **研究doc 約15本**（`docs/research/2026-07-07-*`, `2026-07-15-*` 等）は**日付付きスナップショット＝原則そのまま**（当時の事実の記録）。全置換で歴史を書き換えない。索引 `docs/research/README.md` に「配置は 2026-07-17 に apps/audio へ移動（本doc参照）」の1行を足すのが散逸防止に十分。
5. **反映と検証**
   - `scripts/restart.sh`（`--build` 不要・api はソース起動）で api 再起動。
   - `/health` の `deps.cm-search` 疎通（worker は無変更）＋音声解析・accent の1回実走（spawn パス到達）を確認。
   - `pnpm -r test`（apps/audio は package.json 無し＝素通り・無影響を確認）。

＜Option A′（`_audio` 改名）の場合＞ 手順1の移動先を `_audio` に、手順2/3の置換先を `_audio/...` に読み替え。手順4のドキュメント範囲・手順5は同じ。pnpm 無関係（ルート `_` 配下のまま）。

---

## 5. 壊れ得る箇所インベントリ（grep 洗い出し・`_audio_poc` 参照の全件）

| 種別 | 箇所 | 更新要否 |
|---|---|---|
| 本番 TS（機能依存） | `apps/api/src/audio-analyze.ts` L16-18／`accent.ts` L10-11 | **要**（既定パス。env でも上書き可） |
| 版管理 | `.gitignore` L27-38（11行）／`eslint.config.js` L20 | **要** |
| テスト | `apps/api/test/audio-analyze.test.ts` L307（fixture 文字列） | 要（正確性のため。機能非依存） |
| 上位文書 | `docs/design.md` L647/985/1236・`docs/usecases-chat.md` L42/98/127/134・`docs/backlog.md` L292 | **要**（現行を指す） |
| 研究doc（スナップショット） | `docs/research/` 約15本（audio-analysis-feasibility, 2026-07-07/15 各audit・feasibility 等） | 原則不変（歴史）。README に移動注記1行 |
| systemd | `deploy/systemd/*`（audio は spawn ＝サービス無し。worker の cm-search.service は無変更） | 不要 |

＝**機能を壊し得るのは TS の6行のみ**（残りは版管理/文書/テスト）。dist 焼き不要・env 並走可・pnpm 無影響ゆえ、リスクは低く可逆。
