---
name: restart
description: creative_managerのスタック再起動＝dist焼き・cm-api再起動・孤児掃除・疎通確認。ユーザーが「再起動して」「実機に反映して」「dist焼いて」「apiが変」「EADDRINUSE」「検索が死んでる」と言ったとき、またはコード/UI変更を実機反映するときに使う。
---

# スタック再起動

正体は `scripts/restart.sh`（systemd世代の冪等コマンド）。旧 `scripts/start-all.sh` は**使わない**（apiをtsx watchで起動し、systemdと併走するとEADDRINUSE孤児を作る＝2026-07-14実害）。

## モード選択

| 状況 | コマンド |
|------|---------|
| apps/web を変更した（UI反映が要る） | `bash scripts/restart.sh --build` |
| apps/api だけ変更（tsxはソース起動＝再起動で反映） | `bash scripts/restart.sh` |
| 検索がおかしい/semanticOk:false が続く | `bash scripts/restart.sh --search` ※再構築~10分・完了までクエリ無応答が仕様 |
| 状態を見るだけ | `bash scripts/restart.sh --status` |

## 手順

1. 迷ったら先に `--status` で現状（systemd/リスナー/health）を見る
2. モードを選んで実行。スクリプトが孤児掃除→再起動→/health確認まで面倒を見る
3. 出力の `✅ api 応答OK` と `/health` の `deps`（cm-search疎通）を確認して結果を報告
4. `--build` 時はユーザーに**ブラウザ再読み込み**を促す
5. ❌ の場合は `journalctl --user -u cm-api.service -n 30` を読んで原因を報告（EADDRINUSEなら孤児掃除の取り漏れ＝`ss -tlnp | grep 8787` で犯人特定）

## 背景知識

- api は systemd `cm-api.service`（Tailscale IPにバインド・webはdist配信の単一オリジン）。CM_HOST は `~/.config/creative-manager.env`
- cm-search は `cm-search.service`（:8788 loopback）。長期稼働でハングした前科あり（2026-07-14）＝症状は「ソケット生存・無応答・チャット/検索が0件劣化」
- ユーザー自身が打つ場合は `! bash scripts/restart.sh --build` （Claude Code の `!` プレフィックス）
