---
title: 代理應用程式
h1_emoji: '🔀'
sidebar:
  order: 1
description: 把 Pingclair 放在應用程式前面、把流量分散到多個執行個體上，並在其中一個掛掉時繼續提供服務。
---

反向代理會在一個或多個應用程式執行個體前面放上一個公開位址，而且不必修改應用程式。本頁從單一上游開始，逐步建立一個具備健康檢查、逾時與備援的上游池，最後說明應用程式那一端看到的是什麼。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。只存在於伺服器 `main` 分支上的變動，以 **下一版** 標示。

## 🧾 開始之前

- 已安裝並執行 Pingclair（[安裝](/zh-TW/start/install/)），實驗期間先停掉服務：`sudo pc service stop`。
- 一個在本機連接埠上監聽的應用程式。這裡的範例使用 `127.0.0.1:3000`。
- 代理本身要用的連接埠：範例中是 `:8080`。

## 🔀 單一上游

```caddyfile
{
    admin 127.0.0.1:2019
}

http://:8080 {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost:8080/
```

回應來自應用程式，帶著它自己的標頭。`admin` 選項讓 `pingclair reload` 能連到執行中的伺服器；上面的 `SIGUSR1` 重載則不需要它（[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)）。

## ⚖️ 多個上游

用 `to` 列出各個執行個體，再選擇流量如何分配：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

若應用程式會回報是哪個連接埠回應的，六個請求會在兩個執行個體之間輪流：

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 行為 |
| --- | --- |
| `round_robin` | 依序每個上游一個請求。v0.2.0-rc.3 的預設值。 |
| `random` | 隨機挑選任一個上游。 |
| `least_conn` | 進行中連線最少的上游。 |
| `ip_hash` | 同一個用戶端位址永遠連到同一個上游。 |
| `first` | 原意是挑第一個可用的上游。在 v0.2.0-rc.3 中，它的行為與 `round_robin` 相同。 |
| `header <name>`、`cookie <name>`、`query <name>` | 依該欄位雜湊，讓同一個工作階段固定在一個執行個體上。 |
| `weighted_round_robin <w> …` | 每個上游一個權重，寫在同一行。 |

**下一版**：沒有 `lb_policy` 時，會隨機挑選上游，這也是 Caddy 的預設值；若要維持輪流，請寫 `lb_policy round_robin`。而 `first` 會真的固定在第一個可用的上游。

權重也可以設定在每個上游上，當每個執行個體各有理由時，這樣寫比較好讀：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000 {
            weight 3
        }
        to 127.0.0.1:3001
    }
}
```

⚠️ `lb_policy weighted_round_robin 3 1` 會把權重對應到寫在它上方的上游，所以 `to` 這幾行必須寫在它**之前**。順序反過來的話，`validate` 會以 `2 weights were given for 0 upstreams` 拒絕這個檔案。

標記為 `backup` 的上游，只有在其他所有上游都無法使用時才會被用到：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001 {
            backup
        }
    }
}
```

兩者都正常時，每個請求都會送到 `3000`。停掉那個行程，下一個請求就由 `3001` 回應。

## 🩺 健康檢查

沒有健康檢查時，上游要等到有請求失敗後才會被移出輪替。健康檢查會在背景探測每個上游，在使用者的請求抵達之前就把失敗的上游移除：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        health_check {
            path /health
            interval 2s
            timeout 1s
            status 200
            consecutive_failure 2
            consecutive_success 1
        }
    }
}
```

應用程式需要一個回應成本低的端點，這裡是 `/health`。每次狀態改變都會被記錄下來，要知道某個執行個體何時離開輪替，就看這裡：

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

以這份設定實測：停掉第二個執行個體後，所有流量都送往第一個；它恢復後，經過 `consecutive_success` 次成功的探測就重新加入。Caddy 的扁平寫法（`health_uri`、`health_interval`、`health_timeout`、`health_status`、`health_fails`、`health_passes`）設定的是同一套檢查。

## ⏱️ 逾時

逾時設定寫在 `reverse_proxy` 裡面的 `transport http` 區塊中，而不是直接寫在 `reverse_proxy` 底下：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3099
        to 127.0.0.1:3000
        transport http {
            connect_timeout 1s
            first_byte_timeout 1s
            read_timeout 30s
            write_timeout 30s
        }
    }
}
```

實測：`127.0.0.1:3099` 不接受任何連線時，`connect_timeout 1s` 會花掉一秒，接著請求改送到第二個上游重試，得到 `200`。若應用程式接受了連線，卻等 3 秒才送出本文，則改由 `first_byte_timeout 1s` 生效，用戶端會收到 `504`。

`dial_timeout` 不是 `reverse_proxy` 的選項；寫在那裡的話，`validate` 會以 `Unknown directive 'reverse_proxy: dial_timeout'` 拒絕這個檔案。`transport http` 裡對應的名稱是 `connect_timeout`。

## 🔁 以主機名稱指定上游

上游可以是主機名稱，而不是位址。容器重啟後換了 IP 位址時，需要的就是這個：

```caddyfile
{
    dns_refresh 5s
}

http://:8080 {
    reverse_proxy {
        to api.internal:3000
    }
}
```

名稱會依該間隔重新解析，每次重新解析都會記錄下來：

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

以 `/etc/hosts` 作為唯一依據實測：`api.internal` 指向 `127.0.0.1` 時由第一個執行個體回應；把檔案改成 `127.0.0.2` 後，在間隔時間內就改由第二個回應，不需重啟，也沒有任何請求失敗。查詢失敗時，會保留先前的位址繼續輪替。

## 📨 上游看到的是什麼

應用程式會收到原本的 `Host`，用戶端位址則放在常見的標頭裡：

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

如果前面還有另一個代理，除非它列在 `trusted_proxies` 中，否則這些標頭裡的位址會是那個代理的位址；[Cloudflare Tunnel 指南](/zh-TW/guides/cloudflare-tunnel/)說明了這種情況。

## ⚠️ 無法運作時

- **代理回傳 `502`。**沒有任何上游回應。請確認應用程式正在監聽（`sudo ss -ltnp | grep :3000`），而且位址相符。**下一版**：由 Pingclair 產生的 `502` 或 `504` 會帶有 `Proxy-Status: pingclair; error=…`；沒有這個欄位的，是應用程式自己回的。
- **停頓一陣子後出現 `504`。**有逾時觸發了：後端太慢是 `first_byte_timeout`，本文太慢是 `read_timeout`，主機始終不接受連線則是 `connect_timeout`。
- **`Unknown directive 'reverse_proxy: …'`。**這個選項屬於某個巢狀區塊——逾時放在 `transport http` 底下，檢查放在 `health_check` 底下——`validate` 會指出它拒絕的確切寫法。
- **設定變更沒有生效。**重載無法新增或搬移監聽器。新檔案有這類變更時，unit 的狀態列會列出變動的位址，執行 `sudo pc service restart` 即可套用。請見[以服務方式執行](/zh-TW/start/service/#-重載意味著什麼)。
- **每個請求都落在同一個執行個體上。**它是唯一健康的那一個。健康檢查的日誌會說明其他執行個體何時、為何離開輪替（`ConnectRefused`、`failure_statuses` 等）。

## 🧭 下一步

- [提供靜態網站](/zh-TW/guides/static-site/)：壓縮、快取，以及單頁應用程式的後備路由。
- [`reverse_proxy`](/zh-TW/reference/directives/#reverse_proxy)：指令參考。
- [以服務方式執行](/zh-TW/start/service/)：重載、重啟與日誌。
