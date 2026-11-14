---
title: 使用 Layer 4 路由 TCP
h1_emoji: '🔌'
sidebar:
  order: 6
description: 依 TLS ClientHello 的 SNI、ALPN 與來源 IP 路由原始 TCP 連線，設定有界代理與動態 DNS，並觀察 Layer 4 工作階段。
---

Layer 4 路由會轉送原始 TCP 連線，不終止 TLS。當路由需要 SNI 或 ALPN
中繼資料時，Pingclair 會讀取 TLS ClientHello 的開頭、選取一條路由、重播已讀取的
位元組，再以不解析應用程式協定的方式轉送兩個方向。

本指南說明 **v0.3.0-alpha.1** 首次提供的 Layer 4 支援。設定使用 Caddy 形式的
`layer4` 區塊；轉送限制沿用 nginx stream 的名稱與語意。

## 🧾 開始之前

- Linux 上的 Pingclair `v0.3.0-alpha.1` 或更新版本
  ([安裝](/zh-TW/start/install/))。
- 自行完成 TLS 的 TCP 服務。範例使用 `127.0.0.1:9443`。
- 未供 HTTP 網站、Admin API 或其他程序使用的監聽連接埠。範例使用
  `8443`。
- 編輯設定時先停止服務：`sudo pc service stop`。

## 🧠 Layer 4 路由如何運作

Pingclair 接受 TCP 連線、套用全域與監聽器的來源 IP 封鎖清單；路由需要時，先讀取
有界的 TLS ClientHello，選取第一條符合的路由，再連接該路由的上游。已預讀的位元組
會依原順序寫入上游，之後才轉送尚未讀取的用戶端位元組。

TLS 不會在此終止。上游收到用戶端的 ClientHello 並執行握手。HTTP 標頭、HTTP/2
訊框、HTTP/3 封包與其他應用程式協定內容，在這一層都只是不透明的位元組。

## 📌 語法相容性

設定沿用 caddy-l4 `layer4` 區塊的結構。下表列出 `v0.3.0-alpha.1` 接受的
形式：

| 形式 | 支援 |
| --- | --- |
| 全域選項中的 `layer4 { … }` | 支援。 |
| 例如 `:8443 { … }` 的位址區塊 | 支援，但每個區塊只能有一個數字 IP 位址與連接埠。 |
| `@name tls`、`sni`、`alpn` 與 `remote_ip` | 支援 TLS 存在、完整 SNI 值、區分大小寫的 ALPN 識別碼，以及 IP 或 CIDR 對端比對。 |
| `route [@name …] { proxy … }` | 支援。路由依宣告順序評估，第一條符合的路由優先。 |
| `proxy host:port` | 支援一個靜態來源。靜態主機名稱只在載入或重新載入時解析。 |
| `proxy { dynamic a { … } }` | Pingclair 用於背景 DNS 重新整理的擴充形式，不是通用的 caddy-l4 處理常式。 |
| 其他 caddy-l4 匹配器、處理常式與 proxy 選項 | 驗證時拒絕。 |

每個監聽器區塊各自擁有一個預先綁定的 socket、連線准入數、轉送限制與記錄器。
同一套政策需要用於多個位址時，請為每個位址宣告一個監聽器區塊；多條路由仍可共用
同一個監聽器。

## 🔌 依 SNI 路由 TLS

下列設定將 `app.example.com` 的 TLS 連線送到自行終止 TLS 的後端：

```caddyfile
{
    admin off
    auto_https off
    layer4 {
        :8443 {
            @app tls sni app.example.com
            route @app {
                proxy 127.0.0.1:9443
            }
        }
    }
}
```

`tls sni` 比對完整的 Server Name Indication 值，ASCII 大小寫不影響結果。其他
SNI 值的連線不會符合這條路由。

`alpn` 條件區分大小寫：

```caddyfile
{
    layer4 {
        :8443 {
            @api tls {
                sni api.example.com
                alpn h2
            }
            route @api {
                proxy 127.0.0.1:9444
            }
        }
    }
}
```

同一個匹配器區塊內的條件以 AND 組合。路由列出多組匹配器時，各組之間以 OR
組合。

## 🧭 加入來源位址路由與後備路由

`remote_ip` 比對 TCP 對端，不使用轉送標頭：

```caddyfile
{
    layer4 {
        :8443 {
            @local remote_ip 127.0.0.1/8 ::1
            route @local {
                proxy 127.0.0.1:9443
            }

            route {
                proxy 127.0.0.1:9444
            }
        }
    }
}
```

路由依宣告順序評估。沒有條件的路由會符合先前路由未選取的所有連線。沒有路由符合時，
Pingclair 關閉連線。

預讀逾時不是後備路由的觸發條件。連線未在 `preread_timeout` 內送出完整
ClientHello 時，Pingclair 會關閉連線。

## ⏱️ 設定轉送限制

監聽器設定寫在路由之前：

```caddyfile
{
    layer4 {
        :8443 {
            max_connections 2048
            preread_timeout 10s
            preread_buffer_size 16k
            proxy_connect_timeout 5s
            proxy_timeout 10m
            proxy_buffer_size 16k
            proxy_half_close on

            @app tls sni app.example.com
            route @app {
                proxy 127.0.0.1:9443
            }
        }
    }
}
```

