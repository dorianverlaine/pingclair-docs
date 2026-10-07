---
title: Pingclairfile
h1_emoji: '📖'
description: Pingclairfile 的詞法、網站位址、匹配器、佔位符、路由順序、片段與驗證工具。
---

Pingclairfile 使用 Caddyfile 語言，由可省略的全域選項區塊與網站區塊組成。只使用支援語法的 Caddyfile 可直接載入。[指令參考](/zh-TW/reference/directives/)說明各指令的作用。

📌 本頁描述 **v0.2.0**。

## 🔤 詞法規則

| 規則 | 說明 |
| --- | --- |
| 註解 | 從 `#` 到行尾。 |
| 引號 | 有空白的值以 `"` 括起，解析前移除引號。 |
| 區塊 | 開啟區塊的 `{` 必須結束該行；`route { respond "hi"` 會被拒絕。 |
| 時間長度 | `30s`、`5m`、`1h` 必須有單位。 |
| 大小 | `kb`、`mb`、`gb`、`tb` 使用 1000 的冪；`kib`、`mib`、`gib`、`tib` 使用 1024 的冪。`10MB` 是 10,000,000 位元組。 |
| 大小寫 | 指令與選項名稱小寫。 |
| 佔位符 | `{host}`、`{path}`、`{args[0]}`、`{block}` 等在指令支援的位置展開。 |

## 🌐 位址

網站位址決定連接埠及是否使用 HTTPS。

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # Plaintext HTTP on 8080, for any host.
http://example.com {   # Plaintext HTTP on http_port.
http://[::1]:8080 {    # Plaintext HTTP for the host [::1].
*.example.com {        # One label, such as a.example.com.
```

帶連接埠但沒有 scheme 的具名網站仍是 HTTPS；明文請加 `http://`。只有 scheme 而沒有連接埠的位址使用全域 `http_port` 或 `https_port`。方括號 IPv6 會命名網站，不再成為任意 Host 的後備；錯誤括號或 IPv6 會被拒絕。`http://0.0.0.0:8080` 是該連接埠的全域匹配。主機名稱比較忽略大小寫與尾端的點。

### 🔌 一個連接埠共用一個監聽器

同一連接埠的網站共用 socket，以 Host 區分。明確 IP 位址與全介面網站合併後，前者也能從其他介面以相符 Host 存取；需要隔離時請用獨立連接埠。載入時會記錄合併。`0.0.0.0` 與 `[::]` 合併後使用 IPv6。

若同一連接埠的 socket 政策不一致，設定會被拒絕：例如 `bind`／`default_bind` 限制的網站與全介面網站、明文與 TLS，或只有其中一個要求 PROXY protocol。

## 🧭 匹配器

匹配器可直接使用 `/api/*`，或先宣告 `@name` 再引用。

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"
    handle /assets/* {
        file_server ./assets
    }
}
```

- ASCII 大小寫不影響路徑比較；需要區分時使用 `path_regexp`。
- 百分比編碼解碼一次。`/secret%21` 匹配 `path /secret!`；空白請以 `"/a b"` 撰寫匹配路徑。
- 開頭的 `*` 匹配任意深度的後綴，兩端 `*` 匹配子字串，中間的 `*` 不跨越路徑片段。`?`、`[…]` 與反斜線是字面字元。
- 大括號是字面值；擷取群組請用 `path_regexp`。
- `client_ip` 匹配套用受信任代理政策後的用戶端；`remote_ip` 匹配連線對端。無效 IP 範圍在載入時被拒絕。
- `handle`、`handle_path` 與 `route` 在區塊前最多接受一個 `*`、以 `/` 開頭的路徑或 `@name`。`*.php` 等裸字串會被拒絕。

## 🏷️ 位址佔位符

| 佔位符 | 值 |
| --- | --- |
| `{client_ip}`、`{http.request.client_ip}` | 受信任代理政策套用後的用戶端。 |
| `{remote_host}`、`{http.request.remote.host}` | 連線對端位址。 |
| `{remote_port}`、`{http.request.remote.port}` | 連線對端連接埠。 |
| `{remote}`、`{http.request.remote}` | 對端的 `host:port`。 |

`{remote_ip}` 不是支援的佔位符，會被拒絕。要轉送用戶端位址，請寫 `header_up X-Real-IP {client_ip}`。

## 🧭 哪一條路由回應

依指令順序選第一條匹配路由：`redir`、`handle` 與 `route` 在 `respond` 之前；`respond` 在 `reverse_proxy`、`php_fastcgi` 與 `file_server` 之前。以下 `/assets/a.txt` 會得到 `hello`：

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

同一指令的單一路徑先比較移除尾端 `*` 後的長度，較長者優先；`/foo` 排在 `/foo*` 之前，其餘保留檔案順序。多路徑或無路徑匹配器排在單一路徑之後。等長不同路徑在 Caddy 依字母排序，此處保留書寫順序。

帶匹配器的中介指令會保護或修飾相符的回應路由。需要較窄路由優先時，使用互斥 `handle`、全域 `order`，或保留書寫順序的 `route`。

## 🧩 片段與匯入

以 `(name)` 宣告片段，透過 `import name` 引入：

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`{args[0]}` 是第一個參數，`{block}` 插入呼叫端區塊，沒有提供時展開為空。具名子區塊使用 `{blocks.<name>}`。

## 🧰 命令列工具

- `pingclair validate` 編譯、讀取 TLS 檔案並檢查金鑰配對。
- `pingclair adapt --pretty` 經相同驗證後印出 JSON。
- `pingclair fmt` 使用每層一個 tab；未格式化的輸入以狀態碼 1 結束。

[命令列](/zh-TW/reference/command-line/)列出所有旗標。

## 🚫 不屬於這個語言的部分

尚未實作的名稱在載入時被指名拒絕。[專案狀態](/zh-TW/project/status/)列出支援範圍與差異；[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)提供 0.2.0 變更的依據。
