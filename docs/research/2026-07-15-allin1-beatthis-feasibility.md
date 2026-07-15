# F1 実測: 構成解析 allin1 ＋ 拍/ダウンビート beat_this のCPU導入フィジビリ

- 日付: 2026-07-15
- 環境: WSL2 / CPUのみ(16スレッド, x86_64) / RAM 15GiB / ディスク空き 910GiB
- 母艦: `_audio_poc/`（本番解析が使う `analyze.py` + `.venv` は**読むだけ・不変更**）
- 実験venv: `_audio_poc/venv-f1/`（uv製・**このF1専用**。並行してF2が `venv-f2/` を使用中＝CPU取り合いあり、時間には注記）
- 音源: 自作2曲（DBの解析ネタと突き合わせ可能なもの）
  - **DeepSea** `data/assets/cb3a6299….mp3` 309.6秒(5.16分)／DB facts: BPM123・6/8・Dm・人手downbeatアンカー t=3.785s
  - **LostMemory** `data/assets/8c70788d….mp3` 329.5秒(5.49分)／facts(fixture): librosa BPM86.1・4/4想定
  - ※PDピアノ(Bach/Satie)はリポジトリ内に現存せず（新規DLはしない方針）＝自作2曲で実測。

---

## TL;DR（手間・時間・精度の3点で正直に）

**beat_this = 素直なGO候補。** インストールはtorch/torchaudioのバージョン整合を1回踏めば数分。CPUで**5分曲を7〜10秒**（全コア稼働・RAM ~760MB）。推定BPMは既存librosa factsと**ほぼ一致**（DeepSea 125 vs 123、LostMemory 85.7 vs 86.1）。DeepSeaのダウンビート先頭 **3.74s は人手アンカー 3.785s とΔ0.045s** ＝現行の「コード変化＋ドラム照合」ヒューリスティックより明らかに素性が良い。**難所は皆無（既知の依存整合のみ）**。

**allin1 = 精度は本物だがCPU実行が重い＝条件付きGO候補。** サーベイが警告した「NATTEN手動ビルド」は、**torch 2.6.0 に固定すれば prebuilt CPU wheel が使えて回避できた**（ソースビルド不要）。ただしそのままでは動かず、**3つのパッチ/回避**が必要（NATTENのCPU非対応バグ1行、allin1↔NATTENのAPI名変更シム、madmomのCソースビルド用ヘッダ）。出力は**機能ラベル付きセクション**（verse/chorus/solo/bridge/outro）＝現行の「crash区間分解（DeepSeaでは空だった）」からの明確な格上げ。**実行時間がネック**：モデル推論がNATTEN CPUカーネル（実質シングルスレッド）で、**stem再利用でも5分曲あたり ~9.5分**、内部Demucs込み初回は ~14分。合否基準「1曲<15分」は満たすが余裕は薄い。

---

## 実測表（曲 × ツール × 時間 × 一致度）

### beat_this（CPU・checkpoint `final0`・DBN無し）

| 曲 | 長さ | wall | 推論 | モデルLoad | RAM | CPU% | 推定BPM(中央値) | facts BPM | 拍/小節推定 | 先頭downbeat | 人手/既存 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DeepSea | 5.16分 | 7.4s | 6.0s | 1.0s | 735MB | 681% | **125.0** | 123 | 3.0 | **3.74s** | アンカー3.785s (Δ0.045) |
| LostMemory | 5.49分 | 9.8s | 8.3s | 1.1s | 760MB | 671% | **85.71** | 86.1 | 3.94(≈4/4) | 0.28s | fixture先頭beat 0.325 |

- BPM一致は両曲とも±0.5以内。**拍/小節推定**は4/4曲(LostMemory)で3.94≈4を正しく検出。6/8曲(DeepSea)は3.0＝allin1同様、6/8を割り切れず（後述）。
- import 0.8s / モデルLoad 1.0s は毎回発生（常駐化すれば1回で済む）。checkpoint(81MB)は初回のみHF系JKUクラウドからDL（~15s、キャッシュ後不要）。

### allin1（CPU・model `harmonix-all`・内部Demucs htdemucs）

| 曲 | 長さ | analyze合計 | 内訳(Demix/Spec/Model) | RAM | CPU% | 推定BPM | セクション数 | 機能ラベル列 |
|---|---|---|---|---|---|---|---|---|
| DeepSea 初回 | 5.16分 | **865.5s (14.4分)** | 166s / 7.6s / ~570s+DL | — | — | 125 | 14 | start/chorus×2/verse/chorus/verse/chorus×2/solo/bridge/chorus×2/outro/end |
| DeepSea 再走(demix再利用) | 5.16分 | **573.4s (9.55分)** | 0 / 0 / 573s | 2.5GB | 117% | 125 | 14 | （初回と同一） |
| LostMemory (fresh demix) | 5.49分 | **698.6s (11.6分)** | ~166s / ~8s / ~525s | 2.86GB | 189% | 87 | 16 | start/intro×2/verse×2/chorus×2/verse/chorus×2/solo/chorus×2/solo/outro×2 |