| 設定 | 預設值 | 行為 |
| --- | --- | --- |
| `max_connections` | `1024` | 此監聽器允許的並行工作階段數。可設定 1 至 4096，另受行程上限 4096 限制。 |
| `preread_timeout` | `30s` | 分類單一連線的最長時間。逾時會關閉連線。 |
| `preread_buffer_size` | `16k` | 分類時保留的 ClientHello 位元組上限。 |
| `proxy_connect_timeout` | `60s` | 嘗試連接上游的總時間。 |
| `proxy_timeout` | `600s` | 任一方向兩次讀寫之間的最長閒置時間。 |
| `proxy_buffer_size` | `16k` | 每個轉送方向的緩衝容量。 |
| `proxy_half_close` | `off` | 啟用時，EOF 只關閉對應的寫入方向。 |

Layer 4 大小使用二進位的 `k` 與 `m` 單位。沒有接尾字元的時間是秒數。

## 🌐 使用動態 DNS 來源

`proxy` 通常指定一個靜態位址。`dynamic a` 區塊會在背景下解析 A 或 AAAA
來源，並發布有界的位址池：

```caddyfile
{
    layer4 {
        :8443 {
            @app tls sni app.example.com
            route @app {
                proxy {
                    dynamic a {
                        name backend.example.com
                        port 9443
                        versions ip
                        valid 30s
                        stale 60s
                        allow_ip 10.0.0.0/8
                    }
                }
            }
        }
    }
}
```

`valid` 會覆寫 DNS 回應的新鮮度期限。`stale` 最多允許先前發布的快照再使用 300
秒。只要回應中的任一位址不在允許範圍內，整份回應都會被拒絕。

靜態主機名稱只在載入或重新載入時解析。DNS 記錄會在不重新載入設定的情況下變更時，
請使用 `dynamic a`。未設定 `allow_ip` 時，動態來源只接受公網單播目的地；內部 DNS
來源必須明確列出 CIDR。

## 📊 觀察 Layer 4 工作階段

全域 `metrics` 會啟用 Layer 4 收集；既有的 HTTP `metrics` 端點會提供這些計數器。
監聽器也可以在工作階段結束時寫入一筆存取記錄：

```caddyfile
{
    metrics
    layer4 {
        :8443 {
            log {
                output file /var/log/pingclair/layer4-access.log
                format json
            }

            route {
                proxy 127.0.0.1:9443
            }
        }
    }
}

http://127.0.0.1:9090 {
    metrics /metrics
}
```

`l4_*` 指標系列報告連線、作用中工作階段、位元組、持續時間、預讀失敗、上游連線失敗、
DNS 重新整理與位址嘗試。監聽器選項與匹配器形式見
[指令參考](/zh-TW/reference/directives/#layer4)。

## 🧪 驗證與測試

替換執行中的設定之前，先驗證檔案：

```bash
pingclair validate /etc/Pingclair/Pingclairfile
```

以此檔案啟動 Pingclair：

```bash
sudo pingclair run -c /etc/Pingclair/Pingclairfile
```

後端 TLS 服務在 `127.0.0.1:9443` 監聽時，使用下列命令要求路由名稱：

```bash
openssl s_client \
  -connect 127.0.0.1:8443 \
  -servername app.example.com \
  -quiet </dev/null
```

輸出會顯示後端提供的憑證鏈。Pingclair 轉送加密位元組，不會在此監聽器提供自己的
憑證。測試完成後，停止前景程序並執行 `sudo pc service start`。

## 🔁 重新載入與監聽器變更

重新載入會對新的 Layer 4 連線套用路由變更。已建立的通道保留開始時使用的路由、
上游 socket、緩衝與限制。

變更監聽位址、HTTP 或 Admin 連接埠重疊，或 `max_connections` 值時，需要重新啟動。
重新載入失敗時，先前的 Layer 4 設定會繼續服務。

## ⚠️ 失敗模式

- **沒有符合的路由：** Pingclair 關閉 TCP 連線。
- **預讀逾時或超出上限：** Pingclair 關閉連線，不會改用後備上游。
- **動態位址池沒有可用位址：** 該路由的新連線會被拒絕。
- **本機 descriptor 或記憶體耗盡：** 本機代理無法建立 socket 時，不會因此把健康的
  後端標記為不可用。
- **監聽器已被占用：** 啟動失敗，不會把監聽器移到其他連接埠。

## 🚫 Alpha 邊界

此 alpha 僅支援 TCP，不支援 UDP、TLS 終止、任一方向的 PROXY protocol、
透過 `layer4` 的萬用字元 SNI 比對，或加權負載平衡。

每個監聽器區塊指定一個位址，每條路由指定一個靜態或動態上游，路由區塊內只有一個
`proxy` 處理常式。語法沿用 caddy-l4 `layer4` 區塊的結構，但這是刻意限定範圍的 TCP
子集，不是完整的 caddy-l4 相容性。不支援的選項會在驗證時被拒絕。

## 🧭 相關頁面

- [Pingclairfile](/zh-TW/reference/pingclairfile/)：全域選項與網站區塊的檔案結構。
- [指令參考](/zh-TW/reference/directives/#layer4)：監聽器選項、匹配器、記錄與指標。
- [專案狀態](/zh-TW/project/status/)：此預覽版的已知限制。
