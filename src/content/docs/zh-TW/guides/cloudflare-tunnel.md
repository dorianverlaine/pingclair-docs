---
title: 在 Cloudflare Tunnel 後方執行
h1_emoji: '☁️'
sidebar:
  order: 5
description: 透過 Cloudflare Tunnel 發布網站，讓源站不需要開放任何對內連接埠，並讓 Pingclair 的日誌顯示真正的用戶端，而不是 connector。
---

Cloudflare Tunnel 讓源站主動向外連線：`cloudflared` 撥號到 Cloudflare，Cloudflare 再沿著這條連線把請求送回來。沒有任何東西在公開連接埠上監聽，TLS 由邊緣終結，源站在 loopback 上收到的是明文 HTTP。本頁會把這套架構建立起來，再解決每個人遇到的第一個問題：每個請求都被記錄成來自 `127.0.0.1`。

📌 本頁描述的是 Pingclair 最新公開的發行版 **v0.2.0-rc.3**。

## 🧾 開始之前

- 網域已在 Cloudflare 帳號中，且可以使用 Zero Trust。
- `cloudflared` 與 Pingclair 在同一台主機上，且 Pingclair 正在提供網站（[提供靜態網站](/zh-TW/guides/static-site/)）。
- 使用儀表板（Zero Trust → Networks → Tunnels），或一個對該 zone 具有 **Cloudflare Tunnel: Write** 與 **DNS: Edit** 權限的 API token。這裡的範例使用 API，並把 `$CF_TOKEN`、`$ACCOUNT` 與 `$ZONE` 分別設為 token、帳號 ID 與 zone ID。

## 🌐 建立 tunnel

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` 代表這個 tunnel 是**遠端管理**的：它的 ingress 規則存放在 Cloudflare，透過 API 推送，所以 connector 旁邊不需要寫任何檔案。

connector 的憑據要另外呼叫取得：

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

這個 token 是機密：任何主機拿到它都能加入這個 tunnel。請把它當成密碼看待，外洩時要輪替。

## 🔌 連接主機

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

connector 會向附近的 Cloudflare 據點開啟四條連線，預設透過 QUIC：

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 路由一個主機名稱

ingress 規則決定哪個主機名稱會連到哪個源站服務：

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

最後一條是全部接住的規則：任何其他主機名稱的請求都會得到 `404`，而不會抵達源站。

接著把名稱指向 tunnel，並開啟代理：

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

從任何地方：

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` 表示回應的是邊緣。源站是透過 tunnel 連到的，沒有為它開放任何對內連接埠。

## 🎯 讓源站看見用戶端

每個請求都是從 loopback 上的 connector 抵達，所以存取日誌預設記錄的是 connector，而不是用戶端：

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` 列出可以在轉送標頭中聲明用戶端位址的對端。connector 跑在同一台主機上，所以清單只需要 loopback：

```caddyfile
{
    admin 127.0.0.1:2019
    trusted_proxies 127.0.0.1/32
}

http://:80 {
    root * /srv/site
    file_server
}
```

以同一個請求在加上這個選項前後實測：

```text
remote_ip=127.0.0.1          # before
remote_ip=16.162.199.171     # after: the client that started the request
```

依用戶端的速率限制與 `client_ip` 匹配器，也是靠這個設定才能在 tunnel 後方看見真正的用戶端。它在啟動時讀取，所以變更後需要重啟，而不是重載（[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)）。

**下一版**：`remote_ip` 匹配器匹配的是連線本身的對端，在 tunnel 後方永遠是 connector。要匹配用戶端，請用 `client_ip`；在 v0.2.0-rc.3 中，兩個匹配器看到的都是轉送過來的用戶端。

## ⚠️ 無法運作時

- **`HTTP/2 530` 並帶有 `error code: 1033`。**這個 tunnel 沒有 connector。在源站上執行 `systemctl is-active cloudflared` 可以知道它是否在執行；connector 註冊後幾秒內，請求就會恢復回應 `200`。
- **請求連到了別的網站，或得到 `404`。**ingress 規則依序匹配，最後是全部接住的規則；怪罪 DNS 之前，先檢查規則中的主機名稱拼寫。
- **邊緣回傳 `502`。**connector 正常，但源站服務拒絕了連線：Pingclair 沒有在規則指定的連接埠上監聽。
- **存取日誌永遠顯示 `127.0.0.1`。**缺少 `trusted_proxies`，如上所述。
- **主機名稱無法解析。**這筆記錄必須是指向 `<tunnel-id>.cfargotunnel.com` 且開啟代理的 CNAME；灰色雲朵的記錄會完全繞過 tunnel。
- **connector token 外洩了。**輪替 tunnel 的 token，並用新的 token 重新安裝服務。

## 🧭 下一步

- [提供靜態網站](/zh-TW/guides/static-site/)：這些範例指向的源站。
- [TLS：可以調整什麼](/zh-TW/guides/tls-tuning/)：當邊緣不終結 TLS 時，源站能用憑證做什麼。
- [以服務方式執行](/zh-TW/start/service/)：源站上的 unit，以及 `trusted_proxies` 那段提到的重載語意。