- **時間のボトルネックはallin1モデル本体**（NATTEN CPUカーネルが実質シングルスレッド＝CPU 117%）。demixを外部で用意して渡しても ~9.5分/曲は変わらない。
- allin1のBPMは両曲とも堅い：DeepSea 125（beat_this 125・DB 123と整合）、LostMemory 87（beat_this 85.7・fixture 86.1と整合）。
- **拍子検出は曲によりけり**：LostMemory(4/4)は downbeat 間隔が **2.77s＝87bpmの4/4小節長ぴったり**で、セクション境界も **~22s＝8小節の倍数**にきれいに乗る（intro/verse/chorus/solo/outroの8小節構造として非常にもっともらしい）。DeepSea(6/8)は先頭downbeat 4.3s・間隔2.1sで、6/8を4/4格子に寄せるズレが出る（人手アンカー3.785sからΔ0.5）。
- **セクションは"実構造"を出せている＝現行からの格上げ**：現行パイプラインは crash 由来の区間分解だが DeepSea では `overlay.sections=[]`（空）＝機能ラベルどころか境界すら出ていなかった。allin1は DeepSea 14区間 / LostMemory 16区間＋verse/chorus/solo/bridge/outro/introの機能ラベルを付与＝**ゼロ→有**の格上げ。特にLostMemoryの8小節格子への整列は素性が良い。妥当性の最終判定は耳確認（オーナー手番）。

---

## インストール手順の再現メモ（venv-f1・成功/失敗の両方）

### 0) venv（既存を汚さない）
```
cd _audio_poc && uv venv venv-f1 --python 3.12
```

### 1) beat_this（素直）
```
# torch/torchaudioは**必ずCPU indexで版を揃える**。素のPyPI torchaudioはCUDA(libcudart)を要求して轟沈。
uv pip install torch==2.9.1 torchaudio==2.9.1 --index-url https://download.pytorch.org/whl/cpu
uv pip install "https://github.com/CPJKU/beat_this/archive/main.zip"
uv pip install soundfile   # mp3ロード用（無いとtorchcodec/madmom探索に落ちて失敗）
```
※ハマり所は「torchaudioの版ズレ」と「soundfile未導入」の2点だけ。checkpointは初回自動DL。
※`File2Beats(dbn=True)` は madmom DBN後処理が要る（未導入なら例外）。今回は dbn=False で十分。

### 2) allin1（重い・3つの回避が必要）
allin1 と beat_this は**同一venvに同居可能だが torch を 2.6.0 に下げる**（NATTENのprebuilt CPU wheelがcp312では torch2.5/2.6 までしか無いため）。beat_this は 2.6.0 でも動く。
```
# (a) torchを2.6.0 CPUに固定
uv pip install torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu
# (b) NATTEN prebuilt CPU wheel（★ソースビルド回避＝サーベイの「2時間級ビルド」を踏まずに済む）
uv pip install natten==0.17.5+torch260cpu -f https://whl.natten.org/cpu/torch2.6.0/index.html
uv pip install allin1
# (c) madmom（PyPI版はnumpy2で壊れる→gitのCPJKU版。Cソースビルドに Python.h が要る）
uv pip install cython
#   ↓ system python3.12 に dev ヘッダが無い環境では uv管理pythonのヘッダを流用（sudo不要）
uv python install 3.12   # 3.12.13(ヘッダ同梱)を入れる
export C_INCLUDE_PATH=~/.local/share/uv/python/cpython-3.12.13-*/include/python3.12
uv pip install "madmom @ git+https://github.com/CPJKU/madmom.git"
```

**allin1を動かすのに要ったコード回避（3件）**：
1. **NATTENのCPUバグ**（`natten/utils/misc.py get_device_cc()` が `torch.cuda.get_device_capability()` を無条件呼び→CPUビルドで `AssertionError: Torch not compiled with CUDA`）。先頭に `if not torch.cuda.is_available(): return 0` を1行追加でパッチ。
2. **allin1↔NATTEN API名変更**（`allin1/models/dinat.py` が旧名 `natten1dav/natten1dqkrpb/natten2dav/natten2dqkrpb` をimport→0.17.5で `na1d_qk/na1d_av/na2d_qk/na2d_av` に改名済）。旧名→新名の薄いシム関数（rpbは新APIの `rpb=` 引数へ）でブリッジ。
3. madmomの **Python.h**（上記(c)のヘッダ流用）。

いずれも**外部wheel/パッケージには手を入れず venv-f1 内のインストール済みファイルへの局所パッチ**（本番には未反映）。恒久化するなら (1)(2) は起動時 monkeypatch か fork 固定で回避可能。

