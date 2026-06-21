# 到達・デプロイ（出先のスマホから家のアプリを叩く）

常時起動機（WSL2 on Windows11）で動かし、**出先のスマホから private に**叩くための手順。
公開はしない（未発表物を外に晒さない）＝**Tailscale の tailnet 内だけ**に出す。

## 全体像

```
スマホ(Tailscale) ──tailnet(暗号化)── Windows11(Tailscale) ──mirrored── WSL2: api :8787 ─┬ web(静的) も配信
                                                                                      └ worker / cm-search:8788 / cm-music-mcp:8790
```

- **api :8787 が単一の受け口**。web ビルド(`apps/web/dist`)があれば api が静的配信も担う＝外に出すポートは **8787 の1つだけ**。
- worker / cm-search / cm-music-mcp は内部（外に出さない）。

## 1. web をビルド（更新のたび）

```bash
pnpm --filter @cm/web build      # apps/web/dist を生成
```

## 2. 単一オリジンで api を起動（web も配信）

```bash
CM_DB=./data/cm.sqlite \
CM_MUSIC_MCP_URL=http://127.0.0.1:8790/mcp \
pnpm --filter @cm/api start      # = tsx src/main.ts。dist があれば "serving web from ..." と出る
```

→ ローカル確認: `http://localhost:8787/` でアプリ、`/facets` で API。
（dev で作業するときは従来どおり `pnpm --filter @cm/web dev`＝vite:5173＋proxy。）

## 3. WSL2 を mirrored networking に（家のLAN/ホストから見えるように）

既定の NAT だと WSL2 内のサービスは外から見えない。Windows11 22H2+ なら **mirrored** で解決。

Windows 側で `C:\Users\<あなた>\.wslconfig` を作成/編集:

```ini
[wsl2]
networkingMode=mirrored
```

PowerShell で反映:

```powershell
wsl --shutdown      # 一度落として再起動。以後 WSL の :8787 が localhost で共有される
```

## 4. Tailscale で private に到達

1. **Windowsホスト**に Tailscale を入れる（最も簡単）: https://tailscale.com/download/windows → `tailscale up`
2. アプリを **tailnet 内だけ**に出す（公開しない）:
   ```powershell
   tailscale serve --bg 8787
   ```
   → `https://<マシン名>.<tailnet>.ts.net` で **HTTPS・tailnet限定**で見える。
   ⚠ `tailscale funnel` は**公開**になるので使わない。
3. **スマホ**に Tailscale アプリを入れ、同じアカウントでログイン。
   ブラウザで `https://<マシン名>.<tailnet>.ts.net` を開く＝出先から家のアプリ。

## 5. 鍵をもう1枚（任意・多層防御）

`CM_TOKEN` を設定すると API にトークンゲートがかかる（tailnet限定＋トークンで二重ロック）。

## 6. 自動起動（任意）

WSL は `systemd=true`。user systemd service で api / worker / cm-search / cm-music-mcp を起動時に上げると、
PCを点ければ常時稼働。`tailscale serve` も Windows 起動時に復帰（--bg は永続）。

## トラブル

- スマホで開けない → ① `tailscale status` で両方 online か ② Windowsで `curl localhost:8787/facets` が通るか（mirrored 効いてるか）③ `tailscale serve status` で 8787 が出ているか。
- API だけ 404 → web を `pnpm --filter @cm/web build` し直す（本番ビルドは同一オリジンのルートを叩く）。
