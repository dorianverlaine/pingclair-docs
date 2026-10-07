---
title: 指令
h1_emoji: '🧾'
description: 本參考涵蓋的 Pingclairfile 指令與全域選項：語法、預設值、適用位置、拒絕條件，以及與 Caddy 的差異。
---

📌 下方 TLS 範例使用目前工作目錄的 `./certs/`；請放入自己的憑證、配對金鑰或用戶端 CA 檔案。驗證也會讀取這些檔案。

每個條目都以固定的表頭開始：語法、沒寫這個指令時的預設值，以及它可以出現的位置。接著說明指令做什麼、拒絕什麼，以及與 Caddy 的不同之處。

📌 本頁描述的是 **v0.2.0**。與 0.1.x 系列及 0.2.0 候選版不同的行為，會以 **0.2.0 變更** 標示；[升級](/zh-TW/start/upgrade/#️-020-的變更) 把這些變更集中在同一處。

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

指令那一行上的演算法，就是區塊中每個雜湊要比對的演算法，預設為 `bcrypt`。其他演算法名稱都會被拒絕，沒有區塊的 `basic_auth` 也一樣。雜湊不是所宣告演算法的有效雜湊時（包括明文密碼），該行會在載入時被拒絕。

帶有匹配器的 `basic_auth` 會保護所有回應它所匹配請求的路由，包括指令順序排在它前面的 `respond` 或 `reverse_proxy`。`redir` 仍會在它之前回應，與 Caddy 相同。

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## bind

```text
Syntax:   bind <host>
Default:  every interface ([::]), or the global default_bind
Context:  site block
```

把網站的每個監聽器限制在一個主機位址上。這個主機會取代網站所監聽的每個位址的主機部分，TCP、TLS 與 HTTP/3 皆然，`pingclair adapt` 會顯示結果位址。IPv6 主機可以加或不加方括號，在監聽器中一律加上方括號：`bind ::1` 會監聽 `[::1]:443`。

HTTPS 網站的自動 HTTP 重新導向監聽器也會監聽 `bind` 主機，因此從其他介面無法到達。

拒絕條件：

- 超過一個位址會被拒絕：`` `bind 127.0.0.1 ::1` names 2 addresses, and this build binds one ``。請只寫一個位址、用 `[::]` 代表所有介面，或每個介面寫一個網站。
- 受 `bind` 限制的網站，若與監聽所有介面的網站共用連接埠，會被拒絕：一個連接埠就是一個 socket，受限的網站會變得可以從 `bind` 排除的介面到達。請讓該連接埠上的每個網站綁定相同位址，或把其中一個移到別的連接埠。

與 Caddy 的差異：Caddy 會綁定列出的每個位址。Pingclair 讓每個監聽器只在一個介面上，並拒絕第二個位址，而不是忽略它。

**0.2.0 變更**：`bind` 也適用於有明確位址或連接埠的網站，例如 `http://example.test:8080`。先前它只適用於沒有自身位址的網站，這類網站會監聽所有介面。

```caddyfile
http://example.test:8080 {
    bind 127.0.0.1
    respond "loopback only"
}
```

## cache

```text
Syntax:   reverse_proxy <upstream> {
              cache {
                  ttl       <duration>
                  max_size  <bytes>
              }
          }
Default:  disabled; max_size 134217728 when enabled
Context:  reverse_proxy block
```

此 Pingclair 選項啟用 H1／H2 代理回應快取。`ttl` 必填，提供後備有效期限；`max_size` 是所有快取路由共用的正整數位元組容量。容量不一致、零或未知選項會被拒絕。重載調整儲存容量，縮小時立即逐出項目，移除快取時清空。

新鮮度包含上游 `Age`、依 `Date` 推算的年齡及回應延遲；`Expires` 相對於 `Date` 計算。所有 `Vary` 行與指定的請求欄位皆參與變體；無效 `Vary` 或 `Vary: *` 不會儲存。請求的 `no-cache` 與 `no-store` 在所有欄位行依指令名稱辨識。SSE 與 `flush_interval -1` 不納入快取。

```caddyfile
http://:8080 {
    reverse_proxy 127.0.0.1:3000 {
        cache {
            ttl 30s
            max_size 134217728
        }
    }
}
```

沒有可用的來源有效期限時，`ttl` 僅供 `200` 使用；未指定期限的 `404` 與 `410` 最長快取十秒或較短的 ttl，未指定期限的伺服器錯誤不儲存。`206`、`428`、`429`、`431` 與 `511` 永不儲存。快取保留來源位元組，輸出時依各用戶端壓縮，且命中與未命中都套用 `header_down`。HTTP/3 不使用此回應快取。

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode [*] {
              gzip            [<level>]
              zstd
              minimum_length  <bytes>
              match {
                  status  <codes...>
                  header  <field> [<value>]
              }
          }
          encode off
Default:  no compression
Context:  site block
```

壓縮回應。格式依偏好順序列出：用戶端以相同權重接受多種格式時，列在最前面的勝出。支援的格式是 `zstd` 與 `gzip`，單獨寫 `encode` 代表 `gzip`。`encode off` 會關閉該網站的壓縮。

- `gzip <level>` 設定 gzip 等級，1 到 9，預設為 5。`zstd` 使用等級 3。
- `minimum_length` 是會被壓縮的最小本文；預設為 512 位元組。
- `match` 只壓縮符合這些狀態碼或標頭的回應。明確寫出的 `match` 區塊會取代預設的內容類型清單。

壓縮對回應的影響：

- 有 `encode` 的網站，其回應都帶有 `Vary: Accept-Encoding`，未壓縮送出的也一樣。壓縮會把 `Accept-Encoding` 加進既有的 `Vary` 欄位，而不是取代它。
- 帶有強 `ETag` 的代理回應被重新編碼時，會改成弱 `ETag`，因為編碼後的位元組與來源不同。
- 請求或回應上的 `Cache-Control: no-transform` 會停用該回應的壓縮。
- `Accept-Encoding: *` 不會選出任何編碼；除非用戶端寫出 `gzip` 或 `zstd`，否則收到的是未壓縮的本文。
- 大於 8 MiB 的靜態檔案會以未壓縮方式送出。要以壓縮形式提供大檔案，請使用預先壓縮檔（`file_server { precompressed }`）。

靜態與代理編碼使用相同的預設內容類型清單，`identity` 也參與品質協商。部分或沒有本文的代理回應不壓縮；轉換後移除過期 digest 欄位與 H3 完整性 trailers。壓縮失敗會中止回應，不會接上明文。

拒絕條件：

- `encode br` 會在載入時被拒絕。代理未實作串流式 Brotli 編碼器，也不會自動改用 gzip：`` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``。
- 未知的格式，或區塊內未知的設定，會被拒絕。
- 帶有區塊的 `encode off` 會被拒絕。
- 路徑匹配器或具名匹配器會被拒絕，因為壓縮是以網站為單位設定，而不是以路由為單位。匹配所有請求的 `*` 匹配器則可以接受。

**0.2.0 變更**：網站只在 `encode` 要求的地方壓縮，與 Caddy 相同。依賴先前 gzip 預設值的網站必須加上 `encode gzip` 或 `encode zstd gzip`。區塊中的設定現在會生效；先前的版本會把每個區塊都編譯成單純的 gzip。

```caddyfile
example.com {
    encode {
        zstd
        gzip 6
        minimum_length 1024
    }
    file_server
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse {
                  file_limit <n>
              }
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

從磁碟提供檔案。它會判斷 MIME 類型、回應位元組範圍請求與條件式請求，並送出 `ETag` 與 `Last-Modified`。檔案來自 `root` 設定的網站根目錄，或只給這個指令用的根目錄。

- `index` 指定目錄要嘗試的檔案；預設為 `index.html`。索引必須是相對檔名。
- `browse` 為沒有索引檔的目錄產生列表。`file_limit` 限制顯示的項目數；預設上限是 10,000。
- `compress off` 讓這個檔案伺服器在原本會壓縮的網站上免於壓縮。
- `precompressed` 在用戶端接受該編碼時，提供像 `app.js.gz` 這樣的預先壓縮檔。沒有參數時，順序是 `br zstd gzip`。只有寫了這個選項才會提供預先壓縮檔。用戶端接受該編碼時，範圍請求會從預先壓縮檔的位元組提供，`Content-Range` 與 `ETag` 描述的是壓縮後的表示。
- `hide` 讓指定的路徑不被提供，也不出現在列表中。不含 `/` 的模式會隱藏任何同名的路徑元件（`.git` 會隱藏 `/a/.git/b`）；含 `/` 的模式是根目錄下的路徑。重複的行會累加。
- `status` 讓每個檔案都以這個狀態碼回應，適合維護頁面。
- `pass_thru` 把不存在的檔案交給下一個處理器，而不是回應 `404`。
- `disable_canonical_uris` 停用為目錄補上結尾斜線的重新導向。

條件式請求依照 RFC 9110：相符的 `If-None-Match` 或仍然有效的 `If-Modified-Since` 得到 `304`，不成立的 `If-Match` 或 `If-Unmodified-Since` 得到 `412`，而 `If-Range` 已不相符的 `Range` 會以 `200` 得到整個檔案。`GET` 與 `HEAD` 以外的方法會得到附帶 `Allow: GET, HEAD` 的 `405`。不論網站是否壓縮，靜態回應都帶有 `Vary: Accept-Encoding`。

拒絕條件：`fs` 會被拒絕，因為只支援本機檔案系統。超出 100–599 的 `status`、未知的子指令、絕對路徑或含 `..` 的索引、列表模板、`reveal_symlinks`、`sort`，以及 `[` 集合沒有關閉的 `hide` 模式，都會被拒絕。

與 Caddy 的差異：位置參數 `<root>` 是 Pingclair 自己加的。在 Caddy 中，`file_server` 後面單獨的路徑是路徑匹配器。如果設定也必須能在 Caddy 中載入，請優先使用 `root`。

**0.2.0 變更**：`ETag` 改由奈秒精度的修改時間組成，並依內容編碼而不同，所以升級後每個靜態 `ETag` 會改變一次，快取會對每個檔案重新驗證一次。

```caddyfile
localhost:8080 {
    file_server ./public
}
```

預先壓縮 sidecar 使用自身的大小與修改時間產生 ETag，優先於即時壓縮快取；gzip 驗證值包含等級。範圍回應使用 identity 編碼並以有界區塊串流傳送。靜態本文快取共用位元組容量與 16,384 項上限，包含空檔案。標準重新導向清理路徑、跳脫反斜線並保留查詢字串，避免變成其他主機的參照。設定的 `ETag` 標頭目前不參與重新驗證。

## forward_auth

```text
Syntax:   forward_auth <upstream> {
              uri <path>
              copy_headers <fields...>
              transport http {
                  tls
                  tls_server_name <name>
                  tls_trusted_ca_certs <files...>
                  tls_client_auth <cert> <key>
                  tls_insecure_skip_verify
              }
          }
Default:  no authentication subrequest
Context:  site block, handle, route
```

先以不帶本文的 GET 向驗證服務發出子請求，並附上原始方法與 URI。2xx 會複製指定的身分標頭再繼續，其他回應串流傳給用戶端。複製前先移除目的標頭，即使目的名稱被改名也一樣。`transport http` 只接受列出的 TLS 選項；未知選項、缺少配對金鑰，或同時設定自訂 CA 與略過驗證會被拒絕。只有明確需要時才停用憑證驗證。

```caddyfile
http://:8080 {
    forward_auth https://auth.example.com {
        uri /check
        copy_headers Remote-User
        transport http {
            tls_server_name auth.example.com
        }
    }
    reverse_proxy 127.0.0.1:3000
}
```

## handle

```text
Syntax:   handle [<matcher>] {
              <directives...>
          }
Default:  none
Context:  site block, handle, route, handle_errors
```

把多個指令組成一條路由。同層的 `handle` 區塊彼此互斥：只有第一個匹配的區塊會執行，即使該區塊沒有寫出回應。有路徑的區塊會依路由的方式排序（見[哪條路由回應](/zh-TW/reference/pingclairfile/#-哪一條路由回應)），沒有匹配器的 `handle` 則是後備。同一個區塊內的每個指令都會依指令順序執行。

匹配器記號只能是 `*`、以 `/` 開頭的路徑，或具名匹配器（`@name`）。其他任何記號都會被拒絕：``expected at most one matcher (`*`, a path starting with `/`, or `@name`) before the block, got `*.php` ``。

**0.2.0 變更**：先前無法辨識的記號會被丟棄，所以 `handle *.php { … }` 會回應網站上的每個請求。請寫成 `@php path *.php` 與 `handle @php { … }`。

```caddyfile
example.com {
    @php path *.php
    handle @php {
        respond "PHP" 200
    }
    handle {
        respond "Not PHP" 200
    }
}
```

## handle_errors

```text
Syntax:   handle_errors [<status|Nxx> ...] {
              <directives...>
          }
Default:  the built-in error text, or the site's error_page
Context:  site block
```

當請求以錯誤狀態結束時執行一條路由。參數是三位數的確切狀態碼或 `Nxx` 範圍，彼此以「或」結合；沒有參數時，區塊會接下所有錯誤。區塊內的 `{err.status_code}` 與其他 `{err.*}` 預留位置描述這個錯誤。

錯誤在兩種情況下會進入這個區塊：處理器引發錯誤時（`error`，或檔案不存在的 `file_server`），以及伺服器自己產生錯誤時：無法連上上游的 `reverse_proxy`（`502`、`503`、`504`）、超過 `request_body` 上限的本文（`413`），以及停止傳送的本文（`408`）。

- 區塊內的 `root` 設定錯誤路由自己的文件根目錄，可以寫在區塊的任何位置。以匹配器限定的 `root @name …` 會被拒絕。
- 區塊內的 `file_server` 依錯誤路由的設定提供檔案。頁面會以錯誤的狀態碼送出，失敗請求的 `Range` 與驗證欄位會被忽略，所以錯誤絕不會變成 `206` 或 `304`。
- 在錯誤路由內引發的錯誤會直接回應，不會再次執行錯誤路由。

**0.2.0 變更**：閘道錯誤與本文大小錯誤會進入 `handle_errors`，錯誤路由中的 `file_server` 會提供它的頁面，而不是錯誤文字。因此，接下所有錯誤的 `handle_errors { … }` 也會回應 `502`、`504` 與 `413`；若只想處理原本設想的錯誤，請為它加上狀態碼。它對閘道錯誤的回應不帶 `Proxy-Status` 欄位，而內建的閘道錯誤會帶。

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:3000
    handle_errors 502 503 504 {
        root * /srv/errors
        rewrite * /{err.status_code}.html
        file_server
    }
}
```

## handle_path

```text
Syntax:   handle_path <path-matcher> {
              <directives...>
          }
Default:  none
Context:  site block, handle, route
```

作用與 `handle` 相同，另外會在區塊內的指令執行前移除匹配到的路徑前綴：`handle_path /api/*` 會把 `/api/users` 以 `/users` 轉送。前綴比對與選中該區塊的路由一樣忽略 ASCII 字母大小寫，所以 `handle_path /API/*` 也會從 `/api/users` 移除 `/api`。匹配器記號的規則與 `handle` 相同。

```caddyfile
example.com {
    handle_path /api/* {
        reverse_proxy 127.0.0.1:3000
    }
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
              match {
                  status  <codes...>
                  header  <field> [<value>]
              }
              defer
          }
Default:  none
Context:  site block, handle, route
```

修改回應標頭。直接寫欄位名稱會設定該標頭，加上 `+` 前綴會附加一個值，加上 `-` 前綴會移除該欄位。`?` 前綴只在回應還沒有該欄位時才設定值。有三個參數時，第二個是正規表示式，第三個會取代它匹配到的內容。

標頭永遠套用在完成的回應上，所以 `defer` 與 `>` 前綴會被接受，但不會改變任何事。`header` 區塊內的 `match` 區塊，會讓整個區塊依完成回應的狀態碼（`404`、`2xx`）或標頭決定是否套用。

拒絕條件：

- 同時有參數與區塊的指令會被拒絕。
- 沒有值的 `header X-Name` 會被拒絕。Caddy 會設定一個空值，但空的回應標頭幾乎總是打錯的移除操作。
- 含有 CR、LF 或 NUL 的欄位值，或不是有效記號的欄位名稱，會在載入時被拒絕（RFC 9110 §5.5）。
- `handle_response { header { … } }` 內的 `match` 區塊會被拒絕。

⚠️ 沒有 `set` 關鍵字。區塊中的 `set X-Name value` 這一行，會被解讀成對一個名為 `set` 的標頭進行正規表示式取代。

`Strict-Transport-Security` 只會在加密的回應上送出，並依 RFC 6797 的要求從每個明文回應中移除。開啟 HSTS 的方法是寫 `header Strict-Transport-Security "max-age=…"`。

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

## limits

```text
Syntax:   limits {
              header_timeout          <duration>
              body_timeout            <duration>
              idle_timeout            <duration>
              request_timeout         <duration>
              max_headers             <count>
              max_header_bytes        <bytes>
              max_connections         <count>
              upload_bytes_per_sec    <bytes>
              download_bytes_per_sec  <bytes>
              long_connections {
                  idle_timeout     <duration|off>
                  request_timeout  <duration|off>
              }
          }
Default:  header_timeout 60s; a body may pause 60s between reads
Context:  site block
```

設定網站連線與請求的資源上限。`limits` 是 Pingclair 自己的指令，Caddy 沒有對應的指令。

- `header_timeout` 限制整個請求標頭的時間：從連線被接受（或前一個 keepalive 請求結束）起，到標頭最後一個位元組為止。預設為 60 秒。因此，閒置的 HTTP/1 keepalive 連線在 60 秒內沒有請求就會被關閉，而標頭在這段時間後仍不完整的 HTTP/3 請求串流會以 `H3_REQUEST_INCOMPLETE` 重設。
- `body_timeout` 是請求本文兩次讀取之間允許的最長停頓。沒有設定時，停頓上限是 60 秒。停止傳送的用戶端會得到 `408`；經由 `reverse_proxy` 的 HTTP/2 上傳則改為重設串流。WebSocket 與立即刷新的路由只採用明確設定的值。
- `long_connections` 為 WebSocket 與串流路由覆寫 `idle_timeout` 與 `request_timeout`；`off` 會移除期限。

**0.2.0 變更**：兩個 60 秒的預設值都是新的。刻意長時間不傳資料的用戶端，例如 gRPC 用戶端串流，需要明確設定 `body_timeout`，或在其路由上設定 `flush_interval -1`。

```caddyfile
example.com {
    limits {
        header_timeout 30s
        body_timeout 2m
    }
    reverse_proxy 127.0.0.1:3000
}
```

## listen

```text
Syntax:   listen [http://|https://]<address> [proxy_protocol]
Default:  the listeners named by the site address
Context:  site block
```

為網站加上一個監聽器。`listen` 是 Pingclair 自己的指令，讀法與 nginx 的同名指令相同：`listen 127.0.0.1:8080` 與 `listen [::1]:8080` 綁定該位址；`listen :8080`、`listen 8080` 與 `listen *:8080` 綁定所有介面；沒有連接埠的位址使用 HTTP 連接埠，加上 `https://` 時則使用 HTTPS 連接埠。`proxy_protocol` 要求該監聽器收到 PROXY protocol 標頭。`listen` 指定了位址的網站不會繼承 `default_bind`。

拒絕條件：主機名稱（`listen` 只綁定、從不解析名稱）、沒有方括號的 IPv6 位址、不是 0 到 65535 的連接埠、未知的旗標，以及與網站 `bind` 不一致的位址。

**0.2.0 變更**：`listen` 會保留它寫出的位址。先前的版本只保留連接埠，所以 `listen 127.0.0.1:8080` 會監聽所有介面。要繼續監聽所有介面，請寫 `listen :<port>`。

```caddyfile
http://:8080 {
    listen 127.0.0.1:9090
    respond "two listeners"
}
```

## log

```text
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; global options
```

寫入存取日誌。網站層級的幾種寫法意義各不相同：

- `log` 為網站開啟預設的存取日誌，輸出到標準輸出。
- `log { … }` 設定網站的存取日誌。
- `log <name> { … }` 為網站加上一個具名的日誌記錄器，有自己的輸出。
- `log <name>` 把網站的紀錄送到在全域選項中以 `log <name> { … }` 宣告的同名通道。

在全域選項區塊中，沒有名稱的 `log { … }` 改為設定伺服器自己的程序日誌：`output file <path>`、`output stdout`、`output stderr`、`format json|text` 與 `level`。檔案輸出端不存在時會以 `0600` 權限建立。`RUST_LOG` 仍然優先於設定的 `level`，啟動橫幅則留在標準輸出。

區塊選項包括 `output`（`stdout`、`stderr` 或 `file <path>`）、`format`（`json` 或 `console`）、`level`、`hostnames` 選擇器、`include` 與 `exclude` 過濾器、`sampling`，以及檔案輪替（`roll_size`、`roll_keep`、`roll_keep_for`、`mode`、`dir_mode` 與其他 `roll_*` 選項）。每筆 JSON 存取紀錄都帶有 `ts` 欄位：請求開始時距 Unix 紀元的秒數。

拒絕條件：全域通道不能使用 `hostnames`，因為它不屬於任何網站。宣告兩次的通道會被拒絕。

紀錄在寫入前會先批次累積。跟不上的輸出端會丟棄紀錄，並在 `pingclair_access_log_dropped_total` 中計數。

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## metrics

```text
Syntax:   metrics [<matcher>] [{ disable_openmetrics }]
Default:  no metrics route
Context:  site block, handle, route
```

從網站路由提供 Prometheus 抓取端點，讓抓取程式不必存取 Admin API 就能讀取數據。這條路由和它所在的網站一樣開放；在公開網站上，請在它前面加上匹配器或 `basic_auth`。

只有在收集開啟時，這條路由才會提供數據，而收集由全域 `metrics` 選項控制（見[全域選項](#global-options)）。收集關閉時，它會以空的本文回應 `200`。

```caddyfile
{
    metrics
}

http://:9180 {
    bind 127.0.0.1
    metrics /metrics
}
```

## php_fastcgi

```text
Syntax:   php_fastcgi [<matcher>] <upstream...> {
              root                  <path>
              split                 <suffix...>
              index                 <filename|off>
              try_files             <candidates...>
              env                   <name> <value>
              resolve_root_symlink
              dial_timeout          <duration>
              read_timeout          <duration>
              write_timeout         <duration>
              capture_stderr
          }
Default:  disabled; split .php; index index.php
Context:  site block, handle, route
```

將檔案匹配與重寫展開為 FastCGI 代理，上游可為 PHP-FPM。也接受已支援的反向代理選項。請求本文緩衝政策會到達 FastCGI 傳輸層；腳本路徑保留非 UTF-8 檔名字元的原始位元組，多行 Cookie 會合併。HEAD 不傳本文，下載速率限制會生效；參數超過 FastCGI record 容量回應 `431`，截斷或格式錯誤的本文會中止回應。

⚠️ chunked 或沒有本文的請求仍得到 `411`。設定驗證通過不代表這些請求形態可運作。請見[已知缺陷](/zh-TW/project/status/#-020-的已知缺陷)。

```caddyfile
http://:8080 {
    root * /srv/php
    php_fastcgi 127.0.0.1:9000 {
        read_timeout 30s
        write_timeout 30s
    }
    file_server
}
```

## request_body

```text
Syntax:   request_body [<matcher>] {
              max_size       <size>
              read_timeout   <duration>
              write_timeout  <duration>
              set            <body>
          }
Default:  no size limit
Context:  site block, handle, route
```

限制或取代請求本文。

- `max_size` 以 `413` 拒絕更大的本文，不論長度是事先宣告的，還是串流中途超過上限。大小依 SI/IEC 區分：`10MB` 是 10,000,000 位元組，`10MiB` 是 10,485,760 位元組。
- `read_timeout` 與 `write_timeout` 限制這條路由讀取本文與寫出回應的時間。停滯的上傳會得到 `408`。
- `set` 以展開預留位置後的文字取代本文。用戶端自己傳來的位元組會在抵達時丟棄，而不是暫存起來。

網站層級、沒有匹配器的 `request_body` 適用於網站中的每個請求，包括在 `handle` 區塊內回應的請求。`handle` 內的 `request_body` 會為該路由覆寫它。

**0.2.0 變更**：除非有設定，否則請求本文沒有大小上限。先前的版本預設會拒絕超過 1 MiB 的代理本文。

```caddyfile
example.com {
    request_body {
        max_size 10MB
    }
    reverse_proxy 127.0.0.1:3000
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

把請求轉送到一個或多個上游。`lb_policy` 決定請求如何分配給它們；預設為 `random`，也就是 Caddy 的預設值。`lb_policy first` 會把每個請求都送到第一個可用的上游。

以主機名稱指定的上游，會依全域 `dns_refresh` 設定的間隔重新解析，所以換了位址重新啟動的後端不需要重新載入就能跟上。解析失敗時，先前的位址會繼續留在輪替中。

主動健康檢查會在請求之外探測每個上游。失敗的上游會在使用者請求到達之前離開輪替，並在達到設定的成功探測次數後重新加入。`backup` 上游只有在所有主要上游都無法使用時才會被使用。權重為 `0` 的上游會被排空：它不會收到任何請求。

逾時設定寫在 `transport http` 區塊中：`connect_timeout`（Caddy 的 `dial_timeout`）、`first_byte_timeout`（Caddy 的 `response_header_timeout`）、`read_timeout` 與 `write_timeout`。`lb_try_duration` 限制請求抵達後多久之內還能開始新的嘗試；它不會切斷已在進行中的回應。

Pingclair 自己產生的 `502` 或 `504` 會帶有 `Proxy-Status: pingclair; error=…`，因此可以與後端送出的回應區分。一旦上游可能已經看到請求，自動重試只會重複冪等的方法。

拒絕條件：

- 未知的選項會以完整名稱被拒絕，例如 `Unknown directive 'reverse_proxy: dial_timeout'`。
- 大於 100 的權重會被拒絕，所有主要上游權重都是 0 的上游池也會被拒絕。
- 在這個建置中沒有對應實作的 `transport http` 選項（`read_buffer`、`write_buffer`、`max_conns_per_host`、`keepalive_interval`，以及其他 Caddy 從 Go HTTP 用戶端沿用的選項）會被指名拒絕。

**0.2.0 變更**：

- 預設的 `lb_policy` 是 `random`；要保留先前的輪流分配，請寫 `lb_policy round_robin`。
- `lb_try_duration` 不再切斷慢速回應或長時間的事件串流。請改用 `first_byte_timeout` 或 `read_timeout` 限制慢速後端。
- 在 `trusted_proxies` 後方，`{remote_host}` 是連線的對端，`{client_ip}` 才是用戶端。`header_up X-Real-IP {client_ip}` 會轉送用戶端位址。

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

`request_buffers <size|unlimited>` 與 `response_buffers <size|unlimited>` 在轉送前先緩衝，達上限後串流傳送其餘資料；`unlimited` 在此仍有 8 MiB 的記憶體上限。使用 SI／IEC 單位，`1MB` 與 `1MiB` 不同。FastCGI 會套用請求緩衝政策；未宣告 `Content-Length` 的 FastCGI 請求（分塊上傳，或 HTTP/2、HTTP/3 的內容）必須先讀取才能量出長度，因此對這種請求而言上限是硬限制：超過上限會回應 `413`，不會以 PHP-FPM 讀成空內容的形式轉送。`flush_interval -1` 立即排出回應，不納入回應快取。

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle_errors
```

設定網站根目錄：`file_server`、`try_files` 與其他處理檔案的指令解析路徑時所依據的目錄。`file_server` 可以有自己的根目錄，但在這裡設定，可以讓所有指令都指向同一個位置。在 `handle_errors` 內，`root` 設定錯誤路由自己的根目錄。

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

拒絕條件：一般 `handle` 或 `route` 內的 `root` 不受支援；帶路徑或具名匹配器的 root 也會被拒絕。網站或錯誤路由請使用 `root * <path>`。

## route

```text
Syntax:   route [<matcher>] {
              <directives...>
          }
Default:  none
Context:  site block, handle, route
```

依撰寫順序執行區塊內的指令，而不是依指令順序。當較窄的指令必須在指令順序排在前面的較寬指令之前執行時，就使用它。匹配器記號的規則與 `handle` 相同。

```caddyfile
example.com {
    route {
        file_server /assets/*
        respond "fallback" 200
    }
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls <email>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

控制網站憑證的來源。沒有 `tls` 這一行時，公開名稱會自動從 Let's Encrypt 取得憑證。

| 形式 | 行為 |
| --- | --- |
| `tls internal` | 由持久的本機憑證授權單位簽發：一個根憑證，以及簽發 90 天葉憑證的中繼憑證。用戶端必須信任它的根憑證；`pingclair trust` 會安裝它。 |
| `tls <cert> <key>`，或區塊中的 `cert` 與 `key` | 使用在別處簽發的憑證與金鑰檔。`validate` 會讀取兩個檔案，並拒絕不相符的一對。 |
| `tls <email>` | 設定 ACME 帳號的電子郵件，並保留自動簽發。 |
| `tls { auto }` | 透過 ACME 取得公開憑證並續期，這也是公開名稱的預設行為。 |

區塊也接受 `acme_email`（或 `email`）、`http3`、`default_sni`、`client_auth`、`renewal_window_ratio`，以及 DNS-01 選項（`dns`、`resolvers`、`dns_ttl`、`propagation_delay`、`propagation_timeout`、`dns_challenge_override_domain`）。

網站的每個位址都有憑證：`tls internal` 為每個名稱簽發一張葉憑證，`tls <cert> <key>` 這一對則為網站的每個名稱回應。`*.example.com` 網站會申請一張萬用字元憑證，它恰好涵蓋一層標籤。

`http3 off` 讓這個網站退出 HTTP/3：它的 QUIC 交握會被拒絕，它的回應也不會在 `Alt-Svc` 中宣告 HTTP/3，而同一連接埠上的其他網站保持不變。它不會建立或移除 QUIC 監聽器；由全域 `servers { protocols … }` 清單決定（[TLS：可以調整什麼](/zh-TW/guides/tls-tuning/#-提供哪些協定)）。

`client_auth` 和憑證一樣，依用戶端送出的名稱選擇最具體的網站：沒有 `client_auth` 的確切網站不會要求用戶端憑證，即使同一連接埠上的萬用字元網站會要求。用途擴充欄位排除用戶端驗證的用戶端憑證會被拒絕。

`client_auth` 也接受 `verifier leaf file <paths...>`、`verifier leaf folder <directory>` 或含葉憑證載入器的區塊，在鏈驗證後固定允許的葉憑證。資料夾遞迴掃描 `.pem`，重載時重新掃描；其他 verifier 模組被拒絕。

拒絕條件：

- `dns` 只接受 `cloudflare`。其他供應商都會被拒絕：``DNS provider `route53` is not implemented; this build ships `cloudflare` only``。
- `protocols`、`ciphers`、`curves`、`alpn`、`on_demand`、`key_type`、`issuer`，以及上面沒有列出的其他 Caddy 選項，都會被指名拒絕。
- `tls internal` 不能與 `auto`、ACME 電子郵件或憑證檔一起使用。
- 沒有名稱的網站或 `_` 網站上的憑證檔會被拒絕。

**0.2.0 變更**：內部授權單位的檔案移到 `<store>/pki/authorities/local/`，與 Caddy 的配置相同。舊的 `<store>/internal/` 目錄不會被搬移：伺服器會建立新的授權單位，用戶端必須重新信任它的根憑證。

```caddyfile
example.com {
    tls {
        cert ./certs/example.com.pem
        key ./certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## try_files

```text
Syntax:   try_files <candidates...> {
              policy first_exist|first_exist_fallback|smallest_size|largest_size|most_recently_modified
          }
Default:  no rewrite; policy first_exist
Context:  site block, handle, route
```

選出檔案候選並重寫請求。每個位置參數都是候選，包括第一個路徑；此指令不接受匹配器 token。候選依設定的根目錄解析，支援佔位符與 glob，保留非 UTF-8 檔名的原始位元組。`=404` 是錯誤後備。未知政策與不安全路徑會被拒絕。

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

## uri

```text
Syntax:   uri [<matcher>] strip_prefix <prefix>
          uri [<matcher>] strip_suffix <suffix>
          uri [<matcher>] path_regexp <pattern> <replacement>
Default:  unchanged URI
Context:  site block, handle, route
```

修改請求路徑。移除前綴與後綴忽略 ASCII 大小寫，與路徑路由及 `handle_path` 相同。運算前先展開運算元佔位符；正規表示式取代以 `$1` 引用擷取群組。`${1}` 會被視為佔位符 `{1}`，無法保留擷取值。未知操作、錯誤參數數量、區塊與無效正規表示式會被拒絕。

```caddyfile
http://:8080 {
    uri path_regexp ^/old/(.*)$ /new/$1
    reverse_proxy 127.0.0.1:3000
}
```

## Global options

全域選項寫在檔案最上方的未命名區塊中。Caddy 巢狀放在 `servers { … }` 下的選項，在那裡也可以使用。

| 選項 | 語法 | 說明 |
| --- | --- | --- |
| `acme_dns` | `acme_dns cloudflare <token>` | 全域 Cloudflare DNS-01 憑證；其他 provider 被拒絕。 |
| `client_ip_headers` | `client_ip_headers <field> ...` | 依序查詢的用戶端身分來源，也可放在 `servers`；只有受信任對端可提供。 |
| `default_sni` | `default_sni <name>` | 沒有 SNI 時選用的憑證名稱，包含 HTTP/3；明確但未知的名稱仍被拒絕。 |
| `ocsp_stapling` | `ocsp_stapling off` | 本建置不附 OCSP 回應，因此接受 off；裸指令與 on 被拒絕。 |
| `renewal_window_ratio` | `renewal_window_ratio <ratio>` | 憑證生命週期中的續期比例，可由網站的 `tls` 覆寫。 |
| `admin` | `admin [<address> [<token>]] [{ origins …; enforce_origin }] \| off` | 啟用 Admin API；預設位址為 `127.0.0.1:2019`。有權杖時，請求必須送出 `Authorization: Bearer <token>`；沒有權杖時，只接受迴路用戶端。沒有這個選項就沒有 Admin API（[Admin API](/zh-TW/reference/admin-api/)）。 |
| `auto_https` | `auto_https on \| off \| disable_redirects \| ignore_loaded_certs` | 控制自動 HTTPS 與 80 連接埠的重新導向。`disable_redirects` 不會綁定自動的 HTTP 連接埠。`disable_certs` 會被指名拒絕。 |
| `default_bind` | `default_bind <host>` | 為沒有寫 `bind`、且 `listen` 沒有指定位址的每個網站提供 `bind` 主機。只能寫一個位址。 |
| `dns_refresh` | `dns_refresh <duration> \| off` | 重新解析主機名稱上游的間隔。預設為 `30s`。`off` 會保留啟動時解析到的位址。單獨的數字會被拒絕。 |
| `email` | `email <address>` | ACME 帳號的電子郵件。 |
| `grace_period` | `grace_period <duration>` | 平順停止時讓進行中的請求完成的時間。預設為 `30s`。最後一個請求結束後，程序就會立即結束。 |
| `http_port`、`https_port` | `http_port <port>` | 只寫配置方式的位址（`http://example.com`、`https://example.com`）與自動 HTTPS 所使用的連接埠。預設為 80 與 443。 |
| `log` | `log [<name>] { … }` | 未命名的區塊設定程序日誌；具名區塊宣告一個存取日誌通道（[`log`](#log)）。 |
| `metrics` | `metrics [{ per_host; observe_catchall_hosts }]` | 開啟指標收集。沒有它就不收集任何指標，抓取端點會回應空的內容。`per_host` 為設定中提供服務的主機加上 `host` 標籤。 |
| `order` | `order <directive> first\|last\|before <d>\|after <d>` | 調整某個指令在指令順序中的位置。 |
| `servers` | `servers [<address>] { … }` | 監聽器選項：`protocols`、`trusted_proxies static …`、`client_ip_headers`、`listener_wrappers { proxy_protocol }` 與 `metrics`。指定位址的區塊只套用到那一個監聽器，且只能設定這些選項。 |
| `storage` | `storage file_system <path>` | TLS 儲存區的目錄。優先於 `PINGCLAIR_TLS_STORE`。其他儲存模組會被拒絕。 |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | 可以在轉送標頭中陳述用戶端位址的對端。在 `servers { … }` 內請使用 Caddy 的寫法 `trusted_proxies static <cidr \| private_ranges> ...`。每個範圍只能寫一行。 |

在 `servers` 內，`client_ip_headers <field> ...` 依序列出可以指出用戶端的標頭。沒有它時，用戶端取自 `X-Forwarded-For` 與 `Forwarded`，兩者都沒送時才取 `X-Real-IP`。

**0.2.0 變更**：

- 只有 `client_ip_headers` 列出 `CF-Connecting-IP` 時，它才會指出用戶端。
- 只有設定 `metrics` 才會收集指標。
- `servers` 內的 `trusted_proxies` 必須寫出 `static` 模組名稱，同一範圍內的第二行 `trusted_proxies` 會被拒絕。
- 有多個位址的 `bind` 與 `default_bind` 會被拒絕。

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
    servers {
        trusted_proxies static 173.245.48.0/20
        client_ip_headers CF-Connecting-IP
    }
}
```

📚 上述 0.2.0 變動的依據與完整升級清單請見[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)。

⚠️ 變更全域 `metrics` 後需要重啟服務。透過 `/load` 套用此變更會收到 `409 restart_required`。詳見：[runtime_listeners.rs](https://github.com/dorianverlaine/pingclair/blob/main/pingclair/src/runtime_listeners.rs)。