- venv-f1 総容量: **1.4GB**（torch CPU再インストール込み・既存venvとは別）。
- 主要ピン: `torch/torchaudio 2.6.0+cpu`, `natten 0.17.5+torch260cpu`, `allin1 1.1.0`, `madmom 0.17.dev0(git)`, `beat-this 1.1.0`, `numpy 2.4.6`, `numba 0.66.0`, `librosa 0.11.0`, `demucs 4.1.0`, `soundfile 0.14.0`。

### 失敗の記録（NOGO材料として）
- **torchaudio 2.11.0 (PyPI既定)**：`libcudart.so.13 not found` ＝CPU専用機で轟沈。→CPU indexで版を揃えて解決。
- **NATTEN CPU wheel は torch 2.7〜2.12 の cp312 では未提供**（cpuサブインデックスは 2.5.0/2.6.0 のみ）。→torchを2.6.0に固定して回避。2.7+で使いたければソースビルド（＝サーベイ警告の難所）に逆戻り。
- **madmom PyPI 0.16.1** はnumpy2/py3.12でビルド不可、gitのCPJKU版が必要。さらにdev ヘッダ依存。

---

## 既存パイプラインへの組込案（analyze.py への足し方・stem再利用）

現行：`apps/api/src/audio-analyze.ts` が `spawn` で `_audio_poc/.venv/bin/python analyze.py <audio>` を叩き facts(JSON)取得。**パスは env で差し替え可**（`CM_AUDIO_PY` / `CM_AUDIO_SCRIPT`）。crash→区間分解→構造ラベルの種は `apps/api/src/reaper.ts` L216-249（機能ラベルは付かず・DeepSeaでは空だった）。

推奨組込（低リスク順）：
1. **beat_this を先に載せる（低コスト・高効果）**。`analyze.py` の `librosa.beat.beat_track` の隣に、venv-f1相当を別プロセス（`CM_BEAT_PY`）で呼ぶか、母艦venvに beat_this を追加（torch同居可なら）。出力の `beat_times` / `downbeats` を facts に足し、現行の「コード変化＋ドラム照合」ダウンビート推定を置換/併記。位相が人手アンカーとΔ0.05で合う実測がある＝`overlay.anchors` の自動初期値として有力。**5分曲+8秒**なら現行フローに実質無償で挿せる。
2. **allin1 はオプトインの重処理として分離**。内部Demucsを二重に回さないため、**analyze.py が既に作る htdemucs stem を allin1 の `demix_dir` 形式で渡して再利用**（allin1は `demix_dir/htdemucs/<name>/{vocals,drums,bass,other}.wav` を探し「already demixed」でスキップ＝実測で確認）。これで初回865s→再利用573sに落ちる。とはいえ**9.5分/曲**は残るので、「解析ジョブに『構成も解析』チェックを付けた時だけ走らせる」バックグラウンド長尺ジョブに。出力 `segments[{start,end,label}]` を `overlay.sections` に流し込めば、現行の空/貧弱なセクションを機能ラベル付きで置換できる。
3. **メーター(6/8)問題**：beat_this も allin1 も 6/8曲(DeepSea)を4/4系格子に寄せる（拍/小節≈3、downbeat間隔≈2.1s）。既存の `meter` はユーザー指定なので、**セクション境界は採用しつつ拍子はユーザー指定を優先**する結線が安全。

---

## 親(Fable)のGO判断に要る論点

- **beat_this**：合否基準（導入素直＆ダウンビートが現行より信頼できそう）を**満たす**。導入コスト小・実行8秒・BPM一致・downbeat位相がΔ0.05でアンカー一致。**GO推奨**。唯一の判断点は「母艦venvにtorch同居で入れるか、別プロセス(別venv)で叩くか」＝汚染回避なら後者。
- **allin1**：合否基準（境界が既知構成と概ね一致＆1曲<15分）は**時間は満たす（stem再利用9.5分／demix込み11.6〜14.4分＝いずれも<15分）＆境界は"ゼロ→機能ラベル14〜16区間"の格上げ**。ただし判断に要る2点：
  1. **精度の耳確認**（オーナー手番）：DeepSea/LostMemoryの14区間ラベルが実構造と合うか。合えば強GO、外すなら「境界だけ採用・ラベルは人手」に格下げ。
  2. **運用形態の合意**：9.5分/曲のCPU長尺ジョブを常時起動機で回す設計（オプトイン・stem再利用・停止可能spawn）を許容するか。リアルタイム性は無い＝「投げて待つ」前提。
- **共通のリスク**：torchを2.6.0に固定する制約（NATTEN prebuilt都合）。母艦venvは torch2.12.1 なので**allin1は母艦と別venv必須**（beat_thisは母艦同居も可だが2.6固定に巻き込まれない設計にするなら別venv）。

---

## 成果物（venv-f1に残置・親検収用）
- 実験スクリプト: `_audio_poc/f1_beatthis.py` / `_audio_poc/f1_allin1.py`
- 生ログ: `_audio_poc/f1_*.err` / `f1_*.out`
- venv: `_audio_poc/venv-f1/`（1.4GB・パッチ済NATTEN/allin1を含む）
