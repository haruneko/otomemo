# _audio_poc/ ＝ Python サイドカー置き場（本番の生き物と実験が同居）

このディレクトリは名前に反して「捨てるPOC」ではない。**本番 API が spawn する現役の Python スクリプト**と、
**結線されていない実験/開発道具**が同居している。消す前に必ず下の「生死表」を見ること。

`git ls-files _audio_poc/` に出るのは `*.py` だけ（＝ソースは版管理・巨大依存/生成物は `.gitignore`）。

## 生死表

| ファイル | 状態 | 本流の呼び口 | 正典 |
|---|---|---|---|
| `analyze.py` | ★**本番現役**・消すと音声解析が死ぬ | `apps/api/src/audio-analyze.ts`（`_audio_poc/.venv/bin/python analyze.py` を spawn・14参照） | `docs/research/audio-analysis-feasibility.md` |
| `accent.py` | ★**本番現役**・消すと仮歌アクセントが死ぬ | `apps/api/src/accent.ts`（pyopenjtalk・W-K1仮歌・8参照） | `docs/research/2026-07-15-kariuta-accent-feasibility.md` |
| `.venv/` | ★**本番現役**（上2つの実行環境・gitignore） | 上記 spawn の `PY`（`CM_AUDIO_PY` で差替可） | — |
| `f1_beatthis.py` | 実験（**本流未結線**・0参照） | なし＝拍/ダウンビート導入フィジビリの再現スクリプト | `docs/research/2026-07-15-allin1-beatthis-feasibility.md` |
| `f1_allin1.py` | 実験（**本流未結線**・0参照） | なし＝曲構造解析フィジビリの再現スクリプト | 同上 |
| `batch_key.py` / `compare.py` / `midi_truth.py` | 開発道具（0参照） | なし＝手元検証用のワンショット | — |

## gitignore で追跡しないもの（巨大依存・生成物）
- `.venv/`（本番）／`venv-f1/`（≈1.4G・F1実験）／`venv-f2/`（≈1.0G・F2実験）
- `BTC-ISMIR19/`（≈69M・コード/キー検出の外部repo）
- `*.wav` `*.pt` `*.mid` `*.mp3`（音源/モデル/生成物）／`*.out` `*.err`（実験の生ログ）／`__pycache__/`

## 掃除するときの判断
- **`analyze.py` / `accent.py` / `.venv/` は触らない**（本番が spawn する）。
- 実験スクリプト（`f1_*`）と道具（`batch_key`/`compare`/`midi_truth`）は結論を research doc に吸い上げ済み＝
  消しても知見は失わない。ただし極小（各1〜3KB）＋研究の再現材料なので、**venv を消せば実害ゼロ**（2.4G回収）。
  スクリプト本体は再現性のため残置が既定。
- F1（beat_this/allin1）を本流に結線する判断は上記 feasibility doc の残タスク参照。**未結線なら「取り込み済み」ではない**。
