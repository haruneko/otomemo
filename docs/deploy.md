# 到達・デプロイ（出先のスマホから家のアプリを private に叩く）

常時起動機（WSL2 on Windows11・mirrored networking）で動かし、**出先のスマホから自分だけ**叩く。
方針（design #18/#36 決定）：**Tailscale tailnet 限定に露出。アプリ側パスワードは持たない**
（tailnet＝自分の端末だけ＝ネットワーク層が鍵）。`tailscale funnel`（公開）は使わない。

## 全体像

```
スマホ(Tailscale) ──tailnet(暗号化)── Windows11(Tailscale serve) ──localhost── WSL2: api :8787 ─┬ web(静的)も配信
   家PC(Tailscale) ─┘                                                                          └ worker / cm-search:8788 / cm-music-mcp:8790(内部)
```

- api は **localhost バインド**（`CM_HOST` 既定 `127.0.0.1`）＝LANにもネットにも出ない。
- 外へは Windows の `tailscale serve 8787` が tailnet 限定で出す（mirrored で Windows は WSL の localhost を共有）。
- web は api が単一オリジン配信＝**外に出すのは 8787 の1ポートだけ**。worker系は localhost 内部。

## 1. web をビルド（更新のたび・1コマンド）

```bash
pnpm --filter @cm/web build      # apps/web/dist を生成
```

## 2. api を起動（web も配信・localhost 限定）

```bash
CM_DB=./data/cm.sqlite \
CM_MUSIC_MCP_URL=http://127.0.0.1:8790/mcp \
pnpm --filter @cm/api start      # "serving web from ..." / "host: 127.0.0.1" と出る
```

- ローカル確認: `http://localhost:8787/`（アプリ）・`/facets`（API）。
- dev 作業中は従来どおり `pnpm --filter @cm/web dev`（vite:5173＋proxy）。

## 3. Tailscale（初回だけ・私設ネットを作る）

1. **家の Windows** に Tailscale を入れる: https://tailscale.com/download/windows → 起動して**ログイン**（Google等のアカウントでOK）。これで家PCが tailnet に参加。
2. アプリを **tailnet 内だけ**に出す（PowerShell）:
   ```powershell
   tailscale serve --bg 8787
   ```
   → `https://<マシン名>.<tailnet名>.ts.net` で HTTPS・tailnet 限定で見える。
   （`tailscale serve status` で確認。`tailscale funnel` は公開になるので使わない。）
3. **スマホ**に Tailscale アプリを入れ、**同じアカウントでログイン**。
   ブラウザで `https://<マシン名>.<tailnet名>.ts.net` を開く＝出先から家のアプリ。

これで完了。tailnet に入れるのは自分のログイン端末だけ＝**他人は到達すらできない**（未発表ネタも claude -p も守られる）。パスワード入力は無し。

## 4. 任意：追加ロック / 家族公開

- `CM_TOKEN` を設定すると `x-cm-token` ヘッダ必須の追加ゲートがかかる（既定 OFF）。LAN を直開放する・家族に配るなど tailnet 境界を緩めるときに有効化（その場合はクライアント側のトークン送出＝別途実装が要る）。
- LAN 直アクセスを敢えて使うなら `CM_HOST=0.0.0.0` で起動（mirrored で 192.168.0.200 から見える。同じ LAN の他人にも見える点に注意）。

## 5. 自動起動（任意）

WSL は `systemd=true`。user systemd service で api / worker / cm-search / cm-music-mcp を起動時に上げると常時稼働。`tailscale serve --bg` は Windows 起動時に復帰。

## トラブル

- スマホで開けない → ① 両端末 `tailscale status` が online か ② 家PCで `curl localhost:8787/facets` が通るか（api 起動＆mirrored）③ `tailscale serve status` に 8787 が出てるか。
- API だけ 404 → `pnpm --filter @cm/web build` し直す（本番ビルドは同一オリジンのルートを叩く）。
