---
title: 跑在 Cloudflare Tunnel 後面
h1_emoji: '☁️'
sidebar:
  order: 5
description: 透過 Cloudflare Tunnel 發佈站台，讓源站不需要任何入站連接埠，並讓 Pingclair 的日誌顯示真實用戶端而不是連接器。
---

Cloudflare Tunnel 把源站向外連接：`cloudflared` 主動撥號到 Cloudflare，Cloudflare
再把請求沿這條連線送回來。沒有東西監聽公開連接埠，邊緣終結 TLS，源站只看到回送
位址上的明文 HTTP。本頁把它搭起來，並修掉每次都會先踩的那個坑 —— 所有請求都記成
`127.0.0.1`。

## 🧾 開始之前

- 網域在 Cloudflare 帳號裡，並且能用 Zero Trust。
- `cloudflared` 與 Pingclair 在同一台主機上，Pingclair 正在提供站台
  （[提供靜態網站](/zh-TW/guides/static-site/)）。
- 用儀表板（Zero Trust → Networks → Tunnels），或者一個帶 **Cloudflare Tunnel:
  Write** 與區域 **DNS: Edit** 的 API token。範例走 API，需要設定 `$CF_TOKEN`、
  `$ACCOUNT`、`$ZONE`。

## 🌐 建立 tunnel

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` 讓 tunnel 變成**遠端管理**：ingress 規則存在 Cloudflare
一側並透過 API 下發，連接器旁邊不需要寫任何檔案。

連接器憑證要另一次呼叫：

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

這個 token 是機密，它讓一台主機加入 tunnel。當成密碼對待，洩漏就輪換。

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

連接器會向最近的 Cloudflare 站點註冊四條連線，預設走 QUIC：

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 把網域接到 tunnel

ingress 規則決定哪個網域到達哪個源站服務：

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

最後一條是接手規則：其他網域得到 `404`，而不是預設站台。

接著把網域指向 tunnel，代理要打開：

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

`server: cloudflare` 是邊緣在應答；源站是透過 tunnel 到達的，沒有開放任何連接埠。

## 🎯 讓源站看到用戶端

預設情況下每個請求都從連接器經回送位址到達，存取日誌對「用戶端是誰」一無所知：

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` 告訴 Pingclair 哪些對端可以聲明用戶端位址。連接器跑在同一台
主機上，所以回送位址網段就夠：

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

同一個請求在該選項前後的實測：

```text
remote_ip=127.0.0.1          # 之前
remote_ip=16.162.199.171     # 之後：發起請求的用戶端
```

這個設定也讓基於 IP 的限速與規則在 tunnel 後面變得有意義。它在啟動時確立，所以
改動需要重啟而不是重載，見
[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)。

## ⚠️ 出問題時

- **`HTTP/2 530` 與 `error code: 1033`。** tunnel 沒有連接器。源站上的
  `systemctl is-active cloudflared` 能說明狀態；連接器註冊後幾秒內請求就恢復
  `200`。
- **請求打到別的站台，或 `404`。** ingress 規則依序匹配並以接手規則結束；先檢查
  規則裡的網域拼寫，再懷疑 DNS。
- **邊緣回 `502`。** 連接器在，但源站服務拒絕了連線：規則指的那個連接埠上
  Pingclair 沒有監聽。
- **存取日誌總是 `127.0.0.1`。** 缺 `trusted_proxies`，見上。
- **網域不解析。** 記錄必須是指向 `<tunnel-id>.cfargotunnel.com` 的**代理** CNAME；
  灰雲記錄會直接繞過 tunnel。
- **連接器 token 洩漏。** 刪除該 tunnel 的 token 並用新的重新安裝服務；舊憑證
  本來也無法從 API 取回。

## 🧭 下一步

- [提供靜態網站](/zh-TW/guides/static-site/)：這些範例指向的源站。
- [TLS 能調什麼](/zh-TW/guides/tls-tuning/)：邊緣不終結 TLS 時，源站能用憑證
  做什麼。
- [以服務方式執行](/zh-TW/start/service/)：源站上的 unit，以及 `trusted_proxies`
  那條提醒引用的重載語意。
