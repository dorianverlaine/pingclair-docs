---
title: 指令
h1_emoji: '🧾'
description: 本文件涵蓋的 directive 的語法、預設值與適用範圍。
---

每一條列出語法、未設定時的預設值，以及可以出現的位置。版本標註（說明 directive 於哪個版本引入的 `Since:` 行）目前尚未公布。

📖 本頁涵蓋的是一組起始子集。已被接受但尚未記錄於此的 directive 仍會由 `pingclair validate` 驗證；伺服器未實作的 directive 會以名稱拒絕，而不是默默接受。

## encode

```text
Syntax:   encode <format> [<format> ...]
Default:  no compression
Context:  site block
```

壓縮回應。參數依偏好順序排列，因此會採用用戶端可接受的第一種格式。支援 `zstd` 與 `gzip`。

指定 Brotli 會是編譯錯誤，而不是悄悄降級為 gzip：代理沒有串流 Brotli 編碼器，該選項無法被兌現。

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<root>]
Default:  disabled
Context:  site block
```

從磁碟供應檔案，包含 MIME 類型判斷、range 請求，以及 ETag 與 `Last-Modified` 驗證。選用參數只設定這個 directive 自己的根目錄；省略時使用 `root` 設定的 site 根目錄。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> <value>
          header [<matcher>] {
              <field> <value>      # set
              +<field> <value>     # append
              -<field>             # remove
              set <field> <value>  # set, spelled explicitly
          }
Default:  none
Context:  site block
```

新增、取代或移除回應標頭。直接寫欄位名稱代表設定；在欄位前加 `+` 代表附加，加 `-` 代表移除。

```caddyfile
example.com {
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -X-Powered-By
    }
}
```

## log

```text
Syntax:   log [<name>] { <options> }
Default:  no access sink
Context:  site block, global options
```

設定存取日誌的輸出目標。單獨的 `log` 啟用該 site 的預設輸出；`log <name> { ... }` 設定具名 logger，而不帶區塊的 `log <name>` 則引用在 global options 中宣告的通道。

區塊選項包含輸出目標與格式（`output`、`format`）、`hostnames` 選擇器、`include` 與 `exclude` 篩選、`sampling`，以及檔案輪替設定（`mode`、`dir_mode`、`roll_*`）。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

紀錄會先批次累積再寫出；跟不上速度的輸出目標會丟棄紀錄，並計入 `pingclair_access_log_dropped_total`。把每個請求都寫進系統 journal，也必須承擔 journal 接收端的成本。

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] { ... }
Default:  none
Context:  site block
```

把請求轉送到一個或多個上游。預設的負載平衡策略是 round robin。主機名上游會依 `dns_refresh` 設定的間隔重新解析，因此重新啟動並取得新位址的後端不需要人工介入；解析失敗時會保留先前的位址繼續輪替。

```caddyfile
:80 :8080 {
    reverse_proxy {
        lb_policy least_conn
        to 10.0.0.1:8080 {
            weight 3
        }
        to 10.0.0.2:8080
        to 10.0.0.3:8080 {
            backup
        }
        health_check {
            path /health
            interval 5s
            timeout 2s
            status 200 204
            consecutive_failure 3
            consecutive_success 2
        }
    }
}
```

主動健康檢查在帶外執行，因此失效的後端會在使用者請求到達之前就退出輪替，並在通過設定的成功探測次數後重新加入。`backup` 上游只會在主要上游全部不可用時才被使用。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block
```

設定 site 根目錄。`file_server` 可以自帶根目錄，但在這裡設定，才能讓檔案伺服器與其他處理檔案的 directive 對同一個位置有共識。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls <mode>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

控制憑證的取得方式。

| 模式 | 行為 |
| --- | --- |
| `tls auto` | 透過 ACME 取得公開憑證並自動續用。 |
| `tls internal` | 由常駐的本機憑證授權單位簽發。根憑證位於 `$PINGCLAIR_TLS_STORE/internal/root.crt`，用戶端必須信任它。 |
| `tls { cert ...; key ... }` | 使用區塊中指名的憑證與金鑰檔案。 |

區塊形式也能以 `http3` 啟用 HTTP/3，並支援以 `dns cloudflare <token>` 進行 DNS-01 簽發，這是唯一實作的 DNS 供應商。指定其他供應商會在啟動時被拒絕，而不是被接受後忽略，因為 DNS-01 正是萬用憑證可行的前提。

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
        http3
    }
    reverse_proxy localhost:3000
}
```

## 🌍 Global options

Global options 寫在檔案最上方、沒有名稱的區塊中。

| 選項 | 語法 | 說明 |
| --- | --- | --- |
| `admin` | `admin <address> [<token>]` | Admin API listener。未提供 token 時只接受 loopback 連線。 |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 控制自動 HTTPS 與 80 埠轉址。 |
| `dns_refresh` | `dns_refresh <duration>` | 主機名上游的重新解析間隔。`off` 會固定啟動時解析到的位址。 |
| `email` | `email <address>` | ACME 簽發使用的帳號信箱。 |
| `trusted_proxies` | `trusted_proxies <cidr> [<cidr> ...]` | 允許宣稱用戶端身分標頭的對端。變更後需要重啟。 |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
