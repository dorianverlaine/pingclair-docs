---
title: 指令
h1_emoji: '🧾'
description: 本參考涵蓋的 Pingclairfile 指令與全域選項：語法、預設值、適用位置、拒絕條件，以及與 Caddy 的差異。
---

每個條目都以固定的表頭開始：語法、沒寫這個指令時的預設值，以及它可以出現的位置。接著說明指令做什麼、拒絕什麼，以及與 Caddy 的不同之處。

📌 本頁描述的是最新公開的發行版 **v0.2.0-rc.3**。下一版會改變的行為，條目會在 **下一版** 底下註明；那些行為已在伺服器的 `main` 分支上，但還沒有出現在任何公開的建置中。

📖 本頁只涵蓋語言的一部分。沒有列在這裡的指令仍會由 `pingclair validate` 檢查，而伺服器沒有實作的指令會被指名拒絕，而不是接受後忽略。

## basic_auth

```text
Syntax:   basic_auth [<matcher>] [bcrypt|argon2id [<realm>]] {
              <username> <hashed_password>
              ...
          }
Default:  no authentication
Context:  site block, handle, route
```

在請求繼續往下之前，要求 HTTP Basic 認證。區塊中的每一行是一個帳號：使用者名稱與密碼雜湊，絕不是密碼本身。雜湊由 `pingclair hash-password` 產生（[命令列](/zh-TW/reference/command-line/#pingclair-hash-password)）。

指令那一行上的演算法，就是區塊中每個雜湊要比對的演算法，預設為 `bcrypt`。其他演算法名稱都會被拒絕，沒有區塊的 `basic_auth` 也一樣。

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode off
Default:  gzip in v0.2.0-rc.3; no compression in the next release
Context:  site block
```

壓縮回應。格式依偏好順序列出：用戶端接受多種格式時，列在最前面的勝出。支援的格式是 `zstd` 與 `gzip`，單獨寫 `encode` 代表 `gzip`。`encode off` 會關閉該網站的壓縮。

拒絕條件：

- `encode br` 會在載入時被拒絕。代理沒有串流式的 Brotli 編碼器，而伺服器不會悄悄退回 gzip：`` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- 未知的格式會被拒絕，並附上有效格式的清單。
- 路徑匹配器或具名匹配器會被拒絕，因為壓縮是以網站為單位設定，而不是以路由為單位。匹配所有請求的 `*` 匹配器則可以接受。

與 Caddy 的差異：在 v0.2.0-rc.3 中，沒有 `encode` 這一行的 Pingclairfile 網站仍會以 gzip 壓縮。Caddy 只在 `encode` 要求的地方壓縮。

**下一版**：網站只在 `encode` 要求的地方壓縮，與 Caddy 相同。依賴舊預設值的網站必須加上 `encode gzip` 或 `encode zstd gzip`。

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse
              compress              [off|false]
              precompressed         [br|zstd|gzip ...]
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block, handle, route
```

從磁碟提供檔案。它會判斷 MIME 類型、回應位元組範圍請求，並送出 `ETag` 與 `Last-Modified`。檔案來自 `root` 設定的網站根目錄，或只給這個指令用的根目錄。

- `index` 指定目錄要嘗試的檔案；預設為 `index.html`。
- `browse` 為沒有索引檔的目錄產生列表。
- `compress off` 讓這個檔案伺服器在原本會壓縮的網站上免於壓縮。
- `precompressed` 在用戶端接受該編碼時，提供像 `app.js.gz` 這樣的預先壓縮檔。沒有參數時，順序是 `br zstd gzip`。
- `hide` 讓指定的路徑不被提供。重複的行會累加。
- `status` 讓每個檔案都以這個狀態碼回應，適合維護頁面。
- `pass_thru` 把不存在的檔案交給下一個處理器，而不是回應 `404`。
- `disable_canonical_uris` 停用為目錄補上結尾斜線的重新導向。

拒絕條件：`fs` 會被拒絕，因為只支援本機檔案系統。超出 100–599 的 `status` 與未知的子指令也會被拒絕。

與 Caddy 的差異：位置參數 `<root>` 是 Pingclair 自己加的。在 Caddy 中，`file_server` 後面單獨的路徑是路徑匹配器。如果設定也必須能在 Caddy 中載入，請優先使用 `root`。

**下一版**：

- `browse` 接受選項區塊，`file_limit <n>` 限制列表最多顯示幾筆。列表模板、`reveal_symlinks` 與 `sort` 會被指名拒絕。
- `GET` 與 `HEAD` 以外的方法會得到附帶 `Allow: GET, HEAD` 的 `405`。
- 會回應條件式請求：相符的 `If-None-Match` 或仍然有效的 `If-Modified-Since` 得到 `304`，不成立的 `If-Match` 或 `If-Unmodified-Since` 得到 `412`。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> [<value> [<replacement>]]
          header [<matcher>] {
              <field> <value>                  # set
              +<field> <value>                 # append
              -<field>                         # remove
              ?<field> <value>                 # set only if absent
              <field> <search> <replacement>   # regular-expression replace
              defer
          }
Default:  none
Context:  site block, handle, route
```

修改回應標頭。直接寫欄位名稱會設定該標頭，加上 `+` 前綴會附加一個值，加上 `-` 前綴會移除該欄位。`?` 前綴只在回應還沒有該欄位時才設定值。有三個參數時，第二個是正規表示式，第三個會取代它匹配到的內容。

標頭永遠套用在完成的回應上，所以 `defer` 與 `>` 前綴會被接受，但不會改變任何事。

拒絕條件：

- 同時有參數與區塊的指令會被拒絕。
- 沒有值的 `header X-Name` 會被拒絕。Caddy 會設定一個空值，但空的回應標頭幾乎總是打錯的移除操作。
- 區塊內的 `match` 回應匹配器會以尚未實作為由被拒絕。

⚠️ 沒有 `set` 關鍵字。區塊中的 `set X-Name value` 這一行，會被解讀成對一個名為 `set` 的標頭進行正規表示式取代。

**下一版**：`Strict-Transport-Security` 只會在加密的回應上送出，並依 RFC 6797 的要求從每個明文回應中移除。開啟 HSTS 的方法是寫 `header Strict-Transport-Security "max-age=…"`。

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
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; named channels in global options
```

寫入存取日誌。四種寫法的意義各不相同：

- `log` 為網站開啟預設的存取日誌，輸出到標準輸出。
- `log { … }` 設定網站的存取日誌。
- `log <name> { … }` 為網站新增一個具名的 logger，有自己的輸出。
- `log <name>` 把網站的紀錄送到全域選項中以 `log <name> { … }` 宣告的同名頻道。

區塊選項包括 `output`（`stdout`、`stderr` 或 `file <path>`）、`format`（`json` 或 `console`）、`level`、`hostnames` 選擇器、`include` 與 `exclude` 過濾器、`sampling`，以及檔案輪替（`roll_size`、`roll_keep`、`roll_keep_for`、`mode`、`dir_mode` 與其他 `roll_*` 選項）。

拒絕條件：全域頻道不能使用 `hostnames`，因為它不屬於任何網站。重複宣告的頻道會被拒絕。

紀錄會先分批再寫入。跟不上的輸出會丟棄紀錄，並計入 `pingclair_access_log_dropped_total`。

**下一版**：沒有名稱的全域 `log { … }` 區塊會被拒絕。在 v0.2.0-rc.3 中，它會被接受但沒有任何作用。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

把請求轉送到一個或多個上游。`lb_policy` 決定請求如何分散到各上游；在 v0.2.0-rc.3 中預設為 `round_robin`。

以主機名稱指定的上游，會依全域 `dns_refresh` 設定的間隔重新解析，所以後端換了位址重啟，不需要重載也能跟上。查詢失敗時，會保留先前的位址繼續輪替。

主動健康檢查會在請求之外另行探測每個上游。失敗的上游會在使用者請求抵達之前離開輪替，並在達到設定的成功探測次數後重新加入。`backup` 上游只在所有主要上游都無法使用時才會被用到。

拒絕條件：未知的選項會連同完整名稱被拒絕，例如 `Unknown directive 'reverse_proxy: dial_timeout'`。逾時設定屬於 `transport http` 區塊。

**下一版**：

- 預設的 `lb_policy` 改為 `random`，也就是 Caddy 的預設值。若要維持目前的行為，請寫 `lb_policy round_robin`。
- `lb_policy first` 永遠挑選第一個可用的上游。在 v0.2.0-rc.3 中，它的行為與 `round_robin` 相同。
- 由 Pingclair 自己產生的 `502` 或 `504` 會帶有 `Proxy-Status: pingclair; error=…`，因此能與後端送出的區分開來。

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

[反向代理指南](/zh-TW/guides/reverse-proxy/)會逐一說明每個選項。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle, route
```

設定網站根目錄：`file_server`、`try_files` 與其他處理檔案的指令，都以這個目錄為基準解析路徑。`file_server` 可以有自己的根目錄，但在這裡設定，可以讓所有指令都指向同一個位置。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

控制網站的憑證從哪裡來。沒有 `tls` 這一行時，公開名稱會自動從 Let's Encrypt 取得憑證。

| 寫法 | 行為 |
| --- | --- |
| `tls internal` | 由持久化的本機憑證授權單位簽發。用戶端必須信任它的根憑證；`pingclair trust` 會安裝它。 |
| `tls <cert> <key>`，或區塊中的 `cert` 與 `key` | 使用在其他地方簽發的憑證與金鑰檔案。 |
| `tls { auto }` | 透過 ACME 取得公開憑證並自動續期，這也是公開名稱的預設行為。 |

區塊也接受 `acme_email`（或 `email`）、`http3`、`default_sni`、`client_auth`，以及 DNS-01 的選項（`dns`、`resolvers`、`dns_ttl`、`propagation_delay`、`propagation_timeout`、`dns_challenge_override_domain`）。

`http3 off` 把這個網站排除在 HTTP/3 之外。它不會建立或移除 QUIC 監聽器；那是由全域的 `servers { protocols … }` 清單決定的（[TLS：可以調整什麼](/zh-TW/guides/tls-tuning/#-提供哪些協定)）。

拒絕條件：

- `dns` 只接受 `cloudflare`。其他 provider 都會被拒絕：``DNS provider `route53` is not implemented; this build ships `cloudflare` only``。
- `protocols`、`ciphers`、`curves`、`alpn`、`on_demand`、`key_type`、`issuer`，以及上面沒有列出的其他 Caddy 選項，都會被指名拒絕。
- `tls internal` 不能與 `auto`、ACME email 或憑證檔案同時使用。

**下一版**：

- `http3 off` 會生效。在 v0.2.0-rc.3 中，它會被接受但沒有效果。該網站的回應也不再於 `Alt-Svc` 中宣告 HTTP/3。
- 內部憑證授權單位的根憑證搬到 `<store>/pki/authorities/local/root.crt`，也就是 Caddy 使用的目錄配置。舊的 `<store>/internal/` 目錄不會被遷移：會建立新的憑證授權單位，用戶端必須重新信任它的根憑證。

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## Global options

全域選項寫在檔案最上方沒有名稱的區塊中。Caddy 巢狀放在 `servers { … }` 底下的選項，例如 `protocols` 與 `trusted_proxies`，在那裡也同樣接受。

| 選項 | 語法 | 說明 |
| --- | --- | --- |
| `admin` | `admin [<address> [<token>]] \| off` | 啟用 Admin API；預設位址是 `127.0.0.1:2019`。沒有 token 時，只接受 loopback 用戶端。沒有這個選項，就沒有 Admin API。 |
| `auto_https` | `auto_https on \| off \| disable_redirects` | 控制自動 HTTPS 與 80 連接埠的重新導向。`disable_certs` 與 `ignore_loaded_certs` 會被指名拒絕。 |
| `dns_refresh` | `dns_refresh <duration> \| off` | 重新解析主機名稱上游的間隔。預設為 `30s`。`off` 會沿用啟動時解析的位址。單獨的數字會被拒絕。 |
| `email` | `email <address>` | ACME 帳號的 email。 |
| `grace_period` | `grace_period <duration>` | 優雅停止時等待進行中請求的時間。 |
| `protocols` | `protocols h1 h2 h3` | 是否建立 HTTP/3 監聽器。請見 [TLS：可以調整什麼](/zh-TW/guides/tls-tuning/#-提供哪些協定)。 |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | 可以在轉送標頭中聲明用戶端位址的對端。變更它需要重啟。**下一版**：也接受 Caddy 的寫法 `trusted_proxies static <cidr \| private_ranges> ...`。 |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
