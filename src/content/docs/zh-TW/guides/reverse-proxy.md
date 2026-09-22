---
title: 反向代理一個應用
h1_emoji: '🔀'
sidebar:
  order: 1
description: 把 Pingclair 放在應用前面，把流量分散到多個實例，並在其中一台掛掉時繼續服務。
---

反向代理是大多數人最初想要的東西：一個公開位址、後面一到多個應用實例、應用本身
不用改。本頁從單一上游開始，一路搭到帶健康檢查、逾時與備援的上游池，並展示應用
在另一側看到什麼。

## 🧾 開始之前

- 已經安裝並執行 Pingclair（[安裝](/zh-TW/start/install/)），實驗期間先停掉服務：
  `sudo pc service stop`。
- 一個在本地連接埠監聽的應用。範例用 `127.0.0.1:3000`。
- 代理自己的連接埠，範例用 `:8080`。

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

回應來自應用，它的回應標頭原樣透傳。`admin` 是為了讓 `pingclair reload` 能聯絡
執行中的伺服器；`SIGUSR1` 不需要它（[重載意味著什麼](/zh-TW/start/service/#-重載意味著什麼)）。

## ⚖️ 多個上游

用 `to` 列出實例，再選擇分流方式：

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

兩台都活著時，六次請求會交替；這是用「哪個連接埠回答了」的應用測出來的：

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | 行為 |
| --- | --- |
| `round_robin` | 依序每個上游一次。預設值。 |
| `random` | 隨機選一個上游。 |
| `least_conn` | 目前連線數最少的上游。 |
| `ip_hash` | 同一用戶端位址總是落到同一台。 |
| `first` | 第一個可用的上游。 |
| `header <名>`, `cookie <名>`, `query <名>` | 依該欄位雜湊，讓工作階段固定在一台。 |
| `weighted_round_robin <權重> …` | 在同一行給出每台上游的權重。 |

權重也可以逐台寫，當理由各不相同時更好讀：

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

⚠️ `lb_policy weighted_round_robin 3 1` 數的是已經寫出來的上游，所以 `to` 行必須
寫在**前面**。寫反了，`validate` 會用
`2 weights were given for 0 upstreams` 拒絕該檔案。

標了 `backup` 的上游只在其他上游全部不可用時才使用：

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

兩台都在時，所有請求都去 `3000`。停掉那個行程，下一個請求由 `3001` 應答。

## 🩺 健康檢查

沒有檢查時，上游要等到某個請求失敗之後才會被摘掉；有檢查則會提前摘掉：

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

應用需要一個便宜就能應答的端點（這裡是 `/health`）。每次狀態變化都會寫進日誌，
這也是查清某台為什麼被摘掉的辦法：

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

在這套設定上實測：殺掉第二台，全部流量轉到第一台；它回來後，在
`consecutive_success` 次成功探測之後重新加入輪替。真實 Caddyfile 常用的扁平寫法
（`health_uri`、`health_interval`、`health_timeout`、`health_status`、
`health_fails`、`health_passes`）設定的是同一個檢查。

## ⏱️ 逾時

逾時寫在 `reverse_proxy` 裡面的 `transport http` 區塊中，而不是直接寫在它下面：

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

實測：`127.0.0.1:3099` 什麼都不接受時，`connect_timeout 1s` 花掉一秒，請求會重試
到第二個上游並拿到 `200`。只接受連線、內容等三秒的應用會觸發
`first_byte_timeout 1s`，用戶端收到 `504`。

`dial_timeout` 不是 `reverse_proxy` 的選項；寫在那裡，`validate` 會用
`Unknown directive 'reverse_proxy: dial_timeout'` 拒絕。`transport http` 裡的名字
是 `connect_timeout`。

## 🔁 用網域指定上游

上游可以是名字而不是位址，這正是換了 IP 重新起來的容器需要的：

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

依這個間隔重新解析網域，變化會寫進日誌：

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

把 `/etc/hosts` 當作唯一事實來源實測：把 `api.internal` 指向 `127.0.0.1` 時由第一台
應答；改成 `127.0.0.2` 後，在一個間隔內改由第二台應答，不需要重啟，也沒有請求
失敗。解析失敗時，輪替裡會保留上一個位址。

## 📨 上游看到什麼

應用收到原始的 `Host`，以及依慣例放在標頭裡的用戶端位址：

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

如果前面還有一層代理，除非它被列進 `trusted_proxies`，這些標頭裡的位址就是那一層
的位址；[Cloudflare Tunnel 指南](/zh-TW/guides/cloudflare-tunnel/) 講的正是這種
情況。

## ⚠️ 出問題時

- **代理回 `502`。** 沒有任何上游應答。確認應用在監聽
  （`sudo ss -ltnp | grep :3000`），位址也沒寫錯。
- **停頓後 `504`。** 有逾時觸發：後端慢是 `first_byte_timeout`，內容慢是
  `read_timeout`，對方從不接受連線是 `connect_timeout`。
- **`Unknown directive 'reverse_proxy: …'`。** 該選項屬於巢狀區塊 —— 逾時在
  `transport http` 下，檢查在 `health_check` 下 —— `validate` 會指明它拒絕的
  確切寫法。
- **設定改動沒有生效。** 重載套用的是策略，不是新的監聽器；當重載新增或移動了
  監聽器時，unit 的 status line 會指出變動的位址，`sudo pc service restart`
  才是套用它的指令。見 [以服務方式執行](/zh-TW/start/service/#-重載意味著什麼)。
- **所有請求都落到同一台。** 那是唯一健康的上游。健康檢查日誌會說明其他幾台何時
  因何被摘掉（`ConnectRefused`、`failure_statuses` 等）。

## 🧭 下一步

- [提供靜態網站](/zh-TW/guides/static-site/)：壓縮、快取，以及單頁應用的後備。
- [`reverse_proxy`](/zh-TW/reference/directives/#reverse_proxy)：指令參考。
- [以服務方式執行](/zh-TW/start/service/)：重載、重啟與日誌。
