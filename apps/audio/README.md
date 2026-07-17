# apps/audio/ ＝ Python 音声サイドカー（本番の生き物と実験が同居・uv管理）

このディレクトリは **本番 API が spawn する現役の Python スクリプト**と、**結線されていない実験/開発道具**が
同居している。消す前に必ず下の「生死表」を見ること。（旧名 `_audio_poc/`＝"poc" は嘘だったので
2026-07-17 に `apps/audio` へ移動し `apps/worker` と対称化。経緯＝`docs/research/2026-07-17-python-sidecar-layout.md`）

`apps/worker` と同型の **uv プロジェクト**（`pyproject.toml` + `uv.lock`）。追跡するのは
`*.py` / `pyproject.toml` / `uv.lock` だけ（＝ソースと依存宣言は版管理・巨大依存/生成物は `.gitignore`）。

## 依存管理＝uv（venv は宣言から再現可能）
`.venv/` は **uv の既定プロジェクト venv**（＝本番が `.venv/bin/python` で叩く実体）。中身は `pyproject.toml`（トップレベル依存）→ `uv.lock`（全依存グラフを固定）で宣言済み。もう「何が入ってるか不明の1.4GBの塊」ではない。

```
cd apps/audio && uv sync      # pyproject/uv.lock から .venv を丸ごと再現（新環境/壊れた時）
uv add <pkg> / uv lock        # 依存を足す→lock更新（手で pip install しない）
```
torch/torchaudio は **PyTorch CPU 専用 index**（`[tool.uv.sources]`）＝GPU無しの常時起動機向け。素の PyPI torchaudio は libcudart を要求して轟沈するので触らない。
※依存の採り漏れ注意：`analyze.py` は関数内で `pesto`(f0) と `BTC-ISMIR19`(コード検出＝`mir_eval`/`pretty_midi`/`pandas` を import) を使う。トップレベル import だけ見ると漏れる（移動時に実際やらかした）。

## 生死表

| ファイル | 状態 | 本流の呼び口 | 正典 |
|---|---|---|---|
| `analyze.py` | ★**本番現役**・消すと音声解析が死ぬ | `apps/api/src/audio-analyze.ts`（`apps/audio/.venv/bin/python analyze.py` を spawn・14参照） | `docs/research/audio-analysis-feasibility.md` |
| `accent.py` | ★**本番現役**・消すと仮歌アクセントが死ぬ | `apps/api/src/accent.ts`（pyopenjtalk・W-K1仮歌・8参照） | `docs/research/2026-07-15-kariuta-accent-feasibility.md` |
| `.venv/` | ★**本番現役**（上2つの実行環境・gitignore） | 上記 spawn の `PY`（`CM_AUDIO_PY`/`CM_ACCENT_PY` で差替可） | — |
| `f1_beatthis.py` | 実験（**本流未結線**・0参照） | なし＝拍/ダウンビート導入フィジビリの再現スクリプト | `docs/research/2026-07-15-allin1-beatthis-feasibility.md` |
| `f1_allin1.py` | 実験（**本流未結線**・0参照） | なし＝曲構造解析フィジビリの再現スクリプト | 同上 |
| `batch_key.py` / `compare.py` / `midi_truth.py` | 開発道具（0参照） | なし＝手元検証用のワンショット | — |

## gitignore で追跡しないもの（巨大依存・生成物）
- `.venv/`（本番・uv sync で再現）
- `BTC-ISMIR19/`（≈69M・コード/キー検出の外部repo・`analyze.py` が sys.path 流用）
- `*.wav` `*.pt` `*.mid` `*.mp3`（音源/モデル/生成物）／`*.out` `*.err`（実験の生ログ）／`__pycache__/`
- `venv-f1/` `venv-f2/`（F1/F2実験venv・2026-07-17に削除済＝再作成しても無視）

## 掃除するときの判断
- **`analyze.py` / `accent.py` / `.venv/` は触らない**（本番が spawn する）。
- 実験スクリプト（`f1_*`）と道具（`batch_key`/`compare`/`midi_truth`）は結論を research doc に吸い上げ済み＝
  消しても知見は失わない。スクリプト本体は再現性のため残置が既定。
- F1（beat_this/allin1）を本流に結線する判断は上記 feasibility doc の残タスク参照。**未結線なら「取り込み済み」ではない**。
